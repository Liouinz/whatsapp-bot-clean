// Boost-Engine: aktive Zeit-Effekte (+XP%, +Coins%) pro Nutzer.
// Eigenes Modul, damit economy.js und items.js es nutzen können, ohne einen
// Import-Zyklus zu bauen. Liest/schreibt nur die DB-Tabelle user_boosts.
//
// Performance: getBoostMult() liegt im heißen Pfad (XP pro Nachricht). Deshalb
// ein kurzer RAM-Cache pro Nutzer (60 s) — höchstens ein DB-Read je Nutzer und
// Minute, statt einer Abfrage pro Nachricht.

import { dbRun, dbRows } from './db.js';

const cache = new Map(); // user → { at, map: { type: mult } }
const CACHE_MS = 60_000;

function invalidate(user) {
  cache.delete(user);
}

async function loadBoosts(user) {
  const now = Date.now();
  const rows = await dbRows(
    'SELECT type, mult, expires_at FROM user_boosts WHERE user_jid = ? AND expires_at > ?',
    [user, now]
  );
  const map = {};
  for (const r of rows) map[r.type] = Math.max(map[r.type] || 1, Number(r.mult));
  cache.set(user, { at: now, map });
  if (cache.size > 3000) cache.delete(cache.keys().next().value);
  return map;
}

/** Multiplikator (>= 1) eines Boost-Typs für einen Nutzer. */
export async function getBoostMult(user, type) {
  const c = cache.get(user);
  const map = c && Date.now() - c.at < CACHE_MS ? c.map : await loadBoosts(user);
  return map[type] || 1;
}

/** Boost aktivieren (überschreibt denselben Typ, setzt neue Laufzeit). */
export async function activateBoost(user, type, pct, hours) {
  const mult = 1 + pct / 100;
  const expires = Date.now() + hours * 3_600_000;
  await dbRun(
    `INSERT INTO user_boosts (user_jid, type, mult, expires_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_jid, type) DO UPDATE SET mult = excluded.mult, expires_at = excluded.expires_at`,
    [user, type, mult, expires]
  );
  invalidate(user);
  return { mult, expires };
}

/** Aktive Boosts eines Nutzers (für !boosts). */
export async function getActiveBoosts(user) {
  const now = Date.now();
  return dbRows(
    'SELECT type, mult, expires_at FROM user_boosts WHERE user_jid = ? AND expires_at > ? ORDER BY expires_at',
    [user, now]
  );
}

/** RAM-Cache leeren (nach DB-Wipe). */
export function resetBoostCache() {
  cache.clear();
}
