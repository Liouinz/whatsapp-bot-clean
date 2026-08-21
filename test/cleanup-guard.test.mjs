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

// Hinweis: Hier standen zwei Tests fuer `runCleanup` aus src/scheduler.js.
// Diese Funktion hat nie existiert — belegt durch `git log -S'runCleanup' --all -- src/`
// (leer); der Test entstand in 51488b8, demselben Commit, der scheduler.js
// ueberhaupt erst anlegte. Es gibt auch keine Cleanup-Routine unter anderem
// Namen, auf die man sie umbiegen koennte: startScheduler() fuehrt acht Jobs
// aus, keiner davon raeumt abgelaufene Daten auf. Die Tests wurden entfernt,
// statt eine Funktion zu erfinden, nur damit ein Test gruen wird.
// Der eigentliche Session-Schutz bleibt durch die uebrigen Tests dieser Datei
// abgedeckt (PROTECTED_TABLES, deleteTargetTable, wipeAllData).

test('wipeAllData löscht Daten, aber NICHT die Session', async () => {
  await dbRun('INSERT OR REPLACE INTO xp (group_jid, user_jid, xp) VALUES (?, ?, ?)', ['g@g.us', 'u@s.whatsapp.net', 999]);
  await wipeAllData();
  const xpRows = await dbRows('SELECT * FROM xp', []);
  assert.equal(xpRows.length, 0, 'Daten wurden geleert');
  assert.ok(await sessionIntact(), 'Session überlebt den Komplett-Wipe');
});
