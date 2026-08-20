// Regressionstests fuer die im dritten Audit bestaetigten Befunde.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFile } from 'node:fs/promises';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
process.env.OWNER_NUMBERS = '491700000000';
process.env.DATABASE_URL = 'file:' + join(root, '.test-regression3.db');
process.env.DATABASE_KEY = 'unused';

const { initDb, getDb } = await import('../src/db.js');
const { assertNotAuthWrite } = await import('../src/core/database/guard.js');
const events = await import('../src/events.js');
const { getEvent } = await import('../src/data/events.js');

before(async () => { await initDb(); });

// ── T-8: Guard laesst sich nicht per SQL-Kommentar umgehen ──────────
test('T-8: Guard blockt Auth-Schreibzugriffe auch hinter SQL-Kommentaren', () => {
  const blocked = (sql) => { try { assertNotAuthWrite(sql); return false; } catch { return true; } };
  assert.ok(blocked('DELETE FROM auth_creds'), 'schlicht');
  assert.ok(blocked('-- harmlos\nDELETE FROM auth_creds'), 'Zeilenkommentar davor');
  assert.ok(blocked('/* harmlos */DELETE FROM auth_creds'), 'Blockkommentar davor');
  assert.ok(blocked('\n\t  UPDATE auth_keys SET data = 1'), 'Whitespace davor');
  assert.ok(blocked('-- a\n /* b */ \n REPLACE INTO auth_keys VALUES (1)'), 'gemischt');
});

test('T-8: Guard blockt legitime Statements NICHT', () => {
  assert.doesNotThrow(() => assertNotAuthWrite('DELETE FROM coins'));
  assert.doesNotThrow(() => assertNotAuthWrite('SELECT * FROM auth_creds'));
  assert.doesNotThrow(() => assertNotAuthWrite('-- Kommentar\nSELECT 1'));
});

// ── T-4: laufendes Event ueberlebt einen Neustart ───────────────────
test('T-4: loadActiveEvent stellt ein laufendes Event wieder her', async () => {
  await getDb().execute({ sql: 'DELETE FROM active_event WHERE id = 1', args: [] });
  await events.setEvent(getEvent('mega'), 5);
  assert.equal(events.getEventXpMult(), 2, 'Event ist aktiv');

  events.resetEventCache();                       // "Neustart": RAM leer
  assert.equal(events.getActiveEvent(), null);
  await events.loadActiveEvent();                 // Boot-Sequenz
  assert.ok(events.getActiveEvent(), 'aus der DB wiederhergestellt');
  assert.equal(events.getEventXpMult(), 2);
});

test('T-4: index.js ruft loadActiveEvent in der Boot-Sequenz auf', async () => {
  const src = await readFile(join(root, 'src', 'index.js'), 'utf8');
  assert.match(src, /import \{ loadActiveEvent \}/, 'importiert');
  assert.match(src, /loadActiveEvent\(\),/, 'wird im Boot-Promise.all aufgerufen');
});

// ── T-1: Login-Lockout haengt an req.ip, nicht am rohen Header ──────
test('T-1: clientIp nutzt req.ip statt x-forwarded-for direkt', async () => {
  const src = await readFile(join(root, 'src', 'dashboard.js'), 'utf8');
  const fn = src.slice(src.indexOf('function clientIp'), src.indexOf('function clientIp') + 700);
  assert.ok(!/headers\['x-forwarded-for'\]/.test(fn), 'liest den Header nicht mehr selbst');
  assert.match(fn, /req\.ip/, 'nutzt req.ip');
  assert.match(src, /app\.set\('trust proxy'/, 'trust proxy bleibt gesetzt');
});

// ── T-2 / T-3: AI-Breaker und Gesamtbudget ──────────────────────────
test('T-2: 429 loest Breaker und Fallback aus', async () => {
  const src = await readFile(join(root, 'src', 'ai.js'), 'utf8');
  assert.match(src, /res\.status === 429 \|\| res\.status >= 500|status === 404 \|\| res\.status === 429/,
    '429 zaehlt zur Fallback-Bedingung');
  const block = src.slice(src.indexOf('const primaryDown'), src.indexOf('const primaryDown') + 400);
  assert.match(block, /markPrimaryDown/, 'Breaker wird gesetzt');
  assert.match(block, /MODEL_FALLBACK/, 'auf Fallback-Modell gewechselt');
});

test('T-3: callGemini hat ein Gesamtbudget ueber die Retry-Kette', async () => {
  const src = await readFile(join(root, 'src', 'ai.js'), 'utf8');
  assert.match(src, /TOTAL_BUDGET_MS/, 'Budget definiert');
  assert.match(src, /Math\.min\(config\.ai\.timeoutMs, budgetLeft\)/, 'Einzelversuch am Restbudget gedeckelt');
  assert.match(src, /callGemini\(\{ system, user \}, model, attempt \+ 1, until\)/, 'Deadline wird durchgereicht');
});

// ── T-5: Prompt-Trennung ────────────────────────────────────────────
test('T-5: Persona und Nutzertext sind strukturell getrennt', async () => {
  const src = await readFile(join(root, 'src', 'ai.js'), 'utf8');
  assert.match(src, /systemInstruction: \{ parts: \[\{ text: system \}\] \}/, 'systemInstruction gesetzt');
  assert.match(src, /contents: \[\{ role: 'user', parts: \[\{ text: user \}\] \}\]/, 'Nutzertext eigener Turn');
  for (const cat of ['HARASSMENT', 'HATE_SPEECH', 'SEXUALLY_EXPLICIT', 'DANGEROUS_CONTENT']) {
    assert.match(src, new RegExp('HARM_CATEGORY_' + cat), cat + ' gesetzt');
  }
});

// ── T-7: totes Flag nicht mehr ausgeliefert ─────────────────────────
test('T-7: dashboard liefert das entfernte spiele-Flag nicht mehr', async () => {
  const src = await readFile(join(root, 'src', 'dashboard.js'), 'utf8');
  assert.ok(!/system_spiele/.test(src), 'system_spiele nirgends mehr im Panel');
});

// ── T-11: Custom-Befehle und AFK werden beim Start geladen ──────────
// resolveCustom() liest ausschliesslich aus dem RAM-Cache. Fehlt der Aufruf
// in der Boot-Sequenz, sind alle !addcmd-Befehle und FAQ-Eintraege nach jedem
// Neustart tot, obwohl die Zeilen in der DB stehen.
test('T-11: loadCustomCommands fuellt den Cache aus der Datenbank', async () => {
  const { loadCustomCommands, resolveCustom, listCustom } = await import('../src/commands/custom.js');
  await getDb().execute({ sql: 'DELETE FROM custom_commands', args: [] });
  await getDb().execute({ sql: 'DELETE FROM faq', args: [] });
  await getDb().execute({
    sql: 'INSERT INTO custom_commands (name, reply, by_jid, created_at) VALUES (?, ?, ?, ?)',
    args: ['wlan', 'Passwort steht am Kuehlschrank', 'test', Date.now()],
  });
  await getDb().execute({
    sql: 'INSERT INTO faq (keyword, answer, by_jid, created_at) VALUES (?, ?, ?, ?)',
    args: ['oeffnung', 'Di bis Sa, 16 bis 22 Uhr', 'test', Date.now()],
  });

  await loadCustomCommands();
  assert.equal(resolveCustom('wlan'), 'Passwort steht am Kuehlschrank', 'Custom-Befehl aufloesbar');
  assert.equal(resolveCustom('oeffnung'), 'Di bis Sa, 16 bis 22 Uhr', 'FAQ aufloesbar');
  assert.deepEqual(listCustom(), { commands: ['wlan'], faqs: ['oeffnung'] });
});

test('T-11: index.js laedt Custom-Befehle und AFK in der Boot-Sequenz', async () => {
  const src = await readFile(join(root, 'src', 'index.js'), 'utf8');
  assert.match(src, /import \{ loadCustomCommands \} from '\.\/commands\/custom\.js'/, 'importiert loadCustomCommands');
  assert.match(src, /import \{ loadAfk \} from '\.\/commands\/afk\.js'/, 'importiert loadAfk');
  const boot = src.slice(src.indexOf('await Promise.all(['), src.indexOf('await Promise.all([') + 900);
  assert.match(boot, /loadCustomCommands\(\),/, 'loadCustomCommands im Boot-Promise.all');
  assert.match(boot, /loadAfk\(\),/, 'loadAfk im Boot-Promise.all');
});

// ── T-12: Gruppen-Cache nach einer Aenderung verwerfen ──────────────
// listGroups() cached 60 s. Ohne Invalidierung lieferte /api/groups nach
// jedem Schaltervorgang bis zu eine Minute lang noch den alten Zustand.
test('T-12: Einstellungs-Route verwirft den Gruppen-Cache', async () => {
  const src = await readFile(join(root, 'src', 'dashboard.js'), 'utf8');
  const start = src.indexOf("api.post('/groups/:jid/settings'");
  assert.ok(start > 0, 'Route gefunden');
  const handler = src.slice(start, src.indexOf("api.post('/groups/:jid/send'"));
  assert.match(handler, /groupCache\.at = 0/, 'Cache wird im Handler verworfen');
  assert.match(handler, /invalidateSettings\(jid\)/, 'Moderations-Cache bleibt ebenfalls invalidiert');
});

// ── T-13: ausgeliefertes Client-JS muss uebersetzbar sein ───────────
// Das Panel-JS steht in einem Template-Literal. Ein einfaches `\d` darin wird
// beim Emittieren zu `d` — aus /\D/g wurde /D/g, aus /^\+/ wurde /^+/ (das
// zweite ist sogar ein SyntaxError, der das gesamte Skript killt).
// `node --check` auf dem Modul sieht davon nichts, weil der Code dort nur ein
// String ist. Also den emittierten Text uebersetzen.
test('T-13: APP_JS und THEME_INIT_JS uebersetzen fehlerfrei', async () => {
  const vm = await import('node:vm');
  const ui = await import('../src/dashboard-ui.js');
  for (const name of ['APP_JS', 'THEME_INIT_JS']) {
    const src = ui[name];
    assert.equal(typeof src, 'string', name + ' ist ein String');
    assert.doesNotThrow(() => new vm.Script(src, { filename: name }), name + ' ist syntaktisch gueltig');
  }
});

test('T-13: Zeichenklassen im Client-JS ueberleben das Template-Literal', async () => {
  const ui = await import('../src/dashboard-ui.js');
  // Nach dem Emittieren duerfen keine kaputten Reste dieser Art auftauchen.
  assert.ok(!/\/\^\+\//.test(ui.APP_JS), 'kein /^+/ (verschluckter Backslash)');
  assert.ok(!/replace\(\/D\/g/.test(ui.APP_JS), 'kein /D/g statt /\\D/g');
  // Die Pairing-Eingabe muss weiterhin alles Nicht-Ziffrige entfernen.
  assert.match(ui.APP_JS, /input\.value\.replace\(\/\[\^0-9\]\/g, ''\)/, 'Pairing-Nummer wird auf Ziffern reduziert');
});
