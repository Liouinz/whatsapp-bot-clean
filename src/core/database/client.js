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
  try {
    return await db.execute({ sql, args });
  } catch (err) {
    await new Promise((r) => setTimeout(r, 500));
    return db.execute({ sql, args });
  }
}

export async function dbRows(sql, args = []) {
  try {
    const res = await dbRun(sql, args);
    return res.rows;
  } catch {
    return [];
  }
}
