# 39 — Final Engineering Manifesto

> **Maturity:** 🟢 Enforced — bukan sebagai kode yang diverifikasi otomatis, tapi sebagai ringkasan prinsip yang seluruhnya sudah diturunkan konsisten dari 38 file sebelumnya, bukan klaim baru yang belum terbukti.

**Kedudukan:** Batch 8 — Metrics & Penutup. File penutup Engineering Constitution. Tidak memperkenalkan aturan baru — merangkum semangat yang mengikat seluruh 38 file sebelumnya menjadi pernyataan singkat yang bisa diingat tanpa membuka dokumen.

---

## 1. Purpose

Menjawab pertanyaan "kalau saya hanya bisa mengingat satu hal dari seluruh Engineering Constitution ini, apa itu?" — dan memberikan jangkar semangat yang bisa dirujuk saat aturan spesifik di 38 file lain tidak secara eksplisit mencakup situasi baru yang dihadapi.

## 2. Background

Engineering Constitution ini ditulis dalam konteks spesifik: Puraloka Suite, sebuah aplikasi konstruksi yang menangani uang sungguhan (kasbon, invoice, pembayaran mandor) untuk bisnis nyata (Puraloka Persada, milik Nizar) — bukan proyek pembelajaran atau prototipe. Setiap aturan di 38 file sebelumnya berakar dari kenyataan ini: [00-principles/00-engineering-principles.md](../00-principles/00-engineering-principles.md) menetapkan correctness-before-speed dan fail-closed karena kesalahan di sini berarti kerugian finansial nyata, bukan sekadar bug kosmetik.

## 3. Manifesto

1. **Kode ini menangani uang sungguhan.** Setiap baris di domain finansial-kritis (kasbon, RAB, termin, kurva-S, progress payment) diperlakukan dengan kehati-hatian yang sepadan — test sebelum diklaim benar, review sebelum di-deploy, rollback plan sebelum migrasi berisiko dijalankan.

2. **Kejujuran tentang status mengalahkan tampilan kelengkapan.** Maturity Badge 🟡 Partial yang jujur, gap yang didokumentasikan dengan file:line spesifik, debt yang dicatat dengan alasan eksplisit — semua ini lebih berharga daripada dokumen yang terlihat sempurna tapi menyembunyikan kondisi nyata.

3. **Fail-closed, selalu.** Saat ragu antara mengizinkan atau menolak akses, antara mempercayai atau memvalidasi input, antara mengasumsikan atau memverifikasi — pilihan yang lebih aman menang, bahkan jika lebih lambat.

4. **Ambiguitas dikonfirmasi, tidak diasumsikan.** Baik antara manusia dan manusia, maupun antara manusia dan AI coding assistant — keputusan yang berdampak luas atau sulit dibalik selalu melalui konfirmasi eksplisit, bukan tebakan terbaik yang kelihatannya masuk akal.

5. **Konsistensi yang sudah terbukti bekerja dipertahankan, bukan diganti demi tren.** `snake_case` database, Conventional Commits, modular monolith — semua sudah terbukti bekerja di skala Puraloka Suite hari ini. Perubahan besar butuh ADR dengan alasan kuat, bukan sekadar "praktik terbaik industri" tanpa mempertimbangkan konteks.

6. **YAGNI ditegakkan dengan disiplin, bukan sebagai alasan malas.** Kompleksitas (microservices, event sourcing, saga pattern, caching preventif) ditambahkan saat bukti kebutuhan nyata ada — bukan diasumsikan akan dibutuhkan "someday."

7. **Setiap MUST rule di 38 file sebelumnya punya alasan yang bisa dijelaskan — bukan aturan sewenang-wenang.** Jika sebuah aturan terasa tidak masuk akal untuk situasi baru yang dihadapi, itu sinyal untuk mengajukan ADR mengubahnya ([06-governance/19-architecture-decision-record-guide.md](../06-governance/19-architecture-decision-record-guide.md)), bukan sinyal untuk diam-diam mengabaikannya.

8. **Constitution ini hidup, bukan batu yang dipahat sekali.** Ia akan diubah lewat Amendment Process ([00-principles/00-engineering-principles.md § 9](../00-principles/00-engineering-principles.md#9-amendment-process)) seiring Puraloka Suite tumbuh dari L1 (single-tenant internal) menuju L2, L3, L4 — tapi perubahan selalu disengaja dan terdokumentasi, tidak pernah diam-diam.

## 4. Penutup

39 file ini, dari [00-principles/00-engineering-principles.md](../00-principles/00-engineering-principles.md) sampai file ini, adalah satu dokumen hidup yang mengikat cara Puraloka Suite dibangun — Phase 1 sampai Phase 9, oleh siapa pun yang menyentuh kodenya, manusia atau AI. Ia dibangun dengan cara yang sama yang dituntutnya dari kode: diverifikasi langsung terhadap kondisi nyata (bukan diasumsikan), jujur tentang apa yang sudah ada dan apa yang masih menjadi target, dan siap diperdebatkan lewat ADR saat konteks berubah.

Selamat bekerja.

## 12. References

- [00-principles/00-engineering-principles.md](../00-principles/00-engineering-principles.md)
- [README.md](../README.md)
- Seluruh 38 file Engineering Constitution ini

---

*Engineering Constitution — 39 file, selesai.*
