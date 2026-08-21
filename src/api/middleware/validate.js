// Minimaler Schema-Validierer.
//
// Bewusst kein zod/joi/ajv: das Projekt hat sieben Laufzeit-Dependencies, und
// die API braucht genau vier Typen. Eine zusaetzliche Abhaengigkeit mit
// eigenem Angriffs- und Wartungsprofil waere hier schlechter Tausch.
//
// Grundregel: was nicht im Schema steht, kommt nicht durch. Unbekannte Felder
// werden **verworfen**, nicht durchgereicht — das ist der Schutz gegen Mass
// Assignment.

import { ApiError } from '../errors.js';

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function checkField(name, raw, spec, errors) {
  const missing = raw === undefined || raw === null || raw === '';
  if (missing) {
    if (spec.required) errors.push({ field: name, problem: 'fehlt' });
    return spec.default;
  }

  switch (spec.type) {
    case 'string': {
      // Nur echte Strings. Ein Array oder Objekt hier durchzulassen und mit
      // String() umzuwandeln waere genau die Typ-Verwirrung, mit der sich
      // anderswo schon eine Sicherheitsabfrage umgehen liess.
      if (typeof raw !== 'string') {
        errors.push({ field: name, problem: 'muss eine Zeichenkette sein' });
        return undefined;
      }
      const value = spec.trim === false ? raw : raw.trim();
      if (spec.min !== undefined && value.length < spec.min) {
        errors.push({ field: name, problem: `mindestens ${spec.min} Zeichen` });
        return undefined;
      }
      if (spec.max !== undefined && value.length > spec.max) {
        errors.push({ field: name, problem: `hoechstens ${spec.max} Zeichen` });
        return undefined;
      }
      if (spec.pattern && !spec.pattern.test(value)) {
        errors.push({ field: name, problem: 'hat ein unzulaessiges Format' });
        return undefined;
      }
      if (spec.enum && !spec.enum.includes(value)) {
        errors.push({ field: name, problem: `muss einer von: ${spec.enum.join(', ')}` });
        return undefined;
      }
      return value;
    }

    case 'int': {
      // Query-Parameter sind immer Strings — Zahlen als String sind also
      // zulaessig, alles andere nicht.
      if (typeof raw !== 'number' && typeof raw !== 'string') {
        errors.push({ field: name, problem: 'muss eine Zahl sein' });
        return undefined;
      }
      const n = Number(raw);
      if (!Number.isInteger(n)) {
        errors.push({ field: name, problem: 'muss eine ganze Zahl sein' });
        return undefined;
      }
      if (spec.min !== undefined && n < spec.min) {
        errors.push({ field: name, problem: `mindestens ${spec.min}` });
        return undefined;
      }
      // Obergrenzen werden gedeckelt statt abgelehnt: eine App, die limit=1000
      // schickt, soll 100 bekommen und nicht scheitern.
      if (spec.max !== undefined && n > spec.max) return spec.clamp === false ? undefined : spec.max;
      return n;
    }

    case 'bool': {
      if (typeof raw === 'boolean') return raw;
      if (raw === 'true') return true;
      if (raw === 'false') return false;
      errors.push({ field: name, problem: 'muss true oder false sein' });
      return undefined;
    }

    default:
      return undefined;
  }
}

/**
 * Baut eine Middleware, die `req[source]` gegen `schema` prueft.
 * Das Ergebnis liegt danach in `req.valid` — die Handler lesen ausschliesslich
 * von dort, nie direkt aus req.body/req.query.
 */
export function validate(schema, source = 'body') {
  const fields = Object.entries(schema);
  return (req, _res, next) => {
    const raw = req[source];
    if (source === 'body' && raw !== undefined && !isPlainObject(raw)) {
      return next(new ApiError('BAD_REQUEST', 'Der Anfragekoerper muss ein JSON-Objekt sein.'));
    }
    const input = isPlainObject(raw) ? raw : {};
    const errors = [];
    const out = {};
    for (const [name, spec] of fields) {
      const value = checkField(name, input[name], spec, errors);
      if (value !== undefined) out[name] = value;
    }
    if (errors.length) {
      return next(new ApiError('VALIDATION_FAILED', 'Die Anfrage ist unvollstaendig oder fehlerhaft.', errors));
    }
    req.valid = { ...(req.valid || {}), ...out };
    next();
  };
}
