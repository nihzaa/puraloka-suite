#!/usr/bin/env node
/**
 * CODEMOD — judul halaman buatan sendiri → `KepalaHalaman`.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-08: `KepalaHalaman` dipakai **0 dari 105 halaman**, padahal
 * komponennya ada, bertoken penuh, dan sudah ber-test. Akibatnya tiap halaman
 * menulis judulnya sendiri — dan hasilnya **27 varian gaya `<h1>` berbeda**:
 *
 *     fontSize   20 · 22 · 26 · 28
 *     fontWeight 700 · 800
 *     warna      C.text · var(--text-primary) · campuran
 *
 * Inilah sumber paling langsung dari "tiap halaman terasa buatan sendiri" —
 * dan yang paling murah diperbaiki, karena tak menyentuh isi halaman.
 *
 * ── Kenapa BERTAHAP, bukan sekali sapu
 *
 * Struktur di sekitar `<h1>` TIDAK seragam: sebagian dibungkus `<header>`
 * dengan tombol aksi, sebagian punya ubin ikon, sebagian polos. Regex yang
 * cukup longgar untuk menangkap semuanya juga cukup longgar untuk merusak
 * markup — dan kerusakannya di halaman produksi.
 *
 * Karena itu codemod ini hanya menyasar **satu bentuk yang benar-benar
 * seragam**, dan sisanya sengaja ditinggalkan untuk penyebaran berikutnya.
 * Pelajaran ini mahal: pada UIR-1, codemod yang polanya "hampir benar"
 * menyisipkan impor di tengah daftar nama dan merusak dua berkas.
 *
 * ── Bentuk yang disasar
 *
 *     <div className="rise" style={{ … }}>
 *       <h1 style={{ … }}>Judul Literal</h1>
 *       <p style={{ … }}>Keterangan…</p>
 *     </div>
 *
 * menjadi `<KepalaHalaman judul="…" keterangan="…" />`.
 *
 * Syaratnya ketat, dan tiap syarat menutup satu cara gagal:
 *   - judul LITERAL (bukan ekspresi) — kalau tidak, teksnya bisa berubah arti
 *   - TANPA tombol/aksi di dalam wadah — `aksi` butuh keputusan per halaman
 *   - TANPA ubin ikon — ikonnya harus dipindah ke prop `ikon`, bukan dibuang
 *
 * Pakai:  node apps/web/scripts/pindah-judul.mjs [--tulis]
 *         tanpa --tulis = pratinjau (baku).
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const TULIS = process.argv.includes('--tulis')

function halaman(dir, keluar = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) halaman(p, keluar)
    else if (e.name === 'page.tsx') keluar.push(p)
  }
  return keluar
}

/**
 * Wadah judul: `<div …><h1 …>Literal</h1><p …>Keterangan</p></div>`
 *
 * `[^<>{]+` pada judul menolak ekspresi (`{nama}`) dan elemen bersarang.
 * `[^<]*` pada keterangan menerima teks polos saja — keterangan ber-<strong>
 * atau ber-{ekspresi} sengaja dilewati.
 */
const POLA = new RegExp(
  String.raw`<div className="rise" style=\{\{[^}]*\}\}>\s*` +
    String.raw`<h1 style=\{\{[^}]*\}\}>\s*([^<>{]+?)\s*</h1>\s*` +
    String.raw`<p style=\{\{[^}]*\}\}>\s*([^<{]+?)\s*</p>\s*` +
    String.raw`</div>`,
  'g',
)

/**
 * Bentuk KEDUA: kepala ber-ubin ikon, seragam di lima halaman `/pengaturan/*`.
 *
 *     <div style={{ …, marginBottom: 24, display:"flex", … }}>
 *       <div style={{ width: 40, height: 40, borderRadius: 10, background: C.navyLight, … }}>
 *         <Ruler size={19} color={C.navy} />
 *       </div>
 *       <div>
 *         <h1 …>Master Satuan</h1>
 *         <p …>keterangan…</p>
 *       </div>
 *     </div>
 *
 * Ubinnya TIDAK dibuang — ia pindah ke prop `ikon`, yang menggambar ubin
 * bertoken dengan ukuran & warna yang sama. Membuangnya berarti menghapus
 * penanda kategori yang justru diminta brief §3.3.
 */
/*
 * Dimulai dari UBIN-nya, bukan dari wadah luar.
 *
 * Versi pertama mencoba menelan wadah luar lebih dulu (`<div style={{…}}>`),
 * dan cocok NOL kali: `[^}]*` berhenti pada `}}` milik style wadah itu sendiri,
 * jadi polanya tak pernah sampai ke ubin. Yang diganti karena itu hanya ISI
 * kepala — wadah luarnya (flex + gap + marginBottom) dibiarkan di tempatnya,
 * dan `KepalaHalaman` hidup di dalamnya. Aman: wadahnya hanya mengatur jarak.
 */
const POLA_IKON = new RegExp(
  String.raw`<div style=\{\{ width: 40, height: 40, borderRadius: 10, background: C\.navyLight,[^}]*\}\}>\s*` +
    String.raw`<(\w+) size=\{(\d+)\} color=\{C\.navy\} />\s*</div>\s*` +
    String.raw`<div>\s*<h1 style=\{\{[^}]*\}\}>\s*([^<>{]+?)\s*</h1>\s*` +
    String.raw`<p style=\{\{[^}]*\}\}>\s*([^<{]+?)\s*</p>\s*</div>`,
  'g',
)

const IMPOR = 'import { KepalaHalaman } from "@/components/dasar";'

/** Rapikan spasi/baris baru dalam teks JSX jadi satu baris. */
const rapikan = (s) => s.replace(/\s+/g, ' ').trim()

let berkasDisentuh = 0
let totalGanti = 0

for (const f of halaman(join(AKAR, 'app'))) {
  const asli = readFileSync(f, 'utf8')
  /*
   * Gerbang harus menerima KEDUA bentuk.
   *
   * Versi pertama hanya menguji `POLA` (kepala polos) sebelum memutuskan
   * melewati berkas — sehingga kelima halaman `/pengaturan/*`, yang hanya
   * cocok `POLA_IKON`, tak pernah sempat diperiksa dan codemod melaporkan
   * "0 berkas" dengan polos. Polanya benar; gerbangnya yang menutup pintu.
   */
  POLA.lastIndex = 0
  POLA_IKON.lastIndex = 0
  const adaCalon = POLA.test(asli) || POLA_IKON.test(asli)
  POLA.lastIndex = 0
  POLA_IKON.lastIndex = 0
  if (!adaCalon) continue

  let n = 0
  let hasil = asli.replace(POLA, (_m, judul, keterangan) => {
    // Tanda kutip ganda dalam atribut akan memutus JSX — lewati, jangan tebak.
    if (judul.includes('"') || keterangan.includes('"')) return _m
    n++
    return `<KepalaHalaman\n        judul="${rapikan(judul)}"\n        keterangan="${rapikan(keterangan)}"\n      />`
  })

  hasil = hasil.replace(POLA_IKON, (_m, ikon, ukuran, judul, keterangan) => {
    if (judul.includes('"') || keterangan.includes('"')) return _m
    n++
    return (
      `<KepalaHalaman\n` +
      `        judul="${rapikan(judul)}"\n` +
      `        keterangan="${rapikan(keterangan)}"\n` +
      `        ikon={<${ikon} size={${ukuran}} />}\n` +
      `      />`
    )
  })
  if (n === 0) continue

  /*
   * Impor `KepalaHalaman`. TIGA keadaan, dan yang tengah sempat saya lewatkan.
   *
   * Versi pertama hanya memeriksa `includes('@/components/dasar')` lalu
   * menganggap urusan selesai bila cocok. Padahal berkas-berkas itu SUDAH
   * mengimpor `Tabel` dari modul yang sama — jadi pemeriksaannya benar,
   * kesimpulannya salah, dan kelima berkas berakhir memakai `KepalaHalaman`
   * tanpa mengimpornya (TS2304 di kelimanya).
   *
   * Pelajaran yang sama dengan UIR-1: yang menyelamatkan bukan kehati-hatian
   * menulis pola, melainkan `tsc` yang dijalankan segera sesudah codemod.
   */
  if (/\bKepalaHalaman\b[^\n]*from\s+["']@\/components\/dasar["']/.test(hasil)) {
    // (a) sudah diimpor — tak ada yang perlu dilakukan
  } else {
    const imporDasar = hasil.match(
      /import\s*\{([^}]*)\}\s*from\s*["']@\/components\/dasar["'];?/,
    )
    if (imporDasar) {
      // (b) modulnya sudah diimpor untuk nama lain → sisipkan ke daftar itu
      const nama = imporDasar[1].trim().replace(/,$/, '')
      hasil = hasil.replace(
        imporDasar[0],
        `import { ${nama}, KepalaHalaman } from "@/components/dasar";`,
      )
    } else {
      // (c) belum ada sama sekali → tambahkan sesudah PERNYATAAN impor terakhir
      const impor = [...hasil.matchAll(/^import\s[\s\S]*?from\s+["'][^"']+["'];?/gm)]
      if (impor.length) {
        const akhir = impor[impor.length - 1]
        const pos = akhir.index + akhir[0].length
        hasil = hasil.slice(0, pos) + '\n' + IMPOR + hasil.slice(pos)
      } else {
        hasil = IMPOR + '\n' + hasil
      }
    }
  }

  const rel = relative(AKAR, f).split(sep).join('/')
  console.log(`${TULIS ? 'TULIS' : 'pratinjau'}  ${rel}  (${n})`)
  if (TULIS) writeFileSync(f, hasil)
  berkasDisentuh++
  totalGanti += n
}

console.log(`\n${berkasDisentuh} berkas, ${totalGanti} judul.`)
if (!TULIS) console.log('Pratinjau saja. Tambahkan --tulis untuk menerapkan.')
