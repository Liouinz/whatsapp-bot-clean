// Umfragen: eine aktive Umfrage pro Gruppe, Stimmen per !stimme <nr>,
// Ergebnis-Balken, Auto-Schließung nach 24 h (Scheduler).

import { PREFIX, config } from '../config.js';
import { dbRun, dbRows } from '../db.js';
import { resolveLid } from '../permissions.js';

function bar(count, total, width = 8) {
  const filled = total > 0 ? Math.round((count / total) * width) : 0;
  return '▰'.repeat(filled) + '▱'.repeat(width - filled);
}

export async function activePoll(groupJid) {
  const rows = await dbRows(
    'SELECT * FROM polls WHERE group_jid = ? AND open = 1 ORDER BY created_at DESC LIMIT 1',
    [groupJid]
  );
  if (!rows.length) return null;
  const poll = rows[0];
  let options;
  try {
    options = JSON.parse(poll.options);
  } catch {
    return null;
  }
  return { ...poll, options };
}

export async function renderPollResult(poll, { final = false } = {}) {
  const votes = await dbRows('SELECT option_idx FROM poll_votes WHERE poll_id = ?', [poll.id]);
  const counts = new Array(poll.options.length).fill(0);
  for (const v of votes) {
    const idx = Number(v.option_idx);
    if (idx >= 0 && idx < counts.length) counts[idx]++;
  }
  const total = votes.length;
  const lines = poll.options.map((opt, i) => {
    const pct = total > 0 ? Math.round((counts[i] / total) * 100) : 0;
    return `${i + 1}. ${opt}\n   ${bar(counts[i], total)} ${counts[i]} (${pct} %)`;
  });
  const head = final ? '🏁 *Umfrage beendet*' : '📊 *Umfrage läuft*';
  let text = `${head}\n*${poll.question}*\n\n${lines.join('\n')}\n\n👥 ${total} Stimme${total === 1 ? '' : 'n'}`;
  if (!final) text += ` · Abstimmen: \`${PREFIX}stimme <nr>\``;
  if (final && total > 0) {
    const max = Math.max(...counts);
    const winners = poll.options.filter((_, i) => counts[i] === max);
    text += winners.length === 1 ? `\n🏆 Gewinner: *${winners[0]}*` : `\n🤝 Gleichstand: *${winners.join('* & *')}*`;
  }
  return text;
}

export async function closePoll(pollId) {
  await dbRun('UPDATE polls SET open = 0 WHERE id = ?', [pollId]);
}

export const pollCommands = [
  {
    name: 'umfrage',
    aliases: ['poll'],
    group: 'community',
    desc: 'Startet eine Umfrage (Optionen mit | trennen)',
    usage: '!umfrage Frage? | Option A | Option B',
    groupOnly: true,
    async run(ctx) {
      const existing = await activePoll(ctx.chatJid);
      if (existing) {
        return ctx.reply(
          `⚠️ Hier läuft schon eine Umfrage:\n*${existing.question}*\n` +
            `Erst beenden mit \`${PREFIX}umfrageende\` (Ersteller/Admin).`
        );
      }
      const parts = ctx.argText.split('|').map((s) => s.trim()).filter(Boolean);
      if (parts.length < 3) {
        return ctx.reply(
          `ℹ️ Nutzung: \`${PREFIX}umfrage Frage? | Option A | Option B\`\n` +
            `(2–${config.polls.maxOptions} Optionen, mit | getrennt)`
        );
      }
      const question = parts[0].slice(0, 200);
      const options = parts.slice(1, 1 + config.polls.maxOptions).map((o) => o.slice(0, 80));
      await dbRun(
        'INSERT INTO polls (group_jid, question, options, created_by, created_at, open) VALUES (?, ?, ?, ?, ?, 1)',
        [ctx.chatJid, question, JSON.stringify(options), resolveLid(ctx.sender), Date.now()]
      );
      const list = options.map((o, i) => `${i + 1}. ${o}`).join('\n');
      return ctx.reply(
        `📊 *Neue Umfrage von ${ctx.senderName}*\n*${question}*\n\n${list}\n\n` +
          `🗳️ Abstimmen mit \`${PREFIX}stimme <nr>\` — läuft max. ${config.polls.autoCloseHours} Std.`
      );
    },
  },
  {
    name: 'stimme',
    aliases: ['vote'],
    group: 'community',
    desc: 'Stimmt bei der laufenden Umfrage ab',
    usage: '!stimme <nr>',
    groupOnly: true,
    async run(ctx) {
      const poll = await activePoll(ctx.chatJid);
      if (!poll) return ctx.reply(`ℹ️ Hier läuft gerade keine Umfrage. Starte eine: \`${PREFIX}umfrage …\``);
      const idx = parseInt(ctx.args[0] || '', 10) - 1;
      if (!(idx >= 0 && idx < poll.options.length)) {
        return ctx.reply(`ℹ️ Bitte eine Nummer von 1 bis ${poll.options.length} wählen: \`${PREFIX}stimme <nr>\``);
      }
      const user = resolveLid(ctx.sender);
      const before = await dbRows('SELECT option_idx FROM poll_votes WHERE poll_id = ? AND user_jid = ?', [poll.id, user]);
      await dbRun(
        `INSERT INTO poll_votes (poll_id, user_jid, option_idx) VALUES (?, ?, ?)
         ON CONFLICT(poll_id, user_jid) DO UPDATE SET option_idx = excluded.option_idx`,
        [poll.id, user, idx]
      );
      const changed = before.length && Number(before[0].option_idx) !== idx;
      return ctx.reply(
        (changed ? '🔁 Stimme geändert' : '✅ Stimme gezählt') +
          `: *${poll.options[idx]}*\nZwischenstand: \`${PREFIX}umfragestand\``
      );
    },
  },
  {
    name: 'umfragestand',
    aliases: ['pollstatus'],
    group: 'community',
    desc: 'Zeigt den Zwischenstand der Umfrage',
    usage: '!umfragestand',
    groupOnly: true,
    async run(ctx) {
      const poll = await activePoll(ctx.chatJid);
      if (!poll) return ctx.reply(`ℹ️ Hier läuft gerade keine Umfrage. Starte eine: \`${PREFIX}umfrage …\``);
      return ctx.reply(await renderPollResult(poll));
    },
  },
  {
    name: 'umfrageende',
    aliases: ['pollend'],
    group: 'community',
    desc: 'Beendet die Umfrage & zeigt das Ergebnis',
    usage: '!umfrageende',
    groupOnly: true,
    async run(ctx) {
      const poll = await activePoll(ctx.chatJid);
      if (!poll) return ctx.reply('ℹ️ Hier läuft gerade keine Umfrage.');
      const isCreator = poll.created_by === resolveLid(ctx.sender);
      if (!isCreator && !(await ctx.isAdmin())) {
        return ctx.reply('⛔ Nur die Ersteller-Person oder Admins können die Umfrage beenden.');
      }
      await closePoll(poll.id);
      return ctx.reply(await renderPollResult(poll, { final: true }));
    },
  },
];
