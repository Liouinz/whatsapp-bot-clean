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
src/core/database/  client (dbRun/dbRows/dbBatch) · schema (initDb, DATA_TABLES) · guard · wipe
src/core/cache/     TTLCache
src/auth.js         Baileys-Auth-State in Turso (useMultiFileAuthState wird bewusst nicht benutzt)
src/queue.js        serielle Sende-Queue mit Jitter
src/permissions.js  LID-aware Rollen (USER < GROUP_ADMIN < COMMUNITY_OWNER < BOT_OWNER)
src/identity.js     Nutzeranzeige: JID → "+49 170 1234567 (Max Mustermann)", Batch-Aufloesung, Kontaktaufnahme
src/moderation.js   Auto-Mod, Warn-Eskalation, Anti-Raid
src/scheduler.js    Tick-Loop: geplante Nachrichten, Nachtmodus, Geburtstage, Wochenreport
src/ai.js           Gemini nur als Fallback, Cooldown + Tageslimit + Circuit-Breaker
src/dashboard.js    Express-Panel, ~40 Routen, alle hinter requireAuth
src/dashboard-ui.js gesamte Panel-UI als JS-String-Templates (~2400 Z. — nicht komplett lesen)
src/data/           statische Daten: Saison-Events
test/               10 .mjs-Dateien, `npm test` = `node --test`
```

Die Service-Schicht sind die flachen `src/*.js` (`moderation.js`,
`scheduler.js`, `ai.js`, `events.js`).

## Command-Vertrag

Ein Command ist ein Objekt mit `name` (String) und `run(ctx)` (Funktion).
`src/loader.js` scannt `src/commands/` rekursiv und akzeptiert drei Exportformen:

```js
export default { name: 'x', run }          // Einzeldatei
export const xCommand = { name: 'x', run } // Einzeldatei, bare named export
export const xCommands = [ {...}, {...} ]  // Sammeldatei
```

Die `run`-Pflicht ist zwingend und beabsichtigt: Hilfsmodule können Funktionen
exportieren, und Funktionen haben ebenfalls ein `.name`-Property. Ohne `run`
würden sie als Command registriert.

Wichtige Felder:

- `group` — steuert die Gruppierung im `!hilfe`-Menü (`community.js`). Fehlt
  `group`, leitet der Loader es aus `category` ab. Gültige Gruppen im Hilfemenü:
  `community`, `tools`, `utility`, `admin` — eine andere Gruppe macht den
  Befehl unsichtbar.
- `aliases` — teilen sich den Schlüsselraum mit `name`; Kollisionen werden beim
  Laden gemeldet.
- `adminOnly` / `ownerOnly` / `botOwnerOnly` / `groupOnly` — deklarativ, zentral
  in `router.js` durchgesetzt. Keine eigenen Rechteprüfungen im Handler bauen.

Neue Befehle als **Einzeldatei** anlegen. Die bestehenden Sammeldateien sind
Altbestand, nicht das Vorbild:

`admin.js` 27 · `community.js` 6 · `management.js` 6 · `fun.js` 6 ·
`custom.js` 5 · `schedule.js` 5 · `tools.js` 4 · `polls.js` 4 · Rest 1–3.

Insgesamt 75 Befehle (126 Schlüssel inkl. Aliassen).

## Datenbank

- `dbRun(sql, args)` wirft; `dbRows(sql, args)` schluckt Fehler und gibt `[]`.
  Wo der Unterschied zwischen „keine Zeilen" und „DB weg" zählt:
  `dbRowsStrict()`.
- Immer gebundene `?`-Parameter. Tabellen-/Spaltennamen nur aus fest
  verdrahteten Allowlists interpolieren.
- **`auth_creds` und `auth_keys` sind unantastbar.** `core/database/guard.js`
  parst jedes Statement in `dbRun` und blockt Schreibzugriffe darauf. Cleanup
  und Wipe filtern sie heraus.
- Stapelschreiben nur ueber `dbBatch()`. `getDb().batch()` direkt aufzurufen
  umgeht den Guard — die Zusage oben gilt sonst nur fuer `dbRun`.
- Neue Tabelle angelegt? Dann auch in `DATA_TABLES` (`schema.js`) eintragen,
  sonst überlebt sie jeden Panel-Wipe.

## Tests

`npm ci && npm test`. Stand: **112 pass / 0 fail** (kalte DB).

Wichtig: **Test-DBs vor dem Lauf löschen** (`rm -f .test-*.db*`). Die Dateien
sind gitignored, und ein warmer Zustand hat früher einen echten Fehler verdeckt
— der Auth-Reconnect-Test wurde grün, weil Zeilen aus dem vorherigen Lauf
überlebten. Ein Lauf auf kalter DB ist der einzige aussagekräftige.

`test/regression-audit2.test.mjs` deckt die im zweiten Audit bestätigten
Befunde ab (Wochenreport-Dedupe, Auth-Instanz-Stilllegung, Key-Persistenz,
Scheduler-Claim, atomare Transfers). 8 dieser Tests schlagen gegen den Stand
vor den Fixes fehl — das ist geprüft, nicht angenommen.

`test/regression-audit3.test.mjs` deckt den dritten Audit ab: Login-Lockout an
`req.ip`, AI-Breaker bei 429, kumulatives AI-Zeitbudget, Prompt-Trennung,
Event-Wiederherstellung beim Start, Guard gegen SQL-Kommentare, Laden der
Custom-Befehle beim Start, Invalidierung des Gruppen-Caches. Auch hier gilt:
gegen den Stand vor den Fixes schlagen sie fehl, geprüft per `git stash`.

`test/contacts.test.mjs` deckt die Kontaktaufnahme und die Nutzersuche ab
(28 Tests): Einspielen von `Contact`-Objekten, LID+Nummer als *eine* Person,
Prioritaet der Namensquellen, und die Suche auf HTTP-Ebene gegen ein echtes
`createDashboard()` auf Port 0 — 401 ohne Sitzung, alle fuenf Suchformen
finden dieselbe Person, vollstaendiges `pagination`-Objekt, Limit-Deckel,
Injection und LIKE-Platzhalter, manipulierter Sortierschluessel,
10.000-Zeichen-Anfrage, HTML und Unicode als Text.

Ein Test kompiliert das Client-JS aus `dashboard-ui.js` mit `vm.Script`. Der
Grund ist konkret: in einem Template-Literal wird `\d` zu `d` und ein Backtick
beendet den String — beides hat hier schon echte Fehler erzeugt, die
`node --check` auf der Datei selbst *nicht* sieht.

Kein ESLint, kein Prettier, keine CI.

## Panel-UI

`dashboard-ui.js` liefert CSS, HTML-Rumpf und Client-JS als String-Templates.
Regeln, die beim Ändern zählen:

- **Ein Token-System.** Abstände `--s1…--s8`, Schriftgrößen `--fs-xs…--fs-2xl`,
  Radien `--r1…--r3`, Schatten `--sh1…--sh3`. Keine Ad-hoc-Pixelwerte.
- **Farbe bedeutet Zustand.** `--ok` / `--warn` / `--bad` nur für Aussagen über
  den Betrieb, nie dekorativ. Der wählbare Akzent gilt für Interaktion
  (Fokus, aktive Navigation, primäre Aktion).
- **Kontrast ist geprüft, nicht geschätzt.** Beide Themes und alle drei Akzente
  erfüllen 4.5:1 für Text und 3:1 für grafische Objekte. Neue Farbpaare gegen
  die *dunkelste* Fläche des hellen Themes (`--bg-2`) prüfen, nicht gegen
  `--surface`.
- **Kein `innerHTML` für Serverdaten.** `h()` erzeugt Text-Nodes; das
  `html:`-Attribut ist ausschließlich für fest verdrahtete Icons und die aus
  Zahlen gebauten SVG-Diagramme.
- Anklickbare Listenzeilen sind `<button class="list-btn">`, nicht
  `<div onclick>` — sonst sind sie nicht per Tastatur erreichbar.

## Nutzeranzeige

**Die JID ist die Identitaet, der Name ist nur Anzeige.** Jede Aktion (Kick,
Ban, Verwarnung aufheben) laeuft weiter ueber `user_jid` — nie ueber den Namen.

Alles laeuft ueber `src/identity.js`; keine eigenen `split('@')[0]`-Loesungen
mehr bauen. Wichtig beim Erweitern:

- `resolveIdentities(jids, { groupJid })` ist die **Batch**-Variante. Im Panel
  immer diese nutzen — 100 Nutzer kosten so vier Abfragen statt vierhundert.
  Sie liefert je Person `{jid, phone, name, sourceName, nameSource,
  displayName}`.
- Zwei Attrappen aus dem Bestand duerfen nie als Name durchgehen: `xp.name`
  faellt in `router.js` auf die Telefonnummer zurueck, `user_profiles.name` in
  `commands/profile.js` auf `'Unbekannt'`. `isRealName()` filtert beide.
- **Namensquellen und ihre Reihenfolge** (stark schlaegt schwach):
  `contacts.push_name` (selbst gesetzter WhatsApp-Name) → `contacts.contact_name`
  (Adressbuch) → `contacts.verified_name` → `members.push_name` (aus einer
  Gruppe) → `user_profiles` / `xp` / `birthdays` → nur die Nummer. Der selbst
  gesetzte Name gewinnt bewusst, damit ein alter gespeicherter Name ihn nicht
  verdeckt.
- Die Tabelle **`contacts`** ist die Personenebene (`members` ist pro *(Gruppe,
  Person)*). Gefuellt wird sie von `ingestContacts()` aus den Baileys-Events
  `contacts.upsert` / `contacts.update`, aus Gruppen-Metadaten
  (`permissions.js`, gedrosselt auf 10 Min je Gruppe) und bei Beitritten.
  Geschrieben wird in Bloecken mit `COALESCE` je Spalte — ein
  `Partial<Contact>`-Update loescht nie einen bekannten Namen. Ein reiner
  `@lid`-Eintrag erzeugt **keine** Zeile, sonst entstehen Geisterpersonen.
- **Gruppenmitgliedschaft** schreibt `learnLidMappings()` fuer *jeden*
  Teilnehmer mit aufloesbarer Nummer — frueher nur bei LID *und* Nummer, was
  in PN-adressierten Gruppen niemanden eintrug. Wer Gruppen-Metadaten
  verarbeitet, nimmt `getGroupMeta()` und nicht `sock.groupMetadata()`
  direkt: nur der Umweg lernt Namen, LIDs und Mitgliedschaften.
- Aufloesung funktioniert auch ueber die **LID**: ein Kontakt mit LID *und*
  Nummer ist eine Person, nicht zwei.
- `members.push_name` schreibt `touchMember()` im Nachrichtenpfad — gedrosselt
  auf 5 Minuten je Person und Gruppe, eine Namensaenderung schlaegt sofort
  durch.
- `members.last_seen` heisst "zuletzt in den Gruppen-Metadaten gesehen",
  `members.last_active` ist die echte Nachrichtenaktivitaet. Zwei Bedeutungen,
  zwei Spalten — nicht vermischen.

## Nutzersuche

`GET /api/users?q=&page=&limit=&sort=&dir=&filter=` liefert
`{users, pagination:{page,limit,total,pages}}`. Regeln beim Erweitern:

- Gefiltert und sortiert wird **serverseitig in SQL ueber alle Treffer**, nicht
  auf der sichtbaren Seite. Deshalb steckt die Anreicherung (Gruppenzahl, XP,
  Verwarnungen, Mutes) in einem CTE und nicht in einer Schleife.
- `sort`, `dir` und `filter` kommen aus fest verdrahteten Allowlists, `limit`
  ist auf 100 gedeckelt, `q` auf 120 Zeichen gekuerzt, `%` und `_` werden
  escaped. Ein eigener Rate-Limiter haengt vor der Route.
- `GET /api/users/:jid` validiert den Pfadparameter gegen ein festes Muster.
- Gesucht wird ueber Name, Push-Name, Adressbuchname, Nummer mit und ohne `+`
  und die JID — jeweils als Teilzeichenkette.
