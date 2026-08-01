export default {
  name: 'status',
  description: 'Zeigt den Systemstatus des Bots an',
  category: 'tools',
  async run(ctx) {
    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    await ctx.reply(`🟢 *System Status*\n- Uptime: ${hours}h ${minutes}m\n- Node.js: ${process.version}\n- Status: Online & Verbunden`);
  }
};
