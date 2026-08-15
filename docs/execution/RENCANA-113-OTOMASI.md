# RENCANA 113 OTOMASI SISA — dan kenapa "belum bisa" itu keliru

> **Dibuat 2026-08-16** atas pertanyaan founder:
> *"semua workflow yg 113 itu emang gabisa banget dibangun sekarang? masa harus
> nunggu jalan dulu pake data nyata, terus project ini mau pake nilai plus apa
> biar laku"*
>
> Pertanyaan itu **benar**, dan jawaban saya sebelumnya keliru. Dokumen ini
> koreksinya.

---

## 1. Koreksi: 76 dari 113 bisa dibangun HARI INI

Sebelumnya saya mengelompokkan sisa 113 dengan kasar dan menyimpulkan
kebanyakan "belum bisa". Dikelompokkan ulang berdasar apa yang BENAR-BENAR
menahannya:

| Gelombang | Jumlah | Yang menahan |
|---|---|---|
| **1 — bisa SEKARANG** | **76** | tidak ada. Tabelnya ada, datanya ada |
| **2 — butuh riwayat** | 23 | butuh pola beberapa bulan — **bisa di-seed dummy** |
| **3 — butuh modul baru** | 6 | bank, CRM, tender: modulnya memang belum dibangun |
| **4 — butuh OCR/STT** | 8 | baca foto & suara — kelas pekerjaan berbeda |

**99 dari 113 bisa dikerjakan tanpa menunggu apa pun.** Hanya 14 yang benar-
benar menunggu sesuatu di luar.

### 1-0. Kemajuan Gelombang 1 — UKUR, jangan percaya angka di sini

```bash
cd apps/api && node -r dotenv/config scripts/lapor-otomasi-hidup.mjs
```

Baris yang dicari: `Tugas terjadwal` dan `otomasi terjelaskan di katalog kode`.

Diukur 2026-08-16: **33 rute terjadwal · 42 nomor katalog terjelaskan.**
Terakhir ditambahkan: 10.7 perawatan & sertifikasi alat, 10.8 penyusutan belum
ditutup, 3.9 mandor bentrok dua proyek, dan `kontrak-payung-habis` (sengaja
TANPA nomor — 7.10 adalah kontrak klien, bukan pemasok).

Angka di tabel gelombang di atas adalah RENCANA per 2026-08-15 dan tidak
diperbarui tiap otomasi selesai. Yang mutakhir hanya keluaran skrip.

### 1-0b. Yang DIPINDAHKAN keluar dari Gelombang 1 sesudah diukur

Bukan karena sulit — karena **datanya menyatakan otomasinya tak punya apa pun
untuk dikatakan.** Membangunnya tetap menghasilkan rute yang memicu nol
selamanya, lalu dilaporkan sebagai "sudah ada". Itu bentuk kebohongan yang
paling sulit ditemukan.

| Nomor | Yang diukur | Ke mana |
|---|---|---|
| **4.4** Supplier Lead Time | 8 penerimaan, seluruhnya datang pada/sebelum tanggal janji (rata −0,6 hari, maks 0) | jadi **tool baca**, bukan rute terjadwal |
| **4.8** Stock Opname Discrepancy | `opname_bersama` **0 baris** | Gelombang 2 (butuh data) |
| **2.7** Duplicate Transaction | `project_expenses` **0 baris** | Gelombang 2 |
| **2.14** Recurring Expense | `project_expenses` **0 baris** | Gelombang 2 |
| **9.9** Audit Readiness | `documents` **0 baris** | Gelombang 2 |
| **2.5** Margin Leakage | butuh biaya aktual; sumbernya `project_expenses` yang kosong | Gelombang 2 |

Keenamnya tetap di Gelombang 1 secara KEMAMPUAN — tabelnya ada, kodenya bisa
ditulis hari ini. Yang belum ada isinya.

### 1a. Kenapa saya sempat salah

Empat kali dalam satu sesi saya menyimpulkan "tak bisa dibangun", dan tiap
kali alasannya sama bentuknya: **saya membaca keadaan basis DEV sebagai
keadaan produk.**

| Yang saya bilang | Kenyataannya |
|---|---|
| 2.9 batal — `project_expenses` kosong | trigger `AFTER UPDATE`; seed disisipkan langsung `approved` |
| 6.3 batal — 100% pekerja tak absen | seed beku di satu tanggal |
| 3.6 batal — tak ada periode kedua | benar, tapi bentuk lain (`bolehDipakai`) bisa |
| 113 belum bisa | 76 bisa sekarang |

Founder menahan keempatnya. Pelajarannya sudah tertulis di
`ROADMAP-WORKFLOW.md` §13, dan berlaku juga di sini: **"datanya belum ada"
bukan alasan; yang harus ditanya KENAPA belum ada, dan apakah itu keadaan
produk atau keadaan seed.**

### 1b. Dan untuk produk yang DIJUAL, kelengkapan itu nilai jualnya

Ini ERP yang akan dijual ke banyak perusahaan. Pembeli tak melihat basis dev.
Yang ia lihat: berapa banyak pekerjaan yang berjalan sendiri.

Otomasi yang "menunggu data nyata" adalah otomasi yang tak pernah dibangun —
karena data nyata baru ada setelah produknya dipakai, dan produknya dipakai
karena otomasinya ada. Lingkaran itu diputus dengan **seed dummy yang
sungguh-sungguh**, bukan dengan menunggu.

---

## 2. Cara kerja yang dipakai — supaya 76 tak jadi 76 cacat

Sesi ini menghasilkan sembilan otomasi, dan **tiap satu** menemukan cacat yang
tak terlihat dari membaca kode. Membangun 76 dengan cara yang sama tanpa
disiplin akan menghasilkan 76 sumber kebisingan.

Aturannya, dari yang sudah terbukti:

1. **Ukur dulu, jangan menebak.** Delapan kali sesi ini nama kolom/izin
   ditebak dan salah; dua di antaranya baru ketahuan saat dijalankan.
2. **Panggil pustaka yang ada, jangan salin rumusnya.** Dua sumber untuk satu
   angka selalu berselisih.
3. **Jalankan sungguhan lewat penjadwal**, bukan hanya test. Cacat rantai
   tenancy tiga lapis (6.3) hanya ketahuan begitu.
4. **Mutasi tiap penjaga baru.** Dua kali sesi ini mutasi menemukan test yang
   terlihat menyeluruh tetapi lulus karena kebetulan.
5. **Satu otomasi = satu commit**, dengan path eksplisit + `--only`.

---

## 3. Yang perlu diputuskan founder

| Hal | Kenapa perlu keputusan |
|---|---|
| **Seed dummy 6 bulan** | Gelombang 2 (23 otomasi) menuntutnya. Ini menambah ribuan baris ke basis dev — sekali jalan, bisa dihapus |
| **Modul bank / CRM / tender** | Gelombang 3 (6 otomasi) menunggunya. Masing-masing proyek tersendiri |
| **OCR / STT bahasa Indonesia** | Gelombang 4 (8 otomasi). Butuh model & biaya terpisah dari asisten teks |

---

## 4. Daftar lengkap 113

### GELOMBANG 1 — bisa dibangun SEKARANG — 76 otomasi

| # | Otomasi | Gunanya | Tipe |
|---|---|---|---|
| 1.7 | Quick Balance Check | "Berapa saldo kas sekarang?" — jawaban instan | Reactive |
| 1.8 | Kasbon Status Check | "Kasbon Budi sudah berapa?" — query cepat | Reactive |
| 1.9 | Project Status Check | "Progress proyek Villa X berapa persen?" | Reactive |
| 1.11 | Reminder Setting via Chat | "Ingatkan saya bayar pajak tanggal 10" | Reactive |
| 1.12 | Multi-turn Clarification | AI bertanya balik jika instruksi ambigu ("proyek mana maksudnya?") | Agentic |
| 1.13 | Handoff to Human | AI mendeteksi kasus di luar cakupannya, eksplisit arahkan ke admin | Reactive |
| 1.14 | Weekly Digest (bukan harian) | Ringkasan mingguan untuk pemilik yang jarang cek harian | Predictive |
| 1.15 | Cross-Company Query (L2+) | "Bagaimana performa semua company saya?" — hanya relevan grup usaha | Agentic |
| 2.3 | Retention Tracking | Lacak retensi kontrak yang belum dicairkan/jatuh tempo | Reactive |
| 2.5 | Margin Leakage Detection | Deteksi proyek yang margin-nya tergerus dari rencana | Predictive |
| 2.8 | Tax Calculation Assistant | Bantu hitung PPh final/PPN per invoice otomatis | Reactive |
| 2.15 | Multi-Project Cash Allocation Advisor | Saran alokasi kas terbatas ke proyek prioritas | Agentic |
| 2.16 | Petty Cash Auto-Categorization | Kategorikan otomatis pengeluaran kas kecil dari deskripsi teks | Reactive |
| 2.17 | Financial Report Auto-Generation | Generate laporan keuangan periodik otomatis (bukan manual export) | Reactive |
| 2.18 | Loan/Credit Facility Advisor | Analisis kapan perlu fasilitas kredit berdasar proyeksi cashflow | Predictive |
| 3.1 | Daily Progress Collection (via WhatsApp) | Mandor lapor progress lewat chat, bukan buka app | Agentic |
| 3.3 | Delay Prediction | Prediksi kemungkinan proyek terlambat dari pola progress vs rencana | Predictive |
| 3.8 | Weather Impact Advisory | Peringatan cuaca yang berpotensi mengganggu jadwal lapangan | Predictive |
| 3.9 | Resource Conflict Detection | Deteksi mandor/alat dobel-alokasi lintas proyek | Reactive |
| 3.13 | Change Order Impact Simulation | Simulasi dampak CO terhadap jadwal & budget sebelum approve | Agentic |
| 3.14 | Quality Checklist Auto-Reminder | Ingatkan QC checklist yang belum diisi di titik milestone tertentu | Reactive |
| 3.15 | Site Safety Incident Triage | Klasifikasi awal & eskalasi laporan insiden HSE dari WhatsApp | Reactive |
| 3.16 | RFI Auto-Routing | Route RFI ke penanggung jawab yang tepat otomatis | Reactive |
| 3.17 | Punch List Auto-Compilation | Kompilasi otomatis punch list dari foto/catatan lapangan | Agentic |
| 3.19 | Site Photo Auto-Categorization | Kategorikan foto lapangan otomatis (progress/defect/serah-terima) | Reactive |
| 3.20 | Cross-Project Resource Optimization | Rekomendasi realokasi mandor/alat lintas proyek untuk efisiensi | Agentic |
| 4.7 | Supplier Payment Term Optimizer | Saran negosiasi termin bayar berdasar cashflow proyek | Agentic |
| 4.12 | WA-based PO Confirmation | Supplier konfirmasi PO langsung lewat WhatsApp (bukan cuma WA deep-link  | Reactive |
| 4.13 | Contract Compliance Check (Supplier) | Cek kepatuhan PO terhadap kontrak/kesepakatan harga supplier | Agentic |
| 4.14 | Bulk Purchase Timing Advisor | Saran waktu pembelian bulk untuk proyek yang direncanakan (dari Gantt) | Predictive |
| 5.2 | BAST Generator | Generate Berita Acara Serah Terima otomatis dari data progress/milestone | Autonomous |
| 5.3 | Contract Analyzer | Ekstraksi & ringkasan klausul kontrak otomatis | Agentic |
| 5.5 | Contract Generation Assistant | Bantu draft kontrak dari template + parameter proyek (perluasan fitur ex | Autonomous |
| 5.6 | Document Auto-Classification | Klasifikasi otomatis dokumen upload ke kategori yang benar | Reactive |
| 5.8 | Report Auto-Compilation | Kompilasi laporan periodik dari berbagai sumber data otomatis | Reactive |
| 5.9 | Document Version Comparison | Bandingkan versi dokumen/gambar kerja otomatis, highlight perubahan | Reactive |
| 5.12 | Document Access Audit Summary | Ringkasan siapa mengakses dokumen sensitif kapan (bahasa natural) | Reactive |
| 5.14 | Legal Clause Risk Flagging | Flag klausul kontrak berisiko tinggi (penalti, liability tidak seimbang) | Agentic |
| 5.15 | Multi-language Document Translation | Terjemahan dokumen untuk klien/mitra asing (jika ekspansi regional) | Reactive |
| 6.1 | Approval via WhatsApp (general) | Approve kasbon/CO/PO langsung dari WhatsApp (perluasan [Approval Flows]( | Reactive |
| 6.2 | Leave Approval | Approve cuti mandor/staff via WhatsApp | Reactive |
| 6.5 | Worker Skill Matching | Rekomendasi tukang yang cocok untuk jenis pekerjaan tertentu | Agentic |
| 6.7 | Mandor Active Worker Tracking | Ringkasan "tukang aktif" per mandor otomatis via chat | Reactive |
| 6.8 | Onboarding Checklist Assistant | Bantu proses onboarding user baru (checklist, dokumen) | Reactive |
| 6.10 | Payroll Export Assistant | Siapkan data ekspor untuk software payroll pihak ketiga (bukan payroll s | Reactive |
| 6.11 | Team Capacity Query | "Berapa mandor available minggu depan?" via chat | Reactive |
| 6.12 | Performance Summary Generator | Ringkasan performa mandor per periode (bahasa natural, dari data existin | Reactive |
| 7.5 | Client Communication Summary | Ringkasan komunikasi dengan calon klien (dari WhatsApp/email) | Reactive |
| 7.7 | Bid Comparison Assistant | Bandingkan bid kompetitor (jika data publik tersedia) vs estimasi sendir | Agentic |
| 7.8 | Client Portal Engagement Insight | Insight seberapa aktif klien memakai portal (indikasi kepuasan/masalah) | Predictive |
| 7.10 | Contract Renewal Reminder | Ingatkan peluang repeat business dari klien existing menjelang akhir pro | Reactive |
| 7.11 | Client Satisfaction Pulse | Survei kepuasan singkat otomatis via WhatsApp pasca-milestone | Reactive |
| 7.12 | Competitive Pricing Intelligence | Analisis posisi harga kita vs rata-rata pasar (jika data tersedia) | Predictive |
| 8.1 | Cashflow Simulation | "Apa yang terjadi jika saya bayar supplier X minggu ini?" — simulasi dam | Agentic |
| 8.2 | What-If Analysis | Simulasi skenario bisnis ("bagaimana jika ambil proyek baru senilai X?") | Agentic |
| 8.3 | Payment Recommendation | Rekomendasi prioritas pembayaran saat kas terbatas | Agentic |
| 8.4 | Profitability Simulation | Simulasi profitabilitas proyek dengan parameter berbeda (skenario RAB) | Agentic |
| 8.6 | Business Risk Radar | Dashboard/ringkasan risiko lintas-domain real-time (sintesis AI Risk Off | Predictive |
| 8.7 | Strategic Q&A (deep reasoning) | Pertanyaan strategis kompleks multi-langkah ("proyek mana yang harus dip | Agentic |
| 8.9 | Board/Investor Report Generator | Generate ringkasan performa untuk pihak eksternal (investor, bank) | Agentic |
| 8.11 | Morning Briefing + Evening Wrap (gabungan 1.5+1.6, level eksekutif) | Briefing terintegrasi lintas-domain (bukan hanya dashboard KPI, tapi nar | Predictive |
| 8.12 | Anomaly Digest (weekly) | Ringkasan mingguan seluruh anomali terdeteksi lintas-agent (Finance Cont | Predictive |
| 8.13 | Decision Journal (audit-friendly) | Catat setiap keputusan besar + rasional otomatis (untuk pembelajaran/aud | Reactive |
| 8.14 | Goal Tracking Assistant | Lacak target bisnis tahunan (revenue, jumlah proyek) vs realisasi | Reactive |
| 8.15 | Executive Voice Briefing | Briefing harian dalam bentuk voice note (bukan teks) untuk pemilik yang  | Predictive |
| 9.3 | Contract Liability Exposure Summary | Ringkasan total eksposur liability dari seluruh kontrak aktif | Predictive |
| 9.4 | Risk Register Auto-Population | Isi risk register otomatis dari sinyal terdeteksi lintas-agent | Reactive |
| 9.6 | Regulatory Change Alert | Alert perubahan regulasi konstruksi/pajak yang relevan (dari sumber ekst | Reactive |
| 9.7 | Data Privacy Compliance Check | Verifikasi penanganan data klien sesuai kebijakan privasi (relevan makin | Reactive |
| 9.9 | Audit Readiness Checker | Cek kesiapan dokumentasi sebelum audit eksternal (pajak, sertifikasi) | Reactive |
| 9.10 | Conflict of Interest Flagging | Deteksi potensi konflik kepentingan (supplier terkait keluarga mandor, d | Reactive |
| 10.1 | Equipment Utilization Tracking | Lacak utilisasi alat berat lintas proyek (idle vs aktif) | Reactive |
| 10.4 | Fleet Fuel Consumption Anomaly | Deteksi konsumsi BBM tidak wajar (indikasi kebocoran/penyalahgunaan) | Predictive |
| 10.5 | Equipment Cross-Project Allocation | Rekomendasi realokasi alat idle ke proyek yang butuh | Agentic |
| 10.7 | Equipment Certification Expiry Alert | Alert sertifikasi/inspeksi alat berat yang akan expired | Reactive |
| 10.8 | Asset Depreciation Tracker | Lacak nilai buku aset otomatis (terkait GL/COA jika ada) | Reactive |

### GELOMBANG 2 — butuh data riwayat (di-seed dummy) — 23 otomasi

| # | Otomasi | Gunanya | Tipe |
|---|---|---|---|
| 2.4 | Cashflow Prediction | Proyeksi cashflow 30/60/90 hari dari pola historis | Predictive |
| 2.7 | Duplicate Transaction Detection | Deteksi kemungkinan pencatatan ganda | Reactive |
| 2.12 | Payment Method Optimization | Rekomendasi metode/waktu bayar optimal (cash flow timing) | Predictive |
| 2.13 | Financial Anomaly Alert (real-time) | Alert instan transaksi tidak wajar (nominal/waktu/pola) | Reactive |
| 2.14 | Recurring Expense Detection | Identifikasi pengeluaran berulang untuk automasi kategori | Predictive |
| 3.4 | Material Consumption Prediction | Prediksi kebutuhan material berdasar progress + RAB | Predictive |
| 3.12 | RAB Component Anomaly Detection | Deteksi komponen biaya RAB yang menyimpang dari pola historis proyek ser | Predictive |
| 4.2 | Purchase Recommendation Engine | Rekomendasi supplier/waktu beli optimal dari riwayat harga | Predictive |
| 4.3 | Fraud Detection (Procurement) | Deteksi pola PO/GR mencurigakan (harga tidak wajar, split PO menghindari | Predictive |
| 4.4 | Supplier Lead Time Prediction | Prediksi keterlambatan pengiriman supplier dari riwayat | Predictive |
| 4.5 | Auto Reorder Point Adjustment | Sesuaikan `min_stock` otomatis berdasar pola konsumsi aktual | Predictive |
| 4.8 | Stock Opname Discrepancy Analysis | Analisis pola selisih stok opname untuk deteksi kebocoran/kesalahan penc | Predictive |
| 4.11 | Vendor Consolidation Advisor | Saran konsolidasi pembelian ke supplier lebih sedikit untuk leverage har | Agentic |
| 6.4 | Wage Report Anomaly Check | Deteksi laporan upah mingguan yang menyimpang dari pola normal | Predictive |
| 7.3 | Win Probability Prediction | Prediksi kemungkinan menang tender/deal dari pola historis | Predictive |
| 7.4 | Proposal Draft Assistant | Bantu draft proposal awal dari template + parameter proyek | Agentic |
| 8.5 | Investment Analysis | Analisis kelayakan investasi (alat berat, ekspansi) dari data historis | Agentic |
| 8.8 | Competitive Benchmark (internal) | Bandingkan performa proyek/mandor/company secara internal (bukan vs komp | Predictive |
| 8.10 | Succession/Delegation Advisor | Saran delegasi keputusan ke PM/admin berdasar pola beban kerja pemilik | Predictive |
| 9.5 | Dispute/Claim Early Warning | Deteksi dini potensi sengketa dari pola komunikasi/dokumen (nada tegang, | Predictive |
| 10.2 | Predictive Maintenance Alert | Prediksi kebutuhan maintenance dari jam operasional/pola pemakaian | Predictive |
| 10.3 | Equipment Rental vs Buy Advisor | Analisis kapan lebih ekonomis sewa vs beli alat berat | Predictive |
| 10.6 | Maintenance Cost Trend Analysis | Analisis tren biaya maintenance per alat (kandidat retire/replace) | Predictive |

### GELOMBANG 3 — butuh modul baru lebih dulu — 6 otomasi

| # | Otomasi | Gunanya | Tipe |
|---|---|---|---|
| 1.2 | Incoming Transfer Detection | Deteksi otomatis transfer masuk dari notifikasi/SMS bank, cocokkan ke in | Reactive |
| 2.1 | Auto Bank Reconciliation | Cocokkan mutasi bank dengan transaksi tercatat otomatis | Reactive |
| 7.1 | Lead Qualification | Skoring otomatis lead masuk (potensi closing) | Predictive |
| 7.2 | Follow Up Automation | Ingatkan follow-up lead yang belum dihubungi | Reactive |
| 7.6 | Tender Deadline Tracker | Lacak deadline tender aktif, alert mendekati batas | Reactive |
| 7.9 | Referral Tracking | Lacak sumber lead (referral vs organik) untuk evaluasi channel | Reactive |

### GELOMBANG 4 — butuh mata & telinga (OCR/STT) — 8 otomasi

| # | Otomasi | Gunanya | Tipe |
|---|---|---|---|
| 1.3 | Voice Note Accounting | Voice note "bayar tukang 500rb hari ini" → draft transaksi terstruktur | Agentic |
| 1.10 | Photo-to-Record | Kirim foto nota → langsung jadi draft expense | Agentic |
| 3.2 | Progress From Photo | Estimasi % progress dari foto lapangan (Image Pipeline) | Agentic |
| 4.1 | Quotation Comparison AI | Bandingkan penawaran harga beberapa supplier otomatis (dari dokumen/foto | Agentic |
| 4.15 | Supplier Onboarding Assistant | Bantu validasi dokumen supplier baru (NPWP, dsb) via WhatsApp | Agentic |
| 5.4 | Meeting Minutes Generator | Generate notulen dari voice note/rekaman rapat | Agentic |
| 5.10 | Signature/Approval Extraction | Verifikasi kelengkapan tanda tangan/approval di dokumen scan | Reactive |
| 5.13 | Photo-to-Report Compilation | Kompilasi laporan progress bergambar otomatis dari foto lapangan | Agentic |


---

## 5. Pengingat

Dokumen ini **daftar kerja**, bukan catatan sejarah. Yang sudah dibangun
dipindahkan dari sini ke `katalog-otomasi.ts`, dan angkanya diukur ulang:

```bash
cd apps/api && node -r dotenv/config scripts/lapor-otomasi-hidup.mjs
```

Angka di §1 bertanggal **2026-08-16**. Kalau ia berselisih dengan skrip di
atas, **skripnya yang benar** — itu aturan yang berlaku untuk seluruh repo ini
(`CLAUDE.md` pembuka).
