# CLAUDE.md

WhatsApp-Community-Bot. Node 20, ESM (`"type": "module"`), kein Build-Schritt.
Baileys (WhatsApp) + libsql/Turso (DB) + Express (Panel).

## Antwortstil

Knapp. Kurze Stichpunkte, keine Einleitung, kein Fazit, keine Wiederholung der
Frage. Nur die Dateien und Bereiche lesen, die für die aktuelle Aufgabe nötig
sind. Terminal-Ausgaben filtern (`grep`/`head`), statt ganze Logs auszugeben.

## Struktur

```
src/index.js        Bootstrap, Baileys-Lifecycle, Reconnect, Watchdog, Self-Ping
src/router.js       Dispatch: fester Befehl → Custom/FAQ → KI-Fallback. Permissions, Rate-Limit, XP, AFK
src/loader.js       rekursive Command-Autodiscovery (einzige Registrierungsquelle)
src/config.js       alle Env-Zugriffe; sonst nirgends process.env lesen
src/preflight.js    Env- und DB-Check vor dem Start, Klartext-Fehler
src/db.js           Re-Export von core/database/* plus XP-/Stat-Schreibpuffer
src/core/database/  client (dbRun/dbRows) · schema (initDb, DATA_TABLES) · guard · wipe
src/core/cache/     TTLCache
src/auth.js         Baileys-Auth-State in Turso (useMultiFileAuthState wird bewusst nicht benutzt)
src/queue.js        serielle Sende-Queue mit Jitter
src/permissions.js  LID-aware Rollen (USER < GROUP_ADMIN < COMMUNITY_OWNER < BOT_OWNER)
src/moderation.js   Auto-Mod, Warn-Eskalation, Anti-Raid
src/scheduler.js    Tick-Loop: geplante Nachrichten, Nachtmodus, Geburtstage, Wochenreport
src/ai.js           Gemini nur als Fallback, Cooldown + Tageslimit + Circuit-Breaker
src/dashboard.js    Express-Panel, ~40 Routen, alle hinter requireAuth
src/dashboard-ui.js gesamte Panel-UI als JS-String-Templates (1328 Z. — nicht komplett lesen)
src/data/           statische Daten: Shop-Items, Quests, Events, Millionär-Fragen
test/               10 .mjs-Dateien, `npm test` = `node --test`
```

Hinweis: `ARCHITECTURE.md` beschreibt ein `src/services/`-Verzeichnis. **Das
existiert nicht.** Die Service-Schicht sind die flachen `src/*.js`
(`moderation.js`, `scheduler.js`, `ai.js`, `events.js`, `boosts.js`,
`prestige.js`).

## Command-Vertrag

Ein Command ist ein Objekt mit `name` (String) und `run(ctx)` (Funktion).
`src/loader.js` scannt `src/commands/` rekursiv und akzeptiert drei Exportformen:

```js
export default { name: 'x', run }          // Einzeldatei
export const xCommand = { name: 'x', run } // Einzeldatei, bare named export
export const xCommands = [ {...}, {...} ]  // Sammeldatei
```

Die `run`-Pflicht ist zwingend und beabsichtigt: Hilfsmodule wie
`commands/games/index.js` exportieren Funktionen, und Funktionen haben
ebenfalls ein `.name`-Property. Ohne `run` würden sie als Command registriert.

Wichtige Felder:

- `group` — steuert die Kill-Switches in `router.js` (`games`, `economy`) **und**
  die Gruppierung im `!hilfe`-Menü (`community.js`). Fehlt `group`, leitet der
  Loader es aus `category` ab. Gültige Gruppen im Hilfemenü: `community`,
  `economy`, `tools`, `utility`, `games`, `admin` — eine andere Gruppe macht den
  Befehl unsichtbar.
- `aliases` — teilen sich den Schlüsselraum mit `name`; Kollisionen werden beim
  Laden gemeldet.
- `adminOnly` / `ownerOnly` / `botOwnerOnly` / `groupOnly` — deklarativ, zentral
  in `router.js` durchgesetzt. Keine eigenen Rechteprüfungen im Handler bauen.

Neue Befehle als **Einzeldatei** anlegen. Die bestehenden Sammeldateien sind
Altbestand, nicht das Vorbild:

`admin.js` 28 · `fun.js` 18 · `economy.js` 8 · `items.js` 8 · `community.js` 6 ·
`management.js` 6 · `custom.js` 5 · `schedule.js` 5 · `tools.js` 4 · `polls.js` 4 ·
`millionaer.js` 4 · Rest 1–3. `games/*.js` ist je Datei ein bis drei Befehle.

Insgesamt 127 Befehle, 255 Schlüssel inklusive Aliase.

## Datenbank

- `dbRun(sql, args)` wirft; `dbRows(sql, args)` schluckt Fehler und gibt `[]`.
  Wo der Unterschied zwischen „keine Zeilen" und „DB weg" zählt:
  `dbRowsStrict()`.
- Immer gebundene `?`-Parameter. Tabellen-/Spaltennamen nur aus fest
  verdrahteten Allowlists interpolieren.
- **`auth_creds` und `auth_keys` sind unantastbar.** `core/database/guard.js`
  parst jedes Statement in `dbRun` und blockt Schreibzugriffe darauf. Cleanup
  und Wipe filtern sie heraus.
- Neue Tabelle angelegt? Dann auch in `DATA_TABLES` (`schema.js`) eintragen,
  sonst überlebt sie jeden Panel-Wipe.

## Tests

`npm ci && npm test`. Stand: 78 pass / 4 fail. Die 4 Fehlschläge sind
vorbestehende **Test**-Defekte, keine Code-Fehler:

- 2× `runCleanup` — `test/cleanup-guard.test.mjs` importiert eine Funktion, die
  es in `src/scheduler.js` nie gab.
- `connection-watchdog` — Regex erwartet `startWatchdog()`, der Code ruft
  korrekt `startWatchdog(sock)`.
- `items` „Kaufen" — Test nimmt Startguthaben 100 an, `config.js` setzt 10000.

Kein ESLint, kein Prettier, keine CI.
