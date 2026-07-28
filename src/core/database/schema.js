import { getDb } from './client.js';

export const DATA_TABLES = [
  'warnings', 'mutes', 'bans', 'group_settings', 'coins', 'inventory',
  'user_boosts', 'user_titles', 'game_scores', 'xp', 'user_achievements',
  'prestige', 'scheduled_messages', 'polls', 'poll_votes', 'birthdays',
  'custom_commands', 'faqs', 'rob_cooldown', 'active_event', 'global_settings',
  'group_daily', 'player_contracts', 'quests', 'command_toggles', 'levels',
  'blocked_words', 'antiraid', 'audit_log', 'ai_usage'
];

export const PROTECTED_TABLES_SET = new Set(['auth_creds', 'auth_keys']);

export async function initDb() {
  const db = getDb();
  
  // Vollständiges Schema für alle Kern-Tabellen mit exakter Spaltenkompatibilität
  const schemas = [
    `CREATE TABLE IF NOT EXISTS group_settings (jid TEXT PRIMARY KEY, enabled INTEGER DEFAULT 0, antilink INTEGER DEFAULT 0, antispam INTEGER DEFAULT 0, blacklist_on INTEGER DEFAULT 1, welcome INTEGER DEFAULT 0, rules TEXT, levelup_announce INTEGER DEFAULT 1, slowmode_secs INTEGER DEFAULT 0)`,
    `CREATE TABLE IF NOT EXISTS coins (user_jid TEXT PRIMARY KEY, name TEXT, balance INTEGER DEFAULT 0, last_daily TEXT, streak INTEGER DEFAULT 0, total_earned INTEGER DEFAULT 0, total_gambled INTEGER DEFAULT 0)`,
    `CREATE TABLE IF NOT EXISTS xp (group_jid TEXT, user_jid TEXT, xp INTEGER DEFAULT 0, PRIMARY KEY (group_jid, user_jid))`,
    `CREATE TABLE IF NOT EXISTS levels (group_jid TEXT, user_jid TEXT, level INTEGER DEFAULT 0, PRIMARY KEY (group_jid, user_jid))`,
    `CREATE TABLE IF NOT EXISTS command_toggles (name TEXT PRIMARY KEY, enabled INTEGER DEFAULT 1)`,
    `CREATE TABLE IF NOT EXISTS global_settings (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)`,
    `CREATE TABLE IF NOT EXISTS auth_creds (id TEXT PRIMARY KEY, data TEXT)`,
    `CREATE TABLE IF NOT EXISTS auth_keys (id TEXT PRIMARY KEY, data TEXT)`,
    `CREATE TABLE IF NOT EXISTS warnings (id INTEGER PRIMARY KEY AUTOINCREMENT, group_jid TEXT, user_jid TEXT, reason TEXT, by_jid TEXT, created_at INTEGER, expires_at INTEGER)`,
    `CREATE TABLE IF NOT EXISTS mutes (group_jid TEXT, user_jid TEXT, until INTEGER, by_jid TEXT, reason TEXT, PRIMARY KEY (group_jid, user_jid))`,
    `CREATE TABLE IF NOT EXISTS bans (group_jid TEXT, user_jid TEXT, reason TEXT, by_jid TEXT, created_at INTEGER, PRIMARY KEY (group_jid, user_jid))`,
    `CREATE TABLE IF NOT EXISTS blocked_words (group_jid TEXT, word TEXT, PRIMARY KEY (group_jid, word))`,
    `CREATE TABLE IF NOT EXISTS antiraid (group_jid TEXT PRIMARY KEY, enabled INTEGER DEFAULT 0, locked_until INTEGER DEFAULT 0)`,
    `CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT, group_jid TEXT, target TEXT, by_jid TEXT, detail TEXT, created_at INTEGER)`,
    `CREATE TABLE IF NOT EXISTS ai_usage (day TEXT PRIMARY KEY, calls INTEGER DEFAULT 0)`,
    `CREATE TABLE IF NOT EXISTS rob_cooldown (group_jid TEXT, user_jid TEXT, last_rob INTEGER, PRIMARY KEY (group_jid, user_jid))`,
    `CREATE TABLE IF NOT EXISTS user_titles (user_jid TEXT PRIMARY KEY, title TEXT)`
  ];

  for (const sql of schemas) {
    await db.execute(sql).catch(() => {});
  }

  // Fallback für alle restlichen Tabellen
  for (const t of DATA_TABLES) {
    await db.execute(`CREATE TABLE IF NOT EXISTS ${t} (id TEXT PRIMARY KEY, data TEXT)`).catch(() => {});
  }
}
