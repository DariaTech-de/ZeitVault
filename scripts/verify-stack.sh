#!/usr/bin/env bash
# ZeitVault – End-to-End-Verifikation gegen einen laufenden Stack.
# Prüft die kritischen Workflows und Invarianten über HTTP (API + Audit-Ledger).
#
# Modi:
#   AUTH=dev   (Default) – Header-basierter Kontext (lokal/Sandbox, ohne Keycloak)
#   AUTH=oidc            – holt ECHTE Tokens von Keycloak (Password-Grant) und
#                          spricht die API per Bearer an (verifiziert die OIDC-Strecke)
#
# Konfiguration (Defaults für das Compose-Setup):
#   API_BASE       (http://localhost:3000)
#   LEDGER_BASE    (http://localhost:3001)
#   KEYCLOAK_BASE  (http://localhost:8080)   – nur AUTH=oidc
#   TENANT_ID      (default)
#
# Exitcode 0 = alle Checks bestanden, sonst 1.
set -uo pipefail

API_BASE="${API_BASE:-http://localhost:3000}"
LEDGER_BASE="${LEDGER_BASE:-http://localhost:3001}"
KEYCLOAK_BASE="${KEYCLOAK_BASE:-http://localhost:8080}"
TENANT_ID="${TENANT_ID:-default}"
AUTH="${AUTH:-dev}"

# Feste Demo-Subjects (entsprechen dem Keycloak-Realm und dem Seed).
SUB_EMP="11111111-1111-1111-1111-111111111111"
SUB_ADMIN="22222222-2222-2222-2222-222222222222"

PASS=0
FAIL=0
note() { printf '  %s\n' "$*"; }
ok()   { PASS=$((PASS + 1)); printf '  \033[32mPASS\033[0m %s\n' "$*"; }
bad()  { FAIL=$((FAIL + 1)); printf '  \033[31mFAIL\033[0m %s\n' "$*"; }

# jq-frei: JSON-Feld via python3 lesen.
jget() { python3 -c "import sys,json;d=json.load(sys.stdin);print(eval('d'+sys.argv[1]))" "$1" 2>/dev/null; }

# Keycloak-Token (Password-Grant) holen.
get_token() {
  local user="$1" pass="$2"
  curl -s "${KEYCLOAK_BASE}/realms/zeitvault/protocol/openid-connect/token" \
    -d grant_type=password -d client_id=zeitvault-web \
    -d "username=${user}" -d "password=${pass}" -d scope=openid \
    | jget "['access_token']"
}

# Header-Arrays je Rolle aufbauen.
declare -a H_EMP H_ADMIN
if [ "$AUTH" = "oidc" ]; then
  note "AUTH=oidc – hole Tokens von ${KEYCLOAK_BASE}"
  T_EMP="$(get_token demo demo)"
  T_ADMIN="$(get_token admin-demo admin)"
  if [ -z "$T_EMP" ] || [ -z "$T_ADMIN" ]; then
    bad "Keycloak-Token konnte nicht geholt werden – läuft Keycloak?"
    echo "Abbruch (oidc)."; exit 1
  fi
  ok "Echte Keycloak-Tokens für demo + admin-demo erhalten"
  H_EMP=(-H "authorization: Bearer ${T_EMP}" -H 'content-type: application/json')
  H_ADMIN=(-H "authorization: Bearer ${T_ADMIN}" -H 'content-type: application/json')
else
  note "AUTH=dev – Header-basierter Kontext"
  H_EMP=(-H "x-tenant-id: ${TENANT_ID}" -H "x-user-id: ${SUB_EMP}" -H "x-roles: employee" -H 'content-type: application/json')
  H_ADMIN=(-H "x-tenant-id: ${TENANT_ID}" -H "x-user-id: ${SUB_ADMIN}" -H "x-roles: manager,admin" -H 'content-type: application/json')
fi

code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
body() { curl -s "$@"; }

echo "== ZeitVault Stack-Verifikation (AUTH=${AUTH}) =="

# 1) Health
[ "$(code "${API_BASE}/api/health")" = "200" ] && ok "API /health" || bad "API /health"
[ "$(code "${LEDGER_BASE}/health")" = "200" ] && ok "Ledger /health" || bad "Ledger /health"

# 2) /me löst den Mitarbeiter auf
ME="$(body "${H_EMP[@]}" "${API_BASE}/api/me")"
EMP_ID="$(printf '%s' "$ME" | jget "['employee']['id']")"
if [ -n "$EMP_ID" ] && [ "$EMP_ID" != "None" ]; then ok "/me löst Mitarbeiter auf ($EMP_ID)"; else bad "/me ohne Mitarbeiterbezug: $ME"; fi

# 3) Offline-Sync (idempotent) – beweist den Stempel-Pfad ohne Tageszustand-Kopplung
SYNC_BODY="{\"employeeId\":\"${EMP_ID}\",\"items\":[{\"clientEventId\":\"aaaaaaaa-0000-4000-8000-000000000001\",\"kind\":\"clock_in\",\"occurredAt\":\"2026-05-04T06:00:00Z\"},{\"clientEventId\":\"aaaaaaaa-0000-4000-8000-000000000002\",\"kind\":\"clock_out\",\"occurredAt\":\"2026-05-04T14:00:00Z\"}]}"
[ "$(code "${H_EMP[@]}" -X POST -d "$SYNC_BODY" "${API_BASE}/api/stamp/sync")" = "201" ] && ok "Stempel-Sync (idempotent)" || bad "Stempel-Sync"

# 4) Abwesenheit: Antrag -> Genehmigung (Manager) -> erneute Genehmigung 409 -> Mitarbeiter 403
ABS_ID="$(body "${H_EMP[@]}" -X POST -d "{\"employeeId\":\"${EMP_ID}\",\"type\":\"vacation\",\"from\":\"2026-07-06\",\"to\":\"2026-07-10\"}" "${API_BASE}/api/absences" | jget "['id']")"
[ -n "$ABS_ID" ] && [ "$ABS_ID" != "None" ] && ok "Abwesenheitsantrag erstellt" || bad "Abwesenheitsantrag"
[ "$(code "${H_ADMIN[@]}" -X POST "${API_BASE}/api/absences/${ABS_ID}/approve")" = "201" ] && ok "Genehmigung durch Manager (201)" || bad "Genehmigung"
[ "$(code "${H_ADMIN[@]}" -X POST "${API_BASE}/api/absences/${ABS_ID}/approve")" = "409" ] && ok "Erneute Genehmigung abgelehnt (409, Statemachine)" || bad "Doppelgenehmigung nicht 409"
[ "$(code "${H_EMP[@]}" -X POST "${API_BASE}/api/absences/${ABS_ID}/approve")" = "403" ] && ok "Mitarbeiter-Genehmigung verweigert (403, RBAC)" || bad "RBAC 403 fehlt"

# 5) Konto: Buchung nur Manager/Admin
[ "$(code "${H_ADMIN[@]}" -X POST -d "{\"employeeId\":\"${EMP_ID}\",\"account\":\"overtime\",\"amount\":60,\"effectiveDate\":\"2026-05-04\"}" "${API_BASE}/api/accounts/transactions")" = "201" ] && ok "Kontobuchung (Admin, 201)" || bad "Kontobuchung"
[ "$(code "${H_EMP[@]}" -X POST -d "{\"employeeId\":\"${EMP_ID}\",\"account\":\"overtime\",\"amount\":60,\"effectiveDate\":\"2026-05-04\"}" "${API_BASE}/api/accounts/transactions")" = "403" ] && ok "Kontobuchung durch Mitarbeiter verweigert (403)" || bad "Konto-RBAC 403 fehlt"

# 6) GoBD-Export: zweimal -> identische Prüfsumme (reproduzierbar)
CS1="$(body "${H_ADMIN[@]}" -X POST "${API_BASE}/api/exports/gobd?from=2026-05-01&to=2026-05-31&format=csv" | jget "['checksum']")"
CS2="$(body "${H_ADMIN[@]}" -X POST "${API_BASE}/api/exports/gobd?from=2026-05-01&to=2026-05-31&format=csv" | jget "['checksum']")"
if [ -n "$CS1" ] && [ "$CS1" = "$CS2" ]; then ok "GoBD-Export reproduzierbar (${CS1:0:12}…)"; else bad "GoBD-Prüfsumme nicht reproduzierbar ($CS1 vs $CS2)"; fi

# 7) Audit-Ledger: Hash-Kette intakt
VALID="$(body "${LEDGER_BASE}/audit/verify?tenantId=${TENANT_ID}" | jget "['valid']")"
[ "$VALID" = "True" ] && ok "Audit-Hash-Kette valid" || bad "Audit-Kette nicht valid"

echo
echo "== Ergebnis: ${PASS} bestanden, ${FAIL} fehlgeschlagen =="
[ "$FAIL" -eq 0 ]
