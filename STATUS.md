# STATUS — Puraloka Suite (penunjuk satu pintu)

**Diperbarui:** 2026-07-28 (rev-2: multi-tenant) · File ini adalah `STATUS.md` yang diwajibkan AUTOPILOT §2
— penunjuk TIPIS, bukan duplikasi konten. Update tanggal + baris "Fase aktif" setiap
kali keadaan berubah; detail selalu di dokumen rujukan.

## Fase aktif

> ### 🔄 PERUBAHAN ARAH BESAR — 2026-07-28
> **CECEP DITUNDA. Multi-tenant (Program D / L2→L3) jadi prioritas tunggal.**
>
> Pemicu: founder menetapkan sistem akan dijual sebagai **SaaS** (calon pelanggan
> konkret sudah ada) DAN akan ada **badan usaha kedua**. Ini memicu **kedua tripwire**
> di `docs/KEPUTUSAN-MULTI-COMPANY.md` §2 sekaligus.
>
> Keputusan lengkap + roadmap 8 tahap: **`.../Engineering-Constitution/adr/ADR-011-multi-tenant-strategy.md`** (ACCEPTED).
> Mandat "CECEP Option 2" (2026-07-26) **ditunda**, bukan dicabut — CECEP dilanjutkan
> setelah multi-tenant TUNTAS (bukan setengah matang).
>
> **Rasionalisasi founder:** sistem **belum dipakai operasional nyata (masih
> development)** → nol data produksi = waktu TERMURAH untuk retrofit pondasi.
> Titik-bocor #1 belum menimbulkan kerugian aktual.
>
> **GERBANG MUTLAK:** tenant kedua TIDAK BOLEH dibuat di produksi sebelum Tahap 4
> dan 5 selesai penuh. Selama itu sistem berisi tepat satu company.

**Program D — Multi-Tenant (AKTIF).** Tahap: T0 ADR ✅ → **T1 audit 94 tabel ✅** →
**T2 skema inti ✅ (migration 126)** → **T3 `company_id` ✅ (migration 127)** →
**T4 repository wrapper — FONDASI selesai, PERMUKAAN belum** → T5 RLS dual-axis → T6 numbering → T7 exit criteria L2.
CECEP langkah 7+ dilanjutkan **setelah T7**.

**T4 (wrapper) — status jujur per 2026-07-29:**
✅ **T4a fondasi**: `tenant-db.ts` (scope otomatis per kategori) · peta tenancy
**di-generate dari skema** (97 tabel, cocok persis dgn audit T1) · `request.db`
di auth plugin · **fix cache config per-company** (ADR sebut "bug yang AKAN
terjadi") · **migration 128** jaring pengaman (isi `company_id` saat INSERT,
TOLAK saat ambigu).
✅ **T4b–T4d**: `search` · `finance` · `dashboard` · `cash` · `kasbons` ·
`projects` · `reports` · `procurement` · `mandor`.
✅ **T4f penegak**: ratchet (akses supabase mentah tak boleh naik — **diuji
benar-benar menggigit**, bukan diasumsikan) + P3 (peta vs skema hidup; tabel
baru tanpa kategori = build merah).
🔴 **T4 BELUM SELESAI — audit keamanan independen 2026-07-29 menemukan permukaan
jauh lebih luas dari yang saya laporkan sebelumnya.** Detail lengkap + skenario
per-modul: **`.../adr/ADR-011-T4-AUDIT-CELAH-TENANCY.md`**.
Sisa: **478 akses `supabase` mentah** (dari 584). Modul yang seluruh filenya
belum ter-scope: `clients` (PII) · `audit` (jejak semua tenant) · `users`+`roles`
(mendekati account-takeover lintas tenant) · `settings` · `estimate-versions` ·
`documents` (signed URL 10 th ke kontrak tenant lain) · `termin-payment` ·
`lessons-learned`.
**Dua yang paling merugikan dan bukan sekadar 'baca':** `settings` — config
finansial DIPAKAI BERSAMA, tenant A mengubah tarif PPN **menimpa** tenant B
(korupsi data aktif) · `notification-routing` — notifikasi & **email** berisi
nama proyek/invoice/nominal tenant lain **didorong** ke admin yang salah.

**KEBOCORAN NYATA yang ditutup T4** (bukan hipotetis — ini query yang benar-benar
berjalan tanpa saringan tenancy): KPI halaman depan · 11 query dashboard
keuangan · AR aging · DP recoupment · arus kas · `invoices`+`milestones` di
search · daftar MR/PO/GR/stok · laporan proyek & mandor. Plus **3 celah akses
by-id**: `?project_id=` di arus kas & laporan, dan `MR/:id` + `PO/:id` yang
mengambil baris hanya dengan `.eq('id', …)` — data perusahaan lain terbaca
lengkap hanya dengan mengetahui id-nya.

**Dua temuan dari pembacaan dokumen perencanaan** (ADR-011 §10):
**R4** urutan di `plugins/auth.ts` load-bearing (resolusi company WAJIB sebelum
`loadPermissionCache`) — sudah benar tapi tak terdokumentasi; komentar
peringatan ditambahkan. · **R5 TERVERIFIKASI NYATA**: `auth_client_id()`
(049:23-28) memetakan user→client **tanpa saringan company**; sejak `clients`
jadi kategori B, satu orang yang jadi klien di 2 perusahaan bikin portal klien
menampilkan proyek perusahaan yang salah. **Wajib diperbaiki di T5.**

**T3 SELESAI (migration 127, applied ke dev 2026-07-29)** — 32 tabel dapat
`company_id`, 23.030 baris. Verifikasi: jumlah baris **tidak berubah** · nol NULL
di 20 tabel terkunci · **2.620 AHSP nasional tetap milik bersama** · angka bisnis
identik (kontrak 4,883 M · invoice 2,092 M · kas 222 jt). **Dua pengaman disentuh
atas keputusan founder, bukan tafsiran saya:** segel append-only `audit_logs`
(073) dibuka sekali lalu dipasang kembali + dicek eksplisit, dan gerbang
immutability komponen CECEP (107) dilonggarkan **permanen tapi sempit** — hanya
`company_id`; ubah koefisien/resource pada assembly aktif TETAP ditolak. Bukti
keempat pengaman masih menolak: diuji langsung di dev. 43 test hijau.
Detail: `.../adr/ADR-011-T3-AUDIT-PRA-EKSEKUSI.md` §10.

**T1 — 3 temuan yang mengubah rencana** (`.../adr/ADR-011-T1-AUDIT-KLASIFIKASI-TABEL.md`):
**F1** 7 tabel PUNYA jalur ke `projects` tapi rantainya LEMAH (FK nullable) → tak
bisa mewarisi tenancy. Bukan cacat: `cash_accounts.project_id` nullable karena
memang ada kas tingkat perusahaan (40% data dev). · **F2** policy RLS nyata **198**,
bukan 293 seperti tertulis di ADR. · **F3** **8 tabel RLS-nya ENABLED tapi NOL
policy** (`rab_items`, `rab_schedule`, `rab_absorption_log`, `change_orders`,
`change_order_items`, `work_scope_item_specs`, `document_access_logs`,
`company_profile`) — karena RESTRICTIVE di-AND dengan hasil OR permissive, nol
permissive = tabel TAK TERBACA begitu RLS ditegakkan. Dibuktikan empiris.
Maka T5 wajib didahului **T5a-0**. Klasifikasi final: **32 tabel** dapat kolom
`company_id` di T3 (1 anchor + 11 AB + 17 B + 3 dari D); 48 mewarisi; 12 bersama.

**T2 — migration 126 applied ke dev** (additive murni, nol ubah data existing):
`companies` + `company_members` + `document_number_series` + `auth_company_id()`
+ `is_member_of()`. Tenant pertama di-seed **dibaca dari `company_profile`**
(`puraloka-persada`), 23 user jadi anggota dengan **peran dipertahankan persis**
(0 divergensi vs `users.role_id`). 20 test hijau, termasuk penjaga P1:
`auth_company_id()` mengembalikan NULL saat tak dapat ditentukan — **tidak** jatuh
ke "satu-satunya company yang ada". `project_company_id()` sengaja **ditunda ke
T3** (butuh `projects.company_id`; dry-run membuktikan membuatnya sekarang =
migrasi gagal).

**Tiga penajaman wajib (ADR-011 §9.5, masuk DoD tahapnya masing-masing):**
**P1** company pertama = tenant biasa (nol `DEFAULT_COMPANY_ID`, nol cabang
"kalau cuma satu company") → T2 · **P2** isolasi dibuktikan sebelum tenant kedua
nyata via fixture TENANT-A/B + **uji kill-switch** (matikan wrapper → test tetap
hijau karena RLS, dan sebaliknya; kalau merah berarti lapisnya cuma satu) → T5b ·
**P3** tabel ke-95 tak bisa lahir tanpa klasifikasi (CI merah kalau tabel di
schema tak ada di peta kategori) → T4a.

**Phase 3 / Program C (CECEP) — DITUNDA di langkah 6 (hasil 1–6 TETAP UTUH & dipakai).**
migration 102–123, 72 test-file hijau (PR #86–101). Langkah 1/3/4/5/6 ✅ selesai;
langkah 7 (RAP/Pagu) **ditahan** — ia commitment ledger, wajib menunggu multi-tenant
(tripwire #1). Kompensasi: RAP nanti lahir dengan `company_id` sejak baris pertama
→ nol backfill. **Syarat lanjut CECEP: multi-tenant TUNTAS** (seluruh checklist L2
doc 09 §2 tercentang), bukan sekadar "tahapnya sudah dikerjakan".

**Build order 10 langkah (`.../CECEP/MATERIAL-RAP-COMPANY-UI-DESIGN.md`) — status
per-langkah, verified 2026-07-26/28:**
- ✅ **1** CI isolation tuntas (project CI terpisah; repo public + branch protection)
- 🟡 **2** Config Lapis1/2 — PPN reuse (`tax.ppn_rate` existing); **BUK & rounding
  BELUM di-config**, masih wajib eksplisit per-request (C1, tanpa default diam-diam)
- ✅ **3** Metode per-estimasi + wiring engine↔config (engine paritas nyambung)
- ✅ **4** Seed AHSP nasional PENUH: 2.620 assemblies (SE-47-2026) + 2.429 resources +
  15.149 komponen, terverifikasi 100% struktural (dataset↔DB↔workbook, nol mismatch)
  + fungsional (2.573 HSP cocok persis vs F workbook; 42 selisih = cacat internal
  workbook terdokumentasi, bukan bug pipeline). Idempotent — re-import file sama =
  no-op aman
- ✅ **5** Endpoint hitung RAB end-to-end + golden-file (HSP 278300, dari data dev)
- ✅ **6 Material Take-off SELESAI** — D2 agregasi lintas item (PR #98: satu baris
  per resource + drill-down provenance) · D3 BBS besi per-Ø + D4 katalog profil baja
  + D5 faktor kemasan (PR #100, migration 122/123: `rebar_takeoff`, `steel_profiles`
  58 profil ter-seed dari DAFTAR BESI verbatim, `material_pack`). Konstanta besi
  0,006165 diverifikasi = turunan fisika (ρ7850×π/4÷1e6) DAN cocok tabel baku SNI.
  **Titik-bocor #1: sisi take-off tertutup; pagu (langkah 7) masih terbuka**
- ❌ **7 RAP/Pagu** + sambung realisasi — **0 tabel, BELUM DIMULAI** (butuh 6 tuntas)
- 🟡 **8** AHSP Company: struktur DB ada sejak 107/117 · endpoint create-assembly
  hidup (PR #96) · **KATALOG COMPANY TER-SEED** (PR #101): 417 analisa Cibuluh +
  2.682 koefisien, verifikasi DB 100% nol-mismatch, idempoten. Paritas 87,1%
  (metode Cibuluh terverifikasi: BUK 10% → TRUNC Rp10 pada TOTAL, bukan per-kolom;
  status per-analisa TERSIMPAN: exact 366 / cacat-SUM-workbook 39 / unexplained 6).
  **Belum ada**: tombol Edit (correction/deviation) & Duplikat national→company di UI
- ⏸️ **9** dpp_factor split PPN — sengaja ditunda (gerbang D10, butuh guardrail
  di-run ulang di env ber-PPN nyata + aba-aba founder)
- 🟡 **10** UI `/estimasi` (Komposer+Katalog+Harga+rekap-PPN) hidup; **layar
  Material/RAP belum ada**

**Rantai "bikin RAB dari UI" hidup end-to-end** (langkah 1/3/4/5 + sebagian 2/8/10):
proyek → skenario → versi (menyatakan edisi) → item dari **katalog** / **custom
company mid-estimasi** (§2.2, menyentuh gerbang immutability `assemblies`, ditutup
approval desain) / **lump-sum** (§2.3, pekerjaan bukan-beranalisa) → price book
(lifecycle draft→verified→active) → engine paritas → **rekap per kategori + PPN**
→ Ajukan. Tiap rupiah ter-telusur ke `price_book_entry_id` + koefisien + edisi.

**PR #86–96 merged** (sumbu edisi 117/118 · thin-slice+seed penuh · price-resolver
+ compute path · scenario/price-book endpoints · UI 3-tab · rekap+PPN · polish
harga · item-custom/lump-sum). Analisis SE47-vs-Cibuluh selesai (report untracked
— nunggu keputusan masking; temuan: SE = SNI-2013 modernisasi, upah −33%, mortar
M/S/N/O = 1:2/3/4/5). AI-import edisi baru (masa depan) = inisiatif terpisah, tak
bertabrakan (parser+auditor, bukan penghasil angka) — lihat plan
`humming-weaving-snail.md`.

**Katalog AHSP di dev (terverifikasi 2026-07-28):** 2.620 nasional (SE-47-2026) +
418 company (417 Cibuluh + 1 fixture) · 2.827 resources · 58 profil baja.

**Prioritas CECEP SETELAH multi-tenant tuntas** (bukan sekarang — lihat kotak
perubahan arah di atas): langkah 7 (RAP/Pagu, D6) — `rap_budget` /
`rap_material_line` / `rap_labor_line` / `rap_change_log` + kunci pagu, **lahir
dengan `company_id` sejak baris pertama**. Lalu langkah 8 (UI builder AHSP company:
edit + duplikat — jadi jauh lebih bermakna pasca-multi-tenant karena
`source='company'` akhirnya punya arti "company yang mana") & 10 (layar Material/RAP).

Sisipan saat jeda gate (sesuai PETA §3, tidak menyela CECEP):
- **#2 celah 3-way match procurement DITUTUP 2026-07-27** (invoice manual wajib
  link GR, harga vs PO, anti invoice dobel + migration 121) — detail:
  `docs/DEVELOPMENT_LOG.md` entry 2026-07-27 + taksonomi §6.
- **#3 register piutang SELESAI 2026-07-28** — halaman `/piutang` (AR aging
  30/60/90 + register retensi + register DP) + potongan uang muka (recoupment)
  di invoice progres (migration 126/125) — detail: `docs/DEVELOPMENT_LOG.md`
  entry 2026-07-28 + taksonomi §14–15. ⚠️ Melahirkan keputusan terbuka #5.

Phase 1 (Program A) ✅ · Phase 2 (Program B) ✅.

## Ke mana membaca apa

| Butuh | Baca |
|---|---|
| Log berjalan harian (per-migration/PR) | `docs/DEVELOPMENT_LOG.md` |
| Peta prioritas + registry semua dokumen rencana (mana AKTIF/STALE) | `docs/PETA-PRIORITAS-ERP.md` ← **dokumen induk** |
| Status per-menu ERP terverifikasi kode | `docs/ERP-KONTRAKTOR-TAKSONOMI-MENU.md` |
| Strategi multi-tenant (AKTIF, ACCEPTED) | `.../Engineering-Constitution/adr/ADR-011-multi-tenant-strategy.md` |
| Klasifikasi 94 tabel A/AB/B/C/D + 3 temuan T1 | `.../Engineering-Constitution/adr/ADR-011-T1-AUDIT-KLASIFIKASI-TABEL.md` |
| Keputusan multi-company + tripwire (SUPERSEDED oleh ADR-011) | `docs/KEPUTUSAN-MULTI-COMPANY.md` |
| Status Phase 1/2 + temuan RLS/storage | `docs/superpowers/specs/2026-07-18-enterprise-architecture/PHASE-{1,2}-STATUS.md` |
| Urutan build CECEP (terkunci, 10 langkah) | `.../CECEP/MATERIAL-RAP-COMPANY-UI-DESIGN.md` + `.../CECEP/NEXT-EXEC-PREP.md` |
| Peta penomoran Program A–F ↔ Phase 0–9 | `.../Master-Delivery-Blueprint/NUMBERING-GLOSSARY.md` (⚠️ "Phase 7" EA = multi-company; "Fase 7" ERP_MASTER_PLAN = GL — selalu sebut sumber) |

## Keputusan terbuka menunggu Nizar

~~**A. "≥2 kontributor review"**~~ — **TERJAWAB 2026-07-28**: ack tertulis founder +
   **Dokumen Audit Pra-Eksekusi** wajib untuk T3 & T5 (diff lengkap · angka
   sebelum/sesudah hasil dry-run · rencana rollback teruji · daftar yang TIDAK
   diverifikasi). Pengecualian diakui sadar. Detail: ADR-011 §10 R7.
**B. (tidak memblokir) Pelanggan pertama punya >1 badan usaha?** Menentukan
   apakah butuh level `tenants` di atas `companies` sekarang atau cukup nanti.
   Default sementara: cukup `companies` + `parent_company_id`. ADR-011 §3.

~~**C. Ack + 2 jawaban T3**~~ — **TERJAWAB 2026-07-29** (Q1=privat, Q2=sekarang;
   plus 2 keputusan gerbang di §10b dokumen). T3 SELESAI di-apply ke dev.
   Rincian lama:
   **`.../adr/ADR-011-T3-AUDIT-PRA-EKSEKUSI.md`** (baca §0 ringkasan 1 menit →
   §5 apa yang bisa rusak → §7 yang tidak diverifikasi). Angka nyata: **32 tabel,
   23.030 baris** (2.180 → tenant-1; 20.850 sengaja tetap NULL = milik bersama,
   termasuk 2.620 AHSP nasional yang TIDAK boleh jadi milik satu pelanggan).
   Dua pertanyaan yang harus dijawab dulu:
   **Q1** `suppliers` bersama atau **privat**? (rekomendasi saya: **privat** —
   relasi supplier = rahasia dagang; salah ke arah "terlalu terbuka" jauh lebih
   sulit diperbaiki setelah pelanggan kedua masuk. Cuma 5 baris: murah sekarang)
   · **Q2** `SET NOT NULL` **sekarang** atau setelah T4? (rekomendasi: sekarang —
   error di dev = informasi murah, konsisten P1).
   **Tanpa ack, T3a/T3b/T3c tidak dijalankan.**

**Mandat eksekusi (founder 2026-07-28):** T1 & T2 otonom ✅ **SELESAI**.
Berhenti di gerbang T3 sesuai rencana — menunggu keputusan C.

0. **KEAMANAN (mendesak, repo public):** rotasi 4 password test yang sempat bocor di
   `gate-1a-preconditions-response.md` (sudah diredaksi; nilai asli tetap di riwayat
   git) — terutama login admin dev.
1. Masking angka Cibuluh di dokumen public (4 baris AHSP-GOLDEN-PROVENANCE +
   report SE47-vs-Cibuluh yang masih untracked).
1b. Drop policy dev `"Allow all access on users"` (only-in-dev, permisif, tanpa
   migrasi pembuat — temuan schema-diff 4a) + konfirmasi migrasi 043–047
   (GL/asset/opname/SCM) tetap forward-draft.
1c. Izin A5 `--execute`: schema `test` residu di dev + residu CECEP
   (570 estimate_items dll — dry-run sudah dilaporkan).
2. GL in-app vs akuntansi eksternal (`docs/PETA-PRIORITAS-ERP.md` §5).
3. Entitas PT/CV kedua realistis 1–2 tahun? (`docs/KEPUTUSAN-MULTI-COMPANY.md` §2).
4. Aktifkan trigger audit append-only 073 (Red-Line by design).
5. **Pajak atas potongan DP** (baru 2026-07-28): saat DP dipotong di invoice
   progres, pajak invoice progres saat ini tetap dihitung dari nilai progres
   PENUH (sebelum potongan DP) — konsisten kalkulasi existing, TIDAK diubah.
   Porsi DP sudah kena pajak saat invoice DP diterbitkan → berpotensi pajak
   dobel atas porsi DP. Perlu keputusan owner + konfirmasi konsultan pajak:
   DPP invoice progres = nilai progres penuh ATAU dikurangi potongan DP.
   (`docs/DEVELOPMENT_LOG.md` entry 2026-07-28.)
