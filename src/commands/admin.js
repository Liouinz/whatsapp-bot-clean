// Admin-Befehle: Moderation & Gruppen-Verwaltung.
// Jeder Befehl: Rechteprüfung → Aktion → klare Rückmeldung. Nie "nichts passiert".

import { config } from '../config.js';
import { dbRun, dbRows, flushBuffers } from '../db.js';
import { state } from '../state.js';
import {
  addWarning, activeWarnings, clearWarnings, muteUser, unmuteUser,
  kickUser, banUser, unbanUser, invalidateSettings, invalidateBlockedWords, audit,
} from '../moderation.js';
import { botIsAdmin, adminDebugInfo, resolveLid, isProtectedTarget, getGroupMeta } from '../permissions.js';
import { buildWeeklyReport } from '../scheduler.js';

let lastRestartAt = 0;

const NO_TARGET =
  '⚠️ Bitte gib an, wen du meinst: antworte auf eine Nachricht der Person oder erwähne sie mit @.';

async function requireBotAdmin(ctx) {
  if (await botIsAdmin(ctx.chatJid)) return true;
  await ctx.reply('⛔ Dafür muss *ich* Admin in dieser Gruppe sein. Bitte gib mir Admin-Rechte.');
  return false;
}

/** Admins, Owner und der Bot selbst sind vor Moderations-Aktionen geschützt. */
async function requireUnprotectedTarget(ctx, target) {
  if (!(await isProtectedTarget(ctx.chatJid, target))) return true;
  await ctx.reply('⛔ Diese Person ist Admin (oder der Bot selbst) — Moderations-Aktionen gehen nur gegen normale Mitglieder.');
  return false;
}

/** "an"/"aus" (bzw. on/off/1/0) parsen → true/false/null. */
function parseOnOff(word) {
  if (/^(an|on|1)$/i.test(word || '')) return true;
  if (/^(aus|off|0)$/i.test(word || '')) return false;
  return null;
}

/** Schalter in group_settings umlegen + Cache invalidieren. */
async function setGroupFlag(ctx, field, value) {
  await dbRun('INSERT OR IGNORE INTO group_settings (jid) VALUES (?)', [ctx.chatJid]);
  await dbRun(`UPDATE group_settings SET ${field} = ? WHERE jid = ?`, [value ? 1 : 0, ctx.chatJid]);
  invalidateSettings(ctx.chatJid);
}

export const adminCommands = [
  {
    name: 'kick',
    group: 'admin',
    desc: 'Entfernt eine Person aus der Gruppe',
    usage: '!kick @person',
    adminOnly: true,
    groupOnly: true,
    async run(ctx) {
      const target = ctx.targetUser();
      if (!target) return ctx.reply(NO_TARGET);
      if (!(await requireBotAdmin(ctx))) return;
      if (!(await requireUnprotectedTarget(ctx, target))) return;
      const ok = await kickUser(ctx.chatJid, target, `durch ${ctx.senderName}`);
      await audit('kick', ctx.chatJid, target, ctx.sender, 'manuell');
      return ctx.reply(
        ok
          ? `👢 ${ctx.mentionTag(target)} wurde aus der Gruppe entfernt.`
          : '⚠️ Das hat nicht geklappt — ist die Person noch in der Gruppe?',
        ok ? [target] : undefined
      );
    },
  },
  {
    name: 'ban',
    group: 'admin',
    desc: 'Entfernt eine Person dauerhaft (Auto-Kick bei Rejoin)',
    usage: '!ban @person [grund]',
    adminOnly: true,
    groupOnly: true,
    async run(ctx) {
      const target = ctx.targetUser();
      if (!target) return ctx.reply(NO_TARGET);
      if (!(await requireBotAdmin(ctx))) return;
      if (!(await requireUnprotectedTarget(ctx, target))) return;
      const reason = ctx.argTextWithoutMentions() || 'kein Grund angegeben';
      await banUser(ctx.chatJid, target, reason, ctx.sender);
      return ctx.reply(
        `⛔ ${ctx.mentionTag(target)} wurde *gebannt* und wird bei Rejoin automatisch entfernt.\nℹ️ Grund: ${reason}`,
        [target]
      );
    },
  },
  {
    name: 'unban',
    group: 'admin',
    desc: 'Hebt einen Bann wieder auf',
    usage: '!unban @person',
    adminOnly: true,
    groupOnly: true,
    async run(ctx) {
      const target = ctx.targetUser();
      if (!target) return ctx.reply(NO_TARGET);
      await unbanUser(ctx.chatJid, target, ctx.sender);
      return ctx.reply(`✅ Der Bann für ${ctx.mentionTag(target)} wurde aufgehoben.`, [target]);
    },
  },
  {
    name: 'mute',
    group: 'admin',
    desc: 'Schaltet eine Person stumm (Bot löscht ihre Nachrichten)',
    usage: '!mute @person [minuten]',
    adminOnly: true,
    groupOnly: true,
    async run(ctx) {
      const target = ctx.targetUser();
      if (!target) return ctx.reply(NO_TARGET);
      if (!(await requireBotAdmin(ctx))) return;
      if (!(await requireUnprotectedTarget(ctx, target))) return;
      // Nur 1–4-stellige Zahlen zählen als Minuten (sonst würde eine als
      // Argument getippte Telefonnummer als Dauer fehlinterpretiert).
      let minutes = parseInt(ctx.args.find((a) => /^\d{1,4}$/.test(a)) || '', 10);
      if (!minutes || minutes < 1) minutes = config.moderation.muteMinutesDefault;
      minutes = Math.min(minutes, config.moderation.muteMinutesMax);
      const ok = await muteUser(ctx.chatJid, target, minutes, ctx.sender, 'manuell');
      return ctx.reply(
        ok
          ? `🔇 ${ctx.mentionTag(target)} wurde für *${minutes} Minuten* stummgeschaltet.`
          : '⚠️ Stummschalten hat nicht geklappt — bitte später erneut versuchen.',
        ok ? [target] : undefined
      );
    },
  },
  {
    name: 'unmute',
    group: 'admin',
    desc: 'Hebt eine Stummschaltung auf',
    usage: '!unmute @person',
    adminOnly: true,
    groupOnly: true,
    async run(ctx) {
      const target = ctx.targetUser();
      if (!target) return ctx.reply(NO_TARGET);
      await unmuteUser(ctx.chatJid, target, ctx.sender);
      return ctx.reply(`✅ ${ctx.mentionTag(target)} darf wieder schreiben.`, [target]);
    },
  },
  {
    name: 'warn',
    group: 'admin',
    desc: 'Verwarnt eine Person (eskaliert automatisch zu Mute/Kick)',
    usage: '!warn @person [grund]',
    adminOnly: true,
    groupOnly: true,
    async run(ctx) {
      const target = ctx.targetUser();
      if (!target) return ctx.reply(NO_TARGET);
      if (!(await requireUnprotectedTarget(ctx, target))) return;
      const reason = ctx.argTextWithoutMentions() || 'kein Grund angegeben';
      const { count, action } = await addWarning(ctx.chatJid, target, reason, ctx.sender);
      let text =
        `⚠️ ${ctx.mentionTag(target)} wurde verwarnt (*${count}/${config.moderation.warnLimitKick}*).\n` +
        `ℹ️ Grund: ${reason}`;
      if (action === 'mute') {
        text += `\n🔇 Warn-Limit erreicht → *${config.moderation.muteMinutesDefault} Minuten stumm*.`;
      } else if (action === 'kick') {
        text += '\n👢 Warn-Limit erreicht → *aus der Gruppe entfernt*.';
      }
      return ctx.reply(text, [target]);
    },
  },
  {
    name: 'warns',
    group: 'admin',
    desc: 'Zeigt die aktiven Verwarnungen einer Person',
    usage: '!warns @person',
    adminOnly: true,
    groupOnly: true,
    async run(ctx) {
      const target = ctx.targetUser();
      if (!target) return ctx.reply(NO_TARGET);
      const warns = await activeWarnings(ctx.chatJid, resolveLid(target));
      if (!warns.length) {
        return ctx.reply(`✅ ${ctx.mentionTag(target)} hat aktuell keine aktiven Verwarnungen.`, [target]);
      }
      const lines = warns
        .map((w, i) => `${i + 1}. ${w.reason} _(${new Date(Number(w.created_at)).toLocaleDateString('de-DE')})_`)
        .join('\n');
      return ctx.reply(
        `🛡️ *Verwarnungen von ${ctx.mentionTag(target)}* (${warns.length}/${config.moderation.warnLimitKick}):\n${lines}\n\nℹ️ Verwarnungen verfallen nach ${config.moderation.warnExpiryDays} Tagen.`,
        [target]
      );
    },
  },
  {
    name: 'warnliste',
    group: 'admin',
    desc: 'Alle aktiven Verwarnungen dieser Gruppe',
    usage: '!warnliste',
    adminOnly: true,
    groupOnly: true,
    async run(ctx) {
      const rows = await dbRows(
        `SELECT user_jid, COUNT(*) AS c, MAX(created_at) AS last FROM warnings
         WHERE group_jid = ? AND expires_at > ? GROUP BY user_jid ORDER BY c DESC LIMIT 15`,
        [ctx.chatJid, Date.now()]
      );
      if (!rows.length) return ctx.reply('✅ Keine aktiven Verwarnungen in dieser Gruppe — saubere Sache!');
      const lines = rows.map((r) => {
        const num = String(r.user_jid).split('@')[0];
        return `• +${num} — *${r.c}/${config.moderation.warnLimitKick}* (zuletzt ${new Date(Number(r.last)).toLocaleDateString('de-DE')})`;
      });
      return ctx.reply(
        `🛡️ *Aktive Verwarnungen* (${rows.length} Personen)\n${lines.join('\n')}\n\nℹ️ Details: \`!warns @person\` · Verfall nach ${config.moderation.warnExpiryDays} Tagen`
      );
    },
  },
  {
    name: 'clearwarns',
    group: 'admin',
    desc: 'Löscht alle Verwarnungen einer Person',
    usage: '!clearwarns @person',
    adminOnly: true,
    groupOnly: true,
    async run(ctx) {
      const target = ctx.targetUser();
      if (!target) return ctx.reply(NO_TARGET);
      await clearWarnings(ctx.chatJid, target);
      return ctx.reply(`✅ Alle Verwarnungen von ${ctx.mentionTag(target)} wurden gelöscht.`, [target]);
    },
  },
  {
    name: 'close',
    group: 'admin',
    desc: 'Schließt die Gruppe (nur Admins können schreiben)',
    usage: '!close',
    adminOnly: true,
    groupOnly: true,
    async run(ctx) {
      if (!(await requireBotAdmin(ctx))) return;
      await state.sock.groupSettingUpdate(ctx.chatJid, 'announcement');
      await audit('close', ctx.chatJid, '', ctx.sender, '');
      return ctx.reply('🔒 Gruppe geschlossen — nur Admins können jetzt schreiben. (`!open` zum Öffnen)');
    },
  },
  {
    name: 'open',
    group: 'admin',
    desc: 'Öffnet die Gruppe (alle können schreiben)',
    usage: '!open',
    adminOnly: true,
    groupOnly: true,
    async run(ctx) {
      if (!(await requireBotAdmin(ctx))) return;
      await state.sock.groupSettingUpdate(ctx.chatJid, 'not_announcement');
      await audit('open', ctx.chatJid, '', ctx.sender, '');
      return ctx.reply('🔓 Gruppe geöffnet — alle können wieder schreiben.');
    },
  },
  {
    name: 'antilink',
    group: 'admin',
    desc: 'Anti-Link an/aus (Links werden gelöscht + verwarnt)',
    usage: '!antilink an|aus',
    adminOnly: true,
    groupOnly: true,
    async run(ctx) {
      const on = parseOnOff(ctx.args[0]);
      if (on === null) return ctx.reply('ℹ️ Nutzung: `!antilink an` oder `!antilink aus`');
      await setGroupFlag(ctx, 'antilink', on);
      return ctx.reply(on ? '✅ Anti-Link ist jetzt *aktiv* — Links werden entfernt.' : '✅ Anti-Link ist jetzt *aus*.');
    },
  },
  {
    name: 'antispam',
    group: 'admin',
    desc: 'Anti-Spam an/aus (Nachrichten-Flut wird verwarnt)',
    usage: '!antispam an|aus',
    adminOnly: true,
    groupOnly: true,
    async run(ctx) {
      const on = parseOnOff(ctx.args[0]);
      if (on === null) return ctx.reply('ℹ️ Nutzung: `!antispam an` oder `!antispam aus`');
      await setGroupFlag(ctx, 'antispam', on);
      return ctx.reply(on ? '✅ Anti-Spam ist jetzt *aktiv*.' : '✅ Anti-Spam ist jetzt *aus*.');
    },
  },
  {
    name: 'welcome',
    group: 'admin',
    desc: 'Begrüßung neuer Mitglieder an/aus',
    usage: '!welcome an|aus',
    adminOnly: true,
    groupOnly: true,
    async run(ctx) {
      const on = parseOnOff(ctx.args[0]);
      if (on === null) return ctx.reply('ℹ️ Nutzung: `!welcome an` oder `!welcome aus`');
      await setGroupFlag(ctx, 'welcome', on);
      return ctx.reply(on ? '✅ Neue Mitglieder werden jetzt begrüßt. 👋' : '✅ Begrüßung ist jetzt *aus*.');
    },
  },
  {
    name: 'levelup',
    group: 'admin',
    desc: 'Level-Up-Nachrichten an/aus',
    usage: '!levelup an|aus',
    adminOnly: true,
    groupOnly: true,
    async run(ctx) {
      const on = parseOnOff(ctx.args[0]);
      if (on === null) return ctx.reply('ℹ️ Nutzung: `!levelup an` oder `!levelup aus`');
      await setGroupFlag(ctx, 'levelup_announce', on);
      return ctx.reply(on ? '✅ Level-Ups werden jetzt gefeiert. 🎉' : '✅ Level-Up-Nachrichten sind jetzt *aus*.');
    },
  },
  {
    name: 'antiraid',
    group: 'admin',
    desc: 'Anti-Raid an/aus (Join-Flut sperrt die Gruppe kurz)',
    usage: '!antiraid an|aus',
    adminOnly: true,
    groupOnly: true,
    async run(ctx) {
      const on = parseOnOff(ctx.args[0]);
      if (on === null) return ctx.reply('ℹ️ Nutzung: `!antiraid an` oder `!antiraid aus`');
      await dbRun(
        `INSERT INTO antiraid (group_jid, enabled) VALUES (?, ?)
         ON CONFLICT(group_jid) DO UPDATE SET enabled = excluded.enabled`,
        [ctx.chatJid, on ? 1 : 0]
      );
      return ctx.reply(on ? '🛡️ Anti-Raid ist jetzt *aktiv*.' : '✅ Anti-Raid ist jetzt *aus*.');
    },
  },
  {
    name: 'nachtmodus',
    group: 'admin',
    desc: 'Nachtmodus: Gruppe nachts automatisch schließen',
    usage: '!nachtmodus 22:00 07:00 | aus',
    adminOnly: true,
    groupOnly: true,
    async run(ctx) {
      if (/^(aus|off|0)$/i.test(ctx.args[0] || '')) {
        await dbRun(
          `INSERT INTO nightmode (group_jid, enabled) VALUES (?, 0)
           ON CONFLICT(group_jid) DO UPDATE SET enabled = 0`,
          [ctx.chatJid]
        );
        return ctx.reply('✅ Nachtmodus ist jetzt *aus*.');
      }
      const start = ctx.args[0], end = ctx.args[1];
      const re = /^([01]?\d|2[0-3]):[0-5]\d$/;
      if (!re.test(start || '') || !re.test(end || '')) {
        return ctx.reply('ℹ️ Nutzung: `!nachtmodus 22:00 07:00` (schließt/öffnet automatisch) oder `!nachtmodus aus`');
      }
      await dbRun(
        `INSERT INTO nightmode (group_jid, enabled, start_hhmm, end_hhmm) VALUES (?, 1, ?, ?)
         ON CONFLICT(group_jid) DO UPDATE SET enabled = 1, start_hhmm = excluded.start_hhmm, end_hhmm = excluded.end_hhmm`,
        [ctx.chatJid, start, end]
      );
      return ctx.reply(`🌙 Nachtmodus *aktiv*: Die Gruppe wird täglich um *${start}* geschlossen und um *${end}* geöffnet.`);
    },
  },
  {
    name: 'addword',
    group: 'admin',
    desc: 'Fügt ein Wort zur Blacklist hinzu',
    usage: '!addword <wort>',
    adminOnly: true,
    groupOnly: true,
    async run(ctx) {
      const word = ctx.argText.trim().toLowerCase();
      if (!word) return ctx.reply('ℹ️ Nutzung: `!addword <wort>`');
      await dbRun('INSERT OR IGNORE INTO blocked_words (group_jid, word) VALUES (?, ?)', [ctx.chatJid, word]);
      invalidateBlockedWords(ctx.chatJid);
      return ctx.reply(`✅ „${word}" steht jetzt auf der Blacklist dieser Gruppe.`);
    },
  },
  {
    name: 'delword',
    group: 'admin',
    desc: 'Entfernt ein Wort von der Blacklist',
    usage: '!delword <wort>',
    adminOnly: true,
    groupOnly: true,
    async run(ctx) {
      const word = ctx.argText.trim().toLowerCase();
      if (!word) return ctx.reply('ℹ️ Nutzung: `!delword <wort>`');
      await dbRun('DELETE FROM blocked_words WHERE group_jid = ? AND word = ?', [ctx.chatJid, word]);
      invalidateBlockedWords(ctx.chatJid);
      return ctx.reply(`✅ „${word}" wurde von der Blacklist entfernt.`);
    },
  },
  {
    name: 'words',
    group: 'admin',
    desc: 'Zeigt die Blacklist dieser Gruppe',
    usage: '!words',
    adminOnly: true,
    groupOnly: true,
    async run(ctx) {
      const rows = await dbRows('SELECT word FROM blocked_words WHERE group_jid = ? ORDER BY word', [ctx.chatJid]);
      if (!rows.length) return ctx.reply('ℹ️ Die Blacklist dieser Gruppe ist leer. (`!addword <wort>`)');
      return ctx.reply(`🛡️ *Blacklist* (${rows.length}):\n${rows.map((r) => `• ${r.word}`).join('\n')}`);
    },
  },
  {
    name: 'alle',
    aliases: ['tagall', 'everyone'],
    group: 'admin',
    desc: 'Erwähnt alle Mitglieder (sparsam einsetzen!)',
    usage: '!alle [nachricht]',
    adminOnly: true,
    groupOnly: true,
    async run(ctx) {
      const meta = await getGroupMeta(ctx.chatJid, true);
      if (!meta?.participants?.length) return ctx.reply('⚠️ Konnte die Mitgliederliste gerade nicht laden.');
      const jids = meta.participants.map((p) => p.id);
      const note = ctx.argText.trim() || 'Bitte einmal alle herschauen!';
      const tags = jids.map((j) => `@${String(j).split('@')[0]}`).join(' ');
      return ctx.reply(`📢 *Durchsage von ${ctx.senderName}:*\n${note}\n\n${tags}`, jids);
    },
  },
  {
    name: 'slowmode',
    group: 'admin',
    desc: 'Mindestabstand zwischen Nachrichten pro Person',
    usage: '!slowmode <sekunden> | aus',
    adminOnly: true,
    groupOnly: true,
    async run(ctx) {
      if (/^(aus|off|0)$/i.test(ctx.args[0] || '')) {
        await setGroupFlag(ctx, 'slowmode_secs', 0);
        return ctx.reply('✅ Slowmode ist jetzt *aus* — freie Fahrt.');
      }
      const secs = parseInt(ctx.args[0] || '', 10);
      if (!secs || secs < 1 || secs > config.slowmode.maxSeconds) {
        return ctx.reply(`ℹ️ Nutzung: \`!slowmode <1-${config.slowmode.maxSeconds}>\` (Sekunden) oder \`!slowmode aus\``);
      }
      await dbRun('INSERT OR IGNORE INTO group_settings (jid) VALUES (?)', [ctx.chatJid]);
      await dbRun('UPDATE group_settings SET slowmode_secs = ? WHERE jid = ?', [secs, ctx.chatJid]);
      invalidateSettings(ctx.chatJid);
      return ctx.reply(
        `🐢 *Slowmode aktiv:* höchstens eine Nachricht alle *${secs} Sekunden* pro Person.\n_Admins sind ausgenommen. Zu schnelle Nachrichten werden gelöscht._`
      );
    },
  },
  {
    name: 'setwelcome',
    group: 'admin',
    desc: 'Eigener Begrüßungstext ({name} wird ersetzt)',
    usage: '!setwelcome Willkommen {name}! | standard',
    adminOnly: true,
    groupOnly: true,
    async run(ctx) {
      if (/^(standard|reset)$/i.test(ctx.args[0] || '')) {
        await dbRun('UPDATE group_settings SET welcome_text = ? WHERE jid = ?', ['', ctx.chatJid]);
        invalidateSettings(ctx.chatJid);
        return ctx.reply('✅ Begrüßung zurückgesetzt — ich nutze wieder den Standardtext.');
      }
      const text = ctx.argText.trim();
      if (!text) {
        return ctx.reply('ℹ️ Nutzung: `!setwelcome <text>` — `{name}` wird durch die Person ersetzt.\nZurücksetzen: `!setwelcome standard`');
      }
      await dbRun('INSERT OR IGNORE INTO group_settings (jid) VALUES (?)', [ctx.chatJid]);
      await dbRun('UPDATE group_settings SET welcome_text = ?, welcome = 1 WHERE jid = ?', [text.slice(0, 500), ctx.chatJid]);
      invalidateSettings(ctx.chatJid);
      return ctx.reply(`✅ Begrüßung gespeichert (und Begrüßung aktiviert):\n_${text.slice(0, 200).replace('{name}', '@beispiel')}_`);
    },
  },
  {
    name: 'wochenreport',
    group: 'admin',
    desc: 'Wochen-Zusammenfassung (jetzt oder automatisch So 18:00)',
    usage: '!wochenreport jetzt | an | aus',
    adminOnly: true,
    groupOnly: true,
    async run(ctx) {
      const arg = (ctx.args[0] || '').toLowerCase();
      if (arg === 'jetzt' || arg === 'now') {
        const report = await buildWeeklyReport(ctx.chatJid);
        return ctx.reply(report);
      }
      const on = parseOnOff(arg);
      if (on === null) return ctx.reply('ℹ️ Nutzung: `!wochenreport jetzt` (sofort) · `!wochenreport an|aus` (automatisch So 18:00)');
      await setGroupFlag(ctx, 'weekly_report', on);
      return ctx.reply(on ? '✅ Wochenreport kommt ab jetzt automatisch *sonntags um 18:00*.' : '✅ Automatischer Wochenreport ist *aus*.');
    },
  },
  {
    name: 'neustart',
    aliases: ['restart'],
    group: 'admin',
    desc: 'Startet den Bot neu (2 Min Cooldown)',
    usage: '!neustart',
    adminOnly: true,
    async run(ctx) {
      const now = Date.now();
      const wait = config.web.restartCooldownMs - (now - lastRestartAt);
      if (wait > 0) {
        return ctx.reply(`⚠️ Neustart-Cooldown aktiv — bitte noch *${Math.ceil(wait / 1000)} Sekunden* warten.`);
      }
      lastRestartAt = now;
      await ctx.reply('🔄 Alles klar, ich starte neu — bin gleich wieder da!');
      await audit('restart', ctx.chatJid, '', ctx.sender, 'per Befehl');
      await flushBuffers().catch(() => {}); // gepufferte XP/Zähler retten, bevor der Prozess endet
      setTimeout(() => process.exit(0), 3000); // Render startet den Prozess automatisch neu
    },
  },
  {
    name: 'gruppen',
    group: 'admin',
    desc: 'Listet alle Gruppen, in denen der Bot ist',
    usage: '!gruppen',
    adminOnly: true,
    async run(ctx) {
      try {
        const all = await state.sock.groupFetchAllParticipating();
        const groups = Object.values(all);
        if (!groups.length) return ctx.reply('ℹ️ Ich bin aktuell in keiner Gruppe.');
        const lines = groups
          .sort((a, b) => (a.subject || '').localeCompare(b.subject || ''))
          .map((g) => `• *${g.subject || 'Ohne Namen'}* — ${g.participants?.length ?? '?'} Mitglieder`)
          .join('\n');
        return ctx.reply(`ℹ️ *Meine Gruppen* (${groups.length}):\n${lines}`);
      } catch {
        return ctx.reply('⚠️ Konnte die Gruppenliste gerade nicht laden — bitte gleich nochmal versuchen.');
      }
    },
  },
  {
    name: 'debugadmin',
    group: 'admin',
    desc: 'Diagnose: erkennt der Bot Admin-Rechte korrekt? (LID-Check)',
    usage: '!debugadmin',
    adminOnly: true,
    groupOnly: true,
    async run(ctx) {
      const info = await adminDebugInfo(ctx.chatJid, ctx.senderIds);
      return ctx.reply(
        `🛡️ *Admin-Diagnose — ${info.groupName}*\n` +
          `• Mitglieder: ${info.participantCount} (davon ${info.adminCount} Admins)\n` +
          `• Bot ist Admin: ${info.botIsAdmin ? '✅ ja' : '⛔ nein'}\n` +
          `• Du bist Admin: ${info.senderIsAdmin ? '✅ ja' : '⛔ nein'}${info.senderIsOwner ? ' (Owner)' : ''}\n` +
          `• Bot-PN: \`${info.botJidPn || '—'}\`\n` +
          `• Bot-LID: \`${info.botJidLid || '—'}\``
      );
    },
  },
{
    name: 'cheat',
    aliases: ['givemoney', 'coinsgeben'],
    group: 'admin',
    desc: 'Gibt dir selbst Coins (Nur für den Owner)',
    usage: '!cheat [menge]',
    adminOnly: true,
    groupOnly: false,
    async run(ctx) {
      // 🔒 Check gegen OWNER_NUMBERS aus der Config
      const ownerList = config.OWNER_NUMBERS || config.ownerNumbers || [];
      const isOwner = ownerList.some(num => 
        num && (ctx.sender.includes(num) || ctx.senderPn?.includes(num) || ctx.senderJid?.includes(num))
      );

      // Betrag auslesen (Standard: 10.000 Coins)
      let amount = parseInt(ctx.args.find((a) => /^\d+$/.test(a)) || '', 10);
      if (!amount || isNaN(amount)) amount = 1000000;

      const target = ctx.sender;

      await dbRun(
        `INSERT INTO coins (user_jid, balance, total_earned) VALUES (?, ?, ?)
         ON CONFLICT(user_jid) DO UPDATE SET 
           balance = balance + excluded.balance,
           total_earned = total_earned + excluded.balance`,
        [target, amount, amount]
      );

      return ctx.reply(
        `💰 Cheat erfolgreich aktiviert!\n• Gutgeschrieben: +${amount.toLocaleString('de-DE')} Coins`
      );
    },
  },  
];
