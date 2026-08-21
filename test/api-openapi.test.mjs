// Die OpenAPI-Beschreibung gegen den tatsaechlichen Router.
//
// Der Zweck ist nicht, dass die Datei gueltiges JSON ist — das waere billig.
// Der Zweck ist, dass sie **nicht abdriften kann**: jede Route im Code muss
// beschrieben sein, und jede beschriebene Route muss es geben. Ein neuer
// Endpunkt ohne Dokumentation faellt hier auf, nicht erst der App-Entwicklerin.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

process.env.TZ = 'Europe/Berlin';
process.env.ACCESS_SECRET = 'openapi-test-secret-lang-genug';
process.env.OWNER_NUMBERS = '491700000000';
process.env.DATABASE_URL = 'file:' + join(root, '.test-openapi.db');
process.env.DATABASE_KEY = 'unused';

const spec = JSON.parse(readFileSync(join(root, 'docs', 'api', 'openapi.json'), 'utf8'));

let actual; // Set<"GET /users/{jid}">

before(async () => {
  const { createApiV1 } = await import('../src/api/index.js');
  const api = createApiV1();
  const found = new Set();

  // Den gebauten Router abgehen. Express-Pfadparameter (:jid) auf die
  // OpenAPI-Schreibweise ({jid}) bringen, damit beide Seiten vergleichbar sind.
  (function walk(stack, prefix = '') {
    for (const layer of stack) {
      if (layer.route) {
        const path = (prefix + layer.route.path).replace(/\/$/, '') || '/';
        const openApiPath = path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
        for (const method of Object.keys(layer.route.methods)) {
          if (method === '_all') continue;
          found.add(`${method.toUpperCase()} ${openApiPath}`);
        }
      } else if (layer.handle?.stack) {
        const m = layer.regexp?.source?.match(/^\^\\\/([^\\?]*)/);
        walk(layer.handle.stack, prefix + (m && m[1] ? `/${m[1]}` : ''));
      }
    }
  })(api.stack);

  actual = found;
});

const documented = () => {
  const out = new Set();
  for (const [path, ops] of Object.entries(spec.paths)) {
    for (const method of Object.keys(ops)) {
      if (['get', 'post', 'put', 'patch', 'delete'].includes(method)) {
        out.add(`${method.toUpperCase()} ${path}`);
      }
    }
  }
  return out;
};

test('die Beschreibung ist eine gueltige OpenAPI-3-Wurzel', () => {
  assert.match(spec.openapi, /^3\./);
  assert.ok(spec.info?.title);
  assert.ok(spec.info?.version);
  assert.deepEqual(spec.servers, [{ url: '/api/v1' }]);
  assert.ok(spec.components?.securitySchemes?.bearerAuth, 'bearerAuth muss definiert sein');
});

test('jede Route im Code ist beschrieben', () => {
  const docs = documented();
  const missing = [...actual].filter((r) => !docs.has(r)).sort();
  assert.deepEqual(missing, [], `Nicht dokumentierte Routen:\n  ${missing.join('\n  ')}`);
});

test('jede beschriebene Route existiert wirklich', () => {
  const docs = documented();
  const phantom = [...docs].filter((r) => !actual.has(r)).sort();
  assert.deepEqual(phantom, [], `Beschrieben, aber nicht vorhanden:\n  ${phantom.join('\n  ')}`);
});

test('jede Operation nennt Zweck und mindestens eine Antwort', () => {
  for (const [path, ops] of Object.entries(spec.paths)) {
    for (const [method, op] of Object.entries(ops)) {
      const where = `${method.toUpperCase()} ${path}`;
      assert.ok(op.summary, `${where}: summary fehlt`);
      assert.ok(op.tags?.length, `${where}: tag fehlt`);
      assert.ok(Object.keys(op.responses || {}).length > 0, `${where}: keine Antwort beschrieben`);
    }
  }
});

test('geschuetzte Operationen nennen ihr Recht, oeffentliche sind ausdruecklich offen', () => {
  // Genau diese vier duerfen ohne Anmeldung erreichbar sein. Waechst die Liste,
  // muss das eine bewusste Entscheidung sein — deshalb steht sie hier fest.
  const PUBLIC = new Set([
    'POST /auth/login',
    'POST /auth/refresh',
    'GET /health',
    'GET /version',
  ]);

  for (const [path, ops] of Object.entries(spec.paths)) {
    for (const [method, op] of Object.entries(ops)) {
      const where = `${method.toUpperCase()} ${path}`;
      const isPublic = Array.isArray(op.security) && op.security.length === 0;

      if (PUBLIC.has(where)) {
        assert.ok(isPublic, `${where} sollte oeffentlich sein, ist aber geschuetzt beschrieben`);
      } else {
        assert.ok(!isPublic, `${where} ist als oeffentlich beschrieben — das ist nicht vorgesehen`);
      }
    }
  }
});

test('jedes $ref zeigt auf ein vorhandenes Schema', () => {
  const names = new Set(Object.keys(spec.components.schemas));
  const missing = new Set();
  (function walk(node) {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) {
        if (k === '$ref' && typeof v === 'string') {
          const name = v.replace('#/components/schemas/', '');
          if (!names.has(name)) missing.add(v);
        } else walk(v);
      }
    }
  })(spec);
  assert.deepEqual([...missing], [], 'Verweise ins Leere');
});

test('die Fehlerbeschreibung passt zu dem, was die API wirklich sendet', () => {
  const err = spec.components.schemas.Error.properties.error.properties;
  for (const field of ['code', 'message', 'requestId']) {
    assert.ok(err[field], `Das Fehlerschema nennt "${field}" nicht`);
  }
});
