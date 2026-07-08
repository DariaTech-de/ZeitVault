# ZeitVault auf Proxmox (LXC) – Produktions-Deployment mit HTTPS

Dieses Runbook installiert ZeitVault **produktionsreif mit HTTPS** in einem
Proxmox-LXC-Container via **Docker Compose**. Der Stack besteht aus PostgreSQL,
Keycloak (OIDC/Passkey), API, Audit-Ledger, Web-Oberfläche und einem
**Caddy-Reverse-Proxy** mit automatischem Let's-Encrypt-Zertifikat.

> Optionale Bausteine (Valkey, OpenBao, SeaweedFS) sind für den Kernbetrieb
> nicht erforderlich und hier bewusst weggelassen – siehe
> [Abschnitt 10](#10-optionale-dienste).

---

## Schnellstart: ein Befehl

Nach dem Klonen des Repos und installiertem Docker (Abschnitt 2) genügt der
Installer – er erzeugt sichere Secrets, wählt den Betriebsmodus, generiert den
Keycloak-Realm und startet den Stack:

```bash
cd /opt/zeitvault
./install.sh
```

Der Installer fragt interaktiv nach dem Modus (**tunnel** = Cloudflare Tunnel,
empfohlen; **domain** = eigene Domain + Let's Encrypt; **ip** = Nur-LAN-Schnelltest)
und dem Hostnamen. Nicht-interaktiv, z. B. für Automatisierung:

```bash
ZV_MODE=tunnel ZV_APP_DOMAIN=zeit.example.com ZV_TUNNEL_TOKEN=... ./install.sh
```

Die Abschnitte unten beschreiben die manuellen Einzelschritte (falls ohne
Installer gewünscht) sowie die Ersteinrichtung (Abschnitt 7).

---

## 0. Voraussetzungen

- **Proxmox VE** mit Internetzugang.
- **Zwei DNS-Records** (A/AAAA) auf die öffentliche IP dieses Hosts, z. B.
  - `zeitvault.example.com` → Web-Oberfläche
  - `auth.example.com` → Keycloak (Login/Passkey)
- **Ports 80 und 443** von außen erreichbar (für Let's Encrypt und den Betrieb).
- Ein **GitHub-Token** (Fine-grained PAT, nur *Contents: Read-only* auf
  `DariaTech-de/ZeitVault`) zum Klonen des privaten Repositories.

**Ressourcen (Empfehlung):** 2 vCPU, **4 GB RAM**, **20 GB Disk**. Keycloak (JVM)
ist der größte Verbraucher.

---

## 1. LXC-Container anlegen (auf dem Proxmox-Host)

Docker im LXC benötigt **Nesting** und **keyctl**. Auf der Proxmox-Shell:

```bash
# Debian-12-Template (falls noch nicht vorhanden)
pveam update && pveam download local debian-12-standard_*_amd64.tar.zst

# Container erstellen (ID 120 als Beispiel; Storage/Bridge anpassen)
pct create 120 local:vztmpl/debian-12-standard_12.7-1_amd64.tar.zst \
  --hostname zeitvault \
  --cores 2 --memory 4096 --swap 1024 \
  --rootfs local-lvm:20 \
  --net0 name=eth0,bridge=vmbr0,ip=dhcp \
  --features nesting=1,keyctl=1 \
  --unprivileged 1 --onboot 1

pct start 120
pct enter 120
```

> Falls Docker im **unprivilegierten** LXC Probleme macht (selten mit modernem
> Kernel): entweder `--unprivileged 0` (privilegiert) verwenden **oder** eine
> kleine Debian-VM statt LXC nutzen. Der Rest der Anleitung bleibt identisch.

---

## 2. Docker im Container installieren

Innerhalb des LXC (jetzt als root):

```bash
apt-get update && apt-get install -y ca-certificates curl git gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/debian $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
> /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
docker run --rm hello-world   # Test
```

---

## 3. Repository klonen (mit GitHub-Token)

`<GITHUB_TOKEN>` durch euren Fine-grained PAT ersetzen:

```bash
cd /opt
git clone https://<GITHUB_TOKEN>@github.com/DariaTech-de/ZeitVault.git zeitvault
cd zeitvault

# Token aus der Remote-URL entfernen (nicht dauerhaft im Klartext lassen):
git remote set-url origin https://github.com/DariaTech-de/ZeitVault.git
```

> Der Code liegt auf `main`. Für Updates später: `git pull` (dann bei Bedarf ein
> Personal-Access-Token via `git config credential.helper` hinterlegen).

---

## 4. Konfiguration (.env)

```bash
cd /opt/zeitvault/infra/docker
cp .env.prod.example .env
nano .env
```

Mindestens setzen: `APP_DOMAIN`, `AUTH_DOMAIN`, `ACME_EMAIL` sowie **starke**
`POSTGRES_PASSWORD` und `KEYCLOAK_ADMIN_PASSWORD`.

```bash
openssl rand -hex 24     # fuer POSTGRES_PASSWORD (URL-sicher, Pflicht!)
openssl rand -base64 24  # fuer KEYCLOAK_ADMIN_PASSWORD (beliebig stark)
```

> **Wichtig:** `POSTGRES_PASSWORD` fliesst in Datenbank-URLs ein und muss
> URL-sicher sein (nur `0-9 a-f`). Daher `-hex`, **nicht** `-base64` (dessen
> Zeichen `/ + =` wuerden die URL zerstoeren).

---

## 5. Keycloak-Realm aus dem Template erzeugen

Der Produktions-Realm (mit Passkey-Flow, ohne Demo-Nutzer) wird mit eurer
App-Domain erzeugt:

```bash
cd /opt/zeitvault/infra/docker
set -a && . ./.env && set +a
sed "s#\${APP_DOMAIN}#${APP_DOMAIN}#g" \
  keycloak-prod/zeitvault-realm.template.json \
  > keycloak-prod/import/zeitvault-realm.json
# Kurz prüfen, dass gültiges JSON entstand:
python3 -c "import json;json.load(open('keycloak-prod/import/zeitvault-realm.json'));print('Realm OK')"
```

---

## 6. Stack bauen und starten

```bash
cd /opt/zeitvault/infra/docker
docker compose -f docker-compose.prod.yml build         # dauert beim ersten Mal
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml ps
```

Ablauf: PostgreSQL startet → `migrate` legt Schema/RLS/Trigger in API- und
Ledger-DB an (einmalig) → Keycloak, API, Ledger, Web starten → Caddy holt die
TLS-Zertifikate.

**Logs verfolgen:**

```bash
docker compose -f docker-compose.prod.yml logs -f caddy keycloak api
```

Nach 1–2 Minuten erreichbar:
- **App:** `https://APP_DOMAIN`
- **Keycloak-Admin:** `https://AUTH_DOMAIN` (Login mit `KEYCLOAK_ADMIN` /
  `KEYCLOAK_ADMIN_PASSWORD`)

---

## 7. Ersten Administrator und Mitarbeitende anlegen

Der Produktions-Realm enthält **keine** Demo-Nutzer. Ersteinrichtung:

**a) Admin-Nutzer in Keycloak** (`https://AUTH_DOMAIN` → Realm `zeitvault` →
*Users* → *Add user*):
- Username/E-Mail setzen, *Credentials* → Passwort vergeben (temporär abwählen).
- *Role mapping* → Realm-Rollen `admin` (und `manager`, `employee`) zuweisen.
- **User-ID (sub) kopieren** (steht in der Nutzer-Detailansicht) – wird gleich
  gebraucht, um den Login mit einem Mitarbeiterdatensatz zu verknüpfen.

**b) In ZeitVault anmelden:** `https://APP_DOMAIN` → „Anmelden" → über Keycloak
einloggen. Als `admin` ist der Bereich **Verwaltung** sichtbar.

**c) Mitarbeitende anlegen und mit dem Login verknüpfen.** Damit ein Nutzer
stempeln kann, braucht sein Login (`sub`) einen Mitarbeiterdatensatz
(`external_id = sub`). Am einfachsten per API mit einem gültigen Admin-Token:

```bash
# Admin-Token aus Keycloak holen (Password-Grant, nur zur Einrichtung):
TOKEN=$(curl -s https://AUTH_DOMAIN/realms/zeitvault/protocol/openid-connect/token \
  -d grant_type=password -d client_id=zeitvault-web \
  -d username=<ADMIN_USER> -d password=<ADMIN_PW> -d scope=openid \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

# Mitarbeitenden anlegen und mit dem Keycloak-Nutzer (sub) verknüpfen:
curl -s https://APP_DOMAIN/api/admin/employees \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"personnelNumber":"1001","displayName":"Max Mustermann","externalId":"<KEYCLOAK_SUB>"}'
```

> Danach löst `/api/me` den Nutzer korrekt auf; Stempeln/Self-Service
> funktionieren. Weitere Mitarbeitende ebenso (jeweils `externalId` = deren
> Keycloak-`sub`). Sitzplätze werden über die Lizenz begrenzt (Bereich
> **Verwaltung → Lizenz**; ohne Lizenz gilt der Testmodus).

**Passkey aktivieren (optional, empfohlen):** Nutzer öffnen
`https://AUTH_DOMAIN/realms/zeitvault/account` → *Signieren-Sie-sich-an* →
Passkey hinzufügen. Danach Login per Passkey statt Passwort (HTTPS ist bereits
vorhanden – Voraussetzung von WebAuthn).

---

## 8. Verifikation

```bash
# API erreichbar (über den Proxy, same-origin /api)
curl -s https://APP_DOMAIN/api/info
# OIDC-Discovery von Keycloak erreichbar
curl -s https://AUTH_DOMAIN/realms/zeitvault/.well-known/openid-configuration | head -c 120
# Audit-Ledger ist intern (kein öffentlicher Port); die Ketten-Integrität wird
# über die App/Reports geprüft.
```

Im Browser: `https://APP_DOMAIN` öffnen, anmelden, **Heute** stempeln, unter
**Verwaltung** die Bereiche prüfen. Zertifikat muss gültig (grünes Schloss) sein.

---

## 9. Betrieb

**Update auf neue Version:**

```bash
cd /opt/zeitvault && git pull
cd infra/docker
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d   # migrate läuft automatisch mit
```

**Backup (wichtig – enthält alle revisionssicheren Daten):**

```bash
# Postgres-Dump (API-, Ledger- und Keycloak-DB liegen in einem Cluster)
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dumpall -U zeitvault > /opt/backups/zeitvault-$(date +%F).sql
```

Zusätzlich das Docker-Volume `zeitvault_pgdata` sichern (z. B. Proxmox-Backup des
gesamten LXC). **Caddy-Zertifikate** liegen im Volume `zeitvault_caddydata`.

**Dienste stoppen/starten:**

```bash
docker compose -f docker-compose.prod.yml stop
docker compose -f docker-compose.prod.yml up -d
```

---

## 10. Optionale Dienste

Nicht Teil des Kern-Stacks, bei Bedarf ergänzbar (aus
`docker-compose.yml` übernehmbar):
- **Valkey** – Cache/Queues (nur nötig, wenn später BullMQ-Hintergrundjobs genutzt werden).
- **OpenBao** – Secrets-Verwaltung (Produktion: echter Modus mit Unseal statt
  Dev-Token).
- **SeaweedFS / S3** – WORM-Objektspeicher für Export-/Ledger-Ablage.

---

## 11. Sicherheitshinweise

- **Secrets** ausschließlich in der `.env` (nicht im Repo; steht in `.gitignore`).
  Starke Zufallspasswörter verwenden.
- **Keycloak-Admin-Konsole** nach der Einrichtung nur eingeschränkt erreichbar
  machen (z. B. IP-Allowlist im Reverse-Proxy) und ein starkes Admin-Passwort +
  MFA setzen.
- **DB-Least-Privilege:** In gehärteten Umgebungen einen separaten DB-User für die
  Anwendung mit nur INSERT/SELECT auf `audit_events` (ohne `BYPASSRLS`) einrichten
  (siehe [`compliance/`](compliance/) und ADR-0004/0006).
- **Image-Pinning:** Für reproduzierbare, unveränderliche Deployments die Images
  zusätzlich per Digest pinnen (ADR-0003).
- **Datensicherung** regelmäßig testen (Restore-Probe).

> Rechtlicher Hinweis: Diese Anleitung ersetzt keine Rechts-/IT-Sicherheitsberatung.

---

## 12. Schnelltest ohne Domain (per IP, HTTP)

Für einen schnellen Funktionstest ohne öffentliche Domain/DNS gibt es einen
eigenständigen Stack, der **per IP über HTTP (Port 80)** erreichbar ist. Alle
Dienste liegen dabei auf **einem Ursprung** (same-origin): Web unter `/`, API
unter `/api`, Keycloak unter `/idp`.

> **Grenzen des IP-Tests:** Kein TLS (unverschlüsselt), daher funktioniert
> **Passkey/WebAuthn nicht** (setzt einen sicheren Kontext voraus). Nur für
> lokale Tests im vertrauenswürdigen Netz. Für Produktion die domainbasierte
> Variante mit HTTPS aus Abschnitt 4–8 verwenden.

**a) IP eintragen** – in der `.env` die erreichbare IP (oder LAN-Hostname) ohne
Schema setzen:

```bash
cd /opt/zeitvault/infra/docker
# eigene IP herausfinden (Beispiel):
hostname -I | awk '{print $1}'
# in die .env aufnehmen (Beispielwert ersetzen):
grep -v '^APP_IP=' .env > .env.tmp && echo "APP_IP=192.168.1.50" >> .env.tmp && mv .env.tmp .env
```

**b) Realm aus dem IP-Template erzeugen** (HTTP-Origins, `sslRequired: none`):

```bash
set -a && . ./.env && set +a
sed "s#\${APP_IP}#${APP_IP}#g" \
  keycloak-prod/zeitvault-realm.ip.template.json \
  > keycloak-prod/import/zeitvault-realm.json
python3 -c "import json;json.load(open('keycloak-prod/import/zeitvault-realm.json'));print('Realm OK')"
```

**c) Domain-Stack stoppen** (falls er läuft – beide belegen Port 80):

```bash
docker compose -f docker-compose.prod.yml down
```

**d) IP-Stack bauen und starten** (getrennter Projektname `zeitvault-ip`, eigene
Volumes):

```bash
docker compose -f docker-compose.ip.yml up -d --build
docker compose -f docker-compose.ip.yml ps
docker compose -f docker-compose.ip.yml logs migrate-api migrate-ledger
```

Danach erreichbar (IP durch euren Wert ersetzen):
- **App:** `http://192.168.1.50/`
- **API:** `http://192.168.1.50/api/info`
- **Keycloak-Admin:** `http://192.168.1.50/idp/` (Login `KEYCLOAK_ADMIN` /
  `KEYCLOAK_ADMIN_PASSWORD`)

Die Ersteinrichtung (Admin-Nutzer, Mitarbeitende verknüpfen) läuft wie in
Abschnitt 7 – nur mit `http://<IP>` statt `https://APP_DOMAIN` und
`http://<IP>/idp` als Keycloak-Basis. Zum Zurückwechseln auf HTTPS/Domain:
`docker compose -f docker-compose.ip.yml down` und den Domain-Stack aus
Abschnitt 6 starten.

> Hinweis: Wird die IP später geändert, muss das Web-Image neu gebaut werden
> (`--build`), da die Keycloak-Authority zur Build-Zeit eingebacken wird; der
> Realm ist erneut aus dem Template zu erzeugen.

---

## 13. Zugriff über Cloudflare Tunnel (echtes HTTPS, ohne offene Ports)

Empfohlen, wenn keine Ports am Host geöffnet werden sollen: Cloudflare terminiert
echtes, öffentlich vertrauenswürdiges HTTPS an der Edge, der Tunnel baut die
Verbindung **nach außen** auf. Vorteile gegenüber dem IP-Test: **sicherer Kontext**
im Browser → **echter OIDC-Login und Passkey/WebAuthn funktionieren**. Der Origin
bleibt HTTP (Caddy `:80`), alles liegt same-origin unter einem Hostnamen
(`/` Web, `/api` API, `/idp` Keycloak).

**a) Öffentlichen Hostnamen festlegen.** In der `.env` `APP_DOMAIN` auf den
Tunnel-Hostnamen setzen (z. B. `zeitvault.example.com`), dazu `POSTGRES_PASSWORD`
und `KEYCLOAK_ADMIN_PASSWORD` (wie Abschnitt 4).

**b) Realm aus dem Produktions-Template erzeugen** (HTTPS-Origins, Passkey):

```bash
cd /opt/zeitvault/infra/docker
set -a && . ./.env && set +a
sed "s#\${APP_DOMAIN}#${APP_DOMAIN}#g" \
  keycloak-prod/zeitvault-realm.template.json \
  > keycloak-prod/import/zeitvault-realm.json
python3 -c "import json;json.load(open('keycloak-prod/import/zeitvault-realm.json'));print('Realm OK')"
```

**c) Cloudflare-Tunnel einrichten** (im Cloudflare-Zero-Trust-Dashboard):
`Networks → Tunnels → Create tunnel` → Token kopieren → als `TUNNEL_TOKEN` in die
`.env`. Beim Tunnel einen **Public Hostname** anlegen: `APP_DOMAIN` → Service
`http://caddy:80` (der mitgelieferte `cloudflared`-Container erreicht Caddy im
Compose-Netz). Betreibt ihr `cloudflared` selbst auf dem Host, stattdessen Service
`http://localhost:80` und Port 80 des `caddy`-Dienstes freigeben.

**d) Stack starten** (mit mitgeliefertem cloudflared über Profil `tunnel`):

```bash
docker compose --profile tunnel -f docker-compose.tunnel.yml up -d --build
docker compose -f docker-compose.tunnel.yml ps
docker compose -f docker-compose.tunnel.yml logs migrate-api migrate-ledger cloudflared
```

Danach über `https://APP_DOMAIN` erreichbar – echtes Zertifikat, grünes Schloss.
Login und (dank echtem Hostnamen) auch Passkey funktionieren. Ersteinrichtung wie
Abschnitt 7.

> Das Web-Image ist hier **hostunabhängig** gebaut (die Authority wird zur Laufzeit
> aus dem Ursprung abgeleitet). Ein Wechsel des Tunnel-Hostnamens erfordert daher
> nur `APP_DOMAIN` anzupassen, den Realm neu zu erzeugen und die Container neu zu
> starten – **kein** Neubau des Web-Images.
