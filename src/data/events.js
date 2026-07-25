// Event-Definitionen: zeitlich begrenzte globale Multiplikatoren auf XP/Coins.
// Reine Daten — die Engine (events.js) hält höchstens EIN aktives Event global.

export const EVENTS = [
  { id: 'double_xp', name: 'Double-XP-Wochenende', emoji: '⭐', xpMult: 2, coinMult: 1, defaultHours: 48, desc: 'Doppelte XP für alle!' },
  { id: 'coin_rush', name: 'Coin-Rush', emoji: '🪙', xpMult: 1, coinMult: 2, defaultHours: 3, desc: 'Doppelte Coins aus Daily & Skill-Spielen!' },
  { id: 'lucky_hour', name: 'Glücksstunde', emoji: '🍀', xpMult: 1.5, coinMult: 1.5, defaultHours: 1, desc: '+50% XP und Coins!' },
  { id: 'mega', name: 'Mega-Event', emoji: '🎉', xpMult: 2, coinMult: 2, defaultHours: 24, desc: 'Doppelte XP UND Coins!' },
];

export function getEvent(id) {
  return EVENTS.find((e) => e.id === String(id || '').toLowerCase()) || null;
}
