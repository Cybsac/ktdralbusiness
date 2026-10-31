#!/bin/sh
set -e

echo "[entrypoint] Starting container..."

# Prepare persistent data dir for DB and generated assets if mounted
DATA_DIR="/data"
POSTERS_DIR="/app/public/posters"
TEMPLATES_DIR="/app/public/templates"

if [ -d "$DATA_DIR" ]; then
  echo "[entrypoint] Detected data volume at $DATA_DIR"
  # Warn if /data is not a mounted volume (common cause of data loss on redeploy)
  if grep -qs " $DATA_DIR " /proc/mounts; then
    echo "[entrypoint] $DATA_DIR is a mounted volume. Persistence OK."
  else
    echo "[entrypoint] WARNING: $DATA_DIR no parece ser un volumen montado."
    echo "[entrypoint] WARNING: Los datos SQLite y archivos en $DATA_DIR se perderán al redeploy."
    echo "[entrypoint] WARNING: En Railway, crea y monta un Volume en la ruta $DATA_DIR para persistencia."
  fi
  # Ensure subdirs
  mkdir -p "$DATA_DIR/db" "$DATA_DIR/public/posters" "$DATA_DIR/public/templates"

  # If DATABASE_URL points to sqlite file inside /app, re-point to /data
  if [ -n "$DATABASE_URL" ] && echo "$DATABASE_URL" | grep -qi "^file:"; then
    DB_PATH=$(echo "$DATABASE_URL" | sed 's/^file:\/*//')
    case "$DB_PATH" in
      /*) : ;; # absolute path -> leave it
      *)
        # Switch to /data/db/prod.db while preserving relative path intent
        export DATABASE_URL="file:$DATA_DIR/db/prod.db"
        echo "[entrypoint] Overriding DATABASE_URL to $DATABASE_URL (persistent)"
        ;;
    esac
  fi

  # Preserve bundled files and volume files before linking; never recursively delete them.
  link_persistent_assets() {
    ASSET_DIR="$1"
    VOLUME_DIR="$2"
    if [ -L "$ASSET_DIR" ]; then
      echo "[entrypoint] Existing asset link retained: $ASSET_DIR"
      return
    fi
    if [ -d "$ASSET_DIR" ]; then
      cp -rn "$ASSET_DIR/." "$VOLUME_DIR/"
      BACKUP_DIR="${ASSET_DIR}.bundled"
      if [ -e "$BACKUP_DIR" ]; then
        echo "[entrypoint] Existing asset backup prevents linking: $BACKUP_DIR" >&2
        exit 1
      fi
      mv "$ASSET_DIR" "$BACKUP_DIR"
    elif [ -e "$ASSET_DIR" ]; then
      echo "[entrypoint] Unexpected asset path: $ASSET_DIR" >&2
      exit 1
    fi
    ln -s "$VOLUME_DIR" "$ASSET_DIR"
  }
  link_persistent_assets "$POSTERS_DIR" "$DATA_DIR/public/posters"
  link_persistent_assets "$TEMPLATES_DIR" "$DATA_DIR/public/templates"

fi

# Schema changes are applied explicitly with reviewed Prisma migrations before deployment.
# Never synchronize the database schema automatically during container startup.
if [ "$ALLOW_MIGRATIONS" = "1" ]; then
  echo "[entrypoint] Automatic schema synchronization disabled; apply reviewed migrations separately."
fi

if [ -f "server.js" ]; then
  echo "[entrypoint] Launching Next standalone server (server.js)"
  du -sh .next 2>/dev/null || true
  exec node server.js
else
  if command -v next >/dev/null 2>&1; then
    echo "[entrypoint] Launching app via next start (fallback)"
    exec next start
  else
    echo "[entrypoint] ERROR: No server.js (standalone) y 'next' no está disponible en PATH. Revisa el Dockerfile/copia de .next/standalone."
    exit 1
  fi
fi