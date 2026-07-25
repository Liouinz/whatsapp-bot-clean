// Custom-Commands & FAQ — Admins legen eigene Antworten an, die der Router
// VOR dem KI-Fallback prüft. Wirken sofort, ohne Redeploy.

import { PREFIX } from '../config.js';
import { dbRun, dbRows } from '../db.js';

const RESERVED_HINT = '⚠️ Diesen Namen hat schon ein fester Befehl — bitte einen anderen wählen.';
const NAME_RE = /^[a-z0-9äöüß_-]{2,24}$/;

const customCache = new Map();
const faqCache = new Map();

export async function loadCustomCommands() {
  customCache.clear();
  faqCache.clear();
  for (const r of await dbRows('SELECT name, reply FROM custom_commands', [])) {
    customCache.set(r.name, r.reply);
  }
  for (const r of await dbRows('SELECT keyword, answer FROM faq', [])) {
    faqCache.set(r.keyword, r.answer);
  }
}

export function resolveCustom(name) {
  const key = name.toLowerCase();
  return customCache.get(key) || faqCache.get(key) || null;
}

export function listCustom() {
  return { commands: [...customCache.keys()].sort(), faqs: [...faqCache.keys()].sort() };
}

export const customCommands = [
  {
    name: 'addcmd',
    group: 'admin',
    desc: 'Legt einen eigenen Befehl an',
    usage: '!addcmd <name> <antwort>',
    adminOnly: true,
    async run(ctx) {
      const name = (ctx.args[0] || '').toLowerCase().replace(PREFIX, '');
      const reply = ctx.args.slice(1).join(' ').trim();
      if (!name || !reply) return ctx.reply('ℹ️ Nutzung: `!addcmd <name> <antwort>`');
      if (!NAME_RE.test(name)) {
        return ctx.reply('⚠️ Der Name darf nur Kleinbuchstaben, Zahlen, `-` und `_` enthalten (2–24 Zeichen).');
      }
      if (ctx.registry.some((c) => c.name === name || c.aliases?.includes(name))) {
        return ctx.reply(RESERVED_HINT);
      }
      await dbRun(
        `INSERT INTO custom_commands (name, reply, by_jid, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET reply = excluded.reply, by_jid = excluded.by_jid`,
        [name, reply.slice(0, 1500), ctx.sender, Date.now()]
      );
      customCache.set(name, reply.slice(0, 1500));
      return ctx.reply(`✅ Der Befehl \`${PREFIX}${name}\` ist ab sofort aktiv.`);
    },
  },
  {
    name: 'delcmd',
    group: 'admin',
    desc: 'Löscht einen eigenen Befehl',
    usage: '!delcmd <name>',
    adminOnly: true,
    async run(ctx) {
      const name = (ctx.args[0] || '').toLowerCase().replace(PREFIX, '');
      if (!name) return ctx.reply('ℹ️ Nutzung: `!delcmd <name>`');
      if (!customCache.has(name)) return ctx.reply(`⚠️ Einen Custom-Befehl \`${PREFIX}${name}\` gibt es nicht. Übersicht: \`${PREFIX}cmds\``);
      await dbRun('DELETE FROM custom_commands WHERE name = ?', [name]);
      customCache.delete(name);
      return ctx.reply(`✅ Der Befehl \`${PREFIX}${name}\` wurde gelöscht.`);
    },
  },
  {
    name: 'cmds',
    group: 'community',
    desc: 'Zeigt alle Custom-Befehle & FAQ-Einträge',
    usage: '!cmds',
    async run(ctx) {
      const { commands, faqs } = listCustom();
      if (!commands.length && !faqs.length) {
        return ctx.reply(`ℹ️ Es gibt noch keine Custom-Befehle.\n_Admins: \`${PREFIX}addcmd <name> <antwort>\`_`);
      }
      let text = 'ℹ️ *Eigene Befehle & FAQ*\n';
      if (commands.length) text += `\n🧰 Befehle: ${commands.map((c) => `\`${PREFIX}${c}\``).join(', ')}`;
      if (faqs.length) text += `\n❓ FAQ: ${faqs.map((f) => `\`${PREFIX}${f}\``).join(', ')}`;
      return ctx.reply(text);
    },
  },
  {
    name: 'addfaq',
    group: 'admin',
    desc: 'Legt einen FAQ-Eintrag an (wie ein Custom-Befehl)',
    usage: '!addfaq <stichwort> <antwort>',
    adminOnly: true,
    async run(ctx) {
      const keyword = (ctx.args[0] || '').toLowerCase().replace(PREFIX, '');
      const answer = ctx.args.slice(1).join(' ').trim();
      if (!keyword || !answer) return ctx.reply('ℹ️ Nutzung: `!addfaq <stichwort> <antwort>`');
      if (!NAME_RE.test(keyword)) {
        return ctx.reply('⚠️ Das Stichwort darf nur Kleinbuchstaben, Zahlen, `-` und `_` enthalten (2–24 Zeichen).');
      }
      if (ctx.registry.some((c) => c.name === keyword || c.aliases?.includes(keyword))) {
        return ctx.reply(RESERVED_HINT);
      }
      await dbRun(
        `INSERT INTO faq (keyword, answer, by_jid, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(keyword) DO UPDATE SET answer = excluded.answer, by_jid = excluded.by_jid`,
        [keyword, answer.slice(0, 1500), ctx.sender, Date.now()]
      );
      faqCache.set(keyword, answer.slice(0, 1500));
      return ctx.reply(`✅ FAQ-Eintrag \`${PREFIX}${keyword}\` gespeichert.`);
    },
  },
  {
    name: 'delfaq',
    group: 'admin',
    desc: 'Löscht einen FAQ-Eintrag',
    usage: '!delfaq <stichwort>',
    adminOnly: true,
    async run(ctx) {
      const keyword = (ctx.args[0] || '').toLowerCase().replace(PREFIX, '');
      if (!keyword) return ctx.reply('ℹ️ Nutzung: `!delfaq <stichwort>`');
      if (!faqCache.has(keyword)) return ctx.reply(`⚠️ Einen FAQ-Eintrag \`${PREFIX}${keyword}\` gibt es nicht.`);
      await dbRun('DELETE FROM faq WHERE keyword = ?', [keyword]);
      faqCache.delete(keyword);
      return ctx.reply(`✅ FAQ-Eintrag \`${PREFIX}${keyword}\` wurde gelöscht.`);
    },
  },
];
