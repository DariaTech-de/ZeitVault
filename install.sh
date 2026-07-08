#!/usr/bin/env bash
# ZeitVault - Ein-Befehl-Installer (Self-Hosted, Docker).
#
# Ziel: reproduzierbare, fehlerarme Installation fuer Enterprise-Betrieb. Der
# Installer schliesst die typischen Stolperfallen aus:
#   - erzeugt URL-sichere Zufalls-Secrets (Hex) automatisch,
#   - neutralisiert exportierte Shell-Variablen, die die .env ueberschreiben,
#   - waehlt den Betriebsmodus (Cloudflare Tunnel / eigene Domain / Nur-IP-Test),
#   - erzeugt den passenden Keycloak-Realm,
#   - startet den richtigen Compose-Stack.
#
# Nutzung:
#   ./install.sh                      # interaktiv (empfohlen)
#   ZV_MODE=tunnel ZV_APP_DOMAIN=zeit.example.com ./install.sh   # nicht-interaktiv
#
# Modi (ZV_MODE): tunnel | domain | ip
set -euo pipefail

# --- Pfade -------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_DIR="${SCRIPT_DIR}/infra/docker"
ENV_FILE="${DOCKER_DIR}/.env"
EXAMPLE_FILE="${DOCKER_DIR}/.env.prod.example"

# --- Ausgabe-Helfer ----------------------------------------------------------
if [ -t 1 ]; then B="\033[1m"; G="\033[32m"; Y="\033[33m"; R="\033[31m"; C="\033[36m"; N="\033[0m"; else B=""; G=""; Y=""; R=""; C=""; N=""; fi
info()  { printf "%b\n" "${C}==>${N} $*"; }
ok()    { printf "%b\n" "${G}[ok]${N} $*"; }
warn()  { printf "%b\n" "${Y}[warn]${N} $*"; }
die()   { printf "%b\n" "${R}[fehler]${N} $*" >&2; exit 1; }
ask()   { # ask VAR "Frage" "default"
  local __var="$1" __q="$2" __def="${3:-}" __ans=""
  if [ -n "${!__var:-}" ]; then return 0; fi                 # bereits per Env gesetzt
  if [ ! -t 0 ]; then printf -v "$__var" '%s' "$__def"; return 0; fi
  if [ -n "$__def" ]; then read -r -p "$__q [$__def]: " __ans; else read -r -p "$__q: " __ans; fi
  printf -v "$__var" '%s' "${__ans:-$__def}"
}

# --- .env-Helfer (robust gegen Sonderzeichen) --------------------------------
set_env() { # set_env KEY VALUE  -> ersetzt/ergaenzt Zeile KEY=VALUE
  local key="$1" val="$2" tmp
  tmp="$(mktemp)"
  if [ -f "$ENV_FILE" ]; then grep -v "^${key}=" "$ENV_FILE" > "$tmp" || true; fi
  printf '%s=%s\n' "$key" "$val" >> "$tmp"
  mv "$tmp" "$ENV_FILE"
}
get_env() { [ -f "$ENV_FILE" ] && sed -n "s/^$1=//p" "$ENV_FILE" | head -1 || true; }
gen_secret() { openssl rand -hex 24; }   # 48 Hex-Zeichen, URL-sicher

# --- Vorbedingungen ----------------------------------------------------------
info "ZeitVault-Installer"
command -v docker >/dev/null 2>&1 || die "Docker ist nicht installiert. Siehe docs/DEPLOY-PROXMOX.md Abschnitt 2."
docker compose version >/dev/null 2>&1 || die "Docker Compose (Plugin) fehlt. 'docker compose version' schlaegt fehl."
command -v openssl >/dev/null 2>&1 || die "openssl fehlt (fuer Secret-Erzeugung)."
[ -d "$DOCKER_DIR" ] || die "Verzeichnis $DOCKER_DIR nicht gefunden - Installer aus dem Repo-Root starten."
docker info >/dev/null 2>&1 || die "Docker-Daemon nicht erreichbar (Rechte? 'systemctl start docker'?)."

# WICHTIG: exportierte Shell-Variablen wuerden die .env ueberschreiben -> entfernen.
unset POSTGRES_PASSWORD KEYCLOAK_ADMIN_PASSWORD TUNNEL_TOKEN 2>/dev/null || true

cd "$DOCKER_DIR"

# --- .env anlegen ------------------------------------------------------------
if [ ! -f "$ENV_FILE" ]; then
  [ -f "$EXAMPLE_FILE" ] || die "Vorlage $EXAMPLE_FILE fehlt."
  info "Lege .env aus Vorlage an."
  cp "$EXAMPLE_FILE" "$ENV_FILE"
fi

# --- Secrets sicherstellen (nur erzeugen, wenn Platzhalter/leer) --------------
PW="$(get_env POSTGRES_PASSWORD)"
case "$PW" in ""|BITTE_AENDERN*) set_env POSTGRES_PASSWORD "$(gen_secret)"; ok "POSTGRES_PASSWORD erzeugt (Hex).";; *) ok "POSTGRES_PASSWORD vorhanden.";; esac
KP="$(get_env KEYCLOAK_ADMIN_PASSWORD)"
case "$KP" in ""|BITTE_AENDERN*) set_env KEYCLOAK_ADMIN_PASSWORD "$(gen_secret)"; ok "KEYCLOAK_ADMIN_PASSWORD erzeugt.";; *) ok "KEYCLOAK_ADMIN_PASSWORD vorhanden.";; esac
[ -n "$(get_env KEYCLOAK_ADMIN)" ] || set_env KEYCLOAK_ADMIN "admin"

# --- Modus waehlen -----------------------------------------------------------
if [ -z "${ZV_MODE:-}" ]; then
  if [ -t 0 ]; then
    printf "%b\n" "${B}Betriebsmodus waehlen:${N}"
    echo "  1) tunnel  - Cloudflare Tunnel (echtes HTTPS, keine offenen Ports)   [empfohlen]"
    echo "  2) domain  - Eigene Domain + Let's Encrypt (Ports 80/443 oeffentlich)"
    echo "  3) ip      - Nur-IP-Schnelltest ueber HTTP (kein Login/Passkey, nur LAN)"
    ask ZV_MODE_CHOICE "Auswahl 1-3" "1"
    case "$ZV_MODE_CHOICE" in 1) ZV_MODE=tunnel;; 2) ZV_MODE=domain;; 3) ZV_MODE=ip;; *) die "Ungueltige Auswahl.";; esac
  else
    ZV_MODE=tunnel
  fi
fi
info "Modus: ${B}${ZV_MODE}${N}"

COMPOSE_ARGS=()
PROFILE_ARGS=()
case "$ZV_MODE" in
  tunnel)
    COMPOSE_FILE="docker-compose.tunnel.yml"
    ask ZV_APP_DOMAIN "Oeffentlicher Tunnel-Hostname (z. B. zeit.example.com)"
    [ -n "${ZV_APP_DOMAIN:-}" ] || die "Hostname erforderlich."
    set_env APP_DOMAIN "$ZV_APP_DOMAIN"
    ask ZV_TUNNEL_TOKEN "Cloudflare TUNNEL_TOKEN (leer lassen, wenn cloudflared separat laeuft)" ""
    if [ -n "${ZV_TUNNEL_TOKEN:-}" ]; then set_env TUNNEL_TOKEN "$ZV_TUNNEL_TOKEN"; PROFILE_ARGS=(--profile tunnel); fi
    REALM_TEMPLATE="keycloak-prod/zeitvault-realm.template.json"; REALM_VAR="APP_DOMAIN"; REALM_VAL="$ZV_APP_DOMAIN"
    URL="https://${ZV_APP_DOMAIN}"
    ;;
  domain)
    COMPOSE_FILE="docker-compose.prod.yml"
    ask ZV_APP_DOMAIN "App-Domain (z. B. zeit.example.com)"
    ask ZV_AUTH_DOMAIN "Auth-Domain (z. B. auth.example.com)"
    ask ZV_ACME_EMAIL  "E-Mail fuer Let's Encrypt"
    [ -n "${ZV_APP_DOMAIN:-}" ] && [ -n "${ZV_AUTH_DOMAIN:-}" ] && [ -n "${ZV_ACME_EMAIL:-}" ] || die "APP_DOMAIN, AUTH_DOMAIN und ACME_EMAIL erforderlich."
    set_env APP_DOMAIN "$ZV_APP_DOMAIN"; set_env AUTH_DOMAIN "$ZV_AUTH_DOMAIN"; set_env ACME_EMAIL "$ZV_ACME_EMAIL"
    REALM_TEMPLATE="keycloak-prod/zeitvault-realm.template.json"; REALM_VAR="APP_DOMAIN"; REALM_VAL="$ZV_APP_DOMAIN"
    URL="https://${ZV_APP_DOMAIN}"
    ;;
  ip)
    COMPOSE_FILE="docker-compose.ip.yml"
    DETECTED_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
    ask ZV_APP_IP "IP/Hostname dieses Hosts (ohne Schema)" "$DETECTED_IP"
    [ -n "${ZV_APP_IP:-}" ] || die "APP_IP erforderlich."
    set_env APP_IP "$ZV_APP_IP"
    REALM_TEMPLATE="keycloak-prod/zeitvault-realm.ip.template.json"; REALM_VAR="APP_IP"; REALM_VAL="$ZV_APP_IP"
    URL="http://${ZV_APP_IP}"
    ;;
  *) die "Unbekannter Modus '$ZV_MODE' (erlaubt: tunnel|domain|ip)." ;;
esac

# --- Keycloak-Realm erzeugen -------------------------------------------------
info "Erzeuge Keycloak-Realm (${REALM_VAR}=${REALM_VAL})."
mkdir -p keycloak-prod/import
[ -f "$REALM_TEMPLATE" ] || die "Realm-Vorlage $REALM_TEMPLATE fehlt."
sed "s#\${${REALM_VAR}}#${REALM_VAL}#g" "$REALM_TEMPLATE" > keycloak-prod/import/zeitvault-realm.json
python3 -c "import json,sys;json.load(open('keycloak-prod/import/zeitvault-realm.json'))" 2>/dev/null \
  && ok "Realm erzeugt." || die "Realm-JSON ungueltig - Template pruefen."

# --- Stack starten -----------------------------------------------------------
info "Baue und starte den Stack (kann beim ersten Mal einige Minuten dauern) ..."
docker compose --env-file "$ENV_FILE" "${PROFILE_ARGS[@]}" -f "$COMPOSE_FILE" up -d --build

echo
ok "Fertig. Stack laeuft."
info "Status:  docker compose -f infra/docker/${COMPOSE_FILE} ps"
info "Logs:    docker compose -f infra/docker/${COMPOSE_FILE} logs -f api keycloak"
echo
printf "%b\n" "${B}Aufrufen:${N} ${URL}"
printf "%b\n" "${B}Keycloak-Admin:${N} Benutzer '$(get_env KEYCLOAK_ADMIN)', Passwort steht in infra/docker/.env (KEYCLOAK_ADMIN_PASSWORD)"
echo
info "Naechster Schritt: Ersteinrichtung (Admin + Mitarbeitende) - siehe docs/DEPLOY-PROXMOX.md Abschnitt 7."
[ "$ZV_MODE" = "ip" ] && warn "Nur-IP-Modus: echter Keycloak-Login/Passkey funktioniert hier NICHT (kein HTTPS). Nur fuer LAN-Tests."
exit 0
