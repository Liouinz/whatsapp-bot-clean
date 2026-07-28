export default {
  name: 'quests',
  aliases: ['missionen'],
  description: 'Zeigt deine aktiven täglichen Quests an',
  category: 'economy',
  async run(ctx) {
    await ctx.reply('📜 *Deine Quests*\n- Schreibe 10 Nachrichten (0/10) - 200 🪙');
  }
};
