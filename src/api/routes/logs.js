import { apiRouter } from '../router.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { readLimiter } from '../middleware/rateLimit.js';
import { getRecentLogs } from '../../logger.js';
import { config } from '../../config.js';

export const logRoutes = apiRouter();

const LEVELS = ['debug', 'info', 'success', 'warn', 'error'];

/**
 * Kuerzt Stacktraces auf die erste Zeile.
 *
 * Der Ring-Puffer behaelt sie vollstaendig fuer das Server-Log; ueber die API
 * geht nur die Meldung plus die Zahl der unterdrueckten Rahmen — Dateipfade
 * und Zeilennummern des Servers gehen niemanden ausserhalb etwas an.
 */
function redactTrace(msg) {
  const text = String(msg || '');
  const lines = text.split('\n');
  if (lines.length < 2) return text;
  const frames = lines.slice(1).filter((l) => /^\s*at\s/.test(l)).length;
  return frames > 0 ? `${lines[0].trim()} (+${frames} Stack-Frames unterdrueckt)` : text;
}

/**
 * Log-Ansicht mit Blaetterung, Filter nach Stufe und Zeitraum.
 *
 * Gelesen wird aus dem Ring-Puffer im Arbeitsspeicher — keine Datenbank, kein
 * Dateizugriff. Die Antwort ist dadurch guenstig und immer begrenzt.
 */
logRoutes.get(
  '/',
  requireAuth(),
  requirePermission('logs.read'),
  readLimiter,
  validate(
    {
      level: { type: 'string', enum: LEVELS },
      since: { type: 'int', min: 0 },
      page: { type: 'int', min: 1, max: 10000, default: 1 },
      limit: { type: 'int', min: 1, max: 200, default: 50 },
    },
    'query'
  ),
  (req, res) => {
    const { level, since, page = 1, limit = 50 } = req.valid;
    let entries = getRecentLogs(config.log?.ringSize || 500);

    if (level) {
      // Ab der gewaehlten Stufe aufwaerts, damit `level=warn` auch Fehler zeigt.
      const min = LEVELS.indexOf(level);
      entries = entries.filter((e) => LEVELS.indexOf(e.level) >= min);
    }
    if (since) entries = entries.filter((e) => Number(e.ts) >= since);

    // Neueste zuerst — das ist die Reihenfolge, in der eine App sie anzeigt.
    entries = entries.slice().reverse();

    const total = entries.length;
    const pages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, pages);
    res.json({
      logs: entries.slice((safePage - 1) * limit, safePage * limit).map((e) => ({
        ts: e.ts,
        level: e.level,
        context: e.context || null,
        message: redactTrace(e.msg),
      })),
      pagination: { page: safePage, limit, total, pages },
    });
  }
);
