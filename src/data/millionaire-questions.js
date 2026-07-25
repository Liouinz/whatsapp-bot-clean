// Fragenbank für "Wer wird Millionär?" (!millionär).
// Struktur pro Frage: { q, options: [RICHTIG, falsch, falsch, falsch], tier, hint? }
// - options[0] ist IMMER die richtige Antwort (wird bei der Ausgabe gemischt).
// - tier 1 = leicht (Stufe 1–5), 2 = mittel (6–10), 3 = schwer (11–15).
// - hint ist optional; fehlt er, erzeugt das Spiel automatisch einen.
// Bewusst als reine Daten ausgelagert, damit die Bank problemlos auf
// tausende Fragen wachsen kann, ohne die Spiel-Logik anzufassen.

export const MILLIONAIRE_QUESTIONS = [
  // ── Tier 1 (leicht) ──────────────────────────────────────────────
  { q: 'Welche Farbe hat der Himmel an einem klaren Tag?', options: ['Blau', 'Grün', 'Rot', 'Gelb'], tier: 1 },
  { q: 'Wie viele Beine hat ein Hund?', options: ['4', '2', '6', '8'], tier: 1 },
  { q: 'Welches Tier bellt?', options: ['Hund', 'Katze', 'Kuh', 'Pferd'], tier: 1 },
  { q: 'Wie viele Tage hat eine Woche?', options: ['7', '5', '6', '10'], tier: 1 },
  { q: 'Welche Frucht ist typischerweise gelb und krumm?', options: ['Banane', 'Apfel', 'Kirsche', 'Traube'], tier: 1 },
  { q: 'Was trinkt man morgens oft zum Wachwerden?', options: ['Kaffee', 'Suppe', 'Öl', 'Essig'], tier: 1 },
  { q: 'Wie viele Finger hat eine Hand normalerweise?', options: ['5', '4', '6', '3'], tier: 1 },
  { q: 'Welche Jahreszeit ist am kältesten?', options: ['Winter', 'Sommer', 'Frühling', 'Herbst'], tier: 1 },
  { q: 'Welches Verkehrsmittel fährt auf Schienen?', options: ['Zug', 'Auto', 'Boot', 'Flugzeug'], tier: 1 },
  { q: 'Was ist gefrorenes Wasser?', options: ['Eis', 'Dampf', 'Sand', 'Rauch'], tier: 1 },
  { q: 'Welche Farbe entsteht, wenn man Rot und Weiß mischt?', options: ['Rosa', 'Lila', 'Braun', 'Schwarz'], tier: 1 },
  { q: 'Wie viele Räder hat ein normales Fahrrad?', options: ['2', '3', '4', '1'], tier: 1 },

  // ── Tier 2 (mittel) ──────────────────────────────────────────────
  { q: 'Wie heißt die Hauptstadt von Frankreich?', options: ['Paris', 'Rom', 'Madrid', 'Berlin'], tier: 2 },
  { q: 'Welches Element hat das chemische Symbol „O"?', options: ['Sauerstoff', 'Gold', 'Eisen', 'Wasserstoff'], tier: 2 },
  { q: 'Wie viele Kontinente gibt es?', options: ['7', '5', '6', '8'], tier: 2 },
  { q: 'In welchem Jahr fiel die Berliner Mauer?', options: ['1989', '1979', '1991', '1985'], tier: 2 },
  { q: 'Welcher Planet ist der Sonne am nächsten?', options: ['Merkur', 'Venus', 'Mars', 'Erde'], tier: 2, hint: 'Er ist auch der kleinste Planet.' },
  { q: 'Wie heißt das größte Säugetier der Welt?', options: ['Blauwal', 'Elefant', 'Nashorn', 'Giraffe'], tier: 2 },
  { q: 'Wie viele Bundesländer hat Deutschland?', options: ['16', '14', '18', '12'], tier: 2 },
  { q: 'Welche Währung wird in Japan verwendet?', options: ['Yen', 'Won', 'Yuan', 'Baht'], tier: 2 },
  { q: 'Wer malte die „Mona Lisa"?', options: ['Leonardo da Vinci', 'Picasso', 'Van Gogh', 'Michelangelo'], tier: 2 },
  { q: 'Wie viele Minuten hat ein Tag?', options: ['1440', '1200', '2400', '960'], tier: 2 },
  { q: 'Welches Meer liegt zwischen Europa und Afrika?', options: ['Mittelmeer', 'Nordsee', 'Ostsee', 'Schwarzes Meer'], tier: 2 },
  { q: 'Wie heißt die Hauptstadt von Australien?', options: ['Canberra', 'Sydney', 'Melbourne', 'Perth'], tier: 2, hint: 'Es ist NICHT Sydney.' },

  // ── Tier 3 (schwer) ──────────────────────────────────────────────
  { q: 'Welches chemische Element hat die Ordnungszahl 79?', options: ['Gold', 'Silber', 'Platin', 'Quecksilber'], tier: 3, hint: 'Symbol „Au".' },
  { q: 'In welchem Jahr sank die Titanic?', options: ['1912', '1905', '1918', '1923'], tier: 3 },
  { q: 'Wie viele Herzen hat ein Oktopus?', options: ['3', '1', '2', '4'], tier: 3 },
  { q: 'Wer schrieb das Werk „Faust"?', options: ['Goethe', 'Schiller', 'Lessing', 'Kafka'], tier: 3 },
  { q: 'Welcher ist der längste Fluss der Welt?', options: ['Nil', 'Amazonas', 'Jangtse', 'Mississippi'], tier: 3, hint: 'Er fließt durch Afrika.' },
  { q: 'Was misst ein Seismograph?', options: ['Erdbeben', 'Temperatur', 'Luftdruck', 'Wind'], tier: 3 },
  { q: 'Wie viele Knochen hat ein erwachsener Mensch?', options: ['206', '198', '212', '224'], tier: 3 },
  { q: 'Welches Land hat die meisten Zeitzonen?', options: ['Frankreich', 'Russland', 'USA', 'China'], tier: 3, hint: 'Wegen seiner Überseegebiete.' },
  { q: 'Wer entwickelte die Relativitätstheorie?', options: ['Einstein', 'Newton', 'Bohr', 'Tesla'], tier: 3 },
  { q: 'Welche Sprache hat weltweit die meisten Muttersprachler?', options: ['Mandarin-Chinesisch', 'Englisch', 'Spanisch', 'Hindi'], tier: 3 },
  { q: 'Aus wie vielen Spielern besteht eine Fußballmannschaft auf dem Feld?', options: ['11', '10', '12', '9'], tier: 3 },
  { q: 'Welcher Edelstein ist das härteste natürliche Material?', options: ['Diamant', 'Rubin', 'Saphir', 'Smaragd'], tier: 3 },
];

export function pickQuestion(tier, usedIndices) {
  const pool = [];
  for (let i = 0; i < MILLIONAIRE_QUESTIONS.length; i++) {
    if (MILLIONAIRE_QUESTIONS[i].tier === tier && !usedIndices.has(i)) pool.push(i);
  }
  if (!pool.length) {
    for (let i = 0; i < MILLIONAIRE_QUESTIONS.length; i++) if (!usedIndices.has(i)) pool.push(i);
  }
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}
