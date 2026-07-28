import { config } from './config.js';
import { logger } from './logger.js';

export { PROTECTED_TABLES, assertNotAuthWrite, deleteTargetTable } from './core/database/guard.js';
export { getDb, dbRun, dbRows } from './core/database/client.js';
export { DATA_TABLES, PROTECTED_TABLES_SET, initDb } from './core/database/schema.js';
export { wipeAllData } from './core/database/wipe.js';

export function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Puffer-Flush Logik (Stub für asynchrone Batch-Operationen)
 */
export async function flushBuffers() {
  // Keine aktiven Puffer im aktuellen Direkt-Schreib-Modus erforderlich
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
