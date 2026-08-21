import { apiRouter } from '../router.js';
import { ApiError } from '../errors.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { readLimiter, controlLimiter } from '../middleware/rateLimit.js';
import { state, requestShutdown, forceRelink } from '../../state.js';
import { statusPayload, cachedGroupCount } from '../../services/query.js';
import { audit } from '../../moderation.js';
import { BOT_VERSION } from '../version.js';

export const botRoutes = apiRouter();

/**
 * Status in genau der Form, die eine App zum Anzeigen braucht — flach,
 * stabil benannt, ohne interne Objekte.
 */
botRoutes.get('/status', requireAuth(), requirePermission('bot.read'), readLimiter, async (_req, res) => {
  const payload = await statusPayload();
  res.json({
    status: state.stopped ? 'stopped' : payload.connection === 'open' ? 'online' : 'connecting',
    whatsapp: payload.connection || 'unknown',
    authenticated: payload.connection === 'open',
    stopped: !!payload.stopped,
    stopReason: payload.stopReason || null,
    uptimeSeconds: Math.floor(payload.uptimeMs / 1000),
    startedAt: payload.startedAt,
    lastConnectedAt: payload.lastConnectedAt,
    version: BOT_VERSION,
    counters: {
      sentToday: payload.sentToday,
      commandsToday: payload.commandsToday,
      queuePending: payload.queue,
      groups: cachedGroupCount(),
    },
    ai: payload.ai,
    flags: payload.global,
  });
});

// ── Steuerung ──────────────────────────────────────────────────────
//
// Zwei Schutzschichten gegen widerspruechliche Parallelaufrufe:
// der Sperrvermerk hier faengt gleichzeitige Anfragen ab (409), und der
// gemeinsame Shutdown-Pfad in index.js hat seinerseits einen Wiedereintritts-
// Schutz. Drei Neustart-Anfragen in derselben Millisekunde loesen deshalb
// genau einen Neustart aus.

let restartInFlight = false;
let lastRestartAt = 0;
const RESTART_COOLDOWN_MS = 60_000;

botRoutes.post(
  '/restart',
  requireAuth(),
  requirePermission('bot.control'),
  controlLimiter,
  async (req, res) => {
    if (restartInFlight) {
      throw new ApiError('CONFLICT', 'Ein Neustart laeuft bereits.');
    }
    const wait = RESTART_COOLDOWN_MS - (Date.now() - lastRestartAt);
    if (wait > 0) {
      throw new ApiError('CONFLICT', `Neustart-Sperre aktiv — noch ${Math.ceil(wait / 1000)} Sekunden.`);
    }

    restartInFlight = true;
    lastRestartAt = Date.now();
    await audit('api.bot.restart', '', '', `api:${req.auth.user.username}`, `req=${req.id}`);

    // Erst antworten, dann herunterfahren: sonst bricht die Verbindung ab,
    // bevor die App eine Bestaetigung bekommt.
    res.status(202).json({ accepted: true, action: 'restart', requestId: req.id });

    setTimeout(() => {
      requestShutdown('API-Neustart').catch(() => {
        restartInFlight = false;
      });
    }, 1000);
  }
);

/**
 * Verknuepfung zuruecksetzen — danach ist ein neuer QR-Code noetig.
 * Absichtlich unter demselben strengen Recht wie der Neustart.
 */
botRoutes.post(
  '/relink',
  requireAuth(),
  requirePermission('bot.control'),
  controlLimiter,
  async (req, res) => {
    await audit('api.bot.relink', '', '', `api:${req.auth.user.username}`, `req=${req.id}`);
    try {
      await forceRelink();
    } catch (err) {
      throw new ApiError('BOT_NOT_READY', err?.message || 'Zuruecksetzen derzeit nicht moeglich.');
    }
    res.status(202).json({ accepted: true, action: 'relink', requestId: req.id });
  }
);
