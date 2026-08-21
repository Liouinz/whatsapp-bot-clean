// Zugaenge der Control API: Anlegen, Pruefen, Rollen.
//
// Passwoerter werden mit scrypt gehasht (in Node eingebaut, keine zusaetzliche
// Abhaengigkeit). Jeder Nutzer bekommt ein eigenes Salt; verglichen wird
// zeitkonstant.

import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { dbRun, dbRowsStrict } from '../../db.js';
import { config } from '../../config.js';

/**
 * Rollen. Bewusst nur drei: eine Rolle ohne eigene Rechte waere Dekoration.
 * `moderator` gibt es deshalb (noch) nicht — sobald die API schreibende
 * Moderationspfade bekommt, ist das die Stelle, an der er dazukommt.
 */
export const ROLES = ['viewer', 'admin', 'owner'];

const VIEWER = ['bot.read', 'users.read', 'groups.read', 'logs.read', 'settings.read', 'system.read'];

/** Rolle → Rechte. Least Privilege: jede Rolle bekommt genau das, was sie braucht. */
export const ROLE_PERMISSIONS = {
  viewer: VIEWER,
  admin: [...VIEWER, 'bot.control'],
  owner: [...VIEWER, 'bot.control', 'apiusers.manage'],
};

export function permissionsFor(role) {
  return ROLE_PERMISSIONS[role] || [];
}

const SCRYPT_KEYLEN = 64;

// **Asynchron, nicht scryptSync.** scrypt ist absichtlich rechenintensiv — rund
// 40 ms je Aufruf. Die synchrone Variante haelt dabei den EINEN Node-Thread an,
// und der gehoert nicht nur der API: Bot, Panel und WhatsApp-Socket teilen ihn
// sich. Gemessen mit scryptSync stieg die oeffentliche /health-Antwort unter 20
// gleichzeitigen Anmeldungen von 1,4 ms auf 456 ms im p95 — ein unangemeldeter
// Endpunkt konnte damit den kompletten Prozess ausbremsen, WhatsApp-Verarbeitung
// eingeschlossen. crypto.scrypt() rechnet im Threadpool und laesst die
// Event-Loop frei.
const scrypt = promisify(crypto.scrypt);

export async function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = (await scrypt(String(password), salt, SCRYPT_KEYLEN)).toString('hex');
  return { hash, salt };
}

export async function verifyPassword(password, hash, salt) {
  let candidate;
  try {
    candidate = await scrypt(String(password), String(salt), SCRYPT_KEYLEN);
  } catch {
    return false;
  }
  let expected;
  try {
    expected = Buffer.from(String(hash), 'hex');
  } catch {
    return false;
  }
  if (expected.length !== candidate.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

/**
 * Ein Vergleichswert fuer Benutzernamen, die es gar nicht gibt.
 *
 * Ohne ihn verraet die Antwortzeit, welche Namen existieren: fuer einen
 * unbekannten Namen lief bisher gar kein scrypt, die Anmeldung war nach 1,9 ms
 * abgelehnt statt nach 41 ms. Ein Angreifer konnte gueltige Namen damit
 * einfach durchprobieren, obwohl Text und Status identisch waren.
 *
 * `verifyAgainstDummy()` verbrennt dieselbe Rechenzeit und liefert immer false.
 */
const DUMMY = { salt: crypto.randomBytes(16).toString('hex'), hash: null };
DUMMY.hash = crypto.scryptSync(crypto.randomBytes(32).toString('hex'), DUMMY.salt, SCRYPT_KEYLEN).toString('hex');

export async function verifyAgainstDummy(password) {
  await verifyPassword(password, DUMMY.hash, DUMMY.salt);
  return false;
}

/** Setzt das Passwort eines Zugangs neu. Salt wird dabei erneuert. */
export async function changePassword(id, newPassword) {
  const { hash, salt } = await hashPassword(newPassword);
  await dbRun('UPDATE api_users SET pw_hash = ?, pw_salt = ? WHERE id = ?', [hash, salt, id]);
}

export async function findByUsername(username) {
  const rows = await dbRowsStrict(
    'SELECT id, username, pw_hash, pw_salt, role, disabled FROM api_users WHERE username = ?',
    [String(username).toLowerCase()]
  );
  return rows[0] || null;
}

export async function findById(id) {
  const rows = await dbRowsStrict(
    'SELECT id, username, role, disabled, created_at FROM api_users WHERE id = ?',
    [id]
  );
  return rows[0] || null;
}

export async function createUser({ username, password, role }) {
  const name = String(username).toLowerCase();
  if (!ROLES.includes(role)) throw new Error(`Unbekannte Rolle: ${role}`);
  const { hash, salt } = await hashPassword(password);
  const id = `usr_${crypto.randomBytes(9).toString('base64url')}`;
  await dbRun(
    `INSERT INTO api_users (id, username, pw_hash, pw_salt, role, created_at, disabled)
     VALUES (?, ?, ?, ?, ?, ?, 0)`,
    [id, name, hash, salt, role, Date.now()]
  );
  return { id, username: name, role, disabled: 0 };
}

export async function listUsers() {
  return dbRowsStrict(
    'SELECT id, username, role, disabled, created_at FROM api_users ORDER BY created_at',
    []
  );
}

export async function setDisabled(id, disabled) {
  await dbRun('UPDATE api_users SET disabled = ? WHERE id = ?', [disabled ? 1 : 0, id]);
}

/**
 * Bootstrap: der allererste Zugang.
 *
 * Ohne das gaebe es ein Henne-Ei-Problem — man braeuchte einen Zugang, um
 * Zugaenge anzulegen. Solange **kein einziger** api_users-Eintrag existiert,
 * gilt deshalb ACCESS_SECRET als gueltiges Passwort fuer den Benutzernamen
 * `owner`, und der Zugang wird bei diesem Login angelegt.
 *
 * Sobald ein Nutzer existiert, ist dieser Weg zu. ACCESS_SECRET oeffnet danach
 * nur noch das alte Panel, nicht mehr die API.
 *
 * @returns {Promise<object|null>} den angelegten Owner, oder null wenn der
 *   Bootstrap nicht (mehr) greift.
 */
export async function bootstrapOwnerIfEmpty(password) {
  const existing = await dbRowsStrict('SELECT COUNT(*) AS c FROM api_users', []);
  if (Number(existing[0]?.c || 0) > 0) return null;

  const secret = (config.accessSecret || '').trim();
  if (!secret) return null;

  const a = Buffer.from(crypto.createHash('sha256').update(String(password), 'utf8').digest());
  const b = Buffer.from(crypto.createHash('sha256').update(secret, 'utf8').digest());
  if (!crypto.timingSafeEqual(a, b)) return null;

  return createUser({ username: 'owner', password: secret, role: 'owner' });
}
