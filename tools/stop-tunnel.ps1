$ErrorActionPreference = "Stop"

$stateDir = Join-Path $env:TEMP "style-extractor-dev"
$pidFile = Join-Path $stateDir "tunnel-pids.json"

if (!(Test-Path $pidFile)) {
  Write-Host "No pid file found:" $pidFile
  exit 0
}

$pids = Get-Content $pidFile -Raw | ConvertFrom-Json

foreach ($procId in @($pids.cloudflaredPid, $pids.serverPid)) {
  if ($procId -and (Get-Process -Id $procId -ErrorAction SilentlyContinue)) {
    Stop-Process -Id $procId -Force
  }
}

Remove-Item -Force $pidFile
Write-Host "Stopped."
