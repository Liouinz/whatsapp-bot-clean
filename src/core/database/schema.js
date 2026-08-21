import { getDb } from './client.js';

// Tabellen aktiver Features. Jede hier gelistete Tabelle MUSS unten in initDb()
// angelegt werden und wird vom Panel-Wipe geleert — beide Richtungen sind am
// Ende dieser Datei geprueft.
export const DATA_TABLES = [
  'warnings', 'mutes', 'bans', 'group_settings', 'xp', 'levels',
  'scheduled_messages', 'polls', 'poll_votes', 'birthdays',
  'custom_commands', 'faq', 'active_event', 'global_settings',
  'group_daily', 'command_toggles', 'blocked_words', 'antiraid',
  'audit_log', 'ai_usage', 'members', 'nightmode', 'contacts',
  'user_profiles', 'groups', 'daily_stats', 'afk',
];

/**
 * Tabellen entfernter Features (Economy, Spiele, Progression) plus
 * `allowed_chats`, dessen Freigabelogik es nicht mehr gibt.
 *
 * Sie werden **nicht mehr angelegt** — eine frische Datenbank bekommt sie gar
 * nicht erst. Bestehende Datenbanken behalten sie: ein DROP TABLE waere eine
 * destruktive Migration gegen Produktionsdaten, und dafuer gibt es keinen
 * Anlass. Der Panel-Wipe leert sie weiterhin, sofern sie vorhanden sind, damit
 * "Alle Daten loeschen" nicht heimlich alte Zeilen stehen laesst.
 *
 * Wer sie endgueltig loswerden will, macht das bewusst und einmalig von Hand.
 */
export const LEGACY_TABLES = [
  'coins', 'inventory', 'user_boosts', 'user_titles', 'game_scores',
  'user_achievements', 'prestige', 'rob_cooldown', 'player_contracts',
  'quests', 'millionaire_games', 'millionaire_daily', 'allowed_chats',
];

export const PROTECTED_TABLES_SET = new Set(['auth_creds', 'auth_keys']);

/**
 * Infrastruktur der Control API: Zugaenge, Geraete-Sitzungen, Tokens.
 *
 * Bewusst **nicht** in DATA_TABLES. "Alle Daten loeschen" im Panel meint die
 * Community-Daten des Bots — nicht die Zugaenge, mit denen man ihn bedient.
 * Wuerde ein Wipe diese Tabellen leeren, sperrte er jedes gekoppelte Geraet
 * aus und loeschte alle angelegten API-Nutzer gleich mit.
 *
 * Anders als PROTECTED_TABLES_SET sind sie normal beschreibbar — der Guard in
 * guard.js schuetzt ausschliesslich auth_creds/auth_keys.
 */
export const INFRA_TABLES = ['api_users', 'api_sessions', 'api_tokens'];

export async function initDb() {
  const db = getDb();
  
  const schemas = [
    `CREATE TABLE IF NOT EXISTS group_settings (jid TEXT PRIMARY KEY, enabled INTEGER DEFAULT 0, antilink INTEGER DEFAULT 0, antispam INTEGER DEFAULT 0, blacklist_on INTEGER DEFAULT 1, welcome INTEGER DEFAULT 0, rules TEXT, welcome_text TEXT, levelup_announce INTEGER DEFAULT 1, slowmode_secs INTEGER DEFAULT 0, weekly_report INTEGER DEFAULT 0, last_weekly_report TEXT)`,
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
    `CREATE TABLE IF NOT EXISTS user_profiles (user_jid TEXT PRIMARY KEY, name TEXT, age INTEGER, location TEXT, hobbies TEXT, bio TEXT, birthday TEXT, updated_at INTEGER)`,
    `CREATE TABLE IF NOT EXISTS scheduled_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, chat_jid TEXT, send_at INTEGER, text TEXT, created_by TEXT, done INTEGER DEFAULT 0, done_at INTEGER)`,
    `CREATE TABLE IF NOT EXISTS members (group_jid TEXT, user_jid TEXT, user_lid TEXT, last_seen INTEGER, PRIMARY KEY (group_jid, user_jid))`,
    `CREATE TABLE IF NOT EXISTS groups (jid TEXT PRIMARY KEY, name TEXT, member_count INTEGER, bot_is_admin INTEGER DEFAULT 0, updated_at INTEGER)`,
    `CREATE TABLE IF NOT EXISTS daily_stats (day TEXT PRIMARY KEY, messages INTEGER DEFAULT 0, commands INTEGER DEFAULT 0, ai_calls INTEGER DEFAULT 0)`,
    `CREATE TABLE IF NOT EXISTS group_daily (group_jid TEXT, day TEXT, messages INTEGER DEFAULT 0, PRIMARY KEY (group_jid, day))`,
    `CREATE TABLE IF NOT EXISTS faq (keyword TEXT PRIMARY KEY, answer TEXT, by_jid TEXT, created_at INTEGER)`,
    `CREATE TABLE IF NOT EXISTS nightmode (group_jid TEXT PRIMARY KEY, enabled INTEGER DEFAULT 0, start_hhmm TEXT DEFAULT '22:00', end_hhmm TEXT DEFAULT '07:00', is_closed INTEGER DEFAULT 0)`,
    `CREATE TABLE IF NOT EXISTS custom_commands (name TEXT PRIMARY KEY, reply TEXT, by_jid TEXT, created_at INTEGER)`,
    // commands/afk.js liest und schreibt diese Tabelle seit jeher — angelegt
    // wurde sie nie. loadAfk() bekam beim Start still ein leeres Ergebnis
    // (dbRows glaettet den Fehler), und jeder Schreibvorgang lief in ein
    // .catch(() => {}). AFK funktionierte damit nur im RAM und war nach jedem
    // Neustart weg, waehrend im Panel-Log "no such table: afk" auflief.
    `CREATE TABLE IF NOT EXISTS afk (user_jid TEXT PRIMARY KEY, reason TEXT, since INTEGER)`,

    // ── Control API (Phase 2) ────────────────────────────────────────
    // Zugaenge fuer die spaetere Android-App. Passwoerter als scrypt-Hash mit
    // eigenem Salt je Nutzer; der Klartext existiert nur im Request.
    `CREATE TABLE IF NOT EXISTS api_users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, pw_hash TEXT NOT NULL, pw_salt TEXT NOT NULL, role TEXT NOT NULL, created_at INTEGER, disabled INTEGER DEFAULT 0)`,
    // Ein Eintrag je gekoppeltem Geraet. Ueber revoked_at laesst sich ein
    // einzelnes Geraet abmelden, ohne die anderen zu stoeren.
    `CREATE TABLE IF NOT EXISTS api_sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, device_label TEXT, app_version TEXT, created_at INTEGER, last_used_at INTEGER, revoked_at INTEGER)`,
    // Nur der SHA-256-Hash des Tokens wird gespeichert. Wer die Datenbank
    // liest, bekommt damit keinen gueltigen Token in die Hand.
    `CREATE TABLE IF NOT EXISTS api_tokens (token_hash TEXT PRIMARY KEY, session_id TEXT NOT NULL, kind TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER, revoked_at INTEGER)`,
    `CREATE INDEX IF NOT EXISTS idx_api_tokens_session ON api_tokens(session_id)`,
    `CREATE INDEX IF NOT EXISTS idx_api_tokens_expires ON api_tokens(expires_at)`,
    `CREATE INDEX IF NOT EXISTS idx_api_sessions_user ON api_sessions(user_id)`,
    `CREATE TABLE IF NOT EXISTS birthdays (user_jid TEXT PRIMARY KEY, name TEXT, day INTEGER, month INTEGER, year INTEGER, group_jid TEXT, last_congratulated TEXT)`,
    `CREATE TABLE IF NOT EXISTS polls (id INTEGER PRIMARY KEY AUTOINCREMENT, group_jid TEXT, question TEXT, options TEXT, created_by TEXT, created_at INTEGER, open INTEGER DEFAULT 1)`,
    `CREATE TABLE IF NOT EXISTS poll_votes (poll_id INTEGER, user_jid TEXT, option_idx INTEGER, PRIMARY KEY (poll_id, user_jid))`,
    `CREATE TABLE IF NOT EXISTS active_event (id INTEGER PRIMARY KEY, event_id TEXT, name TEXT, emoji TEXT, xp_mult REAL DEFAULT 1.0, coin_mult REAL DEFAULT 1.0, started_at INTEGER, expires_at INTEGER)`,
    // Zentrale Personen-Tabelle. members ist pro (Gruppe, Person) und hat
    // deshalb keinen Platz fuer jemanden aus einer DM oder aus dem
    // Adressbuch. Schluessel ist die kanonische PN-JID — die Identitaet.
    //   push_name     = Contact.notify      (Name, den die Person selbst setzt)
    //   contact_name  = Contact.name        (Name aus dem Adressbuch)
    //   verified_name = Contact.verifiedName (Business-Konten)
    //   known_from    = 'group' | 'contacts' | 'message'
    `CREATE TABLE IF NOT EXISTS contacts (user_jid TEXT PRIMARY KEY, user_lid TEXT, push_name TEXT, contact_name TEXT, verified_name TEXT, known_from TEXT, first_seen INTEGER, last_active INTEGER)`,
    `CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_warnings_expires ON warnings(expires_at)`,
    // Die Nutzersuche schlaegt ueber alle Personen-Tabellen auf user_jid zu.
    `CREATE INDEX IF NOT EXISTS idx_members_user ON members(user_jid)`,
    `CREATE INDEX IF NOT EXISTS idx_xp_user ON xp(user_jid)`,
    `CREATE INDEX IF NOT EXISTS idx_warnings_user ON warnings(user_jid)`,
    // Die Nutzersuche schlaegt ueber die LID zurueck auf die Person.
    `CREATE INDEX IF NOT EXISTS idx_contacts_lid ON contacts(user_lid)`
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
  // Keine Legacy-Tabelle darf versehentlich wieder angelegt werden.
  const legacy = new Set(LEGACY_TABLES);
  for (const sql of schemas) {
    const m = /create table if not exists\s+(\w+)/i.exec(sql);
    if (m && legacy.has(m[1])) {
      throw new Error(
        `[SCHEMA ERROR] '${m[1]}' steht in LEGACY_TABLES und darf nicht mehr angelegt werden.`
      );
    }
  }

  const known = new Set([...DATA_TABLES, ...PROTECTED_TABLES_SET, ...INFRA_TABLES]);
  for (const sql of schemas) {
    const m = /create table if not exists\s+(\w+)/i.exec(sql);
    if (m && !known.has(m[1])) {
      throw new Error(
        `[SCHEMA ERROR] Tabelle '${m[1]}' wird angelegt, fehlt aber in DATA_TABLES ` +
          '(und ist weder geschuetzt noch API-Infrastruktur) — sie wuerde jeden Wipe ueberleben.'
      );
    }
  }
}
