# 🤖 WhatsApp-Community-Bot

Stabiler, sicherer WhatsApp-Community-Bot auf Basis von [`@whiskeysockets/baileys`](https://github.com/WhiskeySockets/Baileys) — gebaut für **Render Free-Tier + Turso**. Der Anzeige-Name kommt aus der Env-Variablen `BOT_NAME` (Standard: `CommunityBot`).

## Highlights

- **Session in Turso** — Neustarts & Deploys ohne neuen QR-Code (`useMultiFileAuthState` wird bewusst nicht benutzt).
- **Preflight beim Start** — falsche `DATABASE_URL`/`DATABASE_KEY` oder fehlende Env-Variablen ergeben eine klare deutsche Fehlermeldung statt eines Stacktraces.
- **LID-aware Admin-Erkennung** — Bot-Telefonnummer **und** LID werden verglichen (WhatsApp-Umstellung 2025/2026). Diagnose: `!debugadmin`.
- **KI (Gemini) nur als Fallback** für unbekannte Befehle + Fehler-Zusammenfassungen. Pro-User-Cooldown + Tageslimit. Nie auf normale Nachrichten.
- **Sauberer Fehlerlog** — Baileys-Decrypt-Rauschen wird gefiltert, identische Fehler dedupliziert.
- **Web-Panel „Control Center"** — Aurora-Glow + Dark Glassmorphism, mobile-first: Live-Status (SSE), Statistik-Charts, QR-Ansicht, Gruppen-Einstellungen, Befehls-Toggles, Moderation, Planung (Schedules/Geburtstage/Umfragen), Logs, Akzentfarben-Wechsler, Config-Export/-Import.
- **76 Befehle** — Moderation mit Warn-Eskalation (Warn → Mute → Kick), Anti-Link/-Spam/-Raid, Slowmode, Nachtmodus, Wochenreport, XP/Level mit Ranglisten, Profile, Umfragen, Geburtstage mit Auto-Gratulation, AFK, Custom-Commands/FAQ, geplante Nachrichten, Saison-Events und Tools (`!qr`, `!timer`, `!rechne` — ohne `eval`, `!password`, `!zufall`).

## Struktur

```
src/
  index.js        Einstieg: preflight() → initDb → Socket-Lifecycle, Reconnect
  preflight.js    Env-Check + DB-Verbindungstest (Klartext-Fehler)
  config.js       BOT_NAME + alle Stellschrauben
  db.js           Turso-Client, Schema (28 Tabellen), Schreib-Batching, Level-Kurve
  auth.js         Turso-Auth-State (BufferJSON + AppStateSyncKeyData-Gotcha)
  state.js        gemeinsamer Laufzeit-Zustand
  logger.js       Fehlerlog mit Rausch-Whitelist + Dedupe, Owner-Alarme
  queue.js        serielle Sende-Queue mit Jitter (800–2500 ms)
  permissions.js  LID-aware botIsAdmin / isUserAdmin / Owner-Check
  router.js       Befehls-Router (fest → Custom/FAQ → KI), Dedupe, XP, AFK
  ai.js           Gemini-Fallback (gemini-3-flash, Cooldown + Tageslimit)
  moderation.js   Auto-Mod, Warn-Eskalation, Mutes, Bans, Anti-Raid
  scheduler.js    geplante Nachrichten, Nachtmodus, Geburtstage, Umfragen-Ende,
                  Wochenreport, Auto-Cleanup
  dashboard.js    Panel-Server (Auth, API, SSE) — Sicherheit s. u.
  dashboard-ui.js Panel-UI (Vanilla HTML/CSS/JS, kein Build-Step)
  commands/       admin, community, levels, profile, afk, custom, schedule,
                  tools, fun, polls, birthdays
```

## Render-Env-Variablen

| Variable | Zweck |
|---|---|
| `DATABASE_URL` | Turso-URL, beginnt mit `libsql://…turso.io` (falsche URL → Preflight meldet 404 in Klartext) |
| `DATABASE_KEY` | Turso Auth-Token (Read & Write, Expiry „Never") |
| `OWNER_NUMBERS` | Owner-Nummern, komma-getrennt, nur Ziffern (z. B. `4915112345678`) |
| `ACCESS_SECRET` | Passwort für Panel & `/qr` — langes Zufalls-Secret |
| `SELF_URL` | eigene öffentliche URL, z. B. `https://whatsapp-bot-ewwe.onrender.com` |
| `GEMINI_API_KEY` | Google AI Studio Key (Free-Tier) |
| `BOT_NAME` *(optional)* | Anzeige-Name, Standard `CommunityBot` |

`PORT` **nicht** setzen (kommt von Render). Start-Command: `node src/index.js`.

## Go-Live

1. Env-Variablen in Render setzen (ohne Anführungszeichen/Leerzeichen).
2. Deploy — der Preflight prüft alles und meldet Konfig-Fehler in Klartext.
3. Panel öffnen: `SELF_URL` → Login mit `ACCESS_SECRET` → Tab **QR** → mit WhatsApp scannen (Einstellungen → Verknüpfte Geräte). Neuer QR alle ~60 s ist normal, solange nicht gescannt.
4. **UptimeRobot** (Pflicht!): HTTP-Monitor auf `SELF_URL/health`, Intervall 5 Minuten — sonst schläft der Free-Tier ein und es hagelt Decrypt-Fehler.

## Sicherheit

- Panel-Login timing-safe (SHA-256 + `timingSafeEqual`), Brute-Force-Lockout (5 Versuche → 15 Min IP-Sperre), Rate-Limit, `helmet` + strenge CSP, `Cache-Control: no-store`, Session-Cookie `HttpOnly/Secure/SameSite=Strict`. `/qr` ist geschützt.
- Keine Secrets im Repo — alles über Env-Variablen.
- `!rechne` nutzt einen eigenen sicheren Parser (nur Zahlen/Operatoren), niemals `eval`.
- Reconnect-Logik: 515 → sofort neu (normal nach Pairing) · 401 → Session löschen, **kein** Reconnect, Owner-Alarm · 403 → **Stopp** + Alarm (Ban-Verdacht) · 440 → Stopp + Alarm · sonst Backoff mit Jitter (1 s → 60 s).

## Notfall-Rollback

Zurück zum alten Bot (Stand vor dem Neuaufbau):

```bash
git checkout backup/pre-umbau
git push -f origin main
```

Render deployt dann automatisch wieder den alten Stand. **Achtung:** `-f` überschreibt den neuen Code auf `main` — nur im echten Notfall.

## Troubleshooting

| Symptom | Ursache / Fix |
|---|---|
| `START ABGEBROCHEN: DATABASE_URL …404` | URL zeigt auf gelöschte/falsche Turso-DB → neue URL aus dem Turso-Dashboard |
| `START ABGEBROCHEN: DATABASE_KEY …401/403` | Token falsch/abgelaufen → neuen Token (R&W, Never) erstellen |
| Alle ~60 s neuer QR | Noch nicht gescannt — kein Bug, einfach `/qr` scannen |
| `No matching sessions` / `failed to decrypt` | Normales Baileys-Rauschen, wird bewusst nicht geloggt |
| Dienst reagiert erst nach ~50 s | Free-Tier-Hibernation → UptimeRobot auf `/health` prüfen |
| Admin-Befehle tun nichts | `!debugadmin` ausführen — zeigt PN/LID-Erkennung und Admin-Status |
