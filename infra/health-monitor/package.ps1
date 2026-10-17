$ErrorActionPreference = "Stop"
$source = $PSScriptRoot
$destination = Join-Path $source "fleetmind-health-monitor.zip"
$files = @(
  (Join-Path $source "monitor.py"),
  (Join-Path $source "fleetmind-health-monitor.service"),
  (Join-Path $source "fleetmind-health-monitor.timer")
)
Compress-Archive -Path $files -DestinationPath $destination -Force
Write-Output "Created $destination"
