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
        
        let cmds = [];
        
        const commandArrays = Object.values(mod).filter(
          (v) => Array.isArray(v) && v.length > 0 && v[0]?.name
        );

        for (const arr of commandArrays) {
          cmds = cmds.concat(arr);
        }
        
        if (mod.default) {
          if (Array.isArray(mod.default)) {
            if (!commandArrays.includes(mod.default)) {
              cmds = cmds.concat(mod.default);
            }
          } else if (mod.default.name) {
            cmds.push(mod.default);
          }
        }

        for (const c of cmds) {
          if (c && c.name) {
            // Standardisierte Metadaten für die automatische Registry / Hilfe
            c.category = c.category || c.group || path.basename(dir);
            c.desc = c.desc || c.description || 'Keine Beschreibung';
            c.usage = c.usage || `!${c.name}`;

            if (commands.has(c.name)) {
              logger.warn(`Doppelter Command-Name erkannt: ${c.name}`, 'Loader');
            }
            commands.set(c.name, c);
            if (c.aliases) {
              for (const a of c.aliases) {
                commands.set(a, c);
              }
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
