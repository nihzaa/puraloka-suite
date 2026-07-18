# ADR-002 — Enforcement Levels dan Template Standar

**Status:** Menunggu persetujuan founder
**Melengkapi:** [ADR-001](ADR-001-structure-and-governance-model.md) — ADR itu memutuskan RFC 2119 dipakai; dokumen ini memutuskan **persisnya bagaimana** template 12-bagian menerapkannya, supaya seluruh 39 file yang akan ditulis mengikuti pola identik (mencegah *format drift*, bentuk drift lain yang harus dicegah setara dengan drift yang eksplisit disebut brief).

---

## Masalah yang Dijawab

12 bagian yang diminta (Purpose → References) adalah **daftar topik**, bukan **spesifikasi format**. Tanpa spesifikasi presisi, penulisan 39 file besar berisiko menghasilkan variasi implisit — satu file menaruh Checklist sebagai daftar prosa, file lain sebagai tabel bercentang; satu file menulis Migration Strategy untuk kode yang belum ada (mengarang), file lain jujur menyatakan "N/A, belum ada implementasi untuk dimigrasikan." ADR ini mengunci format supaya variasi seperti itu tidak terjadi.

---

## Template Kanonik per Bagian

### 1. Purpose
**Format:** 2-4 kalimat. **Wajib** menjawab: masalah konkret apa yang dicegah/diselesaikan standar ini — bukan deskripsi topik ("standar ini mengatur database" ❌) tapi tujuan ("standar ini mencegah kelas bug yang ditemukan di [00-current-state-audit.md](../../Phase1/00-current-state-audit.md) — RLS yang tidak sinkron dengan permission engine" ✅ jika relevan).

### 2. Background
**Format:** Prosa 1-3 paragraf. **Wajib** merujuk kondisi nyata — kutip [Enterprise Architecture Repository](../../00-vision-and-business-architecture.md) atau [Phase 1 Planning Package](../../Phase1/00-current-state-audit.md) secara eksplisit di mana relevan (file:line untuk temuan kode, section-link untuk keputusan arsitektur). Untuk topik horizon-jauh (Event-Driven, AI Coding), **wajib** menyatakan jujur status "belum diimplementasikan, kontrak untuk Phase X" — dilarang menyamarkan sebagai sudah berjalan.

### 3. Principles
**Format:** 3-6 butir, masing-masing satu kalimat prinsip + kalimat rationale singkat. Ini adalah "kenapa" di balik Mandatory Rules — dipisah dari Mandatory Rules supaya perubahan detail teknis (Mandatory Rules) di masa depan tetap bisa diverifikasi konsisten terhadap prinsip yang tidak berubah.

### 4. Mandatory Rules
**Format:** Daftar bernomor. **Setiap butir wajib diawali kata kunci RFC 2119** (`MUST`/`MUST NOT`) dalam huruf kapital, diikuti aturan presisi yang **dapat diverifikasi objektif** — bukan "kode harus bersih" (tidak terverifikasi) tapi "setiap fungsi publik MUST punya type signature eksplisit, tidak boleh `any` implisit" (terverifikasi via `tsc --noEmit` atau linter rule spesifik). Setiap butir, jika relevan, **wajib** menyebut **mekanisme verifikasi** (linter rule, CI check, code review checklist item) — aturan tanpa mekanisme verifikasi adalah aturan yang tidak bisa diaudit, melanggar syarat brief sendiri.

### 5. Recommended Rules
**Format:** Sama seperti Mandatory Rules, kata kunci `SHOULD`/`SHOULD NOT`. Setiap butir **wajib** menyertakan kondisi kapan deviasi bisa diterima (supaya "SHOULD" tidak jadi kata kosong yang tidak pernah benar-benar mengikat apa pun).

### 6. Anti-Pattern
**Format:** Daftar, masing-masing: nama pola (mis. "God Repository") + kenapa ini menggoda dilakukan + kenapa berbahaya. **Wajib** diambil dari kelas kesalahan yang **benar-benar ditemukan** di audit ([Phase1/00-current-state-audit.md](../../Phase1/00-current-state-audit.md)) atau dikenal luas di industri konstruksi software — bukan anti-pattern generik yang tidak relevan konteks Puraloka Suite.

### 7. Example Good
**Format:** Cuplikan kode/skema **dengan sumber eksplisit**. Untuk file dengan bukti codebase nyata: kutip langsung dengan file:line (pola yang sudah dipakai konsisten di seluruh [Phase1/](../../Phase1/00-current-state-audit.md)). Untuk file horizon-jauh: kutip desain dari architecture repo (mis. skema SQL dari [Phase1/02-target-architecture.md](../../Phase1/02-target-architecture.md)) dengan keterangan eksplisit "desain, belum diimplementasikan."

### 8. Example Bad
**Format:** Sama seperti Example Good, tapi **wajib** menunjukkan kode/pola yang salah — untuk file dengan bukti nyata, boleh mengutip pola yang sudah teridentifikasi sebagai gap (mis. inline `.role === 'admin'` dari [00-current-state-audit.md § 1.5](../../Phase1/00-current-state-audit.md)) sebagai contoh yang harus dihindari mulai sekarang. **Dilarang keras mengarang contoh buruk yang tidak representatif** — jika tidak ada contoh nyata untuk topik tertentu, tulis contoh hipotetis singkat dengan keterangan eksplisit "(hipotetis — belum ditemukan di codebase, dicantumkan sebagai pencegahan)."

### 9. Migration Strategy
**Format:** Bagian ini menjawab pertanyaan **"bagaimana kode existing yang melanggar aturan ini dibawa ke kepatuhan?"** — bukan strategi migrasi database (itu topik file 34 sendiri). Untuk aturan yang **sudah dilanggar** kode existing (terverifikasi lewat audit), **wajib** merujuk balik ke [Phase1/03-migration-strategy.md](../../Phase1/03-migration-strategy.md) jika tumpang tindih, atau definisikan strategi baru jika belum tercakup. Untuk aturan yang **belum ada kode untuk dilanggar** (topik horizon jauh, atau aturan baru murni), tulis eksplisit "N/A — tidak ada kode existing untuk dimigrasikan, aturan berlaku penuh sejak commit pertama yang menyentuh domain ini."

### 10. Checklist
**Format:** Daftar tercentang (`- [ ]`), **diekstrak langsung** dari Mandatory Rules + Recommended Rules terpilih di atas (bukan daftar baru yang independen — ini adalah representasi actionable dari bagian 4-5, harus 1:1 traceable). Checklist inilah yang secara langsung dipakai [15-code-review-checklist](../05-team-process/15-code-review-checklist.md) dan [20-checklist-before-merge](../05-team-process/20-checklist-before-merge.md) sebagai sumber rujukan (bukan menulis ulang aturan yang sama dengan kata berbeda di file lain — prinsip anti-duplikasi dari [ADR-001](ADR-001-structure-and-governance-model.md)).

### 11. Success Metrics
**Format:** Tabel — Metric, Target, Cara Ukur. **Wajib realistis untuk skala tim saat ini** ([00 — Assumptions](../../00-vision-and-business-architecture.md#assumptions): tim kecil) — dilarang menulis target yang butuh infrastruktur belum ada (mis. "99.9% uptime terukur via Datadog" saat Datadog belum terpasang) tanpa menyebut prasyarat itu eksplisit sebagai bagian dari targetnya.

### 12. References
**Format:** Daftar link — **wajib** membedakan 3 kategori: (a) dokumen internal (architecture repo, Phase 1, file constitution lain), (b) standar eksternal otoritatif (OWASP ASVS, RFC 2119, dst — hanya yang benar-benar dirujuk isi file, bukan daftar generik "bacaan lanjutan"), (c) *(tidak ada kategori ketiga — dilarang mencantumkan blog/artikel non-otoritatif sebagai referensi normatif, konsisten larangan "copy paste internet" di brief)*.

---

## Level Kematangan (Maturity Level) — Tambahan di Luar 12 Bagian Asli

**Usulan baru** (di luar 12 bagian yang diminta brief, tapi brief eksplisit mengizinkan penambahan jika beralasan kuat): Setiap file diberi **header maturity badge** di baris pertama setelah judul:

```markdown
> **Maturity:** 🟢 Enforced (kode existing sudah patuh, gate CI aktif)
> **Maturity:** 🟡 Partial (sebagian kode patuh, migrasi berjalan — lihat Migration Strategy)
> **Maturity:** 🔵 Designed (kontrak masa depan, belum ada kode untuk diverifikasi — lihat Background)
```

**Rationale:** Ini menjawab langsung permintaan brief "jangan placeholder, jangan teori tanpa implementasi" dengan cara **paling jujur** — bukan menghindari menulis topik yang belum terimplementasi (semua 39 file tetap ditulis lengkap dan matang), tapi **secara eksplisit dan visual** menyatakan status realitanya di setiap file, supaya pembaca (termasuk auditor kelas dunia yang brief sebut) tidak salah kira 🔵 Designed sebagai 🟢 Enforced. Kejujuran status ini sendiri adalah tanda kematangan governance, bukan kelemahan dokumen.

---

## Konvensi Penamaan & Cross-Reference

- **Nama file:** `NN-kebab-case-name.md`, konsisten dengan konvensi yang sudah dipegang seluruh repository ([00 — Naming Conventions](../../00-vision-and-business-architecture.md) turunan CLAUDE.md: "Files: kebab-case").
- **Cross-reference antar file constitution:** Path relatif eksplisit dari lokasi folder baru (mis. dari `03-core-implementation/05-database-engineering-standard.md` merujuk `04-quality-and-observability/08-testing-standard.md` sebagai `../04-quality-and-observability/08-testing-standard.md`) — **wajib diverifikasi otomatis** dengan script yang sama (pola PowerShell) yang sudah dipakai untuk memverifikasi cross-link di [00-06](../../00-vision-and-business-architecture.md) dan [Phase1/](../../Phase1/00-current-state-audit.md), diperluas untuk struktur folder bertingkat.
- **Cross-reference ke luar (architecture repo, Phase 1):** Path relatif dari kedalaman folder yang benar (2 level dari `Engineering-Constitution/0X-folder/` ke `2026-07-18-enterprise-architecture/` adalah `../../`).

---

## Bahasa

Konsisten dengan seluruh repository: **prosa Bahasa Indonesia + istilah teknis Inggris** ([sesuai preferensi founder](../../00-vision-and-business-architecture.md) yang berlaku sejak dokumen 00). Kata kunci RFC 2119 (MUST/SHOULD/MAY) **tetap dalam Bahasa Inggris huruf kapital** tanpa terjemahan — ini istilah teknis presisi yang kehilangan makna normatifnya jika diterjemahkan ("HARUS" tidak otomatis dipahami pembaca sebagai merujuk RFC 2119 secara spesifik).

---

*ADR selanjutnya jika dibutuhkan: keputusan struktural baru apa pun yang muncul selama penulisan 8 batch akan didokumentasikan sebagai ADR-003 dst., sesuai instruksi wajib founder.*
