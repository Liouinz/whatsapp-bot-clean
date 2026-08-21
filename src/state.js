// Gemeinsamer Laufzeit-Zustand — wird von Socket-Lifecycle, Router und Panel gelesen.

// Derselbe Tagesbegriff wie in der DB-Schicht. Vorher rechnete rolloverDay()
// in UTC und die gespeicherten Tagesschluessel ebenfalls — beide falsch, aber
// wenigstens gleich falsch. Jetzt gibt es genau eine Quelle.
import { todayKey } from './db.js';

export const state = {
  sock: null,
  connection: 'connecting',
  stopped: false,
  stopReason: '',
  currentQr: null,
  qrUpdatedAt: 0,

  pairingCode: null,
  pairingCodeUpdatedAt: 0,

  botJidPn: null,
  botJidLid: null,

  startedAt: Date.now(),
  lastConnectedAt: null,
  reconnectAttempts: 0,

  sentToday: 0,
  commandsToday: 0,
  aiCallsToday: 0,
  statsDay: todayKey(),

  activity: new Array(24).fill(0),
  activitySlot: Math.floor(Date.now() / 600_000),
};

export function rolloverDay() {
  const today = todayKey();
  if (state.statsDay !== today) {
    state.statsDay = today;
    state.sentToday = 0;
    state.commandsToday = 0;
    state.aiCallsToday = 0;
  }
}

export function bumpActivity() {
  const slot = Math.floor(Date.now() / 600_000);
  if (slot !== state.activitySlot) {
    const shift = Math.min(slot - state.activitySlot, state.activity.length);
    for (let i = 0; i < shift; i++) {
      state.activity.shift();
      state.activity.push(0);
    }
    state.activitySlot = slot;
  }
  state.activity[state.activity.length - 1]++;
}

let pairingCodeRequester = null;
export function setPairingCodeRequester(fn) {
  pairingCodeRequester = fn;
}
export async function requestPairingCode(phoneNumber) {
  if (!pairingCodeRequester) throw new Error('Der Bot ist noch nicht bereit oder bereits verbunden — bitte kurz warten.');
  return pairingCodeRequester(phoneNumber);
}

// Gleiches Muster wie forceRelink: index.js besitzt den Lebenszyklus und
// hinterlegt den Handler, alle anderen fragen ihn hier ab. Ein direkter Import
// von index.js waere ein Zyklus (index.js importiert dashboard.js).
let shutdownHandler = null;
export function setShutdownHandler(fn) {
  shutdownHandler = fn;
}
export async function requestShutdown(reason) {
  if (!shutdownHandler) throw new Error('Der Bot ist noch nicht bereit — bitte kurz warten.');
  return shutdownHandler(reason);
}

let forceRelinkHandler = null;
export function setForceRelinkHandler(fn) {
  forceRelinkHandler = fn;
}
export async function forceRelink() {
  if (!forceRelinkHandler) throw new Error('Der Bot ist noch nicht bereit — bitte kurz warten.');
  return forceRelinkHandler();
}
