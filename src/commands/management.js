// Verwaltung: Rollen-Anzeige, globale System-Schalter, Gruppen-Verwaltung,
// Bot-Status und Wartungsmodus. Globale Befehle sind BOT_OWNER-only.

import os from 'node:os';
import { BOT_NAME, PREFIX } from '../config.js';
import { state } from '../state.js';
import { dbRun, dbRows } from '../db.js';
import { queueLength } from '../queue.js';
import { getRoleLevel, ROLE, ROLE_LABEL, getGroupMeta } from '../permissions.js';
import { getGroupSettings, invalidateSettings } from '../moderation.js';
import { setGlobalFlag, getGlobalFlag } from '../global.js';
import { announceToGroups } from '../events.js';

const onoff = (v) => (v ? 'AN ✅' : 'AUS ⛔');
const parseOnOff = (w) => (/^(an|on|1|ein)$/i.test(w) ? true : /^(aus|off|0)$/i.test(w) ? false : null);
const fmtBytes = (b) => `${(b / 1024 / 1024).toFixed(0)} MB`;
const fmtUptime = (ms) => {
  const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d}T ${h}Std` : h > 0 ? `${h}Std ${m}Min` : `${m}Min`;
};

const GROUP_SYSTEMS = { antilink: 'antilink', antispam: 'antispam', welcome: 'welcome', levelup: 'levelup_announce' };
const GLOBAL_SYSTEMS = { xp: 'system_xp', spiele: 'system_spiele', economy: 'system_economy' };

export function isActivationCommand(text) {
  const t = String(text || '').trim().toLowerCase().replace(/^[!\/]+/, '').replace(/\s+/g, ' ').trim();
  return /^(setup|enable|aktivieren|activate|freischalten)$/.test(t) ||
    /^bot (on|an|enable|aktivieren|freischalten)$/.test(t);
}

export async function activateGroup(jid) {
  await dbRun('INSERT OR IGNORE INTO group_settings (jid, enabled) VALUES (?, 1)', [jid]);
  await dbRun('UPDATE group_settings SET enabled = 1 WHERE jid = ?', [jid]);
  invalidateSettings(jid);
}

export const managementCommands = [
  {
    name: 'setup',
    aliases: ['enable', 'aktivieren', 'activate', 'freischalten'],
    group: 'admin',
    desc: 'Bot in dieser Gruppe freischalten (nur Owner)',
    usage: '!setup',
    ownerOnly: true,
    groupOnly: true,
    async run(ctx) {
      await activateGroup(ctx.chatJid);
      return ctx.reply('✅ Bot in dieser Gruppe *freigeschaltet*. Alle Funktionen stehen jetzt bereit — Übersicht: `!hilfe`');
    },
  },
  {
    name: 'rolle',
    aliases: ['role', 'whoami', 'meinerolle'],
    group: 'community',
    desc: 'Zeigt deine Rolle im Bot',
    usage: '!rolle',
    async run(ctx) {
      const level = await ctx.role();
      return ctx.reply(`🪪 *${ctx.senderName}* — deine Rolle: *${ROLE_LABEL[level]}*`);
    },
  },
  {
    name: 'botstatus',
    aliases: ['botstate', 'sysinfo'],
    group: 'admin',
    desc: 'Bot- & Server-Status (Uptime, RAM, CPU, Queue)',
    usage: '!botstatus',
    ownerOnly: true,
    async run(ctx) {
      const mem = process.memoryUsage();
      const load = os.loadavg()[0];
      const groups = await dbRows('SELECT COUNT(*) AS c FROM group_settings', []).catch(() => [{ c: '?' }]);
      const wartung = getGlobalFlag('maintenance');
      return ctx.reply(
        `🖥️ *${BOT_NAME} — System-Status*\n` +
          `• Verbindung: ${state.connection === 'open' ? 'verbunden ✅' : state.connection}\n` +
          `• Uptime: ${fmtUptime(Date.now() - state.startedAt)}\n` +
          `• RAM (Prozess): ${fmtBytes(mem.rss)} · Heap ${fmtBytes(mem.heapUsed)}/${fmtBytes(mem.heapTotal)}\n` +
          `• Server-RAM frei: ${fmtBytes(os.freemem())} / ${fmtBytes(os.totalmem())}\n` +
          `• CPU-Last (1 Min): ${load.toFixed(2)} · Kerne: ${os.cpus().length}\n` +
          `• Sende-Queue: ${queueLength()} · Gruppen: ${groups[0]?.c ?? '?'}\n` +
          `• Systeme: XP ${onoff(getGlobalFlag('system_xp'))} · Spiele ${onoff(getGlobalFlag('system_spiele'))} · Economy ${onoff(getGlobalFlag('system_economy'))}\n` +
          (wartung ? '⚠️ *WARTUNGSMODUS AKTIV* — nur Bot-Owner können Befehle nutzen.' : '')
      );
    },
  },
  {
    name: 'wartung',
    aliases: ['maintenance', 'wartungsmodus'],
    group: 'admin',
    desc: 'Wartungsmodus an/aus (nur Bot-Owner können dann Befehle nutzen)',
    usage: '!wartung an|aus',
    botOwnerOnly: true,
    async run(ctx) {
      const v = parseOnOff(ctx.args[0] || '');
      if (v === null) return ctx.reply(`ℹ️ Nutzung: \`${PREFIX}wartung an\` oder \`${PREFIX}wartung aus\` (aktuell: ${onoff(getGlobalFlag('maintenance'))})`);
      await setGlobalFlag('maintenance', v);
      return ctx.reply(v
        ? '🔧 *Wartungsmodus AKTIV.* Normale Befehle sind gesperrt — nur Bot-Owner können den Bot noch bedienen.'
        : '✅ *Wartungsmodus beendet.* Alle Befehle sind wieder freigegeben.');
    },
  },
  {
    name: 'global',
    group: 'admin',
    desc: 'Globale Systeme schalten (xp/spiele/economy/antilink/antispam/welcome/levelup)',
    usage: '!global <system> an|aus',
    botOwnerOnly: true,
    async run(ctx) {
      const sys = (ctx.args[0] || '').toLowerCase();
      const v = parseOnOff(ctx.args[1] || '');
      const known = [...Object.keys(GLOBAL_SYSTEMS), ...Object.keys(GROUP_SYSTEMS)];
      if (!known.includes(sys) || v === null) {
        return ctx.reply(
          `ℹ️ Nutzung: \`${PREFIX}global <system> an|aus\`\n` +
            `Systeme: ${known.join(', ')}\n` +
            `Aktuell global: xp ${onoff(getGlobalFlag('system_xp'))} · spiele ${onoff(getGlobalFlag('system_spiele'))} · economy ${onoff(getGlobalFlag('system_economy'))}`
        );
      }
      if (GLOBAL_SYSTEMS[sys]) {
        await setGlobalFlag(GLOBAL_SYSTEMS[sys], v);
      } else {
        const col = GROUP_SYSTEMS[sys];
        await dbRun(`UPDATE group_settings SET ${col} = ? WHERE jid = ?`, [v ? 1 : 0, ctx.chatJid]).catch(() => {});
        invalidateSettings(ctx.chatJid);
      }
      await announceToGroups(`📣 *Globale Änderung:* System *${sys}* wurde bot-weit auf *${onoff(v)}* gesetzt.`);
      return ctx.reply(`✅ Global gesetzt: *${sys}* → ${onoff(v)} (in allen Gruppen angekündigt).`);
    },
  },
  {
    name: 'gruppe',
    aliases: ['group'],
    group: 'admin',
    desc: 'Gruppen-Verwaltung: on/off/info/liste',
    usage: '!gruppe on|off|info|liste',
    ownerOnly: true,
    async run(ctx) {
      const sub = (ctx.args[0] || '').toLowerCase();

      if (sub === 'liste' || sub === 'list') {
        const rows = await dbRows(
          'SELECT g.jid, g.name, g.member_count, g.bot_is_admin, COALESCE(s.enabled,1) AS enabled FROM groups g LEFT JOIN group_settings s ON s.jid = g.jid ORDER BY g.name LIMIT 30',
          []
        );
        if (!rows.length) return ctx.reply('ℹ️ Noch keine Gruppen erfasst (öffne einmal das Panel oder warte auf den Cache).');
        const lines = rows.map((r) => `${Number(r.enabled) ? '✅' : '⛔'} *${r.name || r.jid}* — ${r.member_count || 0} Mitgl.${Number(r.bot_is_admin) ? ' · Bot-Admin' : ''}`);
        return ctx.reply(`🌐 *Gruppen im Bot* (${rows.length})\n${lines.join('\n')}`);
      }

      if (!ctx.isGroup) return ctx.reply('ℹ️ `on/off/info` bitte in der jeweiligen Gruppe ausführen. Übersicht: `!gruppe liste`');

      if (sub === 'on' || sub === 'off') {
        const enable = sub === 'on';
        await dbRun('INSERT OR IGNORE INTO group_settings (jid) VALUES (?)', [ctx.chatJid]);
        await dbRun('UPDATE group_settings SET enabled = ? WHERE jid = ?', [enable ? 1 : 0, ctx.chatJid]);
        invalidateSettings(ctx.chatJid);
        return ctx.reply(enable ? '✅ Bot in dieser Gruppe *aktiviert*.' : '⛔ Bot in dieser Gruppe *deaktiviert* (reagiert hier nicht mehr).');
      }

      if (sub === 'info' || !sub) {
        const meta = await getGroupMeta(ctx.chatJid).catch(() => null);
        const s = await getGroupSettings(ctx.chatJid);
        return ctx.reply(
          `🌐 *Gruppen-Info*\n` +
            `• Name: ${meta?.subject || '?'}\n` +
            `• Mitglieder: ${meta?.participants?.length ?? '?'}\n` +
            `• Bot aktiv: ${onoff(Number(s.enabled))}\n` +
            `• Anti-Link: ${onoff(Number(s.antilink))} · Anti-Spam: ${onoff(Number(s.antispam))}\n` +
            `• Willkommen: ${onoff(Number(s.welcome))} · Level-Up: ${onoff(Number(s.levelup_announce))}`
        );
      }
      return ctx.reply(`ℹ️ Nutzung: \`${PREFIX}gruppe on|off|info|liste\``);
    },
  },
];
