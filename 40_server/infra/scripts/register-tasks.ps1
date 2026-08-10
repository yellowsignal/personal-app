# Registers two Windows Scheduled Tasks that keep the Oracle Cloud instance
# launch retry loop alive overnight, self-healing if the process dies.

$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")

$RepoRoot   = "E:\personal-app"
$RetryTask  = "MyFamilyHub-RetryLaunch"
$SupTask    = "MyFamilyHub-Supervisor"
$UserId     = "$env:USERDOMAIN\$env:USERNAME"

# Clean up any pre-existing registrations first (idempotent re-run).
Unregister-ScheduledTask -TaskName $RetryTask -Confirm:$false -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $SupTask -Confirm:$false -ErrorAction SilentlyContinue

# --- Task 1: the retry loop itself ---
$Action1 = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-ExecutionPolicy Bypass -NoProfile -File `"$RepoRoot\40_server\infra\scripts\retry-launch-instance.ps1`"" `
    -WorkingDirectory $RepoRoot

$Trigger1 = New-ScheduledTaskTrigger -Once -At (Get-Date)

$Settings1 = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -DontStopOnIdleEnd `
    -MultipleInstances IgnoreNew

$Principal1 = New-ScheduledTaskPrincipal -UserId $UserId -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $RetryTask -Action $Action1 -Trigger $Trigger1 `
    -Settings $Settings1 -Principal $Principal1 -Force | Out-Null

# --- Task 2: supervisor, checks every 5 minutes and relaunches task 1 if needed ---
$Action2 = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-ExecutionPolicy Bypass -NoProfile -File `"$RepoRoot\40_server\infra\scripts\supervisor.ps1`"" `
    -WorkingDirectory $RepoRoot

$Trigger2 = New-ScheduledTaskTrigger -Once -At (Get-Date) `
    -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)

$Settings2 = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -DontStopOnIdleEnd `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 4) `
    -MultipleInstances IgnoreNew

$Principal2 = New-ScheduledTaskPrincipal -UserId $UserId -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $SupTask -Action $Action2 -Trigger $Trigger2 `
    -Settings $Settings2 -Principal $Principal2 -Force | Out-Null

Write-Host "Registered tasks. Starting retry loop now..."
Start-ScheduledTask -TaskName $RetryTask
Start-Sleep -Seconds 2
Start-ScheduledTask -TaskName $SupTask

Get-ScheduledTask -TaskName $RetryTask, $SupTask | Select-Object TaskName, State
