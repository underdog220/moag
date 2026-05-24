#requires -version 5.1
# Isolierter Test fuer Compare-ImageShas-Hilfsfunktion aus scripts/deploy-vdr.ps1.
# Reine Logik-Tests ohne Docker und ohne SSH.
#
# Aufruf: pwsh -File tests/test-image-sha-compare.ps1

$ErrorActionPreference = "Stop"
$passed = 0
$failed = 0

# Funktion 1:1 aus scripts/deploy-vdr.ps1 dupliziert (PS 5.1 hat kein dot-source-friendly
# Modul-System fuer Skripte mit Top-Level-Code, und der Top-Level-Code wuerde sofort
# loslaufen wollen — also lieber Funktion isoliert testen).
function Compare-ImageShas {
    [OutputType([string])]
    param(
        [string]$LocalSha,
        [string]$RemoteSha
    )
    if (-not $LocalSha)  { return "missing-local" }
    if (-not $RemoteSha) { return "transfer" }
    if ($LocalSha -eq $RemoteSha) { return "skip" }
    return "transfer"
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

Write-Host ""
Write-Host "=== Compare-ImageShas Tests ==="
Write-Host ""

# Test 1: beide SHAs identisch -> skip
$sha1 = "sha256:abc123def456000000000000000000000000000000000000000000000000abcd"
$r1 = Compare-ImageShas -LocalSha $sha1 -RemoteSha $sha1
Assert-Equal -Actual $r1 -Expected "skip" `
             -TestName "identische SHAs -> skip"

# Test 2: beide SHAs vorhanden aber unterschiedlich -> transfer (Bug-4-Kern!)
$sha2a = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
$sha2b = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
$r2 = Compare-ImageShas -LocalSha $sha2a -RemoteSha $sha2b
Assert-Equal -Actual $r2 -Expected "transfer" `
             -TestName "unterschiedliche SHAs -> transfer (Bug-4-Regression)"

# Test 3: remote fehlt -> transfer (Image-Tag auf VDR noch nicht da)
$r3 = Compare-ImageShas -LocalSha $sha1 -RemoteSha $null
Assert-Equal -Actual $r3 -Expected "transfer" `
             -TestName "remote SHA null -> transfer"

# Test 4: remote leer-String -> transfer (gleiche Semantik wie null)
$r4 = Compare-ImageShas -LocalSha $sha1 -RemoteSha ""
Assert-Equal -Actual $r4 -Expected "transfer" `
             -TestName "remote SHA leer -> transfer"

# Test 5: lokal fehlt -> missing-local (Caller muss werfen)
$r5 = Compare-ImageShas -LocalSha $null -RemoteSha $sha1
Assert-Equal -Actual $r5 -Expected "missing-local" `
             -TestName "lokal SHA null -> missing-local"

# Test 6: lokal leer-String -> missing-local (gleiche Semantik wie null)
$r6 = Compare-ImageShas -LocalSha "" -RemoteSha $sha1
Assert-Equal -Actual $r6 -Expected "missing-local" `
             -TestName "lokal SHA leer -> missing-local"

# Test 7: beide null -> missing-local (lokal-Check kommt zuerst)
$r7 = Compare-ImageShas -LocalSha $null -RemoteSha $null
Assert-Equal -Actual $r7 -Expected "missing-local" `
             -TestName "beide SHAs null -> missing-local"

# Test 8: SHA-Vergleich ist case-sensitive (Docker liefert immer lowercase,
# aber der String-Vergleich `-eq` ist in PS case-INSENSITIVE per default).
# Wir wollen sicherstellen dass das Verhalten dokumentiert ist: identische
# lowercase SHAs matchen.
$shaLow = "sha256:abc"
$r8 = Compare-ImageShas -LocalSha $shaLow -RemoteSha $shaLow
Assert-Equal -Actual $r8 -Expected "skip" `
             -TestName "lowercase SHAs identisch -> skip"

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
