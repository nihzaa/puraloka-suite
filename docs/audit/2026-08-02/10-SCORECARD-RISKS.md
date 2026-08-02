# 10 — PENILAIAN & PRIORITAS

Skala keras: **70 = benar-benar layak produksi**, bukan "lumayan".

## 10.1 Skor per dimensi

| Dimensi | Skor | Justifikasi + bukti |
|---|---:|---|
| **Arsitektur** | **72** | Batas modul jelas (49 route, 19 helper tenancy), disiplin ditegakkan mesin (ratchet CI), migrasi bertahap `supabase`→`request.db` (611 vs 364) yang **diukur**. Turun karena logic masih menumpuk di route dan `packages/shared` kosong. |
| **Kualitas Kode** | **68** | `TODO=0`, `console.log=7`, `strict:true` di kedua paket, idempotensi eksplisit (`approval.ts:115`). Turun karena 358 `any`, 130 `@ts-ignore`, 23 `catch {}` kosong. |
| **Keamanan** | **74** | RLS **122/122** + 375 policy, 193/198 endpoint ber-auth (97,5%), repo privat, nol secret ter-commit, 12 file uji jalur 403, rate limit teruji. Turun karena 53 role literal & 7 rute tanpa gerbang tenant. |
| **Database/Integritas** | **78** | **0 kolom float**, **100% `timestamptz`**, 505 index, 192 trigger, invarian di lapis DB. Turun karena buku migrasi meleset 12 versi (162 vs 174). |
| **API** | **65** | 198 endpoint, 286 `requirePermission`, versioning konsisten. Turun karena 23 modul tak terdokumentasi di CLAUDE.md, idempotency-key HTTP absen di pembayaran, konsistensi response tak terverifikasi. |
| **Frontend/UX** | **48** | Font non-generik, command palette, empty state 86%. Turun tajam: **1.039 hex ter-hardcode di 60 file**, skeleton hanya 10%, `useEffect` di 56/59 halaman, nol realtime/offline. |
| **Testing** | **80** | **1276 lulus / 1300**, 211 file test, uji yang langka (trigger yatim, catch senyap, RLS initplan, alur uang), golden file angka eksak lulus. Turun karena 1 suite gagal, 24 skip, coverage numerik tak diukur. |
| **CI/CD** | **82** | 10+ penjaga arsitektural di CI (gerbang tenancy, kegagalan senyap, penulisan tanpa periksa, migrasi sadar-schema, indeks docs). Ini **kelas industri**. Turun karena branch protection tak terverifikasi. |
| **Dokumentasi** | **55** | `STATUS.md`/`ROADMAP`/`PETA-PRIORITAS` mutakhir & jujur, 13 ADR, indeks dijaga CI. Turun tajam: **`CLAUDE.md` salah berat** (58 vs 174 migrasi, 27 vs 122 tabel) dan **worktree menduplikasi seluruh docs**. |
| **Kesiapan Produksi** | **45** | Nol data produksi, nol runbook/backup/DR/monitoring, buku migrasi meleset, `README` tak ada. Fondasi teknis kuat, operasional belum dimulai. |
| **Kesiapan Multi-tenant** | **52** | `companies`+`company_members` hidup, 42/122 tabel ber-`company_id`, 157/164 rute bergerbang, 6 test tenancy lulus. Turun karena **80 tabel sisa**, role global, nol billing/onboarding. |
| **Kesiapan AI** | **30** | Taksonomi bagus (cost codes, lessons-learned, RCA, produktivitas) = pondasi RAG. Turun karena **nol kode/dependency AI**, nol vector store, dan **data historis nyaris kosong** (journal 0 baris). |

### Skor tertimbang

Bobot: Keamanan & DB 1,5× · Arsitektur, Kode, Testing, Multi-tenant 1,25× · sisanya 1,0×.

**Rata-rata tertimbang ≈ 63 / 100.**

Artinya: **fondasi rekayasa di atas rata-rata, produk belum siap dijual.** Jarak ke 70
hampir seluruhnya ada di **Frontend/UX (48)**, **Kesiapan Produksi (45)**, dan **Dokumentasi (55)** —
bukan di inti teknisnya.

## 10.2 Top 15 risiko (dampak × kemungkinan)

| # | Risiko | Bukti | Dampak bila dibiarkan | Biaya sekarang vs 6 bulan |
|---|---|---|---|---|
| 1 | **80 tabel tanpa `company_id`** | 42/122 | Kebocoran data lintas-tenant saat tenant kedua lahir | **S–M sekarang** (0 data) vs **XL** (backfill tak lossless — ADR-011) |
| 2 | **53 role literal sebagai gerbang** | `cash.ts:511`, `kasbons.ts:135` | Role global `admin` bawa 95 permission ke company lain | M vs L (tiap modul baru menambah) |
| 3 | **Buku migrasi meleset 12 versi** | 162 vs 174 | `ci-project-setup` jalankan ulang migrasi RLS/backfill | **S** (alat sudah ada, tinggal `--tulis`) vs L |
| 4 | **1.039 hex ter-hardcode** | 60 file | White-label & dark mode mustahil | M vs XL (tiap halaman menambah) |
| 5 | **`CLAUDE.md` salah berat** | `:75,:93,:788` | Agent AI berhalusinasi tiap sesi | **S** (edit satu file) vs L |
| 6 | **Nol billing/subscription** | tak ada tabel | Tak bisa monetisasi; SaaS tanpa penagihan | M vs L |
| 7 | **`useEffect` di 56/59 halaman** | grep | UX "immersive" tak tercapai; refactor menyentuh semua halaman | L vs XL |
| 8 | **Idempotency-key absen di pembayaran** | tak ditemukan | Double-submit → pembayaran ganda | **S** vs XL (bila sudah ada uang nyata) |
| 9 | **Worktree menduplikasi docs** | `.worktrees/*` | Agent baca dokumen usang sebagai kebenaran | **S** vs M |
| 10 | **Nol runbook/backup/DR** | tak ada dokumen | Kehilangan data pelanggan tanpa prosedur pemulihan | M vs **XL** (setelah ada pelanggan) |
| 11 | **Nol data historis untuk AI** | journal 0 baris | Fitur AI menjawab percaya diri & salah | — (menunggu pemakaian nyata) |
| 12 | **Suite `multitenant-t3-rollback` gagal** | run 2026-08-02 | Penjaga rollback tenancy tak berjalan | **S** vs M |
| 13 | **Tak ada `group_id`** | tak ada | Konsolidasi lintas-PT butuh retrofit CoA | M vs L |
| 14 | **7 rute tanpa gerbang tenant** | audit-gerbang | `POST /mandor/kasbon-photo/upload` menulis tanpa saringan | **S** vs M |
| 15 | **23 `catch {}` kosong** | grep | Kegagalan senyap di jalur lapangan | S vs M |

## 10.3 Titik tanpa jalan kembali

Harus diputuskan **sebelum satu baris kode CECEP lagi ditulis**:

1. **Selesaikan `company_id` untuk 80 tabel sisa.** `journal_entries` kini **0 baris** —
   ini jendela termurah yang akan pernah ada, dan ADR-011 sudah menyatakan backfill
   berhenti lossless begitu ledger berisi dua entitas.
2. **Putuskan model grup/holding (`group_id`) sekarang** — karena menentukan bentuk CoA.
   Mengubah CoA setelah banyak tenant mengisinya adalah operasi paling mahal di ERP.
3. **Putuskan SSO: "ditunda" bukan "tak dibangun"** — sebelum arsitektur auth mengeras.
4. **Rekonsiliasi buku migrasi** sebelum ada lingkungan produksi yang membacanya.

## 10.4 Lima hal paling membanggakan (jujur)

1. **Penjaga arsitektural di CI.** `audit-kegagalan-senyap`, `audit-tulis-tanpa-periksa`,
   `audit-catch-senyap`, `audit-gerbang-tenancy` dengan ratchet numerik. Saya jarang
   melihat ini bahkan di tim berpuluh engineer. Ini mengubah disiplin dari niat jadi mesin.
2. **Integritas data yang benar sejak awal.** 0 kolom float, 100% `timestamptz`, 192 trigger,
   RLS 122/122. Dua kelas bug termahal di software finansial ditutup di lapis skema.
3. **Test yang mengumumkan dirinya hampa.** Guardrail PPN mencetak
   "⚠️ VACUOUS: 0 record ber-PPN → regresi TIDAK menguji data nyata" alih-alih lulus diam-diam.
   Ini kejujuran rekayasa tingkat tinggi.
4. **Golden file angka eksak.** `HSP=278300` dan RAB Cibuluh Rp 3,63 M dikunci sebagai
   assertion yang berjalan. Mesin estimasi diikat ke dokumen nyata, bukan ekspektasi karangan.
5. **Dokumen keputusan yang menyatakan dirinya menang atas yang lama.** ADR-011
   mengamandemen `KEPUTUSAN-MULTI-COMPANY.md` secara eksplisit lewat mekanisme tripwire
   yang dokumen lama itu sendiri rancang. Itu governance yang benar-benar bekerja.

## 10.5 Sepuluh rekomendasi urutan kerja

1. Perbaiki `CLAUDE.md` (S) — hentikan sumber halusinasi terbesar.
2. Jalankan `rekonsiliasi-schema-migrations.mjs --tulis` (S).
3. Hapus/abaikan `.worktrees/` dari jangkauan pencarian (S).
4. Perbaiki suite `multitenant-t3-rollback` (S).
5. Tambah idempotency-key pada endpoint pembayaran (S–M).
6. Tutup 7 rute tanpa gerbang tenant (S).
7. Klasifikasi + tambahkan `company_id` ke 80 tabel sisa (L) — **prioritas tertinggi bernilai**.
8. Hapus 53 role literal → `requirePermission` (L).
9. Putuskan `group_id` & bentuk CoA konsolidasi (M, keputusan founder).
10. Ekstrak 1.039 hex ke token desain + adopsi React Query (L–XL).
