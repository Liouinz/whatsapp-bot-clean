// Gemini-Fallback — GENAU zwei Einsätze:
//  (a) unbekannter !befehl ohne Custom/FAQ-Treffer,
//  (b) kurze Fehler-Zusammenfassung für den Owner.
// Nie auf normale Nachrichten. Pro-User-Cooldown + hartes Tages-Kontingent.

import { BOT_NAME, PREFIX, config } from './config.js';
import { state, rolloverDay } from './state.js';
import { dbRun, dbRows, bufferStat, todayKey } from './db.js';
import { logError, setErrorSummarizer } from './logger.js';

const userCooldown = new Map();
let dailyCalls = 0;
let dailyDay = todayKey();
let summaryBudget = 10;

export async function initAiUsage() {
  const rows = await dbRows('SELECT calls FROM ai_usage WHERE day = ?', [todayKey()]);
  dailyCalls = rows.length ? Number(rows[0].calls) : 0;
  state.aiCallsToday = dailyCalls;
}

function quotaOk() {
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
    t.length > 80 ||
    /\b(code|program|script|analy|debug|fehler|erklär|warum|wieso|schreib|rechne|berechne|übersetz)/i.test(t);
  return complex ? config.ai.model : config.ai.modelLite;
}

async function callGemini(prompt, model = config.ai.model) {
  const key = (process.env.GEMINI_API_KEY || '').trim();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.ai.timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 400, temperature: 0.6 },
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      if (res.status !== 429) {
        logError(new Error(`Gemini HTTP ${res.status}`), 'ai');
      }
      return null;
    }
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
    return text.trim() || null;
  } catch (err) {
    if (err?.name !== 'AbortError') logError(err, 'ai');
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function getAiQuota() {
  quotaOk();
  return { used: dailyCalls, limit: config.ai.dailyLimit };
}

export async function unknownCommandReply(userJid, commandText, knownCommands) {
  const now = Date.now();
  const last = userCooldown.get(userJid) || 0;
  if (now - last < config.ai.userCooldownMs) return { blocked: 'cooldown' };
  if (!quotaOk()) return { blocked: 'quota' };
  userCooldown.set(userJid, now);
  if (userCooldown.size > 2000) userCooldown.delete(userCooldown.keys().next().value);

  countCall();
  const prompt =
    `Du bist "${BOT_NAME}", ein freundlicher deutscher WhatsApp-Community-Bot. ` +
    `Ein Nutzer hat den unbekannten Befehl "${commandText.slice(0, 120)}" eingegeben. ` +
    `Bekannte Befehle (Präfix ${PREFIX}): ${knownCommands.slice(0, 40).join(', ')}. ` +
    `Antworte kurz (max. 3 Sätze, Deutsch, per Du): Wenn ein bekannter Befehl gemeint sein könnte, schlag ihn vor. ` +
    `Sonst beantworte die Frage hinter dem Befehl knapp und hilfreich. Keine Markdown-Überschriften.`;
  const text = await callGemini(prompt);
  if (!text) return null;
  return { text: text.slice(0, config.ai.maxReplyChars) };
}

export async function askAi(userJid, question) {
  const now = Date.now();
  const last = userCooldown.get(userJid) || 0;
  if (now - last < config.ai.userCooldownMs) return { blocked: 'cooldown' };
  if (!quotaOk()) return { blocked: 'quota' };
  userCooldown.set(userJid, now);
  if (userCooldown.size > 2000) userCooldown.delete(userCooldown.keys().next().value);

  countCall();
  const q = String(question || '').trim().slice(0, 500);
  const prompt =
    `Du bist "${BOT_NAME}", ein hilfsbereiter, freundlicher deutscher WhatsApp-Assistent. ` +
    `Beantworte die folgende Frage oder Aufgabe knapp, klar und korrekt auf Deutsch (per Du). ` +
    `Keine Markdown-Überschriften; Codeblöcke nur, wenn ausdrücklich Code verlangt wird.\n\nFrage: ${q}`;
  const text = await callGemini(prompt, pickModel(q));
  if (!text) return null;
  return { text: text.slice(0, config.ai.maxReplyChars) };
}

async function summarizeError(errorText) {
  if (!quotaOk() || summaryBudget <= 0) return null;
  summaryBudget--;
  countCall();
  const prompt =
    `Fasse diesen Node.js/Baileys-Fehler eines WhatsApp-Bots in 1–2 deutschen Sätzen zusammen ` +
    `(was ist passiert, was sollte man prüfen). Keine Codeblöcke:\n\n${errorText.slice(0, 1200)}`;
  return callGemini(prompt);
}

setErrorSummarizer(summarizeError);
