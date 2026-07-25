// Mini-Spiele: !wuerfel, !quiz, !raten, !galgen, !ttt — Spielstände sauber
// pro Gruppe getrennt. Laufende Runden liegen im RAM, Siege in game_scores (DB).
// Siege geben XP UND Coins (Economy-Anbindung).

import { PREFIX, config } from '../config.js';
import { dbRun, dbRows, bufferXp } from '../db.js';
import { resolveLid } from '../permissions.js';
import { earnCoins } from './economy.js';

// Laufende Spiele pro Chat: Map chatJid → { quiz?, raten? }
const active = new Map();

function chatGames(chatJid) {
  if (!active.has(chatJid)) active.set(chatJid, {});
  return active.get(chatJid);
}

const QUIZ = [
  { q: 'Wie viele Kontinente gibt es auf der Erde?', a: ['7', 'sieben'] },
  { q: 'Welches Element hat das Symbol „O"?', a: ['sauerstoff'] },
  { q: 'Wie heißt die Hauptstadt von Australien?', a: ['canberra'] },
  { q: 'Wie viele Minuten hat ein Tag?', a: ['1440'] },
  { q: 'Welcher Planet ist der Sonne am nächsten?', a: ['merkur'] },
  { q: 'In welchem Jahr fiel die Berliner Mauer?', a: ['1989'] },
  { q: 'Wie viele Saiten hat eine klassische Gitarre?', a: ['6', 'sechs'] },
  { q: 'Was ist das größte Säugetier der Welt?', a: ['blauwal'] },
  { q: 'Wie heißt der längste Fluss Deutschlands (nur in DE gemessen)?', a: ['rhein'] },
  { q: 'Wie viele Bundesländer hat Deutschland?', a: ['16', 'sechzehn'] },
  { q: 'Welches Tier ist das Wappentier Berlins?', a: ['bär', 'baer', 'bar'] },
  { q: 'Wie viele Herzen hat ein Oktopus?', a: ['3', 'drei'] },
  { q: 'Welche Farbe entsteht aus Blau und Gelb?', a: ['grün', 'gruen'] },
  { q: 'Wie heißt die kleinste Zahl im Dartboard-Zentrum (Bullseye)?', a: ['50', 'fünfzig', 'fuenfzig'] },
  { q: 'Wie viele Zeitzonen hat Russland (Stand 2026)?', a: ['11', 'elf'] },
  { q: 'Wie heißt die Hauptstadt von Kanada?', a: ['ottawa'] },
  { q: 'Welches chemische Element hat das Symbol „Au"?', a: ['gold'] },
  { q: 'Wie viele Beine hat eine Spinne?', a: ['8', 'acht'] },
  { q: 'Welcher Planet wird der „Rote Planet" genannt?', a: ['mars'] },
  { q: 'Wie viele Spieler stehen beim Fußball pro Team auf dem Platz?', a: ['11', 'elf'] },
  { q: 'Wie heißt der höchste Berg der Erde?', a: ['mount everest', 'everest'] },
  { q: 'In welchem Land steht der Schiefe Turm von Pisa?', a: ['italien'] },
  { q: 'Wie viele Tasten hat ein klassisches Klavier?', a: ['88'] },
  { q: 'Welches Meer liegt zwischen Europa und Afrika?', a: ['mittelmeer'] },
  { q: 'Wie heißt der längste Fluss der Welt (klassische Antwort)?', a: ['nil'] },
  { q: 'Wie viele Ecken hat ein Hexagon?', a: ['6', 'sechs'] },
  { q: 'Welches Tier ist das schnellste Landtier?', a: ['gepard'] },
  { q: 'Wie heißt die Währung in Japan?', a: ['yen'] },
  { q: 'Wie viele Monde hat der Mars?', a: ['2', 'zwei'] },
  { q: 'Welcher Komponist schrieb die „Mondscheinsonate"?', a: ['beethoven'] },
  { q: 'Wie viele Karten hat ein Skatblatt?', a: ['32'] },
  { q: 'Wie nennt man ein Tier, das Pflanzen UND Fleisch frisst?', a: ['allesfresser', 'omnivor'] },
  { q: 'Welches Land hat die meisten Einwohner (Stand 2026)?', a: ['indien'] },
  { q: 'Wie viele Milliliter hat ein Liter?', a: ['1000', 'tausend'] },
  { q: 'Welcher Vogel kann rückwärts fliegen?', a: ['kolibri'] },
  { q: 'Wie heißt die Angst vor Spinnen?', a: ['arachnophobie'] },
  { q: 'Aus welchem Land kommt die Pizza?', a: ['italien'] },
  { q: 'Wie viele Kontinente beginnen mit dem Buchstaben „A"?', a: ['3', 'drei'] },
  { q: 'Wie heißt das größte Organ des Menschen?', a: ['haut'] },
];

/** Sieg verbuchen: Score in DB + XP + Coins in einem Rutsch. */
async function addWin(chatJid, userJid, game, name, { xp = 0, coins = 0 } = {}) {
  const user = resolveLid(userJid);
  await dbRun(
    `INSERT INTO game_scores (group_jid, user_jid, game, wins, name) VALUES (?, ?, ?, 1, ?)
     ON CONFLICT(group_jid, user_jid, game) DO UPDATE SET wins = game_scores.wins + 1, name = excluded.name`,
    [chatJid, user, game, name || '']
  ).catch(() => {});
  if (xp > 0) bufferXp(chatJid, user, xp, name);
  if (coins > 0) await earnCoins(user, coins, name).catch(() => {});
}

// ── Galgenmännchen ─────────────────────────────────────────────────

const GALGEN_WOERTER = [
  'SCHMETTERLING', 'KUEHLSCHRANK', 'WASSERFALL', 'ABENTEUER', 'BIBLIOTHEK',
  'GEHEIMNIS', 'SONNENBLUME', 'REGENBOGEN', 'FLUGZEUG', 'SCHOKOLADE',
  'GEBURTSTAG', 'WELTREISE', 'COMPUTER', 'ELEFANT', 'UNIVERSUM',
  'PYRAMIDE', 'VULKAN', 'OZEAN', 'GITARRE', 'DSCHUNGEL',
  'KOMPASS', 'LEUCHTTURM', 'SATELLIT', 'MIKROSKOP', 'ORCHESTER',
  'LABYRINTH', 'HORIZONT', 'KRISTALL', 'MAGNET', 'TELESKOP',
];

const GALGEN_STAGES = [
  '```\n      \n      \n      \n      \n_____ \n```',
  '```\n  ┌── \n  │   \n  │   \n  │   \n__┴__ \n```',
  '```\n  ┌──┐\n  │  ○\n  │   \n  │   \n__┴__ \n```',
  '```\n  ┌──┐\n  │  ○\n  │  │\n  │   \n__┴__ \n```',
  '```\n  ┌──┐\n  │  ○\n  │ ─│\n  │   \n__┴__ \n```',
  '```\n  ┌──┐\n  │  ○\n  │ ─│─\n  │   \n__┴__ \n```',
  '```\n  ┌──┐\n  │  ○\n  │ ─│─\n  │ ╱ ╲\n__┴__ \n```',
];

function galgenBoard(game) {
  const shown = game.word
    .split('')
    .map((ch) => (game.guessed.has(ch) ? ch : '▁'))
    .join(' ');
  const wrong = [...game.wrong].join(', ') || '—';
  return (
    `${GALGEN_STAGES[game.wrong.size]}\n` +
    `📝 ${shown}\n` +
    `❌ Falsch: ${wrong} (${game.wrong.size}/${config.games.galgenMaxFails})`
  );
}

function galgenSolved(game) {
  return game.word.split('').every((ch) => game.guessed.has(ch));
}

// ── TicTacToe ──────────────────────────────────────────────────────

const TTT_CELLS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];
const TTT_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // Reihen
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // Spalten
  [0, 4, 8], [2, 4, 6], // Diagonalen
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

/** Antwort-Normalisierung: Satzzeichen weg, Artikel vorn weg, Leerraum glätten —
 * damit "Der Merkur!" genauso zählt wie "merkur". */
function normalizeGuess(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(der|die|das|den|dem|ein|eine|the) /, '');
}

/** Passt die Nutzer-Eingabe zu einer der Quiz-Antworten? */
export function quizAnswerMatches(answers, rawGuess) {
  const guess = normalizeGuess(rawGuess);
  if (!guess) return false;
  return answers.some((ans) => {
    const na = normalizeGuess(ans);
    if (!na) return false;
    if (guess === na) return true;
    // Antwort darf auch in einem Satz stecken ("es ist canberra") —
    // Mehrwort-Antworten als Teilstring, Einwort-Antworten als ganzes Wort.
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
    return false; // falsche Antworten laufen als normale Nachricht weiter
  }

  // Zahlenraten: nur reine Zahlen zählen als Versuch
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

export const gameCommands = [
  {
    name: 'wuerfel',
    aliases: ['würfel', 'dice'],
    group: 'games',
    desc: 'Würfelt — auch mehrere: !wuerfel 2d20',
    usage: '!wuerfel [seiten | NdM]',
    async run(ctx) {
      const arg = (ctx.args[0] || '6').toLowerCase();
      // RPG-Notation "2d20" = 2 Würfel mit 20 Seiten
      const nd = /^(\d{1,2})d(\d{1,4})$/.exec(arg);
      if (nd) {
        const count = Math.min(10, Math.max(1, parseInt(nd[1], 10)));
        const sides = Math.min(1000, Math.max(2, parseInt(nd[2], 10)));
        const rolls = Array.from({ length: count }, () => 1 + Math.floor(Math.random() * sides));
        const sum = rolls.reduce((a, b) => a + b, 0);
        return ctx.reply(`🎲 *${ctx.senderName}* wirft ${count}×W${sides}: [ ${rolls.join(' · ')} ] → Summe *${sum}*`);
      }
      let sides = parseInt(arg, 10);
      if (!Number.isFinite(sides) || sides < 2 || sides > 1000) sides = 6;
      const roll = 1 + Math.floor(Math.random() * sides);
      return ctx.reply(`🎲 *${ctx.senderName}* würfelt eine *${roll}* (1–${sides})`);
    },
  },
  {
    name: 'quiz',
    group: 'games',
    desc: 'Startet eine Quizfrage — wer zuerst richtig antwortet, gewinnt',
    usage: '!quiz',
    groupOnly: true,
    async run(ctx) {
      const games = chatGames(ctx.chatJid);
      if (games.quiz && Date.now() - games.quiz.startedAt < config.games.quizTimeoutMs) {
        return ctx.reply(`ℹ️ Es läuft schon eine Frage:\n❓ ${games.quiz.item.q}`);
      }
      const item = QUIZ[Math.floor(Math.random() * QUIZ.length)];
      games.quiz = { item, startedAt: Date.now() };
      return ctx.reply(`🎮 *Quiz-Zeit!*\n❓ ${item.q}\n_Einfach die Antwort in den Chat schreiben — ${Math.round(config.games.quizTimeoutMs / 1000)} s Zeit!_`);
    },
  },
  {
    name: 'raten',
    group: 'games',
    desc: `Zahlenraten (1–${config.games.ratenMax})`,
    usage: '!raten',
    groupOnly: true,
    async run(ctx) {
      const games = chatGames(ctx.chatJid);
      if (games.raten) {
        return ctx.reply(`ℹ️ Es läuft schon eine Runde (Versuch ${games.raten.tries}/${config.games.ratenMaxTries}) — einfach eine Zahl tippen!`);
      }
      games.raten = { number: 1 + Math.floor(Math.random() * config.games.ratenMax), tries: 0 };
      return ctx.reply(
        `🎮 *Zahlenraten!* Ich denke an eine Zahl zwischen *1 und ${config.games.ratenMax}*.\n_Schreib deine Vermutung als Zahl in den Chat — ihr habt ${config.games.ratenMaxTries} Versuche._`
      );
    },
  },
  {
    name: 'galgen',
    aliases: ['hangman'],
    group: 'games',
    desc: 'Galgenmännchen — Buchstaben raten mit !rate',
    usage: '!galgen',
    groupOnly: true,
    async run(ctx) {
      const games = chatGames(ctx.chatJid);
      if (games.galgen) {
        return ctx.reply(`ℹ️ Es läuft schon eine Runde!\n${galgenBoard(games.galgen)}\nRaten mit \`${PREFIX}rate <buchstabe>\``);
      }
      const word = GALGEN_WOERTER[Math.floor(Math.random() * GALGEN_WOERTER.length)];
      games.galgen = { word, guessed: new Set(), wrong: new Set(), startedAt: Date.now() };
      return ctx.reply(
        `🎮 *Galgenmännchen!* Gesucht: ein Wort mit *${word.length} Buchstaben*.\n` +
          `${galgenBoard(games.galgen)}\n` +
          `Raten: \`${PREFIX}rate <buchstabe>\` oder gleich \`${PREFIX}rate <wort>\``
      );
    },
  },
  {
    name: 'rate',
    group: 'games',
    desc: 'Rät einen Buchstaben/das Wort beim Galgenmännchen',
    usage: '!rate e',
    groupOnly: true,
    async run(ctx) {
      const games = chatGames(ctx.chatJid);
      const game = games.galgen;
      if (!game) return ctx.reply(`ℹ️ Gerade läuft kein Galgenmännchen. Starten: \`${PREFIX}galgen\``);
      // Umlaute auf die Schreibweise der Wortliste abbilden (KUEHLSCHRANK etc.)
      const input = (ctx.args[0] || '')
        .toUpperCase()
        .replace(/ß/g, 'SS')
        .replace(/Ä/g, 'AE').replace(/Ö/g, 'OE').replace(/Ü/g, 'UE');
      if (!/^[A-ZÄÖÜ]+$/.test(input)) {
        return ctx.reply(`ℹ️ Nutzung: \`${PREFIX}rate <buchstabe>\` oder \`${PREFIX}rate <ganzes wort>\``);
      }

      // Ganzes Wort geraten
      if (input.length > 1) {
        if (input === game.word) {
          delete games.galgen;
          await addWin(ctx.chatJid, ctx.sender, 'galgen', ctx.senderName, {
            xp: config.games.xpRewardGalgen,
            coins: config.games.coinsRewardGalgen,
          });
          return ctx.reply(
            `🎉 *${ctx.senderName}* löst es: *${game.word}*! (+${config.games.xpRewardGalgen} XP, +${config.games.coinsRewardGalgen} 🪙)`
          );
        }
        game.wrong.add('❓');
        if (game.wrong.size >= config.games.galgenMaxFails) {
          delete games.galgen;
          return ctx.reply(`${GALGEN_STAGES[GALGEN_STAGES.length - 1]}\n💀 Verloren! Das Wort war *${game.word}*. Revanche: \`${PREFIX}galgen\``);
        }
        return ctx.reply(`❌ „${input}" ist es nicht!\n${galgenBoard(game)}`);
      }

      // Einzelner Buchstabe
      const letter = input;
      if (game.guessed.has(letter) || game.wrong.has(letter)) {
        return ctx.reply(`ℹ️ „${letter}" wurde schon probiert!\n${galgenBoard(game)}`);
      }
      if (game.word.includes(letter)) {
        game.guessed.add(letter);
        if (galgenSolved(game)) {
          delete games.galgen;
          await addWin(ctx.chatJid, ctx.sender, 'galgen', ctx.senderName, {
            xp: config.games.xpRewardGalgen,
            coins: config.games.coinsRewardGalgen,
          });
          return ctx.reply(
            `🎉 Gelöst von *${ctx.senderName}*: *${game.word}*! (+${config.games.xpRewardGalgen} XP, +${config.games.coinsRewardGalgen} 🪙)`
          );
        }
        return ctx.reply(`✅ „${letter}" ist drin!\n${galgenBoard(game)}`);
      }
      game.wrong.add(letter);
      if (game.wrong.size >= config.games.galgenMaxFails) {
        delete games.galgen;
        return ctx.reply(`${GALGEN_STAGES[GALGEN_STAGES.length - 1]}\n💀 Verloren! Das Wort war *${game.word}*. Revanche: \`${PREFIX}galgen\``);
      }
      return ctx.reply(`❌ Kein „${letter}"!\n${galgenBoard(game)}`);
    },
  },
  {
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
  },
  {
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
        return ctx.reply(`⌛ Die alte Partie ist verfallen (zu lange kein Zug). Neue Runde: \`${PREFIX}ttt @gegner\``);
      }
      const me = resolveLid(ctx.sender);
      const currentPlayer = game.turn === 'X' ? game.playerX : game.playerO;
      const isParticipant = me === game.playerX || me === game.playerO;
      if (!isParticipant) return ctx.reply('⛔ Diese Partie spielen gerade zwei andere — warte auf die nächste Runde!');
      if (me !== currentPlayer) return ctx.reply(`⏳ Nicht so hastig — *${tttName(game, game.turn)}* (${game.turn === 'X' ? '❌' : '⭕'}) ist dran.`);

      const cell = parseInt(ctx.args[0] || '', 10) - 1;
      if (!(cell >= 0 && cell <= 8)) return ctx.reply(`ℹ️ Nutzung: \`${PREFIX}setz <1-9>\` — die Zahlen stehen auf dem Feld.`);
      if (game.board[cell]) return ctx.reply('⚠️ Das Feld ist schon belegt — such dir ein freies aus!');

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
        return ctx.reply(
          `${tttBoard({ board: game.board })}\n\n🏆 *${winnerName}* gewinnt! (+${config.games.xpRewardTtt} XP, +${config.games.coinsRewardTtt} 🪙)`
        );
      }
      if (result === 'draw') {
        delete games.ttt;
        return ctx.reply(`${tttBoard({ board: game.board })}\n\n🤝 *Unentschieden!* Starke Partie von beiden.`);
      }
      game.turn = game.turn === 'X' ? 'O' : 'X';
      return ctx.reply(
        `${tttBoard(game)}\n\n${game.turn === 'X' ? '❌' : '⭕'} *${tttName(game, game.turn)}* ist dran — \`${PREFIX}setz <1-9>\``
      );
    },
  },
  {
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
  },
];
