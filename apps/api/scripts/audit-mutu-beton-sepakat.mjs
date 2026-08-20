#!/usr/bin/env node
// ============================================================================
// PADANAN MUTU BETON K ↔ f'c wajib SAMA di sisi API dan sisi WEB.
// ============================================================================
//
// ── Kenapa ada dua salinan sama sekali
//
// `apps/web` tak boleh mengimpor dari `apps/api`, dan `packages/shared`
// terdaftar di workspace tetapi KOSONG (CLAUDE.md §4). Jadi tabel padanan
// hidup di dua tempat:
//
//     apps/api/src/lib/struktur-mutu-nyata.ts   (lembar PDF, rute mutu-nyata)
//     apps/web/lib/mutu-beton.ts                (label isian, panel layar)
//
// ── Apa yang rusak kalau keduanya menyimpang
//
// Angka K di LAYAR tak lagi cocok dengan f'c yang dipakai MENGHITUNG. Yang
// membaca layar lalu memesan beton kelas yang salah — dan tak ada satu pun
// gejala: dua-duanya menampilkan angka yang terlihat wajar, hanya berbeda.
//
// Contoh yang mungkin: faktor 0,83 disesuaikan jadi 0,85 di satu sisi saja.
// K-300 jadi 25,0 MPa di lembar, 24,4 MPa di layar. Selisihnya kecil, dan
// justru itu yang membuatnya bertahan lama tanpa ketahuan.
//
// ── Kalau `packages/shared` suatu saat diisi
//
// Pindahkan keduanya ke sana, hapus salinannya, dan hapus penjaga ini.
// ============================================================================

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const sini = dirname(fileURLToPath(import.meta.url))
const AKAR = resolve(sini, '..', '..', '..')

const SISI = [
  { nama: 'API', jalur: resolve(AKAR, 'apps', 'api', 'src', 'lib', 'struktur-mutu-nyata.ts') },
  { nama: 'WEB', jalur: resolve(AKAR, 'apps', 'web', 'lib', 'mutu-beton.ts') },
]

let gagal = 0
const baca = []

for (const s of SISI) {
  let isi
  try {
    isi = readFileSync(s.jalur, 'utf8')
  } catch {
    console.error(`❌ ${s.nama}: berkas tak ditemukan — ${s.jalur}`)
    console.error('   Kalau salah satunya sengaja dihapus, hapus juga penjaga ini.')
    gagal++
    continue
  }

  /*
    Yang dibandingkan NILAINYA, bukan teks barisnya.

    Membandingkan teks membuat penjaga ini merah karena beda spasi atau beda
    tanda kutip — merah yang tak berarti apa-apa melatih orang mengabaikannya.
  */
  const angka = (nama) => {
    const m = isi.match(new RegExp(`${nama}\\s*=\\s*([0-9.]+)`))
    return m ? Number(m[1]) : null
  }

  /* Tabel padanan: pasangan [fc, K] dalam urutan apa pun. */
  const mTabel = isi.match(/PADANAN_SNI[\s\S]*?\[([\s\S]*?)\]\s*;?\s*\n/)
  const pasangan = mTabel
    ? [...mTabel[1].matchAll(/\[\s*([0-9.]+)\s*,\s*([0-9]+)\s*\]/g)]
      .map((x) => `${Number(x[1])}=${Number(x[2])}`).sort().join(' ')
    : null

  const mKelas = isi.match(/KELAS_K\s*=\s*\[([^\]]*)\]/)
  const kelas = mKelas
    ? mKelas[1].split(',').map((x) => Number(x.trim())).filter(Number.isFinite).sort((a, b) => a - b).join(',')
    : null

  baca.push({
    nama: s.nama,
    kgcm2: angka('KG_CM2_PER_MPA'),
    faktor: angka('FAKTOR_KUBUS_KE_SILINDER'),
    pasangan,
    kelas,
  })
}

if (baca.length === 2) {
  const [a, b] = baca
  const banding = [
    ['KG_CM2_PER_MPA', a.kgcm2, b.kgcm2],
    ['FAKTOR_KUBUS_KE_SILINDER', a.faktor, b.faktor],
    ['PADANAN_SNI', a.pasangan, b.pasangan],
    ['KELAS_K', a.kelas, b.kelas],
  ]

  console.log("══ Padanan mutu beton K ↔ f'c: API vs WEB ══════════════════")
  for (const [nama, x, y] of banding) {
    if (x === null || x === undefined) {
      console.error(`❌ ${nama} tak ditemukan di sisi ${a.nama}`)
      gagal++
      continue
    }
    if (y === null || y === undefined) {
      console.error(`❌ ${nama} tak ditemukan di sisi ${b.nama}`)
      gagal++
      continue
    }
    if (String(x) !== String(y)) {
      console.error(`❌ ${nama} BERBEDA:`)
      console.error(`     ${a.nama}: ${x}`)
      console.error(`     ${b.nama}: ${y}`)
      gagal++
    } else {
      const ringkas = String(x).length > 46 ? `${String(x).slice(0, 46)}…` : String(x)
      console.log(`  ✓  ${nama.padEnd(26)} ${ringkas}`)
    }
  }
}

if (gagal) {
  console.error('')
  console.error(`❌ ${gagal} ketidaksepakatan padanan mutu beton.`)
  console.error('')
  console.error('   Angka K di LAYAR tak lagi cocok dengan f\'c yang dipakai MENGHITUNG.')
  console.error('   Yang membaca layar akan memesan beton kelas yang salah, dan tak ada')
  console.error('   satu pun gejala: dua-duanya menampilkan angka yang terlihat wajar.')
  console.error('')
  console.error('   Samakan keduanya:')
  console.error('     apps/api/src/lib/struktur-mutu-nyata.ts')
  console.error('     apps/web/lib/mutu-beton.ts')
  process.exit(1)
}

console.log('')
console.log("✅ Padanan mutu beton SEPAKAT di kedua sisi")
