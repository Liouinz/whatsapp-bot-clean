// src/commands/games/quiz.js
// !quiz

import { config } from '../../config.js';
import { chatGames } from './index.js';

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

export const quizCommand = {
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
};
