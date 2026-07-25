// Absoluter Session-Schutz (zentraler Schreib-Wächter) + Erstaktivierung pro
// Gruppe + Owner-Berechtigung. node:test, lokale libsql-DB.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
process.env.OWNER_NUMBERS = '491700000000';
process.env.BOT_OWNER_NUMBERS = '491700000001';
process.env.DATABASE_URL = 'file:' + join(here, '..', '.test-guard.db');
process.env.DATABASE_KEY = 'unused';

const { initDb, dbRun, dbRows } = await import('../src/db.js');
const perms = await import('../src/permissions.js');
const { isUserAdmin, isOwner } = perms;
const { getGroupSettings, invalidateSettings } = await import('../src/moderation.js');
const { isActivationCommand, activateGroup } = await import('../src/commands/management.js');

const OWNER = '491700000000@s.whatsapp.net';
const STRANGER = '491711111111@s.whatsapp.net';
const NEWGROUP = 'newgroup-1@g.us';

before(async () => { await initDb(); });
beforeEach(async () => {
  await dbRun('DELETE FROM group_settings', []).catch(() => {});
  invalidateSettings();
});

test('dbRun blockiert JEDEN Schreibzugriff auf auth_creds/auth_keys', async () => {
  await assert.rejects(() => dbRun('DELETE FROM auth_keys WHERE id = ?', ['x']), /geschützte Session/);
  await assert.rejects(() => dbRun("UPDATE auth_creds SET data = '' WHERE id = ?", ['main']), /geschützte Session/);
  await assert.rejects(() => dbRun('INSERT OR REPLACE INTO auth_keys (id, data) VALUES (?, ?)', ['a', 'b']), /geschützte Session/);
  await assert.rejects(() => dbRun('DROP TABLE auth_creds', []), /geschützte Session/);
});

test('dbRun erlaubt normale Writes und lesende Auth-Zugriffe', async () => {
  await dbRun('INSERT OR IGNORE INTO group_settings (jid, enabled) VALUES (?, 1)', ['x@g.us']);
  const rows = await dbRows('SELECT id FROM auth_creds LIMIT 1', []);
  assert.ok(Array.isArray(rows));
});

test('OWNER_NUMBERS gelten immer als Admin (ohne Gruppen-Admin-Prüfung)', async () => {
  assert.equal(isOwner([OWNER]), true);
  assert.equal(await isUserAdmin('irgendeine@g.us', [OWNER]), true);
  assert.equal(isOwner([STRANGER]), false);
});

test('Neue Gruppe startet im eingeschränkten Modus (enabled=0)', async () => {
  const s = await getGroupSettings(NEWGROUP);
  assert.equal(Number(s.enabled), 0, 'Bot ist in neuen Gruppen zunächst inaktiv');
  const rows = await dbRows('SELECT enabled FROM group_settings WHERE jid = ?', [NEWGROUP]);
  assert.equal(Number(rows[0].enabled), 0);
});

test('activateGroup schaltet die Gruppe frei (enabled=1)', async () => {
  await getGroupSettings(NEWGROUP);
  await activateGroup(NEWGROUP);
  invalidateSettings(NEWGROUP);
  const s = await getGroupSettings(NEWGROUP);
  assert.equal(Number(s.enabled), 1);
});

test('isActivationCommand erkennt die erlaubten Schreibweisen', () => {
  ['!setup', '/enable', 'Bot aktivieren', '/bot enable', '!aktivieren', 'bot an', 'freischalten']
    .forEach((t) => assert.equal(isActivationCommand(t), true, t));
  ['!hilfe', 'setuphilfe', 'bot', 'enable jetzt', 'guten morgen']
    .forEach((t) => assert.equal(isActivationCommand(t), false, t));
});
