import { getDb } from './client.js';

export const DATA_TABLES = [
  'warnings', 'mutes', 'bans', 'group_settings', 'coins', 'inventory',
  'user_boosts', 'user_titles', 'game_scores', 'xp', 'user_achievements',
  'prestige', 'scheduled_messages', 'polls', 'poll_votes', 'birthdays',
  'custom_commands', 'faq', 'rob_cooldown', 'active_event', 'global_settings',
  'group_daily', 'player_contracts', 'quests', 'command_toggles', 'levels',
  'blocked_words', 'antiraid', 'audit_log', 'ai_usage', 'members', 'nightmode', 'allowed_chats',
  // Diese fuenf wurden von initDb() angelegt, fehlten aber in DATA_TABLES und
  // ueberlebten damit jeden "Alle Daten loeschen"-Wipe aus dem Panel — inklusive
  // der personenbezogenen Profildaten in user_profiles.
  'user_profiles', 'groups', 'daily_stats', 'millionaire_games', 'millionaire_daily'
];

export const PROTECTED_TABLES_SET = new Set(['auth_creds', 'auth_keys']);

export async function initDb() {
  const db = getDb();
  
  const schemas = [
    `CREATE TABLE IF NOT EXISTS group_settings (jid TEXT PRIMARY KEY, enabled INTEGER DEFAULT 0, antilink INTEGER DEFAULT 0, antispam INTEGER DEFAULT 0, blacklist_on INTEGER DEFAULT 1, welcome INTEGER DEFAULT 0, rules TEXT, welcome_text TEXT, levelup_announce INTEGER DEFAULT 1, slowmode_secs INTEGER DEFAULT 0, weekly_report INTEGER DEFAULT 0, last_weekly_report TEXT)`,
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
    `CREATE TABLE IF NOT EXISTS prestige (user_jid TEXT PRIMARY KEY, level INTEGER DEFAULT 0, updated_at INTEGER)`,
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
    `CREATE TABLE IF NOT EXISTS birthdays (user_jid TEXT PRIMARY KEY, name TEXT, day INTEGER, month INTEGER, year INTEGER, group_jid TEXT, last_congratulated TEXT)`,
    `CREATE TABLE IF NOT EXISTS polls (id INTEGER PRIMARY KEY AUTOINCREMENT, group_jid TEXT, question TEXT, options TEXT, created_by TEXT, created_at INTEGER, open INTEGER DEFAULT 1)`,
    `CREATE TABLE IF NOT EXISTS poll_votes (poll_id INTEGER, user_jid TEXT, option_idx INTEGER, PRIMARY KEY (poll_id, user_jid))`,
    `CREATE TABLE IF NOT EXISTS game_scores (group_jid TEXT, user_jid TEXT, game TEXT, wins INTEGER DEFAULT 0, name TEXT, PRIMARY KEY (group_jid, user_jid, game))`,
    `CREATE TABLE IF NOT EXISTS quests (id INTEGER PRIMARY KEY AUTOINCREMENT, user_jid TEXT, title TEXT, description TEXT, reward_coins INTEGER, reward_xp INTEGER, completed INTEGER DEFAULT 0, created_at INTEGER, completed_at INTEGER)`,
    `CREATE TABLE IF NOT EXISTS player_contracts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_jid TEXT, name TEXT, contract_id TEXT, baseline INTEGER DEFAULT 0, accepted_at INTEGER, expires_at INTEGER, chat_jid TEXT, done INTEGER DEFAULT 0)`,
    `CREATE TABLE IF NOT EXISTS active_event (id INTEGER PRIMARY KEY, event_id TEXT, name TEXT, emoji TEXT, xp_mult REAL DEFAULT 1.0, coin_mult REAL DEFAULT 1.0, started_at INTEGER, expires_at INTEGER)`,
    `CREATE TABLE IF NOT EXISTS user_boosts (user_jid TEXT, type TEXT, mult REAL, expires_at INTEGER, PRIMARY KEY (user_jid, type))`,
    `CREATE TABLE IF NOT EXISTS allowed_chats (jid TEXT PRIMARY KEY, note TEXT)`,
    `CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_warnings_expires ON warnings(expires_at)`,
    // Die Nutzersuche schlaegt ueber alle Personen-Tabellen auf user_jid zu.
    `CREATE INDEX IF NOT EXISTS idx_members_user ON members(user_jid)`,
    `CREATE INDEX IF NOT EXISTS idx_xp_user ON xp(user_jid)`,
    `CREATE INDEX IF NOT EXISTS idx_warnings_user ON warnings(user_jid)`
  ];

  for (const sql of schemas) {
    await db.execute(sql).catch((err) => {
      console.error(`⚠️ Schema Execution Warnung: ${err.message}`);
    });
  }

  // ── Migrationen: Spalten, die nachtraeglich zu bereits existierenden
  // Tabellen hinzugefuegt wurden. CREATE TABLE IF NOT EXISTS greift bei
  // Tabellen, die schon existieren, nicht mehr - daher hier gezielt per
  // ALTER TABLE nachziehen, nur wenn die Spalte wirklich fehlt.
  const migrations = [
    { table: 'birthdays', column: 'last_congratulated', ddl: 'TEXT' },
    { table: 'player_contracts', column: 'done', ddl: 'INTEGER DEFAULT 0' },
    // Wochenreport-Marker pro Gruppe (Tagesschluessel). Ersetzt den frueheren
    // globalen Flag, der ueber setGlobalFlag lief und dort zu `true` gecastet
    // wurde - der Dedupe-Guard konnte deshalb nie greifen.
    { table: 'group_settings', column: 'last_weekly_report', ddl: 'TEXT' },
    // Zaehler fuer fehlgeschlagene Sendeversuche geplanter Nachrichten.
    { table: 'scheduled_messages', column: 'attempts', ddl: 'INTEGER DEFAULT 0' },
    // Anzeigename (pushName) und echte Nachrichtenaktivitaet je Gruppe.
    // last_seen bleibt unveraendert ("zuletzt in den Gruppen-Metadaten
    // gesehen"); last_active ist die tatsaechliche Aktivitaet aus dem
    // Nachrichtenpfad. Zwei Bedeutungen, zwei Spalten.
    { table: 'members', column: 'push_name', ddl: 'TEXT' },
    { table: 'members', column: 'last_active', ddl: 'INTEGER' },
  ];
  for (const { table, column, ddl } of migrations) {
    try {
      const info = await db.execute(`PRAGMA table_info(${table})`);
      const hasColumn = (info.rows || []).some((r) => r.name === column);
      if (!hasColumn) {
        await db.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
        console.log(`✅ Migration: Spalte '${column}' zu '${table}' hinzugefügt.`);
      }
    } catch (err) {
      console.error(`⚠️ Migration Warnung (${table}.${column}): ${err.message}`);
    }
  }

  for (const table of DATA_TABLES) {
    const defined = schemas.some((s) => s.toLowerCase().includes(`create table if not exists ${table}`));
    if (!defined) {
      throw new Error(`[SCHEMA ERROR] Tabelle '${table}' aus DATA_TABLES ist in initDb() nicht definiert!`);
    }
  }

  // Gegenrichtung: jede tatsaechlich angelegte Tabelle muss entweder in
  // DATA_TABLES stehen (wird gewiped) oder ausdruecklich geschuetzt sein.
  // Ohne diese Pruefung war es genau umgekehrt moeglich, eine neue Tabelle
  // anzulegen und in DATA_TABLES zu vergessen — sie ueberlebte dann jeden
  // "Alle Daten loeschen"-Wipe unbemerkt, so geschehen mit user_profiles.
  const known = new Set([...DATA_TABLES, ...PROTECTED_TABLES_SET]);
  for (const sql of schemas) {
    const m = /create table if not exists\s+(\w+)/i.exec(sql);
    if (m && !known.has(m[1])) {
      throw new Error(
        `[SCHEMA ERROR] Tabelle '${m[1]}' wird angelegt, fehlt aber in DATA_TABLES ` +
          '(und ist nicht geschuetzt) — sie wuerde jeden Wipe ueberleben.'
      );
    }
  }
}
