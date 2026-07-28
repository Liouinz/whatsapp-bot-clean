import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { config } from './config.js';
import { logger } from './logger.js';
import { loadCommands } from './loader.js';
import { createDashboard } from './dashboard.js';
import { initDb, getDb } from './db.js';
import { useTursoAuthState } from './auth.js';
import { handleUpsert } from './router.js';

let watchdogTimer = null;
let botSock = null;

function startWatchdog(sock) {
  if (watchdogTimer) clearInterval(watchdogTimer);
  watchdogTimer = setInterval(() => {
    if (sock?.ws && !sock.ws.isOpen) {
      logger.warn('WebSocket scheint tot zu sein (ws.isOpen ist false).', 'Watchdog');
    }
  }, config.keepAlive.wsKeepAliveMs);
}

process.on('uncaughtException', (err) => {
  logger.error(err, 'uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  logger.error(reason, 'unhandledRejection');
});

async function startWhatsApp() {
  logger.info('Starte Baileys WhatsApp Socket...', 'Baileys');
  const { state, saveCreds } = await useTursoAuthState('main');
  const { version, isLatest } = await fetchLatestBaileysVersion();
  logger.info(`Baileys Version v${version.join('.')}, isLatest: ${isLatest}`, 'Baileys');

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true,
    logger: {
      trace: () => {},
      debug: () => {},
      info: () => {},
      warn: (m) => logger.warn(m, 'Baileys'),
      error: (m) => logger.error(m, 'Baileys'),
      child: () => logger
    }
  });

  botSock = sock;

  sock.ev.process(async (events) => {
    if (events['connection.update']) {
      const update = events['connection.update'];
      const { connection, lastDisconnect } = update;
      if (connection === 'close') {
        const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
        logger.warn(`Verbindung geschlossen wegen ${lastDisconnect?.error}, Code: ${statusCode}`, 'Baileys');
        if (statusCode !== DisconnectReason.loggedOut) {
          setTimeout(() => startWhatsApp(), 5000);
        } else {
          logger.error('Bot wurde ausgeloggt. Auth-Daten müssen neu gepaart werden.', 'Baileys');
        }
      } else if (connection === 'open') {
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

    const commands = await loadCommands();
    logger.success(`${commands.size} Befehle erfolgreich geladen.`, 'Bootstrap');

    const app = createDashboard();
    const port = process.env.PORT || 3000;
    app.listen(port, () => {
      logger.success(`Control Center Dashboard läuft auf Port ${port}`, 'Bootstrap');
    });

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
