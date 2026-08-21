// Control API — die Haertungen aus dem Red-Team-Durchlauf.
//
// Jeder Test hier bildet einen Befund ab, der an der laufenden API
// nachgewiesen wurde. Ohne den jeweiligen Fix schlaegt er fehl.
//
// Eigene Datei, weil hier absichtlich Kontingente leergefahren werden und die
// Limiter je Prozess zaehlen.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const SECRET = 'haertung-test-secret-lang-genug';

process.env.TZ = 'Europe/Berlin';
process.env.ACCESS_SECRET = SECRET;
process.env.OWNER_NUMBERS = '491700000000';
process.env.DATABASE_URL = 'file:' + join(root, '.test-apihard.db');
process.env.DATABASE_KEY = 'unused';

const { initDb, getDb } = await import('../src/db.js');
const { createDashboard } = await import('../src/dashboard.js');

let server;
let base;
let ownerToken;

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

const login = (username, password) =>
  api('/auth/login', { method: 'POST', json: { username, password } });

before(async () => {
  await initDb();
  for (const t of ['api_tokens', 'api_sessions', 'api_users']) {
    await getDb().execute({ sql: `DELETE FROM ${t}`, args: [] });
  }
  server = createDashboard().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;

  const res = await login('owner', SECRET);
  assert.equal(res.status, 200, 'Bootstrap muss gelingen');
  ownerToken = (await res.json()).accessToken;
});

after(() => server?.close());

// ── scrypt darf die Event-Loop nicht anhalten ──────────────────────

test('gleichzeitige scrypt-Aufrufe blockieren die Event-Loop nicht', async () => {
  // Der Befund: mit crypto.scryptSync haelt jeder Aufruf den EINEN Node-Thread
  // rund 40 ms an. Bot, Panel und WhatsApp-Socket teilen ihn sich — gemessen
  // stieg die oeffentliche /health-Antwort unter 20 gleichzeitigen Anmeldungen
  // von 1,4 ms auf 456 ms im p95.
  //
  // Geprueft wird die Funktion direkt, nicht ueber eine Route: so haengt der
  // Test an der Eigenschaft, um die es geht (scrypt gibt die Event-Loop frei),
  // und nicht daran, welcher Endpunkt sie gerade ausloest.
  const { verifyPassword, hashPassword } = await import('../src/api/services/apiUsers.js');
  const { hash, salt } = await hashPassword('ein-referenz-passwort');

  let maxLagMs = 0;
  let last = process.hrtime.bigint();
  const ticker = setInterval(() => {
    const now = process.hrtime.bigint();
    const lag = Number(now - last) / 1e6 - 5;
    if (lag > maxLagMs) maxLagMs = lag;
    last = now;
  }, 5);

  try {
    await Promise.all(Array.from({ length: 8 }, () => verifyPassword('falsch', hash, salt)));
    // Kurz nachlaufen lassen, BEVOR der Timer gestoppt wird. Ohne das misst der
    // Test nichts: blockiert scrypt synchron, kommt der Timer waehrenddessen
    // gar nicht dran, und clearInterval liefe im selben Durchlauf — die
    // aufgestaute Verzoegerung wuerde nie beobachtet.
    await new Promise((r) => setTimeout(r, 30));
  } finally {
    clearInterval(ticker);
  }

  assert.ok(
    maxLagMs < 120,
    `Die Event-Loop stand ${maxLagMs.toFixed(0)} ms still — scrypt laeuft synchron im Hauptthread`
  );
});

// ── Kein Rueckschluss auf existierende Benutzernamen ───────────────

test('die Antwortzeit verraet nicht, ob es den Benutzernamen gibt', async () => {
  // Der Befund: fuer einen unbekannten Namen lief gar kein scrypt — die
  // Anmeldung war nach 1,9 ms abgelehnt statt nach 41 ms. Der gleiche
  // Fehlertext half dann nichts mehr, die Zeit war das Orakel.
  const messen = async (username) => {
    const zeiten = [];
    for (let i = 0; i < 3; i++) {
      const a = process.hrtime.bigint();
      const res = await login(username, 'definitiv-falsches-passwort');
      await res.text();
      // 429 wuerde die Messung verfaelschen — dann ist der Test wertlos.
      assert.notEqual(res.status, 429, 'Kontingent erschoepft, Messung unbrauchbar');
      zeiten.push(Number(process.hrtime.bigint() - a) / 1e6);
    }
    zeiten.sort((x, y) => x - y);
    return zeiten[1]; // Median von drei
  };

  // Getrennte Namen, damit das Konto-Kontingent (5/15 Min) nicht greift.
  const existiert = await messen('owner');
  const existiertNicht = await messen('gibt-es-nicht-xyz');

  const faktor = Math.max(existiert, existiertNicht) / Math.max(1, Math.min(existiert, existiertNicht));
  assert.ok(
    faktor < 4,
    `Zeitunterschied Faktor ${faktor.toFixed(1)} (${existiert.toFixed(1)} ms vs ${existiertNicht.toFixed(1)} ms) — ` +
      'daraus liessen sich gueltige Benutzernamen ablesen'
  );
});

// ── Das Owner-Passwort laesst sich von ACCESS_SECRET loesen ────────

test('der Owner kann sein Passwort aendern und ist danach von ACCESS_SECRET entkoppelt', async () => {
  const neu = 'ein-vollkommen-neues-passwort';

  const falsch = await api('/auth/password', {
    method: 'POST', token: ownerToken,
    json: { currentPassword: 'stimmt-nicht', newPassword: neu },
  });
  assert.equal(falsch.status, 401, 'ohne das aktuelle Passwort darf nichts gehen');

  const res = await api('/auth/password', {
    method: 'POST', token: ownerToken,
    json: { currentPassword: SECRET, newPassword: neu },
  });
  assert.equal(res.status, 200);

  // ACCESS_SECRET oeffnet die API jetzt nicht mehr.
  const alt = await login('owner', SECRET);
  assert.ok([401, 429].includes(alt.status), `ACCESS_SECRET oeffnet die API weiterhin (${alt.status})`);

  // Die eigene Sitzung laeuft weiter — sonst wuerde sich die App beim
  // Passwortwechsel selbst abmelden.
  const weiter = await api('/auth/me', { token: ownerToken });
  assert.equal(weiter.status, 200, 'die eigene Sitzung muss den Wechsel ueberleben');
});

test('ein zu kurzes neues Passwort wird abgewiesen', async () => {
  const res = await api('/auth/password', {
    method: 'POST', token: ownerToken,
    json: { currentPassword: 'egal', newPassword: 'kurz' },
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, 'VALIDATION_FAILED');
});
