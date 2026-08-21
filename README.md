# 🤖 WhatsApp-Community-Bot

Moderations- und Community-Bot für WhatsApp-Gruppen, auf Basis von
[`@whiskeysockets/baileys`](https://github.com/WhiskeySockets/Baileys).
Gebaut für **Render Free-Tier + Turso**: kein Build-Schritt, keine Datei-Ablage,
die Sitzung liegt in der Datenbank statt auf der Platte.

Mitgeliefert ist ein Web-Panel, über das der Bot verknüpft, überwacht und
konfiguriert wird — Gruppen-Einstellungen, Moderation, Statistik, Logs.

**Stand:** 75 Befehle · 152 Tests · Node ≥ 20 · ESM

---

## Inhalt

- [Was der Bot kann](#was-der-bot-kann)
- [Schnellstart (lokal)](#schnellstart-lokal)
- [Konfiguration](#konfiguration)
- [Deployment auf Render](#deployment-auf-render)
- [Befehle](#befehle)
- [Architektur](#architektur)
- [Tests](#tests)
- [Sicherheit](#sicherheit)
- [Troubleshooting](#troubleshooting)
- [Mitarbeiten](#mitarbeiten)
- [Lizenz](#lizenz)

---

## Was der Bot kann

**Moderation.** Anti-Link, Anti-Spam, Wortfilter (leetspeak-tolerant),
Slowmode, Anti-Raid mit automatischer Gruppensperre. Verwarnungen eskalieren
selbsttätig: Warnung → Stummschaltung → Rauswurf. Verwarnungen verfallen nach
sieben Tagen.

**Community.** XP und Level pro Gruppe mit Ranglisten, Profile, Geburtstage mit
automatischer Gratulation, AFK-Status, Umfragen, Nachtmodus (Gruppe schließt
und öffnet zu festen Uhrzeiten), Wochenreport, Saison-Events.

**Eigene Befehle.** Frei anlegbare Befehle und FAQ-Einträge, direkt im Chat oder
über das Panel.

**Web-Panel.** Live-Status über Server-Sent Events, QR-/Pairing-Ansicht,
Gruppenverwaltung, Nutzersuche über alle bekannten Personen, Moderationsübersicht,
Planung, Log-Ansicht, Statistik-Diagramme, Config-Export und -Import. Zwei
Themes, drei Akzentfarben, mobile-first, ohne Build-Schritt.

**KI nur als Auffangnetz.** Gemini wird ausschließlich bei einem unbekannten
`!befehl` ohne Treffer und für eine kurze Fehler-Zusammenfassung im Log
angefragt — nie auf normale Nachrichten. Davor greifen ein Tippfehler-Vorschlag,
ein Cooldown pro Person und ein hartes Tageskontingent. Ohne
`GEMINI_API_KEY` läuft der Bot vollständig, nur ohne diese Antworten.

**Sitzung in Turso.** `useMultiFileAuthState` wird bewusst nicht benutzt.
Neustarts und Deploys brauchen deshalb keinen neuen QR-Code. Die beiden
Sitzungstabellen sind gegen versehentliches Überschreiben abgesichert (siehe
[Sicherheit](#sicherheit)).

**LID-fähig.** WhatsApp adressiert Teilnehmer seit 2025/2026 teils über eine
interne LID statt über die Telefonnummer. Rechteprüfung, Identität und
Namensauflösung behandeln beide Formen als dieselbe Person. Diagnose im Chat:
`!debugadmin`.

---

## Schnellstart (lokal)

Voraussetzungen: **Node ≥ 20**, eine **Turso**-Datenbank
([turso.tech](https://turso.tech), Free-Tier genügt), ein WhatsApp-Konto.

```bash
git clone https://github.com/Liouinz/whatsapp-bot-clean.git
cd whatsapp-bot-clean
npm ci

cp .env.example .env
# .env ausfüllen — mindestens DATABASE_URL, DATABASE_KEY,
# ACCESS_SECRET, OWNER_NUMBERS und SELF_URL

npm start
```

Der Start bricht mit einer Klartext-Meldung ab, wenn etwas fehlt oder unbrauchbar
ist — fehlende Variablen, zu kurzes Panel-Passwort, `SELF_URL` ohne Protokoll,
unerreichbare Datenbank.

Danach `http://localhost:3000` öffnen, mit `ACCESS_SECRET` anmelden, Tab **QR**,
und den Code in WhatsApp unter *Einstellungen → Verknüpfte Geräte* scannen.

> **Lokal:** Das Sitzungs-Cookie ist `Secure`. Über `http://localhost` verwirft
> der Browser es, der Login schlägt dann ohne sichtbaren Fehler fehl. Für lokale
> Panel-Tests einen HTTPS-Tunnel benutzen (z. B. `cloudflared`), oder den Bot
> ohne Panel-Login über die Konsole verknüpfen.

---

## Konfiguration

Alle Werte kommen aus Umgebungsvariablen; `.env.example` ist die vollständige
Vorlage. Ausgewertet werden sie an genau einer Stelle: `src/config.js`.

### Pflicht

| Variable | Zweck |
|---|---|
| `DATABASE_URL` | Turso-URL, beginnt mit `libsql://`. Falsche URL → Preflight meldet den 404 in Klartext. |
| `DATABASE_KEY` | Turso Auth-Token, Read & Write, Expiry am besten „Never". |
| `ACCESS_SECRET` | Passwort für das Panel. **Mindestens 16 Zeichen** — dahinter liegen Kick, Ban, Rundnachrichten und „Alle Daten löschen". Vorschlag: `openssl rand -base64 24`. |
| `OWNER_NUMBERS` | Owner-Nummern, international, nur Ziffern, komma-getrennt (`491701234567`). Owner bedienen den Bot per DM und schalten Gruppen frei. |
| `SELF_URL` | Öffentliche Adresse **inklusive Protokoll**, z. B. `https://mein-bot.onrender.com`. Der Bot pingt davon selbst `/health` an. |

### Optional

| Variable | Standard | Zweck |
|---|---|---|
| `BOT_NAME` | `CommunityBot` | Anzeigename in Antworten und im Panel. |
| `BOT_OWNER_NUMBERS` | *(leer)* | Darf zusätzlich die bot-weiten Befehle (`!wartung`, `!neustart`, `!global`). Leer → die `OWNER_NUMBERS` übernehmen das. |
| `GEMINI_API_KEY` | *(leer)* | Google AI Studio Key. Leer → der Bot läuft ohne KI-Antworten. |
| `GEMINI_MODEL_PRIMARY` | `gemini-2.0-flash-exp` | Nur für komplexe Anfragen. |
| `GEMINI_MODEL_FALLBACK` | `gemini-1.5-flash` | Standard und Rückfall bei Ausfall des Primärmodells. |
| `TZ` | `Europe/Berlin` | Bestimmt Tagesgrenzen für Statistik und KI-Kontingent sowie die Uhrzeiten von Nachtmodus, Geburtstagen und Wochenreport. |
| `DEBUG` | *(leer)* | Auf `1` setzen für zusätzliche Debug-Ausgaben. |

`PORT` **nicht** setzen — auf Render kommt der Wert von der Plattform, lokal
fällt der Bot auf `3000` zurück. Ein nicht-numerischer Wert bricht den Start ab
(Node würde sonst einen Unix-Socket statt eines TCP-Ports anlegen).

---

## Deployment auf Render

1. Neuen **Web Service** anlegen, Repository verbinden.
2. Build Command `npm ci`, Start Command `npm start`.
3. Umgebungsvariablen unter **Environment** setzen — ohne Anführungszeichen,
   ohne Leerzeichen am Rand.
4. Health-Check-Pfad auf `/health` setzen.
5. Deployen. Der Preflight prüft Konfiguration und Datenbankverbindung und
   meldet Fehler im Klartext.
6. Panel über `SELF_URL` öffnen, anmelden, Tab **QR**, scannen. Dass etwa alle
   60 Sekunden ein neuer Code erscheint, ist normal, solange nicht gescannt wurde.

**Free-Tier.** Der Bot pingt sich alle 30 Sekunden selbst über `/health` an,
damit der Dienst nicht einschläft. Ein externer Monitor (z. B. UptimeRobot auf
`SELF_URL/health`) ist als zweite Absicherung sinnvoll, aber nicht zwingend.

> Render gewährt pro Workspace **750 Instanzstunden im Monat**. Ein dauerhaft
> wachgehaltener Dienst verbraucht davon rund 744 — das reicht für genau
> **einen** Free-Web-Service. Ein zweiter sprengt das Kontingent, und Render
> setzt dann alle Free-Dienste bis zum Monatsanfang aus.

---

## Befehle

`!hilfe` zeigt die Übersicht im Chat, `!hilfe <befehl>` die Einzelheiten.
Admin-Befehle erscheinen nur für Admins.

<details>
<summary><b>Community</b> (24)</summary>

`!afk` · `!afkliste` · `!aktivste` · `!cmds` · `!event` · `!fakt` ·
`!geburtstag` · `!geburtstage` · `!hilfe` · `!info` · `!kompliment` ·
`!motivation` · `!ping` · `!profil` · `!profil-setzen` · `!rank` · `!regeln` ·
`!rolle` · `!stats` · `!stimme` · `!umfrage` · `!umfrageende` ·
`!umfragestand` · `!zitat`
</details>

<details>
<summary><b>Tools</b> (13)</summary>

`!countdown` · `!countdowns` · `!delschedule` · `!password` · `!qr` ·
`!rechne` · `!schedule` · `!schedules` · `!status` · `!test` · `!timer` ·
`!umrechnen` · `!zufall`

`!rechne` benutzt einen eigenen Parser, der nur Zahlen und Operatoren zulässt —
niemals `eval`.
</details>

<details>
<summary><b>Ranglisten</b> (1)</summary>

`!rangliste` (Aliase: `!top`, `!leaderboard`, `!beste`)
</details>

<details>
<summary><b>Admin & Moderation</b> (37)</summary>

`!addcmd` · `!addfaq` · `!addword` · `!alle` · `!antilink` · `!antiraid` ·
`!antispam` · `!ban` · `!botstatus` · `!clearwarns` · `!close` ·
`!debugadmin` · `!delcmd` · `!delfaq` · `!delword` · `!global` · `!gruppe` ·
`!gruppen` · `!kick` · `!levelup` · `!mute` · `!nachtmodus` · `!neustart` ·
`!open` · `!setregeln` · `!setup` · `!setwelcome` · `!slowmode` · `!unban` ·
`!unmute` · `!warn` · `!warnliste` · `!warns` · `!wartung` · `!welcome` ·
`!wochenreport` · `!words`
</details>

Insgesamt **75 Befehle** unter **126 Schlüsseln** (Namen plus Aliase).

In einer neuen Gruppe bleibt der Bot zunächst **still**. Erst ein Owner schaltet
ihn mit `!setup` frei — so arbeitet er nie ungefragt in fremden Gruppen mit.

---

## Architektur

```
src/
  index.js          Bootstrap, Baileys-Lifecycle, Reconnect, Watchdog, Self-Ping
  preflight.js      Env- und DB-Prüfung vor dem Start, Klartext-Fehler
  config.js         einzige Stelle, die Umgebungsvariablen liest
  state.js          gemeinsamer Laufzeit-Zustand
  auth.js           Baileys-Auth-State in Turso (statt useMultiFileAuthState)
  router.js         Dispatch: fester Befehl → Custom/FAQ → KI. Rechte, Rate-Limit, XP, AFK
  loader.js         rekursive Command-Autodiscovery (einzige Registrierungsquelle)
  permissions.js    LID-fähige Rollen (USER < GROUP_ADMIN < COMMUNITY_OWNER < BOT_OWNER)
  identity.js       JID → „+49 170 1234567 (Max Mustermann)", Batch-Auflösung
  moderation.js     Auto-Mod, Warn-Eskalation, Mutes, Bans, Anti-Raid
  scheduler.js      Tick-Loop für alle zeitgesteuerten Aufgaben
  queue.js          serielle Sende-Queue mit Jitter (800–2500 ms)
  ai.js             Gemini-Auffangnetz mit Cooldown, Tageslimit, Circuit-Breaker
  events.js         Saison-Events (XP-Multiplikator)
  global.js         bot-weite Schalter (XP-System, Wartungsmodus)
  logger.js         Ring-Puffer für die Log-Ansicht des Panels
  dashboard.js      Express-Panel: Auth, JSON-API, SSE
  dashboard-ui.js   Panel-UI als String-Templates (CSS, HTML, Client-JS)
  core/database/    client (dbRun/dbRows/dbBatch) · schema · guard · wipe
  core/cache/       TTLCache
  commands/         16 Dateien, 75 Befehle
  data/             statische Daten (Saison-Events)
test/               12 Dateien, `npm test` = `node --test`
```

**Nachrichtenweg.** `messages.upsert` → `router.js` prüft Duplikat, Absender,
Gruppenfreigabe, Slowmode und Auto-Moderation → dann fester Befehl, sonst
Custom/FAQ, sonst Tippfehler-Vorschlag, sonst KI.

**Zeitgesteuertes.** Ein Tick alle 30 Sekunden erledigt nacheinander: fällige
geplante Nachrichten, Nachtmodus, Ablauf von Anti-Raid-Sperren, Geburtstage,
Auto-Schluss von Umfragen, Wochenreport, automatisches Wochenend-Event.
Überlappende Ticks sind ausgeschlossen.

**Command-Vertrag.** Ein Command ist ein Objekt mit `name` und `run(ctx)`.
`loader.js` findet es selbst — es gibt keine zentrale Registrierungsliste.
Rechte werden **deklarativ** gesetzt (`adminOnly`, `ownerOnly`, `botOwnerOnly`,
`groupOnly`) und zentral in `router.js` durchgesetzt.

Ausführlicher: [`ARCHITECTURE.md`](ARCHITECTURE.md) ·
Entwicklungsregeln: [`CLAUDE.md`](CLAUDE.md) ·
Panel-Gestaltung: [`DESIGN.md`](DESIGN.md)

---

## Tests

```bash
rm -f .test-*.db*   # wichtig: nur ein kalter Lauf ist aussagekräftig
npm test            # node --test
```

Stand: **152 Tests, 0 Fehler.** Kein ESLint, kein Prettier, keine CI.

Die Tests laufen gegen echte lokale SQLite-Dateien, nicht gegen Mocks; die
Panel-Tests starten ein echtes `createDashboard()` auf einem freien Port und
sprechen über HTTP mit ihm. Warme Test-Datenbanken haben hier schon einmal einen
echten Fehler verdeckt — deshalb vorher löschen.

---

## Sicherheit

**Panel.** Login timing-safe (SHA-256 + `timingSafeEqual`), Aussperre nach fünf
Fehlversuchen für 15 Minuten, Rate-Limit 20 Anfragen/Minute, `helmet` mit
strenger CSP, Sitzungs-Cookie `HttpOnly` + `Secure` + `SameSite=Strict`. IPv6
wird für beide Bruteforce-Schutzmechanismen auf das /56-Präfix normalisiert,
damit ein Präfix nicht beliebig viele Versuche bedeutet. `Cache-Control:
no-store` auf allen Antworten außer `/health` und den versionierten Assets.

Öffentlich erreichbar sind nur `/health`, `/robots.txt`,
`/manifest.webmanifest`, `/icon.svg`, die Login-Seite und die statischen
Assets. Alles andere, insbesondere die komplette `/api`, liegt hinter der
Anmeldung.

**Sitzungsdaten.** `auth_creds` und `auth_keys` sind unantastbar: jedes
Schreibstatement wird vor der Ausführung geprüft und Zugriffe auf diese beiden
Tabellen werden blockiert. Das „Alle Daten löschen" des Panels lässt die
WhatsApp-Verknüpfung deshalb bestehen.

**Datenbank.** Ausschließlich gebundene Parameter. Tabellen- und Spaltennamen
stammen nur aus fest verdrahteten Listen, nie aus Eingaben.

**Keine Secrets im Repository.** Alles über Umgebungsvariablen; `.env` ist
ignoriert.

Sicherheitslücken bitte nicht als öffentliches Issue melden — siehe
[`SECURITY.md`](SECURITY.md).

---

## Troubleshooting

| Symptom | Ursache und Abhilfe |
|---|---|
| `START ABGEBROCHEN: ACCESS_SECRET ist zu kurz` | Panel-Passwort unter 16 Zeichen. Neues erzeugen: `openssl rand -base64 24`. |
| `START ABGEBROCHEN: SELF_URL ist keine gültige http(s)-Adresse` | Protokoll fehlt. `https://` davor. |
| `START ABGEBROCHEN: DATABASE_URL … 404` | URL zeigt auf eine gelöschte oder falsche Turso-DB. Neue URL aus dem Turso-Dashboard. |
| `START ABGEBROCHEN: DATABASE_KEY … 401/403` | Token falsch oder abgelaufen. Neuen erstellen (Read & Write, Never). |
| Alle ~60 s ein neuer QR-Code | Noch nicht gescannt — kein Fehler. |
| Bot stoppt mit „Auth-Fehler 401/403/440" | WhatsApp hat die Verknüpfung beendet. Im Panel **Sitzung zurücksetzen**, dann neu scannen. |
| Bot stoppt mit „Reconnect-Limit erreicht" | Zehn Versuche erfolglos. Logs prüfen, Dienst neu starten. |
| Admin-Befehle bleiben wirkungslos | `!debugadmin` ausführen — zeigt PN/LID-Erkennung und ob der Bot selbst Admin ist. |
| Bot antwortet in einer Gruppe gar nicht | Noch nicht freigeschaltet. Ein Owner führt dort `!setup` aus. |
| Panel-Login schlägt lokal ohne Fehler fehl | Das Cookie ist `Secure` und wird über `http://` verworfen. HTTPS benutzen. |
| `No matching sessions` / `failed to decrypt` im Log | Baileys-Rauschen nach längerer Offline-Zeit. Verschwindet, sobald die Sitzung wieder synchron ist. |

**Reconnect-Verhalten.** Code 515 (Neustart nach dem Pairing) verbindet nach
500 ms neu und zählt mit. Die Codes 401, 403 und 440 gelten als endgültiger
Auth-Fehler: der Bot stoppt und verlangt eine neue Verknüpfung. Bei `loggedOut`
wird die Sitzung verworfen, damit ein frischer QR-Code entstehen kann. Sonst
Backoff mit Jitter von 1 s bis 30 s, höchstens zehn Versuche.

---

## Mitarbeiten

Siehe [`CONTRIBUTING.md`](CONTRIBUTING.md). Kurzfassung: neue Befehle als
Einzeldatei unter `src/commands/`, Rechte deklarativ, `npm test` auf kalter
Datenbank grün, und für jeden behobenen Fehler ein Test, der vorher fehlschlägt.

## Lizenz

Für dieses Repository ist derzeit **keine Lizenz** hinterlegt. Ohne Lizenzdatei
gilt das voreingestellte Urheberrecht: alle Rechte vorbehalten, eine Nutzung
oder Weiterverbreitung durch Dritte ist nicht gestattet. Vor einer
Veröffentlichung sollte hier eine bewusst gewählte Lizenz ergänzt werden.
