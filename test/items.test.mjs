// Testsuite für Shop 2.0 / Item-Engine / Boosts (node:test, lokale libsql-DB).
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
process.env.OWNER_NUMBERS = '491700000000';
process.env.DATABASE_URL = 'file:' + join(here, '..', '.test-items.db');
process.env.DATABASE_KEY = 'unused';

const { initDb, dbRun, dbRows } = await import('../src/db.js');
const { itemCommands, getQty } = await import('../src/commands/items.js');
const { addCoins, earnCoins, getWallet } = await import('../src/commands/economy.js');
const { getBoostMult, activateBoost, resetBoostCache } = await import('../src/boosts.js');
const shop = await import('../src/data/shop-items.js');

const USER = '491711111111@s.whatsapp.net';
const cmd = (n) => itemCommands.find((c) => c.name === n || c.aliases?.includes(n));

function fakeCtx(args, { sender = USER, name = 'Tester' } = {}) {
  const replies = [];
  return { chatJid: '9@g.us', sender, senderName: name, args, argText: args.join(' '),
    reply: (t) => { replies.push(t); return Promise.resolve(); }, replies };
}
async function reset() {
  for (const t of ['coins', 'inventory', 'user_boosts', 'user_titles']) await dbRun(`DELETE FROM ${t}`, []).catch(() => {});
  resetBoostCache();
}
before(async () => { await initDb(); });
beforeEach(reset);

test('Katalog hat mindestens 1500 Items', () => {
  assert.ok(shop.ITEM_COUNT >= 1500, `nur ${shop.ITEM_COUNT}`);
});

test('Preise liegen in der Spanne ihrer Seltenheit', () => {
  for (const it of shop.ITEMS.values()) {
    const r = shop.RARITIES[it.rarity];
    assert.ok(it.price >= r.min && it.price <= r.max, `${it.id} Preis ${it.price} außerhalb ${it.rarity}`);
    assert.ok(it.sell < it.price, `${it.id} Verkauf >= Kauf`);
  }
});

test('Kaufen bucht Coins ab und legt ins Inventar', async () => {
  await addCoins(USER, 10_000, 'Tester');
  const ctx = fakeCtx(['boost_xp_10_1h']);
  await cmd('kaufen').run(ctx);
  assert.equal(await getQty(USER, 'boost_xp_10_1h'), 1);
  const w = await getWallet(USER);
  // Frisches Wallet startet bei config.economy.startBalance (10.000), plus die
  // addCoins(10_000) oben, minus den Item-Preis (500).
  assert.equal(Number(w.balance), 10_000 + 10_000 - 500);
  assert.match(ctx.replies[0], /Gekauft/);
});

test('Kauf ohne genug Coins wird abgelehnt', async () => {
  const ctx = fakeCtx(['boost_coins_100_24h']);
  await cmd('kaufen').run(ctx);
  assert.match(ctx.replies[0], /kostet|nur/);
  assert.equal(await getQty(USER, 'boost_coins_100_24h'), 0);
});

test('Titel kaufen legt ihn direkt an und ist nicht doppelt kaufbar', async () => {
  await addCoins(USER, 5_000, 'Tester');
  await cmd('kaufen').run(fakeCtx(['title_kaffeejunkie']));
  const ut = await dbRows('SELECT title FROM user_titles WHERE user_jid = ?', [USER]);
  assert.equal(ut.length, 1);
  assert.match(ut[0].title, /Kaffee-Junkie/);
  const again = fakeCtx(['title_kaffeejunkie']);
  await cmd('kaufen').run(again);
  assert.match(again.replies[0], /schon/);
});

test('Boost benutzen verbraucht Item und aktiviert den Effekt', async () => {
  await addCoins(USER, 10_000, 'Tester');
  await cmd('kaufen').run(fakeCtx(['boost_xp_10_1h']));
  const ctx = fakeCtx(['boost_xp_10_1h']);
  await cmd('benutzen').run(ctx);
  assert.equal(await getQty(USER, 'boost_xp_10_1h'), 0, 'Item verbraucht');
  const mult = await getBoostMult(USER, 'xp');
  assert.ok(mult > 1, `Boost aktiv, mult=${mult}`);
  assert.match(ctx.replies[0], /Boost aktiv/);
});

test('earnCoins wendet Coin-Boost an, addCoins nicht', async () => {
  await activateBoost(USER, 'coins', 50, 1);
  const earned = await earnCoins(USER, 100, 'Tester');
  assert.equal(earned, 150);
  const before = Number((await getWallet(USER)).balance);
  await addCoins(USER, 100, 'Tester');
  const after = Number((await getWallet(USER)).balance);
  assert.equal(after - before, 100);
});

test('Verkaufen entfernt Item und schreibt Coins gut', async () => {
  await addCoins(USER, 10_000, 'Tester');
  await cmd('kaufen').run(fakeCtx(['boost_xp_10_1h']));
  const balBefore = Number((await getWallet(USER)).balance);
  const it = shop.getItem('boost_xp_10_1h');
  const ctx = fakeCtx(['boost_xp_10_1h']);
  await cmd('verkaufen').run(ctx);
  assert.equal(await getQty(USER, 'boost_xp_10_1h'), 0);
  const balAfter = Number((await getWallet(USER)).balance);
  assert.equal(balAfter - balBefore, it.sell);
});

test('Man kann nicht verkaufen, was man nicht besitzt', async () => {
  const ctx = fakeCtx(['boost_xp_10_1h']);
  await cmd('verkaufen').run(ctx);
  assert.match(ctx.replies[0], /besitzt/);
});

test('Abgelaufener Boost zählt nicht mehr', async () => {
  await dbRun('INSERT OR REPLACE INTO user_boosts (user_jid, type, mult, expires_at) VALUES (?, ?, ?, ?)',
    [USER, 'xp', 2, Date.now() - 1000]);
  resetBoostCache();
  assert.equal(await getBoostMult(USER, 'xp'), 1);
});

test('Shop-Übersicht und gefilterte Liste funktionieren', async () => {
  const overview = fakeCtx([]);
  await cmd('shop').run(overview);
  assert.match(overview.replies[0], /Shop 2\.0/);
  const legendary = fakeCtx(['sammler', 'legendär']);
  await cmd('shop').run(legendary);
  assert.match(legendary.replies[0], /Legendär/);
});
