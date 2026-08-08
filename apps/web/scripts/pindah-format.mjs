#!/usr/bin/env node
/**
 * CODEMOD — pembungkus rupiah lokal → `lib/format`.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA CODEMOD, BUKAN SUNTINGAN TANGAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur: 127 pemanggilan `Intl`/`toLocaleString` di 60+ berkas. Menyuntingnya
 * satu per satu berarti 60 kesempatan salah ketik pada kode yang menampilkan
 * NOMINAL — kelas kesalahan yang paling mahal di aplikasi keuangan dan paling
 * sulit terlihat (angkanya tetap tampil, hanya salah).
 *
 * ── Yang diganti: HANYA satu bentuk
 *
 *     const <nama> = (n: number) =>
 *       new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR",
 *                                        maximumFractionDigits: 0 }).format(n);
 *
 * menjadi delegasi ke `formatRupiah`, dengan NAMA LOKAL DIPERTAHANKAN. Jadi
 * seluruh pemanggilan `fmt(x)` / `rupiah(x)` di berkas itu tak perlu disentuh
 * sama sekali — permukaan perubahannya satu baris per berkas, bukan 127.
 *
 * ── Yang SENGAJA TIDAK disentuh
 *
 *   - Pembungkus yang sudah punya penanganan null/format singkat sendiri
 *     (`aset/page.tsx` fmtRp dengan tangga M/jt, `kepatuhan` dengan cek
 *     Number.isFinite). Perilakunya belum tentu sama persis dengan
 *     `formatRupiah`/`formatRupiahSingkat`, dan menyamakannya diam-diam
 *     berarti mengubah tampilan tanpa ada yang memutuskannya.
 *   - `toLocaleString` polos — dipakai untuk angka NON-uang (kuantitas, luas),
 *     dan menggantinya butuh tahu konteksnya satu per satu.
 *
 * Keduanya tetap terhitung di `format-ratchet`, jadi tak hilang dari pandangan:
 * ia turun bertahap, bukan sekali sapu.
 *
 * Pakai:  node apps/web/scripts/pindah-format.mjs [--tulis]
 *         tanpa --tulis = pratinjau saja (baku).
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const TULIS = process.argv.includes('--tulis')

function berkasTsx(dir, keluar = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) berkasTsx(p, keluar)
    else if (e.name.endsWith('.tsx') && !e.name.includes('.test.')) keluar.push(p)
  }
  return keluar
}

/*
 * Bentuk sasaran, toleran terhadap pemenggalan baris dan titik-koma opsional.
 * Sengaja MENUNTUT `style: "currency"` — tanpa itu, pembungkus angka biasa
 * ikut tertangkap dan berubah jadi rupiah.
 */
const POLA_PEMBUNGKUS = new RegExp(
  String.raw`const (\w+) = \((\w+): number\) =>\s*` +
    String.raw`\n?\s*new Intl\.NumberFormat\(\s*["']id-ID["'],\s*\{\s*style:\s*["']currency["'],\s*` +
    String.raw`currency:\s*["']IDR["'],\s*maximumFractionDigits:\s*0\s*\}\s*\)\s*` +
    String.raw`\n?\s*\.format\(\2\);?`,
  'g',
)

const IMPOR = `import { formatRupiah } from "@/lib/format";`

let disentuh = 0
let total = 0

for (const f of berkasTsx(join(AKAR, 'app'))) {
  const asli = readFileSync(f, 'utf8')
  if (!POLA_PEMBUNGKUS.test(asli)) continue
  POLA_PEMBUNGKUS.lastIndex = 0

  let n = 0
  let hasil = asli.replace(POLA_PEMBUNGKUS, (_m, nama) => {
    n++
    return `const ${nama} = formatRupiah;`
  })

  /*
   * Impor ditaruh sesudah PERNYATAAN impor terakhir — dan "pernyataan" di sini
   * bukan "baris".
   *
   * Versi pertama memakai /^import .*$/m dan MERUSAK dua berkas: ia mencocokkan
   * BARIS PEMBUKA impor multi-baris (`import {`), lalu menyisipkan impor baru
   * di TENGAH daftar nama — menghasilkan `import {` diikuti `import ... from`,
   * yang gagal parse total (TS1003/TS1005 beruntun).
   *
   * Pola di bawah menuntut penutup `from "...";`, dengan `[\s\S]*?` supaya blok
   * multi-baris ikut tertelan utuh sampai penutupnya.
   */
  if (!hasil.includes('@/lib/format')) {
    const impor = [...hasil.matchAll(/^import\s[\s\S]*?from\s+["'][^"']+["'];?/gm)]
    if (impor.length) {
      const akhir = impor[impor.length - 1]
      const pos = akhir.index + akhir[0].length
      hasil = hasil.slice(0, pos) + '\n' + IMPOR + hasil.slice(pos)
    } else {
      hasil = IMPOR + '\n' + hasil
    }
  }

  const rel = relative(AKAR, f).split(sep).join('/')
  console.log(`${TULIS ? 'TULIS' : 'pratinjau'}  ${rel}  (${n} pembungkus)`)
  if (TULIS) writeFileSync(f, hasil)
  disentuh++
  total += n
}

console.log(`\n${disentuh} berkas, ${total} pembungkus.`)
if (!TULIS) console.log('Pratinjau saja. Tambahkan --tulis untuk menerapkan.')
