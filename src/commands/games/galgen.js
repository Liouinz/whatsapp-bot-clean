// src/commands/games/galgen.js
// !galgen / !rate (Galgenmännchen)

import { PREFIX, config } from '../../config.js';
import { chatGames, addWin } from './index.js';

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
  const shown = game.word.split('').map((ch) => (game.guessed.has(ch) ? ch : '▁')).join(' ');
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

export const galgenCommand = {
  name: 'galgen',
  aliases: ['hangman'],
  group: 'games',
  desc: 'Galgenmännchen — Buchstaben raten mit !rate',
  usage: '!galgen',
  groupOnly: true,
  async run(ctx) {
    const games = chatGames(ctx.chatJid);
    if (games.galgen) {
      return ctx.reply(`ℹ️ Es läuft schon eine Runde!\n${galgenBoard(games.galgen)}\nRaten mit \`${PREFIX}rate <Buchstabe>\``);
    }
    const word = GALGEN_WOERTER[Math.floor(Math.random() * GALGEN_WOERTER.length)];
    games.galgen = { word, guessed: new Set(), wrong: new Set(), startedAt: Date.now() };
    return ctx.reply(
      `🎮 *Galgenmännchen!* Gesucht: ein Wort mit *${word.length} Buchstaben*.\n` +
      `${galgenBoard(games.galgen)}\n` +
      `Raten: \`${PREFIX}rate <Buchstabe>\` oder gleich \`${PREFIX}rate <Wort>\``
    );
  },
};

export const rateCommand = {
  name: 'rate',
  group: 'games',
  desc: 'Rät einen Buchstaben/das Wort beim Galgenmännchen',
  usage: '!rate e',
  groupOnly: true,
  async run(ctx) {
    const games = chatGames(ctx.chatJid);
    const game = games.galgen;
    if (!game) return ctx.reply(`ℹ️ Gerade läuft kein Galgenmännchen. Starten: \`${PREFIX}galgen\``);
    
    const input = (ctx.args[0] || '').toUpperCase()
      .replace(/ß/g, 'SS')
      .replace(/Ä/g, 'AE').replace(/Ö/g, 'OE').replace(/Ü/g, 'UE');
    
    if (!/^[A-ZÄÖÜ]+$/.test(input)) {
      return ctx.reply(`ℹ️ Nutzung: \`${PREFIX}rate <Buchstabe>\` oder \`${PREFIX}rate <Wort>\``);
    }

    // Ganzes Wort geraten
    if (input.length > 1) {
      if (input === game.word) {
        delete games.galgen;
        await addWin(ctx.chatJid, ctx.sender, 'galgen', ctx.senderName, {
          xp: config.games.xpRewardGalgen,
          coins: config.games.coinsRewardGalgen,
        });
        return ctx.reply(`🎉 *${ctx.senderName}* löst es: *${game.word}*! (+${config.games.xpRewardGalgen} XP, +${config.games.coinsRewardGalgen} 🪙)`);
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
        return ctx.reply(`🎉 Gelöst von *${ctx.senderName}*: *${game.word}*! (+${config.games.xpRewardGalgen} XP, +${config.games.coinsRewardGalgen} 🪙)`);
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
};
