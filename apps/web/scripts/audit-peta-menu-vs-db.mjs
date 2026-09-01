#!/usr/bin/env node
/**
 * DRIFT `peta-menu.ts` ↔ `menu_items` — dua sumber yang diam-diam berpisah.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Repo ini punya DUA sumber kebenaran untuk menu:
 *
 *   apps/web/lib/peta-menu.ts   dipakai halaman "segera hadir" `/m/<key>`
 *                               untuk menjelaskan status & rencana tiap menu
 *   tabel `menu_items`          dipakai SIDEBAR (lewat GET /api/v1/menu)
 *
 * `gen-migrasi-menu.mjs` membangkitkan migrasi dari yang pertama ke yang kedua,
 * dan header berkas itu sudah menuliskan risikonya secara harfiah:
 *
 *   "ia akan berbeda dari `peta-menu.ts` begitu salah satunya disunting, dan
 *    perbedaan itu tak akan berbunyi — sidebar memakai DB, halaman coming-soon
 *    memakai peta, jadi menu bisa muncul tanpa halaman atau sebaliknya."
 *
 * Risikonya diprediksi, generatornya ditulis, **penjaganya tidak**. Dan
 * ramalannya terbukti: pada 2026-08-07 ditemukan ~23 href berbeda, yang
 * melahirkan empat halaman lengkap tak bisa dicapai siapa pun (migrasi 220).
 *
 * ── Apa yang dibandingkan, dan apa yang sengaja TIDAK
 *
 *   href    dibandingkan — inilah yang menentukan ke mana orang mendarat
 *   label   dibandingkan — nama berbeda di dua tempat membingungkan
 *   keberadaan  dibandingkan — key di satu sisi tapi tidak di sisi lain
 *
 *   status/guna/catatan  TIDAK — itu hanya ada di peta-menu.ts, dan memang
 *                        tak punya kolom padanan di `menu_items`
 *   is_active            TIDAK — menu bisa dinonaktifkan lewat migrasi tanpa
 *                        menghapus entrinya dari peta (mis. `bi-eksekutif`
 *                        yang dipensiunkan migrasi 221 tapi tetap
 *                        terdokumentasi). Yang diperiksa hanya yang AKTIF.
 *
 * ── Ratchet, bukan nol-mutlak
 *
 * Selisih hari ini adalah LANTAI. Ia boleh turun, tak boleh naik. Menuntut nol
 * seketika akan membuat penjaga ini dimatikan pada hari pertama — dan penjaga
 * yang dimatikan tak menjaga apa pun.
 *
 * ── DB tak terhubung
 *
 * Berhenti dengan exit 0 dan MENGATAKANNYA. Penjaga yang diam-diam melewatkan
 * dirinya lebih berbahaya daripada penjaga yang absen: CI-nya tetap hijau.
 *
 * Pakai (dari akar repo): node apps/web/scripts/audit-peta-menu-vs-db.mjs
 *                         node apps/web/scripts/audit-peta-menu-vs-db.mjs --naikkan
 *
 * ── PERUBAHAN PERAN sesudah migrasi 232
 *
 * Sampai 232, `peta-menu.ts` dan `menu_items` seharusnya mencerminkan hal yang
 * SAMA — dan selisihnya adalah cacat. Sesudah 232 keduanya sengaja berbeda:
 *
 *   peta-menu.ts   203 modul — KATALOG seluruh rencana produk, sumber
 *                  halaman /peta-modul
 *   menu_items      88 entri — SIDEBAR, hanya halaman yang benar-benar ada
 *
 * Jadi "ada di DB tidak di TS" tak lagi berarti cacat: 88 entri sidebar memang
 * tak punya padanan katalog, karena katalog berbicara tentang MODUL sementara
 * sidebar berbicara tentang HALAMAN.
 *
 * Yang masih dijaga dan tetap penting: **href dan label yang berbeda** untuk
 * key yang sama. Kalau katalog menyebut "Kalender Kerja → /kalender" sementara
 * sidebar menunjuk /jadwal, salah satunya membohongi pembacanya.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const LANTAI = join(AKAR, 'apps', 'web', 'scripts', 'lantai-nav.json')

// ── Sisi TS ─────────────────────────────────────────────────────────────────
//
// Dibaca sebagai TEKS, bukan diimpor. `peta-menu.ts` memakai path alias `@/`
// dan direktif "use client"; mengimpornya dari skrip Node menuntut seluruh
// rantai bundler ikut hidup — biaya besar untuk membaca daftar literal.
const src = readFileSync(join(AKAR, 'apps', 'web', 'lib', 'peta-menu.ts'), 'utf8')

// Dibaca PER BARIS, satu entri satu baris — bukan dengan pola `{…}` yang
// melintasi kurung.
//
// Versi pertama memakai pola yang berhenti di `}` PERTAMA yang ditemuinya, jadi
// entri yang memuat `}` di dalam teks `guna:` atau `catatan:` terpotong,
// href-nya tak terbaca, lalu dilaporkan "ada di DB tapi tidak di peta-menu.ts".
// Dua puluh entri dituduh hilang padahal semuanya ada — dibuktikan dengan
// membuka `/m/<key>` di peramban: ketujuh yang paling mencurigakan menampilkan
// judul yang benar, bukan "Menu tidak dikenal".
//
// Laporan palsu lebih berbahaya daripada tidak melapor: ia melatih orang
// mengabaikan penjaga ini.
const petaTs = new Map()
for (const baris of src.split(/\r?\n/)) {
  const m = baris.match(/\{ key: '([a-z0-9-]+)', label: '(.*?)',/)
  if (!m) continue
  const href = baris.match(/href: '(.*?)'/)?.[1] ?? null
  petaTs.set(m[1], { href, label: m[2] })
}

// ── Sisi DB ─────────────────────────────────────────────────────────────────
let baris
try {
  const koneksi = await import(
    'file://' + join(AKAR, 'scripts', 'db', '_koneksi.mjs').replace(/\\/g, '/'))
  // Diperiksa SEBELUM buatClient(): ia `process.exit(2)` saat DSN tak ada,
  // dan `process.exit` TIDAK bisa ditangkap `try/catch` di sekelilingnya.
  // Diukur 2026-08-31: enam penjaga menulis penangkap yang tak pernah bekerja,
  // dan keenamnya mati exit 2 di job CI yang memang tak diberi kredensial.
  if (!koneksi.adaKoneksi('DIRECT_URL')) {
    console.log('  ⏭  DILEWATI (tak ada DIRECT_URL/DATABASE_URL) — bukan LULUS.')
    process.exit(0)
  }
  const db = koneksi.buatClient('DIRECT_URL')
  await db.connect()
  /*
    `punya_anak` ikut diambil — dipakai mengukur premis pelonggaran
    `hanyaDb` di bawah.

    Struktur, BUKAN nama: dua daun bernama `g-kas-bank` dan `g-piutang`
    tak punya anak sama sekali. Menyaring grup lewat awalan `g-` akan
    melewatkan keduanya diam-diam, dan diamnya terbaca seperti "tak ada".
  */
  const r = await db.query(
    `SELECT m.key, m.label, m.href,
            EXISTS (SELECT 1 FROM menu_items ch WHERE ch.parent_id = m.id) AS punya_anak
       FROM menu_items m WHERE m.is_active ORDER BY m.key`)
  await db.end()
  baris = r.rows
} catch (e) {
  console.log('⚠️  DB tak terhubung — pemeriksaan DILEWATI, bukan dinyatakan lulus.')
  console.log(`   ${e.message.slice(0, 100)}`)
  process.exit(0)
}

const petaDb = new Map(baris.map((r) => [r.key, { href: r.href, label: r.label, punyaAnak: r.punya_anak === true }]))

// ── Bandingkan ──────────────────────────────────────────────────────────────
const hrefBeda = []
const labelBeda = []
const hanyaDb = []

for (const [key, db] of petaDb) {
  // Kelompok induk (`g-*`) SENGAJA tanpa href di DB: ia tombol buka-tutup,
  // bukan tautan. `peta-menu.ts` memberinya href sebagai "wakil isi kelompok"
  // — dipakai halaman lain, bukan sidebar. Menghitungnya sebagai drift akan
  // memenuhi laporan dengan 20 baris yang tak satu pun perlu diperbaiki.
  //
  // ⚠ Pengecualian ini DINAIKKAN ke atas `hanyaDb` (2026-09-01).
  //
  // Sebelumnya ia berada SESUDAH `if (!ts) { hanyaDb.push(key); continue }`,
  // jadi tak pernah dievaluasi untuk grup yang belum ada di peta-menu.ts —
  // `continue` sudah lebih dulu melompatinya. Akibatnya 20+ grup induk
  // masuk daftar hutang meski pengecualiannya SUDAH ADA dan alasannya
  // sudah tertulis persis di atas.
  //
  // Diukur: seluruh `g-*` di basis ber-href NULL (0 dari 37 punya href),
  // jadi tak satu pun dari mereka pernah lolos pengecualian ini.
  //
  // ⚠ Disaring lewat STRUKTUR (`punyaAnak`), bukan nama — dan itu bukan
  // kehati-hatian teoretis.
  //
  // Versi sebelumnya memakai `key.startsWith('g-')` saja, dan uji mutasi
  // membuktikan DUA menu lolos: `g-kas-bank` dan `g-piutang`. Keduanya
  // bernama seperti grup tetapi TAK punya anak sama sekali — jadi mereka
  // daun, dan daun tanpa href yang hilang dari peta akan menampilkan
  // "Menu tidak dikenal" saat diklik.
  //
  // Yang menyelamatkan hanya karena keduanya kebetulan nonaktif hari ini.
  // Nama bukan struktur; menyaring dengan nama berarti bergantung pada
  // konvensi penamaan yang tak dijaga siapa pun.
  if (key.startsWith('g-') && db.href === null && db.punyaAnak) continue

  const ts = petaTs.get(key)

  /*
    ⚠ Menu yang PUNYA href sendiri tak butuh peta-menu.ts.

    `peta-menu.ts` hanya dibaca `/m/<key>` — jalur untuk menu yang BELUM
    punya halaman sendiri. Menu ber-href dibuka langsung oleh sidebar dan
    tak pernah melewati jalur itu.

    Diukur 2026-09-01: 380 dari 383 daun di basis punya href. Menghitung
    semuanya sebagai hutang membuat angka `hanyaDb` didominasi entri yang
    tak satu pun bisa menampilkan "Menu tidak dikenal" — dan hutang yang
    tak bisa dilunasi mengajari orang mengabaikan penjaganya.

    ⚠ Yang menentukan sahnya pelonggaran ini BUKAN angka 380/383,
    melainkan satu angka yang bisa berubah kapan saja:

        daun TANPA href DAN AKTIF = 0

    Selama nol, tak ada menu yang bisa diklik lalu menampilkan "Menu tidak
    dikenal", dan pelonggaran ini tak menyembunyikan apa pun. Begitu ada
    satu saja yang dihidupkan, penjaga ini WAJIB merahkannya — dan itu
    yang diuji mutasi arah ketiga (menghidupkan menu nonaktif tanpa href;
    terbukti MERAH, lalu dipulihkan).

    Tiga daun tanpa href saat ini — `yt-sdm-klaim`, `g-kas-bank`,
    `g-piutang` — semuanya NONAKTIF. Dua yang berawalan `g-` menyesatkan:
    namanya seperti grup, tetapi keduanya tak punya anak, jadi mereka daun
    dan TIDAK dilewati pengecualian `g-*` di atas. Menyaring berdasarkan
    nama alih-alih struktur akan melewatkan keduanya diam-diam.
  */
  if (!ts) {
    if (db.href !== null && db.href !== `/m/${key}`) continue
    hanyaDb.push(key)
    continue
  }
  // `/m/<key>` di DB berarti "belum punya halaman sendiri" — dan peta-menu.ts
  // menyatakan hal yang sama dengan TIDAK memberi href sama sekali. Keduanya
  // sepakat; bentuknya saja berbeda.
  // Query string dibuang: `?tab=besar` menentukan tab yang terbuka, bukan
  // halaman yang dituju. Membandingkannya akan melaporkan drift untuk menu
  // yang justru BARU SAJA diperbaiki supaya menunjuk tab yang tepat.
  // Dipangkas di KEDUA sisi. Memangkas satu sisi saja hanya memindahkan
  // selisihnya: `/akuntansi` (DB terpangkas) vs `/akuntansi?tab=besar` (TS
  // utuh) tetap terhitung berbeda, dan angkanya tak pernah turun.
  const potong = (h) => (h ? h.split('?')[0] : h)
  const hrefTanpaQuery = potong(db.href)
  const tsHref = potong(ts.href ?? null)
  const dbHref = hrefTanpaQuery === `/m/${key}` ? null : hrefTanpaQuery
  if ((tsHref ?? null) !== (dbHref ?? null)) {
    hrefBeda.push({ key, ts: ts.href ?? '(tanpa href)', db: db.href })
  }
  if (ts.label && db.label && ts.label !== db.label) {
    labelBeda.push({ key, ts: ts.label, db: db.label })
  }
}

// Key yang hanya ada di TS TIDAK dihitung pelanggaran: peta-menu.ts memang
// mendokumentasikan rencana yang belum masuk DB, dan itu sah.

console.log('\n══ Drift peta-menu.ts ↔ menu_items ═══════════════════════════')
console.log(`  entri di peta-menu.ts : ${petaTs.size}`)
console.log(`  entri aktif di DB     : ${petaDb.size}`)
console.log(`  href berbeda          : ${hrefBeda.length}`)
console.log(`  label berbeda         : ${labelBeda.length}`)
console.log(`  ada di DB, tidak di TS: ${hanyaDb.length}`)

/*
  ── PREMIS pelonggaran `hanyaDb`, DIUKUR tiap jalan ──────────────────────

  Menu ber-href dilewati dari `hanyaDb` karena ia tak pernah melewati
  `/m/<key>`. Itu sah HANYA selama tak ada menu AKTIF tanpa href yang
  hilang dari peta — begitu ada satu, ia bisa diklik dan menampilkan
  "Menu tidak dikenal".

  Premis yang cuma ditulis di komentar akan tetap terbaca benar lama
  sesudah ia berhenti benar. Diukur di sini supaya keruntuhannya terlihat
  di keluaran, bukan ditemukan orang lain di layar.

  ⚠ Disaring lewat STRUKTUR (`punyaAnak`), bukan nama. Dua daun bernama
  `g-kas-bank` dan `g-piutang` tak punya anak sama sekali; menyaring
  berdasarkan awalan `g-` akan melewatkan keduanya diam-diam.
*/
const tanpaHrefAktif = [...petaDb.entries()].filter(
  ([key, db]) => (db.href === null || db.href === `/m/${key}`) && !db.punyaAnak
)
console.log(`  menu AKTIF tanpa href : ${tanpaHrefAktif.length}  (premis pelonggaran hanyaDb)`)
if (tanpaHrefAktif.length > 0) {
  const hilang = tanpaHrefAktif.filter(([key]) => !petaTs.has(key)).map(([key]) => key)
  if (hilang.length > 0) {
    console.log(`     ⚠ ${hilang.length} di antaranya TAK ADA di peta-menu.ts: ${hilang.join(', ')}`)
    console.log('       Menu ini BISA diklik dan akan menampilkan "Menu tidak dikenal".')
  }
}

if (hrefBeda.length) {
  console.log('\n— href berbeda (sidebar memakai kolom DB):')
  for (const d of hrefBeda.slice(0, 30)) {
    console.log(`   ${d.key.padEnd(22)} TS: ${String(d.ts).padEnd(26)} DB: ${d.db}`)
  }
  if (hrefBeda.length > 30) console.log(`   … dan ${hrefBeda.length - 30} lagi`)
}
if (labelBeda.length) {
  console.log('\n— label berbeda:')
  for (const d of labelBeda.slice(0, 20)) {
    console.log(`   ${d.key.padEnd(22)} TS: ${String(d.ts).padEnd(30)} DB: ${d.db}`)
  }
}
if (hanyaDb.length) {
  console.log(`\n— ada di DB tapi tidak di peta-menu.ts: ${hanyaDb.slice(0, 20).join(', ')}`)
  console.log('   Halaman /m/<key> untuk key ini akan menampilkan "Menu tidak dikenal".')
}

// ── Ratchet ─────────────────────────────────────────────────────────────────
const kini = {
  hrefBeda: hrefBeda.length,
  labelBeda: labelBeda.length,
  hanyaDb: hanyaDb.length,
}

let lantai
try {
  lantai = JSON.parse(readFileSync(LANTAI, 'utf8'))
} catch {
  lantai = { _catatan: 'Lantai drift nav. Boleh turun, TIDAK boleh naik.', ...kini }
  writeFileSync(LANTAI, JSON.stringify(lantai, null, 2) + '\n')
  console.log('\nLantai dibuat pertama kali.')
  process.exit(0)
}

if (process.argv.includes('--naikkan')) {
  writeFileSync(LANTAI, JSON.stringify({ ...lantai, ...kini }, null, 2) + '\n')
  console.log(`\nLantai diperbarui: ${JSON.stringify(kini)}`)
  process.exit(0)
}

let merah = false
for (const k of Object.keys(kini)) {
  if (kini[k] > (lantai[k] ?? 0)) {
    console.error(`\nMERAH: ${k} naik ${lantai[k]} -> ${kini[k]}`)
    console.error('  Sunting peta-menu.ts DAN tulis migrasinya — jangan salah satu saja.')
    merah = true
  } else if (kini[k] < (lantai[k] ?? 0)) {
    console.log(`Turun: ${k} ${lantai[k]} -> ${kini[k]}. Kunci dengan --naikkan`)
  }
}
if (!merah) console.log('\n✅ Drift tidak bertambah.')
console.log()
process.exit(merah ? 1 : 0)
