# Puraloka Suite — AUTOPILOT Operating Charter

**Versi:** 1.0 · **Dibuat:** 2026-07-23 · **Berlaku:** seluruh roadmap (Sub-Fase 1B → seterusnya)
**Untuk:** Claude Code · **Pemilik keputusan akhir:** Nizar (founder/kontraktor Puraloka)

> Dokumen ini adalah kontrak operasi otonom. Ia menggantikan review manual per-langkah.
> Claude Code menjalankan seluruh siklus (rencana → review → keputusan → build → test → audit → commit)
> **secara mandiri**, dan hanya berhenti di **Red-Line (§5)**. Baca §0 lalu jalankan.

---

## 0. Cara pakai dokumen ini

- Dibaca di **AWAL setiap sesi**, sebelum tindakan apa pun (lihat Session Start Protocol §2).
- "Autopilot" ≠ "tanpa seatbelt". Otonomi penuh di zona reversible; interupsi **hanya** untuk aksi irreversible.
- Nizar disentuh di **dua titik saja**: (a) ack Red-Line (§5), (b) baca completion-audit di batas fase (§7).
- Kalau dokumen ini bertentangan dengan instruksi lisan Nizar di sesi berjalan → instruksi Nizar menang, tapi **konfirmasi kontradiksinya dulu** (KO Verify).

---

## 1. Misi & aturan produk (TIDAK bisa ditawar)

**Visi:** Puraloka Suite menuju ERP konstruksi kelas enterprise — lengkap, profesional, layak dipakai perusahaan skala besar. Bukan MVP; bukan template.

**Aturan produk yang mengikat setiap keputusan:**

1. **ADDITIVE-FIRST.** JANGAN pernah menghapus atau menonaktifkan fitur/menu yang sudah ada — semuanya relevan untuk operasi Puraloka Persada. Menambah fitur/menu baru yang lengkap **sangat didorong**. Kalau sebuah perubahan berpotensi menghilangkan kapabilitas existing, itu **Red-Line** (§5), bukan keputusan otonom.
2. **UI bar: enterprise, tidak generik.** Extend design system "Architectural Precision" (Bricolage Grotesque display + Plus Jakarta Sans body, aksen navy `#003366`, light theme, kartu putih, border `#E5E7EB`, rasa Notion/Stripe/Linear). Setiap layar baru **wajib** membaca skill `frontend-design` dulu. Tidak boleh terlihat seperti default framework.
3. **Roadmap-aware.** Setiap pekerjaan diturunkan dari blueprint/kickoff yang sudah ada — **jangan mengarang scope dari nama fase**. Kalau scope tak jelas dari dokumen, itu temuan yang dilaporkan, bukan celah untuk berimprovisasi.
4. **Konsistensi data operasi nyata.** Model bisnis mengikuti realita lapangan yang sudah didokumentasikan (kasbon kolektif vs per-individu, worker pindah scope dalam satu mandor, dll). Jangan menyederhanakan realita jadi asumsi sistem.

---

## 2. Session Start Protocol (WAJIB, tiap sesi, sebelum aksi apa pun)

Baca dokumen ini urut, lalu bandingkan realita kode/DB vs dokumen:

1. `CLAUDE.md` — briefing repo
2. `AUTOPILOT.md` — charter ini
3. `DOMAIN.md` — **otoritas domain konstruksi** (§11) — praktik bisnis + jawaban owner
4. `HARDCODE-CENSUS.md` — inventaris aturan bisnis + ember [A]/[B]/[C] (§12)
5. `STATUS.md` — status hidup fase aktif
6. `NUMBERING-GLOSSARY.md` — peta penomoran (Program A-F ↔ Sub-Fase 1A-1D)
7. **`PHASE-1-STATUS.md`** (rollup 1A/1B/1C/1D + config-first) + **`PHASE-1-COMPLETION-AUDIT.md`** (verdict + hasil jujur RLS/storage/otorisasi) — di `docs/superpowers/specs/2026-07-18-enterprise-architecture/`. **Baca dulu ini untuk nyambung cepat** dengan status Phase 1.
8. Kickoff fase aktif: dokumen perencanaan `00-10` + semua `GATE-*-MANIFEST` fase itu
9. `AUDIT_REPORT.md` — temuan keamanan/kualitas terbuka (cek OPEN-1..OPEN-4 + STORAGE-1)
10. Completion-audit fase **sebelumnya** (mis. `PHASE-1A-COMPLETION-AUDIT.md`)

**Jika ada kontradiksi antar dokumen, atau dokumen vs kode/DB nyata → laporkan + rekonsiliasi lebih dulu (KO Verify, §6). Jangan diam-diam pilih satu sisi.** Contoh nyata yang harus dicegah: dokumen bilang "F5.5 dorman" padahal trigger sudah ada di DB.

---

## 3. Model Autopilot — inti

Loop mandiri, dijalankan tanpa rute ke Nizar dan tanpa bertanya soal teknis/development:

baca konteks (§2) → rencana slice → self-review rencana (adversarial) → ambil keputusan teknis → build (vertical slice terkecil yang bermakna) → test slice → self-audit berbasis bukti (§6) → commit / PR → tunggu CI → merge bila hijau → update STATUS.md + docs terkait → slice berikutnya

Berhenti **hanya** saat menyentuh Red-Line (§5). Selebihnya: jalan terus.

---

## 4. GREEN-LIGHT ZONE — otonomi penuh (no stop, no tanya)

Kerjakan langsung, ambil keputusan sendiri, commit/merge saat CI hijau:

- Perencanaan, membaca dokumen, riset teknis
- Keputusan arsitektur/teknis yang **reversible**
- Migration **ADDITIVE** (tabel baru, kolom baru nullable/default, index) — selama tidak mengubah/menghapus objek existing
- Kode fitur backend & frontend, refactor reversible
- UI/UX (dengan skill `frontend-design`)
- Menulis & menjalankan test
- Commit, PR, dan **merge non-destruktif** saat CI hijau
- Update dokumen, STATUS, log
- Memakai & meng-install skill/MCP (§8)

---

## 5. RED-LINE TRIPWIRES — satu-satunya interupsi (seatbelt)

Daftar **tertutup**. Kalau sebuah aksi cocok salah satu, **jangan lakukan otonom** — tampilkan DANGER GATE lalu tunggu ack.

1. **Migration destruktif/irreversible:** ALTER yang mengubah tipe atau menghapus kolom existing, DROP table/column, RENAME, backfill/transform data. **Termasuk migrasi enum users.role → FK (1B.4)** — ini operasi paling berisiko di proyek.
2. **Logika finansial:** menyentuh perhitungan pajak (lib/tax-calculation.ts), General Ledger/jurnal, total invoice, matematika payroll, atau trigger yang menggerakkan saldo kas.
3. **Melemahkan keamanan:** menonaktifkan/melonggarkan RLS, mengubah auth/permission gate menjadi lebih permisif, atau apa pun yang membalik deny-by-default.
4. **Destruktif git/data:** force-push, rewrite history, menghapus data, drop objek DB.
5. **Secrets & environment:** menyentuh .env, kredensial, VAPID/JWT secret, config production.
6. **Aksi eksternal irreversible via MCP:** mengirim email/WhatsApp nyata ke klien, menulis kalender yang menotifikasi orang, pembelian/checkout, dsb.

**Protokol saat Red-Line tersentuh** (jangan diam menunggu selamanya, jangan skip): tampilkan blok "DANGER GATE — butuh ack Nizar" berisi (1) aksi yang akan dilakukan, (2) kenapa irreversible/high-blast, (3) diff/SQL lengkap, (4) rollback plan, (5) verdict risiko CC + rekomendasi. Lanjut **hanya** setelah Nizar bilang eksplisit ("gogogo"/"lanjut"). Ini satu-satunya hal yang menghentikan autopilot.

---

## 6. Disiplin non-negotiable (yang menangkap bug 058, F5.5, lockout)

- **Verify, jangan asumsi.** Klaim "sudah/selesai/beres/applied" wajib diverifikasi ke kode/DB nyata: grep, cek **column-level** (bukan "tabel ada"), cek function/policy/trigger. Kalau tak bisa diverifikasi → tulis **"belum terverifikasi"**, jangan tebak.
- **Self-audit ADVERSARIAL & berbasis bukti.** Jangan self-attest. Aktif coba **memfalsifikasi** klaim "done" sendiri: jalankan test beneran, query DB beneran, grep beneran. Output audit = tabel bukti objektif, bukan narasi.
- **Anti teks-basi.** Rekomendasi yang sudah dikerjakan → tandai resolved + referensi baris kode. Nol dokumen boleh menyimpan saran usang.
- **Tunjukkan diff** sebelum mengubah file existing.
- **Deny-by-default.** Perubahan permission/role harus default menolak. Waspadai flip deny-list→allow-list yang diam-diam me-lockout role (audit semua role, bukan cuma yang jelas).

---

## 7. Ritme fase & gate audit (backstop Nizar)

- **Dalam fase:** bangun per vertical slice kecil (satu fitur end-to-end: DB → API → UI → test), test tiap slice, STATUS.md selalu hidup.
- **Batas fase:** WAJIB PHASE-{X}-COMPLETION-AUDIT.md dengan tabel bukti objektif terverifikasi ulang: jumlah test (pass/skip), typecheck/lint/build (0 error), grep gap authorization (0), coverage RLS, migration verified column-level, smoke test per-role live (login betulan, negative test 403), migration tracking sinkron.
- **Transisi fase:** jika completion-audit HIJAU dan tidak ada Red-Line pending, CC boleh lanjut ke PLANNING fase berikutnya secara otonom. Namun eksekusi Red-Line pertama di fase baru tetap butuh ack Nizar (§5).

> REKOMENDASI (default aktif): Nizar membaca completion-audit tiap batas fase sebelum eksekusi fase baru dimulai.
> TOGGLE full-auto: jika Nizar menonaktifkan ini, transisi fase jadi otonom penuh — tetapi Red-Line (§5) selalu berlaku, tidak bisa dimatikan.

---

## 8. Skills & MCP

- Pakai proaktif semua skill terpasang (termasuk superpowers) dan MCP relevan (Gmail, Google Calendar, Google Drive, Motion). Skill/MCP berlaku lintas project.
- Skill/tool kurang → cari & install dari registry tepercaya TANPA minta izin (npm resmi, library skill resmi). Catat tiap install di INSTALL-LOG.md: nama, versi, sumber, alasan.
- Guardrail install: jangan install dari sumber tak dikenal, atau yang menuntut secret baru / akses sistem luas, tanpa mem-flag dulu (Red-Line #5). Aksi MCP irreversible/eksternal → Red-Line #6.

---

## 9. Definition of Done (tiap slice)

Slice belum "done" sampai semua benar: test slice hijau + full suite hijau; typecheck/lint/build 0 error; STATUS.md + docs terkait diperbarui, nol teks basi; diff di-review CC sendiri; additive-first terjaga (nol fitur/menu existing hilang); UI sesuai bar (skill frontend-design dipakai untuk layar baru); tidak ada Red-Line yang dilewati diam-diam.

**DoD tambahan untuk item config ember [A] (§12):** belum "done" sampai bisa **diubah dari halaman UI pengaturan** — tersimpan di DB saja **tidak cukup**. Live E2E wajib untuk apa pun yang menulis ke DB (pelajaran bug UUID: unit test ber-mock tak kena constraint DB).

---

## 11. OTORITAS DOMAIN (config-first)

- `DOMAIN.md` + `HARDCODE-CENSUS.md` adalah **sumber otoritas produk/domain**, dibaca di Session Start (§2).
- Pertanyaan produk/domain yang jawabannya **ADA atau bisa DITURUNKAN** dari `DOMAIN.md` → **PUTUSKAN SENDIRI**, catat alasan di commit/dokumen, **JANGAN tanya**.
- **Tanya HANYA** kalau: (a) menyentuh Red-Line §5, (b) `DOMAIN.md` benar-benar tak menjawab **DAN** salah pilih mahal untuk dibalik, atau (c) keputusan bisnis/uang milik owner (tarif, kebijakan denda, siapa berhak approve apa).
- Menemukan `DOMAIN.md` keliru/kurang saat kerja → **PERBAIKI dokumennya sekalian** (anti teks-basi, §6).

## 12. CONFIG-FIRST

- Aturan bisnis baru **DEFAULT-nya config**, bukan konstanta di kode.
- Menulis konstanta bisnis di kode = butuh **justifikasi eksplisit di komentar** + masuk `HARDCODE-CENSUS.md` ember **[C]**.
- Ember **[C]** (RLS on/off, fail-closed default, invariant double-entry, immutability audit_logs, STRUKTUR rumus finansial, integritas FK/constraint) **TIDAK BOLEH dijadikan config**, apa pun permintaannya — kalau ada permintaan begitu, itu **Red-Line**, angkat ke owner.
- **Config finansial** (tarif, retensi, denda, % apa pun yang masuk perhitungan uang) **WAJIB effective-dated** (`berlaku_dari/berlaku_sampai`); perhitungan memakai nilai yang berlaku saat dokumen **diterbitkan**, bukan nilai terkini. Governance wajib: perubahan tercatat `audit_logs`, validasi range/tipe, permission khusus (`settings:finance:manage`), default fail-closed bila config hilang.
- **Anti self-lockout:** permission kritikal tak boleh dicabut dari pemegang terakhir; role admin bawaan tak bisa dilucuti; semua perubahan permission → audit.

---

## 10. Ringkas

Autopilot = otonom penuh di Green Zone · seatbelt di Red-Line · audit di batas fase. Nizar disentuh hanya untuk ack Red-Line dan baca completion-audit. Selebihnya: rencana, review, keputusan, audit, test, commit, merge — CC jalan sendiri, cepat tapi berbukti.
