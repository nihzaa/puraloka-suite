#!/usr/bin/env node
// ============================================================================
// NAMA PRODUK TAK BOLEH DIPAKU DI TEMPAT YANG DILIHAT TENANT.
// ============================================================================
//
// ── Kenapa penjaga ini ada
//
// Founder bertanya 2026-08-27: "kalau suatu saat mau ganti nama lagi, apakah
// tidak menyulitkan?" Jawabannya tergantung SATU hal — berapa tempat yang
// memaku namanya. Kalau nama hidup di satu sumber, penggantian itu satu baris.
// Kalau tersebar, ia jadi perburuan yang selalu menyisakan satu.
//
// Dan menyisakan satu BUKAN kejadian hipotetis di repo ini:
//
//   `lib/ekspor-tabel.ts` mencatat bahwa `pdfHeader()` memaku "Puraloka Suite"
//   di kop tiap laporan, dan menyebutnya sebagai cacat multi-tenant nyata —
//   "PT lain menerima laporan berkop nama pesaingnya". Perbaikannya lalu
//   dipasang HANYA di jalur ekspor baru. Tiga laporan lama (proyek, mandor &
//   upah, keuangan) tetap memakai jalur lama, dan tetap salah selama itu.
//
// Catatan yang menyebut cacat "sudah diperbaiki" padahal hanya sebagian adalah
// kebusukan dokumen yang paling menipu: pembaca berikutnya menyilangnya dari
// daftar dan tak pernah kembali.
//
// ── Yang dijaga (RATCHET, bukan nol — lihat alasannya di `LANTAI`)
//
// Nama produk sebagai LITERAL di kode yang menghasilkan keluaran untuk tenant:
// kop PDF, footer laporan, metadata berkas, judul e-mail, isi notifikasi.
//
// ── Yang TIDAK dijaga, dengan sengaja
//
//   komentar & dokumentasi  menjelaskan riwayat; menghapusnya justru merugikan
//   test                    sebagian MENGUJI bahwa namanya tidak muncul
//   judul halaman web       itu identitas aplikasi bagi penggunanya sendiri,
//                           bukan dokumen yang dikirim keluar
//   kunci penyimpanan       `puraloka_token` dsb — internal, tak terlihat, dan
//                           menggantinya membuat data lokal tak terbaca
//
// Penjaga ini tak menuntut nama tertentu. Nama produk boleh berganti kapan
// saja — yang dijaga adalah bahwa penggantiannya tak menyisakan satu.
// ============================================================================

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

/*
  EMPAT `dirname`, bukan tiga — dihitung, bukan ditaksir:

      apps/api/scripts/berkas.mjs  ->  apps/api/scripts
      -> apps/api  ->  apps  ->  akar repo

  Versi pertama memakai tiga dan berhenti di `apps/`, sehingga jalur pindai
  jadi `apps/apps/api/src/...` yang tak ada — nol berkas terbaca, dan
  penjaganya melapor HIJAU.

  Terbukti buta lewat uji mutasi: pakuan nama disisipkan ke `pdfHeader()`,
  penjaga tetap menjawab 'pakuan ditemukan: 0'. Cacat yang SAMA sudah
  ditemukan pagi itu juga di `audit-ekspor-tanpa-pemanggil.mjs`.

  Karena itu jumlah berkas ikut DICETAK di bawah, dan korpus kosong
  diperlakukan sebagai KEGAGALAN — penjaga yang hijau karena tak membaca apa
  pun lebih buruk daripada tak ada.
*/
const AKAR = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))))

/*
  Nama yang dianggap "nama produk". Daftar, bukan satu string: saat namanya
  berganti, yang lama tetap perlu dijaga agar tak tertinggal di suatu tempat.
*/
const NAMA_PRODUK = [
  'Puraloka Suite',
]

/*
  Berkas yang menghasilkan keluaran untuk TENANT. Sengaja sempit — penjaga
  yang memindai seluruh repo akan menangkap komentar dan dokumentasi, lalu
  jadi berisik dan diabaikan.
*/
const PINDAI = [
  'apps/api/src/routes/v1',
  'apps/api/src/utils',
  'apps/api/src/lib',
]

const LEWATI_DIR = new Set(['node_modules', '__tests__', 'dist'])

function berkasTs(dir) {
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
      else if (extname(nama) === '.ts' && !nama.includes('.test.')) keluar.push(p)
    }
  }
  telusuri(join(AKAR, dir))
  return keluar
}

/**
 * Buang komentar sebelum memindai.
 *
 * Komentar di repo ini panjang dan sering MENGUTIP nama produk untuk
 * menjelaskan kenapa ia tak boleh dipaku. Penjaga yang menghukum penjelasan
 * itu mengajari orang berhenti menulis alasan — cacat yang sudah ditemukan
 * empat kali pada hari yang sama (2026-08-27) di penjaga lain.
 */
const tanpaKomentar = (isi) => isi
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1')

/**
 * Lantai ratchet — angka hari ini, bukan nol.
 *
 * Kop PDF (`reports.ts`) SUDAH diperbaiki 2026-08-27 dan terkunci di sini.
 * Yang tersisa 9: `utils/email.ts` (kop, footer, e-mail sambutan),
 * `auth.ts` (pesan tolak), `wa-nomor.ts`.
 *
 * `email.ts` yang paling berkonsekuensi — e-mail dikirim KELUAR, ke klien dan
 * vendor tenant. Memperbaikinya menuntut identitas tenant mengalir sampai ke
 * pengirim e-mail, dan itu perubahan yang lebih besar daripada mengganti
 * literal. Dicatat sebagai utang yang TERUKUR, bukan disembunyikan.
 *
 * Ambang boleh TURUN, tak boleh naik.
 */
const LANTAI = Number(process.env.LANTAI_NAMA_PRODUK ?? 9)

const temuan = []

let jumlahBerkas = 0

for (const dir of PINDAI) {
  for (const f of berkasTs(dir)) {
    jumlahBerkas++
    const baris = tanpaKomentar(readFileSync(f, 'utf8')).split('\n')
    baris.forEach((b, i) => {
      for (const nama of NAMA_PRODUK) {
        if (b.includes(nama)) {
          temuan.push({
            berkas: f.replace(AKAR, '').replace(/\\/g, '/').replace(/^\//, ''),
            baris: i + 1,
            isi: b.trim().slice(0, 96),
          })
        }
      }
    })
  }
}

console.log('══ Nama produk tak dipaku di keluaran tenant ═══════════════')
console.log(`  nama dijaga     : ${NAMA_PRODUK.join(', ')}`)
console.log(`  folder dipindai : ${PINDAI.length}`)
console.log(`  berkas dibaca   : ${jumlahBerkas}`)

/*
  Korpus kosong = jalur meleset, BUKAN kode yang bersih. Persis yang terjadi
  saat penjaga ini pertama ditulis (tiga `dirname`, bukan empat).
*/
if (jumlahBerkas < 50) {
  console.error('')
  console.error(`❌ Hanya ${jumlahBerkas} berkas terbaca — jalur pindai meleset.`)
  console.error(`   AKAR terbaca: ${AKAR}`)
  process.exit(1)
}
console.log(`  pakuan ditemukan: ${temuan.length}`)
console.log(`  lantai (ratchet): ${LANTAI}`)

if (temuan.length > LANTAI) {
  console.error('')
  console.error('❌ Nama produk DIPAKU di kode yang menghasilkan keluaran tenant:')
  console.error('')
  for (const t of temuan) {
    console.error(`     ${t.berkas}:${t.baris}`)
    console.error(`       ${t.isi}`)
  }
  console.error('')
  console.error('   Untuk SaaS multi-tenant ini berarti PT lain menerima dokumen')
  console.error('   berkop/berfooter nama pesaingnya — dan tak ada galat yang')
  console.error('   menunjukkannya; yang melihatnya adalah PENERIMA dokumen.')
  console.error('')
  console.error('   Perbaikan: ambil nama dari tenant yang bersangkutan, dan')
  console.error('   jatuhkan ke kata netral ("Laporan") bila tak terbaca —')
  console.error('   BUKAN ke nama siapa pun. Pola: `namaTenant()` di reports.ts.')
  process.exit(1)
}

console.log('')
if (temuan.length === 0) {
  console.log('✅ Nol pakuan nama produk di jalur keluaran tenant.')
} else {
  console.log(`✅ Tidak bertambah — ${temuan.length} pakuan tersisa, semuanya di lantai.`)
  console.log('')
  console.log('   Utang yang tercatat (boleh turun, tak boleh naik):')
  for (const t of temuan) console.log(`     ${t.berkas}:${t.baris}`)
}
