import { getDb } from './client.js';

export const DATA_TABLES = [
  'warnings', 'mutes', 'bans', 'group_settings', 'coins', 'inventory',
  'user_boosts', 'user_titles', 'game_scores', 'xp', 'user_achievements',
  'prestige', 'scheduled_messages', 'polls', 'poll_votes', 'birthdays',
  'custom_commands', 'faq', 'rob_cooldown', 'active_event', 'global_settings',
  'group_daily', 'player_contracts', 'quests', 'command_toggles', 'levels',
  'blocked_words', 'antiraid', 'audit_log', 'ai_usage', 'members', 'nightmode', 'allowed_chats'
];

export const PROTECTED_TABLES_SET = new Set(['auth_creds', 'auth_keys']);

export async function initDb() {
  const db = getDb();
  
  // FIX: Vollständiges Schema für alle Kern-Tabellen hinzugefügt
  const schemas = [
    `CREATE TABLE IF NOT EXISTS group_settings (jid TEXT PRIMARY KEY, enabled INTEGER DEFAULT 0, antilink INTEGER DEFAULT 0, antispam INTEGER DEFAULT 0, blacklist_on INTEGER DEFAULT 1, welcome INTEGER DEFAULT 0, rules TEXT, welcome_text TEXT, levelup_announce INTEGER DEFAULT 1, slowmode_secs INTEGER DEFAULT 0, weekly_report INTEGER DEFAULT 0)`,
    `CREATE TABLE IF NOT EXISTS coins (user_jid TEXT PRIMARY KEY, name TEXT, balance INTEGER DEFAULT 0, last_daily TEXT, streak INTEGER DEFAULT 0, total_earned INTEGER DEFAULT 0, total_gambled INTEGER DEFAULT 0)`,
    `CREATE TABLE IF NOT EXISTS xp (group_jid TEXT, user_jid TEXT, xp INTEGER DEFAULT 0, messages INTEGER DEFAULT 0, name TEXT, PRIMARY KEY (group_jid, user_jid))`,
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
    `CREATE TABLE IF NOT EXISTS user_titles (user_jid TEXT PRIMARY KEY, title TEXT)`,
    `CREATE TABLE IF NOT EXISTS user_profiles (user_jid TEXT PRIMARY KEY, name TEXT, age INTEGER, location TEXT, hobbies TEXT, bio TEXT, birthday TEXT, updated_at INTEGER)`,
    `CREATE TABLE IF NOT EXISTS scheduled_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, chat_jid TEXT, send_at INTEGER, text TEXT, created_by TEXT, done INTEGER DEFAULT 0, done_at INTEGER)`,
    `CREATE TABLE IF NOT EXISTS inventory (user_jid TEXT, item_id TEXT, qty INTEGER DEFAULT 0, PRIMARY KEY (user_jid, item_id))`,
    `CREATE TABLE IF NOT EXISTS prestige (user_jid TEXT PRIMARY KEY, level INTEGER DEFAULT 0)`,
    `CREATE TABLE IF NOT EXISTS user_achievements (user_jid TEXT, ach_id TEXT, unlocked_at INTEGER, PRIMARY KEY (user_jid, ach_id))`,
    `CREATE TABLE IF NOT EXISTS members (group_jid TEXT, user_jid TEXT, user_lid TEXT, last_seen INTEGER, PRIMARY KEY (group_jid, user_jid))`,
    `CREATE TABLE IF NOT EXISTS groups (jid TEXT PRIMARY KEY, name TEXT, member_count INTEGER, bot_is_admin INTEGER DEFAULT 0, updated_at INTEGER)`,
    `CREATE TABLE IF NOT EXISTS daily_stats (day TEXT PRIMARY KEY, messages INTEGER DEFAULT 0, commands INTEGER DEFAULT 0, ai_calls INTEGER DEFAULT 0)`,
    `CREATE TABLE IF NOT EXISTS group_daily (group_jid TEXT, day TEXT, messages INTEGER DEFAULT 0, PRIMARY KEY (group_jid, day))`,
    `CREATE TABLE IF NOT EXISTS faq (keyword TEXT PRIMARY KEY, answer TEXT, by_jid TEXT, created_at INTEGER)`,
    `CREATE TABLE IF NOT EXISTS millionaire_games (chat_jid TEXT PRIMARY KEY, user_jid TEXT, name TEXT, level INTEGER DEFAULT 0, used TEXT, q TEXT, used5050 INTEGER DEFAULT 0, usedhint INTEGER DEFAULT 0, started_at INTEGER)`,
    `CREATE TABLE IF NOT EXISTS millionaire_daily (user_jid TEXT PRIMARY KEY, day TEXT)`,
    `CREATE TABLE IF NOT EXISTS nightmode (group_jid TEXT PRIMARY KEY, enabled INTEGER DEFAULT 0, start_hhmm TEXT DEFAULT '22:00', end_hhmm TEXT DEFAULT '07:00', is_closed INTEGER DEFAULT 0)`,
    `CREATE TABLE IF NOT EXISTS custom_commands (name TEXT PRIMARY KEY, reply TEXT, by_jid TEXT, created_at INTEGER)`,
    `CREATE TABLE IF NOT EXISTS birthdays (user_jid TEXT PRIMARY KEY, name TEXT, day INTEGER, month INTEGER, year INTEGER, chat_jid TEXT)`,
    `CREATE TABLE IF NOT EXISTS polls (id INTEGER PRIMARY KEY AUTOINCREMENT, group_jid TEXT, question TEXT, options TEXT, created_by TEXT, created_at INTEGER, open INTEGER DEFAULT 1)`,
    `CREATE TABLE IF NOT EXISTS poll_votes (poll_id INTEGER, user_jid TEXT, option_index INTEGER, PRIMARY KEY (poll_id, user_jid))`,
    `CREATE TABLE IF NOT EXISTS game_scores (group_jid TEXT, user_jid TEXT, game TEXT, wins INTEGER DEFAULT 0, name TEXT, PRIMARY KEY (group_jid, user_jid, game))`,
    `CREATE TABLE IF NOT EXISTS quests (id INTEGER PRIMARY KEY AUTOINCREMENT, user_jid TEXT, title TEXT, description TEXT, reward_coins INTEGER, reward_xp INTEGER, completed INTEGER DEFAULT 0, created_at INTEGER, completed_at INTEGER)`,
    `CREATE TABLE IF NOT EXISTS player_contracts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_jid TEXT, type TEXT, terms TEXT, signed_at INTEGER, expires_at INTEGER)`,
    `CREATE TABLE IF NOT EXISTS active_event (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, type TEXT, multiplier REAL, start_at INTEGER, end_at INTEGER, active INTEGER DEFAULT 0)`,
    `CREATE TABLE IF NOT EXISTS user_boosts (user_jid TEXT, boost_type TEXT, multiplier REAL, expires_at INTEGER, PRIMARY KEY (user_jid, boost_type))`,
    `CREATE TABLE IF NOT EXISTS allowed_chats (jid TEXT PRIMARY KEY, note TEXT)`
  ];

  for (const sql of schemas) {
    await db.execute(sql).catch(() => {});
  }

  // Fallback für alle restlichen Tabellen
  for (const t of DATA_TABLES) {
    await db.execute(`CREATE TABLE IF NOT EXISTS ${t} (id TEXT PRIMARY KEY, data TEXT)`).catch(() => {});
  }
}
