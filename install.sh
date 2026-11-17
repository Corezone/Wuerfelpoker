#!/usr/bin/env bash
# =====================================================================
#  Würfelpoker – Installation & Update
#  Läuft in jedem Debian/Ubuntu-System (z. B. Proxmox-LXC).
#  Erneut ausführen = Update (Daten bleiben erhalten).
# =====================================================================
set -euo pipefail
export LC_ALL=C.UTF-8 LANG=C.UTF-8 LANGUAGE=

REPO="${REPO:-Corezone/wuerfelpoker}"   # <- GitHub-Benutzername/Repo
BRANCH="${BRANCH:-main}"
DIR="${DIR:-/opt/wuerfelpoker}"
PORT="${PORT:-3000}"

G='\e[32m'; Y='\e[33m'; R='\e[31m'; B='\e[1m'; N='\e[0m'
ok()   { echo -e " ${G}✔${N} $*"; }
step() { echo -e " ${Y}➜${N} $*"; }
die()  { echo -e " ${R}✘ $*${N}"; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Bitte als root ausführen."
command -v apt-get >/dev/null || die "Nur Debian/Ubuntu wird unterstützt."
case "$REPO" in DEINNAME/*) die "In install.sh ist REPO noch nicht gesetzt (DEINNAME ersetzen).";; esac

echo -e "\n ${B}🎲 Würfelpoker – Installation/Update${N}\n"

step "Pakete installieren …"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates nodejs >/dev/null
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
if [ "$NODE_MAJOR" -lt 18 ]; then
  step "Node.js ist zu alt ($NODE_MAJOR) – installiere Node 20 von NodeSource …"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
ok "Node.js $(node -v)"

step "Lade aktuelle Version von github.com/$REPO …"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
curl -fsSL "https://github.com/$REPO/archive/refs/heads/$BRANCH.tar.gz" | tar xz -C "$TMP" --strip-components=1 \
  || die "Download fehlgeschlagen – stimmt REPO ($REPO) und ist das Repository öffentlich?"
[ -f "$TMP/server.js" ] || die "server.js nicht im Repository gefunden."

UPDATE=0; [ -f "$DIR/server.js" ] && UPDATE=1
ver() { grep -o "APP_VERSION = '[^']*'" "$1" 2>/dev/null | cut -d"'" -f2; }
OLDV=$(ver "$DIR/server.js"); NEWV=$(ver "$TMP/server.js")
mkdir -p "$DIR/data"
rm -rf "$DIR/public"
cp -r "$TMP/server.js" "$TMP/public" "$DIR/"
cp "$TMP/README.md" "$DIR/" 2>/dev/null || true
ok "Dateien nach $DIR kopiert (Daten in $DIR/data bleiben erhalten)"

step "Dienst einrichten …"
cat > /etc/systemd/system/wuerfelpoker.service <<EOF
[Unit]
Description=Wuerfelpoker
After=network-online.target
Wants=network-online.target

[Service]
WorkingDirectory=$DIR
ExecStart=$(command -v node) server.js
Environment=PORT=$PORT DATA_DIR=$DIR/data
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

# Update-Befehl für später
cat > /usr/local/bin/wuerfelpoker-update <<EOF
#!/usr/bin/env bash
REPO="$REPO" BRANCH="$BRANCH" PORT="$PORT" bash -c "\$(curl -fsSL https://raw.githubusercontent.com/$REPO/$BRANCH/install.sh)"
EOF
chmod +x /usr/local/bin/wuerfelpoker-update

systemctl daemon-reload
systemctl enable wuerfelpoker >/dev/null 2>&1
systemctl restart wuerfelpoker

step "Warte auf Start …"
for _ in $(seq 1 20); do
  curl -fs "http://127.0.0.1:$PORT/api/auth/status" >/dev/null 2>&1 && break
  sleep 1
done
curl -fs "http://127.0.0.1:$PORT/api/auth/status" >/dev/null 2>&1 \
  || die "Server antwortet nicht. Log: journalctl -u wuerfelpoker -n 30"
ok "Server läuft"

IP=$(hostname -I 2>/dev/null | awk '{print $1}')
echo
if [ "$UPDATE" -eq 1 ]; then
  echo -e " ${G}${B}✅ Update fertig!${N}  ${OLDV:+v$OLDV → }v${NEWV:-?}"
else
  echo -e " ${G}${B}✅ Installation fertig!${N}  v${NEWV:-?}"
fi
echo -e "\n   Öffnen:   ${B}http://${IP:-<IP>}:$PORT${N}"
echo -e "   Update:   ${B}wuerfelpoker-update${N}"
echo -e "   Log:      journalctl -u wuerfelpoker -f\n"
