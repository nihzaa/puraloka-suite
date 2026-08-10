#!/usr/bin/env node
/**
 * PENJAGA — jalur tulis asisten, ambang NOL (S6).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA JALUR INI PALING PANTAS DIJAGA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Founder memilih "CRUD terbatas + token konfirmasi", MELAMPAUI TJS yang nol
 * create/update/delete. Yang membuatnya boleh ada cuma satu hal: **jalur
 * tulisnya tak bisa dipicu kalimat model.**
 *
 * `audit-tool-ai-read-only` sudah menuliskan titik lemah I-1 dengan tepat:
 * "sesi berikutnya menambahkan tool yang menulis karena kelihatannya
 * berguna". Penjaga ini menjaga sisi lainnya — bahwa jalur tulis yang MEMANG
 * ada tetap menuntut token, tetap terbatas daftar putih, dan tetap nol hapus.
 *
 * Yang dijaga:
 *
 *   W-1  rute tulis WAJIB mengklaim token sebelum menulis
 *   W-2  klaimnya ATOMIK — `dipakai_pada IS NULL` ikut di WHERE
 *   W-3  daftar putih tak memuat entitas berisiko (uang, kontrak, keselamatan)
 *   W-4  NOL aksi 'hapus' di mana pun
 *   W-5  izin tulis TERPISAH dari izin chat
 *
 * Terbukti bisa MERAH: `bash scripts/bukti-mutasi-tulis.sh`.
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')
const RUTE = join(AKAR, 'routes', 'v1', 'ai-tulis.ts')
const DAFTAR = join(AKAR, 'lib', 'ai-tool-siapkan.ts')

function tanpaKomentar(src) {
  let blok = false
  return src
    .split('\n')
    .map((b) => {
      const t = b.trim()
      if (blok) {
        if (t.includes('*/')) blok = false
        return ''
      }
      if (t.startsWith('/*')) {
        if (!t.includes('*/')) blok = true
        return ''
      }
      if (t.startsWith('//') || t.startsWith('*')) return ''
      return b
    })
    .join('\n')
}

let gagal = 0
const lapor = (kode, pesan) => {
  console.error(`  ❌ ${kode}: ${pesan}`)
  gagal++
}

console.log('── audit: jalur tulis berkonfirmasi ──')

const rute = tanpaKomentar(readFileSync(RUTE, 'utf8'))
const daftar = tanpaKomentar(readFileSync(DAFTAR, 'utf8'))

/*
 * ── W-1 & W-2: klaim token, dan klaimnya ATOMIK ───────────────────────────
 *
 * Diperiksa di dalam handler `/ai/tulis`, bukan di seluruh berkas: rute
 * `siapkan-tulis` juga menyentuh tabel token, dan memeriksa berkas utuh akan
 * hijau meski handler tulisnya sendiri kehilangan klaimnya.
 *
 * (Pelajaran P-5 di `audit-registry-penyedia` beberapa jam sebelumnya:
 * memeriksa KEMUNCULAN nama tabel, bukan PERBUATAN di tempat yang benar.)
 */
const iTulis = rute.search(/'\/api\/v1\/ai\/tulis'/)
if (iTulis === -1) {
  lapor('W-1', 'handler `/api/v1/ai/tulis` tak ditemukan')
} else {
  const badan = rute.slice(iTulis)

  if (!/\.update\(\{\s*dipakai_pada/.test(badan)) {
    lapor(
      'W-1',
      'rute tulis tak MENGKLAIM token.\n' +
        '        Tanpa klaim, satu token bisa dipakai berkali-kali — dan tiap\n' +
        '        pemakaian menghasilkan baris baru yang terlihat sah.',
    )
  }

  if (!/\.is\(\s*'dipakai_pada'\s*,\s*null\s*\)/.test(badan)) {
    lapor(
      'W-2',
      'klaim token TIDAK atomik — `dipakai_pada IS NULL` tak ada di WHERE.\n' +
        '        Dua klik bersamaan sama-sama melihat "belum dipakai", dan DUA\n' +
        '        baris tercipta. Pengguna melihat catatan gandanya dan tak tahu\n' +
        '        mana yang benar.',
    )
  }

  // Tulisan WAJIB terjadi SESUDAH klaim. Urutan terbalik berarti barisnya
  // tercipta lalu klaimnya gagal — dan tak ada yang membatalkannya.
  const iKlaim = badan.search(/\.is\(\s*'dipakai_pada'\s*,\s*null\s*\)/)
  const iInsert = badan.search(/\.viaProject\([^)]*\)\s*\n?\s*\.insert\(/)
  if (iKlaim !== -1 && iInsert !== -1 && iInsert < iKlaim) {
    lapor('W-2', 'tulisan terjadi SEBELUM klaim token — urutannya terbalik')
  }
}

// ── W-3: daftar putih tak memuat entitas berisiko ──────────────────────────
//
// Uang, kontrak, dan keselamatan. Ketiganya punya sifat yang sama: salah isi
// tak bisa sekadar diperbaiki.
const BERISIKO = [
  ['kasbons', 'uang'],
  ['invoices', 'uang + hukum'],
  ['change_orders', 'mengubah nilai kontrak'],
  ['ncr_items', 'dasar klaim ke subkon'],
  ['izin_kerja', 'gerbang keselamatan'],
  ['payments', 'uang'],
  ['users', 'identitas & akses'],
  ['role_permissions', 'kewenangan'],
]
for (const [tabel, sebab] of BERISIKO) {
  if (new RegExp(`tabel:\\s*'${tabel}'`).test(daftar)) {
    lapor(
      'W-3',
      `entitas berisiko '${tabel}' (${sebab}) masuk daftar putih tulis.\n` +
        '        Daftar putih hanya untuk yang salah-isinya bisa diperbaiki\n' +
        '        tanpa konsekuensi uang, hukum, atau keselamatan.',
    )
  }
}

// ── W-4: NOL hapus ─────────────────────────────────────────────────────────
if (/'hapus'/.test(daftar) && !/not\s*\(?\s*'hapus'|tak ada 'hapus'/i.test(daftar)) {
  // Yang dicari nilai `aksi`, bukan kata mana pun — komentar memang
  // MEMBAHAS 'hapus' panjang lebar, dan menghukum penjelasan itu salah.
  const aksiHapus = /aksi:\s*\[[^\]]*'hapus'/.test(daftar)
  if (aksiHapus) {
    lapor(
      'W-4',
      "aksi 'hapus' muncul di daftar putih.\n" +
        '        Menghapus lewat kalimat adalah operasi yang tak punya jejak\n' +
        '        niat: yang menyesal tak bisa membuktikan ia tak bermaksud.',
    )
  }
}
if (/\.delete\(\)/.test(rute)) {
  lapor('W-4', 'rute tulis memanggil `.delete()` — jalur tulis tak boleh menghapus')
}

// ── W-5: izin tulis TERPISAH dari izin chat ────────────────────────────────
if (!/requirePermission\('ai:tulis'\)/.test(rute)) {
  lapor('W-5', "rute tulis tak bergerbang `requirePermission('ai:tulis')`")
}
if (/requirePermission\('ai:chat'\)/.test(rute)) {
  lapor(
    'W-5',
    'rute tulis memakai izin `ai:chat`.\n' +
      '        Yang boleh BERTANYA bukan otomatis yang boleh MENCATAT — kalau\n' +
      '        satu izin, memberi akses asisten diam-diam memberi jalan menulis.',
  )
}

if (gagal > 0) {
  console.error(`\n❌ ${gagal} pelanggaran. Ambang penjaga ini NOL — lihat kepala berkas.`)
  process.exit(1)
}
console.log('  ✅ W-1..W-5 lulus (ambang NOL)')
