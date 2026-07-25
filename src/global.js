// Globale Bot-Einstellungen (bot-weit, über alle Gruppen): System-Schalter
// (XP/Spiele/Economy) und Wartungsmodus. Persistiert in global_settings,
// RAM-first — die Prüfungen liegen im heißen Pfad (jede Nachricht/Befehl) und
// dürfen keinen DB-Zugriff kosten.

import { dbRun, dbRows } from './db.js';

// Standardwerte: Systeme sind AN, Wartung ist AUS.
const DEFAULTS = {
  system_xp: true,
  system_spiele: true,
  system_economy: true,
  maintenance: false,
};

const cache = new Map(); // key → boolean

export async function loadGlobalSettings() {
  cache.clear();
  const rows = await dbRows('SELECT key, value FROM global_settings', []);
  for (const r of rows) cache.set(r.key, r.value === '1');
}

/** Booleschen Global-Schalter lesen (RAM, kein DB-Zugriff). */
export function getGlobalFlag(key) {
  if (cache.has(key)) return cache.get(key);
  return DEFAULTS[key] ?? true;
}

export async function setGlobalFlag(key, value) {
  const v = !!value;
  cache.set(key, v);
  await dbRun(
    `INSERT INTO global_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, v ? '1' : '0', Date.now()]
  ).catch(() => {});
}

export function resetGlobalCache() { cache.clear(); }

// Bequeme Kurzabfragen für den Router (heißer Pfad).
export const xpEnabled = () => getGlobalFlag('system_xp');
export const gamesEnabled = () => getGlobalFlag('system_spiele');
export const economyEnabled = () => getGlobalFlag('system_economy');
export const maintenanceOn = () => getGlobalFlag('maintenance');
