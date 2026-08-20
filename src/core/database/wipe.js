import { dbBatch } from './client.js';
import { DATA_TABLES, PROTECTED_TABLES_SET } from './schema.js';

/**
 * Leert alle Datentabellen. `auth_creds`/`auth_keys` sind ausgenommen — hier
 * durch den Filter, und zusaetzlich durch den Guard in dbBatch().
 *
 * @returns {Promise<number>} Zahl der geleerten Tabellen. Der Aufrufer
 * protokolliert sie; vorher gab es kein `return` und im Audit-Log stand
 * "undefined Tabellen geleert".
 */
export async function wipeAllData() {
  const tables = DATA_TABLES.filter((t) => !PROTECTED_TABLES_SET.has(t));
  // dbBatch statt getDb().batch(): nur dieser Weg laeuft durch den Guard.
  await dbBatch(tables.map((t) => ({ sql: `DELETE FROM ${t}`, args: [] })));
  return tables.length;
}
