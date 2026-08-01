// src/commands/games/wuerfel.js
// !wuerfel / !würfel / !dice

export const wuerfelCommand = {
  name: 'wuerfel',
  aliases: ['würfel', 'dice', 'roll'],
  group: 'games',
  desc: 'Würfelt — auch mehrere: !wuerfel 2d20',
  usage: '!wuerfel [seiten | NdM]',
  async run(ctx) {
    const arg = (ctx.args[0] || '6').toLowerCase();
    const nd = /^(\d{1,2})d(\d{1,4})$/.exec(arg);
    if (nd) {
      const count = Math.min(10, Math.max(1, parseInt(nd[1], 10)));
      const sides = Math.min(1000, Math.max(2, parseInt(nd[2], 10)));
      const rolls = Array.from({ length: count }, () => 1 + Math.floor(Math.random() * sides));
      const sum = rolls.reduce((a, b) => a + b, 0);
      return ctx.reply(`🎲 *${ctx.senderName}* wirft ${count}×W${sides}: [ ${rolls.join(' · ')} ] → Summe *${sum}*`);
    }
    let sides = parseInt(arg, 10);
    if (!Number.isFinite(sides) || sides < 2 || sides > 1000) sides = 6;
    const roll = 1 + Math.floor(Math.random() * sides);
    return ctx.reply(`🎲 *${ctx.senderName}* würfelt eine *${roll}* (1–${sides})`);
  },
};
