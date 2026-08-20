// Tests fuer die Kontaktverwaltung: Aufnahme aus Baileys, Namensprioritaet
// und die serverseitige Nutzersuche.
//
// Kernaussage, die hier abgesichert wird: die JID ist die Identitaet. Ein
// Kontakt mit LID UND Telefonnummer ist EINE Person, keine zwei. Und der
// selbst gesetzte WhatsApp-Name (Contact.notify) schlaegt jeden gespeicherten
// Namen — sonst verdeckt ein alter DB-Eintrag, wie die Person heute heisst.

import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
process.env.OWNER_NUMBERS = '491700000000';
process.env.DATABASE_URL = 'file:' + join(root, '.test-contacts.db');
process.env.DATABASE_KEY = 'unused';

const { initDb, getDb } = await import('../src/db.js');
const {
  ingestContacts, ingestParticipants,
  resolveIdentity, resolveIdentities, resetIdentityCache,
} = await import('../src/identity.js');

const G1 = '4915100000001@g.us';
const settled = () => new Promise((r) => setTimeout(r, 150));

before(async () => { await initDb(); });

beforeEach(async () => {
  const db = getDb();
  for (const t of ['contacts', 'members', 'user_profiles', 'xp', 'birthdays']) {
    await db.execute({ sql: `DELETE FROM ${t}`, args: [] });
  }
  resetIdentityCache();
});

// ── Aufnahme aus Baileys ───────────────────────────────────────────

test('ingestContacts uebernimmt notify, name und verifiedName', async () => {
  ingestContacts([
    { id: '491701234567@s.whatsapp.net', notify: 'Max', name: 'Max Mustermann' },
    { id: '491766666666@s.whatsapp.net', verifiedName: 'Bäckerei Meier GmbH' },
  ]);
  await settled();
  const rows = await getDb().execute('SELECT user_jid, push_name, contact_name, verified_name FROM contacts ORDER BY user_jid');
  assert.equal(rows.rows.length, 2);
  const max = rows.rows.find((r) => r.user_jid.startsWith('491701234567'));
  assert.equal(max.push_name, 'Max');
  assert.equal(max.contact_name, 'Max Mustermann');
  const shop = rows.rows.find((r) => r.user_jid.startsWith('491766666666'));
  assert.equal(shop.verified_name, 'Bäckerei Meier GmbH');
});

test('ein Kontakt mit LID und Nummer ist EINE Person, nicht zwei', async () => {
  // Das ist die zentrale Verwechslungsgefahr: WhatsApp liefert fuer denselben
  // Menschen zwei Kennungen. Beide zu speichern wuerde ihn doppeln.
  ingestContacts([{ id: '491701234567@s.whatsapp.net', lid: '55501@lid', notify: 'Max' }]);
  await settled();
  const rows = await getDb().execute('SELECT user_jid, user_lid FROM contacts');
  assert.equal(rows.rows.length, 1, 'genau ein Datensatz');
  assert.equal(rows.rows[0].user_jid, '491701234567@s.whatsapp.net', 'die Nummer ist die Identitaet');
  assert.equal(rows.rows[0].user_lid, '55501@lid', 'die LID haengt daran');
});

test('eine reine LID ohne bekannte Nummer erzeugt keine Geisterperson', async () => {
  ingestContacts([{ id: '99999@lid', notify: 'Ohne Nummer' }]);
  await settled();
  const rows = await getDb().execute('SELECT COUNT(*) AS c FROM contacts');
  assert.equal(Number(rows.rows[0].c), 0);
});

test('contacts.update ohne Namen loescht keinen bekannten Namen', async () => {
  // Baileys liefert bei Updates nur Teilobjekte (Partial<Contact>).
  ingestContacts([{ id: '491701234567@s.whatsapp.net', notify: 'Max', name: 'Max Mustermann' }]);
  await settled();
  ingestContacts([{ id: '491701234567@s.whatsapp.net', imgUrl: 'changed' }]);
  await settled();
  const rows = await getDb().execute("SELECT push_name, contact_name FROM contacts WHERE user_jid = '491701234567@s.whatsapp.net'");
  assert.equal(rows.rows[0].push_name, 'Max');
  assert.equal(rows.rows[0].contact_name, 'Max Mustermann');
});

test('ingestContacts verkraftet Muell ohne zu werfen', async () => {
  assert.doesNotThrow(() => ingestContacts([null, undefined, 'text', 42, {}, { id: '' }]));
  assert.doesNotThrow(() => ingestContacts(null));
  assert.doesNotThrow(() => ingestContacts('kein Array'));
  await settled();
  const rows = await getDb().execute('SELECT COUNT(*) AS c FROM contacts');
  assert.equal(Number(rows.rows[0].c), 0);
});

test('ingestContacts uebernimmt keine Nummer als Namen', async () => {
  ingestContacts([{ id: '491701234567@s.whatsapp.net', notify: '+491701234567', name: 'Unbekannt' }]);
  await settled();
  const rows = await getDb().execute("SELECT push_name, contact_name FROM contacts WHERE user_jid LIKE '491701234567%'");
  // Ohne echten Namen und ohne LID entsteht gar kein Datensatz.
  if (rows.rows.length) {
    assert.equal(rows.rows[0].push_name, null);
    assert.equal(rows.rows[0].contact_name, null);
  }
});

test('ingestParticipants nimmt Namen aus Gruppen-Metadaten mit', async () => {
  // GroupParticipant ist in Baileys ein `Contact & { admin }` — notify/name
  // sind vorhanden und wurden frueher weggeworfen.
  ingestParticipants([
    { id: '491700000001@s.whatsapp.net', notify: 'Jonas', admin: 'admin' },
    { id: '491700000002@s.whatsapp.net', name: 'Aylin Kaya', admin: null },
  ]);
  await settled();
  const rows = await getDb().execute('SELECT user_jid, push_name, contact_name, known_from FROM contacts ORDER BY user_jid');
  assert.equal(rows.rows.length, 2);
  assert.equal(rows.rows[0].push_name, 'Jonas');
  assert.equal(rows.rows[0].known_from, 'group');
  assert.equal(rows.rows[1].contact_name, 'Aylin Kaya');
});

// ── Prioritaet und Herkunft ────────────────────────────────────────

test('der selbst gesetzte WhatsApp-Name schlaegt jeden gespeicherten Namen', async () => {
  const jid = '491701234567@s.whatsapp.net';
  const db = getDb();
  await db.execute({
    sql: 'INSERT OR REPLACE INTO user_profiles (user_jid, name, updated_at) VALUES (?, ?, ?)',
    args: [jid, 'Alter DB-Name', Date.now()],
  });
  await db.execute({
    sql: 'INSERT OR REPLACE INTO members (group_jid, user_jid, push_name, last_active) VALUES (?, ?, ?, ?)',
    args: [G1, jid, 'Name aus der Gruppe', Date.now()],
  });
  ingestContacts([{ id: jid, notify: 'So heisse ich heute', name: 'Adressbuch' }]);
  await settled();
  resetIdentityCache();

  const id = await resolveIdentity(jid, { groupJid: G1 });
  assert.equal(id.name, 'So heisse ich heute');
  assert.equal(id.nameSource, 'pushName');
  assert.equal(id.displayName, '+49 170 1234567 (So heisse ich heute)');
});

test('ohne pushName gewinnt der Adressbuchname, dann das verifizierte Konto', async () => {
  const a = '491700000011@s.whatsapp.net';
  const b = '491700000012@s.whatsapp.net';
  ingestContacts([
    { id: a, name: 'Aus dem Adressbuch' },
    { id: b, verifiedName: 'Firma GmbH' },
  ]);
  await settled();
  resetIdentityCache();
  assert.equal((await resolveIdentity(a)).nameSource, 'contact');
  assert.equal((await resolveIdentity(b)).nameSource, 'verified');
});

test('ohne jeden Namen bleibt nur die Nummer und nameSource=fallback', async () => {
  const id = await resolveIdentity('491700000099@s.whatsapp.net');
  assert.equal(id.name, null);
  assert.equal(id.nameSource, 'fallback');
  assert.equal(id.displayName, '+49 170 0000099');
  assert.ok(!id.displayName.includes('('), 'keine leeren Klammern');
});

test('die Person ist auch ueber ihre LID auffindbar', async () => {
  ingestContacts([{ id: '491701234567@s.whatsapp.net', lid: '55501@lid', notify: 'Max' }]);
  await settled();
  resetIdentityCache();
  const viaLid = await resolveIdentity('55501@lid');
  assert.equal(viaLid.name, 'Max', 'LID findet dieselbe Person');
  // Die uebergebene Kennung bleibt als Identitaet erhalten.
  assert.equal(viaLid.jid, '55501@lid');
});

test('resolveIdentities loest eine ganze Seite in einem Durchgang auf', async () => {
  const jids = Array.from({ length: 30 }, (_, i) => `4917000002${String(i).padStart(2, '0')}@s.whatsapp.net`);
  ingestContacts(jids.map((j, i) => ({ id: j, notify: 'Person ' + i })));
  await settled();
  resetIdentityCache();
  const map = await resolveIdentities(jids);
  assert.equal(map.size, 30);
  assert.equal(map.get(jids[7]).name, 'Person 7');
  for (const j of jids) assert.equal(map.get(j).jid, j, 'JID bleibt unveraendert');
});

// ── Suche (ueber die HTTP-Schicht des Panels) ──────────────────────

async function search(params = {}) {
  const { createDashboard } = await import('../src/dashboard.js');
  const app = createDashboard();
  const qs = new URLSearchParams(params).toString();
  // Ohne Sitzung muss der Endpunkt abweisen — genau das pruefen wir mit.
  return new Promise((resolve) => {
    const server = app.listen(0, async () => {
      const port = server.address().port;
      const base = `http://127.0.0.1:${port}/api/users?${qs}`;
      const anon = await fetch(base);
      const login = await fetch(`http://127.0.0.1:${port}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: process.env.ACCESS_SECRET }),
      });
      const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
      const res = await fetch(base, { headers: { Cookie: cookie } });
      const body = await res.json().catch(() => ({}));
      server.close();
      resolve({ anonStatus: anon.status, status: res.status, body });
    });
  });
}

test('die Suche weist ohne Sitzung ab', async () => {
  process.env.ACCESS_SECRET = 'test-secret';
  const r = await search({ q: 'Max' });
  assert.equal(r.anonStatus, 401);
});

test('Name, Nummer und JID finden dieselbe Person', async () => {
  process.env.ACCESS_SECRET = 'test-secret';
  ingestContacts([{ id: '491701234567@s.whatsapp.net', notify: 'Max', name: 'Max Mustermann' }]);
  await settled();
  resetIdentityCache();

  for (const q of ['Max', 'Mustermann', '1701234', '491701234567', '491701234567@s.whatsapp.net']) {
    const r = await search({ q, filter: 'all' });
    assert.equal(r.status, 200, q);
    assert.equal(r.body.users.length, 1, `Treffer fuer: ${q}`);
    assert.equal(r.body.users[0].jid, '491701234567@s.whatsapp.net', `richtige Person fuer: ${q}`);
  }
});

test('die Antwort traegt ein vollstaendiges pagination-Objekt', async () => {
  process.env.ACCESS_SECRET = 'test-secret';
  ingestContacts(Array.from({ length: 7 }, (_, i) => ({
    id: `4917000003${String(i).padStart(2, '0')}@s.whatsapp.net`, notify: 'Test ' + i,
  })));
  await settled();
  const r = await search({ filter: 'all', limit: '3', page: '2' });
  assert.deepEqual(Object.keys(r.body.pagination).sort(), ['limit', 'page', 'pages', 'total']);
  assert.equal(r.body.pagination.total, 7);
  assert.equal(r.body.pagination.pages, 3);
  assert.equal(r.body.pagination.page, 2);
  assert.equal(r.body.users.length, 3);
});

test('limit wird gedeckelt und eine zu hohe Seite geklemmt', async () => {
  process.env.ACCESS_SECRET = 'test-secret';
  ingestContacts([{ id: '491700000021@s.whatsapp.net', notify: 'Eine Person' }]);
  await settled();
  const big = await search({ filter: 'all', limit: '99999' });
  assert.equal(big.body.pagination.limit, 100, 'limit gedeckelt');
  const far = await search({ filter: 'all', page: '9999' });
  assert.equal(far.body.pagination.page, far.body.pagination.pages, 'Seite geklemmt');
});

test('eine zu kurze Suche wird abgewiesen', async () => {
  process.env.ACCESS_SECRET = 'test-secret';
  const r = await search({ q: 'x' });
  assert.equal(r.status, 400);
});

test('SQL-artige und LIKE-Sonderzeichen liefern keine Treffer statt aller', async () => {
  process.env.ACCESS_SECRET = 'test-secret';
  ingestContacts([{ id: '491700000031@s.whatsapp.net', notify: 'Harmlos' }]);
  await settled();
  for (const q of ["' OR 1=1--", "'; DROP TABLE contacts;--", '%%%', '__', "' UNION SELECT id FROM auth_creds--"]) {
    const r = await search({ q, filter: 'all' });
    assert.equal(r.status, 200, q);
    assert.equal(r.body.users.length, 0, `darf nichts liefern: ${q}`);
  }
  // Die Tabelle steht noch.
  const rows = await getDb().execute('SELECT COUNT(*) AS c FROM contacts');
  assert.equal(Number(rows.rows[0].c), 1);
});

test('ein manipulierter Sortierschluessel faellt auf den Standard zurueck', async () => {
  process.env.ACCESS_SECRET = 'test-secret';
  ingestContacts([{ id: '491700000041@s.whatsapp.net', notify: 'Person' }]);
  await settled();
  const r = await search({ filter: 'all', sort: '; DROP TABLE contacts--', dir: 'evil' });
  assert.equal(r.status, 200);
  assert.equal(r.body.users.length, 1);
});

test('ein sehr langer Suchtext kippt die Suche nicht', async () => {
  process.env.ACCESS_SECRET = 'test-secret';
  const r = await search({ q: 'a'.repeat(10_000), filter: 'all' });
  assert.equal(r.status, 200);
  assert.equal(r.body.users.length, 0);
});

test('HTML und Unicode im Suchtext werden als Text behandelt', async () => {
  process.env.ACCESS_SECRET = 'test-secret';
  ingestContacts([{ id: '491700000051@s.whatsapp.net', notify: '<img src=x onerror=alert(1)>Böse' }]);
  await settled();
  resetIdentityCache();
  const r = await search({ q: 'Böse', filter: 'all' });
  assert.equal(r.body.users.length, 1);
  // Der Server liefert den Namen unveraendert; die Oberflaeche erzeugt daraus
  // einen Text-Node (h()), niemals Markup.
  assert.match(r.body.users[0].user.name, /<img/);
});

test('ohne Treffer kommt eine leere, aber wohlgeformte Antwort', async () => {
  process.env.ACCESS_SECRET = 'test-secret';
  const r = await search({ q: 'gibtesnicht', filter: 'all' });
  assert.deepEqual(r.body.users, []);
  assert.equal(r.body.pagination.total, 0);
  assert.equal(r.body.pagination.pages, 1);
});

test('der Filter trennt Gruppenmitglieder von reinen Adressbuchkontakten', async () => {
  process.env.ACCESS_SECRET = 'test-secret';
  const inGroup = '491700000061@s.whatsapp.net';
  const bookOnly = '491700000062@s.whatsapp.net';
  ingestContacts([{ id: inGroup, notify: 'In Gruppe' }, { id: bookOnly, notify: 'Nur Adressbuch' }]);
  await getDb().execute({
    sql: 'INSERT OR REPLACE INTO members (group_jid, user_jid, last_seen) VALUES (?, ?, ?)',
    args: [G1, inGroup, Date.now()],
  });
  await settled();
  const groups = await search({ filter: 'groups' });
  const all = await search({ filter: 'all' });
  assert.equal(groups.body.users.length, 1);
  assert.equal(groups.body.users[0].jid, inGroup);
  assert.equal(all.body.users.length, 2);
});

// ── Gruppenmitgliedschaft aus den Metadaten ────────────────────────
//
// Diese vier Tests decken zwei Fehler ab, die im Audit belegt wurden — nicht
// vermutet, sondern mit einer Sonde gegen den damaligen Stand gemessen:
//
// 1. `members` bekam nur dann eine Zeile, wenn ein Teilnehmer LID *und*
//    Nummer trug. In einer PN-adressierten Gruppe hat niemand eine LID —
//    dort blieb die Tabelle leer, und der Panel-Filter "In Gruppen" zeigte
//    entsprechend zu wenige Personen an.
// 2. `pickPn()` sah `phoneNumber` nicht an. Genau der Teilnehmer, dessen `id`
//    eine LID ist, verlor damit seinen Namen — obwohl die Nummer danebenstand.

const { state } = await import('../src/state.js');
const perms = await import('../src/permissions.js');
const { dbRows } = await import('../src/db.js');

// Jeder Test bekommt eine eigene Gruppe: der Namens-Ingest ist bewusst auf
// 10 Minuten je Gruppe gedrosselt, sonst wuerde jeder Metadaten-Durchlauf die
// ganze Teilnehmerliste erneut schreiben. Zwei Tests auf derselben Gruppe
// wuerden sich daran gegenseitig blockieren.
let gcount = 0;
function newGroup() { return `49151000000${20 + gcount++}@g.us`; }
function withParticipants(gjid, participants, addressingMode = 'pn') {
  state.sock = {
    groupMetadata: async () => ({ id: gjid, subject: 'Metadatengruppe', addressingMode, participants }),
  };
}

test('Teilnehmer ohne LID landen trotzdem in members', async () => {
  const g = newGroup();
  withParticipants(g, [
    { id: '491700000010@s.whatsapp.net', admin: null },
    { id: '491700000011@s.whatsapp.net', admin: 'admin' },
  ]);
  await perms.getGroupMeta(g, true);
  await settled();
  const rows = await dbRows('SELECT user_jid FROM members WHERE group_jid = ?', [g]);
  assert.equal(rows.length, 2);
});

test('LID-Teilnehmer mit phoneNumber wird unter der Nummer gefuehrt', async () => {
  const g = newGroup();
  withParticipants(g, [
    { id: '55555@lid', phoneNumber: '491700000012@s.whatsapp.net', notify: 'Cem' },
  ], 'lid');
  await perms.getGroupMeta(g, true);
  await settled();
  const rows = await dbRows('SELECT user_jid, user_lid FROM members WHERE group_jid = ?', [g]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].user_jid, '491700000012@s.whatsapp.net');
  assert.equal(rows[0].user_lid, '55555@lid');
  // Und der Name der Person ist nicht verloren gegangen.
  resetIdentityCache();
  const id = await resolveIdentity('491700000012@s.whatsapp.net');
  assert.equal(id.name, 'Cem');
  assert.equal(id.displayName, '+49 170 0000012 (Cem)');
});

test('eine bekannte LID wird von einem spaeteren Abruf ohne LID nicht geloescht', async () => {
  const g = newGroup();
  withParticipants(g, [
    { id: '55556@lid', phoneNumber: '491700000013@s.whatsapp.net' },
  ], 'lid');
  await perms.getGroupMeta(g, true);
  await settled();
  // Zweiter Abruf, diesmal PN-adressiert: dieselbe Person, aber ohne LID.
  withParticipants(g, [{ id: '491700000013@s.whatsapp.net' }]);
  await perms.getGroupMeta(g, true);
  await settled();
  const rows = await dbRows('SELECT user_lid FROM members WHERE group_jid = ? AND user_jid = ?',
    [g, '491700000013@s.whatsapp.net']);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].user_lid, '55556@lid');
});

test('dbBatch weist Schreibzugriffe auf die Auth-Tabellen ab', async () => {
  const { dbBatch } = await import('../src/db.js');
  await assert.rejects(
    () => dbBatch([{ sql: 'DELETE FROM auth_keys WHERE id = ?', args: ['x'] }]),
    /auth/i
  );
  // Und ein harmloser Stapel geht weiterhin durch.
  const res = await dbBatch([{ sql: 'SELECT 1 AS a', args: [] }]);
  assert.ok(Array.isArray(res));
});

test('eine vollstaendig eingegebene Nummer steht vorn, auch gegen die Sortierung', async () => {
  process.env.ACCESS_SECRET = 'test-secret';
  const db = getDb();
  // Zwei Personen, deren Nummern ineinander enthalten sind. Die laengere hat
  // mehr XP und stuende bei Sortierung "XP absteigend" sonst vorn.
  ingestContacts([
    { id: '491700000009@s.whatsapp.net', notify: 'Exakt' },
    { id: '4917000000099@s.whatsapp.net', notify: 'Laenger' },
  ]);
  await settled();
  await db.execute({
    sql: 'INSERT INTO xp (user_jid, group_jid, xp, messages) VALUES (?, ?, ?, ?)',
    args: ['4917000000099@s.whatsapp.net', G1, 9999, 10],
  });

  const r = await search({ q: '491700000009', filter: 'all', sort: 'xp', dir: 'desc', limit: '5' });
  assert.equal(r.status, 200);
  assert.equal(r.body.pagination.total, 2);
  assert.equal(r.body.users[0].jid, '491700000009@s.whatsapp.net');
  assert.equal(r.body.users[1].jid, '4917000000099@s.whatsapp.net');
});
