// Item-Katalog für Shop 2.0. Definitionen liegen als CODE vor (versioniert,
// keine DB-Migration nötig, um Items hinzuzufügen) — der BESITZ liegt pro
// Nutzer in der DB (Tabelle inventory). Der Katalog skaliert per Generator
// auf 1500+ Items, bleibt aber durch Kategorien + Seltenheiten + Pagination
// im Chat bedienbar.

export const RARITIES = {
  gewoehnlich: { label: 'Gewöhnlich', emoji: '⚪', min: 1, max: 10_000, order: 0 },
  selten: { label: 'Selten', emoji: '🔵', min: 10_000, max: 1_000_000, order: 1 },
  episch: { label: 'Episch', emoji: '🟣', min: 1_000_000, max: 10_000_000, order: 2 },
  legendaer: { label: 'Legendär', emoji: '🟠', min: 10_000_000, max: 55_000_000, order: 3 },
};

export const CATEGORIES = {
  boost: { label: 'Boosts', emoji: '⚡' },
  titel: { label: 'Titel', emoji: '🏷️' },
  sammler: { label: 'Sammlerstücke', emoji: '💎' },
};

const SELL_PCT = 0.4;
const sellOf = (price) => Math.max(1, Math.round(price * SELL_PCT));

const items = new Map();
function add(it) {
  it.sell = sellOf(it.price);
  items.set(it.id, it);
}

const BOOST_DEFS = [
  { type: 'xp', pct: 10, hours: 1, rarity: 'gewoehnlich', price: 500 },
  { type: 'xp', pct: 25, hours: 6, rarity: 'gewoehnlich', price: 3_000 },
  { type: 'xp', pct: 50, hours: 24, rarity: 'selten', price: 40_000 },
  { type: 'xp', pct: 100, hours: 24, rarity: 'episch', price: 1_500_000 },
  { type: 'coins', pct: 10, hours: 1, rarity: 'gewoehnlich', price: 800 },
  { type: 'coins', pct: 25, hours: 6, rarity: 'selten', price: 25_000 },
  { type: 'coins', pct: 50, hours: 24, rarity: 'selten', price: 200_000 },
  { type: 'coins', pct: 100, hours: 24, rarity: 'episch', price: 2_000_000 },
];
for (const b of BOOST_DEFS) {
  add({
    id: `boost_${b.type}_${b.pct}_${b.hours}h`,
    name: `${b.type === 'xp' ? 'XP' : 'Coin'}-Boost +${b.pct}% (${b.hours}h)`,
    emoji: b.type === 'xp' ? '⭐' : '🪙',
    category: 'boost',
    rarity: b.rarity,
    price: b.price,
    desc: `Gibt dir ${b.hours} Stunden lang +${b.pct}% ${b.type === 'xp' ? 'XP aus Nachrichten' : 'Coins aus Daily & Skill-Spielen'}.`,
    effect: { type: b.type, pct: b.pct, hours: b.hours },
  });
}

const TITLE_DEFS = [
  { id: 'title_kaffeejunkie', title: '☕ Kaffee-Junkie', rarity: 'gewoehnlich', price: 800 },
  { id: 'title_fruehaufsteher', title: '🌅 Frühaufsteher', rarity: 'gewoehnlich', price: 1_000 },
  { id: 'title_plaudertasche', title: '💬 Plaudertasche', rarity: 'gewoehnlich', price: 1_200 },
  { id: 'title_nachtschwaermer', title: '🌙 Nachtschwärmer', rarity: 'gewoehnlich', price: 1_500 },
  { id: 'title_meme_lord', title: '😂 Meme-Lord', rarity: 'selten', price: 18_000 },
  { id: 'title_glueckspilz', title: '🍀 Glückspilz', rarity: 'selten', price: 50_000 },
  { id: 'title_quizmaster', title: '🧠 Quizmaster', rarity: 'selten', price: 120_000 },
  { id: 'title_vip', title: '💎 VIP', rarity: 'selten', price: 500_000 },
  { id: 'title_highroller', title: '🎰 High Roller', rarity: 'episch', price: 4_000_000 },
  { id: 'title_legende', title: '🏆 Legende', rarity: 'episch', price: 8_000_000 },
  { id: 'title_unsterblich', title: '👑 Unsterblich', rarity: 'legendaer', price: 30_000_000 },
  { id: 'title_gott', title: '⚡ Gott des Chats', rarity: 'legendaer', price: 55_000_000 },
];
for (const t of TITLE_DEFS) {
  add({
    id: t.id,
    name: t.title,
    emoji: '🏷️',
    category: 'titel',
    rarity: t.rarity,
    price: t.price,
    desc: `Kosmetischer Titel „${t.title}" — erscheint in deinem Profil und bei Level-Ups.`,
    effect: { type: 'title', title: t.title },
  });
}

const COLLECTIBLE_THEMES = [
  ['🪨', 'Kiesel'], ['🐚', 'Muschel'], ['🍄', 'Pilz'], ['🌸', 'Blüte'],
  ['🔩', 'Zahnrad'], ['🧩', 'Puzzleteil'], ['📎', 'Büroklammer'], ['🕯️', 'Kerze'],
  ['🔮', 'Kristallkugel'], ['⚗️', 'Elixier'], ['🗝️', 'Schlüssel'], ['🧭', 'Kompass'],
  ['💠', 'Prisma'], ['🪬', 'Amulett'], ['📿', 'Perlenkette'], ['⚜️', 'Wappen'],
  ['💎', 'Diamant'], ['👑', 'Krone'], ['🏺', 'Antike Vase'], ['🗿', 'Monolith'],
];
const COLLECTIBLE_COUNT = { gewoehnlich: 620, selten: 510, episch: 250, legendaer: 120 };
let colN = 0;
for (const rarity of Object.keys(COLLECTIBLE_COUNT)) {
  const { min, max } = RARITIES[rarity];
  const n = COLLECTIBLE_COUNT[rarity];
  for (let i = 0; i < n; i++) {
    colN++;
    const [emoji, base] = COLLECTIBLE_THEMES[colN % COLLECTIBLE_THEMES.length];
    const price = Math.round(min + ((max - min) * ((i + 1) / (n + 1))));
    add({
      id: `col_${String(colN).padStart(4, '0')}`,
      name: `${base} #${String(colN).padStart(4, '0')}`,
      emoji,
      category: 'sammler',
      rarity,
      price,
      desc: `Ein ${RARITIES[rarity].label.toLowerCase()}es Sammlerstück für echte Sammler.`,
    });
  }
}

export const ITEMS = items;
export const ITEM_COUNT = items.size;

export function getItem(id) {
  return items.get(String(id || '').toLowerCase()) || null;
}

export function listItems({ category, rarity } = {}) {
  const out = [];
  for (const it of items.values()) {
    if (category && it.category !== category) continue;
    if (rarity && it.rarity !== rarity) continue;
    out.push(it);
  }
  out.sort((a, b) => RARITIES[a.rarity].order - RARITIES[b.rarity].order || a.price - b.price);
  return out;
}
