#requires -version 5.1
# MOAG-Deploy auf VDR (192.168.200.71) mit Build + Transfer + Deploy.
#
# Standard-Flow (baut Image, uebertraegt auf VDR, deployt):
#   pwsh -File scripts/deploy-vdr.ps1
#
# Version wird automatisch aus backend/pyproject.toml gelesen.
# ImageTag-Default: moag:<version> — ueberschreibbar via -ImageTag.
#
# Aufruf-Varianten:
#
#   Variante A — Standard-Deploy (Build + Transfer + Deploy):
#     pwsh -File scripts/deploy-vdr.ps1
#
#   Variante B — Werte als Parameter:
#     pwsh -File scripts/deploy-vdr.ps1 `
#       -OberonToken "mein-token" `
#       -NasDomPassword "mein-pw"
#
#   Variante C — Nur Smoke (kein Re-Deploy, nur Pruefen ob Container laeuft):
#     pwsh -File scripts/deploy-vdr.ps1 -SmokeOnly
#
#   Variante D — Build ueberspringen (Image ist bereits lokal vorhanden):
#     pwsh -File scripts/deploy-vdr.ps1 -SkipBuild
#
#   Variante E — Transfer ueberspringen (Image schon auf VDR, nur neu starten):
#     pwsh -File scripts/deploy-vdr.ps1 -SkipBuild -SkipTransfer
#
#   Variante F — Nur bauen, kein Transfer, kein Deploy (CI-Check):
#     pwsh -File scripts/deploy-vdr.ps1 -BuildOnly
#
# Voraussetzungen:
#   - Docker lokal verfuegbar (fuer Build)
#   - SSH-Key-Auth auf VDR konfiguriert (siehe ~/.ssh/config, Alias "vdr")
#   - Docker auf VDR verfuegbar (als vdr-Nutzer)
#
# Secrets-Template: .env.example
# Gitignored:       secrets.local.env, *.secrets.env

[CmdletBinding()]
param(
    # Oberon
    [string]$OberonBaseUrl    = "",
    [string]$OberonToken      = "",

    # OCRexpert
    [string]$OcrexpertBaseUrl = "",

    # NasDominator
    [string]$NasDomBaseUrl    = "",
    [string]$NasDomUser       = "",
    [string]$NasDomPassword   = "",

    # OctoBoss
    [string]$OctobossHubs     = "",

    # Custos
    [string]$CustosBaseUrl    = "",

    # Container-Konfiguration
    # ImageTag-Default wird aus backend/pyproject.toml gelesen (moag:<version>).
    # Kann manuell ueberschrieben werden: -ImageTag "moag:custom"
    [string]$ImageTag         = "",
    [string]$ContainerName    = "moag",
    [int]$HostPort            = 17900,
    [string]$VdrHost          = "vdr",

    # Volume-Konfiguration (Upload-Hub Persistenz)
    [string]$VolumeHostPath   = "/home/underdog/moag-data",
    [string]$VolumeMountPath  = "/data/moag",
    # Container-User-ID — muss zum Owner des Volume-Verzeichnisses passen
    # (sonst Permission-Denied beim SQLite-Init). Default: vdr-User 'underdog' = 1002
    [int]$ContainerUid        = 1002,
    [int]$ContainerGid        = 1002,

    # Wenn gesetzt: kein Re-Deploy, nur Smoke-Check (ueberspringt Build + Transfer + Deploy)
    [switch]$SmokeOnly,

    # Wenn gesetzt: Build ueberspringen (Image muss lokal schon vorhanden sein)
    [switch]$SkipBuild,

    # Wenn gesetzt: Transfer ueberspringen (Image muss auf VDR schon vorhanden sein)
    [switch]$SkipTransfer,

    # Wenn gesetzt: nur bauen, kein Transfer, kein Deploy (CI-naher Pruef-Lauf)
    [switch]$BuildOnly
)

$ErrorActionPreference = "Stop"
$RepoRoot    = Join-Path $PSScriptRoot ".."
$SecretsFile = Join-Path $RepoRoot "secrets.local.env"

# ---- Hilfsfunktion: Version aus pyproject.toml lesen -----------------------
# Parst die erste Zeile der Form 'version = "x.y.z"' in backend/pyproject.toml.
# Gibt den reinen Versions-String zurueck (z.B. "0.2.2").
function Get-PyprojectVersion {
    [OutputType([string])]
    param(
        [string]$PyprojectPath = (Join-Path $RepoRoot "backend\pyproject.toml")
    )
    if (-not (Test-Path $PyprojectPath)) {
        throw "[VERSION] backend/pyproject.toml nicht gefunden: $PyprojectPath"
    }
    $line = Get-Content $PyprojectPath | Where-Object { $_ -match '^\s*version\s*=\s*"[^"]+"' } | Select-Object -First 1
    if (-not $line) {
        throw "[VERSION] Keine version-Zeile in $PyprojectPath gefunden"
    }
    if ($line -match '"([^"]+)"') {
        return $Matches[1]
    }
    throw "[VERSION] Konnte Versions-String nicht aus Zeile parsen: $line"
}

# ---- 0. Version + ImageTag bestimmen ---------------------------------------
if (-not $ImageTag) {
    $version = Get-PyprojectVersion
    $ImageTag = "moag:$version"
    Write-Host "[VERSION] Version aus pyproject.toml: $version -> ImageTag: $ImageTag"
} else {
    Write-Host "[VERSION] ImageTag per Parameter vorgegeben: $ImageTag"
}

# ---- 1. Build-Stufe --------------------------------------------------------
if (-not $SmokeOnly) {
    if ($SkipBuild) {
        Write-Host "[BUILD] Uebersprungen (-SkipBuild gesetzt)"
    } else {
        Write-Host "[BUILD] Baue Docker-Image $ImageTag ..."
        Write-Host "[BUILD] Build-Context: $RepoRoot"
        $dockerfilePath = Join-Path $RepoRoot "docker\Dockerfile"
        # Wechsel in Repo-Root fuer korrekten Build-Context
        Push-Location $RepoRoot
        try {
            docker build -t $ImageTag -f $dockerfilePath .
            if ($LASTEXITCODE -ne 0) {
                throw "[BUILD] docker build fehlgeschlagen (Exit-Code $LASTEXITCODE) - Abbruch"
            }
            Write-Host "[BUILD] Image $ImageTag erfolgreich gebaut"
        } finally {
            Pop-Location
        }
    }
}

# ---- BuildOnly-Ausgang: kein Transfer, kein Deploy -------------------------
if ($BuildOnly) {
    Write-Host ""
    Write-Host "========================================"
    Write-Host "MOAG-Build ($ImageTag): fertig (-BuildOnly)"
    Write-Host "Transfer + Deploy wurden uebersprungen."
    Write-Host "========================================"
    exit 0
}

# ---- 2. Transfer-Stufe -----------------------------------------------------
if (-not $SmokeOnly) {
    if ($SkipTransfer) {
        Write-Host "[TRANSFER] Uebersprungen (-SkipTransfer gesetzt)"
    } else {
        # Idempotenz-Check: Image auf VDR bereits vorhanden?
        Write-Host "[TRANSFER] Pruefe ob $ImageTag auf VDR schon vorhanden ..."
        $remoteImageId = ssh $VdrHost "docker images $ImageTag --quiet 2>/dev/null"
        if ($remoteImageId -and $remoteImageId.Trim().Length -gt 0) {
            Write-Host "[TRANSFER] Image $ImageTag ist auf VDR bereits vorhanden (ID: $($remoteImageId.Trim())) - Transfer uebersprungen"
        } else {
            Write-Host "[TRANSFER] Uebertrage $ImageTag per Stream-Pipe auf VDR ..."
            # docker save streamt das tar direkt via SSH in docker load.
            # PowerShell leitet den Binaer-Stream korrekt via | weiter wenn beide
            # Programme ueber Prozess-Pipes verbunden sind.
            # Fallback-Pfad (auskommentiert): Tarball + scp + remote docker load
            # falls Stream-Probleme auftreten.
            #
            # Primaer-Pfad: Stream-Pipe
            $pipeExpr = "docker save $ImageTag | ssh $VdrHost `"docker load`""
            Write-Host "[TRANSFER] Ausfuehren: $pipeExpr"
            # In PowerShell muss das Pipen ueber cmd /c oder Invoke-Expression
            # laufen, damit der Binaer-Stream korrekt geleitet wird.
            cmd /c "docker save $ImageTag | ssh $VdrHost `"docker load`""
            if ($LASTEXITCODE -ne 0) {
                # Fallback: Tarball-Pfad
                Write-Warning "[TRANSFER] Stream-Pipe fehlgeschlagen (Exit $LASTEXITCODE), versuche Tarball-Fallback ..."
                $tmpTar = Join-Path $env:TEMP "moag-transfer.tar"
                try {
                    Write-Host "[TRANSFER] Speichere Image als Tarball: $tmpTar"
                    docker save -o $tmpTar $ImageTag
                    if ($LASTEXITCODE -ne 0) { throw "[TRANSFER] docker save -o fehlgeschlagen" }
                    Write-Host "[TRANSFER] Uebertrage Tarball per scp ..."
                    scp $tmpTar "${VdrHost}:/tmp/moag-transfer.tar"
                    Write-Host "[TRANSFER] Lade Image auf VDR ..."
                    ssh $VdrHost "docker load < /tmp/moag-transfer.tar && rm /tmp/moag-transfer.tar"
                    if ($LASTEXITCODE -ne 0) { throw "[TRANSFER] docker load auf VDR fehlgeschlagen" }
                    Write-Host "[TRANSFER] Tarball-Transfer erfolgreich"
                } finally {
                    if (Test-Path $tmpTar) { Remove-Item $tmpTar -Force }
                }
            } else {
                Write-Host "[TRANSFER] Stream-Transfer erfolgreich"
            }
        }
    }
}

# ---- 3. Secrets laden -------------------------------------------------------
if (-not $SmokeOnly) {
    function Load-Secrets {
        if (-not (Test-Path $SecretsFile)) { return }
        Write-Host "[INFO] Lade Secrets aus $(Resolve-Path $SecretsFile)"
        Get-Content $SecretsFile | Where-Object { $_ -match "^\s*[^#]\S+=\S" } | ForEach-Object {
            $parts = $_ -split "=", 2
            $key   = $parts[0].Trim()
            $val   = $parts[1].Trim()
            # Nur setzen wenn der Parameter noch leer ist (Parameter haben Vorrang)
            switch ($key) {
                "MOAG_OBERON_BASE_URL"        { if (-not $script:OberonBaseUrl)    { $script:OberonBaseUrl    = $val } }
                "MOAG_OBERON_TOKEN"           { if (-not $script:OberonToken)      { $script:OberonToken      = $val } }
                "MOAG_OCREXPERT_BASE_URL"     { if (-not $script:OcrexpertBaseUrl) { $script:OcrexpertBaseUrl = $val } }
                "MOAG_NASDOMINATOR_BASE_URL"  { if (-not $script:NasDomBaseUrl)    { $script:NasDomBaseUrl    = $val } }
                "MOAG_NASDOMINATOR_USER"      { if (-not $script:NasDomUser)       { $script:NasDomUser       = $val } }
                "MOAG_NASDOMINATOR_PASSWORD"  { if (-not $script:NasDomPassword)   { $script:NasDomPassword   = $val } }
                "MOAG_OCTOBOSS_HUBS"          { if (-not $script:OctobossHubs)     { $script:OctobossHubs     = $val } }
                "MOAG_CUSTOS_BASE_URL"        { if (-not $script:CustosBaseUrl)    { $script:CustosBaseUrl    = $val } }
            }
        }
    }

    Load-Secrets

    # Fallback-Defaults (nicht-sensitive Werte)
    if (-not $OberonBaseUrl)    { $OberonBaseUrl    = "http://192.168.200.169:17900" }
    if (-not $OcrexpertBaseUrl) { $OcrexpertBaseUrl = "http://192.168.200.71:17810" }
    if (-not $NasDomBaseUrl)    { $NasDomBaseUrl    = "http://192.168.200.169:9090" }
    if (-not $NasDomUser)       { $NasDomUser       = "admin" }
    if (-not $OctobossHubs)     { $OctobossHubs     = "http://192.168.200.71:18765,http://192.168.200.169:8765" }
    if (-not $CustosBaseUrl)    { $CustosBaseUrl    = "http://192.168.200.169:17890" }

    # Pflicht-Checks
    $missing = @()
    if (-not $OberonToken)    { $missing += "MOAG_OBERON_TOKEN" }
    if (-not $NasDomPassword) { $missing += "MOAG_NASDOMINATOR_PASSWORD" }
    if ($missing.Count -gt 0) {
        Write-Error @"
Fehlende Pflicht-Werte: $($missing -join ', ')
Lege secrets.local.env an (gitignored) oder uebergib sie als Parameter.
Template: .env.example
"@
        exit 1
    }
}

# ---- 4. env-Datei lokal zusammenbauen ---------------------------------------
if (-not $SmokeOnly) {
    $envContent = @"
# Generiert von scripts/deploy-vdr.ps1 am $(Get-Date -Format "yyyy-MM-dd HH:mm")
# NICHT ins Repo commiten. Auf VDR unter /etc/moag.env (chmod 600, root).
MOAG_HOST=0.0.0.0
MOAG_PORT=17900
MOAG_PIPELINE_LOG_ENABLED=false
MOAG_OBERON_BASE_URL=$OberonBaseUrl
MOAG_OBERON_TOKEN=$OberonToken
MOAG_OCREXPERT_BASE_URL=$OcrexpertBaseUrl
MOAG_NASDOMINATOR_BASE_URL=$NasDomBaseUrl
MOAG_NASDOMINATOR_USER=$NasDomUser
MOAG_NASDOMINATOR_PASSWORD=$NasDomPassword
MOAG_OCTOBOSS_HUBS=$OctobossHubs
MOAG_CUSTOS_BASE_URL=$CustosBaseUrl
MOAG_DB_CACHE_PATH=$VolumeMountPath/db.json
MOAG_UPLOAD_DIR=$VolumeMountPath/uploads
"@

    # Lokal als temporaere Datei ablegen (nie im Repo, nur fuer Transfer)
    $localTmp = Join-Path $env:TEMP "moag-deploy.env"
    $envContent | Set-Content -Path $localTmp -Encoding UTF8
    Write-Host "[INFO] env-Datei lokal gebaut: $localTmp"

    # ---- 5. env-Transfer nach VDR -------------------------------------------
    Write-Host "[DEPLOY] Uebertrage env-Datei nach VDR ..."
    scp $localTmp "${VdrHost}:/tmp/moag-deploy.env"

    Write-Host "[DEPLOY] Installiere /etc/moag.env auf VDR (root, chmod 600) ..."
    ssh $VdrHost "sudo mv /tmp/moag-deploy.env /etc/moag.env && sudo chmod 600 /etc/moag.env && sudo chown root:root /etc/moag.env && echo 'OK: /etc/moag.env installiert'"

    # Lokal aufraumen
    Remove-Item $localTmp -Force
    Write-Host "[INFO] Lokale temp-Datei geloescht"

    # ---- 6. Volume-Verzeichnis auf VDR vorbereiten --------------------------
    # Stellt sicher dass {VolumeHostPath} und uploads/ existieren und vom
    # Container-User (uid/gid {ContainerUid}/{ContainerGid}) schreibbar sind.
    # Ohne diesen Schritt scheitert SQLite-Init mit "unable to open database file".
    Write-Host "[DEPLOY] Bereite Volume $VolumeHostPath vor (uid=$ContainerUid gid=$ContainerGid) ..."
    $volumeSetup = "mkdir -p $VolumeHostPath/uploads && chmod -R u+rwX,g+rwX,o+rX $VolumeHostPath && echo 'OK: Volume bereit'"
    ssh $VdrHost $volumeSetup

    # ---- 7. Container stoppen + entfernen + neu starten ---------------------
    Write-Host "[DEPLOY] Stoppe und entferne alten Container '$ContainerName' ..."
    ssh $VdrHost "docker stop $ContainerName 2>/dev/null || true; docker rm $ContainerName 2>/dev/null || true; echo 'OK: Container gestoppt/entfernt'"

    Write-Host "[DEPLOY] Starte $ImageTag als '$ContainerName' mit --env-file + Volume + --user ..."
    $dockerCmd = "docker run -d --name $ContainerName --restart unless-stopped " +
                 "-p ${HostPort}:17900 " +
                 "--user ${ContainerUid}:${ContainerGid} " +
                 "-v ${VolumeHostPath}:${VolumeMountPath} " +
                 "--env-file /etc/moag.env " +
                 "$ImageTag"
    ssh $VdrHost $dockerCmd
    Write-Host "[DEPLOY] Container gestartet"
}

# ---- 8. Smoke-Check ----------------------------------------------------------
$BaseUrl = "http://192.168.200.71:$HostPort"
Write-Host ""
Write-Host "[SMOKE] Warte 5s auf Container-Start ..."
Start-Sleep -Seconds 5

Write-Host "[SMOKE] Pruefe $BaseUrl/api/health ..."
try {
    $h = Invoke-RestMethod -Uri "$BaseUrl/api/health" -TimeoutSec 15
    $ok = ($h.status -eq "ok") -and ($null -ne $h.version)
    if ($ok) {
        Write-Host "[PASS] api-health — version=$($h.version) build=$($h.build)"
    } else {
        Write-Host "[FAIL] api-health — Antwort: $($h | ConvertTo-Json -Compress)"
    }
} catch {
    $ok = $false
    Write-Host "[FAIL] api-health — Exception: $($_.Exception.Message)"
}

if ($ok) {
    Write-Host ""
    Write-Host "========================================"
    Write-Host "MOAG-Deploy ($BaseUrl): PASS"
    Write-Host "Fuer vollstaendigen Smoke-Test:"
    Write-Host "  pwsh -File scripts/smoke-vdr.ps1 -BaseUrl $BaseUrl"
    Write-Host "========================================"
    exit 0
} else {
    Write-Host ""
    Write-Host "========================================"
    Write-Host "MOAG-Deploy ($BaseUrl): FAIL — Smoke-Check nicht bestanden"
    Write-Host "Logs pruefen: ssh vdr docker logs $ContainerName"
    Write-Host "========================================"
    exit 1
}
