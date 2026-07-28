export default {
  name: 'shop',
  aliases: ['laden'],
  description: 'Zeigt den Shop und kaufbare Items an',
  category: 'economy',
  async run(ctx) {
    await ctx.reply('🛒 *Shop*\n1. VIP Status (5.000 🪙) - !buy vip\n2. Doppel-XP (2.500 🪙) - !buy boost');
  }
};
