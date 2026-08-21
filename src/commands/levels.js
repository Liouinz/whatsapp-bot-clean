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
      const { level, progress, needed } = levelProgress(xp);
      const better = await dbRows(
        'SELECT COUNT(*) AS c FROM xp WHERE group_jid = ? AND xp > ?',
        [ctx.chatJid, xp]
      );
      const rankPos = Number(better[0]?.c ?? 0) + 1;
      return ctx.reply(
        `⭐ *Dein Rang, ${ctx.senderName}*\n` +
          `• Level: *${level}*  ·  Platz *#${rankPos}*\n` +
          `• XP: ${xp} (${rows[0].messages} Nachrichten)\n` +
          `• Bis Level ${level + 1}: ${bar(progress, needed)} ${progress}/${needed}`
      );
    },
  },
];
// Hinweis: Das frühere 'leaderboard'-Kommando wurde entfernt — es war durch
// rankings.js' !rangliste (Name + beide Aliase top/leaderboard) bereits
// vollständig unerreichbar geworden. !rangliste xp deckt denselben Fall ab.
