#!/usr/bin/env node
/**
 * audit-dialog-bukan-bawaan.mjs — ambang NOL
 *
 * `confirm()`, `alert()`, dan `prompt()` bawaan peramban DILARANG di web.
 *
 * ── Kenapa
 *
 * Diminta founder 2026-09-04: "semua dialog juga jangan pake bawaan, kaya
 * alert atau apapun itu". Diukur saat itu: 32 confirm/alert + 13 prompt di
 * 22 berkas, termasuk pada keputusan uang.
 *
 * Alasannya bukan selera:
 *
 *   · Tombolnya berbahasa SISTEM OPERASI. Pengguna Indonesia membaca
 *     "OK / Cancel", tak pernah "Hapus" atau "Batal".
 *   · Ia tak bisa membedakan tindakan merusak dari yang biasa. Menghapus
 *     invoice dan menutup panel memakai kotak yang sama persis.
 *   · Ia MEMBEKUKAN seluruh tab: timer, polling notifikasi, penyimpanan
 *     otomatis berhenti selama kotaknya terbuka.
 *   · Peramban MENEKAN dialog yang muncul berkali-kali, dan `confirm()` yang
 *     ditekan memulangkan `false` DIAM-DIAM — tindakan yang seharusnya
 *     berjalan tak pernah berjalan, tanpa satu pun gejala.
 *   · `prompt()` tak bisa memvalidasi apa pun: yang menekan OK dengan kolom
 *     kosong tetap lolos.
 *
 * Penggantinya `tanya()`, `minta()`, `kabari()` di `components/tanya.tsx` —
 * berbentuk `await`, jadi kode pemanggilnya tetap satu baris.
 *
 * ── Yang SENGAJA tidak dijaga
 *
 * `apps/mobile` (React Native punya `Alert` sendiri) dan `apps/web-publik`
 * (situs statis tanpa `TuanRumahTanya`). Menjaga keduanya akan memerahkan
 * keadaan yang benar.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const WEB = join(AKAR, 'apps', 'web')

const berkas = []
;(function jelajah(d) {
  for (const n of readdirSync(d)) {
    if (n === 'node_modules' || n === '.next' || n.startsWith('.')) continue
    const p = join(d, n)
    if (statSync(p).isDirectory()) jelajah(p)
    else if (/\.(ts|tsx)$/.test(n)) berkas.push(p)
  }
})(WEB)

const temuan = []
for (const p of berkas) {
  // Komponen penggantinya sendiri menyebut nama-nama itu di komentar.
  if (/components[\/]tanya\.tsx$/.test(p)) continue

  const isi = readFileSync(p, 'utf8')
  /*
    Komentar DIKOSONGKAN (bukan dihapus) supaya nomor baris tetap benar.

    Ini bukan kehati-hatian teoretis: `layout.tsx` menjelaskan panjang lebar
    kenapa `tanya()` tidak jatuh ke `confirm()` bawaan, dan penjelasan itu
    menyebut `confirm()`. Penjaga yang memerahkan dokumentasi tentang dirinya
    sendiri mengajari orang menghapus dokumentasi itu — kelas cacat yang
    muncul TIGA kali dalam satu hari di repo ini (CLAUDE.md §8a.2).
  */
  const bersih = isi
    .replace(/\/\*[\s\S]*?\*\//g, (b) => b.replace(/[^\n]/g, ' '))
    .split('\n')
    .map((b) => (/^\s*\/\//.test(b) ? '' : b))

  bersih.forEach((b, i) => {
    /*
      `[^.\w]` di depan: `confirm(` yang didahului titik adalah METODE
      (`obj.confirm()`), dan `void confirm(gr.id)` di halaman penerimaan
      adalah fungsi LOKAL bernama confirm — keduanya bukan dialog bawaan.
      Menuduhnya akan memaksa orang mengganti nama fungsinya sendiri.
    */
    const m = b.match(/(?:^|[^.\w])(?:(window)\.)?(confirm|alert|prompt)\s*\(/)
    if (!m) return
    // tanpa `window.` → hanya dianggap bawaan bila TAK ada deklarasi lokal
    if (!m[1]) {
      /*
        Tanpa `window.`, nama itu bisa jadi FUNGSI LOKAL. `void confirm(gr.id)`
        di halaman penerimaan barang adalah fungsi buatan sendiri, dan
        menuduhnya akan memaksa orang mengganti nama fungsinya.

        Dicek tanpa RegExp dinamis: lapisan escape shell sudah merusak pola
        seperti ini beberapa kali hari ini, dan pencocokan teks biasa di sini
        sama tepatnya.
      */
      const nama = m[2]
      const tandaLokal = [
        'function ' + nama,
        'const ' + nama + ' =',
        'let ' + nama + ' =',
        nama + ': async',
        nama + ' = async',
      ]
      if (tandaLokal.some((t) => isi.includes(t))) return
    }
    temuan.push({ berkas: relative(AKAR, p), baris: i + 1, apa: m[2], teks: b.trim().slice(0, 70) })
  })
}

if (temuan.length > 0) {
  console.error(`❌ ${temuan.length} dialog bawaan peramban:\n`)
  for (const t of temuan) console.error(`   ${t.berkas}:${t.baris}  ${t.apa}()\n     ${t.teks}`)
  console.error(`
   Dialog bawaan memakai tombol berbahasa SISTEM OPERASI, tak bisa
   membedakan tindakan merusak dari yang biasa, MEMBEKUKAN seluruh tab, dan
   DITEKAN peramban setelah muncul berkali-kali — confirm() yang ditekan
   memulangkan false diam-diam, jadi tindakannya tak pernah berjalan tanpa
   satu pun gejala.

   Pakai dari 'components/tanya':
     await tanya({ judul, pesan, nada: "bahaya" })   ganti confirm()
     await minta({ judul, panjang: true })           ganti prompt()
     void kabari(judul, pesan)                       ganti alert()
`)
  process.exit(1)
}

console.log(`✅ nol dialog bawaan di apps/web (${berkas.length} berkas dipindai)`)
