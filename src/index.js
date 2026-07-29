import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, jidNormalizedUser } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { config } from './config.js';
import { logger } from './logger.js';
import { loadCommands } from './loader.js';
import { createDashboard } from './dashboard.js';
import { initDb, getDb, startFlushLoop, stopFlushLoop, flushBuffers } from './db.js';
import { useTursoAuthState } from './auth.js';
import { handleUpsert, loadToggles, setRegistry } from './router.js';
import { loadMutes, handleJoin } from './moderation.js';
import { initAiUsage } from './ai.js';
import { state } from './state.js';

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

process.on('uncaughtException', (err) => {
  logger.error(err, 'uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  logger.error(reason, 'unhandledRejection');
});

process.on('SIGTERM', async () => {
  stopWatchdog();
  stopFlushLoop();
  await flushBuffers().catch(() => {});
  await new Promise(r => setTimeout(r, 500));
  process.exit(0);
});

process.on('SIGINT', async () => {
  stopWatchdog();
  stopFlushLoop();
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
    printQRInTerminal: true,
  });

  botSock = sock;
  state.sock = sock;

  sock.ev.process(async (events) => {
    if (events['connection.update']) {
      const update = events['connection.update'];
      const { connection, lastDisconnect, qr } = update;
      
      if (qr) {
        state.currentQr = qr;
        state.qrUpdatedAt = Date.now();
      }

      state.connection = connection || state.connection;

      if (connection === 'close') {
        state.lastConnectedAt = null;
        const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
        logger.warn(`Verbindung geschlossen wegen ${lastDisconnect?.error}, Code: ${statusCode}`, 'Baileys');
        if (statusCode !== DisconnectReason.loggedOut) {
          state.reconnectAttempts = (state.reconnectAttempts || 0) + 1;
          if (state.reconnectAttempts < (config.reconnect?.maxAttempts || 10)) {
            setTimeout(() => startWhatsApp(), 5000);
          } else {
            logger.error('Maximale Reconnect-Versuche erreicht. Bot wird nicht neu verbunden.', 'Baileys');
          }
        } else {
          logger.error('Bot wurde ausgeloggt. Auth-Daten müssen neu gepaart werden.', 'Baileys');
        }
      } else if (connection === 'open') {
        state.lastConnectedAt = Date.now();
        state.reconnectAttempts = 0;
        if (sock.user?.id) {
          state.botJidPn = jidNormalizedUser(sock.user.id);
          state.botJidLid = sock.user.lid ? jidNormalizedUser(sock.user.lid) : null;
        }
        logger.success('WhatsApp Verbindung erfolgreich aufgebaut!', 'Baileys');
      }
    }

    if (events['creds.update']) {
      await saveCreds();
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
    logger.info('Initialisiere Datenbank-Tabellen...', 'Bootstrap');
    await initDb();
    logger.success('Datenbank erfolgreich initialisiert.', 'Bootstrap');

    logger.info('Lade Status (Mutes, Toggles, AI-Quota)...', 'Bootstrap');
    await Promise.all([
      loadMutes(),
      loadToggles(),
      initAiUsage(),
    ]);
    logger.success('Runtime-Zustände erfolgreich geladen.', 'Bootstrap');

    const commands = await loadCommands();
    const uniqueCommands = Array.from(commands.values()).filter((v, i, a) => a.findIndex(c => c.name === v.name) === i);
    setRegistry(uniqueCommands);
    logger.success(`${commands.size} Befehle erfolgreich geladen.`, 'Bootstrap');

    const app = createDashboard();
    const port = process.env.PORT || 3000;
    app.listen(port, () => {
      logger.success(`Control Center Dashboard läuft auf Port ${port}`, 'Bootstrap');
    });

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
