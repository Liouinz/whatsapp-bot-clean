---
name: WhatsApp Community Bot — Control Center
description: Nüchternes Token-System für das Panel eines selbst gehosteten WhatsApp-Community-Bots. Zwei Themes, ein wählbarer Akzent, Farbe ausschließlich mit Bedeutung.
colors:
  bg: "#131519"
  bg-2: "#0f1114"
  surface: "#1a1d22"
  surface-2: "#21252b"
  surface-3: "#282d34"
  line: "#2b3038"
  line-strong: "#3b424c"
  line-ui: "#656870"
  text: "#e9e7e2"
  text-dim: "#a3a9b2"
  text-faint: "#838994"
  accent-amber: "#e0a33c"
  accent-violet: "#9b8cf0"
  accent-mint: "#58cfa6"
  accent-ink: "#14161a"
  ok: "#4cb782"
  warn: "#d9a441"
  bad: "#ea7a72"
  bad-solid: "#c8473f"
  nature-bg: "#f4f2ed"
  nature-surface: "#fbfaf7"
  nature-text: "#1e2126"
  nature-text-dim: "#575d66"
  nature-accent-amber: "#8a5a06"
typography:
  display:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 600
    lineHeight: 1.2
  headline:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.2
  body:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 560
    lineHeight: 1.3
    letterSpacing: "0.08em"
  mono:
    fontFamily: "ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, Consolas, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  r1: "3px"
  r2: "6px"
  r3: "10px"
spacing:
  s1: "4px"
  s2: "8px"
  s3: "12px"
  s4: "16px"
  s5: "24px"
  s6: "32px"
  s7: "48px"
  s8: "64px"
components:
  button-primary:
    backgroundColor: "{colors.accent-amber}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.r2}"
    padding: "9px 16px"
  button-ghost:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text}"
    rounded: "{rounded.r2}"
    padding: "9px 16px"
  button-danger:
    backgroundColor: "{colors.bad-solid}"
    textColor: "#ffffff"
    rounded: "{rounded.r2}"
    padding: "9px 16px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.r3}"
    padding: "16px"
  badge-neutral:
    backgroundColor: "{colors.surface-3}"
    textColor: "{colors.text-dim}"
    rounded: "{rounded.r1}"
    padding: "3px 8px"
  badge-ok:
    backgroundColor: "{colors.ok}"
    textColor: "{colors.ok}"
    rounded: "{rounded.r1}"
    padding: "3px 8px"
  badge-bad:
    backgroundColor: "{colors.bad}"
    textColor: "{colors.bad}"
    rounded: "{rounded.r1}"
    padding: "3px 8px"
---

# Design System: WhatsApp Community Bot — Control Center

## 1. Überblick

**Leitbild: „Der Kontrollraum, nicht das Schaufenster."**

Das Panel ist ein Betriebswerkzeug für einen Bot, der unbeaufsichtigt läuft.
Wer es öffnet, will in Sekunden wissen, ob die Verbindung steht, wer gerade
auffällig ist und welcher Schalter umgelegt werden muss. Alles, was dieser
Frage nicht dient, ist Ballast. Deshalb: ruhige Flächen, ein einziger Akzent,
Farbe nur dort, wo sie eine Aussage über den Betrieb trifft.

Das frühere Aurora-Glassmorphism-Bild ist bewusst abgelöst worden. Blur,
Leuchtkanten und mehrfarbige Verläufe kosteten Lesbarkeit und Rechenzeit auf
Telefonen und trugen keine Information. Was blieb, ist ein Token-System, das
sich in beiden Themes und allen drei Akzenten messbar an WCAG 2.1 AA hält.

**Kennzeichen**
- Zwei Themes: dunkel (Standard) und `nature` (helles Papier-Theme).
- Ein wählbarer Akzent — Amber, Violett, Mint — jeweils nur für Interaktion.
- Drei Zustandsfarben — `--ok`, `--warn`, `--bad` — nur für Betriebsaussagen.
- Tiefe entsteht aus drei neutralen Schattenstufen, nicht aus Leuchten.
- Ein Rasterschritt von 4 px, acht Abstandsstufen, sechs Schriftgrößen.
- Mobile zuerst: unter 900 px eine feste untere Leiste, darüber eine Seitenspalte.

## 2. Farben

### Flächen
Fünf abgestufte Flächen bauen die Hierarchie auf: `--bg` (Seite), `--bg-2`
(tiefer gelegte Bereiche wie Eingabefelder), `--surface` (Karte), `--surface-2`
(Karte auf Karte, Geisterknopf), `--surface-3` (neutrale Badge, Hover).

Drei Linien: `--line` (Trennung ohne Bedienbedeutung), `--line-strong`
(Betonung), `--line-ui` (Rand jedes Bedienelements — liegt bei 3,03:1 und
erfüllt damit WCAG 1.4.11 für grafische Objekte).

### Text
`--text` für Inhalt, `--text-dim` für Nebeninformation, `--text-faint` für die
schwächste Stufe (interne IDs, Zeitstempel). `--text-faint` wurde von `#8b909a`
auf `#838994` bzw. `#5f666f` korrigiert, weil es zuvor je nach Fläche zwischen
3,69:1 und 4,13:1 lag.

### Akzent — nur Interaktion
Genau eine Akzentfarbe ist gleichzeitig aktiv. Sie markiert Fokus, aktive
Navigation und die primäre Aktion. Sie sagt nie etwas über den Zustand des
Bots aus. Zwei Abstufungen: `--accent-dim` als Fläche, `--accent-line` als Rand.

### Zustand — nur Status
`--ok` (läuft), `--warn` (beobachten), `--bad` (kaputt). Zusätzlich
`--bad-solid` für den gefüllten Gefahrenknopf: Weiß auf `--bad` lag bei 3,19:1,
Weiß auf `--bad-solid` besteht.

### Benannte Regeln
**Die Bedeutungsregel.** Eine Farbe erscheint nur, wenn sie eine Aussage
trägt. Dekorative Einfärbung gibt es nicht — eine neutrale Fläche ist die
Voreinstellung, nicht der Notbehelf.

**Die Prüfregel.** Neue Farbpaare werden gemessen, nicht geschätzt, und zwar
gegen die *dunkelste* Fläche des hellen Themes (`--bg-2`), nicht gegen
`--surface`. Das Skript im Arbeitsverzeichnis liest die berechneten Werte aus
dem laufenden DOM; genau so wurden alle bisherigen Verstöße gefunden.

## 3. Typografie

Systemschriften: `ui-sans-serif, system-ui, …` für alles, `ui-monospace, …`
für Logzeilen, IDs und Telefonnummern in Tabellen. Keine Webfont-Ladung —
das spart auf dem Telefon einen Netzwerkweg und einen Layoutsprung.

Hierarchie über sechs Stufen (`--fs-xs` … `--fs-2xl`) und zwei Zeilenhöhen
(`--lh-tight`, `--lh-normal`). Beschriftungen von Karten und Abschnitten sind
klein, versal und weit gesperrt (0,08 em) und immer `--text-dim` — sie sind
Rahmen, nicht Inhalt.

**Die Ein-Familien-Regel.** Eine Sans für die gesamte Oberfläche, eine
Monospace für maschinenlesbare Werte. Nichts sonst.

## 4. Tiefe

Drei Schattenstufen, alle neutral: `--sh1` (Karte in Ruhe), `--sh2`
(Schwebendes wie Toasts), `--sh3` (Overlay wie Modal und Befehlspalette).
Farbiges Leuchten als Tiefenmittel gibt es nicht mehr.

**Die Sparsamkeitsregel.** Eine Karte in Ruhe bekommt `--sh1` und einen
1-px-Rand. Wer mehr Betonung braucht, ändert die Fläche, nicht den Schatten.

## 5. Komponenten

### Knöpfe
Radius `--r2`, Mindesthöhe 38 px (klein: 32 px), Schriftgewicht 560.
Primär füllt den Akzent mit `--accent-ink` als Text. `ghost` liegt auf
`--surface-2` mit `--line-ui` als Rand. `danger` füllt `--bad-solid` mit Weiß.
Hover ändert Helligkeit, nicht Größe.

### Karten
`--surface`, 1 px `--line`, Radius `--r3`, Innenabstand `--s4`, Schatten
`--sh1`. Die Überschrift `h3` ist eine Beschriftung, keine Schlagzeile.

### Eingaben
`--bg-2` als Fläche, `--line-ui` als Rand, Radius `--r2`. Der Fokus setzt
einen sichtbaren Akzentrahmen ohne Layoutsprung. Jedes Feld hat ein `label`;
wo es optisch stört, bleibt es über `hideLabel` für Screenreader erhalten.

### Badges
Radius `--r1`, versal, klein. Vier Rollen: neutral (`--surface-3`, für
Sacheigenschaften wie „Anti-Link aktiv"), `ok`, `warn`, `bad`. Die neutrale
Variante ist ausdrücklich vorgesehen — nicht jede Eigenschaft ist ein Alarm.

### Tabellen
`.tbl` in einem `.tbl-wrap` mit `overflow-x: auto` **und `contain: paint`**.
Ohne `contain` wurde die ganze Seite auf schmalen Geräten schiebbar, obwohl
der Wrapper korrekt gesetzt war — das war ein echter, gemessener Fehler.

### Navigation
Ab 900 px eine feste Seitenspalte, darunter eine untere Leiste mit
Symbol-über-Text. Der aktive Eintrag trägt `--accent-dim` und Akzenttext.
Selten genutzte Bereiche liegen mobil unter „Mehr".

### Befehlspalette
Ctrl/Cmd+K öffnet eine Liste über `role="dialog"` mit Fokusfalle, Escape,
Pfeiltasten und Enter. Sie ruft ausschließlich vorhandene Endpunkte auf und
führt keine eigene Zustandshaltung — bewusst schlank gehalten.

### Zustandszeile (Signaturkomponente)
Eine Zeile am Kopf der Übersicht beantwortet die einzige Frage, die immer
zuerst gestellt wird: läuft der Bot? Sie trägt `is-open`, `is-connecting` oder
`is-down` und färbt sich entsprechend — der einzige Ort, an dem Farbe ohne
Interaktion großflächig auftritt.

## 6. Gebote und Verbote

### Tue:
- **Tue** jede Größe aus den Tokens nehmen — `--s1…--s8`, `--fs-xs…--fs-2xl`,
  `--r1…--r3`, `--sh1…--sh3`. Ad-hoc-Pixelwerte sind der Anfang vom Zerfall.
- **Tue** Kontraste messen, bevor du eine Farbe einführst, und zwar in beiden
  Themes und allen drei Akzenten.
- **Tue** anklickbare Listenzeilen als `<button class="list-btn">` bauen, damit
  sie per Tastatur erreichbar sind.
- **Tue** Serverdaten über `h()` als Textknoten einsetzen. Das `html:`-Attribut
  ist ausschließlich für fest verdrahtete Symbole und aus Zahlen gebaute SVGs.
- **Tue** jede Animation hinter `prefers-reduced-motion` abschaltbar halten —
  die globale Regel ist vorhanden, neue Bewegung darf sie nicht umgehen.

### Tue nicht:
- **Tue nicht** Blur, Leuchten oder mehrfarbige Verläufe wieder einführen. Das
  war die vorige Identität und wurde aus Lesbarkeits- und Leistungsgründen
  abgelöst.
- **Tue nicht** Akzentfarbe für Statusaussagen benutzen und Zustandsfarben
  nicht für Interaktion. Die Trennung ist der Kern des Systems.
- **Tue nicht** eine zweite Schriftfamilie „zur Abwechslung" hinzufügen.
- **Tue nicht** `innerHTML` mit Werten aus der Datenbank oder von WhatsApp
  füllen — Namen sind Fremdeingaben.
- **Tue nicht** rohe JIDs als Anzeige verwenden. Anzeige ist
  „+49 170 1234567 (Max Mustermann)"; die JID bleibt technische Identität und
  steht höchstens nachrangig daneben.
