// Testsuite für Erfolge, Prestige & Ranglisten (node:test, lokale libsql-DB).
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
process.env.OWNER_NUMBERS = '491700000000';
process.env.DATABASE_URL = 'file:' + join(here, '..', '.test-progression.db');
process.env.DATABASE_KEY = 'unused';

const { initDb, dbRun, dbRows } = await import('../src/db.js');
const { progressionCommands, checkAchievements } = await import('../src/commands/progression.js');
const { addCoins, earnCoins, getWallet } = await import('../src/commands/economy.js');
const { getQty } = await import('../src/commands/items.js');
const { getPrestigeLevel, getPrestigeMult, resetPrestigeCache } = await import('../src/prestige.js');

const USER = '491711111111@s.whatsapp.net';
const CHAT = '9@g.us';
const cmd = (n) => progressionCommands.find((c) => c.name === n || c.aliases?.includes(n));
function fakeCtx(args, { sender = USER, name = 'Tester' } = {}) {
  const replies = [];
  return { chatJid: CHAT, sender, senderName: name, args, argText: args.join(' '),
    reply: (t) => { replies.push(t); return Promise.resolve(); }, replies };
}
async function reset() {
  for (const t of ['coins', 'inventory', 'game_scores', 'xp', 'user_achievements', 'prestige', 'user_titles']) await dbRun(`DELETE FROM ${t}`, []).catch(() => {});
  resetPrestigeCache();
}
before(async () => { await initDb(); });
beforeEach(reset);

test('Erfolg wird freigeschaltet und belohnt, sobald die Bedingung erfüllt ist', async () => {
  await addCoins(USER, 10_000, 'Tester');
  const balBefore = Number((await getWallet(USER)).balance);
  const newly = await checkAchievements(USER, 'Tester', CHAT);
  assert.ok(newly.some((a) => a.id === 'rich_1'), 'rich_1 freigeschaltet');
  const balAfter = Number((await getWallet(USER)).balance);
  assert.equal(balAfter - balBefore, 500, 'Coin-Belohnung gutgeschrieben');
});

test('Erfolge werden nicht doppelt belohnt', async () => {
  await addCoins(USER, 10_000, 'Tester');
  await checkAchievements(USER, 'Tester', CHAT);
  const bal = Number((await getWallet(USER)).balance);
  const again = await checkAchievements(USER, 'Tester', CHAT);
  assert.equal(again.length, 0, 'kein erneutes Freischalten');
  assert.equal(Number((await getWallet(USER)).balance), bal, 'keine Doppel-Belohnung');
});

test('Titel-Erfolg landet als Item im Inventar und wird angelegt', async () => {
  await dbRun('INSERT OR REPLACE INTO coins (user_jid, balance, total_earned, name) VALUES (?, ?, ?, ?)',
    [USER, 1_000_000, 5_000, 'Tester']);
  await checkAchievements(USER, 'Tester', CHAT);
  assert.equal(await getQty(USER, 'title_vip'), 1, 'Titel-Item im Inventar');
  const ut = await dbRows('SELECT title FROM user_titles WHERE user_jid = ?', [USER]);
  assert.match(ut[0].title, /VIP/);
});

test('!erfolge zeigt Zähler und nächste Ziele', async () => {
  await addCoins(USER, 10_000, 'Tester');
  const ctx = fakeCtx([]);
  await cmd('erfolge').run(ctx);
  assert.match(ctx.replies[0], /Erfolge von Tester/);
  assert.match(ctx.replies[0], /Sparschwein/);
});

test('Prestige-Info zeigt Rang 0 und Kosten', async () => {
  const ctx = fakeCtx([]);
  await cmd('prestige').run(ctx);
  assert.match(ctx.replies[0], /Rang: \*0\*/);
  assert.match(ctx.replies[0], /5\.000\.000/);
});

test('Prestige-Aufstieg ohne genug Coins wird abgelehnt', async () => {
  const ctx = fakeCtx(['aufsteigen']);
  await cmd('prestige').run(ctx);
  assert.match(ctx.replies[0], /brauchst du/);
  assert.equal(await getPrestigeLevel(USER), 0);
});

test('Prestige-Aufstieg bucht Coins ab, erhöht Rang und Dauerbonus', async () => {
  await addCoins(USER, 6_000_000, 'Tester');
  const ctx = fakeCtx(['aufsteigen']);
  await cmd('prestige').run(ctx);
  assert.match(ctx.replies[0], /Rang \*1\*/);
  assert.equal(await getPrestigeLevel(USER), 1);
  const w = Number((await getWallet(USER)).balance);
  assert.ok(w < 1_100_000 && w >= 1_000_000, `nach Abbuchung 5 Mio: ${w}`);
  resetPrestigeCache();
  assert.equal(await getPrestigeMult(USER), 1.05);
  const earned = await earnCoins(USER, 1000, 'Tester');
  assert.equal(earned, 1050);
});

test('!bestenliste coins listet die Reichsten', async () => {
  await addCoins(USER, 50_000, 'Reich');
  await addCoins('492722222222@s.whatsapp.net', 10_000, 'Arm');
  const ctx = fakeCtx(['coins']);
  await cmd('bestenliste').run(ctx);
  assert.match(ctx.replies[0], /Reichste Spieler/);
  assert.match(ctx.replies[0], /🥇/);
});

test('!bestenliste prestige zeigt nur Spieler mit Rang > 0', async () => {
  await addCoins(USER, 6_000_000, 'Tester');
  await cmd('prestige').run(fakeCtx(['aufsteigen']));
  const ctx = fakeCtx(['prestige']);
  await cmd('bestenliste').run(ctx);
  assert.match(ctx.replies[0], /Prestige-Rang/);
  assert.match(ctx.replies[0], /Rang 1/);
});
