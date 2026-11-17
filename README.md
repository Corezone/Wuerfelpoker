# 🎲 Würfelpoker-Zähler

Punkte-Zähler für Würfelpoker mit Web-Oberfläche – für Handy (als App installierbar) und PC.
Alle Geräte synchronisieren sich live: Einer trägt am Handy ein, der Fernseher/PC zeigt sofort mit.

**Funktionen**
- Spieler anlegen, Reihenfolge beim Spielstart wählen
- Einser–Sechser, Straße, Full House, Poker, Grande (gewürfelt / serviert)
- Mehrere Spalten pro Spieler mit Multiplikator (Standard: 3 Spalten ×1, ×2, ×3)
- Feld antippen → Wert auswählen oder streichen
- Live-Führender 👑, Spielverlauf, Statistik (Siege, Ø-Punkte, Rekord)
- Punktewerte, Spaltenanzahl und optionaler Bonus einstellbar
- Trophäen-System im PlayStation-Stil: XP, Level, Ränge, 21 Trophäen (Bronze/Silber/Gold/Platin), Avatar-Rahmen als Belohnung – wird rückwirkend aus allen beendeten Spielen berechnet
- Profilbilder pro Spieler (hochladen und zuschneiden)
- Effekte: Würfelrollen beim Spielstart, schwebende Punkte, Funken, Grande-Banner mit Konfetti, Siegerpodest, Sounds und Vibration (pro Gerät abschaltbar)
- Daten liegen in `data/db.json`, Profilbilder in `data/avatars/`, Backup-Export in den Einstellungen

---

## ⚡ Schnellinstallation auf Proxmox

In der **Shell des Proxmox-Hosts** (Node anklicken → Shell):

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/Corezone/wuerfelpoker/main/proxmox.sh)"
```

Das Skript fragt ein paar Einstellungen ab (Enter = Standard), lädt die Debian-Vorlage, legt einen LXC-Container an, installiert alles und zeigt am Ende die Adresse an.

**Update** – in der Konsole des Containers:

```bash
wuerfelpoker-update
```

oder direkt vom Proxmox-Host: `pct exec <ID> -- wuerfelpoker-update`

**Schon vorhandener Container / anderes Debian-System** – darin ausführen:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/Corezone/wuerfelpoker/main/install.sh)"
```

Daten in `/opt/wuerfelpoker/data` bleiben bei Installation und Updates erhalten.

---

## Login

- Beim **ersten Aufruf** legst du ein Admin-Konto an.
- Unter **Einstellungen → Benutzer** legt der Admin weitere Konten an (mit oder ohne Admin-Rechte) und kann Passwörter zurücksetzen.
- **Admins** dürfen Spielregeln ändern, Spiele/Spieler löschen und Benutzer verwalten.
  **Normale Benutzer** können Spiele starten, Punkte eintragen und Spieler anlegen.
- Man bleibt 90 Tage eingeloggt (einstellbar über `SESSION_DAYS`).
- Passwörter werden mit scrypt gehasht; nach 10 Fehlversuchen ist die IP 15 Minuten gesperrt.
- **Admin-Passwort vergessen?** Container stoppen, in `data/db.json` die Einträge unter `"users"` und `"sessions"` leeren (`[]` bzw. `{}`), neu starten → Setup erscheint wieder. Spiele bleiben erhalten.
- Login komplett abschalten: `AUTH=off` setzen.

---

## Installation auf Proxmox

### Variante A: LXC mit Docker (empfohlen, wenn du schon Docker nutzt)

```bash
# Ordner auf den Docker-Host kopieren, z. B. nach /opt/wuerfelpoker
cd /opt/wuerfelpoker
docker compose up -d --build
```

Danach: `http://<IP-des-Containers>:3000`

### Variante B: Schlanker LXC ohne Docker

1. In Proxmox einen LXC mit **Debian 12** anlegen (1 Kern, 256 MB RAM, 2 GB Disk reichen).
2. In der Konsole des LXC:

```bash
apt update && apt install -y nodejs
mkdir -p /opt/wuerfelpoker
# Dateien nach /opt/wuerfelpoker kopieren (z. B. per scp oder WinSCP)
cp /opt/wuerfelpoker/wuerfelpoker.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now wuerfelpoker
```

Debian 12 bringt Node 18 mit – das reicht. Danach: `http://<IP-des-LXC>:3000`

---

## Aufs Handy

- **Android (Chrome):** Seite öffnen → ⋮ → „Zum Startbildschirm hinzufügen“ / „App installieren“
- **iPhone (Safari):** Teilen → „Zum Home-Bildschirm“

Hinweis: Die „App installieren“-Option erscheint bei Chrome nur über HTTPS (z. B. hinter Traefik).
Über plain HTTP geht trotzdem „Zum Startbildschirm hinzufügen“.

## Hinter Traefik (optional)

Labels für `docker-compose.yml`:

```yaml
    labels:
      - traefik.enable=true
      - traefik.http.routers.wuerfelpoker.rule=Host(`poker.deinedomain.at`)
      - traefik.http.services.wuerfelpoker.loadbalancer.server.port=3000
```

Live-Sync läuft über Server-Sent Events (`/api/events`) – funktioniert mit Traefik ohne Extra-Konfiguration.

## Konfiguration

| Variable   | Standard  | Bedeutung              |
|------------|-----------|------------------------|
| `PORT`     | `3000`    | Port des Webservers    |
| `DATA_DIR` | `./data`  | Speicherort der Daten  |
| `AUTH`     | –         | `off` = ohne Login     |
| `SESSION_DAYS` | `90`  | Wie lange man eingeloggt bleibt |

Keine externen npm-Pakete nötig – nur Node.js ≥ 18.
