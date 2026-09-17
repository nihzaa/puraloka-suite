#!/usr/bin/env node
/**
 * PENJAGA: ZONA WAKTU WIB WAJIB TERPASANG DI CONTAINER — ambang NOL.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * CACAT YANG MELAHIRKAN PENJAGA INI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-09-16, dan tak satu pun alat di repo ini bisa melihatnya:
 *
 *     TZ di apps/api/Dockerfile      : 0
 *     TZ di docker-compose.yml (api) : 0
 *     TZ di apps/api/.env            : 0
 *     basis image                    : node:22-alpine  → UTC
 *
 * `new Date().toISOString().split('T')[0]` dipakai **140 tempat** di
 * `apps/api/src` (di luar test), melawan **14** pemakaian `todayWIB()`.
 * Antara 00:00–07:00 WIB, tanggal UTC masih HARI KEMARIN.
 *
 * ── Kenapa ini uang, bukan tampilan
 *
 * Yang tergeser TANGGAL TRANSAKSI. Dua di antaranya tak punya cadangan dari
 * klien sama sekali — UTC satu-satunya sumber, tak bisa diselamatkan form:
 *
 *     mandor.ts:1816  paid_at     pembayaran termin mandor
 *     mandor.ts:2203  settled_at  penyelesaian borongan
 *
 * `reports.ts` mengelompokkan arus kas per BULAN dari `paid_at`, jadi
 * pembayaran pukul 01:00 WIB tanggal 1 masuk ember bulan SEBELUMNYA.
 * Totalnya tetap benar, batang bulanannya yang salah, dan tak ada galat.
 *
 * Terbukti sudah terjadi di basis: tiga kasbon dibuat pukul 01:25 WIB
 * tercatat bertanggal sehari sebelumnya.
 *
 * ── Kenapa `tzdata` ikut diperiksa, dan ini yang paling mudah terlewat
 *
 * Alpine tak memuat basis zona waktu. `TZ=Asia/Jakarta` TANPA paket `tzdata`
 * diam-diam jatuh kembali ke UTC — setelan yang TERLIHAT terpasang, lolos
 * tiap pembacaan teks, dan tak berpengaruh apa pun.
 *
 * Itu kelas yang sama dengan `audit-hook-eas-utuh.mjs`: satu mata rantai
 * hilang, nol galat, dan yang gagal sesuatu di tempat lain berjam-jam
 * kemudian.
 *
 * ── Yang TIDAK diperiksa
 *
 * Penjaga ini membaca BERKAS KONFIGURASI, bukan container yang berjalan. Ia
 * tak bisa tahu apakah `TZ` benar-benar berlaku di produksi — yang bisa
 * menjawab itu `/health` atau `docker exec … date`. Batas itu disebutkan
 * supaya hijaunya tak dibaca sebagai "produksi sudah WIB".
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

const DOCKERFILE = join(AKAR, 'apps', 'api', 'Dockerfile')
const COMPOSE = join(AKAR, 'docker-compose.yml')

const temuan = []

/* ── 1. Dockerfile: TZ + tzdata, keduanya di tahap RUNTIME ───────────────── */
if (!existsSync(DOCKERFILE)) {
  temuan.push('apps/api/Dockerfile tak ditemukan — pemeriksaan tak bermakna')
} else {
  const isi = readFileSync(DOCKERFILE, 'utf8').split('\r\n').join('\n')

  /*
    Hanya tahap RUNTIME yang dihitung. `TZ` di tahap `build` tak ikut ke image
    akhir — setelan yang benar di berkas yang benar, di tahap yang salah, dan
    gejalanya persis sama dengan tak menyetelnya sama sekali.
  */
  const iRuntime = isi.search(/^FROM\s+\S+\s+AS\s+runtime/mi)
  const runtime = iRuntime === -1 ? '' : isi.slice(iRuntime)

  if (iRuntime === -1) {
    temuan.push('tahap `AS runtime` tak ditemukan di Dockerfile — bentuknya berubah?')
  } else {
    if (!/^\s*ENV\s+TZ=Asia\/Jakarta\s*$/mi.test(runtime)) {
      temuan.push('apps/api/Dockerfile (tahap runtime): `ENV TZ=Asia/Jakarta` tak ada')
    }
    if (!/apk\s+add[^\n]*\btzdata\b/.test(runtime)) {
      temuan.push(
        'apps/api/Dockerfile (tahap runtime): paket `tzdata` tak dipasang — ' +
        '`TZ` tanpa basis zona JATUH DIAM-DIAM ke UTC')
    }
  }
}

/* ── 2. docker-compose: service `api` menyatakan TZ ──────────────────────── */
if (!existsSync(COMPOSE)) {
  temuan.push('docker-compose.yml tak ditemukan')
} else {
  const isi = readFileSync(COMPOSE, 'utf8').split('\r\n').join('\n')
  const iApi = isi.search(/^\s{2}api:\s*$/m)
  if (iApi === -1) {
    temuan.push('service `api` tak ditemukan di docker-compose.yml')
  } else {
    /* Sampai service berikutnya di indentasi yang sama. */
    const sisa = isi.slice(iApi + 1)
    const iBerikut = sisa.search(/^\s{2}\w[\w-]*:\s*$/m)
    const blok = iBerikut === -1 ? sisa : sisa.slice(0, iBerikut)
    if (!/^\s*TZ:\s*Asia\/Jakarta\s*$/m.test(blok)) {
      temuan.push('docker-compose.yml service `api`: `TZ: Asia/Jakarta` tak ada')
    }
  }
}

console.log('══ Zona waktu terpasang di container ════════════════════════')
console.log(`  berkas diperiksa : 2 (Dockerfile runtime, docker-compose api)`)
console.log(`  pelanggaran      : ${temuan.length}`)

if (temuan.length > 0) {
  console.error('')
  console.error('❌ Zona waktu WIB tak terpasang utuh:')
  for (const t of temuan) console.error(`     · ${t}`)
  console.error(`
   `+'`node:22-alpine` berjalan di UTC. Antara 00:00–07:00 WIB, tanggal UTC'+`
   masih HARI KEMARIN — dan yang tergeser TANGGAL TRANSAKSI, bukan tampilan.

   Dua tempat tak punya cadangan dari klien, jadi UTC satu-satunya sumber:
     mandor.ts  paid_at     pembayaran termin mandor
     mandor.ts  settled_at  penyelesaian borongan

   Laporan arus kas mengelompokkan per BULAN dari `+'`paid_at`'+`, jadi
   pembayaran pukul 01:00 WIB tanggal 1 masuk ember bulan sebelumnya.
   Totalnya tetap benar, batang bulanannya salah, dan tak ada galat.
`)
  process.exit(1)
}

console.log('\n✅ TZ=Asia/Jakarta + tzdata terpasang di Dockerfile runtime dan compose.')
console.log('   ⚠ Yang dibaca BERKAS, bukan container hidup — hijaunya bukan bukti')
console.log('     produksi sudah WIB. Itu dijawab `/health` atau `docker exec … date`.')
