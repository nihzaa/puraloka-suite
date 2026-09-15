#!/usr/bin/env node
/**
 * PENJAGA TIPOGRAFI — `fontSize` yang dipaku, bukan lewat token.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Tipografi adalah SATU-SATUNYA kategori visual di repo ini yang tokennya
 * sudah jadi tapi tak punya rem. Warna punya `hex-ratchet.mjs`, kerapatan
 * punya `kerapatan-ratchet.mjs`, tombol primer punya
 * `uji-tombol-primer-seragam.mjs`. Ukuran huruf tidak punya apa pun.
 *
 * Tokennya SUDAH ADA di `app/globals.css` dan sudah bernilai benar —
 * `ARAH-VISUAL-2026.md` bagian "TIPOGRAFI — NAIK, bukan turun" menetapkannya:
 *
 *     --teks-tabel  12.5px   (dari 9-11px) — yang paling sering dibaca
 *     --teks-label    12px   (dari 11px)
 *     --teks-badan    14px   (dari 13px)
 *     --teks-kpi      28px   (dari 17px) — angka besar = hierarki tegas
 *     --teks-delta    12px   — "+2,3%" kecil di sebelahnya
 *
 * Diukur 2026-09-15 atas 159 `page.tsx` di `app/(dashboard)`:
 *
 *     fontSize dipaku          2.273  di 146 berkas
 *     fontSize: "var(--...)"   1.276
 *
 * Jadi tokennya benar, dipakai separuh, dan separuh lainnya masih angka.
 *
 * ── Kenapa ini BUKAN soal kerapian
 *
 * `ARAH-VISUAL-2026.md` mendiagnosis keluhan founder ("tiap halaman terasa
 * padat") dengan angka: font tabel 9-11px sementara standar data-dense
 * 12-14px. Keputusannya menaikkan seluruh tangga huruf. Selama 2.273 ukuran
 * ditulis langsung, keputusan tipografi BERIKUTNYA — apa pun itu — berarti
 * menyunting 146 berkas, dan yang terlewat akan tetap kecil.
 *
 * Biayanya sudah pernah dibayar di mobile: `potret-mobile.mjs` menemukan
 * 341 teks di bawah 12px dari RENDER, sementara pembacaan kode hanya melihat
 * 18 — satu gaya dipaku terulang di puluhan kartu. Yang dipaku menyebar
 * diam-diam, dan paling terasa justru di layar yang paling sering dibuka.
 *
 * ── Kenapa RATCHET, bukan ambang nol
 *
 * Menuntut nol berarti mengonversi 2.273 nilai dalam satu langkah. Pendekatan
 * borongan yang sama sudah DITOLAK untuk hex (`hex-ratchet.mjs` di sebelah),
 * dan alasannya masih berlaku: sebagian ukuran tak punya padanan token dan
 * butuh keputusan desain, bukan penggantian mekanis. Konversi borongan yang
 * terburu-buru melahirkan token bernama `--teks-kecil-3` yang tak berarti
 * apa-apa.
 *
 * Yang mendesak: menghentikan pertumbuhan. Halaman ke-N+1 disalin dari
 * halaman ke-N, jadi tanpa rem angkanya naik tiap minggu.
 *
 * ── Kenapa lantainya menyimpan DAFTAR NAMA, bukan cuma total
 *
 * CLAUDE.md bagian 6: "merah tanpa menyebut pelakunya memaksa orang
 * berikutnya menyisir 14 baris". Total saja memberi tahu BAHWA sesuatu
 * bertambah; daftar per-berkas memberi tahu DI MANA.
 *
 * Daftar per-berkas juga menangkap keadaan yang total buta terhadapnya:
 * satu berkas +5 sementara berkas lain -5. Totalnya tak bergerak, dan lima
 * pemakaian baru masuk tanpa satu pun tanda. Karena itu penjaga ini merah
 * atas KENAIKAN PER-BERKAS, bukan hanya atas total.
 *
 * ── Yang TIDAK dihitung, dan kenapa
 *
 * KOMENTAR dan STRING dibuang lebih dulu. CLAUDE.md bagian 8a.2 mencatat
 * kelas cacat ini secara khusus: "komentar yang menyebut hal terlarang untuk
 * menjelaskan kenapa ia TIDAK dipakai — penjaga memindai teks, jadi tetap
 * terhitung sebagai pemakaian". Berkas ini sendiri memuat contoh `fontSize`
 * di komentarnya; penjaga yang naif akan menuduh dirinya sendiri.
 *
 * `hex-ratchet.mjs` membayar pelajaran ini dua kali: versi pertamanya
 * memeriksa per-BARIS, jadi komentar JSX berindentasi lolos dan DUA kalimat
 * penjelasan menaikkan angkanya 48 menjadi 50 lalu memerahkan penjaganya.
 * Yang dipakai di sini pembuangan sadar-keadaan atas SELURUH berkas, bukan
 * tebakan per-baris.
 *
 * `fontSize: "var(--...)"` justru yang BENAR — tak dihitung.
 *
 * `scripts/**` dan berkas test dilewati: keduanya bukan UI yang dilihat
 * pengguna, dan skrip potret memang menulis ukuran huruf sendiri.
 *
 * Jalankan       : node apps/web/scripts/teks-ratchet.mjs
 * Lihat pelakunya: node apps/web/scripts/teks-ratchet.mjs --daftar
 * Kencangkan     : node apps/web/scripts/teks-ratchet.mjs --naikkan
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { join, relative, sep, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const DI_SINI = dirname(fileURLToPath(import.meta.url))
const AKAR = join(DI_SINI, '..')
const BERKAS_LANTAI = join(DI_SINI, 'teks-lantai.json')
const LEWATI_DIR = new Set(['node_modules', '.next', '.layar', 'scripts', 'dist'])

/** 159 `page.tsx` di app/(dashboard) — cakupan yang diukur, bukan seluruh repo. */
function halaman(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (LEWATI_DIR.has(e.name)) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) { halaman(p, out); continue }
    if (e.name === 'page.tsx') out.push(p)
  }
  return out
}

/**
 * Netralkan komentar, pertahankan panjang & baris.
 *
 * Tiap karakter komentar diganti spasi (newline tetap newline) sehingga
 * offset dan nomor baris di hasilnya IDENTIK dengan berkas asli. Penjaga
 * yang merah dengan nomor baris meleset menyuruh orang mencari sendiri.
 *
 * Isi STRING ikut dinetralkan, dengan satu kekecualian yang disengaja:
 * ANGKA di dalam string dipertahankan bila string itu adalah nilai langsung
 * sebuah `fontSize` — sebab `fontSize: "14"` sama dipakunya dengan
 * `fontSize: 14`. Yang dibuang adalah string BEBAS, tempat kata "fontSize"
 * bisa muncul sebagai teks biasa.
 *
 * Escape `\\` dihormati di dalam string, jadi `"teks \\" fontSize: 99"` tak
 * membuat pemindai keluar terlalu dini lalu menuduh angka yang ada DI DALAM
 * teks.
 */
function netralkan(isi) {
  const n = isi.length
  const keluar = isi.split('')
  let i = 0
  const kosongkan = (a, b) => {
    for (let k = a; k < b && k < n; k++) keluar[k] = isi[k] === '\n' ? '\n' : ' '
  }

  while (i < n) {
    const c = isi[i]
    const d = isi[i + 1]

    if (c === '/' && d === '/') {
      let j = i
      while (j < n && isi[j] !== '\n') j++
      kosongkan(i, j)
      i = j
      continue
    }

    if (c === '/' && d === '*') {
      let j = i + 2
      while (j < n && !(isi[j] === '*' && isi[j + 1] === '/')) j++
      j = Math.min(n, j + 2)
      kosongkan(i, j)
      i = j
      continue
    }

    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1
      while (j < n) {
        if (isi[j] === '\\') { j += 2; continue }
        if (isi[j] === c) { j++; break }
        j++
      }
      // Isi string dikosongkan KECUALI bila ia nilai langsung `fontSize:`.
      // Tanpa kekecualian ini bentuk berkutip lolos sepenuhnya, dan penjaga
      // yang buta terhadap separuh bentuk pelanggaran lebih buruk daripada
      // tak ada penjaga: ia memberi rasa aman atas hal yang tak dijaga.
      const sebelum = isi.slice(Math.max(0, i - 24), i)
      const nilaiFontSize = /\bfontSize\s*:\s*$/.test(sebelum)
      if (!nilaiFontSize) kosongkan(i + 1, j - 1)
      i = j
      continue
    }

    i++
  }
  return keluar.join('')
}

/**
 * `fontSize: 14` / `fontSize: "14"` / `fontSize: 12.5` — nilai ANGKA.
 *
 * `fontSize: "var(--teks-badan)"` sengaja tak cocok: itu yang benar.
 */
const POLA = /\bfontSize\s*:\s*"?(\d+(?:\.\d+)?)"?/g

const perBerkas = {}
let total = 0

for (const f of halaman(join(AKAR, 'app', '(dashboard)'))) {
  if (/\.(test|spec)\./.test(f)) continue
  const bersih = netralkan(readFileSync(f, 'utf8'))
  const rel = relative(AKAR, f).split(sep).join('/')

  const n = [...bersih.matchAll(POLA)].length
  if (n > 0) { perBerkas[rel] = n; total += n }
}

const daftarUrut = Object.entries(perBerkas).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))

if (process.argv.includes('--daftar')) {
  for (const [f, n] of daftarUrut) console.log(`${String(n).padStart(4)}  ${f}`)
  console.log(`\n  ${total} fontSize dipaku di ${daftarUrut.length} berkas`)
  process.exit(0)
}

const isiLantai = () => ({
  _catatan: 'Lantai fontSize DIPAKU di app/(dashboard)/**/page.tsx. Boleh TURUN, tak boleh NAIK.',
  _kenapa: 'Tipografi satu-satunya kategori visual bertoken yang tak punya rem. Selama ukuran ditulis langsung, keputusan tipografi berikutnya menyentuh 146 berkas dan yang terlewat tetap kecil.',
  _cara: 'Pakai var(--teks-tabel|--teks-label|--teks-badan|--teks-kpi|--teks-delta) dari app/globals.css. Kalau ukurannya belum punya token, TAMBAHKAN tokennya.',
  _cakupan: '159 page.tsx di apps/web/app/(dashboard) — bukan seluruh repo, bukan components/.',
  _diukur: new Date().toISOString().slice(0, 10),
  total,
  berkas: Object.fromEntries(daftarUrut),
})

if (!existsSync(BERKAS_LANTAI)) {
  writeFileSync(BERKAS_LANTAI, JSON.stringify(isiLantai(), null, 2) + '\n')
  console.log(`Lantai dibuat pertama kali: ${total} di ${daftarUrut.length} berkas.`)
  process.exit(0)
}

const lantai = JSON.parse(readFileSync(BERKAS_LANTAI, 'utf8'))

if (process.argv.includes('--naikkan')) {
  writeFileSync(BERKAS_LANTAI, JSON.stringify({
    ...isiLantai(),
    _riwayat: [...(lantai._riwayat || []), `${lantai.total} -> ${total}`],
  }, null, 2) + '\n')
  console.log(`Lantai diperbarui: ${lantai.total} -> ${total}`)
  process.exit(0)
}

console.log('\n== RATCHET tipografi (fontSize dipaku) ' + '='.repeat(30))
console.log('  cakupan            : app/(dashboard)/**/page.tsx')
console.log(`  fontSize dipaku    : ${total} di ${daftarUrut.length} berkas`)
console.log(`  lantai (maks)      : ${lantai.total} di ${Object.keys(lantai.berkas || {}).length} berkas`)

// Selisih PER-BERKAS, bukan cuma total: satu berkas +5 sementara yang lain
// -5 membuat total diam padahal ada lima pemakaian baru.
const lama = lantai.berkas || {}
const naik = []
for (const [f, n] of daftarUrut) {
  const sebelum = lama[f] ?? 0
  if (n > sebelum) naik.push(`${f}: ${sebelum} -> ${n}  (+${n - sebelum})`)
}

if (total > lantai.total || naik.length) {
  console.error(`\n❌ fontSize DIPAKU BERTAMBAH: ${lantai.total} -> ${total}\n`)
  console.error('   Ukuran huruf yang ditulis langsung membuat keputusan tipografi')
  console.error('   berikutnya menyentuh puluhan berkas, dan yang terlewat tetap kecil.')
  console.error('   ARAH-VISUAL-2026 sudah menaikkan seluruh tangga huruf sekali;')
  console.error('   yang dipaku tidak ikut naik.\n')
  console.error('   Pakai token, bukan angka:')
  console.error('     var(--teks-tabel)  12.5px  baris tabel — yang paling sering dibaca')
  console.error('     var(--teks-label)    12px  label & keterangan')
  console.error('     var(--teks-badan)    14px  teks isi')
  console.error('     var(--teks-kpi)      28px  angka besar')
  console.error('     var(--teks-delta)    12px  "+2,3%" di sebelah angka besar\n')
  console.error('   Berkas yang BERTAMBAH:')
  naik.slice(0, 20).forEach((b) => console.error(`     ${b}`))
  if (naik.length > 20) console.error(`     ... dan ${naik.length - 20} berkas lagi`)
  console.error('\n   Daftar lengkap: node apps/web/scripts/teks-ratchet.mjs --daftar\n')
  process.exit(1)
}

if (total < lantai.total) {
  writeFileSync(BERKAS_LANTAI, JSON.stringify({
    ...isiLantai(),
    _riwayat: [...(lantai._riwayat || []), `${lantai.total} -> ${total} (otomatis)`],
  }, null, 2) + '\n')
  console.log(`\n  ✅ TURUN ${lantai.total} -> ${total}. Lantai ikut turun — terkunci.\n`)
  process.exit(0)
}

console.log('\n  ✅ tidak bertambah.\n')
