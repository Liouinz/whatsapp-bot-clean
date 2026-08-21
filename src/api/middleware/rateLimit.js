// Rate-Limits nach Bereich, nicht pauschal.
//
// Ein einheitliches Limit waere entweder fuer die Anmeldung zu lasch oder fuer
// die Statusabfrage zu streng — die App fragt den Status im Sekundentakt ab,
// meldet sich aber selten an.
//
// Gezaehlt wird nach angemeldetem Nutzer, sonst nach IP-Praefix. Ohne die
// Nutzer-Kennung teilten sich alle Geraete hinter einem Mobilfunk-NAT ein
// Kontingent; ohne die IPv6-Normalisierung waere das Limit fuer jeden mit
// einem eigenen Praefix wirkungslos.

import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { ApiError } from '../errors.js';

const keyByUserOrIp = (req) =>
  req.auth?.user?.id
    ? `u:${req.auth.user.id}`
    : `i:${ipKeyGenerator(req.ip || req.socket?.remoteAddress || '?')}`;

function make({ windowMs, limit }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: keyByUserOrIp,
    handler: (_req, _res, next) =>
      next(new ApiError('RATE_LIMITED', 'Zu viele Anfragen — bitte kurz warten.')),
  });
}

/** Anmeldung und Token-Erneuerung: streng, das ist die Bruteforce-Flaeche. */
export const authLimiter = make({ windowMs: 15 * 60_000, limit: 10 });

/** Lesende Endpunkte: grosszuegig genug fuer eine Status-Ansicht, die pollt. */
export const readLimiter = make({ windowMs: 60_000, limit: 120 });

/** Suchen mit Datenbankarbeit: enger als reines Lesen. */
export const searchLimiter = make({ windowMs: 60_000, limit: 30 });

/** Bot-Steuerung: sehr streng. Ein Neustart ist nichts, was man oft braucht. */
export const controlLimiter = make({ windowMs: 10 * 60_000, limit: 5 });

/**
 * Verwaltung der API-Zugaenge.
 *
 * Bewusst ein eigener Topf und nicht der von controlLimiter: das Anlegen von
 * Zugaengen und das Neustarten des Bots sind verschiedene Risiken und duerfen
 * sich kein Kontingent teilen. Vorher verbrauchte das Anlegen dreier Nutzer
 * das Kontingent so weit, dass ein anschliessender Neustart faelschlich mit
 * 429 statt mit der eigentlichen Antwort quittiert wurde.
 */
export const adminLimiter = make({ windowMs: 10 * 60_000, limit: 20 });
