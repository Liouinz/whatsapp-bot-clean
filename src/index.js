import http from 'node:http';
import https from 'node:https';
import QRCode from 'qrcode';
import { makeWASocket, DisconnectReason, fetchLatestBaileysVersion, jidNormalizedUser } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { config } from './config.js';
import { logger } from './logger.js';
import { loadCommands } from './loader.js';
import { createDashboard } from './dashboard.js';
import { initDb, startFlushLoop, stopFlushLoop, flushBuffers } from './db.js';
import { useTursoAuthState, flushAuth, clearAuthSession } from './auth.js';
import { handleUpsert, loadToggles, setRegistry } from './router.js';
import { loadMutes, handleJoin } from './moderation.js';
import { initAiUsage } from './ai.js';
import { state, setForceRelinkHandler, setPairingCodeRequester } from './state.js';
import { preflight } from './preflight.js';
import { startScheduler, stopScheduler } from './scheduler.js';
import { loadGlobalSettings } from './global.js';

let watchdogTimer = null;
let botSock = null;

// Lifecycle-Zustand des Reconnects. Ohne gehaltenes Timer-Handle konnte ein
// bereits geplanter Reconnect parallel zu einem manuellen Relink feuern und
// einen zweiten Socket gegen dieselbe Session oeffnen.
let reconnectTimer = null;
let connecting = false;
let authHandle = null;

function cancelPendingReconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function scheduleReconnect(delayMs) {
  cancelPendingReconnect();
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    startWhatsApp().catch((err) => logger.error(err, 'Baileys.reconnect'));
  }, delayMs);
  if (reconnectTimer.unref) reconnectTimer.unref();
}

function startWatchdog(sock) {
  if (watchdogTimer) clearInterval(watchdogTimer);
  watchdogTimer = setInterval(() => {
    if (sock?.ws && !sock.ws.isOpen) {
      logger.warn('WebSocket scheint tot zu sein (ws.isOpen ist false).', 'Watchdog');
    }
  }, config.keepAlive.wsKeepAliveMs);
  if (watchdogTimer.unref) watchdogTimer.unref();
}

function stopWatchdog() {
  if (watchdogTimer) {
    clearInterval(watchdogTimer);
    watchdogTimer = null;
  }
}

let selfPingTimer = null;

function startSelfPing() {
  if (selfPingTimer) clearInterval(selfPingTimer);
  const url = config.selfUrl?.trim();
  if (!url) {
    logger.warn('SELF_URL nicht gesetzt — Self-Ping deaktiviert.', 'KeepAlive');
    return;
  }
  selfPingTimer = setInterval(() => {
    try {
      const client = url.startsWith('https:') ? https : http;
      const req = client.get(url, { timeout: 10000 }, (res) => {
        if (res.statusCode !== 200) {
          logger.warn(`Self-Ping Antwort: ${res.statusCode}`, 'KeepAlive');
        }
        res.resume();
      });
      req.on('error', (err) => {
        logger.warn(`Self-Ping fehlgeschlagen: ${err.message}`, 'KeepAlive');
      });
      req.on('timeout', () => {
        req.destroy();
        logger.warn('Self-Ping Timeout.', 'KeepAlive');
      });
    } catch (err) {
      // http.get()/https.get() werfen bei ungueltiger URL synchron - das darf
      // den Prozess nie mitreissen (war die Ursache der Crash-Loop).
      logger.warn(`Self-Ping fehlgeschlagen: ${err.message}`, 'KeepAlive');
    }
  }, config.keepAlive.selfPingMs || 30000);
  if (selfPingTimer.unref) selfPingTimer.unref();
  logger.info(`Self-Ping aktiv: alle ${config.keepAlive.selfPingMs || 30000}ms → ${url}`, 'KeepAlive');
}

function stopSelfPing() {
  if (selfPingTimer) {
    clearInterval(selfPingTimer);
    selfPingTimer = null;
  }
}

let dbHeartbeatTimer = null;

function startDbHeartbeat() {
  if (dbHeartbeatTimer) clearInterval(dbHeartbeatTimer);
  dbHeartbeatTimer = setInterval(async () => {
    try {
      const { dbRows } = await import('./db.js');
      await dbRows('SELECT 1');
    } catch (err) {
      logger.warn(`DB-Heartbeat Fehler: ${err.message}`, 'KeepAlive');
    }
  }, 60000);
  if (dbHeartbeatTimer.unref) dbHeartbeatTimer.unref();
  logger.info('DB-Heartbeat aktiv: jede 60000ms', 'KeepAlive');
}

function stopDbHeartbeat() {
  if (dbHeartbeatTimer) {
    clearInterval(dbHeartbeatTimer);
    dbHeartbeatTimer = null;
  }
}

function cleanupSocket(sock) {
  if (!sock) return;
  try {
    sock.ev.removeAllListeners();
    sock.ws?.close();
  } catch (err) {
    // ignorieren
  }
}

async function gracefulShutdown(reason) {
  logger.info(`${reason} empfangen — fahre sauber herunter...`, 'Shutdown');
  cancelPendingReconnect();
  stopWatchdog();
  stopSelfPing();
  stopDbHeartbeat();
  stopScheduler();
  stopFlushLoop();
  try {
    await flushAuth();
    await flushBuffers();
  } catch (err) {
    logger.error(err, 'Shutdown');
  }
  process.exit(0);
}

process.on('uncaughtException', async (err) => {
  logger.error(err, 'uncaughtException');
  await gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  logger.error(reason, 'unhandledRejection');
});

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

async function startWhatsApp() {
  if (connecting) {
    logger.warn('startWhatsApp() laeuft bereits — doppelter Aufruf ignoriert.', 'Baileys');
    return;
  }
  connecting = true;
  try {
    await startWhatsAppInner();
  } finally {
    connecting = false;
  }
}

async function startWhatsAppInner() {
  logger.info('Starte Baileys WhatsApp Socket...', 'Baileys');

  // Ein bereits geplanter Reconnect darf nicht zusaetzlich feuern, sonst
  // laufen zwei Baileys-Sockets gegen dieselbe Session.
  cancelPendingReconnect();

  // Vorherige Auth-State-Instanz freigeben. Ohne das waechst activeFlushers
  // mit jedem Reconnect, und ein alter Flusher kann spaeter stale Keys in die
  // neue Session schreiben.
  if (authHandle) {
    const previous = authHandle;
    authHandle = null;
    await previous.dispose().catch((err) => logger.error(err, 'Baileys.authDispose'));
  }

  authHandle = await useTursoAuthState('main');
  const { state: authState, saveCreds } = authHandle;
  const { version, isLatest } = await fetchLatestBaileysVersion();
  logger.info(`Baileys Version v${version.join('.')}, isLatest: ${isLatest}`, 'Baileys');

  const baileysLogger = {
    trace: () => {},
    debug: () => {},
    info: () => {},
    warn: (m) => logger.warn(m, 'Baileys'),
    error: (m) => logger.error(m, 'Baileys'),
    fatal: (m) => logger.error(m, 'Baileys'),
    child: () => baileysLogger,
    level: 'silent',
  };

  const sock = makeWASocket({
    version,
    auth: authState,
    logger: baileysLogger,
  });

  botSock = sock;
  state.sock = sock;

  setPairingCodeRequester(async (phoneNumber) => {
    if (!sock || state.connection === 'open') {
      throw new Error('Socket nicht im Verbindungsmodus.');
    }
    const code = await sock.requestPairingCode(phoneNumber);
    state.pairingCode = code;
    state.pairingCodeUpdatedAt = Date.now();
    return code;
  });

  sock.ev.process(async (events) => {
    if (events['connection.update']) {
      const update = events['connection.update'];
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          state.currentQr = await QRCode.toDataURL(qr, { margin: 2, scale: 8 });
          state.qrUpdatedAt = Date.now();
          console.log('--------------------------------------------------');
          console.log('📲 QR-CODE EMPFANGEN — Bitte im Dashboard oder mit WhatsApp scannen:');
          console.log('--------------------------------------------------');
          try {
            const qrcodeTerminal = await import('qrcode-terminal');
            qrcodeTerminal.default.generate(qr, { small: true });
          } catch {
            console.log(qr);
          }
          console.log('--------------------------------------------------');
        } catch (err) {
          logger.error(`Fehler bei QR-Code-Generierung: ${err.message}`, 'Baileys');
        }
      }

      state.connection = connection || state.connection;

      if (connection === 'close') {
        state.lastConnectedAt = null;
        state.currentQr = null;
        state.qrUpdatedAt = 0;
        state.pairingCode = null;
        state.pairingCodeUpdatedAt = 0;

        const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
        logger.warn(`Verbindung geschlossen wegen ${lastDisconnect?.error}, Code: ${statusCode}`, 'Baileys');

        stopWatchdog();
        cleanupSocket(botSock);
        botSock = null;
        state.sock = null;

        // Fatal-Codes abfangen (401, 403, 440 -> kein unendlicher Reconnect)
        if ([401, 403, 440].includes(statusCode)) {
          logger.error(`Kritischer Auth-Fehler (${statusCode}). Bot wird gestoppt. Bitte neu verknüpfen.`, 'Baileys');
          state.stopped = true;
          state.stopReason = `Auth-Fehler ${statusCode}`;
          return;
        }

        state.reconnectAttempts = (state.reconnectAttempts || 0) + 1;
        const maxAttempts = config.reconnect?.maxAttempts || 10;

        // Code 515 (Restart Required) -> schnell neu verbinden, aber gezaehlt.
        // Frueher lief dieser Pfad am Zaehler und am Cap vorbei: haelt die
        // Ursache an (z. B. beschaedigte Keys), reconnectete der Bot endlos
        // alle 500 ms gegen Turso und WhatsApp.
        if (statusCode === 515) {
          if (state.reconnectAttempts >= maxAttempts) {
            logger.error(
              `Code 515 dauerhaft (${state.reconnectAttempts} Versuche). Bot wird gestoppt.`,
              'Baileys'
            );
            state.stopped = true;
            state.stopReason = 'Code 515 — Reconnect-Limit erreicht';
            return;
          }
          logger.info(
            `Code 515 empfangen — Reconnect-Versuch ${state.reconnectAttempts}/${maxAttempts}.`,
            'Baileys'
          );
          scheduleReconnect(500);
          return;
        }

        if (state.reconnectAttempts < maxAttempts) {
          if (statusCode === DisconnectReason.loggedOut) {
            logger.info('Auth-Daten werden zurückgesetzt für neuen QR-Code...', 'Baileys');
            try {
              await clearAuthSession('main');
            } catch (err) {
              logger.error(err, 'Baileys.clearSession');
            }
          }
          const baseDelay = config.reconnect?.baseDelayMs || 1000;
          const maxDelay = config.reconnect?.maxDelayMs || 30000;
          const jitter = Math.random() * 500;
          const delay = Math.min(maxDelay, baseDelay * Math.pow(2, state.reconnectAttempts - 1)) + jitter;
          logger.info(`Reconnection-Versuch ${state.reconnectAttempts}/${maxAttempts} in ${Math.round(delay)}ms...`, 'Baileys');
          scheduleReconnect(delay);
        } else {
          logger.error('Maximale Reconnect-Versuche erreicht. Bot wird nicht neu verbunden.', 'Baileys');
          // Ohne dieses Flag blieb der Bot still liegen: das Panel sah weiterhin
          // einen laufenden, nur "geschlossenen" Bot statt "aufgegeben".
          state.stopped = true;
          state.stopReason = `Reconnect-Limit (${maxAttempts}) erreicht`;
        }
      } else if (connection === 'open') {
        state.lastConnectedAt = Date.now();
        state.reconnectAttempts = 0;
        state.currentQr = null;
        state.qrUpdatedAt = 0;
        state.pairingCode = null;
        state.pairingCodeUpdatedAt = 0;
        if (sock.user?.id) {
          state.botJidPn = jidNormalizedUser(sock.user.id);
          state.botJidLid = sock.user.lid ? jidNormalizedUser(sock.user.lid) : null;
        }
        logger.success('WhatsApp Verbindung erfolgreich aufgebaut!', 'Baileys');
      }
    }

    if (events['creds.update']) {
      try {
        await saveCreds();
      } catch (err) {
        logger.error(err, 'Baileys.saveCreds');
      }
    }

    if (events['messages.upsert']) {
      const m = events['messages.upsert'];
      try {
        await handleUpsert(m);
      } catch (err) {
        logger.error(err, 'Router');
      }
    }

    if (events['group-participants.update']) {
      const { id, participants, action } = events['group-participants.update'];
      if (['add', 'remove', 'promote', 'demote'].includes(action)) {
        try {
          if (action === 'add') await handleJoin(id, participants);
        } catch (err) {
          logger.error(err, 'GroupParticipantsUpdate');
        }
      }
    }
  });

  startWatchdog(sock);
  return sock;
}

async function main() {
  logger.info(`Starte ${config.botName}...`, 'Bootstrap');

  try {
    await preflight();
    startScheduler();

    logger.info('Initialisiere Datenbank-Tabellen...', 'Bootstrap');
    await initDb();
    logger.success('Datenbank erfolgreich initialisiert.', 'Bootstrap');

    logger.info('Lade Status (Mutes, Toggles, AI-Quota, Global-Settings)...', 'Bootstrap');
    await Promise.all([
      loadMutes(),
      loadToggles(),
      initAiUsage(),
      loadGlobalSettings(),
    ]);
    logger.success('Runtime-Zustände erfolgreich geladen.', 'Bootstrap');

    const commandsMap = await loadCommands();
    const uniqueCommands = Array.from(commandsMap.values()).filter((v, i, a) => a.findIndex(c => c.name === v.name) === i);
    setRegistry(uniqueCommands);
    logger.success(`${uniqueCommands.length} Befehle erfolgreich geladen.`, 'Bootstrap');

    const app = createDashboard();
    const port = process.env.PORT || 3000;
    const server = app.listen(port, () => {
      logger.success(`Control Center Dashboard läuft auf Port ${port}`, 'Bootstrap');
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        logger.error(`Port ${port} ist bereits belegt! Bitte stoppe andere laufende Instanzen.`, 'Bootstrap');
        process.exit(1);
      } else {
        logger.error(err, 'Server');
      }
    });

    setForceRelinkHandler(async () => {
      logger.info('Force-Relink: Auth-Session wird zurückgesetzt...', 'Relink');
      // Einen bereits geplanten automatischen Reconnect abbrechen, sonst
      // startet er zusaetzlich zum Relink einen zweiten Socket.
      cancelPendingReconnect();
      stopWatchdog();
      cleanupSocket(botSock);
      botSock = null;
      state.sock = null;
      state.currentQr = null;
      state.qrUpdatedAt = 0;
      state.pairingCode = null;

      // Ausstehende Key-Writes der alten Instanz verwerfen (nicht flushen) —
      // nach dem Zuruecksetzen der Session sind sie stale und wuerden die
      // frische Session beschaedigen.
      if (authHandle) {
        const previous = authHandle;
        authHandle = null;
        await previous.dispose({ flush: false }).catch((err) => logger.error(err, 'Relink.dispose'));
      }

      await clearAuthSession('main');

      state.reconnectAttempts = 0;
      state.stopped = false;
      state.stopReason = null;
      scheduleReconnect(1500);
    });

    startSelfPing();
    startDbHeartbeat();
    startFlushLoop();
    await startWhatsApp();
  } catch (err) {
    logger.error(err, 'Bootstrap');
    process.exit(1);
  }
}

if (process.argv[1] === import.meta.url || process.argv[1]?.endsWith('index.js')) {
  main();
}

export { main, botSock };
