// Event-Definitionen: zeitlich begrenzte globale XP-Multiplikatoren.
// Reine Daten — die Engine (events.js) hält höchstens EIN aktives Event global.

export const EVENTS = [
  { id: 'double_xp', name: 'Double-XP-Wochenende', emoji: '⭐', xpMult: 2, coinMult: 1, defaultHours: 48, desc: 'Doppelte XP für alle!' },
  { id: 'lucky_hour', name: 'Glücksstunde', emoji: '🍀', xpMult: 1.5, coinMult: 1, defaultHours: 1, desc: '+50% XP!' },
  { id: 'mega', name: 'Mega-Event', emoji: '🎉', xpMult: 2, coinMult: 1, defaultHours: 24, desc: 'Doppelte XP für alle — das grosse Event!' },
];

export function getEvent(id) {
  return EVENTS.find((e) => e.id === String(id || '').toLowerCase()) || null;
}
