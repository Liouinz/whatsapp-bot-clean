// Bearer-Token-Pruefung.
//
// Die API kennt bewusst KEINE Cookies. Das alte Panel arbeitet mit einem
// Sitzungs-Cookie; die App schickt `Authorization: Bearer <token>`. Damit
// gibt es fuer /api/v1 auch keine CSRF-Flaeche — ein Browser haengt einen
// Bearer-Header nicht von selbst an.

import { ApiError } from '../errors.js';
import { resolveToken, touchSession } from '../services/tokens.js';
import { permissionsFor } from '../services/apiUsers.js';

function bearerFrom(req) {
  const raw = req.headers.authorization;
  if (typeof raw !== 'string') return null;
  const m = /^Bearer\s+([A-Za-z0-9._~+/=-]{20,512})$/.exec(raw.trim());
  return m ? m[1] : null;
}

/**
 * Setzt bei Erfolg `req.auth = { user, session, permissions }`.
 *
 * Unterscheidet absichtlich zwischen abgelaufen und ungueltig: die App soll
 * bei TOKEN_EXPIRED still erneuern und nur bei TOKEN_INVALID den Nutzer neu
 * anmelden lassen. Beides bleibt 401 — der Unterschied steht im `code`.
 */
export function requireAuth() {
  return async (req, _res, next) => {
    const token = bearerFrom(req);
    if (!token) {
      return next(new ApiError('UNAUTHENTICATED', 'Kein gueltiger Authorization-Header.'));
    }

    const result = await resolveToken(token, 'access');
    if (!result.ok) {
      if (result.reason === 'expired') {
        return next(new ApiError('TOKEN_EXPIRED', 'Der Zugriffstoken ist abgelaufen.'));
      }
      if (result.reason === 'disabled') {
        return next(new ApiError('FORBIDDEN', 'Dieser Zugang ist deaktiviert.'));
      }
      // 'invalid' und 'revoked' werden nach aussen nicht unterschieden: sonst
      // liesse sich damit pruefen, ob ein geratener Token existiert hat.
      return next(new ApiError('TOKEN_INVALID', 'Der Zugriffstoken ist ungueltig.'));
    }

    req.auth = {
      user: result.user,
      session: result.session,
      permissions: permissionsFor(result.user.role),
    };
    touchSession(result.session.id);
    next();
  };
}
