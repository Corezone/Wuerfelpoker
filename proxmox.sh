#!/usr/bin/env bash
# =====================================================================
#  Würfelpoker – LXC-Installer für Proxmox VE
#  In der Shell des Proxmox-HOSTS ausführen:
#    bash -c "$(curl -fsSL https://raw.githubusercontent.com/Corezone/wuerfelpoker/main/proxmox.sh)"
#
#  Einstellungen per Variable überschreibbar, z. B.:
#    CTID=140 IP=192.168.50.140/24 GW=192.168.50.1 bash -c "$(curl ...)"
# =====================================================================
set -euo pipefail
export LC_ALL=C.UTF-8 LANG=C.UTF-8 LANGUAGE=   # verhindert Locale-Warnungen im Container

REPO="${REPO:-Corezone/wuerfelpoker}"   # <- GitHub-Benutzername/Repo
BRANCH="${BRANCH:-main}"

G='\e[32m'; Y='\e[33m'; R='\e[31m'; B='\e[1m'; D='\e[2m'; N='\e[0m'
ok()   { echo -e " ${G}✔${N} $*"; }
step() { echo -e " ${Y}➜${N} $*"; }
die()  { echo -e " ${R}✘ $*${N}"; exit 1; }
ask()  { # ask VAR "Frage" default
  local v="$1" q="$2" d="$3" a
  if [ -n "${!v:-}" ]; then return; fi
  if [ -t 0 ] || [ -e /dev/tty ]; then read -r -p "   $q [$d]: " a </dev/tty || true; fi
  printf -v "$v" '%s' "${a:-$d}"
}

command -v pct >/dev/null || die "Dieses Skript muss in der Shell des Proxmox-Hosts laufen."
[ "$(id -u)" -eq 0 ] || die "Bitte als root ausführen."
case "$REPO" in DEINNAME/*) die "In proxmox.sh ist REPO noch nicht gesetzt (DEINNAME ersetzen).";; esac

clear 2>/dev/null || true
echo -e "${G}${B}"
cat <<'BANNER'
   ╔══════════════════════════════════════╗
   ║   🎲  W Ü R F E L P O K E R          ║
   ║       LXC-Installer für Proxmox VE   ║
   ╚══════════════════════════════════════╝
BANNER
echo -e "${N}"

# ---------- Standardwerte ermitteln ----------
NEXTID=$(pvesh get /cluster/nextid 2>/dev/null || echo 200)
TPL_STORE_DEF=$(pvesm status -content vztmpl 2>/dev/null | awk 'NR>1 && $3=="active"{print $1; exit}')
ROOT_STORE_DEF=$(pvesm status -content rootdir 2>/dev/null | awk 'NR>1 && $3=="active"{print $1}' | grep -m1 -x 'local-lvm' \
  || pvesm status -content rootdir 2>/dev/null | awk 'NR>1 && $3=="active"{print $1; exit}')

echo -e " ${B}Einstellungen${N} ${D}(Enter = Standard übernehmen)${N}"
ask CTID       "Container-ID"                         "$NEXTID"
ask CT_NAME    "Hostname"                             "wuerfelpoker"
ask IP         "IP-Adresse (dhcp oder z. B. 192.168.50.140/24)" "dhcp"
if [ "$IP" != "dhcp" ]; then
  GW_DEF=$(ip route | awk '/^default/{print $3; exit}')
  ask GW       "Gateway"                              "${GW_DEF:-192.168.1.1}"
fi
ask BRIDGE     "Netzwerk-Bridge"                      "vmbr0"
ask STORAGE    "Speicher für den Container"           "${ROOT_STORE_DEF:-local-lvm}"
ask TPL_STORE  "Speicher für Vorlagen"                "${TPL_STORE_DEF:-local}"
ask DISK       "Festplatte in GB"                     "4"
ask RAM        "Arbeitsspeicher in MB"                "512"
ask CORES      "CPU-Kerne"                            "1"
ask PORT       "Port der App"                         "3000"
echo

pct status "$CTID" >/dev/null 2>&1 && die "Container-ID $CTID ist schon vergeben."

# ---------- Debian-Vorlage ----------
step "Suche Debian-12-Vorlage …"
pveam update >/dev/null 2>&1 || true
TEMPLATE=$(pveam available --section system 2>/dev/null | awk '/debian-12-standard/{print $2}' | sort -V | tail -1)
[ -n "$TEMPLATE" ] || die "Keine Debian-12-Vorlage gefunden (hat der Proxmox-Host Internet?)."
if ! pveam list "$TPL_STORE" 2>/dev/null | grep -q "$TEMPLATE"; then
  step "Lade $TEMPLATE herunter …"
  pveam download "$TPL_STORE" "$TEMPLATE" >/dev/null || die "Download der Vorlage fehlgeschlagen."
fi
ok "Vorlage: $TEMPLATE"

# ---------- Container anlegen ----------
NET="name=eth0,bridge=$BRIDGE,ip=$IP"
[ "$IP" != "dhcp" ] && NET="$NET,gw=$GW"
step "Lege Container $CTID ($CT_NAME) an …"
pct create "$CTID" "$TPL_STORE:vztmpl/$TEMPLATE" \
  --hostname "$CT_NAME" --cores "$CORES" --memory "$RAM" --swap 256 \
  --rootfs "$STORAGE:$DISK" --net0 "$NET" \
  --unprivileged 1 --features nesting=1 --onboot 1 \
  --tags wuerfelpoker --description "🎲 Würfelpoker – github.com/$REPO" >/dev/null
ok "Container angelegt"

step "Starte Container …"
pct start "$CTID"

# Konsole ohne Passwort (wie bei den Proxmox Helper Scripts)
pct exec "$CTID" -- bash -c 'mkdir -p /etc/systemd/system/container-getty@1.service.d && cat > /etc/systemd/system/container-getty@1.service.d/override.conf <<EOF
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin root --noclear --keep-baud tty%I 115200,38400,9600 \$TERM
EOF
systemctl daemon-reload; systemctl restart container-getty@1.service' >/dev/null 2>&1 || true

step "Warte auf Netzwerk …"
for _ in $(seq 1 30); do
  pct exec "$CTID" -- getent hosts deb.debian.org >/dev/null 2>&1 && break
  sleep 2
done
pct exec "$CTID" -- getent hosts deb.debian.org >/dev/null 2>&1 || die "Container hat kein Internet/DNS.
   Prüfe IP, Gateway und Bridge (Container $CTID → Network/DNS) und starte das Skript neu.
   Container wieder entfernen:  pct stop $CTID; pct destroy $CTID"
ok "Netzwerk ok"

# ---------- App installieren ----------
step "Installiere Würfelpoker im Container …"
pct exec "$CTID" -- bash -c "export DEBIAN_FRONTEND=noninteractive; apt-get update -qq && apt-get install -y -qq curl ca-certificates >/dev/null \
  && REPO='$REPO' BRANCH='$BRANCH' PORT='$PORT' bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/$REPO/$BRANCH/install.sh)\""

CT_IP=$(pct exec "$CTID" -- hostname -I 2>/dev/null | awk '{print $1}')
echo -e "
 ${G}${B}🎲 Fertig! Würfelpoker läuft in Container $CTID.${N}

   Öffnen:    ${B}http://${CT_IP:-<IP>}:$PORT${N}
   Update:    In der Container-Konsole einfach ${B}update${N}
              oder vom Host: ${B}pct exec $CTID -- update${N}

   Beim ersten Aufruf legst du dein Admin-Konto an.
"
