# Changelog

## v1.10.0 – Kamera-Erkennung zuverlässiger
- 🎯 **Kein Springen mehr:** echte Bewegungserkennung – erkannt wird erst, wenn die Würfel ruhig liegen, und erst nach einem neuen Wurf wieder. Kurz die Hand drüber zählt nicht als neuer Wurf
- 🗳️ **Abstimmung über mehrere Bilder** statt eines Schnappschusses; Würfel werden über ihre Position zugeordnet
- 🔍 **Bessere Symbol-Erkennung:** schärferer Bildausschnitt, Kantenmuster (Form) zusätzlich zu Farbe, Anlernen mit leicht gedrehten/skalierten Varianten
- ✋ **Antippen zum Korrigieren:** falsch erkannten Würfel antippen, richtige Seite wählen – die App merkt sich das und wird mit jedem Spiel besser
- ⚠️ Unsichere Würfel werden gelb markiert, Statusanzeige im Kamerabild („Warte, bis die Würfel ruhig liegen“, „Erkenne …“)
- Anlernen: jede Seite 2× erfassen (Fortschritt 0/2 → ✓). **Einmal neu anlernen nötig**, die App weist darauf hin

## v1.9.0 – Kamera-Erkennung (Prototyp) & Pokerwürfel
- 🧪 **PROTOTYP: Würfe mit der Handykamera erkennen** – Würfel werden gefunden, Symbole erkannt und passende Einträge vorgeschlagen (inkl. „serviert“ im 1. Wurf)
- Anlern-Modus: jede Würfelseite einmal zeigen, die Muster gelten danach für alle Geräte
- **Würfeltyp wählbar:** Augenwürfel oder Pokerwürfel (Neuner, Zehner, Buben, Damen, Könige, Asse)
- In der Home-Assistant-App wird der Webhook-Bereich ausgeblendet (Lichteffekte laufen direkt über HA)

## v1.8.0 – Lichteffekte
- **Lichteffekte direkt aus Home Assistant** (nur als HA-App): Lampen, Szenen und Skripte per Dropdown auswählen
- Regeln pro Wurf: Grande, Grande serviert, Poker, Full House, Straße (jeweils auch serviert), fünf Sechser, gestrichen, Spielstart, Führungswechsel, Spielende, Trophäe, Level-Aufstieg
- Effekte: Blinken, Pulsieren, Regenbogen, Farbe kurz anzeigen, Szene aktivieren, Skript ausführen (mit Spieldaten als Variablen)
- Lampen kehren nach dem Effekt automatisch in ihren vorherigen Zustand zurück; Lampen ohne Farbe werden nur hell geschaltet
- „Vorschläge“ legt mit einem Klick ein fertiges Effekt-Set an, ▶ testet jede Regel sofort

## v1.7.0 – Home-Assistant-App
- **Als Home-Assistant-App installierbar:** eigener Eintrag in der Seitenleiste, Anmeldung über Home Assistant
- Der erste HA-Benutzer wird automatisch Admin; optional Direktzugriff im Heimnetz über Port 8099
- **Komplett-Backup & Wiederherstellung** (Spiele, Spieler, Profilbilder, Konten, Integrationen) – ideal für den Umzug
- Passwort festlegen für Konten ohne Passwort (z. B. HA-Benutzer)
- App funktioniert jetzt auch unter einem Unterpfad (Reverse-Proxy, Ingress)

## v1.6.0 – 3D & neue Optionen
- **Echte 3D-Würfel:** Logo, Login, Hintergrund und 3D-Würfelwurf beim Spielstart
- **Neige-Effekt** mit Lichtreflex auf Karten, Tasten und Punkte-Chips mit Tiefe, 3D-Podest
- **Trophäen** drehen sich beim Öffnen herein und glänzen
- **Optionen mit Reitern:** Allgemein · Regeln · Konto · Integrationen
- **Integrationen** (Home Assistant & PixelIt) nur für Admins sichtbar
- **Update-Befehl** heißt jetzt einfach `update` (`wuerfelpoker-update` funktioniert weiterhin)
- **Fix:** Neuinstallation über `proxmox.sh` brach seit v1.4.0 ab

## v1.5.0 – Home Assistant & PixelIt
- Home Assistant: Webhook mit allen Spielereignissen (Beispiel in `docs/homeassistant.yaml`)
- PixelIt: Punkte, GRANDE-Animation, Führungswechsel, Sieger und Trophäen auf der LED-Matrix

## v1.4.0 – Design-Upgrade
- Scoreboard mit Platzierung, Abstand zur Spitze und „am Zug“-Anzeige
- Neue Tabelle mit Abschnitten und Punkte-Chips, Spielerkarten, Verlauf nach Tagen
- Schriften Playfair Display & Inter, Versionsanzeige

## v1.3 – Trophäen & Installation
- Trophäen, XP, Level, Ränge und Avatar-Rahmen
- Installation per Befehl auf Proxmox, Update-Befehl
