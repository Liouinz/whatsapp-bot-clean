// AFK-System: !afk setzt den Status, der Router meldet Erwähnungen
// und löst den Status automatisch, sobald die Person selbst wieder schreibt.

import { dbRun, dbRows } from '../db.js';
import { resolveLid, normalizeId } from '../permissions.js';

// Kleiner RAM-Cache, damit nicht jede Nachricht die DB fragt
const afkCache = new Map(); // user_jid → { reason, since }

export async function loadAfk() {
  afkCache.clear();
  const rows = await dbRows('SELECT user_jid, reason, since FROM afk', []);
  for (const r of rows) afkCache.set(r.user_jid, { reason: r.reason, since: Number(r.since) });
}

export function getAfk(userIds) {
  for (const raw of Array.isArray(userIds) ? userIds : [userIds]) {
    for (const id of [normalizeId(raw), resolveLid(raw)]) {
      if (id && afkCache.has(id)) return { user: id, ...afkCache.get(id) };
    }
  }
  return null;
}

export async function setAfk(userJid, reason) {
  const user = resolveLid(userJid);
  const entry = { reason: reason || 'abwesend', since: Date.now() };
  afkCache.set(user, entry);
  await dbRun(
    `INSERT INTO afk (user_jid, reason, since) VALUES (?, ?, ?)
     ON CONFLICT(user_jid) DO UPDATE SET reason = excluded.reason, since = excluded.since`,
    [user, entry.reason, entry.since]
  ).catch(() => {});
}

export async function clearAfk(userIds) {
  const hit = getAfk(userIds);
  if (!hit) return null;
  afkCache.delete(hit.user);
  await dbRun('DELETE FROM afk WHERE user_jid = ?', [hit.user]).catch(() => {});
  return hit;
}

export function fmtSince(ts) {
  const mins = Math.max(1, Math.round((Date.now() - ts) / 60_000));
  if (mins < 60) return `${mins} Min`;
  const h = Math.floor(mins / 60);
  return h < 24 ? `${h} Std` : `${Math.floor(h / 24)} T ${h % 24} Std`;
}

export const afkCommands = [
  {
    name: 'afkliste',
    aliases: ['whoafk'],
    group: 'community',
    desc: 'Wer ist gerade AFK?',
    usage: '!afkliste',
    async run(ctx) {
      if (!afkCache.size) return ctx.reply('✅ Niemand ist AFK — alle an Deck!');
      const lines = [...afkCache.entries()]
        .sort((a, b) => a[1].since - b[1].since)
        .slice(0, 15)
        .map(([jid, entry]) => `• +${String(jid).split('@')[0]} — seit ${fmtSince(entry.since)}: _${entry.reason}_`);
      return ctx.reply(`💤 *Gerade AFK* (${afkCache.size})\n${lines.join('\n')}`);
    },
  },
  {
    name: 'afk',
    group: 'community',
    desc: 'Setzt dich auf abwesend (mit optionalem Grund)',
    usage: '!afk [grund]',
    async run(ctx) {
      const reason = ctx.argText.trim().slice(0, 200) || 'abwesend';
      await setAfk(ctx.sender, reason);
      return ctx.reply(`💤 Alles klar, *${ctx.senderName}* — du bist jetzt AFK: _${reason}_\nSchreib einfach wieder, dann hebe ich das auf.`);
    },
  },
];
