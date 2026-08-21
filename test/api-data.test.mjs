// Control API v1 — Validierung, Blaetterung, Datenendpunkte, Nebenlaeufigkeit.
//
// Trennung zur Datei api-auth.test.mjs ist Absicht: dort wird das
// Anmelde-Kontingent bewusst leergefahren, und beide Dateien laufen in eigenen
// Prozessen mit eigener Datenbank. Hier wird genau einmal angemeldet.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const SECRET = 'daten-test-secret-lang-genug';

process.env.TZ = 'Europe/Berlin';
process.env.ACCESS_SECRET = SECRET;
process.env.OWNER_NUMBERS = '491700000000';
process.env.DATABASE_URL = 'file:' + join(root, '.test-apidata.db');
process.env.DATABASE_KEY = 'unused';

const { initDb, getDb } = await import('../src/db.js');
const { createDashboard } = await import('../src/dashboard.js');

let server;
let base;
let token;

const api = (path, opts = {}) =>
  fetch(`${base}/api/v1${path}`, {
    ...opts,
    headers: {
      'content-type': 'application/json',
      ...(opts.noAuth ? {} : { authorization: `Bearer ${token}` }),
      ...(opts.headers || {}),
    },
    body: opts.json !== undefined ? JSON.stringify(opts.json) : opts.body,
  });

before(async () => {
  await initDb();
  const db = getDb();
  for (const t of ['api_tokens', 'api_sessions', 'api_users', 'xp', 'members', 'contacts']) {
    await db.execute({ sql: `DELETE FROM ${t}`, args: [] });
  }
  // Etwas Bestand, damit die Suche echte Treffer hat.
  for (let i = 0; i < 7; i++) {
    await db.execute({
      sql: 'INSERT INTO xp (group_jid, user_jid, xp, messages, name) VALUES (?, ?, ?, ?, ?)',
      args: ['4915100000900@g.us', `49170000${1000 + i}@s.whatsapp.net`, 100 * i, i, `Person ${i}`],
    });
    await db.execute({
      sql: 'INSERT INTO members (group_jid, user_jid, push_name, last_seen) VALUES (?, ?, ?, ?)',
      args: ['4915100000900@g.us', `49170000${1000 + i}@s.whatsapp.net`, `Person ${i}`, Date.now()],
    });
  }

  server = createDashboard().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;

  const res = await api('/auth/login', { method: 'POST', noAuth: true, json: { username: 'owner', password: SECRET } });
  assert.equal(res.status, 200);
  token = (await res.json()).accessToken;
});

after(() => server?.close());

// ── Health, oeffentlich ────────────────────────────────────────────

test('/health ist ohne Anmeldung erreichbar und nennt keine Zahlen', async () => {
  const res = await api('/health', { noAuth: true });
  // Ohne WhatsApp-Verbindung ist der Bot nicht bereit — 503 ist hier richtig.
  assert.ok([200, 503].includes(res.status), `unerwarteter Status ${res.status}`);
  const body = await res.json();
  assert.equal(typeof body.ready, 'boolean');
  assert.equal(body.live, true);
  for (const key of ['process', 'database', 'whatsapp', 'ai', 'queue']) {
    assert.ok(body.checks[key], `Pruefung ${key} fehlt`);
    assert.deepEqual(Object.keys(body.checks[key]), ['status'],
      `${key} verraet mehr als den Zustand — /health ist oeffentlich`);
  }
  const text = JSON.stringify(body);
  assert.ok(!/latencyMs|pending|used|limit/.test(text), 'keine Kennzahlen im oeffentlichen Health');
});

test('/health/details liefert die Kennzahlen nur mit Anmeldung', async () => {
  assert.equal((await api('/health/details', { noAuth: true })).status, 401);
  const res = await api('/health/details');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(typeof body.checks.database.latencyMs, 'number');
  assert.equal(body.checks.database.status, 'up', 'die Testdatenbank muss erreichbar sein');
});

test('ein 503 von /health ist kein Fehler im Log', async () => {
  // /health meldet 503, solange der Bot nicht mit WhatsApp verbunden ist —
  // das ist die Aussage des Endpunkts, kein Stoerfall. Wuerde das Zugriffs-Log
  // daraus einen Fehler machen, liefe der Ring-Puffer mit jedem Health-Check
  // voll UND der KI-Fehlerzusammenfasser wuerde Kontingent verbrennen.
  const { getRecentLogs } = await import('../src/logger.js');
  const vorher = getRecentLogs(500).filter((e) => e.context === 'api' && ['warn', 'error'].includes(e.level)).length;

  for (let i = 0; i < 10; i++) await api('/health', { noAuth: true });

  const nachher = getRecentLogs(500).filter((e) => e.context === 'api' && ['warn', 'error'].includes(e.level)).length;
  assert.equal(nachher, vorher, 'Health-Checks duerfen keine Warn- oder Fehlerzeilen erzeugen');
});

test('/version ist oeffentlich und nennt Bot- und API-Version', async () => {
  const res = await api('/version', { noAuth: true });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.match(body.version, /^\d+\.\d+\.\d+/);
  assert.equal(body.api, 'v1');
});

// ── Keine Geheimnisse nach draussen ────────────────────────────────

test('/settings gibt niemals Zugangsdaten heraus', async () => {
  const res = await api('/settings');
  assert.equal(res.status, 200);
  const text = JSON.stringify(await res.json());
  for (const leak of [SECRET, 'unused', 'DATABASE_KEY', 'accessSecret', 'databaseKey', 'geminiApiKey', 'file:']) {
    assert.ok(!text.includes(leak), `"${leak}" steht in der Einstellungs-Antwort`);
  }
});

test('/system meldet nur Gemessenes, keine erfundenen Werte', async () => {
  const res = await api('/system');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.memory.rssBytes > 0);
  assert.ok(body.uptimeSeconds >= 0);
  // cpuPercent darf null sein, wenn seit der letzten Messung zu wenig Zeit
  // vergangen ist — das ist ehrlicher als eine ausgedachte Zahl.
  assert.ok(body.cpuPercent === null || typeof body.cpuPercent === 'number');
});

// ── Eingabepruefung ────────────────────────────────────────────────

test('falsche Typen ergeben 400 mit Feldhinweis, nie 500', async () => {
  const faelle = [
    ['/auth/login', { username: ['owner'], password: SECRET }],
    ['/auth/login', { username: 'owner', password: { toString: () => SECRET } }],
    ['/auth/login', { username: 'owner' }],
    ['/auth/refresh', { refreshToken: 12345 }],
    ['/auth/users', { username: 'x', password: 'kurz', role: 'owner' }],
    ['/auth/users', { username: 'gut', password: 'ein-langes-passwort', role: 'gott' }],
  ];
  for (const [path, json] of faelle) {
    const res = await api(path, { method: 'POST', json });
    assert.ok(res.status === 400 || res.status === 401 || res.status === 403,
      `${path} mit ${JSON.stringify(json)} lieferte ${res.status}`);
    assert.notEqual(res.status, 500, `${path} lieferte 500 statt einer Eingabepruefung`);
  }
});

test('ein Anfragekoerper, der kein Objekt ist, wird abgewiesen', async () => {
  for (const body of ['"nur ein string"', '[1,2,3]', '42', 'null']) {
    const res = await api('/auth/login', { method: 'POST', noAuth: true, body });
    assert.ok(res.status >= 400 && res.status < 500, `Body ${body} lieferte ${res.status}`);
  }
});

test('kaputtes JSON ergibt 400, nicht 500', async () => {
  const res = await api('/auth/login', { method: 'POST', noAuth: true, body: '{kaputt' });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, 'BAD_REQUEST');
});

test('ein zu grosser Anfragekoerper wird abgewiesen', async () => {
  const res = await api('/auth/login', {
    method: 'POST', noAuth: true,
    body: JSON.stringify({ username: 'owner', password: 'x'.repeat(400_000) }),
  });
  assert.ok([400, 413].includes(res.status), `lieferte ${res.status}`);
  assert.notEqual(res.status, 500);
});

test('unbekannte Felder werden verworfen, nicht durchgereicht', async () => {
  // Mass Assignment: role und id duerfen aus dem Body nicht wirken.
  const res = await api('/auth/users', {
    method: 'POST',
    json: {
      username: 'massassign', password: 'ein-langes-passwort-hier', role: 'viewer',
      id: 'usr_gefaelscht', disabled: 0, permissions: ['bot.control'], __proto__: { boese: true },
    },
  });
  assert.equal(res.status, 201);
  const created = (await res.json()).user;
  assert.notEqual(created.id, 'usr_gefaelscht', 'die ID kommt vom Server');
  assert.equal(created.role, 'viewer');
  assert.ok(!created.permissions.includes('bot.control'));
  assert.equal({}.boese, undefined, 'Prototype Pollution');
});

test('unsinnige Pfad-Parameter ergeben 400, nicht 500', async () => {
  for (const jid of ['../../etc/passwd', 'nicht-valide', 'x'.repeat(400), '%00', "1' OR '1'='1"]) {
    const res = await api(`/users/${encodeURIComponent(jid)}`);
    assert.ok(res.status >= 400 && res.status < 500, `${jid} lieferte ${res.status}`);
    assert.notEqual(res.status, 500);
  }
  for (const jid of ['nicht@g.us', '../x@g.us', 'abc']) {
    const res = await api(`/groups/${encodeURIComponent(jid)}/members`);
    assert.ok(res.status >= 400 && res.status < 500, `${jid} lieferte ${res.status}`);
  }
});

// ── Blaetterung und Antwortgroesse ─────────────────────────────────

test('die Nutzersuche deckelt limit und klemmt die Seite', async () => {
  const res = await api('/users?limit=99999&page=99999&filter=all');
  assert.equal(res.status, 200);
  const { users, pagination } = await res.json();
  assert.ok(pagination.limit <= 100, `limit war ${pagination.limit}`);
  assert.ok(pagination.page <= pagination.pages);
  assert.ok(users.length <= 100);
});

test('Blaettern liefert unterschiedliche, nicht ueberlappende Seiten', async () => {
  const p1 = await (await api('/users?filter=all&limit=3&page=1&sort=name')).json();
  const p2 = await (await api('/users?filter=all&limit=3&page=2&sort=name')).json();
  assert.equal(p1.users.length, 3);
  assert.ok(p1.pagination.total >= 7);
  const overlap = p1.users.map((u) => u.jid).filter((j) => p2.users.some((u) => u.jid === j));
  assert.deepEqual(overlap, [], 'Seite 1 und 2 duerfen sich nicht ueberschneiden');
});

test('LIKE-Platzhalter in der Suche sind entschaerft', async () => {
  const res = await api(`/users?q=${encodeURIComponent('%_%')}&filter=all`);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).users.length, 0, '% darf keine Wildcard sein');
});

test('ein zu kurzer Suchbegriff wird abgewiesen', async () => {
  const res = await api('/users?q=a&filter=all');
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, 'VALIDATION_FAILED');
});

test('ein manipulierter Sortierschluessel wird abgewiesen, nicht eingesetzt', async () => {
  const res = await api(`/users?filter=all&sort=${encodeURIComponent('xp; DROP TABLE xp--')}`);
  assert.equal(res.status, 400);
  // Und die Tabelle steht noch.
  const rows = (await getDb().execute('SELECT COUNT(*) AS c FROM xp')).rows;
  assert.ok(Number(rows[0].c) >= 7);
});

test('die Log-Ansicht blaettert und filtert nach Stufe', async () => {
  const res = await api('/logs?limit=5&level=warn');
  assert.equal(res.status, 200);
  const { logs, pagination } = await res.json();
  assert.ok(logs.length <= 5);
  assert.ok(pagination.limit <= 200);
  for (const entry of logs) {
    assert.ok(['warn', 'error'].includes(entry.level), `Stufe ${entry.level} gehoert nicht zu level=warn`);
    assert.ok(!/\n\s+at\s/.test(entry.message), 'Stacktraces duerfen nicht ungekuerzt heraus');
  }
});

// ── Bot-Steuerung: Nebenlaeufigkeit ────────────────────────────────
//
// Diese Tests stehen am Ende: der erste Neustart setzt eine Sperre von 60
// Sekunden, danach antwortet die Route bewusst mit 409.

test('drei gleichzeitige Neustart-Anfragen loesen genau einen Neustart aus', async () => {
  const [a, b, c] = await Promise.all([
    api('/bot/restart', { method: 'POST', json: {} }),
    api('/bot/restart', { method: 'POST', json: {} }),
    api('/bot/restart', { method: 'POST', json: {} }),
  ]);
  const codes = [a.status, b.status, c.status].sort();
  assert.equal(codes.filter((s) => s === 202).length, 1,
    `genau eine Anfrage darf angenommen werden, bekam: ${codes.join(',')}`);
  assert.equal(codes.filter((s) => s === 409).length, 2, 'die anderen beiden muessen 409 bekommen');
});

test('die Neustart-Sperre haelt weitere Anfragen zurueck', async () => {
  const res = await api('/bot/restart', { method: 'POST', json: {} });
  assert.equal(res.status, 409);
  assert.equal((await res.json()).error.code, 'CONFLICT');
});

// ── Fehler NACH gesendeter Antwort ─────────────────────────────────

test('ein Fehler nach dem Senden der Antwort reisst nichts mit', async () => {
  // Gebaut wird eine winzige eigene App: eine Route, die erst antwortet und
  // danach wirft. Genau dieses Muster hat /bot/restart (202, dann
  // herunterfahren) — alles, was in dem Fenster schiefgeht, landet im
  // Fehlerhandler, wenn die Antwort laengst unterwegs ist. Ohne den
  // headersSent-Wachter wuerde dort ein zweiter Fehler entstehen und den
  // eigentlichen verschlucken.
  const express = (await import('express')).default;
  const { errorHandler } = await import('../src/api/errors.js');
  const { apiRouter } = await import('../src/api/router.js');

  const protokoll = [];
  const app = express();
  const mini = apiRouter();
  mini.get('/spaet', async (_req, res) => {
    res.json({ ok: true });
    throw new Error('nach dem Senden');
  });
  mini.use(errorHandler((e, ctx) => protokoll.push(`${e?.message} | ${ctx}`)));
  app.use('/x', mini);

  const srv = app.listen(0);
  await new Promise((r) => srv.once('listening', r));
  try {
    const res = await fetch(`http://127.0.0.1:${srv.address().port}/x/spaet`);
    assert.equal(res.status, 200, 'die bereits gesendete Antwort bleibt gueltig');
    assert.deepEqual(await res.json(), { ok: true });

    await new Promise((r) => setTimeout(r, 50));
    assert.equal(protokoll.length, 1, 'der Fehler muss protokolliert werden');
    assert.match(protokoll[0], /Antwort bereits gesendet/);
  } finally {
    srv.close();
  }
});
