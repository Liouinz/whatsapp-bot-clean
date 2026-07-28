export default {
  name: 'prestige',
  aliases: ['resetlevel'],
  description: 'Erhöhe dein Prestige-Level',
  category: 'economy',
  async run(ctx) {
    await ctx.reply('✨ Du benötigst Level 50, um Prestige auszuführen.');
  }
};
