#!/usr/bin/env node
/**
 * PENJAGA: TIAP RUTE OTOMASI WAJIB PUNYA ENTRI DI `KATALOG_TUGAS`.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA — cacat nyata, ditemukan 2026-08-19
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur: 58 rute `/api/v1/otomasi/jalankan/*` terdaftar di kode, tetapi
 * `KATALOG_TUGAS` di `routes/v1/jadwal.ts` cuma memuat 53 entri. Lima rute
 * tak dikenal katalog:
 *
 *   klien-didiamkan · bbm-melonjak · uji-material-gagal
 *   barang-tertahan · sengketa-menggantung
 *
 * Ketiga yang pertama sudah begitu selama tiga hari.
 *
 * ── BENTUK KEGAGALANNYA: SEPI SEMPURNA
 *
 * Penjadwal hanya menjalankan tugas yang dikenal `KATALOG_TUGAS`. Baris di
 * `jadwal_tugas` untuk kelima tugas itu ADA, `aktif = true`, migrasinya lulus
 * verifikasi, katalog UI memperlihatkannya sebagai terpasang — dan tak satu
 * pun dari kelimanya pernah dipanggil.
 *
 * Tak ada galat. Tak ada 404. Tak ada baris log. Satu-satunya gejalanya adalah
 * sesuatu yang TIDAK terjadi, dan hal yang tidak terjadi tak menimbulkan
 * tiket.
 *
 * ── KENAPA `audit-tugas-punya-rute` TIDAK MENANGKAPNYA
 *
 * Penjaga itu memeriksa arah SEBALIKNYA: tiap entri `KATALOG_TUGAS` menunjuk
 * rute yang benar-benar terdaftar. Ia menjawab "adakah di ujung sana sesuatu
 * yang menjawab?".
 *
 * Yang bolong adalah arah satunya: rute yang ada tetapi tak pernah dipanggil
 * siapa pun. Sama seperti `audit-rute-penjadwal-punya-tugas` yang ditulis
 * untuk melengkapi `audit-tugas-punya-rute` di lapis `jadwal_tugas`, penjaga
 * ini melengkapinya di lapis `KATALOG_TUGAS`.
 *
 * Ketiganya memeriksa rantai yang sama pada tiga titik berbeda:
 *
 *   jadwal_tugas.tugas  ->  KATALOG_TUGAS[kunci]  ->  app.get(jalur)
 *      ^-- rute-penjadwal      ^-- INI                ^-- tugas-punya-rute
 *          -punya-tugas
 *
 * ── AMBANG NOL. Rute otomasi yang tak terpanggil tak punya alasan untuk ada.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const DIR = dirname(fileURLToPath(import.meta.url))
const SRC = join(DIR, '..', 'src', 'routes', 'v1')

/**
 * Buang komentar sebelum memindai.
 *
 * Kelas cacat yang sudah memakan waktu LIMA KALI di repo ini: rute yang
 * "ditemukan" ternyata contoh di dalam komentar, atau sebaliknya entri
 * katalog yang dikira ada padahal sedang dikomentari.
 *
 * Urutannya penting — blok dibuang lebih dulu, karena `//` di dalam blok
 * komentar bukan komentar baris.
 */
function tanpaKomentar(teks) {
  return teks
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '')
}

const rute = readFileSync(join(SRC, 'otomasi-terjadwal.ts'), 'utf8')
const jadwal = readFileSync(join(SRC, 'jadwal.ts'), 'utf8')

const AWALAN = '/api/v1/otomasi/jalankan/'

const terdaftar = new Set(
  [...tanpaKomentar(rute).matchAll(/app\.get\(\s*'([^']*)'/g)]
    .map((m) => m[1])
    .filter((j) => j.startsWith(AWALAN))
    .map((j) => j.slice(AWALAN.length)),
)

/*
  Jalur di katalog boleh membawa query string — `sapa-proaktif` memakainya
  untuk `?sapaan=1`. Yang dicocokkan adalah bagian sebelum `?`, sama seperti
  yang dilakukan `audit-tugas-punya-rute` di arah sebaliknya.
*/
const dikatalog = new Set(
  [...tanpaKomentar(jadwal).matchAll(/jalur:\s*'([^']*)'/g)]
    .map((m) => m[1].split('?')[0])
    .filter((j) => j.startsWith(AWALAN))
    .map((j) => j.slice(AWALAN.length)),
)

const yatim = [...terdaftar].filter((k) => !dikatalog.has(k)).sort()

console.log(`Rute otomasi terdaftar : ${terdaftar.size}`)
console.log(`Entri KATALOG_TUGAS    : ${dikatalog.size}`)

if (yatim.length > 0) {
  console.error(`\n✗ ${yatim.length} rute otomasi TANPA entri di KATALOG_TUGAS:\n`)
  for (const k of yatim) console.error(`    ${AWALAN}${k}`)
  console.error(
    '\nPenjadwal hanya menjalankan tugas yang dikenal KATALOG_TUGAS.'
    + '\nRute di atas tak akan pernah dipanggil — tanpa galat, tanpa 404,'
    + '\ntanpa satu baris log. Tambahkan entrinya di routes/v1/jadwal.ts.',
  )
  process.exit(1)
}

console.log('\n✓ Tiap rute otomasi punya entri di KATALOG_TUGAS.')
