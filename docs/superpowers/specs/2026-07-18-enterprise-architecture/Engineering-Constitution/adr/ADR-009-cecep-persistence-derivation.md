# ADR-009 — Persistensi CECEP diturunkan, bukan dikarang (mulai Cost Code Registry)

**Status:** Diterima · **Fase:** Program C (= Phase 3), CECEP Milestone 1
**Terkait:** [ADR-004](ADR-004-permission-is-architecture-role-is-configuration.md) ·
CECEP [`03b` §A.3](../../CECEP/03b-phase-c5-core-domain-discovery.md) ·
[`44` §1](../../CECEP/44-phase6-derive-domain-model.md) ·
[`45` §B/§J](../../CECEP/45-phase7-data-architecture.md) ·
[`49`](../../CECEP/49-phase11-implementation-roadmap.md) ·
[`34` DoD](../../CECEP/34-roadmap-definition-of-done.md) ·
[`41` Evidence Hierarchy](../../CECEP/41-evidence-hierarchy.md)

## Konteks — celah yang nyata, bukan kelalaian

Perencanaan CECEP (40 dokumen) berstatus **Derived & Frozen**, tapi **nol DDL**: tidak
ada satu pun `CREATE TABLE` di seluruh set. Itu disengaja dan dinyatakan eksplisit:

> **`45` §J — Persistence — Tetap Di Luar Cakupan.** *"keputusan fisik (tabel/index/
> partition) BUKAN bagian Fase 7 — itu Fase 11/Fase 12."*

Tapi Fase 11 (`49`) menyatakan dirinya *"introduces 0 new business concepts, 1 build
sequence… No new discovery is performed in this phase"* — isinya urutan 4 milestone,
bukan skema. Fase 12 (`50`) adalah paket dokumentasi.

**Kesimpulan jujur: desain persistensi CECEP tidak ada di dokumen mana pun.** Ia bukan
hilang — ia memang pekerjaan pertama implementasi. ADR ini menetapkan *bagaimana*
pekerjaan itu dilakukan supaya tidak melanggar disiplin CECEP sendiri.

## Masalahnya: menulis skema itu mudah melanggar konstitusi CECEP

DoD CECEP (`34` poin 8) mewajibkan Trace Status per keputusan desain, dihitung lewat
10-Level Evidence Hierarchy (`41`), dan menyatakan **"❌ Invented DILARANG bertahan"**.
Skema tabel penuh kolom, dan setiap kolom adalah keputusan desain. Menambah satu kolom
"karena nanti pasti perlu" = persis pelanggaran yang dilarang.

## Keputusan

1. **Setiap kolom harus punya jejak ke artefak Frozen.** Kolom yang tidak bisa
   ditelusuri **tidak ditulis**, meski terasa jelas akan dibutuhkan. Kebutuhan yang
   muncul belakangan ditambahkan lewat migration baru dengan jejaknya sendiri —
   additive, sama seperti pola denda/kasbon-limit di Phase 1.
2. **Yang sengaja TIDAK ditulis dicatat sebagai Open**, bukan didiamkan. Daftar Open
   adalah bagian dari deliverable, bukan tanda pekerjaan belum selesai.
3. **Satu Aggregate Root per migration.** Cost Code Registry lebih dulu — ia Shared
   Kernel yang direferensikan hampir semua domain (`03b` §A.3: *"hampir semua domain
   punya panah MENUJU Cost Code"*). Salah bentuk di sini menular ke 17 domain.
4. **Otorisasi lewat capability, bukan role** (ADR-004). Registry ini dimiliki fungsi
   Cost Engineering/Company Standard; domain hilir *"hanya mereferensikan, tidak pernah
   membuat sepihak"* (`03b` §A.3) → capability tulis terpisah dari capability baca.

## Penerapan pertama: Cost Code Registry (migration 102)

| Keputusan | Jejak | Trace Status |
|---|---|---|
| Tabel `cost_codes`, satu registry per perusahaan | `03b` §A.3 "Aggregate Root: Ya — SATU per perusahaan" | ✓ Fully Derived |
| `code` unik & stabil sebagai identitas lintas domain | `03b` §A.3 "identitas tetap meski deskripsi/kategori berubah"; `44` §1 Business Responsibility | ✓ Fully Derived |
| `name`, `description`, `category` boleh berubah | `03b` §A.3 "deskripsi/kategori berubah seiring waktu" | ✓ Fully Derived |
| `status`: draft / active / deprecated | `03b` §A.3 Lifecycle, eksplisit | ✓ Fully Derived |
| Tidak boleh dihapus (deprecate, bukan delete) | `03b` §A.3 "tidak dihapus, riwayat historis tetap merujuknya" | ✓ Fully Derived |
| `activated_at` / `deprecated_at` | Domain Event `CostCodeActivated` / `CostCodeDeprecated` (`03b` §A.3) — waktu kejadian harus terekam agar event punya makna | ✓ Fully Derived |
| **`deprecated` → `active` SAH** (reaktivasi) | keputusan founder, lihat §Reaktivasi di bawah | **✓ Resolved by ADR** |
| **`draft` → `deprecated` SAH** (jalan keluar draft salah ketik) | konsekuensi langsung larangan hapus; tanpa ini draft salah ketik jadi sampah abadi | **✓ Resolved by ADR** |
| Kembali ke `draft` DITOLAK dari status mana pun | draft = keadaan pra-publikasi; identitas yang pernah terbit & mungkin sudah dirujuk tak bisa berpura-pura belum ada | ✓ Resolved by ADR |

### Reaktivasi: kenapa `deprecated → active` sah

Keputusan founder, menutup satu-satunya baris ⚠️ yang tersisa di ADR ini:

> **Identitas Cost Code stabil, dan "dipensiunkan" adalah STATUS OPERASIONAL —
> bukan penghapusan permanen.**

Konsekuensinya kalau reaktivasi dilarang: kode yang dipensiunkan karena salah paham
hanya bisa dipakai lagi dengan membuat **identitas baru**. Itu justru memecah
traceability lintas 17 domain — persis hal yang Cost Code ada untuk mencegahnya
(`44` §1: *"kalau identitas itu boleh berbeda-beda per domain, angka RAB tidak akan
pernah bisa ditemukan lagi di Procurement/Progress/EVM"*). Jadi melarang reaktivasi
bukan sekadar lebih ketat — ia bertentangan dengan alasan Cost Code diciptakan.

**Mekanisme:** saat aktif kembali, `activated_at` di-**refresh** dan `deprecated_at`
di-**kosongkan**. `activated_at` berarti *"sejak kapan identitas ini berlaku sekarang"*,
bukan arsip aktivasi pertama. Riwayat pensiun-dan-aktif-lagi ada di `audit_logs`,
bukan di baris tabelnya — konsisten dengan Epic 5 (audit sebagai satu-satunya rekam
jejak perubahan, bukan kolom historis tersebar).

**Yang tetap ditolak:** kembali ke `draft`. Draft adalah keadaan pra-publikasi;
begitu terbit, identitas mungkin sudah dirujuk domain lain dan tak bisa berpura-pura
belum pernah ada.

### Yang sengaja TIDAK ditulis (Open, bukan lupa)

| Tidak ditulis | Alasan |
|---|---|
| **Hierarki (`parent_id`)** | CBS adalah domain TERPISAH (`44` §3). Cost Code disebut *"titik temu WBS+CBS"* (`37`) — titik temu, bukan pemilik pohon. Menaruh hierarki di sini akan mendahului keputusan CBS yang belum dibangun. **❌ Invented kalau ditulis sekarang.** |
| **Satuan (`unit`)** | "Pekerjaan generik" terasa pasti punya satuan, tapi tidak ada satu pun artefak Frozen yang menyatakannya milik Cost Code — kandidat kuatnya justru Assembly/AHSP (`44` §4). Tabel `units` sudah ada (migration 090) dan siap dirujuk saat jejaknya jelas. |
| **`company_id`** | Multi-company adalah Phase 7 (Program D). Menambahkannya sekarang = mendahului keputusan tenancy. "SATU registry per perusahaan" hari ini dipenuhi karena instance ini memang satu perusahaan. |

Ketiganya additive di kemudian hari — menambah kolom nullable jauh lebih murah daripada
membongkar hierarki yang salah bentuk setelah 17 domain terlanjur merujuknya.

## Penerapan kedua: RBS / Resource Identity Registry (migration 103)

Aggregate Root kedua (`44` §2, `03b` §A.5) — "shared kernel kedua terpenting setelah
Cost Code, dipakai 10 domain hilir". Pola sama, **bentuk berbeda karena sumbernya
berbeda** (bukan Cost Code yang di-copy):

| Keputusan | Jejak | Trace Status |
|---|---|---|
| Tabel `resources`, satu Registry company-level | `03b` §A.5 "Aggregate Root: Ya — RBS Registry (Company-level)" | ✓ Fully Derived |
| `code` unik & stabil sebagai identitas lintas domain | `03b` §A.5 "identitas tetap, atribut deskriptif bisa berubah"; `44` §2 | ✓ Fully Derived |
| `category` WAJIB: labor/equipment/material/subcontract | `35` #5 "RBS (Labor/Equipment/Material/Subcontract, `01` §4)"; `04a` "kategori sebagai atribut" | ✓ Fully Derived |
| Lifecycle `active` / `inactive` (2 status, **tak ada draft**) | `03b` §A.5 "Active → Inactive"; hanya event `ResourceDeactivated` | ✓ Fully Derived |
| Larangan hapus (trigger) | `03b` §A.5 "riwayat tetap merujuknya" | ✓ Fully Derived |
| `deactivated_at` | Domain Event `ResourceDeactivated` (`03b` §A.5) | ✓ Fully Derived |
| Baca/tulis dipisah jadi 2 capability | `03b` §A.5 "domain hilir merujuk, tidak membuat definisi sendiri-sendiri" | ✓ Fully Derived |
| **`inactive` → `active` (reaktivasi) SAH** | prinsip founder dari §Reaktivasi ditransfer — wording lifecycle identik ("riwayat tetap merujuknya") | ✓ Resolved by ADR |

**Kenapa reaktivasi ditransfer, bukan ditanya ulang:** keputusan founder di
§Reaktivasi menetapkan *prinsip* — "dinonaktifkan = status operasional, bukan
penghapusan permanen; identitas baru memecah traceability" — bukan pengecualian
khusus Cost Code. RBS punya wording lifecycle identik dan alasan yang sama (No Data
Duplication). Menanyakannya lagi = berhenti untuk hal yang sudah diputus.

### Yang sengaja TIDAK ditulis di RBS (Open)

| Tidak ditulis | Alasan |
|---|---|
| **`unit`** | SAMA seperti Cost Code — nol artefak Frozen menaruh satuan di RBS, dan kontrak **Price Book Entry** (`45` §C) pun tidak memuat unit di 11 elemennya. Kepemilikan satuan resource baru dipaksa jelas di Assembly/AHSP (Milestone 2), tempat koefisien "0,7 OH Tukang Besi" menuntut satuan. `units` (migration 090) menunggu. |
| **`company_id`** | Phase 7 (Program D). |

## Penerapan ketiga: Versioned Price Book (migration 104)

Aggregate Root **per entry** (`44` §5, `03b` §A.6). Struktur 8-atribut wajib
seragam lintas 4 jenis harga.

**Menyimpang dari daftar urut `49` — dengan alasan, bukan sembarangan.** `49`
menulis "CBS → Assembly → Price Book", tapi itu **bukan rantai FK**: Assembly tidak
mereferensikan CBS (`37 §2`/`44 §4` — input Assembly = Reference Library/RBS/Formula),
dan CBS dirujuk Estimate Item (Milestone 3). CBS punya dua keputusan yang `03b`
tandai *belum diambil* (B.4 rumah Standard CBS, B.5 pola versioning) dan TIDAK
ditutup di `44`/`45`/`46` — lihat §CBS-diblokir. Price Book fully-derived, kontrak
lengkap (`45` §C), versioning justru sudah resolved, hanya butuh RBS. Urutan
antar-Milestone (1→2→3→4) tetap utuh; ini penataan di dalam Milestone 2 mengikuti
dependency nyata.

| Keputusan | Jejak | Trace Status |
|---|---|---|
| `price_book_entries`, root per entry (bukan Price Book satu entity besar) | `03b` §A.6; `44` §5 "konsekuensi langsung Foundational Principle Ketiga" | ✓ Fully Derived |
| `resource_id` FK → RBS (merujuk, tak menyalin) | `03b` §A.6 Context Mapping "Price Book Entry → RBS entry" | ✓ Fully Derived |
| `amount` + `currency` (Money VO) | `45` §143 "Money (amount, currency)" | ✓ Fully Derived |
| 8-atribut wajib: version/effective/expired/location/currency/supplier/confidence/verified_by | `03b` §A.6 Shared Kernel (disebut eksplisit) | ✓ Fully Derived |
| `confidence_level` ∈ high/medium/low | `03b` baris 37 "High/Medium/Low" | ✓ Fully Derived |
| Lifecycle draft→verified→active→expired | `03b` §A.6 Lifecycle, eksplisit | ✓ Fully Derived |
| **Immutable begitu ≠ draft** (harga tak berubah retroaktif) | `44` §5 "immutable begitu terpakai"; `45` §C "Allowed Mutation: hanya Draft→Verified" | ✓ Fully Derived |
| Larangan hapus entry non-draft (draft boleh) | konsekuensi "immutable + dirujuk Estimate Item"; consumer merujuk entry AKTIF | ✓ Fully Derived |
| 4 jenis harga = kategori resource, BUKAN field sendiri | `03b` §A.6 "struktur seragam"; No Data Duplication | ✓ Fully Derived |
| Satu view + satu manage (verifikasi ⊂ manage), tidak dipecah per kategori | `03b` §A.6 "pemilik fungsional beda… struktur seragam" → siapa-boleh via ADR-004, bukan 4 capability (No-Menu Test) | ✓ Fully Derived |

### Yang sengaja TIDAK ditulis di Price Book (Open)

| Tidak ditulis | Alasan |
|---|---|
| **`unit`** | Kontrak Price Book Entry (`45` §C) tidak memuat unit di 11 elemennya; harga per satuan resource, tapi satuan milik resource (resolusinya masih ditunda — migration 103). |
| **`company_id`** | Phase 7 (Program D). |

### Catatan: kepemilikan verifikasi (segregation of duties)

`03b` §A.6 menyebut pemilik fungsional berbeda per kategori (Material→Procurement,
Labor→HR/Payroll, Subcontract→Procurement/Legal). Hari ini verifikasi = bagian
`cecep:price:manage`. Bila kelak perlu **pemisahan tugas** (yang membuat harga ≠
yang memverifikasi), itu capability tambahan `cecep:price:verify` — additive, lewat
ADR baru, bukan ditebak sekarang.

## Penerapan keempat: Productivity Library (migration 105)

Aggregate Root: Productivity Record = **kombinasi (RBS + Cost Code + versi)**
(`44` §6, `03b` §A.6b). Domain pertama yang merujuk **dua** Shared Kernel Milestone 1.

| Keputusan | Jejak | Trace Status |
|---|---|---|
| `productivity_records`, AR = kombinasi resource×cost_code×versi | `44` §6 / `03b` §A.6b (identitas AR eksplisit) | ✓ Fully Derived |
| `resource_id` + `cost_code_id` FK (merujuk dua kernel) | `03b` §A.6b Context Mapping | ✓ Fully Derived |
| `productivity_value` > 0 | Business Responsibility (produktivitas = qty resource per pekerjaan) | ✓ Fully Derived |
| `source` ∈ national_bootstrap/company_baseline/variance | `03b` §A.6b Lifecycle "Bootstrap → Company Baseline → Updated (variance)" | ✓ Fully Derived |
| **Immutable-entity-per-version** (perbaikan = versi baru) | `44` §6 "+ versi" sebagai IDENTITAS AR; `ProductivityRecordUpdatedFromVariance` | ✓ Fully Derived |
| UNIQUE (resource, cost_code, versi) | identitas AR | ✓ Fully Derived |
| Larangan hapus (fakta historis basis Variance) | `03b` §A.6b Ownership "AI Learning Loop"; prinsip riwayat CECEP | ✓ Fully Derived |

**Versioning di sini BUKAN keputusan tertunda** (beda dari CBS): "+ versi" adalah
bagian identitas AR yang dinyatakan eksplisit sebagai alasan derivasinya — jadi
immutable-per-version diturunkan, bukan dipilih. `source='national_bootstrap'` hanya
LABEL provenance, **bukan FK** ke Reference Library (B.4 yang tertunda) → Productivity
tak terblokir CBS/Reference Library.

Exclude (ADR-009): `unit` (coefficient tanpa satuan sampai unit resource+cost_code
diputus), `company_id` (Phase 7).

## CBS diblokir — dua keputusan domain belum diambil (dilaporkan, tidak ditebak)

CBS (`44` §3) diberi ✓ Fully Derived untuk *keberadaannya*, tapi **dua keputusan
struktural yang menentukan bentuk tabelnya belum ada di artefak Frozen mana pun**:

1. **B.5 — pola versioning Company CBS Template.** `03b` §B.5 eksplisit: *"belum
   jelas apakah setiap revisinya adalah entity baru (mengikuti pola Price Book) atau
   field `version_number` yang di-mutate di tempat… keputusan yang belum diambil."*
   Ini menentukan bentuk tabel (baris-per-versi vs kolom versi) — tidak bisa ditulis
   tanpa memilih. Lifecycle "superseded" *mengarah* ke pola Price Book (immutable,
   entity baru per versi) dan Konstitusi CECEP menyukai konsistensi pola — tapi `03b`
   menuntut keputusan eksplisit, dan CBS adalah kategori yang dirujuk Estimate Item;
   salah bentuk = mahal dibongkar.
2. **B.4 — rumah Standard CBS.** Bagian "External Reference Data / Reference Library"
   yang statusnya *Candidate* (`03b` §B.4), `46` menyatakan bootstrap-nya "tidak
   didesain detail… housekeeping Fase 11". Belum jelas Standard CBS tinggal di CBS
   atau di engine Reference Library terpisah.

Menulis CBS sekarang = memilih dua-duanya tanpa dasar Frozen = **❌ Invented** yang
dilarang DoD `34` poin 8. Maka CBS **ditunda** sampai keputusan versioning diambil.
Ini tidak memblokir Milestone 2: Price Book, Productivity, dan Formula Engine tidak
bergantung CBS; hanya Estimate Item (Milestone 3) yang butuh CBS, jadi keputusan ini
punya waktu untuk diambil sebelum jadi penghalang.

## Aturan

- **JANGAN** menambah kolom ke tabel CECEP tanpa baris jejak di ADR ini atau ADR
  penerusnya. "Nanti pasti perlu" bukan jejak.
- **JANGAN** menghapus baris Cost Code. Deprecate. Ditegakkan di DB, bukan sopan santun
  aplikasi — riwayat historis merujuknya.
- Domain hilir **MUST** merujuk `cost_codes.id`, tidak menyalin `code` sebagai teks
  bebas — kalau disalin, traceability lintas domain (alasan Cost Code ada) hilang.
- Setiap migration CECEP berikutnya **WAJIB** membawa tabel jejak seperti di atas,
  termasuk daftar "sengaja tidak ditulis".
