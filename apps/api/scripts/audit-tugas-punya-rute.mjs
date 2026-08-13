#!/usr/bin/env node
/**
 * PENJAGA: TIAP TUGAS TERJADWAL WAJIB PUNYA RUTE YANG BENAR-BENAR TERDAFTAR.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA — cacat nyata, bukan hipotetis
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-13. `jadwal_tugas` di basis memuat 7 tugas automation dengan
 * `aktif = true` sejak 2026-08-12, `jumlah_jalan = 0`. Penjadwalnya memanggil
 * tujuh endpoint yang TIDAK ADA — `otomasi-terjadwal.ts` tak pernah
 * di-register di `index.ts`.
 *
 * Bentuk kegagalannya yang membuatnya bertahan: tak ada galat. Penjadwal
 * memanggil, dapat 404, dan 404 itu tak pernah dibaca siapa pun. Satu-satunya
 * gejalanya adalah sesuatu yang TIDAK terjadi — dan hal yang tidak terjadi
 * tak menimbulkan tiket.
 *
 * ── Kenapa `audit-jadwal-punya-pembaca` (L-4) TIDAK menangkapnya
 *
 * L-4 memeriksa tiap KOLOM jadwal punya pembaca di kode. Kolomnya memang
 * punya pembaca — `jadwal.ts` membacanya dengan benar. Yang bolong ada satu
 * lapis lebih jauh: jalur yang dibaca itu menunjuk rute yang tak terdaftar.
 *
 * L-4 menjawab "adakah yang membaca kolom ini?", penjaga ini menjawab
 * "adakah di ujung sana sesuatu yang menjawab?". Dua pertanyaan berbeda, dan
 * cacat 2026-08-13 lolos justru di antara keduanya.
 *
 * ── Yang diperiksa
 *
 * Tiap `jalur` di `KATALOG_TUGAS` (`routes/v1/jadwal.ts`) harus:
 *   1. cocok dengan sebuah pendaftaran rute di kode (`app.get('<jalur>'`), dan
 *   2. berkas yang memuatnya harus di-register di `index.ts`.
 *
 * Syarat kedua yang menangkap cacat 2026-08-13: rutenya ADA di berkas, tapi
 * berkasnya tak pernah dipasang.
 *
 * Ini pemeriksaan statis dan sengaja begitu — ia tak menjalankan server. Yang
 * dijamin cuma: tugas terjadwal tak bisa menunjuk rute yang tak terpasang.
 *
 * Ambang NOL — ketujuhnya hijau sejak commit pemulihan, jadi tak ada
 * pelanggaran yang pantas diwariskan.
 *
 * Pakai:  node apps/api/scripts/audit-tugas-punya-rute.mjs
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC = join(__dirname, '..', 'src')
const BERKAS_JADWAL = join(SRC, 'routes', 'v1', 'jadwal.ts')
const BERKAS_INDEX = join(SRC, 'index.ts')

/** Semua berkas .ts di bawah `src/routes`, rekursif. */
function berkasRute(dir) {
  const keluar = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === '__tests__') continue
      keluar.push(...berkasRute(p))
    } else if (e.name.endsWith('.ts')) {
      keluar.push(p)
    }
  }
  return keluar
}

const jadwalSrc = readFileSync(BERKAS_JADWAL, 'utf8')
const indexSrc = readFileSync(BERKAS_INDEX, 'utf8')

// Ambil tiap pasangan kode-tugas + jalurnya dari KATALOG_TUGAS.
const mulai = jadwalSrc.indexOf('KATALOG_TUGAS')
if (mulai === -1) {
  console.error('GAGAL: `KATALOG_TUGAS` tak ditemukan di routes/v1/jadwal.ts')
  process.exit(2)
}

const tugas = []
const reBlok = /'([a-z0-9-]+)':\s*\{[^}]*?jalur:\s*'([^']+)'/gs
let m
while ((m = reBlok.exec(jadwalSrc.slice(mulai))) !== null) {
  tugas.push({ kode: m[1], jalur: m[2] })
}

if (tugas.length === 0) {
  console.error('GAGAL: nol tugas terbaca dari KATALOG_TUGAS — bentuk berkas berubah?')
  process.exit(2)
}

// Petakan jalur → berkas yang mendaftarkannya.
const daftarRute = new Map()
for (const f of berkasRute(join(SRC, 'routes'))) {
  const isi = readFileSync(f, 'utf8')
  const re = /app\.(?:get|post|put|patch|delete)\(\s*'([^']+)'/g
  let r
  while ((r = re.exec(isi)) !== null) {
    if (!daftarRute.has(r[1])) daftarRute.set(r[1], f)
  }
}

const pelanggaran = []
for (const t of tugas) {
  const berkas = daftarRute.get(t.jalur)
  if (!berkas) {
    pelanggaran.push(`${t.kode}\n    jalur '${t.jalur}' tak cocok dengan satu pun pendaftaran rute`)
    continue
  }
  // Berkasnya ada — tapi apakah dipasang di index.ts?
  const modul = basename(berkas, '.ts')
  const dipasang =
    indexSrc.includes(`/${modul}.js'`) || indexSrc.includes(`/${modul}'`)
  if (!dipasang) {
    pelanggaran.push(
      `${t.kode}\n    rute ADA di ${modul}.ts, tetapi berkas itu tak di-register di index.ts` +
        `\n    → penjadwal akan memanggilnya dan menerima 404, tanpa galat di mana pun`,
    )
  }
}

console.log(`Tugas terjadwal diperiksa: ${tugas.length}`)
if (pelanggaran.length > 0) {
  console.error(`\nMERAH — ${pelanggaran.length} tugas menunjuk rute yang tak terpasang:\n`)
  for (const p of pelanggaran) console.error(`  ${p}\n`)
  console.error('Ambang NOL. Tugas terjadwal yang menunjuk rute mati adalah janji kosong:')
  console.error('ia terlihat aktif di UI dan di basis, dan tak pernah menghasilkan apa pun.')
  process.exit(1)
}

console.log('HIJAU — tiap tugas terjadwal punya rute yang terdaftar dan terpasang.')
