// Control API v1.
//
// Haengt im selben Express-Prozess wie das Panel — bewusst kein zweiter
// Server, kein zweiter Port, kein eigener Worker. Auf dem Render-Free-Tier
// waere jeder zusaetzliche Prozess Speicher, den der Bot selbst braucht.
//
// Vom Panel ist die API trotzdem sauber getrennt: eigene Middleware-Kette,
// eigene Authentifizierung (Bearer statt Cookie), eigenes Fehlerformat.
// Die gemeinsame Abfrage-Logik liegt in src/services/query.js, damit es keine
// zweite, langsam auseinanderlaufende Kopie gibt.

import express from 'express';
import { apiRouter } from './router.js';
import { errorHandler, ApiError } from './errors.js';
import { requestId } from './middleware/requestId.js';
import { accessLog } from './middleware/logging.js';
import { logger, logError } from '../logger.js';

import { authRoutes } from './routes/auth.js';
import { systemRoutes } from './routes/system.js';
import { botRoutes } from './routes/bot.js';
import { userRoutes } from './routes/users.js';
import { groupRoutes } from './routes/groups.js';
import { logRoutes } from './routes/logs.js';
import { settingsRoutes } from './routes/settings.js';

export const API_BASE = '/api/v1';

/**
 * Baut den v1-Router.
 *
 * **Reihenfolge zaehlt.** Der Router muss in dashboard.js VOR
 * `app.use('/api', requireAuth, api)` haengen — sonst faengt die
 * Cookie-Authentifizierung des Panels die v1-Aufrufe ab und die App bekaeme
 * einen Redirect auf /login statt einer JSON-Antwort.
 */
export function createApiV1() {
  const api = apiRouter();

  // Jede Anfrage bekommt eine ID, bevor irgendetwas anderes passiert — auch
  // ein Fehler in der Authentifizierung soll noch nachverfolgbar sein.
  api.use(requestId());

  // Eigener JSON-Parser statt des App-weiten: nur so landen ein kaputter Body
  // und ein zu grosser Body in DIESEM Fehlerhandler und werden zu 400/413 im
  // API-Format, statt im Panel-Handler zu einem 500 zu werden.
  // 128 kB reichen fuer jede Anfrage, die diese API kennt.
  api.use(express.json({ limit: '128kb' }));
  api.use(accessLog(logger));

  // Antworten der API duerfen nie zwischengespeichert werden: ein Proxy, der
  // eine Statusantwort festhaelt, zeigt der App einen Bot als online, der
  // laengst weg ist.
  api.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  api.use('/auth', authRoutes);
  api.use('/bot', botRoutes);
  api.use('/users', userRoutes);
  api.use('/groups', groupRoutes);
  api.use('/logs', logRoutes);
  api.use('/settings', settingsRoutes);
  // Zuletzt, weil hier auch die Wurzelpfade /health und /version liegen.
  api.use('/', systemRoutes);

  api.use((req, _res, next) => {
    next(new ApiError('NOT_FOUND', `Unbekannter Endpunkt: ${req.method} ${req.path}`));
  });

  api.use(errorHandler(logError));
  return api;
}
