import { getDb } from './client.js';
import { DATA_TABLES, PROTECTED_TABLES_SET } from './schema.js';

export async function wipeAllData() {
  const db = getDb();
  const tables = DATA_TABLES.filter((t) => !PROTECTED_TABLES_SET.has(t));
  await db.batch(tables.map((t) => ({ sql: `DELETE FROM ${t}`, args: [] })), 'write');
}
