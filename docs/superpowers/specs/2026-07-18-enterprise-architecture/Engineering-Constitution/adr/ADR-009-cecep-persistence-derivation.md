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

### Yang sengaja TIDAK ditulis (Open, bukan lupa)

| Tidak ditulis | Alasan |
|---|---|
| **Hierarki (`parent_id`)** | CBS adalah domain TERPISAH (`44` §3). Cost Code disebut *"titik temu WBS+CBS"* (`37`) — titik temu, bukan pemilik pohon. Menaruh hierarki di sini akan mendahului keputusan CBS yang belum dibangun. **❌ Invented kalau ditulis sekarang.** |
| **Satuan (`unit`)** | "Pekerjaan generik" terasa pasti punya satuan, tapi tidak ada satu pun artefak Frozen yang menyatakannya milik Cost Code — kandidat kuatnya justru Assembly/AHSP (`44` §4). Tabel `units` sudah ada (migration 090) dan siap dirujuk saat jejaknya jelas. |
| **`company_id`** | Multi-company adalah Phase 7 (Program D). Menambahkannya sekarang = mendahului keputusan tenancy. "SATU registry per perusahaan" hari ini dipenuhi karena instance ini memang satu perusahaan. |

Ketiganya additive di kemudian hari — menambah kolom nullable jauh lebih murah daripada
membongkar hierarki yang salah bentuk setelah 17 domain terlanjur merujuknya.

## Aturan

- **JANGAN** menambah kolom ke tabel CECEP tanpa baris jejak di ADR ini atau ADR
  penerusnya. "Nanti pasti perlu" bukan jejak.
- **JANGAN** menghapus baris Cost Code. Deprecate. Ditegakkan di DB, bukan sopan santun
  aplikasi — riwayat historis merujuknya.
- Domain hilir **MUST** merujuk `cost_codes.id`, tidak menyalin `code` sebagai teks
  bebas — kalau disalin, traceability lintas domain (alasan Cost Code ada) hilang.
- Setiap migration CECEP berikutnya **WAJIB** membawa tabel jejak seperti di atas,
  termasuk daftar "sengaja tidak ditulis".
