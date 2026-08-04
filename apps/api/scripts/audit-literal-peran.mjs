#!/usr/bin/env node
// ============================================================================
// PENJAGA: literal peran sebagai gerbang otorisasi (ADR-004) — RATCHET.
// ============================================================================
//
// ── Kenapa penjaga ini ada
//
// ADR-004 menetapkan: otorisasi hanya boleh lewat `requirePermission`. Literal
// `'admin'`/`'pm'`/`'mandor'`/`'client'` DILARANG sebagai gerbang — peran adalah
// data konfigurasi per-tenant, bukan konstanta kode.
//
// Audit 2026-08-02 menemukan **53 pelanggaran** yang lolos berbulan-bulan. Lebih
// buruk: saat diuji 2026-08-03 (langkah 5 mandat CI), ternyata **tak satu pun
// dari 14 penjaga CI yang menangkapnya** — menyisipkan
// `u.role === 'admin'` ke berkas route lolos seluruh gerbang.
//
// Penjaga yang tak pernah terbukti bisa merah harus dianggap tidak ada. Untuk
// aturan sepenting ADR-004, itu berarti aturannya selama ini hanya konvensi.
//
// ── Hubungannya dengan `apps/web/scripts/adr004-ratchet.mjs`
//
// Penjaga itu sudah ada dan berjalan di CI, tetapi cakupannya **hanya sisi WEB**.
// Header-nya menyatakan: *"Sisi API sudah patuh (`requirePermission` di
// mana-mana)"* — dan itu **tidak benar**. Pengukuran 2026-08-03 menemukan
// **52 pelanggaran di `apps/api/src`**.
//
// Jadi keduanya saling melengkapi, bukan duplikat: `adr004-ratchet.mjs` menjaga
// UI, berkas ini menjaga API. Keduanya wajib jalan.
//
// ── Kenapa RATCHET, bukan ambang nol
//
// 53 pelanggaran existing adalah utang Fase 3 (`QUEUE.yaml` F3-1) yang butuh
// pembongkaran per-endpoint. Menetapkan nol hari ini membuat CI merah permanen,
// dan CI yang selalu merah akan dimatikan orang — kegagalan yang lebih buruk
// daripada tak punya penjaga.
//
// Maka: angka hari ini jadi LANTAI. Boleh turun, **tak boleh naik**. Tiap
// pelanggaran baru langsung merah, sementara yang lama dibersihkan terjadwal.
//
// ── Yang dihitung sebagai pelanggaran
//
// HANYA literal peran di posisi PENGAMBIL KEPUTUSAN otorisasi:
//   · `x.role === 'admin'` / `!==`
//   · `['admin','pm'].includes(x.role)`
//   · `requireRole('admin')`
//
// Yang TIDAK dihitung (sengaja):
//   · seed & migrasi — di sanalah peran memang didefinisikan
//   · label UI, pesan galat, komentar
//   · berkas test — justru harus menguji perilaku per-peran
//
// Membedakan keduanya penting: penjaga yang menuduh seed akan mengajari orang
// mengabaikan laporannya.
// ============================================================================

import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs'
import { join, dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const API_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(API_ROOT, 'src')
const LANTAI = join(API_ROOT, 'scripts', 'literal-peran-lantai.json')

const PERAN = ['admin', 'pm', 'mandor', 'client']

// ── Pola GERBANG OTORISASI — dipersempit 2026-08-04 (F3-1) ──────────────────
//
// Versi pertama menghitung SETIAP `user.role === '<peran>'` sebagai
// pelanggaran, dan melaporkan 52. Diperiksa satu per satu saat F3-1 dikerjakan:
// **nol** di antaranya gerbang otorisasi.
//
// ADR-004 Rule #6 memisahkan tiga hal yang mudah tertukar:
//
//   otorisasi   — boleh/tolak AKSES. Tunduk Rule #1, wajib requirePermission.
//   business rule — mis. autoApprove. Bukan otorisasi.
//   data-scoping — data MANA yang terlihat. Bukan otorisasi.
//
// Ke-52 temuan lama seluruhnya jenis ketiga, dan bentuknya khas:
//
//     if (user.role === 'mandor' && existing.mandor_id !== user.id)
//       return reply.status(403)
//
// Yang menentukan penolakan di sana adalah `mandor_id !== user.id` —
// KEPEMILIKAN BARIS. Perannya cuma memilih KOLOM mana yang dibandingkan
// (`mandor_id` untuk mandor, `pm_id` untuk pm). Capability-nya sendiri sudah
// dijaga `requirePermission` di preHandler: mandor.ts punya 17, projects.ts 5,
// finance.ts 11 — dan NOL `requireRole` di seluruh src.
//
// Menuntut pola itu diganti `requirePermission` justru dilarang Rule #6:
// membungkus aturan kepemilikan jadi permission adalah over-engineering yang
// mengaburkan model. "Boleh mengubah data tukang" ≠ "tukang ini milik saya".
//
// Karena itu POLA kini hanya menangkap bentuk yang TAK MUNGKIN dibela sebagai
// scoping: `requireRole()` dan `switch (role)` — keduanya memutuskan akses
// murni dari nama peran, tanpa kepemilikan apa pun.
const POLA = [
  new RegExp(`requireRole\\s*\\(\\s*['"\`](${PERAN.join('|')})['"\`]`, 'g'),
  /switch\s*\(\s*\w*\.role\s*\)/g,
  // `.role === 'x'` yang langsung menolak TANPA membandingkan kepemilikan
  // apa pun di baris yang sama. Bentuk inilah gerbang murni.
  new RegExp(
    `\\.role\\s*[!=]==?\\s*['"\`](${PERAN.join('|')})['"\`]\\s*\\)\\s*(return\\s+)?reply\\.status\\s*\\(\\s*40[13]`,
    'g'),
]

function* berkasTs(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === '__tests__' || e.name === 'node_modules' || e.name === 'test-utils') continue
      yield* berkasTs(p)
    } else if (e.name.endsWith('.ts') && !e.name.endsWith('.test.ts')) {
      yield p
    }
  }
}

const temuan = []
for (const p of berkasTs(SRC)) {
  const isi = readFileSync(p, 'utf8')
  const baris = isi.split('\n')
  baris.forEach((teks, i) => {
    const bersih = teks.trim()
    if (bersih.startsWith('//') || bersih.startsWith('*')) return
    for (const re of POLA) {
      re.lastIndex = 0
      if (re.test(teks)) {
        temuan.push(`${relative(API_ROOT, p).replace(/\\/g, '/')}:${i + 1}`)
        return
      }
    }
  })
}

const naikkan = process.argv.includes('--naikkan')
const jumlah = temuan.length

// `--daftar` — cetak lokasinya, bukan hanya angkanya.
//
// Ditambahkan saat F3-1 dikerjakan: penjaga yang hanya melaporkan "52" memaksa
// orang menulis ulang deteksinya sendiri untuk tahu HARUS MEMPERBAIKI APA.
// Angka menjaga; daftar memperbaiki. Keduanya perlu.
if (process.argv.includes('--daftar')) {
  const perBerkas = {}
  for (const t of temuan) {
    const f = t.replace(/:\d+$/, '')
    ;(perBerkas[f] ??= []).push(t.replace(/^.*:/, ''))
  }
  for (const [f, baris] of Object.entries(perBerkas).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`${String(baris.length).padStart(3)}  ${f}  (baris ${baris.join(', ')})`)
  }
  console.log(`\n  total ${jumlah} pelanggaran di ${Object.keys(perBerkas).length} berkas`)
  process.exit(0)
}

console.log('══ PENJAGA literal peran (ADR-004) ' + '═'.repeat(34))
console.log(`  pelanggaran ditemukan : ${jumlah}`)

if (!existsSync(LANTAI)) {
  writeFileSync(LANTAI, JSON.stringify({
    _catatan: 'Lantai literal peran (ADR-004). Boleh TURUN, tak boleh NAIK. Lihat scripts/audit-literal-peran.mjs.',
    _utang: 'Pembersihan terjadwal di QUEUE.yaml F3-1 (Fase 3).',
    maks: jumlah,
  }, null, 2) + '\n')
  console.log(`  lantai awal ditulis   : ${jumlah}`)
  process.exit(0)
}

const lantai = JSON.parse(readFileSync(LANTAI, 'utf8'))
console.log(`  lantai (maks)         : ${lantai.maks}`)

if (naikkan) {
  writeFileSync(LANTAI, JSON.stringify({ ...lantai, maks: jumlah }, null, 2) + '\n')
  console.log(`\n  lantai DISETEL ke ${jumlah}.`)
  process.exit(0)
}

if (jumlah > lantai.maks) {
  console.error(`\n  ❌ BERTAMBAH ${jumlah - lantai.maks} pelanggaran baru.\n`)
  temuan.slice(0, 20).forEach((t) => console.error(`     ${t}`))
  if (temuan.length > 20) console.error(`     … +${temuan.length - 20} lagi`)
  console.error(`
  ADR-004: otorisasi HANYA lewat requirePermission. Peran adalah data
  konfigurasi per-tenant, bukan konstanta kode — literal peran membuat sistem
  multi-perusahaan mustahil, karena 'admin' di satu perusahaan bukan 'admin'
  di perusahaan lain.

  Perbaikan: ganti dengan requirePermission('<kapabilitas>').
  Utang lama dibersihkan terjadwal di QUEUE.yaml F3-1 — jangan menambahnya.`)
  process.exit(1)
}

if (jumlah < lantai.maks) {
  console.log(`\n  ⬇️  TURUN ${lantai.maks - jumlah} — kencangkan lantai:`)
  console.log('     node scripts/audit-literal-peran.mjs --naikkan')
}
console.log('\n  ✅ tidak bertambah.')
process.exit(0)
