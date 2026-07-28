export default {
  name: 'help',
  aliases: ['h', 'hilfe'],
  description: 'Zeigt die Hilfe und verfügbare Befehle an',
  category: 'tools',
  async run(ctx) {
    await ctx.reply('🤖 *Community Bot Hilfe*\n\nVerfügbare Kategorien:\n- !test\n- !balance\n- !help');
  }
};
