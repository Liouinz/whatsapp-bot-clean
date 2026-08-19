// Regressionstests fuer die im zweiten Audit bestaetigten CRITICAL/HIGH-Befunde.
// Jeder Test bildet den konkreten Fehlerfall nach, der vorher aufgetreten waere.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
process.env.OWNER_NUMBERS = '491700000000';
process.env.DATABASE_URL = 'file:' + join(here, '..', '.test-regression2.db');
process.env.DATABASE_KEY = 'unused';

const { initDb, dbRun, dbRows, getDb } = await import('../src/db.js');
const { useTursoAuthState } = await import('../src/auth.js');
const { setGlobalFlag, getGlobalFlag } = await import('../src/global.js');
const { transferCoins, getWallet, addCoins } = await import('../src/commands/economy.js');

before(async () => { await initDb(); });

// ── C-1: Wochenreport-Dedupe ────────────────────────────────────────

test('C-1: setGlobalFlag ist ein BOOLEAN-Store — Datumswerte gehen verloren', async () => {
  // Genau diese Coercion machte den Wochenreport-Guard wirkungslos.
  await setGlobalFlag('regression_datumstest', '2026-08-19');
  const back = getGlobalFlag('regression_datumstest');
  assert.equal(back, true, 'String wird zu true gecastet');
  assert.notEqual(back, '2026-08-19', 'Datum ist NICHT rekonstruierbar');
});

test('C-1: Wochenreport-Marker liegt pro Gruppe in group_settings', async () => {
  const jid = 'c1-gruppe@g.us';
  await dbRun('INSERT OR REPLACE INTO group_settings (jid, enabled, weekly_report) VALUES (?, 1, 1)', [jid]);
  const today = '2026-08-16';

  // Die Auswahl des Schedulers: nur Gruppen ohne heutigen Marker.
  const sql = `SELECT jid FROM group_settings
                WHERE weekly_report = 1 AND enabled = 1
                  AND (last_weekly_report IS NULL OR last_weekly_report != ?)`;
  let due = await dbRows(sql, [today]);
  assert.ok(due.some((r) => r.jid === jid), 'vor dem Versand faellig');

  await dbRun('UPDATE group_settings SET last_weekly_report = ? WHERE jid = ?', [today, jid]);
  due = await dbRows(sql, [today]);
  assert.ok(!due.some((r) => r.jid === jid), 'nach dem Versand nicht mehr faellig');
});

test('C-1: eine Gruppe mit fehlgeschlagenem Versand bleibt faellig', async () => {
  const ok = 'c1-ok@g.us';
  const fail = 'c1-fail@g.us';
  const today = '2026-08-16';
  for (const jid of [ok, fail]) {
    await dbRun('INSERT OR REPLACE INTO group_settings (jid, enabled, weekly_report) VALUES (?, 1, 1)', [jid]);
  }
  // Nur die erfolgreiche Gruppe wird markiert.
  await dbRun('UPDATE group_settings SET last_weekly_report = ? WHERE jid = ?', [today, ok]);
  const due = await dbRows(
    `SELECT jid FROM group_settings
      WHERE weekly_report = 1 AND enabled = 1
        AND (last_weekly_report IS NULL OR last_weekly_report != ?)`,
    [today]
  );
  const jids = due.map((r) => r.jid);
  assert.ok(!jids.includes(ok), 'erfolgreiche Gruppe wird nicht erneut bedient');
  assert.ok(jids.includes(fail), 'fehlgeschlagene Gruppe wird erneut versucht');
});

// ── C-2 / H-1: Auth-Instanz nach dispose() stillgelegt ──────────────

test('C-2: saveCreds einer stillgelegten Instanz ueberschreibt die neue Session nicht', async () => {
  const SESSION = 'regr-c2';
  const db = getDb();
  await db.execute({ sql: 'DELETE FROM auth_creds WHERE id = ?', args: [SESSION] });

  const a = await useTursoAuthState(SESSION);
  a.state.creds.me = { id: 'ALT' };
  await a.saveCreds();

  // Socket-Wechsel: alte Instanz freigeben, neue anlegen und schreiben.
  await a.dispose();
  const b = await useTursoAuthState(SESSION);
  b.state.creds.me = { id: 'NEU' };
  await b.saveCreds();

  // Verspaeteter creds.update der ALTEN Instanz — muss wirkungslos bleiben.
  a.state.creds.me = { id: 'ALT-VERSPAETET' };
  await a.saveCreds();

  const rows = await db.execute({ sql: 'SELECT data FROM auth_creds WHERE id = ?', args: [SESSION] });
  const stored = JSON.parse(rows.rows[0].data);
  assert.equal(stored.me.id, 'NEU', 'die neue Session bleibt erhalten');
});

test('H-1: keys.set einer stillgelegten Instanz schreibt nicht mehr', async () => {
  const SESSION = 'regr-h1';
  const db = getDb();
  await db.execute({ sql: 'DELETE FROM auth_keys WHERE id LIKE ?', args: [`${SESSION}:%`] });

  const a = await useTursoAuthState(SESSION);
  await a.dispose();

  // Spaetes keys.set der alten Instanz darf den Flush-Timer nicht neu bewaffnen.
  await a.state.keys.set({ 'pre-key': { 1: { public: Buffer.from([1]) } } });
  await new Promise((r) => setTimeout(r, 1200)); // laenger als FLUSH_DELAY_MS

  const rows = await db.execute({ sql: 'SELECT id FROM auth_keys WHERE id LIKE ?', args: [`${SESSION}:%`] });
  assert.equal(rows.rows.length, 0, 'keine stale Keys in der Session');
});

test('C-3: keys.set persistiert, bevor es aufloest', async () => {
  const SESSION = 'regr-c3';
  const db = getDb();
  await db.execute({ sql: 'DELETE FROM auth_keys WHERE id LIKE ?', args: [`${SESSION}:%`] });

  const a = await useTursoAuthState(SESSION);
  await a.state.keys.set({ 'pre-key': { 7: { public: Buffer.from([4, 5, 6]) } } });

  // Sofort nach dem await muss die Zeile in der DB stehen — vorher kehrte
  // set() zurueck, waehrend der Write noch bis zu 800 ms ausstand.
  const rows = await db.execute({ sql: 'SELECT id FROM auth_keys WHERE id LIKE ?', args: [`${SESSION}:%`] });
  assert.equal(rows.rows.length, 1, 'Key ist unmittelbar persistiert');
  await a.dispose();
});

// ── H-3: geplante Nachrichten werden atomar beansprucht ─────────────

// Strukturtest: der reine SQL-Test unten wuerde auch gegen den alten Code
// gruen bleiben, weil er die Scheduler-Logik gar nicht beruehrt. Deshalb hier
// zusaetzlich pruefen, dass processDueMessages den Claim WIRKLICH vor dem
// Versand setzt und der Tick gegen Ueberlappung geschuetzt ist.
test('H-3/H-2: Scheduler beansprucht vor dem Versand und schuetzt den Tick', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(join(here, '..', 'src', 'scheduler.js'), 'utf8');

  const claimIdx = src.indexOf("SET done = 1, done_at = ? WHERE id = ? AND done = 0");
  const sendIdx = src.indexOf('await sendText(r.chat_jid');
  assert.ok(claimIdx > -1, 'atomarer Claim mit `AND done = 0` vorhanden');
  assert.ok(sendIdx > -1, 'Versand vorhanden');
  assert.ok(claimIdx < sendIdx, 'Claim steht VOR dem Versand');

  assert.match(src, /if \(isTicking\) return;/, 'Tick-Re-Entrancy-Guard vorhanden');
  assert.match(src, /isTicking = false;/, 'Guard wird im finally freigegeben');
});

test('H-3: der Claim gewinnt genau einmal, auch bei parallelen Ticks', async () => {
  await dbRun('DELETE FROM scheduled_messages', []);
  await dbRun(
    'INSERT INTO scheduled_messages (chat_jid, send_at, text, created_by, done) VALUES (?, ?, ?, ?, 0)',
    ['h3@g.us', Date.now() - 1000, 'hallo', 'tester']
  );
  const row = (await dbRows('SELECT id FROM scheduled_messages LIMIT 1', []))[0];

  const claim = async () => {
    const res = await dbRun(
      'UPDATE scheduled_messages SET done = 1, done_at = ? WHERE id = ? AND done = 0',
      [Date.now(), row.id]
    );
    return Number(res.rowsAffected || 0) > 0;
  };

  const results = await Promise.all([claim(), claim(), claim()]);
  assert.equal(results.filter(Boolean).length, 1, 'nur ein Tick darf senden');
});

// ── H-4: Transfers vernichten keine Coins ───────────────────────────

test('H-4: transferCoins ist atomar — Summe bleibt erhalten', async () => {
  const from = 'h4-from@s.whatsapp.net';
  const to = 'h4-to@s.whatsapp.net';
  await dbRun('DELETE FROM coins', []);
  const a0 = (await getWallet(from, 'A')).balance;
  const b0 = (await getWallet(to, 'B')).balance;
  const total0 = Number(a0) + Number(b0);

  const ok = await transferCoins(from, to, 500, 'A');
  assert.equal(ok, true);

  const a1 = Number((await getWallet(from)).balance);
  const b1 = Number((await getWallet(to)).balance);
  assert.equal(a1, Number(a0) - 500, 'Absender korrekt belastet');
  assert.equal(b1, Number(b0) + 500, 'Empfaenger korrekt gutgeschrieben');
  assert.equal(a1 + b1, total0, 'keine Coins vernichtet oder erzeugt');
});

test('H-4: Transfer ohne Deckung aendert gar nichts', async () => {
  const from = 'h4b-from@s.whatsapp.net';
  const to = 'h4b-to@s.whatsapp.net';
  await dbRun('DELETE FROM coins', []);
  await getWallet(from, 'A');
  await getWallet(to, 'B');
  const a0 = Number((await getWallet(from)).balance);
  const b0 = Number((await getWallet(to)).balance);

  const ok = await transferCoins(from, to, a0 + 1_000_000, 'A');
  assert.equal(ok, false, 'Transfer wird abgelehnt');
  assert.equal(Number((await getWallet(from)).balance), a0, 'Absender unveraendert');
  assert.equal(Number((await getWallet(to)).balance), b0, 'Empfaenger unveraendert — keine Coins aus dem Nichts');
});
