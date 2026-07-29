// src/commands/games/ttt.js
// !ttt / !setz (TicTacToe)

import { PREFIX, config } from '../../config.js';
import { resolveLid } from '../../permissions.js';
import { chatGames, addWin } from './index.js';

const TTT_CELLS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];
const TTT_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 4, 6],
  [0, 4, 8], [2, 4, 6],
];

function tttBoard(game) {
  const cell = (i) => (game.board[i] === 'X' ? '❌' : game.board[i] === 'O' ? '⭕' : TTT_CELLS[i]);
  return `${cell(0)}${cell(1)}${cell(2)}\n${cell(3)}${cell(4)}${cell(5)}\n${cell(6)}${cell(7)}${cell(8)}`;
}

function tttWinner(board) {
  for (const [a, b, c] of TTT_LINES) {
    if (board[a] && board[a] === board[b] && board[b] === board[c]) return board[a];
  }
  return board.every(Boolean) ? 'draw' : null;
}

function tttName(game, mark) {
  return mark === 'X' ? game.nameX : game.nameO;
}

export const tttCommand = {
  name: 'ttt',
  aliases: ['tictactoe'],
  group: 'games',
  desc: 'TicTacToe gegen eine andere Person',
  usage: '!ttt @gegner',
  groupOnly: true,
  async run(ctx) {
    const games = chatGames(ctx.chatJid);
    if (games.ttt && Date.now() - games.ttt.lastMoveAt < config.games.tttTimeoutMs) {
      return ctx.reply(`ℹ️ Hier läuft schon eine Partie:\n${tttBoard(games.ttt)}\nZug: \`${PREFIX}setz <1-9>\``);
    }
    const opponent = ctx.targetUser();
    if (!opponent) return ctx.reply(`ℹ️ Gegen wen? Erwähne die Person: \`${PREFIX}ttt @gegner\``);
    const me = resolveLid(ctx.sender);
    const them = resolveLid(opponent);
    if (me === them) return ctx.reply('😄 Gegen dich selbst? Das endet immer unentschieden.');
    games.ttt = {
      board: new Array(9).fill(null),
      playerX: me, playerO: them,
      nameX: ctx.senderName, nameO: ctx.mentionTag(opponent),
      turn: 'X', lastMoveAt: Date.now(),
    };
    return ctx.reply(
      `🎮 *TicTacToe:* ❌ *${ctx.senderName}* vs ⭕ ${ctx.mentionTag(opponent)}\n\n${tttBoard(games.ttt)}\n\n` +
      `❌ *${ctx.senderName}* beginnt — Zug mit \`${PREFIX}setz <1-9>\``,
      [opponent]
    );
  },
};

export const setzCommand = {
  name: 'setz',
  aliases: ['set'],
  group: 'games',
  desc: 'Setzt deinen TicTacToe-Zug (Feld 1–9)',
  usage: '!setz 5',
  groupOnly: true,
  async run(ctx) {
    const games = chatGames(ctx.chatJid);
    const game = games.ttt;
    if (!game) return ctx.reply(`ℹ️ Gerade läuft kein TicTacToe. Starten: \`${PREFIX}ttt @gegner\``);
    if (Date.now() - game.lastMoveAt > config.games.tttTimeoutMs) {
      delete games.ttt;
      return ctx.reply(`⌛ Die alte Partie ist verfallen. Neue Runde: \`${PREFIX}ttt @gegner\``);
    }
    const me = resolveLid(ctx.sender);
    const currentPlayer = game.turn === 'X' ? game.playerX : game.playerO;
    const isParticipant = me === game.playerX || me === game.playerO;
    if (!isParticipant) return ctx.reply('⛔ Diese Partie spielen gerade zwei andere!');
    if (me !== currentPlayer) return ctx.reply(`⏳ Nicht so hastig — *${tttName(game, game.turn)}* ist dran.`);

    const cell = parseInt(ctx.args[0] || '', 10) - 1;
    if (!(cell >= 0 && cell <= 8)) return ctx.reply(`ℹ️ Nutzung: \`${PREFIX}setz <1-9>\``);
    if (game.board[cell]) return ctx.reply('⚠️ Das Feld ist schon belegt!');

    game.board[cell] = game.turn;
    game.lastMoveAt = Date.now();
    const result = tttWinner(game.board);

    if (result === 'X' || result === 'O') {
      const winnerJid = result === 'X' ? game.playerX : game.playerO;
      const winnerName = tttName(game, result);
      delete games.ttt;
      await addWin(ctx.chatJid, winnerJid, 'ttt', ctx.senderName, {
        xp: config.games.xpRewardTtt,
        coins: config.games.coinsRewardTtt,
      });
      return ctx.reply(`${tttBoard({ board: game.board })}\n\n🏆 *${winnerName}* gewinnt! (+${config.games.xpRewardTtt} XP, +${config.games.coinsRewardTtt} 🪙)`);
    }
    if (result === 'draw') {
      delete games.ttt;
      return ctx.reply(`${tttBoard({ board: game.board })}\n\n🤝 *Unentschieden!*`);
    }
    game.turn = game.turn === 'X' ? 'O' : 'X';
    return ctx.reply(`${tttBoard(game)}\n\n${game.turn === 'X' ? '❌' : '⭕'} *${tttName(game, game.turn)}* ist dran — \`${PREFIX}setz <1-9>\``);
  },
};
