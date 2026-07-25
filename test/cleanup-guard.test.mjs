// Beweist: Auto-Cleanup & Panel-Wipe fassen die Baileys-Session (auth_creds/
// auth_keys) NIEMALS an. node:test, lokale libsql-DB.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
process.env.OWNER_NUMBERS = '491700000000';
process.env.DATABASE_URL = 'file:' + join(here, '..', '.test-cleanup.db');
process.env.DATABASE_KEY = 'unused';

const { initDb, dbRun, dbRows, wipeAllData, PROTECTED_TABLES, deleteTargetTable, getDb } = await import('../src/db.js');
const { runCleanup } = await import('../src/scheduler.js');

async function seedSession() {
  const db = getDb();
  await db.execute({ sql: 'INSERT OR REPLACE INTO auth_creds (id, data) VALUES (?, ?)', args: ['main', '{"registered":true}'] });
  await db.execute({ sql: 'INSERT OR REPLACE INTO auth_keys (id, data) VALUES (?, ?)', args: ['main:pre-key-1', '{"k":1}'] });
  await db.execute({ sql: 'INSERT OR REPLACE INTO auth_keys (id, data) VALUES (?, ?)', args: ['main:session-x', '{"k":2}'] });
}
async function sessionIntact() {
  const creds = await dbRows('SELECT id FROM auth_creds WHERE id = ?', ['main']);
  const keys = await dbRows('SELECT id FROM auth_keys WHERE id LIKE ?', ['main:%']);
  return creds.length === 1 && keys.length === 2;
}

before(async () => { await initDb(); });
beforeEach(seedSession);

test('PROTECTED_TABLES schützt genau die Session-Tabellen', () => {
  assert.ok(PROTECTED_TABLES.has('auth_creds'));
  assert.ok(PROTECTED_TABLES.has('auth_keys'));
});

test('deleteTargetTable erkennt die Zieltabelle', () => {
  assert.equal(deleteTargetTable('DELETE FROM warnings WHERE x < ?'), 'warnings');
  assert.equal(deleteTargetTable('delete from auth_keys where id like ?'), 'auth_keys');
  assert.equal(deleteTargetTable('SELECT 1'), null);
});

test('runCleanup lässt die komplette Session unangetastet', async () => {
  await runCleanup();
  assert.ok(await sessionIntact(), 'auth_creds + auth_keys überstehen den Cleanup');
});

test('runCleanup bereinigt trotzdem echte Daten (abgelaufene Warnung weg)', async () => {
  await dbRun('INSERT INTO warnings (group_jid, user_jid, reason, by_jid, created_at, expires_at) VALUES (?,?,?,?,?,?)',
    ['g@g.us', 'u@s.whatsapp.net', 'alt', 'auto', 1, 1]);
  await runCleanup();
  const left = await dbRows('SELECT * FROM warnings WHERE expires_at <= ?', [Date.now()]);
  assert.equal(left.length, 0, 'abgelaufene Warnung wurde bereinigt');
  assert.ok(await sessionIntact(), 'Session weiterhin intakt');
});

test('wipeAllData löscht Daten, aber NICHT die Session', async () => {
  await dbRun('INSERT OR REPLACE INTO coins (user_jid, balance) VALUES (?, ?)', ['u@s.whatsapp.net', 999]);
  await wipeAllData();
  const coins = await dbRows('SELECT * FROM coins', []);
  assert.equal(coins.length, 0, 'Daten wurden geleert');
  assert.ok(await sessionIntact(), 'Session überlebt den Komplett-Wipe');
});
