// Regressionstests fuer die im vierten Audit bestaetigten Befunde.
//
// Jeder Test hier ist gegen den Stand VOR dem jeweiligen Fix rot — geprueft
// per `git stash`, nicht angenommen. Wo ein Befund nur im Zusammenspiel
// sichtbar wird (Express-Semantik gegen den Prozess-Handler, zwei
// Neustart-Pfade), geht der Test bewusst ueber HTTP gegen ein echtes
// createDashboard() statt gegen einen Mock.

import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

// VOR dem ersten Import von config.js setzen: die Zeitzone wird dort einmal
// eingelesen. node --test faehrt jede Testdatei in einem eigenen Prozess,
// das beeinflusst also keine andere Datei.
process.env.TZ = 'Europe/Berlin';
process.env.OWNER_NUMBERS = '491700000000';
process.env.ACCESS_SECRET = 'test-secret';
process.env.DATABASE_URL = 'file:' + join(root, '.test-regression4.db');
process.env.DATABASE_KEY = 'unused';

const { initDb, getDb, dbBatch, dayKey, todayKey, bufferXp, flushBuffers, wipeAllData } =
  await import('../src/db.js');
const { state, setShutdownHandler } = await import('../src/state.js');
const { setRegistry, suggestCommand } = await import('../src/router.js');
const { logger, getRecentLogs, setErrorSummarizer } = await import('../src/logger.js');
const { createDashboard } = await import('../src/dashboard.js');

before(async () => { await initDb(); });

// ── HTTP-Helfer: echtes Panel auf Port 0, echte Sitzung ─────────────

async function withPanel(fn) {
  const app = createDashboard();
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const port = server.address().port;
  const origin = `http://127.0.0.1:${port}`;
  try {
    const login = await fetch(`${origin}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: process.env.ACCESS_SECRET }),
    });
    const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
    return await fn({ origin, cookie });
  } finally {
    server.close();
  }
}

// ── C1: eine abgelehnte Promise beendet nicht mehr den Prozess ──────
//
// Express 4 leitet die Ablehnung eines async-Handlers NICHT an die
// Error-Middleware — sie wird zur unhandledRejection. In index.js haengt daran
// der Shutdown, also beendete ein Sendefehler im Panel den ganzen Bot.
// Ohne den asyncSafe-Wrapper stirbt dieser Testprozess an genau der Stelle
// (Node beendet sich bei unhandled rejections), statt eine 500 zu liefern.

test('C1: ein abgelehntes await in einer Panel-Route wird zu HTTP 500', async () => {
  const before = { connection: state.connection, stopped: state.stopped };
  // sendText() lehnt bei state.stopped sofort ab; die 409-Vorpruefung der Route
  // verlangt zugleich eine offene Verbindung. Genau diese Kombination tritt
  // real auf, wenn der Bot waehrend eines Panel-Sendens aufgibt.
  state.connection = 'open';
  state.stopped = true;
  try {
    const res = await withPanel(({ origin, cookie }) =>
      fetch(`${origin}/api/groups/4915100000001@g.us/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ text: 'Hallo' }),
      })
    );
    assert.equal(res.status, 500, 'Fehler muss in der Error-Middleware landen');
    const body = await res.json();
    assert.equal(body.error, 'Interner Fehler.');
  } finally {
    state.connection = before.connection;
    state.stopped = before.stopped;
  }
});

// ── H2: der Panel-Neustart geht ueber den gemeinsamen Shutdown-Pfad ──
//
// Vorher rief die Route direkt process.exit(0) — ohne flushAuth(), also unter
// Verlust der ausstehenden Signal-Keys ("Bad MAC" nach dem Neustart). Gegen den
// alten Stand beendet dieser Test den Testprozess, statt den Spion zu sehen.

test('H2: POST /api/restart laeuft ueber requestShutdown statt process.exit', async () => {
  let reason = null;
  setShutdownHandler((r) => { reason = r; });
  const res = await withPanel(({ origin, cookie }) =>
    fetch(`${origin}/api/restart`, { method: 'POST', headers: { Cookie: cookie } })
  );
  assert.equal(res.status, 200);
  assert.equal((await res.json()).ok, true);
  // Die Route antwortet sofort und plant das Herunterfahren danach ein.
  await new Promise((r) => setTimeout(r, 3300));
  assert.equal(reason, 'Panel-Neustart', 'der gemeinsame Shutdown-Pfad muss laufen');
});

// ── H3: der Tippfehler-Vorschlag kennt die echten Befehle ───────────
//
// SUGGEST_BASE wurde zur Importzeit aus der noch leeren registry gebaut. Der
// Vorschlag griff dadurch nie, und jeder Vertipper fiel auf den KI-Fallback
// durch — genau den Aufruf, den dieser Schritt sparen soll.

test('H3: suggestCommand findet einen echten Befehl nach setRegistry', () => {
  setRegistry([
    { name: 'hilfe', aliases: ['help'] },
    { name: 'ranking', aliases: [] },
    { name: 'geheim', aliases: [], hidden: true },
  ]);
  assert.equal(suggestCommand('hilfw'), 'hilfe');
  assert.equal(suggestCommand('rankng'), 'ranking');
  assert.equal(suggestCommand('helpp'), 'help', 'Aliasse zaehlen mit');
  assert.equal(suggestCommand('geheum'), null, 'hidden bleibt hidden');
});

// ── H4: der Config-Import loescht nichts mehr ───────────────────────
//
// INSERT OR REPLACE ersetzte die ganze Zeile; die nicht aufgezaehlten Spalten
// fielen auf ihren Default. Ein Backup einzuspielen zerstoerte damit Werte, die
// im Backup drinstanden — der Export schreibt SELECT *.

test('H4: der Import erhaelt Spalten, die er nicht selbst setzt', async () => {
  const jid = '4915100000042@g.us';
  await getDb().execute({ sql: 'DELETE FROM group_settings WHERE jid = ?', args: [jid] });
  await getDb().execute({
    sql: `INSERT INTO group_settings (jid, enabled, welcome_text, slowmode_secs, weekly_report, last_weekly_report)
          VALUES (?, 1, ?, 15, 1, ?)`,
    args: [jid, 'Willkommen!', '2026-08-16'],
  });

  const res = await withPanel(({ origin, cookie }) =>
    fetch(`${origin}/api/config/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      // Eine Datei, die diese vier Spalten nicht mitbringt — der haeufige Fall
      // eines von Hand gekuerzten oder aelteren Exports.
      body: JSON.stringify({
        data: { group_settings: [{ jid, enabled: 1, antilink: 1, blacklist_on: 1 }] },
      }),
    })
  );
  assert.equal(res.status, 200);

  const row = (await getDb().execute({
    sql: 'SELECT antilink, welcome_text, slowmode_secs, weekly_report, last_weekly_report FROM group_settings WHERE jid = ?',
    args: [jid],
  })).rows[0];

  assert.equal(Number(row.antilink), 1, 'der Import muss weiterhin schreiben');
  assert.equal(row.welcome_text, 'Willkommen!');
  assert.equal(Number(row.slowmode_secs), 15);
  assert.equal(Number(row.weekly_report), 1);
  assert.equal(row.last_weekly_report, '2026-08-16', 'sonst geht der Wochenreport erneut raus');
});

// ── M6: zwei ueberlappende Flushes zaehlen nicht doppelt ────────────
//
// Die Puffer-Eintraege werden erst NACH Promise.allSettled geloescht — ein
// zweiter Lauf las dieselben Eintraege und schrieb sie ein zweites Mal.

test('M6: parallele flushBuffers schreiben den Puffer genau einmal', async () => {
  const group = '4915100000007@g.us';
  const user = '491700000007@s.whatsapp.net';
  await getDb().execute({ sql: 'DELETE FROM xp WHERE group_jid = ?', args: [group] });

  bufferXp(group, user, 100, 'Max');
  await Promise.all([flushBuffers(), flushBuffers(), flushBuffers()]);

  const row = (await getDb().execute({
    sql: 'SELECT xp, messages FROM xp WHERE group_jid = ? AND user_jid = ?',
    args: [group, user],
  })).rows[0];
  assert.equal(Number(row.xp), 100);
  assert.equal(Number(row.messages), 1);
});

// ── M7: der Stapel-Schreibweg laeuft durch den Guard ────────────────
//
// wipeAllData() und die Gruppen-Upserts im Panel gingen an dbBatch vorbei
// direkt an den Client. Die Zusage "auth_creds/auth_keys sind unantastbar" ist
// nur so stark wie ihr schwaechster Schreibpfad.

test('M7: dbBatch blockt Schreibzugriffe auf die Auth-Tabellen', async () => {
  await assert.rejects(
    () => dbBatch([{ sql: 'DELETE FROM auth_keys WHERE id = ?', args: ['main:x'] }]),
    /geschützte Session-Tabellen/
  );
  await assert.rejects(
    () => dbBatch([
      { sql: 'INSERT INTO xp (group_jid, user_jid) VALUES (?, ?)', args: ['g', 'u'] },
      { sql: "INSERT OR REPLACE INTO auth_creds (id, data) VALUES ('main', 'x')", args: [] },
    ]),
    /geschützte Session-Tabellen/,
    'auch als zweite Anweisung im Stapel'
  );
});

// ── M8: die KI-Zusammenfassung ist sichtbar statt weggeworfen ───────

test('M8: das Ergebnis des ErrorSummarizer landet im Ring-Puffer', async () => {
  setErrorSummarizer(async () => 'Turso war kurz nicht erreichbar.');
  try {
    logger.error(new Error('ECONNRESET'), 'TestKontext');
    await new Promise((r) => setTimeout(r, 50));
    const hit = getRecentLogs().find((l) => String(l.msg).includes('Turso war kurz nicht erreichbar.'));
    assert.ok(hit, 'die Zusammenfassung muss in der Log-Ansicht auftauchen');
    assert.equal(hit.level, 'info');
    assert.match(String(hit.context), /^ai-summary/);
  } finally {
    setErrorSummarizer(async () => null);
  }
});

// ── M9: der Erreichbarkeitstest verbraucht keine Tokens ─────────────
//
// Vorher lief bei jedem Start (und bei jedem Panel-Wipe) ein echtes
// generateContent mit dem Text "ping" — abrechenbar und nirgends mitgezaehlt.

test('M9: initAiUsage prueft per GET, nicht per generateContent', async () => {
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), method: opts.method || 'GET', body: opts.body });
    return { ok: true, status: 200, json: async () => ({}) };
  };
  process.env.GEMINI_API_KEY = 'test-key';
  try {
    const { initAiUsage } = await import('../src/ai.js');
    await initAiUsage();
    assert.ok(calls.length > 0, 'es muss geprueft werden');
    for (const c of calls) {
      assert.equal(c.method, 'GET');
      assert.ok(!c.url.includes(':generateContent'), 'kein abrechenbarer Modellaufruf');
      assert.ok(!c.body, 'kein Prompt im Rumpf');
      assert.ok(!c.url.includes('test-key'), 'der Schluessel gehoert nicht in die URL');
    }
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.GEMINI_API_KEY;
  }
});

// ── M10: die Log-Ansicht bekommt die volle Ringgroesse ──────────────

test('M10: getRecentLogs liefert standardmaessig die konfigurierte Ringgroesse', () => {
  for (let i = 0; i < 120; i++) logger.info(`Zeile ${i}`, 'RingTest');
  const logs = getRecentLogs();
  assert.ok(logs.length > 50, `erwartet mehr als 50 Zeilen, bekommen: ${logs.length}`);
  assert.ok(logs.some((l) => l.msg === 'Zeile 0'), 'auch die aelteste der 120 Zeilen');
});

// ── M11: wipeAllData meldet, wie viel es geleert hat ────────────────
//
// Ohne return stand im Audit-Log "undefined Tabellen geleert".

test('M11: wipeAllData liefert die Zahl der geleerten Tabellen', async () => {
  const count = await wipeAllData();
  assert.equal(typeof count, 'number');
  assert.ok(count > 0);
  const { DATA_TABLES, PROTECTED_TABLES_SET } = await import('../src/core/database/schema.js');
  assert.equal(count, DATA_TABLES.filter((t) => !PROTECTED_TABLES_SET.has(t)).length);
});

test('M11: die Auth-Tabellen ueberstehen den Wipe', async () => {
  await getDb().execute({ sql: "INSERT OR REPLACE INTO auth_creds (id, data) VALUES ('wipe-test', '{}')", args: [] });
  await wipeAllData();
  const rows = (await getDb().execute({ sql: 'SELECT id FROM auth_creds WHERE id = ?', args: ['wipe-test'] })).rows;
  assert.equal(rows.length, 1, 'die Session darf ein Wipe niemals treffen');
  await getDb().execute({ sql: 'DELETE FROM auth_creds WHERE id = ?', args: ['wipe-test'] });
});

// ── M12: Tagesschluessel folgen der Zeitzone, nicht UTC ─────────────
//
// config.js setzt TZ=Europe/Berlin, die Schluessel kamen aber aus
// toISOString(). Zwischen 00:00 und 02:00 lokal landeten Nachrichten auf dem
// Vortag und das KI-Tageslimit sprang um 02:00.

test('M12: dayKey rechnet in der konfigurierten Zeitzone (Sommerzeit)', () => {
  // 22:30 UTC ist in Berlin bereits 00:30 des Folgetags (MESZ, +2).
  const d = new Date('2026-08-20T22:30:00Z');
  assert.equal(d.toISOString().slice(0, 10), '2026-08-20', 'UTC saehe den Vortag');
  assert.equal(dayKey(d), '2026-08-21');
});

test('M12: dayKey rechnet auch in der Winterzeit richtig', () => {
  // 23:30 UTC ist in Berlin 00:30 des Folgetags (MEZ, +1).
  const d = new Date('2026-01-15T23:30:00Z');
  assert.equal(d.toISOString().slice(0, 10), '2026-01-15');
  assert.equal(dayKey(d), '2026-01-16');
});

test('M12: todayKey hat weiterhin das sortierbare YYYY-MM-DD-Format', () => {
  assert.match(todayKey(), /^\d{4}-\d{2}-\d{2}$/);
});
