// src/commands/games/spielstand.js
// !spielstand / !wins

import { dbRows } from '../../db.js';

export const spielstandCommand = {
  name: 'spielstand',
  aliases: ['wins'],
  group: 'games',
  desc: 'Zeigt die Spiel-Bestenliste der Gruppe',
  usage: '!spielstand',
  groupOnly: true,
  async run(ctx) {
    const rows = await dbRows(
      'SELECT user_jid, name, game, wins FROM game_scores WHERE group_jid = ? ORDER BY wins DESC LIMIT 10',
      [ctx.chatJid]
    );
    if (!rows.length) return ctx.reply('ℹ️ Noch keine Siege — startet mit `!quiz` oder `!raten`!');
    const lines = rows.map((r, i) => {
      const who = r.name || `+${String(r.user_jid).split('@')[0]}`;
      return `${i + 1}. *${who}* — ${r.wins} Siege (${r.game})`;
    });
    return ctx.reply(`🏆 *Spiel-Bestenliste*\n${lines.join('\n')}`);
  },
};
