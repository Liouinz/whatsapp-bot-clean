// src/commands/games/index.js
// Gemeinsame Spiel-Infrastruktur: active-Map, addWin(), checkGameAnswer()

import { dbRun, bufferXp } from '../../db.js';
import { resolveLid } from '../../permissions.js';
import { earnCoins } from '../economy.js';
import { config } from '../../config.js';

// Laufende Spiele pro Chat: Map chatJid → { quiz?, raten?, galgen?, ttt?, blackjack? }
export const active = new Map();

export function chatGames(chatJid) {
  if (!active.has(chatJid)) active.set(chatJid, {});
  return active.get(chatJid);
}

/** Sieg verbuchen: Score in DB + XP + Coins in einem Rutsch. */
export async function addWin(chatJid, userJid, game, name, { xp = 0, coins = 0 } = {}) {
  const user = resolveLid(userJid);
  await dbRun(
    `INSERT INTO game_scores (group_jid, user_jid, game, wins, name) VALUES (?, ?, ?, 1, ?)
     ON CONFLICT(group_jid, user_jid, game) DO UPDATE SET wins = game_scores.wins + 1, name = excluded.name`,
    [chatJid, user, game, name || '']
  ).catch(() => {});
  if (xp > 0) bufferXp(chatJid, user, xp, name);
  if (coins > 0) await earnCoins(user, coins, name).catch(() => {});
}

/** Antwort-Normalisierung */
function normalizeGuess(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(der|die|das|den|dem|ein|eine|the) /, '');
}

export function quizAnswerMatches(answers, rawGuess) {
  const guess = normalizeGuess(rawGuess);
  if (!guess) return false;
  return answers.some((ans) => {
    const na = normalizeGuess(ans);
    if (!na) return false;
    if (guess === na) return true;
    return na.includes(' ') ? guess.includes(na) : guess.split(' ').includes(na);
  });
}

/**
 * Router-Hook: prüft normale Nachrichten auf Spiel-Antworten (Quiz/Raten).
 * Gibt true zurück, wenn die Nachricht zu einem Spiel gehörte.
 */
export async function checkGameAnswer(ctx) {
  const games = active.get(ctx.chatJid);
  if (!games) return false;
  const guess = ctx.text.trim().toLowerCase();

  // Quiz: erste richtige Antwort gewinnt
  if (games.quiz && guess) {
    if (Date.now() - games.quiz.startedAt > config.games.quizTimeoutMs) {
      const solution = games.quiz.item.a[0];
      delete games.quiz;
      await ctx.reply(`⌛ Zeit um! Die richtige Antwort wäre gewesen: *${solution}*`);
      return false;
    }
    if (quizAnswerMatches(games.quiz.item.a, guess)) {
      delete games.quiz;
      await addWin(ctx.chatJid, ctx.sender, 'quiz', ctx.senderName, {
        xp: config.games.xpRewardQuiz,
        coins: config.games.coinsRewardQuiz,
      });
      await ctx.reply(
        `🎉 Richtig, *${ctx.senderName}*! (+${config.games.xpRewardQuiz} XP, +${config.games.coinsRewardQuiz} 🪙)\nNeue Runde: \`!quiz\``
      );
      return true;
    }
    return false;
  }

  // Zahlenraten
  if (games.raten && /^\d+$/.test(guess)) {
    const g = games.raten;
    const num = parseInt(guess, 10);
    g.tries++;
    if (num === g.number) {
      delete games.raten;
      await addWin(ctx.chatJid, ctx.sender, 'raten', ctx.senderName, {
        xp: config.games.xpRewardRaten,
        coins: config.games.coinsRewardRaten,
      });
      await ctx.reply(
        `🎉 *${ctx.senderName}* hat es erraten: Die Zahl war *${g.number}*! ` +
        `(${g.tries} Versuche, +${config.games.xpRewardRaten} XP, +${config.games.coinsRewardRaten} 🪙)`
      );
    } else if (g.tries >= config.games.ratenMaxTries) {
      delete games.raten;
      await ctx.reply(`😅 Das war Versuch ${g.tries} — Runde vorbei! Die Zahl war *${g.number}*. Neue Runde: \`!raten\``);
    } else {
      await ctx.reply(num < g.number ? `📈 *Höher!* (Versuch ${g.tries}/${config.games.ratenMaxTries})` : `📉 *Tiefer!* (Versuch ${g.tries}/${config.games.ratenMaxTries})`);
    }
    return true;
  }

  return false;
}
