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

## Home-Assistant-Webhook

Unter **Optionen → Integrationen** kann als Webhook-URL direkt die interne Adresse verwendet werden:

`http://homeassistant:8123/api/webhook/wuerfelpoker`

## Daten & Backup

Alle Daten liegen im App-Speicher und sind in jedem Home-Assistant-Backup enthalten.
