# build-state.ps1 — MOAG Sichtbarkeits-Skript
#
# Zweck: Vor jedem "Aenderung ist drin"-Statement pruefen ob HMR/uvicorn
#        die letzte Aenderung aufgenommen hat.
#
# Aufruf:
#   pwsh scripts/build-state.ps1
#   pwsh scripts/build-state.ps1 -FrontendPath C:\code\moag\frontend\src -BackendPath C:\code\moag\backend\moag
#
# Verdikt-Zeile (letzte Ausgabe, maschinell konsumierbar):
#   VERDIKT: OK
#   VERDIKT: HMR-Reload reicht (Frontend-Datei geaendert, Vite laeuft)
#   VERDIKT: uvicorn-Reload pflicht (Backend-Datei geaendert)
#   VERDIKT: Hard-Restart (HMR haengt oder Vite nicht erreichbar)
#   VERDIKT: Dev-Server nicht aktiv
#
# ASCII-only (keine UTF-8-Sonderzeichen, kein BOM)

param(
    [string]$FrontendPath = "C:\code\moag\frontend\src",
    [string]$BackendPath  = "C:\code\moag\backend\moag"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------
# Hilfsfunktion: Prozess-Startzeit ermitteln
# ---------------------------------------------------------------
function Get-ProcStart {
    param([string]$NamePattern, [string]$ArgsPattern)
    $procs = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Name -like $NamePattern }
    foreach ($p in $procs) {
        try {
            $cmdLine = (Get-CimInstance Win32_Process -Filter "ProcessId = $($p.Id)").CommandLine
            if ($cmdLine -like "*$ArgsPattern*") {
                return $p.StartTime
            }
        } catch {
            continue
        }
    }
    return $null
}

# ---------------------------------------------------------------
# Vite-Dev-Prozess suchen (node + vite in Kommandozeile)
# ---------------------------------------------------------------
$viteStart = Get-ProcStart -NamePattern "node" -ArgsPattern "vite"

# ---------------------------------------------------------------
# uvicorn-Prozess suchen
# ---------------------------------------------------------------
$uvicornStart = Get-ProcStart -NamePattern "python*" -ArgsPattern "uvicorn"

# Kein Dev-Server aktiv?
if ($null -eq $viteStart -and $null -eq $uvicornStart) {
    Write-Host "--- MOAG build-state ---"
    Write-Host "Vite:     nicht aktiv"
    Write-Host "uvicorn:  nicht aktiv"
    Write-Host ""
    Write-Host "VERDIKT: Dev-Server nicht aktiv"
    exit 0
}

Write-Host "--- MOAG build-state ---"

# ---------------------------------------------------------------
# Frontend: geaenderte Dateien seit Vite-Start
# ---------------------------------------------------------------
$frontendChanged = @()
if ($null -ne $viteStart) {
    Write-Host "Vite:     aktiv seit $($viteStart.ToString('HH:mm:ss'))"
    if (Test-Path $FrontendPath) {
        $frontendChanged = Get-ChildItem -Path $FrontendPath -Recurse -File `
            | Where-Object { $_.LastWriteTime -gt $viteStart } `
            | Select-Object -ExpandProperty FullName
    }
    if ($frontendChanged.Count -gt 0) {
        Write-Host "Frontend-Aenderungen seit Vite-Start ($($frontendChanged.Count) Dateien):"
        $frontendChanged | ForEach-Object { Write-Host "  $_" }
    } else {
        Write-Host "Frontend: keine Aenderungen seit Vite-Start"
    }
} else {
    Write-Host "Vite:     nicht aktiv"
}

# ---------------------------------------------------------------
# Vite HMR erreichbar? (Port 5173 Standard-Vite-Port)
# ---------------------------------------------------------------
$hmrOk = $false
if ($null -ne $viteStart) {
    try {
        $tcpClient = New-Object System.Net.Sockets.TcpClient
        $connectResult = $tcpClient.BeginConnect("127.0.0.1", 5173, $null, $null)
        $waited = $connectResult.AsyncWaitHandle.WaitOne(500)
        if ($waited -and $tcpClient.Connected) {
            $hmrOk = $true
        }
        $tcpClient.Close()
    } catch {
        $hmrOk = $false
    }
    Write-Host "HMR-Port 5173: $(if ($hmrOk) { 'erreichbar' } else { 'nicht erreichbar' })"
}

# ---------------------------------------------------------------
# Backend: geaenderte Dateien seit uvicorn-Start
# ---------------------------------------------------------------
$backendChanged = @()
if ($null -ne $uvicornStart) {
    Write-Host "uvicorn:  aktiv seit $($uvicornStart.ToString('HH:mm:ss'))"
    if (Test-Path $BackendPath) {
        $backendChanged = Get-ChildItem -Path $BackendPath -Recurse -File `
            | Where-Object { $_.LastWriteTime -gt $uvicornStart } `
            | Select-Object -ExpandProperty FullName
    }
    if ($backendChanged.Count -gt 0) {
        Write-Host "Backend-Aenderungen seit uvicorn-Start ($($backendChanged.Count) Dateien):"
        $backendChanged | ForEach-Object { Write-Host "  $_" }
    } else {
        Write-Host "Backend:  keine Aenderungen seit uvicorn-Start"
    }
} else {
    Write-Host "uvicorn:  nicht aktiv"
}

Write-Host ""

# ---------------------------------------------------------------
# Verdikt berechnen
# ---------------------------------------------------------------
$verdikt = "OK"

if ($backendChanged.Count -gt 0) {
    $verdikt = "uvicorn-Reload pflicht (Backend-Datei geaendert)"
}

if ($frontendChanged.Count -gt 0 -and $null -ne $viteStart) {
    if (-not $hmrOk) {
        $verdikt = "Hard-Restart (HMR haengt oder Vite nicht erreichbar)"
    } elseif ($verdikt -eq "OK") {
        $verdikt = "HMR-Reload reicht (Frontend-Datei geaendert, Vite laeuft)"
    }
}

if ($null -eq $viteStart -and $null -eq $uvicornStart) {
    $verdikt = "Dev-Server nicht aktiv"
}

Write-Host "VERDIKT: $verdikt"
