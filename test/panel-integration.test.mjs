// Integrationstest fuer das Panel: echtes createDashboard() auf einem freien
// Port, echte Datenbank, echte HTTP-Anfragen. Keine Mocks.
//
// Diese Datei ist aus einem Rauchtest entstanden, der zwei echte Fehler gefunden
// hat, die der Unit-Testbestand nicht sah:
//   1. `confirm: ["LÖSCHEN"]` leerte die komplette Datenbank, weil
//      String(['LÖSCHEN']) === 'LÖSCHEN' ist.
//   2. Die Tabelle `afk` wurde abgefragt, aber nie angelegt.
// Beides faellt nur auf, wenn man das Panel wirklich startet und anspricht.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const SECRET = 'ein-ausreichend-langes-test-secret';
process.env.TZ = 'Europe/Berlin';
process.env.ACCESS_SECRET = SECRET;
process.env.OWNER_NUMBERS = '491700000000';
process.env.DATABASE_URL = 'file:' + join(root, '.test-panel.db');
process.env.DATABASE_KEY = 'unused';

const { initDb } = await import('../src/db.js');
const { createDashboard } = await import('../src/dashboard.js');

let server;
let base;
let cookie;

before(async () => {
  await initDb();
  server = createDashboard().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;

  const res = await fetch(`${base}/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: SECRET }),
  });
  cookie = (res.headers.get('set-cookie') || '').split(';')[0];
});

after(() => server?.close());

const auth = () => ({ cookie, 'content-type': 'application/json' });
const post = (path, body) =>
  fetch(`${base}${path}`, { method: 'POST', headers: auth(), body: JSON.stringify(body) });

// ── Zugang ─────────────────────────────────────────────────────────

test('ohne Sitzung ist alles dicht, ausser dem was oeffentlich sein soll', async () => {
  assert.equal((await fetch(`${base}/`, { redirect: 'manual' })).status, 302);
  assert.equal((await fetch(`${base}/api/status`)).status, 401);
  assert.equal((await fetch(`${base}/api/moderation`)).status, 401);
  assert.equal((await fetch(`${base}/health`)).status, 200);
});

test('ein falsches Passwort kommt nicht durch', async () => {
  const res = await fetch(`${base}/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: 'falsch' }),
  });
  assert.equal(res.status, 401);
  assert.equal(res.headers.get('set-cookie'), null, 'kein Cookie bei Fehlschlag');
});

test('die Anmeldung liefert ein abgesichertes Sitzungs-Cookie', async () => {
  const res = await fetch(`${base}/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: SECRET }),
  });
  assert.equal(res.status, 200);
  const raw = res.headers.get('set-cookie') || '';
  assert.match(raw, /^sid=[a-f0-9]{64}/);
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Strict']) {
    assert.ok(raw.includes(flag), `${flag} fehlt am Cookie`);
  }
});

test('nach dem Abmelden ist die Sitzung wirklich ungueltig', async () => {
  const res = await fetch(`${base}/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: SECRET }),
  });
  const tmp = (res.headers.get('set-cookie') || '').split(';')[0];
  await fetch(`${base}/logout`, { method: 'POST', headers: { cookie: tmp } });
  assert.equal((await fetch(`${base}/api/status`, { headers: { cookie: tmp } })).status, 401);
});

// ── Lesende Routen ─────────────────────────────────────────────────

test('alle Leseansichten antworten mit 200', async () => {
  for (const path of [
    '/api/status', '/api/commands', '/api/global', '/api/moderation',
    '/api/stats', '/api/agenda', '/api/logs', '/api/users?filter=all', '/api/qr',
  ]) {
    const res = await fetch(`${base}${path}`, { headers: auth() });
    assert.equal(res.status, 200, `${path} lieferte ${res.status}`);
  }
});

// ── Falsche Typen duerfen nie zu 500 oder zu Schaden fuehren ───────

test('falsch typisierte Eingaben ergeben 4xx, nie 500', async () => {
  const faelle = [
    ['/api/global', { key: { toString: () => 'xp' }, value: [] }],
    ['/api/custom', { type: ['faq'], name: { a: 1 }, reply: 42 }],
    ['/api/groups/nicht-echt/send', { text: { a: 1 } }],
    ['/api/config/import', { data: 'kein-objekt' }],
    ['/api/groups/x@g.us/kick', { user: [] }],
  ];
  for (const [path, body] of faelle) {
    const res = await post(path, body);
    assert.ok(res.status >= 400 && res.status < 500, `${path} lieferte ${res.status}`);
  }
});

test('die Wipe-Bestaetigung laesst sich nicht per Typ umgehen', async () => {
  // String(['LÖSCHEN']) === 'LÖSCHEN'. Vor dem Fix hat genau das die komplette
  // Datenbank geleert und mit 200 geantwortet.
  for (const confirm of [['LÖSCHEN'], { toString: () => 'LÖSCHEN' }, 0, null, true]) {
    const res = await post('/api/db/wipe', { confirm });
    assert.equal(res.status, 400, `confirm=${JSON.stringify(confirm)} kam durch`);
  }
});

test('__proto__ im Body verseucht nichts', async () => {
  await post('/api/global', JSON.parse('{"key":"xp","value":true,"__proto__":{"verseucht":true}}'));
  assert.equal({}.verseucht, undefined);
});

// ── Pfad-Parameter und Fehlerantworten ─────────────────────────────

test('unsinnige Pfad-Parameter werden abgewiesen', async () => {
  for (const jid of ['../../etc/passwd', 'nicht-valide', 'a'.repeat(500), '%00']) {
    const res = await fetch(`${base}/api/users/${encodeURIComponent(jid)}`, { headers: auth() });
    assert.ok(res.status >= 400 && res.status < 500, `${jid} lieferte ${res.status}`);
  }
});

test('Fehlerantworten verraten keine internen Details', async () => {
  const res = await fetch(`${base}/api/users/nicht-valide`, { headers: auth() });
  const body = await res.text();
  assert.ok(!/\/home\/|node:internal|at .*\(/.test(body), `interne Details in: ${body}`);
});

test('unbekannte API-Pfade liefern sauberes JSON-404', async () => {
  const res = await fetch(`${base}/api/gibtsnicht`, { headers: auth() });
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error, 'Unbekannter Endpunkt.');
});

// ── Nutzersuche ────────────────────────────────────────────────────

test('die Suche deckelt limit und klemmt die Seitenzahl', async () => {
  const res = await fetch(`${base}/api/users?limit=99999&page=99999&filter=all`, { headers: auth() });
  const { pagination } = await res.json();
  assert.ok(pagination.limit <= 100, `limit war ${pagination.limit}`);
  assert.ok(pagination.page <= pagination.pages);
});

test('LIKE-Platzhalter in der Suche sind entschaerft', async () => {
  const res = await fetch(`${base}/api/users?q=${encodeURIComponent('%_%')}&filter=all`, {
    headers: auth(),
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).users.length, 0, '% darf keine Wildcard sein');
});
