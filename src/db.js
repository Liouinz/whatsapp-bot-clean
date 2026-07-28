import { config } from './config.js';
import { logger } from './logger.js';

export { PROTECTED_TABLES, assertNotAuthWrite, deleteTargetTable } from './core/database/guard.js';
export { getDb, dbRun, dbRows } from './core/database/client.js';
export { DATA_TABLES, PROTECTED_TABLES_SET, initDb } from './core/database/schema.js';

import { getDb } from './core/database/client.js';
import { DATA_TABLES, PROTECTED_TABLES_SET } from './core/database/schema.js';

export async function wipeAllData() {
  const db = getDb();
  const tables = DATA_TABLES.filter((t) => !PROTECTED_TABLES_SET.has(t));
  await db.batch(tables.map((t) => ({ sql: `DELETE FROM ${t}`, args: [] })), 'write');
}

export function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export async function flushBuffers() {
  // Puffer-Flush Logik
}

export function startFlushLoop() {
  // Loop-Stub für Rückwärtskompatibilität
}

export function stopFlushLoop() {
  // Stop-Stub für Rückwärtskompatibilität
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

export function bufferXp() {}
export function bufferStat() {}
export function bufferGroupMessage() {}
