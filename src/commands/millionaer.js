// "Wer wird Millionär?" — !millionär. 15 Gewinnstufen, Sicherheitsstufen bei
// Frage 5 und 10, Joker (50/50, Hinweis), Aussteigen mit Gewinn.

import { PREFIX } from '../config.js';
import { dbRun, dbRows, bufferXp, todayKey } from '../db.js';
import { resolveLid } from '../permissions.js';
import { earnCoins } from './economy.js';
import { MILLIONAIRE_QUESTIONS, pickQuestion } from '../data/millionaire-questions.js';

const LADDER = [50, 100, 150, 250, 400, 600, 900, 1300, 1800, 2500, 3500, 5000, 7000, 10000, 15000];
const SAFE_AT = [4, 9];
const LETTERS = ['A', 'B', 'C', 'D'];

const games = new Map();

function fmt(n) {
  return Number(n).toLocaleString('de-DE');
}

function securedAmount(correct) {
  if (correct >= 10) return LADDER[9];
  if (correct >= 5) return LADDER[4];
  return 0;
}

function tierForLevel(level) {
  return level < 5 ? 1 : level < 10 ? 2 : 3;
}

function makeQuestion(level, used) {
  const qi = pickQuestion(tierForLevel(level), new Set(used));
  if (qi == null) return null;
  const opts = MILLIONAIRE_QUESTIONS[qi].options.map((t, i) => ({ t, correct: i === 0 }));
  for (let i = opts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [opts[i], opts[j]] = [opts[j], opts[i]];
  }
  return { qi, opts: opts.map((o) => o.t), correct: opts.findIndex((o) => o.correct), elim: [] };
}

async function persist(s) {
  await dbRun(
    `INSERT INTO millionaire_games (chat_jid, user_jid, name, level, used, q, used5050, usedhint, started_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(chat_jid) DO UPDATE SET
       user_jid=excluded.user_jid, name=excluded.name, level=excluded.level,
       used=excluded.used, q=excluded.q, used5050=excluded.used5050, usedhint=excluded.usedhint`,
    [s.chatJid, s.userJid, s.name, s.level, JSON.stringify(s.used), JSON.stringify(s.q),
      s.used5050 ? 1 : 0, s.usedHint ? 1 : 0, s.startedAt]
  ).catch(() => {});
}

async function endGame(chatJid) {
  games.delete(chatJid);
  await dbRun('DELETE FROM millionaire_games WHERE chat_jid = ?', [chatJid]).catch(() => {});
}

export function _peekGame(chatJid) {
  return games.get(chatJid);
}

export async function loadActiveMillionaire() {
  games.clear();
  const rows = await dbRows('SELECT * FROM millionaire_games', []);
  for (const r of rows) {
    try {
      games.set(r.chat_jid, {
        chatJid: r.chat_jid, userJid: r.user_jid, name: r.name, level: Number(r.level),
        used: JSON.parse(r.used || '[]'), q: JSON.parse(r.q),
        used5050: Number(r.used5050) === 1, usedHint: Number(r.usedhint) === 1,
        startedAt: Number(r.started_at),
      });
    } catch {}
  }
}

function board(s, note = '') {
  const q = MILLIONAIRE_QUESTIONS[s.q.qi];
  let t = `🎬 *Wer wird Millionär?* — Frage *${s.level + 1}/15*\n💰 Diese Frage: *${fmt(LADDER[s.level])}* 🪙`;
  const sec = securedAmount(s.level);
  if (sec > 0) t += `  ·  🛡️ sicher: ${fmt(sec)}`;
  t += `\n\n❓ *${q.q}*\n`;
  s.q.opts.forEach((opt, i) => {
    if (s.q.elim.includes(i)) return;
    t += `\n${LETTERS[i]}) ${opt}`;
  });
  t += `\n\n_Antworte mit A, B, C oder D._`;
  const jok = [];
  if (!s.used5050) jok.push(`${PREFIX}5050`);
  if (!s.usedHint) jok.push(`${PREFIX}hinweis`);
  jok.push(`${PREFIX}aufhören`);
  t += `\n🃏 ${jok.join(' · ')}`;
  if (note) t = `${note}\n\n${t}`;
  return t;
}

async function payout(s, coins, xp) {
  if (coins > 0) await earnCoins(s.userJid, coins, s.name).catch(() => {});
  if (xp > 0) bufferXp(s.chatJid, s.userJid, xp, s.name);
  await dbRun(
    `INSERT INTO game_scores (group_jid, user_jid, game, wins, name) VALUES (?, ?, 'millionaer', 1, ?)
     ON CONFLICT(group_jid, user_jid, game) DO UPDATE SET wins = game_scores.wins + 1, name = excluded.name`,
    [s.chatJid, s.userJid, s.name]
  ).catch(() => {});
}

export async function checkMillionaireAnswer(ctx) {
  const s = games.get(ctx.chatJid);
  if (!s) return false;
  if (resolveLid(ctx.sender) !== s.userJid) return false;
  const m = /^(?:antwort\s+)?([abcd])$/i.exec(ctx.text.trim());
  if (!m) return false;
  const idx = LETTERS.indexOf(m[1].toUpperCase());
  if (s.q.elim.includes(idx)) {
    await ctx.reply('ℹ️ Diese Option wurde per 50/50 entfernt — wähl eine andere.');
    return true;
  }

  if (idx === s.q.correct) {
    s.level += 1;
    if (s.level >= LADDER.length) {
      await endGame(ctx.chatJid);
      await payout(s, LADDER[LADDER.length - 1], 200);
      await ctx.reply(`🏆 *RICHTIG — und das war die MILLIONÄR-FRAGE!*\n\n*${s.name}* gewinnt den Hauptpreis: *${fmt(LADDER[LADDER.length - 1])}* 🪙 + 200 XP! 🎉`);
      return true;
    }
    s.q = makeQuestion(s.level, s.used);
    s.used.push(s.q.qi);
    await persist(s);
    const passedSafe = SAFE_AT.includes(s.level - 1);
    const note = passedSafe
      ? `✅ *Richtig!* 🛡️ Sicherheitsstufe erreicht — *${fmt(LADDER[s.level - 1])}* 🪙 sind dir sicher!`
      : `✅ *Richtig!* Weiter geht's …`;
    await ctx.reply(board(s, note));
    return true;
  }

  const correctLetter = LETTERS[s.q.correct];
  const correctText = s.q.opts[s.q.correct];
  const sec = securedAmount(s.level);
  await endGame(ctx.chatJid);
  if (sec > 0) await payout(s, sec, s.level * 10);
  await ctx.reply(
    `❌ *Leider falsch!* Richtig war *${correctLetter}) ${correctText}*.\n\n` +
      (sec > 0
        ? `Du nimmst dein gesichertes Guthaben mit: *${fmt(sec)}* 🪙. Stark gespielt! Neue Runde: \`${PREFIX}millionär\``
        : `Diesmal ohne Gewinn — aber übung macht den Meister! Neue Runde: \`${PREFIX}millionär\``)
  );
  return true;
}

export const millionaireCommands = [
  {
    name: 'millionär',
    aliases: ['millionaer', 'wwm', 'millionaire'],
    group: 'games',
    desc: 'Wer wird Millionär? — Quiz mit Gewinnstufen & Jokern',
    usage: '!millionär',
    groupOnly: true,
    async run(ctx) {
      const existing = games.get(ctx.chatJid);
      if (existing) {
        return ctx.reply(
          `ℹ️ Hier läuft schon eine Runde (Spieler: *${existing.name}*).\n${board(existing)}`
        );
      }
      const user = resolveLid(ctx.sender);
      const today = todayKey();
      const last = await dbRows('SELECT day FROM millionaire_daily WHERE user_jid = ?', [user]);
      if (last.length && last[0].day === today) {
        return ctx.reply('⏳ Du hast deine *Millionär*-Runde heute schon gespielt — morgen wartet die nächste Frage! 🎬');
      }
      await dbRun(
        `INSERT INTO millionaire_daily (user_jid, day) VALUES (?, ?)
         ON CONFLICT(user_jid) DO UPDATE SET day = excluded.day`,
        [user, today]
      ).catch(() => {});

      const q = makeQuestion(0, []);
      if (!q) return ctx.reply('⚠️ Gerade sind keine Fragen verfügbar — bitte später erneut.');
      const s = {
        chatJid: ctx.chatJid, userJid: user, name: ctx.senderName, level: 0,
        used: [q.qi], q, used5050: false, usedHint: false, startedAt: Date.now(),
      };
      games.set(ctx.chatJid, s);
      await persist(s);
      return ctx.reply(board(s, `🎬 *${ctx.senderName}* betritt den Ratestuhl! Viel Erfolg auf dem Weg zur Million.`));
    },
  },
  {
    name: '5050',
    aliases: ['5050joker'],
    group: 'games',
    desc: '50/50-Joker: entfernt zwei falsche Antworten',
    usage: '!5050',
    groupOnly: true,
    async run(ctx) {
      const s = games.get(ctx.chatJid);
      if (!s) return ctx.reply(`ℹ️ Gerade läuft kein Spiel. Starten: \`${PREFIX}millionär\``);
      if (resolveLid(ctx.sender) !== s.userJid) return ctx.reply('⛔ Nur die Person auf dem Ratestuhl darf Joker nutzen.');
      if (s.used5050) return ctx.reply('ℹ️ Den 50/50-Joker hast du schon verbraucht.');
      const wrong = [0, 1, 2, 3].filter((i) => i !== s.q.correct && !s.q.elim.includes(i));
      for (let i = wrong.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [wrong[i], wrong[j]] = [wrong[j], wrong[i]];
      }
      s.q.elim = wrong.slice(0, 2);
      s.used5050 = true;
      await persist(s);
      return ctx.reply(board(s, '✂️ *50/50-Joker!* Zwei falsche Antworten sind weg.'));
    },
  },
  {
    name: 'hinweis',
    aliases: ['tipp', 'hintjoker'],
    group: 'games',
    desc: 'Hinweis-Joker: kleiner Tipp zur aktuellen Frage',
    usage: '!hinweis',
    groupOnly: true,
    async run(ctx) {
      const s = games.get(ctx.chatJid);
      if (!s) return ctx.reply(`ℹ️ Gerade läuft kein Spiel. Starten: \`${PREFIX}millionär\``);
      if (resolveLid(ctx.sender) !== s.userJid) return ctx.reply('⛔ Nur die Person auf dem Ratestuhl darf Joker nutzen.');
      if (s.usedHint) return ctx.reply('ℹ️ Den Hinweis-Joker hast du schon verbraucht.');
      s.usedHint = true;
      await persist(s);
      const q = MILLIONAIRE_QUESTIONS[s.q.qi];
      const correctText = s.q.opts[s.q.correct];
      const hint = q.hint || `Die richtige Antwort beginnt mit dem Buchstaben „${correctText[0]}".`;
      return ctx.reply(board(s, `💡 *Hinweis:* ${hint}`));
    },
  },
  {
    name: 'aufhören',
    aliases: ['aufhoeren', 'aussteigen', 'stop'],
    group: 'games',
    desc: 'Beim Millionär-Quiz mit dem aktuellen Gewinn aussteigen',
    usage: '!aufhören',
    groupOnly: true,
    async run(ctx) {
      const s = games.get(ctx.chatJid);
      if (!s) return ctx.reply(`ℹ️ Gerade läuft kein Spiel. Starten: \`${PREFIX}millionär\``);
      if (resolveLid(ctx.sender) !== s.userJid) return ctx.reply('⛔ Nur die spielende Person kann aussteigen.');
      const winnings = s.level > 0 ? LADDER[s.level - 1] : 0;
      await endGame(ctx.chatJid);
      if (winnings > 0) {
        await payout(s, winnings, s.level * 10);
        return ctx.reply(`🚪 *${s.name}* steigt aus und sichert sich *${fmt(winnings)}* 🪙 + ${s.level * 10} XP. Kluge Entscheidung! 🎉`);
      }
      return ctx.reply('🚪 Ausgestiegen — diesmal ohne Gewinn. Beim nächsten Mal! 🎬');
    },
  },
];
