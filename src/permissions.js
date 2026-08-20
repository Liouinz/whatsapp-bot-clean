// Permissions-Engine — LID-aware (WhatsApp-Umstellung 2025/2026).

import { jidNormalizedUser } from '@whiskeysockets/baileys';
import { OWNER_NUMBERS, BOT_OWNER_NUMBERS } from './config.js';
import { state } from './state.js';
import { logError } from './logger.js';
import { dbBatch } from './db.js';
import { ingestParticipants } from './identity.js';

const EFFECTIVE_BOT_OWNERS = BOT_OWNER_NUMBERS.length ? BOT_OWNER_NUMBERS : OWNER_NUMBERS;

export const ROLE = { USER: 1, GROUP_ADMIN: 2, COMMUNITY_OWNER: 3, BOT_OWNER: 4 };
export const ROLE_LABEL = {
  1: '👤 Nutzer', 2: '👮 Gruppen-Admin', 3: '🌐 Community-Owner', 4: '👑 Bot-Owner',
};

const META_CACHE_MS = 60_000;
const metaCache = new Map();

const lidToPn = new Map();

export function normalizeId(id) {
  if (!id) return null;
  try {
    return jidNormalizedUser(id);
  } catch {
    return String(id).split(':')[0];
  }
}

function participantIds(p) {
  return [p.id, p.lid, p.jid, p.phoneNumber].map(normalizeId).filter(Boolean);
}

export async function getGroupMeta(groupJid, force = false) {
  if (!groupJid || !String(groupJid).endsWith('@g.us')) return null;
  const cached = metaCache.get(groupJid);
  if (!force && cached && Date.now() - cached.at < META_CACHE_MS) return cached.meta;
  if (!state.sock) return cached?.meta || null;
  try {
    const meta = await state.sock.groupMetadata(groupJid);
    metaCache.set(groupJid, { meta, at: Date.now() });
    learnLidMappings(meta);
    return meta;
  } catch (err) {
    logError(err, 'groupMetadata');
    return cached?.meta || null;
  }
}

export function invalidateGroupMeta(groupJid) {
  metaCache.delete(groupJid);
}

const persistedMappings = new Set();
const MEMBER_CHUNK = 200;

// Gruppen-Metadaten kommen auch aus dem Cache und werden von
// botIsAdminInMeta() haeufig durchlaufen. Ohne Drossel wuerde jeder dieser
// Durchlaeufe die komplette Teilnehmerliste erneut schreiben.
const NAME_INGEST_MS = 10 * 60_000;
const lastNameIngest = new Map();

function learnParticipantNames(meta) {
  const id = meta?.id;
  if (!id || !Array.isArray(meta.participants)) return;
  const now = Date.now();
  const prev = lastNameIngest.get(id);
  if (prev && now - prev < NAME_INGEST_MS) return;
  if (lastNameIngest.size > 500) lastNameIngest.delete(lastNameIngest.keys().next().value);
  lastNameIngest.set(id, now);
  // GroupParticipant ist in Baileys ein `Contact & { admin }` — notify/name
  // sind also vorhanden und wurden bisher weggeworfen, obwohl das Panel die
  // Metadaten fuer die Mitgliederliste ohnehin abruft.
  ingestParticipants(meta.participants);
}

function learnLidMappings(meta) {
  if (!meta?.participants) return;
  learnParticipantNames(meta);
  const now = Date.now();
  const stmts = [];
  for (const p of meta.participants) {
    const lid = normalizeId(p.lid || (String(p.id).endsWith('@lid') ? p.id : null));
    const pn = normalizeId(p.phoneNumber || p.jid || (String(p.id).endsWith('@s.whatsapp.net') ? p.id : null));
    if (lid && pn) {
      if (lidToPn.size > 20_000) lidToPn.delete(lidToPn.keys().next().value);
      lidToPn.set(lid, pn);
    }
    // Frueher wurde die Zeile nur geschrieben, wenn LID *und* Nummer vorlagen.
    // In einer PN-adressierten Gruppe hat ein Teilnehmer aber gar keine LID —
    // diese Personen fehlten damit vollstaendig in `members`, obwohl sie in der
    // Gruppe sind. Der Panel-Filter "In Gruppen" zaehlte entsprechend zu wenig.
    if (!pn) continue;
    const key = `${meta.id}|${lid || ''}|${pn}`;
    if (persistedMappings.has(key)) continue;
    persistedMappings.add(key);
    if (persistedMappings.size > 20_000) persistedMappings.delete(persistedMappings.keys().next().value);
    stmts.push({
      sql: `INSERT INTO members (group_jid, user_jid, user_lid, last_seen) VALUES (?, ?, ?, ?)
            ON CONFLICT(group_jid, user_jid) DO UPDATE SET
              user_lid  = COALESCE(excluded.user_lid, members.user_lid),
              last_seen = excluded.last_seen`,
      args: [meta.id, pn, lid, now],
    });
  }
  // Eine WhatsApp-Gruppe fasst bis zu 1024 Personen. Beim ersten Sehen waeren
  // das ebenso viele Einzelanweisungen — deshalb in Bloecken.
  for (let i = 0; i < stmts.length; i += MEMBER_CHUNK) {
    dbBatch(stmts.slice(i, i + MEMBER_CHUNK)).catch(() => {});
  }
}

export function resolveLid(id) {
  const n = normalizeId(id);
  if (n && n.endsWith('@lid')) return lidToPn.get(n) || n;
  return n;
}

export function senderCandidates(msg) {
  const key = msg?.key || {};
  const raw = [
    key.participant,
    key.participantPn,
    key.participantLid,
    key.senderPn,
    key.senderLid,
    key.remoteJid?.endsWith('@g.us') ? null : key.remoteJid,
  ];
  const out = new Set();
  for (const id of raw) {
    const n = normalizeId(id);
    if (!n) continue;
    out.add(n);
    const resolved = resolveLid(n);
    if (resolved) out.add(resolved);
  }
  return [...out];
}

export function senderJid(msg) {
  const candidates = senderCandidates(msg);
  return candidates.find((c) => c.endsWith('@s.whatsapp.net')) || candidates[0] || null;
}

function digitsOf(id) {
  const resolved = resolveLid(id);
  return resolved ? String(resolved).split('@')[0].replace(/\D/g, '') : '';
}

export function isBotOwner(candidates) {
  const list = Array.isArray(candidates) ? candidates : [candidates];
  return list.some((id) => {
    const d = digitsOf(id);
    return d && EFFECTIVE_BOT_OWNERS.includes(d);
  });
}

export function isOwner(candidates) {
  const list = Array.isArray(candidates) ? candidates : [candidates];
  if (isBotOwner(list)) return true;
  return list.some((id) => {
    const d = digitsOf(id);
    return d && OWNER_NUMBERS.includes(d);
  });
}

export async function getRoleLevel(groupJid, senderIds, isGroup) {
  if (isBotOwner(senderIds)) return ROLE.BOT_OWNER;
  if (isOwner(senderIds)) return ROLE.COMMUNITY_OWNER;
  if (isGroup && (await isUserAdmin(groupJid, senderIds))) return ROLE.GROUP_ADMIN;
  return ROLE.USER;
}

async function adminIdSet(groupJid) {
  const meta = await getGroupMeta(groupJid);
  const ids = new Set();
  if (!meta?.participants) return ids;
  for (const p of meta.participants) {
    if (p.admin === 'admin' || p.admin === 'superadmin') {
      for (const id of participantIds(p)) ids.add(id);
    }
  }
  return ids;
}

export async function botIsAdmin(groupJid) {
  const admins = await adminIdSet(groupJid);
  const own = [state.botJidPn, state.botJidLid].filter(Boolean);
  return own.some((id) => admins.has(id));
}

export function botIsAdminInMeta(meta) {
  if (!meta?.participants) return false;
  learnLidMappings(meta);
  const own = [state.botJidPn, state.botJidLid].filter(Boolean);
  for (const p of meta.participants) {
    if (p.admin !== 'admin' && p.admin !== 'superadmin') continue;
    if (participantIds(p).some((id) => own.includes(id))) return true;
  }
  return false;
}

export async function isProtectedTarget(groupJid, userJid) {
  const ids = [normalizeId(userJid), resolveLid(userJid)].filter(Boolean);
  if (!ids.length) return false;
  const own = [state.botJidPn, state.botJidLid].filter(Boolean);
  if (ids.some((id) => own.includes(id))) return true;
  return isUserAdmin(groupJid, ids);
}

export async function isUserAdmin(groupJid, userIds) {
  const list = (Array.isArray(userIds) ? userIds : [userIds]).map(normalizeId).filter(Boolean);
  if (isOwner(list)) return true;
  const admins = await adminIdSet(groupJid);
  return list.some((id) => admins.has(id) || admins.has(resolveLid(id)));
}

export async function adminDebugInfo(groupJid, senderIds) {
  const meta = await getGroupMeta(groupJid, true);
  const admins = await adminIdSet(groupJid);
  return {
    groupName: meta?.subject || '?',
    participantCount: meta?.participants?.length || 0,
    adminCount: meta?.participants?.filter((p) => p.admin).length || 0,
    botJidPn: state.botJidPn,
    botJidLid: state.botJidLid,
    botIsAdmin: [state.botJidPn, state.botJidLid].filter(Boolean).some((id) => admins.has(id)),
    senderIsAdmin: await isUserAdmin(groupJid, senderIds),
    senderIsOwner: isOwner(senderIds),
  };
}
