#!/usr/bin/env node
/**
 * EKSTRAK FUNGSI — memindahkan deklarasi fungsi tingkat-modul ke berkas lain,
 * utuh, tanpa menulis ulang isinya.
 *
 * ── Kenapa alat, bukan salin-tempel manual
 *
 * Memecah modul 3.449 baris berarti memindahkan belasan komponen. Salin-tempel
 * manual pada blok sebesar itu adalah cara paling andal untuk kehilangan satu
 * kurung penutup — dan galatnya muncul jauh dari sebabnya.
 *
 * ── Batas fungsi ditentukan bagaimana
 *
 * Percobaan pertama memakai "baris `}` pertama di kolom 0". Itu SALAH dan
 * langsung ketahuan: baris penutup komentar blok di awal berkas ikut cocok,
 * jadi SEMUA fungsi dilaporkan berukuran 13 baris — angka yang sama untuk
 * empat fungsi berbeda, yang mestinya langsung mencurigakan.
 *
 * Yang dipakai sekarang: mulai dari baris deklarasi, hitung kurung kurawal
 * dengan mengabaikan yang ada di dalam string dan komentar. Berhenti saat
 * seimbang. Itu satu-satunya cara yang benar untuk JSX, yang penuh `{}`.
 *
 * Pakai: node scripts/ekstrak-fungsi.mjs <berkas> <NamaFungsi>...
 *        (mencetak rentang; tak mengubah apa pun tanpa --potong)
 */
import { readFileSync, writeFileSync } from 'node:fs'

const [berkas, ...nama] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const POTONG = process.argv.includes('--potong')
if (!berkas || !nama.length) {
  console.log('Pakai: ekstrak-fungsi.mjs <berkas> <Nama>... [--potong]')
  process.exit(1)
}

const teks = readFileSync(berkas, 'utf8')
const baris = teks.split(/\r?\n/)

/**
 * Cari indeks baris penutup fungsi yang deklarasinya di `mulai`.
 *
 * ⚠️ Penghitungan TIDAK boleh dimulai dari kurung kurawal pertama yang
 * ditemukan. Percobaan kedua melakukan itu dan hasilnya "1 baris" untuk
 * keenam fungsi: destructuring parameter — `function InvoiceRow({ inv,
 * onPayClick }: {...})` — membuka DAN menutup di baris deklarasi, jadi
 * hitungannya kembali seimbang sebelum badan fungsi dimulai.
 *
 * Yang benar: lewati dulu daftar parameter (kurung BULAT), baru mulai
 * menghitung kurawal setelahnya.
 */
function akhirFungsi(mulai) {
  let bulat = 0, kurawal = 0
  let lewatiParam = true, mulaiBadan = false

  for (let i = mulai; i < baris.length; i++) {
    const l = baris[i]
    let str = null, komentar = false

    for (let k = 0; k < l.length; k++) {
      const c = l[k], c2 = l[k + 1]
      if (komentar) break
      if (str) {
        if (c === '\\') { k++; continue }
        if (c === str) str = null
        continue
      }
      if (c === '/' && c2 === '/') { komentar = true; break }
      if (c === '"' || c === "'" || c === '`') { str = c; continue }

      if (lewatiParam) {
        if (c === '(') bulat++
        else if (c === ')') {
          bulat--
          // Daftar parameter selesai; sisa baris ini boleh jadi tipe
          // kembalian, dan kurawal badan datang sesudahnya.
          if (bulat === 0) lewatiParam = false
        }
        continue
      }

      if (c === '{') { kurawal++; mulaiBadan = true }
      else if (c === '}') {
        kurawal--
        if (mulaiBadan && kurawal === 0) return i
      }
    }
  }
  return -1
}

const hasil = []
for (const n of nama) {
  // Cocokkan juga fungsi BERINDENTASI (di dalam komponen) — bukan hanya
  // yang di kolom 0. Setengah komponen React menaruh pemuat datanya di
  // dalam badan komponen, dan versi pertama alat ini melewatkan semuanya
  // sambil melaporkan "tak ditemukan" — pesan yang menyesatkan karena
  // fungsinya jelas ada.
  const pola = new RegExp(`^\\s*(export )?(async )?function ${n}\\b`)
  const mulai = baris.findIndex((l) => pola.test(l))
  if (mulai < 0) { console.log(`✗ ${n}: tak ditemukan`); continue }
  const akhir = akhirFungsi(mulai)
  if (akhir < 0) { console.log(`✗ ${n}: penutup tak ditemukan`); continue }
  hasil.push({ n, mulai, akhir })
  console.log(`${n.padEnd(22)} baris ${mulai + 1} → ${akhir + 1}  (${akhir - mulai + 1} baris)`)
}

if (POTONG && hasil.length) {
  // Potong dari BELAKANG supaya indeks yang belum diproses tak bergeser.
  const urut = [...hasil].sort((a, b) => b.mulai - a.mulai)
  const potongan = {}
  let sisa = [...baris]
  for (const h of urut) {
    potongan[h.n] = sisa.slice(h.mulai, h.akhir + 1).join('\n')
    sisa = [...sisa.slice(0, h.mulai), ...sisa.slice(h.akhir + 1)]
  }
  writeFileSync(berkas, sisa.join('\n'))
  writeFileSync(
    berkas.replace(/\.tsx?$/, '') + '.potongan.json',
    JSON.stringify(potongan, null, 2)
  )
  console.log(`\nDipotong dari ${berkas}; isinya di *.potongan.json`)
}
