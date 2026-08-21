import { apiRouter } from '../router.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { readLimiter } from '../middleware/rateLimit.js';
import { config, BOT_NAME } from '../../config.js';
import { getGlobalFlag } from '../../global.js';
import { registry, isCommandEnabled } from '../../router.js';
import { BOT_VERSION } from '../version.js';

export const settingsRoutes = apiRouter();

/**
 * Einstellungen — bewusst **zusammengestellt**, nicht das config-Objekt
 * durchgereicht.
 *
 * In `config` stehen DATABASE_KEY, ACCESS_SECRET und GEMINI_API_KEY. Ein
 * `res.json(config)` waere die kuerzeste denkbare Art, alle Zugangsdaten des
 * Bots an ein Mobilgeraet auszuliefern. Deshalb ist hier jedes Feld einzeln
 * aufgefuehrt, und die Liste enthaelt ausschliesslich Werte, deren
 * Veroeffentlichung geprueft ist.
 */
settingsRoutes.get('/', requireAuth(), requirePermission('settings.read'), readLimiter, (_req, res) => {
  res.json({
    bot: {
      name: BOT_NAME,
      version: BOT_VERSION,
      prefix: '!',
      timezone: config.timezone,
    },
    features: {
      xpEnabled: getGlobalFlag('system_xp'),
      maintenance: getGlobalFlag('maintenance'),
      // Ob eine KI eingerichtet ist — nicht, welcher Schluessel.
      aiConfigured: !!config.geminiApiKey,
    },
    moderation: {
      warnExpiryDays: config.moderation.warnExpiryDays,
      warnLimitMute: config.moderation.warnLimitMute,
      warnLimitKick: config.moderation.warnLimitKick,
      muteMinutesDefault: config.moderation.muteMinutesDefault,
      antiRaid: config.moderation.antiRaid,
    },
    limits: {
      aiDailyLimit: config.ai.dailyLimit,
      slowmodeMaxSeconds: config.slowmode.maxSeconds,
      pollMaxOptions: config.polls.maxOptions,
    },
  });
});

/** Befehlsuebersicht samt Schaltzustand — die App zeigt sie in den Einstellungen. */
settingsRoutes.get('/commands', requireAuth(), requirePermission('settings.read'), readLimiter, (_req, res) => {
  res.json({
    commands: registry
      .filter((c) => !c.hidden)
      .map((c) => ({
        name: c.name,
        group: c.group,
        description: c.desc,
        usage: c.usage,
        adminOnly: !!c.adminOnly,
        enabled: isCommandEnabled(c.name),
      })),
  });
});
