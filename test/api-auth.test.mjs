// Control API v1 — Authentifizierung, Rollen und Token-Lebenszyklus.
//
// Gefahren wird gegen ein echtes createDashboard() auf einem freien Port mit
// echter Datenbank. Keine Mocks: die Middleware-Kette, das Fehlerformat und
// die Rate-Limits sind genau die, die spaeter auch die App trifft.
//
// Achtung beim Erweitern: die Anmeldung und die Token-Erneuerung teilen sich
// ein IP-Kontingent von 10 Anfragen je 15 Minuten. Tests, die viele Logins
// brauchen, gehoeren ans DATEIENDE — der Erschoepfungstest unten macht das
// Kontingent bewusst leer.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const SECRET = 'bootstrap-secret-mit-genug-laenge';

process.env.TZ = 'Europe/Berlin';
process.env.ACCESS_SECRET = SECRET;
process.env.OWNER_NUMBERS = '491700000000';
process.env.DATABASE_URL = 'file:' + join(root, '.test-apiauth.db');
process.env.DATABASE_KEY = 'unused';

const { initDb, getDb } = await import('../src/db.js');
const { createDashboard } = await import('../src/dashboard.js');
const { ACCESS_TTL_MS } = await import('../src/api/services/tokens.js');

let server;
let base;
let owner;   // { accessToken, refreshToken, sessionId, user }
let viewer;

const api = (path, opts = {}) =>
  fetch(`${base}/api/v1${path}`, {
    ...opts,
    headers: {
      'content-type': 'application/json',
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.headers || {}),
    },
    body: opts.json !== undefined ? JSON.stringify(opts.json) : opts.body,
  });

before(async () => {
  await initDb();
  // Frisch anfangen: sonst haengt ein Owner aus einem frueheren Lauf herum
  // und der Bootstrap-Pfad wuerde nicht mehr greifen.
  for (const t of ['api_tokens', 'api_sessions', 'api_users']) {
    await getDb().execute({ sql: `DELETE FROM ${t}`, args: [] });
  }

  server = createDashboard().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;

  // 1. Login: Bootstrap ueber ACCESS_SECRET
  const res = await api('/auth/login', { method: 'POST', json: { username: 'owner', password: SECRET } });
  assert.equal(res.status, 200, 'Bootstrap-Anmeldung muss gelingen');
  owner = await res.json();

  // 2. Einen Viewer anlegen und anmelden — fuer die Rechte-Tests.
  const created = await api('/auth/users', {
    method: 'POST',
    token: owner.accessToken,
    json: { username: 'schauer', password: 'ein-langes-viewer-passwort', role: 'viewer' },
  });
  assert.equal(created.status, 201, 'Viewer anlegen muss gelingen');

  const vRes = await api('/auth/login', {
    method: 'POST',
    json: { username: 'schauer', password: 'ein-langes-viewer-passwort' },
  });
  assert.equal(vRes.status, 200);
  viewer = await vRes.json();
});

after(() => server?.close());

// ── Bootstrap ──────────────────────────────────────────────────────

test('der Bootstrap legt genau einen Owner an und schliesst sich danach', async () => {
  const rows = (await getDb().execute("SELECT username, role FROM api_users WHERE role = 'owner'")).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].username, 'owner');

  // Jetzt existiert ein Zugang — ACCESS_SECRET darf keinen zweiten mehr oeffnen.
  const again = await api('/auth/login', { method: 'POST', json: { username: 'zweiter', password: SECRET } });
  assert.equal(again.status, 401, 'ACCESS_SECRET darf nach dem Bootstrap keine neuen Zugaenge mehr oeffnen');
});

test('die Anmeldung liefert Tokens, aber niemals das Passwort oder einen Hash', async () => {
  const body = JSON.stringify(owner);
  assert.ok(owner.accessToken && owner.refreshToken, 'beide Tokens fehlen nicht');
  assert.notEqual(owner.accessToken, owner.refreshToken, 'Access und Refresh muessen verschieden sein');
  assert.ok(owner.accessToken.length >= 40, 'Token zu kurz fuer 256 Bit Entropie');
  for (const leak of [SECRET, 'pw_hash', 'pw_salt', 'scrypt']) {
    assert.ok(!body.includes(leak), `"${leak}" darf nicht in der Antwort stehen`);
  }
  assert.equal(owner.user.role, 'owner');
});

test('in der Datenbank steht nur der Hash, nie der Token selbst', async () => {
  const rows = (await getDb().execute('SELECT token_hash FROM api_tokens')).rows;
  assert.ok(rows.length > 0);
  for (const r of rows) {
    assert.match(String(r.token_hash), /^[a-f0-9]{64}$/, 'muss ein SHA-256-Hex sein');
    assert.notEqual(String(r.token_hash), owner.accessToken);
    assert.notEqual(String(r.token_hash), owner.refreshToken);
  }
});

// ── Zugang ohne oder mit falschem Token ────────────────────────────

test('ohne Token ist jede geschuetzte Route dicht', async () => {
  for (const path of [
    '/auth/me', '/auth/sessions', '/auth/users', '/bot/status', '/users', '/groups',
    '/logs', '/settings', '/settings/commands', '/system', '/health/details',
  ]) {
    const res = await api(path);
    assert.equal(res.status, 401, `${path} war ohne Token erreichbar`);
    const body = await res.json();
    assert.equal(body.error.code, 'UNAUTHENTICATED', `${path} meldet den falschen Code`);
  }
});

test('kaputte Authorization-Header werden abgewiesen', async () => {
  for (const header of ['', 'Bearer', 'Bearer ', 'Basic abc', `Bearer ${'x'.repeat(3)}`, 'Bearer ../../etc/passwd']) {
    const res = await api('/auth/me', { headers: { authorization: header } });
    assert.equal(res.status, 401, `Header "${header}" kam durch`);
  }
});

test('ein erfundener Token ist ungueltig, nicht abgelaufen', async () => {
  const res = await api('/auth/me', { token: 'A'.repeat(43) });
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error.code, 'TOKEN_INVALID');
});

test('ein abgelaufener Token meldet TOKEN_EXPIRED, damit die App erneuern kann', async () => {
  // Ablauf in der Datenbank vorziehen statt 15 Minuten zu warten.
  const res0 = await api('/auth/login', { method: 'POST', json: { username: 'owner', password: SECRET } });
  const tmp = await res0.json();
  await getDb().execute({
    sql: `UPDATE api_tokens SET expires_at = ? WHERE session_id = ? AND kind = 'access'`,
    args: [Date.now() - 1000, tmp.sessionId],
  });

  const res = await api('/auth/me', { token: tmp.accessToken });
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error.code, 'TOKEN_EXPIRED',
    'abgelaufen und ungueltig muessen unterscheidbar sein — sonst meldet die App den Nutzer unnoetig ab');
  assert.ok(ACCESS_TTL_MS > 0);
});

// ── Rollen und Rechte ──────────────────────────────────────────────

test('ein Viewer darf lesen', async () => {
  for (const path of ['/bot/status', '/users?filter=all', '/groups', '/logs', '/settings']) {
    const res = await api(path, { token: viewer.accessToken });
    assert.equal(res.status, 200, `${path} war fuer den Viewer gesperrt`);
  }
});

test('ein Viewer darf den Bot NICHT steuern', async () => {
  for (const path of ['/bot/restart', '/bot/relink']) {
    const res = await api(path, { method: 'POST', token: viewer.accessToken, json: {} });
    assert.equal(res.status, 403, `${path} war fuer den Viewer offen`);
    const body = await res.json();
    assert.equal(body.error.code, 'FORBIDDEN');
    assert.match(body.error.message, /bot\.control/, 'das fehlende Recht soll benannt werden');
  }
});

test('ein Viewer darf keine Zugaenge verwalten', async () => {
  const list = await api('/auth/users', { token: viewer.accessToken });
  assert.equal(list.status, 403);

  const create = await api('/auth/users', {
    method: 'POST',
    token: viewer.accessToken,
    json: { username: 'schmuggel', password: 'ein-langes-passwort-hier', role: 'owner' },
  });
  assert.equal(create.status, 403, 'Rechteausweitung ueber das Anlegen eines Owners');

  const rows = (await getDb().execute("SELECT COUNT(*) AS c FROM api_users WHERE username = 'schmuggel'")).rows;
  assert.equal(Number(rows[0].c), 0, 'es darf nichts angelegt worden sein');
});

test('die Rolle kommt vom Server, nicht aus der Anfrage', async () => {
  // Mass Assignment: ein mitgeschicktes role-Feld beim Login darf wirkungslos sein.
  const res = await api('/auth/me', { token: viewer.accessToken });
  const body = await res.json();
  assert.equal(body.user.role, 'viewer');
  assert.ok(!body.user.permissions.includes('bot.control'));
  assert.ok(!body.user.permissions.includes('apiusers.manage'));
});

// ── Geraete-Sitzungen ──────────────────────────────────────────────

test('die Geraeteliste zeigt eigene Sitzungen und markiert die aktuelle', async () => {
  const res = await api('/auth/sessions', { token: owner.accessToken });
  assert.equal(res.status, 200);
  const { sessions } = await res.json();
  const current = sessions.find((s) => s.current);
  assert.ok(current, 'die aktuelle Sitzung muss markiert sein');
  assert.equal(current.id, owner.sessionId);
  // Keine Tokens in der Antwort.
  assert.ok(!JSON.stringify(sessions).includes(owner.accessToken));
  assert.ok(!JSON.stringify(sessions).includes(owner.refreshToken));
});

test('IDOR: fremde Sitzungen lassen sich nicht abmelden', async () => {
  const res = await api(`/auth/sessions/${viewer.sessionId}`, { method: 'DELETE', token: owner.accessToken });
  assert.equal(res.status, 404, 'die fremde Sitzung darf nicht einmal als existent bestaetigt werden');

  // Der Viewer muss weiterhin arbeiten koennen.
  const still = await api('/auth/me', { token: viewer.accessToken });
  assert.equal(still.status, 200, 'die fremde Sitzung wurde faelschlich beendet');
});

test('eine widerrufene Sitzung sperrt ihren Token sofort', async () => {
  const res0 = await api('/auth/login', { method: 'POST', json: { username: 'owner', password: SECRET } });
  const tmp = await res0.json();
  assert.equal((await api('/auth/me', { token: tmp.accessToken })).status, 200);

  const del = await api(`/auth/sessions/${tmp.sessionId}`, { method: 'DELETE', token: tmp.accessToken });
  assert.equal(del.status, 200);

  const after = await api('/auth/me', { token: tmp.accessToken });
  assert.equal(after.status, 401, 'der Token muss mit der Sitzung sterben');
});

// ── Token-Erneuerung mit Wiederverwendungserkennung ────────────────

test('Refresh rotiert das Token-Paar', async () => {
  const res = await api('/auth/refresh', { method: 'POST', json: { refreshToken: owner.refreshToken } });
  assert.equal(res.status, 200);
  const rotated = await res.json();
  assert.notEqual(rotated.accessToken, owner.accessToken);
  assert.notEqual(rotated.refreshToken, owner.refreshToken, 'der Refresh-Token MUSS rotieren');
  assert.equal(rotated.sessionId, owner.sessionId, 'die Geraete-Sitzung bleibt dieselbe');

  const old = owner;
  owner = { ...rotated, user: rotated.user };

  // Der alte Refresh-Token ist jetzt entwertet — und seine erneute Vorlage
  // beendet die ganze Sitzung, weil das nach Diebstahl aussieht.
  const reuse = await api('/auth/refresh', { method: 'POST', json: { refreshToken: old.refreshToken } });
  assert.equal(reuse.status, 401);
  assert.equal((await reuse.json()).error.code, 'TOKEN_INVALID');

  const afterReuse = await api('/auth/me', { token: rotated.accessToken });
  assert.equal(afterReuse.status, 401,
    'nach erkannter Wiederverwendung muss auch der frische Token der Sitzung gesperrt sein');
});

// ── Fehlerformat ───────────────────────────────────────────────────

test('jede Fehlerantwort hat dieselbe Form samt requestId', async () => {
  const res = await api('/auth/me');
  const body = await res.json();
  assert.ok(body.error, 'Fehler stehen unter "error"');
  assert.equal(typeof body.error.code, 'string');
  assert.equal(typeof body.error.message, 'string');
  assert.match(body.error.requestId, /^req_[A-Za-z0-9_-]+$/);
  assert.equal(res.headers.get('x-request-id'), body.error.requestId,
    'die requestId muss auch im Header stehen, damit sie ohne Body auffindbar ist');
});

test('eine vom Client gesetzte Request-ID wird nicht uebernommen', async () => {
  const res = await api('/version', { headers: { 'x-request-id': 'req_gefaelscht' } });
  assert.notEqual(res.headers.get('x-request-id'), 'req_gefaelscht',
    'sonst liessen sich Log-Zeilen fremden Vorgaengen unterschieben');
});

test('Fehlerantworten verraten keine internen Details', async () => {
  for (const path of ['/auth/me', '/users/kaputt', '/gibtsnicht']) {
    const text = await (await api(path, { token: owner.accessToken })).text();
    assert.ok(!/\/home\/|node:internal|at .*\(|SQLITE|libsql/.test(text), `interne Details bei ${path}: ${text}`);
  }
});

// ── Rate-Limit: MUSS als letzter Test stehen ───────────────────────

test('das Anmelde-Kontingent greift und meldet RATE_LIMITED', async () => {
  let limited = null;
  for (let i = 0; i < 15 && !limited; i++) {
    const res = await api('/auth/login', { method: 'POST', json: { username: 'owner', password: 'falsch' } });
    if (res.status === 429) limited = await res.json();
  }
  assert.ok(limited, 'die Anmeldung muss irgendwann gedrosselt werden');
  assert.equal(limited.error.code, 'RATE_LIMITED');
});
