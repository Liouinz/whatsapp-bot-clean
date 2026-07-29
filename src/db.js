import { config } from './config.js';
import { logger } from './logger.js';
import { getDb } from './core/database/client.js';

export { PROTECTED_TABLES, assertNotAuthWrite, deleteTargetTable } from './core/database/guard.js';
export { getDb, dbRun, dbRows } from './core/database/client.js';
export { DATA_TABLES, PROTECTED_TABLES_SET, initDb } from './core/database/schema.js';
export { wipeAllData } from './core/database/wipe.js';

export function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Puffer-Flush Logik fuer asynchrone Batch-Operationen
 */
const xpBuffer = new Map();
const statBuffer = new Map();
const groupMsgBuffer = new Map();
let flushTimer = null;

export function bufferXp(chatJid, userJid, amount, name) {
  const key = `${chatJid}:${userJid}`;
  const entry = xpBuffer.get(key) || { chatJid, userJid, amount: 0, name };
  entry.amount += amount;
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

export async function flushBuffers() {
  const db = getDb();
  const promises = [];
  
  // FIX: Buffer-Inhalte kopieren und Maps sofort leeren, um Race Conditions zu vermeiden
  const xpEntries = Array.from(xpBuffer.values());
  xpBuffer.clear();
  
  const statEntries = Array.from(statBuffer.values());
  statBuffer.clear();
  
  const groupMsgEntries = Array.from(groupMsgBuffer.values());
  groupMsgBuffer.clear();

  for (const entry of xpEntries) {
    promises.push(
      db.execute({
        sql: `INSERT INTO xp (group_jid, user_jid, xp, messages, name) VALUES (?, ?, ?, 1, ?)
              ON CONFLICT(group_jid, user_jid) DO UPDATE SET xp = xp + excluded.xp, messages = messages + 1, name = excluded.name`,
        args: [entry.chatJid, entry.userJid, entry.amount, entry.name]
      }).catch((err) => logger.warn(`Flush-Fehler: ${err.message}`, 'db.flush'))
    );
  }
  
  for (const entry of statEntries) {
    const fieldMap = { messages: 'messages', commands: 'commands', ai_calls: 'ai_calls' };
    const col = fieldMap[entry.field] || 'messages';
    promises.push(
      db.execute({
        sql: `INSERT INTO daily_stats (day, messages, commands, ai_calls) VALUES (?, ?, ?, ?)
              ON CONFLICT(day) DO UPDATE SET ${col} = ${col} + excluded.${col}`,
        args: [entry.day, entry.field === 'messages' ? entry.count : 0, entry.field === 'commands' ? entry.count : 0, entry.field === 'ai_calls' ? entry.count : 0]
      }).catch((err) => logger.warn(`Flush-Fehler: ${err.message}`, 'db.flush'))
    );
  }
  
  for (const entry of groupMsgEntries) {
    promises.push(
      db.execute({
        sql: `INSERT INTO group_daily (group_jid, day, messages) VALUES (?, ?, ?)
              ON CONFLICT(group_jid, day) DO UPDATE SET messages = messages + excluded.messages`,
        args: [entry.groupJid, entry.day, entry.count]
      }).catch((err) => logger.warn(`Flush-Fehler: ${err.message}`, 'db.flush'))
    );
  }
  
  await Promise.all(promises);
}

export function startFlushLoop() {
  if (flushTimer) return;
  flushTimer = setInterval(() => flushBuffers().catch((err) => logger.warn(`Flush-Loop-Fehler: ${err.message}`, 'db.flush')), config.db.flushIntervalMs || 10000);
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
