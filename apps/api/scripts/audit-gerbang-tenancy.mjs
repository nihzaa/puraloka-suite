#!/usr/bin/env node
/**
 * AUDIT GERBANG TENANCY — rute yang menyentuh `supabase` mentah TANPA saringan
 * tenant apa pun di badan handler-nya.
 *
 * HANYA MEMBACA. Keluarannya laporan, bukan vonis.
 *
 * ── Kenapa ada
 *
 * `tenancy-ratchet.test.ts` menjaga JUMLAH akses `supabase` mentah tidak naik.
 * Itu berguna, tapi ia tak bisa membedakan dua hal yang sangat berbeda:
 *
 *   • akses mentah SESUDAH gerbang tenant  → aman, sekadar hutang adopsi wrapper
 *   • akses mentah TANPA gerbang sama sekali → celah lintas-tenant
 *
 * Angka 468 di ratchet mencampur keduanya, sehingga "masih 468" terbaca sama
 * menakutkannya baik ketika semuanya bergerbang maupun ketika ada yang bolong.
 * Skrip ini memisahkannya.
 *
 * ── Kenapa nama gerbang DITEMUKAN, bukan didaftar
 *
 * Tiap modul menamai gerbangnya sendiri: `proyekMilikTenant`, `coMilikTenant`,
 * `versiMilikTenant`, `skenarioMilikTenant`, `tolakRoleTenantLain`,
 * `proyekBolehDibaca`, `resolveScopeItemOwnership`, `idAnggotaCompany`, …
 *
 * Versi pertama skrip ini memakai daftar yang diketik tangan, dan hasilnya
 * menyesatkan persis seperti yang mau dicegah: 58 rute dilaporkan "tanpa
 * gerbang", lalu turun ke 36 begitu daftarnya dilengkapi, lalu masih salah
 * lagi karena `proyekBolehDibaca` belum masuk. Daftar yang diketik tangan
 * SELALU ketinggalan satu, dan tiap yang ketinggalan adalah tuduhan palsu.
 *
 * Maka nama gerbang kini DITURUNKAN dari sumbernya: fungsi yang menerima
 * `request` DAN menyentuh `company_id`/`companyId`/`request.db` di badannya.
 * Menambah gerbang baru otomatis dikenali, tanpa menyunting skrip ini.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(__dirname, '..', 'src')
const RUTE = join(SRC, 'routes', 'v1')

/** Petunjuk tenancy langsung — bukan nama fungsi, melainkan mekanismenya. */
const PETUNJUK_LANGSUNG = [
  'request.db', 'request.companyId', '.shared(', '.viaProject(',
  'company_id', 'companyId', 'auth_company_id',
]

/**
 * Temukan fungsi-gerbang: menerima `request`, dan badannya menyentuh tenancy.
 * Dipindai di routes/ DAN utils/ karena sebagian gerbang dipakai lintas modul.
 */
function temukanGerbang() {
  const nama = new Set()
  const berkas = [
    ...readdirSync(RUTE).filter((f) => f.endsWith('.ts')).map((f) => join(RUTE, f)),
    ...readdirSync(join(SRC, 'utils')).filter((f) => f.endsWith('.ts')).map((f) => join(SRC, 'utils', f)),
  ]
  for (const f of berkas) {
    const isi = readFileSync(f, 'utf8')
    const baris = isi.split('\n')
    for (let i = 0; i < baris.length; i++) {
      const m = baris[i].match(/(?:async\s+)?function\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/)
      if (!m) continue
      // Badan fungsi: sampai deklarasi top-level berikutnya, maks 60 baris.
      let akhir = Math.min(i + 60, baris.length)
      for (let j = i + 1; j < akhir; j++) {
        if (/^(async )?function |^export /.test(baris[j])) { akhir = j; break }
      }
      const badan = baris.slice(i, akhir).join('\n')
      // Fungsi PENDAFTAR RUTE (`cashRoutes(app)`, `ahspRoutes(app)`) juga
      // menyentuh tenancy di dalamnya, tapi ia BUKAN gerbang — ia induk dari
      // rute-rute yang sedang diperiksa. Memasukkannya membuat setiap rute di
      // berkas itu dianggap bergerbang hanya karena nama induknya disebut.
      if (/Routes$/.test(m[1])) continue
      // Gerbang menerima `request` sebagai PARAMETER, bukan `app`.
      const terimaRequest = /\(\s*request\b|request:\s*FastifyRequest/.test(badan)
      const sentuhTenancy = PETUNJUK_LANGSUNG.some((p) => badan.includes(p))
      if (terimaRequest && sentuhTenancy) nama.add(m[1])
    }
  }
  return nama
}

const gerbang = temukanGerbang()
const semua = [...PETUNJUK_LANGSUNG, ...gerbang]

const temuan = []
let bergerbang = 0
for (const f of readdirSync(RUTE).filter((x) => x.endsWith('.ts'))) {
  const baris = readFileSync(join(RUTE, f), 'utf8').split('\n')
  for (let i = 0; i < baris.length; i++) {
    const m = baris[i].match(/app\.(get|post|patch|put|delete)[<(]/)
    if (!m) continue
    let akhir = baris.length
    for (let j = i + 1; j < Math.min(i + 250, baris.length); j++) {
      if (/^\s{2}app\.(get|post|patch|put|delete)[<(]/.test(baris[j])) { akhir = j; break }
    }
    const badan = baris.slice(i, akhir).join('\n')
    if (!/\bsupabase\s*\.\s*(from|rpc|storage)/.test(badan)) continue
    const rute = (badan.match(/'(\/api\/v1\/[^']*)'/) || [])[1] ?? '(?)'
    if (semua.some((g) => badan.includes(g))) { bergerbang++; continue }
    temuan.push(`${f}:${i + 1}  ${m[1].toUpperCase()} ${rute}`)
  }
}

/**
 * AMBANG — jumlah rute ber-supabase-mentah yang BELUM bergerbang.
 *
 * ⚠️ HANYA BOLEH TURUN. Kalau gagal karena NAIK, beri gerbang tenant pada rute
 * baru Anda — jangan naikkan angkanya.
 *
 * 9 tersisa per 2026-07-31, seluruhnya sudah DIPERIKSA satu per satu dan
 * dinyatakan sah lintas-tenant by design:
 *   · auth/login + google-callback       — jalan sebelum tenant bisa diketahui
 *   · modules (kategori A)               — katalog global, bukan data pelanggan
 *   · notifications/subscribe (POST+DEL) — menulis baris pemanggil sendiri
 *   · roles: POST /roles, /permissions, /auth/me/permissions — katalog global
 *   · mandor/kasbon-photo/upload         — tulis storage, tak membaca apa pun
 *
 * Angka ini hasil UKUR sesudah 8 celah nyata ditutup (182 → 192 bergerbang),
 * bukan target yang dipilih supaya hijau.
 */
const AMBANG_TANPA_GERBANG = 9

console.log(`Gerbang yang DITEMUKAN otomatis (${gerbang.size}): ${[...gerbang].sort().join(', ')}`)
console.log(`\nRute ber-supabase-mentah: ${bergerbang + temuan.length} · bergerbang ${bergerbang} · TANPA gerbang ${temuan.length}`)
if (temuan.length) {
  console.log('\n⚠️  Perlu ditinjau — akses mentah tanpa saringan tenant terdeteksi:')
  temuan.forEach((t) => console.log('   ' + t))
  console.log('\n   Sebagian SAH: endpoint lintas-tenant by design (login, katalog')
  console.log('   bersama, /my/companies), atau gerbangnya di luar 250 baris pertama.')
  console.log('   Yang perlu dilihat: rute yang MENULIS atau membaca by-id.')
}

// ── Penjaga (ratchet) ──────────────────────────────────────────────────────
// Dijadikan gerbang CI, bukan sekadar laporan: 8 celah yang ditutup 2026-07-31
// semuanya LOLOS review manusia selama berbulan-bulan. Yang menemukannya alat,
// dan alat yang cuma dijalankan saat seseorang ingat tak menjaga apa pun.
if (temuan.length > AMBANG_TANPA_GERBANG) {
  console.error(`\n❌ PENJAGA GERBANG GAGAL: ${temuan.length} rute tanpa gerbang (ambang ${AMBANG_TANPA_GERBANG}).`)
  console.error('   Rute baru yang menyentuh `supabase` mentah WAJIB punya saringan tenant.')
  console.error('   Pakai `request.db` (.from/.viaProject/.shared), atau gerbang eksplisit')
  console.error('   (proyekMilikTenant, idAnggotaCompany, dst) lalu balas 404 bila bukan haknya.')
  console.error('   JANGAN menaikkan ambang di scripts/audit-gerbang-tenancy.mjs.\n')
  process.exit(1)
}
if (temuan.length < AMBANG_TANPA_GERBANG) {
  console.log(`\n📉 Turun dari ambang (${temuan.length} < ${AMBANG_TANPA_GERBANG}) — kencangkan angkanya.`)
}
