// Regressionstests fuer die in Phase 1 gefundenen Laufzeitfehler.
//
// Der Kern: die XP-/Level-Rechnung hatte KEINEN einzigen Test. Deshalb sind
// 126 gruene Tests daran vorbeigelaufen, waehrend !rank und !profil im Chat
// "Level undefined" und "undefined/undefined XP" ausgegeben haben.
//
// Die Command-Tests hier fuehren die echten run()-Handler gegen eine echte DB
// aus und pruefen den fertigen Antworttext — nicht die Interna. Genau so faellt
// ein kaputter Vertrag zwischen Funktion und Aufrufer auf.

import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
process.env.TZ = 'Europe/Berlin';
process.env.OWNER_NUMBERS = '491700000000';
process.env.DATABASE_URL = 'file:' + join(root, '.test-phase1.db');
process.env.DATABASE_KEY = 'unused';

const { initDb, getDb, levelProgress, xpToLevel, totalXpForLevel } = await import('../src/db.js');
const { levelCommands } = await import('../src/commands/levels.js');
const { profileCommands } = await import('../src/commands/profile.js');

const GROUP = '4915100000900@g.us';
const USER = '491700000900@s.whatsapp.net';

before(async () => { await initDb(); });
beforeEach(async () => {
  for (const t of ['xp', 'user_profiles', 'warnings']) {
    await getDb().execute({ sql: `DELETE FROM ${t}`, args: [] });
  }
});

/** Minimaler ctx nach dem Vertrag aus router.js makeCtx(). */
function makeTestCtx({ args = [], sender = USER, chatJid = GROUP } = {}) {
  const sent = [];
  return {
    sent,
    chatJid,
    sender,
    senderName: 'Testnutzer',
    args,
    argText: args.join(' '),
    isGroup: true,
    senderIds: [sender],
    targetUser: () => null,
    mentionTag: (jid) => `@${String(jid).split('@')[0]}`,
    reply: (t) => { sent.push(t); return Promise.resolve(); },
  };
}

const byName = (list, name) => list.find((c) => c.name === name);

// ── levelProgress: der Vertrag selbst ───────────────────────────────

test('levelProgress liefert level, needed und progress als Zahlen', () => {
  const r = levelProgress(450);
  for (const key of ['level', 'currentLevelXp', 'nextLevelXp', 'needed', 'progress']) {
    assert.equal(typeof r[key], 'number', `${key} fehlt oder ist keine Zahl`);
    assert.ok(Number.isFinite(r[key]), `${key} ist nicht endlich`);
  }
});

test('levelProgress ist in sich stimmig', () => {
  for (const xp of [0, 1, 99, 100, 300, 450, 601, 5000, 123456]) {
    const { level, currentLevelXp, nextLevelXp, needed, progress } = levelProgress(xp);
    assert.equal(level, xpToLevel(xp), `level passt nicht zu xpToLevel bei ${xp}`);
    assert.equal(currentLevelXp, totalXpForLevel(level));
    assert.equal(nextLevelXp, totalXpForLevel(level + 1));
    assert.equal(needed, nextLevelXp - currentLevelXp);
    assert.equal(progress, xp - currentLevelXp);
    assert.ok(progress >= 0 && progress < needed, `Fortschritt ausserhalb der Stufe bei ${xp}`);
  }
});

test('levelProgress: 450 XP sind Level 2, 150 von 300', () => {
  const { level, progress, needed } = levelProgress(450);
  assert.deepEqual({ level, progress, needed }, { level: 2, progress: 150, needed: 300 });
});

// ── Die Befehle selbst: kein undefined, kein NaN im Antworttext ─────

test('!rank gibt weder undefined noch NaN aus', async () => {
  await getDb().execute({
    sql: 'INSERT INTO xp (group_jid, user_jid, xp, messages, name) VALUES (?, ?, ?, ?, ?)',
    args: [GROUP, USER, 450, 42, 'Testnutzer'],
  });
  const ctx = makeTestCtx();
  await byName(levelCommands, 'rank').run(ctx);
  const text = ctx.sent.join('\n');
  assert.ok(text.length, 'es muss geantwortet werden');
  assert.ok(!/undefined/.test(text), `undefined in der Antwort:\n${text}`);
  assert.ok(!/NaN/.test(text), `NaN in der Antwort:\n${text}`);
  assert.match(text, /Level: \*2\*/);
  assert.match(text, /Bis Level 3:/);
  assert.match(text, /150\/300/);
});

test('!profil gibt weder undefined noch NaN aus', async () => {
  await getDb().execute({
    sql: 'INSERT INTO xp (group_jid, user_jid, xp, messages, name) VALUES (?, ?, ?, ?, ?)',
    args: [GROUP, USER, 450, 42, 'Testnutzer'],
  });
  const ctx = makeTestCtx();
  await byName(profileCommands, 'profil').run(ctx);
  const text = ctx.sent.join('\n');
  assert.ok(text.length, 'es muss geantwortet werden');
  assert.ok(!/undefined/.test(text), `undefined in der Antwort:\n${text}`);
  assert.ok(!/NaN/.test(text), `NaN in der Antwort:\n${text}`);
  assert.match(text, /Level \*2\*/);
  assert.match(text, /150\/300 XP/);
});

test('!profil funktioniert auch ganz ohne XP-Zeile', async () => {
  const ctx = makeTestCtx();
  await byName(profileCommands, 'profil').run(ctx);
  const text = ctx.sent.join('\n');
  assert.ok(!/undefined|NaN/.test(text), `undefined/NaN bei 0 XP:\n${text}`);
  assert.match(text, /Level \*0\*/);
});

// ── profil-setzen: Schluessel und Name ──────────────────────────────

test('profil-setzen speichert unter derselben JID, die !profil liest', async () => {
  const ctx = makeTestCtx({ args: ['wohnort', 'Berlin'] });
  await byName(profileCommands, 'profil-setzen').run(ctx);

  const rows = (await getDb().execute('SELECT user_jid, name, location FROM user_profiles')).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].location, 'Berlin');
  assert.equal(rows[0].user_jid, USER, 'muss unter der aufgeloesten PN-JID liegen');
  assert.notEqual(rows[0].name, 'Unbekannt', 'die Namens-Attrappe darf nicht mehr geschrieben werden');
  assert.equal(rows[0].name, 'Testnutzer');

  // Und die Leseseite findet es auch wirklich wieder.
  const show = makeTestCtx();
  await byName(profileCommands, 'profil').run(show);
  assert.match(show.sent.join('\n'), /Wohnort: Berlin/);
});

test('profil-setzen weist ein unbekanntes Feld ab', async () => {
  const ctx = makeTestCtx({ args: ['lieblingsfarbe', 'blau'] });
  await byName(profileCommands, 'profil-setzen').run(ctx);
  assert.match(ctx.sent.join('\n'), /Gueltige Felder/);
  const rows = (await getDb().execute('SELECT COUNT(*) AS c FROM user_profiles')).rows;
  assert.equal(Number(rows[0].c), 0, 'nichts darf geschrieben worden sein');
});

// ── Altlasten-Tabellen: nicht mehr anlegen, aber auch nichts zerstoeren ──

test('eine frische Datenbank legt keine Legacy-Tabelle mehr an', async () => {
  const { LEGACY_TABLES } = await import('../src/core/database/schema.js');
  const rows = (await getDb().execute("SELECT name FROM sqlite_master WHERE type = 'table'")).rows;
  const names = rows.map((r) => String(r.name));
  const leaked = names.filter((n) => LEGACY_TABLES.includes(n));
  assert.deepEqual(leaked, [], `Legacy-Tabellen wurden angelegt: ${leaked.join(', ')}`);
});

test('der Wipe leert Altlasten mit, laesst die Tabellen aber stehen', async () => {
  const { wipeAllData } = await import('../src/db.js');
  const db = getDb();
  // Eine alte Datenbank nachstellen, wie sie vor der Feature-Entfernung entstand.
  await db.execute('CREATE TABLE IF NOT EXISTS coins (user_jid TEXT PRIMARY KEY, balance INTEGER)');
  await db.execute("INSERT OR REPLACE INTO coins VALUES ('u@s.whatsapp.net', 9999)");
  await db.execute("INSERT OR REPLACE INTO auth_creds (id, data) VALUES ('phase1', 'SESSION')");

  await wipeAllData();

  assert.equal(Number((await db.execute('SELECT COUNT(*) AS c FROM coins')).rows[0].c), 0,
    'Altdaten muessen mitgeleert werden');
  assert.equal(
    (await db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='coins'")).rows.length,
    1, 'die Tabelle selbst darf NICHT geloescht werden — das waere eine destruktive Migration');
  assert.equal(
    Number((await db.execute("SELECT COUNT(*) AS c FROM auth_creds WHERE id='phase1'")).rows[0].c),
    1, 'die WhatsApp-Session ueberlebt jeden Wipe');

  await db.execute('DROP TABLE coins');
  await db.execute("DELETE FROM auth_creds WHERE id = 'phase1'");
});
