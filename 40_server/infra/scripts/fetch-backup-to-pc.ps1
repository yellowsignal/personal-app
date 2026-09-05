#Requires -Version 5.1
# Run on Windows PC (Windows PowerShell 5.1 / PowerShell 7).
# Saves dumps to E:\personal-app\50_backup by default.
#
#   cd E:\personal-app
#   powershell -ExecutionPolicy Bypass -File .\40_server\infra\scripts\fetch-backup-to-pc.ps1 -IdentityFile "E:\personal-app\90_secret\ssh-key-2026-08-10.key"
#   powershell -ExecutionPolicy Bypass -File .\40_server\infra\scripts\fetch-backup-to-pc.ps1 -IdentityFile "E:\...\key.pem" -DeleteAfter
param(
  [string]$HostName = "ubuntu@129.225.196.226",
  [string]$RemoteRoot = "~/personal-app",
  [ValidateSet("prod", "dig")]
  [string]$Target = "prod",
  [string]$Dest = "",
  [string]$IdentityFile = "",
  [switch]$DeleteAfter
)

$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
if ([string]::IsNullOrWhiteSpace($Dest)) {
  $Dest = Join-Path $RepoRoot "50_backup"
}
if ([string]::IsNullOrWhiteSpace($IdentityFile) -and $env:MYFAMILYHUB_SSH_KEY) {
  $IdentityFile = $env:MYFAMILYHUB_SSH_KEY
}

New-Item -ItemType Directory -Force -Path $Dest | Out-Null

$sshArgs = New-Object System.Collections.Generic.List[string]
if (-not [string]::IsNullOrWhiteSpace($IdentityFile)) {
  if (-not (Test-Path -LiteralPath $IdentityFile)) {
    throw "IdentityFile not found: $IdentityFile"
  }
  $sshArgs.Add("-i") | Out-Null
  $sshArgs.Add($IdentityFile) | Out-Null
  $sshArgs.Add("-o") | Out-Null
  $sshArgs.Add("IdentitiesOnly=yes") | Out-Null
}

$RemoteDir = "$RemoteRoot/30_data/backups/$Target"
Write-Host "==> Listing remote dumps ($HostName : $RemoteDir)"
if ($IdentityFile) {
  Write-Host "    using key: $IdentityFile"
}

$listCmd = "ls -1t $RemoteDir/myfamilyhub-*.dump 2>/dev/null | head -1"
$sshListArgs = @($sshArgs.ToArray()) + @($HostName, $listCmd)

$prevEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$sshOut = & ssh @sshListArgs 2>&1
$sshCode = $LASTEXITCODE
$ErrorActionPreference = $prevEap

$sshText = (($sshOut | ForEach-Object { "$_" }) -join "`n").Trim()

if ($sshCode -ne 0) {
  Write-Host ""
  Write-Host "SSH failed (exit $sshCode)." -ForegroundColor Red
  Write-Host $sshText
  Write-Host ""
  Write-Host "PC OpenSSH cannot log in. Use the same .pem/.key as Termius:" -ForegroundColor Yellow
  Write-Host '  ssh -i "E:\personal-app\90_secret\your.key" -o IdentitiesOnly=yes ubuntu@129.225.196.226'
  Write-Host "Then re-run this script with -IdentityFile pointing at that file."
  throw "SSH login failed"
}

$Latest = $sshText
if ([string]::IsNullOrWhiteSpace($Latest)) {
  Write-Host "SSH OK, but no dumps on server for target=$Target" -ForegroundColor Yellow
  Write-Host "On OCI (Termius) run:"
  Write-Host "  bash ~/personal-app/40_server/infra/scripts/backup-db.sh $Target"
  Write-Host "  bash ~/personal-app/40_server/infra/scripts/list-backups.sh"
  throw "No dumps on server"
}

$BaseName = Split-Path $Latest -Leaf
$LocalPath = Join-Path $Dest $BaseName
Write-Host "==> Download $BaseName -> $LocalPath"

$scpArgs = @($sshArgs.ToArray()) + @("${HostName}:${Latest}", $LocalPath)
$ErrorActionPreference = "Continue"
& scp @scpArgs
$scpCode = $LASTEXITCODE
$ErrorActionPreference = $prevEap
if ($scpCode -ne 0) {
  throw "scp failed (exit $scpCode)"
}

Get-Item -LiteralPath $LocalPath | Format-List FullName, Length, LastWriteTime

$Rel = "$Target/$BaseName"
$Purge = "~/personal-app/40_server/infra/scripts/purge-backup.sh"

# Use ; not && so Windows PowerShell 5.1 never parses the remote command wrongly
if ($DeleteAfter) {
  Write-Host "==> Mark + delete on server ($Rel)"
  $remote = "bash $Purge --mark $Rel ; bash $Purge --delete $Rel"
  $ErrorActionPreference = "Continue"
  & ssh @($sshArgs.ToArray() + @($HostName, $remote))
  $ErrorActionPreference = $prevEap
} else {
  Write-Host "==> Mark as downloaded on server (file kept)"
  $remote = "bash $Purge --mark $Rel"
  $ErrorActionPreference = "Continue"
  & ssh @($sshArgs.ToArray() + @($HostName, $remote)) 2>$null
  $ErrorActionPreference = $prevEap
  Write-Host "Delete later with -DeleteAfter, or on OCI: bash $Purge --delete $Rel"
}

Write-Host "Done. Local copy: $LocalPath"
Write-Host "Do not commit .dump files."
