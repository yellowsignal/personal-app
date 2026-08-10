# Retries launching the Always Free Ampere A1.Flex instance until Oracle
# has spare capacity in the home region. Safe to Ctrl+C and re-run anytime.
#
# Usage:
#   .\retry-launch-instance.ps1

$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")

$TenancyId  = "ocid1.tenancy.oc1..aaaaaaaaxxpcr6mgvoh3rgcmss4sbxvqwtqjnikmasbd7wqk46pbsymnfwza"
$Ad         = "zuGn:AP-OSAKA-1-AD-1"
$SubnetId   = "ocid1.subnet.oc1.ap-osaka-1.aaaaaaaawhdlfuk63jns3o5xilji4rmk3fx7coioyfpf7srgovqmfwwsjdiq"
$ImageId    = "ocid1.image.oc1.ap-osaka-1.aaaaaaaathu6m4baeurwv3qxz7dyc5mypptwa5s7mcdb7dkqyf745nd5ao6q"
$SshKeyFile = Join-Path $PSScriptRoot "..\..\..\90_secret\ssh-key-2026-08-10.key.pub"
$ShapeCfg   = Join-Path $PSScriptRoot "shape-config.json"
$RetrySec   = 45
$LogFile    = Join-Path $PSScriptRoot "..\..\..\90_secret\retry-progress.txt"

function Log($msg) {
    $line = "[$(Get-Date -Format 'HH:mm:ss')] $msg"
    Write-Host $line
    Add-Content -Path $LogFile -Value $line
}

$attempt = 0
while ($true) {
    $attempt++
    Log "Attempt #$attempt - launching instance..."

    $output = oci compute instance launch `
        --compartment-id $TenancyId `
        --availability-domain $Ad `
        --shape "VM.Standard.A1.Flex" `
        --shape-config "file://$ShapeCfg" `
        --subnet-id $SubnetId `
        --image-id $ImageId `
        --ssh-authorized-keys-file $SshKeyFile `
        --assign-public-ip true `
        --display-name "myfamilyhub-server" `
        --wait-for-state RUNNING --max-wait-seconds 180 2>&1 | Out-String

    if ($LASTEXITCODE -eq 0) {
        Log "SUCCESS! Instance is running."
        Add-Content -Path $LogFile -Value $output
        break
    }

    if ($output -match "OutOfHostCapacity|out of host capacity") {
        Log "Out of capacity, retrying in $RetrySec s..."
        Start-Sleep -Seconds $RetrySec
    } elseif ($output -match "TooManyRequests|too many requests") {
        Log "Rate limited, backing off for 60s..."
        Start-Sleep -Seconds 60
    } else {
        Log "Unexpected error:"
        Add-Content -Path $LogFile -Value $output
        Log "Stopping retry loop so you can inspect the error above."
        break
    }
}
