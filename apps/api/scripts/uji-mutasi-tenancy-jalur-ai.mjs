#!/usr/bin/env node
/**
 * UJI MUTASI untuk `audit-tenancy-jalur-ai.mjs` (T-1).
 *
 * Sebagai BERKAS dengan verifikasi suntikan mendarat — alasannya di header
 * `uji-mutasi-gerbang-biaya-ai.mjs`.
 *
 * Empat dari tujuh mutasi memakai bentuk penulisan yang berbeda-beda
 * (`function`, arrow-const, method objek, IIFE). Itu inti pengujian: spec
 * menandai bahwa penjaga tenancy lama BUTA pada arrow-const, dan penjaga baru
 * yang punya kelemahan sama akan hijau pada M2.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const AKAR = resolve(__dirname, '..', '..', '..')
const PENJAGA = resolve(__dirname, 'audit-tenancy-jalur-ai.mjs')
const TOOL = resolve(__dirname, '..', 'src', 'lib', 'ai-tool.ts')

function jalankanPenjaga() {
  try {
    execFileSync(process.execPath, [PENJAGA], { cwd: AKAR, stdio: 'pipe' })
    return 0
  } catch (e) {
    return e.status ?? 1
  }
}

const MUTASI = [
  {
    nama: 'M1 supabase mentah — `function` biasa    ',
    ubah: (s) => `${s}\nexport async function bocor1(supabase: any) {\n  return supabase.from('projects').select('*')\n}\n`,
    bukti: (s) => s.includes('bocor1'),
  },
  {
    // Spec ⚠: penjaga LAMA buta pada bentuk ini.
    nama: 'M2 supabase mentah — ARROW-CONST (spec ⚠)',
    ubah: (s) => `${s}\nexport const bocor2 = async (supabase: any) => supabase.from('invoices').select('*')\n`,
    bukti: (s) => s.includes('bocor2'),
  },
  {
    nama: 'M3 supabase mentah — method objek       ',
    ubah: (s) => `${s}\nexport const wadah = { async baca(supabase: any) { return supabase.from('gudang').select('*') } }\n`,
    bukti: (s) => s.includes('async baca(supabase'),
  },
  {
    nama: 'M4 supabase mentah — IIFE               ',
    ubah: (s) => `${s}\nconst hasilIife = (async (supabase: any) => supabase.rpc('apa_saja'))\nvoid hasilIife\n`,
    bukti: (s) => s.includes('hasilIife'),
  },
  {
    nama: 'M5 unsafe TANPA penyaring               ',
    ubah: (s) => `${s}\nexport async function semua(db: any) {\n  return db.unsafe('invoices', 'alasan').select('*')\n}\n`,
    bukti: (s) => s.includes("db.unsafe('invoices', 'alasan')"),
  },
  {
    nama: 'M6 company_id dari ARGUMEN model        ',
    ubah: (s) => `${s}\nexport function pakaiArg(db: any, argumen: any) {\n  return db.from('projects').eq('company_id', argumen.company_id)\n}\n`,
    bukti: (s) => s.includes('argumen.company_id'),
  },
  {
    // T-1c: saringan gudang dihapus — gudang_stok jadi terbaca lintas tenant.
    nama: 'M7 gudang_stok tanpa id gudang dari db  ',
    ubah: (s) => s.replace(
      "const { data: gudang, error: errGudang } = await db.from('gudang').select('id, nama')",
      'const gudang: Array<{ id: string }> = []; const errGudang = null',
    ),
    bukti: (s) => !s.includes("db.from('gudang')"),
  },
]

console.log('══ Uji mutasi: audit-tenancy-jalur-ai (T-1) ════════════════\n')

const dasar = jalankanPenjaga()
console.log(`  baseline : exit ${dasar} ${dasar === 0 ? '✓ HIJAU' : '✗ MERAH (perbaiki dulu)'}\n`)
if (dasar !== 0) process.exit(1)

let buta = 0
for (const m of MUTASI) {
  const isiAsli = readFileSync(TOOL, 'utf8')
  const diubah = m.ubah(isiAsli)

  if (diubah === isiAsli) {
    console.log(`  ${m.nama}: SUNTIKAN TAK MENGUBAH APA PUN ✗`)
    buta++
    continue
  }

  writeFileSync(TOOL, diubah)
  const mendarat = m.bukti(readFileSync(TOOL, 'utf8'))
  const kode = mendarat ? jalankanPenjaga() : -1
  writeFileSync(TOOL, isiAsli)

  if (!mendarat) {
    console.log(`  ${m.nama}: BUKTI GAGAL — suntikan tak mendarat ✗`)
    buta++
  } else if (kode === 0) {
    console.log(`  ${m.nama}: exit 0 ✗ PENJAGA BUTA`)
    buta++
  } else {
    console.log(`  ${m.nama}: exit ${kode} ✓ MERAH`)
  }
}

const pulih = jalankanPenjaga()
console.log(`\n  pulih    : exit ${pulih} ${pulih === 0 ? '✓ HIJAU' : '✗ berkas tak kembali!'}`)

if (buta > 0 || pulih !== 0) {
  console.error(`\n✗ ${buta} mutasi tidak terdeteksi. Penjaga yang tak pernah merah adalah hiasan.`)
  process.exit(1)
}
console.log(`\n✓ ${MUTASI.length}/${MUTASI.length} mutasi terdeteksi — termasuk arrow-const.`)
