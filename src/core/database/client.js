import { createClient } from '@libsql/client';
import { config } from '../../config.js';
import { logger } from '../../logger.js';
import { assertNotAuthWrite } from './guard.js';

let client = null;

export function getDb() {
  if (!client) {
    client = createClient({
      url: config.databaseUrl.trim(),
      authToken: config.databaseKey.trim(),
    });
  }
  return client;
}

export async function dbRun(sql, args = []) {
  assertNotAuthWrite(sql);
  const db = getDb();
  let tries = 0;
  while (tries < 3) {
    try {
      return await db.execute({ sql, args });
    } catch (err) {
      tries++;
      const retryable = /locked|busy|timeout|network|ECONNRESET/i.test(String(err));
      if (retryable && tries < 3) {
        await new Promise((r) => setTimeout(r, 250 * Math.pow(2, tries)));
      } else {
        throw err;
      }
    }
  }
}

// Sammelschreiben. Wichtig: `getDb().batch()` direkt aufzurufen umgeht den
// Guard — die Zusage "auth_creds und auth_keys sind unantastbar" gilt sonst
// nur fuer dbRun(). Deshalb geht jeder Stapelschreiber ueber diese Funktion.
export async function dbBatch(stmts) {
  const list = Array.isArray(stmts) ? stmts : [];
  if (!list.length) return [];
  for (const s of list) assertNotAuthWrite(s?.sql || '');
  return getDb().batch(list, 'write');
}

export async function dbRows(sql, args = []) {
  try {
    const res = await dbRun(sql, args);
    return res.rows || [];
  } catch (err) {
    // Ueber den logger statt console.error: nur so landet der Fehler im
    // Ring-Puffer und damit in der Log-Ansicht des Panels. Zuvor degradierte
    // ein DB-Ausfall unsichtbar, weil dbRows() ihn zu einem leeren Ergebnis
    // glaettete und die Meldung nirgends auftauchte.
    logger.error(`dbRows fehlgeschlagen: ${err.message} — SQL: ${sql}`, 'DB');
    return [];
  }
}

export async function dbRowsStrict(sql, args = []) {
  const res = await dbRun(sql, args);
  return res.rows || [];
}
