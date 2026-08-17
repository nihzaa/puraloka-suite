# Puraloka Suite — Konteks untuk Claude Code

> **Dokumen ini sengaja TIDAK memuat angka.**
>
> Versi sebelumnya menyatakan "migration 001-058" dan "Database — 27+ Tabel",
> lalu ditambal catatan "sudah basi — migration nyata s.d. 116; dev 90 tabel" —
> dan **tambalan itu pun basi**. Angka di dokumen konteks membusuk, dan agent yang
> membacanya berhalusinasi dengan percaya diri. Audit 2026-08-02 mencatat ini
> sebagai racun konteks paling produktif di repo (temuan F-004).
>
> Aturan barunya: **kalau sebuah fakta bisa basi, jangan tulis faktanya — tulis
> cara mengukurnya.** Setiap angka di bawah punya perintahnya sendiri.
>
> Isi lama tersimpan di git history (`git show 6efa24c:CLAUDE.md`).

---

## 0. Urutan baca wajib di awal sesi

1. **`docs/execution/CHARTER.md`** — sumber kewenangan, urutan fase, Protokol
   Keputusan, Gerbang Keras. Ini yang menentukan boleh-tidaknya sebuah tindakan.
2. **`docs/execution/QUEUE.yaml`** — antrean kerja. Ambil item prioritas tertinggi
   yang tidak terblokir. Jangan melompati fase.
3. **`docs/execution/JOURNAL.md`** — 10 entri terakhir.
4. **`STATUS.md`** — fase aktif + keputusan terbuka.
5. **`docs/execution/RATIFIKASI.md`** — apa yang sedang menunggu founder.

Lalu jalankan ritual awal sesi (`CHARTER.md` §8). Aturan pokoknya:
**kalau kenyataan tidak cocok dengan dokumen, kenyataan yang menang** — perbaiki
dokumennya, catat di jurnal.

## 1. Cara mengukur (pengganti semua angka yang dulu ditulis di sini)

```bash
# Identitas koneksi + sidik jari schema — SELALU jalankan lebih dulu.
node scripts/db/introspect.mjs identity

# Jumlah tabel, status RLS, jumlah policy per tabel
node scripts/db/introspect.mjs tables

# Tabel mana yang sudah/belum punya company_id (daftar LENGKAP)
node scripts/db/introspect.mjs tenancy-coverage

# Bukti tidak ada nominal bertipe float
node scripts/db/introspect.mjs money-types

# Buku migrasi vs berkas
node scripts/db/introspect.mjs migration-ledger

# Buku migrasi vs ARTEFAK FISIK di schema (verdict yang bisa dipercaya)
node scripts/db/ledger-diff.mjs
```

Angka endpoint, halaman, dan test:

```bash
grep -rEn "\.(get|post|put|patch|delete)\(" apps/api/src/routes --include=*.ts | grep -v __tests__ | wc -l
find apps/web/app -name 'page.tsx' | wc -l
cd apps/api && npx vitest run          # tempel ringkasannya, jangan diklaim
```

**Menguji otomasi TANPA saldo AI.** Ketujuh tugas terjadwal **tak butuh AI sama
sekali** — semuanya aturan `if-then`. Yang butuh saldo hanya asisten chat dan
sapa-proaktif, dan keduanya BUKAN bagian katalog otomasi.

```bash
# 1. Lewat test — tak butuh API hidup, tak butuh kredensial
cd apps/api && npx vitest run otomasi-terjadwal

# 2. Lewat rute sungguhan — butuh API hidup + akun. UKUR portnya (§7).
UJI_EMAIL=… UJI_SANDI=… UJI_BASIS=http://127.0.0.1:3001 \
  node apps/api/scripts/uji-otomasi-terjadwal.mjs
```

**Otomasi mana yang hidup** — jangan dibaca dari katalog, UKUR:

```bash
cd apps/api && node -r dotenv/config scripts/lapor-otomasi-hidup.mjs
```

**Asisten — jangan percaya "sudah bisa", UKUR.** Tiga hal yang mudah tertukar:

```bash
# 1. Apakah 40 tool BENAR-BENAR jalan? Memanggil tool sungguhan, bukan mock.
#    Idempoten (semua bertanda [SEED-PAKAI], dibersihkan di awal tiap jalan).
cd apps/api && npx tsx scripts/seed-pemakaian-asisten.mjs

# 2. Tool mana yang benar-benar DIPAKAI orang — dan mana yang menganggur.
#    MENOLAK melapor kalau belum ada percakapan bertool: 40 baris "0 panggilan"
#    terbaca seperti temuan, padahal cuma berarti asistennya belum dipakai.
cd apps/api && npx tsx scripts/lapor-tool-terpakai.mjs

# 3. Berapa mahal katalognya (skema dikirim ULANG tiap ronde).
cd apps/api && node scripts/audit-katalog-tool-tak-membengkak.mjs
```

⚠ **Yang (1) BUKTIKAN dan yang tidak.** Ia membuktikan *"kalau model memanggil
tool X, tool X bekerja"*. Ia TIDAK membuktikan *"model memilih tool yang tepat"* —
itu hanya ketahuan dari percakapan sungguhan lewat chat web/WhatsApp, dan
karena itu (2) menolak melapor sampai percakapan itu ada.

⚠ **Kurasi `tool_aktif` hidup di BASIS, dan test bisa menghapusnya.**
`ai-perilaku.test.ts` menyetel `tool_aktif = NULL` di setup-nya — kurasi yang
dipasang lewat `UPDATE` sekali jalan hilang begitu test itu berjalan. Ukur:

```sql
-- lewat psql/Supabase SQL editor. NULL = semua tool (belum dikurasi).
SELECT asisten, mode_bicara, sifat_bicara,
       coalesce(array_length(tool_aktif, 1), 0) AS jml_tool
  FROM ai_provider_config ORDER BY asisten;
```

Keadaan yang dimaksudkan 2026-08-16: `owner`/`web` semua tool + sifat
`[menyarankan, mengobrol]`; `staff`/`insight` dikurasi (15/14 tool) + sifat
`[menyarankan]` saja. Kalau `jml_tool` jadi 0 untuk keempatnya, kurasinya
terhapus — pasang ulang, dan kalau perlu permanen tempatnya seed/migrasi.

Kolom `N/N/L/O` di `06-agentic-ai-and-automation-architecture.md` adalah
**prioritas** (Now/Next/Later/Optional), **bukan status pengerjaan** — tujuh
automation yang sudah hidup semuanya masih tertulis `Next` di sana. Salah baca
ini memakan biaya dua kali pada 2026-08-14: sekali melapor angka yang salah ke
founder, sekali nyaris membangun ulang automation 3.5 yang sudah ada.

Skrip itu juga memisahkan dua hal yang mudah tertukar: **"aktif" bukan berarti
"pernah jalan"**. Diukur 2026-08-14 — 11 alur aktif, 8 di antaranya nol
eksekusi seumur hidup.

**Aturan mengikat:** angka schema apa pun yang masuk dokumen HARUS berasal dari
`scripts/db/introspect.mjs`. Skrip sekali-pakai dilarang jadi sumber angka —
alasannya (dan kisah galat `ENOTFOUND base`) ada di header `scripts/db/_koneksi.mjs`.

## 2. Tentang project

Aplikasi manajemen konstruksi milik **Puraloka Persada** (Nizar / nihzaa), sedang
bertransformasi menjadi **ERP konstruksi SaaS multi-tenant** yang dijual ke banyak
perusahaan — termasuk satu pemilik dengan beberapa PT. Tujuan lengkap: `CHARTER.md` §2.

- GitHub: `nihzaa/puraloka-suite` (**PRIVATE** — diverifikasi `gh repo view`)
- Lokal: `E:\Project\puraloka-suite`

## 3. Stack

| Lapis | Teknologi |
|---|---|
| Backend API | Node.js + Fastify + TypeScript (port: **ukur**, lihat §7) |
| Web | Next.js + Tailwind CSS v4 + TypeScript (port 3000) |
| Mobile | React Native + Expo |
| Database | PostgreSQL via Supabase |
| Auth | Supabase Auth (email/password + Google OAuth) |
| Storage | Supabase Storage |
| Package manager | pnpm (workspaces) |
| Test | Vitest — **integration test terhadap Postgres NYATA**, bukan mock |

## 4. Struktur

```
apps/api/src/routes/v1/   → route Fastify (satu berkas per domain)
apps/api/src/utils/       → notifications, audit, approval, penalty, webpush
apps/api/src/lib/         → pure function kalkulasi finansial (AHSP, PPN, EVM)
apps/api/scripts/         → penjaga arsitektural yang dijalankan CI
apps/web/app/             → halaman Next.js (dashboard, portal, mandor-portal)
apps/web/components/      → komponen bersama
scripts/db/               → alat introspeksi & ledger-diff (KANONIK)
db/migrations/            → migrasi SQL bernomor
docs/execution/           → CHARTER, QUEUE, JOURNAL, DECISIONS, RATIFIKASI
```

`packages/shared` terdaftar di workspace tetapi **kosong** — jangan menganggapnya
berisi types bersama.

`.worktrees/` berisi git worktree aktif dengan pekerjaan belum ter-merge, dan
menduplikasi seluruh pohon `docs/`. Sudah dikeluarkan dari jangkauan pencarian
lewat `.claudeignore`. **Jangan membaca dokumen dari sana** — isinya versi lain.

## 5. Yang WAJIB diketahui sebelum menyentuh kode

### 5.1 Otorisasi — permission, bukan peran (ADR-004)

Kode hanya boleh memakai `requirePermission`. Literal `'admin'`/`'pm'`/`'mandor'`/
`'client'` **dilarang** sebagai gerbang otorisasi — peran adalah data konfigurasi
per-tenant, bukan konstanta. Sisa pelanggaran dibersihkan di Fase 3 (`QUEUE.yaml`
F3-1). **Jangan menambah yang baru.**

### 5.2 Tenancy

Akses data lewat `request.db` (sadar tenant), bukan `supabase` mentah. Penjaga CI
`audit-gerbang-tenancy.mjs` memakai **ratchet**: jumlah rute tanpa gerbang tidak
boleh naik.

### 5.3 Ember [C] — tidak boleh dikonfigurasi

RLS aktif/mati · invariant pembukuan berpasangan · immutability audit log ·
default gagal-tertutup · struktur rumus finansial · isolasi tenant.
Jangan pernah membuatnya bisa diubah dari UI, sekalipun diminta.

### 5.4 Uang & waktu

Semua nominal `numeric` (nol float — buktikan dengan `money-types`). Semua waktu
`timestamptz`. Jangan memperkenalkan `float`/`timestamp without time zone`.

### 5.5 Migrasi

Menulis ke `supabase_migrations.schema_migrations` adalah **Gerbang Keras G-2**.
Buku itu menentukan apa yang di-replay CI; entri palsu = migrasi dilewati senyap
selamanya. Verdict "sudah jalan" hanya sah bila **artefak fisiknya terbukti ada**
(`ledger-diff.mjs`), bukan dari penebakan nama.

> ✅ **Cacat P0 047↔167 SUDAH SELESAI** (R-001). 047 dipensiunkan jadi no-op
> berkomentar, penegas bentuk `175_gl_penegas_bentuk.sql` terpasang, dan ketiganya
> terbukti lulus di lingkungan bersih. **GL boleh dibangun di atasnya** — ukur
> sendiri: `node scripts/db/introspect.mjs columns | grep accounts`.
>
> Peringatan "jangan bangun di atas GL" pernah bertahan di sini **setelah**
> penyebabnya diperbaiki, lalu menyesatkan sesi berikutnya (2026-08-07: saya
> melaporkan ke founder bahwa penyusutan→GL menunggu ratifikasi, padahal tidak).
> Pelajaran yang sama dengan pembuka dokumen ini: **peringatan pun bisa basi.**
> Kalau sebuah larangan punya syarat pencabutan, tulis cara mengukur syaratnya.

## 6. Penjaga CI (jangan dilemahkan — G-5)

`.github/workflows/ci.yml` menjalankan, selain lint/typecheck/test/build:

| Penjaga | Yang dijaga |
|---|---|
| `lint:ratchet` | nol error; warning tak boleh bertambah |
| `audit-gerbang-tenancy.mjs` | rute tanpa saringan tenant tak boleh bertambah |
| `audit-kegagalan-senyap.mjs` | query yang errornya tak pernah dilihat |
| `audit-tulis-tanpa-periksa.mjs` | update/delete/insert tanpa cek hasil |
| `audit-catch-senyap.mjs` | error ditelan tanpa jejak |
| `audit-klaim-status-atomik.mjs` | approval/pembayaran ganda — status lama wajib ikut di WHERE |
| `audit-kredensial-tak-bocor.mjs` | nilai kredensial tak pernah keluar server (ambang NOL) |
| `audit-jadwal-punya-pembaca.mjs` | kolom jadwal wajib punya pembaca — L-4 (ambang NOL) |
| `audit-tugas-punya-rute.mjs` | tugas terjadwal wajib menunjuk rute yang TERDAFTAR (ambang NOL) |
| `audit-rute-penjadwal-punya-tugas.mjs` | arah sebaliknya — rute otomasi wajib punya tugas pemicu; rute tanpa tugas tak pernah bisa dijalankan siapa pun, dan diamnya bukan galat (ambang NOL) |
| `audit-baca-tak-terpotong.mjs` | baca tabel penuh tak boleh terpotong senyap di 1.000 baris PostgREST (ambang NOL, peringatan di 800) |
| `audit-saluran-keluar-berpagar.mjs` | modul ber-`fetch` wajib berpagar `NODE_ENV==='test'` — test tak boleh mengirim WA/tagihan sungguhan (ambang NOL) |
| `audit-alur-tercatat.mjs` | webhook n8n wajib lewat `jalankanAlur()` — eksekusi tak boleh luput dari `otomasi_jalan` (ambang NOL) |
| `audit-inbox-jalur-nyata.mjs` | `jalurUi` inbox approval wajib menunjuk halaman yang ada (ambang NOL) |
| `audit-konfirmasi-wa-tak-longgar.mjs` | "ya" dari WhatsApp dicocokkan UTUH, bukan `includes()`; jendela < umur token; token disaring per-user (ambang NOL) |
| `audit-jenis-tulis-punya-label.mjs` | tiap jenis tulis & persetujuan wajib punya label UI — kunci mentah muncul di layar keputusan uang (ambang NOL) |
| `audit-katalog-tool-tak-membengkak.mjs` | skema tool asisten dikirim ULANG tiap ronde; katalog yang membengkak menaikkan tagihan tiap tenant tanpa gejala (ratchet) |

**Uang lewat percakapan — dijaga test, bukan penjaga skrip.** `payments` adalah
satu-satunya entitas tulis yang **tak punya kolom `status`**, jadi tak ada
approval yang bisa menahan angka salah dengar. Yang menahannya:
`cash_account_id` **dipaku NULL** di `lib/tulis-klaim.ts` — trigger
`fn_update_cash_balance_on_payment` hanya bergerak bila kolom itu terisi.
Dijaga `src/lib/__tests__/tulis-pembayaran.test.ts` (termasuk muatan yang
sengaja menyelundupkan kolomnya) dan oleh penjaga trigger-uang di
`src/routes/v1/__tests__/ai-tulis.test.ts`. **Jangan "melengkapi" kolom itu
supaya saldo otomatis ter-update** — itu membuat satu kalimat WhatsApp yang
salah dengar memindahkan uang.
| `audit-kredensial-lintas-tenant.mjs` | kunci tenant lain hanya lewat warisan induk berpagar; jatuhan `.env` hanya grup AI (ambang NOL) |
| `audit-keanggotaan-punya-default.mjs` | pengguna aktif wajib punya keanggotaan default — tanpa itu RLS menyaring habis (ambang NOL) |
| `audit-izin-benar-ada.mjs` | kunci `requirePermission` wajib ada di tabel `permissions` — kunci hantu menolak SEMUA orang tanpa gejala (ambang NOL) |
| `audit-jenis-notifikasi-punya-aturan.mjs` | kunci `resolveRecipients` wajib punya aturan, dan aturan wajib punya penerima — keduanya membuat notifikasi hilang tanpa jejak (ambang NOL) |
| `audit-halaman-pakai-cache.mjs` | halaman yang mengambil data wajib lewat `useData()` — lapis cache dibangun 2026-08-04 lalu tak dipakai satu halaman pun (ratchet) |
| `uji-galat-muat-terpisah.mjs` | galat MUAT dan galat AKSI tak boleh berbagi satu state — gagal simpan menghapus pesan gagal muat, ditemukan di 11 halaman (ambang NOL) |
| `uji-rute-id-tak-basi.mjs` | halaman rute `[id]` ber-`useData` wajib mencocokkan identitas — tanpanya /x/A→/x/B menampilkan data A di bawah URL B (ambang NOL) |
| `audit-notifikasi-tak-kembar.mjs` | dedup notifikasi harian wajib menahan — kembar HARI INI (ambang NOL) |
| `audit-izin-tanpa-konteks.mjs` | fungsi izin tak boleh kosong saat `auth_company_id()` NULL (ambang NOL) |
| `audit-peristiwa-punya-alur.mjs` | tiap peristiwa yang diterbitkan wajib punya alur n8n penerima (ambang NOL) |
| `uji-token-css-ada.mjs` | `var(--token)` yang dipakai wajib ada di globals.css (ambang NOL) |
| `uji-judul-halaman-ada.mjs` | tiap halaman dashboard wajib punya `<h1>` (ambang NOL) |
| `uji-tabel-seragam.mjs` | sel tabel memakai token padding, bukan angka dipaku (ratchet) |
| `uji-remah-lengkap.mjs` | tiap modul wajib punya nama di breadcrumb (ambang NOL) |
| `audit-approval-satu-pintu.mjs` | keputusan persetujuan hanya lewat `utils/approval.ts` |
| `audit-inbox-lengkap.mjs` | tiap jenis approval wajib muncul di inbox terpusat (ambang NOL) |
| `audit-jejak-tak-hilang.mjs` | audit ber-`recordId` bukan-UUID tak boleh gagal senyap (ambang NOL) |
| `audit-migrasi-skema-dipaku.mjs` | skema tak boleh dipaku |
| `audit-rancangan-submenu.mjs` | sub-menu berisiko wajib punya rancangan |
| `audit-triase-submenu.mjs` | sub-menu **belum** digarap wajib punya urutan (INTI/PEMBEDA/TUNDA) |
| `gen-indeks-docs.mjs --check` | indeks docs wajib mutakhir |

Semuanya ratchet: angka hari ini adalah lantai. Melemahkannya butuh ratifikasi.

## 7. Menjalankan

```bash
cd apps/api && npx tsx src/index.ts    # API  — port dari apps/api/.env
cd apps/web && pnpm dev                # Web  :3000

# ⚠ PORT API BUKAN ANGKA TETAP — UKUR, jangan percaya tabel di atas.
#
# Yang menentukan ke mana WEB mengirim permintaan adalah SATU baris ini:
grep NEXT_PUBLIC_API_URL apps/web/.env.local
#
# Pada 2026-08-10 nilainya 3007, sementara apps/api/.env berisi PORT=3001 —
# dan dokumen ini menulis 3001 di dua tempat. Akibatnya empat jam habis
# mengejar gejala "Not Found" di obrolan asisten: API di 3001 sehat dan
# rutenya ada, tapi web bicara ke instance LAIN di 3007 yang menjalankan
# kode lama.
#
# TERULANG 2026-08-16 dengan nilai yang sama persis. Sekarang DIJAGA:
#
#   cd apps/api && node scripts/audit-port-api-cocok.mjs
#
# Penjaga itu menolak dua keadaan: port yang berbeda, DAN `PORT` yang tak
# ditulis eksplisit di .env (nilainya lalu datang dari bawaan kode — tempat
# yang tak dilihat siapa pun saat membandingkan dua berkas env).
#
# ⚠ Dan satu peringatan tentang ALAT UKURNYA. `grep -E "^PORT" apps/api/.env`
# pernah memulangkan NOL pada berkas yang jelas-jelas memuat barisnya —
# karena .env itu berakhiran CR SAJA, sehingga grep melihatnya sebagai satu
# baris raksasa dan jangkar `^` tak pernah cocok. Nol hasil bukan bukti
# ketiadaan. Pakai penjaganya, bukan grep.
#
# Tiap lapisan menjawab benar untuk dirinya sendiri, jadi tak ada satu pun
# galat yang menunjuk penyebabnya. Sebelum menyimpulkan "route tak
# terdaftar", pastikan dulu Anda memeriksa API yang BENAR-BENAR dipakai:
netstat -ano | grep ':300[0-9].*LISTENING'
cd apps/api && npx vitest run          # test (integration, butuh DB)

# ── n8n & Evolution: MILIK PURALOKA, bukan milik TJS ──────────────────
#
# Di mesin ini ada DUA proyek yang memakai keduanya, dan instance-nya
# TERPISAH. Diukur 2026-08-10:
#
#   :5678  n8n         → TJS      (sudah ada akun pemilik)
#   :8080  Evolution   → TJS      (clientName `evolution_tjs`)
#   :5680  n8n         → PURALOKA (scripts\jalankan-n8n.cmd)
#   :8081  Evolution   → PURALOKA (scripts\jalankan-evolution.cmd)
#
# JANGAN mengarahkan Puraloka ke :5678 atau :8080. Pesan masuk untuk
# Puraloka akan dikirim ke webhook TJS, dan riwayat chat dua perusahaan
# bercampur di satu database — tanpa satu pun galat.
#
# Jebakan yang sudah memakan waktu: n8n memakai port KEDUA untuk "Task
# Broker" internal. Menyetel N8N_PORT=5679 gagal karena instance TJS
# memegang 5679 sebagai broker-nya, dan pesannya tak menyebut bahwa yang
# bentrok adalah port internal. Puraloka memakai 5680 (UI) + 5681 (broker).
scripts\jalankan-n8n.cmd              # n8n Puraloka  :5680
scripts\siapkan-evolution.cmd         # sekali, menyiapkan folder + .env
scripts\jalankan-evolution.cmd        # Evolution Puraloka :8081
```

Env: `apps/api/.env`, `apps/web/.env.local` (contoh: `.env.example` masing-masing).
**Jebakan:** berkas `.env` di repo ini diawali BOM dan nilainya dibungkus tanda
kutip. Parser env buatan sendiri harus melucuti keduanya — atau cukup pakai
`scripts/db/_koneksi.mjs` yang sudah menanganinya.

## 8. Kejujuran (CHARTER §7 — tidak bisa ditawar)

- Dilarang mengklaim test hijau tanpa menempelkan ringkasan run sungguhan.
- "Kolom DB sudah ada" **bukan** selesai. Config-first berarti ada halaman
  pengaturannya di UI.
- Ragu antara dua kesimpulan? **Ukur**, jangan pilih yang lebih nyaman.
- Salah? Tulis "saya salah" di `JOURNAL.md`, perbaiki, lanjut.

## 8a. Cara kerja yang diminta founder (berlaku di SETIAP sesi)

> Ditetapkan 2026-08-06. Ini bukan saran — ini cara kerja default di repo ini.
> Tak perlu diminta ulang tiap prompt.

### 8a.1 Autopilot — kerjakan terus, jangan tanya untuk hal biasa

Ambil keputusan teknis biasa sendiri. Jangan berhenti menanyakan "lanjut?",
"boleh saya kerjakan?", atau melapor progres di tengah jalan. Pecah pekerjaan
jadi **todo yang banyak dan spesifik**, lalu habiskan.

**Berhenti HANYA untuk lima hal ini:**

1. **Ada sesi/agent lain menulis di checkout yang sama.** Tanda-tandanya:
   berkas hilang dari disk padahal `git status` bersih, commit muncul yang
   bukan buatan Anda, `docs/` atau `.superpowers/` lenyap. **Terjadi 3×
   pada 2026-08-06.** Jangan "jangan berhenti" sampai menimpa kerja orang.
2. Akan **menghapus/menimpa kerja yang belum di-commit**.
3. **Migrasi destruktif** (DROP, truncate, backfill tak bisa mundur).
4. Butuh **keputusan founder** → `RATIFIKASI.md`, bukan ditebak sendiri.
5. **Gerbang Keras** CHARTER (G-2 buku migrasi, G-5 pelemahan penjaga).

Di luar lima itu: jalan terus.

### 8a.2 Tiap sektor WAJIB ditest dan diaudit

Selesai ≠ kode jalan. Selesai = **ada buktinya**:

- test yang benar-benar dijalankan, ringkasannya ditempel (CHARTER §7);
- penjaga arsitektural terkait dijalankan, exit code-nya ditempel;
- penjaga baru **wajib dibuktikan bisa merah** lewat mutasi sengaja —
  suntik pelanggaran → MERAH → pulihkan → HIJAU. Penjaga yang tak pernah
  merah adalah hiasan.

### 8a.3 UI/UX — pedoman WAJIB dibaca sebelum menulis kode visual

Untuk pekerjaan apa pun yang menyentuh tampilan (komponen, halaman,
warna, tipografi, layout, animasi), **baca lebih dulu**:

| Berkas | Isi |
|---|---|
| `docs/design/ARAH-VISUAL-2026.md` | **arah visual resmi** — patuhi, jangan karang sendiri |
| `docs/superpowers/specs/2026-08-06-sumbu-ui-roadmap-design.md` | spec sumbu UI |
| `docs/superpowers/plans/2026-08-06-sumbu-ui-roadmap.md` | rencana + status penjaga |

Skill yang dipakai: `frontend-design`, `ui-ux-pro-max`, `design-system`,
`ui-animation`, `a11y-audit` (WCAG 2.1 AA — **bukan opsional**, banyak
pengguna berperangkat lama/literasi digital rendah).

**Audit a11y runtime — MANUAL, tak dijalankan CI** (butuh sesi ber-login):

```bash
# Dari root repo. Web harus hidup lebih dulu; ukur portnya (§7).
LAYAR_EMAIL=… LAYAR_SANDI=… LAYAR_BASIS=http://localhost:3000 \
  node apps/web/scripts/jalankan-a11y-lengkap.mjs
```

Pakai **`jalankan-a11y-lengkap.mjs`**, bukan `audit-a11y-runtime.mjs`
langsung. Yang kedua butuh empat env id contoh untuk rute `[id]`, dan tanpa
itu ia MELEWATI tujuh rute — termasuk `/proyek/[id]`, halaman terkaya di
aplikasi ini — sambil tetap melaporkan "0 pelanggaran".

Mekanisme env-nya ada sejak 2026-08-07 dan tak pernah terpakai sekali pun:
tak ada yang tahu id apa yang harus diisi. Pembungkusnya mengambil sendiri
dari basis. **Angka "0 pelanggaran" tanpa menyebut berapa rute dinamis yang
terlewat bukan bukti apa-apa.**

Diukur 2026-08-16 (akun admin, id dinamis terisi otomatis oleh pembungkus):
**137 halaman, 0 pelanggaran** — naik dari 133 (2026-08-13) dan 129
sebelumnya. Baris "rute dinamis TERLEWAT" tetap hilang.

Kredensial akun ujinya sudah tersimpan di `apps/web/.env.local`
(`LAYAR_EMAIL`/`LAYAR_SANDI`/`LAYAR_BASIS`) — berkas itu ter-gitignore, jadi
sandi tak pernah masuk git. Tak perlu menanyakannya lagi ke founder.

⚠ **Tiga rute tetap tak teraudit** karena butuh peran lain, bukan karena
skripnya: `/portal/proyek/[id]` (klien), `/pm-portal/proyek/[id]` (PM),
`/verify/invoice/[id]` — ketiganya dialihkan ke `/dashboard` saat dibuka
akun admin. Menutupnya butuh satu akun uji per peran; itu keputusan data
uji, bukan perubahan kode.

**Nilai sendiri hasilnya.** Kalau tampilannya kurang bagus menurut Anda,
**revisi** — jangan serahkan hasil yang Anda sendiri tak puas. Tapi
penilaian selera tak boleh melanggar `ARAH-VISUAL-2026.md`.

⚠️ Judul `2026-08-06-sumbu-ui-roadmap.md` menyebut "Sumbu UI/UX" tetapi
isinya **penjaga CI status-dokumen**, bukan rombak visual. Jangan tertukar.

#### Batas wilayah dua skill desain (ditetapkan 2026-08-08)

| Wilayah | Skill | Kenapa |
|---|---|---|
| `app/(dashboard)/`, `mandor-portal/`, `login/` — **ERP** | `impeccable`, mode **Operate** | scanability & konsistensi di atas ekspresi; data-dense |
| compro + halaman jual SaaS (**belum dibangun**) | `design-taste-frontend` + `impeccable` mode **Persuade** | halaman persuasi, bukan alat kerja |

`design-taste-frontend` menyatakan sendiri wilayahnya: *"Not dashboards, not
data tables, not multi-step product UI."* **Jangan memakainya untuk modul ERP** —
baseline dial-nya `DESIGN_VARIANCE: 8` (10 = "artsy chaos"), arah yang salah
untuk pengguna berliterasi digital rendah.

Di wilayah compro, `ARAH-VISUAL-2026.md` hanya mengikat pada **navy `#003366`**
(identitas merek, §2) dan pasangan font. Sisanya bebas.

#### Skill boleh mengusulkan lebih baik dari brief — lewat gambar, bukan diam-diam

Brief bisa punya kekurangan, dan skill desain memang dipasang supaya hasilnya
lebih baik. Tapi **usul yang bertentangan dengan keputusan founder yang sudah
turun** (`ARAH-VISUAL-2026.md` §10) **dibangun sebagai perbandingan visual
berdampingan, bukan diterapkan.** Founder memutuskan dari gambar.

Polanya sudah ada dan terbukti: `apps/web/scripts/banding-aksen.mjs` —
4 tangkapan (2 kandidat × 2 mode). Itulah yang **membunuh usul indigo** (§10d):
di atas kertas argumennya rapi, begitu dirender ia tidak menyatu.

**Wajib dijawab sebelum mengusulkan warna/token apa pun:** *token ini
mengendalikan berapa persen permukaan yang terlihat?* Usul indigo gagal justru
karena lahir dari membaca daftar token, bukan dari mengukur jangkauannya —
`--aksen` ternyata hanya menyentuh 4 tempat.

Brief menang atas **penerapan**, tidak atas **usulan**.

⚠️ `impeccable` menulis `PRODUCT.md`/`DESIGN.md` dan punya hook yang auto-jalan
sesudah edit berkas UI. **Hook sengaja TIDAK diaktifkan.** Jangan menyalakannya
(`$impeccable hooks on`) tanpa ratifikasi — CI repo ini sudah punya 9 penjaga
visual, dan `DESIGN.md` versi skill **tidak menggantikan** `ARAH-VISUAL-2026.md`.

### 8a.4 Dokumen tak boleh tertinggal dari kode

Sesudah menyelesaikan sesuatu, **perbarui dokumennya di commit yang sama**:
`QUEUE.yaml` · `ERP-KONTRAKTOR-TAKSONOMI-MENU.md` · `F5-1-TRIASE-SUBMENU.md`
· `JOURNAL.md` · `docs/INDEKS-DOKUMEN.md`.

Ini cacat paling sering di repo ini: **tujuh sub-menu** pernah ditandai 🔴
padahal UI-nya sudah hidup berbulan-bulan (`F5-1` §3a dan §3b). Penjaga
`audit-taksonomi-vs-kode.mjs` sekarang merahkan CI kalau terulang —
jangan matikan, perbaiki statusnya.

Sebelum menyatakan sesuatu "belum dikerjakan", **ukur dulu ke kode**.

### 8a.5 Data & schema — boleh diubah, dengan syarat

Seluruh isi basis saat ini **data dummy**, jadi:

- Boleh **menambah kolom** yang seharusnya ada — lewat migrasi maju
  bernomor, idempoten, dengan blok verifikasi di akhir (pola migrasi 142).
  Bukan mengedit migrasi lama (§5.5).
- Boleh **membuat data dummy** untuk menguji jalur nyata.
- Tetap tunduk §5.4: nominal `numeric`, waktu `timestamptz`.
- **Menghapus/mengubah data yang sudah ada tetap butuh konfirmasi** —
  "dummy" bukan izin untuk merusak.

### 8a.6 Selalu rujuk `docs/`

Sebelum memutuskan sesuatu, cek apakah `docs/` sudah menjawabnya.
Indeksnya: `docs/INDEKS-DOKUMEN.md`.

---

## 9. Dokumen rujukan

| Kebutuhan | Berkas |
|---|---|
| **Cara kerja default (autopilot, UI/UX, docs)** | **§8a dokumen ini** |
| Arah visual 2026 | `docs/design/ARAH-VISUAL-2026.md` |
| Kewenangan, fase, gerbang | `docs/execution/CHARTER.md` |
| Antrean kerja | `docs/execution/QUEUE.yaml` |
| Menunggu founder | `docs/execution/RATIFIKASI.md` |
| Buku migrasi vs kenyataan | `docs/execution/LEDGER-DIFF.md` |
| Koreksi angka audit | `docs/audit/2026-08-02/KOREKSI.md` |
| Prioritas ERP + registry AKTIF/STALE | `docs/PETA-PRIORITAS-ERP.md` |
| Status per-menu terverifikasi kode | `docs/ERP-KONTRAKTOR-TAKSONOMI-MENU.md` |
| Urutan kerja sub-menu (INTI/PEMBEDA/TUNDA) | `docs/execution/F5-1-TRIASE-SUBMENU.md` |
| Endpoint | `docs/API_ENDPOINTS.md` (bukan dokumen ini) |
| Skema DB | ukur sendiri: `node scripts/db/introspect.mjs columns` |
| Strategi multi-tenant | `docs/superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/adr/ADR-011-multi-tenant-strategy.md` |
| Scope ERP + AI | `docs/KEPUTUSAN-SCOPE-ERP-AI.md` |
