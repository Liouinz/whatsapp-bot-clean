// Gemini-Fallback — GENAU zwei Einsätze:
//  (a) unbekannter !befehl ohne Custom/FAQ-Treffer,
//  (b) kurze Fehler-Zusammenfassung für den Owner.
// Nie auf normale Nachrichten. Pro-User-Cooldown + hartes Tages-Kontingent.

import { BOT_NAME, PREFIX, config } from './config.js';
import { state, rolloverDay } from './state.js';
import { dbRun, dbRows, bufferStat, todayKey } from './db.js';
import { logError, logger, setErrorSummarizer } from './logger.js';
import TTLCache from './core/cache/ttlCache.js';

const userCooldown = new TTLCache({
  ttlMs: config.ai.userCooldownMs,
  maxSize: 2000,
  cleanupIntervalMs: 60_000,
});

let dailyCalls = 0;
let dailyDay = todayKey();
let summaryBudget = 10;
let aiEnabled = false;

const MODEL_PRIMARY = 'gemini-2.0-flash-exp';
const MODEL_FALLBACK = 'gemini-1.5-flash';

export async function initAiUsage() {
  const key = (process.env.GEMINI_API_KEY || '').trim();
  if (!key) {
    logger.info('KI deaktiviert: Kein GEMINI_API_KEY gesetzt.', 'ai');
    aiEnabled = false;
    return;
  }

  try {
    const ok = (await testModel(MODEL_PRIMARY, key)) || (await testModel(MODEL_FALLBACK, key));
    if (!ok) throw new Error('Kein Modell erreichbar');
    aiEnabled = true;
    logger.info('KI aktiviert: Gemini API erreichbar.', 'ai');
  } catch (err) {
    logger.warn(`KI-Initialisierung fehlgeschlagen: ${err.message}`, 'ai');
    aiEnabled = false;
  }

  const rows = await dbRows('SELECT calls FROM ai_usage WHERE day = ?', [todayKey()]);
  dailyCalls = rows.length ? Number(rows[0].calls) : 0;
  state.aiCallsToday = dailyCalls;
}

async function testModel(model, key) {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'ping' }] }] }),
      }
    );
    return res.ok || res.status === 400;
  } catch {
    return false;
  }
}

function quotaOk() {
  if (!aiEnabled) return false;
  const today = todayKey();
  if (today !== dailyDay) {
    dailyDay = today;
    dailyCalls = 0;
    summaryBudget = 10;
  }
  return dailyCalls < config.ai.dailyLimit;
}

function countCall() {
  dailyCalls++;
  rolloverDay();
  state.aiCallsToday = dailyCalls;
  bufferStat('ai_calls');
  dbRun(
    `INSERT INTO ai_usage (day, calls) VALUES (?, 1)
     ON CONFLICT(day) DO UPDATE SET calls = ai_usage.calls + 1`,
    [todayKey()]
  ).catch(() => {});
}

function pickModel(question) {
  const t = String(question || '').trim();
  const complex =
    t.length > 120 ||
    /\b(code|program|script|analy|debug|fehler|erklär|warum|wieso|schreib|rechne|berechne|übersetz|formel|mathe|json|xml)/i.test(t);
  return complex ? MODEL_PRIMARY : MODEL_FALLBACK;
}

async function callGemini(prompt, model = MODEL_PRIMARY, attempt = 0) {
  if (!aiEnabled) return null;
  const key = (process.env.GEMINI_API_KEY || '').trim();
  if (!key) return null;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.ai.timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 350,
          temperature: 0.55,
          topP: 0.9,
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        ],
      }),
      signal: controller.signal,
    });

    if (res.status === 429 && attempt < 2) {
      const backoff = Math.pow(2, attempt) * 1000 + Math.random() * 500;
      await sleep(backoff);
      return callGemini(prompt, model, attempt + 1);
    }

    if (!res.ok) {
      if (res.status === 404) {
        logger.warn(`Gemini Modell ${model} nicht gefunden.`, 'ai');
      } else if (res.status !== 429) {
        logError(new Error(`Gemini HTTP ${res.status}`), 'ai');
      }
      return null;
    }

    const data = await res.json();
    if (data?.promptFeedback?.blockReason) {
      logger.warn(`KI-Antwort blockiert: ${data.promptFeedback.blockReason}`, 'ai');
      return null;
    }

    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
    return text.trim() || null;
  } catch (err) {
    if (err?.name === 'AbortError') return null;
    if (attempt < 2) {
      await sleep(1000);
      return callGemini(prompt, model, attempt + 1);
    }
    logError(err, 'ai');
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function getAiQuota() {
  quotaOk();
  return { used: dailyCalls, limit: config.ai.dailyLimit };
}

export async function unknownCommandReply(userJid, commandText, knownCommands) {
  if (!aiEnabled) return null;
  if (userCooldown.has(userJid)) return { blocked: 'cooldown' };
  if (!quotaOk()) return { blocked: 'quota' };
  userCooldown.set(userJid, true);

  countCall();
  const cleanCmd = commandText.slice(0, 100).replace(/[<>]/g, '');
  const suggestions = knownCommands.slice(0, 30).join(', ');

  const prompt =
    `Du bist "${BOT_NAME}", ein freundlicher, humorvoller deutscher WhatsApp-Community-Bot. ` +
    `Ein Nutzer hat "${cleanCmd}" eingegeben. Das ist kein bekannter Befehl. ` +
    `Bekannte Befehle: ${suggestions}. ` +
    `Regeln für deine Antwort:\n` +
    `1. Maximal 2 Sätze.\n` +
    `2. Wenn der Nutzer offensichtlich einen Tippfehler gemacht hat, schlage den richtigen Befehl vor.\n` +
    `3. Wenn es eine Frage ist, beantworte sie knapp und korrekt.\n` +
    `4. Sprich den Nutzer mit "du" an.\n` +
    `5. Keine Markdown-Überschriften, keine Aufzählungspunkte, kein Fett/Kursiv mit * oder _.` +
    `6. Wenn du es nicht weißt, sage das ehrlich.`;

  const text = await callGemini(prompt);
  if (!text) return null;
  return { text: text.slice(0, config.ai.maxReplyChars) };
}

export async function askAi(userJid, question) {
  if (!aiEnabled) return null;
  if (userCooldown.has(userJid)) return { blocked: 'cooldown' };
  if (!quotaOk()) return { blocked: 'quota' };
  userCooldown.set(userJid, true);

  countCall();
  const q = String(question || '').trim().slice(0, 500).replace(/[<>]/g, '');

  const prompt =
    `Du bist "${BOT_NAME}", ein hilfsbereiter, freundlicher deutscher WhatsApp-Assistent in einer Gruppen-Community. ` +
    `Beantworte die folgende Anfrage knapp, klar und korrekt auf Deutsch (per Du, lockerer Ton). ` +
    `Keine Markdown-Überschriften, keine * oder _ zur Hervorhebung. ` +
    `Codeblöcke nur, wenn ausdrücklich Code verlangt wird. Maximal 3 Sätze, außer bei Code.\n\n` +
    `Frage: ${q}`;

  const text = await callGemini(prompt, pickModel(q));
  if (!text) return null;
  return { text: text.slice(0, config.ai.maxReplyChars) };
}

async function summarizeError(errorText, ctx) {
  if (!aiEnabled || !quotaOk() || summaryBudget <= 0) return null;
  const prompt =
    `Fasse diesen Node.js/Baileys-Fehler eines WhatsApp-Bots in 1 deutschen Satz zusammen ` +
    `(was ist passiert, was sollte man prüfen). Kein Code, keine Aufzählung:\n\n${errorText.slice(0, 1500)}`;
  const result = await callGemini(prompt, MODEL_FALLBACK);
  if (result) {
    summaryBudget--;
    countCall();
  }
  return result;
}

setErrorSummarizer(summarizeError);
