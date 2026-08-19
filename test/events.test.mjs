// Testsuite für das Event-System (node:test, lokale libsql-DB).
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
process.env.OWNER_NUMBERS = '491700000000';
process.env.DATABASE_URL = 'file:' + join(here, '..', '.test-events.db');
process.env.DATABASE_KEY = 'unused';

const { initDb, dbRun, dbRows } = await import('../src/db.js');
const { state } = await import('../src/state.js');
const events = await import('../src/events.js');
const { getEvent } = await import('../src/data/events.js');
const { eventCommands } = await import('../src/commands/events.js');

const USER = '491711111111@s.whatsapp.net';
const cmd = (n) => eventCommands.find((c) => c.name === n || c.aliases?.includes(n));

state.connection = 'open';
state.sock = { sendMessage: async () => ({ key: { id: 'x', fromMe: true } }) };

function fakeCtx(args, { admin = true } = {}) {
  const replies = [];
  return { chatJid: '9@g.us', sender: USER, senderName: 'Admin', args, argText: args.join(' '),
    isAdmin: async () => admin, reply: (t) => { replies.push(t); return Promise.resolve(); }, replies };
}
async function reset() {
  for (const t of ['active_event', 'group_settings']) await dbRun(`DELETE FROM ${t}`, []).catch(() => {});
  events.resetEventCache();
}
before(async () => { await initDb(); });
beforeEach(reset);

test('Ohne Event ist der Multiplikator 1', () => {
  assert.equal(events.getEventXpMult(), 1);
});

test('setEvent aktiviert die globalen Multiplikatoren', async () => {
  await events.setEvent(getEvent('mega'), 2);
  assert.equal(events.getEventXpMult(), 2);
  assert.ok(events.getActiveEvent());
});

test('Abgelaufenes Event wird lazy deaktiviert', async () => {
  await events.setEvent(getEvent('mega'), 1);
  await dbRun('UPDATE active_event SET expires_at = ? WHERE id = 1', [Date.now() - 1000]);
  events.resetEventCache();
  await events.loadActiveEvent();
  assert.equal(events.getEventXpMult(), 1);
  assert.equal(events.getActiveEvent(), null);
});

test('loadActiveEvent stellt ein laufendes Event nach „Neustart" wieder her', async () => {
  await events.setEvent(getEvent('lucky_hour'), 5);
  events.resetEventCache();
  assert.equal(events.getActiveEvent(), null, 'RAM geleert');
  await events.loadActiveEvent();
  assert.ok(events.getActiveEvent(), 'aus DB wiederhergestellt');
  assert.equal(events.getEventXpMult(), 1.5);
});

test('!event start (Admin) aktiviert und kündigt an', async () => {
  await dbRun('INSERT OR IGNORE INTO group_settings (jid, enabled) VALUES (?, 1)', ['9@g.us']);
  const ctx = fakeCtx(['start', 'double_xp', '2']);
  await cmd('event').run(ctx);
  assert.match(ctx.replies[0], /läuft jetzt/);
  assert.equal(events.getEventXpMult(), 2);
});

test('!event start von Nicht-Admin wird abgelehnt', async () => {
  const ctx = fakeCtx(['start', 'mega'], { admin: false });
  await cmd('event').run(ctx);
  assert.match(ctx.replies[0], /Nur Admins/);
  assert.equal(events.getActiveEvent(), null);
});

test('!event stop (Admin) beendet das Event', async () => {
  await events.setEvent(getEvent('mega'), 2);
  const ctx = fakeCtx(['stop']);
  await cmd('event').run(ctx);
  assert.match(ctx.replies[0], /beendet/);
  assert.equal(events.getActiveEvent(), null);
});

test('!event Status zeigt laufendes oder kein Event', async () => {
  const none = fakeCtx([]);
  await cmd('event').run(none);
  assert.match(none.replies[0], /kein Event/);
  await events.setEvent(getEvent('double_xp'), 10);
  const running = fakeCtx([]);
  await cmd('event').run(running);
  assert.match(running.replies[0], /Double-XP/);
});
