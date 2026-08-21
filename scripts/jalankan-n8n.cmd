@echo off
REM ============================================================================
REM  n8n untuk PURALOKA — instance TERPISAH dari TJS
REM ============================================================================
REM
REM  Kenapa terpisah, dan kenapa itu bukan sekadar kerapian:
REM
REM  n8n yang jalan di :5678 adalah milik TJS (sudah punya akun pemilik sendiri).
REM  Kalau Puraloka memakainya, workflow dua perusahaan hidup di satu database —
REM  satu instance mati berarti DUA perusahaan berhenti, dan kredensial yang
REM  satu terlihat oleh yang lain di daftar Credentials.
REM
REM  Pemisahannya lewat N8N_USER_FOLDER. n8n membuat database.sqlite BARU di
REM  folder itu; karena kosong, ia menampilkan layar setup pemilik saat pertama
REM  dibuka. Akun Puraloka Anda buat DI SITU — bukan dicari di tempat lain.
REM
REM  Cara pakai: klik dua kali berkas ini, lalu buka http://localhost:5679
REM
REM  Sesudah akun jadi:  Settings -> n8n API -> Create an API key
REM  Kuncinya diisi di Puraloka: Pengaturan -> Kredensial -> N8N_API_KEY
REM  dan N8N_BASE_URL = http://localhost:5679
REM ============================================================================

REM  Folder data DI LUAR repo — sengaja.
REM
REM  `.n8n` berisi database.sqlite (workflow + kredensial tersandi) dan kunci
REM  enkripsinya. Menaruhnya di dalam repo membuatnya satu `git add -A` yang
REM  ceroboh dari masuk ke history — dan history tak bisa dibersihkan tanpa
REM  menulis ulang seluruh repo. Sudah masuk .gitignore juga, tapi dua lapis
REM  lebih baik daripada satu untuk hal yang tak bisa ditarik kembali.
REM  n8n menambahkan subfolder `.n8n` sendiri di dalam N8N_USER_FOLDER —
REM  jadi database.sqlite berakhir di `%USERPROFILE%\.n8n-puraloka\.n8n\`.
REM  Diukur, bukan diasumsikan.
set "N8N_USER_FOLDER=%USERPROFILE%\.n8n-puraloka"

REM  5680, bukan 5678 (UI TJS) dan bukan 5679.
REM
REM  5679 sempat dipakai di sini dan GAGAL: n8n memakainya sebagai port
REM  "Task Broker" internal — instance TJS sudah memegangnya, dan pesannya
REM  ("Task Broker's port 5679 is already in use") tak menyebut bahwa yang
REM  bentrok adalah port INTERNAL, bukan port UI. Diukur: 5680 bebas.
set "N8N_PORT=5680"

REM  Task Broker juga digeser — kalau tidak, instance kedua menabrak milik
REM  TJS lagi meski port UI-nya sudah beda.
set "N8N_RUNNERS_BROKER_PORT=5681"

REM  Zona waktu: cron "0 8 * * *" harus berarti jam 8 PAGI DI SINI, bukan UTC.
REM  Tanpa ini, pengingat invoice jatuh tempo terkirim pukul 15:00 WIB.
set "GENERIC_TIMEZONE=Asia/Jakarta"
set "TZ=Asia/Jakarta"

REM  Retensi eksekusi — DIPUTUSKAN spec 2026-08-22 §7.1.
REM
REM  Payload webhook sekarang membawa kredensial WA tenant (lihat
REM  terbit-peristiwa.ts, muatanWaPeristiwa()). Eksekusi SUKSES tak perlu
REM  disimpan sama sekali — otomasi_jalan di sisi Puraloka sudah jadi
REM  jejak UI utama dan TIDAK menyimpan payload rahasia (hanya status/
REM  durasi/pesan galat terpotong 300 karakter). Eksekusi GAGAL tetap
REM  disimpan penuh untuk didebug, tapi dipangkas otomatis lewat prune.
set "EXECUTIONS_DATA_SAVE_ON_SUCCESS=none"
set "EXECUTIONS_DATA_SAVE_ON_ERROR=all"
set "EXECUTIONS_DATA_PRUNE=true"
set "EXECUTIONS_DATA_MAX_AGE=72"

if not exist "%N8N_USER_FOLDER%" mkdir "%N8N_USER_FOLDER%"

echo.
echo  ================================================================
echo   n8n PURALOKA
echo  ================================================================
echo   Alamat : http://localhost:%N8N_PORT%
echo   Data   : %N8N_USER_FOLDER%\.n8n
echo   Zona   : Asia/Jakarta
echo.
echo   Pertama kali dibuka: n8n meminta Anda MEMBUAT akun pemilik.
echo   Itu akun Puraloka, terpisah dari n8n TJS di :5678.
echo  ================================================================
echo.

n8n start
