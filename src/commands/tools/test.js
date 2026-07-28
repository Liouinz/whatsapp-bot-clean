export default {
  name: 'test',
  aliases: ['t'],
  description: 'Testet das Command-System',
  category: 'tools',
  async run(ctx) {
    await ctx.reply('Command-System funktioniert.');
  }
};
