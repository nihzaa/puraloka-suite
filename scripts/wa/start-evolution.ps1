# Puraloka Suite — nyalakan Evolution API (gateway WhatsApp)
#
# TERPISAH TOTAL dari Evolution milik TJS:
#   TJS       port 8080, database tjs_ai,      E:\Project\automation-tjs\evolution-api
#   Puraloka  port 8081, database puraloka_wa, E:\Project\puraloka-wa
#
# Keduanya boleh hidup bersamaan.
#
# ── Kenapa instalasinya di LUAR repo puraloka-suite
#
# Evolution + node_modules-nya 751 MB. Menaruhnya di dalam repo berarti
# `.gitignore` jadi satu-satunya yang mencegahnya ikut ter-commit — dan
# `.gitignore` bisa salah edit. Di luar repo, kesalahan itu mustahil.
#
# API key TIDAK dicetak di sini. Pelajaran dari TJS: berkas serupa di sana
# pernah memuat kuncinya secara literal, dan karena ter-track git, kuncinya
# ikut tersimpan di riwayat repo selamanya.

$ErrorActionPreference = 'Stop'
$AKAR = 'E:\Project\puraloka-wa'

if (-not (Test-Path "$AKAR\dist\main.js")) {
  Write-Host "Evolution belum ter-build di $AKAR" -ForegroundColor Red
  Write-Host "Jalankan dulu:" -ForegroundColor Yellow
  Write-Host "  cd $AKAR; npm install; npm run db:generate; npm run db:deploy:win; npm run build"
  exit 1
}

# Postgres wajib hidup — Evolution menyimpan sesi & pesan di sana, bukan di berkas.
$pg = Get-Service -Name 'postgresql*' -ErrorAction SilentlyContinue |
      Where-Object { $_.Status -eq 'Running' }
if (-not $pg) {
  Write-Host "Postgres tidak berjalan — Evolution akan gagal terhubung." -ForegroundColor Red
  Write-Host "Nyalakan servis postgresql-16 lebih dulu." -ForegroundColor Yellow
  exit 1
}

Write-Host "=== Evolution API — PURALOKA ===" -ForegroundColor Cyan
Write-Host "URL     : http://localhost:8081"        -ForegroundColor Green
Write-Host "Manager : http://localhost:8081/manager" -ForegroundColor Green
Write-Host "Database: puraloka_wa (terpisah dari TJS)" -ForegroundColor Green
Write-Host "API Key : lihat $AKAR\.env"             -ForegroundColor DarkGray
Write-Host "Ctrl+C untuk berhenti`n"

Set-Location $AKAR
node dist/main.js
