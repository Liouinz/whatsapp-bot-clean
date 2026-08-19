# Architektur-Dokumentation: WhatsApp Community Bot

## 1. Projektstruktur & Verantwortlichkeiten

Der Bot folgt einer strikt modularisierten Schichtenarchitektur (Single Responsibility Principle):

- **`index.js`**: Minimaler Einstiegspunkt (Bootstrapping), initialisiert Config, Logger, lädt Commands, startet den WhatsApp-Socket und den Verbindungs-Watchdog.
- **`config.js`**: Zentrale Konfiguration. Liest und validiert alle Umgebungsvariablen (`process.env`). Keine direkten Env-Zugriffe außerhalb dieses Moduls.
- **`loader.js`**: Rekursiver Command-Loader. Durchsucht das `commands/`-Verzeichnis, unterstützt sowohl legacy Modul-Sammlungen als auch moderne Einzel-Command-Strukturen (`export default`) mit automatischer Duplikatsprüfung.
- **`logger.js`**: Strukturiertes Multi-Level-Logging (Info, Success, Warn, Error, Debug) mit integriertem Ring-Puffer zur Begrenzung des Arbeitsspeichers.
- **`src/core/database/`**:
  - `client.js`: Verbindung und Ausführung von SQL-Statements über `@libsql/client`.
  - `guard.js`: Kritischer Session-Schutz (blockiert absolut jeden Schreibzugriff auf `auth_creds` und `auth_keys`).
  - `schema.js`: Tabellendefinitionen und Initialisierungs-Routine (`initDb`).
  - `wipe.js`: Sicheres Zurücksetzen der Datenbank unter strikter Beachtung des Session-Schutzes.
- **Service-Schicht** (flache `src/*.js`): Moderation, Scheduler, AI und Events. Ein `src/services/`-Verzeichnis existiert nicht.
- **`src/commands/`**: Befehlsmodule (Admin, Community, Tools, Utility).

---

## 2. Datenfluss einer Nachricht

1. **Eingang**: WhatsApp empfängt eine Nachricht über das Baileys-WebSocket.
2. **Event-Handling**: Das Event leitet die Nachricht an den Router (`src/router.js`) weiter.
3. **Pipeline & Permissions**: Der Router prüft den Sender, normalisiert LIDs/Nummern (`src/permissions.js`), validiert Rollen (Bot-Owner, Admin, User) und prüft globale Toggles (`src/global.js`).
4. **Command-Execution**: Der Loader matcht den Befehl oder Alias und führt `execute()` aus.
5. **Antwort**: Antworten werden über die serielle Sende-Queue (`src/queue.js`) mit Jitter an WhatsApp übergeben, um Rate-Limits zu vermeiden.
6. **Logging & Statistik**: Erfolge und Fehler werden geloggt; XP und Statistiken werden erfasst.

---

## 3. Session-System & Sicherheit (`auth_creds` / `auth_keys`)

Die Baileys-Authentifizierungsdaten werden vollständig in der Turso-/SQLite-Datenbank persistiert. 
- **Sicherheitsregel**: Die Tabellen `auth_creds` und `auth_keys` sind **heilig**. 
- Der Session-Guard (`src/core/database/guard.js`) parst jedes SQL-Statement vor der Ausführung in `dbRun`. Versucht ein Modul, ein `INSERT`, `UPDATE`, `DELETE`, `DROP` oder `ALTER` auf diese Tabellen auszuführen, wird der Zugriff sofort mit einem Fehler abgefangen (`assertNotAuthWrite`).
- Cleanup-Routinen und Wipe-Befehle filtern diese Tabellen strikt heraus.

---

## 4. Erweiterung um neue Commands

Jeder neue Befehl wird als isolierte Datei im entsprechenden Unterordner unter `src/commands/` angelegt. 

**Standard-Export-Struktur:**
```javascript
export default {
  name: 'beispiel',
  aliases: ['b'],
  description: 'Beschreibung des Befehls',
  category: 'utility',
  async run(ctx) {
    await ctx.reply('Hallo Welt!');
  }
};
```
Der Loader erkennt die Datei beim nächsten Start automatisch, ohne dass manuelle Imports oder Registrierungslisten erforderlich sind.
