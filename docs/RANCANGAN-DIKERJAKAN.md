# Sub-menu berisiko yang digarap sebelum disiplin rancangan berlaku

> Dijaga `apps/api/scripts/audit-rancangan-submenu.mjs`.
> Menambah baris di sini = menyatakan sebuah sub-menu berisiko boleh berjalan
> tanpa rancangan tertulis. **Itu keputusan, bukan formalitas** — tulis
> alasannya, dan tulis apa yang belum diputuskan.

## Kenapa berkas ini ada

ROADMAP §"Kematangan rencana" menetapkan sepuluh sub-menu ber-ledger &
lintas-modul **wajib dirancang sebagai satu kelompok sebelum salah satunya
dikerjakan** — sekali angka masuk, mengubah modelnya mahal.

Penjaga itu dibuat 2026-08-02, dan pada jalan pertamanya menemukan **tiga di
antaranya sudah terlanjur digarap**. Ketiganya diverifikasi ke kode, bukan
diasumsikan: masing-masing punya endpoint hidup dan status 🟡 di taksonomi.

Menuntut rancangan retroaktif untuk yang sudah jalan = biaya tanpa manfaat.
Yang berguna: menulis **apa yang belum diputuskan**, supaya kelompok rancangan
nanti tahu harus menutup apa.

---

## Yang dikecualikan, dan apa yang masih terbuka

- **Analisa markup, margin, contingency**

  Sudah ada: markup & margin di `/estimate-versions` (perhitungan penawaran).
  **Belum diputuskan:** manajemen *contingency* — apakah cadangan biaya jadi
  akun GL tersendiri, dimensi di baris jurnal, atau kolom di RAP. Ketiganya
  menghasilkan laporan yang berbeda, dan menggantinya setelah ada angka
  berarti membaca ulang seluruh jurnal.

- **Actual Cost Ledger (ACL)**

  Sudah ada: `cost_code_category_map` (migrasi 112) dan agregasi biaya aktual
  di `/cost-analytics`. **Belum diputuskan:** apakah ACL jadi tabel tersendiri
  atau *view* di atas `journal_entry_lines` yang baru dibangun GL-1. Kalau
  tabel tersendiri, ada dua sumber kebenaran untuk angka yang sama — persis
  kelas cacat yang berulang di repo ini.

- **Profitabilitas per proyek / per cost code**

  Sudah ada: `/finance/profitability` per proyek. **Belum diputuskan:**
  pemecahan per *cost code*, yang bergantung pada keputusan ACL di atas —
  keduanya membaca sumber yang sama.

---

## Aturan menambah baris di sini

1. Sub-menu itu **sudah terlanjur digarap** sebelum disiplin ini berlaku.
   Untuk yang belum digarap, rancangannya ditulis dulu — itu inti keputusannya.
2. Tulis **apa yang belum diputuskan**, bukan sekadar "sudah jalan".
3. Begitu kelompok rancangan biaya dibuat, baris di sini **dihapus** dan
   pertanyaan terbukanya dijawab di sana.
