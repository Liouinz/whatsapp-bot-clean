// Befehls-Router — verarbeitet messages.upsert.
// Auflösung: 1) fester Befehl → 2) Custom/FAQ → 3) KI-Fallback.
// Normale Nachrichten lösen NIE die KI aus (nur Moderation/XP/AFK/Spiele still).

import { PREFIX, config } from './config.js';
import { state, rolloverDay, bumpActivity } from './state.js';
import { dbRows, dbRun, bufferXp, bufferStat, bufferGroupMessage, xpToLevel } from './db.js';
import { replyTo, sendText, wasSentByBot } from './queue.js';
import { logError } from './logger.js';
import {
  senderCandidates, senderJid, isOwner, isBotOwner, isUserAdmin, getGroupMeta, resolveLid, getRoleLevel,
} from './permissions.js';
import { xpEnabled, gamesEnabled, economyEnabled, maintenanceOn } from './global.js';
import { checkAutoMod, getGroupSettings } from './moderation.js';
import { getAfk, clearAfk, fmtSince } from './commands/afk.js';
import { resolveCustom, listCustom } from './commands/custom.js';
import { checkGameAnswer } from './commands/games.js';
import { checkMillionaireAnswer } from './commands/millionaer.js';
import { unknownCommandReply, askAi } from './ai.js';

import { adminCommands } from './commands/admin.js';
import { communityCommands } from './commands/community.js';
import { levelCommands } from './commands/levels.js';
import { afkCommands } from './commands/afk.js';
import { customCommands } from './commands/custom.js';
import { scheduleCommands } from './commands/schedule.js';
import { toolCommands } from './commands/tools.js';
import { gameCommands } from './commands/games.js';
import { millionaireCommands } from './commands/millionaer.js';
import { economyCommands } from './commands/economy.js';
import { itemCommands } from './commands/items.js';
import { questCommands } from './commands/quests.js';
import { progressionCommands } from './commands/progression.js';
import { eventCommands } from './commands/events.js';
import { managementCommands, isActivationCommand, activateGroup } from './commands/management.js';
import { getBoostMult } from './boosts.js';
import { getEventXpMult } from './events.js';
import { funCommands } from './commands/fun.js';
import { pollCommands } from './commands/polls.js';
import { birthdayCommands } from './commands/birthdays.js';
import { profileCommands } from './commands/profile.js';
import { wordleCommands } from './commands/wordle.js';
import { activeTitle } from './commands/economy.js';

// ── Registry + Live-Toggles ────────────────────────────────────────

export const registry = [
  ...communityCommands,
  ...profileCommands,
  ...levelCommands,
  ...afkCommands,
  ...birthdayCommands,
  ...pollCommands,
  ...customCommands,
  ...economyCommands,
  ...scheduleCommands,
  ...toolCommands,
  ...gameCommands,
  ...millionaireCommands,
  ...wordleCommands,
  ...funCommands,
  ...itemCommands,
  ...questCommands,
  ...progressionCommands,
  ...eventCommands,
  ...managementCommands,
  ...adminCommands,
];

const byName = new Map();
for (const cmd of registry) {
  byName.set(cmd.name, cmd);
  for (const alias of cmd.aliases || []) byName.set(alias, cmd);
}

const toggles = new Map(); // name → enabled (live schaltbar übers Panel)

export async function loadToggles() {
  toggles.clear();
  for (const r of await dbRows('SELECT name, enabled FROM command_toggles', [])) {
    toggles.set(r.name, Number(r.enabled) === 1);
  }
}

export function isCommandEnabled(name) {
  return toggles.has(name) ? toggles.get(name) : true;
}

export async function setCommandEnabled(name, enabled) {
  toggles.set(name, !!enabled);
  await dbRun(
    `INSERT INTO command_toggles (name, enabled) VALUES (?, ?)
     ON CONFLICT(name) DO UPDATE SET enabled = excluded.enabled`,
    [name, enabled ? 1 : 0]
  ).catch(() => {});
}

// ── Dedupe (LRU) + Sender-Rate-Limit ───────────────────────────────

const seenIds = new Set();
function isDuplicate(id) {
  if (!id) return false;
  if (seenIds.has(id)) return true;
  seenIds.add(id);
  if (seenIds.size > config.messages.dedupeCacheSize) {
    seenIds.delete(seenIds.values().next().value);
  }
  return false;
}

const senderRate = new Map(); // sender → [Zeitstempel der Befehle]
function commandRateOk(sender) {
  const now = Date.now();
  const arr = (senderRate.get(sender) || []).filter((t) => now - t < config.messages.senderRateWindowMs);
  arr.push(now);
  senderRate.set(sender, arr);
  if (senderRate.size > 1000) senderRate.delete(senderRate.keys().next().value);
  return arr.length <= config.messages.senderRateLimit;
}

// ── Text-Extraktion ────────────────────────────────────────────────

function unwrap(message) {
  // Wrapper können verschachtelt sein (z. B. ephemeral um viewOnce) — bis zur
  // eigentlichen Nutzlast durchsteigen statt nur eine Ebene.
  let m = message;
  for (let i = 0; i < 4 && m; i++) {
    const inner =
      m.ephemeralMessage?.message ||
      m.viewOnceMessage?.message ||
      m.viewOnceMessageV2?.message ||
      m.viewOnceMessageV2Extension?.message ||
      m.documentWithCaptionMessage?.message ||
      m.editedMessage?.message;
    if (!inner) break;
    m = inner;
  }
  return m || null;
}

export function extractText(msg) {
  const m = unwrap(msg.message);
  if (!m) return '';
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    // Interaktive Antworten (Buttons/Listen) zählen auch als Text — sonst
    // "sieht" der Bot Antippen von Buttons überhaupt nicht.
    m.buttonsResponseMessage?.selectedDisplayText ||
    m.buttonsResponseMessage?.selectedButtonId ||
    m.templateButtonReplyMessage?.selectedDisplayText ||
    m.templateButtonReplyMessage?.selectedId ||
    m.listResponseMessage?.singleSelectReply?.selectedRowId ||
    m.listResponseMessage?.title ||
    ''
  ).trim();
}

function contextInfo(msg) {
  const m = unwrap(msg.message);
  if (!m) return null;
  for (const key of Object.keys(m)) {
    if (m[key] && typeof m[key] === 'object' && m[key].contextInfo) return m[key].contextInfo;
  }
  return null;
}

// ── XP (mit Cooldown, Level-Up-Erkennung) ──────────────────────────

const xpCooldown = new Map(); // group|user → letzter XP-Zeitpunkt
const xpTotals = new Map(); // group|user → bekannter XP-Stand (RAM)

/** Nach einem Komplett-Reset der DB: XP-RAM-Stände verwerfen. */
export function resetXpCache() {
  xpTotals.clear();
  xpCooldown.clear();
}

async function grantXp(chatJid, userJid, name, settings) {
  if (!xpEnabled()) return; // XP-System global deaktiviert
  const user = resolveLid(userJid);
  const key = `${chatJid}|${user}`;
  const now = Date.now();
  if (now - (xpCooldown.get(key) || 0) < config.xp.cooldownMs) return;
  xpCooldown.set(key, now);
  if (xpCooldown.size > 3000) xpCooldown.delete(xpCooldown.keys().next().value);

  if (!xpTotals.has(key)) {
    const rows = await dbRows('SELECT xp FROM xp WHERE group_jid = ? AND user_jid = ?', [chatJid, user]);
    xpTotals.set(key, rows.length ? Number(rows[0].xp) : 0);
    if (xpTotals.size > 5000) xpTotals.delete(xpTotals.keys().next().value); // sonst Speicherleck
  }
  const baseAmount =
    config.xp.perMessageMin +
    Math.floor(Math.random() * (config.xp.perMessageMax - config.xp.perMessageMin + 1));
  // Aktiven XP-Boost (Item) + globalen Event-Multiplikator anwenden.
  // getBoostMult cached im RAM, getEventXpMult ist ein reiner RAM-Wert.
  const amount = Math.round(baseAmount * (await getBoostMult(user, 'xp').catch(() => 1)) * getEventXpMult());
  const before = xpTotals.get(key);
  const after = before + amount;
  xpTotals.set(key, after);
  bufferXp(chatJid, user, amount, name);

  const oldLevel = xpToLevel(before);
  const newLevel = xpToLevel(after);
  if (newLevel > oldLevel && config.xp.levelUpAnnounce && Number(settings.levelup_announce)) {
    await dbRun(
      `INSERT INTO levels (group_jid, user_jid, level) VALUES (?, ?, ?)
       ON CONFLICT(group_jid, user_jid) DO UPDATE SET level = excluded.level`,
      [chatJid, user, newLevel]
    ).catch(() => {});
    const title = await activeTitle(user).catch(() => null);
    const who = title ? `${name || 'Jemand'} ${title}` : name || 'Jemand';
    await sendText(chatJid, `🎉 *Level-Up!* ${who} ist jetzt *Level ${newLevel}* ⭐`);
  }
}

// ── Slowmode (Mindestabstand zwischen Nachrichten pro Person) ──────

const slowmodeLast = new Map(); // group|user → letzter Nachrichten-Zeitpunkt
const slowmodeHinted = new Map(); // group|user → letzter Hinweis (nicht bei jeder Löschung nerven)

async function checkSlowmode(msg, chatJid, senderIds, settings, senderName) {
  const secs = Number(settings.slowmode_secs || 0);
  if (!secs) return false;
  if (await isUserAdmin(chatJid, senderIds)) return false;
  const key = `${chatJid}|${resolveLid(senderIds[0])}`;
  const now = Date.now();
  const last = slowmodeLast.get(key) || 0;
  if (now - last >= secs * 1000) {
    slowmodeLast.set(key, now);
    if (slowmodeLast.size > 3000) slowmodeLast.delete(slowmodeLast.keys().next().value);
    return false;
  }
  // Zu schnell → Nachricht löschen (wenn möglich), sparsam hinweisen
  try {
    await state.sock.sendMessage(chatJid, { delete: msg.key });
  } catch { /* ohne Admin-Rechte bleibt sie eben stehen */ }
  if (now - (slowmodeHinted.get(key) || 0) > 60_000) {
    slowmodeHinted.set(key, now);
    if (slowmodeHinted.size > 3000) slowmodeHinted.delete(slowmodeHinted.keys().next().value);
    const wait = Math.ceil((secs * 1000 - (now - last)) / 1000);
    await sendText(chatJid, `🐢 *${senderName}*, hier ist Slowmode aktiv — bitte noch ${wait} s warten.`);
  }
  return true;
}

// ── AFK-Erwähnungen (mit Anti-Spam-Cooldown) ───────────────────────

const afkNoticeCooldown = new Map(); // chat|afkUser → Zeitpunkt

async function notifyAfkMentions(msg, chatJid) {
  const ci = contextInfo(msg);
  const mentioned = [...(ci?.mentionedJid || [])];
  if (ci?.participant) mentioned.push(ci.participant); // zitierte Person
  if (!mentioned.length) return;

  const notified = new Set();
  for (const jid of mentioned.slice(0, 5)) {
    const afk = getAfk([jid]);
    if (!afk || notified.has(afk.user)) continue;
    notified.add(afk.user);
    const key = `${chatJid}|${afk.user}`;
    if (Date.now() - (afkNoticeCooldown.get(key) || 0) < 2 * 60_000) continue;
    afkNoticeCooldown.set(key, Date.now());
    if (afkNoticeCooldown.size > 3000) afkNoticeCooldown.delete(afkNoticeCooldown.keys().next().value);
    await replyTo(msg, `💤 Diese Person ist gerade *AFK* (seit ${fmtSince(afk.since)}): _${afk.reason}_`);
  }
}

// ── Ziel-Nutzer-Ermittlung für Admin-Befehle ───────────────────────

function findTarget(msg, args) {
  const ci = contextInfo(msg);
  const mentioned = ci?.mentionedJid?.[0];
  if (mentioned) return resolveLid(mentioned);
  if (ci?.participant) return resolveLid(ci.participant); // Antwort auf Nachricht
  const num = (args || []).find((a) => /^\+?\d{6,17}$/.test(a.replace(/[@\s-]/g, '')));
  if (num) return `${num.replace(/\D/g, '')}@s.whatsapp.net`;
  // Nummern mit Leerzeichen/Klammern/Punkten ("+49 171 234 5678") landen in
  // mehreren args — deshalb zusätzlich über den gesamten Text suchen.
  const joined = (args || []).join(' ');
  const m = /(?:\+|00)?[\d(][\d\s().\/-]{4,24}\d/.exec(joined);
  if (m) {
    const digits = m[0].replace(/\D/g, '');
    if (digits.length >= 6 && digits.length <= 17) return `${digits}@s.whatsapp.net`;
  }
  return null;
}

// ── Tippfehler-Erkennung für Befehle (spart KI-Aufrufe) ────────────

/** Levenshtein-Distanz mit frühem Abbruch oberhalb von `max`. */
function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

// Vorschlags-Kandidaten: sichtbare Befehle + Aliasse (hidden bleibt hidden)
const SUGGEST_BASE = registry
  .filter((c) => !c.hidden)
  .flatMap((c) => [c.name, ...(c.aliases || [])]);

/** Ähnlichsten bekannten Befehl finden (oder null). */
export function suggestCommand(name) {
  if (name.length < 3) return null;
  const { commands: customList, faqs } = listCustom();
  const max = name.length >= 6 ? 2 : 1;
  let best = null;
  let bestDist = max + 1;
  for (const cand of [...SUGGEST_BASE, ...customList, ...faqs]) {
    const d = editDistance(name, cand, max);
    if (d < bestDist) {
      bestDist = d;
      best = cand;
      if (d === 1) break; // besser wird es kaum noch
    }
  }
  return best;
}

// ── Haupteinstieg ──────────────────────────────────────────────────

/** Für messages.upsert registrieren. Ein Fehler hier darf NIE den Bot crashen. */
export async function handleUpsert({ messages, type }) {
  if (type !== 'notify') return; // 'append' & Co. ignorieren (Dedupe-Regel)
  for (const msg of messages || []) {
    try {
      await handleMessage(msg);
    } catch (err) {
      logError(err, 'router');
    }
  }
}

async function handleMessage(msg) {
  if (!msg?.message) return;

  // Der Bot läuft auf der eigenen Nummer des Owners — dessen Nachrichten kommen
  // deshalb als fromMe an. BEFEHLE des Owners werden verarbeitet; alles andere
  // (normale eigene Nachrichten und vor allem die Echos der Bot-Antworten
  // selbst) wird verworfen, sonst antwortet der Bot auf sich selbst.
  const fromSelf = !!msg.key?.fromMe;
  if (fromSelf && (wasSentByBot(msg.key?.id) || !extractText(msg).startsWith(PREFIX))) return;

  if (isDuplicate(msg.key?.id)) return;

  const chatJid = msg.key.remoteJid;
  if (!chatJid || chatJid === 'status@broadcast') return;
  const isGroup = chatJid.endsWith('@g.us');

  // Bearbeitete Nachrichten: den NEUEN Inhalt gegen die Auto-Mod prüfen —
  // sonst ließe sich der Link-/Wortfilter umgehen, indem man erst harmlos
  // postet und den Verstoß nachträglich reineditiert. Der Key wird auf die
  // Original-Nachricht umgebogen, damit ein Löschen die richtige trifft.
  let isEdit = false;
  const protoMsg = msg.message.protocolMessage || unwrap(msg.message)?.protocolMessage;
  if (protoMsg?.editedMessage) {
    isEdit = true;
    msg = {
      ...msg,
      key: { ...msg.key, id: protoMsg.key?.id || msg.key.id },
      message: protoMsg.editedMessage,
    };
  }

  // Bei fromMe ist der Absender IMMER die eigene Nummer — remoteJid wäre in
  // DMs der Chat-Partner und damit die falsche Person.
  const senderIds = fromSelf ? [state.botJidPn, state.botJidLid].filter(Boolean) : senderCandidates(msg);
  const sender = fromSelf ? state.botJidPn : senderJid(msg);
  if (!sender) return;
  const senderName = msg.pushName || `+${String(resolveLid(sender)).split('@')[0]}`;
  const text = extractText(msg);

  rolloverDay();
  if (!isEdit && !fromSelf) {
    bumpActivity();
    bufferStat('messages'); // Edits sind keine neuen Nachrichten — nicht doppelt zählen
    if (isGroup) bufferGroupMessage(chatJid);
  }

  // DMs: nur Owner ODER die Nummer, auf der der Bot selbst läuft — die Person
  // am Bot-Handy ist nicht zwingend der Owner (OWNER_NUMBERS kann jemand
  // anderes sein), soll ihren Bot aber trotzdem per Befehl bedienen können.
  if (!isGroup && !fromSelf && !isOwner(senderIds)) return;

  const settings = isGroup ? await getGroupSettings(chatJid) : { enabled: 1, levelup_announce: 0 };
  // Eingeschränkter Modus: In noch nicht freigeschalteten Gruppen bleibt der Bot
  // STILL. Einzige Ausnahme: ein OWNER darf die Gruppe per Aktivierungs-Befehl
  // (!setup/!enable/„Bot aktivieren") freischalten — sonst kein Wort (verhindert
  // ungewolltes Arbeiten in fremden Gruppen).
  if (isGroup && !Number(settings.enabled)) {
    if (isOwner(senderIds) && isActivationCommand(text)) {
      await activateGroup(chatJid);
      await replyTo(msg, '✅ Bot in dieser Gruppe *freigeschaltet*. Alle Funktionen stehen jetzt bereit — Übersicht: `!hilfe`');
    }
    return;
  }

  // Slowmode greift vor allem anderen (Nachricht wird ggf. gelöscht)
  if (isGroup && !isEdit && !fromSelf && (await checkSlowmode(msg, chatJid, senderIds, settings, senderName))) return;

  // 1) AFK: eigener Beitrag hebt AFK auf (Edits zählen nicht als "wieder da")
  const wasAfk = isEdit ? null : await clearAfk(senderIds);
  if (wasAfk && isGroup) {
    await replyTo(msg, `👋 Willkommen zurück, *${senderName}*! Dein AFK-Status (seit ${fmtSince(wasAfk.since)}) ist aufgehoben.`);
  }

  // 2) Auto-Moderation (nur Gruppen; nie gegen den Owner selbst)
  if (isGroup && !fromSelf) {
    const mod = await checkAutoMod(msg, chatJid, senderIds, text);
    if (mod) {
      if (mod.kind === 'muted') return; // Nachricht gelöscht, still bleiben
      let info = `⚠️ *${senderName}*, das war nicht ok: ${modReason(mod.kind)}.`;
      if (mod.warned) {
        info += ` (Verwarnung ${mod.warned.count}/${config.moderation.warnLimitKick})`;
        if (mod.warned.action === 'mute') info += `\n🔇 Limit erreicht → *${config.moderation.muteMinutesDefault} Min stumm*.`;
        if (mod.warned.action === 'kick') info += '\n👢 Limit erreicht → *aus der Gruppe entfernt*.';
      }
      await sendText(chatJid, info);
      return;
    }
  }

  // Edits sind damit fertig geprüft — kein XP, keine Spiele, keine Befehle
  // (sonst würde jede Bearbeitung einer alten "!befehl"-Nachricht neu auslösen).
  if (isEdit) return;

  // 3) AFK-Erwähnungen melden
  if (isGroup && !text.startsWith(PREFIX)) {
    await notifyAfkMentions(msg, chatJid);
  }

  // 4) Kein Befehl → Spiele-Antworten prüfen, XP vergeben, fertig (keine KI!)
  if (!text.startsWith(PREFIX)) {
    if (isGroup) {
      const ctxLite = makeCtx(msg, chatJid, isGroup, senderIds, sender, senderName, text, []);
      // Millionär-Antwort (A/B/C/D) zuerst — greift nur bei laufendem Spiel (RAM-Check)
      const consumed = (await checkMillionaireAnswer(ctxLite)) || (await checkGameAnswer(ctxLite));
      if (!consumed && text.length >= config.xp.minMessageLength) {
        await grantXp(chatJid, sender, senderName, settings);
      }
    }
    return;
  }

  // 5) Befehl parsen
  const parts = text.slice(PREFIX.length).trim().split(/\s+/);
  const name = (parts[0] || '').toLowerCase();
  if (!name) return;
  const args = parts.slice(1);

  // Flut still drosseln — Owner und die Bot-Nummer selbst nie
  if (!fromSelf && !isOwner(senderIds) && !commandRateOk(resolveLid(sender))) return;

  const ctx = makeCtx(msg, chatJid, isGroup, senderIds, sender, senderName, text, args);

  // Wartungsmodus: alle Befehle für Nicht-Bot-Owner sperren
  if (maintenanceOn() && !ctx.isBotOwner) {
    return ctx.reply('🔧 Der Bot ist gerade im *Wartungsmodus* — bitte gleich nochmal versuchen.');
  }

  const command = byName.get(name);

  // 5a) Fester Befehl
  if (command) {
    if (!isCommandEnabled(command.name)) {
      return ctx.reply('ℹ️ Dieser Befehl ist gerade deaktiviert.');
    }
    if (command.groupOnly && !isGroup) {
      return ctx.reply('⚠️ Dieser Befehl funktioniert nur in Gruppen.');
    }
    if (command.botOwnerOnly && !ctx.isBotOwner) {
      return ctx.reply('⛔ Dieser Befehl ist nur für den *Bot-Owner*.');
    }
    if (command.ownerOnly && !ctx.isOwner) {
      return ctx.reply('⛔ Diesen Befehl darf nur der Owner nutzen.');
    }
    if (command.adminOnly && !(await ctx.isAdmin())) {
      return ctx.reply('⛔ Dafür brauchst du Admin-Rechte in dieser Gruppe.');
    }
    // Global abschaltbare Systeme (Bot-Owner umgeht die Sperre)
    if (!ctx.isBotOwner) {
      if (command.group === 'games' && !gamesEnabled()) {
        return ctx.reply('🎮 Das Spiele-System ist gerade global deaktiviert.');
      }
      if (command.group === 'economy' && !economyEnabled()) {
        return ctx.reply('💰 Das Economy-System ist gerade global deaktiviert.');
      }
    }
    rolloverDay();
    state.commandsToday++;
    bufferStat('commands');
    try {
      await command.run(ctx);
    } catch (err) {
      logError(err, `cmd:${command.name}`);
      await ctx.reply('⚠️ Uups, da ist etwas schiefgelaufen — bitte versuch es gleich nochmal.');
    }
    return;
  }

  // 5b) Custom-Command / FAQ (VOR der KI)
  const custom = resolveCustom(name);
  if (custom) {
    state.commandsToday++;
    bufferStat('commands');
    return ctx.reply(custom);
  }

  // 5c) Direkte KI-Frage über das explizite Muster !frage! — z. B.
  // "!Erkläre Linux!". Feste Befehle (5a) und Custom (5b) haben Vorrang, hier
  // landet also nur, was KEIN Befehl ist. Das äußere !…! wird entfernt, nur
  // der Inhalt geht an die KI.
  const ask = /^!\s*(.+?)\s*!$/.exec(text);
  if (ask && ask[1].trim().length >= 2) {
    const res = await askAi(resolveLid(sender), ask[1]);
    if (res?.text) return ctx.reply(`🤖 ${res.text}`);
    if (res?.blocked === 'cooldown') return ctx.reply('ℹ️ Kurz durchatmen — gleich kannst du mich wieder etwas fragen.');
    if (res?.blocked === 'quota') return ctx.reply('ℹ️ Mein KI-Kontingent für heute ist aufgebraucht — morgen geht es weiter.');
    return ctx.reply('⚠️ Ich konnte die KI gerade nicht erreichen — bitte gleich nochmal.');
  }

  // 5d) Tippfehler? Ähnlichsten Befehl vorschlagen — schneller als die KI
  // und verbraucht kein Tages-Kontingent.
  const suggestion = suggestCommand(name);
  if (suggestion) {
    return ctx.reply(`🤔 \`${PREFIX}${name}\` kenne ich nicht — meintest du \`${PREFIX}${suggestion}\`?`);
  }

  // 5e) KI-Fallback — NUR hier
  const known = registry.filter((c) => !c.hidden).map((c) => c.name);
  const ai = await unknownCommandReply(resolveLid(sender), text, known);
  if (ai?.text) {
    return ctx.reply(`🤖 ${ai.text}\n\n_Alle echten Befehle: ${PREFIX}hilfe_`);
  }
  if (ai?.blocked === 'cooldown') {
    return ctx.reply('ℹ️ Langsam! Bitte warte einen Moment, bevor du mich wieder etwas Unbekanntes fragst.');
  }
  return ctx.reply(`ℹ️ Den Befehl \`${PREFIX}${name}\` kenne ich nicht. Alle Befehle: \`${PREFIX}hilfe\``);
}

function modReason(kind) {
  return {
    link: 'Links sind hier nicht erlaubt',
    word: 'dieses Wort ist hier nicht erlaubt',
    spam: 'bitte keine Nachrichten-Flut',
  }[kind] || 'Regelverstoß';
}

// ── Kontext-Objekt für Befehls-Handler ─────────────────────────────

function makeCtx(msg, chatJid, isGroup, senderIds, sender, senderName, text, args) {
  const owner = isOwner(senderIds);
  return {
    msg, chatJid, isGroup, senderIds, sender, senderName, text, args,
    argText: args.join(' '),
    registry,
    isOwner: owner,
    isBotOwner: isBotOwner(senderIds),
    role: () => getRoleLevel(chatJid, senderIds, isGroup), // Promise<ROLE>
    reply: (t, mentions) => replyTo(msg, t, mentions),
    mentionTag: (jid) => `@${String(resolveLid(jid)).split('@')[0]}`,
    mentions: () => contextInfo(msg)?.mentionedJid || [],
    targetUser: () => findTarget(msg, args),
    // Nur echte Mention-Tokens (@12345…) entfernen — "!warn @x Grund 2" behält die "2"
    argTextWithoutMentions: () =>
      args.filter((a) => !/^@\d{5,}$/.test(a)).join(' ').trim(),
    isAdmin: async () => (owner ? true : isGroup ? isUserAdmin(chatJid, senderIds) : false),
    groupMeta: () => (isGroup ? getGroupMeta(chatJid) : null),
  };
}
