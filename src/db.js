import { createClient } from '@libsql/client';
import { config } from './config.js';
import { logger } from './logger.js';

export { PROTECTED_TABLES, assertNotAuthWrite, deleteTargetTable } from './core/database/guard.js';
import { assertNotAuthWrite } from './core/database/guard.js';

let client = null;

const DATA_TABLES = [
  'warnings', 'mutes', 'bans', 'group_settings', 'coins', 'inventory',
  'user_boosts', 'user_titles', 'game_scores', 'xp', 'user_achievements',
  'prestige', 'scheduled_messages', 'polls', 'poll_votes', 'birthdays',
  'custom_commands', 'faqs', 'rob_cooldown', 'active_event', 'global_settings',
  'group_daily', 'player_contracts'
];

export const PROTECTED_TABLES_SET = new Set(['auth_creds', 'auth_keys']);

export function getDb() {
  if (!client) {
    client = createClient({
      url: config.databaseUrl.trim(),
      authToken: config.databaseKey.trim(),
    });
  }
  return client;
}

export async function initDb() {
  const db = getDb();
  // Schema-Initialisierung / Tabellen sicherstellen
  for (const t of DATA_TABLES) {
    await db.execute(`CREATE TABLE IF NOT EXISTS ${t} (id TEXT PRIMARY KEY)`).catch(() => {});
  }
  await db.execute(`CREATE TABLE IF NOT EXISTS auth_creds (id TEXT PRIMARY KEY, data TEXT)`).catch(() => {});
  await db.execute(`CREATE TABLE IF NOT EXISTS auth_keys (id TEXT PRIMARY KEY, data TEXT)`).catch(() => {});
}

export async function dbRun(sql, args = []) {
  assertNotAuthWrite(sql);
  const db = getDb();
  try {
    return await db.execute({ sql, args });
  } catch (err) {
    await new Promise((r) => setTimeout(r, 500));
    return db.execute({ sql, args });
  }
}

export async function dbRows(sql, args = []) {
  try {
    const res = await dbRun(sql, args);
    return res.rows;
  } catch {
    return [];
  }
}

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

export function totalXpForLevel(level) {
  return 50 * level * (level + 1);
}

export function xpToLevel(xp) {
  let level = 0;
  while (totalXpForLevel(level + 1) <= xp) level++;
  return level;
}

const xpBuffer = new Map();
export function bufferXp() {}
