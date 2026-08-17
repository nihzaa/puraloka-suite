# Galian 92 Otomasi Tersisa — diukur, bukan dibaca

> Diukur 2026-08-16. **Angka di dokumen ini akan basi** — cara mengukurnya
> ada di §5, dan itu yang harus dipercaya, bukan tabelnya.

---

## 0. Kenapa dokumen ini ada

Kolom **prasyarat** di `06-agentic-ai-and-automation-architecture.md` ditulis
saat perencanaan, dan sudah **salah tiga kali dalam satu sesi**:

| Nomor | Kolom prasyarat bilang | Kenyataannya |
|---|---|---|
| 2.5 Margin Leakage | "butuh biaya aktual" | cukup satu tabel diisi |
| 2.7 Duplicate Transaction | "transaction pattern matching" | idem |
| 2.14 Recurring Expense | "expense pattern" | idem |

Ketiganya selesai pada hari yang sama begitu `project_expenses` disemai.
Membaca kolom itu sebagai verdict adalah **membaca rencana lama sebagai
kenyataan sekarang** — persis racun konteks yang jadi alasan pembuka
`CLAUDE.md`.

Dokumen ini menggantinya dengan pengukuran ke basis: **tabel sumbernya ada dan
berisi, atau tidak.**

---

## 1. Satu jebakan pengukuran yang hampir menipu galian ini sendiri

Versi pertama skrip galian memakai `pg_stat_user_tables.n_live_tup` — cepat,
dan **salah**:

```
tax_records   perkiraan 0    nyatanya 18
payments      perkiraan 25   nyatanya 23
```

`n_live_tup` statistik perencana yang hanya diperbarui `ANALYZE`. Verdict
2.8 berubah dari "data kosong" jadi "bisa dibangun" begitu dihitung
sungguhan.

**Angka yang dipakai memutuskan wajib `COUNT(*)`.** Perkiraan boleh untuk
melihat-lihat, tak boleh untuk menyimpulkan.

---

## 2. Hasil: 51 dari 92 bisa dikerjakan sekarang

| Bentuk | Jumlah | Artinya |
|---|---|---|
| **RUTE** | **15** | notifikasi terjadwal — data ada DAN ada kondisi pemicu |
| **TOOL** | **36** | asisten menjawab saat ditanya — cukup datanya ada |
| DATA KOSONG | 1 | tabelnya ada, nol baris (`asset_rentals`) |
| BARU | 37 | butuh kemampuan yang memang belum ada |
| SELESAI | 3 | sudah hidup, katalognya belum tahu |

**Ini jauh lebih besar daripada perkiraan sebelumnya** ("43 percakapan, 35
terhalang"). Yang berubah bukan basisnya melainkan cara mengukurnya.

### 2a. Beda RUTE dan TOOL bukan soal sulit

- **RUTE** mengirim tanpa diminta. Ia butuh kondisi yang bisa berbunyi hari
  ini — kalau memicu nol selamanya, ia berbohong. Itu sebabnya 4.4 (lead time
  pemasok) dipindah jadi TOOL: seluruh 8 penerimaan datang tepat waktu, jadi
  rutenya takkan pernah berbunyi.
- **TOOL** menjawab saat ditanya. Tak ada yang dikirim tanpa diminta, jadi
  cukup datanya ada. Empat sudah dibangun (1.7, 1.8, 6.7, 6.11) dan polanya
  terbukti.

---

## 3. RUTE — 15 yang bisa jadi notifikasi terjadwal

| Nomor | Nama | Sumber terukur |
|---|---|---|
| 1.14 | Weekly Digest | `notifications` 9.009 |
| 2.12 | Payment Method Optimization | `payments` 23 — **semua `transfer_bank`, nol sinyal** |
| 2.13 | Financial Anomaly Alert | `audit_logs` 62.013 · `project_expenses` 88 |
| 2.16 | Petty Cash Auto-Categorization | `project_expenses` 88 · kategori 10 |
| 3.3 | Delay Prediction | `progress_logs` 271 · `rab_items` 377 |
| 3.4 | Material Consumption Prediction | `rab_items` 377 · `project_stocks` 12 |
| 4.3 | Fraud Detection (Procurement) | PO 8 · item 15 · GR 8 |
| 4.8 | Stock Opname Discrepancy | `opname_bersama` 4 — ⚠ itu volume kerja, **bukan stok** |
| 4.13 | Contract Compliance (Supplier) | PO 8 · kontrak payung 3 · item 6 |
| 6.8 | Onboarding Checklist | `users` 26 · `company_members` 26 |
| 7.11 | Client Satisfaction Pulse | `milestones` 39 · `clients` 10 |
| 8.11 | Morning Briefing + Evening Wrap | `notifications` 9.009 |
| 8.12 | Anomaly Digest (weekly) | `notifications` + `audit_logs` |
| 9.7 | Data Privacy Compliance Check | `audit_logs` 62.013 · `users` 26 |
| 10.2 | Predictive Maintenance | `pemakaian_alat` 30 · jadwal 5 · biaya 24 |

### Dua pencoretan saya, dan keduanya SALAH

Saya sempat menyarankan 2.12 dan 4.8 **tidak dibangun**. Founder menolak dan
menanyakan alasannya; diukur ulang, alasan saya cacat pada bentuk yang sama:
**berhenti di tabel pertama yang tak cocok, alih-alih bertanya "lalu di mana
datanya?"**

| Yang saya bilang | Kenyataannya |
|---|---|
| **2.12** "semua pembayaran bermetode sama" | yang diperiksa **satu kolom di satu tabel**. Judulnya menyebut "metode/**waktu** bayar" - waktunya tak diukur. 4 dari 23 lewat jatuh tempo, rata-rata 6 hari. `supplier_payments` (2 baris) dan `supplier_payment_allocations` tak pernah dilihat |
| **4.8** "`opname_bersama` itu volume kerja" | benar - tetapi opname stok ADA di `stock_movements.movement_type='adjustment'`, dan catatannya menyebut dirinya sendiri |

**4.8 SUDAH DIBANGUN** (`stok-melenceng`, migrasi 418). Terukur 8 dari 12
baris stok tak cocok dengan buku gerakannya - Besi 10mm tercatat 85, buku 315.

**2.12 belum**, dan alasannya BUKAN "tak bisa": `supplier_payments` cuma 2
baris, terlalu tipis untuk pemicu terjadwal. Sinyal waktu-bayar yang nyata ada
di sisi PENERIMAAN, dan itu sudah ditutup `invoice-terlambat` (2.2). Bentuk
yang jujur untuknya kemungkinan TOOL, bukan rute - perlu diputuskan, bukan
dicoret.

---

## 4. TOOL — 36 yang bisa jadi tool baca asisten

Dikelompokkan menurut yang menanyakannya:

**Pemilik / eksekutif (13)** — 1.15, 2.4, 2.15, 2.17, 2.18, 8.1, 8.2, 8.3,
8.4, 8.5, 8.7, 8.8, 8.9

**Operasional proyek (8)** — 1.9, 3.13, 3.20, 5.2, 5.5, 5.8, 7.4, 8.10

**Pengadaan (5)** — 4.2, 4.4, 4.7, 4.14, 9.3

**SDM & alat (7)** — 6.5, 6.10, 6.12, 8.13, 10.1, 10.5, 8.6

**Kemampuan asisten, bukan data (3)** — 1.12 klarifikasi multi-giliran,
1.13 serah ke manusia, 2.8 hitung pajak per invoice

### Yang sudah jadi tool — UKUR, jangan percaya daftar di atas

Daftar di atas adalah KANDIDAT, bukan status. Yang sudah terbangun diukur
dari katalognya sendiri, bukan dari dokumen ini:

```bash
cd apps/api && npx tsx -e "import {KATALOG_TOOL} from './src/lib/ai-tool.js'; \
  console.log(KATALOG_TOOL.length, KATALOG_TOOL.map(t=>t.nama).join(' '))"
```

Diukur 2026-08-16: **42 tool**. Dua terakhir yang masuk —

| Nomor | Tool | Izin | Catatan pengukuran |
|---|---|---|---|
| 6.12 | `performa_mandor` | `mandor:view` | hari orang = `sum(porsi_hari)`; 113 dari 1.279 baris absensi bernilai 0,5 — `count(*)` melebihkan 56,5 hari orang |
| 10.1 | `utilisasi_alat` | `assets:view` | `jam_mulai`/`jam_selesai` ternyata `numeric` HOUR METER kumulatif (1.172 → 1.180), **bukan** jam dinding |

Diukur ulang 2026-08-16 — dan **empat dari lima nomor yang "tertahan karena
datanya belum ada" ternyata tertahan karena alasan yang berbeda-beda:**

| Nomor | Verdict sebenarnya | Yang dikerjakan |
|---|---|---|
| 8.5 | data memang kurang: `asset_rentals` NOL baris | disemai (`seed-sewa-alat.mjs`), tool `investasi_alat` |
| 1.15 | data kurang **dan** butuh keputusan founder | founder memutuskan bangun sebagai kapabilitas SaaS; disemai (`seed-grup-usaha.mjs`), tool `portofolio_grup` |
| 8.2 | **bukan tool** — datanya sudah lengkap | `PENALARAN_BERLAPIS` (prompt), bukan tool ke-45 |
| 8.7 | **bukan tool** — idem | idem |
| 2.18 | benar-benar tertahan: tak ada tabel fasilitas kredit | belum dikerjakan |

**Pelajarannya sama dengan §0 dokumen ini.** "Tertahan karena data" adalah
verdict yang gampang ditulis dan jarang diperiksa ulang. Tiga dari lima
nomor di atas salah diberi label oleh saya sendiri satu sesi sebelumnya.

### 8.2 dan 8.7 bukan tool — dan itu penting

Keduanya terdaftar sebagai kandidat TOOL. Bukan. Datanya sudah punya tool
masing-masing (`simulasi_kas`, `banding_proyek`, `ikhtisar`, `arus_kas`,
`serapan_biaya`, `investasi_alat`). Yang kurang: **model tak pernah diberi
tahu bahwa ia boleh memanggil beberapa tool berurutan lalu menyintesis.**

Membuat tool `what_if` berarti menyalin logika keenamnya ke tempat baru, dan
salinan itu akan menyimpang dari aslinya.

⚠ **Batas ronde adalah batas berpikir.** `ai-loop.ts` menyisihkan ronde
terakhir tanpa tool, jadi `maks_ronde = 4` berarti **tiga** pembacaan saja.
Dinaikkan ke 6. Ukur sendiri:

```sql
SELECT asisten, maks_ronde, sifat_bicara FROM ai_provider_config ORDER BY asisten;
```

---

## 5. Cara mengukur ulang (yang harus dipercaya, bukan tabel di atas)

```bash
# 1. Nomor mana yang sudah terjelaskan di kode
cd apps/api && node -r dotenv/config scripts/lapor-otomasi-hidup.mjs

# 2. Hitungan baris SUNGGUHAN per tabel — bukan n_live_tup
node -e "import('./scripts/db/_koneksi.mjs').then(async m=>{
  const c=m.buatClient(); await c.connect();
  const {rows}=await c.query(\`select table_name t from information_schema.tables
    where table_schema='public' and table_type='BASE TABLE'\`);
  for (const {t} of rows) {
    const r=await c.query(\`select count(*)::int n from \"\${t}\"\`);
    if (r.rows[0].n) console.log(t, r.rows[0].n);
  }
  await c.end();})"
```

---

## 6. Tiga yang SUDAH selesai tapi katalognya belum tahu

| Nomor | Sudah dikerjakan sebagai | Status |
|---|---|---|
| 1.11 Reminder Setting via Chat | tool `titip_pengingat` + rute `kirim-pengingat` | ✅ nomor ditetapkan |
| 3.1 Daily Progress Collection (WA) | entri `catatan_progres` | ✅ nomor ditetapkan |
| ~~6.1 Approval via WhatsApp~~ | — | ❌ **KLAIM SAYA SALAH** |

**6.1 BELUM selesai.** Saya sempat menuliskannya sebagai sudah-ada di draf
dokumen ini, lalu memeriksanya: yang ada di kode adalah **mengajukan** kasbon
lewat WhatsApp dan **mengonfirmasi tulisan asisten sendiri**. Menyetujui
permintaan ORANG LAIN lewat WhatsApp tak ada — `wa-webhook.ts` tak menyebut
approval sama sekali. Ia tetap di daftar BARU.

Mengonfirmasi draf sendiri dan menyetujui permintaan orang lain terlihat mirip
di layar dan berbeda total dalam wewenang.

### Dua nomor yang ditetapkan, dan bentuk kesalahan yang sama dua kali

Keduanya sebelumnya menyatakan "tak punya padanan di katalog":

- `catatan_progres` memeriksa seluruh 1.x, tak menemukan, lalu menyimpulkan
  tak ada padanan sama sekali. Padanannya **3.1** — keluarga 3.x tak pernah
  dilihat.
- `kirim-pengingat` — tulisan **saya sendiri** — menyatakan "ini kemampuan
  asisten, bukan salah satu dari 140 otomasi bernomor". Padanannya **1.11**.

Ditulis dua orang berbeda dengan bentuk identik: mencari di satu keluarga
nomor lalu menyimpulkan tak ada padanan. Dua kali dengan bentuk sama bukan
kelalaian — itu tanda penelusurannya perlu dibantu alat.

```bash
# Menyandingkan otomasi tanpa nomor dengan nomor yang belum diklaim
cd apps/api && node scripts/lapor-nomor-yatim.mjs
```

**Sengaja LAPORAN, bukan penjaga.** Penjaga yang menuntut tiap entri bernomor
akan mendorong orang menempelkan nomor terdekat supaya CI hijau — persis
kebalikan dari yang diinginkan. Tiga otomasi memang tak punya padanan
(`kontrak-payung-habis`, `invoice-ringkasan-melenceng`, `opname-menggantung`),
dan alat itu benar melaporkan ketiganya tanpa kandidat.

---

## 7. BARU — 37 yang benar-benar menunggu sesuatu di luar

| Penahan | Nomor |
|---|---|
| OCR / gambar | 1.10, 3.2, 3.19, 4.1, 4.15, 5.6, 5.9, 5.10, 5.13 |
| STT / TTS | 1.3, 5.4, 8.15 |
| Analisis kontrak (AI) | 5.3, 5.14, 9.5 |
| Integrasi bank | 1.2, 2.1 |
| Modul CRM | 7.1, 7.2, 7.9 |
| Modul tender / bid | 7.6, 7.7, 7.3 |
| Modul lain belum ada | 3.16 RFI, 3.17 punch list, 6.2 cuti |
| Data eksternal | 3.8 cuaca, 7.12 pasar, 9.6 regulasi |
| Data belum dikumpulkan | 7.5 log komunikasi, 7.8 log portal, 8.14 target, 9.10 relasi, 10.4 GPS |
| Dicoret dari scope | 5.15 terjemahan (i18n) |
| Tabel belum ada | 10.6 `perawatan_alat_log` |

**Ini batas yang tak bisa dilewati dengan menyemai.** Menyemai data untuk
modul yang belum dibangun berarti membuat otomasi yang membaca tabel yang tak
akan pernah diisi pengguna sungguhan.
