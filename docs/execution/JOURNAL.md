# JOURNAL — Catatan Sesi

Satu blok per sesi. **Ditambahkan, tidak pernah ditulis ulang.**
Entri terbaru di ATAS.

---

## 2026-08-03 · Sesi 3 — repo dibuka, CI hidup, P0 terbukti nyata

Founder memutuskan repo dijadikan **publik**. Dua blokir yang sesi lalu saya
laporkan di luar jangkauan (B-1 Actions mati, B-2 branch protection tak tersedia)
**keduanya langsung teratasi**.

### Pemeriksaan keamanan sebelum membuka repo

Membuka repo tak bisa dibatalkan secara praktis, dan audit sebelumnya hanya
memindai berkas ter-track di HEAD — **belum pernah `git log -p`**. Jadi itu
dijalankan lebih dulu atas SELURUH histori: `.env` tak pernah ter-commit, nol
kunci `eyJ…`, nol `sb_secret_`, nol token GitHub/AWS/Slack/OpenAI, connection
string hanya placeholder.

Satu hal memang terbuka: ref project Supabase dev di 13 berkas. Itu **bukan
kredensial** — anon key tak pernah ter-commit dan RLS aktif 122/122, jadi yang
terekspos hanya *nama* infrastruktur, bukan aksesnya. Risiko rendah, dicatat.

### B-1 & B-2 — terbukti bekerja, bukan diasumsikan

- **Actions hidup.** Sebelum: 2–12 detik, `steps: []`, `runner_name: ""`, log 22 byte.
  Sesudah: ~2,5 menit, runner ditugaskan, **32 langkah** dieksekusi.
  **4 dari 5 job HIJAU.**
- **Branch protection aktif**: 5 check wajib, `strict: true`, force-push & deletion
  ditutup. Buktinya bekerja: PR #133 (CI merah) berubah `MERGEABLE` → **`BLOCKED`**.

### R-001 — cacat P0 TERBUKTI NYATA di lingkungan sesungguhnya

Ini bagian terpenting sesi ini. Sesi lalu saya menyimpulkan cacatnya dari membaca
kode; hari ini **diukur langsung** di project CI:

```
accounts  ADA · 0 baris · company_id=TIDAK · ⚠️ penanda 047 (account_type)
buku migrasi: 047=TERCATAT · 167=tidak
VERDICT: C — GL TENANT-BLIND
```

Dan CI utama gagal dengan akar yang sama:
`HARD FAIL 167_gl_chart_of_accounts.sql — column "company_id" does not exist`.

Persis skenario yang saya perkirakan: **047 menang, 167 dilewati diam-diam.**
Prediksi dari pembacaan kode terkonfirmasi oleh pengukuran — dan andai repo tak
dibuka, ini tak akan pernah terlihat.

Fallback founder dijalankan: `setup-clean` (aman, ketiga tabel 0 baris). Hasilnya
**047 + 167 + 175 lulus seluruhnya** di replay bersih. Perbaikan R-001 bekerja di
lingkungan kosong, bukan hanya di dev.

### F0-12 SELESAI + F0-13 tersingkap

**F0-12 diperbaiki dan diverifikasi di CI sungguhan.** Penjaga 137 kini
membedakan "ada user tapi akar yatim" (cacat nyata → tetap melempar) dari
"belum ada user sama sekali" (sah → lanjut), dan migrasi **176** memasang trigger
yang mengisi kepemilikan begitu user aktif pertama lahir. Jaminannya ditegakkan
mesin, bukan harapan.

Perbaikannya sendiri sempat cacat, dan hanya ketahuan karena diuji: fungsi
SECURITY DEFINER-nya memakai `SET search_path = pg_catalog, public`, sehingga
trigger **diam-diam menulis ke `public`** alih-alih ke schema tempat migrasi
berjalan. Uji tiga langkah di schema sementara menangkapnya. Konvensi repo
(64 fungsi SECURITY DEFINER, **nol** memakai `SET search_path`) ternyata memang
sengaja demikian supaya migrasi portabel untuk test harness — diikuti.

**Hasilnya: replay dari nol BERHASIL untuk pertama kalinya.**
WIPE → 150+ migrasi → seluruh seed OK → `success`.

Dan `periksa-gl` sesudahnya membuktikan R-001 tuntas end-to-end:

| | Sebelum | Sesudah |
|---|---|---|
| `accounts` | `company_id=TIDAK`, penanda 047 | **`company_id=YA`, penanda 167, 38 akun** |
| Buku migrasi | 047=TERCATAT, **167=tidak** | **047 & 167 keduanya tercatat** |
| Verdict | **C — GL TENANT-BLIND** | **B — AMAN** |

**F0-13 (P1 baru) tersingkap justru karena replay berhasil.** CI utama: 4 dari 5
job **hijau**; job API gagal dengan **1132 lulus / 163 gagal** — padahal lokal
**1299 lulus / 0 gagal**.

Selisihnya **lingkungan, bukan kode**: DB CI baru di-wipe, jadi fixture yang
selama ini menumpuk di dev tidak ada. Pola kegagalannya konsisten dengan itu —
`expected 403 to be 200` berulang (permission belum ter-seed), "daftar admin
kosong", "admin tidak menerima notifikasi".

Ini utang yang **selama ini tersembunyi** karena tak seorang pun pernah berhasil
me-replay dari nol. Tiga cacat kelas ini dalam satu sesi (047, 137, seed CI),
dan ketiganya punya sifat sama: tak terlihat di lingkungan yang tumbuh bertahap.

### F0-12 — cacat kedua dari kelas yang sama, ditemukan karena replay bersih

Replay berhenti di migrasi **137**: *"1 akar grup tanpa owner_user_id"*.

Akarnya: migrasi **126** mengisi `created_by` dari admin-aktif-tertua, tetapi di
DB yang baru di-wipe **belum ada user sama sekali** (seed berjalan SETELAH semua
migrasi) → NULL. Lalu **137** mem-backfill `owner_user_id` dari
`COALESCE(created_by, admin-tertua)` — keduanya NULL — dan penjaganya melempar.

**Penjaga 137 benar dan tidak boleh dilemahkan.** Yang salah urutan seed-vs-migrasi.

Yang perlu dicatat: **ini kedua kalinya dalam satu sesi** pola yang sama muncul —
cacat yang hanya kelihatan saat sistem dibangun dari nol, tak pernah di dev yang
tumbuh bertahap. Belum diperbaiki: di luar cakupan ratifikasi, dan ada ≥2
pendekatan sah. Masuk antrean F0-12.

---

## 2026-08-03 · Sesi 2 — ratifikasi dieksekusi

Founder meratifikasi R-001 (opsi A + 3 syarat), R-002, R-003, R-004, memerintahkan
sapuan ulang untuk R-005, dan menaikkan dua item baru ke P0/gerbang.

### BARU-1 (P0) — CI tidak menjaga apa pun. Lebih buruk dari dugaan.

Founder benar: `ci.yml` disaring `branches: [main]`, sehingga **setiap PR bertumpuk
berjalan tanpa satu pun check**. 13 penjaga arsitektural yang dibangun sesi lalu
tidak menjaga apa pun pada rantai PR mana pun yang belum menyentuh `main`. Pemicu
sudah diubah ke `pull_request` tanpa filter.

Tetapi saat memverifikasi "status check benar-benar wajib", ditemukan dua hal yang
**lebih besar** dari cacat pemicunya:

1. **Branch protection TIDAK BISA diaktifkan.** `gh api …/branches/main/protection`
   → **403: "Upgrade to GitHub Pro or make this repository public"**. Begitu pula
   `…/rulesets`. Repo privat pada paket saat ini tidak mendukung keduanya. Artinya
   **tak ada mekanisme apa pun yang mewajibkan CI hijau sebelum merge** —
   diverifikasi: PR #133 `mergeStateStatus: UNSTABLE` tetapi `mergeable: MERGEABLE`.
2. **GitHub Actions tidak menjalankan job sama sekali.** Seluruh run terakhir gagal,
   termasuk push ke `main`. Bukti: job selesai dalam 3–12 detik, `steps: []` (nol
   langkah), `runner_name: ""` (runner tak pernah ditugaskan), dan zip log berukuran
   22 byte alias kosong. Ini bukan cacat kode — melainkan blokir tingkat akun
   (kuota/spending limit Actions).

Konsekuensi jujur: **CI belum bisa dipulihkan dari sisi saya.** Yang bisa saya
lakukan sudah dilakukan (pemicu diperbaiki); dua sisanya butuh tindakan founder di
setelan akun GitHub. Sampai itu beres, satu-satunya verifikasi yang nyata adalah
run lokal — dan itu yang saya tempel, bukan klaim CI hijau.

### R-001 — dieksekusi penuh, dengan ketiga syarat

**Syarat 1 — periksa DB CI sebelum eksekusi.** Kredensial `CI_*` memang write-only
di GitHub Secrets, jadi jalur "periksa dulu" hanya mungkin lewat workflow. Dibuat
`apps/api/scripts/ci-periksa-bentuk-gl.mjs` (read-only, tiga verdict A/B/C) +
action `periksa-gl` di `ci-isolation.yml`. **Belum dijalankan** karena Actions mati
(BARU-1) → maka fallback founder berlaku: **reset CI dari nol setelahnya**.

**047 dipensiunkan.** Isinya diganti no-op + penjelasan panjang. Berkasnya sengaja
TIDAK dihapus: nomor 047 sudah tercatat di buku migrasi, dan menghapusnya membuat
buku menunjuk ke sesuatu yang tak ada.

**Syarat 2 — migrasi penegas bentuk (175).** Gagal keras bila `accounts` tanpa
`company_id` atau masih punya `account_type`. **Membangunnya menemukan tiga cacat
pada penegas itu sendiri**, dan ketiganya hanya ketahuan karena diuji:

- **Terlalu ketat.** Versi pertama menuntut `company_id` di `journal_entry_lines`.
  Diuji ke dev → langsung melempar. Ternyata **penegasnya yang salah**: 167 sengaja
  memberi baris jurnal tenancy lewat induknya (`entry_id` → `journal_entries`),
  dinyatakan eksplisit di komentar 167 baris 155-156. Penjaga yang salah lebih
  berbahaya daripada tak ada penjaga — ia melatih orang mengabaikan kegagalannya.
  Diganti: cek FK ke induk, yang memang jalur tenancy sesungguhnya.
- **Buta schema.** Memakai `to_regclass('public.accounts')`, jadi selalu memeriksa
  `public` apa pun `search_path`-nya. **Uji negatif membuktikannya lolos padahal
  bentuknya 047.** Diganti `current_schema()` — idiom yang sudah dipakai 167 & 154.
- **Pesan galat rusak.** `array || text` yang teksnya memuat tanda kurung ditafsir
  Postgres sebagai array literal → `malformed array literal`, menutupi pesan
  sebenarnya. Dibungkus `ARRAY[...]`.

Uji akhir: **positif** (dev, bentuk 167) → LULUS; **negatif** (bentuk 047 dibangun
di schema sementara, transaksi di-ROLLBACK) → MENOLAK dengan pesan yang benar.

**Syarat 3 — sapu SELURUH 171 migrasi.** Dibuat
`audit-tabrakan-definisi-tabel.mjs`. Hasil sapuan: **13 tabel bertabrakan**, dan
ternyata **047↔167 bukan satu-satunya kelasnya** — tetapi satu-satunya yang tak
terjaga:

| Tabrakan | Status |
|---|---|
| `assets`, `asset_movements`, `asset_depreciation_logs` (045↔149) | **sudah terjaga** — 149 MEMBUANG bentuk 045 lebih dulu, dengan komentar yang menjelaskan cacat yang sama persis (baris 50-73) |
| `project_rab_materials` (043↔142), `po_delivery_log` (043↔143) | aman — definisi identik / ada `to_regclass` guard |
| 5 tabel workflow (081↔093) | aman — bentuk identik kolom demi kolom, dan ADR-006 sudah memensiunkannya (tabelnya nihil di dev) |
| **`accounts`, `journal_entries`, `journal_entry_lines` (047↔167)** | **satu-satunya yang tak terjaga → diperbaiki** |

Penemuan migrasi 149 penting: repo ini **sudah pernah** menyelesaikan cacat kelas
ini dengan benar. Jadi perbaikan R-001 mengikuti preseden yang ada (CHARTER §4
aturan 2), bukan mengarang pendekatan baru.

Penjaganya sendiri juga salah dua kali sebelum benar: (a) mendeteksi "penegas"
hanya dari ada-tidaknya `RAISE EXCEPTION` di berkas — terlalu longgar; (b) menuduh
**semua** pendefinisi, bukan yang **terakhir** — menghasilkan 18 tuduhan yang
hampir semuanya salah sasaran. Yang menanggung beban penjagaan adalah migrasi yang
datang belakangan; yang pertama tak punya apa pun untuk dijaga.

### R-005 — saya salah, dan founder benar menyuruh menyapu lebih luas

Sesi lalu saya menyimpulkan `1.657.839.590,39`, `109,5`, `7875` "hampir pasti bukan
dari berkas Cibuluh" lalu berhenti. Kesimpulan yang benar adalah **"belum saya cari
di berkas lain"** — sapuan saya hanya menyentuh `_source/ahsp/golden/`.

Disapu ke seluruh `_source/ahsp/`. **Ketiganya ketemu**, semuanya di
`Format RAB Control 2026 NOMOR 47_SE_Dk_2026.xlsm` (117 sheet):

- `1.657.839.590,39` = **TOTAL BIAYA** proyek (`REKAPITULASI!E15`, juga di
  `LAPORAN RAB!J239` dan `KURVA S!F19`)
- `109,5` = **volume m²** pasangan bata merah ½ batu (`LAPORAN RAB!H114`);
  terverifikasi silang: `109,5 × 146.308,162 = 16.020.743,74` = J114 ✅
- `7875` = **jumlah buah** bata merah (`DINDING BATA MERAH!L41`, satuan "Buah")

Jawaban atas pertanyaan mandat "kenapa 3.629.860.295,31 ≠ 1.657.839.590,39":
**dua proyek yang berbeda.** Cibuluh = RAB gudang nyata (9 divisi, 55 item);
RAB Control 2026 = Engineering Estimate template SE-47 (8 divisi A–H). Bukan beda
edisi, bukan subtotal-vs-total, bukan sudah/belum PPN.

**Temuan sampingan bernilai:** baris PPN di dokumen itu berlabel **"PPN 11%"**
tetapi pengalinya **0,12** (`F16`), dan hasilnya cocok
(`1.657.839.590,39 × 0,12 = 198.940.750,85`). Ini membuktikan model dua-angka yang
dijaga `ppn-dpp-guardrail.test.ts` **berasal dari praktik dokumen nyata**, bukan
karangan — dan menjadi kandidat kuat untuk mengisi guardrail yang selama ini
melaporkan dirinya *vacuous*.

Assertion belum ditambahkan → **F0-10**, karena butuh harness pembaca `.xlsm`
tersendiri. Itu pekerjaan, bukan keraguan.

### Yang belum & kenapa

- **R-002** (catat 12 migrasi ke buku) — menunggu R-001 benar-benar tuntas di
  lingkungan CI, sesuai urutan yang founder tetapkan.
- **F0-11** — pemeriksaan bentuk GL di project CI: terblokir BARU-1.
- **F1-8** — `companies.ts` coverage nol dinaikkan ke **gerbang Fase 1** sesuai
  perintah founder. Fase 2 tidak dimulai sebelum ini hijau.

### Verifikasi sesi ini

Suite penuh **129/129 berkas, 1299 lulus, 1 skipped, 228,9 s** — run hijau
**keempat berturut-turut**. Coverage tak berubah (31,98% / 68,49% / 81,96%).
**14 penjaga arsitektural exit 0.** `tsc --noEmit` exit 0.
`gen-indeks-docs --check` exit 0.

---

## 2026-08-02 · Sesi 1 — Fase 0 dimulai

### Pengakuan tujuh koreksi (tanpa pembelaan)

**C-1 — Introspeksi DB tidak stabil. Saya salah.**
Saya membalik kesimpulan soal GL empat kali dan membiarkan `process.cwd()`
melayang ke `apps/api` tanpa menyadarinya. Akar teknisnya saya temukan hari ini
dan lebih memalukan dari dugaan: setiap alat menulis ulang logika baca-`.env`
sendiri, dan salah satunya **tidak melucuti tanda kutip** pembungkus nilai
`DIRECT_URL` (`"postgresql://…"`). Driver `pg` gagal mem-parsing string berawalan
`"`, jatuh ke variabel lingkungan, lalu memakai `HOST=` dari `.env` sebagai
hostname — menghasilkan galat menyesatkan `getaddrinfo ENOTFOUND base`. Angka DB
di laporan audit saya **memang layak dicurigai**. Sudah diverifikasi ulang (§0.2).

**C-2 — Urutan kerja saya terbalik. Saya salah.**
Saya menaruh `company_id` di #7 dan keputusan grup/holding di #9. Bentuk grup
menentukan bentuk CoA dan jumlah tingkat kolom tenancy; mengerjakan `company_id`
lebih dulu berarti menyentuh 122 tabel dua kali. Urutan sudah dibalik di
`CHARTER.md` §3: **keputusan struktural mendahului migrasi struktural.**

**C-3 — Rekomendasi saya berbahaya. Saya salah, dan ini yang paling serius.**
Saya membuktikan sendiri parser `rekonsiliasi-schema-migrations.mjs` buta terhadap
DDL dinamis, lalu tetap merekomendasikan `--tulis` ke buku migrasi. Buku itu
menentukan apa yang di-replay CI; satu entri palsu = migrasi dilewati senyap
selamanya, tanpa gejala. Rekomendasi **ditarik**. Alat baru `ledger-diff.mjs`
dibuat, **tanpa flag tulis sama sekali**, dan menandai migrasi ber-DDL-dinamis
sebagai `PERLU-MATA-MANUSIA` alih-alih menghijaukannya.

**C-4 — Saya memvonis tanpa bukti. Saya salah.**
"Cacat bootstrap harness, bukan produksi" adalah hipotesis yang saya tulis sebagai
kesimpulan. Belum diselesaikan sesi ini; masuk antrean sebagai `F0-4` dan
**tidak** akan saya tutup sebelum ada bukti.

**C-5 — Golden file tidak cocok. Saya salah.**
`1.657.839.590,39`, `109,5`, `7875` tidak saya temukan, dan saya melaporkannya
sebagai "kemungkinan dari dokumen lain" alih-alih menyelidikinya. Ditemukan hari
ini: ada **dua** berkas Cibuluh (`.xls` 6,9 MB dan `.xlsx` 3,5 MB) — kandidat
penjelasan yang belum saya buka. Masuk antrean `F0-7`.

**C-6 — Skor Testing 80 belum dibayar. Saya salah.**
Coverage tidak diukur, jadi angka itu tidak punya dasar. Masuk antrean `F0-5`
sebagai ratchet, bukan target aspirasional.

**C-7 — Temuan terpenting saya kubur. Saya salah.**
93 dari 119 sub-menu tanpa rancangan saya taruh sebagai catatan kaki §10.6,
padahal itu risiko yang paling mungkin membunuh proyek. Dinaikkan menjadi Fase 5
tersendiri di `CHARTER.md`.

### Yang dikerjakan

- **0.1 SELESAI** — `scripts/db/introspect.mjs` + `scripts/db/_koneksi.mjs`.
  Satu metode koneksi (driver `pg`, alasan ditulis di header), identitas +
  `schema_hash` dicetak tiap run, penjaga cwd menolak jalan dari luar root repo.
- **0.2 SELESAI** — tujuh angka kepala diverifikasi ulang → `KOREKSI.md`.
- **0.6 SEBAGIAN** — `ledger-diff.mjs` jadi, `LEDGER-DIFF.md` terbit.
  Penulisan ke buku **tidak** dilakukan (G-2) → `RATIFIKASI.md` R-001.

### Yang ditemukan (tidak ada di audit kemarin)

1. **🔴 P0 — tabrakan definisi GL 047 ↔ 167.** Migrasi 047 **tercatat sudah jalan**
   dan mendefinisikan `accounts` **single-tenant** (`account_type`, nol `company_id`).
   Migrasi 167 mendefinisikan `accounts` **tenant-aware** (`company_id` 18×, kolom
   `type`) dengan `CREATE TABLE IF NOT EXISTS`. Dev memakai desain 167 (terverifikasi
   `introspect columns`). Di lingkungan baru, `ci-project-setup.mjs` menjalankan 047
   lebih dulu (SQL-nya valid → tidak error → tidak masuk `SKIP_ALLOWLIST` → tidak
   HARD FAIL), lalu 167 **no-op senyap**. Hasil: **GL tenant-blind di CI/produksi**
   tanpa satu pun pesan galat. Diajukan sebagai R-001.
2. **Seluruh seri GL (167–174) belum ter-merge ke `main`** — hanya ada di branch
   `fix/search-proyek-gagal-senyap` (8 commit, 3.890 baris), padahal tabelnya sudah
   di-apply ke DB dev bersama. Branch Fase 0 saya rebase ke sana agar tidak
   membangun di atas baseline palsu.
3. **Jumlah trigger: 156 (`public`), 175 (semua schema).** Angka 192 di audit saya
   tidak cocok dengan keduanya. Ada schema `mut6` berisi 14 trigger — sisa
   mutation-test yang menggantung di DB dev.
4. `.env` diawali **BOM** dan nilainya dibungkus tanda kutip — dua jebakan parser
   yang kini ditangani terpusat di `_koneksi.mjs`.

### Yang berubah dari rencana

Fase 0 ternyata harus mencakup **rebase ke branch yang benar** — tidak terduga,
tapi wajib: tanpa itu seluruh pengukuran Fase 0 dilakukan atas pohon kode yang
tidak memuat GL, sementara DB-nya memuat GL. Persis kelas kesalahan C-1.

### F0-4 — jaring pengaman rollback: saya salah DUA KALI, dengan cara berbeda

Audit saya menulis "cacat bootstrap harness, bukan produksi" sebagai kesimpulan
padahal itu hipotesis (C-4). Hari ini saya mengukurnya, dan hipotesis itu **salah** —
tapi kesimpulan turunannya ("bukan cacat produksi") ternyata **benar karena alasan
yang berbeda**. Keduanya perlu dicatat supaya tidak diklaim sebagai tebakan beruntung.

**Bukti yang dikumpulkan:**

1. Dijalankan sendirian, `multitenant-t3-rollback.test.ts` **LULUS 23/23**, tiga kali
   berturut-turut. Jadi bukan cacat bootstrap: tabel `assembly_components` memang
   terbentuk dengan benar oleh `bootstrap()`.
2. Dijalankan sebagai bagian suite penuh hari ini: **129/129 berkas lulus,
   1299 lulus, 0 gagal, 217,4 detik.** Kegagalan kemarin **tidak reproduksi**.
3. Akarnya ada di `test-utils/test-db.ts` dan **sudah terdokumentasi di sana**:
   27 berkas test berbagi satu schema `test`, dan `resetTestSchema()` melakukan
   `DROP SCHEMA … CASCADE` yang butuh ACCESS EXCLUSIVE lock. Koneksi berkas test
   sebelumnya kadang belum lepas di sisi server (pooler session-mode menutup
   asinkron), sehingga DROP menunggu dan hook timeout menembak duluan. Komentar di
   kode menyebut frekuensinya "intermiten, ~30-50% run penuh".

**Jadi:** ini **flake infrastruktur test yang sudah dikenal**, bukan cacat produksi
dan bukan cacat bootstrap. Yang salah dari audit saya bukan verdict akhirnya,
melainkan **saya menyatakannya tanpa mengukur** — dan kebetulan-benar adalah
kegagalan metode, bukan keberhasilan.

**Konsekuensi yang belum selesai:** `F0-4` TIDAK saya tutup. Suite yang lulus
sekali tidak membuktikan flake-nya hilang; ia hanya tidak muncul hari ini. Kriteria
selesainya diperketat menjadi: *lulus 3 run penuh berturut-turut* + *test rollback
untuk tiap tipe migrasi tenancy*. Sisanya dikerjakan sebelum Fase 2, karena Fase 2
justru yang paling bergantung pada jaring ini.

**Temuan turunan:** jumlah "skipped" ikut berubah antar-run (24 → 1). Dua puluh tiga
di antaranya adalah test milik berkas yang gagal, bukan test yang sengaja di-skip.
Angka "24 skipped" di laporan audit karenanya menyesatkan; yang benar-benar
di-skip secara sengaja hanya **1** (`golden-cibuluh` — pasangan `skipIf` yang memang
mati saat berkas golden-nya ada).

### F0-5 — coverage: skor Testing 80 akhirnya dibayar (C-6)

Diukur pertama kali: **statements/lines 31,98%**, branches 68,49%, functions 81,96%.
Yang mengkhawatirkan bukan angkanya melainkan **sebarannya**: 27 berkas route
ber-coverage NOL, termasuk `users.ts`, `notifications.ts`, `documents.ts`,
`audit.ts`, dan `companies.ts` (inti multi-tenant). Jalur uang tipis:
`penalty.ts` 4,2%, `kasbon-limit.ts` 5,3%.

Membangun ratchet-nya justru menemukan dua cacat pada penjaga itu sendiri:

1. **Tanpa toleransi, penjaga jadi cerewet.** v8 bergoyang antar-run
   (branches 68,49 → 68,48). Penjaga yang berteriak untuk 0,01% akan dimatikan orang.
2. **Penjaga bisa berbohong.** Run `src/lib` saja menghasilkan statements 8,57%
   terhadap lantai 31,98% → vonis "TURUN" **palsu**. Sidik cakupan yang benar
   adalah **baris tereksekusi** (1.821 vs 6.794), bukan jumlah berkas — v8 tetap
   mendaftar semua berkas yang di-`include` walau nol tercakup, sehingga jumlah
   berkas nyaris tak berubah. Ratchet kini MENOLAK membandingkan (exit 2) alih-alih
   memberi vonis palsu.

### F0-7 — golden file: hipotesis saya sendiri gugur (C-5)

Saya menduga selisih angka berasal dari "dua berkas Cibuluh berbeda". **Salah.**
`.xls` dan `.xlsx` isinya identik — 22 sheet sama, nilai di sel sama; `.xlsx` hanya
hasil simpan-ulang. Jadi bukan itu penjelasannya.

`1.657.839.590,39` **tidak ada** di kedua berkas, seluruh 22 sheet. Semua angka
1–9 miliar disapu; terdekat `1.642.531.571` (subtotal Pekerjaan Beton), selisih
15,3 juta — bukan PPN, bukan PPh, bukan pembulatan. `109,5` dan `7875` juga nihil.

**Yang sengaja tidak saya lakukan:** menambahkan assertion untuk ketiganya.
Mengunci angka yang sumbernya tak diketahui = menjadikan tebakan sebagai kebenaran,
persis kelas kesalahan yang Fase 0 ada untuk memberantasnya. → R-005.

### F0-9 — penjaga penomoran migrasi

171 berkas, nomor tertinggi 174, lompatan lama 30/59/64 (059 = `seed_dummy_data`;
030 & 064 tak pernah ada di histori git). Lompatan lama dikecualikan **beserta
alasannya**; yang dijaga lompatan baru dan nomor ganda. Diuji dua arah.

Alasan nomor ganda berbahaya bukan estetika: `ci-project-setup` mencatat keduanya
sebagai satu versi, sehingga yang kedua **dilewati senyap selamanya** — mekanisme
yang sama persis dengan cacat P0 047↔167.

### Temuan proses: CI tidak berjalan untuk PR bertumpuk

PR #134 dibuat menargetkan `fix/search-proyek-gagal-senyap` (PR #133), bukan `main`,
karena seri GL 167–174 belum ter-merge. Akibatnya **nol check berjalan**:
`ci.yml` hanya ter-trigger pada `pull_request.branches: [main]`.

Ini konsekuensi nyata dari R-003 yang tak saya antisipasi. Selama rantai PR belum
sampai ke `main`, **CI tidak memverifikasi apa pun** — dan mengklaim "CI hijau"
dalam kondisi itu akan jadi persis jenis klaim tak berdasar yang CHARTER §7 larang.

Sebagai ganti, seluruh langkah CI dijalankan **lokal**, dan hasilnya ditempel:
13 penjaga exit 0 · api `lint:ratchet` 0 error / `tsc` exit 0 / `build` exit 0 ·
web `lint:ratchet` 0 error / `tsc` exit 0 · suite penuh 3 run berturut hijau.

`F0-3` karenanya tetap **wip**, bukan done: kriteria "penjaga CI hijau" baru
benar-benar terpenuhi saat rantai PR di-merge ke `main`.

### Status gerbang Fase 0 — BELUM hijau penuh (dinyatakan jujur)

Selesai: F0-1, F0-2, F0-5, F0-6, F0-7, F0-9.
Belum: **F0-3** (penjaga docs jalan, CI penuh belum diverifikasi end-to-end),
**F0-4** (3 run berturut hijau, tapi isolasi schema per-berkas + rollback tiap
tipe migrasi tenancy belum dibangun).

Sesuai CHARTER §3, Fase 1 **tidak** dimulai sebelum keduanya tuntas.

### Menunggu di RATIFIKASI

- **R-001** 🔴 P0 — tabrakan GL 047↔167 (G-2). Memblokir pekerjaan GL apa pun.
- **R-002** — pencatatan 12 migrasi ke buku (G-2; harus SETELAH R-001).
- **R-003** — bekerja di atas `fix/search-proyek-gagal-senyap`, bukan `main`.
- **R-004** — penarikan rekomendasi `rekonsiliasi --tulis`.
- **R-005** — 3 angka jangkar golden file tak dikenali sumbernya (pertanyaan, tidak memblokir).
- **F0-8** — pembersihan schema `mut6` dari DB dev (G-2).
