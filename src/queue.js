// Serielle Sende-Queue mit Jitter (800–2500 ms) — ALLE ausgehenden Nachrichten
// laufen hier durch. Schützt vor Spam-Erkennung und Rate-Limits.

import { config } from './config.js';
import { state, rolloverDay } from './state.js';
import { logError } from './logger.js';

const queue = [];
const MAX_QUEUE_SIZE = 1000;
let running = false;

const sentIds = new Set();
export function wasSentByBot(id) {
  return id ? sentIds.has(id) : false;
}
function recordSent(id) {
  if (!id) return;
  sentIds.add(id);
  if (sentIds.size > 2000) sentIds.delete(sentIds.values().next().value);
}

const WAIT_FOR_CONNECTION_MS = 45_000;

const jitter = () =>
  config.send.jitterMinMs +
  Math.floor(Math.random() * (config.send.jitterMaxMs - config.send.jitterMinMs));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForConnection() {
  const deadline = Date.now() + WAIT_FOR_CONNECTION_MS;
  while (Date.now() < deadline) {
    if (state.sock && state.connection === 'open') return true;
    if (state.stopped) return false;
    await sleep(1500);
  }
  return false;
}

let lastSentAt = 0;

async function work() {
  if (running) return;
  running = true;
  try {
    while (queue.length) {
      const job = queue.shift();
      const wait = lastSentAt + jitter() - Date.now();
      if (wait > 0) await sleep(wait);
      let sent = false;
      for (let attempt = 0; attempt <= config.send.maxRetries && !sent; attempt++) {
        try {
          if (!(await waitForConnection())) {
            throw new Error('Socket nicht verbunden (Timeout beim Warten auf Reconnect)');
          }
          const result = await state.sock.sendMessage(job.jid, job.content, job.options);
          rolloverDay();
          state.sentToday++;
          lastSentAt = Date.now();
          recordSent(result?.key?.id);
          job.resolve?.(result);
          sent = true;
        } catch (err) {
          if (attempt < config.send.maxRetries) {
            await sleep(config.send.retryBackoffMs * (attempt + 1));
          } else {
            logError(err, 'sendQueue');
            job.resolve?.(null);
          }
        }
      }
    }
  } finally {
    running = false;
  }
}

export function enqueue(jid, content, options = {}) {
  return new Promise((resolve, reject) => {
    if (state.stopped) {
      reject(new Error('Bot gestoppt'));
      return;
    }
    if (state.connection !== 'open') {
      reject(new Error('Bot ist nicht mit WhatsApp verbunden'));
      return;
    }
    if (queue.length >= MAX_QUEUE_SIZE) {
      reject(new Error('Sende-Queue voll'));
      return;
    }
    queue.push({ jid, content, options, resolve });
    work().catch((err) => logError(err, 'sendQueue.work'));
  });
}

export function sendText(jid, text, mentions = undefined) {
  const content = mentions?.length ? { text, mentions } : { text };
  return enqueue(jid, content);
}

export function replyTo(msg, text, mentions = undefined) {
  const content = mentions?.length ? { text, mentions } : { text };
  return enqueue(msg.key.remoteJid, content, { quoted: msg });
}

export function queueLength() {
  return queue.length;
}
