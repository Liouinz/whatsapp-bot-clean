// Testsuite für das Verträge/Quests-System (node:test, lokale libsql-DB).
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
process.env.OWNER_NUMBERS = '491700000000';
process.env.DATABASE_URL = 'file:' + join(here, '..', '.test-quests.db');
process.env.DATABASE_KEY = 'unused';

const { initDb, dbRun, dbRows } = await import('../src/db.js');
const { state } = await import('../src/state.js');
const { questCommands, sweepContracts, resetQuestState } = await import('../src/commands/quests.js');
const { addCoins, getWallet } = await import('../src/commands/economy.js');
const { getQty } = await import('../src/commands/items.js');

state.connection = 'open';
state.sock = { sendMessage: async () => ({ key: { id: 'x', fromMe: true } }) };

const USER = '491711111111@s.whatsapp.net';
const CHAT = '9@g.us';
const cmd = (n) => questCommands.find((c) => c.name === n || c.aliases?.includes(n));

function fakeCtx(args, { sender = USER, name = 'Tester' } = {}) {
  const replies = [];
  return { chatJid: CHAT, sender, senderName: name, args, argText: args.join(' '),
    reply: (t) => { replies.push(t); return Promise.resolve(); }, replies };
}
async function reset() {
  for (const t of ['coins', 'inventory', 'game_scores', 'xp', 'player_contracts']) await dbRun(`DELETE FROM ${t}`, []).catch(() => {});
  resetQuestState();
}
before(async () => { await initDb(); });
beforeEach(reset);

test('Verfügbare Verträge werden gelistet', async () => {
  const ctx = fakeCtx([]);
  await cmd('vertraege').run(ctx);
  assert.match(ctx.replies[0], /Verträge/);
  assert.match(ctx.replies[0], /starter/);
});

test('Vertrag annehmen legt einen aktiven Vertrag an (mit Snapshot-Baseline)', async () => {
  await addCoins(USER, 5_000, 'Tester');
  const ctx = fakeCtx(['daily_grind']);
  await cmd('vertrag').run(ctx);
  const rows = await dbRows('SELECT * FROM player_contracts WHERE user_jid = ? AND done = 0', [USER]);
  assert.equal(rows.length, 1);
  assert.ok(Number(rows[0].baseline) >= 5_000, 'Baseline = bisher verdiente Coins');
  assert.match(ctx.replies[0], /angenommen/);
});

test('Doppelt annehmen wird verhindert', async () => {
  await cmd('vertrag').run(fakeCtx(['starter']));
  const ctx = fakeCtx(['starter']);
  await cmd('vertrag').run(ctx);
  assert.match(ctx.replies[0], /läuft schon/);
});

test('Maximal 3 aktive Verträge', async () => {
  for (const id of ['starter', 'daily_grind', 'gamer']) await cmd('vertrag').run(fakeCtx([id]));
  const ctx = fakeCtx(['premium']);
  await cmd('vertrag').run(ctx);
  assert.match(ctx.replies[0], /bereits 3/);
});

test('Fortschritt wird aus verdienten Coins berechnet', async () => {
  await addCoins(USER, 1_000, 'Tester');
  await cmd('vertrag').run(fakeCtx(['daily_grind']));
  await addCoins(USER, 400, 'Tester');
  const ctx = fakeCtx([]);
  await cmd('meinevertraege').run(ctx);
  assert.match(ctx.replies[0], /400\/1\.000/);
});

test('Erfüllter Vertrag wird beim Ansehen belohnt', async () => {
  await cmd('vertrag').run(fakeCtx(['daily_grind']));
  await addCoins(USER, 1_000, 'Tester');
  await addCoins(USER, 1_000, 'Tester');
  const balBefore = Number((await getWallet(USER)).balance);
  const ctx = fakeCtx([]);
  await cmd('meinevertraege').run(ctx);
  assert.match(ctx.replies[0], /erfüllt/);
  const balAfter = Number((await getWallet(USER)).balance);
  assert.equal(balAfter - balBefore, 300, 'Coin-Belohnung gutgeschrieben');
  assert.equal(await getQty(USER, 'boost_xp_10_1h'), 1, 'Item-Belohnung im Inventar');
  const active = await dbRows('SELECT * FROM player_contracts WHERE user_jid = ? AND done = 0', [USER]);
  assert.equal(active.length, 0);
});

test('Sweep belohnt automatisch und verhindert Doppel-Belohnung', async () => {
  await cmd('vertrag').run(fakeCtx(['daily_grind']));
  await addCoins(USER, 2_000, 'Tester');
  const balBefore = Number((await getWallet(USER)).balance);
  resetQuestState();
  await sweepContracts();
  const balAfter = Number((await getWallet(USER)).balance);
  assert.equal(balAfter - balBefore, 300, 'einmalige Belohnung durch Sweep');
  resetQuestState();
  await sweepContracts();
  assert.equal(Number((await getWallet(USER)).balance), balAfter, 'keine Doppel-Belohnung');
});

test('Abgelaufener Vertrag wird nicht belohnt', async () => {
  await cmd('vertrag').run(fakeCtx(['daily_grind']));
  await dbRun('UPDATE player_contracts SET expires_at = ? WHERE user_jid = ?', [Date.now() - 1000, USER]);
  await addCoins(USER, 2_000, 'Tester');
  const balBefore = Number((await getWallet(USER)).balance);
  const ctx = fakeCtx([]);
  await cmd('meinevertraege').run(ctx);
  assert.match(ctx.replies[0], /abgelaufen/);
  assert.equal(Number((await getWallet(USER)).balance), balBefore, 'keine Belohnung nach Ablauf');
});

test('Abbrechen entfernt den Vertrag', async () => {
  await cmd('vertrag').run(fakeCtx(['starter']));
  const ctx = fakeCtx(['abbrechen', 'starter']);
  await cmd('vertrag').run(ctx);
  assert.match(ctx.replies[0], /abgebrochen/);
  const active = await dbRows('SELECT * FROM player_contracts WHERE user_jid = ? AND done = 0', [USER]);
  assert.equal(active.length, 0);
});

test('games_won-Fortschritt zählt Spielsiege', async () => {
  await cmd('vertrag').run(fakeCtx(['gamer']));
  await dbRun(`INSERT INTO game_scores (group_jid, user_jid, game, wins, name) VALUES (?, ?, 'quiz', 3, 'T')`, [CHAT, USER]);
  const ctx = fakeCtx([]);
  await cmd('meinevertraege').run(ctx);
  assert.match(ctx.replies[0], /3\/5/);
});
