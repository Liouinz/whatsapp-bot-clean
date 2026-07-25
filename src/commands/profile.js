// !profil — die Visitenkarte eines Mitglieds: Level, XP, Coins, Titel,
// Spiele-Siege, aktive Verwarnungen und AFK-Status auf einen Blick.

import { PREFIX, config } from '../config.js';
import { dbRows, flushBuffers, levelProgress } from '../db.js';
import { resolveLid } from '../permissions.js';
import { activeWarnings } from '../moderation.js';
import { getWallet, activeTitle } from './economy.js';
import { getAfk, fmtSince } from './afk.js';
import { getPrestigeLevel } from '../prestige.js';
import { ACHIEVEMENTS } from '../data/achievements.js';

function progressBar(have, need, width = 10) {
  const filled = Math.min(width, Math.round((have / Math.max(1, need)) * width));
  return '▰'.repeat(filled) + '▱'.repeat(width - filled);
}

export const profileCommands = [
  {
    name: 'profil',
    aliases: ['profile', 'me'],
    group: 'community',
    desc: 'Deine Visitenkarte (oder die von @person)',
    usage: '!profil [@person]',
    groupOnly: true,
    async run(ctx) {
      await flushBuffers();
      const target = ctx.targetUser() || ctx.sender;
      const user = resolveLid(target);
      const isSelf = user === resolveLid(ctx.sender);

      const [xpRows, wins, warns, wallet, title, prestige, achRows] = await Promise.all([
        dbRows('SELECT xp, messages, name FROM xp WHERE group_jid = ? AND user_jid = ?', [ctx.chatJid, user]),
        dbRows('SELECT game, wins FROM game_scores WHERE group_jid = ? AND user_jid = ? ORDER BY wins DESC', [ctx.chatJid, user]),
        activeWarnings(ctx.chatJid, user),
        getWallet(user, isSelf ? ctx.senderName : ''),
        activeTitle(user),
        getPrestigeLevel(user).catch(() => 0),
        dbRows('SELECT COUNT(*) AS c FROM user_achievements WHERE user_jid = ?', [user]),
      ]);

      const xp = xpRows.length ? Number(xpRows[0].xp) : 0;
      const { level, have, need } = levelProgress(xp);
      const name = isSelf ? ctx.senderName : xpRows[0]?.name || wallet.name || ctx.mentionTag(target);

      const better = await dbRows('SELECT COUNT(*) AS c FROM xp WHERE group_jid = ? AND xp > ?', [ctx.chatJid, xp]);
      const rankPos = Number(better[0]?.c ?? 0) + 1;

      const winsTotal = wins.reduce((sum, w) => sum + Number(w.wins), 0);
      const bestGame = wins.length ? ` (am besten: ${wins[0].game})` : '';
      const afk = getAfk([user]);

      const achCount = Number(achRows[0]?.c || 0);

      let text = `👤 *Profil — ${name}*\n`;
      if (title) text += `${title}\n`;
      if (prestige > 0) text += `⭐ Prestige-Rang *${prestige}* ${'✦'.repeat(Math.min(prestige, 10))}\n`;
      text += `\n⭐ Level *${level}* · Platz *#${rankPos}* in dieser Gruppe\n`;
      text += `   ${progressBar(have, need)} ${have}/${need} XP\n`;
      text += `💬 ${xpRows[0]?.messages ?? 0} Nachrichten · ${xp} XP gesamt\n`;
      text += `🪙 ${Number(wallet.balance).toLocaleString('de-DE')} Coins`;
      if (Number(wallet.streak) > 1) text += ` · 🔥 ${wallet.streak}-Tage-Streak`;
      text += '\n';
      if (winsTotal > 0) text += `🏆 ${winsTotal} Spiele-Sieg${winsTotal === 1 ? '' : 'e'}${bestGame}\n`;
      if (achCount > 0) text += `🏅 ${achCount}/${ACHIEVEMENTS.length} Erfolge${isSelf ? ` (\`${PREFIX}erfolge\`)` : ''}\n`;
      if (warns.length > 0) text += `⚠️ ${warns.length}/${config.moderation.warnLimitKick} aktive Verwarnungen\n`;
      if (afk) text += `💤 Gerade AFK (seit ${fmtSince(afk.since)}): _${afk.reason}_\n`;
      if (isSelf && !title) text += `\n_Tipp: Hol dir einen Titel im \`${PREFIX}shop\`!_`;

      const mentions = isSelf ? undefined : [target];
      return ctx.reply(text.trimEnd(), mentions);
    },
  },
  {
    name: 'aktivste',
    aliases: ['topheute'],
    group: 'community',
    desc: 'Die aktivsten Mitglieder dieser Gruppe',
    usage: '!aktivste',
    groupOnly: true,
    async run(ctx) {
      await flushBuffers();
      const rows = await dbRows(
        'SELECT name, user_jid, messages, xp FROM xp WHERE group_jid = ? ORDER BY messages DESC LIMIT 5',
        [ctx.chatJid]
      );
      if (!rows.length) return ctx.reply('ℹ️ Hier wurden noch keine Nachrichten gezählt.');
      const medals = ['🥇', '🥈', '🥉', '4.', '5.'];
      const lines = rows.map((r, i) => {
        const who = r.name || `+${String(r.user_jid).split('@')[0]}`;
        return `${medals[i]} *${who}* — ${r.messages} Nachrichten`;
      });
      return ctx.reply(`⚡ *Die Aktivsten*\n${lines.join('\n')}`);
    },
  },
];
