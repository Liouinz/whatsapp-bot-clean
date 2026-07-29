// src/commands/games/blackjack.js
// !blackjack <einsatz> / !hit / !stand

import { config } from '../../config.js';
import { resolveLid } from '../../permissions.js';
import { earnCoins, getWallet, takeCoins } from '../economy.js';
import { chatGames, addWin } from './index.js';

const DECK = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const SUITS = ['♠', '♥', '♦', '♣'];

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const card of DECK) deck.push({ card, suit });
  }
  // Fisher-Yates Shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function cardValue(card) {
  if (['J', 'Q', 'K'].includes(card)) return 10;
  if (card === 'A') return 11;
  return parseInt(card, 10);
}

function handValue(hand) {
  let value = 0;
  let aces = 0;
  for (const c of hand) {
    value += cardValue(c.card);
    if (c.card === 'A') aces++;
  }
  while (value > 21 && aces > 0) {
    value -= 10;
    aces--;
  }
  return value;
}

function formatHand(hand, hideFirst = false) {
  if (hideFirst) return `🂠 ${hand.slice(1).map(c => `${c.suit}${c.card}`).join(' ')}`;
  return hand.map(c => `${c.suit}${c.card}`).join(' ');
}

export const blackjackCommand = {
  name: 'blackjack',
  aliases: ['bj', '21'],
  group: 'games',
  desc: 'Blackjack spielen — !blackjack <einsatz>',
  usage: '!blackjack 100',
  groupOnly: true,
  async run(ctx) {
    const games = chatGames(ctx.chatJid);
    if (games.blackjack) {
      return ctx.reply(`ℹ️ Du hast schon eine Runde laufen!\n${formatHand(games.blackjack.playerHand)}\n\`!hit\` oder \`!stand\``);
    }

    const bet = parseInt(ctx.args[0] || '', 10);
    if (!bet || bet < config.economy.betMin || bet > config.economy.betMax) {
      return ctx.reply(`ℹ️ Nutzung: \`!blackjack <einsatz>\` (min ${config.economy.betMin}, max ${config.economy.betMax} 🪙)`);
    }

    const user = resolveLid(ctx.sender);
    // FIX: getWallet statt getBalance
    const wallet = await getWallet(user);
    const balance = Number(wallet.balance);
    if (balance < bet) return ctx.reply(`❌ Nicht genug Coins! Du hast ${balance} 🪙.`);

    // FIX: takeCoins statt removeCoins
    if (!(await takeCoins(user, bet))) return ctx.reply(`❌ Fehler beim Abbuchen der Coins.`);

    const deck = createDeck();
    const playerHand = [deck.pop(), deck.pop()];
    const dealerHand = [deck.pop(), deck.pop()];

    const playerValue = handValue(playerHand);
    const dealerValue = handValue(dealerHand);

    // Blackjack Check
    if (playerValue === 21) {
      if (dealerValue === 21) {
        await earnCoins(user, bet); // Push — Einsatz zurück
        return ctx.reply(`🃏 *Blackjack!* Beide haben 21!\nDu: ${formatHand(playerHand)} (${playerValue})\nDealer: ${formatHand(dealerHand)} (${dealerValue})\nEinsatz zurück: ${bet} 🪙`);
      }
      const winAmount = Math.floor(bet * 2.5);
      await earnCoins(user, winAmount);
      await addWin(ctx.chatJid, ctx.sender, 'blackjack', ctx.senderName, {
        xp: config.games.xpRewardQuiz,
        coins: winAmount - bet,
      });
      return ctx.reply(`🃏 *BLACKJACK!* ${formatHand(playerHand)}\nDu gewinnst *${winAmount} 🪙* (3:2 Auszahlung)!`);
    }

    games.blackjack = {
      playerHand, dealerHand, deck, bet,
      user, startedAt: Date.now(),
    };

    return ctx.reply(
      `🃏 *Blackjack*\n` +
      `Deine Hand: ${formatHand(playerHand)} (*${playerValue}*)\n` +
      `Dealer: ${formatHand(dealerHand, true)}\n\n` +
      `\`!hit\` — Karte ziehen\n` +
      `\`!stand\` — Halten`
    );
  },
};

export const hitCommand = {
  name: 'hit',
  aliases: ['karte', 'card'],
  group: 'games',
  desc: 'Zieht eine Karte beim Blackjack',
  usage: '!hit',
  groupOnly: true,
  async run(ctx) {
    const games = chatGames(ctx.chatJid);
    const game = games.blackjack;
    if (!game) return ctx.reply('ℹ️ Keine laufende Blackjack-Runde. Starten: `!blackjack <einsatz>`');
    if (resolveLid(ctx.sender) !== game.user) return ctx.reply('⛔ Das ist nicht deine Runde!');

    game.playerHand.push(game.deck.pop());
    const value = handValue(game.playerHand);

    if (value > 21) {
      delete games.blackjack;
      return ctx.reply(
        `💥 *Bust!* ${formatHand(game.playerHand)} (${value})\n` +
        `Du hast verloren — ${game.bet} 🪙 sind weg.`
      );
    }

    return ctx.reply(
      `🃏 Deine Hand: ${formatHand(game.playerHand)} (*${value}*)\n` +
      `Dealer: ${formatHand(game.dealerHand, true)}\n\n` +
      `\`!hit\` oder \`!stand\``
    );
  },
};

export const standCommand = {
  name: 'stand',
  aliases: ['halten', 'stay'],
  group: 'games',
  desc: 'Hält beim Blackjack',
  usage: '!stand',
  groupOnly: true,
  async run(ctx) {
    const games = chatGames(ctx.chatJid);
    const game = games.blackjack;
    if (!game) return ctx.reply('ℹ️ Keine laufende Blackjack-Runde. Starten: `!blackjack <einsatz>`');
    if (resolveLid(ctx.sender) !== game.user) return ctx.reply('⛔ Das ist nicht deine Runde!');

    // Dealer zieht bis 17
    while (handValue(game.dealerHand) < 17) {
      game.dealerHand.push(game.deck.pop());
    }

    const playerValue = handValue(game.playerHand);
    const dealerValue = handValue(game.dealerHand);

    delete games.blackjack;

    let result = '';
    let winAmount = 0;

    if (dealerValue > 21) {
      winAmount = game.bet * 2;
      result = `Dealer bustet mit ${dealerValue}! Du gewinnst *${winAmount} 🪙*!`;
    } else if (playerValue > dealerValue) {
      winAmount = game.bet * 2;
      result = `Du gewinnst! *${winAmount} 🪙*!`;
    } else if (playerValue === dealerValue) {
      winAmount = game.bet;
      await earnCoins(game.user, winAmount);
      result = `Push! Einsatz zurück: *${winAmount} 🪙*`;
      return ctx.reply(`🃏 *Ergebnis*\nDu: ${formatHand(game.playerHand)} (${playerValue})\nDealer: ${formatHand(game.dealerHand)} (${dealerValue})\n${result}`);
    } else {
      result = `Dealer gewinnt — ${game.bet} 🪙 verloren.`;
    }

    if (winAmount > game.bet) {
      await earnCoins(game.user, winAmount);
      await addWin(ctx.chatJid, ctx.sender, 'blackjack', ctx.senderName, {
        xp: config.games.xpRewardQuiz,
        coins: winAmount - game.bet,
      });
    }

    return ctx.reply(
      `🃏 *Ergebnis*\n` +
      `Du: ${formatHand(game.playerHand)} (${playerValue})\n` +
      `Dealer: ${formatHand(game.dealerHand)} (${dealerValue})\n` +
      `${result}`
    );
  },
};
