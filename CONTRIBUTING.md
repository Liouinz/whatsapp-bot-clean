# Mitarbeiten

Danke fürs Interesse. Dieses Dokument beschreibt, was beim Ändern dieses
Projekts zählt — knapp und ohne Zeremonie.

## Aufsetzen

```bash
npm ci
cp .env.example .env    # ausfüllen
rm -f .test-*.db* && npm test
```

Node ≥ 20, ESM (`"type": "module"`), kein Build-Schritt. Kein ESLint, kein
Prettier — richte dich nach dem Stil der Datei, die du gerade änderst.

## Der wichtigste Grundsatz

**Ein Fehler ohne Test ist nicht behoben.** Für jeden behobenen Fehler gehört
ein Test dazu, der *gegen den Stand vor dem Fix fehlschlägt*. Prüfe das
tatsächlich, statt es anzunehmen:

```bash
git stash && rm -f .test-*.db* && npm test    # der neue Test MUSS rot sein
git stash pop
```

Die Regressionstests in `test/regression-audit*.test.mjs` und
`test/regression-phase1.test.mjs` sind nach diesem Muster gebaut. Ein Fehler,
der einmal da war, kommt sonst wieder.

## Tests

`npm test` ist `node --test`. Die Tests laufen gegen echte lokale
SQLite-Dateien, nicht gegen Mocks; Panel-Tests starten ein echtes
`createDashboard()` auf einem freien Port und sprechen über HTTP mit ihm.

**Vor jedem Lauf `rm -f .test-*.db*`.** Ein warmer Zustand hat hier schon einmal
einen echten Fehler verdeckt — ein Test wurde grün, weil Zeilen aus dem
vorherigen Lauf überlebt hatten. Nur ein kalter Lauf zählt.

Jede Testdatei benutzt ihre eigene Datenbankdatei. Wenn du eine neue anlegst,
halte dich daran, sonst stören sich parallele Läufe.

## Neue Befehle

Als **Einzeldatei** unter `src/commands/`. Die großen Sammeldateien sind
Altbestand, kein Vorbild.

```js
export default {
  name: 'beispiel',
  aliases: ['bsp'],
  group: 'community',        // community | tools | utility | admin
  desc: 'Was der Befehl tut',
  usage: '!beispiel [was]',
  adminOnly: false,          // deklarativ — NICHT im Handler prüfen
  groupOnly: true,
  async run(ctx) {
    return ctx.reply('Hallo');
  },
};
```

`src/loader.js` findet die Datei von selbst; es gibt keine Registrierungsliste,
in die du etwas eintragen müsstest.

Worauf du achten musst:

- **`run` ist Pflicht.** Ohne `run` wird nichts registriert — das ist Absicht,
  sonst würde jede exportierte Hilfsfunktion (die ebenfalls ein `.name` hat) als
  Befehl landen.
- **`group` entscheidet über die Sichtbarkeit** im `!hilfe`-Menü. Nur
  `community`, `tools`, `utility` und `admin` erscheinen dort — jede andere
  Gruppe macht den Befehl unsichtbar.
- **Rechte deklarativ.** `adminOnly` / `ownerOnly` / `botOwnerOnly` /
  `groupOnly` setzen, nicht selbst im Handler prüfen. Die Durchsetzung liegt
  zentral in `router.js`. Einzige Ausnahme: ein Befehl, der öffentliche *und*
  Admin-Unterbefehle mischt (siehe `!event`).
- **Namen und Aliase teilen sich einen Schlüsselraum.** Kollisionen meldet der
  Loader beim Start.

## Datenbank

- Schreiben nur über `dbRun()`, Stapel nur über `dbBatch()`. `getDb().batch()`
  oder `getDb().execute()` direkt aufzurufen umgeht den Sicherheits-Guard.
  Legitime Ausnahmen sind ausschließlich `auth.js` und `schema.js`.
- **Immer gebundene `?`-Parameter.** Tabellen- und Spaltennamen nur aus fest
  verdrahteten Listen interpolieren, nie aus Eingaben.
- `dbRun()` wirft; `dbRows()` schluckt Fehler und gibt `[]` zurück. Wo der
  Unterschied zwischen „keine Zeilen" und „Datenbank weg" zählt, nimm
  `dbRowsStrict()`.
- **`auth_creds` und `auth_keys` sind unantastbar.** Der Guard blockt
  Schreibzugriffe darauf.
- Tagesschlüssel immer über `dayKey()` / `todayKey()` aus `db.js`, nie über
  `toISOString().slice(0, 10)` — das wäre UTC, der Bot läuft auf
  `config.timezone`.
- Neue Tabelle? Dann auch in `DATA_TABLES` eintragen, sonst überlebt sie jeden
  Panel-Wipe. Eine Prüfung beim Start erzwingt das in beide Richtungen.

## Panel

Neue Endpunkte gehören an den `api`-Router. Der läuft durch `asyncSafe()`,
das jedem Handler ein `.catch(next)` anhängt — ohne das wird die abgelehnte
Promise eines `async`-Handlers in Express 4 zur `unhandledRejection` und reißt
den Prozess mit. Routen direkt an `app` haben diesen Schutz **nicht**.

In der UI (`dashboard-ui.js`): **kein `innerHTML` für Serverdaten.** `h()`
erzeugt Text-Nodes; das `html:`-Attribut ist ausschließlich für fest
verdrahtete Icons und aus Zahlen gebaute SVG-Diagramme.

## Umgebungsvariablen

Nur `src/config.js` liest `process.env`. Neue Variablen dort ergänzen, in
`.env.example` dokumentieren und in der README-Tabelle nachtragen. Kritische
Werte gehören zusätzlich in die Prüfung in `src/preflight.js` — lieber ein
Klartext-Abbruch beim Start als ein stiller Fehler im Betrieb.

## Commits und Pull Requests

Beschreibe **was kaputt war und woran man das sieht**, nicht nur was du geändert
hast. Wenn du einen Befund reproduziert hast, nimm die Ausgabe mit auf — das ist
der Unterschied zwischen einer Behauptung und einem Beleg.

Vor dem Öffnen eines PR:

```bash
rm -f .test-*.db* && npm test    # muss grün sein
npm audit --omit=dev             # muss 0 Vulnerabilities melden
```

## Was du nicht tun solltest

- Umbauen, weil es dir besser gefiele. Änderungen brauchen einen Grund:
  Fehler, Sicherheit, Wartbarkeit, Klarheit.
- Einen Test abschalten oder ausklammern, um grün zu werden.
- Secrets, Tokens, Telefonnummern oder Sitzungsdaten committen.
- Eine destruktive Datenbank-Migration schreiben. Verwaiste Tabellen werden
  dokumentiert, nicht gelöscht.
