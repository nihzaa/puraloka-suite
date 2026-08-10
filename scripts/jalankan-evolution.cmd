@echo off
setlocal
REM ============================================================================
REM  EVOLUTION API — PURALOKA (port 8081)
REM ============================================================================
REM
REM  Dijalankan dengan `tsx`, sama seperti instance TJS — Evolution di mesin
REM  ini adalah paket Node biasa, bukan Docker.
REM
REM  Sesudah jalan:
REM    Manager  http://localhost:8081/manager
REM    Webhook  http://localhost:3007/api/v1/wa/webhook   (daftarkan di Manager)
REM
REM  Nomor WhatsApp dipindai dari Manager. Pakai nomor yang BERBEDA dari TJS —
REM  satu nomor tak bisa terhubung ke dua instance sekaligus.
REM ============================================================================

set "DIR=%~dp0..\evolution-api"

if not exist "%DIR%" (
  echo  [x] Belum disiapkan. Jalankan dulu: scripts\siapkan-evolution.cmd
  goto :akhir
)

if not exist "%DIR%\node_modules" (
  echo  [x] Dependensi belum dipasang. Jalankan:
  echo      cd /d "%DIR%" ^&^& npm install
  goto :akhir
)

REM  Menolak jalan kalau kuncinya masih kosong.
REM
REM  Evolution TETAP MAU START tanpa AUTHENTICATION_API_KEY, dan itu masalahnya:
REM  ia jadi terbuka tanpa autentikasi di jaringan lokal, tanpa satu pun
REM  peringatan. Lebih baik gagal di sini dengan sebab yang jelas.
findstr /B /C:"AUTHENTICATION_API_KEY=" "%DIR%\.env" | findstr /R "=.\+" >nul
if errorlevel 1 (
  echo  [x] AUTHENTICATION_API_KEY masih kosong di %DIR%\.env
  echo.
  echo      Evolution tetap mau start tanpa itu — dan jadi terbuka tanpa
  echo      autentikasi. Isi dulu; buat yang acak:
  echo        powershell -c "[guid]::NewGuid().ToString('N')"
  goto :akhir
)

echo.
echo  ================================================================
echo   EVOLUTION API — PURALOKA
echo   Manager : http://localhost:8081/manager
echo  ================================================================
echo.

cd /d "%DIR%"
npx tsx ./src/main.ts

:akhir
endlocal
pause
