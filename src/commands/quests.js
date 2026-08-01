// Verträge/Quests: Spieler nehmen Verträge an, erfüllen Aufgaben und bekommen
// Coins/XP/Items. Fortschritt = aktueller kumulativer Zähler minus Snapshot
// beim Annehmen (kein Schreibaufwand pro Event).

import { PREFIX } from '../config.js';
import { dbRun, dbRows, bufferXp } from '../db.js';
import { resolveLid } from '../permissions.js';
import { addCoins } from './economy.js';
import { addToInventory } from './items.js';
import { sendText } from '../queue.js';
import { logError } from '../logger.js';
import { CONTRACTS, DIFFICULTY, getContract } from '../data/contracts.js';
import { getItem } from '../data/shop-items.js';

const MAX_ACTIVE = 3;

async function currentStat(user, type) {
  if (type === 'coins_earned') {
    const r = await dbRows('SELECT total_earned FROM coins WHERE user_jid = ?', [user]);
    return r.length ? Number(r[0].total_earned) : 0;
  }
  if (type === 'daily_streak') {
    const r = await dbRows('SELECT streak FROM coins WHERE user_jid = ?', [user]);
    return r.length ? Number(r[0].streak) : 0;
  }
  if (type === 'games_won') {
    const r = await dbRows('SELECT COALESCE(SUM(wins),0) AS w FROM game_scores WHERE user_jid = ?', [user]);
    return Number(r[0]?.w || 0);
  }
  if (type === 'messages') {
    const r = await dbRows('SELECT COALESCE(SUM(messages),0) AS m FROM xp WHERE user_jid = ?', [user]);
    return Number(r[0]?.m || 0);
  }
  return 0;
}

async function progressOf(row, contract) {
  const cur = await currentStat(row.user_jid, contract.type);
  const val = contract.type === 'daily_streak' ? cur : cur - Number(row.baseline);
  return Math.max(0, Math.min(val, contract.target));
}

function bar(have, need, width = 10) {
  const filled = Math.min(width, Math.round((have / Math.max(1, need)) * width));
  return '▰'.repeat(filled) + '▱'.repeat(width - filled);
}
function fmt(n) { return Number(n).toLocaleString('de-DE'); }
function rewardText(reward) {
  const parts = [];
  if (reward.coins) parts.push(`${fmt(reward.coins)} 🪙`);
  if (reward.xp) parts.push(`${reward.xp} XP`);
  if (reward.item) { const it = getItem(reward.item); parts.push(it ? `${it.emoji} ${it.name}` : reward.item); }
  return parts.join(' · ');
}

async function grantReward(row, contract) {
  const user = row.user_jid;
  const r = contract.reward;
  if (r.coins) await addCoins(user, r.coins, row.name).catch(() => {});
  if (r.xp && row.chat_jid) bufferXp(row.chat_jid, user, r.xp, row.name);
  if (r.item) await addToInventory(user, r.item, 1).catch(() => {});
}

async function activeRows(user) {
  return dbRows('SELECT * FROM player_contracts WHERE user_jid = ? AND done = 0', [user]);
}

async function tryComplete(row, contract) {
  const res = await dbRun('UPDATE player_contracts SET done = 1 WHERE id = ? AND done = 0', [row.id]);
  if (Number(res.rowsAffected) <= 0) return false;
  await grantReward(row, contract);
  return true;
}

let lastSweep = 0;
export async function sweepContracts() {
  if (Date.now() - lastSweep < 120_000) return;
  lastSweep = Date.now();
  const now = Date.now();
  let rows;
  try {
    rows = await dbRows('SELECT * FROM player_contracts WHERE done = 0 ORDER BY expires_at LIMIT 100', []);
  } catch { return; }
  for (const row of rows) {
    const contract = getContract(row.contract_id);
    if (!contract) { await dbRun('DELETE FROM player_contracts WHERE id = ?', [row.id]).catch(() => {}); continue; }
    try {
      if (Number(row.expires_at) <= now) {
        await dbRun('UPDATE player_contracts SET done = 2 WHERE id = ? AND done = 0', [row.id]).catch(() => {});
        continue;
      }
      const prog = await progressOf(row, contract);
      if (prog >= contract.target && (await tryComplete(row, contract)) && row.chat_jid) {
        await sendText(
          row.chat_jid,
          `✅ *Vertrag erfüllt!* ${DIFFICULTY[contract.diff]} *${contract.name}*\n` +
            `@${String(row.user_jid).split('@')[0]} kassiert: *${rewardText(contract.reward)}* 🎉`,
          [row.user_jid]
        );
      }
    } catch (err) {
      logError(err, 'quests.sweep');
    }
  }
}

export function resetQuestState() { lastSweep = 0; }

export const questCommands = [
  {
    name: 'vertraege',
    aliases: ['verträge', 'quests', 'contracts', 'missionen'],
    group: 'economy',
    desc: 'Zeigt verfügbare Verträge (Aufgaben mit Belohnung)',
    usage: '!vertraege',
    groupOnly: true,
    async run(ctx) {
      const user = resolveLid(ctx.sender);
      const active = new Set((await activeRows(user)).map((r) => r.contract_id));
      const lines = CONTRACTS.map((c) => {
        const tag = active.has(c.id) ? ' _(aktiv)_' : '';
        return `${DIFFICULTY[c.diff]} \`${c.id}\` *${c.name}*${tag}\n   ${c.task} → ${rewardText(c.reward)}`;
      });
      return ctx.reply(
        `📜 *Verträge* — nimm bis zu ${MAX_ACTIVE} gleichzeitig an\n\n${lines.join('\n\n')}\n\n` +
          `Annehmen: \`${PREFIX}vertrag <id>\` · Deine: \`${PREFIX}meinevertraege\``
      );
    },
  },
  {
    name: 'vertrag',
    aliases: ['contract'],
    group: 'economy',
    desc: 'Nimmt einen Vertrag an (oder bricht ihn ab)',
    usage: '!vertrag <id> | abbrechen <id>',
    groupOnly: true,
    async run(ctx) {
      const user = resolveLid(ctx.sender);

      if (/^(abbrechen|stop|cancel)$/i.test(ctx.args[0] || '')) {
        const c = getContract(ctx.args[1]);
        if (!c) return ctx.reply(`ℹ️ Nutzung: \`${PREFIX}vertrag abbrechen <id>\``);
        const res = await dbRun('DELETE FROM player_contracts WHERE user_jid = ? AND contract_id = ? AND done = 0', [user, c.id]);
        return ctx.reply(Number(res.rowsAffected) > 0
          ? `🗑️ Vertrag *${c.name}* abgebrochen.`
          : `ℹ️ Du hast *${c.name}* gar nicht aktiv.`);
      }

      const c = getContract(ctx.args[0]);
      if (!c) return ctx.reply(`ℹ️ Nutzung: \`${PREFIX}vertrag <id>\` — Liste: \`${PREFIX}vertraege\``);
      const active = await activeRows(user);
      if (active.some((r) => r.contract_id === c.id)) return ctx.reply(`ℹ️ *${c.name}* läuft schon. Fortschritt: \`${PREFIX}meinevertraege\``);
      if (active.length >= MAX_ACTIVE) return ctx.reply(`⚠️ Du hast bereits ${MAX_ACTIVE} Verträge aktiv — erst einen abschließen oder abbrechen.`);

      const baseline = c.type === 'daily_streak' ? 0 : await currentStat(user, c.type);
      const now = Date.now();
      await dbRun(
        `INSERT INTO player_contracts (user_jid, name, contract_id, baseline, accepted_at, expires_at, chat_jid, done)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
        [user, ctx.senderName, c.id, baseline, now, now + c.hours * 3_600_000, ctx.chatJid]
      );
      const hoursTxt = c.hours >= 24 ? `${Math.round(c.hours / 24)} Tage` : `${c.hours} Std`;
      return ctx.reply(
        `📜 *Vertrag angenommen:* ${DIFFICULTY[c.diff]} *${c.name}*\n` +
          `🎯 ${c.task}\n⏳ Zeit: ${hoursTxt}\n🎁 Belohnung: ${rewardText(c.reward)}\n\n` +
          `Fortschritt siehst du mit \`${PREFIX}meinevertraege\`.`
      );
    },
  },
  {
    name: 'meinevertraege',
    aliases: ['meineverträge', 'mv', 'myquests'],
    group: 'economy',
    desc: 'Zeigt deine aktiven Verträge samt Fortschritt',
    usage: '!meinevertraege',
    groupOnly: true,
    async run(ctx) {
      const user = resolveLid(ctx.sender);
      const rows = await activeRows(user);
      if (!rows.length) return ctx.reply(`📭 Du hast keine aktiven Verträge. Verfügbare: \`${PREFIX}vertraege\``);
      const now = Date.now();
      const lines = [];
      for (const row of rows) {
        const c = getContract(row.contract_id);
        if (!c) continue;
        if (Number(row.expires_at) <= now) {
          await dbRun('UPDATE player_contracts SET done = 2 WHERE id = ?', [row.id]).catch(() => {});
          lines.push(`⌛ *${c.name}* — abgelaufen`);
          continue;
        }
        const prog = await progressOf(row, c);
        if (prog >= c.target && (await tryComplete(row, c))) {
          lines.push(`✅ *${c.name}* — erfüllt! Belohnung: ${rewardText(c.reward)} 🎉`);
          continue;
        }
        const restH = Math.max(0, Math.round((Number(row.expires_at) - now) / 3_600_000));
        lines.push(`${DIFFICULTY[c.diff]} *${c.name}*\n   ${bar(prog, c.target)} ${fmt(prog)}/${fmt(c.target)} · noch ${restH} Std`);
      }
      return ctx.reply(`📜 *Deine Verträge*\n\n${lines.join('\n')}`);
    },
  },
];
