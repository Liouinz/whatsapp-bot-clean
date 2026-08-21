import { apiRouter } from '../router.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { readLimiter } from '../middleware/rateLimit.js';
import { healthReport, systemReport } from '../services/health.js';
import { BOT_VERSION, API_VERSION } from '../version.js';

export const systemRoutes = apiRouter();

/**
 * Health — **oeffentlich und ohne Anmeldung**, weil Render und andere
 * Ueberwachung genau das brauchen. Deshalb enthaelt die Antwort bewusst keine
 * Zahlen: nur der Zustand je Abhaengigkeit, nichts ueber Groessen, Nutzer
 * oder Konfiguration.
 *
 * 200 wenn bereit, 503 wenn nicht — damit ein Monitor nichts auswerten muss.
 */
systemRoutes.get('/health', async (_req, res) => {
  const report = await healthReport();
  // 503 ist hier eine Aussage ueber den Bot, kein Serverfehler — das
  // Zugriffs-Log soll daraus keinen Vorfall machen.
  res.locals.expectedStatus = true;
  const slim = {
    status: report.status,
    live: report.live,
    ready: report.ready,
    checks: Object.fromEntries(
      Object.entries(report.checks).map(([k, v]) => [k, { status: v.status }])
    ),
  };
  res.status(report.ready ? 200 : 503).json(slim);
});

/** Version der API und des Bots. Oeffentlich — verraet nichts Schuetzenswertes. */
systemRoutes.get('/version', (_req, res) => {
  res.json({ version: BOT_VERSION, api: API_VERSION });
});

/** Die ausfuehrliche Health-Ansicht, inklusive Latenzen und KI-Kontingent. */
systemRoutes.get('/health/details', requireAuth(), requirePermission('system.read'), readLimiter, async (_req, res) => {
  res.json(await healthReport());
});

/** Ressourcen des Prozesses. Alles gemessen, nichts geschaetzt. */
systemRoutes.get('/system', requireAuth(), requirePermission('system.read'), readLimiter, (_req, res) => {
  res.json(systemReport());
});
