#!/usr/bin/env node
/**
 * PENJAGA: `var(--token)` YANG DIPAKAI HARUS BENAR-BENAR ADA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA — dua kali dalam satu sesi
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 2026-08-09, dua cacat berturut-turut dari kelas yang persis sama:
 *
 *   1. `--pad-lencana` dan tiga saudaranya bernilai STRING BERKUTIP
 *      (`"3px 8px"`) di `globals.css`. `padding: var(--pad-lencana)`
 *      menghasilkan nilai tak sah → paddingnya HILANG. Lencana terpotong,
 *      tombol saling tindih.
 *
 *   2. Halaman kredensial memakai `var(--sukses)`, `var(--bahaya)`,
 *      `var(--peringatan)` — enam token yang TIDAK PERNAH ADA. Nama yang
 *      benar `--success`, `--danger`, `--warning`. Warnanya hilang diam-diam.
 *
 * Keduanya lolos SELURUH penjaga yang ada: tsc bersih (CSS bukan TypeScript),
 * `hex-ratchet` senang (tak ada hex dipaku), `kerapatan-ratchet` justru
 * menghitungnya sebagai KEPATUHAN (token dipakai, angka tak dipaku).
 *
 * Yang kedua paling menipu: penjaga kerapatan MEMUJI kode yang warnanya
 * hilang, karena ia hanya bertanya "apakah memakai token" — bukan "apakah
 * tokennya ada".
 *
 * CSS tak punya kompilator yang mengeluh soal nama salah. Satu-satunya cara
 * cacat ini ketahuan adalah seseorang melihat halamannya — dan itu terjadi
 * hanya karena halaman itu kebetulan dipotret.
 *
 * ── Yang diperiksa
 *
 * Tiap `var(--nama)` di berkas .tsx/.ts harus punya definisi `--nama:` di
 * `globals.css`. Ambang NOL: token yang tak ada bukan utang teknis, ia bug
 * visual yang sudah aktif.
 *
 * Pakai:  node apps/web/scripts/uji-token-css-ada.mjs
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const WEB = resolve(__dirname, '..')
const GLOBALS = join(WEB, 'app', 'globals.css')

/**
 * Token yang didefinisikan di luar `globals.css` dan memang sah.
 *
 * `--font-*` datang dari `next/font` lewat variabel yang disuntik ke
 * `<html>`; `--tw-*` milik Tailwind. Keduanya tak akan pernah muncul di
 * globals.css, dan menuntutnya di sana justru salah.
 */
const SAH_DI_LUAR = [/^--font-/, /^--tw-/, /^--radix-/]

if (!existsSync(GLOBALS)) {
  console.error(`✗ globals.css tak ditemukan: ${GLOBALS}`)
  process.exit(1)
}

const css = readFileSync(GLOBALS, 'utf8')
const terdefinisi = new Set(
  [...css.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gim)].map((m) => m[1]),
)

/** Buang komentar TANPA mengubah jumlah baris — supaya nomornya bisa diklik. */
function tanpaKomentar(src) {
  let dalamBlok = false
  return src.split('\n').map((b) => {
    const t = b.trim()
    if (dalamBlok) {
      if (t.includes('*/')) dalamBlok = false
      return ''
    }
    if (t.startsWith('/*')) {
      if (!t.includes('*/')) dalamBlok = true
      return ''
    }
    if (t.startsWith('//') || t.startsWith('*')) return ''
    return b
  }).join('\n')
}

function berkasUi(dir) {
  const hasil = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.next' || e.name.startsWith('.')) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) hasil.push(...berkasUi(p))
    else if (/\.(tsx|ts)$/.test(e.name)) hasil.push(p)
  }
  return hasil
}

const berkas = [
  ...berkasUi(join(WEB, 'app')),
  ...berkasUi(join(WEB, 'components')),
  ...(existsSync(join(WEB, 'lib')) ? berkasUi(join(WEB, 'lib')) : []),
]

const hantu = new Map()   // token -> [{berkas, baris}]

for (const path of berkas) {
  const rel = path.slice(WEB.length + 1).replace(/\\/g, '/')
  // Komentar dibuang (jumlah baris dipertahankan): `var(--token)` yang ditulis
  // di dalam kalimat penjelas BUKAN pemakaian. Tanpa ini, dokumentasi yang baik
  // justru merahkan penjaga — dan itu mengajari orang berhenti menulis
  // penjelasan.
  const baris = tanpaKomentar(readFileSync(path, 'utf8')).split('\n')
  baris.forEach((isi, i) => {
    // Hanya `var(--nama)` yang TERTUTUP — kurung penutupnya wajib.
    //
    // Pola tanpa penutup menghasilkan dua tuduhan palsu saat pertama
    // dijalankan: `var(--token)` yang ditulis di dalam kalimat komentar, dan
    // `var(--naik-${naik})` di `dasar.tsx:169` yang namanya baru terbentuk
    // saat jalan. Yang kedua memang tak bisa diperiksa statis, dan menuduhnya
    // akan mendorong orang menonaktifkan penjaganya.
    for (const m of isi.matchAll(/var\(\s*(--[a-z0-9-]+)\s*[,)]/gi)) {
      const token = m[1]
      if (terdefinisi.has(token)) continue
      if (SAH_DI_LUAR.some((re) => re.test(token))) continue
      if (!hantu.has(token)) hantu.set(token, [])
      hantu.get(token).push({ berkas: rel, baris: i + 1 })
    }
  })
}

console.log('══ var(--token) yang dipakai harus ADA ═════════════════════')
console.log(`  berkas dipindai : ${berkas.length}`)
console.log(`  token di CSS    : ${terdefinisi.size}`)
console.log(`  token hantu     : ${hantu.size}`)
console.log('  ambang          : 0 (bukan ratchet)\n')

if (hantu.size > 0) {
  for (const [token, tempat] of hantu) {
    console.error(`   ✗ ${token}  — tak ada di globals.css`)
    for (const t of tempat.slice(0, 3)) console.error(`       ${t.berkas}:${t.baris}`)
    if (tempat.length > 3) console.error(`       …dan ${tempat.length - 3} tempat lain`)
  }
  console.error(`
   Token yang tak ada TIDAK menimbulkan error: CSS diam saja, propertinya
   diabaikan, dan warnanya/spasinya hilang tanpa gejala. tsc tak melihatnya
   (ini CSS), hex-ratchet senang (tak ada hex dipaku), dan kerapatan-ratchet
   justru MEMUJINYA — token dipakai, angka tak dipaku.

   Periksa ejaan di app/globals.css. Yang sering salah:
     --sukses      → --success       --sukses-lembut     → --success-bg
     --bahaya      → --danger        --bahaya-lembut     → --danger-bg
     --peringatan  → --warning       --peringatan-lembut → --warning-bg
`)
  process.exit(1)
}

console.log('✓ Semua token yang dipakai terdefinisi.')
