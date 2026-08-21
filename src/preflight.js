// Preflight — läuft bei JEDEM Start als Allererstes, VOR Baileys.
// Ziel: Konfigurationsfehler in Klartext melden statt kryptisch zu crashen.

import { createClient } from '@libsql/client';
import { REQUIRED_ENV, hasValidOwners, config } from './config.js';

const RETRIES = 3;
const RETRY_BASE_MS = 2000;

// Das Panel-Passwort schuetzt Kick, Ban, Broadcast und das komplette Leeren der
// Datenbank. Aussperre (5 Fehlversuche / 15 Min) und Limiter (20/Min) bremsen
// zwar, aber ein Drei-Zeichen-Secret ist auch damit in Stunden geraten. Es gibt
// keinen Grund, hier kurz zu sein — der Wert wird einmal gesetzt und nie getippt.
const MIN_SECRET_LENGTH = 16;

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

  // Gesetzt-sein allein genuegt nicht: parseNumbers() entfernt alle Nicht-
  // Ziffern, sodass ein Vertipper eine leere Owner-Liste ergibt — der Bot
  // startet dann normal, aber niemand kann je einen Owner-Befehl ausfuehren.
  if (!hasValidOwners()) {
    fail(
      'OWNER_NUMBERS/BOT_OWNER_NUMBERS enthalten keine gueltige Telefonnummer. ' +
        'Erwartet werden Ziffern im internationalen Format, per Komma getrennt ' +
        '(z. B. "491701234567,491709876543"). Ohne gueltige Nummer waere kein ' +
        'Owner-Befehl mehr ausfuehrbar.'
    );
  }

  // Gesetzt heisst nicht brauchbar. Die drei Pruefungen unten decken genau die
  // Werte ab, die vorher unbemerkt durchliefen und erst spaeter Schaden machten:
  // ein zu kurzes Panel-Passwort, eine SELF_URL ohne Protokoll (Self-Ping still
  // tot) und ein nicht-numerischer PORT (Render findet keinen Port).
  const secret = (process.env.ACCESS_SECRET || '').trim();
  if (secret.length < MIN_SECRET_LENGTH) {
    fail(
      `ACCESS_SECRET ist zu kurz (${secret.length} Zeichen, mindestens ${MIN_SECRET_LENGTH}). ` +
        'Damit ist das Panel-Passwort ratbar — und hinter dem Panel liegen Kick, Ban, ' +
        'Rundnachrichten und "Alle Daten loeschen". Beispiel fuer einen guten Wert: ' +
        'openssl rand -base64 24'
    );
  }

  const selfUrl = (process.env.SELF_URL || '').trim();
  try {
    const parsed = new URL(selfUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('Protokoll');
  } catch {
    fail(
      `SELF_URL ist keine gueltige http(s)-Adresse (aktuell: "${selfUrl.slice(0, 40)}"). ` +
        'Erwartet wird die vollstaendige oeffentliche Adresse inklusive Protokoll, ' +
        'z. B. "https://mein-bot.onrender.com". Ohne sie bleibt der Keep-Alive-Ping wirkungslos.'
    );
  }

  if (config.portInvalid) {
    fail(
      `PORT ist keine Portnummer (aktuell: "${config.portRaw}"). ` +
        'Node oeffnet bei einem nicht-numerischen Wert keinen TCP-Port, sondern legt einen ' +
        'Unix-Socket dieses Namens an — der Dienst scheint zu laufen, ist aber von aussen ' +
        'nicht erreichbar. Auf Render wird PORT von der Plattform gesetzt; die Variable ' +
        'gehoert dort normalerweise gar nicht ins Environment.'
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
