# Prompt untuk sesi ASISTEN — salin seluruh blok di bawah

> Dibuat 2026-08-16 atas permintaan founder: pekerjaan asisten dipisah ke sesi
> sendiri, sementara sesi lain melanjutkan rute otomasi terjadwal.
>
> **Yang paling penting di prompt ini bukan daftar tugasnya, melainkan BATAS
> BERKAS.** Dua sesi berbagi satu checkout `E:\Project\puraloka-suite`. Pada
> 2026-08-06 hal itu terjadi tiga kali dalam satu hari dan menghapus kerja yang
> belum di-commit. CHARTER §8a.1 menjadikannya syarat berhenti nomor satu.

---

```
Kerjakan TOOL BACA ASISTEN untuk Puraloka Suite. Baca dulu CLAUDE.md dan
docs/execution/CHARTER.md — cara kerja default repo ini (autopilot, wajib
test + audit tiap sektor, dokumen tak boleh tertinggal) berlaku penuh.

═══════════════════════════════════════════════════════════════════════════
⚠ ADA SESI LAIN BERJALAN DI CHECKOUT YANG SAMA
═══════════════════════════════════════════════════════════════════════════

Sesi lain sedang mengerjakan RUTE OTOMASI TERJADWAL. Kalian berbagi satu
folder kerja. Aturan mengikat:

BERKAS ANDA (bebas diubah):
  apps/api/src/lib/ai-tool-*.ts
  apps/api/src/lib/__tests__/ai-tool-*.test.ts
  apps/api/src/routes/v1/ai-*.ts
  apps/api/src/routes/v1/__tests__/ai-*.test.ts

BERKAS SESI LAIN — JANGAN SENTUH:
  apps/api/src/routes/v1/otomasi-terjadwal.ts
  apps/api/src/routes/v1/__tests__/otomasi-terjadwal.test.ts
  apps/api/src/lib/ambang-otomasi.ts
  apps/api/scripts/audit-*.mjs

BERKAS BERSAMA — commit HANYA baris Anda sendiri, pakai `git commit --only`:
  apps/api/src/lib/katalog-otomasi.ts
  docs/execution/QUEUE.yaml
  docs/execution/JOURNAL.md
  CLAUDE.md

JANGAN PERNAH memakai `git stash`, `git checkout -- .`, `git reset --hard`,
atau `git clean`. Semuanya menghapus kerja sesi lain tanpa peringatan —
`git stash push` sudah pernah menghapus dua berkas berisi 487 baris di repo
ini. `git stash` BUKAN perintah baca.

Untuk melihat isi berkas versi lama: `git show HEAD~1:path/ke/berkas`.

═══════════════════════════════════════════════════════════════════════════
YANG DIKERJAKAN
═══════════════════════════════════════════════════════════════════════════

Asisten WhatsApp/chat punya 31 tool. Galian di
docs/execution/GALIAN-92-OTOMASI.md §4 mengukur 36 nomor katalog lagi yang
bisa jadi TOOL BACA (bukan rute terjadwal). Kerjakan berurutan menurut
kelompok, mulai dari yang paling sering ditanya:

  Pemilik/eksekutif (13) 1.15 2.4 2.15 2.17 2.18 8.1 8.2 8.3 8.4 8.5 8.7 8.8 8.9
  Operasional proyek (8) 1.9 3.13 3.20 5.2 5.5 5.8 7.4 8.10
  Pengadaan (5)          4.2 4.4 4.7 4.14 9.3
  SDM & alat (7)         6.5 6.10 6.12 8.13 10.1 10.5 8.6
  Kemampuan asisten (3)  1.12 klarifikasi multi-giliran · 1.13 serah ke
                         manusia · 2.8 hitung pajak per invoice

Judul tiap nomor ada di
docs/superpowers/specs/2026-07-18-enterprise-architecture/06-agentic-ai-and-automation-architecture.md

⚠ Kolom N/N/L/O di dokumen itu adalah PRIORITAS (Now/Next/Later/Optional),
BUKAN status pengerjaan. Salah baca ini sudah memakan biaya dua kali.

═══════════════════════════════════════════════════════════════════════════
CARA MENGUKUR — JANGAN PERCAYA ANGKA DI DOKUMEN MANA PUN
═══════════════════════════════════════════════════════════════════════════

# tool yang sudah ada
grep -c "nama: '" apps/api/src/lib/ai-tool-siapkan.ts

# port API — UKUR, jangan percaya tabel. Nilai berbeda sudah memakan 4 jam.
cd apps/api && node scripts/audit-port-api-cocok.mjs

# skema — sumber angka KANONIK, skrip sekali-pakai dilarang jadi sumber
node scripts/db/introspect.mjs columns
node scripts/db/introspect.mjs tables

SEBELUM menulis tool apa pun: ukur dulu tabelnya BENAR-BENAR berisi apa.
Berkali-kali di repo ini nama kolom yang ditebak ternyata salah dan querynya
memulangkan nol baris TANPA GALAT — mis. `insiden_jenis` yang sebenarnya
`jenis_insiden`, dan `status_risiko` yang nilainya `terjadi|terpantau|tertutup`
bukan `ditutup|selesai|batal`. Tool yang selalu menjawab "tidak ada data"
terlihat persis seperti tool yang bekerja.

═══════════════════════════════════════════════════════════════════════════
SYARAT SELESAI (CHARTER §7 + §8a.2 — tidak bisa ditawar)
═══════════════════════════════════════════════════════════════════════════

1. Tiap tool punya test yang BENAR-BENAR dijalankan, ringkasannya ditempel.
2. Tiap tool baru diuji lewat MUTASI: rusakkan sengaja → test MERAH →
   pulihkan → HIJAU. Test yang tak pernah merah adalah hiasan.
3. `requirePermission` wajib, literal peran ('admin'/'pm') DILARANG (ADR-004).
   Kunci izin wajib ada di tabel `permissions` — dijaga
   `audit-izin-benar-ada.mjs`, ambang NOL.
4. Akses data lewat `request.db`, bukan `supabase` mentah.
5. Baca tabel besar WAJIB berhalaman `.range()` — PostgREST memotong senyap
   di 1.000 baris. Dijaga `audit-baca-tak-terpotong.mjs`, ambang NOL.
6. Tool BACA tak boleh menulis. Kalau ada jalur tulis, ia tunduk gerbang
   token+konfirmasi yang sudah ada (`ai-tool-setujui.ts`) — jangan bikin baru.
7. Jalankan penjaga terkait dan tempel exit code-nya:
     cd apps/api
     node -r dotenv/config scripts/audit-izin-benar-ada.mjs
     node -r dotenv/config scripts/audit-kredensial-tak-bocor.mjs
     node -r dotenv/config scripts/audit-jenis-notifikasi-punya-aturan.mjs
     node scripts/audit-kegagalan-senyap.mjs
     node scripts/audit-catch-senyap.mjs
     pnpm lint:ratchet
8. Perbarui dokumen di commit yang SAMA: katalog-otomasi.ts (nomornya!),
   QUEUE.yaml, JOURNAL.md.

⚠ Nomor katalog TIDAK BOLEH KEMBAR. Penghitungan kemajuan memakai himpunan
nomor, jadi dua tool bernomor sama tercatat sebagai satu — dan satu baris
rencana terlihat selesai oleh pekerjaan yang isinya lain. Ini baru terjadi
(9.1 dipakai dua entri) dan diperbaiki 2026-08-16. Cek sebelum commit:

  node -e "const s=require('fs').readFileSync('apps/api/src/lib/katalog-otomasi.ts','utf8').replace(/\/\*[\s\S]*?\*\//g,'');const n=[...s.matchAll(/nomor: '([\d.]+)'/g)].map(m=>m[1]);const h={};for(const x of n)h[x]=(h[x]||0)+1;console.log(Object.entries(h).filter(([,c])=>c>1))"

(Lucuti komentar dulu — penghitung tanpa itu membaca contoh di dalam komentar
sebagai kode dan melapor kembar yang sudah tidak ada.)

═══════════════════════════════════════════════════════════════════════════
BERHENTI HANYA UNTUK LIMA HAL (CHARTER §8a.1)
═══════════════════════════════════════════════════════════════════════════

1. Ada tanda sesi lain menulis: berkas hilang padahal `git status` bersih,
   commit muncul yang bukan buatan Anda.
2. Akan menghapus/menimpa kerja yang belum di-commit.
3. Migrasi destruktif (DROP, truncate, backfill tak bisa mundur).
4. Butuh keputusan founder → tulis di RATIFIKASI.md, jangan ditebak.
5. Gerbang Keras: G-2 buku migrasi, G-5 pelemahan penjaga.

Di luar lima itu: jalan terus, jangan tanya "lanjut?".
```
