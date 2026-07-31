import { createClient } from '@libsql/client';
import { config } from '../../config.js';
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

export async function dbRows(sql, args = []) {
  try {
    const res = await dbRun(sql, args);
    return res.rows || [];
  } catch (err) {
    console.error(`❌ [DB ERROR] dbRows Query fehlgeschlagen: ${err.message}`, { sql, args });
    return [];
  }
}

export async function dbRowsStrict(sql, args = []) {
  const res = await dbRun(sql, args);
  return res.rows || [];
}
