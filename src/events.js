// Event-Engine: höchstens EIN aktives globales Event. Der Multiplikator liegt
// als einzelner Wert im RAM (currentEvent) — Lesen im heißen Pfad (XP/Coins)
// kostet KEINEN DB-Zugriff. Persistiert in active_event (Einzelzeile) für
// Restart-Festigkeit; auto-Wochenend-Event über den Scheduler.

import { dbRun, dbRows } from './db.js';
import { sendText } from './queue.js';
import { logInfo, logError } from './logger.js';
import { getEvent } from './data/events.js';

let currentEvent = null;
let lastAutoKey = '';

function active() {
  if (currentEvent && currentEvent.expiresAt <= Date.now()) currentEvent = null;
  return currentEvent;
}

export function getEventXpMult() { return active()?.xpMult ?? 1; }
export function getEventCoinMult() { return active()?.coinMult ?? 1; }
export function getActiveEvent() { return active(); }

export async function setEvent(def, hours) {
  const expiresAt = Date.now() + Math.round(hours * 3_600_000);
  currentEvent = { id: def.id, name: def.name, emoji: def.emoji, xpMult: def.xpMult, coinMult: def.coinMult, expiresAt };
  await dbRun(
    `INSERT INTO active_event (id, event_id, name, xp_mult, coin_mult, started_at, expires_at)
     VALUES (1, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET event_id=excluded.event_id, name=excluded.name,
       xp_mult=excluded.xp_mult, coin_mult=excluded.coin_mult, started_at=excluded.started_at, expires_at=excluded.expires_at`,
    [def.id, def.name, def.xpMult, def.coinMult, Date.now(), expiresAt]
  ).catch(() => {});
  return currentEvent;
}

export async function stopEvent() {
  currentEvent = null;
  await dbRun('DELETE FROM active_event WHERE id = 1', []).catch(() => {});
}

export async function loadActiveEvent() {
  const rows = await dbRows('SELECT * FROM active_event WHERE id = 1', []);
  if (rows.length && Number(rows[0].expires_at) > Date.now()) {
    const def = getEvent(rows[0].event_id) || {};
    currentEvent = {
      id: rows[0].event_id, name: rows[0].name, emoji: def.emoji || '🎉',
      xpMult: Number(rows[0].xp_mult), coinMult: Number(rows[0].coin_mult),
      expiresAt: Number(rows[0].expires_at),
    };
  } else {
    currentEvent = null;
  }
}

export function resetEventCache() { currentEvent = null; lastAutoKey = ''; }

export async function announceToGroups(text) {
  try {
    const rows = await dbRows('SELECT jid FROM group_settings WHERE enabled = 1', []);
    for (const r of rows) await sendText(r.jid, text);
  } catch (err) {
    logError(err, 'events.announce');
  }
}

function fmtRemaining(expiresAt) {
  const mins = Math.max(1, Math.round((expiresAt - Date.now()) / 60_000));
  return mins >= 60 ? `${Math.floor(mins / 60)} Std ${mins % 60} Min` : `${mins} Min`;
}

export function eventBanner(ev) {
  return `${ev.emoji} *EVENT: ${ev.name}!*\n` +
    `${ev.xpMult > 1 ? `⭐ ×${ev.xpMult} XP  ` : ''}${ev.coinMult > 1 ? `🪙 ×${ev.coinMult} Coins` : ''}`.trim() +
    `\n⏳ Noch ${fmtRemaining(ev.expiresAt)} aktiv!`;
}

let lastAutoCheck = 0;
export async function maybeAutoEvent() {
  if (Date.now() - lastAutoCheck < 5 * 60_000) return;
  lastAutoCheck = Date.now();
  if (active()) return;

  const now = new Date();
  const day = now.getDay();
  if (day !== 6 && day !== 0) return;

  const sat = new Date(now);
  sat.setDate(now.getDate() - (day === 0 ? 1 : 0));
  const key = sat.toISOString().slice(0, 10);
  if (lastAutoKey === key) return;
  lastAutoKey = key;

  const endSunday = new Date(now);
  endSunday.setDate(now.getDate() + (day === 6 ? 1 : 0));
  endSunday.setHours(23, 59, 0, 0);
  const hours = Math.max(1, (endSunday.getTime() - now.getTime()) / 3_600_000);

  const def = getEvent('double_xp');
  await setEvent(def, hours);
  logInfo('⭐ Auto-Event: Double-XP-Wochenende gestartet.');
  await announceToGroups(`${eventBanner(getActiveEvent())}\n\nSchönes Wochenende — jetzt lohnt sich jede Nachricht doppelt! 🎉`);
}
