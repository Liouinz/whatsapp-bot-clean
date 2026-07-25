// Testsuite für das "Wer wird Millionär?"-System (node:test, keine Extra-Deps).
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
process.env.OWNER_NUMBERS = '491700000000';
process.env.DATABASE_URL = 'file:' + join(here, '..', '.test-millionaire.db');
process.env.DATABASE_KEY = 'unused';

const { initDb, dbRun, dbRows } = await import('../src/db.js');
const { millionaireCommands, checkMillionaireAnswer, loadActiveMillionaire, _peekGame } =
  await import('../src/commands/millionaer.js');

const CHAT = '999@g.us';
const USER = '491711111111@s.whatsapp.net';
const LETTERS = ['A', 'B', 'C', 'D'];
const cmd = (n) => millionaireCommands.find((c) => c.name === n || c.aliases?.includes(n));

function fakeCtx(text, { chat = CHAT, sender = USER, name = 'Tester' } = {}) {
  const replies = [];
  return {
    chatJid: chat, sender, senderName: name, text,
    reply: (t) => { replies.push(t); return Promise.resolve(); },
    replies,
  };
}

async function resetAll() {
  for (const t of ['millionaire_games', 'millionaire_daily', 'coins', 'xp', 'game_scores']) {
    await dbRun(`DELETE FROM ${t}`, []).catch(() => {});
  }
  await loadActiveMillionaire();
}

before(async () => { await initDb(); });
beforeEach(resetAll);

test('Start legt ein Spiel an und zeigt Frage 1', async () => {
  const ctx = fakeCtx('!millionär');
  await cmd('millionär').run(ctx);
  const s = _peekGame(CHAT);
  assert.ok(s, 'Spielzustand existiert');
  assert.equal(s.level, 0);
  assert.match(ctx.replies[0], /Frage \*1\/15\*/);
  assert.match(ctx.replies[0], /\*50\* 🪙/);
});

test('Richtige Antwort steigt eine Stufe auf', async () => {
  await cmd('millionär').run(fakeCtx('!millionär'));
  const s = _peekGame(CHAT);
  const correctLetter = LETTERS[s.q.correct];
  const ctx = fakeCtx(correctLetter);
  const consumed = await checkMillionaireAnswer(ctx);
  assert.equal(consumed, true);
  assert.equal(_peekGame(CHAT).level, 1);
  assert.match(ctx.replies[0], /Richtig/);
});

test('Falsche Antwort beendet das Spiel', async () => {
  await cmd('millionär').run(fakeCtx('!millionär'));
  const s = _peekGame(CHAT);
  const wrongLetter = LETTERS[[0, 1, 2, 3].find((i) => i !== s.q.correct)];
  const ctx = fakeCtx(wrongLetter);
  await checkMillionaireAnswer(ctx);
  assert.equal(_peekGame(CHAT), undefined, 'Spiel wurde beendet');
  assert.match(ctx.replies[0], /Leider falsch/);
});

test('50/50-Joker entfernt genau zwei falsche Optionen', async () => {
  await cmd('millionär').run(fakeCtx('!millionär'));
  const ctx = fakeCtx('!5050');
  await cmd('5050').run(ctx);
  const s = _peekGame(CHAT);
  assert.equal(s.q.elim.length, 2);
  assert.ok(!s.q.elim.includes(s.q.correct), 'richtige Option bleibt erhalten');
  assert.equal(s.used5050, true);
  const ctx2 = fakeCtx('!5050');
  await cmd('5050').run(ctx2);
  assert.match(ctx2.replies[0], /schon verbraucht/);
});

test('Hinweis-Joker gibt einen Tipp und ist einmalig', async () => {
  await cmd('millionär').run(fakeCtx('!millionär'));
  const ctx = fakeCtx('!hinweis');
  await cmd('hinweis').run(ctx);
  assert.match(ctx.replies[0], /Hinweis:/);
  assert.equal(_peekGame(CHAT).usedHint, true);
});

test('Aussteigen zahlt gesicherten Gewinn und beendet das Spiel', async () => {
  await cmd('millionär').run(fakeCtx('!millionär'));
  let s = _peekGame(CHAT);
  await checkMillionaireAnswer(fakeCtx(LETTERS[s.q.correct]));
  const ctx = fakeCtx('!aufhören');
  await cmd('aufhören').run(ctx);
  assert.equal(_peekGame(CHAT), undefined);
  assert.match(ctx.replies[0], /sichert sich \*50\*/);
  const wallet = await dbRows('SELECT balance FROM coins WHERE user_jid = ?', [USER]);
  assert.ok(Number(wallet[0].balance) >= 50, 'Gewinn wurde ausgezahlt');
});

test('Tageslimit: zweite Runde am selben Tag wird blockiert', async () => {
  await cmd('millionär').run(fakeCtx('!millionär'));
  await cmd('aufhören').run(fakeCtx('!aufhören'));
  const ctx = fakeCtx('!millionär');
  await cmd('millionär').run(ctx);
  assert.match(ctx.replies[0], /heute schon gespielt/);
  assert.equal(_peekGame(CHAT), undefined);
});

test('Nur der Spieler darf antworten', async () => {
  await cmd('millionär').run(fakeCtx('!millionär'));
  const s = _peekGame(CHAT);
  const other = fakeCtx(LETTERS[s.q.correct], { sender: '492722222222@s.whatsapp.net' });
  const consumed = await checkMillionaireAnswer(other);
  assert.equal(consumed, false, 'fremde Antwort wird ignoriert');
  assert.equal(_peekGame(CHAT).level, 0, 'Stufe unverändert');
});

test('Restart-Fest: Spiel überlebt loadActiveMillionaire()', async () => {
  await cmd('millionär').run(fakeCtx('!millionär'));
  const before = _peekGame(CHAT);
  await loadActiveMillionaire();
  const after = _peekGame(CHAT);
  assert.ok(after, 'Spiel nach Reload wieder da');
  assert.equal(after.level, before.level);
  assert.equal(after.q.qi, before.q.qi);
  assert.equal(after.userJid, before.userJid);
});

test('Kein Spiel aktiv → Antwort-Hook macht nichts (kein DB-Zugriff nötig)', async () => {
  const consumed = await checkMillionaireAnswer(fakeCtx('B'));
  assert.equal(consumed, false);
});
