// Vertrags-/Quest-Definitionen (Code = versioniert, kein DB-Pflegeaufwand).
//
// Fortschritt wird NICHT pro Event geschrieben, sondern als Differenz zu einem
// beim Annehmen gespeicherten Snapshot bereits vorhandener kumulativer Zähler
// berechnet (schont das Turso-Schreibbudget). Deshalb sind nur Aufgaben-Typen
// erlaubt, die sich aus bestehenden Zählern ableiten lassen:
//   messages     → SUM(xp.messages)          (Nachrichten schreiben)
//   coins_earned → coins.total_earned        (Coins verdienen)
//   games_won    → SUM(game_scores.wins)     (Spiele gewinnen)
//   daily_streak → coins.streak (ABSOLUT)    (Daily-Streak erreichen)
//
// reward: { coins?, xp?, item? }  — item ist eine Item-ID aus shop-items.js

export const DIFFICULTY = {
  Leicht: '🟢',
  Mittel: '🟡',
  Schwer: '🟠',
  Legendär: '🔴',
};

export const CONTRACTS = [
  {
    id: 'starter', name: 'Anfänger-Vertrag', diff: 'Leicht',
    type: 'messages', target: 20, hours: 24,
    task: 'Schreibe 20 Nachrichten in Gruppen',
    reward: { coins: 500, xp: 50 },
  },
  {
    id: 'daily_grind', name: 'Täglicher Vertrag', diff: 'Leicht',
    type: 'coins_earned', target: 1_000, hours: 24,
    task: 'Verdiene 1.000 Coins',
    reward: { coins: 300, item: 'boost_xp_10_1h' },
  },
  {
    id: 'gamer', name: 'Spieler-Vertrag', diff: 'Mittel',
    type: 'games_won', target: 5, hours: 48,
    task: 'Gewinne 5 Spiele (Quiz, Raten, Wortle, Millionär …)',
    reward: { coins: 2_000, xp: 100 },
  },
  {
    id: 'streaker', name: 'Streak-Vertrag', diff: 'Mittel',
    type: 'daily_streak', target: 7, hours: 24 * 8,
    task: 'Erreiche einen Daily-Streak von 7 Tagen',
    reward: { coins: 1_500, item: 'title_fruehaufsteher' },
  },
  {
    id: 'premium', name: 'Premium-Vertrag', diff: 'Schwer',
    type: 'coins_earned', target: 50_000, hours: 72,
    task: 'Verdiene 50.000 Coins',
    reward: { coins: 10_000, item: 'boost_coins_25_6h' },
  },
  {
    id: 'legend', name: 'Legendärer Vertrag', diff: 'Legendär',
    type: 'games_won', target: 25, hours: 24 * 7,
    task: 'Gewinne 25 Spiele',
    reward: { coins: 100_000, xp: 500, item: 'title_quizmaster' },
  },
];

export function getContract(id) {
  return CONTRACTS.find((c) => c.id === String(id || '').toLowerCase()) || null;
}
