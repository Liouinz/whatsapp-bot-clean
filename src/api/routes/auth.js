import { apiRouter } from '../router.js';
import { ApiError } from '../errors.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { authLimiter, usernameLimiter, readLimiter, adminLimiter } from '../middleware/rateLimit.js';
import { audit } from '../../moderation.js';
import {
  findByUsername, findById, verifyPassword, verifyAgainstDummy, createUser, listUsers,
  setDisabled, changePassword, bootstrapOwnerIfEmpty, permissionsFor, ROLES,
} from '../services/apiUsers.js';
import {
  createSession, issueTokenPair, rotateRefreshToken, revokeSession,
  revokeAllSessionsForUser, listSessions, findSession, cleanupExpiredTokens,
} from '../services/tokens.js';

export const authRoutes = apiRouter();

const publicUser = (u) => ({ id: u.id, username: u.username, role: u.role, permissions: permissionsFor(u.role) });

// ── Anmelden ───────────────────────────────────────────────────────

authRoutes.post(
  '/login',
  authLimiter,
  validate({
    username: { type: 'string', required: true, min: 2, max: 64 },
    password: { type: 'string', required: true, min: 1, max: 256, trim: false },
    deviceLabel: { type: 'string', max: 64 },
    appVersion: { type: 'string', max: 32 },
  }),
  // Nach der Pruefung, damit der Benutzername vorliegt: ein zweites Kontingent
  // je KONTO. Das IP-Limit allein schuetzt nicht — wer viele Adressen hat,
  // laeuft daran vorbei, und ohne vorgelagerten Proxy laesst sich req.ip
  // ohnehin frei setzen. Gegen das Durchprobieren EINES Passworts hilft nur
  // ein Zaehler am Konto.
  usernameLimiter,
  async (req, res) => {
    const { username, password, deviceLabel, appVersion } = req.valid;

    // Bootstrap: solange es keinen einzigen Zugang gibt, legt ein Login als
    // "owner" mit dem ACCESS_SECRET den ersten an. Danach ist dieser Weg zu.
    let user = await findByUsername(username);
    if (!user && username.toLowerCase() === 'owner') {
      const created = await bootstrapOwnerIfEmpty(password);
      if (created) {
        await audit('api.bootstrap', '', created.id, 'api', `req=${req.id}`);
        user = await findByUsername(created.username);
      }
    }

    // Ein einziger Fehlertext fuer "kein solcher Nutzer" und "falsches
    // Passwort" — sonst liesse sich damit herausfinden, welche Namen existieren.
    //
    // Der gleiche Text allein genuegt aber nicht: ohne Nutzer lief frueher gar
    // kein scrypt, und die Antwort kam nach 1,9 statt 41 ms zurueck. Die Zeit
    // war damit das Orakel, das der Text verschweigen sollte. Deshalb wird auch
    // fuer einen unbekannten Namen gerechnet.
    const invalid = new ApiError('UNAUTHENTICATED', 'Benutzername oder Passwort ist falsch.');
    if (!user) {
      await verifyAgainstDummy(password);
      throw invalid;
    }
    if (!(await verifyPassword(password, user.pw_hash, user.pw_salt))) throw invalid;
    if (Number(user.disabled) === 1) {
      throw new ApiError('FORBIDDEN', 'Dieser Zugang ist deaktiviert.');
    }

    const sessionId = await createSession(user.id, { deviceLabel, appVersion });
    const pair = await issueTokenPair(sessionId);
    // Gelegenheit zum Aufraeumen — spart einen eigenen Hintergrund-Job.
    cleanupExpiredTokens().catch(() => {});

    await audit('api.login', '', user.id, `api:${user.username}`, `session=${sessionId} req=${req.id}`);
    res.json({ ...pair, sessionId, user: publicUser(user) });
  }
);

// ── Token erneuern ─────────────────────────────────────────────────

authRoutes.post(
  '/refresh',
  authLimiter,
  validate({ refreshToken: { type: 'string', required: true, min: 20, max: 512, trim: false } }),
  async (req, res) => {
    const result = await rotateRefreshToken(req.valid.refreshToken);

    if (!result.ok) {
      if (result.reason === 'reuse_detected') {
        // Ein bereits eingetauschter Token wurde erneut vorgelegt. Die Sitzung
        // ist bereits widerrufen; das ist ein meldenswerter Vorgang.
        await audit('api.token_reuse', '', '', 'api', `req=${req.id}`);
        throw new ApiError('TOKEN_INVALID', 'Der Token wurde bereits verwendet. Die Sitzung wurde beendet.');
      }
      if (result.reason === 'expired') {
        throw new ApiError('TOKEN_EXPIRED', 'Der Refresh-Token ist abgelaufen. Bitte neu anmelden.');
      }
      throw new ApiError('TOKEN_INVALID', 'Der Refresh-Token ist ungueltig.');
    }

    res.json({ ...result.pair, sessionId: result.session.id, user: publicUser(result.user) });
  }
);

// ── Abmelden ───────────────────────────────────────────────────────

authRoutes.post('/logout', requireAuth(), async (req, res) => {
  await revokeSession(req.auth.session.id);
  await audit('api.logout', '', req.auth.user.id, `api:${req.auth.user.username}`, `req=${req.id}`);
  res.json({ ok: true });
});

// ── Wer bin ich ────────────────────────────────────────────────────

authRoutes.get('/me', requireAuth(), readLimiter, (req, res) => {
  res.json({
    user: publicUser(req.auth.user),
    session: { id: req.auth.session.id, deviceLabel: req.auth.session.deviceLabel, appVersion: req.auth.session.appVersion },
  });
});

// ── Geraete ────────────────────────────────────────────────────────

authRoutes.get('/sessions', requireAuth(), readLimiter, async (req, res) => {
  const rows = await listSessions(req.auth.user.id);
  res.json({
    sessions: rows.map((s) => ({
      id: s.id,
      deviceLabel: s.device_label,
      appVersion: s.app_version,
      createdAt: Number(s.created_at) || null,
      lastUsedAt: Number(s.last_used_at) || null,
      revoked: !!s.revoked_at,
      current: s.id === req.auth.session.id,
    })),
  });
});

authRoutes.delete('/sessions/:id', requireAuth(), async (req, res) => {
  // Nur eigene Sitzungen. Ohne diese Pruefung waere die Sitzungs-ID eines
  // fremden Nutzers ein direkter Weg, ihn abzumelden (IDOR).
  const session = await findSession(String(req.params.id || ''), req.auth.user.id);
  if (!session) throw new ApiError('NOT_FOUND', 'Sitzung nicht gefunden.');

  await revokeSession(session.id);
  await audit('api.session_revoke', '', session.id, `api:${req.auth.user.username}`, `req=${req.id}`);
  res.json({ ok: true });
});

// ── Eigenes Passwort aendern ───────────────────────────────────────

authRoutes.post(
  '/password',
  requireAuth(),
  adminLimiter,
  validate({
    currentPassword: { type: 'string', required: true, min: 1, max: 256, trim: false },
    newPassword: { type: 'string', required: true, min: 12, max: 256, trim: false },
  }),
  async (req, res) => {
    // Ohne diesen Endpunkt bliebe das Owner-Passwort fuer immer identisch mit
    // ACCESS_SECRET — dem Passwort des Web-Panels. Ein Leck haette damit
    // automatisch beides geoeffnet, und die in der Doku beschriebene Trennung
    // zwischen Panel- und API-Zugang gaebe es gar nicht.
    const user = await findByUsername(req.auth.user.username);
    if (!user) throw new ApiError('NOT_FOUND', 'Zugang nicht gefunden.');

    if (!(await verifyPassword(req.valid.currentPassword, user.pw_hash, user.pw_salt))) {
      throw new ApiError('UNAUTHENTICATED', 'Das aktuelle Passwort ist falsch.');
    }
    await changePassword(user.id, req.valid.newPassword);

    // Alle ANDEREN Geraete abmelden. Wer sein Passwort aendert, tut das oft,
    // weil er einen Fremdzugriff vermutet — dann muessen die fremden Sitzungen
    // weg. Die eigene bleibt, sonst fliegt man aus der eigenen App.
    const sessions = await listSessions(user.id);
    for (const s of sessions) {
      if (s.id !== req.auth.session.id && !s.revoked_at) await revokeSession(s.id);
    }

    await audit('api.password_change', '', user.id, `api:${user.username}`, `req=${req.id}`);
    res.json({ ok: true, otherSessionsRevoked: sessions.filter((s) => s.id !== req.auth.session.id && !s.revoked_at).length });
  }
);

// ── Zugaenge verwalten (nur Owner) ─────────────────────────────────

authRoutes.get('/users', requireAuth(), requirePermission('apiusers.manage'), readLimiter, async (_req, res) => {
  const rows = await listUsers();
  res.json({
    users: rows.map((u) => ({
      id: u.id, username: u.username, role: u.role,
      disabled: Number(u.disabled) === 1, createdAt: Number(u.created_at) || null,
    })),
  });
});

authRoutes.post(
  '/users',
  requireAuth(),
  requirePermission('apiusers.manage'),
  // adminLimiter statt authLimiter: das Anlegen eines Zugangs ist eine sensible
  // Verwaltungsaktion, aber keine Bruteforce-Flaeche — hier ist schon ein
  // Owner-Token noetig. Der Limiter zaehlt nach Nutzer statt nach IP, und er
  // hat einen eigenen Topf, damit er sich weder mit der Anmeldung noch mit der
  // Bot-Steuerung ein Kontingent teilt.
  adminLimiter,
  validate({
    username: { type: 'string', required: true, min: 2, max: 64, pattern: /^[a-z0-9._-]+$/i },
    password: { type: 'string', required: true, min: 12, max: 256, trim: false },
    role: { type: 'string', required: true, enum: ROLES },
  }),
  async (req, res) => {
    const { username, password, role } = req.valid;
    if (await findByUsername(username)) {
      throw new ApiError('CONFLICT', 'Diesen Benutzernamen gibt es bereits.');
    }
    const created = await createUser({ username, password, role });
    await audit('api.user_create', '', created.id, `api:${req.auth.user.username}`, `role=${role} req=${req.id}`);
    res.status(201).json({ user: publicUser(created) });
  }
);

authRoutes.patch(
  '/users/:id',
  requireAuth(),
  requirePermission('apiusers.manage'),
  adminLimiter,
  validate({ disabled: { type: 'bool', required: true } }),
  async (req, res) => {
    const target = await findById(String(req.params.id || ''));
    if (!target) throw new ApiError('NOT_FOUND', 'Zugang nicht gefunden.');
    if (target.id === req.auth.user.id) {
      // Sonst sperrt sich der letzte Owner selbst aus und niemand kommt mehr
      // an die Zugangsverwaltung.
      throw new ApiError('CONFLICT', 'Der eigene Zugang kann nicht deaktiviert werden.');
    }
    await setDisabled(target.id, req.valid.disabled);
    // ALLE Sitzungen des Zugangs beenden, nicht eine. `target.id` ist eine
    // Nutzer-Kennung; sie an revokeSession() zu geben haette stillschweigend
    // nichts bewirkt und "deaktiviert" zu einer leeren Zusage gemacht.
    if (req.valid.disabled) await revokeAllSessionsForUser(target.id);
    await audit('api.user_update', '', target.id, `api:${req.auth.user.username}`,
      `disabled=${req.valid.disabled} req=${req.id}`);
    res.json({ ok: true });
  }
);
