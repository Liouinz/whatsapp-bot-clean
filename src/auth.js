// Turso-Auth-State für Baileys — ersetzt useMultiFileAuthState (TABU auf Render).
// Creds liegen in auth_creds, Signal-Keys in auth_keys. Serialisiert via BufferJSON.

import { initAuthCreds, BufferJSON, proto } from '@whiskeysockets/baileys';
import { getDb } from './db.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Sammelfenster fuer Signal-Key-Writes. Bewusst kurz: seit keys.set() auf den
// tatsaechlichen Write wartet (sonst gingen Keys bei einem harten Kill
// verloren), liegt dieses Fenster als Latenz im Entschluesselungspfad JEDER
// Nachricht. 150 ms buendeln den Schreib-Burst eines Nachrichten-Decrypts
// weiterhin zu einem einzigen Batch, kosten aber nicht mehr die vollen 800 ms.
const FLUSH_DELAY_MS = 150;

async function withRetry(fn, tries = 4) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      await sleep(250 * (i + 1));
    }
  }
  throw lastErr;
}

const activeFlushers = new Set();

// Alle auth_creds-Schreibvorgaenge laufen durch EINE modulweite Promise-Kette.
// Baileys' sock.ev.process() verwirft die Promise seines Handlers
// (event-buffer.js: `const listener = (map) => { handler(map); }`), sodass ein
// spaeter creds.update eines bereits geschlossenen Sockets nebenlaeufig
// weiterlaufen kann. Ohne Serialisierung konnte dessen INSERT OR REPLACE die
// frischen Credentials der neuen Instanz ueberschreiben — beide schreiben
// dieselbe Zeile id='main' ohne Versionspruefung.
let credsWriteChain = Promise.resolve();

function serializeCredsWrite(fn) {
  const next = credsWriteChain.then(fn, fn);
  // Kette darf nicht durch einen Fehler abreissen.
  credsWriteChain = next.catch(() => {});
  return next;
}

export async function flushAuth() {
  for (const flusher of activeFlushers) {
    await flusher().catch((err) => console.error('⚠️ Auth Flush Error:', err));
  }
}

export async function clearAuthSession(session = 'main') {
  const db = getDb();
  const exec = (arg) => withRetry(() => db.execute(arg));
  await exec({ sql: 'DELETE FROM auth_creds WHERE id = ?', args: [session] });
  await exec({ sql: 'DELETE FROM auth_keys WHERE id LIKE ?', args: [`${session}:%`] });
}

export async function useTursoAuthState(session = 'main') {
  const db = getDb();
  const exec = (arg) => withRetry(() => db.execute(arg));
  const batch = (stmts) => withRetry(() => db.batch(stmts, 'write'));

  const keyCache = new Map();
  const pendingWrites = new Map();
  let writeTimeout = null;
  let flushing = false;
  // Sobald die Instanz stillgelegt ist, darf sie NICHTS mehr schreiben —
  // weder Credentials noch Signal-Keys. Ohne dieses Flag konnte ein spaetes
  // Event einer alten Socket-Generation die neue Session ueberschreiben.
  let closed = false;

  const flushPendingWrites = async () => {
    if (writeTimeout) {
      clearTimeout(writeTimeout);
      writeTimeout = null;
    }
    if (closed || pendingWrites.size === 0 || flushing) return;
    flushing = true;

    const currentWrites = new Map(pendingWrites);
    const stmts = [];

    for (const [keyId, value] of currentWrites.entries()) {
      stmts.push(
        value
          ? {
              sql: 'INSERT OR REPLACE INTO auth_keys (id, data) VALUES (?, ?)',
              args: [`${session}:${keyId}`, JSON.stringify(value, BufferJSON.replacer)],
            }
          : { sql: 'DELETE FROM auth_keys WHERE id = ?', args: [`${session}:${keyId}`] }
      );
    }

    try {
      if (stmts.length) {
        await batch(stmts);
      }
      for (const [keyId, val] of currentWrites.entries()) {
        if (pendingWrites.get(keyId) === val) {
          pendingWrites.delete(keyId);
        }
      }
    } catch (err) {
      console.error('⚠️ Fehler beim Turso-Batch-Write, Retry beim nächsten Flush:', err);
    } finally {
      flushing = false;
    }
  };

  activeFlushers.add(flushPendingWrites);

  // Sammelt Writes kurz und liefert eine Promise, die erst nach dem
  // tatsaechlichen DB-Schreibvorgang aufloest. keys.set() wartet darauf —
  // vorher kehrte es sofort zurueck, obwohl noch nichts persistiert war, und
  // ein harter Kill innerhalb des Fensters verlor Signal-Keys (Bad MAC).
  let flushWaiters = [];
  const scheduleFlush = () => {
    if (closed) return Promise.resolve();
    const waiter = new Promise((resolve) => flushWaiters.push(resolve));
    if (!writeTimeout) {
      writeTimeout = setTimeout(async () => {
        writeTimeout = null;
        const waiters = flushWaiters;
        flushWaiters = [];
        try {
          await flushPendingWrites();
        } finally {
          for (const resolve of waiters) resolve();
        }
      }, FLUSH_DELAY_MS);
    }
    return waiter;
  };

  const readKeys = async (fullIds) => {
    const out = new Map();
    for (let i = 0; i < fullIds.length; i += 100) {
      const chunk = fullIds.slice(i, i + 100);
      const res = await exec({
        sql: `SELECT id, data FROM auth_keys WHERE id IN (${chunk.map(() => '?').join(', ')})`,
        args: chunk.map((id) => `${session}:${id}`),
      });
      for (const row of res.rows || []) {
        try {
          out.set(String(row.id).slice(session.length + 1), JSON.parse(row.data, BufferJSON.reviver));
        } catch (err) {
          console.error(`⚠️ Key Parsing Error für Key ${row.id}:`, err);
        }
      }
    }
    return out;
  };

  const readCreds = async () => {
    const res = await exec({ sql: 'SELECT data FROM auth_creds WHERE id = ?', args: [session] });
    if (!res.rows || !res.rows.length) return null;
    try {
      return JSON.parse(res.rows[0].data, BufferJSON.reviver);
    } catch (err) {
      console.error('⚠️ Auth Creds Parsing Error:', err);
      return null;
    }
  };

  const creds = (await readCreds()) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          const missingIds = [];

          for (const id of ids) {
            const keyId = `${type}-${id}`;
            if (keyCache.has(keyId)) {
              let value = keyCache.get(keyId);
              if (type === 'app-state-sync-key' && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              data[id] = value;
            } else {
              missingIds.push(id);
            }
          }

          if (missingIds.length > 0) {
            const found = await readKeys(missingIds.map((id) => `${type}-${id}`));
            for (const id of missingIds) {
              const keyId = `${type}-${id}`;
              let value = found.get(keyId) ?? null;

              if (value) {
                keyCache.set(keyId, value);
                if (keyCache.size > 5000) keyCache.delete(keyCache.keys().next().value);
              }

              if (type === 'app-state-sync-key' && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              data[id] = value;
            }
          }
          return data;
        },
        set: async (data) => {
          for (const type of Object.keys(data)) {
            for (const id of Object.keys(data[type])) {
              const keyId = `${type}-${id}`;
              const value = data[type][id];

              if (value) {
                keyCache.set(keyId, value);
                if (keyCache.size > 5000) keyCache.delete(keyCache.keys().next().value);
              } else {
                keyCache.delete(keyId);
              }

              pendingWrites.set(keyId, value);
            }
          }

          // Auf den tatsaechlichen DB-Write warten. Baileys' SignalKeyStore-
          // Vertrag ist, dass die Daten nach dem Aufloesen persistent sind;
          // vorher kehrte set() sofort zurueck und ein Kill innerhalb von
          // FLUSH_DELAY_MS verlor den Key stillschweigend.
          await scheduleFlush();
        },
      },
    },

    saveCreds: async () => {
      // Doppelt abgesichert: die stillgelegte Instanz schreibt gar nicht mehr,
      // und alle Writes laufen serialisiert, damit die Reihenfolge zwischen
      // Socket-Generationen feststeht.
      if (closed) return;
      await serializeCredsWrite(async () => {
        if (closed) return;
        await exec({
          sql: 'INSERT OR REPLACE INTO auth_creds (id, data) VALUES (?, ?)',
          args: [session, JSON.stringify(creds, BufferJSON.replacer)],
        });
      });
    },

    flush: flushPendingWrites,

    // Gibt diese Auth-State-Instanz frei, ohne die Session in der DB zu loeschen.
    // Muss bei jedem Reconnect fuer die VORHERIGE Instanz aufgerufen werden:
    // useTursoAuthState() legt pro Aufruf einen neuen Flusher in activeFlushers
    // an. Ohne Freigabe waechst das Set mit jedem Reconnect, und ein alter,
    // noch anhaengender Flusher kann nach einem Relink veraltete Keys in die
    // frisch aufgebaute Session zurueckschreiben.
    dispose: async ({ flush = true } = {}) => {
      // Reihenfolge ist wichtig: erst den ausstehenden Flush erledigen, DANN
      // stilllegen — sonst wuerde der closed-Guard den letzten legitimen
      // Schreibvorgang dieser Instanz verschlucken.
      if (flush) {
        await flushPendingWrites().catch((err) =>
          console.error('⚠️ Auth Dispose Flush Error:', err)
        );
      }
      closed = true;
      for (const resolve of flushWaiters) resolve();
      flushWaiters = [];
      if (writeTimeout) {
        clearTimeout(writeTimeout);
        writeTimeout = null;
      }
      activeFlushers.delete(flushPendingWrites);
      keyCache.clear();
      pendingWrites.clear();
    },

    clearSession: async () => {
      closed = true;
      for (const resolve of flushWaiters) resolve();
      flushWaiters = [];
      if (writeTimeout) {
        clearTimeout(writeTimeout);
        writeTimeout = null;
      }
      activeFlushers.delete(flushPendingWrites);
      keyCache.clear();
      pendingWrites.clear();
      await clearAuthSession(session);
    },
  };
}
