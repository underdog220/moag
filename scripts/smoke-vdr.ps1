#requires -version 5.1
# MOAG-Smoke-Test gegen VDR:17900 (oder anderer Host via -BaseUrl).
#
# Fuehrt 5 Read-only-Checks aus und beendet mit Exit 0 (alles gruen)
# oder Exit 1 (mindestens ein Check rot). JSON-Output auf stdout fuer
# Panopticor-Observability.
#
# Beispiel-Aufruf:
#   pwsh -File scripts/smoke-vdr.ps1
#   pwsh -File scripts/smoke-vdr.ps1 -BaseUrl http://127.0.0.1:17900

[CmdletBinding()]
param(
    [string]$BaseUrl = "http://192.168.200.71:17900",
    [int]$TimeoutSec = 10
)

$ErrorActionPreference = "Stop"
$checks = @()

function Add-Check {
    param([string]$Name, [bool]$Ok, [string]$Detail)
    $script:checks += [PSCustomObject]@{
        name = $Name
        ok = $Ok
        detail = $Detail
    }
    $status = if ($Ok) { "PASS" } else { "FAIL" }
    Write-Host "[$status] $Name -- $Detail"
}

# 1. /api/health
try {
    $h = Invoke-RestMethod -Uri "$BaseUrl/api/health" -TimeoutSec $TimeoutSec
    $ok = ($h.status -eq "ok") -and ($h.version -ne $null) -and ($h.pipeline_ready -eq $true)
    Add-Check -Name "api-health" -Ok $ok -Detail "version=$($h.version) build=$($h.build) pipeline_ready=$($h.pipeline_ready)"
} catch {
    Add-Check -Name "api-health" -Ok $false -Detail "Exception: $($_.Exception.Message)"
}

# 2. /api/v1/overview - Schema-Vertrag
try {
    $o = Invoke-RestMethod -Uri "$BaseUrl/api/v1/overview" -TimeoutSec $TimeoutSec
    $systems = $o.systems
    $countOk = $systems.Count -eq 8
    $required = @("id","name","group","ok","score","summary","metrics","fetched_at")
    $missing = @()
    foreach ($s in $systems) {
        foreach ($field in $required) {
            if ($null -eq $s.$field) { $missing += "$($s.system_id).$field" }
        }
    }
    $ok = $countOk -and ($missing.Count -eq 0)
    $detail = "systems=$($systems.Count)"
    if ($missing.Count -gt 0) { $detail += " fehlende_felder=$($missing -join ',')" }
    Add-Check -Name "overview-schema" -Ok $ok -Detail $detail
} catch {
    Add-Check -Name "overview-schema" -Ok $false -Detail "Exception: $($_.Exception.Message)"
}

# 3. /api/v1/aggregator/health - Frontend-Schema + Score-Konsistenz
try {
    $a = Invoke-RestMethod -Uri "$BaseUrl/api/v1/aggregator/health" -TimeoutSec $TimeoutSec
    # Frontend-Vertrag (TopBar.tsx): groups als Array mit {name, score, systems[].{name,score,ok}}
    $groupsIsArray = $a.groups -is [array]
    $hasAlertCount = $null -ne $a.alert_count
    $hasOverall = $null -ne $a.overall_score
    $groupSchemaOk = $true
    if ($groupsIsArray) {
        foreach ($g in $a.groups) {
            if ($null -eq $g.name -or $null -eq $g.score -or -not ($g.systems -is [array])) { $groupSchemaOk = $false; break }
            foreach ($s in $g.systems) {
                if ($null -eq $s.name -or $null -eq $s.score -or $null -eq $s.ok) { $groupSchemaOk = $false; break }
            }
        }
    } else {
        $groupSchemaOk = $false
    }
    # Score-Konsistenz: Gewichte 50/30/20 (Reihenfolge KI/Infra/Compl im Aggregator)
    $expected = 0
    if ($groupsIsArray -and $a.groups.Count -ge 3) {
        $expected = [math]::Round(0.5 * $a.groups[0].score + 0.3 * $a.groups[1].score + 0.2 * $a.groups[2].score)
    }
    $diff = [math]::Abs($a.overall_score - $expected)
    $consistent = $diff -le 1
    $ok = $hasOverall -and $hasAlertCount -and $groupsIsArray -and $groupSchemaOk -and $consistent
    Add-Check -Name "aggregator-schema-und-konsistenz" -Ok $ok -Detail "overall=$($a.overall_score) erwartet=$expected groups_array=$groupsIsArray alert_count=$hasAlertCount schema_ok=$groupSchemaOk konsistent=$consistent"
} catch {
    Add-Check -Name "aggregator-schema-und-konsistenz" -Ok $false -Detail "Exception: $($_.Exception.Message)"
}

# 4. / - Frontend-Index liefert HTML mit root-div
try {
    $r = Invoke-WebRequest -Uri "$BaseUrl/" -UseBasicParsing -TimeoutSec $TimeoutSec
    $hasRoot = $r.Content -match '<div id="root">'
    $hasScript = $r.Content -match '<script type="module"[^>]*src="/assets/index-[^"]+\.js"'
    $ok = ($r.StatusCode -eq 200) -and $hasRoot -and $hasScript
    Add-Check -Name "frontend-html" -Ok $ok -Detail "http=$($r.StatusCode) root_div=$hasRoot script_tag=$hasScript bytes=$($r.Content.Length)"
} catch {
    Add-Check -Name "frontend-html" -Ok $false -Detail "Exception: $($_.Exception.Message)"
}

# 5. Statische Assets erreichbar (JS + CSS aus HTML extrahieren + GET)
try {
    $html = (Invoke-WebRequest -Uri "$BaseUrl/" -UseBasicParsing -TimeoutSec $TimeoutSec).Content
    $jsMatch = [regex]::Match($html, 'src="(/assets/index-[^"]+\.js)"')
    $cssMatch = [regex]::Match($html, 'href="(/assets/index-[^"]+\.css)"')
    $allOk = $true
    $details = @()
    foreach ($m in @($jsMatch, $cssMatch)) {
        if (-not $m.Success) {
            $allOk = $false
            $details += "asset-pfad-fehlt"
            continue
        }
        $path = $m.Groups[1].Value
        $resp = Invoke-WebRequest -Uri "$BaseUrl$path" -UseBasicParsing -TimeoutSec $TimeoutSec
        $assetOk = ($resp.StatusCode -eq 200) -and ($resp.Content.Length -gt 1000)
        if (-not $assetOk) { $allOk = $false }
        $details += "$path=$($resp.StatusCode)/$($resp.Content.Length)b"
    }
    Add-Check -Name "frontend-assets" -Ok $allOk -Detail ($details -join " ")
} catch {
    Add-Check -Name "frontend-assets" -Ok $false -Detail "Exception: $($_.Exception.Message)"
}

# Zusammenfassung
$total = $checks.Count
$passed = ($checks | Where-Object { $_.ok }).Count
$failed = $total - $passed
$verdict = if ($failed -eq 0) { "PASS" } else { "FAIL" }

Write-Host ""
Write-Host "========================================"
Write-Host "MOAG-Smoke ($BaseUrl): $verdict ($passed/$total)"
Write-Host "========================================"

# JSON-Block fuer Panopticor-Observability
$report = [PSCustomObject]@{
    verdict = $verdict
    base_url = $BaseUrl
    passed = $passed
    failed = $failed
    total = $total
    checks = $checks
    timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
}
Write-Host "MOAG_SMOKE_JSON_BEGIN"
$report | ConvertTo-Json -Depth 5 -Compress
Write-Host "MOAG_SMOKE_JSON_END"

# Panopticor-Signal: execution.py:_await_signal matcht den expectedSignal-String
# als Substring auf stdout/stderr. Wir schreiben das passende Signal nur bei
# Erfolg — bei Fehler bleibt nur die "FAIL"-Zeile, Pano matcht dann nicht.
if ($failed -eq 0) {
    Write-Host "PANOPTICOR_SIGNAL exit_code_zero"
    exit 0
} else {
    Write-Host "PANOPTICOR_SIGNAL exit_code_nonzero"
    exit 1
}
