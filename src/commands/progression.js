// Fortschritts-Systeme: Erfolge (!erfolge), Prestige (!prestige) und globale
// Ranglisten (!bestenliste).

import { PREFIX } from '../config.js';
import { dbRun, dbRows, bufferXp } from '../db.js';
import { resolveLid } from '../permissions.js';
import { addCoins, fmtCoins } from './economy.js';
import { addToInventory } from './items.js';
import { getItem } from '../data/shop-items.js';
import { getUserStat, getUserStats } from '../stats.js';
import { ACHIEVEMENTS, getAchievement } from '../data/achievements.js';
import {
  getPrestigeLevel, doPrestige, nextCost, PRESTIGE_BONUS_PER_RANK,
} from '../prestige.js';

const who = (r) => r.name || `+${String(r.user_jid).split('@')[0]}`;
const medal = (i) => ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;

async function grantAchReward(user, a, name, chatJid) {
  const r = a.reward || {};
  if (r.coins) await addCoins(user, r.coins, name).catch(() => {});
  if (r.xp && chatJid) bufferXp(chatJid, user, r.xp, name);
  if (r.item) {
    await addToInventory(user, r.item, 1).catch(() => {});
    const it = getItem(r.item);
    if (it?.category === 'titel') {
      await dbRun(
        `INSERT INTO user_titles (user_jid, title) VALUES (?, ?)
         ON CONFLICT(user_jid) DO UPDATE SET title = excluded.title`,
        [user, it.effect.title]
      ).catch(() => {});
    }
  }
}

export async function checkAchievements(user, name, chatJid) {
  const unlocked = new Set((await dbRows('SELECT ach_id FROM user_achievements WHERE user_jid = ?', [user])).map((r) => r.ach_id));
  const locked = ACHIEVEMENTS.filter((a) => !unlocked.has(a.id));
  if (!locked.length) return [];
  const stats = await getUserStats(user, locked.map((a) => a.type));
  const newly = [];
  for (const a of locked) {
    if ((stats[a.type] || 0) >= a.threshold) {
      const res = await dbRun('INSERT OR IGNORE INTO user_achievements (user_jid, ach_id, unlocked_at) VALUES (?, ?, ?)', [user, a.id, Date.now()]);
      if (Number(res.rowsAffected) > 0) { await grantAchReward(user, a, name, chatJid); newly.push(a); }
    }
  }
  return newly;
}

function rewardText(reward) {
  const p = [];
  if (reward.coins) p.push(`${fmtCoins(reward.coins)}`);
  if (reward.xp) p.push(`${reward.xp} XP`);
  if (reward.item) { const it = getItem(reward.item); p.push(it ? `${it.emoji} ${it.name}` : reward.item); }
  return p.join(' · ');
}

export const progressionCommands = [
  {
    name: 'erfolge',
    aliases: ['achievements', 'erfolg'],
    group: 'community',
    desc: 'Deine Erfolge & Fortschritt zu neuen',
    usage: '!erfolge',
    async run(ctx) {
      const user = resolveLid(ctx.sender);
      const newly = await checkAchievements(user, ctx.senderName, ctx.chatJid);
      const unlocked = new Set((await dbRows('SELECT ach_id FROM user_achievements WHERE user_jid = ?', [user])).map((r) => r.ach_id));

      let text = `🏅 *Erfolge von ${ctx.senderName}* — ${unlocked.size}/${ACHIEVEMENTS.length}\n`;
      if (newly.length) {
        text += `\n🎉 *Neu freigeschaltet:*\n${newly.map((a) => `${a.emoji} *${a.name}* → ${rewardText(a.reward)}`).join('\n')}\n`;
      }
      const done = ACHIEVEMENTS.filter((a) => unlocked.has(a.id));
      if (done.length) text += `\n✅ ${done.map((a) => `${a.emoji} ${a.name}`).join(' · ')}\n`;

      const locked = ACHIEVEMENTS.filter((a) => !unlocked.has(a.id));
      if (locked.length) {
        const stats = await getUserStats(user, locked.map((a) => a.type));
        const next = locked
          .map((a) => ({ a, have: stats[a.type] || 0, pct: (stats[a.type] || 0) / a.threshold }))
          .sort((x, y) => y.pct - x.pct)
          .slice(0, 3);
        text += `\n🔒 *Als Nächstes:*\n${next.map(({ a, have }) => `${a.emoji} ${a.name} — ${Number(have).toLocaleString('de-DE')}/${a.threshold.toLocaleString('de-DE')}`).join('\n')}`;
      } else {
        text += '\n🏆 Alle Erfolge freigeschaltet — Wahnsinn!';
      }
      return ctx.reply(text);
    },
  },
  {
    name: 'prestige',
    aliases: ['prestij', 'resetlevel'],
    group: 'community',
    desc: 'Coins gegen permanenten Prestige-Rang (+Coin-Bonus)',
    usage: '!prestige [aufsteigen]',
    async run(ctx) {
      const user = resolveLid(ctx.sender);
      const level = await getPrestigeLevel(user);
      const cost = nextCost(level);
      const go = /^(aufsteigen|los|machen|up|ja)$/i.test(ctx.args[0] || '');

      if (!go) {
        const bonus = Math.round(level * PRESTIGE_BONUS_PER_RANK * 100);
        return ctx.reply(
          `⭐ *Prestige — ${ctx.senderName}*\n` +
            `Aktueller Rang: *${level}* ${'✦'.repeat(Math.min(level, 10))}\n` +
            `Dauerhafter Coin-Bonus: *+${bonus}%*\n\n` +
            `Nächster Rang kostet: *${fmtCoins(cost)}*\n` +
            `Das verbrennt die Coins dauerhaft und gibt +${Math.round(PRESTIGE_BONUS_PER_RANK * 100)}% Coins extra.\n\n` +
            `Aufsteigen: \`${PREFIX}prestige aufsteigen\``
        );
      }
      const res = await doPrestige(user);
      if (!res.ok) return ctx.reply(`⚠️ Dafür brauchst du *${fmtCoins(res.need)}*. Spar weiter! 💪`);
      return ctx.reply(
        `🌟 *PRESTIGE!* *${ctx.senderName}* steigt auf Rang *${res.level}* auf!\n` +
          `${fmtCoins(res.cost)} verbrannt · neuer Dauerbonus: *+${Math.round(res.level * PRESTIGE_BONUS_PER_RANK * 100)}%* Coins. 🔥`
      );
    },
  },
  {
    name: 'bestenliste',
    aliases: ['hall', 'ranking'],
    group: 'community',
    desc: 'Globale Ranglisten (coins|siege|erfolge|prestige|verdient)',
    usage: '!bestenliste [kategorie]',
    async run(ctx) {
      const cat = (ctx.args[0] || 'coins').toLowerCase();
      let rows, title, valfn;
      if (cat.startsWith('sieg')) {
        rows = await dbRows('SELECT user_jid, MAX(name) AS name, SUM(wins) AS v FROM game_scores GROUP BY user_jid ORDER BY v DESC LIMIT 10', []);
        title = '🎮 Meiste Spielsiege'; valfn = (r) => `${Number(r.v).toLocaleString('de-DE')} Siege`;
      } else if (cat.startsWith('erfolg') || cat.startsWith('achiev')) {
        rows = await dbRows(
          `SELECT ua.user_jid, c.name AS name, COUNT(*) AS v FROM user_achievements ua
           LEFT JOIN coins c ON c.user_jid = ua.user_jid GROUP BY ua.user_jid ORDER BY v DESC LIMIT 10`, []);
        title = '🏅 Meiste Erfolge'; valfn = (r) => `${r.v}/${ACHIEVEMENTS.length}`;
      } else if (cat.startsWith('prest')) {
        rows = await dbRows(
          `SELECT p.user_jid, c.name AS name, p.level AS v FROM prestige p
           LEFT JOIN coins c ON c.user_jid = p.user_jid WHERE p.level > 0 ORDER BY p.level DESC LIMIT 10`, []);
        title = '⭐ Höchster Prestige-Rang'; valfn = (r) => `Rang ${r.v}`;
      } else if (cat.startsWith('verdien')) {
        rows = await dbRows('SELECT user_jid, name, total_earned AS v FROM coins ORDER BY total_earned DESC LIMIT 10', []);
        title = '⛏️ Meiste Coins verdient (gesamt)'; valfn = (r) => fmtCoins(r.v);
      } else {
        rows = await dbRows('SELECT user_jid, name, balance AS v FROM coins ORDER BY balance DESC LIMIT 10', []);
        title = '💰 Reichste Spieler'; valfn = (r) => fmtCoins(r.v);
      }
      if (!rows.length) return ctx.reply('ℹ️ Für diese Rangliste gibt es noch keine Daten.');
      const lines = rows.map((r, i) => `${medal(i)} *${who(r)}* — ${valfn(r)}`);
      return ctx.reply(
        `🏆 *${title}*\n${lines.join('\n')}\n\n` +
          `_Kategorien: coins · verdient · siege · erfolge · prestige_`
      );
    },
  },
];
