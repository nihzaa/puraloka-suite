#!/usr/bin/env node
/**
 * uji-rls-jalur-nyata.mjs — T5c langkah 2, pembuktian lewat RUTE SUNGGUHAN
 *
 * ── Kenapa skrip ini ada, dan kenapa SQL langsung tidak cukup
 *
 * Menukar jalur data aplikasi dari `service_role` (yang melewati RLS) ke klien
 * ber-token pengguna (yang tunduk RLS) punya satu bentuk kegagalan yang khas:
 * **halaman kosong tanpa pesan galat.** Query berhasil, `error` null, `data`
 * kosong. Tak ada yang menunjuk sebabnya.
 *
 * Menguji lewat SQL langsung tidak menangkap itu, karena SQL langsung melewati
 * seluruh lapis aplikasi — plugin auth, `createTenantDb`, dan penyaringan
 * per-kategori tenancy. Yang harus dibuktikan justru rantai lengkapnya.
 *
 * Karena itu skrip ini memanggil RUTE HTTP sungguhan dengan token sungguhan,
 * lalu membandingkan jumlah baris terhadap kebenaran yang diambil langsung dari
 * basis. Dua hal diuji sekaligus:
 *
 *   1. Data yang SAH masih terbaca   → tak ada fitur yang mati
 *   2. Data tenant LAIN tak terbaca  → isolasi benar-benar menahan
 *
 * Butuh API hidup. Ukur portnya (CLAUDE.md §7) — jangan percaya angka tetap.
 *
 *   cd apps/api && UJI_EMAIL=… UJI_SANDI=… UJI_BASIS=http://127.0.0.1:3007 \
 *     node scripts/uji-rls-jalur-nyata.mjs
 */
import 'dotenv/config'
import pg from 'pg'
import { createClient } from '@supabase/supabase-js'

const BASIS = process.env.UJI_BASIS || 'http://127.0.0.1:3007'
const EMAIL = process.env.UJI_EMAIL || process.env.LAYAR_EMAIL
const SANDI = process.env.UJI_SANDI || process.env.LAYAR_SANDI

if (!EMAIL || !SANDI) {
  console.error('❌ UJI_EMAIL / UJI_SANDI kosong — tak ada yang bisa diuji.')
  console.error('   Nol kegagalan tanpa kredensial BUKAN bukti apa pun.')
  process.exit(2)
}

/* Rute yang diuji. Sengaja yang paling banyak dipakai DAN paling terasa
   kalau mati: daftar proyek, keuangan, pengadaan, dan katalog.

   Jalurnya diambil dari kode, bukan ditebak: `suppliers`/`materials` ada di
   bawah `/procurement/`, dan menebaknya di akar memberi 404 — yang sempat
   dilewati skrip ini seolah "rute tak ada di build" padahal cuma salah alamat. */
const RUTE = [
  { jalur: '/api/v1/projects', tabel: 'projects' },
  { jalur: '/api/v1/clients', tabel: 'clients' },
  { jalur: '/api/v1/kasbons', tabel: 'kasbons' },
  { jalur: '/api/v1/assets', tabel: 'assets' },
  { jalur: '/api/v1/procurement/suppliers', tabel: 'suppliers' },
  { jalur: '/api/v1/procurement/materials', tabel: 'materials' },
  // `purchase_orders` kategori C — tenancy lewat `project_id`, tak punya
  // `company_id`. Diuji tanpa pembanding basis; yang dijaga hanya rutenya
  // menjawab, bukan jumlahnya.
  { jalur: '/api/v1/procurement/purchase-orders', tabel: null },
  { jalur: '/api/v1/notifications', tabel: null },
]

const url = process.env.SUPABASE_URL
const publik = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY
if (!publik) {
  console.error('❌ SUPABASE_PUBLISHABLE_KEY kosong — tak bisa login.')
  process.exit(2)
}

const sb = createClient(url, publik, { auth: { persistSession: false } })
const { data: sesi, error: eLogin } = await sb.auth.signInWithPassword({ email: EMAIL, password: SANDI })
if (eLogin) {
  console.error('❌ Login gagal:', eLogin.message)
  process.exit(2)
}
const token = sesi.session.access_token

const c = new pg.Client({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL })
await c.connect()
const { rows: cu } = await c.query(
  `SELECT cm.company_id FROM company_members cm JOIN users u ON u.id = cm.user_id
    WHERE u.email = $1 AND cm.is_default AND cm.is_active LIMIT 1`, [EMAIL])
const cid = cu[0]?.company_id
if (!cid) {
  console.error('❌ Pengguna uji tak punya keanggotaan default aktif.')
  process.exit(2)
}

console.log('══ RLS lewat jalur nyata (HTTP + token pengguna) ══════════════')
console.log('  basis    :', BASIS)
console.log('  pengguna :', EMAIL)
console.log('  company  :', cid, '\n')

/**
 * Ambil jumlah baris dari badan jawaban, apa pun bentuk pembungkusnya.
 *
 * Rute di repo ini memakai kunci BERNAMA SESUAI ENTITASNYA (`{projects: […]}`,
 * `{clients: […]}`), bukan pembungkus generik. Versi pertama skrip ini hanya
 * mencari `data`/`items`/`rows` dan melaporkan "bentuk jawaban tak dikenali"
 * untuk empat rute yang sebenarnya SEHAT — laporan yang terbaca seperti
 * kegagalan RLS, padahal alat ukurnya yang kurang.
 *
 * Karena itu: ambil larik PERTAMA yang ditemukan di tingkat atas, apa pun
 * namanya. Yang tak punya larik sama sekali tetap dilaporkan tak dikenali —
 * menebak 0 di situ akan menyembunyikan rute yang benar-benar rusak.
 */
function cacah(badan) {
  if (Array.isArray(badan)) return badan.length
  if (!badan || typeof badan !== 'object') return null
  for (const k of ['data', 'items', 'rows', 'hasil', 'result']) {
    if (Array.isArray(badan[k])) return badan[k].length
  }
  for (const nilai of Object.values(badan)) {
    if (Array.isArray(nilai)) return nilai.length
  }
  return null
}

let diuji = 0
let sehat = 0
const masalah = []

for (const { jalur, tabel } of RUTE) {
  let r
  try {
    r = await fetch(`${BASIS}${jalur}`, { headers: { Authorization: `Bearer ${token}` } })
  } catch (e) {
    masalah.push(`${jalur} — API tak terjangkau: ${e.message.slice(0, 50)}`)
    continue
  }

  /*
    404 DILAPORKAN, tidak dilewati.

    Versi pertama skrip ini menganggap 404 sebagai "rute tak ada di build ini"
    lalu `continue` — dan tiga rute yang alamatnya salah tulis menghilang dari
    hitungan tanpa jejak, sementara ringkasannya tetap berbunyi ✅. Uji yang
    diam-diam menyusutkan cakupannya sendiri lebih buruk daripada uji yang
    merah: yang merah diperbaiki, yang diam dipercaya.
  */
  if (r.status === 404) {
    masalah.push(`${jalur} — HTTP 404, jalur tak terdaftar (salah alamat? ambil dari kode, jangan tebak)`)
    continue
  }
  diuji++

  if (!r.ok) {
    masalah.push(`${jalur} — HTTP ${r.status}`)
    continue
  }

  const badan = await r.json().catch(() => null)
  const n = cacah(badan)
  if (n === null) {
    masalah.push(`${jalur} — bentuk jawaban tak dikenali`)
    continue
  }

  if (tabel) {
    /*
      Pembanding hanya sah untuk tabel ber-`company_id`. Tabel kategori C
      mewarisi tenancy lewat `project_id`, dan menanyakan `company_id` di sana
      melempar 42703 — skrip mati dengan galat Postgres mentah yang tak
      menyebut rute mana pun. Diperiksa dulu, bukan diasumsikan.
    */
    const { rows: adaKolom } = await c.query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'company_id'`,
      [tabel])
    if (adaKolom.length === 0) {
      masalah.push(`${jalur} — tabel '${tabel}' tak punya company_id; daftarkan sebagai tabel: null`)
      continue
    }
    const { rows } = await c.query(
      `SELECT count(*)::int n FROM public.${tabel} WHERE company_id = $1`, [cid])
    const sah = rows[0].n
    /* Rute biasanya berhalaman, jadi yang dijaga bukan kesamaan persis
       melainkan: kalau ada data sah, jangan NOL. Nol adalah gejala RLS
       menggigit terlalu keras — dan itu yang tak mengeluarkan galat. */
    if (sah > 0 && n === 0) {
      masalah.push(`${jalur} — KOSONG padahal ada ${sah} baris sah (RLS menggigit)`)
      continue
    }
    console.log(`  ✓ ${jalur.padEnd(28)} ${String(n).padStart(4)} baris (sah: ${sah})`)
  } else {
    console.log(`  ✓ ${jalur.padEnd(28)} ${String(n).padStart(4)} baris`)
  }
  sehat++
}

/* ── Sisi kedua: data tenant LAIN harus TIDAK terbaca ──────────────────── */
const { rows: lain } = await c.query(
  `SELECT p.id, p.company_id FROM projects p
    WHERE p.company_id <> $1 ORDER BY p.id LIMIT 1`, [cid])

let isolasi = 'tak diuji (tak ada proyek tenant lain)'
if (lain.length) {
  const r = await fetch(`${BASIS}/api/v1/projects/${lain[0].id}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (r.status === 200) {
    const b = await r.json().catch(() => null)
    const adaIsi = b && (b.id || b.data?.id)
    isolasi = adaIsi ? '❌ BOCOR — proyek tenant lain TERBACA' : 'aman (200 tapi kosong)'
    if (adaIsi) masalah.push('isolasi: GET /projects/<id tenant lain> memulangkan datanya')
  } else {
    isolasi = `aman (HTTP ${r.status})`
  }
}

await c.end()

console.log('\n  rute diuji :', diuji)
console.log('  sehat      :', sehat)
console.log('  isolasi    :', isolasi)

if (masalah.length) {
  console.error(`\n❌ ${masalah.length} masalah:`)
  for (const m of masalah) console.error('     ·', m)
  process.exit(1)
}
if (diuji === 0) {
  console.error('\n❌ NOL rute diuji — API tak menjawab, bukan aplikasi yang sehat.')
  process.exit(1)
}
console.log('\n✅ Data sah terbaca, data tenant lain tidak.')
