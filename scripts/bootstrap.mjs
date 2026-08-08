#!/usr/bin/env node
// ============================================================================
// F1-5 — SATU PERINTAH UNTUK MENYIAPKAN REPO INI.
//
//   pnpm bootstrap
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA SKRIP INI ADA, BUKAN SEKADAR DAFTAR LANGKAH DI README
// ══════════════════════════════════════════════════════════════════════════
//
// Daftar langkah di README membusuk tanpa suara. Ia tak pernah dijalankan,
// jadi tak pernah ketahuan salah — sampai ada orang baru yang mencobanya dan
// buntu di langkah 4 tanpa tahu apakah dirinya yang salah atau dokumennya.
//
// Skrip ini dijalankan, jadi ia tak bisa berbohong. Kalau sebuah prasyarat
// berubah, skrip ini yang MERAH lebih dulu.
//
// ── Prinsip yang dipegang
//
//   1. TIDAK PERNAH menulis ke database. Sekali pun. Bootstrap yang bisa
//      menyentuh data adalah bootstrap yang suatu hari akan menyentuh data
//      produksi karena seseorang menjalankannya di terminal yang salah.
//
//   2. TIDAK menimpa `.env` yang sudah ada. Menyalin `.env.example` di atas
//      `.env` berisi kredensial nyata adalah kerusakan yang tak bisa
//      dibatalkan, dan justru paling mungkin terjadi saat orang menjalankan
//      ulang bootstrap karena ada yang gagal.
//
//   3. Melaporkan APA yang kurang, bukan sekadar "gagal". Pesan galat yang
//      tak menyebutkan nama variabelnya memaksa orang membaca kode — dan
//      itulah yang seharusnya digantikan oleh skrip ini.
//
//   4. Membedakan WAJIB dari OPSIONAL berdasarkan BUKTI di kode, bukan
//      selera. Daftar di bawah menyertakan file:line-nya masing-masing;
//      kalau kodenya punya fallback (`?? 'default'`), variabelnya opsional.
//
// Jalankan kapan saja untuk mendiagnosis lingkungan yang rusak — ia read-only
// terhadap segala hal yang berharga.
// ============================================================================

import { readFileSync, existsSync, copyFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { resolve, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const H = (s) => `\n\x1b[1m${s}\x1b[0m`
const OK = '\x1b[32m✅\x1b[0m'
const WARN = '\x1b[33m⚠️ \x1b[0m'
const BAD = '\x1b[31m❌\x1b[0m'

let fatal = 0
let peringatan = 0

// ── Variabel env: WAJIB vs OPSIONAL — masing-masing dengan buktinya ────────
//
// "Wajib" berarti: tanpa ini, proses MATI atau fitur intinya tak jalan.
// "Opsional" berarti: kodenya punya fallback yang terbukti (kolom `bukti`).
const ENV_API = [
  { k: 'JWT_SECRET', wajib: true, bukti: 'index.ts:63 — throw kalau kosong' },
  { k: 'SUPABASE_URL', wajib: true, bukti: 'lib/supabase.ts — klien auth' },
  { k: 'SUPABASE_SECRET_KEY', wajib: true, bukti: 'lib/supabase.ts — service role' },
  { k: 'DIRECT_URL', wajib: true, bukti: 'seluruh test + scripts/db/*' },
  { k: 'PORT', wajib: false, bukti: 'default 3001' },
  { k: 'COOKIE_SECRET', wajib: false, bukti: 'index.ts:122 — jatuh ke JWT_SECRET' },
  { k: 'APP_URL', wajib: false, bukti: "utils/email.ts:14 — ?? 'http://localhost:3000'" },
  { k: 'LOG_LEVEL', wajib: false, bukti: "index.ts:79 — ?? 'info'" },
  { k: 'RESEND_API_KEY', wajib: false, bukti: 'utils/email.ts:8 — email mati kalau kosong' },
  { k: 'EMAIL_FROM', wajib: false, bukti: 'utils/email.ts:13 — punya default' },
  { k: 'VAPID_PUBLIC_KEY', wajib: false, bukti: 'web push mati kalau kosong' },
  { k: 'VAPID_PRIVATE_KEY', wajib: false, bukti: 'web push mati kalau kosong' },
  { k: 'OTEL_ENABLED', wajib: false, bukti: "utils/observability.ts:56 — aktif hanya bila 'true'" },
  { k: 'ANTHROPIC_API_KEY', wajib: false, bukti: "routes/v1/ai.ts — kosong = kartu jatuh ke teks deterministik" },
  { k: 'ANTHROPIC_MODEL', wajib: false, bukti: "routes/v1/ai.ts — default 'claude-opus-5'" },
]

const ENV_WEB = [
  { k: 'NEXT_PUBLIC_API_URL', wajib: true, bukti: 'tanpa ini web tak menemukan API' },
  { k: 'NEXT_PUBLIC_SUPABASE_URL', wajib: true, bukti: 'login tak jalan' },
  { k: 'NEXT_PUBLIC_SUPABASE_KEY', wajib: true, bukti: 'login tak jalan' },
  { k: 'NEXT_PUBLIC_VAPID_PUBLIC_KEY', wajib: false, bukti: 'lib/webpush.ts:36 — push disabled' },
]

/**
 * Parser .env yang melucuti BOM + tanda kutip.
 *
 * Sengaja SALINAN kecil dari `scripts/db/_koneksi.mjs`, bukan import: bootstrap
 * harus bisa berjalan bahkan ketika ada yang rusak di modul lain — itu justru
 * saat orang paling membutuhkannya.
 */
function bacaEnv(p) {
  if (!existsSync(p)) return null
  const out = {}
  for (const baris of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = baris.replace(/^﻿/, '').match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!m) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    out[m[1]] = v
  }
  return out
}

/** Nilai yang masih berisi placeholder dari .env.example = SAMA DENGAN KOSONG. */
function masihPlaceholder(v) {
  return !v || /your[-_]|YOUR-|\[YOUR|xxx|changeme|here$/i.test(v)
}

// ── 1. Versi runtime ───────────────────────────────────────────────────────
console.log(H('1. Runtime'))
{
  const major = Number(process.versions.node.split('.')[0])
  // 20 = LTS terendah yang punya `--env-file` & fetch stabil; di bawah itu
  // beberapa dependency menolak dipasang.
  if (major >= 20) console.log(`${OK} Node ${process.versions.node}`)
  else { console.log(`${BAD} Node ${process.versions.node} — butuh ≥ 20`); fatal++ }

  try {
    const v = execSync('pnpm -v', { encoding: 'utf8' }).trim()
    console.log(`${OK} pnpm ${v}`)
  } catch {
    console.log(`${BAD} pnpm tidak ditemukan — pasang: npm i -g pnpm`)
    fatal++
  }
}

// ── 2. Berkas .env ─────────────────────────────────────────────────────────
console.log(H('2. Berkas konfigurasi'))
const TARGET = [
  { contoh: 'apps/api/.env.example', nyata: 'apps/api/.env' },
  { contoh: 'apps/web/.env.example', nyata: 'apps/web/.env.local' },
]
for (const t of TARGET) {
  const nyata = resolve(ROOT, t.nyata)
  const contoh = resolve(ROOT, t.contoh)
  if (existsSync(nyata)) {
    console.log(`${OK} ${t.nyata} sudah ada — TIDAK ditimpa`)
  } else if (!existsSync(contoh)) {
    // Terjadi sungguhan: `apps/web/.gitignore` punya `.env*` yang ikut menelan
    // `.env.example`, jadi klon bersih tak punya contohnya sama sekali.
    // Menyeberang sebagai crash `ENOENT` mentah — orang baru mengira mesinnya
    // yang rusak. Sekarang ia menyebut sebabnya.
    console.log(`${BAD} ${t.contoh} TIDAK ADA di repo — periksa .gitignore`)
    console.log(`     git check-ignore -v ${t.contoh}`)
    fatal++
  } else {
    copyFileSync(contoh, nyata)
    console.log(`${WARN} ${t.nyata} dibuat dari contoh — ISI NILAINYA sebelum menjalankan`)
    peringatan++
  }
}

// ── 3. Isi env ─────────────────────────────────────────────────────────────
console.log(H('3. Variabel lingkungan'))
for (const [label, berkas, daftar] of [
  ['API', 'apps/api/.env', ENV_API],
  ['WEB', 'apps/web/.env.local', ENV_WEB],
]) {
  const env = bacaEnv(resolve(ROOT, berkas)) ?? {}
  const kurangWajib = daftar.filter((e) => e.wajib && masihPlaceholder(env[e.k]))
  const kurangOpsi = daftar.filter((e) => !e.wajib && masihPlaceholder(env[e.k]))

  if (kurangWajib.length === 0) {
    console.log(`${OK} ${label}: semua variabel WAJIB terisi`)
  } else {
    console.log(`${BAD} ${label}: ${kurangWajib.length} variabel WAJIB belum terisi —`)
    for (const e of kurangWajib) console.log(`     ${e.k.padEnd(24)} ${e.bukti}`)
    fatal++
  }
  if (kurangOpsi.length) {
    console.log(`${WARN} ${label}: ${kurangOpsi.length} opsional kosong (fitur terkait mati, bukan galat):`)
    for (const e of kurangOpsi) console.log(`     ${e.k.padEnd(24)} ${e.bukti}`)
  }
}

// ── 4. Dependensi ──────────────────────────────────────────────────────────
console.log(H('4. Dependensi'))
if (existsSync(resolve(ROOT, 'node_modules'))) {
  console.log(`${OK} node_modules ada — lewati install (jalankan 'pnpm install' bila ragu)`)
} else if (fatal === 0 || process.argv.includes('--paksa-install')) {
  console.log('   pnpm install …')
  try {
    execSync('pnpm install', { cwd: ROOT, stdio: 'inherit' })
    console.log(`${OK} dependensi terpasang`)
  } catch {
    console.log(`${BAD} pnpm install gagal`)
    fatal++
  }
} else {
  console.log(`${WARN} dilewati — perbaiki galat di atas dulu`)
}

// ── 5. Koneksi database (SELECT saja) ──────────────────────────────────────
//
// Membuka koneksi adalah satu-satunya cara membuktikan DIRECT_URL benar-benar
// bisa dipakai; nilai yang "terisi" tapi salah adalah kegagalan yang paling
// membingungkan karena semua pemeriksaan tekstual di atas hijau.
console.log(H('5. Database'))
{
  const env = bacaEnv(resolve(ROOT, 'apps/api/.env')) ?? {}
  const url = env.DIRECT_URL || env.DATABASE_URL
  if (masihPlaceholder(url)) {
    console.log(`${WARN} DIRECT_URL belum terisi — koneksi tak diuji`)
  } else if (!existsSync(resolve(ROOT, 'node_modules'))) {
    console.log(`${WARN} node_modules belum ada — koneksi tak bisa diuji`)
  } else {
    // `pg` adalah dependensi apps/api, bukan root — di root ia TIDAK ADA.
    // Diselesaikan lewat createRequire dari sana, bukan `import('pg')` biasa,
    // yang gagal dengan "Cannot find package 'pg'" lalu MENUDUH DIRECT_URL
    // atas kesalahan yang bukan miliknya. Pesan galat yang menunjuk ke
    // tersangka salah lebih buruk daripada tak ada pesan sama sekali.
    let pg = null
    try {
      const req = createRequire(resolve(ROOT, 'apps/api/package.json'))
      pg = req('pg')
    } catch {
      console.log(`${WARN} paket 'pg' belum terpasang di apps/api — koneksi tak diuji`)
      console.log("     Jalankan 'pnpm install', lalu ulangi 'pnpm bootstrap'.")
      peringatan++
    }

    if (pg) try {
      const c = new pg.Client({ connectionString: url })
      await c.connect()
      // Read-only. Tak ada satu pun perintah yang mengubah keadaan.
      const { rows } = await c.query(
        `SELECT current_database() AS db,
                (SELECT count(*) FROM information_schema.tables
                  WHERE table_schema='public' AND table_type='BASE TABLE') AS tabel`,
      )
      await c.end()
      console.log(`${OK} tersambung ke '${rows[0].db}' — ${rows[0].tabel} tabel di schema public`)
      if (Number(rows[0].tabel) === 0) {
        console.log(`${WARN} schema KOSONG — jalankan migrasi (lihat README §Database)`)
        peringatan++
      }
    } catch (e) {
      console.log(`${BAD} koneksi gagal: ${e.message}`)
      console.log('     Periksa DIRECT_URL di apps/api/.env (port 5432, bukan 6543 pooler).')
      fatal++
    }
  }
}

// ── Ringkasan ──────────────────────────────────────────────────────────────
console.log(H('Ringkasan'))
if (fatal) {
  console.log(`${BAD} ${fatal} masalah harus diperbaiki sebelum repo ini bisa dijalankan.`)
  console.log('   Setelah memperbaikinya, jalankan ulang: pnpm bootstrap')
  process.exit(1)
}
console.log(`${OK} siap dijalankan${peringatan ? ` (${peringatan} peringatan di atas)` : ''}.`)
console.log(`
   pnpm dev:api     API  → http://localhost:3001
   pnpm dev:web     Web  → http://localhost:3000
   pnpm test        test integrasi (butuh DB)
`)
