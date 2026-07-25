// !event — Status ansehen (jeder), Events starten/stoppen (Admins).
// Der Effekt (globaler XP/Coin-Multiplikator) gilt bot-weit für alle.

import { PREFIX } from '../config.js';
import { EVENTS, getEvent } from '../data/events.js';
import { getActiveEvent, setEvent, stopEvent, eventBanner, announceToGroups } from '../events.js';

export const eventCommands = [
  {
    name: 'event',
    aliases: ['events'],
    group: 'community',
    desc: 'Aktuelles Event ansehen · Admins: starten/stoppen',
    usage: '!event [liste | start <id> [std] | stop]',
    async run(ctx) {
      const sub = (ctx.args[0] || '').toLowerCase();

      // ── Liste verfügbarer Events ──
      if (sub === 'liste' || sub === 'list') {
        const lines = EVENTS.map(
          (e) => `${e.emoji} \`${e.id}\` *${e.name}* — ${e.desc} _(${e.defaultHours}h)_`
        );
        return ctx.reply(`🎪 *Verfügbare Events*\n${lines.join('\n')}\n\n_Admins:_ \`${PREFIX}event start <id> [stunden]\``);
      }

      // ── Admin: Event starten ──
      if (sub === 'start') {
        if (!(await ctx.isAdmin())) return ctx.reply('⛔ Nur Admins können Events starten.');
        const def = getEvent(ctx.args[1]);
        if (!def) return ctx.reply(`ℹ️ Unbekanntes Event. Liste: \`${PREFIX}event liste\``);
        const hours = Math.min(168, Math.max(0.25, parseFloat(ctx.args[2]) || def.defaultHours));
        const ev = await setEvent(def, hours);
        await announceToGroups(`${eventBanner(ev)}\n\n_Gestartet von ${ctx.senderName}._`);
        return ctx.reply(`✅ Event *${def.name}* läuft jetzt für ${hours} Std — bot-weit angekündigt! ${def.emoji}`);
      }

      // ── Admin: Event stoppen ──
      if (sub === 'stop' || sub === 'stopp') {
        if (!(await ctx.isAdmin())) return ctx.reply('⛔ Nur Admins können Events stoppen.');
        if (!getActiveEvent()) return ctx.reply('ℹ️ Gerade läuft kein Event.');
        await stopEvent();
        return ctx.reply('🛑 Event beendet.');
      }

      // ── Status ──
      const ev = getActiveEvent();
      if (!ev) {
        return ctx.reply(
          `😴 Gerade läuft kein Event.\n_Verfügbare:_ \`${PREFIX}event liste\`\n` +
            `⭐ Am Wochenende startet automatisch das Double-XP-Event!`
        );
      }
      return ctx.reply(eventBanner(ev));
    },
  },
];
