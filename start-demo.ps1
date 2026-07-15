#Requires -Version 5.1

$ErrorActionPreference = 'Continue'
$root = $PSScriptRoot

function Write-Banner([string]$msg) {
    Write-Host ""
    Write-Host "  $msg" -ForegroundColor Cyan
}

function Wait-TunnelUrl([string]$logFile, [int]$timeoutSec = 45) {
    $elapsed = 0
    while ($elapsed -lt $timeoutSec) {
        if (Test-Path $logFile) {
            $content = Get-Content $logFile -Raw -ErrorAction SilentlyContinue
            if ($content -match 'https://([a-z0-9\-]+\.trycloudflare\.com)') {
                return "https://$($Matches[1])"
            }
        }
        Start-Sleep 1
        $elapsed++
        Write-Host "  . waiting for tunnel URL ($elapsed/$timeoutSec s)" -ForegroundColor DarkGray
    }
    return $null
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Yellow
Write-Host "  PURALOKA SUITE - DEMO SETUP" -ForegroundColor Yellow
Write-Host "================================================" -ForegroundColor Yellow

$cfExe    = Join-Path $root 'tools\cloudflared.exe'
$envLocal = Join-Path $root 'apps\web\.env.local'

if (-not (Test-Path $cfExe)) {
    Write-Host "  ERROR: tools\cloudflared.exe not found." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $envLocal)) {
    Write-Host "  ERROR: apps\web\.env.local not found." -ForegroundColor Red
    exit 1
}

Write-Banner "Killing any leftover cloudflared processes..."
Get-Process -Name 'cloudflared' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep 1

$cfApiLog = Join-Path $env:TEMP 'cf-api.txt'
$cfWebLog = Join-Path $env:TEMP 'cf-web.txt'
Remove-Item $cfApiLog -ErrorAction SilentlyContinue
Remove-Item $cfWebLog -ErrorAction SilentlyContinue

Write-Banner "Starting API server (port 3001)..."
Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$root\apps\api'; node --loader ts-node/esm src/index.ts"
Start-Sleep 3

Write-Banner "Starting Cloudflare Tunnel for API (port 3001)..."
Start-Process -FilePath $cfExe `
    -ArgumentList 'tunnel', '--url', 'http://localhost:3001' `
    -RedirectStandardError $cfApiLog `
    -WindowStyle Hidden

$apiTunnelUrl = Wait-TunnelUrl -logFile $cfApiLog -timeoutSec 45
if (-not $apiTunnelUrl) {
    Write-Host "  ERROR: Could not get API tunnel URL. Check $cfApiLog" -ForegroundColor Red
    exit 1
}
Write-Host "  API tunnel: $apiTunnelUrl" -ForegroundColor Green

Write-Banner "Updating apps\web\.env.local with API tunnel URL..."
$envContent = Get-Content $envLocal -Raw
# Save original value so we can restore it when demo ends
$originalApiUrl = if ($envContent -match 'NEXT_PUBLIC_API_URL=([^\r\n]*)') { $Matches[1] } else { 'http://localhost:3001' }
if ($envContent -match 'NEXT_PUBLIC_API_URL=') {
    $envContent = $envContent -replace 'NEXT_PUBLIC_API_URL=[^\r\n]*', "NEXT_PUBLIC_API_URL=$apiTunnelUrl"
} else {
    $envContent = $envContent.TrimEnd() + "`nNEXT_PUBLIC_API_URL=$apiTunnelUrl`n"
}
[System.IO.File]::WriteAllText($envLocal, $envContent, [System.Text.UTF8Encoding]::new($false))
Write-Host "  .env.local updated: NEXT_PUBLIC_API_URL=$apiTunnelUrl" -ForegroundColor Green
Write-Host "  (will restore to: $originalApiUrl when demo ends)" -ForegroundColor DarkGray

Write-Banner "Building web app (pnpm build)..."
Write-Host "  This may take 30-60 seconds..." -ForegroundColor DarkGray
Push-Location "$root\apps\web"
pnpm run build
$buildExit = $LASTEXITCODE
Pop-Location

if ($buildExit -ne 0) {
    Write-Host "  ERROR: pnpm build failed (exit code $buildExit)." -ForegroundColor Red
    exit 1
}

Write-Banner "Starting web server in production mode (port 3000)..."
Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$root\apps\web'; pnpm run start"
Write-Host "  Waiting 5s for Next.js to start..." -ForegroundColor DarkGray
Start-Sleep 5

Write-Banner "Starting Cloudflare Tunnel for Web (port 3000)..."
Start-Process -FilePath $cfExe `
    -ArgumentList 'tunnel', '--url', 'http://localhost:3000' `
    -RedirectStandardError $cfWebLog `
    -WindowStyle Hidden

$webTunnelUrl = Wait-TunnelUrl -logFile $cfWebLog -timeoutSec 45
if (-not $webTunnelUrl) {
    Write-Host "  ERROR: Could not get Web tunnel URL. Check $cfWebLog" -ForegroundColor Red
    exit 1
}
Write-Host "  Web tunnel: $webTunnelUrl" -ForegroundColor Green

Write-Host ""
Write-Host "================================================" -ForegroundColor Green
Write-Host "  PURALOKA SUITE - DEMO READY" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Web App (bagikan link ini):" -ForegroundColor White
Write-Host "  >> $webTunnelUrl" -ForegroundColor Yellow
Write-Host ""
Write-Host "  API:" -ForegroundColor White
Write-Host "  >> $apiTunnelUrl" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Tekan Ctrl+C untuk stop semua tunnel." -ForegroundColor DarkGray
Write-Host "================================================" -ForegroundColor Green
Write-Host ""

try {
    while ($true) { Start-Sleep 60 }
} finally {
    Write-Host ""
    Write-Host "  Stopping all cloudflared processes..." -ForegroundColor Yellow
    Get-Process -Name 'cloudflared' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

    Write-Host "  Restoring .env.local to local dev URL..." -ForegroundColor Yellow
    $envContent = Get-Content $envLocal -Raw
    $envContent = $envContent -replace 'NEXT_PUBLIC_API_URL=[^\r\n]*', "NEXT_PUBLIC_API_URL=$originalApiUrl"
    [System.IO.File]::WriteAllText($envLocal, $envContent, [System.Text.UTF8Encoding]::new($false))
    Write-Host "  .env.local restored: NEXT_PUBLIC_API_URL=$originalApiUrl" -ForegroundColor Green
    Write-Host "  Done. Tunnel closed." -ForegroundColor Green
}
