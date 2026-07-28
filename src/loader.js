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
        
        // Kompatibilitätsschicht für bestehende Modul-Sammlungen
        if (mod.economyCommands) cmds = cmds.concat(mod.economyCommands);
        if (mod.scheduleCommands) cmds = cmds.concat(mod.scheduleCommands);
        if (mod.questCommands) cmds = cmds.concat(mod.questCommands);
        if (mod.itemCommands) cmds = cmds.concat(mod.itemCommands);
        if (mod.progressionCommands) cmds = cmds.concat(mod.progressionCommands);
        if (mod.millionaireCommands) cmds = cmds.concat(mod.millionaireCommands);
        if (mod.eventCommands) cmds = cmds.concat(mod.eventCommands);
        if (mod.managementCommands) cmds = cmds.concat(mod.managementCommands);
        
        // Zukünftige Standardstruktur: Einzel-Command oder Array im default-Export
        if (mod.default) {
          if (Array.isArray(mod.default)) {
            cmds = cmds.concat(mod.default);
          } else {
            cmds.push(mod.default);
          }
        }

        for (const c of cmds) {
          if (c && c.name) {
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
