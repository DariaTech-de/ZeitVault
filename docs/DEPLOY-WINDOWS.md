# ZeitVault auf Windows – Installation mit Docker Desktop (WSL2)

Dieses Runbook installiert die ZeitVault-Management-Software auf einem
**Windows-Rechner/-Server** über **Docker Desktop (WSL2-Backend)**. Es laufen
exakt dieselben Container wie unter Linux/Proxmox – eine Codebasis, identisches
Verhalten (ADR-0010). Die Terminal-/Kiosk-Nutzung am Windows-Gerät erfolgt über
den Browser (`/kiosk`); eine installierbare Kiosk-App ist separat geplant.

---

## 0. Voraussetzungen

- **Windows 10 (21H2+) oder Windows 11**, 64-bit, Virtualisierung im BIOS aktiv.
- **8 GB RAM empfohlen** (4 GB Minimum; Keycloak/JVM ist der größte Verbraucher).
- Administratorrechte für die Installation von Docker Desktop.
- Ein **GitHub-Token** (Fine-grained PAT, nur *Contents: Read-only* auf
  `DariaTech-de/ZeitVault`) zum Klonen des privaten Repositories.

## 1. Docker Desktop und Git installieren

1. **Docker Desktop** installieren (WSL2-Backend ist Standard):
   <https://docs.docker.com/desktop/setup/install/windows-install/>
   Nach der Installation Docker Desktop **starten** (Wal-Symbol im Infobereich).
2. **Git für Windows**: <https://git-scm.com/download/win>
   (alternativ `winget install Git.Git`).

Prüfen (PowerShell):

```powershell
docker compose version
docker info
```

Beide Befehle müssen ohne Fehler durchlaufen.

## 2. Repository klonen

```powershell
cd C:\
git clone https://<GITHUB_TOKEN>@github.com/DariaTech-de/ZeitVault.git zeitvault
cd C:\zeitvault
```

> Das Token nach der Einrichtung rotieren/widerrufen; für Updates besser einen
> Credential Manager oder ein frisches Read-only-Token verwenden.

## 3. Installer ausführen

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

Der Installer

- erzeugt **URL-sichere Zufalls-Secrets** (Hex) in `infra\docker\.env`,
- entfernt störende Prozess-Umgebungsvariablen (sie hätten Vorrang vor der `.env`),
- fragt den **Betriebsmodus** ab und erzeugt den passenden Keycloak-Realm,
- baut und startet den Compose-Stack.

**Modi:**

| Modus | Wann | Zugriff |
|---|---|---|
| `tunnel` (empfohlen) | Kein öffentlicher Port möglich/gewünscht | `https://<Tunnel-Hostname>` – echtes HTTPS über Cloudflare Tunnel, Login + Passkey funktionieren |
| `domain` | Eigene Domain, Ports 80/443 von außen erreichbar | `https://<APP_DOMAIN>` – Let's Encrypt |
| `ip` | Schneller LAN-Test | `http://<IP>` – ohne HTTPS, **kein** echter Login/Passkey |

Nicht-interaktiv (Beispiel Tunnel):

```powershell
$env:ZV_MODE = 'tunnel'
$env:ZV_APP_DOMAIN = 'zeit.example.com'
$env:ZV_TUNNEL_TOKEN = '<token-aus-cloudflare>'
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

> Hinweis für `domain` auf Windows: eingehende Ports 80/443 in der
> **Windows-Firewall** freigeben und im Router auf diesen Rechner weiterleiten.
> Hinter Heim-/Büro-Routern ist der `tunnel`-Modus fast immer der einfachere Weg.

## 4. Ersteinrichtung

Identisch zu Linux: ersten Admin in Keycloak anlegen, Rollen zuweisen,
Mitarbeitende verknüpfen – siehe
[`DEPLOY-PROXMOX.md`](DEPLOY-PROXMOX.md) **Abschnitt 7** (nur die Basis-URL des
gewählten Modus einsetzen).

## 5. Betrieb

**Status/Logs** (im Repo-Root; `<stack>.yml` = die im Installer gewählte Datei):

```powershell
docker compose -f infra\docker\docker-compose.tunnel.yml ps
docker compose -f infra\docker\docker-compose.tunnel.yml logs -f api keycloak
```

**Update auf neue Version:**

```powershell
cd C:\zeitvault
git pull
powershell -ExecutionPolicy Bypass -File .\install.ps1   # baut neu, Migrationen laufen automatisch
```

**Autostart:** In Docker Desktop *Settings → General → Start Docker Desktop when
you sign in* aktivieren; die Container starten dank `restart: unless-stopped`
selbstständig mit.

**Datensicherung:** Das PostgreSQL-Volume (`zeitvault-*_pgdata`) regelmäßig
sichern, z. B.:

```powershell
docker compose -f infra\docker\docker-compose.tunnel.yml exec postgres pg_dumpall -U zeitvault > backup.sql
```

---

> Rechtlicher Hinweis: Diese Anleitung ersetzt keine Rechts-/IT-Sicherheitsberatung.
