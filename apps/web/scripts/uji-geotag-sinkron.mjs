#!/usr/bin/env node
/**
 * UJI GEOTAG SINKRON — memastikan rumus jarak di web sama dengan di API.
 *
 * ── Kenapa rumusnya digandakan
 *
 * `jarakMeter` ada di dua tempat:
 *   apps/api/src/lib/geotag.ts       — untuk penilaian sisi server
 *   apps/web/components/penanda-lokasi.tsx — untuk tampilan galeri
 *
 * Menariknya dari API berarti satu permintaan jaringan per foto di galeri;
 * memindahkannya ke paket bersama berarti membangun paket bersama untuk
 * sepuluh baris. Duplikasi adalah pilihan yang benar DI SINI — dengan satu
 * syarat: keduanya tak boleh menyimpang.
 *
 * ── Kenapa menyimpang itu berbahaya
 *
 * Kalau rumusnya beda, server bisa bilang "di lokasi" sementara layar bilang
 * "800 m dari lokasi" untuk foto yang SAMA. Yang melihat itu tak punya cara
 * tahu mana yang benar, dan akan berhenti memercayai keduanya.
 *
 * ── Cara kerja
 *
 * Kedua implementasi dijalankan atas titik yang sama dan hasilnya
 * dibandingkan. Bukan membandingkan teks kodenya — itu akan merah karena
 * perbedaan gaya penulisan yang tak mengubah apa pun.
 *
 * Pakai (DARI ROOT REPO): node apps/web/scripts/uji-geotag-sinkron.mjs
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Mengambil badan fungsi `jarakMeter` dari sebuah berkas, lalu menjadikannya
 *  fungsi yang bisa dijalankan. */
function ambilFungsi(path, nama) {
  const isi = readFileSync(path, 'utf8')
  const mulai = isi.indexOf(`function ${nama}(`)
  if (mulai < 0) throw new Error(`${nama} tak ditemukan di ${path}`)

  // Hitung kurung kurawal dari badan fungsi sampai seimbang.
  let i = isi.indexOf('{', isi.indexOf(')', mulai))
  let dalam = 0
  let akhir = -1
  for (; i < isi.length; i++) {
    if (isi[i] === '{') dalam++
    else if (isi[i] === '}') { dalam--; if (!dalam) { akhir = i; break } }
  }
  if (akhir < 0) throw new Error(`penutup ${nama} tak ditemukan di ${path}`)

  // Anotasi tipe TypeScript dilucuti — yang diuji perilakunya, bukan tipenya.
  const badan = isi.slice(isi.indexOf('{', isi.indexOf(')', mulai)), akhir + 1)
    .replace(/:\s*(number|string|boolean)\b/g, '')
    .replace(/:\s*\{[^}]*\}/g, '')

  // `new Function` di sini disengaja dan aman: yang dieksekusi adalah kode
  // dari repo ini sendiri, dibaca dari berkas yang ikut di-review. Ini
  // satu-satunya cara membandingkan PERILAKU dua implementasi tanpa
  // membandingkan teksnya — dan perbandingan teks akan merah karena
  // perbedaan gaya penulisan yang tak mengubah apa pun.
  return new Function('a', 'b', `${badan.slice(1, -1)}`)
}

const apiFn = ambilFungsi(join('apps', 'api', 'src', 'lib', 'geotag.ts'), 'jarakMeter')
const webFn = ambilFungsi(join('apps', 'web', 'components', 'penanda-lokasi.tsx'), 'jarakMeter')

/** Titik uji: dekat, jauh, lintas khatulistiwa, lintas meridian, kutub. */
const KASUS = [
  [{ lintang: -6.9024, bujur: 107.6186 }, { lintang: -6.9024, bujur: 107.6186 }, 'titik sama'],
  [{ lintang: -6.9024, bujur: 107.6186 }, { lintang: -6.9218, bujur: 107.6070 }, 'Bandung dalam kota'],
  [{ lintang: -6.9024, bujur: 107.6186 }, { lintang: -6.1754, bujur: 106.8272 }, 'Bandung–Jakarta'],
  [{ lintang: -0.5, bujur: 107 }, { lintang: 0.5, bujur: 107 }, 'lintas khatulistiwa'],
  [{ lintang: 0, bujur: 179 }, { lintang: 0, bujur: -179 }, 'lintas meridian 180'],
  [{ lintang: 89, bujur: 0 }, { lintang: 89, bujur: 180 }, 'dekat kutub utara'],
  [{ lintang: -33.8688, bujur: 151.2093 }, { lintang: 51.5074, bujur: -0.1278 }, 'Sydney–London'],
]

let beda = 0
for (const [a, b, nama] of KASUS) {
  const hApi = apiFn(a, b)
  const hWeb = webFn(a, b)
  if (hApi !== hWeb) {
    console.log(`  ✗ ${nama}: api=${hApi} web=${hWeb}`)
    beda++
  } else {
    console.log(`  ✓ ${nama}: ${hApi} m`)
  }
}

if (beda) {
  console.log(
    `\n❌ ${beda} kasus berbeda. Rumus jarak di web dan API HARUS sama —\n` +
    'kalau tidak, server bisa bilang "di lokasi" sementara layar bilang\n' +
    '"800 m dari lokasi" untuk foto yang sama, dan tak ada yang tahu mana\n' +
    'yang benar.',
  )
  process.exit(1)
}

console.log('\n✓ Rumus jarak web dan API menghasilkan angka yang sama.')
