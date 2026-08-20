// Nutzeridentität: eine einzige Stelle, die aus einer JID eine für Menschen
// lesbare Darstellung macht.
//
// Grundregel, die überall gilt: **die JID bleibt die Identität.** Der Name ist
// ausschließlich Anzeige. Keine Aktion, kein Lookup und kein Vergleich darf
// jemals über den Namen laufen — sonst ordnet man früher oder später die
// falsche Person zu.
//
// Warum es dieses Modul überhaupt braucht: `pushName` kommt nur live an jeder
// Nachricht an und wurde nirgends dauerhaft gespeichert. Die beiden Tabellen
// mit `name`-Spalte taugen allein nicht als Quelle:
//   - `xp.name`            fällt in router.js auf "+491701234567" zurück
//   - `user_profiles.name` fällt in commands/profile.js auf 'Unbekannt' zurück
// Beide Attrappen werden hier konsequent als "kein Name" behandelt.

import { dbRun, dbRows, dbBatch } from './db.js';
import TTLCache from './core/cache/ttlCache.js';

// ── Nummernformatierung ────────────────────────────────────────────

/** Schneidet das JID-Suffix ab und lässt nur Ziffern übrig. */
export function digitsOfJid(jid) {
  return String(jid || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
}

// Deutsche Mobilnummern: 49 + 3-stellige Netzkennzahl + 7–8 Ziffern.
// Nur hier gruppieren wir gezielt; alles andere bekommt eine konservative
// Aufteilung, damit wir keine falsche Struktur behaupten.
function groupGerman(digits) {
  const rest = digits.slice(2);
  if (rest.length < 10 || rest.length > 11) return null;
  return `+49 ${rest.slice(0, 3)} ${rest.slice(3)}`;
}

// Bekannte Ländervorwahlen. Bewusst als Liste statt als Rateregel: eine falsch
// geratene Vorwahl macht die Nummer unlesbar, und "+<alle Ziffern>" ist immer
// noch besser als eine erfundene Struktur.
const COUNTRY_CODES = [
  '1', '7',
  '20', '27', '30', '31', '32', '33', '34', '36', '39', '40', '41', '43', '44',
  '45', '46', '47', '48', '49', '51', '52', '54', '55', '56', '57', '58', '60',
  '61', '62', '63', '64', '65', '66', '81', '82', '84', '86', '90', '91', '92',
  '93', '94', '95', '98',
  '212', '213', '216', '218', '351', '352', '353', '358', '359', '370', '371',
  '372', '380', '381', '385', '386', '387', '420', '421', '852', '886', '971',
  '972', '974', '977',
];

function splitCountryCode(digits) {
  // Längste Übereinstimmung gewinnt, sonst schluckt die '1' alle '1xx'-Fälle.
  let best = null;
  for (const cc of COUNTRY_CODES) {
    if (digits.startsWith(cc) && (!best || cc.length > best.length)) best = cc;
  }
  return best;
}

/**
 * '491701234567@s.whatsapp.net' → '+49 170 1234567'
 *
 * Bei unbekannten oder unplausiblen Nummern wird NICHT geraten: dann kommt die
 * ursprüngliche Ziffernfolge mit führendem Plus zurück. Lieber ungruppiert als
 * falsch gruppiert.
 */
export function formatPhone(jid) {
  const raw = String(jid || '');
  const local = raw.split('@')[0].split(':')[0];
  const digits = digitsOfJid(raw);

  // Suffixe wie @c.us oder @s.whatsapp.net gehören nie in die Oberfläche.
  if (!digits) return local;

  // Eine @lid ist eine interne WhatsApp-Kennung, keine Rufnummer. Sie als
  // "+123" auszugeben wäre eine glatte Falschaussage.
  if (raw.endsWith('@lid')) return `ID ${local}`;

  if (digits.length < 7 || digits.length > 15) return `+${digits}`;

  if (digits.startsWith('49')) {
    const de = groupGerman(digits);
    if (de) return de;
  }

  const cc = splitCountryCode(digits);
  if (!cc) return `+${digits}`;
  const rest = digits.slice(cc.length);
  if (rest.length < 4) return `+${digits}`;
  // Konservativ: Vorwahl abtrennen, den Rest in einen Block. Wir kennen die
  // nationale Struktur nicht und tun auch nicht so.
  return `+${cc} ${rest}`;
}

// ── Namensfilter ───────────────────────────────────────────────────

const PLACEHOLDER_NAMES = new Set(['unbekannt', 'unknown', 'null', 'undefined', '-', '—']);

/**
 * Prüft, ob ein gespeicherter Wert wirklich ein Name ist. Reine Ziffernfolgen
 * (mit oder ohne Plus) sind die Nummern-Attrappe aus router.js; Platzhalter wie
 * 'Unbekannt' stammen aus commands/profile.js. Beides ist kein Name.
 */
export function isRealName(value) {
  const name = String(value ?? '').trim();
  if (!name) return false;
  if (/^\+?[0-9\s()-]+$/.test(name)) return false;
  if (PLACEHOLDER_NAMES.has(name.toLowerCase())) return false;
  return true;
}

// ── Anzeige ────────────────────────────────────────────────────────

/**
 * Baut die Anzeigeform. `name` ist optional — fehlt er, gibt es NUR die
 * Nummer, niemals leere Klammern.
 *
 * `nameSource` sagt, WOHER der Name stammt. Das ist kein Beiwerk: nur so
 * laesst sich spaeter erkennen, ob gerade ein alter DB-Name einen aktuellen
 * WhatsApp-Namen verdeckt.
 *
 * @returns {{id, jid, phone, name, sourceName, nameSource, displayName}}
 */
export function formatUserIdentity(jid, { name = null, nameSource = null } = {}) {
  const id = String(jid || '');
  const phone = formatPhone(id);
  const clean = isRealName(name) ? String(name).trim() : null;
  return {
    id,
    jid: id,
    phone,
    name: clean,
    sourceName: clean,
    nameSource: clean ? nameSource || 'unknown' : 'fallback',
    displayName: clean ? `${phone} (${clean})` : phone,
  };
}

// ── Namensauflösung aus der Datenbank ──────────────────────────────

// Gecacht wird die fertige Namenszuordnung, nicht die Anzeige: die Anzeige ist
// billig, die vier Abfragen sind es nicht.
const nameCache = new TTLCache({ ttlMs: 60_000, maxSize: 5000 });

function cacheKey(jid, groupJid) {
  return `${groupJid || '-'}|${jid}`;
}

/** Verwirft den Namens-Cache — nach einem Wipe oder Import nötig. */
export function resetIdentityCache() {
  nameCache.clear();
}

function placeholders(n) {
  return new Array(n).fill('?').join(',');
}

/**
 * Löst viele JIDs auf EINMAL auf. Das ist der Grund, warum 100 angezeigte
 * Nutzer vier Abfragen kosten und nicht vierhundert.
 *
 * Priorität (staerkste zuletzt geschrieben, damit sie gewinnt):
 *   1. contacts.push_name    — Contact.notify, wie die Person sich selbst nennt
 *   2. contacts.contact_name — Adressbuchname
 *   3. contacts.verified_name — Business-Konto
 *   4. members.push_name der aktuellen Gruppe (Gruppenkontext)
 *   5. members.push_name irgendeiner Gruppe
 *   6. user_profiles.name
 *   7. xp.name der aktuellen Gruppe / birthdays.name
 *   8. kein Name → nur die Nummer
 *
 * Der aktuelle WhatsApp-Name steht bewusst VOR jedem gespeicherten Namen:
 * ein alter DB-Eintrag darf niemals verdecken, wie die Person heute heisst.
 *
 * @param {string[]} jids
 * @param {{groupJid?: string}} opts
 * @returns {Promise<Map<string, ReturnType<typeof formatUserIdentity>>>}
 */
export async function resolveIdentities(jids, { groupJid = null } = {}) {
  const unique = [...new Set((jids || []).filter(Boolean).map(String))];
  const out = new Map();
  if (!unique.length) return out;

  const missing = [];
  for (const jid of unique) {
    const hit = nameCache.get(cacheKey(jid, groupJid));
    if (hit !== undefined) out.set(jid, formatUserIdentity(jid, { name: hit.name, nameSource: hit.src }));
    else missing.push(jid);
  }
  if (!missing.length) return out;

  // Baileys liefert die Nummer je nach Feld und Version unterschiedlich
  // formatiert ("+49 170 1234567", "491701234567", "…@s.whatsapp.net").
  // In der Datenbank steht die normalisierte Form. Ohne diese Umrechnung
  // liefe die Suche bei jeder abweichenden Schreibweise still ins Leere.
  const canonical = new Map();  // Kanonische JID -> urspruengliche Eingabe
  for (const jid of missing) {
    const d = digitsOfJid(jid);
    canonical.set(d && !jid.endsWith('@lid') ? `${d}@s.whatsapp.net` : jid, jid);
  }
  const lookup = [...canonical.keys()];
  const toInput = (dbJid) => canonical.get(String(dbJid)) || String(dbJid);

  const ph = placeholders(lookup.length);
  const [contactRows, inGroup, anyGroup, profiles, xpNames, bdays] = await Promise.all([
    // Die reichste Quelle: Contact.notify/name/verifiedName aus contacts.*.
    // Auch ueber die LID auffindbar, damit eine @lid nicht als zweite Person
    // erscheint.
    dbRows(
      `SELECT user_jid, user_lid, push_name, contact_name, verified_name FROM contacts
       WHERE user_jid IN (${ph}) OR user_lid IN (${ph})`,
      [...lookup, ...lookup]
    ),
    groupJid
      ? dbRows(
          `SELECT user_jid, push_name FROM members
           WHERE group_jid = ? AND user_jid IN (${ph}) AND push_name IS NOT NULL`,
          [groupJid, ...lookup]
        )
      : Promise.resolve([]),
    dbRows(
      `SELECT user_jid, push_name FROM members
       WHERE user_jid IN (${ph}) AND push_name IS NOT NULL
       ORDER BY COALESCE(last_active, 0) ASC`,
      lookup
    ),
    dbRows(`SELECT user_jid, name FROM user_profiles WHERE user_jid IN (${ph})`, lookup),
    groupJid
      ? dbRows(
          `SELECT user_jid, name FROM xp WHERE group_jid = ? AND user_jid IN (${ph})`,
          [groupJid, ...lookup]
        )
      : Promise.resolve([]),
    dbRows(`SELECT user_jid, name FROM birthdays WHERE user_jid IN (${ph})`, lookup),
  ]);

  // Von der schwächsten zur stärksten Quelle schreiben — die stärkere
  // überschreibt am Ende. ORDER BY oben sorgt dafür, dass beim
  // gruppenübergreifenden Treffer der neueste Eintrag zuletzt gewinnt.
  const byJid = new Map();
  const take = (rows, field, src) => {
    for (const r of rows || []) {
      if (!isRealName(r[field])) continue;
      // Zurueck auf die Schreibweise, die der Aufrufer uebergeben hat. Eine
      // per LID gefundene Zeile muss auf die LID-Eingabe zurueckgemappt
      // werden, sonst faellt der Treffer unter den Tisch.
      for (const key of [r.user_jid, r.user_lid]) {
        if (!key) continue;
        const input = toInput(key);
        if (missing.includes(input)) byJid.set(input, { name: String(r[field]).trim(), src });
      }
    }
  };
  take(bdays, 'name', 'stored_profile');
  take(xpNames, 'name', 'stored_profile');
  take(profiles, 'name', 'stored_profile');
  take(anyGroup, 'push_name', 'group_name');
  take(inGroup, 'push_name', 'group_name');
  take(contactRows, 'verified_name', 'verified');
  take(contactRows, 'contact_name', 'contact');
  take(contactRows, 'push_name', 'pushName');

  for (const jid of missing) {
    const hit = byJid.get(jid) || null;
    const name = hit ? hit.name : null;
    nameCache.set(cacheKey(jid, groupJid), { name, src: hit ? hit.src : null });
    out.set(jid, formatUserIdentity(jid, { name, nameSource: hit ? hit.src : null }));
  }
  return out;
}

/** Bequemlichkeit für Einzelfälle. Im Panel immer die Batch-Variante nutzen. */
export async function resolveIdentity(jid, opts) {
  const map = await resolveIdentities([jid], opts);
  return map.get(String(jid)) || formatUserIdentity(jid);
}

// ── Kontakte aus Baileys übernehmen ────────────────────────────────

// Ein Adressbuch kommt direkt nach dem Verbinden auf einen Schlag. Deshalb in
// Blöcken schreiben statt eine Abfrage je Person.
const INGEST_CHUNK = 200;

/**
 * Nimmt `contacts.upsert` / `contacts.update` entgegen.
 *
 * Baileys' `Contact` ist die reichste Namensquelle des Projekts und trägt
 * `lid` UND `jid` am selben Objekt — damit ist es zugleich die verlässlichste
 * LID↔Telefonnummer-Zuordnung.
 *
 * `contacts.update` liefert `Partial<Contact>`: einzelne Felder können fehlen.
 * Deshalb `COALESCE` je Spalte — ein Update ohne Namen darf einen bereits
 * bekannten Namen niemals löschen.
 *
 * Wirft nie und wird nicht awaitet: der Verbindungsaufbau darf daran nicht
 * hängen.
 */
export function ingestContacts(list, knownFrom = 'contacts') {
  const rows = [];
  for (const c of Array.isArray(list) ? list : []) {
    if (!c || typeof c !== 'object') continue;
    // Die PN-JID ist die Identität. Eine reine @lid ohne bekannte Nummer
    // bekommt keinen eigenen Datensatz — sonst entstünde eine zweite
    // "Person" für denselben Menschen.
    const pn = pickPn(c);
    if (!pn) continue;
    const lid = normalizeLid(c.lid || (String(c.id || '').endsWith('@lid') ? c.id : null));
    const push = cleanName(c.notify);
    const contact = cleanName(c.name);
    const verified = cleanName(c.verifiedName);
    if (!lid && !push && !contact && !verified) continue; // nichts Neues
    rows.push({ pn, lid, push, contact, verified });
  }
  if (!rows.length) return;

  const now = Date.now();
  for (let i = 0; i < rows.length; i += INGEST_CHUNK) {
    const chunk = rows.slice(i, i + INGEST_CHUNK).map((r) => ({
      sql: `INSERT INTO contacts (user_jid, user_lid, push_name, contact_name, verified_name, known_from, first_seen, last_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
            ON CONFLICT(user_jid) DO UPDATE SET
              user_lid      = COALESCE(excluded.user_lid, contacts.user_lid),
              push_name     = COALESCE(excluded.push_name, contacts.push_name),
              contact_name  = COALESCE(excluded.contact_name, contacts.contact_name),
              verified_name = COALESCE(excluded.verified_name, contacts.verified_name),
              known_from    = COALESCE(contacts.known_from, excluded.known_from)`,
      args: [r.pn, r.lid, r.push, r.contact, r.verified, knownFrom, now],
    }));
    dbBatch(chunk).catch(() => {});
  }
  // Namen haben sich geändert — der Anzeige-Cache ist damit veraltet.
  nameCache.clear();
}

/** Baileys' Felder auf die kanonische PN-JID bringen. */
function pickPn(c) {
  // `phoneNumber` steht an einem GroupParticipant aus einer LID-adressierten
  // Gruppe: dort ist `id` die LID und die Nummer haengt daneben. Ohne diese
  // Quelle verlor genau diese Person ihren Namen — geprueft, nicht vermutet.
  for (const cand of [c.jid, c.phoneNumber, c.id]) {
    const s = String(cand || '');
    if (!s || s.endsWith('@lid')) continue;
    const d = digitsOfJid(s);
    if (d.length >= 7) return `${d}@s.whatsapp.net`;
  }
  return null;
}

function normalizeLid(v) {
  const s = String(v || '');
  if (!s.endsWith('@lid')) return null;
  return s.split(':')[0].replace(/[^0-9@a-z.]/gi, '') || null;
}

function cleanName(v) {
  return isRealName(v) ? String(v).trim().slice(0, 120) : null;
}

/**
 * Nimmt die Namen aus einer Gruppen-Teilnehmerliste mit.
 *
 * `GroupParticipant` ist in Baileys ein `Contact & { admin }` — die Felder
 * `notify`/`name` sind also da und wurden bisher weggeworfen, obwohl das
 * Panel die Metadaten für die Mitgliederliste ohnehin abruft.
 */
export function ingestParticipants(participants) {
  ingestContacts(participants, 'group');
}

// ── Schreibpfad: pushName und echte Aktivität festhalten ───────────

const TOUCH_INTERVAL_MS = 5 * 60_000;
const MAX_TOUCH_ENTRIES = 20_000;
// key -> { at, name }
const lastTouch = new Map();

/** Nur für Tests: setzt die Drossel zurück. */
export function resetTouchThrottle() {
  lastTouch.clear();
}

/**
 * Hält `push_name` und `last_active` in `members` aktuell.
 *
 * Läuft im heißen Pfad (jede Gruppennachricht), deshalb gedrosselt: pro Person
 * und Gruppe höchstens alle 5 Minuten ein Schreibvorgang — außer der Name hat
 * sich geändert, dann sofort, damit eine Umbenennung nicht minutenlang
 * hinterherhinkt.
 *
 * Wirft nie: ein fehlgeschlagener Namens-Schreibvorgang darf die
 * Nachrichtenverarbeitung nicht stören.
 */
export function touchMember(groupJid, userJid, pushName) {
  if (!groupJid || !userJid || !String(groupJid).endsWith('@g.us')) return;
  const key = `${groupJid}|${userJid}`;
  const name = isRealName(pushName) ? String(pushName).trim().slice(0, 120) : null;
  const now = Date.now();
  const prev = lastTouch.get(key);

  const nameChanged = prev ? prev.name !== name : true;
  if (prev && !nameChanged && now - prev.at < TOUCH_INTERVAL_MS) return;

  if (lastTouch.size > MAX_TOUCH_ENTRIES) lastTouch.delete(lastTouch.keys().next().value);
  lastTouch.set(key, { at: now, name });
  if (nameChanged) nameCache.clear();

  // COALESCE: ein späterer Aufruf ohne Namen darf einen bereits bekannten
  // Namen nicht wieder löschen.
  dbRun(
    `INSERT INTO members (group_jid, user_jid, push_name, last_active, last_seen)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(group_jid, user_jid) DO UPDATE SET
       push_name = COALESCE(excluded.push_name, members.push_name),
       last_active = excluded.last_active`,
    [groupJid, userJid, name, now, now]
  ).catch(() => {});
}
