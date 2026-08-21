// Authentifizierung beantwortet "wer bist du", das hier "darfst du das".
//
// Jede geschuetzte Route nennt ihr Recht ausdruecklich. Es gibt bewusst keine
// Voreinstellung "eingeloggt reicht": ein neuer Endpunkt ohne Rechteangabe
// soll auffallen, nicht stillschweigend fuer alle offen sein.

import { ApiError } from '../errors.js';

export function requirePermission(permission) {
  return (req, _res, next) => {
    if (!req.auth) {
      return next(new ApiError('UNAUTHENTICATED', 'Anmeldung erforderlich.'));
    }
    if (!req.auth.permissions.includes(permission)) {
      // Der fehlende Rechtename darf in der Antwort stehen: er verraet nichts
      // ueber fremde Daten und hilft beim Einrichten einer Rolle.
      return next(new ApiError('FORBIDDEN', `Dafuer fehlt die Berechtigung "${permission}".`));
    }
    next();
  };
}
