// Preflight — läuft bei JEDEM Start als Allererstes, VOR Baileys.
// Ziel: Konfigurationsfehler in Klartext melden statt kryptisch zu crashen.

import { createClient } from '@libsql/client';
import { REQUIRED_ENV } from './config.js';

const RETRIES = 3;
const RETRY_BASE_MS = 2000;

function fail(message) {
  console.error('');
  console.error('❌ START ABGEBROCHEN: ' + message);
  console.error('');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function preflight() {
  const missing = REQUIRED_ENV.filter((name) => !(process.env[name] || '').trim());
  if (missing.length) {
    fail(
      `Fehlende Umgebungsvariable(n): ${missing.join(', ')}. ` +
        'Bitte im Render-Dashboard unter "Environment" setzen (ohne Anführungszeichen/Leerzeichen).'
    );
  }

  const url = process.env.DATABASE_URL.trim();
  if (!url.startsWith('libsql://')) {
    fail(
      `DATABASE_URL muss mit "libsql://" beginnen (aktuell: "${url.slice(0, 24)}…"). ` +
        'Korrekte URL aus dem Turso-Dashboard kopieren.'
    );
  }

  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    let client;
    try {
      client = createClient({ url, authToken: process.env.DATABASE_KEY.trim() });
      await client.execute('SELECT 1');
      client.close();
      console.log('✅ Preflight: Env-Variablen ok, Turso-Verbindung steht.');
      return;
    } catch (err) {
      try { client?.close(); } catch { /* egal */ }
      const text = String(err?.message || err);

      if (/404/.test(text)) {
        fail(
          'DATABASE_URL zeigt auf eine nicht existierende Turso-DB (HTTP 404). ' +
            'Neue URL aus dem Turso-Dashboard kopieren und in Render setzen.'
        );
      }
      if (/401|403|UNAUTHORIZED|FORBIDDEN/i.test(text)) {
        fail(
          'DATABASE_KEY (Turso Auth-Token) ist falsch oder abgelaufen (HTTP 401/403). ' +
            'Im Turso-Dashboard einen neuen Token (Read & Write, Expiry "Never") erstellen.'
        );
      }

      if (attempt < RETRIES) {
        const wait = RETRY_BASE_MS * attempt;
        console.warn(
          `⚠️ Preflight: Turso nicht erreichbar (Versuch ${attempt}/${RETRIES}), ` +
            `neuer Versuch in ${wait / 1000}s … (${text.slice(0, 120)})`
        );
        await sleep(wait);
      } else {
        fail(
          `Turso ist nach ${RETRIES} Versuchen nicht erreichbar. Letzter Fehler: ${text.slice(0, 200)}`
        );
      }
    }
  }
}
