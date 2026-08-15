# ROADMAP WORKFLOW — checklist, dan di mana tiap bagian dipasang

> **Kenapa berkas ini ada.** Founder, 2026-08-15: *"saya mau ada checklist
> roadmap dalam membangun semua workflow yg ada, dan dipasang dimananya,
> apakah disistem atau di n8n"*.
>
> Sebelum ini, "workflow mana yang sudah dan belum" hanya bisa dijawab dengan
> membaca ulang kode — dan jawaban itu **meleset dua kali** dalam dua sesi.
> Katalog `06-agentic-ai-*.md` tak membantu: kolom terakhirnya `N/N/L/O`
> adalah **prioritas**, bukan status, dan tujuh automation yang sudah hidup
> semuanya masih tertulis `Next` di sana.
>
> Berkas ini melengkapi — bukan menggantikan — `scripts/lapor-otomasi-hidup.mjs`.
> Skrip itu MENGUKUR apa yang hidup hari ini; berkas ini mencatat KEPUTUSAN
> dan urutan kerjanya.
>
> **Aturan mengikat:** kolom "Status" di bawah TIDAK boleh dipercaya begitu
> saja. Sebelum menyatakan sesuatu selesai, ukur:
>
> ```bash
> cd apps/api && node -r dotenv/config scripts/lapor-otomasi-hidup.mjs
> ```

---

## 1. Di mana tiap bagian dipasang

Diukur dari 14 alur yang sudah ada (2026-08-15), bukan dirancang di atas
kertas. Pembagiannya konsisten dan punya alasan:

| Lapis | Isinya | Kenapa di sana |
|---|---|---|
| **Sistem** (`apps/api`) | Aturan, ambang, query, dedup, pembuatan notifikasi | Ia menyentuh data ber-RLS. Memindahkannya ke n8n berarti memberi n8n kredensial basis dan menduplikasi seluruh lapisan tenancy |
| **n8n** | Pemicu terjadwal, panggilan HTTP ke sistem, format pesan, pengiriman WhatsApp | Ia bicara ke dunia luar. Menaruhnya di sistem berarti menulis ulang penjadwal dan integrasi WA yang sudah jadi |

Resep n8n hanya memakai empat jenis node — diukur dari
`scripts/n8n/bangun-alur.mjs`:

```
scheduleTrigger  →  httpRequest  →  code  →  httpRequest
webhook          →  code         →  httpRequest
```

**Tak ada logika bisnis di n8n.** Node `code` hanya memformat pesan. Ambang,
saringan, dan keputusan "siapa yang perlu tahu" seluruhnya di sistem.

### Konsekuensi praktis

* Otomasi **berpemicu jadwal** butuh DUA bagian: rute di sistem + workflow
  jadwal di n8n. Tanpa yang kedua, rutenya benar tetapi tak pernah dipanggil.
* Otomasi **berpemicu peristiwa** butuh jembatan `terbit-peristiwa.ts`
  (sistem) + workflow webhook di n8n.
* Yang **belum di-deploy** (`SCHEDULER_URL` kosong) berarti bagian n8n-nya
  menunggu — bukan berarti bagian sistemnya belum ada.

---

## 2. Checklist per otomasi

Kolom **Sistem** dan **n8n** diisi terpisah karena keduanya memang bisa
berbeda: rute yang sudah jadi tetapi workflow-nya belum dipasang adalah
keadaan yang wajar dan sering terjadi.

### Sudah hidup — prioritas `Next` di katalog (8 dari 8)

| # | Automation | Sistem | n8n | Catatan |
|---|---|---|---|---|
| 2.10 | Kasbon Outstanding Aging | ✅ `kasbon-outstanding` | ⬜ jadwal | dedup harian sempat mati karena pemisah `NUL` |
| 3.5 | Auto Purchase Request | ✅ `stok-menipis` | ✅ webhook | **memperingatkan, bukan membuat MR** — lihat §3 |
| 3.10 | Dependency Threshold Breach | ✅ `dependency-breach` | ⬜ jadwal | aturan dipakai bersama layar Gantt |
| 3.11 | Auto Progress Reminder | ✅ `progres-belum-lapor` | ⬜ jadwal | |
| 4.6 | PO Approval Fast-Track | ✅ rantai approval | — | lahir dari `max_amount`, bukan fitur terpisah |
| 4.10 | Auto GR Matching | ✅ `gr-matching` | ⬜ jadwal | |
| 5.1 | Invoice Generator | ✅ `invoice-termin` | ⬜ jadwal | |
| 6.6 | Kasbon Tukang Auto-Reminder | ✅ `kasbon-tukang` | ⬜ jadwal | |

### Sedang dikerjakan — Phase 3-5, prasyarat sudah ada di kode

Dipilih founder 2026-08-15: *"keenamnya"*. Diukur lebih dulu — seluruh
prasyaratnya sudah ada di kode, dan tak satu pun membutuhkan AI.

| # | Automation | Sistem | n8n | Aturan notifikasi | Catatan |
|---|---|---|---|---|---|
| 2.6 | Invoice Overdue Escalation | ✅ `invoice-terlambat` | ⬜ jadwal | ✅ `invoice_overdue` | membaca `amount_due`, bukan `status` |
| 2.11 | Cash Position Alert | ✅ `saldo-menipis` | ⬜ jadwal | ✅ migrasi 395 | ambang dari `company_settings` |
| 3.7 | Milestone Risk Flagging | ✅ `milestone-berisiko` | ⬜ jadwal | ✅ `milestone_approaching` | `completed_at`, bukan `status` |
| 2.2 | Vendor Payment Reminder | ✅ `hutang-supplier` | ⬜ jadwal | ✅ migrasi 395 | ditegur SEBELUM jatuh tempo |
| 4.9 | Material Price Trend | ✅ `harga-material-naik` | ⬜ jadwal | ✅ migrasi 395 | kenaikan yang SUDAH terjadi, bukan prediksi |
| 3.18 | Earned Value Trend Alert | ⛔ **ditunda** | — | — | lihat §3 |

### Belum — butuh modul yang belum dibangun

Empat modul ini **nol halaman, nol rute** (diukur 2026-08-15). Otomasi tak
bisa mengingatkan sesuatu yang tak punya tempat penyimpanan.

| Modul | Otomasi yang menunggunya |
|---|---|
| Transmittal | 5.11 Transmittal Auto-Log |
| Compliance | 9.1 Regulatory Compliance Checklist |
| Quality Checklist | 3.14 Quality Checklist Auto-Reminder |
| Insurance & Surety | 5.7 Expired Document Alert · 9.2 Insurance Coverage Gap |

> ⚠ Katalog menandai `3.16 RFI Auto-Routing` sebagai butuh "modul baru".
> **Itu sudah basi** — RFI sudah punya halaman dan rute (diukur). Label di
> katalog belum diperbaiki.

### Belum — butuh kemampuan yang belum ada

| # | Automation | Yang kurang |
|---|---|---|
| 1.3 | Voice Note Accounting | STT Bahasa Indonesia |
| 1.10 | Photo-to-Record | OCR |

Sisanya (64 `Later` + 65 `Optional`) bergerbang Phase 6+; 49 di antaranya
bertipe Predictive/Agentic yang memang menuntut model AI untuk memperkirakan,
bukan sekadar aturan `if-then`.

---

## 3. Keputusan yang sudah diambil — jangan diulang perdebatannya

### 3.5 memperingatkan, TIDAK membuat MR otomatis

Katalog menulis *"Draft MR otomatis"*. Ditolak, dengan tiga alasan terukur
(lengkapnya di `otomasi-terjadwal.ts` dekat rute `stok-menipis`):

1. MR menentukan BERAPA BANYAK dibeli; ambang hanya bilang "kurang".
2. Sumber "berapa banyak" (3.4) bergerbang Phase 6.
3. MR draft yang lahir sendiri menumpuk, dan yang menumpuk tak dibaca.

Yang dikirim: peringatan yang MEMBAWA angkanya, supaya manusia menekan "Buat
MR" dengan angka yang sudah terhitung.

### 3.18 ditunda — EVM tak disimpan

Diukur: tak ada tabel ber-`spi`/`cpi`. EVM dihitung di dalam handler
`kurva-s.ts`, dan merakit ulang BAC/AC/EV/PV di otomasi butuh ~25 baris
salinan.

Dua sumber untuk satu angka adalah cara paling sunyi membuat laporan dan
notifikasi berselisih. Yang benar: ekstrak perhitungannya jadi fungsi yang
bisa dipanggil keduanya — pekerjaan tersendiri, bukan sisipan di otomasi.

### 4.9 bukan prediksi

Katalog menandainya `Predictive`. Yang dibangun bagian rule-based-nya:
kenaikan yang **sudah terjadi** dan melampaui ambang, diukur dari riwayat
`price_book_entries`. Menyebutnya prediksi akan mengklaim lebih dari yang ia
lakukan.

---

## 4. Cara kerja yang dipakai membangunnya

Ditetapkan sesudah kehilangan satu rute yang sudah selesai (2026-08-15).

**Commit tiap satu otomasi selesai.** Bukan menumpuk semuanya di working tree.

Penyebab kehilangannya: `git stash` untuk membandingkan ratchet ke HEAD, dan
satu `stash pop` yang tak berjalan. Yang benar untuk membandingkan:

```bash
git show HEAD:apps/api/src/routes/v1/berkas.ts   # tanpa menyentuh working tree
```

**Penjaga dijalankan SEBELUM commit, bukan sesudah.** Dua ratchet Gerbang
Keras sempat merah karena commit saya sendiri:

| Penjaga | Naik | Sebab |
|---|---|---|
| `audit-kegagalan-senyap` | 186 → 187 | query tanpa cek `error` |
| `audit-tulis-tanpa-periksa` | 76 → 77 | update tanpa `.select()` |

Keduanya cacat nyata, bukan formalitas — yang pertama membuat gangguan basis
terbaca sebagai "belum ada data", yang kedua membuat "tersimpan" muncul untuk
perubahan yang tak pernah terjadi.

**Tiap rute baru wajib masuk daftar `TUGAS`** di
`otomasi-terjadwal.test.ts`. Penjaga di berkas itu mencocokkan daftarnya
dengan kode sumber, jadi rute yang lupa diuji memerahkan CI — ia sudah
menangkap 2.6 begitu rutenya lahir.
