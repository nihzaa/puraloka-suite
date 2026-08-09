#!/usr/bin/env node
/**
 * UJI MUTASI untuk `audit-sesi-sintetis-aman.mjs`.
 *
 * M1 adalah bentuk serangan yang kriteria D1 sebut secara khusus: pabrik yang
 * menerima peran dari pemanggil. Satu webhook yang dipalsukan cukup mengirim
 * `peran: 'admin'` untuk mendapat seluruh permission — tanpa galat apa pun.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const AKAR = resolve(__dirname, '..', '..', '..')
const PENJAGA = resolve(__dirname, 'audit-sesi-sintetis-aman.mjs')
const PABRIK = resolve(__dirname, '..', 'src', 'lib', 'wa-sesi.ts')
const LUAR = resolve(__dirname, '..', 'src', 'routes', 'v1', 'ai-chat.ts')

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
    // Persis yang kriteria D1 larang.
    nama: 'M1 pabrik MENERIMA peran dari pemanggil',
    berkas: PABRIK,
    ubah: (s) => s.replace(
      '  nomorMentah: string,\n): Promise<HasilSesi> {',
      '  nomorMentah: string,\n  peran?: string,\n): Promise<HasilSesi> {',
    ),
    bukti: (s) => s.includes('peran?: string,'),
  },
  {
    nama: 'M2 peran TIDAK lagi dari company_members',
    berkas: PABRIK,
    ubah: (s) => s.split(".from('company_members')").join(".from('wa_nomor_pengguna')"),
    // Bukti memeriksa PEMANGGILANNYA, bukan seluruh berkas: kata
    // `company_members` juga muncul di komentar yang menjelaskan kenapa ia
    // dipakai, jadi `!s.includes(...)` tak pernah benar. Bukti yang salah
    // membuat mutasi dilaporkan "tak mendarat" padahal ia mendarat.
    bukti: (s) => !s.includes(".from('company_members')"),
  },
  {
    nama: 'M3 verifikasi nomor DILEWATI          ',
    berkas: PABRIK,
    // Kolom `terverifikasi_pada` dihapus dari SELECT — jalur paling nyata
    // seseorang "menyederhanakan" query lalu kehilangan pemeriksaannya.
    ubah: (s) => s.replace(
      "    .select('user_id, company_id, terverifikasi_pada, aktif')",
      "    .select('user_id, company_id, aktif')",
    ),
    bukti: (s) => !s.includes("company_id, terverifikasi_pada, aktif"),
  },
  {
    nama: 'M4 currentUser ber-peran di rute lain ',
    berkas: LUAR,
    ubah: (s) => `${s}\nconst sesiPalsu = { currentUser: { id: 'x', role: 'admin' } }\nvoid sesiPalsu\n`,
    bukti: (s) => s.includes('sesiPalsu'),
  },
]

console.log('══ Uji mutasi: audit-sesi-sintetis-aman ════════════════════\n')

const dasar = jalankanPenjaga()
console.log(`  baseline : exit ${dasar} ${dasar === 0 ? '✓ HIJAU' : '✗ MERAH (perbaiki dulu)'}\n`)
if (dasar !== 0) process.exit(1)

let buta = 0
for (const m of MUTASI) {
  const isiAsli = readFileSync(m.berkas, 'utf8')
  const diubah = m.ubah(isiAsli)

  if (diubah === isiAsli) {
    console.log(`  ${m.nama}: SUNTIKAN TAK MENGUBAH APA PUN ✗`)
    buta++
    continue
  }

  writeFileSync(m.berkas, diubah)
  const mendarat = m.bukti(readFileSync(m.berkas, 'utf8'))
  const kode = mendarat ? jalankanPenjaga() : -1
  writeFileSync(m.berkas, isiAsli)

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
