#!/usr/bin/env node
/**
 * PENJAGA L-4: KOLOM JADWAL WAJIB PUNYA PEMBACA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA — dan kenapa bentuknya seaneh ini
 * ══════════════════════════════════════════════════════════════════════════
 *
 * TJS Command Center punya `BackupPolicy` dengan kolom `scheduleType`,
 * `scheduleTime`, dan `nextRunAt` — BERTAHUN-TAHUN, tanpa satu pun kode yang
 * membacanya. Backup hanya jalan kalau ada yang menekan tombol. Komentar
 * mereka sendiri yang menuliskannya:
 *
 *     "backup terjadwal selama ini ada di layar, tidak di kenyataan."
 *
 * Cacat itu SEMPURNA tersembunyi: UI menampilkan jadwal, basis menyimpannya,
 * tak ada error, tak ada test merah. Satu-satunya gejalanya adalah sesuatu
 * yang TIDAK terjadi — dan hal yang tidak terjadi tak menimbulkan tiket.
 *
 * Puraloka punya kembarannya sendiri: `utils/notifications.ts:167` mengaku
 * sistem menulis `channel: 'push'` ke basis tanpa pernah benar-benar mengirim
 * push, dan nol user berlangganan.
 *
 * ── Yang diperiksa
 *
 * Tiap kolom jadwal di `jadwal_tugas` harus DISEBUT di kode aplikasi, bukan
 * hanya di migrasi. Menyebut di migrasi berarti "kolomnya ada"; menyebut di
 * kode berarti "ada yang memakainya".
 *
 * Ini pemeriksaan kasar dan sengaja begitu — ia tak bisa membuktikan kolomnya
 * dipakai DENGAN BENAR. Yang dijamin cuma satu: kolom jadwal tak bisa hidup
 * bertahun-tahun tanpa pembaca sama sekali. Untuk kebenarannya, ada
 * `jadwal.test.ts` (20 test) dan uji end-to-end pemicunya.
 *
 * Ambang NOL — tabelnya baru lahir bersama pembacanya, jadi tak ada
 * pelanggaran yang pantas diwariskan.
 *
 * Pakai:  node apps/api/scripts/audit-jadwal-punya-pembaca.mjs
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(__dirname, '..', 'src')

/**
 * Kolom yang HARUS punya pembaca, beserta alasan tiap-tiapnya.
 *
 * Alasannya ikut dicetak saat merah — supaya yang menemukannya tak perlu
 * menebak apa yang hilang.
 */
const WAJIB_DIBACA = [
  ['jenis',           'tanpa ini seluruh jadwal diperlakukan harian'],
  ['jam',             'tanpa ini jadwal jalan di jam sembarang'],
  ['hari_pekan',      'jadwal mingguan jadi harian tanpa gejala'],
  ['hari_bulan',      'jadwal bulanan jadi harian tanpa gejala'],
  ['terakhir_jalan',  'tanpa ini satu periode bisa jalan berkali-kali'],
  ['aktif',           'tugas yang dinonaktifkan tetap jalan'],
]

function berkasTs(dir) {
  const hasil = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) hasil.push(...berkasTs(p))
    else if (e.name.endsWith('.ts')) hasil.push(p)
  }
  return hasil
}

/** Buang komentar TANPA mengubah jumlah baris. */
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

if (!existsSync(SRC)) {
  console.error(`✗ Direktori sumber tak ditemukan: ${SRC}`)
  process.exit(1)
}

/**
 * Hanya berkas LOGIKA yang dihitung sebagai pembaca — bukan seluruh `src/`.
 *
 * Uji mutasi versi pertama GAGAL karena ini: pembaca `hari_pekan` dihapus dari
 * `jadwal.ts`, dan penjaga tetap hijau — sebab namanya masih muncul di berkas
 * test, di tipe, dan di rute yang sekadar meneruskan baris DB.
 *
 * Menyebut nama kolom saat MENERUSKANNYA bukan membacanya. Yang harus dijamin
 * adalah ada kode yang benar-benar MEMUTUSKAN sesuatu dari kolom itu, dan
 * keputusan itu hidup di satu tempat.
 */
const BERKAS_LOGIKA = ['lib/jadwal.ts']

const berkas = berkasTs(SRC)
const berkasDipakai = berkas.filter((p) => {
  const rel = p.slice(SRC.length + 1).replace(/\\/g, '/')
  return BERKAS_LOGIKA.includes(rel)
})

if (berkasDipakai.length !== BERKAS_LOGIKA.length) {
  // Berkas logikanya hilang atau dipindah — itu sendiri pelanggaran L-4:
  // tanpa berkas ini, tak ada yang membaca kolom jadwal mana pun.
  console.error('✗ Berkas logika jadwal tak ditemukan:')
  for (const b of BERKAS_LOGIKA) {
    if (!berkasDipakai.some((p) => p.endsWith(b.replace('/', '\\')) || p.endsWith(b))) {
      console.error(`   ${b}`)
    }
  }
  console.error('\n   Kalau berkasnya dipindah, perbarui BERKAS_LOGIKA di penjaga ini.')
  process.exit(1)
}

// Komentar dibuang: menyebut nama kolom di dalam penjelasan BUKAN membacanya.
// Tanpa ini, penjaga bisa dipuaskan hanya dengan menulis dokumentasi.
const kode = berkasDipakai.map((p) => tanpaKomentar(readFileSync(p, 'utf8'))).join('\n')

/**
 * Yang dihitung sebagai PEMBACA: `jadwal.kolom` atau destrukturisasi —
 * bukan deklarasi tipe.
 *
 * Uji mutasi gagal DUA KALI sebelum bentuk ini. Yang kedua paling tepat
 * menggambarkan kenapa penjaga ini ada: pembaca `hari_pekan` dihapus, tapi
 * `hari_pekan?: number | null` di antarmuka masih ada — dan grep polos
 * menghitungnya sebagai "dibaca".
 *
 * Itu PERSIS cacat yang dijaga. `BackupPolicy` TJS juga punya kolomnya
 * dideklarasikan rapi di schema; yang tak pernah ada adalah kode yang
 * memutuskan sesuatu darinya. Penjaga yang menerima deklarasi sebagai bukti
 * pemakaian akan lulus pada kasus yang justru ingin ia cegah.
 */
function adaPembaca(kolom) {
  const pola = [
    new RegExp(`\\bjadwal\\.${kolom}\\b`),        // jadwal.hari_pekan
    new RegExp(`\\bj\\.${kolom}\\b`),             // j.hari_pekan
    new RegExp(`\\{[^}]*\\b${kolom}\\b[^}]*\\}\\s*=`),  // const { hari_pekan } =
    new RegExp(`\\brow\\.${kolom}\\b`),
  ]
  return pola.some((p) => p.test(kode))
}

const yatim = WAJIB_DIBACA.filter(([kolom]) => !adaPembaca(kolom))

console.log('══ Kolom jadwal punya pembaca (L-4) ════════════════════════')
console.log(`  berkas dipindai : ${berkas.length}`)
console.log(`  kolom diperiksa : ${WAJIB_DIBACA.length}`)
console.log(`  tanpa pembaca   : ${yatim.length}`)
console.log('  ambang          : 0 (bukan ratchet)\n')

if (yatim.length > 0) {
  for (const [kolom, akibat] of yatim) {
    console.error(`   ✗ jadwal_tugas.${kolom} — tak dibaca kode mana pun`)
    console.error(`     akibatnya: ${akibat}`)
  }
  console.error(`
   Kolom jadwal yang tak pernah dibaca adalah janji yang tak ditepati:
   UI menampilkannya, basis menyimpannya, dan TIDAK TERJADI APA-APA.

   Persis yang menimpa \`BackupPolicy\` di TJS bertahun-tahun —
   "terjadwal di layar, tidak di kenyataan" — dan tak ada error, tak ada
   test merah, tak ada tiket. Satu-satunya gejalanya adalah hal yang
   tidak terjadi.

   Perbaiki dengan MEMBACANYA di src/lib/jadwal.ts, atau HAPUS kolomnya.
   Kolom yang tak dipakai lebih baik tak ada daripada berpura-pura ada.
`)
  process.exit(1)
}

console.log('✓ Semua kolom jadwal punya pembaca.')
