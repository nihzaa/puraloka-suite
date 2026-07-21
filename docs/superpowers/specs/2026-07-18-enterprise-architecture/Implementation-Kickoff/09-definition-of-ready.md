# Implementation Kickoff — 09. Definition of Ready

**Tujuan:** Kondisi yang harus dipenuhi agar satu **Task** (level [05-feature-implementation-order.md](05-feature-implementation-order.md)) boleh dimulai — berbeda dari [08-day-one-checklist.md](08-day-one-checklist.md) (satu kali, di awal Sub-Fase 1A) dan [10-go-no-go-checklist.md](10-go-no-go-checklist.md) (satu kali, di akhir, untuk keputusan mulai implementasi sama sekali).
**Prinsip governing:** [Engineering-Constitution/05-team-process/16-definition-of-ready.md](../Engineering-Constitution/05-team-process/16-definition-of-ready.md) — dokumen ini adalah penerapan konkret prinsip itu ke Sub-Fase 1A, bukan definisi baru yang bersaing.

---

## Definition of Ready — Umum (Berlaku Semua Task)

Sebuah Task **MUST NOT** dimulai kecuali:

1. **Dependency task sebelumnya sudah `completed`** (bukan `in_progress`) — lihat dependency graph di [05-feature-implementation-order.md](05-feature-implementation-order.md).
2. **CI hijau di `main`** pada saat Task dimulai — jika CI merah karena Task lain, perbaiki dulu sebelum menumpuk pekerjaan baru.
3. **Branch dibuat dari `main` terbaru** (bukan dari branch Task lain yang belum merge) — mencegah dependency antar-branch yang tidak eksplisit.
4. **Evidence file:line dari dokumen sumber sudah dibaca ulang** (bukan mengandalkan ingatan dari dokumen ini) — konsisten prinsip "verifikasi ulang, jangan warisi" yang menyebabkan koreksi B1 di remediation sebelumnya.

## Definition of Ready — Tambahan per Kategori Task

### Task Migrasi Authorization-Gate (Epic 3, F3.2)

- [ ] Baris kode yang akan dimigrasi sudah diverifikasi ulang via grep langsung terhadap file target (bukan mengandalkan nomor baris di [Phase1/00-current-state-audit.md § 1.5](../Phase1/00-current-state-audit.md#15-call-site-inventory--inline-role--x-57-kejadian-11-file) tanpa reverifikasi — dokumen itu sendiri sudah berumur, kode bisa berubah).
- [ ] Test manual role sebelum-migrasi sudah dijalankan dan hasilnya dicatat (baseline untuk dibandingkan setelah migrasi).
- [ ] Task sebelumnya di rantai risiko-rendah-ke-tinggi (lihat urutan di [03-folder-and-module-order.md § Tahap 3](03-folder-and-module-order.md#tahap-3--permission-engine-1a1-setelah-tahap-1--2-hijau)) sudah `completed` dan CI hijau.

### Task Migrasi RLS per Tabel (Epic 4)

- [ ] `has_permission()` function (T4.1.1) sudah `completed` dan diverifikasi.
- [ ] Kelompok tabel sebelumnya di urutan risiko (Referensi → Operasional → Field ops → Finansial) sudah `completed`, **kecuali** jika Task adalah bagian dari Kelompok Finansial — lihat syarat tambahan di bawah.
- [ ] Test RLS untuk kelompok sebelumnya lulus (bukan hanya "kode sudah merge").

### Task Kelompok Finansial RLS Khusus (F4.6, Migration 064)

**Syarat tambahan yang MUST dipenuhi sebelum Task ini dimulai (tidak cukup DoR umum):**
- [ ] Independent review logika policy **sudah dijadwalkan** (siapa/kapan/metode — sesi AI terpisah atau pembacaan manual founder) sebelum expand di-deploy.
- [ ] Maintenance window (jam operasional rendah) **sudah ditentukan tanggal/jamnya**, bukan "nanti dicari waktunya."
- [ ] Backup terverifikasi (bukan asumsi) — PITR status sudah dikonfirmasi (lihat [08-day-one-checklist.md Bagian 2](08-day-one-checklist.md#bagian-2--backup--environment-verification)).
- [ ] Query interim detection (row count per role) **sudah ditulis dan ditest** terhadap kelompok tabel sebelumnya (bukan ditulis pertama kali saat migrasi Finansial berjalan).

### Task Instrumentasi Audit Event (Epic 5, F5.4)

- [ ] `logAuditEvent` helper (T5.2.1) sudah `completed`.
- [ ] Event yang akan diinstrumentasi sudah diverifikasi masih relevan (mis. `rab_materials.override` — konfirmasi endpoint/kolom ini masih ada di kode saat ini, bukan asumsi dari audit lama).

### Task Append-Only Trigger (F5.5)

- [ ] **Keputusan founder eksplisit** sudah didapat (lihat [08-day-one-checklist.md Bagian 1](08-day-one-checklist.md#bagian-1--governance-gate-wajib-pertama-sebelum-apa-pun-di-bawah)) — Task ini **MUST NOT** dimulai tanpa keputusan ini, berbeda dari Task lain yang DoR-nya murni teknis.

---

## Kondisi yang MEMBUAT Task TIDAK Ready (Anti-Pattern Eksplisit)

- ❌ "Dependency-nya hampir selesai, mulai saja paralel" — **dilarang** untuk task berurutan (F3.2, F4.2-4.6); hanya Epic yang eksplisit paralel (Epic 5 vs Epic 1/3/4) boleh berjalan bersamaan.
- ❌ "CI merah tapi bukan karena kode saya" — tetap **dilarang** memulai task baru; perbaiki CI dulu, konsisten prinsip "jaring pengaman dulu."
- ❌ "Nomor baris di dokumen sudah pasti benar, tidak perlu grep ulang" — persis kesalahan yang menyebabkan error B1 sebelumnya; **selalu** verifikasi ulang terhadap kode hidup.

---

*Dokumen selanjutnya: [10 — Go/No-Go Checklist](10-go-no-go-checklist.md) — keputusan akhir mulai implementasi.*
