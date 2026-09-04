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

⚠ **`information_schema` WAJIB disaring `table_schema = 'public'`.**

Basis ini punya skema `test` yang membayangi **9 tabel** `public` bernama
sama (`progress_payments`, `projects`, `kasbons`, `roles`, `permissions`,
`clients`, `mandor_assignments`, `daily_wage_logs`, `borongan_settlements`),
plus `extensions` membayangi 5 lagi (`audit_logs`, `cash_transfers`,
`cost_codes`, `materials`, `role_permissions`).

Tanpa saringan itu, query kolom memulangkan **tiap kolom DUA KALI** — dan
`approval-satu-pintu.test.ts` merah 2026-08-18 dengan
`['approved_by','approved_by',…]`, kegagalan yang terbaca seperti KOLOM
HILANG padahal kolomnya ada.

Yang lebih halus: `rows[0]` tanpa saringan bisa jatuh ke baris skema `test`
dan menjawab BENAR secara kebetulan. Ukur skemanya:

```sql
SELECT table_name, string_agg(DISTINCT table_schema, ', ') skema
  FROM information_schema.columns
 WHERE table_schema NOT IN ('pg_catalog','information_schema')
 GROUP BY table_name HAVING count(DISTINCT table_schema) > 1;
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

**Cakupan uji struktur** — pondasi sampai atap. Jangan menjawab dari ingatan;
angkanya berubah tiap jenis ditambahkan, dan laporannya mengurutkan yang belum
ada berdasarkan PEMAKAIAN NYATA di RAB, bukan kerumitan teorinya:

```bash
cd apps/api && node -r dotenv/config scripts/lapor-cakupan-struktur.mjs
```

Diukur 2026-08-19: **34 dari 34 (100%)** — pondasi sampai atap, beton dan baja.
Angka itu akan basi begitu ada elemen ke-35 yang layak ditambahkan; jalankan
skripnya, jangan percaya angka ini.

**Cakupan GAMBAR KERJA — dan JANGAN percaya laporannya.**

```bash
# Perkiraan cepat, TAK butuh API hidup. Membaca BENTUK kode.
cd apps/api && node scripts/lapor-cakupan-gambar.mjs

# YANG BERWENANG — membuat elemen tiap jenis lewat rute sungguhan,
# meminta gambarnya, lalu MEMBUKA SVG-nya. Butuh API hidup + akun.
cd apps/api && UJI_EMAIL=… UJI_SANDI=… UJI_BASIS=http://127.0.0.1:3017 \
  node scripts/uji-gambar-semua-jenis.mjs
```

⚠ Yang pertama salah **EMPAT KALI dalam satu sesi** (2026-08-19), tiap kali
karena cabang baru ditulis dengan bentuk yang belum dikenali pembacaan teksnya,
dan tiap kali angkanya terlihat masuk akal: 7/32 saat 17/32 · 26/32 saat 29/32 ·
31/32 saat 32/32 · dan yang terburuk **32/32 saat sesungguhnya 30/32**.

Yang terakhir melapor SUDAH LENGKAP saat dua jenis masih kosong — laporan yang
salah ke arah "sudah selesai" menghentikan pekerjaan yang belum selesai.

**Dan sesudah 32/32 pun, MEMOTRET LAYAR masih menemukan tiga cacat** yang tak
satu pun dari 1.028 test tangkap: `Infinity%` di batang kekuatan, judul gambar
berupa kunci mentah, dan dua baris angka keamanan yang saling menimpa.

```bash
# Dari akar repo. Web + API harus hidup; ukur portnya (§7).
node apps/web/scripts/potret-struktur.mjs   # → apps/web/.layar/*.png
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

⚠ **Tabel di bawah TIDAK lengkap, dan tak dimaksudkan lengkap.** Diukur
2026-08-31: `ci.yml` menjalankan **206** penjaga; tabel ini memuat **49**.
Yang 151 lainnya bukan penjaga kelas dua — sebagian besar penjaga visual dan
invarian domain yang lahir belakangan dan tak pernah didaftarkan.

Kalimat lama di sini berbunyi "`ci.yml` menjalankan, selain
lint/typecheck/test/build:" dan terbaca sebagai daftar lengkap. Yang membaca
lalu menyimpulkan sesuatu tak dijaga padahal dijaga — bentuk yang sama
dengan racun konteks di pembuka dokumen ini.

**Ukur, jangan hitung dari tabel:**

```bash
# Semua penjaga yang benar-benar dijalankan CI, dengan hasilnya
cd apps/api && node scripts/jalankan-semua-penjaga.mjs
```

Diukur 2026-08-31: **203 hijau · 3 MERAH · 0 tak ketemu** — ketiga merah
butuh lingkungan CI (`CI_DIRECT_URL`, fingerprint, coverage-shards), bukan
cacat kode.

⚠ Pelari itu sendiri pernah melewatkan dua penjaga nyata karena mencari di
tiga akar dan `apps/web-publik` bukan salah satunya. Ia melapor "199 hijau"
atas 197, dan "tak ketemu" muncul sebagai catatan kaki — tempat yang paling
mudah dilewati mata. **Baris "tak ketemu" wajib NOL**; kalau tidak, angka
hijaunya tak berarti apa-apa.

Yang ditabelkan di bawah adalah penjaga yang **alasannya perlu diketahui
sebelum menyentuh kode terkait** — bukan sekadar daftar isi.

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
| `audit-jadwal-company-hidup.mjs` | jadwal aktif wajib milik company yang masih hidup — company uji dinonaktifkan tetapi jadwalnya tertinggal, lalu gagal 403 tiap denyut. Bahayanya bukan denyut terbuang: 122 dari 329 tugas berstatus `gagal` membuat papan pemantauan menyesatkan, dan kegagalan WAJAR yang berulang mengajari orang mengabaikan kolom status — kegagalan sungguhan nanti ikut terabaikan (ambang NOL) |
| `audit-baca-tak-terpotong.mjs` | baca tabel penuh tak boleh terpotong senyap di 1.000 baris PostgREST (ambang NOL, peringatan di 800) |
| `audit-saluran-keluar-berpagar.mjs` | modul ber-`fetch` wajib berpagar `NODE_ENV==='test'` — test tak boleh mengirim WA/tagihan sungguhan (ambang NOL) |
| `audit-alur-tercatat.mjs` | webhook n8n wajib lewat `jalankanAlur()` — eksekusi tak boleh luput dari `otomasi_jalan` (ambang NOL) |
| `audit-inbox-jalur-nyata.mjs` | `jalurUi` inbox approval wajib menunjuk halaman yang ada (ambang NOL) |
| `audit-konfirmasi-wa-tak-longgar.mjs` | "ya" dari WhatsApp dicocokkan UTUH, bukan `includes()`; jendela < umur token; token disaring per-user (ambang NOL) |
| `audit-jenis-tulis-punya-label.mjs` | tiap jenis tulis & persetujuan wajib punya label UI — kunci mentah muncul di layar keputusan uang (ambang NOL) |
| `audit-katalog-tool-tak-membengkak.mjs` | skema tool asisten dikirim ULANG tiap ronde; katalog yang membengkak menaikkan tagihan tiap tenant tanpa gejala (ratchet) |
| `audit-harga-satuan-waras.mjs` | harga bahan wajib masuk akal untuk SATUANNYA — harga per m³ yang tersalin ke baris kg membuat 1 m³ beton terhitung Rp 626 juta, menyebar ke 32 AHSP, tanpa satu pun galat (ambang NOL) |
| `audit-sektor-takeoff-cocok.mjs` | daftar sektor take-off di kode wajib sama dengan CHECK di basis, dan tiap sektor wajib punya satuan + cabang perhitungan (ambang NOL) |
| `audit-klaim-layar-nyata.mjs` | catatan peta-menu yang menjanjikan LAYAR wajib punya jejaknya di kode — `crm-boq` mengklaim tab "Take-off Volume" SELESAI atas layar yang tak pernah dibangun (ratchet, lantai 0) |
| `audit-baris-besi-dibedakan.mjs` | baris `besi` memuat tulangan DAN profil baja; pembacanya wajib membedakan — tanpa itu WF 200×100 tampil sebagai "Ulir D200", besi yang tak ada di pasar (ambang NOL) |
| `audit-jenis-volume-terdaftar.mjs` | jenis tanpa volume wajib terdaftar — yang tak terdaftar dituduh "cacat modul" padahal benar, dan yang salah terdaftar volumenya HILANG senyap dari rekap proyek (ambang NOL) |
| `audit-medan-jumlah-tak-bentrok.mjs` | rute menimpakan `{ ...input, jumlah }` sebagai BANYAKNYA ELEMEN; modul yang memakai nama itu untuk mencacah baut/angkur/paku kehilangan angka penggunanya — rute memberi 117% terpakai sementara fungsinya sendiri memberi 29%, tanpa satu pun galat (ambang NOL) |
| `audit-gambar-punya-judul.mjs` | tiap kunci gambar yang ditulis rute wajib punya judul di halaman detail; halaman memakai `JUDUL_GAMBAR[nama] ?? nama`, jadi kunci tak terdaftar MUNCUL APA ADANYA sebagai kepala gambar — kata teknis mentah di layar orang yang justru tak paham istilah teknis (ambang NOL) |
| `audit-takeoff-kembar-sepakat.mjs` | rumus take-off ditulis DUA kali (modul API + kalkulator di layar, sengaja — kalkulator yang memanggil API tiap ketukan tombol tak dipakai orang); dijaga daftar sektor, ambang kemiringan, dan satuannya. Dua implementasi yang menyimpang tak mengeluarkan galat: layar memperlihatkan satu angka, RAB memakai yang tersimpan (ambang NOL) |
| `audit-batas-tak-basi.mjs` | catatan "BELUM diperiksa" tak boleh menyebut yang SUDAH ADA — catatan itu TAMPIL DI LAYAR, dan pembacanya menyimpulkan pemeriksaannya tak ada lalu mencari konsultan lain untuk hal yang sudah dihitung. Dua catatan terbukti basi 2026-08-20 (ambang NOL) |
| `audit-batas-terpetakan.mjs` | tiap catatan batas wajib SUDAH DITIMBANG terhadap daftar klaim — penjaga di atasnya bekerja dari daftar tulisan tangan, jadi ia hanya menjaga yang didaftarkan. Dua catatan basi berjam-jam tanpa terdeteksi 2026-08-20. Penjaga yang tak bisa tahu dirinya tertinggal akan pelan-pelan berhenti menjaga tanpa gejala (ambang NOL) |
| `audit-token-mobile-terenkripsi.mjs` | token mobile wajib lewat `expo-secure-store`, bukan AsyncStorage — file SQLite biasa di Android yang ikut backup tak terenkripsi; `refresh_token` memperpanjang dirinya sendiri, jadi sekali terbaca berarti akses tanpa kedaluwarsa (ambang NOL) |
| `audit-a11y-mobile.mjs` | tiap `Pressable`/`TouchableOpacity` wajib punya `accessibilityRole` atau `accessibilityLabel` — axe-core tak jalan di React Native, jadi 137 halaman web yang nol pelanggaran tak menjaga mobile sama sekali. Diukur 2026-08-31: 25 dari 43 telanjang, termasuk "Keluar" dan "Kembali". Pembaca layar menyebutnya teks biasa (ambang NOL) |
| `audit-penjaga-tercatat-jalan.mjs` | penjaga yang TERCATAT di tabel ini wajib benar-benar dijalankan `ci.yml` — dokumen yang menjanjikan perlindungan tak ada membuat pembacanya berhenti memeriksa hal yang tak dijaga siapa pun, tanpa gejala. Arah sebaliknya (jalan tapi tak tertabel) sengaja TIDAK dijaga: 206 jalan vs 49 tertabel, dan tabel 206 baris tak seorang pun baca (ambang NOL) |
| `audit-kontras-mobile.mjs` | warna teks mobile wajib >= 4.5:1 (WCAG AA) — DIHITUNG, bukan ditaksir. `#9CA3AF` terlihat wajar tapi 2.54:1, dan dipakai 15 tempat plus label tab yang hadir di SETIAP layar. Berlatar gelap dinilai terhadap navy, bukan dilewati (ambang NOL) |
| `audit-versi-expo-cocok.mjs` | versi paket mobile wajib cocok Expo SDK — diukur 2026-08-31 saat `expo export` pertama kali dijalankan: bundling GAGAL, 11 paket tak cocok, aplikasi TAK PERNAH bisa jadi APK. `tsc` hijau selama itu karena typecheck tak menjalankan Metro. Mayor+minor wajib sama, patch boleh lebih tinggi (ambang NOL) |
| `audit-modul-mobile-nyata.mjs` | tiap modul WebView mobile wajib menunjuk halaman web yang ADA — jalur tanpa `page.tsx` membuka 404 di dalam bingkai aplikasi, tanpa tombol kembali. Peta di `web/[modul].tsx`, halaman di `apps/web/app/(dashboard)/`: dua tempat, tak ada yang menghubungkan. Pada jalan pertamanya menemukan `/sdm` sudah buntu sejak dibuat (ambang NOL) |
| `audit-antrean-punya-rute.mjs` | tiap kiriman antrean mobile wajib menunjuk rute API yang ADA — mandor mengisi laporan, layar berkata "tersimpan" (benar: tersimpan di HP), server menjawab 404, antrean menahannya, dan tak seorang pun tahu. Lahir dari temuan foto progres yang TAK PERNAH sampai (multipart vs JSON, `project_photos` nol dalam 30 hari). Yang dijaga JALURNYA, bukan bentuk muatannya (ambang NOL) |
| `audit-auth-mobile-utuh.mjs` | kontrak login mobile wajib utuh di KEDUA sisi — diukur 2026-09-01 aplikasi mobile TAK PERNAH bisa login: token hanya dikirim lewat cookie HttpOnly, mobile menyimpan `undefined`, setiap permintaan 401, dan layar login menuduh kredensial. Ikut menjaga token diberikan HANYA bagi klien ber-`X-Client` — memberikannya ke semua membuang perlindungan XSS (ambang NOL) |
| `audit-hook-eas-utuh.mjs` | rantai hook build EAS wajib utuh — SEMBILAN build APK gagal karena celah dua versi pnpm (server 9.15.5, lokal 11.8.0): `overrides` di `pnpm-workspace.yaml` adalah fitur pnpm 10+, dan pnpm 9 tak membacanya lalu menolak dengan galat yang menuduh lockfile. Menghapus satu mata rantai tak menggagalkan tsc maupun test; yang gagal cuma build di server 20 menit kemudian (ambang NOL) |

**Alur take-off → RAB — MANUAL, butuh API hidup:**

```bash
cd apps/api && UJI_EMAIL=… UJI_SANDI=… UJI_BASIS=http://127.0.0.1:3017 \n  node scripts/uji-takeoff-ke-rab-hidup.mjs
```

Membuktikan baris take-off TERSIMPAN, BISA DIBACA KEMBALI, volumenya sama
dengan yang dihitung kalkulator, dan `terapkan` menyalinnya ke kuantitas item
RAB. Diukur 2026-08-20: metode volume 12 m³ dan dinding 24 m² keduanya
tembus sampai kuantitas RAB.

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
| `audit-tabel-force-berpagar.mjs` | memeriksa TIGA arah: tabel FORCE ber-`company_id` wajib berpagar RESTRICTIVE · tabel FORCE wajib punya PERMISSIVE (yang tanpa itu tak terbaca SIAPA PUN — himpunan permissive kosong bernilai FALSE) · tabel kategori C wajib berpagar meski tak punya kolom `company_id`. Policy PERMISSIVE digabung **OR**, jadi satu policy yang hanya memeriksa izin MEMBATALKAN penyaringan saudaranya — `document_number_series` pernah membocorkan seluruh isinya ke admin tenant lain tanpa satu pun galat. Ukur: `node apps/api/scripts/audit-tabel-force-berpagar.mjs` (ambang NOL) |
| `audit-jenis-notifikasi-punya-aturan.mjs` | kunci `resolveRecipients` wajib punya aturan, dan aturan wajib punya penerima — keduanya membuat notifikasi hilang tanpa jejak (ambang NOL) |
| `audit-halaman-pakai-cache.mjs` | halaman yang mengambil data wajib lewat `useData()` — lapis cache dibangun 2026-08-04 lalu tak dipakai satu halaman pun (ratchet) |
| `uji-galat-muat-terpisah.mjs` | galat MUAT dan galat AKSI tak boleh berbagi satu state — gagal simpan menghapus pesan gagal muat, ditemukan di 11 halaman (ambang NOL) |
| `uji-rute-id-tak-basi.mjs` | halaman rute `[id]` ber-`useData` wajib mencocokkan identitas — tanpanya /x/A→/x/B menampilkan data A di bawah URL B (ambang NOL) |
| `audit-alih-auth-tak-berputar.mjs` | alih keluar saat sesi habis wajib menunggu logout, menghapus `puraloka_role`, menahan alih-berulang, dan tak mengalihkan bila sudah di `/login`. Token akses kedaluwarsa ~1 jam sementara cookie-nya 7 hari, dan `middleware.ts` hanya memeriksa cookie ADA atau tidak — jadi `/login` dilempar balik ke home selama cookie belum terhapus. Diukur 2026-09-04: 64 navigasi dalam 12 detik, `/dashboard` memuat ulang dirinya ~3x per detik. Sah di tiap lapisan; yang salah cuma urutan dua operasi async, dan akibatnya baru muncul sejam sesudah login di browser pengguna (ambang NOL) |
| `audit-hapus-cookie-cocok-pasang.mjs` | tiap `clearCookie` wajib memakai atribut yang SAMA dengan `setCookie`-nya. Peramban mencocokkan cookie yang dihapus lewat atributnya; `Secure` yang hilang membuatnya menganggap itu cookie LAIN — penghapusan tak mengenai sasaran, balasan tetap 200, nol galat di klien maupun server. Sisi SERVER dari putaran muat-ulang 2026-09-04, dan yang sebenarnya memutusnya: perbaikan klien saja menyisakan 80 navigasi/12 detik. Dinilai PER-PANGGILAN — `auth.ts` punya dua jalur (`/auth/logout` dan `/auth/refresh` yang gagal), dan menambal satu saja membuat penjaga hijau atas yang lain (ambang NOL) |
| `audit-url-dokumen-tak-dipaku.mjs` | URL verifikasi di dokumen wajib dari `lib/url-dokumen` (baca `window.location.origin`), bukan domain dipaku; footer PDF dan isi QR wajib dari helper yang SAMA; `/verify` wajib publik DAN dikecualikan dari alih-saat-login. Footer invoice pernah mencetak `puraloka.app` yang tak pernah ada, dan QR-nya menunjuk ke sana juga — tautan bukti keaslian yang mati pada dokumen tagihan membuat penerimanya curiga dokumennya palsu (ambang NOL) |
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

# ⚠ JANGAN MENJALANKAN DUA SUITE BERSAMAAN. Diukur 2026-08-19 — dua run
# suite penuh yang tumpang tindih, KODE YANG SAMA PERSIS:
#
#     run 1   5853 lulus /  95 gagal / 32 berkas
#     run 2   5837 lulus / 111 gagal / 34 berkas
#
# Selisih 16 kegagalan. Sebabnya bukan misteri: test di repo ini memakai
# Postgres SUNGGUHAN, satu basis, dan banyak fixture memilih barisnya lewat
# `LIMIT 1`. Dua run yang menyisip & membersihkan baris bersamaan saling
# menggeser fixture — cacat `LIMIT tanpa ORDER BY` yang sama, tapi
# penyebabnya operator, bukan kodenya.
#
# `fileParallelism: false` di vitest.config.ts TIDAK menolong: ia
# menyerialkan berkas DI DALAM satu run, dan tak bisa berbuat apa pun
# terhadap run kedua di proses lain.
#
# Angka apa pun dari run yang tumpang tindih TIDAK SAH. Membandingkan
# terhadap commit lama? Jalankan BERURUTAN — bukan paralel di dua worktree.
#
# Dan satu jebakan alat ukurnya: keluaran vitest yang diarahkan ke berkas
# DI-BUFFER sampai proses selesai. Berkas nol byte BUKAN bukti run-nya mati;
# saya menyimpulkan begitu lalu menjalankan ulang — dan justru itu yang
# membuat keduanya tumpang tindih.

# ⚠ JANGAN MENYARING KELUARAN TYPECHECK. Sesi 2026-08-18 menjalankan
#
#     npx tsc --noEmit 2>&1 | grep -v ai-sifat
#
# dan melaporkan "tsc bersih" BELASAN KALI. Yang disaring galat sungguhan:
# `@anthropic-ai/sdk` hilang dari disk (entri pnpm store KOSONG sejak
# 2026-08-08), yang membuat 6 berkas test mati dan 99 test tak pernah
# berjalan. Filter itu diwarisi dari perintah sebelumnya dan tak pernah
# diperiksa isinya.
#
# Kalau `tsc` mengeluh, PERBAIKI atau LAPORKAN — jangan disaring.
# Filter yang tak diperiksa isinya adalah kebohongan kepada diri sendiri.

# ⚠ MENJALANKAN PENJAGA: jangan pilih dari ingatan. CI menjalankan 167;
# sesi yang memilih 10-15 "yang saya kira relevan" melewatkan dua cacat
# yang penjaganya SUDAH ADA dan berjalan di CI (2026-08-18: sort_order
# bentrok + anak di luar rentang, keduanya dari migrasi sesi itu sendiri).
cd apps/api && node scripts/jalankan-semua-penjaga.mjs   # SEMUA penjaga CI

# ⚠ PEMANTAU YANG TAK PERNAH MEMBACA APA PUN. Diukur 2026-09-01 — loop
# pemantau build EAS berjalan enam menit dan mencetak `?` tiap tiga puluh
# detik. Yang salah bukan build-nya, melainkan perintah pengukurnya:
#
#     npx eas-cli build:view <id> --json --non-interactive
#     → Nonexistent flag: --non-interactive
#
# `--json` dan `--non-interactive` sah untuk `eas build`, TIDAK untuk
# `build:view`. Galatnya dibuang ke /dev/null oleh loop itu sendiri, jadi
# yang terlihat cuma nilai jatuhan `?` — yang terbaca seperti "status
# belum diketahui", bukan seperti "perintahnya gagal".
#
# Bentuk yang sama dengan jebakan CR di §7a: NOL HASIL BUKAN BUKTI
# KETIADAAN. Sebuah pemantau yang tak bisa membedakan "belum selesai"
# dari "saya tak bisa mengukur" akan diam persis selama yang dipantaunya
# gagal.
#
# Aturannya: sebelum meninggalkan loop berjalan, JALANKAN perintahnya
# SEKALI di depan mata dan lihat keluarannya. Nilai jatuhan hanya boleh
# dipasang sesudah bentuk keluaran yang benar terbukti.
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


### 7a. Mobile — `tsc` hijau BUKAN berarti bisa dibangun

```bash
# Yang membuktikan aplikasi benar-benar bisa jadi APK.
cd apps/mobile && MSYS_NO_PATHCONV=1 \
  npx expo export --platform android --output-dir .uji-bundle
```

Diukur 2026-08-31, pertama kalinya perintah itu dijalankan di repo ini:
**GAGAL.** Sebelas paket tak cocok dengan Expo 53 — React 18 (butuh 19),
React Native 0.76 (butuh 0.79), expo-router 4 (butuh 5, beda MAYOR). Aplikasi
mobile tak pernah bisa dibangun, dan itu bertahan lama karena `tsc` hijau,
16 layar typecheck bersih, seluruh penjaga mobile hijau — **tak satu pun
menjalankan Metro.**

Sesudah `npx expo install --fix`: bundle berhasil, 3,05 MB.

⚠ **Pasang paket mobile dengan `npx expo install`, bukan `pnpm add`.**
`react-native-webview` dipasang dengan `pnpm add` dan mendapat 14.0.1
sementara Expo 53 menuntut 13.13.5. `pnpm add` memilih yang terbaru; `expo
install` memilih yang cocok. Bedanya tak terlihat sampai Metro berjalan.
Dijaga `audit-versi-expo-cocok.mjs`.

⚠ **`--output-dir` DIRUSAK Git Bash** dengan cara yang sama seperti `--url`
di skrip a11y: MSYS mengubah path absolut jadi path Windows, dan
`$TMPDIR/bundle` berakhir sebagai `C:\Program Files\Git\bundle`. Pakai
`MSYS_NO_PATHCONV=1` dan path relatif.

⚠ **`git show <ref>:<berkas>` DIRUSAK Git Bash — dan diamnya menipu.**

Keluarga yang sama dengan `--url` dan `--output-dir` di atas, tetapi
gejalanya lebih halus. MSYS mengubah `:` jadi `;` DAN `/` jadi `\`:

```
git show origin/main:.github/workflows/ci.yml
→ fatal: Not a valid object name origin\main;.github\workflows\ci.yml
```

Yang berbahaya: galat itu ke **stderr**, jadi `git show … > berkas.yml`
menghasilkan berkas **KOSONG** dengan exit code yang mudah terabaikan.
Alat berikutnya lalu menjawab sesuatu yang terdengar seperti temuan —
js-yaml membalas *"expected a document, but the input is empty"* — dan
itu terbaca sebagai **"berkasnya rusak"**, bukan **"perintahnya gagal"**.

Diukur 2026-09-01: saya sempat menyimpulkan `origin/main` sudah sah
padahal ia masih memuat `ci.yml` yang rusak. Kesimpulan yang menenangkan,
dari perintah yang tak pernah berjalan.

```bash
MSYS_NO_PATHCONV=1 git show "origin/main:.github/workflows/ci.yml"
```

Aturannya sama seperti jebakan CR dan pemantau EAS: **nol keluaran bukan
bukti ketiadaan.** Periksa exit code, atau bandingkan `wc -l` dengan
harapan yang masuk akal.

⚠ **pnpm v11 MENGABAIKAN `.npmrc` — diam-diam.** Setelan seperti
`public-hoist-pattern` harus di `pnpm-workspace.yaml` (tempat `allowBuilds`,
`verifyDepsBeforeRun`, dan `overrides` sudah berada). Ditulis di `.npmrc`,
`pnpm config get` memulangkan `undefined` dan `pnpm install` menjawab
"Already up to date" **tanpa satu pun galat** — lalu Anda menyimpulkan
setelannya sudah berlaku dan mengejar sebab yang salah.

⚠ **Setelan yang menuntut penghapusan `node_modules` — ukur dulu apakah
masalahnya masih ada.** Saya hampir memaksa `publicHoistPattern` (yang
memicu `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`, penghapusan seluruh
workspace) untuk sebuah galat `Cannot find module '@babel/traverse'` yang
**sudah hilang** begitu `expo install --fix` selesai. Yang menahannya cuma
pnpm menolak jalan tanpa TTY. Ukur lebih dulu:

```bash
node -e "const {createRequire}=require('node:module');
  console.log(createRequire('<paket>/package.json').resolve('<dependensi>'))"
```

⚠ **CR menipu perbandingan baris — LIMA KALI dalam satu hari (2026-09-01).**

Tiap kali bentuknya identik: perbandingan PERSIS terhadap baris yang
diam-diam membawa CR, dan hasilnya selalu **nol** — yang terbaca seperti
*"tidak ada"*, bukan seperti *"tidak terdeteksi"*.

```
grep -c $'\r'             menghitung BARIS, bukan CR
git show … | grep         pipe Git Bash menambah CR sendiri
d.count(b'\r\n')          menghitung CRLF saat yang ada CR TELANJANG
findIndex(l === 'x:')     tak cocok dengan 'x:\r'
b === '---'               sama
```

Yang paling mahal: hook build melapor *"0 pemisah `---`"* sementara pnpm
menolak dengan *"found more"* — keduanya benar, dan build gagal tiga kali
sebelum kontradiksi itu terbaca.

**Aturannya:** sebelum membandingkan baris dari berkas apa pun di repo ini,
buang CR lebih dulu.

```js
const baris = isi.split('\n').map((b) => b.replace(/\r/g, ''))
```

Dan untuk menghitung CR yang berwenang — tanpa pipe, tanpa asumsi bentuk:

```bash
tr -cd '\r' < <berkas> | wc -c
```

⚠ **Uji dengan alat yang sama seperti yang dipakai KORBANNYA.**

Build APK gagal SEBELAS kali, dan tujuh di antaranya karena saya menguji
dengan pnpm 11 sementara server EAS memakai **pnpm 9.15.5** — terbaca di log
build, fase `SPIN_UP_BUILDER`. Tiap kali saya menyimpulkan "seharusnya
jalan".

```bash
# reproduksi dengan versi server, tanpa menunggu antrean 20 menit
npx --yes pnpm@9.15.5 install --frozen-lockfile --lockfile-only
```

Keluarga yang sama sepanjang hari itu: `curl` 200 tapi browser 500 (CORS) ·
`tsc` hijau tapi Metro gagal · `netstat` LISTENING tapi prosesnya mati.
**Tiap lapisan menjawab benar untuk dirinya sendiri.**
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

#### Tiga perintah yang DILARANG saat sesi lain hidup di checkout yang sama

Ditambahkan 2026-08-18 sesudah ketiganya benar-benar terjadi dalam satu sore.
Ketiganya **tak mengeluarkan satu pun galat** — kerusakannya baru terlihat
dari gejala yang menunjuk ke tempat lain.

| Perintah | Yang terjadi |
|---|---|
| `git stash -u` | menyapu berkas belum-ter-commit sesi lain (`struktur.ts`, migrasi 458/459). `pop` menyelamatkannya, tapi menyisakan entri stash dan mengubah akhir baris jadi CRLF. |
| `pnpm install` / `--filter` | mengosongkan `node_modules` workspace lain di tengah jalan. `tsc`/`vitest` sesi itu mati dengan "Cannot find package" — galat yang menuduh KODE. |
| menulis `JOURNAL.md` | dua sesi menulis dengan konvensi berbeda; yang belakangan menimpa struktur yang pertama. |
| `git add .` / `git add -A` | menyapu berkas yang sesi lain sedang stage. Terjadi 2026-08-31: commit `5f3c9eda` — berjudul "sembilan keluhan CI…" — ikut menelan upgrade Expo milik sesi lain (11 paket, React 18→19, lock 2.247 baris) dan menyembunyikannya di balik pesan tentang seed proyek. **Yang membuatnya sulit dilihat: `git status` si penyapu BERSIH sesudah commit** — nol gejala dari sisinya, dan yang kehilangan baru tahu saat mencari kerjanya sendiri. **Selalu sebut BERKAS-nya:** `git add -- path/ke/berkas`. |

**Yang benar:** pindah ke worktree sendiri. Repo ini sudah punya jalurnya —
`.claude/worktrees/` dan `.worktrees/` berisi beberapa, dan `git worktree list`
memperlihatkan siapa di mana.

⚠ **MEMBERSIHKAN worktree ber-junction: hapus JUNCTION-nya, jangan
direktorinya.** Diukur 2026-08-19 — perintah ini menghancurkan
`node_modules` SUNGGUHAN milik repo:

```bash
rmdir /S /Q E:\tmp\<worktree>          # ❌ MENEMBUS junction, menghapus TARGETNYA
```

Akibatnya: `node_modules` root tersisa 2 entri, `apps/api/node_modules`
KOSONG, dan satu entri `.pnpm` (vitest) tinggal cangkang tanpa isi. Gejalanya
`ERR_MODULE_NOT_FOUND` pada `vitest/dist/worker.js` — galat yang menuduh
VITEST, bukan perintah yang menyebabkannya.

Lebih buruk lagi: `pnpm install` menjawab **"Already up to date"** dan tak
memperbaiki apa pun, karena `node_modules/.pnpm-workspace-state-v1.json`
selamat. Yang benar:

```bash
cmd //c "rmdir E:\tmp\<worktree>\node_modules"          # ✅ junction SAJA, tanpa /S
cmd //c "rmdir E:\tmp\<worktree>\apps\api\node_modules"
cmd //c "dir /AL E:\tmp\<worktree>"                     # buktikan nol JUNCTION tersisa
cmd //c "rmdir /S /Q E:\tmp\<worktree>"                 # baru direktorinya

# Kalau terlanjur: buang state pnpm + entri store yang jadi cangkang.
rm -f node_modules/.pnpm-workspace-state-v1.json node_modules/.modules.yaml
rm -rf "node_modules/.pnpm/<paket-yang-rusak>"          # pnpm menyebut namanya di ENOENT
pnpm install
```

Ini kerusakan yang sama bentuknya dengan `@anthropic-ai/sdk` hilang pada
2026-08-08: **entri `.pnpm` yang ada tapi kosong**, dan pnpm menganggapnya
terpasang.

⚠ Untuk MEMBANDINGKAN dengan commit lama (mis. mencari "penjaga ini sudah
merah sebelum saya?"), pakai worktree terpisah — **jangan `git stash`**. Dan
`node_modules` pnpm di Windows butuh **junction**, bukan symlink:

```bash
git worktree add --detach /e/tmp/base <commit>
cmd //c "mklink /J E:\\tmp\\base\\node_modules E:\\Project\\puraloka-suite\\node_modules"
cmd //c "mklink /J E:\\tmp\\base\\apps\\api\\node_modules E:\\Project\\puraloka-suite\\apps\\api\\node_modules"
cp apps/api/.env /e/tmp/base/apps/api/.env
# selesai: rmdir junction-nya DULU, baru `git worktree remove`
```

### 8a.2 Tiap sektor WAJIB ditest dan diaudit

Selesai ≠ kode jalan. Selesai = **ada buktinya**:

- test yang benar-benar dijalankan, ringkasannya ditempel (CHARTER §7);
- penjaga arsitektural terkait dijalankan, exit code-nya ditempel;
- penjaga baru **wajib dibuktikan bisa merah** lewat mutasi sengaja —
  suntik pelanggaran → MERAH → pulihkan → HIJAU. Penjaga yang tak pernah
  merah adalah hiasan.

**Dua hal yang membuat uji mutasi berbohong** — keduanya menggigit dua sesi
berbeda pada 2026-09-01, dan hijaunya terlihat sama persis dengan hijau yang
sah:

1. **Pastikan mutasinya MENGENAI hal yang dijaga.** Dua sasaran mutasi
   dipilih salah (`ai-asisten-pemilik`, `hse-apd` — keduanya ternyata punya
   `href`, jadi memang di luar cakupan penjaga), hasilnya HIJAU, dan sempat
   terbaca sebagai "penjaganya bocor". Sesi lain kena bentuk yang sama:
   assertion mencari substring di seluruh SVG sementara angkanya ada di
   `aria-label` yang dirakit terpisah — test hijau atas angka yang tak
   seorang pun lihat.

2. **Periksa DUA hal per mutasi: penjaga MERAH _dan_ menyebut namanya.**
   Merah tanpa menyebut entri yang bermasalah memaksa orang berikutnya
   mencari sendiri — di kasus peta-menu itu 204 entri. Biayanya dibayar
   orang lain, bukan penulis penjaganya.

**Dan satu kelas cacat yang lebih halus dari penjaga yang tak pernah merah:**
penjelasan yang BENAR mendampingi keadaan yang SALAH. Empat bentuknya
ditemukan dalam satu sesi:

- komentar yang menyebut hal terlarang untuk menjelaskan kenapa ia TIDAK
  dipakai — penjaga memindai teks, jadi tetap terhitung sebagai pemakaian;
- `continue` yang melompati pengecualian yang alasannya tertulis panjang
  persis di bawahnya (37 grup, nol yang pernah lolos sejak ditulis);
- peringatan "jangan menyaring lewat nama" ditulis di komentar, sementara
  kodenya tetap menyaring lewat nama — dan dua entri lolos karenanya;
- selisih angka antar-pengukuran dijelaskan dengan tebakan yang nyaman
  ("mungkin potretnya lama") alih-alih diukur. Ternyata penyaringnya yang
  salah, dan selisih itu menunjuk cacat nyata.

Yang terakhir punya aturannya sendiri: **selisih yang tak bisa dijelaskan
adalah temuan yang belum dibuka.** Menutupnya dengan cerita lebih mahal
daripada membiarkannya terbuka.

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

⚠ **`--url /apa/pun` DIRUSAK Git Bash.** MSYS mengubah argumen yang diawali
`/` menjadi path Windows, jadi `--url "/estimasi/struktur"` sampai ke skrip
sebagai `C:/Program Files/Git/estimasi/struktur`. Halamannya lalu "dialihkan
ke /dashboard" — gejala yang terbaca persis seperti login gagal atau izin
kurang, dan tak menyebut argumen sama sekali.

```bash
MSYS_NO_PATHCONV=1 LAYAR_EMAIL=… LAYAR_SANDI=… \
  node apps/web/scripts/audit-a11y-runtime.mjs --url "/estimasi/struktur"
```

Diukur 2026-08-19 (halaman Analisa Struktur, sesudah 32 jenis bergambar):
**0 pelanggaran di mode terang DAN gelap.** Laporannya sekarang menyebut
tujuan pengalihan (`/x → /dashboard`); tanpa itu, sebabnya tak bisa
didiagnosis — yang dilaporkan tanpa tujuannya hanya bisa ditebak.

Mekanisme env-nya ada sejak 2026-08-07 dan tak pernah terpakai sekali pun:
tak ada yang tahu id apa yang harus diisi. Pembungkusnya mengambil sendiri
dari basis. **Angka "0 pelanggaran" tanpa menyebut berapa rute dinamis yang
terlewat bukan bukti apa-apa.**

Diukur 2026-08-16 (akun admin, id dinamis terisi otomatis oleh pembungkus):
**137 halaman, 0 pelanggaran** — naik dari 133 (2026-08-13) dan 129
sebelumnya. Baris "rute dinamis TERLEWAT" tetap hilang.

⚠ **Angka 137 halaman itu TIDAK berlaku untuk aplikasi mobile.** axe-core
bekerja pada DOM; React Native tak punya DOM, jadi tak satu pun dari angka
di atas mengatakan apa pun tentang aplikasi HP.

Diukur 2026-08-31, saat mobile pertama kali diperiksa: **25 dari 43** elemen
`Pressable`/`TouchableOpacity` tak punya `accessibilityRole` maupun
`accessibilityLabel` — termasuk "Keluar" di dashboard dan "Kembali" di
seluruh layar isian. TalkBack/VoiceOver menyebutnya teks biasa; penggunanya
tahu ada tulisan di layar tapi tak diberi tahu itu bisa ditekan.

Sudah nol, dan dijaga:

```bash
cd apps/api && node scripts/audit-a11y-mobile.mjs   # ambang NOL
```

Yang dijaga penjaga itu **keputusan di kode**, bukan hasil render. Ia tak
tahu apa-apa soal kontras warna, urutan fokus, atau ukuran sasaran sentuh
yang sesungguhnya di perangkat. Jadi hijaunya BUKAN berarti "mobile sudah
teraudit a11y" — ia menjaga satu hal yang bisa dijaga tanpa emulator.

Yang belum terjaga dan sudah terukur: **18 tempat ber-`fontSize` di bawah
12px** pada teks bacaan (tiga di antaranya 9–10px). Tak diubah karena
mengubah ukuran huruf menggeser tata letak, dan itu perlu dilihat di layar
sungguhan — bukan disunting massal.

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
