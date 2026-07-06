# Inbetriebnahme & Endabnahme (Runbook)

Dieses Runbook beschreibt, wie der vollständige ZeitVault-Stack gestartet und die **Endabnahme** durchgeführt wird – inklusive des Teils, der in der reinen Build-/Prüf-Sandbox nicht möglich ist (echter OIDC-Login gegen Keycloak, voller Compose-Stack, Mobil-App). Voraussetzung ist eine Umgebung mit **Docker** (für die App: zusätzlich ein **Emulator/Gerät**).

> Empfehlung: Diese Schritte in **Claude Code lokal (CLI)** auf einer Maschine mit Docker ausführen – dann kann die Abnahme assistiert erfolgen. Alternativ eigenständig nach dieser Anleitung.

## 1. Voraussetzungen

- Docker + Docker Compose
- Node.js 24 LTS + `pnpm` (für Web-Dev-Server und Migrationen/Seed)
- Optional für die App: Android/iOS-Emulator + Expo

## 2. Stack starten (Self-Hosted, Compose)

```bash
cd infra/docker
docker compose up -d            # Postgres, Valkey, Keycloak (Realm-Import), OpenBao, SeaweedFS, API, Ledger
# optional zusätzlich der Observability-Stack (OpenTelemetry/Prometheus/Loki/Grafana):
docker compose -f docker-compose.yml -f docker-compose.observability.yml up -d
```

Der Keycloak-Realm `zeitvault` wird automatisch importiert (Clients `zeitvault-web`/`zeitvault-mobile`, Demo-Nutzer `demo`/`demo` und `admin-demo`/`admin`).

Der Import aktiviert zusätzlich den **Passkey-/WebAuthn-Login** (passwortlos): den Browser-Flow `ZeitVault Browser mit Passkey`, die WebAuthn-Passwordless-Policy und die Required Action `webauthn-register-passwordless` (Opt-in). Nach dem Start prüfen:

```bash
# Realm importiert und Passkey-Flow gebunden?
curl -s http://localhost:8080/realms/zeitvault/.well-known/openid-configuration | grep -o '"issuer":"[^"]*"'
```

Passkey-Test (in Produktion HTTPS erforderlich, lokal ist `localhost` ausgenommen): einen Passkey über die Konto-Konsole `http://localhost:8080/realms/zeitvault/account` (Bereich „Anmeldung") registrieren und anschließend per Passkey anmelden. In der Admin-Konsole unter *Authentication → Flows* ist der gebundene Browser-Flow `ZeitVault Browser mit Passkey` sichtbar. Siehe [`adr/0012-passkey-webauthn-login.md`](adr/0012-passkey-webauthn-login.md).

## 3. Datenbank migrieren und seeden

```bash
# gegen die Compose-Postgres (Port 5432)
export DATABASE_URL=postgres://zeitvault:zeitvault@localhost:5432/zeitvault
pnpm --filter @zeitvault/api db:migrate
pnpm --filter @zeitvault/api seed        # verknüpft Demo-Mitarbeitende mit den Keycloak-Subjects
```

### 3.1 Lizenzierung (Sitzplätze)

ZeitVault wird pro Mitarbeitenden (Sitzplatz) lizenziert (ADR-0013). Der Server
prüft eine signierte Lizenz **offline** gegen den konfigurierten öffentlichen
Schlüssel `LICENSE_PUBLIC_KEY` (PEM). Ohne Lizenz gilt ein Testmodus-Kontingent
(`LICENSE_GRACE_SEATS`, Default 5).

```bash
# Einmalig beim Hersteller: Schlüsselpaar erzeugen (öffentlichen Teil ausliefern)
pnpm --filter @zeitvault/api license:issue -- --genkey > /dev/stdout

# Lizenz signieren (privater Schlüssel NUR beim Hersteller, nie im Repo):
LICENSE_PRIVATE_KEY_FILE=./license-private.pem \
  pnpm --filter @zeitvault/api license:issue -- \
    --tenant default --customer "Muster GmbH" --tier "Team 10" --seats 10 --days 365
```

Den öffentlichen Schlüssel beim Kunden als `LICENSE_PUBLIC_KEY` setzen. Die
Administration aktiviert das ausgegebene Token in der Web-App unter **„Lizenz"**.

## 4. Automatische Stack-Verifikation (ein Befehl)

`scripts/verify-stack.sh` prüft die kritischen Workflows und Invarianten über HTTP. Zwei Modi:

```bash
# a) Dev-Modus (ohne Keycloak, Header-Kontext) – schnelle Funktionsprüfung
AUTH=dev bash scripts/verify-stack.sh

# b) OIDC-Modus – holt ECHTE Tokens von Keycloak (Password-Grant) und prüft die
#    OIDC-/JWKS-Strecke der API end-to-end (kein Browser nötig)
AUTH=oidc KEYCLOAK_BASE=http://localhost:8080 bash scripts/verify-stack.sh
```

Geprüft wird: Health (API/Ledger), `/me`-Mitarbeiterauflösung, idempotenter Stempel-Sync, Abwesenheits-Workflow inkl. RBAC (Manager 201, Doppelgenehmigung 409, Mitarbeiter 403), Kontobuchung mit RBAC, **reproduzierbare GoBD-Prüfsumme** und **intakte Audit-Hash-Kette**. Exitcode 0 = alle Checks bestanden.

> Hinweis: Voraussetzung ist eine erreichbare Datenbank. Bricht ein Check mit HTTP 500 ab, zuerst Postgres/Migrationsstand prüfen.

## 5. Web-App mit echtem OIDC-Login

```bash
cd apps/web
cp .env.example .env.local
# in .env.local setzen:
#   NEXT_PUBLIC_AUTH_MODE=oidc
#   NEXT_PUBLIC_OIDC_AUTHORITY=http://localhost:8080/realms/zeitvault
#   NEXT_PUBLIC_OIDC_REDIRECT_URI=http://localhost:3002/auth/callback
#   NEXT_PUBLIC_API_BASE_URL=http://localhost:3000
PORT=3002 pnpm --filter @zeitvault/web dev
```

Die API muss dafür im OIDC-Modus laufen und CORS für den Web-Ursprung erlauben:
`AUTH_MODE=oidc`, `KEYCLOAK_ISSUER_URL=http://localhost:8080/realms/zeitvault`,
`CORS_ORIGINS=http://localhost:3002`. Anschließend `http://localhost:3002` öffnen,
über Keycloak anmelden (`demo`/`demo` bzw. `admin-demo`/`admin`); `/me` löst den
Mitarbeiter auf, Rollen kommen aus dem Token.

## 6. Mobile-App (Emulator/Gerät)

```bash
cd apps/mobile
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:3000 \
EXPO_PUBLIC_AUTH_MODE=oidc \
EXPO_PUBLIC_OIDC_ISSUER=http://10.0.2.2:8080/realms/zeitvault \
pnpm start            # dann im Android-Emulator/iOS-Simulator öffnen
```

Offline-First testen: Flugmodus aktivieren, mehrfach stempeln, wieder online gehen,
„Synchronisieren" – die Buchungen werden idempotent nachgezogen.

## 7. Observability prüfen (optional)

Mit gestartetem Observability-Overlay (Schritt 2) senden API und Ledger Traces an den
Collector. Grafana unter `http://localhost:3300` (admin/admin), Prometheus unter
`http://localhost:9090`.

## Abnahme-Checkliste (Endabnahme)

- [ ] `docker compose up` bringt alle Dienste hoch (Health grün)
- [ ] `AUTH=oidc bash scripts/verify-stack.sh` → 0 Fehler
- [ ] Web-Login über Keycloak erfolgreich; rollenabhängige Navigation
- [ ] Passkey registrierbar (Konto-Konsole) und passwortlose Anmeldung erfolgreich
- [ ] Mobile-App auf Emulator: Login, Stempeln, Offline-Sync
- [ ] Observability: Traces in Grafana sichtbar

Siehe auch [`ABNAHME.md`](ABNAHME.md) (bisher in der Sandbox erreichte Verifikation) und
[`compliance/ZERTIFIZIERUNG-READINESS.md`](compliance/ZERTIFIZIERUNG-READINESS.md).
