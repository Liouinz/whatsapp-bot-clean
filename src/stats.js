// Gemeinsame Nutzer-Statistiken, aus bereits vorhandenen kumulativen Zählern
// abgeleitet (kein zusätzlicher Schreibaufwand). Von Achievements & Ranglisten
// genutzt.

import { dbRows } from './db.js';

/** Einen kumulativen Wert eines Nutzers holen. */
export async function getUserStat(user, type) {
  if (type === 'messages') {
    const r = await dbRows('SELECT COALESCE(SUM(messages),0) AS v FROM xp WHERE user_jid = ?', [user]);
    return Number(r[0]?.v || 0);
  }
  if (type === 'coins_earned') {
    const r = await dbRows('SELECT total_earned AS v FROM coins WHERE user_jid = ?', [user]);
    return r.length ? Number(r[0].v) : 0;
  }
  if (type === 'balance') {
    const r = await dbRows('SELECT balance AS v FROM coins WHERE user_jid = ?', [user]);
    return r.length ? Number(r[0].v) : 0;
  }
  if (type === 'daily_streak') {
    const r = await dbRows('SELECT streak AS v FROM coins WHERE user_jid = ?', [user]);
    return r.length ? Number(r[0].v) : 0;
  }
  if (type === 'games_won') {
    const r = await dbRows('SELECT COALESCE(SUM(wins),0) AS v FROM game_scores WHERE user_jid = ?', [user]);
    return Number(r[0]?.v || 0);
  }
  if (type === 'items_distinct') {
    const r = await dbRows('SELECT COUNT(*) AS v FROM inventory WHERE user_jid = ? AND qty > 0', [user]);
    return Number(r[0]?.v || 0);
  }
  if (type === 'achievements') {
    const r = await dbRows('SELECT COUNT(*) AS v FROM user_achievements WHERE user_jid = ?', [user]);
    return Number(r[0]?.v || 0);
  }
  return 0;
}

/** Mehrere Werte auf einmal (fetcht jeden Typ nur einmal). */
export async function getUserStats(user, types) {
  const uniq = [...new Set(types)];
  const out = {};
  await Promise.all(uniq.map(async (t) => { out[t] = await getUserStat(user, t); }));
  return out;
}
