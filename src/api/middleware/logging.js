// Strukturiertes Zugriffs-Log.
//
// Was hineingehoert: wann, welche Anfrage, welcher Ausgang, wie lange, wer.
// Was niemals hineingehoert: Passwoerter, Tokens, Cookies, Authorization-Header
// oder Anfragekoerper. Deshalb wird hier ausschliesslich aus einer festen
// Feldliste geschrieben und nie ein ganzes Objekt durchgereicht.
//
// **Zur Stufe:** erfolgreiche Anfragen laufen auf `debug` und sind damit
// standardmaessig still. Das ist kein Versteckenspielen, sondern noetig — der
// Ring-Puffer des Panels fasst 500 Zeilen, und eine App, die im Sekundentakt
// den Status abfragt, haette ihn in wenigen Minuten mit HTTP-Zeilen gefuellt
// und jedes echte Ereignis herausgedraengt. Fehler bleiben sichtbar: 4xx als
// Warnung, 5xx als Fehler. Wer alles sehen will, setzt DEBUG=1.

/**
 * Der Pfad fuer das Log.
 *
 * Hat eine Route gegriffen, wird ihre **Vorlage** geloggt (`/users/:jid`), nicht
 * der konkrete Wert — so landen weder Telefonnummern noch Suchbegriffe im Log.
 *
 * Hat keine gegriffen (404), gaebe es nur den frei waehlbaren Pfad. Der wird
 * entschaerft: Steuerzeichen raus, Laenge gedeckelt. Ohne das kann ein Aufruf
 * mit einem NUL-Byte oder einem Zeilenumbruch im Pfad die Log-Ausgabe
 * zerschneiden und gefaelschte Zeilen unterschieben — beim Schreiben dieser
 * Middleware ist genau das passiert und hat den Testlauf abgebrochen.
 */
function safeRoute(req) {
  if (req.route?.path) return req.baseUrl + req.route.path;
  const raw = String(req.path || '');
  const cleaned = raw.replace(/[^\x20-\x7E]/g, '?').slice(0, 80);
  return `${req.baseUrl}${cleaned}`;
}

/**
 * @param {{debug:Function, warn:Function, error:Function}} logger
 */
export function accessLog(logger) {
  return (req, res, next) => {
    const startedAt = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
      const who = req.auth?.user ? `${req.auth.user.username}/${req.auth.user.role}` : 'anon';
      const line = `${req.method} ${safeRoute(req)} ${res.statusCode} ${ms.toFixed(1)}ms ${who} ${req.id}`;

      // `res.locals.expectedStatus` markiert Antworten, deren 4xx/5xx zum
      // Entwurf gehoert — /health meldet 503, solange der Bot nicht bereit ist.
      // Das ist die Aussage des Endpunkts, kein Stoerfall.
      if (res.locals?.expectedStatus) return logger.debug(line, 'api');

      // Echte Serverfehler werden bereits von der Error-Middleware mit dem
      // Fehlerobjekt protokolliert. Hier nur `warn`, sonst stuende jeder
      // Vorfall zweimal im Ring-Puffer — und `logger.error` stoesst zusaetzlich
      // die KI-Fehlerzusammenfassung an, die dann fuer jede 503-Antwort eines
      // Health-Checks Kontingent verbrauchen wuerde.
      if (res.statusCode >= 400) logger.warn(line, 'api');
      else logger.debug(line, 'api');
    });
    next();
  };
}
