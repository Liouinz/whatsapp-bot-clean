// Tests fuer die zentrale Nutzeridentitaet.
//
// Der wichtigste Punkt: die JID bleibt die Identitaet, der Name ist reine
// Anzeige. Und die beiden Attrappen aus dem Bestand — die Telefonnummer als
// vermeintlicher Name (router.js) und der Literal 'Unbekannt'
// (commands/profile.js) — duerfen NIE als Name durchgehen.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
process.env.OWNER_NUMBERS = '491700000000';
process.env.DATABASE_URL = 'file:' + join(root, '.test-identity.db');
process.env.DATABASE_KEY = 'unused';

const { initDb, getDb } = await import('../src/db.js');
const {
  formatPhone, isRealName, formatUserIdentity, digitsOfJid,
  resolveIdentities, resolveIdentity, resetIdentityCache,
  touchMember, resetTouchThrottle,
} = await import('../src/identity.js');

const G1 = '4915100000001@g.us';
const G2 = '4915100000002@g.us';

before(async () => {
  await initDb();
  const db = getDb();
  for (const t of ['members', 'user_profiles', 'xp', 'birthdays']) {
    await db.execute({ sql: `DELETE FROM ${t}`, args: [] });
  }
});

// ── Nummernformatierung ────────────────────────────────────────────

test('formatPhone gruppiert deutsche Nummern', () => {
  assert.equal(formatPhone('491701234567@s.whatsapp.net'), '+49 170 1234567');
  assert.equal(formatPhone('4915112345678@c.us'), '+49 151 12345678');
});

test('formatPhone laesst internationale Nummern ungeraten', () => {
  // Die nationale Struktur kennen wir nicht — nur die Vorwahl wird abgetrennt.
  assert.equal(formatPhone('12125550123@s.whatsapp.net'), '+1 2125550123');
  assert.equal(formatPhone('447911123456@s.whatsapp.net'), '+44 7911123456');
  assert.equal(formatPhone('5511987654321@s.whatsapp.net'), '+55 11987654321');
});

test('formatPhone zeigt niemals ein JID-Suffix', () => {
  for (const jid of [
    '491701234567@s.whatsapp.net', '491701234567@c.us', '123456@lid',
    'abc@s.whatsapp.net', '491701234567:12@s.whatsapp.net',
  ]) {
    assert.ok(!formatPhone(jid).includes('@'), `Suffix sichtbar in: ${formatPhone(jid)}`);
  }
});

test('formatPhone behauptet bei einer @lid keine Rufnummer', () => {
  // Eine LID ist eine interne WhatsApp-Kennung. "+123456" waere gelogen.
  const out = formatPhone('123456@lid');
  assert.ok(!out.startsWith('+'), out);
  assert.match(out, /123456/);
});

test('formatPhone verkraftet Muell und Leerwerte', () => {
  assert.equal(formatPhone(null), '');
  assert.equal(formatPhone(''), '');
  assert.equal(formatPhone(undefined), '');
  assert.equal(formatPhone('abc@s.whatsapp.net'), 'abc');
  // Zu kurz/zu lang fuer eine echte Nummer: unveraendert mit Plus, nicht gruppiert.
  assert.equal(formatPhone('12345@s.whatsapp.net'), '+12345');
});

test('digitsOfJid liefert nur Ziffern', () => {
  assert.equal(digitsOfJid('491701234567@s.whatsapp.net'), '491701234567');
  assert.equal(digitsOfJid('49 170 123-4567@c.us'), '491701234567');
  assert.equal(digitsOfJid(null), '');
});

// ── Namensfilter ───────────────────────────────────────────────────

test('isRealName weist die Nummern-Attrappe aus router.js ab', () => {
  // router.js:359 schreibt bei fehlendem pushName "+491701234567" nach xp.name.
  assert.equal(isRealName('+491701234567'), false);
  assert.equal(isRealName('491701234567'), false);
  assert.equal(isRealName('+49 170 1234567'), false);
});

test('isRealName weist Platzhalter ab', () => {
  // commands/profile.js:88 schreibt 'Unbekannt', wenn kein pushName da ist.
  assert.equal(isRealName('Unbekannt'), false);
  assert.equal(isRealName('unbekannt'), false);
  assert.equal(isRealName(''), false);
  assert.equal(isRealName('   '), false);
  assert.equal(isRealName(null), false);
  assert.equal(isRealName(undefined), false);
  assert.equal(isRealName('—'), false);
});

test('isRealName akzeptiert echte Namen', () => {
  assert.equal(isRealName('Max Mustermann'), true);
  assert.equal(isRealName('  Lisa  '), true);
  assert.equal(isRealName('Ünal Öztürk'), true);
  assert.equal(isRealName('Anna-Lena'), true);
});

// ── Anzeige ────────────────────────────────────────────────────────

test('formatUserIdentity setzt Nummer und Name zusammen', () => {
  const id = formatUserIdentity('491701234567@s.whatsapp.net', { name: 'Max Mustermann' });
  assert.equal(id.displayName, '+49 170 1234567 (Max Mustermann)');
  assert.equal(id.phone, '+49 170 1234567');
  assert.equal(id.name, 'Max Mustermann');
});

test('formatUserIdentity erzeugt nie leere Klammern', () => {
  for (const name of [null, undefined, '', '   ', 'Unbekannt', '+491701234567']) {
    const id = formatUserIdentity('491701234567@s.whatsapp.net', { name });
    assert.equal(id.displayName, '+49 170 1234567', `Name war: ${JSON.stringify(name)}`);
    assert.ok(!id.displayName.includes('()'), id.displayName);
    assert.equal(id.name, null);
  }
});

test('formatUserIdentity laesst die JID unveraendert — sie ist die Identitaet', () => {
  const jid = '491701234567@s.whatsapp.net';
  const id = formatUserIdentity(jid, { name: 'Max Mustermann' });
  assert.equal(id.jid, jid);
  assert.equal(id.id, jid);
});

// ── Namensaufloesung aus der Datenbank ─────────────────────────────

test('resolveIdentities beachtet die Prioritaetsreihenfolge', async () => {
  const db = getDb();
  const jid = '491700000009@s.whatsapp.net';
  resetIdentityCache();

  // Schwaechste Quelle zuerst.
  await db.execute({
    sql: 'INSERT OR REPLACE INTO birthdays (user_jid, name, day, month) VALUES (?, ?, 1, 1)',
    args: [jid, 'Name aus Geburtstag'],
  });
  let id = await resolveIdentity(jid);
  assert.equal(id.name, 'Name aus Geburtstag');

  await db.execute({
    sql: 'INSERT OR REPLACE INTO xp (group_jid, user_jid, xp, messages, name) VALUES (?, ?, 1, 1, ?)',
    args: [G1, jid, 'Name aus XP'],
  });
  resetIdentityCache();
  id = await resolveIdentity(jid, { groupJid: G1 });
  assert.equal(id.name, 'Name aus XP', 'xp schlaegt birthdays');

  await db.execute({
    sql: 'INSERT OR REPLACE INTO user_profiles (user_jid, name, updated_at) VALUES (?, ?, ?)',
    args: [jid, 'Name aus Profil', Date.now()],
  });
  resetIdentityCache();
  id = await resolveIdentity(jid, { groupJid: G1 });
  assert.equal(id.name, 'Name aus Profil', 'Profil schlaegt xp');

  await db.execute({
    sql: 'INSERT OR REPLACE INTO members (group_jid, user_jid, push_name, last_active) VALUES (?, ?, ?, ?)',
    args: [G2, jid, 'pushName andere Gruppe', Date.now()],
  });
  resetIdentityCache();
  id = await resolveIdentity(jid, { groupJid: G1 });
  assert.equal(id.name, 'pushName andere Gruppe', 'pushName schlaegt Profil');

  await db.execute({
    sql: 'INSERT OR REPLACE INTO members (group_jid, user_jid, push_name, last_active) VALUES (?, ?, ?, ?)',
    args: [G1, jid, 'pushName diese Gruppe', Date.now()],
  });
  resetIdentityCache();
  id = await resolveIdentity(jid, { groupJid: G1 });
  assert.equal(id.name, 'pushName diese Gruppe', 'Gruppenkontext gewinnt');
});

test('resolveIdentities uebernimmt keine Attrappen als Namen', async () => {
  const db = getDb();
  const decoy = '491700000008@s.whatsapp.net';
  await db.execute({
    sql: 'INSERT OR REPLACE INTO xp (group_jid, user_jid, xp, messages, name) VALUES (?, ?, 1, 1, ?)',
    args: [G1, decoy, '+491700000008'],
  });
  await db.execute({
    sql: 'INSERT OR REPLACE INTO user_profiles (user_jid, name, updated_at) VALUES (?, ?, ?)',
    args: [decoy, 'Unbekannt', Date.now()],
  });
  resetIdentityCache();
  const id = await resolveIdentity(decoy, { groupJid: G1 });
  assert.equal(id.name, null);
  assert.equal(id.displayName, '+49 170 0000008');
});

test('resolveIdentities loest viele JIDs in einem Durchgang auf', async () => {
  resetIdentityCache();
  const jids = Array.from({ length: 40 }, (_, i) => `4917000001${String(i).padStart(3, '0')}@s.whatsapp.net`);
  const map = await resolveIdentities(jids);
  assert.equal(map.size, 40);
  for (const jid of jids) {
    const id = map.get(jid);
    assert.equal(id.jid, jid, 'JID bleibt erhalten');
    assert.ok(!id.displayName.includes('('), 'ohne Quelle nur die Nummer');
  }
});

test('resolveIdentities kommt mit leerer Eingabe klar', async () => {
  assert.equal((await resolveIdentities([])).size, 0);
  assert.equal((await resolveIdentities(null)).size, 0);
  assert.equal((await resolveIdentities([null, undefined, ''])).size, 0);
});

// ── Schreibpfad ────────────────────────────────────────────────────

test('touchMember schreibt pushName und last_active', async () => {
  resetTouchThrottle();
  resetIdentityCache();
  const jid = '491700000007@s.whatsapp.net';
  touchMember(G1, jid, 'Frisch Getippt');
  await new Promise((r) => setTimeout(r, 120));

  const rows = await getDb().execute({
    sql: 'SELECT push_name, last_active FROM members WHERE group_jid = ? AND user_jid = ?',
    args: [G1, jid],
  });
  assert.equal(rows.rows.length, 1);
  assert.equal(rows.rows[0].push_name, 'Frisch Getippt');
  assert.ok(Number(rows.rows[0].last_active) > 0);
});

test('touchMember drosselt, laesst eine Namensaenderung aber sofort durch', async () => {
  resetTouchThrottle();
  const jid = '491700000006@s.whatsapp.net';
  const db = getDb();

  touchMember(G1, jid, 'Erster Name');
  await new Promise((r) => setTimeout(r, 120));

  // Gleicher Name direkt danach: die Drossel greift, es passiert kein
  // Schreibvorgang. Zum Nachweis manipulieren wir die Zeile und pruefen,
  // dass sie unveraendert bleibt.
  await db.execute({
    sql: 'UPDATE members SET push_name = ? WHERE group_jid = ? AND user_jid = ?',
    args: ['MARKIERUNG', G1, jid],
  });
  touchMember(G1, jid, 'Erster Name');
  await new Promise((r) => setTimeout(r, 120));
  let rows = await db.execute({
    sql: 'SELECT push_name FROM members WHERE group_jid = ? AND user_jid = ?',
    args: [G1, jid],
  });
  assert.equal(rows.rows[0].push_name, 'MARKIERUNG', 'Drossel hat den Schreibvorgang verhindert');

  // Geaenderter Name: muss sofort durchschlagen.
  touchMember(G1, jid, 'Zweiter Name');
  await new Promise((r) => setTimeout(r, 120));
  rows = await db.execute({
    sql: 'SELECT push_name FROM members WHERE group_jid = ? AND user_jid = ?',
    args: [G1, jid],
  });
  assert.equal(rows.rows[0].push_name, 'Zweiter Name');
});

test('touchMember speichert keine Attrappe als Namen', async () => {
  resetTouchThrottle();
  const jid = '491700000005@s.whatsapp.net';
  touchMember(G1, jid, '+491700000005');
  await new Promise((r) => setTimeout(r, 120));
  const rows = await getDb().execute({
    sql: 'SELECT push_name FROM members WHERE group_jid = ? AND user_jid = ?',
    args: [G1, jid],
  });
  assert.equal(rows.rows[0].push_name, null);
});

test('touchMember ignoriert Direktnachrichten und Leerwerte', async () => {
  resetTouchThrottle();
  const before = await getDb().execute({ sql: 'SELECT COUNT(*) AS c FROM members', args: [] });
  touchMember('491701234567@s.whatsapp.net', '491701234567@s.whatsapp.net', 'DM');
  touchMember(null, '491701234567@s.whatsapp.net', 'X');
  touchMember(G1, null, 'X');
  await new Promise((r) => setTimeout(r, 120));
  const after = await getDb().execute({ sql: 'SELECT COUNT(*) AS c FROM members', args: [] });
  assert.equal(Number(after.rows[0].c), Number(before.rows[0].c));
});

test('touchMember wirft nie — der Nachrichtenpfad darf nicht stolpern', () => {
  resetTouchThrottle();
  assert.doesNotThrow(() => touchMember(G1, '491700000004@s.whatsapp.net', { seltsam: true }));
  assert.doesNotThrow(() => touchMember(undefined, undefined, undefined));
});

test('resolveIdentities findet die Person auch bei abweichender Schreibweise', async () => {
  // Baileys liefert die Nummer je nach Feld und Version unterschiedlich.
  // In der Datenbank steht immer die normalisierte JID. Ohne Umrechnung lief
  // die Aufloesung bei jeder anderen Schreibweise still ins Leere — im Panel
  // sah das aus wie "kein Name vorhanden".
  const db = getDb();
  const stored = '491700000003@s.whatsapp.net';
  await db.execute({
    sql: 'INSERT OR REPLACE INTO members (group_jid, user_jid, push_name, last_active) VALUES (?, ?, ?, ?)',
    args: [G1, stored, 'Schreibweisen-Test', Date.now()],
  });

  for (const variante of [stored, '491700000003', '+491700000003', '491700000003@c.us', '491700000003:7@s.whatsapp.net']) {
    resetIdentityCache();
    const id = await resolveIdentity(variante, { groupJid: G1 });
    assert.equal(id.name, 'Schreibweisen-Test', `fehlgeschlagen fuer: ${variante}`);
    // Die uebergebene Schreibweise bleibt als Identitaet erhalten.
    assert.equal(id.jid, variante);
  }
});

test('resolveIdentities verwechselt unterschiedliche Nummern nicht', async () => {
  const db = getDb();
  await db.execute({
    sql: 'INSERT OR REPLACE INTO members (group_jid, user_jid, push_name, last_active) VALUES (?, ?, ?, ?)',
    args: [G1, '491700000002@s.whatsapp.net', 'Person A', Date.now()],
  });
  resetIdentityCache();
  const map = await resolveIdentities(
    ['491700000002@s.whatsapp.net', '4917000000021@s.whatsapp.net'],
    { groupJid: G1 }
  );
  assert.equal(map.get('491700000002@s.whatsapp.net').name, 'Person A');
  assert.equal(map.get('4917000000021@s.whatsapp.net').name, null, 'kein Praefix-Treffer');
});
