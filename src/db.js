import { config } from './config.js';
import { logger } from './logger.js';

export { PROTECTED_TABLES, assertNotAuthWrite, deleteTargetTable } from './core/database/guard.js';
export { getDb, dbRun, dbRows } from './core/database/client.js';

const DATA_TABLES = [
  'warnings', 'mutes', 'bans', 'group_settings', 'coins', 'inventory',
  'user_boosts', 'user_titles', 'game_scores', 'xp', 'user_achievements',
  'prestige', 'scheduled_messages', 'polls', 'poll_votes', 'birthdays',
  'custom_commands', 'faqs', 'rob_cooldown', 'active_event', 'global_settings',
  'group_daily', 'player_contracts'
];

export const PROTECTED_TABLES_SET = new Set(['auth_creds', 'auth_keys']);

export async function initDb() {
  const { getDb } = await import('./core/database/client.js');
  const db = getDb();
  for (const t of DATA_TABLES) {
    await db.execute(`CREATE TABLE IF NOT EXISTS ${t} (id TEXT PRIMARY KEY)`).catch(() => {});
  }
  await db.execute(`CREATE TABLE IF NOT EXISTS auth_creds (id TEXT PRIMARY KEY, data TEXT)`).catch(() => {});
  await db.execute(`CREATE TABLE IF NOT EXISTS auth_keys (id TEXT PRIMARY KEY, data TEXT)`).catch(() => {});
}

export async function wipeAllData() {
  const { getDb } = await import('./core/database/client.js');
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
