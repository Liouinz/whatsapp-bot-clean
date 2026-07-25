// Fun-Befehle: kleine Stimmungsmacher ohne externe APIs — alles offline,
// deterministisch abgesichert und pro Aufruf zufällig.

import crypto from 'node:crypto';

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ── Inhalts-Sammlungen (Deutsch, familientauglich) ─────────────────

const EIGHTBALL = [
  '✅ Ja, ganz sicher!',
  '✅ Davon kannst du ausgehen.',
  '✅ Alle Zeichen stehen auf Ja.',
  '✅ Ohne Zweifel.',
  '✅ Sieht gut aus!',
  '🤔 Frag später nochmal.',
  '🤔 Das kann ich gerade nicht sagen.',
  '🤔 Konzentrier dich und frag nochmal.',
  '🤔 Unklar — die Zukunft ist neblig.',
  '⛔ Eher nicht.',
  '⛔ Meine Quellen sagen Nein.',
  '⛔ Verlass dich nicht drauf.',
  '⛔ Sehr unwahrscheinlich.',
  '😏 Wenn du fest genug daran glaubst …',
  '🎲 50/50 — wirf lieber eine Münze (!muenze).',
];

const WITZE = [
  'Treffen sich zwei Magneten. Sagt der eine: „Was soll ich bloß anziehen?"',
  'Warum können Geister so schlecht lügen? Weil man durch sie hindurchsieht.',
  'Was macht ein Pirat am Computer? Er drückt die Enter-Taste.',
  'Kommt ein Pferd in die Bar. Fragt der Barkeeper: „Warum so ein langes Gesicht?"',
  'Ich wollte einen Witz über Natrium machen … Na, ok.',
  'Was ist orange und geht über die Berge? Eine Wanderine.',
  'Warum hat der Mathematiker Angst vor negativen Zahlen? Er würde alles tun, um sie zu vermeiden.',
  'Was sagt ein Krokodil, das einen Clown gefressen hat? „Schmeckt irgendwie komisch."',
  'Wie nennt man einen Bumerang, der nicht zurückkommt? Stock.',
  'Was ist weiß und stört beim Frühstück? Eine Lawine.',
  'Warum können Skelette so schlecht lügen? Man durchschaut sie sofort.',
  'Was macht eine Wolke, wenn es juckt? Sie kratzt am Himmel.',
  'Chuck Norris zählt bis unendlich. Zweimal.',
  'Was ist grün und klopft an der Tür? Ein Klopfsalat.',
  'Warum ging der Keks zum Arzt? Weil er sich so krümelig fühlte.',
  'Was sitzt auf einem Baum und ruft „Aha"? Ein Uhu mit Sprachfehler.',
  'Wie heißt der Bruchrechnungs-Beauftragte? Der Zählerableser.',
  'Was ist braun, klebrig und läuft durch die Wüste? Ein Karamel.',
  'Zwei Kerzen unterhalten sich: „Gehen wir heute aus?"',
  'Was ist rot und schlecht für die Zähne? Ein Ziegelstein.',
  'Warum trinken Mäuse keinen Alkohol? Weil sie Angst vorm Kater haben.',
  'Was macht ein Clown im Büro? Faxen.',
  'Treffen sich zwei Jäger. Beide tot.',
  'Wie nennt man ein helles Mammut? Hellmut.',
  'Was liegt am Strand und redet undeutlich? Eine Nuschel.',
];

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

const WAHRHEIT = [
  'Was war dein peinlichster Moment in diesem Jahr?',
  'Welchen Kontakt hast du zuletzt gestalkt?',
  'Was ist deine unbeliebteste heiße Meinung (Hot Take)?',
  'Welche App würdest du nie freiwillig löschen?',
  'Was war die kindischste Sache, die du diese Woche gemacht hast?',
  'Welche Nachricht hast du mal an die falsche Person geschickt?',
  'Was ist dein Guilty-Pleasure-Song?',
  'Wen aus dieser Gruppe würdest du auf eine einsame Insel mitnehmen?',
  'Was war deine schlechteste Frisur aller Zeiten?',
  'Welche Lüge erzählst du am häufigsten?',
  'Was war dein seltsamster Traum in letzter Zeit?',
  'Wie viele Stunden warst du gestern wirklich am Handy?',
  'Was ist das Kurioseste in deinem Suchverlauf?',
  'Welches Essen isst du heimlich, obwohl du es öffentlich schlecht redest?',
  'Was würdest du tun, wenn du einen Tag unsichtbar wärst?',
];

const PFLICHT = [
  'Schreib die nächsten 3 Nachrichten nur in GROSSBUCHSTABEN.',
  'Schick ein Foto von deinen Schuhen. Jetzt.',
  'Sag der Gruppe dein ehrliches Lieblingslied — ohne Ausreden.',
  'Beende jede Nachricht der nächsten 10 Minuten mit „…meow".',
  'Schreib ein Mini-Gedicht (2 Zeilen) über die Person über dir im Chat.',
  'Ändere für 1 Stunde deinen Status auf „Ich liebe Brokkoli 🥦".',
  'Erzähl einen Witz — er MUSS schlecht sein.',
  'Gib der letzten Person, die geschrieben hat, ein ernst gemeintes Kompliment.',
  'Sprachnachricht: Sing 5 Sekunden von deinem Lieblingslied.',
  'Schreib das Alphabet rückwärts — ohne zu googeln.',
  'Nutze in deiner nächsten Nachricht mindestens 7 Emojis.',
  'Erkläre in 2 Sätzen, warum Ananas auf Pizza gehört (auch wenn du es hasst).',
  'Poste dein ältestes Foto aus der Galerie, das du zeigen kannst.',
  'Tippe deine nächste Nachricht nur mit der Nase.',
  'Verrate dein aktuelles Handy-Hintergrundbild (Beschreibung reicht).',
];

const ENTWEDER = [
  ['Nie wieder Pizza', 'Nie wieder Schokolade'],
  ['Immer 10 Minuten zu spät', 'Immer 1 Stunde zu früh'],
  ['Gedanken lesen können', 'Fliegen können'],
  ['Nur noch flüstern', 'Nur noch schreien'],
  ['Ohne Internet leben', 'Ohne Musik leben'],
  ['Immer Sommer', 'Immer Winter'],
  ['Berühmt aber pleite', 'Reich aber unbekannt'],
  ['In die Vergangenheit reisen', 'In die Zukunft reisen'],
  ['Nie wieder Serien', 'Nie wieder Games'],
  ['Jeden Tag dasselbe Essen', 'Nie zweimal dasselbe Essen'],
  ['Mit Tieren sprechen', 'Alle Sprachen der Welt sprechen'],
  ['Immer die Wahrheit sagen müssen', 'Nie mehr sprechen dürfen'],
  ['Unsichtbar sein können', 'Sich teleportieren können'],
  ['Ein Leben ohne Handy', 'Ein Leben ohne Freunde treffen'],
  ['Immer Bahn fahren', 'Immer Fahrrad fahren'],
];

const HOROSKOP_BEREICHE = ['💼 Produktivität', '❤️ Beziehungen', '🍀 Glück', '⚡ Energie', '🧠 Fokus'];
const HOROSKOP_TIPPS = [
  'Sag heute einmal öfter Ja als sonst.',
  'Räum eine kleine Sache auf — der Kopf dankt es dir.',
  'Schreib der Person, an die du gerade denkst.',
  'Trink mehr Wasser. Ernsthaft.',
  'Mach heute einen kurzen Spaziergang ohne Handy.',
  'Erledige die unangenehmste Aufgabe ZUERST.',
  'Gönn dir was Kleines — du hast es dir verdient.',
  'Frag heute jemanden, wie es ihm wirklich geht.',
  'Leg das Handy eine Stunde früher weg als sonst.',
  'Lach über dich selbst — mindestens einmal.',
];

const SSP = ['schere', 'stein', 'papier'];
const SSP_ICON = { schere: '✂️', stein: '🪨', papier: '📄' };

function sspWinner(a, b) {
  if (a === b) return 0;
  const beats = { schere: 'papier', stein: 'schere', papier: 'stein' };
  return beats[a] === b ? 1 : -1;
}

/** Stabiler "Zufall" aus einem String — !ship soll für dasselbe Paar immer gleich sein. */
function stableHashPercent(text) {
  const hash = crypto.createHash('sha256').update(text).digest();
  return hash[0] % 101; // 0–100
}

export const funCommands = [
  {
    name: '8ball',
    aliases: ['kugel'],
    group: 'games',
    desc: 'Die magische Kugel beantwortet deine Frage',
    usage: '!8ball <frage>',
    async run(ctx) {
      if (!ctx.argText.trim()) return ctx.reply('🎱 Du musst schon eine Frage stellen! `!8ball Wird das was?`');
      return ctx.reply(`🎱 *Die Kugel spricht:*
${pick(EIGHTBALL)}`);
    },
  },
  {
    name: 'witz',
    aliases: ['joke'],
    group: 'games',
    desc: 'Erzählt einen Witz',
    usage: '!witz',
    async run(ctx) {
      return ctx.reply(`😂 ${pick(WITZE)}`);
    },
  },
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
    name: 'ship',
    group: 'games',
    desc: 'Wie gut passt ihr zusammen? (immer dasselbe Ergebnis pro Paar)',
    usage: '!ship @a @b',
    groupOnly: true,
    async run(ctx) {
      const mentioned = ctx.mentions();
      if (mentioned.length < 1) return ctx.reply('ℹ️ Nutzung: `!ship @person` (dich + Person) oder `!ship @a @b`');
      const a = mentioned.length >= 2 ? mentioned[0] : ctx.sender;
      const b = mentioned.length >= 2 ? mentioned[1] : mentioned[0];
      const key = [String(a), String(b)].sort().join('|');
      const percent = stableHashPercent(key);
      const bar = '❤️'.repeat(Math.round(percent / 20)) + '🖤'.repeat(5 - Math.round(percent / 20));
      let verdict;
      if (percent >= 80) verdict = 'Traumpaar-Alarm! 💍';
      else if (percent >= 60) verdict = 'Da geht was! 😏';
      else if (percent >= 40) verdict = 'Gute Freunde, mehr Funken braucht es noch.';
      else if (percent >= 20) verdict = 'Hmm … Gegensätze ziehen sich an?';
      else verdict = 'Lieber Kollegen bleiben. 😅';
      const tags = [a, b].filter((x, i, arr) => arr.indexOf(x) === i);
      return ctx.reply(
        `💘 *Liebes-Check*
${ctx.mentionTag(a)} × ${ctx.mentionTag(b)}
${bar} *${percent} %*
${verdict}`,
        tags
      );
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
    name: 'muenze',
    aliases: ['münze', 'flip'],
    group: 'games',
    desc: 'Wirft eine Münze',
    usage: '!muenze',
    async run(ctx) {
      const result = Math.random() < 0.5 ? '🪙 *KOPF*' : '🔢 *ZAHL*';
      return ctx.reply(`Die Münze fliegt … und zeigt: ${result}`);
    },
  },
  {
    name: 'ssp',
    aliases: ['schnickschnack'],
    group: 'games',
    desc: 'Schere-Stein-Papier gegen den Bot',
    usage: '!ssp schere|stein|papier',
    async run(ctx) {
      const mine = (ctx.args[0] || '').toLowerCase();
      if (!SSP.includes(mine)) return ctx.reply('ℹ️ Nutzung: `!ssp schere`, `!ssp stein` oder `!ssp papier`');
      const bot = pick(SSP);
      const result = sspWinner(mine, bot);
      const line = `${SSP_ICON[mine]} vs ${SSP_ICON[bot]}`;
      if (result === 0) return ctx.reply(`${line}\n🤝 Unentschieden — nochmal!`);
      if (result === 1) return ctx.reply(`${line}\n🎉 Du gewinnst! ${mine} schlägt ${bot}.`);
      return ctx.reply(`${line}\n😎 Ich gewinne! ${bot} schlägt ${mine}.`);
    },
  },
  {
    name: 'wahrheit',
    aliases: ['truth'],
    group: 'games',
    desc: 'Wahrheit-Frage (Wahrheit oder Pflicht)',
    usage: '!wahrheit [@person]',
    groupOnly: true,
    async run(ctx) {
      const target = ctx.targetUser();
      const who = target ? ctx.mentionTag(target) : `*${ctx.senderName}*`;
      return ctx.reply(`🎤 *Wahrheit für ${who}:*
${pick(WAHRHEIT)}`, target ? [target] : undefined);
    },
  },
  {
    name: 'pflicht',
    aliases: ['dare'],
    group: 'games',
    desc: 'Pflicht-Aufgabe (Wahrheit oder Pflicht)',
    usage: '!pflicht [@person]',
    groupOnly: true,
    async run(ctx) {
      const target = ctx.targetUser();
      const who = target ? ctx.mentionTag(target) : `*${ctx.senderName}*`;
      return ctx.reply(`🔥 *Pflicht für ${who}:*
${pick(PFLICHT)}`, target ? [target] : undefined);
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
  {
    name: 'wer',
    aliases: ['who'],
    group: 'games',
    desc: 'Wählt ein zufälliges Gruppenmitglied ("Wer muss abwaschen?")',
    usage: '!wer [frage]',
    groupOnly: true,
    async run(ctx) {
      const meta = await ctx.groupMeta();
      const members = (meta?.participants || []).map((p) => p.id).filter(Boolean);
      if (!members.length) return ctx.reply('⚠️ Konnte die Mitgliederliste gerade nicht laden — gleich nochmal versuchen.');
      const chosen = pick(members);
      const question = ctx.argText.trim();
      const head = question ? `❓ *${question.slice(0, 120)}*\n` : '';
      return ctx.reply(`${head}🎯 Das Schicksal wählt: ${ctx.mentionTag(chosen)}!`, [chosen]);
    },
  },
  {
    name: 'entweder',
    aliases: ['wde', 'wouldyourather'],
    group: 'games',
    desc: 'Würdest du eher …? Entscheide dich!',
    usage: '!entweder',
    async run(ctx) {
      const [a, b] = pick(ENTWEDER);
      return ctx.reply(`🤔 *Würdest du eher …*\n\n1️⃣ ${a}\n— oder —\n2️⃣ ${b}\n\n_Antworte mit 1 oder 2 und verteidige deine Wahl!_`);
    },
  },
  {
    name: 'horoskop',
    aliases: ['horoscope'],
    group: 'games',
    desc: 'Dein Tages-Horoskop (bleibt den ganzen Tag gleich)',
    usage: '!horoskop',
    async run(ctx) {
      // Stabil pro Person + Tag — Nachfragen "würfelt" nicht neu
      const day = new Date().toDateString();
      const lines = HOROSKOP_BEREICHE.map((bereich) => {
        const pct = stableHashPercent(`${ctx.sender}|${bereich}|${day}`);
        const stars = '★'.repeat(1 + Math.round((pct / 100) * 4)).padEnd(5, '☆');
        return `${bereich}: ${stars}`;
      });
      const tippIdx = stableHashPercent(`${ctx.sender}|tipp|${day}`) % HOROSKOP_TIPPS.length;
      return ctx.reply(
        `🔮 *Tages-Horoskop für ${ctx.senderName}*\n\n${lines.join('\n')}\n\n💡 _${HOROSKOP_TIPPS[tippIdx]}_`
      );
    },
  },
  {
    name: 'emojify',
    aliases: ['buchstaben'],
    group: 'games',
    desc: 'Verwandelt Text in große Emoji-Buchstaben',
    usage: '!emojify hallo',
    async run(ctx) {
      const text = ctx.argText.trim().toLowerCase();
      if (!text) return ctx.reply('ℹ️ Nutzung: `!emojify <text>` (max. 20 Zeichen)');
      if (text.length > 20) return ctx.reply('⚠️ Bitte maximal 20 Zeichen.');
      const DIGITS = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];
      const out = [...text].map((ch) => {
        if (ch >= 'a' && ch <= 'z') return String.fromCodePoint(0x1f1e6 + ch.charCodeAt(0) - 97);
        if (ch >= '0' && ch <= '9') return DIGITS[Number(ch)];
        if (ch === ' ') return '  ';
        return ch;
      }).join(' ');
      return ctx.reply(out);
    },
  },
  {
    name: 'prozent',
    aliases: ['wieviel'],
    group: 'games',
    desc: 'Wie viel Prozent …? Der Bot weiß es',
    usage: '!prozent bin ich heute produktiv',
    async run(ctx) {
      const question = ctx.argText.trim();
      if (!question) return ctx.reply('ℹ️ Nutzung: `!prozent <frage>` — z. B. `!prozent bin ich heute produktiv`');
      // Stabil pro Person + Frage + Tag, damit Nachfragen nicht "würfeln"
      const percent = stableHashPercent(`${ctx.sender}|${question.toLowerCase()}|${new Date().toDateString()}`);
      const filled = Math.round(percent / 10);
      const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
      return ctx.reply(`📊 *${question}*\n${bar} *${percent} %*`);
    },
  },
];
