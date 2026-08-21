import express from 'express';

/**
 * Ein Express-Router, dessen Handler ihre Fehler nicht verlieren koennen.
 *
 * Express 4 leitet die abgelehnte Promise eines `async`-Handlers **nicht** an
 * die Error-Middleware — sie wird zur `unhandledRejection`. Genau daran ist in
 * Phase 1 der ganze Prozess gestorben, weil an diesem Ereignis ein
 * Herunterfahren hing.
 *
 * Deshalb haengt hier jeder registrierte Handler automatisch sein
 * `.catch(next)` an. Bewusst am Router und nicht an den einzelnen Routen: so
 * ist auch der naechste Endpunkt geschuetzt, ohne dass jemand daran denken
 * muss. Arity 4 bleibt unangetastet — das ist die Signatur einer
 * Error-Middleware, die kein Ergebnis liefert.
 */
const wrap = (h) =>
  typeof h === 'function' && h.length < 4
    ? function wrapped(req, res, next) {
        return Promise.resolve(h(req, res, next)).catch(next);
      }
    : h;

export function apiRouter() {
  const router = express.Router();
  // Bewusst OHNE `use`: ein Sub-Router ist selbst eine Funktion mit Arity 3 und
  // wuerde sonst in die Closure oben gewickelt. Das laeuft zwar, verwirft aber
  // seine Struktur (`.stack` und Co.) — der Router waere danach von aussen
  // nicht mehr inspizierbar, und alles, was mehr als nur aufrufbar sein muss,
  // ginge kaputt. Sub-Router reichen ihre Fehler ohnehin selbst weiter, und
  // die per `use` eingehaengte Middleware ist durchgehend synchron.
  for (const method of ['get', 'post', 'put', 'patch', 'delete', 'all']) {
    const original = router[method];
    router[method] = (...args) => original.apply(router, args.map(wrap));
  }
  return router;
}
