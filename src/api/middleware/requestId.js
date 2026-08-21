import crypto from 'node:crypto';

/**
 * Vergibt jeder Anfrage eine eindeutige ID und gibt sie im Header zurueck.
 *
 * Der Zweck ist konkret: die App zeigt bei einem Fehler die requestId an, und
 * damit laesst sich im Server-Log genau dieser eine Vorgang wiederfinden —
 * ohne dass die Fehlerantwort selbst irgendetwas Internes verraten muesste.
 *
 * Eine vom Client mitgeschickte ID wird bewusst NICHT uebernommen: sonst
 * koennte jemand Log-Zeilen fremden Vorgaengen unterschieben.
 */
export function requestId() {
  return (req, res, next) => {
    req.id = `req_${crypto.randomBytes(9).toString('base64url')}`;
    res.setHeader('X-Request-Id', req.id);
    next();
  };
}
