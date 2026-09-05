# Run on Windows PC (PowerShell). Saves dumps to E:\personal-app\50_backup by default.
#
# Examples:
#   cd E:\personal-app
#   powershell -ExecutionPolicy Bypass -File .\40_server\infra\scripts\fetch-backup-to-pc.ps1
#   powershell -ExecutionPolicy Bypass -File .\40_server\infra\scripts\fetch-backup-to-pc.ps1 -DeleteAfter
#   powershell -ExecutionPolicy Bypass -File .\40_server\infra\scripts\fetch-backup-to-pc.ps1 -Target dig
param(
  [string]$HostName = "ubuntu@129.225.196.226",
  [string]$RemoteRoot = "~/personal-app",
  [ValidateSet("prod", "dig")]
  [string]$Target = "prod",
  [string]$Dest = "",
  [switch]$DeleteAfter
)

$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
if ([string]::IsNullOrWhiteSpace($Dest)) {
  $Dest = Join-Path $RepoRoot "50_backup"
}

New-Item -ItemType Directory -Force -Path $Dest | Out-Null

$RemoteDir = "$RemoteRoot/30_data/backups/$Target"
Write-Host "==> Listing remote dumps ($HostName`:$RemoteDir)"
$Latest = ssh $HostName "ls -1t $RemoteDir/myfamilyhub-*.dump 2>/dev/null | head -1"
if ([string]::IsNullOrWhiteSpace($Latest)) {
  Write-Error "No dumps on server for target=$Target. On OCI run: bash ~/personal-app/40_server/infra/scripts/backup-db.sh $Target"
}

$BaseName = Split-Path $Latest -Leaf
$LocalPath = Join-Path $Dest $BaseName
Write-Host "==> Download $BaseName -> $LocalPath"
scp "${HostName}:${Latest}" $LocalPath

Get-Item $LocalPath | Format-List FullName, Length, LastWriteTime

$Rel = "$Target/$BaseName"
$Purge = "~/personal-app/40_server/infra/scripts/purge-backup.sh"
if ($DeleteAfter) {
  Write-Host "==> Mark + delete on server ($Rel)"
  ssh $HostName "bash $Purge --mark $Rel && bash $Purge --delete $Rel"
} else {
  Write-Host "==> Mark as downloaded on server (file kept)"
  ssh $HostName "bash $Purge --mark $Rel" 2>$null
  Write-Host "Delete later with -DeleteAfter, or on OCI: bash $Purge --delete $Rel"
}

Write-Host "Done. Local copy: $LocalPath"
Write-Host "Do not commit .dump files."
