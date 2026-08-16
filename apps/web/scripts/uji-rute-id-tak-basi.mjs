#!/usr/bin/env node
// ============================================================================
// HALAMAN RUTE [id] YANG MEMAKAI `useData` WAJIB MENCOCOKKAN IDENTITASNYA
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA PENJAGA INI ADA
// ══════════════════════════════════════════════════════════════════════════
//
// `useData` TIDAK mengosongkan `data` lama saat URL-nya berganti. Ia menaikkan
// `memuat`, lalu MENIMPA `data` sesudah jawaban baru tiba. Di antara keduanya,
// `data` masih berisi jawaban untuk URL SEBELUMNYA.
//
// Untuk halaman ber-saringan itu tak berbahaya: sekejap melihat hasil filter
// lama bukan kerusakan.
//
// Untuk halaman rute `[id]` itu KEBOCORAN IDENTITAS:
//
//     /mandor/A  →  /mandor/B
//     layar menampilkan profil A di bawah URL B, sampai jawaban B tiba
//
// Data orang lain, di halaman orang lain, tanpa satu pun galat. Pada
// `/portal/proyek/[id]` (dibuka KLIEN) dan `/verify/invoice/[id]`, itu bukan
// sekadar tampilan keliru — itu memperlihatkan data pihak lain.
//
// ── Ditemukan 2026-08-16 saat memindahkan `mandor/[id]`
//
// Kode LAMA di berkas itu punya pelacakan `dimuat !== id` yang justru ada untuk
// mencegah ini. Pemindahan polos ke `useData` menghapusnya dan membuka kembali
// cacat yang sudah pernah diperbaiki — tanpa test yang merah, karena test tak
// pernah berpindah dari satu id ke id lain.
//
// Enam rute `[id]` lain belum dipindah saat penjaga ini ditulis. Penjaga ini
// menunggu mereka.
//
// ── Yang dijaga
//
// Halaman di rute `[…]` yang memakai `useData` WAJIB memuat pencocokan
// identitas: sebuah perbandingan antara sesuatu di `data` dan parameter rute.
//
// Yang diterima sebagai bukti pencocokan (salah satu cukup):
//   · `=== id`  /  `!== id`   — membandingkan langsung ke param rute
//   · `=== <param>` dengan nama param apa pun yang diambil dari `useParams`
//
// ── Kenapa BUKAN "wajib pakai pola X"
//
// Bentuk pencocokannya berbeda-beda: sebagian membandingkan `data.mandor.id`,
// sebagian `data.project.id`, sebagian membungkusnya di `useMemo`. Menuntut
// satu bentuk persis akan menolak perbaikan yang benar, dan penjaga seperti itu
// dimatikan orang alih-alih diperbaiki.
//
// Yang dituntut cuma: identitasnya DIPERIKSA di suatu tempat.
//
// Ambang NOL.
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

  // Hanya rute dinamis: ada segmen `[…]` di jalurnya.
  if (!/\[[^\]]+\]/.test(jalur)) continue

  const isi = readFileSync(join(APP, rel), 'utf8')
  if (!/\buseData\s*[<(]/.test(isi)) continue     // belum pindah, bukan urusan
  diperiksa++

  // Komentar dilucuti — empat kali dalam satu sesi sebuah pemeriksaan di repo
  // ini membaca komentarnya sendiri sebagai kode, dan sekali mutasinya LOLOS
  // karenanya.
  const kode = isi
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  // Nama parameter rute yang dipakai halaman ini, mis. `const { id } = useParams()`.
  const nama = new Set(['id'])
  for (const m of kode.matchAll(/const\s*\{\s*([\w\s,]+)\s*\}\s*=\s*useParams/g)) {
    for (const n of m[1].split(',')) { const t = n.trim(); if (t) nama.add(t) }
  }

  const cocok = [...nama].some((n) =>
    new RegExp(`[=!]==\\s*${n}\\b`).test(kode) || new RegExp(`\\b${n}\\s*[=!]==`).test(kode),
  )

  if (!cocok) {
    const baris = (kode.slice(0, kode.search(/\buseData\s*[<(]/)).match(/\n/g) ?? []).length + 1
    pelanggar.push(`${jalur}:${baris}`)
  }
}

if (pelanggar.length > 0) {
  console.error('\n❌ Halaman rute [id] ber-`useData` tanpa pencocokan identitas:\n')
  for (const p of pelanggar) console.error(`   ✗ ${p}`)
  console.error(`
  \`useData\` TIDAK mengosongkan \`data\` lama saat URL-nya berganti — ia
  menaikkan \`memuat\` lalu MENIMPA \`data\` sesudah jawaban baru tiba.

  Di rute [id], itu berarti: pindah dari /x/A ke /x/B menampilkan data A di
  bawah URL B sampai jawaban B tiba. Data orang lain, di halaman orang lain,
  tanpa satu pun galat. Di portal klien dan halaman verifikasi, itu
  memperlihatkan data pihak lain.

  Perbaikan — cocokkan identitasnya, jangan hanya andalkan \`memuat\`:

     const { data: mentah, memuat: sedangMuat } = useData<T>(\`/api/v1/x/\${id}\`)
     const data = mentah && mentah.x.id === id ? mentah : null
     const memuat = sedangMuat || (!!mentah && mentah.x.id !== id)
`)
  process.exit(1)
}

console.log(
  `✅ rute [id] tak basi: ${diperiksa} halaman rute dinamis ber-\`useData\` ` +
  'diperiksa, semuanya mencocokkan identitas',
)
