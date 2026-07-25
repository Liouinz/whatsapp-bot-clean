// Turso-Auth-State für Baileys — ersetzt useMultiFileAuthState (TABU auf Render).
// Creds liegen in auth_creds, Signal-Keys in auth_keys. Serialisiert via BufferJSON.

import { initAuthCreds, BufferJSON, proto } from '@whiskeysockets/baileys';
import { getDb } from './db.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FLUSH_DELAY_MS = 800;

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

export async function useTursoAuthState(session = 'main') {
  const db = getDb();
  const exec = (arg) => withRetry(() => db.execute(arg));
  const batch = (stmts) => withRetry(() => db.batch(stmts, 'write'));

  const keyCache = new Map();
  const pendingWrites = new Map();
  let writeTimeout = null;
  let flushing = false;

  const flushPendingWrites = async () => {
    if (writeTimeout) {
      clearTimeout(writeTimeout);
      writeTimeout = null;
    }
    if (pendingWrites.size === 0 || flushing) return;
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
      for (const keyId of currentWrites.keys()) {
        if (pendingWrites.get(keyId) === currentWrites.get(keyId)) {
          pendingWrites.delete(keyId);
        }
      }
    } catch (err) {
      console.error('⚠️ Fehler beim Turso-Batch-Write, Retry beim nächsten Flush:', err);
    } finally {
      flushing = false;
    }
  };

  const scheduleFlush = () => {
    if (!writeTimeout) {
      writeTimeout = setTimeout(() => {
        writeTimeout = null;
        flushPendingWrites();
      }, FLUSH_DELAY_MS);
    }
  };

  const flushOnExit = async () => {
    await flushPendingWrites();
  };
  process.on('SIGTERM', async () => {
    await flushOnExit();
    process.exit(0);
  });
  process.on('SIGINT', async () => {
    await flushOnExit();
    process.exit(0);
  });
  process.on('beforeExit', flushOnExit);

  const readKeys = async (fullIds) => {
    const out = new Map();
    for (let i = 0; i < fullIds.length; i += 100) {
      const chunk = fullIds.slice(i, i + 100);
      const res = await exec({
        sql: `SELECT id, data FROM auth_keys WHERE id IN (${chunk.map(() => '?').join(', ')})`,
        args: chunk.map((id) => `${session}:${id}`),
      });
      for (const row of res.rows) {
        out.set(String(row.id).slice(session.length + 1), JSON.parse(row.data, BufferJSON.reviver));
      }
    }
    return out;
  };

  const readCreds = async () => {
    const res = await exec({ sql: 'SELECT data FROM auth_creds WHERE id = ?', args: [session] });
    return res.rows.length ? JSON.parse(res.rows[0].data, BufferJSON.reviver) : null;
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

              if (value) keyCache.set(keyId, value);

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
              } else {
                keyCache.delete(keyId);
              }

              pendingWrites.set(keyId, value);
            }
          }

          scheduleFlush();
        },
      },
    },

    saveCreds: async () => {
      await exec({
        sql: 'INSERT OR REPLACE INTO auth_creds (id, data) VALUES (?, ?)',
        args: [session, JSON.stringify(creds, BufferJSON.replacer)],
      });
    },

    flush: flushPendingWrites,

    clearSession: async () => {
      keyCache.clear();
      pendingWrites.clear();
      if (writeTimeout) {
        clearTimeout(writeTimeout);
        writeTimeout = null;
      }

      await exec({ sql: 'DELETE FROM auth_creds WHERE id = ?', args: [session] });
      await exec({ sql: 'DELETE FROM auth_keys WHERE id LIKE ?', args: [`${session}:%`] });
    },
  };
}
