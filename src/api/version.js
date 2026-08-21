// Die Version kommt aus package.json — eine zweite, handgepflegte Stelle
// waere sofort veraltet. Beim Start einmal gelesen, danach aus dem Speicher.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

function read() {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    return JSON.parse(readFileSync(join(here, '..', '..', 'package.json'), 'utf8')).version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export const BOT_VERSION = read();
/** Version der API-Oberflaeche, unabhaengig von der Version des Bots. */
export const API_VERSION = 'v1';
