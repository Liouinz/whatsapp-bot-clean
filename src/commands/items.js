// Shop 2.0 + Inventar + Boost-Nutzung.
// Item-DEFINITIONEN kommen aus data/shop-items.js (Code, 1500+ Items).
// Der BESITZ liegt pro Nutzer in der DB-Tabelle inventory. Boost-Effekte
// werden über boosts.js aktiviert und wirken in XP-Vergabe & Coin-Einkommen.

import { PREFIX } from '../config.js';
import { dbRun, dbRows } from '../db.js';
import { resolveLid } from '../permissions.js';
import { getWallet, takeCoins, addCoins, fmtCoins } from './economy.js';
import { activateBoost, getActiveBoosts } from '../boosts.js';
import { ITEMS, ITEM_COUNT, getItem, listItems, RARITIES, CATEGORIES } from '../data/shop-items.js';

const PER_PAGE = 10;

export async function addToInventory(user, itemId, qty = 1) {
  await dbRun(
    `INSERT INTO inventory (user_jid, item_id, qty) VALUES (?, ?, ?)
     ON CONFLICT(user_jid, item_id) DO UPDATE SET qty = qty + excluded.qty`,
    [user, itemId, qty]
  );
}
async function removeFromInventory(user, itemId, qty = 1) {
  const res = await dbRun(
    'UPDATE inventory SET qty = qty - ? WHERE user_jid = ? AND item_id = ? AND qty >= ?',
    [qty, user, itemId, qty]
  );
  const ok = Number(res.rowsAffected) > 0;
  if (ok) await dbRun('DELETE FROM inventory WHERE user_jid = ? AND item_id = ? AND qty <= 0', [user, itemId]).catch(() => {});
  return ok;
}
export async function getQty(user, itemId) {
  const r = await dbRows('SELECT qty FROM inventory WHERE user_jid = ? AND item_id = ?', [resolveLid(user), itemId]);
  return r.length ? Number(r[0].qty) : 0;
}
async function getInventory(user) {
  return dbRows('SELECT item_id, qty FROM inventory WHERE user_jid = ?', [user]);
}

function rarityKey(input) {
  const s = String(input || '').toLowerCase().replace('ö', 'oe').replace('ä', 'ae');
  if (s.startsWith('gew')) return 'gewoehnlich';
  if (s.startsWith('sel')) return 'selten';
  if (s.startsWith('epi')) return 'episch';
  if (s.startsWith('leg')) return 'legendaer';
  return null;
}
function catKey(input) {
  const s = String(input || '').toLowerCase();
  if (s.startsWith('boost')) return 'boost';
  if (s.startsWith('tit')) return 'titel';
  if (s.startsWith('samml') || s.startsWith('col')) return 'sammler';
  return null;
}
function itemLine(it) {
  const r = RARITIES[it.rarity];
  return `${r.emoji} \`${it.id}\` — ${it.emoji} *${it.name}* · ${fmtCoins(it.price)}`;
}
function paginate(list, page) {
  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  const p = Math.min(Math.max(1, page || 1), pages);
  return { slice: list.slice((p - 1) * PER_PAGE, p * PER_PAGE), page: p, pages, total: list.length };
}

export const itemCommands = [
  {
    name: 'shop',
    aliases: ['laden'],
    group: 'economy',
    desc: 'Shop 2.0 — 1500+ Items in Kategorien & Seltenheiten',
    usage: '!shop [boosts|titel|sammler] [seltenheit] [seite]',
    async run(ctx) {
      const cat = catKey(ctx.args[0]);
      if (!cat) {
        const counts = Object.keys(CATEGORIES).map((c) => {
          const n = listItems({ category: c }).length;
          return `${CATEGORIES[c].emoji} *${CATEGORIES[c].label}* (${n}) — \`${PREFIX}shop ${c}\``;
        });
        return ctx.reply(
          `🛒 *Shop 2.0* — insgesamt *${ITEM_COUNT}* Items\n\n${counts.join('\n')}\n\n` +
            `🔎 Seltenheiten: ${Object.values(RARITIES).map((r) => `${r.emoji} ${r.label}`).join(' · ')}\n` +
            `Beispiel: \`${PREFIX}shop sammler legendär 2\`\n` +
            `Details: \`${PREFIX}item <id>\` · Kaufen: \`${PREFIX}kaufen <id>\``
        );
      }
      let rarity = null, page = 1;
      for (const a of ctx.args.slice(1)) {
        const rk = rarityKey(a);
        if (rk) rarity = rk;
        else if (/^\d+$/.test(a)) page = parseInt(a, 10);
      }
      const list = listItems({ category: cat, rarity });
      if (!list.length) return ctx.reply('ℹ️ Für diese Auswahl gibt es keine Items.');
      const pg = paginate(list, page);
      const head = `${CATEGORIES[cat].emoji} *${CATEGORIES[cat].label}*${rarity ? ` · ${RARITIES[rarity].emoji} ${RARITIES[rarity].label}` : ''} — Seite ${pg.page}/${pg.pages} (${pg.total})`;
      const body = pg.slice.map(itemLine).join('\n');
      const foot = pg.pages > 1 ? `\n\n➡️ Weiter: \`${PREFIX}shop ${cat}${rarity ? ' ' + rarity : ''} ${pg.page + 1}\`` : '';
      return ctx.reply(`${head}\n\n${body}${foot}\n\n🛍️ Kaufen: \`${PREFIX}kaufen <id>\``);
    },
  },
  {
    name: 'item',
    aliases: ['iteminfo'],
    group: 'economy',
    desc: 'Zeigt Details zu einem Item',
    usage: '!item <id>',
    async run(ctx) {
      const it = getItem(ctx.args[0]);
      if (!it) return ctx.reply(`ℹ️ Kein Item mit dieser ID. Stöbern: \`${PREFIX}shop\``);
      const r = RARITIES[it.rarity];
      const owned = await getQty(ctx.sender, it.id);
      let t = `${it.emoji} *${it.name}*\n${r.emoji} ${r.label} · ${CATEGORIES[it.category].label}\n\n${it.desc}\n\n`;
      t += `💰 Kauf: *${fmtCoins(it.price)}* · 💸 Verkauf: ${fmtCoins(it.sell)}\n`;
      if (it.effect?.type === 'xp' || it.effect?.type === 'coins') {
        t += `⚡ Effekt: +${it.effect.pct}% ${it.effect.type === 'xp' ? 'XP' : 'Coins'} für ${it.effect.hours}h (\`${PREFIX}benutzen ${it.id}\`)\n`;
      } else if (it.effect?.type === 'title') {
        t += `🏷️ Schaltet den Titel „${it.effect.title}" frei\n`;
      }
      t += `📦 Dein Bestand: ${owned}\n\n🛍️ \`${PREFIX}kaufen ${it.id}\``;
      return ctx.reply(t);
    },
  },
  {
    name: 'kaufen',
    aliases: ['buy'],
    group: 'economy',
    desc: 'Kauft ein Item aus dem Shop',
    usage: '!kaufen <id> [menge]',
    async run(ctx) {
      const it = getItem(ctx.args[0]);
      if (!it) return ctx.reply(`ℹ️ Nutzung: \`${PREFIX}kaufen <id> [menge]\` — IDs zeigt \`${PREFIX}shop\``);
      const qty = Math.min(100, Math.max(1, parseInt(ctx.args[1] || '1', 10) || 1));
      const user = resolveLid(ctx.sender);
      if (it.category === 'titel') {
        if (await getQty(user, it.id)) return ctx.reply(`ℹ️ Den Titel *${it.name}* besitzt du schon. Anlegen: \`${PREFIX}titel\``);
      }
      const total = it.price * (it.category === 'titel' ? 1 : qty);
      if (!(await takeCoins(ctx.sender, total))) {
        const w = await getWallet(ctx.sender, ctx.senderName);
        return ctx.reply(`⚠️ Das kostet ${fmtCoins(total)} — du hast nur ${fmtCoins(w.balance)}.`);
      }
      // Schlaegt die Einbuchung fehl, waeren die Coins sonst weg und der
      // Gegenwert nie geliefert. Abbuchung zuruecknehmen und abbrechen.
      try {
        await addToInventory(user, it.id, it.category === 'titel' ? 1 : qty);
      } catch (err) {
        await addCoins(ctx.sender, total, ctx.senderName).catch(() => {});
        throw err;
      }
      if (it.category === 'titel') {
        await dbRun(
          `INSERT INTO user_titles (user_jid, title) VALUES (?, ?)
           ON CONFLICT(user_jid) DO UPDATE SET title = excluded.title`,
          [user, it.effect.title]
        ).catch(() => {});
        return ctx.reply(`🎉 Gekauft & angelegt: *${it.name}*! Zu sehen in \`${PREFIX}profil\`.`);
      }
      const hint = it.category === 'boost' ? `\n⚡ Aktivieren mit \`${PREFIX}benutzen ${it.id}\`` : '';
      return ctx.reply(`🎉 Gekauft: ${qty}× ${it.emoji} *${it.name}* für ${fmtCoins(total)}.${hint}`);
    },
  },
  {
    name: 'inventar',
    aliases: ['inv', 'inventory'],
    group: 'economy',
    desc: 'Zeigt deine Items',
    usage: '!inventar [seite]',
    async run(ctx) {
      const user = resolveLid(ctx.sender);
      const rows = (await getInventory(user)).map((r) => ({ it: getItem(r.item_id), qty: Number(r.qty) })).filter((x) => x.it);
      if (!rows.length) return ctx.reply(`📦 Dein Inventar ist leer. Stöbern: \`${PREFIX}shop\``);
      rows.sort((a, b) => RARITIES[a.it.rarity].order - RARITIES[b.it.rarity].order || b.it.price - a.it.price);
      const worth = rows.reduce((s, x) => s + x.it.sell * x.qty, 0);
      const pg = paginate(rows, parseInt(ctx.args[0] || '1', 10));
      const body = pg.slice.map((x) => `${RARITIES[x.it.rarity].emoji} ${x.emoji} *${x.it.name}* ×${x.qty} · \`${x.it.id}\``).join('\n');
      const foot = pg.pages > 1 ? `\n➡️ \`${PREFIX}inventar ${pg.page + 1}\`` : '';
      return ctx.reply(
        `📦 *Dein Inventar* — Seite ${pg.page}/${pg.pages} (${pg.total} Sorten)\n\n${body}${foot}\n\n` +
          `💸 Gesamt-Verkaufswert: ${fmtCoins(worth)}\nBenutzen: \`${PREFIX}benutzen <id>\` · Verkaufen: \`${PREFIX}verkaufen <id>\``
      );
    },
  },
  {
    name: 'verkaufen',
    aliases: ['sell'],
    group: 'economy',
    desc: 'Verkauft ein Item aus deinem Inventar',
    usage: '!verkaufen <id> [menge]',
    async run(ctx) {
      const it = getItem(ctx.args[0]);
      if (!it) return ctx.reply(`ℹ️ Nutzung: \`${PREFIX}verkaufen <id> [menge]\``);
      const user = resolveLid(ctx.sender);
      const have = await getQty(user, it.id);
      if (!have) return ctx.reply(`ℹ️ Du besitzt *${it.name}* nicht.`);
      const qty = Math.min(have, Math.max(1, parseInt(ctx.args[1] || '1', 10) || 1));
      if (!(await removeFromInventory(user, it.id, qty))) {
        return ctx.reply('⚠️ Verkauf fehlgeschlagen — bitte erneut versuchen.');
      }
      const gain = it.sell * qty;
      await addCoins(user, gain, ctx.senderName);
      return ctx.reply(`💸 Verkauft: ${qty}× ${it.emoji} *${it.name}* für *${fmtCoins(gain)}*.`);
    },
  },
  {
    name: 'benutzen',
    aliases: ['use'],
    group: 'economy',
    desc: 'Benutzt ein Item (Boost aktivieren / Titel anlegen)',
    usage: '!benutzen <id>',
    async run(ctx) {
      const it = getItem(ctx.args[0]);
      if (!it) return ctx.reply(`ℹ️ Nutzung: \`${PREFIX}benutzen <id>\` — dein Bestand: \`${PREFIX}inventar\``);
      const user = resolveLid(ctx.sender);
      if (!(await getQty(user, it.id))) return ctx.reply(`ℹ️ Du besitzt *${it.name}* nicht. Kaufen: \`${PREFIX}kaufen ${it.id}\``);

      if (it.category === 'boost') {
        if (!(await removeFromInventory(user, it.id, 1))) return ctx.reply('⚠️ Klappt gerade nicht — erneut versuchen.');
        const { expires } = await activateBoost(user, it.effect.type, it.effect.pct, it.effect.hours);
        const until = new Date(expires).toLocaleString('de-DE', { hour: '2-digit', minute: '2-digit' });
        return ctx.reply(`⚡ *Boost aktiv:* +${it.effect.pct}% ${it.effect.type === 'xp' ? 'XP' : 'Coins'} bis *${until} Uhr*. Viel Erfolg!`);
      }
      if (it.category === 'titel') {
        await dbRun(
          `INSERT INTO user_titles (user_jid, title) VALUES (?, ?)
           ON CONFLICT(user_jid) DO UPDATE SET title = excluded.title`,
          [user, it.effect.title]
        );
        return ctx.reply(`🏷️ Titel angelegt: *${it.effect.title}* — sichtbar in \`${PREFIX}profil\`.`);
      }
      return ctx.reply(`💎 *${it.name}* ist ein reines Sammlerstück — kein Effekt, aber schön für die Sammlung!`);
    },
  },
  {
    name: 'boosts',
    aliases: ['aktiveboosts'],
    group: 'economy',
    desc: 'Zeigt deine aktiven Boosts',
    usage: '!boosts',
    async run(ctx) {
      const rows = await getActiveBoosts(resolveLid(ctx.sender));
      if (!rows.length) return ctx.reply(`⚡ Keine aktiven Boosts. Im \`${PREFIX}shop\` unter „Boosts" gibt es welche.`);
      const lines = rows.map((r) => {
        const pct = Math.round((Number(r.mult) - 1) * 100);
        const until = new Date(Number(r.expires_at)).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        return `• +${pct}% ${r.type === 'xp' ? 'XP' : 'Coins'} — bis ${until}`;
      });
      return ctx.reply(`⚡ *Deine aktiven Boosts*\n${lines.join('\n')}`);
    },
  },
  {
    name: 'titel',
    group: 'economy',
    desc: 'Legt einen deiner Titel an oder ab',
    usage: '!titel [nr] | aus',
    async run(ctx) {
      const user = resolveLid(ctx.sender);
      if (/^(aus|off|keiner)$/i.test(ctx.args[0] || '')) {
        await dbRun('DELETE FROM user_titles WHERE user_jid = ?', [user]);
        return ctx.reply('✅ Titel abgelegt — schlicht steht dir auch.');
      }
      const owned = (await getInventory(user))
        .map((r) => getItem(r.item_id))
        .filter((it) => it && it.category === 'titel');
      if (!owned.length) return ctx.reply(`ℹ️ Du besitzt noch keinen Titel — im \`${PREFIX}shop titel\` gibt es welche.`);
      const idx = parseInt(ctx.args[0] || '', 10) - 1;
      const chosen = owned[idx];
      if (!chosen) {
        const list = owned.map((o, i) => `${i + 1}. ${o.name}`).join('\n');
        return ctx.reply(`ℹ️ *Deine Titel:*\n${list}\n\nAnlegen: \`${PREFIX}titel <nr>\` · Ablegen: \`${PREFIX}titel aus\``);
      }
      await dbRun(
        `INSERT INTO user_titles (user_jid, title) VALUES (?, ?)
         ON CONFLICT(user_jid) DO UPDATE SET title = excluded.title`,
        [user, chosen.effect.title]
      );
      return ctx.reply(`✅ Titel angelegt: *${chosen.name}*`);
    },
  },
];
