@echo off
REM ============================================================================
REM PENJADWAL LOKAL — denyut untuk otomasi terjadwal
REM ============================================================================
REM
REM Mengikuti pola `jalankan-n8n.cmd` dan `jalankan-evolution.cmd`: satu berkas
REM yang bisa diklik, tak perlu mengingat argumen apa pun.
REM
REM PRASYARAT: API harus hidup lebih dulu.
REM
REM     cd apps\api ^&^& npx tsx src/index.ts
REM
REM Skrip ini MENGUKUR sendiri port API-nya dari `apps/web/.env.local`
REM (`NEXT_PUBLIC_API_URL`) — bukan dari angka yang dipaku. CLAUDE.md section 7
REM mencatat empat jam habis karena port di dokumen berbeda dari yang benar-
REM benar dipakai.
REM
REM Denyut bawaan 15 menit. Tugas menentukan jam jalannya sendiri di tabel
REM `jadwal_tugas`; skrip ini hanya berdetak.
REM
REM Ctrl+C untuk berhenti.
REM ============================================================================

cd /d "%~dp0.."
node scripts\penjadwal-lokal.mjs %*
