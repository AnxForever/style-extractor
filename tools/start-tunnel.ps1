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

function Read-TextFileShared([string]$Path) {
  try {
    $fs = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
    try {
      $sr = New-Object System.IO.StreamReader($fs)
      try {
        return $sr.ReadToEnd()
      } finally {
        $sr.Dispose()
      }
    } finally {
      $fs.Dispose()
    }
  } catch {
    return $null
  }
}

# Start local CORS static server (detached)
$server = Start-Process -FilePath "node" -ArgumentList @($serverScript, "--port", "$Port", "--root", "$root") -WorkingDirectory $root -WindowStyle Hidden -PassThru

# Start Cloudflare quick tunnel (detached) and log to file
$cfArgs = @("tunnel", "--url", "http://127.0.0.1:$Port", "--loglevel", "info", "--logfile", "$logFile")
$cloudflared = Start-Process -FilePath "cloudflared" -ArgumentList $cfArgs -WorkingDirectory $root -WindowStyle Hidden -PassThru

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
    $content = Read-TextFileShared $logFile
    if ($content -match "https://[a-z0-9-]+\.trycloudflare\.com") {
      $url = $Matches[0]
      break
    }
  }
}

if (-not $url) {
  # Some cloudflared builds buffer logfile writes; do a final best-effort read before failing.
  for ($j = 0; $j -lt 10 -and (-not $url); $j++) {
    Start-Sleep -Milliseconds 500
    if (Test-Path $logFile) {
      $content = Get-Content $logFile -Raw -ErrorAction SilentlyContinue
      if ($content -match "https://[a-z0-9-]+\.trycloudflare\.com") {
        $url = $Matches[0]
        break
      }
    }
  }
}

if (-not $url) {
  # Fallback: read the logfile in a fresh PowerShell process (avoids rare file-share issues in the current session).
  try {
    $env:STYLE_EXTRACTOR_CLOUDFLARED_LOG = $logFile
    $url = powershell -NoProfile -Command '$c = Get-Content -Raw -ErrorAction SilentlyContinue $env:STYLE_EXTRACTOR_CLOUDFLARED_LOG; if ($c -match \"https://[a-z0-9-]+\.trycloudflare\.com\") { $Matches[0] }' |
      Select-Object -First 1
  } catch {
    # ignore
  }
}

if (-not $url) {
  Write-Host "Tunnel started, but URL not detected yet. Check log:" $logFile
  exit 1
}

Write-Host $url
