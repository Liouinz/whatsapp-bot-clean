// src/commands/games/raten.js
// !raten (Zahlenraten)

import { config } from '../../config.js';
import { chatGames } from './index.js';

export const ratenCommand = {
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
};
