import { getDb } from './client.js';

export const DATA_TABLES = [
  'warnings', 'mutes', 'bans', 'group_settings', 'coins', 'inventory',
  'user_boosts', 'user_titles', 'game_scores', 'xp', 'user_achievements',
  'prestige', 'scheduled_messages', 'polls', 'poll_votes', 'birthdays',
  'custom_commands', 'faqs', 'rob_cooldown', 'active_event', 'global_settings',
  'group_daily', 'player_contracts'
];

export const PROTECTED_TABLES_SET = new Set(['auth_creds', 'auth_keys']);

export async function initDb() {
  const db = getDb();
  for (const t of DATA_TABLES) {
    await db.execute(`CREATE TABLE IF NOT EXISTS ${t} (id TEXT PRIMARY KEY)`).catch(() => {});
  }
  await db.execute(`CREATE TABLE IF NOT EXISTS auth_creds (id TEXT PRIMARY KEY, data TEXT)`).catch(() => {});
  await db.execute(`CREATE TABLE IF NOT EXISTS auth_keys (id TEXT PRIMARY KEY, data TEXT)`).catch(() => {});
}
