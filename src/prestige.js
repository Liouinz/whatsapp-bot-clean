// Prestige-Engine: gegen einen großen Coin-Betrag steigt der permanente
// Prestige-Rang. Wirkt als starke Coin-Senke (gegen Inflation) und gibt einen
// dauerhaften kleinen Coin-Bonus (+5% je Rang).
//
// Eigenes Modul ohne Import auf economy.js (bucht Coins selbst per atomarem
// UPDATE), damit economy.js prestige nutzen kann, ohne Zyklus.

import { dbRun, dbRows } from './db.js';

export const PRESTIGE_BASE_COST = 5_000_000; // Kosten für Rang 1; steigt je Rang
export const PRESTIGE_BONUS_PER_RANK = 0.05; // +5% Coins je Rang (dauerhaft)

const cache = new Map(); // user → { at, level }
const CACHE_MS = 5 * 60_000;

async function loadLevel(user) {
  const r = await dbRows('SELECT level FROM prestige WHERE user_jid = ?', [user]);
  const level = r.length ? Number(r[0].level) : 0;
  cache.set(user, { at: Date.now(), level });
  if (cache.size > 5000) cache.delete(cache.keys().next().value);
  return level;
}

export async function getPrestigeLevel(user) {
  const c = cache.get(user);
  if (c && Date.now() - c.at < CACHE_MS) return c.level;
  return loadLevel(user);
}

/** Dauerhafter Coin-Multiplikator aus dem Prestige-Rang. */
export async function getPrestigeMult(user) {
  return 1 + (await getPrestigeLevel(user)) * PRESTIGE_BONUS_PER_RANK;
}

/** Kosten für den nächsten Rang (steigt linear mit dem aktuellen Rang). */
export function nextCost(level) {
  return PRESTIGE_BASE_COST * (level + 1);
}

/**
 * Prestige durchführen: Kosten atomar abbuchen, Rang +1.
 * Rückgabe: { ok, level, cost, need } — bei ok=false gibt need die Kosten an.
 */
export async function doPrestige(user) {
  const level = await getPrestigeLevel(user);
  const cost = nextCost(level);
  const res = await dbRun('UPDATE coins SET balance = balance - ? WHERE user_jid = ? AND balance >= ?', [cost, user, cost]);
  if (Number(res.rowsAffected) <= 0) return { ok: false, level, cost, need: cost };
  await dbRun(
    `INSERT INTO prestige (user_jid, level, updated_at) VALUES (?, 1, ?)
     ON CONFLICT(user_jid) DO UPDATE SET level = prestige.level + 1, updated_at = excluded.updated_at`,
    [user, Date.now()]
  );
  cache.delete(user);
  return { ok: true, level: level + 1, cost };
}

export function resetPrestigeCache() { cache.clear(); }
