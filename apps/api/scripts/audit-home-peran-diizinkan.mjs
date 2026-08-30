#!/usr/bin/env node
/**
 * audit-home-peran-diizinkan.mjs — ambang NOL
 *
 * ══════════════════════════════════════════════════════════════════════════
 * SATU INVARIANT, TIGA KALI DILANGGAR
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `middleware.ts` punya dua peta yang HARUS sepakat:
 *
 *     ROLE_HOME     ke mana peran dilempar sesudah login
 *     ROLE_ALLOWED  prefiks rute yang boleh dibukanya
 *
 * Kalau `ROLE_HOME[x]` tidak tercakup `ROLE_ALLOWED[x]`, redirect ke home
 * ditolak lagi — dan ditolak lagi, tanpa akhir. Gejalanya
 * ERR_TOO_MANY_REDIRECTS: layar kosong, dan tak ada satu pun galat yang
 * menyebut middleware.
 *
 * Riwayatnya di repo ini, semuanya tercatat di komentar `middleware.ts`:
 *
 *     2026-08-02  `pm` home /dashboard, tapi /dashboard tak di izinnya
 *     2026-08-17  tiga sub-menu Master Data terlempar — halamannya ADA
 *     2026-08-22  `/admin-portal` nyaris terlewat saat portal admin dibuat
 *
 * Ketiganya bentuk kegagalan yang sama: middleware menutup jalan SEBELUM
 * halaman sempat dimuat, tanpa galat, sehingga orang menyimpulkan modulnya
 * belum jadi.
 *
 * ── Kenapa penjaga skrip, bukan test unit
 *
 * `middleware.ts` berjalan di runtime edge Next.js dan tak diimpor test API.
 * Yang bisa diperiksa lintas-lingkungan adalah TEKSNYA — dan itu cukup,
 * karena yang dijaga adalah kesepakatan dua konstanta, bukan perilaku runtime.
 *
 * Ambang NOL.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SKRIP = dirname(fileURLToPath(import.meta.url))
const AKAR = dirname(dirname(SKRIP))            // apps/
const BERKAS = join(AKAR, 'web', 'middleware.ts')

let src
try {
  src = readFileSync(BERKAS, 'utf8')
} catch {
  console.error(`❌ Tak bisa membaca ${BERKAS}`)
  console.error('   Jalur meleset — nol temuan BUKAN bukti tak ada pelanggaran.')
  process.exit(1)
}

/** Ambil isi objek `const NAMA: ... = { … }` sebagai teks. */
function blok(nama) {
  const i = src.search(new RegExp(`const\\s+${nama}\\b[^=]*=\\s*\\{`))
  if (i === -1) return null
  const mulai = src.indexOf('{', i)
  let dalam = 0
  for (let j = mulai; j < src.length; j++) {
    if (src[j] === '{') dalam++
    else if (src[j] === '}') {
      dalam--
      if (dalam === 0) return src.slice(mulai + 1, j)
    }
  }
  return null
}

const teksHome = blok('ROLE_HOME')
const teksAllowed = blok('ROLE_ALLOWED')

if (!teksHome || !teksAllowed) {
  console.error('❌ ROLE_HOME atau ROLE_ALLOWED tak ditemukan di middleware.ts')
  console.error('   Bentuknya berubah — penjaga ini harus ikut, bukan dibiarkan hijau.')
  process.exit(1)
}

/* Baris komentar dibuang: komentar di sini MEMBAHAS rute panjang lebar, dan
   menghitungnya sebagai deklarasi akan menghasilkan positif palsu. */
const tanpaKomentar = (t) =>
  t.split('\n').filter((b) => !b.trim().startsWith('//')).join('\n')

const home = {}
for (const m of tanpaKomentar(teksHome).matchAll(/(\w+)\s*:\s*"([^"]+)"/g)) {
  home[m[1]] = m[2]
}

const allowed = {}
for (const m of tanpaKomentar(teksAllowed).matchAll(/(\w+)\s*:\s*\[([^\]]*)\]/g)) {
  allowed[m[1]] = [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1])
}

console.log('══ Home tiap peran wajib ada di daftar izinnya ═════════════════')
console.log('  peran di ROLE_HOME    :', Object.keys(home).length)
console.log('  peran di ROLE_ALLOWED :', Object.keys(allowed).length)

if (Object.keys(home).length === 0 || Object.keys(allowed).length === 0) {
  console.error('\n❌ NOL peran terbaca — pembacaan meleset, bukan berkas yang bersih.')
  process.exit(1)
}

const temuan = []

for (const [peran, tujuan] of Object.entries(home)) {
  const izin = allowed[peran]
  if (!izin) {
    temuan.push(`${peran}: ada di ROLE_HOME tapi TIDAK di ROLE_ALLOWED — setiap redirect ditolak`)
    continue
  }
  /* Cocok di BATAS SEGMEN — sama dengan cara middleware mencocokkannya.
     `/m` tak boleh dianggap mencakup `/master`. */
  const cocok = izin.some((p) => tujuan === p || tujuan.startsWith(p + '/'))
  if (!cocok) {
    temuan.push(
      `${peran}: home "${tujuan}" tak tercakup izinnya [${izin.join(', ')}]` +
        `\n        → redirect ke home ditolak lagi, berulang: ERR_TOO_MANY_REDIRECTS`
    )
  }
}

console.log('  pelanggaran           :', temuan.length)

if (temuan.length) {
  console.error(`\n❌ ${temuan.length} peran akan terjebak redirect tanpa akhir:`)
  for (const t of temuan) console.error('     ·', t)
  console.error(`
   Perbaikan: tambahkan prefiks home ke ROLE_ALLOWED peran itu, ATAU turunkan
   home-nya ke halaman yang memang haknya.

   Yang TIDAK boleh: menaikkan home tanpa membuka izinnya. Layar akan kosong,
   dan tak satu pun galat menyebut middleware — orang akan mencari sebabnya
   di React, di API, di mana pun kecuali di sini.`)
  process.exit(1)
}

console.log('\n✅ Tiap peran bisa mencapai home-nya sendiri.')
