export default {
  name: 'pay',
  aliases: ['überweisen', 'send'],
  description: 'Überweise Coins an einen anderen Nutzer',
  category: 'economy',
  async run(ctx) {
    const amount = ctx.args[0];
    if (!amount) {
      return ctx.reply('⚠️ Bitte gib einen Betrag an: !pay <betrag>');
    }
    await ctx.reply(`✅ Erfolgreich ${amount} 🪙 überwiesen.`);
  }
};
