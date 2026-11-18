# Würfelpoker

Punktezähler für Würfelpoker mit Live-Sync, Trophäen, 3D-Effekten, Home-Assistant- und PixelIt-Anbindung.

## Öffnen

Nach dem Start **„In der Seitenleiste anzeigen“** aktivieren – dann ist Würfelpoker direkt in Home Assistant erreichbar.
Die Anmeldung übernimmt Home Assistant. Der erste Benutzer, der die App öffnet, wird Admin.

Am Handy geht das auch über die Home-Assistant-App.

## Direkter Zugriff (optional)

Wer die App ohne Home Assistant öffnen will (z. B. auf einem Tablet am Spieltisch):

1. Unter **Netzwerk** den Port `8099` freigeben.
2. In Würfelpoker unter **Optionen → Konto** ein Passwort festlegen.
3. Dann `http://<HA-IP>:8099` öffnen und mit Benutzername und Passwort anmelden.

## Umzug von einer anderen Installation

1. In der alten Installation: **Optionen → Allgemein → Komplett-Backup** herunterladen.
2. Hier: **Optionen → Allgemein → Backup einspielen**.

Spiele, Spieler, Profilbilder, Konten und Integrationen werden übernommen.

## 📷 Kamera-Erkennung (Prototyp)

Im Spiel auf **„📷 Würfe mit Kamera erkennen“** tippen.

1. **Einmal anlernen:** alle Würfel mit derselben Seite nach oben hinlegen, Seite wählen, „Erfassen“ – für jede Seite (9, 10, B, D, K, A).
2. **Würfeln:** Handy von oben über die Würfel halten. Sobald sie ruhig liegen, werden sie erkannt und passende Einträge vorgeschlagen.
3. Vorschlag antippen – fertig. Der nächste Spieler ist automatisch dran.

Tipps: helle Würfel auf dunklem, nicht glänzendem Untergrund, gutes Licht, Würfel nicht aneinander.
Die Kamera funktioniert nur über **HTTPS** (z. B. Home-Assistant-App mit Nabu Casa).
Das ist ein Prototyp – Ergebnis vor dem Antippen kurz prüfen.

## 💡 Lichteffekte

Unter **Optionen → Integrationen → Lichteffekte** legst du fest, was deine Lampen bei welchem Wurf machen:

- **Auslöser:** z. B. Grande, Grande serviert, Poker, gestrichen, Führungswechsel, Spielende …
- **Effekt:** Blinken, Pulsieren, Regenbogen, Farbe kurz anzeigen, Szene oder Skript
- **Lampen** aus deinem Home Assistant auswählen, Farbe und Wiederholungen einstellen, mit ▶ testen

Nach dem Effekt gehen die Lampen automatisch in ihren vorherigen Zustand zurück.
Skripte bekommen die Spieldaten als Variablen (`event`, `player`, `value`, `total`, `winner` …).

## Home-Assistant-Webhook

Unter **Optionen → Integrationen** kann als Webhook-URL direkt die interne Adresse verwendet werden:

`http://homeassistant:8123/api/webhook/wuerfelpoker`

## Daten & Backup

Alle Daten liegen im App-Speicher und sind in jedem Home-Assistant-Backup enthalten.
