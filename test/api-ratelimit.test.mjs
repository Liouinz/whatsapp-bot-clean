// Control API — der Bruteforce-Schutz am Konto.
//
// Eigene Datei mit eigenem Prozess: die Rate-Limiter zaehlen je Prozess, und
// dieser Test fuehrt ein Kontingent absichtlich leer. In derselben Datei wie
// andere Anmelde-Tests wuerde er ihnen das IP-Kontingent wegnehmen.
//
// Der Befund dahinter: die Sperre haengte allein an der IP. Wer ueber viele
// Adressen verfuegt, laeuft daran vorbei — und ohne vorgelagerten Proxy laesst
// sich `req.ip` per X-Forwarded-For sogar frei setzen (hinter Render nicht:
// dort haengt der Proxy die echte Adresse rechts an und `trust proxy: 1` loest
// korrekt auf, nachgemessen). Gegen das Durchprobieren des Passworts EINES
// Kontos hilft nur ein Zaehler an diesem Konto.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const SECRET = 'ratelimit-test-secret-lang-genug';

process.env.TZ = 'Europe/Berlin';
process.env.ACCESS_SECRET = SECRET;
process.env.OWNER_NUMBERS = '491700000000';
process.env.DATABASE_URL = 'file:' + join(root, '.test-apirate.db');
process.env.DATABASE_KEY = 'unused';

const { initDb, getDb } = await import('../src/db.js');
const { createDashboard } = await import('../src/dashboard.js');

let server;
let base;

const login = (username, password, headers = {}) =>
  fetch(`${base}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ username, password }),
  });

before(async () => {
  await initDb();
  for (const t of ['api_tokens', 'api_sessions', 'api_users']) {
    await getDb().execute({ sql: `DELETE FROM ${t}`, args: [] });
  }
  server = createDashboard().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server?.close());

test('das Kontingent zaehlt am Konto, nicht nur an der IP', async () => {
  const opfer = 'zielkonto';
  let gesperrtNach = 0;

  for (let i = 1; i <= 6; i++) {
    // Wechselnde Absenderadresse vortaeuschen. Ohne Konto-Zaehler waere das im
    // Direktbetrieb (ohne vorgelagerten Proxy) der Weg an der Sperre vorbei.
    const res = await login(opfer, 'falsches-passwort-hier', { 'x-forwarded-for': `9.9.9.${i}` });
    if (res.status === 429) {
      gesperrtNach = i;
      assert.equal((await res.json()).error.code, 'RATE_LIMITED');
      break;
    }
  }

  assert.ok(gesperrtNach > 0, 'das Konto muss nach mehreren Fehlversuchen gesperrt werden');
  assert.ok(gesperrtNach <= 6, `erst nach ${gesperrtNach} Versuchen gesperrt — zu spaet`);
});

test('die Sperre greift nicht auf fremde Konten ueber', async () => {
  const anderes = await login('ganz-anderes-konto', 'auch-falsch-aber-lang');
  assert.notEqual(anderes.status, 429,
    'ein gesperrtes Konto darf andere nicht mitsperren — sonst waere das ein Weg, Fremde auszusperren');
  assert.equal(anderes.status, 401);
});

test('eine unvollstaendige Anfrage verbraucht kein Kontingent', async () => {
  // Der Konto-Zaehler steht hinter der Eingabepruefung. Stuende er davor,
  // koennte man mit leeren Anfragen ohne Benutzernamen Kontingente leerfahren.
  const kaputt = await fetch(`${base}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'noch-ein-konto' }), // password fehlt
  });
  assert.equal(kaputt.status, 400);
  assert.equal((await kaputt.json()).error.code, 'VALIDATION_FAILED');

  const danach = await login('noch-ein-konto', 'falsch-aber-lang-genug');
  assert.equal(danach.status, 401, 'die fehlerhafte Anfrage darf nichts vom Kontingent genommen haben');
});
