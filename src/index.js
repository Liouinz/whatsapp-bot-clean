import { config } from './config.js';
import { logger } from './logger.js';
import { loadCommands } from './loader.js';
import { createDashboard } from './dashboard.js';

let watchdogTimer = null;

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

async function main() {
  logger.info(`Starte ${config.botName}...`, 'Bootstrap');
  
  try {
    const commands = await loadCommands();
    logger.success(`${commands.size} Befehle erfolgreich geladen.`, 'Bootstrap');

    const app = createDashboard();
    const port = process.env.PORT || 3000;
    app.listen(port, () => {
      logger.success(`Control Center Dashboard läuft auf Port ${port}`, 'Bootstrap');
    });

    const mockSock = {
      ws: { isOpen: true },
      keepAliveIntervalMs: config.keepAlive.wsKeepAliveMs
    };
    startWatchdog(mockSock);
  } catch (err) {
    logger.error(err, 'Bootstrap');
    process.exit(1);
  }
}

if (process.argv[1] === import.meta.url || process.argv[1]?.endsWith('index.js')) {
  main();
}

export { main };
