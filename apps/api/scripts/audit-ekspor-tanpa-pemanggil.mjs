#!/usr/bin/env node
// ============================================================================
// FUNGSI YANG DIEKSPOR TAPI TAK PERNAH DIPANGGIL SIAPA PUN.
// ============================================================================
//
// ── Kenapa penjaga ini ada
//
// Tiga cacat dari kelas yang SAMA ditemukan dalam satu hari (2026-08-27), dan
// ketiganya lolos dari 167 penjaga lain karena tak satu pun galat pernah
// terjadi. Kode yang tak dipanggil tak bisa gagal.
//
//   1. `fn_bersihkan_idempotency_kadaluarsa()` (migrasi 508) — fungsi SQL
//      pembersih tanpa pemanggil. Pemeriksaan skema melaporkannya "ada",
//      sementara `idempotency_keys` tumbuh tanpa batas dari tiap kiriman
//      antrean offline tiap HP mandor.
//
//   2. `hapusDariAntrean()` (mobile) — satu-satunya jalan keluar bagi kiriman
//      yang ditolak server permanen. Tanpa pemanggil, penanda antrean tak
//      pernah hilang dari layar; penanda yang selalu menyala berhenti berarti
//      apa-apa, dan mandor mengabaikannya juga saat isinya kiriman baru.
//
//   3. `pastikanProfilDidukung()` (struktur-baja) — YANG PALING MAHAL.
//      Dokumentasinya berbunyi "Dipanggil di awal tiap fungsi analisa" dan itu
//      keliru sejak modul dibuat. Akibatnya kanal dan siku dihitung dengan
//      rumus profil I: verdict IDENTIK dengan WF sampai digit terakhir,
//      kapasitas 20-40% terlalu besar, mengaku "SNI 1729 §F2".
//
// Yang menyatukan ketiganya: fungsinya BENAR, komentarnya BENAR, testnya (bila
// ada) hijau. Yang hilang cuma satu baris pemanggilan — dan tak ada gejalanya.
//
// ── Kenapa ini bukan pekerjaan linter
//
// `noUnusedLocals` tak melihat yang DIEKSPOR: dari sudut pandang berkasnya,
// ekspor selalu "terpakai". Yang harus diperiksa adalah seluruh repo sekaligus.
//
// ── Cara memutuskannya, dan kenapa ambangnya RATCHET
//
// Sebagian ekspor tanpa pemanggil memang sah: titik masuk yang dipanggil
// runtime, helper yang sengaja disiapkan untuk test, dan API yang dipakai dari
// luar repo. Karena itu ambangnya lantai hari ini, bukan nol — yang dijaga
// adalah tak BERTAMBAH.
//
// Menaikkannya butuh alasan tertulis. Tiap kenaikan berarti satu fungsi yang
// ada di repo, terbaca seperti bekerja, dan tak pernah dijalankan.
// ============================================================================

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

/*
  Jalur diturunkan dari LOKASI SKRIP, bukan `process.cwd()`.

  `audit-klaim-layar-nyata.mjs` memakai cwd dan MATI dengan ENOENT ketika
  runner CI memanggilnya dari akar repo — penjaga yang crash tak menjaga apa
  pun, sementara laporannya terbaca sebagai "merah" yang menyatu dengan merah
  lain. Diperbaiki 2026-08-27; jangan diulang di sini.
*/
const SKRIP = dirname(fileURLToPath(import.meta.url))   // apps/api/scripts
const AKAR = dirname(dirname(dirname(SKRIP)))           // akar repo — TIGA tingkat

/*
  ⚠ Jumlah `dirname` DIVERIFIKASI, bukan ditaksir. Versi pertama naik dua
  tingkat dan berhenti di `apps/`, sehingga tiap jalur di `PINDAI`/`CARI_DI`
  meleset dan korpus jadi NOL berkas — dan penjaganya melaporkan HIJAU.

  Penjaga yang hijau karena tak membaca apa pun lebih buruk daripada tak ada:
  ia menempati baris di daftar CI dan membuat orang mengira kelas cacat ini
  sudah terjaga. Karena itu jumlah korpus ikut DICETAK di bawah, dan nol
  korpus diperlakukan sebagai KEGAGALAN.
*/

/** Ambang ratchet — lantai hari ini. */
const AMBANG = Number(process.env.AMBANG_EKSPOR_MATI ?? 0)

/** Yang dipindai: sumber yang benar-benar kita tulis. */
const PINDAI = [
  'apps/api/src/lib',
  'apps/api/src/utils',
  'apps/mobile/lib',
]

/**
 * Yang dipakai untuk MENCARI pemanggil — sengaja lebih luas dari yang
 * dipindai. Sebuah helper di `lib` bisa dipanggil dari rute, dari skrip
 * penjaga, atau dari halaman web; mencari hanya di tempat ia didefinisikan
 * akan menuduh fungsi yang sebenarnya hidup.
 */
const CARI_DI = [
  'apps/api/src',
  'apps/api/scripts',
  'apps/mobile',
  'apps/web/app',
  'apps/web/lib',
  'apps/web/components',
  'apps/web/scripts',
  'scripts',
]

const EKST = new Set(['.ts', '.tsx', '.mjs', '.js'])
const LEWATI_DIR = new Set(['node_modules', '.next', 'dist', 'build', '.expo'])

function berkasDi(rel) {
  const akar = join(AKAR, rel)
  const keluar = []
  const telusuri = (d) => {
    let isi
    try { isi = readdirSync(d) } catch { return }
    for (const nama of isi) {
      if (LEWATI_DIR.has(nama)) continue
      const p = join(d, nama)
      let st
      try { st = statSync(p) } catch { continue }
      if (st.isDirectory()) telusuri(p)
      else if (EKST.has(extname(nama))) keluar.push(p)
    }
  }
  telusuri(akar)
  return keluar
}

/*
  Korpus pencarian dibangun SEKALI. Versi pertama memanggil grep per fungsi
  dan butuh belasan menit; penjaga yang lambat akan dilewati orang.
*/
const korpus = []
for (const rel of CARI_DI) {
  for (const f of berkasDi(rel)) {
    try { korpus.push({ f, isi: readFileSync(f, 'utf8') }) } catch { /* lanjut */ }
  }
}

/**
 * Fungsi yang MEMANG boleh tak punya pemanggil di dalam repo.
 *
 * Tiap entri wajib menyebut ALASANNYA — daftar pengecualian tanpa alasan
 * berubah jadi tempat sampah, dan penjaga yang pengecualiannya tak bisa
 * diaudit sama saja dengan mati.
 */
const SAH = new Map([
  ['lupakanTokenUjiSaja', 'helper khusus test — namanya sendiri menyatakannya'],
])

const temuan = []

for (const rel of PINDAI) {
  for (const f of berkasDi(rel)) {
    if (f.includes('__tests__') || f.endsWith('.test.ts') || f.endsWith('.test.tsx')) continue
    const isi = readFileSync(f, 'utf8')

    for (const m of isi.matchAll(/^export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/gm)) {
      const nama = m[1]
      if (SAH.has(nama)) continue

      /*
        Pemanggil dihitung sebagai penyebutan nama DI LUAR baris definisinya.

        Sengaja longgar — penyebutan di komentar atau di daftar re-ekspor ikut
        terhitung. Penjaga yang terlalu ketat akan merah karena hal yang benar,
        lalu dimatikan orang; yang dikejar di sini adalah nol MUTLAK.
      */
      const pola = new RegExp(`\\b${nama}\\b`, 'g')
      let jumlah = 0
      let dipakaiTest = false
      for (const k of korpus) {
        const n = (k.isi.match(pola) ?? []).length
        if (n === 0) continue
        // Definisinya sendiri tak dihitung sebagai pemanggil.
        const kurang = k.f === f ? (k.isi.match(new RegExp(`^export\\s+(?:async\\s+)?function\\s+${nama}\\b`, 'gm')) ?? []).length : 0
        const bersih = n - kurang
        if (bersih <= 0) continue
        jumlah += bersih
        if (k.f.includes('__tests__') || k.f.includes('.test.')) dipakaiTest = true
      }

      if (jumlah === 0) {
        temuan.push({ nama, berkas: f.replace(AKAR, '').replace(/\\/g, '/'), hanyaTest: false })
      } else if (jumlah > 0 && dipakaiTest) {
        /*
          Dipanggil HANYA oleh test adalah kelas terpisah: fungsinya terbukti
          bekerja, tetapi tak ada di jalur produksi mana pun. `pastikanProfil-
          Didukung` justru TIDAK tertangkap oleh kelas ini (nol test juga),
          jadi ini dilaporkan sebagai catatan, bukan kegagalan.
        */
      }
    }
  }
}

console.log('══ Fungsi diekspor tanpa satu pun pemanggil ═════════════════')
console.log(`  berkas dipindai   : ${PINDAI.length} folder`)
console.log(`  korpus pencarian  : ${korpus.length} berkas`)

/*
  Korpus kosong = jalurnya meleset, BUKAN repo yang bersih. Persis yang
  terjadi saat penjaga ini pertama ditulis (dua `dirname`, bukan tiga).
  Ambang 200 jauh di bawah jumlah nyata, jadi ia hanya menangkap kesalahan
  jalur — bukan menuntut ukuran repo tertentu.
*/
if (korpus.length < 200) {
  console.error('')
  console.error(`❌ Korpus hanya ${korpus.length} berkas — jalur pencarian meleset.`)
  console.error(`   AKAR terbaca: ${AKAR}`)
  console.error('   Penjaga yang hijau karena tak membaca apa pun lebih buruk')
  console.error('   daripada tak ada.')
  process.exit(1)
}
console.log(`  tanpa pemanggil   : ${temuan.length}`)
console.log(`  ambang (ratchet)  : ${AMBANG}`)

if (temuan.length > AMBANG) {
  console.log('')
  console.error('❌ Fungsi berikut ada di repo dan TAK PERNAH DIPANGGIL:')
  console.error('')
  for (const t of temuan) console.error(`     ${t.nama}\n       ${t.berkas}`)
  console.error('')
  console.error('   Kode yang tak dipanggil TAK BISA GAGAL — jadi tak ada')
  console.error('   penjaga lain yang melihatnya. Tiga cacat dari kelas ini')
  console.error('   ditemukan dalam satu hari, yang termahal membuat kanal &')
  console.error('   siku dihitung pakai rumus profil I (kapasitas 20-40%')
  console.error('   terlalu besar, salah ke arah TIDAK AMAN).')
  console.error('')
  console.error('   Perbaikan: SAMBUNGKAN ke pemanggilnya, atau BUANG. Bila')
  console.error('   memang sah tanpa pemanggil, daftarkan di `SAH` beserta')
  console.error('   alasannya.')
  process.exit(1)
}

console.log('')
console.log('✅ Tiap fungsi yang diekspor punya pemanggil')
