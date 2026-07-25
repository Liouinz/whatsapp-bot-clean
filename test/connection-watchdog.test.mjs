// Absichert den Vertrag, auf dem der Verbindungs-Watchdog (index.js) beruht:
// Der Bot erkennt eine "Zombie"-Verbindung ('open', aber real tot) über
// sock.ws.isOpen. Bricht ein künftiges Baileys-Update diesen Getter, muss das
// hier LAUT scheitern — sonst würde der Zombie-Schutz still wirkungslos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const indexSrc = readFileSync(join(here, '..', 'src', 'index.js'), 'utf8');

test('Baileys-WebSocketClient bietet weiterhin die Liveness-Getter', async () => {
  const mod = await import('@whiskeysockets/baileys/lib/Socket/Client/websocket.js');
  const proto = mod.WebSocketClient?.prototype;
  assert.ok(proto, 'WebSocketClient existiert');
  assert.equal(typeof Object.getOwnPropertyDescriptor(proto, 'isOpen')?.get, 'function', 'isOpen-Getter vorhanden');
  assert.equal(typeof Object.getOwnPropertyDescriptor(proto, 'isClosed')?.get, 'function', 'isClosed-Getter vorhanden');
});

test('index.js verdrahtet den Watchdog vollständig', () => {
  // Watchdog wird gestartet und beim Shutdown wieder gestoppt.
  assert.match(indexSrc, /startWatchdog\(\)/, 'Watchdog wird in main() gestartet');
  assert.match(indexSrc, /clearInterval\(watchdogTimer\)/, 'Watchdog wird beim Shutdown gestoppt');
  // Zombie-Erkennung stützt sich auf den ws.isOpen-Getter.
  assert.match(indexSrc, /ws\.isOpen/, 'Zombie-Check nutzt ws.isOpen');
  // Expliziter WebSocket-Keep-Alive ist gesetzt (tote Leitung → close → Reconnect).
  assert.match(indexSrc, /keepAliveIntervalMs:\s*config\.keepAlive\.wsKeepAliveMs/, 'Keep-Alive verdrahtet');
});

test('index.js crasht nie am Prozess (globale Sicherheitsnetze bleiben)', () => {
  assert.match(indexSrc, /process\.on\('uncaughtException'/, 'uncaughtException-Handler vorhanden');
  assert.match(indexSrc, /process\.on\('unhandledRejection'/, 'unhandledRejection-Handler vorhanden');
});
