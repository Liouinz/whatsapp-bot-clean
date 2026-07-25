// Testsuite für die Turso-Auth-State-Persistenz (node:test, lokale libsql-DB).
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
process.env.OWNER_NUMBERS = '491700000000';
process.env.DATABASE_URL = 'file:' + join(here, '..', '.test-auth.db');
process.env.DATABASE_KEY = 'unused';

const { initDb, dbRun } = await import('../src/db.js');
const { useTursoAuthState } = await import('../src/auth.js');

const SESSION = 'testsession';
before(async () => { await initDb(); });
beforeEach(async () => {
  await dbRun('DELETE FROM auth_creds WHERE id = ?', [SESSION]).catch(() => {});
  await dbRun('DELETE FROM auth_keys WHERE id LIKE ?', [`${SESSION}:%`]).catch(() => {});
});

test('Signal-Keys überleben einen "Reconnect" (frischer Store) mit Buffer-Integrität', async () => {
  const a = await useTursoAuthState(SESSION);
  await a.state.keys.set({
    'pre-key': { 5: { public: Buffer.from([1, 2, 3]), private: Buffer.from([9, 8, 7]) } },
    session: { '111@s.whatsapp.net': { rec: Buffer.from('abc') } },
  });
  const b = await useTursoAuthState(SESSION);
  const got = await b.state.keys.get('pre-key', ['5']);
  assert.ok(Buffer.isBuffer(got['5'].public), 'Buffer bleibt Buffer');
  assert.deepEqual([...got['5'].public], [1, 2, 3]);
  assert.deepEqual([...got['5'].private], [9, 8, 7]);
  const sess = await b.state.keys.get('session', ['111@s.whatsapp.net']);
  assert.equal(sess['111@s.whatsapp.net'].rec.toString(), 'abc');
});

test('Fehlende Keys liefern null (kein Fehler)', async () => {
  const a = await useTursoAuthState(SESSION);
  const got = await a.state.keys.get('pre-key', ['999']);
  assert.equal(got['999'], null);
});

test('Key löschen entfernt ihn dauerhaft', async () => {
  const a = await useTursoAuthState(SESSION);
  await a.state.keys.set({ 'pre-key': { 7: { x: 1 } } });
  await a.state.keys.set({ 'pre-key': { 7: null } });
  const b = await useTursoAuthState(SESSION);
  assert.equal((await b.state.keys.get('pre-key', ['7']))['7'], null);
});

test('Creds werden nach saveCreds korrekt geladen', async () => {
  const a = await useTursoAuthState(SESSION);
  a.state.creds.me = { id: '491700000000@s.whatsapp.net' };
  a.state.creds.registered = true;
  await a.saveCreds();
  const b = await useTursoAuthState(SESSION);
  assert.equal(b.state.creds.me.id, '491700000000@s.whatsapp.net');
  assert.equal(b.state.creds.registered, true);
});

test('clearSession löscht Creds und alle Keys → frischer, unregistrierter State', async () => {
  const a = await useTursoAuthState(SESSION);
  a.state.creds.registered = true;
  await a.saveCreds();
  await a.state.keys.set({ 'pre-key': { 1: { x: 1 } } });
  await a.clearSession();
  const b = await useTursoAuthState(SESSION);
  assert.notEqual(b.state.creds.registered, true, 'frische Creds (nicht registriert)');
  assert.equal((await b.state.keys.get('pre-key', ['1']))['1'], null, 'Keys weg');
});

test('Neue Creds sind initial nicht registriert', async () => {
  const a = await useTursoAuthState(SESSION);
  assert.ok(a.state.creds.noiseKey, 'initAuthCreds hat Schlüssel erzeugt');
  assert.notEqual(a.state.creds.registered, true);
});
