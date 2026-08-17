#!/usr/bin/env node
/**
 * PENJAGA: RUTE YANG DITULIS UNTUK PENJADWAL WAJIB PUNYA TUGAS YANG MEMICUNYA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA — cacat yang SUDAH TERJADI DUA KALI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `audit-tugas-punya-rute.mjs` menjaga satu arah: tiap TUGAS harus menunjuk
 * rute yang benar-benar terpasang. Arah sebaliknya tak dijaga siapa pun —
 * dan di situlah dua cacat lolos:
 *
 *   2026-08-16  delapan rute otomasi ada sejak 2026-08-15 dan tak pernah
 *               terdaftar di `KATALOG_TUGAS`. Tak pernah dijalankan sekali
 *               pun. Sempat saya sebut "menunggu deploy / SCHEDULER_URL",
 *               padahal `SCHEDULER_URL` tak dipakai satu baris kode pun.
 *
 *   2026-08-17  `GET /kendali-dokumen/kirim-laporan` — pengirim laporan
 *               terjadwal. Rutenya lengkap, tugasnya tak ada. Peta Modul
 *               menulis "pengiriman surel otomatisnya belum dijalankan"
 *               selama itu, dan sebabnya tak pernah ketahuan.
 *
 * ── Kenapa ia tak menimbulkan gejala
 *
 * Rute yang tak pernah dipanggil tidak error. Ia hanya diam. Satu-satunya
 * jejaknya adalah sesuatu yang TIDAK terjadi — dan hal yang tidak terjadi
 * tak menimbulkan tiket.
 *
 * Lebih buruk pada laporan terjadwal: `terakhir_dikirim` selamanya NULL,
 * sehingga deteksi MACET melaporkan SELURUH jadwal sebagai macet. Peringatan
 * yang BENAR untuk sebab yang SALAH — dan yang membacanya akan memeriksa
 * penjadwal yang sebenarnya sehat.
 *
 * ── Yang dipakai sebagai penanda
 *
 * Rute yang dimaksudkan untuk penjadwal MENYEBUTKANNYA di komentar di atas
 * pendaftarannya ("dijalankan PENJADWAL"). Itu penanda yang sudah dipakai
 * penulisnya sendiri, bukan aturan baru yang dipaksakan belakangan.
 *
 * Seluruh rute di bawah `/api/v1/otomasi/jalankan/` juga wajib punya tugas —
 * prefiks itu artinya "dijalankan otomatis", dan rute di sana yang tak
 * terdaftar adalah persis cacat 2026-08-16.
 *
 * Ambang NOL. Begitu semuanya terdaftar, tak ada pelanggaran yang pantas
 * diwariskan.
 *
 * Pakai:  node apps/api/scripts/audit-rute-penjadwal-punya-tugas.mjs
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC = join(__dirname, '..', 'src')
const BERKAS_JADWAL = join(SRC, 'routes', 'v1', 'jadwal.ts')

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

// ── Jalur yang SUDAH punya tugas ────────────────────────────────────────────
const jadwalSrc = readFileSync(BERKAS_JADWAL, 'utf8')
const mulai = jadwalSrc.indexOf('KATALOG_TUGAS')
if (mulai === -1) {
  console.error('GAGAL: `KATALOG_TUGAS` tak ditemukan di routes/v1/jadwal.ts')
  process.exit(2)
}

const berTugas = new Set()
const reBlok = /'([a-z0-9-]+)':\s*\{[^}]*?jalur:\s*'([^']+)'/gs
let m
while ((m = reBlok.exec(jadwalSrc.slice(mulai))) !== null) {
  // Query string milik TUGAS, bukan rute — dibuang sebelum dibandingkan.
  berTugas.add(m[2].split('?')[0])
}

if (berTugas.size === 0) {
  console.error('GAGAL: nol jalur terbaca dari KATALOG_TUGAS — bentuk berkas berubah?')
  process.exit(2)
}

// ── Rute yang MENUNTUT tugas ────────────────────────────────────────────────
const PREFIKS_OTOMATIS = '/api/v1/otomasi/jalankan/'
const PENANDA = /dijalankan\s+PENJADWAL/i

const yatim = []
for (const f of berkasRute(join(SRC, 'routes'))) {
  const isi = readFileSync(f, 'utf8')
  const baris = isi.split(/\r?\n/)

  for (let i = 0; i < baris.length; i++) {
    const r = /app\.(?:get|post|put|patch|delete)(?:<[^>]*>)?\(\s*'([^']+)'/.exec(baris[i])
    if (!r) continue
    const jalur = r[1]

    // Dua sebab sebuah rute menuntut tugas.
    const karenaPrefiks = jalur.startsWith(PREFIKS_OTOMATIS)
    // Penanda dicari di 25 baris SEBELUM pendaftarannya: komentar penjelas di
    // repo ini panjang, dan menyempitkannya jadi beberapa baris akan
    // melewatkan rute yang justru paling banyak dijelaskan.
    const kepala = baris.slice(Math.max(0, i - 25), i).join('\n')
    const karenaPenanda = PENANDA.test(kepala)

    if (!karenaPrefiks && !karenaPenanda) continue
    if (berTugas.has(jalur)) continue

    yatim.push({
      jalur,
      berkas: relative(join(SRC, '..'), f).replace(/\\/g, '/'),
      baris: i + 1,
      sebab: karenaPrefiks ? 'berprefiks otomasi/jalankan' : 'komentarnya menyebut "dijalankan PENJADWAL"',
    })
  }
}

console.log('══ RUTE PENJADWAL vs TUGAS TERDAFTAR ══════════════════════════')
console.log(`  jalur bertugas   : ${berTugas.size}`)
console.log(`  rute yatim       : ${yatim.length}`)
console.log('  ambang           : 0 (bukan ratchet)\n')

if (yatim.length > 0) {
  console.error('❌ RUTE YANG DITULIS UNTUK PENJADWAL TAPI TAK ADA YANG MEMICUNYA:\n')
  for (const y of yatim) {
    console.error(`   · ${y.jalur}`)
    console.error(`     ${y.berkas}:${y.baris} — ${y.sebab}`)
  }
  console.error('\n   Rute yang tak pernah dipanggil TIDAK error. Ia hanya diam, dan')
  console.error('   satu-satunya jejaknya adalah sesuatu yang TIDAK terjadi.')
  console.error('\n   Perbaikan: daftarkan di `KATALOG_TUGAS` (routes/v1/jadwal.ts).')
  console.error('   Kalau rutenya memang tak untuk penjadwal, buang penandanya dari')
  console.error('   komentar — penanda yang keliru menyesatkan pembaca berikutnya.')
  process.exit(1)
}

console.log('✅ Tiap rute yang ditulis untuk penjadwal punya tugas yang memicunya.\n')
