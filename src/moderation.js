// Auto-Moderation: Link-/Spam-/Wortfilter, Warn-Eskalation (Warn → Mute → Kick),
// Warn-Ablauf, Mute-Durchsetzung, Anti-Raid und Ban-Durchsetzung bei Joins.

import { config } from './config.js';
import { dbRun, dbRows } from './db.js';
import { sendText } from './queue.js';
import { logError, logInfo } from './logger.js';
import { botIsAdmin, isUserAdmin, resolveLid, normalizeId, invalidateGroupMeta } from './permissions.js';
import { state } from './state.js';
import TTLCache from './core/cache/ttlCache.js';

// Links: explizite URLs, Einladungs-/Kurzlink-Dienste UND nackte Domains mit
// Pfad ("beispiel.xyz/abc") — die alte Regex hat t.me/discord.gg/bit.ly & Co.
// komplett übersehen.
export const LINK_RE = new RegExp(
  '(https?://\\S+|www\\.\\S+' +
    '|\\b(?:chat\\.whatsapp\\.com|wa\\.me|wa\\.link|t\\.me|telegram\\.me|discord\\.gg|discord(?:app)?\\.com/invite|' +
    'bit\\.ly|tinyurl\\.com|is\\.gd|cutt\\.ly|rb\\.gy|goo\\.gl|linktr\\.ee|shorturl\\.at)/\\S+' +
    '|\\b[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*' +
    '\\.(?:com|net|org|de|at|ch|eu|io|gg|me|ly|app|xyz|info|biz|online|shop|site|club|link|live|to|tv|cc|top|vip)/\\S+)',
  'i'
);

// ── Gruppen-Einstellungen (mit kleinem Cache) ──────────────────────

const settingsCache = new Map(); // groupJid → { row, at }
const SETTINGS_CACHE_MS = 30_000;

export async function getGroupSettings(groupJid) {
  const cached = settingsCache.get(groupJid);
  if (cached && Date.now() - cached.at < SETTINGS_CACHE_MS) return cached.row;
  const rows = await dbRows('SELECT * FROM group_settings WHERE jid = ?', [groupJid]);
  let row = rows[0];
  if (!row) {
    // Neue Gruppe → EINGESCHRÄNKTER Modus (enabled=0). Der Bot bleibt still, bis
    // ein OWNER die Gruppe per Befehl (!setup/!enable/„Bot aktivieren") freischaltet.
    // Verhindert, dass der Bot unbeabsichtigt in fremden Gruppen arbeitet.
    await dbRun('INSERT OR IGNORE INTO group_settings (jid, enabled) VALUES (?, 0)', [groupJid]).catch(() => {});
    row = {
      jid: groupJid, enabled: 0, antilink: 0, antispam: 0,
      blacklist_on: 1, welcome: 0, rules: '', levelup_announce: 1,
    };
  }
  settingsCache.set(groupJid, { row, at: Date.now() });
  return row;
}

export function invalidateSettings(groupJid) {
  if (groupJid) settingsCache.delete(groupJid);
  else settingsCache.clear();
}

// ── Wort-Blacklist (RAM-Cache — lief vorher als DB-Query bei JEDER Nachricht) ──

// Erkennungs-Normalisierung: Kleinbuchstaben, Leetspeak (Sch3i55e), Umlaute/
// Akzente (SCHEIẞE, Schéiße) — damit die üblichen Umgehungs-Tricks nicht ziehen.
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's', '€': 'e' };

export function normalizeForFilter(s) {
  return String(s)
    .toLowerCase()
    .replace(/[0134578$@€]/g, (c) => LEET[c] ?? c)
    .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, ''); // kombinierende Akzente entfernen
}

const wordsCache = new Map(); // groupJid → { words: [{raw, norm, condensed}], at }
const WORDS_CACHE_MS = 5 * 60_000;

async function getBlockedWords(groupJid) {
  const cached = wordsCache.get(groupJid);
  if (cached && Date.now() - cached.at < WORDS_CACHE_MS) return cached.words;
  const rows = await dbRows('SELECT word FROM blocked_words WHERE group_jid = ?', [groupJid]);
  const words = rows.map((r) => {
    const raw = String(r.word).toLowerCase();
    const norm = normalizeForFilter(raw);
    return { raw, norm, condensed: norm.replace(/[^a-z]/g, '') };
  });
  wordsCache.set(groupJid, { words, at: Date.now() });
  return words;
}

export function invalidateBlockedWords(groupJid) {
  if (groupJid) wordsCache.delete(groupJid);
  else wordsCache.clear();
}

// ── Warnungen + Eskalation ─────────────────────────────────────────

/** Aktive (nicht abgelaufene) Warnungen eines Nutzers zählen. */
export async function activeWarnings(groupJid, userJid) {
  const rows = await dbRows(
    'SELECT id, reason, created_at FROM warnings WHERE group_jid = ? AND user_jid = ? AND expires_at > ? ORDER BY created_at',
    [groupJid, userJid, Date.now()]
  );
  return rows;
}

/**
 * Warnung aussprechen + Eskalation ausführen.
 * Rückgabe: { count, action } — action is null | 'mute' | 'kick'.
 * WICHTIG (alter Bug): Beim Limit MUSS wirklich gemutet/gekickt werden.
 */
export async function addWarning(groupJid, userJid, reason, byJid) {
  const user = resolveLid(userJid);
  const expiresAt = Date.now() + config.moderation.warnExpiryDays * 24 * 60 * 60_000;
  await dbRun(
    'INSERT INTO warnings (group_jid, user_jid, reason, by_jid, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
    [groupJid, user, reason, byJid || 'auto', Date.now(), expiresAt]
  );
  const count = (await activeWarnings(groupJid, user)).length;

  let action = null;
  if (count >= config.moderation.warnLimitKick) {
    action = (await kickUser(groupJid, user, 'Warn-Limit erreicht')) ? 'kick' : null;
  } else if (count >= config.moderation.warnLimitMute) {
    action = (await muteUser(groupJid, user, config.moderation.muteMinutesDefault, 'auto', 'Warn-Limit erreicht'))
      ? 'mute'
      : null;
  }
  await audit(action ? `warn+${action}` : 'warn', groupJid, user, byJid || 'auto', reason);
  return { count, action };
}

export async function clearWarnings(groupJid, userJid) {
  const user = resolveLid(userJid);
  await dbRun('DELETE FROM warnings WHERE group_jid = ? AND user_jid = ?', [groupJid, user]);
  await audit('clearwarns', groupJid, user, 'admin', '');
}

// ── Mute (Bot löscht Nachrichten des Gemuteten, solange aktiv) ────

const muteCache = new TTLCache({ ttlMs: 86400_000, maxSize: 5000 }); // 24h max TTL als Puffer, wird über 'until' geprüft

export async function loadMutes() {
  muteCache.clear();
  const rows = await dbRows('SELECT group_jid, user_jid, until FROM mutes WHERE until > ?', [Date.now()]);
  for (const r of rows) {
    const ttl = Number(r.until) - Date.now();
    if (ttl > 0) {
      muteCache.set(`${r.group_jid}|${r.user_jid}`, Number(r.until), ttl);
    }
  }
}

export async function muteUser(groupJid, userJid, minutes, byJid, reason = '') {
  const user = resolveLid(userJid);
  const until = Date.now() + minutes * 60_000;
  try {
    await dbRun(
      `INSERT INTO mutes (group_jid, user_jid, until, by_jid, reason) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(group_jid, user_jid) DO UPDATE SET until = excluded.until, by_jid = excluded.by_jid, reason = excluded.reason`,
      [groupJid, user, until, byJid, reason]
    );
    muteCache.set(`${groupJid}|${user}`, until, minutes * 60_000);
    await audit('mute', groupJid, user, byJid, `${minutes} Min — ${reason}`);
    return true;
  } catch (err) {
    logError(err, 'moderation.mute');
    return false;
  }
}

export async function unmuteUser(groupJid, userJid, byJid = 'admin') {
  const user = resolveLid(userJid);
  muteCache.delete(`${groupJid}|${user}`);
  await dbRun('DELETE FROM mutes WHERE group_jid = ? AND user_jid = ?', [groupJid, user]).catch(() => {});
  await audit('unmute', groupJid, user, byJid, '');
}

export function isMuted(groupJid, userCandidates) {
  const now = Date.now();
  for (const raw of Array.isArray(userCandidates) ? userCandidates : [userCandidates]) {
    for (const id of [normalizeId(raw), resolveLid(raw)]) {
      if (!id) continue;
      const key = `${groupJid}|${id}`;
      const until = muteCache.get(key);
      if (until && until > now) return until;
      if (until && until <= now) {
        muteCache.delete(key);
        dbRun('DELETE FROM mutes WHERE group_jid = ? AND user_jid = ?', [groupJid, id]).catch(() => {});
      }
    }
  }
  return 0;
}

// ── Kick & Ban ─────────────────────────────────────────────────────

export async function kickUser(groupJid, userJid, reason = '') {
  const user = resolveLid(userJid);
  try {
    if (!(await botIsAdmin(groupJid))) return false;
    await state.sock.groupParticipantsUpdate(groupJid, [user], 'remove');
    invalidateGroupMeta(groupJid);
    await audit('kick', groupJid, user, 'bot', reason);
    return true;
  } catch (err) {
    logError(err, 'moderation.kick');
    return false;
  }
}

export async function banUser(groupJid, userJid, reason, byJid) {
  const user = resolveLid(userJid);
  await dbRun(
    `INSERT INTO bans (group_jid, user_jid, reason, by_jid, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(group_jid, user_jid) DO UPDATE SET reason = excluded.reason, by_jid = excluded.by_jid`,
    [groupJid, user, reason, byJid, Date.now()]
  ).catch(() => {});
  const kicked = await kickUser(groupJid, user, `Ban: ${reason}`);
  await audit('ban', groupJid, user, byJid, reason);
  return kicked;
}

export async function unbanUser(groupJid, userJid, byJid = 'admin') {
  const user = resolveLid(userJid);
  await dbRun('DELETE FROM bans WHERE group_jid = ? AND user_jid = ?', [groupJid, user]).catch(() => {});
  await audit('unban', groupJid, user, byJid, '');
}

async function isBanned(groupJid, userJid) {
  const rows = await dbRows('SELECT 1 FROM bans WHERE group_jid = ? AND user_jid = ?', [
    groupJid,
    resolveLid(userJid),
  ]);
  return rows.length > 0;
}

// ── Auto-Moderation pro Nachricht ──────────────────────────────────

const spamTracker = new Map(); // "group|user" → [Zeitstempel]

/**
 * Prüft eine Gruppen-Nachricht auf Regelverstöße.
 * Rückgabe: null (ok) oder { deleted, warned: {count, action}, kind, untilText }.
 */
export async function checkAutoMod(msg, groupJid, senderIds, text) {
  try {
    const settings = await getGroupSettings(groupJid);
    if (!Number(settings.enabled)) return null;

    // 1) Gemutete Nutzer: Nachricht löschen, keine weitere Verarbeitung
    const mutedUntil = isMuted(groupJid, senderIds);
    if (mutedUntil) {
      await deleteMessage(msg, groupJid);
      return { kind: 'muted', deleted: true, untilText: fmtUntil(mutedUntil) };
    }

    let violation = null;

    // 2) Anti-Link
    if (Number(settings.antilink) && text && LINK_RE.test(text)) {
      violation = { kind: 'link', reason: 'Link gepostet (Anti-Link aktiv)' };
    }

    // 3) Wort-Blacklist (RAM-Cache — kein DB-Roundtrip pro Nachricht mehr).
    // Geprüft wird dreifach: roh (wie früher), normalisiert (Leetspeak/Umlaute/
    // Akzente) und "condensed" ohne Trennzeichen (fängt "S c h e i s s e").
    if (!violation && Number(settings.blacklist_on) && text) {
      const words = await getBlockedWords(groupJid);
      if (words.length) {
        const lower = text.toLowerCase();
        const normText = normalizeForFilter(text);
        const condText = normText.replace(/[^a-z]/g, '');
        const hit = words.find(
          (w) =>
            lower.includes(w.raw) ||
            (w.norm && normText.includes(w.norm)) ||
            (w.condensed.length >= 4 && condText.includes(w.condensed))
        );
        if (hit) violation = { kind: 'word', reason: `verbotenes Wort ("${hit.raw}")` };
      }
    }

    // 4) Anti-Spam (viele Nachrichten in kurzer Zeit)
    if (!violation && Number(settings.antispam)) {
      const key = `${groupJid}|${resolveLid(senderIds[0])}`; // stabile Form — LID & PN zählen zusammen
      const now = Date.now();
      const arr = (spamTracker.get(key) || []).filter((t) => now - t < 10_000);
      arr.push(now);
      spamTracker.set(key, arr);
      if (spamTracker.size > 1000) spamTracker.delete(spamTracker.keys().next().value);
      if (arr.length >= 8) {
        spamTracker.set(key, []);
        violation = { kind: 'spam', reason: 'Spam (zu viele Nachrichten in kurzer Zeit)' };
      }
    }

    if (!violation) return null;

    // Admins & Owner sind von Auto-Mod ausgenommen — der (teure) Metadata-Check
    // läuft bewusst erst NACH der Verstoß-Erkennung, also nur im seltenen Fall.
    if (await isUserAdmin(groupJid, senderIds)) return null;

    const deleted = await deleteMessage(msg, groupJid);
    const warned = await addWarning(groupJid, senderIds[0], violation.reason, 'auto');
    return { ...violation, deleted, warned };
  } catch (err) {
    logError(err, 'moderation.check');
    return null;
  }
}

async function deleteMessage(msg, groupJid) {
  try {
    if (!(await botIsAdmin(groupJid))) return false;
    await state.sock.sendMessage(groupJid, { delete: msg.key });
    return true;
  } catch {
    return false;
  }
}

// ── Anti-Raid + Joins ──────────────────────────────────────────────

const joinTracker = new Map(); // groupJid → [Zeitstempel]

/** Bei group-participants.update (add): Bans durchsetzen + Raid erkennen. */
export async function handleJoin(groupJid, participants) {
  try {
    invalidateGroupMeta(groupJid);

    // 1) Gebannte Nutzer sofort wieder entfernen
    for (const p of participants) {
      if (await isBanned(groupJid, p)) {
        await kickUser(groupJid, p, 'gebannt (Auto-Kick beim Rejoin)');
        await sendText(groupJid, '⛔ Ein gebannter Nutzer wurde automatisch wieder entfernt.');
      }
    }

    // 2) Anti-Raid
    const ar = await dbRows('SELECT enabled, locked_until FROM antiraid WHERE group_jid = ?', [groupJid]);
    if (!ar.length || !Number(ar[0].enabled)) return;

    const now = Date.now();
    const arr = (joinTracker.get(groupJid) || []).filter(
      (t) => now - t < config.moderation.antiRaid.joinWindowMs
    );
    for (let i = 0; i < participants.length; i++) arr.push(now);
    joinTracker.set(groupJid, arr);

    const alreadyLocked = Number(ar[0].locked_until) > now;
    if (arr.length >= config.moderation.antiRaid.joinThreshold && !alreadyLocked) {
      const until = now + config.moderation.antiRaid.lockMinutes * 60_000;
      if (await botIsAdmin(groupJid)) {
        await state.sock.groupSettingUpdate(groupJid, 'announcement');
        await dbRun('UPDATE antiraid SET locked_until = ? WHERE group_jid = ?', [until, groupJid]);
        await sendText(
          groupJid,
          `🛡️ *Anti-Raid ausgelöst!*
Ungewöhnlich viele Beitritte — die Gruppe ist für *${config.moderation.antiRaid.lockMinutes} Minuten* auf „nur Admins" gestellt.`
        );
        await audit('antiraid-lock', groupJid, '', 'bot', `${arr.length} Joins`);
        logInfo(`🛡️ Anti-Raid: ${groupJid} für ${config.moderation.antiRaid.lockMinutes} Min gesperrt`);
      }
    }
  } catch (err) {
    logError(err, 'moderation.join');
  }
}

/** Vom Scheduler aufgerufen: abgelaufene Anti-Raid-Sperren wieder öffnen. */
export async function releaseExpiredRaidLocks() {
  const rows = await dbRows('SELECT group_jid, locked_until FROM antiraid WHERE locked_until > 0', []);
  const now = Date.now();
  for (const r of rows) {
    if (Number(r.locked_until) <= now) {
      try {
        await dbRun('UPDATE antiraid SET locked_until = 0 WHERE group_jid = ?', [r.group_jid]);
        if (await botIsAdmin(r.group_jid)) {
          await state.sock.groupSettingUpdate(r.group_jid, 'not_announcement');
          await sendText(r.group_jid, '🛡️ Anti-Raid-Sperre aufgehoben — alle können wieder schreiben.');
        }
      } catch (err) {
        logError(err, 'moderation.raidRelease');
      }
    }
  }
}

// ── Audit-Log ──────────────────────────────────────────────────────

export async function audit(action, groupJid, target, byJid, detail) {
  await dbRun(
    'INSERT INTO audit_log (action, group_jid, target, by_jid, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [action, groupJid || '', target || '', byJid || '', String(detail || '').slice(0, 300), Date.now()]
  ).catch(() => {});
}

export function fmtUntil(ts) {
  const mins = Math.max(1, Math.round((ts - Date.now()) / 60_000));
  return mins >= 60 ? `${Math.floor(mins / 60)} Std ${mins % 60} Min` : `${mins} Min`;
}
