# 36 — AI Coding Guideline

> **Maturity:** 🟡 Partial — Puraloka Suite hari ini secara faktual dikembangkan dengan bantuan AI coding assistant (Claude Code) sebagai praktik nyata sejak awal, tapi belum ada guideline tertulis eksplisit tentang batasan dan tanggung jawab sampai file ini.

**Kedudukan:** Batch 7 — Domain Spesifik. Prinsip HITL untuk AI agent otomasi bisnis ([06-agentic-ai-and-automation-architecture.md § Prinsip 3-6](../../06-agentic-ai-and-automation-architecture.md#prinsip-3--human-approval-boundaries)) diadaptasi di sini untuk AI *coding* assistant — domain berbeda (menulis kode vs mengeksekusi automation bisnis) tapi prinsip human-in-command yang sama berlaku.

---

## 1. Purpose

Menetapkan batasan tanggung jawab antara AI coding assistant dan manusia (Nizar) dalam pengembangan Puraloka Suite — memastikan keputusan yang butuh judgment bisnis atau berisiko finansial tetap melalui persetujuan manusia eksplisit, sementara AI tetap bisa bekerja efektif untuk implementasi teknis.

## 2. Background

Sesi kerja ini sendiri adalah contoh nyata: pembentukan Engineering Constitution ini eksplisit "DO NOT WRITE PRODUCTION CODE," dan sepanjang sesi, keputusan scope besar (Phase 1 diperluas ke 1A-1D, roadmap 12-fase dicocokkan ke doc 04, sequencing ADR vs Master Delivery Blueprint) selalu dikonfirmasi eksplisit ke user lewat pertanyaan langsung sebelum eksekusi — bukan diasumsikan sepihak. Pola ini adalah preseden nyata untuk file ini, bukan aturan yang belum pernah dipraktikkan.

## 3. Principles

1. **AI mengeksekusi dengan presisi, manusia memutuskan arah dan menyetujui risiko.** AI Coding Assistant **MUST** unggul dalam eksekusi teknis yang presisi (mengikuti spesifikasi, konsistensi lintas file, verifikasi sistematis) — tapi keputusan scope, prioritas bisnis, dan trade-off arsitektur besar tetap keputusan manusia.
2. **Ambiguitas dikonfirmasi, bukan diasumsikan — terutama untuk perubahan finansial-kritis atau berdampak luas.** Preseden: setiap kali muncul potensi konflik scope selama sesi ini (Warm Clay vs desain baru, Phase 1 sempit vs luas, urutan ADR vs Blueprint), pertanyaan eksplisit diajukan sebelum melanjutkan — bukan pilihan sepihak yang "kelihatannya masuk akal."
3. **AI MUST transparan tentang keterbatasan dan asumsi, tidak menyembunyikan ketidakpastian di balik kepercayaan diri palsu.** Klaim "gap ditemukan" harus disertai bukti verifikasi langsung (grep, baca file), bukan diasumsikan dari ingatan pola umum.

## 4. Mandatory Rules

1. Perubahan yang menyentuh logic finansial-kritis (kalkulasi kasbon, RAB, pajak, pembayaran) yang dihasilkan AI coding assistant **MUST** direview oleh manusia sebelum di-deploy — **MUST NOT** di-merge otomatis tanpa tinjauan manusia untuk domain ini, bahkan jika test lolos.
2. AI coding assistant **MUST** mengonfirmasi eksplisit ke manusia sebelum mengeksekusi perubahan berskala besar (migrasi struktural, penghapusan file, perubahan skema database) yang sulit dibalik — **MUST NOT** mengasumsikan izin implisit dari instruksi yang ambigu untuk aksi berisiko tinggi (konsisten prinsip "Executing actions with care").
3. Klaim faktual tentang kondisi codebase (gap, bug, status implementasi) yang dihasilkan AI **MUST** didasarkan pada verifikasi langsung (baca file, grep, jalankan command) — **MUST NOT** didasarkan pada asumsi pola umum tanpa dicek terhadap kode nyata Puraloka Suite spesifik.
4. AI coding assistant **MUST NOT** menghapus atau menimpa pekerjaan manusia yang belum di-commit tanpa konfirmasi eksplisit — file/state tidak dikenal yang ditemukan **MUST** diinvestigasi dulu, bukan langsung dianggap sampah dan dihapus.

## 5. Recommended Rules

1. Tugas besar yang melibatkan banyak keputusan desain (seperti pembentukan dokumen arsitektur ini) **SHOULD** dipecah menjadi batch dengan checkpoint verifikasi (self-review sebelum commit) — mengurangi risiko error menumpuk sebelum terdeteksi, preseden yang sudah dipraktikkan konsisten sepanjang sesi ini.

## 6. Anti-Pattern

**AI Mengasumsikan Scope Tanpa Konfirmasi** — melanjutkan implementasi besar berdasarkan interpretasi sepihak dari instruksi ambigu, alih-alih bertanya dulu saat ada dua interpretasi valid berbeda secara signifikan — risiko kerja terbuang besar jika interpretasi salah, terutama untuk dokumen/kode yang scope-nya sudah diperluas signifikan dari brief awal.

**Klaim Tanpa Verifikasi** — menyatakan "fungsi X sudah menangani kasus Y" tanpa benar-benar membaca kode fungsi tersebut, hanya berdasarkan asumsi pola umum framework — bertentangan Mandatory Rule #3 dan seluruh disiplin verifikasi-langsung yang dipegang di Phase1 audit.

## 7. Example Good

Preseden konkret sesi ini: AskUserQuestion dipakai berulang kali untuk konfirmasi scope sebelum eksekusi besar (Warm Clay vs redesign baru, sequencing Master Delivery Blueprint vs ADR) — bukan asumsi sepihak. Setiap klaim gap di Phase1 audit disertai file:line spesifik yang diverifikasi langsung via grep/Read, bukan diasumsikan dari pola umum "biasanya begini."

## 8. Example Bad

*(Hipotetis)*: AI langsung mengimplementasikan interpretasi sendiri dari instruksi "redesign UI biar lebih modern" tanpa mengklarifikasi apakah ini berarti mengganti Warm Clay atau menambah lapisan di atasnya — berpotensi menghasilkan kerja besar yang harus diulang jika interpretasinya salah.

## 9. Migration Strategy

N/A — pola sudah 100% konsisten dipraktikkan sepanjang riwayat kolaborasi AI-human di proyek ini (preseden sesi ini sendiri). Berlaku sebagai standar mengikat yang diformalkan, bukan pola baru yang butuh transisi.

## 10. Checklist

- [ ] Perubahan finansial-kritis dari AI direview manusia sebelum deploy
- [ ] Aksi berisiko tinggi/sulit dibalik dikonfirmasi eksplisit sebelum eksekusi
- [ ] Klaim faktual tentang codebase diverifikasi langsung, bukan diasumsikan
- [ ] Pekerjaan manusia yang belum di-commit tidak dihapus tanpa investigasi

## 11. Success Metrics

| Metric | Target | Cara Ukur |
|---|---|---|
| Perubahan finansial-kritis AI yang di-merge tanpa review manusia | 0 | Audit riwayat PR |
| Klaim gap/bug AI yang terbukti salah saat diverifikasi | Menurun dari baseline | Review retrospektif |

## 12. References

- [06-agentic-ai-and-automation-architecture.md § Prinsip 3-6](../../06-agentic-ai-and-automation-architecture.md#prinsip-3--human-approval-boundaries)
- [GLOSSARY.md — HITL](../GLOSSARY.md)
- [00-principles/00-engineering-principles.md](../00-principles/00-engineering-principles.md)
- [40-ai-governance-and-agent-engineering-standard.md](40-ai-governance-and-agent-engineering-standard.md) (domain berbeda — AI *product* agent yang menjadi bagian aplikasi, bukan AI coding assistant yang menulis kode)

---

*Batch 7 selesai. File selanjutnya (Batch 8 — Metrics & Penutup): [08-metrics-and-closing/37-engineering-metrics.md](../08-metrics-and-closing/37-engineering-metrics.md)*
