import { dbBatch, dbRowsStrict } from './client.js';
import { DATA_TABLES, LEGACY_TABLES, PROTECTED_TABLES_SET } from './schema.js';

/**
 * Leert alle Datentabellen. `auth_creds`/`auth_keys` sind ausgenommen — hier
 * durch den Filter, und zusaetzlich durch den Guard in dbBatch().
 *
 * @returns {Promise<number>} Zahl der geleerten Tabellen. Der Aufrufer
 * protokolliert sie; vorher gab es kein `return` und im Audit-Log stand
 * "undefined Tabellen geleert".
 */
export async function wipeAllData() {
  const wanted = [...DATA_TABLES, ...LEGACY_TABLES].filter((t) => !PROTECTED_TABLES_SET.has(t));

  // Gegen sqlite_master abgleichen, statt blind zu loeschen. Zwei Gruende:
  // Legacy-Tabellen gibt es nur in Datenbanken, die alt genug sind, und ein
  // DELETE auf eine fehlende Tabelle wuerde den gesamten Batch scheitern
  // lassen. dbRowsStrict statt dbRows: faellt die Abfrage aus, soll der Wipe
  // mit einem Fehler abbrechen und nicht still nichts tun.
  const rows = await dbRowsStrict("SELECT name FROM sqlite_master WHERE type = 'table'", []);
  const existing = new Set(rows.map((r) => String(r.name)));
  const tables = wanted.filter((t) => existing.has(t));

  // dbBatch statt getDb().batch(): nur dieser Weg laeuft durch den Guard.
  await dbBatch(tables.map((t) => ({ sql: `DELETE FROM ${t}`, args: [] })));
  return tables.length;
}
