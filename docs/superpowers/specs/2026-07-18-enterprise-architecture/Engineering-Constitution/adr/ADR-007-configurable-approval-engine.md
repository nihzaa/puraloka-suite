# ADR-007 — Approval Engine yang SELURUHNYA Config (revival ber-bukti dari ADR-006)

**Status:** Diterima (keputusan founder 2026-07-24 — bukti kebutuhan + syarat config-first)
**Tanggal:** 2026-07-24
**Kedudukan:** Memenuhi syarat revival di [ADR-006](ADR-006-retire-workflow-engine-shadow.md). Tunduk pada [ADR-004](ADR-004-permission-is-architecture-role-is-configuration.md) (permission = arsitektur, role = konfigurasi) dan AUTOPILOT §12 (config-first). Membuka **Phase 2 (Program B) bagian 2A**.

---

## Konteks — kenapa ADR ini boleh ada

ADR-006 mempensiunkan workflow engine 1C dan menetapkan: **revival hanya dengan bukti kebutuhan approval multi-langkah, lewat ADR baru.** Ini ADR itu.

**Audit bukti (2026-07-24) — kondisi SEBELUM keputusan:** semua approval **satu langkah, satu approver**, nol threshold:

| Modul | Alur | Approver |
|---|---|---|
| Kasbon | `pending → approved/rejected` | 1 (`approved_by`) |
| Change Order | `draft → submitted → approved/rejected` | 1 (`approved_by`) |
| Procurement MR | `draft → submitted → approved/rejected` | 1 (`approved_by`) |
| Expense kas | `submitted → approved/rejected` | 1 (`reviewed_by`) |

Grep `threshold`/`approval_level`/`berjenjang`/`multi-level` di API + DOMAIN.md → nihil.

**BUKTI yang memenuhi syarat ADR-006 (keputusan founder):** Puraloka **memang bisa** butuh approval berjenjang, **TAPI** dengan syarat mengikat: *"di UI nanti saya mau bisa dikonfigurasikan lagi — bisa berjenjang atau enggaknya, dan role apa yang bisa approve-nya juga dinamis, semuanya jangan hardcode."*

Jadi kebutuhannya **bukan** "bangun state-machine generik" (itu kesalahan 1C: engine tanpa pemakai), melainkan **approval chain yang bentuknya data**.

## Keputusan

Bangun **Approval Engine berbasis konfigurasi**, dengan kontrak berikut:

1. **Jumlah level = DATA.** Satu langkah (seperti hari ini) atau N langkah — ditentukan baris konfigurasi, bukan kode. "Berjenjang atau tidak" = mengubah data.
2. **Siapa boleh approve tiap level = DATA, lewat PERMISSION (ADR-004).** Tiap langkah menyimpan `required_permission`. Role mana yang memegang permission itu diatur di **UI role editor yang sudah ada** → "role approver" dinamis **tanpa** menaruh literal role di kode/tabel workflow. Ini memenuhi permintaan founder sekaligus menjaga ADR-004.
3. **Syarat/kondisi = DATA.** Level boleh bersyarat nominal (mis. berlaku bila `amount ≥ X`) sehingga aturan seperti "PO di atas Rp50jt wajib Direktur" murni konfigurasi.
4. **DEFAULT = PERILAKU HARI INI.** Seed awal: tiap modul punya **satu** langkah memakai permission yang SEKARANG dipakai (`mandor:kasbon:approve`, `change_order:approve`, dst) tanpa syarat nominal. **Nol perubahan perilaku** sampai founder menambah level dari UI (additive-first, pola sama denda/kasbon-limit).
5. **Strangler-fig per modul.** Migrasi satu modul dulu, terbukti behavior-preserving, baru modul berikutnya. **Bukan** big-bang 4 modul sekaligus.
6. **Fail-closed.** Bila konfigurasi tak terbaca/korup → tolak approval (jangan diam-diam meloloskan). Kegagalan query otorisasi TIDAK boleh menyamar sebagai "tidak berhak" maupun "berhak" — harus terlihat (pelajaran §4E Phase 1).

## Apa yang BERBEDA dari 1C (kenapa ini bukan mengulang kesalahan)

| 1C (diretire) | ADR-007 |
|---|---|
| Engine generik dibangun **sebelum** ada kebutuhan | Dibangun **atas permintaan eksplisit** founder |
| `workflow_instances` = **bayangan**, nol pembaca bisnis | Konfigurasi **dibaca runtime** saat approve — jalur hidup |
| Dual-write shadow (permukaan bug tanpa nilai) | **Tanpa shadow**: kolom `status` tabel sumber tetap sumber kebenaran; engine hanya menentukan **siapa & berapa langkah** |
| Nilai fitur nol saat itu | Nilai langsung: approval berjenjang bisa dinyalakan tanpa deploy |

**Sumber kebenaran status tetap kolom `status` di tabel sumber** (kasbons/change_orders/…). Engine ini **tidak** menggantikannya — ia mengatur *gerbang* menuju status itu. Ini menjaga pelajaran 1C: jangan buat sumber kebenaran kedua.

## Apa yang TIDAK dibangun (batas tegas)

- **Tanpa** `workflow_instances`/dual-write/state-machine generik untuk semua entitas.
- **Tanpa** SLA/eskalasi otomatis & delegasi — belum ada bukti kebutuhannya. Bila kelak muncul, ADR baru lagi (aturan ADR-006 tetap berlaku).
- **Tanpa** memindahkan status modul ke tabel lain.

## Aturan

- Level, permission tiap level, syarat nominal, dan on/off **WAJIB** bisa diubah dari UI. "Ada kolomnya di DB" belum cukup (§12).
- **JANGAN** menaruh literal role di tabel/kode approval — selalu lewat `permissions.key` (ADR-004).
- Migrasi modul **WAJIB** behavior-preserving + dibuktikan test (positif *dan* negatif) + mutation-tested (pelajaran §4C/§4E: test negatif saja meloloskan bug gagal-tertutup).
- Default konfigurasi awal **WAJIB** mereproduksi perilaku existing persis.

---

## Status implementasi (Phase 2 / Program B — Sub-Fase 2A)

| Slice | Isi | Bukti | PR |
|---|---|---|---|
| 2A-1/2 | Fondasi: migration 099 (`approval_chains`/`approval_steps`/`approval_progress`), logika murni `lib/approval-engine.ts` | 16 unit test | #43 |
| 2A-3 | Modul **pertama**: `kasbon` (strangler-fig) | mutation-tested; bonus: bug trigger pre-existing (migration 100) | #44 |
| 2A-4 | **UI** kelola rantai + anti-lockout | 8 test, 2 mutasi merah | #45 |
| 2A-5 | Modul sisanya: `change_order`, `material_request`, `project_expense` | jaring authz 403 diperluas + E2E berjenjang | (PR ini) |

Keempat modul kini membaca rantai dari konfigurasi. **Aturan §4 terpenuhi:** seed
tetap 1 langkah dengan permission yang persis sama seperti sebelumnya, jadi
perilaku hari ini tidak berubah sampai founder menambah level dari UI.

### Test yang menjaga janji "bisa berjenjang"

Sampai 2A-4, perilaku berjenjang hanya pernah dibuktikan lewat skrip E2E manual —
**tidak ada** yang menjaganya di CI. `approval-chain-berjenjang.test.ts` menutup
lubang itu dan mengunci invariant yang paling mahal kalau jebol:

> **Uang tidak bergerak sebelum level terakhir.** Approve level 1 pada rantai 2
> level TIDAK mengubah status entitas maupun nilai kontrak proyek.

Dimutasi untuk membuktikan test-nya tidak kosong: menghapus penahapan
(`isFinalStep`) membuat 2 test merah.

### Keputusan turunan: nilai entitas yang TIDAK DIKETAHUI bersifat fail-closed

`material_requests` tak menyimpan total; nilainya dihitung dari
Σ(qty × estimasi harga), dan estimasi boleh kosong. Kalau item tanpa estimasi
dihitung **nol**, maka *"kosongkan harganya"* menjadi cara sepele melewati ambang
"di atas Rp X harus naik ke direktur" — celah bawaan desain, bukan bug.

**Aturan:** satu saja item tanpa estimasi → nilai dianggap **tidak diketahui** dan
diperlakukan **melampaui semua ambang**. Data yang hilang harus *menambah*
pengawasan, bukan menguranginya. Ini penerapan langsung prinsip fail-closed §6.
Dikunci di `lib/mr-amount.ts` + test yang secara eksplisit menguji celahnya.

Efeknya hari ini nol (rantai seed tanpa ambang); aturan ini menjaga saat ambang
mulai dipakai.
