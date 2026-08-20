import { config } from './config.js';
import { logger } from './logger.js';
import { dbRun } from './core/database/client.js';

export { PROTECTED_TABLES, assertNotAuthWrite, deleteTargetTable } from './core/database/guard.js';
export { getDb, dbRun, dbRows, dbRowsStrict, dbBatch } from './core/database/client.js';
export { DATA_TABLES, PROTECTED_TABLES_SET, initDb } from './core/database/schema.js';
export { wipeAllData } from './core/database/wipe.js';

/**
 * Tagesschluessel (YYYY-MM-DD) in der konfigurierten Zeitzone.
 *
 * Vorher stand hier `toISOString().slice(0, 10)` — also UTC, obwohl config.js
 * ausdruecklich TZ=Europe/Berlin setzt. Zwischen 00:00 und 02:00 lokaler Zeit
 * landeten Nachrichten, Befehle und KI-Aufrufe dadurch auf dem Vortag, und das
 * KI-Tageslimit sprang um 02:00 statt um Mitternacht.
 *
 * 'en-CA' ist das Gebietsschema, das YYYY-MM-DD liefert — dieselbe Sortier-
 * ordnung wie bisher, damit die `day >= ?`-Vergleiche in SQL weiter stimmen.
 */
export function dayKey(date = new Date()) {
  return date.toLocaleDateString('en-CA', { timeZone: config.timezone });
}

export function todayKey() {
  return dayKey();
}

const xpBuffer = new Map();
const statBuffer = new Map();
const groupMsgBuffer = new Map();
let flushTimer = null;

export function bufferXp(chatJid, userJid, amount, name) {
  const key = `${chatJid}:${userJid}`;
  const entry = xpBuffer.get(key) || { chatJid, userJid, amount: 0, messages: 0, name };
  entry.amount += amount;
  // Mitzaehlen, wie viele Nachrichten in diesen Puffereintrag eingeflossen sind.
  // Das Flush-SQL schrieb frueher hart `messages + 1`, unabhaengig davon, wie
  // oft bufferXp fuer denselben Nutzer aufgerufen wurde — die Nachrichten-
  // statistik und der Wochenreport zaehlten dadurch zu niedrig.
  entry.messages += 1;
  entry.name = name || entry.name;
  xpBuffer.set(key, entry);
}

export function bufferStat(field) {
  const day = todayKey();
  const key = `${day}:${field}`;
  const entry = statBuffer.get(key) || { day, field, count: 0 };
  entry.count += 1;
  statBuffer.set(key, entry);
}

export function bufferGroupMessage(groupJid) {
  const day = todayKey();
  const key = `${groupJid}:${day}`;
  const entry = groupMsgBuffer.get(key) || { groupJid, day, count: 0 };
  entry.count += 1;
  groupMsgBuffer.set(key, entry);
}

let flushInFlight = null;

/**
 * Schreibt die Puffer weg. **Single-Flight**: laeuft schon ein Flush, bekommt
 * der Aufrufer dieselbe Promise.
 *
 * Der Guard ist kein Schoenheitsfehler-Fix. Die Puffer-Eintraege werden erst
 * NACH `Promise.allSettled` geloescht — ein zweiter, ueberlappender Lauf las
 * dieselben Eintraege noch einmal und schickte `xp = xp + excluded.xp` erneut.
 * Aus 100 gepufferten XP wurden so 200. Erreichbar ueber vier Wege: das
 * setInterval unten wartet die Promise nicht ab, buildWeeklyReport() ruft
 * flushBuffers() aus dem Scheduler-Tick, der Panel-Neustart ruft es, und der
 * Shutdown ruft es, waehrend stopFlushLoop() einen laufenden Flush nicht
 * abwartet.
 */
export function flushBuffers() {
  if (flushInFlight) return flushInFlight;
  flushInFlight = flushBuffersOnce().finally(() => {
    flushInFlight = null;
  });
  return flushInFlight;
}

async function flushBuffersOnce() {
  const xpEntries = Array.from(xpBuffer.entries());
  const statEntries = Array.from(statBuffer.entries());
  const groupMsgEntries = Array.from(groupMsgBuffer.entries());

  const tasks = [];

  for (const [key, entry] of xpEntries) {
    tasks.push({
      type: 'xp',
      key,
      entry,
      // Wert-Snapshot: bufferXp mutiert den Eintrag in-place, ein spaeterer
      // Objektvergleich waere also immer wahr und wuerde waehrend des Flushes
      // eingetroffene Inkremente stillschweigend verwerfen.
      amountAtFlush: entry.amount,
      messagesAtFlush: entry.messages,
      // Ueber dbRun statt db.execute: nur so laeuft der Schreibvorgang durch den
      // Guard (auth_creds/auth_keys) UND bekommt das Retry bei locked/busy/
      // Netzwerkfehlern. Direkt am Client vorbei fehlte beides.
      promise: dbRun(
        `INSERT INTO xp (group_jid, user_jid, xp, messages, name) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(group_jid, user_jid) DO UPDATE SET xp = xp + excluded.xp, messages = messages + excluded.messages, name = excluded.name`,
        [entry.chatJid, entry.userJid, entry.amount, entry.messages || 1, entry.name]
      ),
    });
  }

  for (const [key, entry] of statEntries) {
    const fieldMap = { messages: 'messages', commands: 'commands', ai_calls: 'ai_calls' };
    const col = fieldMap[entry.field] || 'messages';
    tasks.push({
      type: 'stat',
      key,
      entry,
      countAtFlush: entry.count,
      promise: dbRun(
        `INSERT INTO daily_stats (day, messages, commands, ai_calls) VALUES (?, ?, ?, ?)
         ON CONFLICT(day) DO UPDATE SET ${col} = ${col} + excluded.${col}`,
        [
          entry.day,
          entry.field === 'messages' ? entry.count : 0,
          entry.field === 'commands' ? entry.count : 0,
          entry.field === 'ai_calls' ? entry.count : 0,
        ]
      ),
    });
  }

  for (const [key, entry] of groupMsgEntries) {
    tasks.push({
      type: 'groupMsg',
      key,
      entry,
      countAtFlush: entry.count,
      promise: dbRun(
        `INSERT INTO group_daily (group_jid, day, messages) VALUES (?, ?, ?)
         ON CONFLICT(group_jid, day) DO UPDATE SET messages = messages + excluded.messages`,
        [entry.groupJid, entry.day, entry.count]
      ),
    });
  }

  if (!tasks.length) return;

  const results = await Promise.allSettled(tasks.map((t) => t.promise));

  results.forEach((res, idx) => {
    const task = tasks[idx];
    if (res.status === 'fulfilled') {
      if (task.type === 'xp') {
        const current = xpBuffer.get(task.key);
        if (current && current.amount === task.amountAtFlush && current.messages === task.messagesAtFlush) {
          xpBuffer.delete(task.key);
        }
      } else if (task.type === 'stat') {
        const current = statBuffer.get(task.key);
        if (current && current.count === task.countAtFlush) statBuffer.delete(task.key);
      } else if (task.type === 'groupMsg') {
        const current = groupMsgBuffer.get(task.key);
        if (current && current.count === task.countAtFlush) groupMsgBuffer.delete(task.key);
      }
    } else {
      logger.warn(`Flush-Teilfehler (${task.type}): ${res.reason?.message}`, 'db.flush');
    }
  });
}

export function startFlushLoop() {
  if (flushTimer) return;
  flushTimer = setInterval(
    () => flushBuffers().catch((err) => logger.warn(`Flush-Loop-Fehler: ${err.message}`, 'db.flush')),
    config.db.flushIntervalMs || 10000
  );
}

export function stopFlushLoop() {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}

export function totalXpForLevel(level) {
  return 50 * level * (level + 1);
}

export function xpToLevel(xp) {
  let level = 0;
  while (totalXpForLevel(level + 1) <= xp) level++;
  return level;
}

export function levelProgress(xp) {
  const currentLevelXp = totalXpForLevel(xpToLevel(xp));
  const nextLevelXp = totalXpForLevel(xpToLevel(xp) + 1);
  const needed = nextLevelXp - currentLevelXp;
  const progress = xp - currentLevelXp;
  return { currentLevelXp, nextLevelXp, needed, progress };
}
