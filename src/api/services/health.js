// Health- und Systemdaten.
//
// Grundsatz: nur melden, was tatsaechlich gemessen wurde. Lieber ein Feld
// weglassen oder `null` liefern, als eine Zahl zu erfinden, auf die sich
// dann jemand verlaesst.

import os from 'node:os';
import { state } from '../../state.js';
import { dbRowsStrict } from '../../db.js';
import { isAiEnabled, getAiQuota } from '../../ai.js';
import { queueLength } from '../../queue.js';
import { BOT_VERSION } from '../version.js';

const DB_TIMEOUT_MS = 2000;

/**
 * Prozess-CPU seit dem letzten Aufruf.
 *
 * Bewusst kein os.loadavg(): das ist im Container die Last des HOSTS und sagt
 * ueber diesen Prozess nichts aus. Bei einem zu kurzen Abstand zwischen zwei
 * Abfragen kommt `null` zurueck statt einer Zahl, die nur Rauschen waere.
 */
let lastCpu = process.cpuUsage();
let lastCpuAt = Date.now();
function cpuPercent() {
  const now = Date.now();
  const elapsedMs = now - lastCpuAt;
  if (elapsedMs < 1000) return null;
  const usage = process.cpuUsage(lastCpu);
  lastCpu = process.cpuUsage();
  lastCpuAt = now;
  const busyMs = (usage.user + usage.system) / 1000;
  return Math.round((busyMs / elapsedMs) * 100 * 10) / 10;
}

async function checkDatabase() {
  const startedAt = Date.now();
  try {
    await Promise.race([
      dbRowsStrict('SELECT 1', []),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), DB_TIMEOUT_MS)),
    ]);
    return { status: 'up', latencyMs: Date.now() - startedAt };
  } catch {
    // Der Grund bleibt drinnen: eine Datenbank-Fehlermeldung nennt Hostnamen
    // und manchmal Teile der Verbindungszeichenkette.
    return { status: 'down', latencyMs: Date.now() - startedAt };
  }
}

function checkWhatsApp() {
  if (state.stopped) return { status: 'stopped', reason: state.stopReason || null };
  if (state.connection === 'open') return { status: 'up' };
  return { status: 'connecting', connection: state.connection || null };
}

/**
 * Vollstaendige Health-Antwort.
 *
 * `ready` heisst: der Bot kann seine eigentliche Arbeit tun — Datenbank
 * erreichbar UND WhatsApp verbunden. Die KI zaehlt bewusst nicht hinein, sie
 * ist optional; ein fehlender Schluessel darf den Dienst nicht rot faerben.
 */
export async function healthReport() {
  const database = await checkDatabase();
  const whatsapp = checkWhatsApp();
  const ai = isAiEnabled()
    ? { status: 'up', ...getAiQuota() }
    : { status: 'disabled' };

  const ready = database.status === 'up' && whatsapp.status === 'up';
  return {
    status: ready ? 'ready' : 'degraded',
    live: true,
    ready,
    version: BOT_VERSION,
    uptimeSeconds: Math.floor(process.uptime()),
    checks: {
      process: { status: 'up' },
      database,
      whatsapp,
      ai,
      queue: { status: 'up', pending: queueLength() },
    },
  };
}

/** Ressourcenbild des Prozesses. Alles hier ist gemessen, nichts geschaetzt. */
export function systemReport() {
  const mem = process.memoryUsage();
  return {
    version: BOT_VERSION,
    node: process.version,
    platform: `${process.platform}/${process.arch}`,
    uptimeSeconds: Math.floor(process.uptime()),
    startedAt: state.startedAt,
    memory: {
      rssBytes: mem.rss,
      heapUsedBytes: mem.heapUsed,
      heapTotalBytes: mem.heapTotal,
    },
    // null, wenn seit der letzten Messung zu wenig Zeit vergangen ist.
    cpuPercent: cpuPercent(),
    totalMemoryBytes: os.totalmem(),
  };
}
