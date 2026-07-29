// src/commands/games.js
// Thin-Wrapper: exportiert alle Spiel-Befehle aus dem games/-Ordner

export { active, chatGames, addWin, checkGameAnswer } from './games/index.js';
export { quizAnswerMatches } from './games/index.js';

import { wuerfelCommand } from './games/wuerfel.js';
import { quizCommand } from './games/quiz.js';
import { ratenCommand } from './games/raten.js';
import { galgenCommand, rateCommand } from './games/galgen.js';
import { tttCommand, setzCommand } from './games/ttt.js';
import { spielstandCommand } from './games/spielstand.js';
import { blackjackCommand, hitCommand, standCommand } from './games/blackjack.js';

export const gameCommands = [
  wuerfelCommand,
  quizCommand,
  ratenCommand,
  galgenCommand,
  rateCommand,
  tttCommand,
  setzCommand,
  spielstandCommand,
  blackjackCommand,
  hitCommand,
  standCommand,
];
