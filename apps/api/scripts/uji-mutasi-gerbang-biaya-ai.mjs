#!/usr/bin/env node
/**
 * UJI MUTASI untuk `audit-gerbang-biaya-ai.mjs`.
 *
 * Ditulis sebagai BERKAS, bukan rangkaian perintah shell. Alasannya bukan
 * kerapian: pada 2026-08-09 uji mutasi lewat satu-baris bash melaporkan HIJAU
 * empat kali berturut-turut padahal suntikannya tak pernah mendarat — CRLF tak
 * cocok, `cp` gagal diam-diam, dan tanda kutip bash/JS bertabrakan. Uji mutasi
 * yang salah lebih buruk daripada tak ada: ia menerbitkan penjaga buta dengan
 * sertifikat lulus.
 *
 * Karena itu tiap mutasi di sini MEMVERIFIKASI suntikannya mendarat sebelum
 * menilai hasil, dan mengembalikan berkasnya dari salinan di memori.
 *
 * Pakai:  node apps/api/scripts/uji-mutasi-gerbang-biaya-ai.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const AKAR = resolve(__dirname, '..', '..', '..')
const PENJAGA = resolve(__dirname, 'audit-gerbang-biaya-ai.mjs')
const SASARAN = resolve(__dirname, '..', 'src', 'routes', 'v1', 'ai.ts')

function jalankanPenjaga() {
  try {
    execFileSync(process.execPath, [PENJAGA], { cwd: AKAR, stdio: 'pipe' })
    return 0
  } catch (e) {
    return e.status ?? 1
  }
}

const asli = readFileSync(SASARAN, 'utf8')

const MUTASI = [
  {
    nama: 'M1 gerbang DIHAPUS',
    ubah: (s) => s.replace(/const gerbang = await periksaGerbangAi\(db, 'insight'\)/,
      "const gerbang = { boleh: true, konfigurasi: { model: MODEL_JATUHAN, maxToken: 1024, penyedia: 'anthropic' }, terpakaiIdr: 0, peringatan: null } as const"),
    bukti: (s) => !s.includes('await periksaGerbangAi('),
  },
  {
    // Bentuk kegagalan yang PALING mungkin muncul nyata, dan yang membuat
    // versi pertama penjaga ini buta: seseorang menambah ronde kedua dan
    // mengira gerbang di atas masih berlaku. Tidak — gerbang itu membaca
    // pemakaian SEBELUM ronde pertama menghabiskan apa pun.
    //
    // Catatan: mutasi ini sengaja TIDAK menyertakan gerbang kedua. Versi
    // pertamanya menyertakan, dan itu justru pola yang SAH — penjaganya benar
    // saat menghijaukannya. Mutasi yang menguji pola sah tidak menguji apa pun.
    nama: 'M2 ronde KEDUA tanpa gerbang sendiri',
    ubah: (s) =>
      s.replace(
        /(\s+)let wawasan: ReturnType<typeof periksaJawaban> = null/,
        '$1const jawabKedua = await dibuat.adaptor.chat({ model, maxToken: 8, pesan: [] })$1void jawabKedua$1let wawasan: ReturnType<typeof periksaJawaban> = null',
      ),
    bukti: (s) => s.includes('jawabKedua'),
  },
  {
    // Urutan benar-benar terbalik: gerbangnya ada, tapi SESUDAH panggilan.
    nama: 'M3 urutan TERBALIK (gerbang sesudah panggil)',
    ubah: (s) => {
      const tanpaGerbang = s.replace(
        /const gerbang = await periksaGerbangAi\(db, 'insight'\)/,
        "const gerbang = { boleh: true, konfigurasi: { model: MODEL_JATUHAN, maxToken: 1024, penyedia: 'anthropic' }, terpakaiIdr: 0, peringatan: null } as const",
      )
      return tanpaGerbang.replace(
        /(\s+)let wawasan: ReturnType<typeof periksaJawaban> = null/,
        "$1const telat = await periksaGerbangAi(db, 'insight')$1void telat$1let wawasan: ReturnType<typeof periksaJawaban> = null",
      )
    },
    bukti: (s) => s.includes('const telat') && !s.includes("const gerbang = await periksaGerbangAi"),
  },
  {
    nama: 'M4 pencatatan biaya DIHAPUS',
    ubah: (s) => s.replace(/await catatBiayaRonde\(/, 'await Promise.resolve('),
    bukti: (s) => !s.includes('catatBiayaRonde('),
  },
  {
    // L-1: loop dikecualikan dari G-1/G-2, jadi aturan penggantinya HARUS
    // bisa merah. Pengecualian tanpa pengganti yang teruji sama dengan
    // pelemahan penjaga.
    nama: 'M5 loop berhenti mencatat tiap ronde (L-1)',
    berkasLain: resolve(__dirname, '..', 'src', 'lib', 'ai-loop.ts'),
    ubah: (s) => s.replace(
      'await opsi.catatRonde(jawab.pemakaian, ronde)',
      'void jawab.pemakaian // catatRonde dihapus',
    ),
    bukti: (s) => !s.includes('await opsi.catatRonde('),
  },
  {
    nama: 'M6 panggilan .stream() tanpa gerbang di berkas lain',
    berkasLain: resolve(__dirname, '..', 'src', 'routes', 'v1', 'ai-config.ts'),
    ubah: (s) => `${s}\n// mutasi\nasync function bocor(anthropic: any) { return anthropic.messages.stream({ model: 'x' }) }\n`,
    bukti: (s) => s.includes('async function bocor'),
  },
]

console.log('══ Uji mutasi: audit-gerbang-biaya-ai ══════════════════════\n')

const dasar = jalankanPenjaga()
console.log(`  baseline : exit ${dasar} ${dasar === 0 ? '✓ HIJAU' : '✗ MERAH (perbaiki dulu)'}\n`)
if (dasar !== 0) process.exit(1)

let buta = 0
for (const m of MUTASI) {
  const target = m.berkasLain ?? SASARAN
  const isiAsli = readFileSync(target, 'utf8')
  const diubah = m.ubah(isiAsli)

  if (diubah === isiAsli) {
    console.log(`  ${m.nama}: SUNTIKAN TAK MENGUBAH APA PUN — hasil tak sah ✗`)
    buta++
    continue
  }

  writeFileSync(target, diubah)
  const mendarat = m.bukti(readFileSync(target, 'utf8'))
  const kode = mendarat ? jalankanPenjaga() : -1
  writeFileSync(target, isiAsli)

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
console.log(`\n  pulih    : exit ${pulih} ${pulih === 0 ? '✓ HIJAU' : '✗ MERAH — berkas tak kembali!'}`)

if (buta > 0 || pulih !== 0) {
  console.error(`\n✗ ${buta} mutasi tidak terdeteksi. Penjaga yang tak pernah merah adalah hiasan.`)
  process.exit(1)
}
console.log(`\n✓ ${MUTASI.length}/${MUTASI.length} mutasi terdeteksi.`)
