# ZeitVault - Ein-Befehl-Installer fuer Windows (Docker Desktop / WSL2).
#
# PowerShell-Pendant zu ./install.sh mit identischer Mechanik:
#   - erzeugt URL-sichere Zufalls-Secrets (Hex) automatisch,
#   - neutralisiert Prozess-Umgebungsvariablen, die die .env ueberschreiben wuerden,
#   - waehlt den Betriebsmodus (Cloudflare Tunnel / eigene Domain / Nur-IP-Test),
#   - erzeugt den passenden Keycloak-Realm,
#   - startet den richtigen Compose-Stack.
#
# Nutzung (PowerShell im Repo-Root):
#   powershell -ExecutionPolicy Bypass -File .\install.ps1            # interaktiv
#   $env:ZV_MODE='tunnel'; $env:ZV_APP_DOMAIN='zeit.example.com'; .\install.ps1
#
# Modi (ZV_MODE): tunnel | domain | ip
# Voraussetzungen: Windows 10/11, Docker Desktop (WSL2-Backend) - siehe
# docs/DEPLOY-WINDOWS.md.

$ErrorActionPreference = 'Stop'

# --- Pfade -------------------------------------------------------------------
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$DockerDir = Join-Path $ScriptDir 'infra\docker'
$EnvFile = Join-Path $DockerDir '.env'
$ExampleFile = Join-Path $DockerDir '.env.prod.example'

# --- Ausgabe-Helfer ----------------------------------------------------------
function Write-Info([string]$msg) { Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Ok([string]$msg) { Write-Host "[ok] $msg" -ForegroundColor Green }
function Write-Warn2([string]$msg) { Write-Host "[warnung] $msg" -ForegroundColor Yellow }
function Fail([string]$msg) { Write-Host "[fehler] $msg" -ForegroundColor Red; exit 1 }

# ask -Name ZV_APP_DOMAIN -Question '...' [-Default '...']
# Liefert: vorhandene Env-Variable ZV_* > interaktive Eingabe > Default.
function Ask([string]$Name, [string]$Question, [string]$Default = '') {
  $existing = [Environment]::GetEnvironmentVariable($Name)
  if ($existing) { return $existing }
  $prompt = $Question
  if ($Default) { $prompt = "$Question [$Default]" }
  $answer = Read-Host $prompt
  if ($answer) { return $answer }
  return $Default
}

# --- .env-Helfer (idempotent, LF-Zeilenenden, UTF-8 ohne BOM) ------------------
function Set-EnvValue([string]$Key, [string]$Value) {
  $lines = @()
  if (Test-Path $EnvFile) {
    $lines = @(Get-Content $EnvFile | Where-Object { $_ -notmatch "^$([regex]::Escape($Key))=" })
  }
  $lines += "$Key=$Value"
  [System.IO.File]::WriteAllText($EnvFile, (($lines -join "`n") + "`n"))
}
function Get-EnvValue([string]$Key) {
  if (-not (Test-Path $EnvFile)) { return '' }
  foreach ($line in Get-Content $EnvFile) {
    if ($line -match "^$([regex]::Escape($Key))=(.*)$") { return $Matches[1] }
  }
  return ''
}
function New-HexSecret {
  $bytes = New-Object byte[] 24
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return (($bytes | ForEach-Object { $_.ToString('x2') }) -join '')
}

# --- Vorbedingungen ----------------------------------------------------------
Write-Info 'ZeitVault-Installer (Windows / Docker Desktop)'
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Fail 'Docker ist nicht installiert. Docker Desktop (WSL2-Backend) installieren: https://docs.docker.com/desktop/setup/install/windows-install/'
}
& docker compose version *> $null
if ($LASTEXITCODE -ne 0) { Fail "Docker Compose fehlt ('docker compose version' schlaegt fehl). Docker Desktop aktualisieren." }
& docker info *> $null
if ($LASTEXITCODE -ne 0) { Fail 'Docker-Daemon nicht erreichbar. Ist Docker Desktop gestartet (Wal-Symbol im Infobereich)?' }
if (-not (Test-Path $DockerDir)) { Fail "Verzeichnis $DockerDir nicht gefunden - Installer aus dem Repo-Root starten." }

# WICHTIG: Prozess-Umgebungsvariablen wuerden die .env ueberschreiben -> entfernen.
foreach ($k in 'POSTGRES_PASSWORD', 'KEYCLOAK_ADMIN_PASSWORD', 'TUNNEL_TOKEN') {
  Remove-Item "Env:$k" -ErrorAction SilentlyContinue
}

Set-Location $DockerDir

# --- .env anlegen ------------------------------------------------------------
if (-not (Test-Path $EnvFile)) {
  if (-not (Test-Path $ExampleFile)) { Fail "Vorlage $ExampleFile fehlt." }
  Write-Info 'Lege .env aus Vorlage an.'
  Copy-Item $ExampleFile $EnvFile
}

# --- Secrets sicherstellen (nur erzeugen, wenn Platzhalter/leer) ---------------
$pw = Get-EnvValue 'POSTGRES_PASSWORD'
if (-not $pw -or $pw.StartsWith('BITTE_AENDERN')) {
  Set-EnvValue 'POSTGRES_PASSWORD' (New-HexSecret)
  Write-Ok 'POSTGRES_PASSWORD erzeugt (Hex).'
} else { Write-Ok 'POSTGRES_PASSWORD vorhanden.' }
$kp = Get-EnvValue 'KEYCLOAK_ADMIN_PASSWORD'
if (-not $kp -or $kp.StartsWith('BITTE_AENDERN')) {
  Set-EnvValue 'KEYCLOAK_ADMIN_PASSWORD' (New-HexSecret)
  Write-Ok 'KEYCLOAK_ADMIN_PASSWORD erzeugt.'
} else { Write-Ok 'KEYCLOAK_ADMIN_PASSWORD vorhanden.' }
if (-not (Get-EnvValue 'KEYCLOAK_ADMIN')) { Set-EnvValue 'KEYCLOAK_ADMIN' 'admin' }

# --- Modus waehlen -----------------------------------------------------------
$mode = [Environment]::GetEnvironmentVariable('ZV_MODE')
if (-not $mode) {
  Write-Host ''
  Write-Host 'Betriebsmodus waehlen:' -ForegroundColor White
  Write-Host '  1) tunnel  - Cloudflare Tunnel (echtes HTTPS, keine offenen Ports)   [empfohlen]'
  Write-Host '  2) domain  - Eigene Domain + Let''s Encrypt (Ports 80/443 oeffentlich)'
  Write-Host '  3) ip      - Nur-IP-Schnelltest ueber HTTP (kein Login/Passkey, nur LAN)'
  $choice = Ask 'ZV_MODE_CHOICE' 'Auswahl 1-3' '1'
  switch ($choice) {
    '1' { $mode = 'tunnel' }
    '2' { $mode = 'domain' }
    '3' { $mode = 'ip' }
    default { Fail 'Ungueltige Auswahl.' }
  }
}
Write-Info "Modus: $mode"

$composeFile = ''
$profileArgs = @()
$realmTemplate = ''
$realmVar = ''
$realmVal = ''
$url = ''

switch ($mode) {
  'tunnel' {
    $composeFile = 'docker-compose.tunnel.yml'
    $appDomain = Ask 'ZV_APP_DOMAIN' 'Oeffentlicher Tunnel-Hostname (z. B. zeit.example.com)'
    if (-not $appDomain) { Fail 'Hostname erforderlich.' }
    Set-EnvValue 'APP_DOMAIN' $appDomain
    $tunnelToken = Ask 'ZV_TUNNEL_TOKEN' 'Cloudflare TUNNEL_TOKEN (leer lassen, wenn cloudflared separat laeuft)' ''
    if ($tunnelToken) {
      Set-EnvValue 'TUNNEL_TOKEN' $tunnelToken
      $profileArgs = @('--profile', 'tunnel')
    }
    $realmTemplate = 'keycloak-prod\zeitvault-realm.template.json'
    $realmVar = 'APP_DOMAIN'; $realmVal = $appDomain
    $url = "https://$appDomain"
  }
  'domain' {
    $composeFile = 'docker-compose.prod.yml'
    $appDomain = Ask 'ZV_APP_DOMAIN' 'App-Domain (z. B. zeit.example.com)'
    $authDomain = Ask 'ZV_AUTH_DOMAIN' 'Auth-Domain (z. B. auth.example.com)'
    $acmeEmail = Ask 'ZV_ACME_EMAIL' 'E-Mail fuer Let''s Encrypt'
    if (-not $appDomain -or -not $authDomain -or -not $acmeEmail) { Fail 'APP_DOMAIN, AUTH_DOMAIN und ACME_EMAIL erforderlich.' }
    Set-EnvValue 'APP_DOMAIN' $appDomain
    Set-EnvValue 'AUTH_DOMAIN' $authDomain
    Set-EnvValue 'ACME_EMAIL' $acmeEmail
    $realmTemplate = 'keycloak-prod\zeitvault-realm.template.json'
    $realmVar = 'APP_DOMAIN'; $realmVal = $appDomain
    $url = "https://$appDomain"
  }
  'ip' {
    $composeFile = 'docker-compose.ip.yml'
    $detected = ''
    try {
      $detected = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
        Where-Object { $_.IPAddress -ne '127.0.0.1' -and $_.IPAddress -notlike '169.254.*' } |
        Select-Object -First 1).IPAddress
    } catch { $detected = '' }
    $appIp = Ask 'ZV_APP_IP' 'IP/Hostname dieses Hosts (ohne Schema)' $detected
    if (-not $appIp) { Fail 'APP_IP erforderlich.' }
    Set-EnvValue 'APP_IP' $appIp
    $realmTemplate = 'keycloak-prod\zeitvault-realm.ip.template.json'
    $realmVar = 'APP_IP'; $realmVal = $appIp
    $url = "http://$appIp"
  }
  default { Fail "Unbekannter Modus '$mode' (erlaubt: tunnel|domain|ip)." }
}

# --- Keycloak-Realm erzeugen -------------------------------------------------
Write-Info "Erzeuge Keycloak-Realm ($realmVar=$realmVal)."
$importDir = 'keycloak-prod\import'
if (-not (Test-Path $importDir)) { New-Item -ItemType Directory -Path $importDir | Out-Null }
if (-not (Test-Path $realmTemplate)) { Fail "Realm-Vorlage $realmTemplate fehlt." }
$realmJson = (Get-Content $realmTemplate -Raw).Replace('${' + $realmVar + '}', $realmVal)
$realmOut = Join-Path $importDir 'zeitvault-realm.json'
[System.IO.File]::WriteAllText($realmOut, $realmJson)
try { $null = Get-Content $realmOut -Raw | ConvertFrom-Json; Write-Ok 'Realm erzeugt.' }
catch { Fail 'Realm-JSON ungueltig - Template pruefen.' }

# --- Stack starten -----------------------------------------------------------
Write-Info 'Baue und starte den Stack (kann beim ersten Mal einige Minuten dauern) ...'
$composeArgs = @('compose', '--env-file', $EnvFile) + $profileArgs + @('-f', $composeFile, 'up', '-d', '--build')
& docker @composeArgs
if ($LASTEXITCODE -ne 0) { Fail 'docker compose up ist fehlgeschlagen - Ausgabe oben pruefen.' }

Write-Host ''
Write-Ok 'Fertig. Stack laeuft.'
Write-Info "Status:  docker compose -f infra\docker\$composeFile ps"
Write-Info "Logs:    docker compose -f infra\docker\$composeFile logs -f api keycloak"
Write-Host ''
Write-Host "Aufrufen: $url" -ForegroundColor White
Write-Host "Keycloak-Admin: Benutzer '$(Get-EnvValue 'KEYCLOAK_ADMIN')', Passwort steht in infra\docker\.env (KEYCLOAK_ADMIN_PASSWORD)" -ForegroundColor White
Write-Host ''
Write-Info 'Naechster Schritt: Ersteinrichtung (Admin + Mitarbeitende) - siehe docs/DEPLOY-PROXMOX.md Abschnitt 7.'
if ($mode -eq 'ip') {
  Write-Warn2 'Nur-IP-Modus: echter Keycloak-Login/Passkey funktioniert hier NICHT (kein HTTPS). Nur fuer LAN-Tests.'
}
