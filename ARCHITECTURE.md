# Architektur-Dokumentation: WhatsApp Community Bot

## 1. Projektstruktur & Verantwortlichkeiten

Der Bot folgt einer strikt modularisierten Schichtenarchitektur (Single Responsibility Principle):

- **`index.js`**: Minimaler Einstiegspunkt (Bootstrapping), initialisiert Config, Logger, lädt Commands, startet den WhatsApp-Socket und den Verbindungs-Watchdog.
- **`config.js`**: Zentrale Konfiguration. Liest und validiert die Umgebungsvariablen (`process.env`).
  *Ausnahmen, die es tatsächlich gibt:* `preflight.js` liest die Rohwerte, weil es sie prüft, **bevor** eine sinnvolle Konfiguration existiert; `ai.js` und `dashboard.js` lesen `GEMINI_API_KEY` bzw. `ACCESS_SECRET` bei jedem Zugriff erneut, damit eine Änderung ohne Neustart greift. Alles andere geht über `config`.
- **`loader.js`**: Rekursiver Command-Loader. Durchsucht `src/commands/` und akzeptiert **drei** Exportformen: `export default {…}`, `export const xCommand = {…}` und `export const xCommands = [ … ]`. Kollidierende Namen oder Aliase werden beim Laden **gemeldet** — der zuletzt geladene gewinnt, der Loader bricht nicht ab.
- **`logger.js`**: Multi-Level-Logging (Info, Success, Warn, Error, Debug) mit Ring-Puffer fester Größe, aus dem die Log-Ansicht des Panels gespeist wird.
- **`src/core/database/`**:
  - `client.js`: Verbindung und Ausführung von SQL-Statements über `@libsql/client` (`dbRun`, `dbRows`, `dbRowsStrict`, `dbBatch`).
  - `guard.js`: Kritischer Session-Schutz (blockiert jeden Schreibzugriff auf `auth_creds` und `auth_keys`).
  - `schema.js`: Tabellendefinitionen und Initialisierungs-Routine (`initDb`), inklusive `LEGACY_TABLES` für die Tabellen entfernter Features.
  - `wipe.js`: Sicheres Zurücksetzen der Datenbank unter strikter Beachtung des Session-Schutzes.
- **`src/core/cache/ttlCache.js`**: LRU-Cache mit Ablaufzeit und Größenobergrenze. Wird u. a. von `router.js`, `queue.js`, `moderation.js` und `identity.js` benutzt.
- **Service-Schicht** (flache `src/*.js`): Moderation, Scheduler, AI, Events, Identity, Global. Ein `src/services/`-Verzeichnis existiert nicht.
- **`src/commands/`**: Befehlsmodule (Admin, Community, Tools, Utility).

---

## 2. Datenfluss einer Nachricht

1. **Eingang**: WhatsApp empfängt eine Nachricht über das Baileys-WebSocket.
2. **Event-Handling**: Das Event leitet die Nachricht an den Router (`src/router.js`) weiter.
3. **Pipeline & Permissions**: Der Router prüft den Sender, normalisiert LIDs/Nummern (`src/permissions.js`), validiert Rollen (Bot-Owner, Admin, User) und prüft globale Toggles (`src/global.js`).
4. **Command-Execution**: Der **Router** matcht Name oder Alias gegen die Registry, setzt die deklarativen Rechte durch (`adminOnly`, `ownerOnly`, `botOwnerOnly`, `groupOnly`) und ruft **`run(ctx)`** auf. Der Loader ist ausschließlich für das Einsammeln beim Start zuständig; eine Methode `execute()` gibt es nicht.
5. **Antwort**: Antworten werden über die serielle Sende-Queue (`src/queue.js`) mit Jitter an WhatsApp übergeben, um Rate-Limits zu vermeiden.
6. **Logging & Statistik**: Erfolge und Fehler werden geloggt; XP und Statistiken werden erfasst.

---

## 3. Session-System & Sicherheit (`auth_creds` / `auth_keys`)

Die Baileys-Authentifizierungsdaten werden vollständig in der Turso-/SQLite-Datenbank persistiert. 
- **Sicherheitsregel**: Die Tabellen `auth_creds` und `auth_keys` sind **heilig**. 
- Der Session-Guard (`src/core/database/guard.js`) parst jedes SQL-Statement vor der Ausführung in `dbRun` **und `dbBatch`**. Versucht ein Modul ein `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `CREATE` oder `REPLACE` auf diese Tabellen, wird der Zugriff mit einem Fehler abgefangen (`assertNotAuthWrite`). Vorangestellte SQL-Kommentare werden vorher entfernt, damit sich das Schreibverb nicht verstecken lässt.
- Cleanup-Routinen und Wipe-Befehle filtern diese Tabellen zusätzlich heraus.
- **Der Guard greift nur auf dem Weg über `dbRun`/`dbBatch`.** `getDb().execute()` oder `getDb().batch()` direkt aufzurufen umgeht ihn. Die einzigen legitimen Ausnahmen sind `auth.js` und `schema.js` — sie schreiben die Auth-Tabellen absichtlich.

---

## 4. Erweiterung um neue Commands

Jeder neue Befehl wird als **eigene Datei** unter `src/commands/` angelegt. Ein
Unterordner ist möglich, aber nicht nötig — der Loader sucht rekursiv, und der
Ordnername entscheidet **nicht** über die Zuordnung: `group` (ersatzweise
`category`) schlägt ihn. Die bestehenden Sammeldateien sind Altbestand, kein
Vorbild.

**Standard-Export-Struktur:**
```javascript
export default {
  name: 'beispiel',
  aliases: ['b'],
  group: 'utility',          // community | tools | utility | admin
  desc: 'Beschreibung des Befehls',
  usage: '!beispiel',
  adminOnly: false,          // deklarativ, durchgesetzt in router.js
  async run(ctx) {
    await ctx.reply('Hallo Welt!');
  }
};
```

Der Loader erkennt die Datei beim nächsten Start automatisch, ohne manuelle
Imports oder Registrierungslisten.

Zwei Fallstricke:

- **`run` ist Pflicht.** Ohne `run` wird nichts registriert. Das ist Absicht:
  Hilfsmodule exportieren Funktionen, und Funktionen haben ebenfalls ein
  `.name` — ohne die Prüfung würden sie als Befehl landen.
- **Nur die vier Gruppen oben erscheinen im `!hilfe`-Menü.** Eine andere Gruppe
  macht den Befehl aufrufbar, aber unsichtbar.
