// Fun-Befehle: kleine Stimmungsmacher ohne externe APIs — alles offline,
// deterministisch abgesichert und pro Aufruf zufällig.

import crypto from 'node:crypto';

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ── Inhalts-Sammlungen (Deutsch, familientauglich) ─────────────────

const ZITATE = [
  '„Der beste Weg, die Zukunft vorauszusagen, ist, sie zu gestalten." — Willy Brandt',
  '„Wer kämpft, kann verlieren. Wer nicht kämpft, hat schon verloren." — Bertolt Brecht',
  '„Phantasie ist wichtiger als Wissen, denn Wissen ist begrenzt." — Albert Einstein',
  '„Es ist nicht zu wenig Zeit, die wir haben, sondern zu viel, die wir nicht nutzen." — Seneca',
  '„Der Anfang ist die Hälfte des Ganzen." — Aristoteles',
  '„Man muss das Unmögliche versuchen, um das Mögliche zu erreichen." — Hermann Hesse',
  '„Wege entstehen dadurch, dass man sie geht." — Franz Kafka',
  '„Wer immer tut, was er schon kann, bleibt immer das, was er schon ist." — Henry Ford',
  '„Das Geheimnis des Erfolgs ist anzufangen." — Mark Twain',
  '„In der Mitte von Schwierigkeiten liegen die Möglichkeiten." — Albert Einstein',
  '„Glück ist das Einzige, was sich verdoppelt, wenn man es teilt." — Albert Schweitzer',
  '„Auch aus Steinen, die dir in den Weg gelegt werden, kannst du etwas Schönes bauen." — Erich Kästner',
  '„Sei du selbst die Veränderung, die du dir wünschst für diese Welt." — Mahatma Gandhi',
  '„Es gibt nichts Gutes, außer man tut es." — Erich Kästner',
  '„Wer nichts weiß, muss alles glauben." — Marie von Ebner-Eschenbach',
  '„Die Neugier steht immer an erster Stelle eines Problems, das gelöst werden will." — Galileo Galilei',
  '„Erfolg ist die Fähigkeit, von einem Misserfolg zum anderen zu gehen, ohne die Begeisterung zu verlieren." — Winston Churchill',
  '„Was du heute kannst besorgen, das verschiebe nicht auf morgen." — Sprichwort',
  '„Träume nicht dein Leben, sondern lebe deinen Traum." — Sprichwort',
  '„Jede Reise beginnt mit dem ersten Schritt." — Laotse',
];

const FAKTEN = [
  'Honig verdirbt praktisch nie — archäologen fanden 3000 Jahre alten, noch essbaren Honig.',
  'Ein Oktopus hat drei Herzen und blaues Blut.',
  'Bananen sind botanisch gesehen Beeren — Erdbeeren nicht.',
  'Der Eiffelturm ist im Sommer bis zu 15 cm höher (Metall dehnt sich aus).',
  'Faultiere brauchen bis zu einen Monat, um eine Mahlzeit zu verdauen.',
  'Es gibt mehr mögliche Schachpartien als Atome im beobachtbaren Universum.',
  'Wombat-Kot ist würfelförmig.',
  'Eine Wolke kann über 500 Tonnen wiegen — so viel wie 100 Elefanten.',
  'Die Antarktis ist die größte Wüste der Erde.',
  'Kühe haben beste Freundinnen und sind gestresst, wenn man sie trennt.',
  'Das Herz eines Blauwals ist so groß wie ein Kleinwagen.',
  'Venus ist der heißeste Planet unseres Sonnensystems — nicht Merkur.',
  'Ein Tag auf der Venus dauert länger als ein Jahr auf der Venus.',
  'Seeotter halten beim Schlafen Händchen, damit sie nicht abtreiben.',
  'Der Deutsche Michel: Deutschland hat über 25.000 Schlösser und Burgen.',
  'Schmetterlinge schmecken mit ihren Füßen.',
  'In Japan gibt es quadratische Wassermelonen — sie stapeln sich besser.',
  'Ein Blitz ist etwa fünfmal heißer als die Oberfläche der Sonne.',
  'Menschen und Giraffen haben gleich viele Halswirbel: sieben.',
  'Der kürzeste Krieg der Geschichte dauerte 38 Minuten (Großbritannien vs. Sansibar, 1896).',
  'Ameisen machen niemals Mittagsschlaf — sie schlafen in vielen Mikro-Nickerchen.',
  'Ein einzelnes Spaghetti heißt „Spaghetto".',
  'Die Erdbeere ist die einzige Frucht mit Samen auf der Außenseite.',
  'Pinguine machen sich gegenseitig Heiratsanträge mit Kieselsteinen.',
  'Auf dem Jupiter und Saturn regnet es vermutlich Diamanten.',
];

const KOMPLIMENTE = [
  'Du bringst Menschen zum Lachen, ohne es zu merken. 😄',
  'Mit dir wird jede Gruppe sofort besser. ✨',
  'Deine Energie ist ansteckend — im besten Sinne!',
  'Du bist der Grund, warum Leute gern hier reinschauen. 💙',
  'Wenn Zuverlässigkeit ein Gesicht hätte, wäre es deins.',
  'Du stellst die richtigen Fragen zur richtigen Zeit. 🧠',
  'Dein Humor ist Gold wert. 🥇',
  'Du machst komplizierte Dinge einfach — eine seltene Gabe.',
  'Neben dir fühlt man sich einfach wohl.',
  'Du siehst heute wieder verdächtig gut gelaunt aus. 😎',
  'Deine Ideen haben Hand und Fuß — weiter so!',
  'Du bist wie ein Software-Update: Nach dir läuft alles besser.',
  'Wer dich als Freund hat, hat einen Jackpot gezogen. 🎰',
  'Du hörst wirklich zu — das können nicht viele.',
  'Deine gute Laune sollte man in Flaschen abfüllen. 🍾',
];

const MOTIVATION = [
  '💪 Heute ist ein guter Tag, um anzufangen — nicht morgen.',
  '🚀 Kleine Schritte jeden Tag schlagen große Pläne, die nie starten.',
  '🔥 Du musst nicht perfekt sein. Du musst nur dranbleiben.',
  '🌱 Vergleich dich mit dir von gestern, nicht mit anderen von heute.',
  '⛰️ Der Gipfel sieht von unten immer unmöglich aus. Bis man oben steht.',
  '✨ Fehler sind Beweise, dass du es versuchst.',
  '🎯 Fokus bedeutet, zu 100 Dingen Nein zu sagen.',
  '🏃 Es ist okay, langsam zu sein. Stillstand ist das Problem.',
  '💡 Wenn Plan A nicht klappt: Das Alphabet hat noch 25 Buchstaben.',
  '🌊 Harte Zeiten erzeugen starke Menschen. Du bist gerade im Training.',
  '⚡ Motivation bringt dich zum Start. Gewohnheit bringt dich ans Ziel.',
  '🧗 Wachstum beginnt am Ende der Komfortzone.',
  '🌟 Niemand, der sein Bestes gegeben hat, hat es später bereut.',
  '🕐 In einem Jahr wirst du dir wünschen, heute angefangen zu haben.',
  '🏆 Champions trainieren, wenn niemand hinschaut.',
];

export const funCommands = [
  {
    name: 'zitat',
    aliases: ['quote'],
    group: 'community',
    desc: 'Ein Zitat zum Nachdenken',
    usage: '!zitat',
    async run(ctx) {
      return ctx.reply(`📜 ${pick(ZITATE)}`);
    },
  },
  {
    name: 'fakt',
    aliases: ['fact'],
    group: 'community',
    desc: 'Ein zufälliger Fun-Fact',
    usage: '!fakt',
    async run(ctx) {
      return ctx.reply(`💡 *Wusstest du?*
${pick(FAKTEN)}`);
    },
  },
  {
    name: 'kompliment',
    group: 'community',
    desc: 'Verteilt ein Kompliment (an dich oder @person)',
    usage: '!kompliment [@person]',
    async run(ctx) {
      const target = ctx.targetUser();
      if (target) {
        return ctx.reply(`💐 ${ctx.mentionTag(target)}: ${pick(KOMPLIMENTE)}`, [target]);
      }
      return ctx.reply(`💐 *${ctx.senderName}*: ${pick(KOMPLIMENTE)}`);
    },
  },
  {
    name: 'motivation',
    aliases: ['mut'],
    group: 'community',
    desc: 'Ein Motivations-Schub',
    usage: '!motivation',
    async run(ctx) {
      return ctx.reply(pick(MOTIVATION));
    },
  },
  {
    name: 'zufall',
    aliases: ['wahl', 'pick'],
    group: 'tools',
    desc: 'Wählt zufällig aus deinen Optionen',
    usage: '!zufall pizza, pasta, salat',
    async run(ctx) {
      const options = ctx.argText.split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
      if (options.length < 2) return ctx.reply('ℹ️ Gib mindestens 2 Optionen an: `!zufall pizza, pasta, salat`');
      if (options.length > 20) return ctx.reply('⚠️ Maximal 20 Optionen.');
      return ctx.reply(`🎯 Ich habe entschieden: *${pick(options)}*`);
    },
  },
  {
    name: 'password',
    aliases: ['passwort'],
    group: 'tools',
    desc: 'Erzeugt ein sicheres Zufalls-Passwort',
    usage: '!password [länge 8–64]',
    async run(ctx) {
      let len = parseInt(ctx.args[0] || '16', 10);
      if (!Number.isFinite(len)) len = 16;
      len = Math.max(8, Math.min(64, len));
      // Ohne leicht verwechselbare Zeichen (l/1/I, O/0)
      const chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*+-_=?';
      const bytes = crypto.randomBytes(len);
      let pw = '';
      for (let i = 0; i < len; i++) pw += chars[bytes[i] % chars.length];
      return ctx.reply(
        `🔐 Dein Passwort (${len} Zeichen):
\`\`\`${pw}\`\`\`
⚠️ Am besten direkt kopieren und diese Nachricht löschen.`
      );
    },
  },
];
