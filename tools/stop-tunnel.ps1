$ErrorActionPreference = "Stop"

$stateDir = Join-Path $env:TEMP "style-extractor-dev"
$pidFile = Join-Path $stateDir "tunnel-pids.json"

if (!(Test-Path $pidFile)) {
  Write-Host "No pid file found:" $pidFile
  exit 0
}

$pids = Get-Content $pidFile -Raw | ConvertFrom-Json

foreach ($pid in @($pids.cloudflaredPid, $pids.serverPid)) {
  if ($pid -and (Get-Process -Id $pid -ErrorAction SilentlyContinue)) {
    Stop-Process -Id $pid -Force
  }
}

Remove-Item -Force $pidFile
Write-Host "Stopped."

