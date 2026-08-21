// Gemeinsame Abfrage-Schicht fuer Panel und Control API.
//
// Diese Funktionen lagen bis Phase 2 privat in dashboard.js. Sie sind hierher
// gezogen, damit /api/v1 dieselbe Logik benutzt statt einer zweiten, langsam
// auseinanderlaufenden Kopie — insbesondere die Nutzersuche, deren Filter,
// Sortierung und Escaping sicherheitsrelevant sind.
//
// Der Code ist unveraendert uebernommen. Wer hier etwas aendert, aendert es
// fuer beide Oberflaechen.

import { BOT_NAME } from '../config.js';
import { state } from '../state.js';
import { dbRows, dbBatch, xpToLevel } from '../db.js';
import { getAiQuota } from '../ai.js';
import { getGlobalFlag } from '../global.js';
import { botIsAdminInMeta } from '../permissions.js';
import { resolveIdentities } from '../identity.js';
import { queueLength } from '../queue.js';

// LIKE-Sonderzeichen entschaerfen: ohne das waere ein eingetipptes '%' eine
// Wildcard und '_' ein Platzhalter — die Suche wuerde alles zurueckgeben.
function likeTerm(q) {
  return `%${String(q).replace(/[\\%_]/g, (c) => '\\' + c)}%`;
}

/** Kandidaten-JIDs: Vereinigung aller Tabellen, in denen Personen vorkommen. */
const PERSON_TABLES = ['contacts', 'members', 'xp', 'warnings', 'mutes', 'bans', 'birthdays', 'user_profiles'];

// Sortierschluessel sind fest verdrahtet — aus einer Nutzereingabe darf
// niemals SQL werden.
const SORTS = {
  name: 'ORDER BY sort_name IS NULL, LOWER(sort_name) COLLATE NOCASE',
  activity: 'ORDER BY last_active IS NULL, last_active',
  xp: 'ORDER BY xp',
  warnings: 'ORDER BY warnings',
};

/**
 * Sucht und blaettert Personen.
 *
 * Der Kandidatenkreis ist die Vereinigung aller Personen-Tabellen: wer nur
 * eine Verwarnung hat, ist genauso auffindbar wie ein Gruppenmitglied oder ein
 * reiner Adressbuchkontakt.
 *
 * Alle Werte sind gebundene ?-Parameter, Tabellen- und Spaltennamen stammen
 * ausschliesslich aus den Konstanten oben.
 */
export async function searchUsers({ q = '', page = 1, limit = 25, sort = 'name', dir = 'asc', filter = 'groups' } = {}) {
  const digits = String(q).replace(/[^0-9]/g, '');
  const like = likeTerm(q);
  const hasQuery = String(q).trim().length >= 2;

  // ── Kandidaten einsammeln ──
  const clauses = [];
  const args = [];
  if (hasQuery) {
    for (const [table, cols] of [
      ['contacts', ['push_name', 'contact_name', 'verified_name']],
      ['members', ['push_name']],
      ['user_profiles', ['name']],
      ['xp', ['name']],
      ['birthdays', ['name']],
    ]) {
      for (const col of cols) {
        clauses.push(`SELECT DISTINCT user_jid FROM ${table} WHERE ${col} LIKE ? ESCAPE '\\'`);
        args.push(like);
      }
    }
    // Nummern-/JID-Suche erst ab 3 Ziffern — "49" traefe sonst halb Deutschland.
    if (digits.length >= 3) {
      for (const table of PERSON_TABLES) {
        clauses.push(`SELECT DISTINCT user_jid FROM ${table} WHERE user_jid LIKE ? ESCAPE '\\'`);
        args.push(`%${digits}%`);
      }
      // Auch ueber die LID auffindbar, damit dieselbe Person nicht zweimal
      // existiert.
      clauses.push(`SELECT DISTINCT user_jid FROM contacts WHERE user_lid LIKE ? ESCAPE '\\'`);
      args.push(`%${digits}%`);
      clauses.push(`SELECT DISTINCT user_jid FROM members WHERE user_lid LIKE ? ESCAPE '\\'`);
      args.push(`%${digits}%`);
    }
  } else {
    for (const table of PERSON_TABLES) clauses.push(`SELECT DISTINCT user_jid FROM ${table}`);
  }

  const now = Date.now();
  // Anreicherung passiert in SQL, damit Sortierung und Filter ueber ALLE
  // Treffer gelten — nicht nur ueber die gerade sichtbare Seite.
  const base = `
    WITH cand(user_jid) AS (${clauses.join(' UNION ')}),
    enriched AS (
      SELECT c.user_jid AS user_jid,
        COALESCE(
          (SELECT push_name     FROM contacts WHERE user_jid = c.user_jid),
          (SELECT contact_name  FROM contacts WHERE user_jid = c.user_jid),
          (SELECT verified_name FROM contacts WHERE user_jid = c.user_jid),
          (SELECT push_name FROM members WHERE user_jid = c.user_jid AND push_name IS NOT NULL LIMIT 1),
          (SELECT name FROM user_profiles WHERE user_jid = c.user_jid)
        ) AS sort_name,
        (SELECT COUNT(*) FROM members WHERE user_jid = c.user_jid) AS group_count,
        (SELECT MAX(COALESCE(last_active, 0)) FROM members WHERE user_jid = c.user_jid) AS last_active,
        (SELECT COALESCE(SUM(xp), 0) FROM xp WHERE user_jid = c.user_jid) AS xp,
        (SELECT COUNT(*) FROM warnings WHERE user_jid = c.user_jid AND expires_at > ?) AS warnings,
        (SELECT COUNT(*) FROM mutes WHERE user_jid = c.user_jid AND until > ?) AS muted
      FROM cand c
    )
    SELECT * FROM enriched`;
  const enrichArgs = [...args, now, now];

  const where =
    filter === 'groups' ? ' WHERE group_count > 0'
    : filter === 'warned' ? ' WHERE warnings > 0'
    : filter === 'muted' ? ' WHERE muted > 0'
    : '';

  const totalRow = await dbRows(`SELECT COUNT(*) AS c FROM (${base}${where})`, enrichArgs);
  const total = totalRow.length ? Number(totalRow[0].c) : 0;
  const pages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(Math.max(1, page), pages);
  const offset = (safePage - 1) * limit;

  // Wer eine vollstaendige Nummer oder JID einfuegt, meint genau diese Person.
  // Ohne Vorrang landete der exakte Treffer irgendwo zwischen den
  // Teilzeichenketten-Treffern — bei "491700000002" auch hinter "4917000000020".
  const exactJid = digits.length >= 7 ? `${digits}@s.whatsapp.net` : null;
  const order = (SORTS[sort] || SORTS.name) + (dir === 'desc' ? ' DESC' : ' ASC');
  const orderSql = exactJid
    ? order.replace('ORDER BY ', 'ORDER BY CASE WHEN user_jid = ? THEN 0 ELSE 1 END, ')
    : order;
  const orderArgs = exactJid ? [exactJid] : [];
  const rows = await dbRows(`${base}${where} ${orderSql}, user_jid LIMIT ? OFFSET ?`, [...enrichArgs, ...orderArgs, limit, offset]);

  const jids = rows.map((r) => String(r.user_jid));
  const pagination = { page: safePage, limit, total, pages };
  if (!jids.length) return { users: [], pagination };

  // Anzeige-Namen und Gruppenzugehoerigkeit in je EINEM Durchgang — keine
  // Abfrage pro Person, und keine Baileys-Aufrufe.
  const ph = jids.map(() => '?').join(',');
  const [ids, groupRows] = await Promise.all([
    resolveIdentities(jids),
    dbRows(
      `SELECT m.user_jid, m.group_jid, g.name AS group_name
       FROM members m LEFT JOIN groups g ON g.jid = m.group_jid
       WHERE m.user_jid IN (${ph})`,
      jids
    ),
  ]);
  const groupMap = new Map();
  for (const r of groupRows || []) {
    const key = String(r.user_jid);
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key).push({ jid: r.group_jid, name: r.group_name });
  }

  const users = rows.map((r) => {
    const jid = String(r.user_jid);
    return {
      // Die technische Identitaet — jede Aktion laeuft weiterhin hierueber.
      jid,
      user: ids.get(jid) || null,
      groups: groupMap.get(jid) || [],
      xp: Number(r.xp) || 0,
      warnings: Number(r.warnings) || 0,
      muted: Number(r.muted) > 0,
      lastActive: Number(r.last_active) || null,
      // Woher wir die Person kennen — trennt Gruppenmitglieder von reinen
      // Adressbuchkontakten.
      inGroups: Number(r.group_count) > 0,
    };
  });
  return { users, pagination };
}

/** Detailansicht einer Person. Nur Daten, die das Projekt wirklich hat. */
export async function userDetail(jid) {
  const now = Date.now();
  const [ids, groups, xpRows, warns, mutes, bans, contact] = await Promise.all([
    resolveIdentities([jid]),
    dbRows(
      `SELECT m.group_jid, g.name AS group_name, m.last_active, m.last_seen
       FROM members m LEFT JOIN groups g ON g.jid = m.group_jid WHERE m.user_jid = ?`,
      [jid]
    ),
    dbRows('SELECT group_jid, xp, messages FROM xp WHERE user_jid = ?', [jid]),
    dbRows('SELECT group_jid, reason, created_at, expires_at FROM warnings WHERE user_jid = ? AND expires_at > ? ORDER BY created_at DESC LIMIT 20', [jid, now]),
    dbRows('SELECT group_jid, until, reason FROM mutes WHERE user_jid = ? AND until > ?', [jid, now]),
    dbRows('SELECT group_jid, reason, created_at FROM bans WHERE user_jid = ?', [jid]),
    dbRows('SELECT user_lid, push_name, contact_name, verified_name, known_from, first_seen FROM contacts WHERE user_jid = ?', [jid]),
  ]);

  const totalXp = xpRows.reduce((a, r) => a + (Number(r.xp) || 0), 0);
  return {
    jid,
    user: ids.get(String(jid)) || null,
    lid: contact.length ? contact[0].user_lid : null,
    knownFrom: contact.length ? contact[0].known_from : null,
    firstSeen: contact.length ? Number(contact[0].first_seen) || null : null,
    names: contact.length
      ? { pushName: contact[0].push_name, contactName: contact[0].contact_name, verifiedName: contact[0].verified_name }
      : { pushName: null, contactName: null, verifiedName: null },
    groups: groups.map((g) => ({
      jid: g.group_jid, name: g.group_name,
      lastActive: Number(g.last_active) || null,
      xp: Number((xpRows.find((x) => x.group_jid === g.group_jid) || {}).xp) || 0,
    })),
    xp: totalXp,
    level: xpToLevel(totalXp),
    messages: xpRows.reduce((a, r) => a + (Number(r.messages) || 0), 0),
    lastActive: groups.reduce((max, g) => Math.max(max, Number(g.last_active) || 0), 0) || null,
    warnings: warns,
    mutes: mutes.map((m) => ({ ...m, until: Number(m.until) })),
    bans,
  };
}

const groupCache = { at: 0, list: [] };

// refreshGroupCache() stand hier und wurde von nichts aufgerufen. Wer den
// Gruppen-Cache verwerfen will, setzt `groupCache.at = 0` — genau das machen
// die Einstellungs-Route und der Wipe bereits an Ort und Stelle.

export async function listGroups() {
  if (Date.now() - groupCache.at < 60_000) return groupCache.list;
  if (!state.sock || state.connection !== 'open') return groupCache.list;
  const all = await state.sock.groupFetchAllParticipating();
  const metas = Object.values(all);
  const [settings, night, raid] = await Promise.all([
    dbRows('SELECT * FROM group_settings', []),
    dbRows('SELECT * FROM nightmode', []),
    dbRows('SELECT * FROM antiraid', []),
  ]);
  const sMap = new Map(settings.map((r) => [r.jid, r]));
  const nMap = new Map(night.map((r) => [r.group_jid, r]));
  const rMap = new Map(raid.map((r) => [r.group_jid, r]));

  const list = [];
  const upserts = [];
  for (const meta of metas) {
    const admin = botIsAdminInMeta(meta);
    const s = sMap.get(meta.id) || {};
    const n = nMap.get(meta.id) || {};
    const r = rMap.get(meta.id) || {};
    list.push({
      jid: meta.id,
      name: meta.subject || 'Ohne Namen',
      members: meta.participants?.length || 0,
      botAdmin: admin,
      enabled: s.enabled === undefined ? true : Number(s.enabled) === 1,
      antilink: Number(s.antilink) === 1,
      antispam: Number(s.antispam) === 1,
      welcome: Number(s.welcome) === 1,
      levelup_announce: s.levelup_announce === undefined ? true : Number(s.levelup_announce) === 1,
      antiraid: Number(r.enabled) === 1,
      nightmode: { enabled: Number(n.enabled) === 1, start: n.start_hhmm || '22:00', end: n.end_hhmm || '07:00' },
    });
    upserts.push({
      sql: `INSERT INTO groups (jid, name, member_count, bot_is_admin, updated_at) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(jid) DO UPDATE SET name = excluded.name, member_count = excluded.member_count,
              bot_is_admin = excluded.bot_is_admin, updated_at = excluded.updated_at`,
      args: [meta.id, meta.subject || '', meta.participants?.length || 0, admin ? 1 : 0, Date.now()],
    });
  }
  // dbBatch statt getDb().batch(): nur dieser Weg laeuft durch den Guard, der
  // Schreibzugriffe auf auth_creds/auth_keys blockt.
  if (upserts.length) dbBatch(upserts).catch(() => {});
  list.sort((a, b) => a.name.localeCompare(b.name));
  groupCache.at = Date.now();
  groupCache.list = list;
  return list;
}

export async function statusPayload() {
  const quota = getAiQuota();
  const isDataUrl = typeof state.currentQr === 'string' && state.currentQr.startsWith('data:image/png;base64,');
  return {
    botName: BOT_NAME,
    connection: state.connection,
    stopped: state.stopped,
    stopReason: state.stopReason,
    qrAvailable: isDataUrl,
    startedAt: state.startedAt,
    lastConnectedAt: state.lastConnectedAt,
    uptimeMs: Date.now() - state.startedAt,
    sentToday: state.sentToday,
    commandsToday: state.commandsToday,
    ai: quota,
    queue: queueLength(),
    groups: groupCache.list.length || null,
    activity: state.activity,
    global: {
      xp: getGlobalFlag('system_xp'),
      maintenance: getGlobalFlag('maintenance'),
    },
  };
}

/**
 * Verwirft den Gruppen-Cache. Das Panel und die API rufen das nach jeder
 * Aenderung, die die Gruppenliste betrifft — vorher stand dafuer ein
 * `groupCache.at = 0` mitten im Routen-Code.
 */
export function invalidateGroupCache() {
  groupCache.at = 0;
  groupCache.list = [];
}

/** Wie viele Gruppen zuletzt bekannt waren (ohne neue Abfrage). */
export function cachedGroupCount() {
  return groupCache.list.length;
}
