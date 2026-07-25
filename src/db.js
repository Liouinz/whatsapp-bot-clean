// Turso-Client + Schema + Schreib-Batching mit Ausfallschutz.
// Häufige Writes (XP, Counter) werden im RAM gesammelt und alle ~10 s gebündelt
// geschrieben. Ist Turso kurz weg, bleiben die Daten im RAM und werden nachgeschrieben.

import { createClient } from '@libsql/client';
import { config } from './config.js';

let client = null;

export function getDb() {
  if (!client) {
    client = createClient({
      url: process.env.DATABASE_URL.trim(),
      authToken: process.env.DATABASE_KEY.trim(),
    });
  }
  return client;
}

// ABSOLUTER SCHUTZ der Baileys-Session: kein Feature-/Wartungs-/Cleanup-Code darf
// die Session-Tabellen schreibend anfassen (Löschen/Überschreiben → 401/Bad MAC).
// auth.js schreibt bewusst über den ROHEN Treiber (getDb().execute/.batch), NICHT
// über diese Helfer — dieser Wächter blockiert also ausschließlich versehentliche
// Fremdzugriffe und protokolliert sie, wie in der Sicherheitsvorgabe verlangt.
const AUTH_TABLE_RE = /\bauth_(?:creds|keys)\b/i;
const WRITE_VERB_RE = /^\s*(?:insert|update|delete|drop|alter|truncate|replace|create)\b/i;
function assertNotAuthWrite(sql) {
  const text = String(sql || '');
  if (WRITE_VERB_RE.test(text) && AUTH_TABLE_RE.test(text)) {
    console.error(`🛡️ [SECURITY BLOCK] Schreibzugriff auf Baileys-Session-Tabelle verweigert: ${text.slice(0, 90)}`);
    throw new Error('Schreibzugriff auf geschützte Session-Tabellen (auth_creds/auth_keys) ist nicht erlaubt.');
  }
}

/** Direkter Write/Read mit einem stillen Retry (transiente Turso-Aussetzer). */
export async function dbRun(sql, args = []) {
  assertNotAuthWrite(sql); // Session-Schutzwall — vor jedem Zugriff
  const db = getDb();
  try {
    return await db.execute({ sql, args });
  } catch (err) {
    await new Promise((r) => setTimeout(r, 500));
    return db.execute({ sql, args }); // zweiter Versuch — wirft er auch, fängt der Aufrufer
  }
}

/** Read-Helper: gibt rows zurück, bei DB-Fehler [] (Bot läuft weiter). */
export async function dbRows(sql, args = []) {
  try {
    const res = await dbRun(sql, args);
    return res.rows;
  } catch {
    return [];
  }
}

// ── Schema ─────────────────────────────────────────────────────────

const TABLES = [
  // Session (Phase 2)
  `CREATE TABLE IF NOT EXISTS auth_creds (id TEXT PRIMARY KEY, data TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS auth_keys (id TEXT PRIMARY KEY, data TEXT NOT NULL)`,

  // Gruppen & Mitglieder
  `CREATE TABLE IF NOT EXISTS groups (
     jid TEXT PRIMARY KEY, name TEXT, member_count INTEGER DEFAULT 0,
     bot_is_admin INTEGER DEFAULT 0, updated_at INTEGER
   )`,
  `CREATE TABLE IF NOT EXISTS group_settings (
     jid TEXT PRIMARY KEY,
     enabled INTEGER DEFAULT 0,
     antilink INTEGER DEFAULT 0,
     antispam INTEGER DEFAULT 0,
     blacklist_on INTEGER DEFAULT 1,
     welcome INTEGER DEFAULT 0,
     rules TEXT DEFAULT '',
     levelup_announce INTEGER DEFAULT 1
   )`,
  `CREATE TABLE IF NOT EXISTS members (
     group_jid TEXT, user_jid TEXT, user_lid TEXT, name TEXT, last_seen INTEGER,
     PRIMARY KEY (group_jid, user_jid)
   )`,

  // Moderation
  `CREATE TABLE IF NOT EXISTS warnings (
     id INTEGER PRIMARY KEY AUTOINCREMENT, group_jid TEXT, user_jid TEXT,
     reason TEXT, by_jid TEXT, created_at INTEGER, expires_at INTEGER
   )`,
  `CREATE TABLE IF NOT EXISTS mutes (
     group_jid TEXT, user_jid TEXT, until INTEGER, by_jid TEXT, reason TEXT,
     PRIMARY KEY (group_jid, user_jid)
   )`,
  `CREATE TABLE IF NOT EXISTS bans (
     group_jid TEXT, user_jid TEXT, reason TEXT, by_jid TEXT, created_at INTEGER,
     PRIMARY KEY (group_jid, user_jid)
   )`,
  `CREATE TABLE IF NOT EXISTS blocked_words (
     group_jid TEXT, word TEXT, PRIMARY KEY (group_jid, word)
   )`,
  `CREATE TABLE IF NOT EXISTS allowed_chats (jid TEXT PRIMARY KEY, note TEXT)`,

  // XP / Level
  `CREATE TABLE IF NOT EXISTS xp (
     group_jid TEXT, user_jid TEXT, xp INTEGER DEFAULT 0, messages INTEGER DEFAULT 0,
     name TEXT, PRIMARY KEY (group_jid, user_jid)
   )`,
  `CREATE TABLE IF NOT EXISTS levels (
     group_jid TEXT, user_jid TEXT, level INTEGER DEFAULT 0,
     PRIMARY KEY (group_jid, user_jid)
   )`,

  // Community-Features
  `CREATE TABLE IF NOT EXISTS afk (
     user_jid TEXT PRIMARY KEY, reason TEXT, since INTEGER
   )`,
  `CREATE TABLE IF NOT EXISTS custom_commands (
     name TEXT PRIMARY KEY, reply TEXT, by_jid TEXT, created_at INTEGER
   )`,
  `CREATE TABLE IF NOT EXISTS faq (
     keyword TEXT PRIMARY KEY, answer TEXT, by_jid TEXT, created_at INTEGER
   )`,
  `CREATE TABLE IF NOT EXISTS scheduled_messages (
     id INTEGER PRIMARY KEY AUTOINCREMENT, chat_jid TEXT, text TEXT,
     send_at INTEGER, created_by TEXT, done INTEGER DEFAULT 0, done_at INTEGER
   )`,
  `CREATE TABLE IF NOT EXISTS nightmode (
     group_jid TEXT PRIMARY KEY, enabled INTEGER DEFAULT 0,
     start_hhmm TEXT DEFAULT '22:00', end_hhmm TEXT DEFAULT '07:00', is_closed INTEGER DEFAULT 0
   )`,
  `CREATE TABLE IF NOT EXISTS antiraid (
     group_jid TEXT PRIMARY KEY, enabled INTEGER DEFAULT 0, locked_until INTEGER DEFAULT 0
   )`,

  // System
  `CREATE TABLE IF NOT EXISTS command_toggles (name TEXT PRIMARY KEY, enabled INTEGER DEFAULT 1)`,
  `CREATE TABLE IF NOT EXISTS rate_limits (
     key TEXT PRIMARY KEY, count INTEGER, window_start INTEGER
   )`,
  `CREATE TABLE IF NOT EXISTS error_log (
     id INTEGER PRIMARY KEY AUTOINCREMENT, level TEXT, message TEXT, context TEXT, created_at INTEGER
   )`,
  `CREATE TABLE IF NOT EXISTS error_counts (
     signature TEXT PRIMARY KEY, count INTEGER DEFAULT 0, last_at INTEGER
   )`,
  `CREATE TABLE IF NOT EXISTS ai_usage (
     day TEXT PRIMARY KEY, calls INTEGER DEFAULT 0
   )`,
  `CREATE TABLE IF NOT EXISTS games (
     group_jid TEXT, game TEXT, state TEXT, updated_at INTEGER,
     PRIMARY KEY (group_jid, game)
   )`,
  `CREATE TABLE IF NOT EXISTS game_scores (
     group_jid TEXT, user_jid TEXT, game TEXT, wins INTEGER DEFAULT 0, name TEXT,
     PRIMARY KEY (group_jid, user_jid, game)
   )`,
  `CREATE TABLE IF NOT EXISTS audit_log (
     id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT, group_jid TEXT,
     target TEXT, by_jid TEXT, detail TEXT, created_at INTEGER
   )`,
  `CREATE TABLE IF NOT EXISTS owner_alerts (
     id INTEGER PRIMARY KEY AUTOINCREMENT, message TEXT, created_at INTEGER, delivered INTEGER DEFAULT 0
   )`,
  `CREATE TABLE IF NOT EXISTS daily_stats (
     day TEXT PRIMARY KEY, messages INTEGER DEFAULT 0, commands INTEGER DEFAULT 0, ai_calls INTEGER DEFAULT 0
   )`,

  // Economy (Coins sind global pro Nutzer, nicht pro Gruppe)
  `CREATE TABLE IF NOT EXISTS coins (
     user_jid TEXT PRIMARY KEY, balance INTEGER DEFAULT 0, name TEXT,
     last_daily TEXT DEFAULT '', streak INTEGER DEFAULT 0,
     total_earned INTEGER DEFAULT 0, total_gambled INTEGER DEFAULT 0
   )`,
  `CREATE TABLE IF NOT EXISTS purchases (
     user_jid TEXT, item_id TEXT, created_at INTEGER,
     PRIMARY KEY (user_jid, item_id)
   )`,
  `CREATE TABLE IF NOT EXISTS user_titles (
     user_jid TEXT PRIMARY KEY, title TEXT
   )`,
  // Cooldown für !rauben — pro Gruppe, damit man nicht die ganze Community leerräumt
  `CREATE TABLE IF NOT EXISTS rob_cooldown (
     group_jid TEXT, user_jid TEXT, last_rob INTEGER DEFAULT 0,
     PRIMARY KEY (group_jid, user_jid)
   )`,

  // Umfragen
  `CREATE TABLE IF NOT EXISTS polls (
     id INTEGER PRIMARY KEY AUTOINCREMENT, group_jid TEXT, question TEXT,
     options TEXT, created_by TEXT, created_at INTEGER, open INTEGER DEFAULT 1
   )`,
  `CREATE TABLE IF NOT EXISTS poll_votes (
     poll_id INTEGER, user_jid TEXT, option_idx INTEGER,
     PRIMARY KEY (poll_id, user_jid)
   )`,

  // Geburtstage (pro Nutzer, angekündigt in der Gruppe, in der sie gesetzt wurden)
  `CREATE TABLE IF NOT EXISTS birthdays (
     user_jid TEXT PRIMARY KEY, day INTEGER, month INTEGER, name TEXT,
     group_jid TEXT, last_congratulated TEXT DEFAULT ''
   )`,

  // Nachrichten pro Gruppe und Tag (für Wochenreport & Panel-Statistik)
  `CREATE TABLE IF NOT EXISTS group_daily (
     group_jid TEXT, day TEXT, messages INTEGER DEFAULT 0,
     PRIMARY KEY (group_jid, day)
   )`,

  // "Wer wird Millionär?" — laufender Spielzustand (restart-fest) + Tageslimit
  `CREATE TABLE IF NOT EXISTS millionaire_games (
     chat_jid TEXT PRIMARY KEY, user_jid TEXT, name TEXT, level INTEGER DEFAULT 0,
     used TEXT DEFAULT '[]', q TEXT, used5050 INTEGER DEFAULT 0, usedhint INTEGER DEFAULT 0,
     started_at INTEGER
   )`,
  `CREATE TABLE IF NOT EXISTS millionaire_daily (
     user_jid TEXT PRIMARY KEY, day TEXT
   )`,

  // Shop 2.0: Inventar (Besitz pro Nutzer) + aktive Boost-Effekte
  `CREATE TABLE IF NOT EXISTS inventory (
     user_jid TEXT, item_id TEXT, qty INTEGER DEFAULT 0,
     PRIMARY KEY (user_jid, item_id)
   )`,
  `CREATE TABLE IF NOT EXISTS user_boosts (
     user_jid TEXT, type TEXT, mult REAL DEFAULT 1, expires_at INTEGER DEFAULT 0,
     PRIMARY KEY (user_jid, type)
   )`,

  // Verträge/Quests: angenommene Verträge pro Spieler (done: 0=aktiv,1=erfüllt,2=abgelaufen)
  `CREATE TABLE IF NOT EXISTS player_contracts (
     id INTEGER PRIMARY KEY AUTOINCREMENT, user_jid TEXT, name TEXT, contract_id TEXT,
     baseline INTEGER DEFAULT 0, accepted_at INTEGER, expires_at INTEGER, chat_jid TEXT,
     done INTEGER DEFAULT 0
   )`,

  // Erfolge (einmalig freigeschaltet) + Prestige-Rang
  `CREATE TABLE IF NOT EXISTS user_achievements (
     user_jid TEXT, ach_id TEXT, unlocked_at INTEGER,
     PRIMARY KEY (user_jid, ach_id)
   )`,
  `CREATE TABLE IF NOT EXISTS prestige (
     user_jid TEXT PRIMARY KEY, level INTEGER DEFAULT 0, updated_at INTEGER
   )`,

  // Globales Event (höchstens eine Zeile, id=1) — zeitlich begrenzte Multiplikatoren
  `CREATE TABLE IF NOT EXISTS active_event (
     id INTEGER PRIMARY KEY, event_id TEXT, name TEXT, xp_mult REAL DEFAULT 1,
     coin_mult REAL DEFAULT 1, started_at INTEGER, expires_at INTEGER
   )`,

  // Globale Bot-Einstellungen (System-Schalter, Wartungsmodus)
  `CREATE TABLE IF NOT EXISTS global_settings (
     key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER
   )`,
];

// Spalten, die nach dem ersten Deploy dazukamen — werden per ALTER TABLE nachgezogen,
// weil CREATE TABLE IF NOT EXISTS bestehende Tabellen nicht erweitert.
const MIGRATIONS = [
  ['group_settings', 'slowmode_secs', 'INTEGER DEFAULT 0'],
  ['group_settings', 'welcome_text', "TEXT DEFAULT ''"],
  ['group_settings', 'weekly_report', 'INTEGER DEFAULT 0'],
  // Produktions-DB stammt von vor dem Neuaufbau — warnings existierte schon,
  // CREATE TABLE IF NOT EXISTS hat expires_at darum nie ergänzt (crasht sonst
  // beim Anlegen von idx_warnings_active weiter unten).
  ['warnings', 'expires_at', 'INTEGER DEFAULT 0'],
];

async function migrate(db) {
  const columnCache = new Map(); // table → Set(Spaltennamen)
  for (const [table, column, type] of MIGRATIONS) {
    if (!columnCache.has(table)) {
      const info = await db.execute(`PRAGMA table_info(${table})`);
      columnCache.set(table, new Set(info.rows.map((r) => String(r.name))));
    }
    if (!columnCache.get(table).has(column)) {
      await db.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
      console.log(`🔧 Migration: ${table}.${column} ergänzt.`);
    }
  }
}

// Indizes für die Abfragen, die nicht schon von einem Primary Key abgedeckt sind.
const INDEXES = [
  // activeWarnings läuft bei jeder Verwarnung + !warns/!profil
  `CREATE INDEX IF NOT EXISTS idx_warnings_active ON warnings (group_jid, user_jid, expires_at)`,
  // processDueMessages läuft alle 30s (Scheduler-Tick) über alle Chats hinweg
  `CREATE INDEX IF NOT EXISTS idx_scheduled_due ON scheduled_messages (done, send_at)`,
  // Panel-Statistik: Tages-Range über ALLE Gruppen hinweg (PK beginnt mit group_jid, hilft hier nicht)
  `CREATE INDEX IF NOT EXISTS idx_group_daily_day ON group_daily (day)`,
  // !rank / !leaderboard: Platzierung + Top-10 pro Gruppe
  `CREATE INDEX IF NOT EXISTS idx_xp_group_xp ON xp (group_jid, xp)`,
  // Quest-Fortschritt: SUM(messages)/SUM(wins) pro Nutzer über alle Gruppen
  `CREATE INDEX IF NOT EXISTS idx_xp_user ON xp (user_jid)`,
  `CREATE INDEX IF NOT EXISTS idx_game_scores_user ON game_scores (user_jid)`,
  // Quest-Sweep: aktive Verträge nach Ablauf sortiert
  `CREATE INDEX IF NOT EXISTS idx_contracts_active ON player_contracts (done, expires_at)`,
  // Erfolge-Rangliste: COUNT/GROUP BY pro Nutzer
  `CREATE INDEX IF NOT EXISTS idx_user_ach_user ON user_achievements (user_jid)`,
];

export async function initDb() {
  const db = getDb();
  for (const sql of TABLES) {
    await db.execute(sql);
  }
  await migrate(db);
  // Indizes sind reine Optimierung, nie Voraussetzung fürs Starten — ein einzelner
  // fehlschlagender Index (z. B. weitere Altlast aus der Zeit vor dem Neuaufbau)
  // darf den Bot nie mehr komplett lahmlegen wie eben mit warnings.expires_at.
  let indexesOk = 0;
  for (const sql of INDEXES) {
    try {
      await db.execute(sql);
      indexesOk++;
    } catch (err) {
      console.warn(`⚠️ Index übersprungen (${String(err?.message || err).slice(0, 120)}): ${sql}`);
    }
  }
  console.log(`✅ DB initialisiert (${TABLES.length} Tabellen, ${indexesOk}/${INDEXES.length} Indizes).`);
}

// ── Schutzwall für Baileys-Session-Daten ───────────────────────────
// Diese Tabellen enthalten die WhatsApp-Session (creds + alle Signal-Keys).
// Sie dürfen von KEINEM automatischen Aufräumen/Wipe angefasst werden — ein
// versehentliches Löschen führt zu 401 (Logout) / Bad MAC. Nur der bewusste
// Relink-Mechanismus (auth.js: clearSession) darf sie leeren.
export const PROTECTED_TABLES = new Set(['auth_creds', 'auth_keys']);

/** Zieltabelle eines DELETE-Statements herausziehen (für den Cleanup-Guard). */
export function deleteTargetTable(sql) {
  const m = /delete\s+from\s+["'`]?([a-zA-Z_][\w]*)/i.exec(String(sql || ''));
  return m ? m[1] : null;
}

// ── Komplett-Reset (Danger-Zone im Panel) ──────────────────────────

// Alle Daten-Tabellen — bewusst OHNE auth_creds/auth_keys: die Session wird
// (falls gewünscht) separat über den Relink-Mechanismus gelöscht, der auch
// den Socket sauber neu startet.
const DATA_TABLES = [
  'groups', 'group_settings', 'members',
  'warnings', 'mutes', 'bans', 'blocked_words', 'allowed_chats',
  'xp', 'levels', 'afk', 'custom_commands', 'faq', 'scheduled_messages',
  'nightmode', 'antiraid', 'command_toggles', 'rate_limits',
  'error_log', 'error_counts', 'ai_usage', 'games', 'game_scores',
  'audit_log', 'owner_alerts', 'daily_stats', 'coins', 'purchases',
  'user_titles', 'polls', 'poll_votes', 'birthdays', 'group_daily',
  'millionaire_games', 'millionaire_daily', 'inventory', 'user_boosts', 'player_contracts',
  'user_achievements', 'prestige', 'active_event', 'global_settings',
];

/**
 * Löscht ALLE Bot-Daten (XP, Coins, Einstellungen, Logs, …) — die Tabellen
 * bleiben bestehen, nur die Inhalte werden geleert. Session bleibt erhalten.
 * Gibt die Anzahl geleerter Tabellen zurück.
 */
export async function wipeAllData() {
  const db = getDb();
  // Schutzwall: geschützte Session-Tabellen NIEMALS mitlöschen (Defense-in-Depth,
  // falls versehentlich eine in DATA_TABLES landet).
  const tables = DATA_TABLES.filter((t) => !PROTECTED_TABLES.has(t));
  if (tables.length !== DATA_TABLES.length) {
    console.warn('🛡️ [SECURITY BLOCK] wipeAllData: geschützte Auth-Tabelle aus der Löschliste entfernt.');
  }
  await db.batch(tables.map((t) => ({ sql: `DELETE FROM ${t}`, args: [] })), 'write');
  // RAM-Puffer verwerfen — sonst schreibt der nächste Flush gelöschte Daten zurück
  xpBuffer.clear();
  groupDayBuffer.clear();
  statBuffer.messages = 0;
  statBuffer.commands = 0;
  statBuffer.ai_calls = 0;
  return tables.length;
}

// ── Schreib-Batching (XP + Tages-Counter) ──────────────────────────

const xpBuffer = new Map(); // key "group|user" → { xp, messages, name }
const statBuffer = { messages: 0, commands: 0, ai_calls: 0 };
const groupDayBuffer = new Map(); // "group|day" → Nachrichten-Zähler
let flushTimer = null;
let flushFailStreak = 0;

export function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function bufferXp(groupJid, userJid, xpAmount, name) {
  const key = `${groupJid}|${userJid}`;
  const cur = xpBuffer.get(key) || { xp: 0, messages: 0, name: '' };
  cur.xp += xpAmount;
  cur.messages += 1;
  if (name) cur.name = name;
  xpBuffer.set(key, cur);
}

export function bufferStat(field, amount = 1) {
  if (field in statBuffer) statBuffer[field] += amount;
}

/** Nachrichten-Zähler pro Gruppe/Tag (für Wochenreport & Panel-Charts). */
export function bufferGroupMessage(groupJid) {
  const key = `${groupJid}|${todayKey()}`;
  groupDayBuffer.set(key, (groupDayBuffer.get(key) || 0) + 1);
}

/** Gepufferte Werte gebündelt schreiben. Bei DB-Ausfall: Puffer behalten, später nachschreiben. */
export async function flushBuffers() {
  const db = getDb();
  const stmts = [];

  for (const [key, val] of xpBuffer) {
    const [groupJid, userJid] = key.split('|');
    stmts.push({
      sql: `INSERT INTO xp (group_jid, user_jid, xp, messages, name) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(group_jid, user_jid) DO UPDATE SET
              xp = xp + excluded.xp, messages = messages + excluded.messages,
              name = CASE WHEN excluded.name != '' THEN excluded.name ELSE xp.name END`,
      args: [groupJid, userJid, val.xp, val.messages, val.name || ''],
    });
  }

  for (const [key, count] of groupDayBuffer) {
    const [groupJid, day] = key.split('|');
    stmts.push({
      sql: `INSERT INTO group_daily (group_jid, day, messages) VALUES (?, ?, ?)
            ON CONFLICT(group_jid, day) DO UPDATE SET messages = group_daily.messages + excluded.messages`,
      args: [groupJid, day, count],
    });
  }

  if (statBuffer.messages || statBuffer.commands || statBuffer.ai_calls) {
    stmts.push({
      sql: `INSERT INTO daily_stats (day, messages, commands, ai_calls) VALUES (?, ?, ?, ?)
            ON CONFLICT(day) DO UPDATE SET
              messages = daily_stats.messages + excluded.messages,
              commands = daily_stats.commands + excluded.commands,
              ai_calls = daily_stats.ai_calls + excluded.ai_calls`,
      args: [todayKey(), statBuffer.messages, statBuffer.commands, statBuffer.ai_calls],
    });
  }

  if (!stmts.length) return;

  // Snapshot nehmen und Puffer erst NACH Erfolg leeren (Ausfallschutz)
  try {
    await db.batch(stmts, 'write');
    xpBuffer.clear();
    groupDayBuffer.clear();
    statBuffer.messages = 0;
    statBuffer.commands = 0;
    statBuffer.ai_calls = 0;
    flushFailStreak = 0;
  } catch (err) {
    flushFailStreak++;
    if (flushFailStreak === 1 || flushFailStreak % 30 === 0) {
      console.warn(`⚠️ DB-Flush fehlgeschlagen (${flushFailStreak}×) — Werte bleiben im RAM: ${String(err?.message || err).slice(0, 120)}`);
    }
  }
}

export function startFlushLoop() {
  if (flushTimer) return;
  flushTimer = setInterval(() => flushBuffers().catch(() => {}), config.db.flushIntervalMs);
}

export function stopFlushLoop() {
  if (flushTimer) clearInterval(flushTimer);
  flushTimer = null;
}

// ── Level-Kurve ────────────────────────────────────────────────────
// Level n ist erreicht ab totalXpForLevel(n) XP (quadratisch: 1→100, 2→300, 3→600 …)

export function totalXpForLevel(level) {
  return 50 * level * (level + 1);
}

export function xpToLevel(xp) {
  let level = 0;
  while (totalXpForLevel(level + 1) <= xp) level++;
  return level;
}

/** Fortschritt im aktuellen Level (für !rank): { level, have, need } */
export function levelProgress(xp) {
  const level = xpToLevel(xp);
  const base = totalXpForLevel(level);
  return { level, have: xp - base, need: totalXpForLevel(level + 1) - base };
}
