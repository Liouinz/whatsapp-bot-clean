import { config } from './config.js';
import { logger } from './logger.js';
import { loadCommands } from './loader.js';

async function main() {
  logger.info(`Starte ${config.botName}...`, 'Bootstrap');
  
  try {
    const commands = await loadCommands();
    logger.success(`${commands.size} Befehle erfolgreich geladen.`, 'Bootstrap');
  } catch (err) {
    logger.error(err, 'Bootstrap');
    process.exit(1);
  }
}

if (process.argv[1] === import.meta.url || process.argv[1]?.endsWith('index.js')) {
  main();
}

export { main };
