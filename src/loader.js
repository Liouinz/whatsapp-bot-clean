import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { logger } from './logger.js';

export async function loadCommands(dir = path.join(process.cwd(), 'src', 'commands')) {
  const commands = new Map();
  if (!fs.existsSync(dir)) return commands;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const subCommands = await loadCommands(fullPath);
      for (const [k, v] of subCommands) {
        commands.set(k, v);
      }
    } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.mjs'))) {
      try {
        const fileUrl = pathToFileURL(fullPath).href;
        const mod = await import(fileUrl);
        const cmds =
          mod.economyCommands ||
          mod.scheduleCommands ||
          mod.questCommands ||
          mod.itemCommands ||
          mod.progressionCommands ||
          mod.millionaireCommands ||
          mod.eventCommands ||
          mod.managementCommands ||
          (Array.isArray(mod.default) ? mod.default : [mod.default]).filter(Boolean);

        for (const c of cmds) {
          if (c && c.name) {
            commands.set(c.name, c);
            if (c.aliases) {
              for (const a of c.aliases) commands.set(a, c);
            }
          }
        }
      } catch (err) {
        logger.error(err, `loader:${entry.name}`);
      }
    }
  }
  return commands;
}
