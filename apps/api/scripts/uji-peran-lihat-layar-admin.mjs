#!/usr/bin/env node
/**
 * PENJAGA: peran yang bisa membuka layar ADMIN wajib punya permission-nya.
 *
 * ── Kejadian yang melahirkan penjaga ini (2026-08-07)
 *
 * `/mandor` (layar admin: SELURUH mandor, upah, kasbon) memuat 30 cabang
 * `isMandor = !hasPermission('mandor:assign')` yang tak pernah dieksekusi.
 * Founder memutuskan menghapusnya karena mandor sudah punya
 * `/mandor-portal` (10 halaman).
 *
 * Saat membuktikan cabang itu benar-benar mati, ditemukan yang lebih penting:
 *
 *   middleware memperlakukan role KUSTOM berbeda — ia hanya memblokir tiga
 *   portal (`/portal`, `/mandor-portal`, `/pm-portal`). Rute lain BEBAS,
 *   termasuk `/mandor`.
 *
 * Artinya: role kustom baru TANPA `mandor:assign` bisa membuka `/mandor`.
 * Selama ini cabang `isMandor` menutupinya secara TAK SENGAJA — ia
 * menyembunyikan bagian layar untuk yang tak punya permission itu.
 *
 * Sesudah cabang itu dihapus, penutup tak sengaja itu hilang. Penjaga ini
 * menggantinya dengan yang disengaja.
 *
 * ── Kenapa penjaga, bukan sekadar catatan
 *
 * Role dibuat lewat UI oleh tenant — tak ada yang meninjau kodenya. Peran
 * "Supervisor" baru yang lupa diberi `mandor:assign` akan melihat upah dan
 * kasbon SELURUH mandor, dan tak satu pun galat muncul.
 *
 * Pakai (dari apps/api): node scripts/uji-peran-lihat-layar-admin.mjs
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { Client } = require('pg')

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = {}
if (!process.env.DIRECT_URL) {
  try {
    for (const baris of readFileSync(join(AKAR, '.env'), 'utf8').replace(/^﻿/, '').split(/\r?\n/)) {
      const m = baris.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/)
      if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
    }
  } catch {
    console.error('❌ DIRECT_URL tak ada di environment dan apps/api/.env tak terbaca.')
    process.exit(2)
  }
}

const db = new Client({ connectionString: process.env.DIRECT_URL || env.DIRECT_URL })
await db.connect()

/**
 * Layar admin, permission penjaganya, dan berkas UI-nya.
 *
 * Ditulis TANGAN, bukan diturunkan dari nama rute: hubungan antara layar dan
 * permission-nya adalah keputusan produk, dan menebaknya dari nama membuat
 * penjaga ini hijau untuk pasangan yang salah.
 */
const LAYAR_ADMIN = [
  {
    rute: '/mandor', permission: 'mandor:assign',
    berkas: ['app/(dashboard)/mandor/layout.tsx', 'app/(dashboard)/mandor/page.tsx'],
    isi: 'seluruh mandor, upah, dan kasbon lintas-proyek',
  },
  {
    rute: '/users', permission: 'users:manage',
    berkas: ['app/(dashboard)/users/page.tsx'],
    isi: 'daftar pengguna dan perannya',
  },
  {
    rute: '/audit', permission: 'audit:view',
    berkas: ['app/(dashboard)/audit/page.tsx'],
    isi: 'jejak audit seluruh tenant',
  },
]

// Peran bawaan yang dikenal `middleware.ts`. Role di LUAR daftar ini
// diperlakukan KUSTOM: middleware hanya memblokir tiga portal, sisanya bebas
// — TERMASUK layar admin di atas.
const IZIN_BAWAAN = {
  client: ['/portal', '/verify'],
  mandor: ['/mandor-portal', '/pm-portal', '/proyek', '/verify', '/mutu', '/lapangan'],
  pm: ['/pm-portal', '/proyek', '/verify', '/estimasi', '/tender', '/piutang', '/aset',
       '/mutu', '/lapangan', '/kontrak', '/m'],
  admin: ['/dashboard', '/proyek', '/keuangan', '/akuntansi', '/mandor', '/laporan',
          '/notifications', '/kas', '/users', '/klien', '/procurement', '/pengaturan',
          '/kalender', '/audit', '/sistem', '/estimasi', '/tender', '/piutang', '/aset',
          '/mutu', '/lapangan', '/kontrak', '/gudang', '/m'],
}
const DIBLOKIR_KUSTOM = ['/portal', '/mandor-portal', '/pm-portal']

/** Cocok DI BATAS SEGMEN — sama dengan `cocokRute` di middleware.ts. */
const cocok = (rute, prefix) => rute === prefix || rute.startsWith(prefix + '/')

const WEB = join(AKAR, '..', 'web')

/** Apakah salah satu berkas layar ini memeriksa izinnya sendiri? */
function punyaGerbangUi(layar) {
  for (const rel of layar.berkas) {
    let isi
    try { isi = readFileSync(join(WEB, rel), 'utf8') } catch { continue }
    if (isi.includes(layar.permission)) return rel
  }
  return null
}

const { rows: peran } = await db.query(`
  SELECT ro.name,
         array_remove(array_agg(p.key), NULL) AS izin,
         (SELECT count(*) FROM users u WHERE u.role_id = ro.id) AS n_user
    FROM roles ro
    LEFT JOIN role_permissions rp ON rp.role_id = ro.id
    LEFT JOIN permissions p ON p.id = rp.permission_id
   GROUP BY ro.id, ro.name ORDER BY ro.name`)

let temuan = 0

console.log('')
console.log('LAYAR ADMIN — gerbang UI & peran yang bisa membukanya')
console.log('')

for (const layar of LAYAR_ADMIN) {
  const gerbang = punyaGerbangUi(layar)

  // Peran yang bisa MEMBUKA rutenya tapi TAK punya permission-nya.
  const rawan = peran.filter((r) => {
    const bawaan = IZIN_BAWAAN[r.name]
    const bisaBuka = bawaan
      ? bawaan.some((p) => cocok(layar.rute, p))
      : !DIBLOKIR_KUSTOM.some((p) => cocok(layar.rute, p))
    return bisaBuka && !r.izin.includes(layar.permission)
  })

  if (gerbang) {
    console.log(`  ✅ ${layar.rute.padEnd(9)} punya gerbang izin di ${gerbang}`)
    if (rawan.length) {
      console.log(`       (${rawan.map((r) => r.name).join(', ')} bisa membuka rutenya, tapi layarnya menahan isinya)`)
    }
    continue
  }

  // TAK ADA gerbang UI. Itu baru masalah kalau ADA peran yang bisa masuk
  // tanpa permission-nya — kalau tidak, ia cuma pertahanan yang belum perlu.
  if (rawan.length === 0) {
    console.log(`  ✅ ${layar.rute.padEnd(9)} tanpa gerbang UI, tapi nol peran bisa masuk tanpa izin`)
    continue
  }

  console.log(`  ❌ ${layar.rute.padEnd(9)} TAK punya gerbang izin, dan ${rawan.length} peran bisa masuk tanpa ${layar.permission}`)
  for (const r of rawan) {
    console.log(`       → ${r.name} (${r.n_user} user) akan melihat ${layar.isi}`)
  }
  temuan++
}

console.log('')
if (temuan === 0) {
  console.log('✅ Tiap layar admin dijaga: ada gerbang izin di UI, atau nol peran bisa masuk tanpa izinnya.')
  console.log('')
  await db.end()
  process.exit(0)
}

console.error(`❌ ${temuan} layar admin tanpa gerbang izin, dan ada peran yang bisa masuk.`)
console.error('')
console.error('Perbaikan — pilih salah satu, jangan melemahkan penjaga ini:')
console.error('  1. tambahkan gerbang `useIzin(<permission>)` di layar itu, ATAU')
console.error('  2. beri permission itu ke perannya (kalau memang berhak), ATAU')
console.error('  3. blokir rutenya untuk role kustom di middleware.ts')
console.error('')
await db.end()
process.exit(1)
