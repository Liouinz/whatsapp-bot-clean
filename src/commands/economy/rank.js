export default {
  name: 'rank',
  aliases: ['level', 'xp'],
  description: 'Zeigt dein aktuelles Level und XP an',
  category: 'economy',
  async run(ctx) {
    await ctx.reply('⭐ *Dein Rang*\n- Level: 5\n- XP: 1.250 / 2.000');
  }
};
