// Einstiegspunkt: preflight() → initDb() → Web-Panel → Baileys-Socket-Lifecycle.
// Reconnect-Logik folgt exakt der DisconnectReason-Tabelle (515/428/440/411/401/403).

import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  jidNormalizedUser,
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import pino from 'pino';

import { BOT_NAME, OWNER_NUMBERS, config } from './config.js';
import { preflight } from './preflight.js';
import { initDb, startFlushLoop, stopFlushLoop, flushBuffers } from './db.js';
import { useTursoAuthState } from './auth.js';
import { state, setPairingCodeRequester, setForceRelinkHandler } from './state.js';
import { logInfo, logWarn, logError, ownerAlert, setOwnerNotifier } from './logger.js';
import { sendText } from './queue.js';
import { handleUpsert, loadToggles } from './router.js';
import { loadCustomCommands } from './commands/custom.js';
import { loadAfk } from './commands/afk.js';
import { loadMutes, handleJoin, getGroupSettings } from './moderation.js';
import { loadActiveMillionaire } from './commands/millionaer.js';
import { loadActiveEvent } from './events.js';
import { loadGlobalSettings } from './global.js';
import { invalidateGroupMeta } from './permissions.js';
import { initAiUsage } from './ai.js';
import { startScheduler, stopScheduler } from './scheduler.js';
import { createDashboard, refreshGroupCache } from './dashboard.js';

const baileysLogger = pino({ level: 'silent' }); // Baileys-Rauschen komplett stumm

let clearSessionFn = null;
let reconnectTimer = null;
let selfPingTimer = null;
let httpServer = null;
let shuttingDown = false;

// Steht eine Pairing-Code-Anfrage aus, wird sie GENAU EINMAL direkt nach dem
// Aufbau des nächsten frischen Sockets eingelöst (siehe startSocket) — QR- und
// Code-Verknüpfung sind zwei getrennte Modi derselben Verbindung, die von
// Anfang an feststehen müssen. Anfordern auf einem bereits laufenden
// QR-Socket führt auf dem Handy zu "Gerät konnte nicht hinzugefügt werden".
let pendingPairing = null; // { phoneNumber, resolve, reject }

// Aktives Pairing-Fenster: sobald ein Code angefordert wurde, setzt
// requestPairingCode() intern creds.me.id — jeder normale Reconnect würde
// danach einen LOGIN versuchen (statt Registrierung) und mit 401 sterben, was
// den offenen Code ungültig macht. Deshalb wird im Fenster bei jedem
// Verbindungsabbruch (solange NOCH NICHT registriert) stattdessen die Session
// frisch geleert und ein neuer Code auf einem frischen Socket ausgegeben — das
// Panel zeigt per 3s-Poll stets den aktuell gültigen Code.
let activePairingNumber = null;
let activePairingUntil = 0;
let pairingReissues = 0;

/** clearSessionFn ist erst nach dem ersten startSocket()-Durchlauf gesetzt —
 * niemals ungeprüft aufrufen (clearSessionFn?.().catch(...) würde bei null
 * mit "Cannot read properties of undefined (reading 'catch')" crashen). */
async function safeClearSession() {
  try {
    if (clearSessionFn) await clearSessionFn();
  } catch { /* Löschen darf nie werfen — Aufrufer macht trotzdem weiter */ }
}

// In-Memory-Ministore für getMessage (gegen Retry-/Decrypt-Probleme)
const messageStore = new Map(); // "jid|id" → message
function storeMessage(msg) {
  if (!msg?.key?.id || !msg.message) return;
  messageStore.set(`${msg.key.remoteJid}|${msg.key.id}`, msg.message);
  if (messageStore.size > 1500) messageStore.delete(messageStore.keys().next().value);
}

// ── Socket-Lifecycle ───────────────────────────────────────────────
// GARANTIE "genau ein aktiver Socket": currentSock hält den einzigen lebenden
// Socket. Vor jedem Neuaufbau wird der alte vollständig abgebaut (Listener
// entfernt + end()), sonst laufen zwei Sockets parallel gegen denselben
// Signal-Ratchet → Bad MAC / 440. Alle startSocket()-Aufrufe werden über
// startChain SERIALISIERT, damit nie zwei Handshakes gleichzeitig starten.

let currentSock = null;
let startChain = Promise.resolve();
let openStableTimer = null; // nullt reconnectAttempts erst nach stabiler Verbindung
let permanentAlertSent = false; // Owner-Alarm bei Dauerinstabilität nur einmal

// Watchdog-Zustand: reconnectPending = ein geplanter Reconnect-Timer läuft;
// lastProgressAt = Zeitpunkt des letzten Verbindungs-Fortschritts (Event/Start).
// Beides braucht der Watchdog, um "hängt wirklich" von "arbeitet noch" zu trennen.
let reconnectPending = false;
let lastProgressAt = Date.now();
let watchdogTimer = null;
function markProgress() { lastProgressAt = Date.now(); }

/** Den aktuellen Socket vollständig abbauen (idempotent, wirft nie). */
function teardownSocket() {
  const s = currentSock;
  currentSock = null;
  if (state.sock === s) state.sock = null;
  clearTimeout(openStableTimer);
  if (!s) return;
  try { s.ev?.removeAllListeners?.(); } catch { /* egal */ }
  try { s.end?.(undefined); } catch { /* egal */ }
}

/** Öffentlicher Einstieg: serialisiert alle Start-Aufrufe (kein Doppel-Socket). */
function startSocket() {
  startChain = startChain.then(doStartSocket).catch((e) => logError(e, 'startSocket'));
  return startChain;
}

async function doStartSocket() {
  if (shuttingDown || state.stopped) return;
  markProgress(); // ein frischer Start zählt als Fortschritt (Watchdog-Uhr)
  teardownSocket(); // alten Socket IMMER erst sauber beenden

  const { state: authState, saveCreds, clearSession } = await useTursoAuthState('main');
  clearSessionFn = clearSession;

  let version;
  try {
    ({ version } = await fetchLatestBaileysVersion());
  } catch {
    version = undefined; // Baileys nimmt dann seinen eingebauten Standard
  }

  const sock = makeWASocket({
    version,
    auth: {
      creds: authState.creds,
      keys: makeCacheableSignalKeyStore(authState.keys, baileysLogger),
    },
    logger: baileysLogger,
    printQRInTerminal: false, // QR läuft über /qr (geschützt) + ASCII im Log
    markOnlineOnConnect: false, // WICHTIG: Handy bekommt weiter Push-Benachrichtigungen
    syncFullHistory: false,
    browser: [BOT_NAME, 'Chrome', '1.0.0'],
    // WebSocket-Keep-Alive explizit: Baileys pingt regelmäßig; bleibt der Pong
    // aus, feuert Baileys ein 'close' → unser Reconnect greift. Ohne aktiven
    // Ping kann eine tot gegangene Leitung unbemerkt "offen" bleiben.
    keepAliveIntervalMs: config.keepAlive.wsKeepAliveMs,
    // Socket (und damit QR- bzw. Pairing-Fenster) lange offen halten — sonst
    // rotiert Baileys nach 60s und ein noch offener Pairing-Code wird ungültig.
    qrTimeout: config.pairing.qrTimeoutMs,
    getMessage: async (key) => messageStore.get(`${key.remoteJid}|${key.id}`) || undefined,
  });

  currentSock = sock;
  state.sock = sock;
  state.connection = 'connecting';

  // Creds nach JEDER Änderung sichern (mit Retry in auth.js) — verlorene Creds
  // oder Keys sind die Hauptursache für Bad-MAC-Fehler nach einem Reconnect.
  sock.ev.on('creds.update', () => saveCreds().catch((e) => logError(e, 'saveCreds')));

  sock.ev.on('connection.update', (update) => {
    // Events verwaister Sockets ignorieren — sonst stößt ein alter Socket nach
    // 515/411 einen zweiten Reconnect an (Doppel-Socket → 440-Schleife).
    if (state.sock !== sock) return;
    handleConnectionUpdate(update, sock).catch((e) => logError(e, 'connection.update'));
  });

  sock.ev.on('messages.upsert', (upsert) => {
    try {
      for (const m of upsert.messages || []) storeMessage(m);
    } catch { /* Store ist nur Beiwerk */ }
    handleUpsert(upsert).catch((e) => logError(e, 'upsert'));
  });

  sock.ev.on('group-participants.update', (ev) => {
    handleParticipants(ev).catch((e) => logError(e, 'participants'));
  });

  // Pairing-Code SOFORT auf dem frischen Socket anfordern — bevor der normale
  // QR-Handshake überhaupt Fahrt aufnimmt (siehe Kommentar bei pendingPairing).
  // makeWASocket() liefert den Socket zurück, BEVOR die zugrunde liegende
  // WebSocket-Verbindung tatsächlich offen ist — requestPairingCode() wirft in
  // diesem kurzen Fenster hart "Connection Closed" (Baileys wartet dort nicht
  // selbst). Deshalb kurz mit Backoff wiederholen, bis die Verbindung steht.
  if (pendingPairing) {
    const { phoneNumber, resolve, reject } = pendingPairing;
    pendingPairing = null;
    try {
      let raw, lastErr;
      for (let attempt = 0; attempt < 20 && state.sock === sock; attempt++) {
        try {
          raw = await sock.requestPairingCode(phoneNumber);
          lastErr = null;
          break;
        } catch (err) {
          lastErr = err;
          await new Promise((r) => setTimeout(r, 150));
        }
      }
      if (lastErr) throw lastErr;
      if (state.sock !== sock) throw new Error('Socket wurde zwischenzeitlich ersetzt.');
      const formatted = raw.match(/.{1,4}/g)?.join('-') || raw;
      state.pairingCode = formatted;
      state.pairingCodeUpdatedAt = Date.now();
      logInfo(`🔢 Pairing-Code angefordert für +${phoneNumber} (frischer Socket).`);
      resolve(formatted);
    } catch (err) {
      reject(err);
    }
  }
}

async function handleConnectionUpdate({ connection, lastDisconnect, qr }, sock) {
  markProgress(); // jedes Verbindungs-Event ist Fortschritt (Watchdog-Uhr)
  if (qr) {
    // QR-Schleife ist normal, solange nicht gescannt (~60 s neuer Code)
    state.currentQr = await QRCode.toDataURL(qr, { width: 512, margin: 2 }).catch(() => null);
    state.qrUpdatedAt = Date.now();
    logInfo('📱 Neuer QR-Code bereit — im Panel unter /qr scannen.');
    printQrAscii(qr);
    return;
  }

  if (connection === 'open') {
    state.connection = 'open';
    state.currentQr = null;
    state.pairingCode = null; // gekoppelt — Code hat ausgedient
    activePairingNumber = null; // Pairing-Fenster geschlossen
    pairingReissues = 0;
    reconnectPending = false; // verbunden — kein Reconnect mehr offen
    state.lastConnectedAt = Date.now();

    // Reconnect-Zähler NICHT sofort nullen, sondern erst nach 30 s stabiler
    // Verbindung. So wächst der Backoff bei einer flappenden Verbindung
    // (open → sofort close), statt in einer engen 1-s-Schleife zu hängen.
    clearTimeout(openStableTimer);
    openStableTimer = setTimeout(() => {
      state.reconnectAttempts = 0;
      permanentAlertSent = false;
    }, 30_000);

    // LID-Basis: PN-JID UND LID des Bots erfassen (Grundlage der Admin-Erkennung)
    state.botJidPn = state.sock?.user?.id ? jidNormalizedUser(state.sock.user.id) : null;
    state.botJidLid = state.sock?.user?.lid ? jidNormalizedUser(state.sock.user.lid) : null;
    logInfo(`✅ Verbunden als ${BOT_NAME} (PN: ${state.botJidPn || '—'} · LID: ${state.botJidLid || '—'})`);

    // Gruppen-Cache im Hintergrund vorwärmen (Panel zeigt Gruppenzahl sofort,
    // LID-Mappings werden gelernt) — Fehler dabei sind unkritisch.
    setTimeout(() => refreshGroupCache().catch((e) => logError(e, 'groupCache')), 8000);
    return;
  }

  if (connection === 'close') {
    state.connection = 'close';
    const code = lastDisconnect?.error?.output?.statusCode ?? 0;

    if (shuttingDown) return;

    // Aktives Pairing-Fenster, noch NICHT registriert → NICHT normal reconnecten
    // (das würde als Login enden und mit 401 den offenen Code töten). Stattdessen
    // Session frisch leeren und einen neuen Code auf einem frischen Socket
    // ausgeben. registered=true (Pairing erfolgreich) fällt bewusst durch zum
    // normalen 515-Reconnect, der dann als Login sauber online geht.
    const registered = !!sock?.authState?.creds?.registered;
    if (activePairingNumber && !registered && Date.now() < activePairingUntil) {
      if (pairingReissues < config.pairing.maxReissues) {
        pairingReissues++;
        logWarn(`🔢 Pairing-Abbruch (Code ${code || '?'}) — EIN sanfter neuer Versuch in ${config.pairing.reissueDelayMs / 1000}s.`);
        clearTimeout(reconnectTimer);
        teardownSocket(); // alten Socket samt Listenern sauber beenden
        await safeClearSession(); // wischt creds.me → nächster Socket registriert (kein Login-401)
        // Bewusst mit Pause: rapides Neuanfordern lässt WhatsApp die Nummer als
        // verdächtig einstufen (Registrierung wird dann dauerhaft abgelehnt).
        await new Promise((r) => setTimeout(r, config.pairing.reissueDelayMs));
        if (state.sock) return; // in der Pause hat schon etwas anderes übernommen
        pendingPairing = { phoneNumber: activePairingNumber, resolve: () => {}, reject: () => {} };
        return void startSocket().catch((e) => logError(e, 'pairing-reissue'));
      }
      // Sanfter Versuch gescheitert → aufgeben und in den QR-Modus (zuverlässiger).
      activePairingNumber = null;
      state.pairingCode = null;
      pairingReissues = 0;
      logWarn('🔢 Code-Verbindung scheitert wiederholt — bitte stattdessen den QR-Code scannen.');
      // fällt durch zum normalen Handling (401 → Session frisch → QR erscheint)
    }

    switch (code) {
      case DisconnectReason.restartRequired: // 515 — normal nach Pairing
        logInfo('🔁 Restart nach Pairing (515) — verbinde sofort neu (kein Fehler).');
        return void startSocket().catch((e) => logError(e, 'startSocket'));

      case DisconnectReason.loggedOut: // 401 — alte Session NICHT reconnecten
        logWarn('⛔ 401 loggedOut: Session wird gelöscht, frische Kopplung über /qr nötig.');
        await safeClearSession();
        state.pairingCode = null; // alter Code gehörte zur gelöschten Session
        await ownerAlert(
          '⛔ *Bot wurde ausgeloggt (401).* Die Session wurde zurückgesetzt — bitte im Panel unter /qr neu koppeln.'
        );
        // Frischen (ungekoppelten) Socket starten, damit /qr sofort einen neuen Code zeigt.
        return void startSocket().catch((e) => logError(e, 'startSocket'));

      case DisconnectReason.badSession: // 500 — Session kaputt → löschen, neuer QR
        logWarn(`⚠️ Session beschädigt (${code}) — lösche Session, neuer QR nötig.`);
        await safeClearSession();
        state.pairingCode = null; // alter Code gehörte zur gelöschten Session
        await ownerAlert('⚠️ Session war beschädigt und wurde zurückgesetzt — bitte /qr neu scannen.');
        return void startSocket().catch((e) => logError(e, 'startSocket'));

      case DisconnectReason.multideviceMismatch: // 411 — Geräte-/Versions-Konflikt, altes Pairing ungültig
        logWarn('⚠️ Multi-Device-Konflikt (411) — Verknüpfung ist ungültig geworden, lösche Session.');
        await safeClearSession();
        state.pairingCode = null;
        await ownerAlert(
          '⚠️ *Verknüpfung ungültig geworden (411).* Das passiert z. B. nach einem Geräte-Limit oder App-Update auf dem Handy. Session wurde zurückgesetzt — bitte /qr neu scannen.'
        );
        return void startSocket().catch((e) => logError(e, 'startSocket'));

      // 428/408: normale Verbindungsabbrüche (WLAN-Hopser, WhatsApp-Serverseite,
      // Render-Idle) — kein Session-Problem, blindes Reconnecten mit Backoff reicht.
      case DisconnectReason.connectionClosed:
      case DisconnectReason.connectionLost: // == timedOut (beide 408)
        scheduleReconnect(code, code === DisconnectReason.connectionClosed ? 'Verbindung geschlossen' : 'Verbindung verloren/Timeout');
        return;

      case DisconnectReason.connectionReplaced: // 440 — nicht blind reconnecten
        state.stopped = true;
        state.stopReason = 'Andere Session aktiv (440)';
        await ownerAlert(
          '⚠️ *Verbindung ersetzt (440):* Irgendwo läuft eine zweite Bot-Session. Ich stoppe, um keine Endlosschleife zu bauen — andere Instanz beenden, dann neu starten.'
        );
        return;

      case DisconnectReason.forbidden: // 403 — möglicher Ban → STOPPEN
      case 403:
        state.stopped = true;
        state.stopReason = 'Möglicher Ban (403)';
        await ownerAlert(
          '🚨 *403 erhalten — möglicherweise wurde die Nummer gesperrt!* Ich stoppe alle Reconnects. Bitte Nummer in WhatsApp prüfen, bevor irgendetwas neu gestartet wird.'
        );
        return;

      default:
        scheduleReconnect(code);
    }
  }
}

/**
 * Auto-Reconnect mit exponentiellem Backoff (1 s → max 60 s) + Jitter — nie in
 * enger Schleife gegen WhatsApp rennen. Deckt ALLE nicht gesondert behandelten
 * Trennungsgründe ab (428/408 explizit, alles Unbekannte über den default-Zweig).
 *
 * SELBSTHEILUNG: Der Bot gibt NICHT dauerhaft auf. Nach vielen Fehlversuchen
 * wird der Takt auf das Maximum gedeckelt und der Owner EINMAL informiert — es
 * wird aber weiter versucht, damit sich der Bot von selbst erholt, sobald Netz
 * oder WhatsApp wieder erreichbar sind (24/7-Betrieb auf Render). Ein harter
 * Stopp erfolgt nur bei 403 (Ban) und 440 (andere Session) — dort ist Weiter-
 * versuchen schädlich.
 */
function scheduleReconnect(code, label = '') {
  if (shuttingDown || state.stopped) return;
  state.reconnectAttempts++;
  const n = state.reconnectAttempts;

  if (n === config.reconnect.maxAttempts + 1 && !permanentAlertSent) {
    permanentAlertSent = true;
    ownerAlert(
      `⚠️ *Verbindung seit ${config.reconnect.maxAttempts} Versuchen instabil* (zuletzt Code ${code || '?'}). ` +
        `Ich versuche es weiter im ${Math.round(config.reconnect.maxDelayMs / 1000)}s-Takt — der Bot bleibt am Leben und verbindet sich automatisch, sobald es wieder geht.`
    ).catch(() => {});
  }

  // Exponentieller Backoff, Exponent gedeckelt (kein Overflow), dann Max-Takt.
  const base = Math.min(
    config.reconnect.baseDelayMs * 2 ** Math.min(n - 1, 16),
    config.reconnect.maxDelayMs
  );
  const delay = base + Math.floor(Math.random() * 1000);
  const suffix = label ? ` (${label})` : '';
  logInfo(`🔁 Verbindungsabbruch Code ${code || '?'}${suffix} — Reconnect-Versuch ${n} in ${Math.round(delay / 1000)}s.`);
  clearTimeout(reconnectTimer);
  reconnectPending = true; // ab jetzt läuft ein geplanter Reconnect (Watchdog weiß Bescheid)
  markProgress();
  reconnectTimer = setTimeout(() => {
    reconnectPending = false;
    startSocket().catch((e) => logError(e, 'startSocket'));
  }, delay);
}

/**
 * Verbindungs-Watchdog — schließt die einzige Lücke, die der Reconnect nicht
 * sieht: einen halb-offenen "Zombie"-Socket, der als 'open' gilt, dessen echte
 * WebSocket aber tot ist. Dann feuert KEIN 'close' und ohne Watchdog reconnectet
 * nichts — der Bot wirkt verbunden, reagiert aber auf nichts. Zusätzlich als
 * Backstop: falls die Reconnect-Kette je stillsteht, stößt der Watchdog sie neu
 * an. Läuft im ${config.keepAlive.watchdogMs / 1000}s-Takt, wirft nie.
 */
function watchdogTick() {
  if (shuttingDown || state.stopped) return;

  // 1) Zombie: state sagt 'open', der reale WebSocket ist aber tot → sofort neu.
  if (state.connection === 'open') {
    const ws = currentSock?.ws;
    if (ws && !ws.isOpen) {
      logWarn('🐕 Watchdog: WhatsApp-Verbindung ist tot, meldet aber "open" — erzwinge Reconnect.');
      teardownSocket();
      state.connection = 'close';
      scheduleReconnect(0, 'Watchdog: toter Socket');
    }
    return;
  }

  // 2) Backstop: nicht verbunden, kein geplanter Reconnect, kein Pairing-Fenster
  //    und seit Langem kein Fortschritt → Kette angestoßen halten (nie versanden).
  if (
    !reconnectPending && !pendingPairing && !activePairingNumber &&
    Date.now() - lastProgressAt > config.keepAlive.stuckMs
  ) {
    logWarn('🐕 Watchdog: keine Verbindung und kein geplanter Reconnect — stoße neu an.');
    scheduleReconnect(0, 'Watchdog: Kette angestoßen');
  }
}

function startWatchdog() {
  clearInterval(watchdogTimer);
  watchdogTimer = setInterval(() => {
    try { watchdogTick(); } catch (e) { logError(e, 'watchdog'); }
  }, config.keepAlive.watchdogMs);
  watchdogTimer.unref?.(); // darf einen sauberen Shutdown nicht blockieren
}

function printQrAscii(qr) {
  QRCode.toString(qr, { type: 'terminal', small: true })
    .then((s) => console.log(s))
    .catch(() => {});
}

// ── Gruppen-Events (Joins: Willkommen, Bans, Anti-Raid) ────────────

async function handleParticipants({ id, participants, action }) {
  // Bei JEDER Teilnehmer-Änderung den Metadata-Cache verwerfen —
  // promote/demote ändert Admin-Rechte, die Checks müssen frisch sein.
  invalidateGroupMeta(id);
  if (action !== 'add') return;
  await handleJoin(id, participants);
  try {
    const settings = await getGroupSettings(id);
    if (Number(settings.welcome) && Number(settings.enabled)) {
      const few = participants.slice(0, 5);
      const tags = few.map((p) => `@${String(p).split('@')[0]}`).join(' ');
      const custom = String(settings.welcome_text || '').trim();
      const text = custom
        ? custom.replaceAll('{name}', tags)
        : `👋 Willkommen ${tags}! Schau dir mit \`!regeln\` die Gruppenregeln an — Befehle: \`!hilfe\``;
      await sendText(id, text, few);
    }
  } catch (err) {
    logError(err, 'welcome');
  }
}

// ── Owner-Benachrichtigung für logger.ownerAlert ───────────────────

setOwnerNotifier(async (message) => {
  if (state.connection !== 'open') return;
  for (const num of OWNER_NUMBERS) {
    await sendText(`${num}@s.whatsapp.net`, `🤖 *${BOT_NAME}*\n${message}`);
  }
});

// ── Pairing-Code (Alternative zum QR-Scan, fürs Panel) ─────────────

let lastPairingRequestAt = 0;

setPairingCodeRequester((phoneNumber) => {
  if (!state.sock) return Promise.reject(new Error('Kein aktiver Socket — bitte kurz warten und erneut versuchen.'));
  if (state.connection === 'open') return Promise.reject(new Error('Der Bot ist bereits verbunden — kein Code nötig.'));
  if (state.sock.authState?.creds?.registered) {
    return Promise.reject(new Error('Diese Session ist schon gekoppelt — erst zurücksetzen, dann neu koppeln.'));
  }
  const wait = config.pairing.cooldownMs - (Date.now() - lastPairingRequestAt);
  if (wait > 0) {
    return Promise.reject(new Error(`Bitte noch ${Math.ceil(wait / 1000)} Sekunden warten, bevor ein neuer Code angefragt wird.`));
  }
  lastPairingRequestAt = Date.now();

  // Pairing-Fenster öffnen: ab jetzt hält handleConnectionUpdate den Code bei
  // jedem Abbruch am Leben (frischer Socket + neuer Code), bis registriert oder
  // das Fenster abläuft.
  activePairingNumber = phoneNumber;
  activePairingUntil = Date.now() + config.pairing.windowMs;
  pairingReissues = 0;

  // Verbindung sauber neu aufbauen — der Code wird erst auf dem FRISCHEN
  // Socket eingelöst (in startSocket), nicht auf diesem hier, der ggf. schon
  // mitten im QR-Handshake steckt.
  return new Promise((resolve, reject) => {
    pendingPairing = { phoneNumber, resolve, reject };
    clearTimeout(reconnectTimer);
    teardownSocket(); // alten Socket samt Listenern sauber beenden
    state.currentQr = null;
    state.pairingCode = null;
    state.stopped = false;
    state.reconnectAttempts = 0;
    state.connection = 'connecting';
    safeClearSession().then(() =>
      startSocket().catch((err) => {
        pendingPairing = null;
        reject(err);
      })
    );
  });
});

// ── Sitzung hart zurücksetzen (Notfall-Knopf im Panel) ─────────────
// Für den Fall, dass die gespeicherte Session kaputt ist, Baileys sich aber
// noch für "registriert" hält: scheduleReconnect() würde dann endlos mit
// denselben toten Zugangsdaten gegen dieselbe Wand rennen — nie ein neuer
// QR/Pairing-Code, weil der nur bei UNregistrierten Creds erscheint. Dieser
// Knopf ist bewusst kompromisslos: alte Session in der DB löschen, alten
// Socket sofort kappen, sofort blank neu starten. Ob das alte Handy die
// Verknüpfung noch anzeigt, spielt keine Rolle — das klärt sich von selbst,
// sobald sich woanders neu verbunden wird.

let lastRelinkAt = 0;

setForceRelinkHandler(async () => {
  const wait = config.session.relinkCooldownMs - (Date.now() - lastRelinkAt);
  if (wait > 0) throw new Error(`Bitte noch ${Math.ceil(wait / 1000)} Sekunden warten.`);
  lastRelinkAt = Date.now();

  clearTimeout(reconnectTimer);
  activePairingNumber = null; // evtl. offenes Pairing-Fenster verwerfen
  pairingReissues = 0;
  teardownSocket(); // alten Socket samt Listenern sofort sauber beenden
  state.currentQr = null;
  state.pairingCode = null;
  state.stopped = false;
  state.stopReason = '';
  state.reconnectAttempts = 0;
  state.connection = 'connecting';

  await safeClearSession();
  logWarn('🔁 Sitzung manuell über das Panel zurückgesetzt — starte frisch (neuer QR/Pairing-Code folgt).');
  await startSocket();
});

// ── Prozess-Sicherheitsnetze & Graceful Shutdown ───────────────────

process.on('uncaughtException', (err) => logError(err, 'uncaughtException'));
process.on('unhandledRejection', (err) => logError(err, 'unhandledRejection'));

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logInfo(`🛑 ${signal} empfangen — fahre sauber herunter (Session bleibt intakt).`);
  try {
    stopScheduler();
    stopFlushLoop();
    clearTimeout(reconnectTimer);
    clearInterval(selfPingTimer);
    clearInterval(watchdogTimer);
    await flushBuffers().catch(() => {});
    httpServer?.close();
    teardownSocket();
  } catch (err) {
    logError(err, 'shutdown');
  }
  setTimeout(() => process.exit(0), 1500);
}
process.on('SIGTERM', () => shutdown('SIGTERM')); // Render-Deploy
process.on('SIGINT', () => shutdown('SIGINT'));

// ── Start ──────────────────────────────────────────────────────────

async function main() {
  console.log(`🤖 ${BOT_NAME} startet …`);
  await preflight(); // beendet sich selbst mit Klartext-Meldung bei Config-Fehlern
  await initDb();

  // Persistente Zustände in den RAM laden
  await Promise.all([loadToggles(), loadCustomCommands(), loadAfk(), loadMutes(), initAiUsage(), loadActiveMillionaire(), loadActiveEvent(), loadGlobalSettings()]);

  startFlushLoop();
  startScheduler();
  startWatchdog(); // Verbindungs-Watchdog (Zombie-Schutz + Reconnect-Backstop)

  // Web-Panel sofort starten, damit /qr und /health von Anfang an erreichbar sind
  const app = createDashboard();
  const port = process.env.PORT || 3000;
  httpServer = app.listen(port, () => logInfo(`🌐 Panel & /health laufen auf Port ${port}.`));

  // Interner Zusatz-Ping (der externe UptimeRobot auf SELF_URL/health bleibt Pflicht!)
  const selfUrl = (process.env.SELF_URL || '').trim().replace(/\/+$/, '');
  if (selfUrl) {
    selfPingTimer = setInterval(() => {
      fetch(`${selfUrl}/health`).catch(() => {});
    }, config.keepAlive.selfPingMs);
  }

  await startSocket();
}

main().catch((err) => {
  console.error('❌ START ABGEBROCHEN: Unerwarteter Fehler beim Hochfahren:');
  console.error(String(err?.stack || err));
  process.exit(1);
});
