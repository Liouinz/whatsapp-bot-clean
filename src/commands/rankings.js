import { dbRows } from '../db.js';
import { PREFIX } from '../config.js';

export const rankingCommands = [
  {
    name: 'rangliste',
    aliases: ['top', 'leaderboard', 'beste'],
    group: 'utility',
    desc: 'Zeigt Community-Ranglisten',
    usage: '!rangliste [nachrichten|xp|coins|level]',
    async run(ctx) {
      const type = ctx.args[0]?.toLowerCase() || 'nachrichten';
      const chatJid = ctx.chatJid;
      
      let rows = [];
      let title = '';
      let icon = '';
      
      switch (type) {
        case 'nachrichten':
        case 'messages':
          rows = await dbRows(
            `SELECT user_jid, name, SUM(messages) as total FROM xp WHERE group_jid = ? GROUP BY user_jid ORDER BY total DESC LIMIT 10`,
            [chatJid]
          );
          title = '📊 Nachrichten-Rangliste';
          icon = '💬';
          break;
          
        case 'xp':
          rows = await dbRows(
            `SELECT user_jid, name, SUM(xp) as total FROM xp WHERE group_jid = ? GROUP BY user_jid ORDER BY total DESC LIMIT 10`,
            [chatJid]
          );
          title = '⭐ XP-Rangliste';
          icon = '✨';
          break;
          
        case 'coins':
          rows = await dbRows(
            `SELECT user_jid, name, balance as total FROM coins ORDER BY balance DESC LIMIT 10`
          );
          title = '💰 Coins-Rangliste';
          icon = '🪙';
          break;
          
        case 'level':
          rows = await dbRows(
            `SELECT l.user_jid, l.name, l.level, x.xp as total 
             FROM levels l 
             JOIN xp x ON l.user_jid = x.user_jid AND l.group_jid = x.group_jid
             WHERE l.group_jid = ? 
             ORDER BY l.level DESC, x.xp DESC LIMIT 10`,
            [chatJid]
          );
          title = '🏆 Level-Rangliste';
          icon = '👑';
          break;
          
        default:
          return ctx.reply(`ℹ️ Gueltige Ranglisten: nachrichten, xp, coins, level\nBeispiel: !rangliste xp`);
      }
      
      if (!rows.length) return ctx.reply('ℹ️ Noch keine Daten vorhanden.');
      
      const lines = rows.map((r, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
        const name = r.name || 'Unbekannt';
        return `${medal} ${name} — ${r.total || 0}`;
      });
      
      return ctx.reply(`${icon} *${title}*\n\n${lines.join('\n')}`);
    }
  }
];
