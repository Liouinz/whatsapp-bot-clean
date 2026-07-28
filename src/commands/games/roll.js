export default {
  name: 'roll',
  aliases: ['wuerfel', 'dice'],
  description: 'Würfelt eine Zahl zwischen 1 und 6',
  category: 'games',
  async run(ctx) {
    const roll = Math.floor(Math.random() * 6) + 1;
    await ctx.reply(`🎲 Du hast eine ${roll} gewürfelt!`);
  }
};
