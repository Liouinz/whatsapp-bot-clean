import http from 'node:http';
import QRCode from 'qrcode';
import { makeWASocket, DisconnectReason, fetchLatestBaileysVersion, jidNormalizedUser } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { config } from './config.js';
import { logger } from './logger.js';
import { loadCommands } from './loader.js';
import { createDashboard } from './dashboard.js';
import { initDb, startFlushLoop, stopFlushLoop, flushBuffers } from './db.js';
import { useTursoAuthState, flushAuth } from './auth.js';
import { handleUpsert, loadToggles, setRegistry } from './router.js';
import { loadMutes, handleJoin } from './moderation.js';
import { initAiUsage } from './ai.js';
import { state, setForceRelinkHandler, setPairingCodeRequester } from './state.js';
import { preflight } from './preflight.js';
import { startScheduler } from './scheduler.js';
import { loadGlobalSettings } from './global.js';

let watchdogTimer = null;
let botSock = null;

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
    const req = http.get(url, { timeout: 10000 }, (res) => {
      if (res.statusCode !== 200) {
        logger.warn(`Self-Ping Antwort: ${res.statusCode}`, 'KeepAlive');
      }
    });
    req.on('error', (err) => {
      logger.warn(`Self-Ping fehlgeschlagen: ${err.message}`, 'KeepAlive');
    });
    req.on('timeout', () => {
      req.destroy();
      logger.warn('Self-Ping Timeout.', 'KeepAlive');
    });
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

process.on('uncaughtException', async (err) => {
  logger.error(err, 'uncaughtException');
  stopWatchdog();
  stopSelfPing();
  stopDbHeartbeat();
  stopFlushLoop();
  await flushAuth().catch(() => {});
  await flushBuffers().catch(() => {});
  setTimeout(() => process.exit(1), 1000);
});

process.on('unhandledRejection', (reason) => {
  logger.error(reason, 'unhandledRejection');
});

process.on('SIGTERM', async () => {
  stopWatchdog();
  stopSelfPing();
  stopDbHeartbeat();
  stopFlushLoop();
  await flushAuth().catch(() => {});
  await flushBuffers().catch(() => {});
  await new Promise(r => setTimeout(r, 500));
  process.exit(0);
});

process.on('SIGINT', async () => {
  stopWatchdog();
  stopSelfPing();
  stopDbHeartbeat();
  stopFlushLoop();
  await flushAuth().catch(() => {});
  await flushBuffers().catch(() => {});
  await new Promise(r => setTimeout(r, 500));
  process.exit(0);
});

async function startWhatsApp() {
  logger.info('Starte Baileys WhatsApp Socket...', 'Baileys');
  const { state: authState, saveCreds } = await useTursoAuthState('main');
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
          // Erzeuge ein valides PNG als Base64 DataURL für das Frontend
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

        state.reconnectAttempts = (state.reconnectAttempts || 0) + 1;
        if (state.reconnectAttempts < (config.reconnect?.maxAttempts || 10)) {
          if (statusCode === DisconnectReason.loggedOut) {
            logger.info('Auth-Daten werden zurückgesetzt für neuen QR-Code...', 'Baileys');
            try {
              const auth = await useTursoAuthState('main');
              await auth.clearSession();
            } catch (err) {
              logger.error(err, 'Baileys.clearSession');
            }
          }
          setTimeout(() => startWhatsApp(), 5000);
        } else {
          logger.error('Maximale Reconnect-Versuche erreicht. Bot wird nicht neu verbunden.', 'Baileys');
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

    const commands = await loadCommands();
    const uniqueCommands = Array.from(commands.values()).filter((v, i, a) => a.findIndex(c => c.name === v.name) === i);
    setRegistry(uniqueCommands);
    logger.success(`${commands.size} Befehle erfolgreich geladen.`, 'Bootstrap');

    const app = createDashboard();
    const port = process.env.PORT || 3000;
    const server = app.listen(port, () => {
      logger.success(`Control Center Dashboard läuft auf Port ${port}`, 'Bootstrap');
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        logger.error(`Port ${port} ist bereits belegt! Bitte stoppe andere laufende Instanzen (z. B. mit 'killall node').`, 'Bootstrap');
        process.exit(1);
      } else {
        logger.error(err, 'Server');
      }
    });

    setForceRelinkHandler(async () => {
      logger.info('Force-Relink: Auth-Session wird zurückgesetzt...', 'Relink');
      stopWatchdog();
      cleanupSocket(botSock);
      botSock = null;
      state.sock = null;
      state.currentQr = null;
      state.qrUpdatedAt = 0;
      state.pairingCode = null;
      
      const auth = await useTursoAuthState('main');
      await auth.clearSession();
      
      state.reconnectAttempts = 0;
      setTimeout(() => startWhatsApp(), 1500);
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
