// Access- und Refresh-Tokens der Control API.
//
// Entwurfsentscheidungen und warum:
//
// * **Undurchsichtige Zufallstokens, kein JWT.** Ein JWT muesste fuer echten
//   Widerruf ohnehin gegen eine Sperrliste in der Datenbank geprueft werden —
//   dann kann der Token auch gleich der Datenbankschluessel sein. Spart eine
//   Abhaengigkeit und eine ganze Klasse von Signatur-Fehlern.
// * **Gespeichert wird nur der SHA-256-Hash.** Wer die Datenbank liest,
//   bekommt keinen benutzbaren Token. Ein Hash reicht hier (anders als bei
//   Passwoertern) ohne Salt und ohne Streckung: der Token hat 256 Bit Entropie,
//   da ist nichts zu raten.
// * **Refresh-Rotation mit Wiederverwendungserkennung.** Jeder Refresh
//   entwertet den benutzten Token. Taucht ein bereits entwerteter Token wieder
//   auf, ist entweder er oder sein Nachfolger gestohlen — dann wird die
//   gesamte Geraete-Sitzung widerrufen, nicht nur der eine Token.

import crypto from 'node:crypto';
import { dbRun, dbBatch, dbRowsStrict } from '../../db.js';

export const ACCESS_TTL_MS = 15 * 60_000;          // 15 Minuten
export const REFRESH_TTL_MS = 30 * 24 * 60 * 60_000; // 30 Tage

const newSecret = () => crypto.randomBytes(32).toString('base64url');
const hashToken = (raw) => crypto.createHash('sha256').update(String(raw), 'utf8').digest('hex');

/** Legt eine Geraete-Sitzung an. Ein Eintrag je gekoppeltem Geraet. */
export async function createSession(userId, { deviceLabel = null, appVersion = null } = {}) {
  const id = `ses_${crypto.randomBytes(9).toString('base64url')}`;
  const now = Date.now();
  await dbRun(
    `INSERT INTO api_sessions (id, user_id, device_label, app_version, created_at, last_used_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, userId, deviceLabel, appVersion, now, now]
  );
  return id;
}

/** Erzeugt ein frisches Token-Paar fuer eine bestehende Sitzung. */
export async function issueTokenPair(sessionId) {
  const now = Date.now();
  const access = newSecret();
  const refresh = newSecret();
  await dbBatch([
    {
      sql: `INSERT INTO api_tokens (token_hash, session_id, kind, expires_at, created_at) VALUES (?, ?, 'access', ?, ?)`,
      args: [hashToken(access), sessionId, now + ACCESS_TTL_MS, now],
    },
    {
      sql: `INSERT INTO api_tokens (token_hash, session_id, kind, expires_at, created_at) VALUES (?, ?, 'refresh', ?, ?)`,
      args: [hashToken(refresh), sessionId, now + REFRESH_TTL_MS, now],
    },
  ]);
  return {
    accessToken: access,
    refreshToken: refresh,
    tokenType: 'Bearer',
    expiresIn: Math.floor(ACCESS_TTL_MS / 1000),
    refreshExpiresIn: Math.floor(REFRESH_TTL_MS / 1000),
  };
}

/**
 * Loest einen Token auf und liefert Sitzung und Nutzer — oder einen Grund,
 * warum nicht. Der Aufrufer entscheidet daraus den HTTP-Status; hier wird
 * bewusst nicht geworfen, damit "abgelaufen" und "ungueltig" unterscheidbar
 * bleiben (die App soll bei `expired` erneuern, bei `invalid` neu anmelden).
 *
 * @returns {Promise<{ok:true, session, user, tokenHash}|{ok:false, reason:'invalid'|'expired'|'revoked'|'disabled'}>}
 */
export async function resolveToken(raw, kind) {
  if (typeof raw !== 'string' || raw.length < 20) return { ok: false, reason: 'invalid' };
  const rows = await dbRowsStrict(
    `SELECT t.token_hash, t.session_id, t.kind, t.expires_at, t.revoked_at,
            s.user_id, s.revoked_at AS session_revoked, s.device_label, s.app_version,
            u.username, u.role, u.disabled
       FROM api_tokens t
       JOIN api_sessions s ON s.id = t.session_id
       JOIN api_users u    ON u.id = s.user_id
      WHERE t.token_hash = ? AND t.kind = ?`,
    [hashToken(raw), kind]
  );
  const row = rows[0];
  if (!row) return { ok: false, reason: 'invalid' };
  if (row.revoked_at) return { ok: false, reason: 'revoked', sessionId: row.session_id };
  if (row.session_revoked) return { ok: false, reason: 'revoked', sessionId: row.session_id };
  if (Number(row.expires_at) <= Date.now()) return { ok: false, reason: 'expired' };
  if (Number(row.disabled) === 1) return { ok: false, reason: 'disabled' };

  return {
    ok: true,
    tokenHash: row.token_hash,
    session: {
      id: row.session_id,
      deviceLabel: row.device_label,
      appVersion: row.app_version,
    },
    user: { id: row.user_id, username: row.username, role: row.role },
  };
}

/** Markiert die Sitzung als zuletzt benutzt. Gedrosselt, damit nicht jeder Request schreibt. */
const TOUCH_INTERVAL_MS = 5 * 60_000;
const lastTouch = new Map();
export function touchSession(sessionId) {
  const now = Date.now();
  const prev = lastTouch.get(sessionId) || 0;
  if (now - prev < TOUCH_INTERVAL_MS) return;
  if (lastTouch.size > 5000) lastTouch.delete(lastTouch.keys().next().value);
  lastTouch.set(sessionId, now);
  dbRun('UPDATE api_sessions SET last_used_at = ? WHERE id = ?', [now, sessionId]).catch(() => {});
}

/**
 * Tauscht einen Refresh-Token gegen ein neues Paar.
 *
 * Der benutzte Token wird dabei entwertet. Wird ein bereits entwerteter
 * Refresh-Token noch einmal vorgelegt, gilt das als Diebstahl-Anzeichen und
 * die komplette Sitzung wird widerrufen.
 */
export async function rotateRefreshToken(raw) {
  const resolved = await resolveToken(raw, 'refresh');

  if (!resolved.ok) {
    if (resolved.reason === 'revoked' && resolved.sessionId) {
      await revokeSession(resolved.sessionId);
      return { ok: false, reason: 'reuse_detected' };
    }
    return { ok: false, reason: resolved.reason };
  }

  await dbRun('UPDATE api_tokens SET revoked_at = ? WHERE token_hash = ?', [Date.now(), resolved.tokenHash]);
  const pair = await issueTokenPair(resolved.session.id);
  return { ok: true, pair, user: resolved.user, session: resolved.session };
}

/** Widerruft eine Geraete-Sitzung samt aller ihrer Tokens. */
export async function revokeSession(sessionId) {
  const now = Date.now();
  await dbBatch([
    { sql: 'UPDATE api_sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL', args: [now, sessionId] },
    { sql: 'UPDATE api_tokens SET revoked_at = ? WHERE session_id = ? AND revoked_at IS NULL', args: [now, sessionId] },
  ]);
}

/**
 * Widerruft **alle** Sitzungen eines Nutzers.
 *
 * Wird beim Deaktivieren eines Zugangs gebraucht: ohne das behielten bereits
 * ausgegebene Tokens ihre Gueltigkeit bis zum Ablauf, und "deaktiviert" waere
 * eine Aussage ohne Wirkung. (Der resolveToken-Pfad prueft `disabled`
 * zusaetzlich — das hier ist der Guertel zum Hosentraeger.)
 */
export async function revokeAllSessionsForUser(userId) {
  const now = Date.now();
  await dbBatch([
    { sql: 'UPDATE api_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL', args: [now, userId] },
    {
      sql: `UPDATE api_tokens SET revoked_at = ?
             WHERE revoked_at IS NULL
               AND session_id IN (SELECT id FROM api_sessions WHERE user_id = ?)`,
      args: [now, userId],
    },
  ]);
}

/** Alle Geraete eines Nutzers. Ohne Tokens — die verlassen die Datenbank nie. */
export async function listSessions(userId) {
  return dbRowsStrict(
    `SELECT id, device_label, app_version, created_at, last_used_at, revoked_at
       FROM api_sessions WHERE user_id = ? ORDER BY last_used_at DESC`,
    [userId]
  );
}

export async function findSession(sessionId, userId) {
  const rows = await dbRowsStrict(
    'SELECT id, user_id, revoked_at FROM api_sessions WHERE id = ? AND user_id = ?',
    [sessionId, userId]
  );
  return rows[0] || null;
}

/**
 * Raeumt abgelaufene Tokens weg. Wird beim Anmelden aufgerufen statt in einem
 * eigenen Hintergrund-Job — ein Timer mehr im Prozess waere fuer diese
 * Datenmenge nicht zu rechtfertigen.
 */
export async function cleanupExpiredTokens() {
  await dbRun('DELETE FROM api_tokens WHERE expires_at < ?', [Date.now() - 24 * 60 * 60_000]).catch(() => {});
}
