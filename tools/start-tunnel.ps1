param(
  [int]$Port = 8787
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$serverScript = Join-Path $PSScriptRoot "cors-static-server.cjs"

$stateDir = Join-Path $env:TEMP "style-extractor-dev"
New-Item -ItemType Directory -Force -Path $stateDir | Out-Null

$pidFile = Join-Path $stateDir "tunnel-pids.json"
$logFile = Join-Path $stateDir "cloudflared.log"
Remove-Item -Force -ErrorAction SilentlyContinue $logFile

# Start local CORS static server (detached)
$server = Start-Process -FilePath "node" -ArgumentList @($serverScript, "--port", "$Port", "--root", "$root") -WorkingDirectory $root -WindowStyle Hidden -PassThru

# Start Cloudflare quick tunnel (detached) and log to file
$cfArgs = @("tunnel", "--url", "http://127.0.0.1:$Port", "--loglevel", "info")
$cloudflared = Start-Process -FilePath "cloudflared" -ArgumentList $cfArgs -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $logFile -RedirectStandardError $logFile -PassThru

@{
  serverPid = $server.Id
  cloudflaredPid = $cloudflared.Id
  port = $Port
  startedAt = (Get-Date).ToString("o")
  logFile = $logFile
} | ConvertTo-Json | Set-Content -Encoding UTF8 $pidFile

# Wait for the trycloudflare URL to appear in the log.
$url = $null
for ($i = 0; $i -lt 120; $i++) {
  Start-Sleep -Milliseconds 500
  if (Test-Path $logFile) {
    $content = Get-Content $logFile -Raw -ErrorAction SilentlyContinue
    if ($content -match "https://[a-z0-9-]+\\.trycloudflare\\.com") {
      $url = $Matches[0]
      break
    }
  }
}

if (-not $url) {
  Write-Host "Tunnel started, but URL not detected yet. Check log:" $logFile
  exit 1
}

Write-Host $url

