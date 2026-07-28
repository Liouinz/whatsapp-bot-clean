export default {
  name: 'ping',
  aliases: ['p'],
  description: 'Misst die Bot-Latenz',
  category: 'tools',
  async run(ctx) {
    const start = Date.now();
    await ctx.reply(`Pong! 🏓 (${Date.now() - start}ms)`);
  }
};
