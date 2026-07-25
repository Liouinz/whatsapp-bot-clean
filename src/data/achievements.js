// Achievement-/Erfolgs-Definitionen. Einmalig freischaltbar, Bedingung aus
// vorhandenen Zählern (stats.js). reward: { coins?, xp?, item? } — item ist
// eine Item-ID aus shop-items.js (z. B. ein Titel).

export const ACHIEVEMENTS = [
  // Nachrichten
  { id: 'chat_1', name: 'Erste Worte', emoji: '💬', type: 'messages', threshold: 100, reward: { coins: 300 } },
  { id: 'chat_2', name: 'Vielredner', emoji: '💬', type: 'messages', threshold: 1_000, reward: { coins: 1_500, xp: 50 } },
  { id: 'chat_3', name: 'Chat-Legende', emoji: '🗣️', type: 'messages', threshold: 10_000, reward: { coins: 15_000, item: 'title_plaudertasche' } },
  // Spiele
  { id: 'win_1', name: 'Erster Sieg', emoji: '🎮', type: 'games_won', threshold: 10, reward: { coins: 500 } },
  { id: 'win_2', name: 'Spielernatur', emoji: '🎮', type: 'games_won', threshold: 50, reward: { coins: 3_000, xp: 100 } },
  { id: 'win_3', name: 'Champion', emoji: '🏆', type: 'games_won', threshold: 200, reward: { coins: 25_000, item: 'title_quizmaster' } },
  // Reichtum (aktuelles Guthaben)
  { id: 'rich_1', name: 'Sparschwein', emoji: '🐷', type: 'balance', threshold: 10_000, reward: { coins: 500 } },
  { id: 'rich_2', name: 'Wohlhabend', emoji: '💰', type: 'balance', threshold: 100_000, reward: { coins: 5_000 } },
  { id: 'rich_3', name: 'Millionär', emoji: '💎', type: 'balance', threshold: 1_000_000, reward: { coins: 50_000, item: 'title_vip' } },
  // Verdienst (lebenslang)
  { id: 'earn_1', name: 'Fleißig', emoji: '⛏️', type: 'coins_earned', threshold: 100_000, reward: { coins: 5_000 } },
  { id: 'earn_2', name: 'Coin-Magnat', emoji: '🏦', type: 'coins_earned', threshold: 1_000_000, reward: { coins: 40_000, item: 'title_highroller' } },
  // Treue (Daily-Streak)
  { id: 'loyal_1', name: 'Stammgast', emoji: '📅', type: 'daily_streak', threshold: 7, reward: { coins: 1_000 } },
  { id: 'loyal_2', name: 'Unverzichtbar', emoji: '🔥', type: 'daily_streak', threshold: 30, reward: { coins: 10_000, item: 'title_fruehaufsteher' } },
  // Sammeln
  { id: 'coll_1', name: 'Sammler', emoji: '📦', type: 'items_distinct', threshold: 10, reward: { coins: 1_000 } },
  { id: 'coll_2', name: 'Kurator', emoji: '🖼️', type: 'items_distinct', threshold: 50, reward: { coins: 10_000, item: 'title_meme_lord' } },
];

export function getAchievement(id) {
  return ACHIEVEMENTS.find((a) => a.id === id) || null;
}
