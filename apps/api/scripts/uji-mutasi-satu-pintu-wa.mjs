#!/usr/bin/env node
/**
 * UJI MUTASI untuk `audit-satu-pintu-wa.mjs`.
 *
 * Sebagai BERKAS dengan verifikasi suntikan mendarat — alasannya di header
 * `uji-mutasi-gerbang-biaya-ai.mjs`.
 *
 * M1 meniru cacat TJS yang sesungguhnya: titik kirim kedua dengan bentuk
 * muatan yang MENYIMPANG (`textMessage: { text }` alih-alih `text`). Di TJS
 * bentuk itu membuat alert stok tak pernah terkirim selama berbulan-bulan,
 * tanpa satu pun galat.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const AKAR = resolve(__dirname, '..', '..', '..')
const PENJAGA = resolve(__dirname, 'audit-satu-pintu-wa.mjs')
const LUAR = resolve(__dirname, '..', 'src', 'routes', 'v1', 'ai-chat.ts')
const PINTU = resolve(__dirname, '..', 'src', 'lib', 'wa-kirim.ts')

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
    // Persis cacat TJS: titik kirim kedua, bentuk muatan menyimpang.
    nama: 'M1 titik kirim KEDUA (bentuk menyimpang)',
    berkas: LUAR,
    ubah: (s) => `${s}\nasync function kirimLangsung(n: string) {\n  return fetch('http://wa:8080/message/sendText/x', {\n    method: 'POST',\n    body: JSON.stringify({ number: n, textMessage: { text: 'halo' } }),\n  })\n}\n`,
    bukti: (s) => s.includes('kirimLangsung'),
  },
  {
    nama: 'M2 endpoint Meta di berkas lain      ',
    berkas: LUAR,
    ubah: (s) => `${s}\nconst urlMeta = 'https://graph.facebook.com/v20.0/x/messages'\nvoid urlMeta\n`,
    bukti: (s) => s.includes('graph.facebook.com'),
  },
  {
    nama: 'M3 pintu MELEMPAR (W-3)              ',
    berkas: PINTU,
    ubah: (s) => s.replace(
      "    return { ok: false, alasan: 'nomor_tak_sah', pesan: `Nomor '${opsi.nomor}' tidak sah` }",
      "    throw new Error('nomor tak sah')",
    ),
    bukti: (s) => s.includes("throw new Error('nomor tak sah')"),
  },
  {
    nama: 'M4 registry adaptor DIHAPUS (W-4)    ',
    berkas: PINTU,
    ubah: (s) => s.replace('export function buatAdaptorWa', 'function buatAdaptorWa'),
    bukti: (s) => !s.includes('export function buatAdaptorWa'),
  },
  {
    nama: 'M5 idempotensi DILEWATI (W-5)        ',
    berkas: PINTU,
    ubah: (s) => s.split("'wa_kirim_idempotensi'").join("'wa_pesan_log'"),
    bukti: (s) => !s.includes('wa_kirim_idempotensi'),
  },
]

console.log('══ Uji mutasi: audit-satu-pintu-wa ═════════════════════════\n')

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
