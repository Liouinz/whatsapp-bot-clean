export default {
  name: 'warn',
  aliases: ['verwarnen'],
  description: 'Verwarnt einen Nutzer',
  category: 'admin',
  async run(ctx) {
    await ctx.reply('⚠️ Nutzer wurde verwarnt.');
  }
};
