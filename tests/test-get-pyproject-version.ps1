#requires -version 5.1
# Isolierter Test fuer Get-PyprojectVersion-Hilfsfunktion.
# Kein echter Docker-Build, kein SSH. Rein funktionale Logik-Tests.
#
# Aufruf: pwsh -File tests/test-get-pyproject-version.ps1

$ErrorActionPreference = "Stop"
$passed = 0
$failed = 0

function Get-PyprojectVersion {
    [OutputType([string])]
    param(
        [string]$PyprojectPath
    )
    if (-not (Test-Path $PyprojectPath)) {
        throw "Datei nicht gefunden: $PyprojectPath"
    }
    $line = Get-Content $PyprojectPath | Where-Object { $_ -match '^\s*version\s*=\s*"[^"]+"' } | Select-Object -First 1
    if (-not $line) {
        throw "Keine version-Zeile in $PyprojectPath gefunden"
    }
    if ($line -match '"([^"]+)"') {
        return $Matches[1]
    }
    throw "Konnte Versions-String nicht aus Zeile parsen: $line"
}

function Assert-Equal {
    param($Actual, $Expected, $TestName)
    if ($Actual -eq $Expected) {
        Write-Host "  PASS: $TestName"
        $script:passed++
    } else {
        Write-Host "  FAIL: $TestName -- erwartet '$Expected', erhalten '$Actual'"
        $script:failed++
    }
}

function Assert-Throws {
    param([scriptblock]$Code, $TestName)
    try {
        & $Code
        Write-Host "  FAIL: $TestName -- kein Fehler geworfen"
        $script:failed++
    } catch {
        Write-Host "  PASS: $TestName (Fehler: $($_.Exception.Message))"
        $script:passed++
    }
}

Write-Host ""
Write-Host "=== Get-PyprojectVersion Tests ==="
Write-Host ""

# Test 1: echte pyproject.toml (0.2.2 nach unserem Update)
$realPath = Join-Path $PSScriptRoot "..\backend\pyproject.toml"
$v = Get-PyprojectVersion -PyprojectPath $realPath
Assert-Equal -Actual $v -Expected "0.2.2" -TestName "echte pyproject.toml liest 0.2.2"

# Test 2: Mock-Datei mit klarer Version
$mockFile = Join-Path $env:TEMP "moag-test-pyproject.toml"
@"
[build-system]
requires = ["setuptools>=68", "wheel"]

[project]
name = "mockpkg"
version = "1.5.9"
description = "Test-Paket"
"@ | Set-Content $mockFile -Encoding UTF8
$v2 = Get-PyprojectVersion -PyprojectPath $mockFile
Assert-Equal -Actual $v2 -Expected "1.5.9" -TestName "mock pyproject.toml liest 1.5.9"
Remove-Item $mockFile -Force

# Test 3: Version mit Leerzeichen um das Gleichheitszeichen
$mockFile2 = Join-Path $env:TEMP "moag-test-pyproject2.toml"
@"
[project]
name = "spacedpkg"
version   =   "2.0.0-beta"
"@ | Set-Content $mockFile2 -Encoding UTF8
$v3 = Get-PyprojectVersion -PyprojectPath $mockFile2
Assert-Equal -Actual $v3 -Expected "2.0.0-beta" -TestName "Leerzeichen um '=' werden toleriert"
Remove-Item $mockFile2 -Force

# Test 4: Fehlende Datei wirft Fehler
Assert-Throws -Code { Get-PyprojectVersion -PyprojectPath "C:\nonexistent\pyproject.toml" } `
              -TestName "fehlende Datei wirft Fehler"

# Test 5: Datei ohne version-Zeile wirft Fehler
$mockFile3 = Join-Path $env:TEMP "moag-test-pyproject3.toml"
@"
[project]
name = "nopkg"
description = "kein version-Eintrag"
"@ | Set-Content $mockFile3 -Encoding UTF8
Assert-Throws -Code { Get-PyprojectVersion -PyprojectPath $mockFile3 } `
              -TestName "fehlende version-Zeile wirft Fehler"
Remove-Item $mockFile3 -Force

# Test 6: ImageTag-Konstruktion pruefen (moag:<version>)
$expectedTag = "moag:0.2.2"
$realPath2 = Join-Path $PSScriptRoot "..\backend\pyproject.toml"
$parsedV = Get-PyprojectVersion -PyprojectPath $realPath2
$constructedTag = "moag:$parsedV"
Assert-Equal -Actual $constructedTag -Expected $expectedTag -TestName "ImageTag-Konstruktion moag:0.2.2"

Write-Host ""
Write-Host "=== Ergebnis: $passed/$($passed + $failed) Tests bestanden ==="
Write-Host ""

if ($failed -gt 0) {
    Write-Host "FAIL: $failed Test(s) fehlgeschlagen"
    exit 1
} else {
    Write-Host "PASS: Alle Tests gruen"
    exit 0
}
