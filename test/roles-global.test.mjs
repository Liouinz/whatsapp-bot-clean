// Testsuite für das Rollen-System (BOT_OWNER/COMMUNITY_OWNER/GROUP_ADMIN/USER),
// die globalen System-Schalter und die Verwaltungs-Befehle (node:test, lokale libsql-DB).
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
process.env.OWNER_NUMBERS = '491700000000';
process.env.BOT_OWNER_NUMBERS = '491700000001';
process.env.DATABASE_URL = 'file:' + join(here, '..', '.test-roles.db');
process.env.DATABASE_KEY = 'unused';

const { initDb, dbRun } = await import('../src/db.js');
const { state } = await import('../src/state.js');
const perms = await import('../src/permissions.js');
const { ROLE, ROLE_LABEL, isBotOwner, isOwner, getRoleLevel } = perms;
const global = await import('../src/global.js');
const { managementCommands } = await import('../src/commands/management.js');

const BOTOWNER = '491700000001@s.whatsapp.net';
const OWNER = '491700000000@s.whatsapp.net';
const ADMIN = '491722222222@s.whatsapp.net';
const USER = '491711111111@s.whatsapp.net';
const GJID = '9@g.us';

const cmd = (n) => managementCommands.find((c) => c.name === n || c.aliases?.includes(n));

state.connection = 'open';
state.sock = {
  sendMessage: async () => ({ key: { id: 'x', fromMe: true } }),
  groupMetadata: async () => ({
    id: GJID,
    subject: 'Testgruppe',
    participants: [
      { id: ADMIN, admin: 'admin' },
      { id: USER, admin: null },
    ],
  }),
};

function mgmtCtx(args, { botOwner = true, isGroup = true, role = ROLE.BOT_OWNER, senderName = 'Chef' } = {}) {
  const replies = [];
  return {
    args, argText: args.join(' '), chatJid: GJID, isGroup, senderName,
    isBotOwner: botOwner,
    role: async () => role,
    reply: (t) => { replies.push(t); return Promise.resolve(); },
    replies,
  };
}

async function reset() {
  for (const t of ['global_settings', 'group_settings']) await dbRun(`DELETE FROM ${t}`, []).catch(() => {});
  await dbRun('INSERT OR IGNORE INTO group_settings (jid, enabled) VALUES (?, 1)', [GJID]).catch(() => {});
  global.resetGlobalCache();
}

before(async () => { await initDb(); });
beforeEach(reset);

test('isBotOwner trennt Bot-Owner von Community-Owner', () => {
  assert.equal(isBotOwner([BOTOWNER]), true);
  assert.equal(isBotOwner([OWNER]), false, 'Community-Owner ist NICHT Bot-Owner');
  assert.equal(isBotOwner([USER]), false);
});

test('isOwner: Bot-Owner zählt immer mit', () => {
  assert.equal(isOwner([OWNER]), true);
  assert.equal(isOwner([BOTOWNER]), true, 'höhere Rolle schließt Community-Owner ein');
  assert.equal(isOwner([USER]), false);
});

test('getRoleLevel liefert alle vier Stufen korrekt', async () => {
  assert.equal(await getRoleLevel(GJID, [BOTOWNER], true), ROLE.BOT_OWNER);
  assert.equal(await getRoleLevel(GJID, [OWNER], true), ROLE.COMMUNITY_OWNER);
  assert.equal(await getRoleLevel(GJID, [ADMIN], true), ROLE.GROUP_ADMIN);
  assert.equal(await getRoleLevel(GJID, [USER], true), ROLE.USER);
});

test('Gruppen-Admin ist im DM nur USER (kein Gruppenkontext)', async () => {
  assert.equal(await getRoleLevel(null, [ADMIN], false), ROLE.USER);
});

test('Standardwerte: Systeme AN, Wartung AUS', () => {
  assert.equal(global.xpEnabled(), true);
  assert.equal(global.maintenanceOn(), false);
});

test('setGlobalFlag wirkt sofort im RAM', async () => {
  await global.setGlobalFlag('system_xp', false);
  assert.equal(global.xpEnabled(), false);
  await global.setGlobalFlag('system_xp', true);
  assert.equal(global.xpEnabled(), true);
});

test('Flags überleben Neustart (persistiert + loadGlobalSettings)', async () => {
  await global.setGlobalFlag('system_xp', false);
  await global.setGlobalFlag('maintenance', true);
  global.resetGlobalCache();
  assert.equal(global.xpEnabled(), true, 'nach Cache-Reset erst wieder Default');
  await global.loadGlobalSettings();
  assert.equal(global.xpEnabled(), false, 'aus DB wiederhergestellt');
  assert.equal(global.maintenanceOn(), true);
});

test('!rolle zeigt das passende Rollen-Label', async () => {
  const ctx = mgmtCtx([], { role: ROLE.BOT_OWNER });
  await cmd('rolle').run(ctx);
  assert.match(ctx.replies[0], new RegExp(ROLE_LABEL[ROLE.BOT_OWNER]));
});

test('!wartung an|aus schaltet den Wartungsmodus', async () => {
  const on = mgmtCtx(['an']);
  await cmd('wartung').run(on);
  assert.equal(global.maintenanceOn(), true);
  assert.match(on.replies[0], /Wartungsmodus AKTIV/i);
  const off = mgmtCtx(['aus']);
  await cmd('wartung').run(off);
  assert.equal(global.maintenanceOn(), false);
});

test('!global xp aus deaktiviert das XP-System global', async () => {
  const ctx = mgmtCtx(['xp', 'aus']);
  await cmd('global').run(ctx);
  assert.equal(global.xpEnabled(), false);
  assert.match(ctx.replies[0], /xp/i);
});

test('!global antilink an setzt die Spalte in allen Gruppen', async () => {
  const { dbRows } = await import('../src/db.js');
  const ctx = mgmtCtx(['antilink', 'an']);
  await cmd('global').run(ctx);
  const rows = await dbRows('SELECT antilink FROM group_settings WHERE jid = ?', [GJID]);
  assert.equal(Number(rows[0].antilink), 1);
});

test('!global mit unbekanntem System zeigt die Hilfe', async () => {
  const ctx = mgmtCtx(['quatsch', 'an']);
  await cmd('global').run(ctx);
  assert.match(ctx.replies[0], /Nutzung/i);
});
