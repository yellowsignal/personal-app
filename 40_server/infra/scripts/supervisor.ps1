# Supervisor: runs periodically via a Scheduled Task. Ensures the
# retry-launch-instance.ps1 loop is alive until an instance is successfully
# created, then tears down both scheduled tasks so nothing runs forever.

$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
Set-Location "E:\personal-app"

$TenancyId    = "ocid1.tenancy.oc1..aaaaaaaaxxpcr6mgvoh3rgcmss4sbxvqwtqjnikmasbd7wqk46pbsymnfwza"
$ProgressLog  = "E:\personal-app\90_secret\retry-progress.txt"
$SupLog       = "E:\personal-app\90_secret\supervisor-log.txt"
$RetryTask    = "MyFamilyHub-RetryLaunch"
$SupervisorTask = "MyFamilyHub-Supervisor"

function SupLog($msg) {
    Add-Content -Path $SupLog -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $msg"
}

# 1) Has the loop itself already recorded success?
$success = $false
if (Test-Path $ProgressLog) {
    if ((Get-Content $ProgressLog -Raw) -match "SUCCESS") { $success = $true }
}

# 2) Double-check directly against the API in case the log write was missed.
if (-not $success) {
    try {
        $result = oci compute instance list --compartment-id $TenancyId 2>$null | ConvertFrom-Json
        if ($result.data.Count -gt 0) { $success = $true }
    } catch { }
}

if ($success) {
    SupLog "Instance already exists / SUCCESS detected. Unregistering scheduled tasks."
    Unregister-ScheduledTask -TaskName $RetryTask -Confirm:$false -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $SupervisorTask -Confirm:$false -ErrorAction SilentlyContinue
    exit 0
}

# 3) Not successful yet - make sure the retry loop process is actually alive.
$alive = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
    Where-Object { $_.CommandLine -match "retry-launch-instance\.ps1" }

if (-not $alive) {
    SupLog "Retry loop not running. Relaunching via scheduled task."
    Start-ScheduledTask -TaskName $RetryTask
} else {
    SupLog "Retry loop alive (PID $($alive[0].ProcessId)). OK."
}
