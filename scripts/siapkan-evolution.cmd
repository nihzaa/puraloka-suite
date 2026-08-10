@echo off
setlocal
REM ============================================================================
REM  EVOLUTION API untuk PURALOKA — instance TERPISAH dari TJS
REM ============================================================================
REM
REM  Kenapa TIDAK boleh menumpang instance TJS di :8080
REM
REM  Instance itu ber-clientName `evolution_tjs` dan punya webhook yang
REM  menunjuk ke TJS. Kalau Puraloka memakainya:
REM
REM    - pesan masuk untuk Puraloka dikirim ke webhook TJS
REM    - satu nomor WhatsApp dipakai dua perusahaan
REM    - riwayat chat dua perusahaan bercampur di satu database
REM
REM  Tak satu pun dari itu mengeluarkan galat. Ia hanya salah, diam-diam.
REM
REM  ── Yang dilakukan skrip ini
REM
REM  Menyalin kode Evolution (dari instalasi TJS, karena ia hanya paket Node
REM  biasa — bukan Docker) ke folder Puraloka, lalu MENGOSONGKAN env-nya
REM  supaya Anda mengisi sendiri. Kunci TJS TIDAK ikut disalin: memakai ulang
REM  kunci antar-instance membatalkan gunanya memisahkan mereka.
REM
REM  Jalankan SEKALI. Sesudah itu pakai `jalankan-evolution.cmd`.
REM ============================================================================

set "SUMBER=E:\Project\automation-tjs\evolution-api"
set "TUJUAN=%~dp0..\evolution-api"

if not exist "%SUMBER%" (
  echo  [x] Kode Evolution tak ditemukan di:
  echo      %SUMBER%
  echo.
  echo      Kalau Evolution Anda ada di tempat lain, sunting SUMBER di berkas ini.
  goto :akhir
)

if exist "%TUJUAN%" (
  echo  [!] %TUJUAN% sudah ada — tidak ditimpa.
  echo      Hapus foldernya dulu kalau memang mau menyiapkan ulang.
  goto :akhir
)

echo  Menyalin kode Evolution ^(tanpa node_modules dan tanpa .env^)...
robocopy "%SUMBER%" "%TUJUAN%" /E /XD node_modules .git dist /XF .env /NFL /NDL /NJH /NJS /NP >nul

REM  .env DIKOSONGKAN, bukan disalin. Kunci TJS di instance Puraloka berarti
REM  siapa pun yang punya kunci TJS bisa mengirim WhatsApp atas nama Puraloka.
(
  echo # ── Evolution API — PURALOKA ────────────────────────────────────────
  echo #
  echo # Diisi TANGAN. Jangan menyalin nilai dari instance TJS: kunci yang
  echo # sama di dua instance membatalkan gunanya memisahkan mereka.
  echo.
  echo SERVER_PORT=8081
  echo.
  echo # Kunci global Evolution. Buat yang PANJANG dan acak — ia setara
  echo # password untuk mengirim WhatsApp atas nama perusahaan ini.
  echo # Contoh cara membuat: powershell -c "[guid]::NewGuid().ToString('N')"
  echo AUTHENTICATION_API_KEY=
  echo.
  echo # Nama yang muncul di ponsel saat memindai QR.
  echo CONFIG_SESSION_PHONE_CLIENT=evolution_puraloka
  echo CONFIG_SESSION_PHONE_NAME=Chrome
  echo.
  echo # Database SENDIRI. Berbagi database dengan TJS membuat sesi dan
  echo # riwayat chat dua perusahaan bercampur.
  echo DATABASE_PROVIDER=postgresql
  echo DATABASE_CONNECTION_URI=
  echo DATABASE_CONNECTION_CLIENT_NAME=evolution_puraloka
  echo.
  echo # Webhook: ke API Puraloka, bukan TJS.
  echo # Nilainya didaftarkan lewat Evolution Manager sesudah instance jalan:
  echo #   http://localhost:3007/api/v1/wa/webhook
) > "%TUJUAN%\.env"

echo.
echo  ================================================================
echo   Selesai. Yang HARUS Anda isi di:
echo   %TUJUAN%\.env
echo.
echo     AUTHENTICATION_API_KEY   ^(buat baru, jangan pakai punya TJS^)
echo     DATABASE_CONNECTION_URI  ^(database sendiri^)
echo.
echo   Lalu: cd evolution-api ^&^& npm install
echo   Lalu: scripts\jalankan-evolution.cmd
echo  ================================================================

:akhir
endlocal
pause
