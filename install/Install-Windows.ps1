$ErrorActionPreference = 'Stop'
# User-level install, no elevation. Enables Adobe's unsigned CEP 12 development mode.
$extensionSource = Join-Path $PSScriptRoot '..\extension'
$extensionsRoot = Join-Path $env:APPDATA 'Adobe\CEP\extensions'
$destination = Join-Path $extensionsRoot 'com.frameflow.ae'
$backupRoot = Join-Path $env:APPDATA 'FrameFlow\backups'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$backup = Join-Path $backupRoot $stamp
$staging = Join-Path $env:APPDATA ('FrameFlow\staging-' + $stamp)
$regPath = 'HKCU:\Software\Adobe\CSXS.12'
$prior = Get-ItemProperty -Path $regPath -Name PlayerDebugMode -ErrorAction SilentlyContinue
$hadValue = $null -ne $prior
$priorValue = if ($hadValue) { $prior.PlayerDebugMode } else { $null }
$priorKind = if ($hadValue) { (Get-Item $regPath).GetValueKind('PlayerDebugMode').ToString() } else { $null }
if (!(Test-Path (Join-Path $extensionSource 'CSXS\manifest.xml'))) { throw 'Incomplete package: manifest missing.' }
Write-Host 'FrameFlow 2.2.0 / After Effects 25-26 / CEP 12'
Write-Host 'Close the FrameFlow panel before installation; AE may stay open.'
Write-Host 'Installs for this Windows account and enables unsigned CEP 12 panels.'
Write-Host 'Existing FrameFlow and the prior development setting are backed up.'
New-Item -ItemType Directory -Force -Path $extensionsRoot, $backup | Out-Null
@{version='2.2.0';hadValue=$hadValue;priorValue=$priorValue;priorKind=$priorKind;hadExtension=(Test-Path $destination)} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $backup 'install-state.json') -Encoding UTF8
$movedOld = $false
$placedNew = $false
try {
    Copy-Item -LiteralPath $extensionSource -Destination $staging -Recurse
    if (Test-Path $destination) { Move-Item -LiteralPath $destination -Destination (Join-Path $backup 'extension'); $movedOld = $true }
    Move-Item -LiteralPath $staging -Destination $destination
    $placedNew = $true
    New-Item -Path $regPath -Force | Out-Null
    New-ItemProperty -Path $regPath -Name PlayerDebugMode -Value '1' -PropertyType String -Force | Out-Null
    if ((Get-ItemProperty -Path $regPath).PlayerDebugMode -ne '1') { throw 'CEP development setting was not acknowledged.' }
    New-Item -ItemType File -Path (Join-Path $backup 'install-complete.txt') | Out-Null
    Write-Host ('Installed: ' + $destination)
    Write-Host ('Backup: ' + $backup)
    Write-Host 'Reopen Window > Extensions (or Extensions (Legacy)) > FrameFlow 2.2.'
    Write-Host 'Restart AE if the new panel/kernel version is not loaded.'
} catch {
    $originalError = $_
    try {
        if ($placedNew -and (Test-Path $destination)) { Move-Item -LiteralPath $destination -Destination (Join-Path $backup 'failed-new-extension') }
        if ($movedOld -and (Test-Path (Join-Path $backup 'extension'))) { Move-Item -LiteralPath (Join-Path $backup 'extension') -Destination $destination }
        if ($hadValue) { New-ItemProperty -Path $regPath -Name PlayerDebugMode -Value $priorValue -PropertyType $priorKind -Force | Out-Null }
        else { Remove-ItemProperty -Path $regPath -Name PlayerDebugMode -ErrorAction SilentlyContinue }
    } catch { Write-Warning ('Recovery error: ' + $_.Exception.Message) }
    throw $originalError
}
