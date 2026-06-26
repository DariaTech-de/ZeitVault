# Keycloak – Realm-Import (lokales Demo)

[`zeitvault-realm.json`](zeitvault-realm.json) wird beim Start von Keycloak via
`start-dev --import-realm` importiert (Compose mountet dieses Verzeichnis nach
`/opt/keycloak/data/import`).

Enthalten:

- Realm **`zeitvault`**, Realm-Rollen `employee` / `manager` / `admin`.
- Öffentlicher Client **`zeitvault-web`** (Authorization Code + **PKCE**,
  Redirect `http://localhost:3000/*`).
- Hardcoded-Claim-Mapper **`tenant_id = default`** (Single-Tenant-Demo) – die API
  liest diesen Claim (`TENANT_CLAIM`, ADR-0004/0008).
- Demo-Benutzer `demo`/`demo` (employee) und `admin-demo`/`admin` (admin).

> **Nur für lokale Entwicklung.** Unsichere Defaults (schwache Passwörter,
> `sslRequired=none`, Direct-Access-Grants). Produktion: eigener Realm,
> TLS, MFA-Pflicht für Admins, kein Klartext-Passwort, `tenant_id` aus
> Benutzer-/Gruppenattributen statt hardcodiert.

Token zum Testen der API (`AUTH_MODE=oidc`) holen:

```bash
curl -s -X POST http://localhost:8080/realms/zeitvault/protocol/openid-connect/token \
  -d grant_type=password -d client_id=zeitvault-web \
  -d username=demo -d password=demo | jq -r .access_token
```
