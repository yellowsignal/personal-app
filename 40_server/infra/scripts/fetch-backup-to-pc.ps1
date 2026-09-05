# Run on Windows PC (PowerShell). Saves dumps to E:\personal-app\50_backup by default.
#
# Examples:
#   cd E:\personal-app
#   powershell -ExecutionPolicy Bypass -File .\40_server\infra\scripts\fetch-backup-to-pc.ps1
#   powershell -ExecutionPolicy Bypass -File .\40_server\infra\scripts\fetch-backup-to-pc.ps1 -IdentityFile $env:USERPROFILE\.ssh\oci_ed25519
#   powershell -ExecutionPolicy Bypass -File .\40_server\infra\scripts\fetch-backup-to-pc.ps1 -DeleteAfter
param(
  [string]$HostName = "ubuntu@129.225.196.226",
  [string]$RemoteRoot = "~/personal-app",
  [ValidateSet("prod", "dig")]
  [string]$Target = "prod",
  [string]$Dest = "",
  # Path to the private key OpenSSH should use (same key Termius uses for OCI)
  [string]$IdentityFile = "",
  [switch]$DeleteAfter
)

$ErrorActionPreference = "Stop"

function Get-SshArgList {
  param([string]$KeyPath)
  $args = @()
  if (-not [string]::IsNullOrWhiteSpace($KeyPath)) {
    if (-not (Test-Path -LiteralPath $KeyPath)) {
      throw "IdentityFile not found: $KeyPath"
    }
    $args += @("-i", $KeyPath, "-o", "IdentitiesOnly=yes")
  }
  return $args
}

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
if ([string]::IsNullOrWhiteSpace($Dest)) {
  $Dest = Join-Path $RepoRoot "50_backup"
}
if ([string]::IsNullOrWhiteSpace($IdentityFile) -and -not [string]::IsNullOrWhiteSpace($env:MYFAMILYHUB_SSH_KEY)) {
  $IdentityFile = $env:MYFAMILYHUB_SSH_KEY
}

New-Item -ItemType Directory -Force -Path $Dest | Out-Null
$SshExtra = @(Get-SshArgList -KeyPath $IdentityFile)

$RemoteDir = "$RemoteRoot/30_data/backups/$Target"
Write-Host "==> Listing remote dumps ($HostName`:$RemoteDir)"
if ($IdentityFile) {
  Write-Host "    using key: $IdentityFile"
}

$sshOut = & ssh @SshExtra $HostName "ls -1t $RemoteDir/myfamilyhub-*.dump 2>/dev/null | head -1" 2>&1
$sshCode = $LASTEXITCODE
$sshText = ($sshOut | Out-String).Trim()

if ($sshCode -ne 0) {
  Write-Host ""
  Write-Host "SSH failed (exit $sshCode). PowerShell OpenSSH cannot log in to OCI." -ForegroundColor Red
  Write-Host $sshText
  Write-Host ""
  Write-Host "Fix on this PC (not on the server):" -ForegroundColor Yellow
  Write-Host "  1) Test:  ssh -i <private-key> ubuntu@129.225.196.226"
  Write-Host "  2) Use the same private key Termius uses for this host."
  Write-Host "  3) Re-run with:"
  Write-Host "       powershell -ExecutionPolicy Bypass -File .\40_server\infra\scripts\fetch-backup-to-pc.ps1 ``"
  Write-Host "         -IdentityFile `$env:USERPROFILE\.ssh\oci_ed25519"
  Write-Host "  See 10_docs/DB_백업.md → Windows SSH 키"
  throw "SSH Permission denied / login failed — fix key before fetching backups."
}

$Latest = $sshText
if ([string]::IsNullOrWhiteSpace($Latest)) {
  throw @"
SSH OK, but no dumps on server for target=$Target.
On OCI (Termius) run:
  bash ~/personal-app/40_server/infra/scripts/backup-db.sh $Target
  bash ~/personal-app/40_server/infra/scripts/list-backups.sh
"@
}

$BaseName = Split-Path $Latest -Leaf
$LocalPath = Join-Path $Dest $BaseName
Write-Host "==> Download $BaseName -> $LocalPath"
& scp @SshExtra "${HostName}:${Latest}" $LocalPath
if ($LASTEXITCODE -ne 0) {
  throw "scp failed (exit $LASTEXITCODE)"
}

Get-Item $LocalPath | Format-List FullName, Length, LastWriteTime

$Rel = "$Target/$BaseName"
$Purge = "~/personal-app/40_server/infra/scripts/purge-backup.sh"
if ($DeleteAfter) {
  Write-Host "==> Mark + delete on server ($Rel)"
  & ssh @SshExtra $HostName "bash $Purge --mark $Rel && bash $Purge --delete $Rel"
} else {
  Write-Host "==> Mark as downloaded on server (file kept)"
  & ssh @SshExtra $HostName "bash $Purge --mark $Rel" 2>$null
  Write-Host "Delete later with -DeleteAfter, or on OCI: bash $Purge --delete $Rel"
}

Write-Host "Done. Local copy: $LocalPath"
Write-Host "Do not commit .dump files."
