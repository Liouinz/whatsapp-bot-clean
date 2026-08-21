# Sicherheit

## Eine Lücke melden

Bitte **kein öffentliches Issue** für Sicherheitslücken. Nutze stattdessen
[GitHub Security Advisories](https://github.com/Liouinz/whatsapp-bot-clean/security/advisories/new)
— das legt einen privaten Kanal an, in dem sich das Problem besprechen lässt,
bevor es bekannt wird.

Hilfreich in der Meldung: was passiert, wie man es auslöst, und was ein
Angreifer damit erreichen kann. Ein konkreter Reproduktionsweg ist mehr wert
als eine Einschätzung.

Dies ist ein privat betreutes Projekt ohne zugesagte Reaktionszeiten und ohne
Bug-Bounty.

## Betroffene Versionen

Gepflegt wird ausschließlich der aktuelle Stand auf `main`. Ältere Commits
erhalten keine Rückportierungen.

## Was besonders schützenswert ist

**Die WhatsApp-Sitzung.** `auth_creds` und `auth_keys` in der Datenbank sind
faktisch der Zugang zum verknüpften WhatsApp-Konto. Wer sie liest, kann sich als
das Konto ausgeben.

Deshalb im Code abgesichert: jedes Schreibstatement wird vor der Ausführung
geprüft und Zugriffe auf diese beiden Tabellen werden blockiert
(`src/core/database/guard.js`). Auch das „Alle Daten löschen" des Panels lässt
die Verknüpfung deshalb bestehen. Beim Melden oder Ändern von Code an dieser
Stelle bitte besonders sorgfältig sein.

**Das Panel-Passwort.** `ACCESS_SECRET` schützt Kick, Ban, Rundnachrichten an
ganze Gruppen und das Leeren der Datenbank. Der Start bricht ab, wenn es kürzer
als 16 Zeichen ist.

**Personenbezogene Daten.** Die Datenbank enthält Telefonnummern, Namen,
Gruppenzugehörigkeiten und Nachrichtenstatistiken realer Personen. Bitte keine
echten Datenbank-Auszüge in Issues, Pull Requests oder Logs anhängen.

## Vorhandene Maßnahmen

- Panel-Login timing-safe (SHA-256 + `timingSafeEqual`), Aussperre nach fünf
  Fehlversuchen für 15 Minuten, Rate-Limit 20 Anfragen/Minute.
- IPv6 wird für beide Bruteforce-Schutzmechanismen auf das /56-Präfix
  normalisiert — sonst wäre die Aussperre für jeden mit einem IPv6-Präfix
  wirkungslos.
- `trust proxy` auf genau einen Hop gesetzt: der vom Client frei setzbare Teil
  von `X-Forwarded-For` wird verworfen.
- Sitzungs-Cookie `HttpOnly` + `Secure` + `SameSite=Strict`; damit sind die
  Same-Site-POSTs des Panels ohne zusätzliches CSRF-Token abgedeckt.
- `helmet` mit strenger Content-Security-Policy, kein `unsafe-inline` für
  Skripte.
- Datenbankzugriffe ausschließlich mit gebundenen Parametern; Tabellen- und
  Spaltennamen nur aus fest verdrahteten Listen.
- Fehlerantworten des Panels sind generisch; Stacktraces werden in der
  Log-Ansicht auf die erste Zeile gekürzt.
- Keine Secrets im Repository — alles über Umgebungsvariablen, `.env` ist
  ignoriert.

## Bekannte, bewusst getragene Risiken

- **Auto-Kick bei Datenbankausfall.** Kann der Bot beim Beitritt einer Person
  nicht prüfen, ob sie gebannt ist, entfernt er sie vorsichtshalber
  (`src/moderation.js`, `isBanned()`). Ein Turso-Aussetzer wirft damit auch
  legitime Beitretende hinaus. Das ist eine bewusste Abwägung zugunsten der
  Bann-Durchsetzung.
- **Kein Audit fremder Abhängigkeiten.** `npm audit` läuft, aber der
  Baileys-Abhängigkeitsbaum wird nicht im Einzelnen geprüft.
- **Keine Verschlüsselung im Ruhezustand.** Die Daten liegen so, wie Turso sie
  speichert; das Projekt legt nichts zusätzlich darüber.
