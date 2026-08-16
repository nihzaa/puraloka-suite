#!/usr/bin/env node
// ============================================================================
// GALAT MUAT DAN GALAT AKSI TIDAK BOLEH BERBAGI SATU STATE — RATCHET
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA PENJAGA INI ADA
// ══════════════════════════════════════════════════════════════════════════
//
// Selama memindahkan halaman ke lapis cache `useData` (F4-2, 2026-08-16), satu
// cacat yang sama muncul di SEBELAS halaman lintas empat batch:
//
//   akuntansi/peta-akun · pengaturan/markup · gudang/lokasi · gudang/susut
//   gudang/transfer · gudang/material-klien · keuangan/contingency
//   keuangan/cvr · keuangan/invoice · keuangan/kasbon · (+1 lagi)
//
// Bentuknya: SATU state `galat` dipakai untuk dua hal yang berbeda —
// gagal MEMUAT data, dan gagal MENYIMPAN perubahan.
//
//     setGalat(null)            // dipanggil di awal simpan
//     …
//     setGalat("Gagal simpan")  // dipanggil kalau simpan gagal
//
// Akibatnya: pengguna yang jaringannya putus melihat "Gagal memuat data".
// Ia menekan Simpan. Baris pertama simpan MENGHAPUS pesan itu. Yang tersisa
// hanya pesan simpan — dan ia menyimpulkan datanya sudah termuat, hanya
// simpannya yang gagal.
//
// Tak ada galat. Tak ada test yang merah. Layarnya terlihat masuk akal.
//
// Sebelas kali bukan kebetulan berulang: itu cara halaman di repo ini ditulis,
// dan pemindahan ke lapis cache kebetulan menjadi alat yang menemukannya.
// Penjaga ini memastikan ia tak lahir kembali di halaman berikutnya.
//
// ── Yang diperiksa
//
// Halaman yang SUDAH memakai `useData` (jadi punya `galat: galatMuat`) tidak
// boleh juga memanggil `setGalat(` di lingkup KOMPONEN HALAMANNYA.
//
// ── Kenapa hanya komponen halaman, dan bagaimana batasnya ditentukan
//
// `gudang/lokasi/page.tsx` sempat tertangkap sebagai pelanggar. Diperiksa: dua
// pemanggilan `setGalat` di sana milik `FormGudang` — komponen TERPISAH di
// berkas yang sama, dengan state galatnya sendiri, yang memang hanya mengurus
// kegagalan kirim formulir. Tak ada yang salah di sana.
//
// "Memperbaikinya" berarti mengganti nama state di komponen yang benar demi
// menghijaukan penjaga. Penjaga yang menuntut hal seperti itu akan dimatikan
// orang, bukan diperbaiki — pelajaran yang sudah tercatat pada penjaga a11y
// hari ini juga.
//
// Jadi yang dipindai hanya dari awal komponen halaman (`export default
// function`) sampai deklarasi `function` tingkat-atas BERIKUTNYA.
//
// ── Ambang NOL, dan itu terukur
//
// Diukur 2026-08-16 sesudah sebelas perbaikan: nol pelanggar. Penjaga ini
// MENGUNCI keadaan bersih, bukan menuntut perbaikan besar.
// ============================================================================

import { readFileSync, globSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..')
const APP = join(AKAR, 'app')

const pelanggar = []
let diperiksa = 0

for (const rel of globSync('**/page.tsx', { cwd: APP })) {
  const jalur = rel.split(String.fromCharCode(92)).join('/')
  const isi = readFileSync(join(APP, rel), 'utf8')

  // Hanya halaman yang sudah pindah ke lapis cache yang relevan.
  if (!/galat:\s*galatMuat/.test(isi)) continue
  diperiksa++

  /*
    LINGKUP = komponen yang memanggil `useData`, BUKAN `export default`.

    Bentuk pertama penjaga ini memindai dari `export default function` ke bawah,
    dan MELESET pada pola yang lazim di repo ini:

        function InvoicePageInner() {          <- useData DAN setGalat di sini
          …
        }
        export default function InvoicePage() {  <- pembungkus, di BAWAHNYA
          return <Suspense><InvoicePageInner/></Suspense>
        }

    Seluruh isi komponen sebenarnya berada DI ATAS `export default`, jadi
    pindaian melewatkannya sepenuhnya — dan penjaga itu melaporkan "nol
    pelanggar" untuk berkas yang tak pernah ia lihat isinya.

    Ketahuan HANYA karena mutasinya dijalankan: cacatnya dikembalikan, dan
    penjaga tetap hijau. Penjaga yang tak pernah dibuktikan bisa merah adalah
    hiasan — aturan repo ini, dan di sini ia menagih sendiri.

    Sekarang lingkupnya dimulai dari `useData` itu sendiri: mundur ke pembuka
    `function` terdekat, lalu maju sampai deklarasi tingkat-atas BERIKUTNYA.
    Komponen pembantu (`function FormGudang(...)`) dengan state galat kirimnya
    sendiri tetap di luar jangkauan — itu benar, dan menuduhnya berarti merusak
    kode sehat demi menghijaukan penjaga.
  */
  const posData = isi.search(/galat:\s*galatMuat/)
  const sebelum = isi.slice(0, posData)
  const mulai = Math.max(
    sebelum.lastIndexOf('\nfunction '),
    sebelum.lastIndexOf('\nexport default function '),
  )
  if (mulai < 0) continue

  const sisa = isi.slice(mulai + 1)
  const berikut = sisa.slice(1).search(/\n(export default )?function \w/)
  const lingkup = berikut < 0 ? sisa : sisa.slice(0, berikut + 1)

  // Komentar dilucuti — empat kali dalam satu sesi sebuah pemeriksaan di repo
  // ini membaca komentarnya sendiri sebagai kode.
  const kode = lingkup
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  if (/\bsetGalat\s*\(/.test(kode)) {
    const baris = isi.slice(0, mulai).split('\n').length
    pelanggar.push(`${jalur}:${baris}`)
  }
}

if (pelanggar.length > 0) {
  console.error('\n❌ Galat MUAT dan galat AKSI berbagi satu state:\n')
  for (const p of pelanggar) console.error(`   ✗ ${p}`)
  console.error(`
  Halaman ini memakai \`useData\` (jadi punya \`galatMuat\`) TETAPI masih
  memanggil \`setGalat(\` di komponen halamannya.

  Akibatnya: pengguna yang jaringannya putus melihat "Gagal memuat". Ia menekan
  Simpan. Baris pertama simpan MENGHAPUS pesan itu, dan ia menyimpulkan datanya
  sudah termuat — padahal tidak. Tak ada galat, tak ada test merah.

  Perbaikan:
     const [galatAksi, setGalatAksi] = useState<string | null>(null)
     const galat = galatAksi ?? (galatMuat ? "Gagal memuat …" : null)

  Kalau halaman tak punya aksi tulis sama sekali, buang state-nya:
     const galat = galatMuat ? "Gagal memuat …" : null
`)
  process.exit(1)
}

console.log(
  `✅ galat muat terpisah: ${diperiksa} halaman ber-\`useData\` diperiksa, ` +
  'nol yang berbagi state galat',
)
