#!/usr/bin/env node
/**
 * UJI MUTASI untuk `audit-tool-ai-read-only.mjs` (I-1 + T-1).
 *
 * Sebagai BERKAS dengan verifikasi suntikan mendarat — alasannya di header
 * `uji-mutasi-gerbang-biaya-ai.mjs`.
 *
 * Mutasi ARROW-CONST sengaja ada: spec menandai bahwa penjaga tenancy yang
 * lama hanya cocok pada `function nama(`, jadi `export const x = async () =>`
 * tak terlihat sekalipun di direktori yang dipindai. Kalau penjaga ini punya
 * kelemahan yang sama, M5 akan hijau — dan itulah yang diuji.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const AKAR = resolve(__dirname, '..', '..', '..')
const PENJAGA = resolve(__dirname, 'audit-tool-ai-read-only.mjs')
const SASARAN = resolve(__dirname, '..', 'src', 'lib', 'ai-tool.ts')

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
    nama: 'M1 tool yang MENULIS ditambahkan      ',
    ubah: (s) => `${s}\nexport async function setujuiPo(db: any, id: string) {\n  return db.from('purchase_orders').update({ status: 'approved' }).eq('id', id)\n}\n`,
    bukti: (s) => s.includes('setujuiPo'),
  },
  {
    nama: 'M2 supabase mentah                    ',
    ubah: (s) => `${s}\nexport async function bocor(supabase: any) {\n  return supabase.from('projects').select('*')\n}\n`,
    bukti: (s) => s.includes('supabase.from'),
  },
  {
    nama: 'M3 unsafe TANPA penyaring             ',
    ubah: (s) => `${s}\nexport async function semua(db: any) {\n  return db.unsafe('invoices', 'alasan').select('*')\n}\n`,
    bukti: (s) => s.includes("db.unsafe('invoices', 'alasan')"),
  },
  {
    nama: 'M4 tool tanpa deklarasi izin          ',
    ubah: (s) => s.replace(
      /^(const toolDaftarProyek: DefinisiToolAi = \{\n  nama: 'daftar_proyek',)/m,
      "const toolPalsu: DefinisiToolAi = {\n  nama: 'tanpa_izin',\n  keterangan: 'x',\n  skema: {},\n  izinTIDAKADA: 'x',\n  async jalan() { return { isi: '', isError: false, entitas: [] } },\n} as never\n$1",
    ),
    bukti: (s) => s.includes('tanpa_izin'),
  },
  {
    // Spec ⚠: penjaga lama BUTA pada bentuk ini.
    nama: 'M5 ARROW-CONST yang menulis (spec ⚠)  ',
    ubah: (s) => `${s}\nexport const hapusProyek = async (db: any, id: string) => db.from('projects').delete().eq('id', id)\n`,
    bukti: (s) => s.includes('hapusProyek'),
  },
  {
    nama: 'M6 rpc() — jalur tulis lewat fungsi DB',
    ubah: (s) => `${s}\nexport async function lewatRpc(db: any) { return db.rpc('setujui_semua') }\n`,
    bukti: (s) => s.includes('lewatRpc'),
  },
]

console.log('══ Uji mutasi: audit-tool-ai-read-only ═════════════════════\n')

const dasar = jalankanPenjaga()
console.log(`  baseline : exit ${dasar} ${dasar === 0 ? '✓ HIJAU' : '✗ MERAH (perbaiki dulu)'}\n`)
if (dasar !== 0) process.exit(1)

let buta = 0
for (const m of MUTASI) {
  const isiAsli = readFileSync(SASARAN, 'utf8')
  const diubah = m.ubah(isiAsli)

  if (diubah === isiAsli) {
    console.log(`  ${m.nama}: SUNTIKAN TAK MENGUBAH APA PUN ✗`)
    buta++
    continue
  }

  writeFileSync(SASARAN, diubah)
  const mendarat = m.bukti(readFileSync(SASARAN, 'utf8'))
  const kode = mendarat ? jalankanPenjaga() : -1
  writeFileSync(SASARAN, isiAsli)

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
console.log(`\n✓ ${MUTASI.length}/${MUTASI.length} mutasi terdeteksi.`)
