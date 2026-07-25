// XP-/Level-Befehle: !rank und !leaderboard.
// XP-Vergabe selbst passiert still im Router (mit Cooldown + Dedupe).

import { dbRows, flushBuffers, levelProgress } from '../db.js';
import { resolveLid } from '../permissions.js';

function bar(have, need, width = 10) {
  const filled = Math.min(width, Math.round((have / Math.max(1, need)) * width));
  return '▰'.repeat(filled) + '▱'.repeat(width - filled);
}

export const levelCommands = [
  {
    name: 'rank',
    aliases: ['level', 'xp'],
    group: 'community',
    desc: 'Dein Level & XP in dieser Gruppe',
    usage: '!rank',
    groupOnly: true,
    async run(ctx) {
      await flushBuffers();
      const user = resolveLid(ctx.sender);
      const rows = await dbRows(
        'SELECT xp, messages FROM xp WHERE group_jid = ? AND user_jid = ?',
        [ctx.chatJid, user]
      );
      if (!rows.length || !Number(rows[0].xp)) {
        return ctx.reply('ℹ️ Du hast hier noch keine XP gesammelt — schreib einfach mit, dann geht es los! ⭐');
      }
      const xp = Number(rows[0].xp);
      const { level, have, need } = levelProgress(xp);
      const better = await dbRows(
        'SELECT COUNT(*) AS c FROM xp WHERE group_jid = ? AND xp > ?',
        [ctx.chatJid, xp]
      );
      const rankPos = Number(better[0]?.c ?? 0) + 1;
      return ctx.reply(
        `⭐ *Dein Rang, ${ctx.senderName}*\n` +
          `• Level: *${level}*  ·  Platz *#${rankPos}*\n` +
          `• XP: ${xp} (${rows[0].messages} Nachrichten)\n` +
          `• Bis Level ${level + 1}: ${bar(have, need)} ${have}/${need}`
      );
    },
  },
  {
    name: 'leaderboard',
    aliases: ['top', 'rangliste'],
    group: 'community',
    desc: 'Die Top 10 dieser Gruppe',
    usage: '!leaderboard',
    groupOnly: true,
    async run(ctx) {
      await flushBuffers();
      const rows = await dbRows(
        'SELECT user_jid, name, xp FROM xp WHERE group_jid = ? ORDER BY xp DESC LIMIT 10',
        [ctx.chatJid]
      );
      if (!rows.length) return ctx.reply('ℹ️ Hier hat noch niemand XP gesammelt — legt los! ⭐');
      const medals = ['🥇', '🥈', '🥉'];
      const lines = rows.map((r, i) => {
        const { level } = levelProgress(Number(r.xp));
        const who = r.name || `+${String(r.user_jid).split('@')[0]}`;
        return `${medals[i] || `${i + 1}.`} *${who}* — Level ${level} (${r.xp} XP)`;
      });
      return ctx.reply(`🏆 *Rangliste — Top ${rows.length}*\n${lines.join('\n')}`);
    },
  },
];
