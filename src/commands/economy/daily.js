export default {
  name: 'daily',
  aliases: ['abholen'],
  description: 'Hol dir deine tägliche Belohnung ab',
  category: 'economy',
  async run(ctx) {
    await ctx.reply('🎁 Du hast deine tägliche Belohnung von 500 🪙 erhalten!');
  }
};
