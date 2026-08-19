// Geburtstage: Nutzer tragen sich ein, der Scheduler gratuliert täglich um 9:00
// in der Gruppe, in der der Geburtstag gesetzt wurde — inkl. Coin-Geschenk.

import { PREFIX, config } from '../config.js';
import { dbRun, dbRows, todayKey } from '../db.js';
import { resolveLid } from '../permissions.js';
import { sendText } from '../queue.js';
import { addCoins } from './economy.js';
import { logError } from '../logger.js';

const MONTH_NAMES = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function parseBirthday(text) {
  const m = /^(\d{1,2})[./-](\d{1,2})(?:[./-]\d{2,4})?\.?$/.exec((text || '').trim());
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  if (month < 1 || month > 12 || day < 1 || day > DAYS_IN_MONTH[month - 1]) return null;
  return { day, month };
}

function daysUntil(day, month) {
  const now = new Date();
  const thisYear = new Date(now.getFullYear(), month - 1, day);
  thisYear.setHours(0, 0, 0, 0);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (thisYear >= today) return Math.round((thisYear - today) / 86_400_000);
  const nextYear = new Date(now.getFullYear() + 1, month - 1, day);
  return Math.round((nextYear - today) / 86_400_000);
}

export async function congratulateBirthdays() {
  const now = new Date();
  if (now.getHours() < config.birthdays.hour) return;
  const today = todayKey();
  const rows = await dbRows(
    'SELECT * FROM birthdays WHERE day = ? AND month = ? AND (last_congratulated IS NULL OR last_congratulated != ?)',
    [now.getDate(), now.getMonth() + 1, today]
  );
  for (const r of rows) {
    try {
      // Geschenk und Glueckwunsch ZUERST, Marker danach. Umgekehrt galt der
      // Geburtstag bereits als erledigt, wenn addCoins oder sendText
      // scheiterte — Coins und Gratulation waren dann dauerhaft verloren,
      // weil die WHERE-Klausel den Datensatz fuer den Rest des Tages ausschloss.
      await addCoins(r.user_jid, config.birthdays.coinsGift, r.name || '');
      if (r.group_jid) {
        const tag = `@${String(r.user_jid).split('@')[0]}`;
        await sendText(
          r.group_jid,
          `🎂🎉 *Alles Gute zum Geburtstag, ${tag}!* 🎉🎂\n` +
            `Die ganze Gruppe feiert dich heute — und als Geschenk gibt es *${config.birthdays.coinsGift} 🪙* aufs Konto!`,
          [r.user_jid]
        );
      }
      await dbRun('UPDATE birthdays SET last_congratulated = ? WHERE user_jid = ?', [today, r.user_jid]);
    } catch (err) {
      logError(err, 'birthdays');
    }
  }
}

export const birthdayCommands = [
  {
    name: 'geburtstag',
    aliases: ['bday'],
    group: 'community',
    desc: 'Trägt deinen Geburtstag ein (Tag.Monat)',
    usage: '!geburtstag 24.12. | löschen',
    groupOnly: true,
    async run(ctx) {
      const user = resolveLid(ctx.sender);
      if (/^(löschen|loeschen|delete|aus)$/i.test(ctx.args[0] || '')) {
        await dbRun('DELETE FROM birthdays WHERE user_jid = ?', [user]);
        return ctx.reply('✅ Dein Geburtstag wurde entfernt — kein Ständchen mehr von mir.');
      }
      const parsed = parseBirthday(ctx.args[0]);
      if (!parsed) {
        return ctx.reply(`ℹ️ Nutzung: \`${PREFIX}geburtstag 24.12.\` (Tag.Monat) oder \`${PREFIX}geburtstag löschen\``);
      }
      await dbRun(
        `INSERT INTO birthdays (user_jid, day, month, name, group_jid) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(user_jid) DO UPDATE SET day = excluded.day, month = excluded.month,
           name = excluded.name, group_jid = excluded.group_jid`,
        [user, parsed.day, parsed.month, ctx.senderName, ctx.chatJid]
      );
      const days = daysUntil(parsed.day, parsed.month);
      const when = days === 0 ? '🎂 DAS IST JA HEUTE!' : `Noch *${days} Tag${days === 1 ? '' : 'e'}* bis zum Ständchen.`;
      return ctx.reply(
        `✅ Gemerkt: *${parsed.day}. ${MONTH_NAMES[parsed.month - 1]}* 🎂\n${when}\n` +
          `_Ich gratuliere in dieser Gruppe — inklusive ${config.birthdays.coinsGift} 🪙 Geschenk._`
      );
    },
  },
  {
    name: 'geburtstage',
    aliases: ['bdays'],
    group: 'community',
    desc: 'Die nächsten Geburtstage dieser Gruppe',
    usage: '!geburtstage',
    groupOnly: true,
    async run(ctx) {
      const rows = await dbRows('SELECT * FROM birthdays WHERE group_jid = ?', [ctx.chatJid]);
      if (!rows.length) {
        return ctx.reply(`ℹ️ Noch keine Geburtstage eingetragen.\nTrag deinen ein: \`${PREFIX}geburtstag 24.12.\``);
      }
      const sorted = rows
        .map((r) => ({ ...r, in: daysUntil(Number(r.day), Number(r.month)) }))
        .sort((a, b) => a.in - b.in)
        .slice(0, 10);
      const lines = sorted.map((r) => {
        const who = r.name || `+${String(r.user_jid).split('@')[0]}`;
        const date = `${r.day}. ${MONTH_NAMES[r.month - 1]}`;
        const when = r.in === 0 ? '🎂 *HEUTE!*' : r.in === 1 ? 'morgen' : `in ${r.in} Tagen`;
        return `• *${who}* — ${date} (${when})`;
      });
      return ctx.reply(`🎂 *Nächste Geburtstage*\n${lines.join('\n')}`);
    },
  },
];
