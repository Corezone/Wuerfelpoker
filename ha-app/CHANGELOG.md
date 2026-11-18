# Changelog

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
