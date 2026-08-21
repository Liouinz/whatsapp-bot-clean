# Control API v1

Steuer- und Leseschnittstelle des Bots. Vorgesehener Client ist die spätere
Android-App.

Die vollständige Beschreibung liegt maschinenlesbar in
[`openapi.json`](openapi.json) (OpenAPI 3.1). Sie ist durch
`test/api-openapi.test.mjs` an den Code gebunden: eine Route ohne Eintrag oder
ein Eintrag ohne Route lässt den Testlauf scheitern. Was hier steht, gilt.

**Basis:** `/api/v1` · **24 Endpunkte** · läuft im selben Prozess wie der Bot

---

## Grundzüge

**Die App spricht ausschließlich mit dieser API.** Kein direkter Zugriff auf
Datenbank, WhatsApp-Session, `.env` oder Serverdateien. Das ist kein Vorschlag,
sondern die Aufteilung, auf der die Sicherheitsannahmen beruhen.

**Anmeldung mit Bearer-Token, keine Cookies.** Damit gibt es für die API keine
CSRF-Fläche — einen `Authorization`-Header hängt ein Browser nicht von selbst an.
Das alte Web-Panel unter `/api/*` arbeitet weiterhin mit Cookies und ist davon
unberührt.

**Alle Fehler haben dieselbe Form.** Die App braucht genau einen Auswertungspfad.

**Alle Listen sind geblättert und gedeckelt.** Es gibt keinen Endpunkt, der
unbegrenzt viele Datensätze zurückgibt.

---

## Anmelden

```http
POST /api/v1/auth/login
Content-Type: application/json

{ "username": "owner", "password": "…", "deviceLabel": "Pixel 8", "appVersion": "1.0.0" }
```

```json
{
  "accessToken": "…", "refreshToken": "…", "tokenType": "Bearer",
  "expiresIn": 900, "refreshExpiresIn": 2592000,
  "sessionId": "ses_…",
  "user": { "id": "usr_…", "username": "owner", "role": "owner", "permissions": ["…"] }
}
```

Danach an jede Anfrage:

```http
Authorization: Bearer <accessToken>
```

### Der allererste Zugang

Solange **kein einziger** Zugang existiert, gilt einmalig `ACCESS_SECRET` als
Passwort für den Benutzernamen `owner` — damit legt der erste Login diesen
Zugang an. Sobald ein Zugang existiert, ist dieser Weg zu; `ACCESS_SECRET`
öffnet danach nur noch das Web-Panel.

Weitere Zugänge legt der Owner über `POST /auth/users` an.

---

## Tokens erneuern

Access-Tokens leben **15 Minuten**, Refresh-Tokens **30 Tage**.

```http
POST /api/v1/auth/refresh
{ "refreshToken": "…" }
```

Ein Refresh rotiert **beide** Tokens. Der eingereichte Refresh-Token ist danach
entwertet.

> **Wichtig für die App-Implementierung:** Wird ein bereits entwerteter
> Refresh-Token noch einmal vorgelegt, gilt das als Diebstahl-Anzeichen und die
> **gesamte Geräte-Sitzung wird widerrufen** — auch das frisch ausgegebene Paar.
>
> Praktische Folge: Token-Erneuerung muss **serialisiert** sein. Feuern zwei
> parallele Anfragen gleichzeitig einen Refresh mit demselben Token, meldet die
> App sich selbst ab. Ein Mutex um den Refresh-Pfad, und wartende Anfragen
> bekommen das Ergebnis des laufenden.

### Wann erneuern, wann neu anmelden

Beides ist HTTP 401 — der Unterschied steht im `code`:

| `code` | Bedeutung | Was die App tun soll |
|---|---|---|
| `TOKEN_EXPIRED` | Access-Token abgelaufen | still erneuern, Anfrage wiederholen |
| `TOKEN_INVALID` | ungültig, widerrufen oder wiederverwendet | Tokens verwerfen, neu anmelden |
| `UNAUTHENTICATED` | kein oder kaputter Header | neu anmelden |

---

## Rollen und Rechte

| Rolle | Rechte |
|---|---|
| `viewer` | `bot.read` `users.read` `groups.read` `logs.read` `settings.read` `system.read` |
| `admin` | wie viewer, zusätzlich `bot.control` |
| `owner` | wie admin, zusätzlich `apiusers.manage` |

Es gibt bewusst **keine** Rolle `moderator`: sie hätte in v1 keine eigenen
Rechte, und eine Rolle ohne Wirkung ist Dekoration. Sobald die API schreibende
Moderationspfade bekommt, ist das die Stelle, an der sie dazukommt.

Das je Endpunkt nötige Recht steht in `openapi.json` als
`x-required-permission`. Bei fehlendem Recht kommt **403** mit dem Namen des
Rechts in der Meldung.

`GET /auth/me` liefert die eigenen Rechte — die App sollte ihre Oberfläche
danach ausrichten, statt Rollennamen fest zu verdrahten.

---

## Fehlerformat

```json
{
  "error": {
    "code": "BOT_NOT_READY",
    "message": "Der Bot ist derzeit nicht bereit.",
    "requestId": "req_Kx3f9aQ2"
  }
}
```

Auf `code` schalten, nicht auf `message` — der Text darf sich ändern.

Die `requestId` steht zusätzlich im Header `X-Request-Id`. Sie taucht in den
Server-Logs auf: eine gemeldete ID lässt sich dort wiederfinden, ohne dass die
Fehlerantwort selbst etwas Internes verraten müsste. Es lohnt sich, sie in der
App bei Fehlern anzuzeigen.

Bei `VALIDATION_FAILED` kommt zusätzlich `details` mit Feld und Problem.

---

## Rate-Limits

Getrennte Kontingente je Bereich — sie teilen sich nichts.

| Bereich | Grenze | gezählt nach |
|---|---|---|
| Anmeldung, Token-Erneuerung | 10 / 15 Min | IP-Präfix |
| Lesen | 120 / Min | Zugang |
| Suche, Mitgliederlisten | 30 / Min | Zugang |
| Bot-Steuerung | 5 / 10 Min | Zugang |
| Zugangsverwaltung | 20 / 10 Min | Zugang |

Bei Überschreitung: **429** mit `RATE_LIMITED`, dazu die
`RateLimit-*`-Standardheader. IPv6 wird auf das /56-Präfix normalisiert —
sonst wäre ein Limit nach IP für jeden mit eigenem Präfix wirkungslos.

---

## Health

`GET /health` ist **öffentlich** — damit Render und andere Überwachung sie ohne
Zugang abfragen können. Deshalb enthält sie ausschließlich Zustände, keine
Kennzahlen.

- **200** — bereit (Datenbank erreichbar *und* WhatsApp verbunden)
- **503** — nicht bereit

Die KI zählt bewusst nicht in die Bereitschaft: sie ist optional, und ein
fehlender Schlüssel darf den Dienst nicht rot färben.

Kennzahlen (Latenzen, KI-Kontingent) liefert `GET /health/details` mit
Anmeldung, Ressourcen `GET /system`.

> `cpuPercent` ist `null`, wenn seit der letzten Abfrage zu wenig Zeit für eine
> belastbare Messung vergangen ist. Das ist Absicht — eine ausgedachte Zahl wäre
> schlechter als keine.

---

## Blätterung

Alle Listen antworten gleich:

```json
{ "users": [ … ], "pagination": { "page": 1, "limit": 25, "total": 214, "pages": 9 } }
```

`limit` ist gedeckelt (100, bei Logs 200). Ein größerer Wunsch wird
**heruntergesetzt, nicht abgelehnt** — eine App, die 1000 anfragt, bekommt 100
und muss nicht scheitern. Eine zu hohe `page` wird auf die letzte geklemmt.

---

## Bot-Steuerung

`POST /bot/restart` antwortet **202** und fährt danach über den gemeinsamen
Shutdown-Pfad herunter — inklusive Sicherung der WhatsApp-Signal-Keys.

Parallele Anfragen ergeben **409**: es läuft immer nur ein Neustart, danach
greift eine Sperre von 60 Sekunden. Drei gleichzeitige Aufrufe lösen genau
einen Neustart aus; das ist getestet.

Neustart und `POST /bot/relink` landen im Audit-Log — mit Zugang, Aktion und
`requestId`, ohne Tokens.

---

## Was die API nicht herausgibt

Nie Teil einer Antwort: Passwörter und ihre Hashes, Access- oder
Refresh-Tokens (auch nicht in der Geräteliste), `DATABASE_URL`/`DATABASE_KEY`,
`ACCESS_SECRET`, `GEMINI_API_KEY`, WhatsApp-Session-Daten, Stacktraces,
Dateipfade des Servers.

`GET /settings` ist deshalb **Feld für Feld zusammengestellt** und gibt nicht
das Konfigurationsobjekt zurück — dort stehen alle Zugangsdaten des Bots. Von
der KI verrät sie nur, **ob** eine eingerichtet ist.

---

## Hinweise für den Android-Client

- **Kein Polling im Sekundentakt.** `GET /bot/status` ist günstig, aber das
  Leselimit liegt bei 120/Min. Alle 5–10 Sekunden im Vordergrund reicht.
- **Refresh serialisieren** — siehe Warnung oben, sonst meldet sich die App
  selbst ab.
- **Auf `code` schalten, nicht auf HTTP-Status allein.** 401 heißt je nach
  `code` „erneuern" oder „neu anmelden".
- **`deviceLabel` beim Login mitschicken.** Sonst steht das Gerät in der
  Geräteliste ohne Namen und lässt sich nicht auseinanderhalten.
- **Tokens sicher ablegen** (EncryptedSharedPreferences oder Keystore), niemals
  in Logs.
- **Antworten sind stabil, aber nicht abgeschlossen.** Zusätzliche Felder können
  in v1 dazukommen; unbekannte Felder sollten ignoriert werden, nicht zum Fehler
  führen. Feldern werden in v1 nicht entfernt oder umbenannt — dafür gäbe es
  `/api/v2`.
- **`X-Request-Id` bei Fehlern festhalten** und im Fehlerdialog anzeigen. Damit
  ist ein Problem im Server-Log auffindbar.

---

## Was v1 bewusst nicht kann

Schreibende Moderation (Kick, Ban, Mute), Ändern von Gruppen-Einstellungen,
Backups, Updates. Der Zuschnitt von v1 ist **lesen plus Bot-Steuerung** — jeder
Schreibpfad braucht eigene Validierung, Rechte, Audit und Tests, und die kommen
erst, wenn sie tatsächlich gebraucht werden.

Neue Endpunkte gehören nach `src/api/routes/`, siehe
[`CONTRIBUTING.md`](../../CONTRIBUTING.md).
