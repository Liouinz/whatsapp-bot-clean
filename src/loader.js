import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { logger } from './logger.js';

// Der eine gueltige Command-Vertrag: ein Objekt mit `name` und `run()`.
//
// Die run-Pflicht ist bewusst streng. Hilfsmodule wie commands/games/index.js
// koennen Funktionen und Maps exportieren — und Funktionen
// besitzen ebenfalls ein `.name`-Property. Ohne die run-Pruefung wuerden sie
// als Commands registriert. `run` ist der reale Dispatch-Vertrag: router.js
// ruft ausschliesslich `command.run(ctx)` auf.
function isCommand(value) {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof value.name === 'string' &&
    value.name.length > 0 &&
    typeof value.run === 'function'
  );
}

// Akzeptiert alle drei im Projekt vorkommenden Export-Formen:
//   export const xCommands = [ {...}, {...} ]   (Sammeldatei)
//   export default { name, run }                (Einzeldatei)
//   export const xCommand = { name, run }       (Einzeldatei, bare named)
// Doppelte Nennung desselben Objekts (z. B. in Array *und* einzeln) zaehlt einmal.
function collectCommands(mod) {
  const found = [];
  const seen = new Set();

  const take = (value) => {
    if (isCommand(value) && !seen.has(value)) {
      seen.add(value);
      found.push(value);
    }
  };

  for (const value of Object.values(mod)) {
    if (Array.isArray(value)) value.forEach(take);
    else take(value);
  }
  return found;
}

// Namen und Aliase teilen sich einen Schluesselraum. Kollisionen entschied
// bisher stillschweigend die readdirSync-Reihenfolge — also Dateisystem-Zufall.
// Jetzt werden sie einheitlich und laut gemeldet.
function register(commands, key, cmd, kind, file) {
  const existing = commands.get(key);
  if (existing && existing !== cmd) {
    logger.warn(
      `Command-Kollision: ${kind} "${key}" aus ${file} ueberschreibt "${existing.name}". ` +
        'Die Ladereihenfolge entscheidet — bitte eindeutig benennen.',
      'Loader'
    );
  }
  commands.set(key, cmd);
}

export async function loadCommands(dir = path.join(process.cwd(), 'src', 'commands')) {
  const commands = new Map();
  if (!fs.existsSync(dir)) return commands;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      const subCommands = await loadCommands(fullPath);
      for (const [key, cmd] of subCommands) {
        register(commands, key, cmd, 'Schluessel', `${entry.name}/`);
      }
      continue;
    }

    if (!entry.isFile() || !(entry.name.endsWith('.js') || entry.name.endsWith('.mjs'))) continue;

    try {
      const mod = await import(pathToFileURL(fullPath).href);

      for (const c of collectCommands(mod)) {
        c.category = c.category || c.group || path.basename(dir);
        // `group` steuert die Kill-Switches in router.js und die Gruppierung im
        // !hilfe-Menue. Fehlte es, lief der Befehl ungated und unsichtbar.
        c.group = c.group || c.category;
        c.desc = c.desc || c.description || 'Keine Beschreibung';
        c.usage = c.usage || `!${c.name}`;

        register(commands, c.name, c, 'Name', entry.name);
        for (const alias of c.aliases || []) {
          register(commands, alias, c, 'Alias', entry.name);
        }
      }
    } catch (err) {
      logger.error(err, `loader:${entry.name}`);
    }
  }

  return commands;
}
