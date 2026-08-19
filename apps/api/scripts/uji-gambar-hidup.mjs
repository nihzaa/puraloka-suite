#!/usr/bin/env node
// ============================================================================
// Uji GAMBAR KERJA lewat rute sungguhan — dan ia MEMBUKA SVG-nya.
// ============================================================================
//
// Rute memulangkan gambar hanya bila diminta (`?gambar=1`), dan kegagalan
// menggambar SENGAJA tidak menggagalkan permintaan — hasil analisa tetap
// berguna tanpa SVG. Itu keputusan yang benar, dan justru karena itu gambar
// yang gagal DIAM: balasannya tetap 200, medan `…Gagal` terisi, dan tak ada
// yang melihatnya kecuali seseorang membuka balasannya.
//
// Penguji ini membukanya. Yang diperiksa bukan "ada medan gambar" melainkan:
//
//   1. ada elemen `<svg` yang sungguhan,
//   2. `viewBox`-nya berukuran positif — viewBox nol membuat gambar KOSONG
//      tanpa satu pun galat, dan berkas SVG-nya tetap terlihat wajar,
//   3. tak ada medan `…Gagal` yang terisi,
//   4. angka yang dijanjikan gambar itu BENAR-BENAR muncul di dalamnya
//      (tebal badan & sayap untuk profil baja) — gambar yang bentuknya benar
//      tetapi angkanya hilang tak menolong estimator memesan.
//
// Pakai: UJI_EMAIL=… UJI_SANDI=… UJI_BASIS=http://127.0.0.1:3017 \
//          node scripts/uji-gambar-hidup.mjs
// ============================================================================

const BASIS = process.env.UJI_BASIS ?? 'http://127.0.0.1:3017'
const EMAIL = process.env.UJI_EMAIL ?? process.env.LAYAR_EMAIL
const SANDI = process.env.UJI_SANDI ?? process.env.LAYAR_SANDI

if (!EMAIL || !SANDI) {
  console.error('\n❌ UJI_EMAIL/UJI_SANDI (atau LAYAR_EMAIL/LAYAR_SANDI) wajib diisi.\n')
  process.exit(1)
}

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
const H_HAPUS = { cookie }
const JALAN = (process.hrtime.bigint() % 100000n).toString(36)

const dp = await fetch(`${BASIS}/api/v1/projects?limit=1`, { headers: H })
const jp = await dp.json()
const proyek = (jp.data ?? jp.projects ?? jp)[0]
if (!proyek?.id) { console.error('\n❌ Tak ada proyek untuk elemen uji.\n'); process.exit(1) }

console.log(`══ Gambar kerja lewat rute hidup: ${BASIS}`)
console.log(`   proyek uji: ${proyek.name ?? proyek.nama ?? proyek.id}\n`)

/** Profil WF nyata dari tabel — dipakai beberapa kasus. */
const WF200 = {
  designation: '200x100x5.5x8', profile_type: 'WF',
  hMm: 200, bMm: 100, t1Mm: 5.5, t2Mm: 8,
  beratKgPerM: 21.3, panjangStandarM: 12,
}
const BJ = { fyMpa: 240, fuMpa: 370 }

const KASUS = [
  {
    jenis: 'balok', label: 'balok beton — penampang bertulangan',
    input: {
      bMm: 300, hMm: 500, panjangM: 6, selimutMm: 40, dUtamaMm: 19,
      nTarik: 4, nTekan: 2, dSengkangMm: 10, jarakSengkangMm: 150,
      mutu: { fcMpa: 25, fyMpa: 400, fyvMpa: 240 }, muKnm: 180, vuKn: 140,
    },
    wajibGambar: ['penampang'],
  },
  {
    jenis: 'baja_balok', label: 'balok baja WF — penampang profil',
    input: { profil: WF200, mutu: BJ, bentangM: 6, muKnm: 60, vuKn: 50 },
    wajibGambar: ['penampang'],
    /*
      Tebal badan dan tebal sayap wajib MUNCUL di SVG-nya. Keduanya
      berdampingan di penamaan ("200x100x5,5x8") dan tertukar tanpa gejala
      sampai batangnya datang — dan gambar yang bentuknya benar tetapi
      angkanya hilang tak mencegah apa pun.
    */
    wajibTeks: ['badan 5.5', 'sayap 8'],
  },
  {
    jenis: 'baja_kolom', label: 'kolom baja — penampang profil',
    input: { profil: WF200, mutu: BJ, tinggiM: 4, puKn: 300 },
    wajibGambar: ['penampang'],
  },
  {
    jenis: 'baja_rangka', label: 'rangka batang — profil batang pertama',
    input: {
      nama: 'KK-1', mutu: BJ,
      batang: [
        { nama: 'atas', panjangM: 2, gayaKn: -100, profil: WF200 },
        { nama: 'bawah', panjangM: 2, gayaKn: 80, profil: WF200 },
      ],
    },
    wajibGambar: ['penampang'],
  },
  {
    jenis: 'sloof', label: 'sloof — penampang bertulangan',
    input: {
      bMm: 150, hMm: 200, bentangM: 3.5, selimutMm: 30, dUtamaMm: 12,
      nBawah: 2, nAtas: 2, dSengkangMm: 8, jarakSengkangMm: 150,
      mutu: { fcMpa: 20, fyMpa: 400 },
      tinggiDindingM: 3, tebalDindingM: 0.15, jenisDinding: 'bata_merah',
    },
    wajibGambar: ['penampang'],
  },
  {
    jenis: 'balok_t', label: 'balok T — penampang BADAN saja',
    /*
      Yang digambar badan (bw × h), bukan T utuh. Sayapnya adalah PELAT, dan
      pelat punya gambarnya sendiri — menggambar keduanya menyatu membuat besi
      pelat terlihat sebagai bagian balok dan terpesan dua kali.
    */
    input: {
      bwMm: 200, hMm: 400, hfMm: 120, bentangBersihM: 4, jarakAsAsM: 3,
      selimutMm: 30, dUtamaMm: 16, nTarik: 3, nAtas: 2,
      dSengkangMm: 8, jarakSengkangMm: 150,
      mutu: { fcMpa: 25, fyMpa: 400 },
      muPositifKnm: 60, muNegatifKnm: 40, vuKn: 70,
    },
    wajibGambar: ['penampang'],
    wajibTeks: ['(badan)'],
  },
  {
    jenis: 'dinding_penahan', label: 'dinding penahan — potongan + tekanan',
    input: {
      tinggiM: 3, tebalAtasM: 0.25, tebalBawahM: 0.4,
      panjangTelapakM: 2.2, tebalTelapakM: 0.4, kakiM: 0.6,
      gammaTanahKnM3: 18, phiDerajat: 30, qaKnM2: 150,
      panjangDindingM: 12, selimutMm: 50, dUtamaMm: 13, jarakUtamaMm: 150,
      mutu: { fcMpa: 25, fyMpa: 400 },
    },
    wajibGambar: ['potongan'],
    /*
      Angka keamanan WAJIB muncul di gambarnya. Guling dan geser adalah dua
      dari tiga cara dinding ini runtuh, dan keduanya tak terlihat sama sekali
      dari bentuknya — yang membaca gambar tanpa angka ini menilainya dari
      "kelihatan kokoh".
    */
    wajibTeks: ['SF guling', 'SF geser'],
  },
  {
    jenis: 'plat', label: 'pelat — potongan',
    /*
      Medan `bebanMatiTambahan` dan `tumpuan` WAJIB — versi pertama kasus ini
      menghilangkannya, dan modulnya gagal dengan "Cannot read properties of
      undefined (reading 'reduce')". Pesan itu tak menyebut satu pun medan,
      jadi ia terbaca seperti cacat modul.

      Modulnya sekarang menyebut nama medannya (diperbaiki bersama kasus ini);
      kasus ini menahannya supaya tetap terpanggil dengan bentuk yang benar.
    */
    input: {
      lxM: 4, lyM: 5, hM: 0.12, selimutMm: 20, dTulanganMm: 10,
      jarakTulanganMm: 150, mutu: { fcMpa: 25, fyMpa: 400, fyvMpa: 240 },
      tumpuan: { y1: 'menerus', y2: 'menerus', x1: 'menerus', x2: 'menerus' },
      bebanMatiTambahan: [{ nama: 'keramik + spesi', nilai: 1.1 }],
      bebanHidupKnM2: 2.5,
    },
    wajibGambar: ['potongan'],
  },
]

let gagal = 0
const dibuat = []

for (const [i, k] of KASUS.entries()) {
  const kode = `UJI-GBR-${i + 1}-${JALAN}`

  const buat = await fetch(`${BASIS}/api/v1/projects/${proyek.id}/struktur`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({
      kode, nama: k.label, jenis: k.jenis, jumlah: 1, input: k.input,
      catatan: 'dibuat oleh uji-gambar-hidup.mjs — dihapus otomatis',
    }),
  })
  if (!buat.ok) {
    console.error(`❌ ${k.label}: BUAT gagal HTTP ${buat.status}`)
    console.error(`   ${(await buat.text()).slice(0, 200)}`)
    gagal++
    continue
  }
  const jb = await buat.json()
  const id = (jb.data ?? jb)?.id
  if (!id) { console.error(`❌ ${k.label}: tak ada id`); gagal++; continue }
  dibuat.push(id)

  /* `?gambar=1` — tanpa ini rute TIDAK menggambar sama sekali. */
  const baca = await fetch(`${BASIS}/api/v1/struktur/${id}?gambar=1`, { headers: H })
  if (!baca.ok) {
    console.error(`❌ ${k.label}: BACA gagal HTTP ${baca.status}`)
    gagal++
    continue
  }
  const h = await baca.json()
  const gambar = h.gambar ?? {}

  console.log(`▸ ${k.jenis} — ${k.label}`)

  const medanGagal = Object.keys(gambar).filter((x) => /Gagal$/.test(x))
  for (const m of medanGagal) {
    console.error(`   ❌ ${m}: ${gambar[m]}`)
    gagal++
  }

  for (const medan of k.wajibGambar) {
    const svg = gambar[medan]
    if (typeof svg !== 'string' || !svg.includes('<svg')) {
      console.error(`   ❌ "${medan}" bukan SVG (${typeof svg})`)
      gagal++
      continue
    }

    /*
      viewBox berukuran NOL membuat gambar kosong tanpa satu pun galat, dan
      berkasnya tetap terlihat wajar dari luar. Diperiksa angkanya.
    */
    const vb = svg.match(/viewBox="([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)"/)
    if (!vb) {
      console.error(`   ❌ "${medan}" tak punya viewBox`)
      gagal++
      continue
    }
    const w = Number(vb[3]), t = Number(vb[4])
    if (!(w > 0) || !(t > 0)) {
      console.error(`   ❌ "${medan}" viewBox berukuran ${w}×${t} — gambar KOSONG`)
      gagal++
      continue
    }

    console.log(`   ✓ ${medan}  ${svg.length} byte  viewBox ${w}×${t}`)
  }

  for (const frasa of k.wajibTeks ?? []) {
    const semua = Object.values(gambar).filter((x) => typeof x === 'string').join('')
    if (!semua.includes(frasa)) {
      console.error(`   ❌ "${frasa}" tak muncul di gambar mana pun`)
      gagal++
    } else {
      console.log(`   ✓ memuat "${frasa}"`)
    }
  }
  console.log('')
}

for (const id of dibuat) {
  const d = await fetch(`${BASIS}/api/v1/struktur/${id}`, { method: 'DELETE', headers: H_HAPUS })
  if (!d.ok) { console.error(`⚠ elemen uji ${id} TAK terhapus (HTTP ${d.status})`); gagal++ }
}
console.log(`(${dibuat.length} elemen uji dibuat dan dihapus kembali)`)

if (gagal) {
  console.error(`\n❌ ${gagal} masalah pada gambar kerja`)
  process.exit(1)
}
console.log(`\n✅ ${KASUS.length} kasus — gambar kerja terbit lewat rute sungguhan`)
