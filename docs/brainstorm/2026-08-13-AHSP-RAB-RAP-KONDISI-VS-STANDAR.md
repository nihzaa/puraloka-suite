# AHSP · RAB · RAP — kondisi terukur vs cara perusahaan besar menanganinya

> **Berkas ini adalah BAHAN BRAINSTORM, bukan rencana.** Ia menjawab satu
> pertanyaan: *"kita sekarang di mana, dan orang lain di posisi ini melakukan
> apa?"* — supaya sesi brainstorm berikutnya berangkat dari kenyataan, bukan
> dari ingatan.
>
> Diukur 2026-08-13. Tiap angka punya sumbernya (`file:line` atau perintah).
> **Angka membusuk** — sebelum memakainya, ukur ulang:
>
> ```bash
> node scripts/db/introspect.mjs tables
> grep -c "it(" apps/api/src/lib/__tests__/*.test.ts
> ```

---

## 0. Ringkasan satu halaman

Yang **sudah ada** jauh lebih banyak daripada yang biasanya diduga: rantai
`scenarios → estimate_versions → estimate_items → assemblies → resources ←
price_book_entries` lengkap, dengan transisi status ditegakkan **trigger
basis** (bukan hanya endpoint), approval berjenjang ber-SoD, dan provenance
harga yang fail-loud ketika harga tak ketemu.

Yang **belum**, dan ini pola yang berulang: bukan modul yang kurang, melainkan
**jembatan antar-modul yang tak pernah dilewati**. Tiga contoh terukur:

| Yang ada | Yang tak terjadi |
|---|---|
| `estimate_items.cbs_node_id` & `wbs_node_id` diterima API | UI 4.057 baris **tak pernah mengirimnya** — nol pemilih CBS/WBS |
| `productivity_records` + guard immutable lengkap | **Nol endpoint** membacanya; tak tersambung ke perhitungan HSP mana pun |
| Status `frozen`/`superseded` punya CHECK, trigger, warna UI | **Nol endpoint** menuliskannya — estimasi mentok di `approved` selamanya |

Dan satu bug yang sudah diperbaiki saat pengukuran ini (commit `b0151fac`):
pembaca `hsp_snapshot` mencari kunci `result` yang tak pernah ada, sehingga
komponen biaya di `rab_items` **selalu nol**.

---

## 1. Rantai data yang sudah berdiri

```
projects
 └── scenarios ──────────────── estimate_versions ── estimate_items
       (tender / rap / dst)      (edition_id, markup)   │ cost_code_id  WAJIB
                                  status: draft →       │ assembly_id   opsional
                                  under_review →        │ cbs_node_id   TAK PERNAH DIISI UI
                                  approved →            │ wbs_node_id   TAK PERNAH DIISI UI
                                  frozen ✗ →            │ hsp_snapshot  1 dari 1.591 terisi
                                  superseded ✗          │
                                                        ▼
                            assemblies ── assembly_components ── resources
                            (AHSP, 3.043)   (coefficient)         (RBS, 2.830)
                                  │                                   ▲
                            ahsp_editions                    price_book_entries
                            (SE-47-2026 saja)                (draft→verified→active)
                                                                      ▲
                                                          project_price_override
                                                          (menang atas semuanya)
```

**Yang bercabang dari `estimate_versions`:**

- **RAP** — `rap_budget` (FK `ON DELETE RESTRICT`), `rap_material_line`,
  `rap_labor_line`, `rap_change_log`
- **RAB** — `rab_items`, lewat **penyalinan**, bukan FK

### Pembeda RAB vs RAP — sudah dinyatakan eksplisit

`db/migrations/138_cecep_rap_pagu.sql:13-20`:

> RAB (`estimate_*`) = rencana **JUAL** ke klien — harga pasar + upah harian lewat AHSP.
> RAP = rencana **BELANJA** internal — harga supplier nyata + borongan mandor.

Secara kolom: `rap_material_line.supplier_price` vs price book, dan
`rap_labor_line.borongan_value` vs koefisien tenaga AHSP. Hanya
`category = 'material'` diturunkan ke RAP (`rap.ts:147-149`) — tenaga & alat
sengaja tidak, karena *"memasukkannya berarti menganggarkan upah dua kali"*.

**Ini sudah sejalan dengan praktik kontraktor besar.** Yang membedakan
implementasi matang: di sana RAP biasanya juga menyerap **biaya tak langsung**
(site overhead, peralatan sewa, asuransi proyek) yang belum punya tempat di
sini.

---

## 2. Rumus yang dipakai — dan mengapa ia sudah benar

`apps/api/src/lib/ahsp-engine.ts:61-69`:

```ts
for (const c of components) groupTotals[c.group] += c.coefficient * c.hsd
const subtotalD  = groupTotals.tenaga + groupTotals.bahan + groupTotals.alat
const bukAmount  = subtotalD * bukFraction
const hspRaw     = subtotalD + bukAmount
const hspRounded = applyRounding(hspRaw, rounding)   // ROUNDDOWN ala Excel
```

Tiga keputusan di sini yang biasanya salah di implementasi lain, dan **sudah
benar** di sini:

1. **Total baris memakai `hspRounded`, bukan `hspRaw`** (`:73-75`) — supaya
   angka di dokumen bisa ditelusuri ulang dengan kalkulator. Rantai dokumen.
2. **PPN dihitung `(dpp × rate × num) / den`** (`:88-90`) — kali dulu, bagi
   belakangan, supaya 11/12 tak pernah jadi 0,9167. Drift +Rp66 dibuktikan.
3. **BUK & pembulatan WAJIB dikirim caller**, tanpa default diam-diam
   (`estimate-versions.ts:694-700`).

**Resolusi harga** (`lib/price-resolver.ts`): hanya status `active`, berlaku
pada tanggal T, lokasi persis > NULL (**lokasi lain tak pernah dipakai**),
tie-break `effective_date` terbaru lalu versi tertinggi. Override per proyek
menang atas semuanya. Tak ketemu → **422 fail-loud**, tidak menebak
(`estimate-versions.ts:752-757`).

---

## 3. Angka nyata hari ini

| Apa | Berapa | Sumber |
|---|---|---|
| Analisa AHSP (SE-47-2026) | **2.620** | `160_hapus_edisi_ahsp_kosong.sql:9` |
| `assemblies` total | **3.043** | `310_jembatan_resource_material.sql:14` |
| `assemblies` ber-`waste_factor` | **1** dari 3.043 | `310:15-16` |
| `resources` (RBS) | **2.830** | `310:22` |
| `price_book_entries` aktif | **2.943** | diukur 2026-08-13 |
| `price_book_entries` draft | **81** | diukur 2026-08-13 |
| `materials` (gudang) | **24** | `310:23` |
| Kode cocok resources ↔ materials | **0** | `310:24` |
| `peta_resource_material` | **0 baris** (sengaja) | `310:37-39` |
| `estimate_items` | ~1.591 | `estimate-ke-rab.test.ts:72` |
| …yang punya `hsp_snapshot` | **1** | idem |
| Audit `estimate.approved`/`rejected` | 624 / 636, **nol** ber-alasan | `estimate-versions.ts:1063-1067` |

### Yang paling tajam dari angka-angka ini

**1.591 estimate_items, 1 punya provenance HSP.** Artinya fitur "Jelaskan"
(`/explain`) dan penurunan komponen biaya ke RAB praktis tak punya bahan untuk
hampir semua data yang ada. Itu **disengaja** (`139:51-53`): *"mengarang-kannya
justru lebih buruk daripada mengakui kosong."*

**81 harga draft bukan data dummy.** Sumbernya `workbook Cibuluh ANALISA
STANDAR` / `ANALISA BETON` — Excel milik perusahaan, diimpor 2026-07-30,
seluruhnya `confidence_level: medium`. Dan sebagiannya duplikat penamaan:

| Nama | Harga |
|---|---|
| `Beton Site Mix -K.250` | 1.280.680 |
| `Beton Site Mix - K.250` | 1.280.680 |
| `Beton Site Mix -250` | 1.280.680 |

Beton yang sama, harga identik, tiga nama berbeda — spasi & titik yang berbeda
di Excel. **Itu pembersihan penamaan, bukan keputusan harga.**

---

## 4. Kondisi sekarang vs perusahaan besar

Enam dimensi. Kolom "kita" seluruhnya terukur; kolom "standar" adalah praktik
umum kontraktor besar (Total/Wika/PP kelas, atau pemakai Candy/CostX/RIB).

### 4.1 Sumber analisa & edisi

| | Kita | Standar besar |
|---|---|---|
| Edisi | Sumbu eksplisit `ahsp_editions`, immutable, provenance write-once (`117`, `118`) | Sama; biasanya + edisi daerah (PUPR provinsi) |
| Overlay | `correction` vs `deviation` dibedakan (`117`) | Sama, seringnya disebut *company norm* vs *project norm* |
| Yang aktif | **Satu edisi** (SE-47-2026); SNI-2013 & SE-68 dihapus karena kosong (`160`) | 3–5 edisi hidup berdampingan |

**Kesimpulan:** rancangannya setara atau lebih rapi. Yang kurang cuma isinya.

### 4.2 Produktivitas & basis perusahaan

| | Kita | Standar besar |
|---|---|---|
| Tabel | `productivity_records` lengkap, immutable, ber-`source` (national/company/variance) | Sama |
| **Pembaca** | **NOL endpoint produksi** — 3 berkas yang menyebutnya seluruhnya test | Inti sistem: koefisien AHSP disesuaikan dari realisasi |
| Umpan balik | `lessons_learned` → propagasi ke productivity (baru dibuka 2026-08-13) | Otomatis dari timesheet + progres |

**Ini celah paling besar.** Perusahaan besar membedakan diri justru di sini:
AHSP nasional adalah titik awal, dan angka yang dipakai menawar berasal dari
**produktivitas perusahaan sendiri**. Mesinnya sudah ada di sini — pembacanya
belum.

### 4.3 Struktur biaya (CBS/WBS)

| | Kita | Standar besar |
|---|---|---|
| Tabel | `cbs_templates`/`cbs_nodes`/`wbs_nodes` lengkap | Sama |
| Terpakai | **Nol** — UI tak punya pemilih | Wajib: tiap item estimasi menempel ke WBS |
| Akibat | Rollup per WBS/CBS mustahil; varians hanya per cost code | Laporan berjenjang per paket pekerjaan |

### 4.4 Siklus hidup estimasi

| | Kita | Standar besar |
|---|---|---|
| Status | draft → under_review → approved → ~~frozen~~ → ~~superseded~~ | Sama, dan freeze DIPAKAI |
| Freeze | CHECK + trigger + warna UI ada; **nol endpoint menulisnya** | Freeze = versi tender terkirim, tak bisa berubah |
| Approval | Berjenjang, ambang nominal, SoD, anti-serentak (`:975-1025`) | Sama |
| Alasan | 624 approve + 636 reject, **nol ber-alasan** | Wajib; jadi bahan audit |

### 4.5 RAB → RAP → realisasi

| | Kita | Standar besar |
|---|---|---|
| RAB→RAP | Ada, hanya material (`rap.ts:147`) | Material + subkon + alat + overhead |
| RAP lock | Sekali, tak bisa dibuka; change-log wajib beralasan (`138:229`) | Sama |
| RAP→realisasi | **Tidak dibangun** — `138:37-42` menandainya "discovery, jangan bangun" | Inti: PO/GR/faktur diadu dengan pagu per baris |
| Jembatan gudang | `peta_resource_material` **0 baris** | Master material tunggal |

### 4.6 Takeoff

| | Kita | Standar besar |
|---|---|---|
| Volume | Angka jadi di `estimate_items.quantity` | Baris takeoff: lokasi × p × l × t × jumlah |
| Geometri | Hanya besi & baja profil (`rebar_takeoff`, `steel_profiles`, migrasi 122) | Semua: beton, galian, pasangan, plesteran |
| Dari gambar | Tidak ada | CostX/Bluebeam: klik di PDF/DWG → volume |

---

## 5. Pertanyaan untuk sesi brainstorm

Disusun berurut dampak. Tiap pertanyaan punya **fakta terukur** di baliknya,
supaya jawabannya tidak lahir dari asumsi.

### A. Produktivitas perusahaan — celah terbesar

> `productivity_records` lengkap dengan guard immutable, **nol pembaca**.

1. Apakah HSP harus memakai produktivitas perusahaan saat tersedia, dan jatuh
   ke koefisien AHSP nasional bila belum? Atau selalu AHSP, dengan
   produktivitas hanya sebagai pembanding?
2. Kalau memakai, di titik mana ia menggantikan koefisien — per resource, per
   cost code, atau per pasangan keduanya?
3. Berapa banyak realisasi yang dibutuhkan sebelum sebuah angka produktivitas
   boleh dipercaya? (Satu proyek? Tiga?)

### B. CBS/WBS — sudah ada, tak terjangkau

> API menerima `cbs_node_id`/`wbs_node_id`; UI 4.057 baris tak pernah mengirim.

4. Apakah tiap item estimasi WAJIB menempel ke WBS, atau opsional?
5. Kalau wajib, bagaimana estimasi yang sudah ada (1.591 item) diperlakukan?
6. Rollup mana yang paling Anda butuhkan: per WBS (paket pekerjaan), per CBS
   (jenis biaya), atau keduanya?

### C. Freeze — status yang tak pernah bisa terjadi

7. Apa yang seharusnya memicu freeze — penawaran terkirim, kontrak
   ditandatangani, atau tombol manual?
8. Sesudah freeze, apa yang boleh berubah? (Di banyak sistem: tidak ada, dan
   perubahan menuntut versi baru.)

### D. Takeoff — angka jadi vs jejak perhitungan

9. Seberapa sering volume RAB dipersoalkan klien/auditor? Kalau sering, jejak
   perhitungan (p × l × t × jumlah) jadi wajib, bukan nyaman.
10. Apakah takeoff dari gambar (PDF/DWG) benar-benar dibutuhkan, atau
    perhitungan manual bertahap sudah cukup?

### E. Data yang menunggu

11. **81 harga draft** — sebagian duplikat penamaan (contoh beton di §3).
    Boleh saya siapkan daftar terkelompok supaya Anda tinggal menyetujui?
12. **19 harga bentrok** — ada di workbook. Di mana berkasnya? Dengan itu
    saya bisa menelusuri tiap harga ke baris asalnya beserta konteksnya.
13. **`peta_resource_material` 0 baris** — jembatan AHSP↔gudang. Sengaja
    kosong (`310:37`), tapi selama kosong, susut material & rekonsiliasi
    belanja tak bisa jalan.

### F. UI/UX — 4.057 baris, enam tab

14. Tab mana yang paling sering Anda pakai, dan mana yang tak pernah?
15. `estimasi/page.tsx` sudah 4.057 baris; `ARAH-VISUAL-2026.md` §1c menandai
    "tab menyembunyikan aplikasi di dalam halaman" sebagai cacat. Apakah
    enam tab ini seharusnya jadi enam halaman?

---

## 6. Daftar cacat terukur (untuk diperbaiki, bukan didiskusikan)

Ini bukan bahan brainstorm — ini pekerjaan yang tinggal dikerjakan.

| # | Cacat | Bukti | Status |
|---|---|---|---|
| 1 | Pembaca `hsp_snapshot` mencari kunci `result` yang tak pernah ada → komponen biaya RAB selalu 0 | `estimate-versions.ts:348,381` | ✅ **diperbaiki** `b0151fac` |
| 2 | `description` & `unit` di-select dari `estimate_items`; kolomnya tak pernah dibuat | `estimate-versions.ts:96` vs `110:99-119` | ❌ terbuka |
| 3 | Freeze mati — status ada, penulisnya nol | grep `'frozen'` di `estimate-versions.ts` | ❌ terbuka |
| 4 | CBS/WBS tak terjangkau pengguna | `page.tsx` nol `cbs_node`/`wbs_node` | ❌ terbuka |
| 5 | `productivity_records` nol pembaca PRODUKSI — 3 berkas yang menyebutnya seluruhnya `__tests__` | `grep -rln` di `routes/` | ❌ terbuka |
| 6 | `rab_items.gantt_dependencies` write-only; pembacaan pakai `gantt_dep_rules` | `rab.ts:1008` vs `:646` | ❌ terbuka |
| 7 | `price_book_entries.currency` tak pernah dibandingkan — resolver mencampur lintas currency | `price-resolver.ts:28` | ❌ terbuka |
| 8 | `rab.ts` upload Excel tanpa batas ukuran | `rab.ts:683` | ❌ terbuka |

---

## 7. Cara memakai berkas ini di sesi brainstorm

1. **Ukur ulang dulu** — perintah di kepala berkas. Kalau angka berubah,
   angka yang menang.
2. Mulai dari **§5.A (produktivitas)**: itu yang paling membedakan sistem ini
   dari spreadsheet, dan mesinnya sudah 90% ada.
3. **§6 tidak perlu dibahas** — itu daftar kerja, bukan keputusan.
4. Pertanyaan UI (§5.F) sebaiknya dijawab **dari layar**, bukan dari daftar:
   buka `/estimasi`, pakai lima menit, lalu jawab.
