// Einheitliches Fehlerformat der Control API.
//
// Jede Fehlerantwort sieht gleich aus, damit die App genau einen Pfad zum
// Auswerten braucht:
//
//   { "error": { "code": "BOT_NOT_READY", "message": "...", "requestId": "req_..." } }
//
// `code` ist maschinenlesbar und stabil — die App schaltet darauf, nicht auf
// den Text. `message` ist fuer Menschen und darf sich aendern.

/** Stabile Fehlercodes. Erweitern ist erlaubt, umbenennen nicht. */
export const CODES = {
  BAD_REQUEST: 400,
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  TOKEN_EXPIRED: 401,
  TOKEN_INVALID: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  BOT_NOT_READY: 503,
  DEPENDENCY_UNAVAILABLE: 503,
  INTERNAL: 500,
};

export class ApiError extends Error {
  /**
   * @param {keyof typeof CODES} code
   * @param {string} message  Fuer Menschen. Enthaelt NIE interne Pfade,
   *   SQL, Stacktraces oder Werte aus der Konfiguration.
   * @param {object} [details] Optionale Feld-Hinweise bei Validierungsfehlern.
   */
  constructor(code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.code = code in CODES ? code : 'INTERNAL';
    this.status = CODES[this.code];
    if (details) this.details = details;
  }
}

export const badRequest = (msg, details) => new ApiError('BAD_REQUEST', msg, details);
export const unauthenticated = (msg = 'Anmeldung erforderlich.') => new ApiError('UNAUTHENTICATED', msg);
export const forbidden = (msg = 'Keine Berechtigung fuer diese Aktion.') => new ApiError('FORBIDDEN', msg);
export const notFound = (msg = 'Nicht gefunden.') => new ApiError('NOT_FOUND', msg);

/**
 * Abschliessende Fehler-Middleware der API.
 *
 * Alles, was kein ApiError ist, wird zu einem generischen 500 — ein
 * unerwarteter Fehler darf niemals seine Meldung nach aussen tragen, weil dort
 * Dateipfade, SQL oder Verbindungsdaten stehen koennen. Der vollstaendige
 * Fehler geht in das Server-Log, verknuepft ueber die requestId.
 */
export function errorHandler(logError) {
  return (err, req, res, next) => {
    const requestId = req.id || null;

    // Ist die Antwort schon unterwegs, laesst sich kein Status mehr setzen —
    // jeder Versuch wuerde hier eine zweite Ausnahme werfen und die
    // urspruengliche verschlucken. Express verlangt in diesem Fall die Abgabe
    // an seinen eigenen Handler, der die Verbindung schliesst.
    //
    // Das ist kein theoretischer Fall: /bot/restart antwortet mit 202 und
    // faehrt DANACH herunter — alles, was in diesem Fenster schiefgeht, kommt
    // genau hier an.
    if (res.headersSent) {
      logError(err, `api:${req.method} ${req.path} (Antwort bereits gesendet)`);
      return next(err);
    }

    if (err instanceof ApiError) {
      // Erwartete Fehler: nur bei 5xx ins Fehlerlog, sonst waere jede
      // fehlgeschlagene Anmeldung ein Eintrag.
      if (err.status >= 500) logError(err, `api:${req.method} ${req.path}`);
      return res.status(err.status).json({
        error: { code: err.code, message: err.message, requestId, ...(err.details ? { details: err.details } : {}) },
      });
    }

    // express.json() meldet zu grosse oder kaputte Bodies ueber eigene Felder.
    if (err?.type === 'entity.too.large') {
      return res.status(413).json({
        error: { code: 'PAYLOAD_TOO_LARGE', message: 'Anfrage zu gross.', requestId },
      });
    }
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({
        error: { code: 'BAD_REQUEST', message: 'Ungueltiges JSON.', requestId },
      });
    }

    logError(err, `api:${req.method} ${req.path}`);
    return res.status(500).json({
      error: { code: 'INTERNAL', message: 'Interner Fehler.', requestId },
    });
  };
}
