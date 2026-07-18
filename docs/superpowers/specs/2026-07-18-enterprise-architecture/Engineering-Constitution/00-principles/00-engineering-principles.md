# 00 — Engineering Principles

> **Maturity:** 🟢 Enforced (prinsip filosofis, berlaku sejak dokumen ini disahkan — tidak menunggu implementasi kode apa pun)

**Kedudukan:** File paling fondasional di seluruh Engineering Constitution — 39 file lain (40 total sejak v1.1) mewarisi nilai yang ditetapkan di sini. Jika ada aturan spesifik di file lain yang tampak bertentangan dengan prinsip di sini, **prinsip di sini yang menang** kecuali ada ADR eksplisit yang mendokumentasikan pengecualian.

---

## 1. Purpose

Dokumen ini menetapkan **nilai dasar** yang mengikat seluruh keputusan rekayasa di Puraloka Suite — dari baris kode pertama Phase 1 sampai arsitektur SaaS multi-tenant di Phase 8-9. Tujuannya mencegah *values drift*: situasi di mana tim (manusia atau AI agent yang mengerjakan implementasi) membuat keputusan lokal yang secara individual masuk akal, tapi secara kolektif menyimpang dari arah yang sama.

## 2. Background

Puraloka Suite dibangun solo oleh satu engineer melalui 57 migration file dalam ~6 bulan, menghasilkan sistem yang **berfungsi nyata** (67 tabel, 159 endpoint, dipakai operasional harian) tapi dengan pola yang [Phase1/00-current-state-audit.md](../../Phase1/00-current-state-audit.md) tunjukkan sebagai konsekuensi kecepatan: tiga mekanisme otorisasi paralel, RLS yang tidak sinkron dengan RBAC v2, audit trail yang skemanya matang tapi write-path-nya nyaris kosong. Ini bukan kegagalan — ini adalah **hasil wajar** dari membangun cepat tanpa constitution. Dokumen ini ada supaya pola yang sama tidak terulang saat tim bertambah dan cakupan meluas ke Phase 2-9.

Puraloka Suite bercita-cita menjadi Construction Operating System yang bersaing dengan Procore, Primavera, SAP — produk yang dipercaya menangani transaksi finansial bernilai miliaran rupiah per tahun untuk ribuan organisasi ([00 — Product Vision](../../00-vision-and-business-architecture.md#product-vision)). Kepercayaan pada skala itu tidak bisa dibangun di atas kecepatan semata — ia butuh disiplin yang bisa diverifikasi, diaudit, dan diwariskan ke setiap engineer yang bergabung setelah hari ini.

## 3. Principles

1. **Correctness sebelum kecepatan.** Bug pada logic finansial (kasbon, EVM, tax calculation) berdampak nyata pada uang sungguhan — bukan sekadar UX yang kurang mulus. Rationale: [Phase1/06 — Realisme Target Coverage](../../Phase1/06-test-strategy.md#realisme-target-coverage-90--pembahasan-jujur) sudah menetapkan ini sebagai prioritas konkret, bukan slogan.
2. **Config-driven, bukan hardcoded.** Role, permission, workflow, menu, business rule — semuanya data, bukan `if/else` di source code. Rationale: [00 — Non-Negotiable Principles](../../00-vision-and-business-architecture.md) menetapkan ini sebagai prinsip yang mengikat seluruh transformasi arsitektur.
3. **Fail-closed, bukan fail-open.** Saat sistem tidak yakin soal otorisasi, defaultnya menolak akses. Rationale: satu-satunya arah kesalahan yang bisa diterima adalah "pengguna sah sementara terhalang" (mudah dilaporkan, cepat diperbaiki) — bukan "pengguna tidak sah mendapat akses" (sering tidak terdeteksi sampai insiden).
4. **Setiap perubahan berisiko punya jalur mundur.** Tidak ada migrasi/refactor yang dieksekusi tanpa rollback plan terverifikasi. Rationale: [Phase1/03 — Migration Strategy](../../Phase1/03-migration-strategy.md) menetapkan pola expand-contract sebagai pola wajib untuk perubahan berisiko tinggi — prinsip ini menggeneralisasi pola itu ke seluruh constitution.
5. **YAGNI ketat — jangan membangun untuk kebutuhan yang belum terbukti.** Setiap engine/abstraksi generik dibangun sebagai respons terhadap kebutuhan nyata yang teramati, bukan spekulasi. Rationale: [01 — Engine yang Sengaja Tidak Diprioritaskan](../../01-application-and-data-architecture.md#engine-yang-sengaja-tidak-diprioritaskan-di-l2) menunjukkan pola berulang keputusan ini di seluruh architecture repo.
6. **Kejujuran status di atas kesan matang.** Dokumentasi dan kode yang menyatakan sesuatu "sudah berfungsi" padahal belum, adalah bahaya lebih besar dari kejujuran mengakui gap. Rationale: [Phase1/00 — temuan `apps/api/src/utils/audit.ts` tidak ada](../../Phase1/00-current-state-audit.md#32-temuan-paling-kritis-helper-function-yang-direferensikan-tidak-ada) adalah contoh nyata konsekuensi ketidakjujuran status (dokumentasi migration 046 menyiratkan helper itu ada, padahal tidak) — Maturity Badge ([ADR-002](../adr/ADR-002-enforcement-levels-and-template.md)) adalah mekanisme struktural mencegah pola ini terulang di constitution ini sendiri.

## 4. Mandatory Rules

1. Setiap file Engineering Constitution **MUST** menyertakan Maturity Badge yang jujur mencerminkan status implementasi nyata, bukan status yang diinginkan.
2. Setiap keputusan yang bertentangan dengan Architecture Repository, Phase 1 Planning Package, atau file Engineering Constitution lain **MUST** didokumentasikan sebagai ADR baru sebelum dieksekusi — tidak ada pengecualian "karena buru-buru."
3. Aturan **MUST**/**MUST NOT** di file mana pun **MUST** disertai mekanisme verifikasi konkret (linter rule, CI check, atau item checklist eksplisit) — aturan yang tidak bisa diverifikasi otomatis atau manual dengan presisi **MUST NOT** ditulis sebagai MUST, turunkan ke SHOULD.
4. Perubahan pada aturan **MUST** di file mana pun **MUST** melalui Amendment Process (lihat bagian 9 di bawah) — tidak boleh diedit langsung tanpa jejak.

## 5. Recommended Rules

1. Engineer (atau AI agent) yang menemukan aturan di constitution ini terasa tidak realistis di lapangan **SHOULD** mengusulkan amandemen (lihat bagian 9), bukan diam-diam mengabaikannya — deviasi silent adalah bentuk *governance drift* yang paling berbahaya karena tidak terlihat.
2. Dokumen yang menjelaskan topik horizon-jauh (belum ada implementasi) **SHOULD** tetap ditulis dengan kedalaman penuh (bukan disingkat), dengan sumber contoh dari desain architecture repo yang sudah matang — deviasi dari ini butuh justifikasi eksplisit kenapa topik tersebut tidak bisa dijelaskan tanpa kode nyata.

## 6. Anti-Pattern

**"Kita akan rapikan nanti."** — Pola paling berbahaya yang teramati langsung di [Phase1/00-current-state-audit.md](../../Phase1/00-current-state-audit.md): migration 046 menuliskan intent yang jelas (event mana yang wajib diaudit, helper terpusat yang harus dibangun) tapi implementasinya tidak pernah menyusul. Godaan pola ini adalah kecepatan jangka pendek; bahayanya adalah dokumentasi yang menyesatkan pembaca masa depan mengira sesuatu sudah berfungsi.

**"Aturan generik dari internet, bukan spesifik konteks kami."** — Menyalin best practice generik tanpa mengaitkannya ke temuan/keputusan nyata Puraloka Suite. Constitution ini secara sengaja **selalu** mengutip sumber internal (file:line, section link) untuk setiap klaim — aturan yang tidak bisa dikaitkan ke sesuatu yang nyata di codebase atau architecture repo adalah kandidat kuat untuk dihapus, bukan dipertahankan sebagai teori.

## 7. Example Good

`Phase1/02-target-architecture.md` menerapkan prinsip #4 (jalur mundur) secara konkret — pola expand-contract untuk migrasi RLS, di mana policy lama dan baru hidup berdampingan sampai terverifikasi, memberi rollback path yang eksplisit di setiap langkah ([Phase1/03 § Migrasi 1A.2](../../Phase1/03-migration-strategy.md#migrasi-1a2--rls-sinkronisasi-migrasi-paling-berisiko-di-seluruh-phase-1)). Ini bukan teori — ini keputusan desain yang sudah dipertimbangkan trade-off-nya secara eksplisit.

## 8. Example Bad

`apps/api/src/routes/v1/change-orders.ts:576` — satu-satunya titik insert `audit_logs` di seluruh codebase, tapi tidak mengisi `severity`, `ip_address`, atau `user_agent` meski skema (migration 046) menyediakan kolom itu dan komentar migration secara eksplisit menyatakan perubahan `contract.value` sebagai event *wajib* `severity: 'critical'`. Ini adalah contoh nyata melanggar Principle #6 (kejujuran status) — desain terlihat matang, implementasi tertinggal jauh di belakang tanpa penanda eksplisit bahwa itu terjadi.

## 9. Amendment Process

Constitution ini **harus** bisa berevolusi selama 10 tahun — dokumen yang tidak punya mekanisme perubahan resmi akan ditinggalkan begitu realita berubah, persis pola Anti-Pattern #1 di atas.

**Siapa boleh mengusulkan:** Siapa pun — engineer manusia, atau AI agent yang mengerjakan implementasi Phase 1-9 dan menemukan aturan tidak realistis di lapangan (mis. Mandatory Rule yang ternyata tidak bisa diverifikasi otomatis seperti diasumsikan saat ditulis).

**Siapa berwenang menyetujui:** Founder (Nizar), sampai ada CTO/tech lead terpisah yang didelegasikan wewenang ini secara eksplisit — realita [00 — Assumptions](../../00-vision-and-business-architecture.md#assumptions): tim kecil.

**Proses berdasarkan level perubahan:**

| Jenis Perubahan | Proses |
|---|---|
| Amandemen aturan **MUST** (mengubah/menghapus/menambah) | **WAJIB** ADR baru di [adr/](../adr/), mengikuti format [06-governance/19-architecture-decision-record-guide.md](../06-governance/19-architecture-decision-record-guide.md) — mencakup masalah, alternatif, trade-off, konsekuensi |
| Amandemen aturan **SHOULD**/**MAY** | PR langsung ke file terkait, deskripsi PR **wajib** berisi justifikasi ringkas kenapa berubah |
| Perubahan struktur (folder, penggabungan/pemecahan file) | **WAJIB** ADR baru, mengikuti presedan [ADR-001](../adr/ADR-001-structure-and-governance-model.md) |
| Perbaikan typo/kejelasan tanpa mengubah makna aturan | PR langsung, tidak butuh ADR atau justifikasi khusus |

**Log amandemen:** Setiap amandemen signifikan (level MUST atau perubahan struktur) dicatat ringkas di [amendments/](../amendments/) — append-only, satu file per amandemen, format bebas tapi minimal mencakup tanggal, ringkasan perubahan, dan link ke ADR terkait. Ini adalah penerapan prinsip audit trail ([02 — Audit Logging](../../02-security-and-compliance-architecture.md#audit-logging--tamper-proof-logging)) ke governance dokumen itu sendiri — constitution yang mengatur audit trail untuk data aplikasi, secara konsisten menerapkan disiplin yang sama pada dirinya sendiri.

## 10. Checklist

- [ ] Perubahan yang diajukan sudah diklasifikasi: MUST, SHOULD/MAY, atau perubahan struktur?
- [ ] Jika MUST atau struktur — ADR sudah ditulis dan disetujui SEBELUM eksekusi?
- [ ] Jika SHOULD/MAY — justifikasi ringkas ada di deskripsi PR?
- [ ] Amandemen signifikan sudah dicatat di `amendments/`?
- [ ] Maturity Badge file terkait sudah diverifikasi masih akurat setelah perubahan?

## 11. Success Metrics

| Metric | Target | Cara Ukur |
|---|---|---|
| Amandemen tanpa ADR pada aturan MUST | 0 | Audit manual `amendments/` vs `adr/` — setiap entri amandemen level MUST harus punya ADR terkait |
| File dengan Maturity Badge tidak sesuai realita | 0 pada saat audit rutin | Verifikasi manual berkala (disarankan setiap awal fase baru — Phase 2, 3, dst.) |
| Rujukan ke "best practice generik" tanpa sumber internal | 0 | Review manual saat file baru ditulis/diubah |

## 12. References

- [Enterprise Architecture Repository — 00 Vision](../../00-vision-and-business-architecture.md)
- [Phase 1 Planning Package — 00 Current State Audit](../../Phase1/00-current-state-audit.md)
- [ADR-001 — Structure and Governance Model](../adr/ADR-001-structure-and-governance-model.md)
- [ADR-002 — Enforcement Levels and Template](../adr/ADR-002-enforcement-levels-and-template.md)
- RFC 2119 — Key words for use in RFCs to Indicate Requirement Levels (standar eksternal, dasar kosakata MUST/SHOULD/MAY)

---

*File selanjutnya (Batch 1 — Fondasi): [01-foundations/01-coding-standards.md](../01-foundations/01-coding-standards.md)*
