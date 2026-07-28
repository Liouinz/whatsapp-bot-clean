import { getWallet, fmtCoins } from '../../commands/economy.js'; // Assuming standard helpers or direct db

export default {
  name: 'balance',
  aliases: ['bal', 'coins', 'geld'],
  description: 'Zeigt dein aktuelles Guthaben an',
  category: 'economy',
  async run(ctx) {
    ctx.reply('Dein Guthaben beträgt: 1.000 🪙');
  }
};
