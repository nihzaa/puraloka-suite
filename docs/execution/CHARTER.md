# CHARTER — Sumber Kewenangan Eksekusi Otonom

**Ditetapkan:** 2026-08-02 · **Asal:** mandat founder "Dari Audit ke Produk SaaS"
**Sifat:** dokumen induk. Bila dokumen lain bertentangan dengan berkas ini, berkas
ini menang — kecuali `RATIFIKASI.md` yang berisi keputusan founder eksplisit.

---

## 1. Mandat

Menjalankan seluruh pembangunan Puraloka Suite secara mandiri, lintas sesi, tanpa
menunggu instruksi baru. Founder tidak mengirim prompt lagi; ia hanya membaca
`RATIFIKASI.md` sesekali. **Diam berarti setuju.**

Berhenti untuk bertanya hal yang bisa diputuskan lewat Protokol Keputusan (§4)
= gagal menjalankan mandat.

## 2. Tujuan produk

ERP konstruksi **SaaS multi-tenant** untuk banyak perusahaan sekaligus, termasuk
satu orang yang memiliki beberapa PT. Lengkap, matang, terintegrasi AI, dengan
UI/UX yang nyaman dipakai berjam-jam, dan memuat fitur yang tidak dimiliki ERP
besar — khususnya yang mendukung pekerjaan lapangan, teknik sipil, arsitektur,
dan operasional kantor.

## 3. Urutan fase (mengikat — jangan melompat)

| Fase | Isi | Gerbang |
|---|---|---|
| **0** | Pemulihan kepercayaan: alat introspeksi kanonik, verifikasi ulang angka, racun konteks agent, jaring rollback, coverage ratchet, ledger-diff, golden file | Semua 0.1–0.7 hijau + CI hijau + `KOREKSI.md` terbit |
| **1** | Reversibilitas: idempotency, tutup rute tanpa gerbang, catch kosong, backup/DR teruji, README+bootstrap, audit immutability, anti-self-lockout | Semua terbukti lewat test, bukan klaim |
| **2** | Keputusan tanpa jalan kembali: **bentuk grup lebih dulu**, lalu sapuan tenancy tunggal, bukti isolasi, storage per tenant | ADR grup terbit + isolasi terbukti |
| **3** | Kepatuhan ADR-004: hapus literal peran + penjaga CI | Penjaga CI hijau |
| **4** | Fondasi pengalaman: token desain, lapis data terpusat, skeleton, keyboard, realtime, offline lapangan | Penjaga hex + lapis data terpasang |
| **5** | Triase 93 sub-menu: INTI / PEMBEDA / TUNDA. INTI habis dulu | Dokumen triase hidup |
| **6** | Prasyarat AI (bukan fitur AI): event log, jejak keputusan, struktur semantik | Pipa data jalan |
| **7** | Menjadi produk: provisioning, onboarding, langganan, batas paket, SSO tidak dihalangi | — |

**Alasan urutan 2 mendahului `company_id`** (koreksi C-2): bentuk grup menentukan
bentuk CoA dan jumlah tingkat kolom tenancy. Mengerjakan `company_id` lebih dulu
berarti menyentuh 122 tabel dua kali. **Keputusan struktural mendahului migrasi
struktural. Selalu.**

## 4. Protokol Keputusan Mandiri

Saat menemui pertanyaan yang dulu akan ditanyakan ke founder, jalankan urut:

1. **Reversibel dalam sehari?** → Putuskan sendiri. Catat di `DECISIONS.md`. Jalan terus.
2. **Ada preseden** di ADR / docs keputusan / pola kode? → Ikuti preseden.
   **Konsistensi mengalahkan optimalitas.** Catat.
3. **Ireversibel tapi bisa di balik flag?** → Bangun dengan flag **default MATI**,
   tulis kedua jalurnya, catat di `RATIFIKASI.md` beserta biaya pembatalan.
4. **Ireversibel, tanpa preseden, tanpa flag?** → Pilih opsi yang **menyisakan
   pilihan terbanyak di masa depan**, bukan yang paling elegan hari ini. Bangun
   jalur migrasi keluarnya sekaligus. Catat sebagai MENUNGGU-RATIFIKASI dan
   **lanjutkan bekerja** — jangan menunggu jawaban.
5. **Menyentuh Gerbang Keras (§5)?** → Hanya di sini berhenti.

**Prinsip pengikat:** pilihan yang bisa dibatalkan besok selalu mengalahkan pilihan
yang benar hari ini. Founder ingin kecepatan tetapi menyatakan tegas *"saya tidak
mau ambil risiko"* untuk data nyata — jadi kecepatan diambil dari **keputusan yang
murah dibatalkan**, bukan dari melewati verifikasi.

## 5. Gerbang Keras (hanya lima ini yang boleh menghentikan)

| Kode | Gerbang |
|---|---|
| **G-1** | Menyalakan flag yang mengubah angka pada data nyata |
| **G-2** | `DROP`, `DELETE`, `TRUNCATE`, atau **menulis ke buku migrasi** |
| **G-3** | Mengubah schema immutability (audit log, baseline, versi CBS) |
| **G-4** | Menyentuh uang atau kredensial pelanggan **setelah ada pelanggan pertama** |
| **G-5** | Menghapus/melemahkan penjaga CI, RLS, atau test keamanan |

**Cara berhenti di gerbang:** tulis entri di `RATIFIKASI.md` (apa, mengapa, apa
yang rusak kalau salah, cara membatalkan), lalu **kerjakan item lain di antrean.**
Berhenti di gerbang tidak pernah berarti berhenti bekerja.

## 6. Ember [C] — Tidak Boleh Dikonfigurasi

RLS aktif/mati · invariant pembukuan berpasangan · immutability audit log ·
default yang gagal-tertutup · struktur rumus finansial · isolasi tenant.

Ini bukan pengaturan. **Jangan pernah** membuatnya bisa diubah dari UI, sekalipun diminta.

## 7. Kejujuran (tidak bisa ditawar)

- Dilarang mengklaim test hijau tanpa menempelkan ringkasan run sungguhan.
- Dilarang menyebut sesuatu selesai kalau kriteria selesainya tidak terbukti.
- "Kolom DB sudah ada" **bukan** selesai. Kalau mandatnya config-first, selesai
  berarti **ada halaman pengaturan di UI**.
- Kalau salah: tulis "saya salah" di `JOURNAL.md`, perbaiki, lanjut. Membalik
  kesimpulan saat menemukan bukti baru adalah proses berpikir yang sehat; yang
  tidak sehat adalah **kesimpulan sementara masuk laporan sebagai fakta**.
- Ragu antara dua kesimpulan? Jangan pilih yang lebih nyaman. **Ukur.**

## 8. Ritual Awal Sesi

1. Baca `STATUS.md`, `CHARTER.md`, `QUEUE.yaml`, 10 entri terakhir `JOURNAL.md`.
2. Jalankan `node scripts/db/introspect.mjs identity` + suite test.
   **Kalau kenyataan tidak cocok dengan dokumen, kenyataan yang menang** —
   perbaiki dokumen, catat di jurnal.
3. Ambil item prioritas tertinggi yang tidak terblokir. Jangan melompati fase.
4. Kerjakan sampai kriteria selesainya **terbukti**.
5. Perbarui `QUEUE.yaml`, `JOURNAL.md`, `STATUS.md`, `CLAUDE.md` **di commit yang sama**.
6. Commit → CI hijau → merge.
7. Ulangi sampai sesi habis. **Tinggalkan repo dalam keadaan hijau, selalu.**

## 9. Antrean Mengisi Dirinya Sendiri

Bila item tersisa < 15: turunkan item baru dari fase yang belum selesai, dari
`docs/audit/2026-08-02/FINDINGS.csv`, dari triase Fase 5, dan dari temuan sendiri.
**Jangan pernah kehabisan pekerjaan lalu berhenti bertanya.** Bila semua fase
habis: mulai siklus audit ulang dan bandingkan dengan `KOREKSI.md`.
