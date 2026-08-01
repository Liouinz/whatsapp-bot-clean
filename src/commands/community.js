// Community-Befehle: Hilfe, Info, Regeln, Statistiken, Ping.

import { BOT_NAME, PREFIX } from '../config.js';
import { dbRun, dbRows } from '../db.js';
import { state } from '../state.js';
import { getGroupSettings, invalidateSettings } from '../moderation.js';
import { getAiQuota } from '../ai.js';
import { listCustom } from './custom.js';

const GROUP_TITLES = {
  admin: '🛡️ *Admin & Moderation*',
  community: '👥 *Community*',
  economy: '💰 *Coins & Shop*',
  tools: '🧰 *Tools*',
  games: '🎮 *Spiele & Spaß*',
};

function fmtUptime(ms) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d} T ${h} Std` : h > 0 ? `${h} Std ${m} Min` : `${m} Min`;
}

export const communityCommands = [
  {
    name: 'hilfe',
    aliases: ['help', 'menu', 'h'],
    group: 'community',
    desc: 'Zeigt alle Befehle, schön gruppiert',
    usage: '!hilfe [befehl]',
    async run(ctx) {
      if (ctx.args[0]) {
        const name = ctx.args[0].replace(PREFIX, '').toLowerCase();
        const cmd = ctx.registry.find((c) => c.name === name || c.aliases?.includes(name));
        if (!cmd) return ctx.reply(`⚠️ Den Befehl \`${PREFIX}${name}\` kenne ich nicht. Probier \`${PREFIX}hilfe\`.`);
        return ctx.reply(
          `ℹ️ *${PREFIX}${cmd.name}*\n${cmd.desc}\n\n📝 Nutzung: \`${cmd.usage}\`` +
            (cmd.adminOnly ? '\n⛔ Nur für Admins.' : '') +
            (cmd.ownerOnly ? '\n⛔ Nur für den Owner.' : '')
        );
      }

      const isAdmin = await ctx.isAdmin();
      const groups = ['community', 'economy', 'tools', 'games', ...(isAdmin ? ['admin'] : [])];
      let text = `🤖 *${BOT_NAME} — Hilfe*\n_Präfix: ${PREFIX} · z. B. ${PREFIX}ping_\n`;
      for (const g of groups) {
        const cmds = ctx.registry.filter((c) => c.group === g && !c.hidden);
        if (!cmds.length) continue;
        text += `\n${GROUP_TITLES[g]}\n`;
        text += cmds.map((c) => `• \`${PREFIX}${c.name}\` — ${c.desc}`).join('\n') + '\n';
      }
      const { commands: customCmds, faqs } = listCustom();
      if (customCmds.length + faqs.length > 0) {
        text += `\n✨ *Eigene Befehle:* \`${PREFIX}cmds\` zeigt ${customCmds.length + faqs.length} weitere\n`;
      }
      text += `\nℹ️ Details: \`${PREFIX}hilfe <befehl>\``;
      if (!isAdmin) text += `\n_Admins sehen mit ${PREFIX}hilfe zusätzlich die Moderations-Befehle._`;
      text += `\n\n— _${BOT_NAME}_`;
      return ctx.reply(text);
    },
  },
  {
    name: 'info',
    group: 'community',
    desc: 'Infos über den Bot',
    usage: '!info',
    async run(ctx) {
      const quota = getAiQuota();
      return ctx.reply(
        `🤖 *${BOT_NAME}*\n` +
          `Dein Community-Assistent: Moderation, Level-System, Tools & Spiele.\n\n` +
          `• ⏱️ Online seit: ${fmtUptime(Date.now() - state.startedAt)}\n` +
          `• 📨 Heute gesendet: ${state.sentToday} Nachrichten\n` +
          `• 🤖 KI-Aufrufe heute: ${quota.used}/${quota.limit}\n\n` +
          `Alle Befehle: \`${PREFIX}hilfe\`\n\n— _${BOT_NAME}_`
      );
    },
  },
  {
    name: 'regeln',
    group: 'community',
    desc: 'Zeigt die Gruppenregeln',
    usage: '!regeln',
    groupOnly: true,
    async run(ctx) {
      const settings = await getGroupSettings(ctx.chatJid);
      if (!settings.rules) {
        return ctx.reply(`ℹ️ Für diese Gruppe sind noch keine Regeln hinterlegt.\n_Admins: \`${PREFIX}setregeln <text>\`_`);
      }
      return ctx.reply(`📜 *Gruppenregeln*\n\n${settings.rules}\n\n— _${BOT_NAME}_`);
    },
  },
  {
    name: 'setregeln',
    group: 'admin',
    desc: 'Setzt die Gruppenregeln',
    usage: '!setregeln <text>',
    adminOnly: true,
    groupOnly: true,
    async run(ctx) {
      const text = ctx.argText.trim();
      if (!text) return ctx.reply('ℹ️ Nutzung: `!setregeln <text>` (Zeilenumbrüche sind erlaubt)');
      await dbRun('UPDATE group_settings SET rules = ? WHERE jid = ?', [text.slice(0, 2000), ctx.chatJid]);
      invalidateSettings(ctx.chatJid);
      return ctx.reply('✅ Die Gruppenregeln wurden gespeichert. Anzeigen mit `!regeln`.');
    },
  },
  {
    name: 'stats',
    group: 'community',
    desc: 'Statistiken dieser Gruppe',
    usage: '!stats',
    groupOnly: true,
    async run(ctx) {
      const [top] = await dbRows(
        'SELECT COUNT(*) AS users, COALESCE(SUM(messages),0) AS msgs, COALESCE(SUM(xp),0) AS xp FROM xp WHERE group_jid = ?',
        [ctx.chatJid]
      );
      const warns = await dbRows(
        'SELECT COUNT(*) AS c FROM warnings WHERE group_jid = ? AND expires_at > ?',
        [ctx.chatJid, Date.now()]
      );
      const meta = await ctx.groupMeta();
      return ctx.reply(
        `📊 *Statistik — ${meta?.subject || 'diese Gruppe'}*\n` +
          `• 👥 Mitglieder: ${meta?.participants?.length ?? '?'}\n` +
          `• 💬 Gezählte Nachrichten: ${top?.msgs ?? 0}\n` +
          `• ⭐ Aktive Mitglieder (mit XP): ${top?.users ?? 0}\n` +
          `• ⚠️ Aktive Verwarnungen: ${warns[0]?.c ?? 0}\n\n` +
          `Rangliste: \`${PREFIX}leaderboard\``
      );
    },
  },
  {
    name: 'ping',
    aliases: ['p'],
    group: 'community',
    desc: 'Lebt der Bot? (Antwortzeit)',
    usage: '!ping',
    async run(ctx) {
      const t0 = Date.now();
      await ctx.reply(`🏓 *Pong!* (${Date.now() - t0}ms)`);
    },
  },
];
