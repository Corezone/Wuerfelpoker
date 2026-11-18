#!/usr/bin/with-contenv bashio
# Würfelpoker als Home-Assistant-App starten.
# /data ist der dauerhafte Speicher der App und landet automatisch in HA-Backups.
bashio::log.info "🎲 Starte Würfelpoker …"
export DATA_DIR=/data
export PORT=8099
export TRUST_INGRESS=1
cd /app
exec node server.js
