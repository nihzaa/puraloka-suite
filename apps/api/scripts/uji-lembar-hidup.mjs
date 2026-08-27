#!/usr/bin/env node
// ============================================================================
// LEMBAR PERHITUNGAN PDF wajib terbit lewat rute HIDUP — dan isinya terbaca.
// ============================================================================
//
// ── Kenapa lewat rute, bukan memanggil `susunPdfLembar()` langsung
//
// Sesi yang membangun modul ini menemukan cacat `jumlah` bentrok PERSIS dari
// selisih dua jalur: panggilan langsung menjawab 29%, rute menjawab 117%.
// Rutenya menyebar `{ ...input, jumlah }` sehingga `jumlah` milik rute
// menimpa jumlah pengencang milik input. Tak satu pun unit test melihatnya,
// karena tak satu pun melewati rute.
//
// Penguji ini karena itu tidak memanggil modul sama sekali. Ia membuat elemen
// sungguhan, meminta PDF-nya lewat HTTP, lalu MEMBUKA berkasnya.
//
// ── Yang diperiksa, dan kenapa masing-masing
//
//   1. HTTP 200 + `Content-Type: application/pdf`
//   2. Magic `%PDF-` — Fastify dengan senang hati mengirim `[object Object]`
//      berstatus 200 kalau badannya bukan Buffer; status saja bukan bukti.
//   3. Teks di dalamnya bisa dibaca ULANG. Ini yang menangkap cacat paling
//      berbahaya di modul ini: rumus keluar sebagai sampah biner
//      (`<dÖâÒãr2rgrB!"ó"`) karena Helvetica/WinAnsi tak punya φ, ρ, ≤.
//      PDF-nya tetap 16 KB, tetap terbuka, tetap berstatus 200 — dan tetap
//      tak bisa dipakai insinyur mana pun.
//   4. Elemen yang dibuat MUNCUL di lembarnya. Lembar yang terbit tapi
//      kehilangan satu elemen lebih berbahaya daripada lembar yang gagal
//      terbit: yang menandatangani takkan tahu ada yang hilang.
//
// ── Pembersihan ada di `finally`
//
// Bukan gaya penulisan. Versi awal penguji sejenis di repo ini menaruh
// pembersihan di akhir badan skrip, dan `process.exit(1)` di tengah
// meninggalkan baris uji DI PROYEK SUNGGUHAN — dua kali.
//
// Pakai: UJI_EMAIL=… UJI_SANDI=… UJI_BASIS=http://127.0.0.1:3021 \
//          node scripts/uji-lembar-hidup.mjs
// ============================================================================

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import zlib from 'node:zlib'

const BASIS = process.env.UJI_BASIS ?? 'http://127.0.0.1:3021'
const EMAIL = process.env.UJI_EMAIL ?? process.env.LAYAR_EMAIL
const SANDI = process.env.UJI_SANDI ?? process.env.LAYAR_SANDI

if (!EMAIL || !SANDI) {
  console.error('\n❌ UJI_EMAIL/UJI_SANDI (atau LAYAR_EMAIL/LAYAR_SANDI) wajib diisi.\n')
  process.exit(1)
}

/*
  Contoh input dibaca dari halaman UI — alasan lengkapnya di
  `uji-gambar-semua-jenis.mjs`. Ringkasnya: daftar contoh yang disalin ke
  skrip uji akan menyimpang dari yang dilihat pengguna, dan penyimpangannya
  tak pernah ketahuan karena penguji tetap hijau.
*/
const HAL = join(
  process.cwd(), '..', 'web', 'app', '(dashboard)', 'estimasi', 'struktur', 'page.tsx',
)
const isiHal = readFileSync(HAL, 'utf8')
const iAwal = isiHal.indexOf('const CONTOH')
if (iAwal < 0) { console.error('❌ CONTOH tak ditemukan di halaman UI'); process.exit(1) }
const iKurung = isiHal.indexOf('{', iAwal)
let kedalaman = 0
let iAkhir = -1
for (let k = iKurung; k < isiHal.length; k++) {
  if (isiHal[k] === '{') kedalaman++
  else if (isiHal[k] === '}') { kedalaman--; if (kedalaman === 0) { iAkhir = k; break } }
}
if (iAkhir < 0) { console.error('❌ Badan CONTOH tak tertutup'); process.exit(1) }
const badanContoh = isiHal.slice(iKurung, iAkhir + 1)
const tanpaString = badanContoh.replace(/"[^"]*"|'[^']*'|`[^`]*`/g, '""')
const dirujuk = new Set(
  [...tanpaString.matchAll(/\b([A-Z][A-Z0-9_]{2,})\b/g)].map((m) => m[1]),
)
const konstanta = []
for (const nama of dirujuk) {
  const m = isiHal.match(new RegExp(`^const ${nama} = ([\\s\\S]*?);$`, 'm'))
  if (m) konstanta.push(`const ${nama} = ${m[1]};`)
}
let CONTOH
try {
  // eslint-disable-next-line no-new-func
  CONTOH = new Function(`${konstanta.join('\n')}\nreturn (${badanContoh})`)()
} catch (e) {
  console.error(`❌ Tak bisa mengurai CONTOH dari UI: ${e.message}`)
  process.exit(1)
}

/*
  Tiga jenis yang mewakili tiga BENTUK bagian yang berbeda di lembar:
  beton lentur (balok), pondasi ber-daya-dukung (footplat), dan dinding
  penahan yang punya pemeriksaan guling/geser. Kalau ketiganya terbaca,
  penyusun bagiannya bekerja untuk ragam yang berbeda-beda.
*/
const JENIS_UJI = ['balok', 'footplat', 'dinding_penahan']

const masuk = await fetch(`${BASIS}/api/v1/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: SANDI }),
}).catch((e) => ({ ok: false, status: 0, _err: e }))

if (!masuk.ok) {
  console.error(`\n❌ Gagal masuk (${masuk.status || 'tak terhubung'}) ke ${BASIS}.`)
  if (masuk._err) console.error(`   ${masuk._err.message}`)
  console.error('   UKUR portnya — CLAUDE.md §7.\n')
  process.exit(1)
}
const cookie = (masuk.headers.getSetCookie?.() ?? [])
  .map((c) => c.split(';')[0])
  .filter((c) => /^puraloka_(token|refresh)=/.test(c))
  .join('; ')
if (!cookie) { console.error('\n❌ Tak ada cookie `puraloka_token`.\n'); process.exit(1) }

const H = { 'content-type': 'application/json', cookie }
const JALAN = (process.hrtime.bigint() % 100000n).toString(36)

const dp = await fetch(`${BASIS}/api/v1/projects?limit=1`, { headers: H })
const jp = await dp.json()
const proyek = (jp.data ?? jp.projects ?? jp)[0]
if (!proyek?.id) { console.error('\n❌ Tak ada proyek untuk elemen uji.\n'); process.exit(1) }

console.log('══ LEMBAR PERHITUNGAN PDF lewat rute hidup ═════════════════')
console.log(`   ${BASIS} · proyek ${proyek.name ?? proyek.id}\n`)

const dibuat = []
const kodeSapu = []
let gagal = 0

try {
  // ── Buat elemen uji ───────────────────────────────────────────────────────
  const kodeUji = []
  for (const [idx, jenis] of JENIS_UJI.entries()) {
    const contoh = CONTOH[jenis]
    if (!contoh) { console.error(`❌ ${jenis}: tak punya CONTOH di UI`); gagal++; continue }
    const kode = `UJI-PDF-${idx + 1}-${JALAN}`
    kodeSapu.push(kode)   // sebelum POST: jawaban yang tak jelas pun tetap tersapu
    const buat = await fetch(`${BASIS}/api/v1/projects/${proyek.id}/struktur`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({
        kode, nama: `uji lembar ${jenis}`, jenis, jumlah: 1, input: contoh,
        catatan: 'uji-lembar-hidup.mjs — dihapus otomatis',
      }),
    })
    if (!buat.ok) {
      console.error(`❌ ${jenis}: BUAT gagal HTTP ${buat.status} — ${(await buat.text()).slice(0, 200)}`)
      gagal++
      continue
    }
    /*
      KODE dicatat SEBELUM id diurai — dan pembersihan bisa bekerja dari kode.

      Versi pertama hanya mencatat id, dan menguraikannya dengan `.data.id`
      sementara rute memulangkan `{ id }` di puncak. Akibatnya `dibuat`
      kosong, `finally` tak punya apa pun untuk dihapus, dan TIGA baris uji
      tertinggal di proyek sungguhan — persis kegagalan yang `finally` ini
      ditulis untuk mencegah.

      Pelajarannya: pembersihan tak boleh bergantung pada penguraian jawaban
      berhasil. Yang dicatat lebih dulu adalah hal yang sudah pasti kita tahu.
    */
    kodeUji.push(kode)
    const jb = await buat.json()
    const id = (jb.data ?? jb)?.id
    if (!id) { console.error(`❌ ${jenis}: balasan BUAT tak memuat id — ${JSON.stringify(jb).slice(0, 150)}`); gagal++; continue }
    dibuat.push(id)
    console.log(`  ✓  dibuat ${kode.padEnd(22)} ${jenis}`)
  }

  if (!dibuat.length) throw new Error('tak ada elemen uji yang berhasil dibuat')

  // ── Minta PDF-nya ─────────────────────────────────────────────────────────
  const r = await fetch(`${BASIS}/api/v1/projects/${proyek.id}/struktur/lembar.pdf`, {
    headers: { cookie },
  })
  console.log('')
  console.log(`  status      ${r.status}`)
  console.log(`  content-type ${r.headers.get('content-type')}`)
  console.log(`  disposition  ${r.headers.get('content-disposition')}`)

  if (!r.ok) {
    console.error(`❌ PDF gagal terbit — ${(await r.text()).slice(0, 400)}`)
    gagal++
    throw new Error('berhenti')
  }
  if (!/application\/pdf/.test(r.headers.get('content-type') ?? '')) {
    console.error('❌ Content-Type bukan application/pdf')
    gagal++
  }

  const buf = Buffer.from(await r.arrayBuffer())
  const magic = buf.subarray(0, 5).toString('latin1')
  console.log(`  ukuran       ${buf.length} bytes · magic "${magic}"`)
  if (magic !== '%PDF-') {
    console.error('❌ Badan bukan PDF — Fastify mengirim sesuatu yang lain berstatus 200')
    gagal++
    throw new Error('berhenti')
  }
  writeFileSync('E:/tmp/lembar-hidup.pdf', buf)

  // ── Baca ULANG teksnya ────────────────────────────────────────────────────
  const s = buf.toString('latin1')
  let mentah = ''
  for (const m of s.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    try { mentah += zlib.inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1') }
    catch { /* aliran font/gambar — bukan teks */ }
  }
  const baris = []
  for (const t of mentah.matchAll(/\[([^\]]*)\]\s*TJ/g)) {
    let isi = ''
    for (const h of t[1].matchAll(/<([0-9a-fA-F]+)>/g)) {
      isi += Buffer.from(h[1], 'hex').toString('latin1')
    }
    if (isi.trim()) baris.push(isi)
  }
  const teks = baris.join('\n')
  console.log(`  baris teks   ${baris.length}`)

  if (baris.length < 20) {
    console.error(`❌ Hanya ${baris.length} baris teks — lembar praktis kosong`)
    gagal++
  }

  // (4) tiap elemen uji HARUS muncul
  console.log('')
  /*
    Dicocokkan TANPA memandang besar-kecil huruf: judul bagian di lembar
    ditulis huruf besar (`UJI-PDF-1-21X4`) sementara kodenya bercampur
    (`…-21x4`). Versi pertama mencocokkan persis dan melaporkan KETIGA
    elemen "hilang diam-diam" dari lembar yang sebenarnya memuat ketiganya.
  */
  const teksBesar = teks.toUpperCase()
  for (const kode of kodeUji) {
    if (teksBesar.includes(kode.toUpperCase())) console.log(`  ✓  ${kode} muncul di lembar`)
    else { console.error(`❌ ${kode} TAK muncul di lembar — elemen hilang diam-diam`); gagal++ }
  }

  /*
    (3) rumus wajib UTUH.

    ── Kenapa "tak ada sampah biner" BUKAN ukuran yang benar

    Versi pertama menghitung rasio karakter di luar ASCII dan menyatakan
    lembar sehat bila rasionya rendah. Mutasi sengaja — mematikan alihaksara
    — LOLOS dari ukuran itu dengan mulus.

    Sebabnya: pdfkit tidak mencetak sampah untuk karakter yang tak ada di
    WinAnsi. Ia MEMBUANGNYA. Jadi `phiMn >= Mu` tidak menjadi karakter aneh,
    melainkan menjadi `Mn  Mu` — bersih, ber-ASCII penuh, dan SALAH ARTI.

    Yang hilang justru yang paling menentukan: `>=` versus `<=` adalah
    perbedaan antara "kapasitas melebihi beban" dan "beban melebihi
    kapasitas". Insinyur yang menandatangani membaca kalimat tanpa
    operatornya, dan tak ada yang memberitahunya.

    Karena itu yang diperiksa sekarang adalah KEHILANGAN, bukan kebisingan:

      a. jumlah rumus tak boleh menyusut — simbol yang dibuang membuat
         seluruh barisnya lenyap dari tapisan;
      b. tak boleh ada celah dua spasi di dalam rumus — bekas operator raib;
      c. penanda alihaksara (`phi`, `>=`) memang muncul. Nol = alihaksara mati.
  */
  const barisRumus = baris.filter((b) => /=/.test(b) && /[a-zA-Z]/.test(b))
  console.log('')
  console.log(`  baris ber-"=" ${barisRumus.length}`)

  if (barisRumus.length < 20) {
    console.error(`❌ Hanya ${barisRumus.length} baris rumus — lembar sehat memuat ~30.`)
    console.error('   Rumus yang menyusut = simbol dibuang, bukan disederhanakan.')
    gagal++
  }

  const berlubang = barisRumus.filter((b) => /S {2,}S/.test(b))
  if (berlubang.length) {
    console.error(`❌ ${berlubang.length} rumus berlubang — operator raib di tengah:`)
    for (const b of berlubang.slice(0, 5)) console.error(`     ${JSON.stringify(b.trim().slice(0, 66))}`)
    console.error('   pdfkit MEMBUANG karakter non-WinAnsi, bukan menampilkannya.')
    console.error('   Alihaksarakan di amanUntukPdf() sebelum dicetak.')
    gagal++
  }

  const teksRumus = barisRumus.join(String.fromCharCode(10))
  for (const [penanda, pola] of [['phi', /phi/g], ['>=', />=/g]]) {
    const n = (teksRumus.match(pola) ?? []).length
    if (n === 0) {
      console.error(`❌ Penanda alihaksara "${penanda}" nol kali — alihaksara mati.`)
      gagal++
    } else console.log(`  ✓  "${penanda}" muncul ${n}×`)
  }

  if (barisRumus.length) {
    console.log('  contoh rumus:')
    for (const b of barisRumus.slice(0, 4)) console.log(`     ${b.trim().slice(0, 66)}`)
  }
  /*
    (3b) KALIMAT BIASA juga wajib utuh — bukan hanya rumus.

    Pemeriksa di atas hanya melihat baris ber-"=". Satu cacat lolos lewat
    celah itu dan baru ketahuan dari MELIHAT lembarnya: em-dash dibuang,
    sehingga "SNI 2847:2019 — Persyaratan…" tercetak
    "SNI 2847:2019  Persyaratan…" dan "TIDAK AMAN — besinya…" kehilangan
    pemisahnya.

    Sebabnya sama dengan cacat rumus: pdfkit MEMBUANG karakter di luar
    WinAnsi, tak pernah mengeluh. Jadi ukurannya pun sama — celah dua spasi
    di tengah kalimat adalah bekas karakter yang raib.

    Baris yang memang berkolom (tabel, kop "Nomor      : …") dikecualikan:
    di sana dua spasi adalah tata letak, bukan kehilangan.
  */
  const barisProsa = baris.filter((b) => {
    const t = b.trim()
    if (t.length < 25) return false
    if (t.includes(':')) return false          // baris kop berkolom
    if (/^[A-Z0-9 .%\/-]+$/.test(t)) return false  // judul huruf besar
    return /[a-z]{3}/.test(t)
  })
  const prosaBerlubang = barisProsa.filter((b) => /[a-z] {2,}[A-Za-z]/.test(b))
  console.log(`  kalimat diperiksa ${barisProsa.length}`)
  if (prosaBerlubang.length) {
    console.error(`❌ ${prosaBerlubang.length} kalimat berlubang — karakter raib di tengah:`)
    for (const b of prosaBerlubang.slice(0, 5)) {
      console.error(`     ${JSON.stringify(b.trim().slice(0, 72))}`)
    }
    console.error('   Lazimnya em-dash/panah yang tak ada di WinAnsi.')
    console.error('   Tambahkan padanannya di ALIH_AKSARA, jangan biarkan dibuang.')
    gagal++
  } else {
    console.log('  ✓  tak ada kalimat yang kehilangan karakter')
  }
  // Kop & rujukan standar wajib ada — itu yang membuatnya "lembar", bukan cetakan layar
  for (const wajib of ['SNI', 'Halaman']) {
    if (teks.includes(wajib)) console.log(`  ✓  memuat "${wajib}"`)
    else { console.error(`❌ Lembar tak memuat "${wajib}"`); gagal++ }
  }
} catch (e) {
  if (e.message !== 'berhenti') { console.error(`❌ ${e.message}`); gagal++ }
} finally {
  /*
    DI DALAM `finally` — lihat catatan kepala. Kegagalan di tengah tak boleh
    meninggalkan baris uji di proyek sungguhan.
  */
  let sisa = 0
  for (const id of dibuat) {
    const d = await fetch(`${BASIS}/api/v1/struktur/${id}`, { method: 'DELETE', headers: { cookie } })
    if (!d.ok) { console.error(`⚠ elemen uji ${id} TAK terhapus (HTTP ${d.status})`); sisa++ }
  }

  /*
    JARING PENGAMAN: sapu berdasarkan KODE, bukan hanya id yang sempat terurai.
    Kalau penguraian jawaban gagal, baris tetap ada di basis — dan tanpa sapuan
    ini ia tertinggal di proyek sungguhan tanpa gejala apa pun.
  */
  const sisaRute = await fetch(`${BASIS}/api/v1/projects/${proyek.id}/struktur`, { headers: { cookie } })
  if (sisaRute.ok) {
    const daftar = (await sisaRute.json()).data ?? []
    const yatim = daftar.filter((x) => kodeSapu.some((k) => x.kode === k))
    for (const y of yatim) {
      const d = await fetch(`${BASIS}/api/v1/struktur/${y.id}`, { method: 'DELETE', headers: { cookie } })
      console.error(`⚠ baris yatim ${y.kode} disapu (${d.ok ? 'terhapus' : 'GAGAL'})`)
      if (!d.ok) sisa++
    }
  }

  console.log('')
  console.log(`  (${dibuat.length} elemen uji dibuat, ${dibuat.length - sisa} dihapus kembali)`)
  if (sisa) gagal++
}

if (gagal) { console.error(`\n❌ ${gagal} masalah pada lembar perhitungan\n`); process.exit(1) }
console.log('\n✅ Lembar perhitungan terbit dan terbaca lewat rute sungguhan\n')
