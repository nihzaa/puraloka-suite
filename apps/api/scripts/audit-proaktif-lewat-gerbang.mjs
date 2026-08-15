#!/usr/bin/env node
/**
 * PENJAGA: PESAN PROAKTIF WAJIB LEWAT GERBANG.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG DICEGAH — DAN KENAPA GEJALANYA NOL
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-15: repo ini NOL jam tenang, NOL opt-out, NOL batas
 * frekuensi. `kirimWa` tak punya throttle sama sekali, dan penyedia bawaan
 * (Evolution) tak punya batas jendela 24 jam seperti WhatsApp Business resmi.
 *
 * Menambah satu `kirimWa` baru di penjadwal adalah lima baris yang tampak
 * wajar saat ditulis. Yang terjadi sesudahnya: pesan pukul 03:00, berulang,
 * ke orang yang tak pernah diminta persetujuannya — tanpa satu pun galat,
 * tanpa satu pun test merah.
 *
 * Repo ini SUDAH pernah kena bentuknya: satu alur mengirim 28 WhatsApp
 * sungguhan sementara bukunya kosong (`audit-alur-tercatat` lahir dari situ).
 * Yang menghentikannya bukan penjaga, melainkan seseorang yang kebetulan
 * memperhatikan.
 *
 * ── Yang diperiksa
 *
 *   G-1  `bolehKirim` ADA dan memuat kelima pemeriksaannya
 *   G-2  kelimanya FAIL-CLOSED — kegagalan baca MENAHAN, bukan meloloskan
 *   G-3  `mendesak` TIDAK bisa menembus opt-out
 *   G-4  tiap pemanggil `kirimWa` di jalur PROAKTIF melewati `bolehKirim`
 *
 * G-4 adalah inti penjaga ini. "Jalur proaktif" ditentukan dari berkasnya:
 * pemanggil yang BUKAN balasan atas pesan masuk. Balasan sengaja TIDAK lewat
 * gerbang — orang yang mengetik pertanyaan pukul 23:00 memang sedang menunggu
 * jawaban, dan menahannya berarti memutus percakapan yang ia sendiri mulai.
 *
 * Ambang NOL.
 *
 * Pakai:  node apps/api/scripts/audit-proaktif-lewat-gerbang.mjs
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, relative, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(__dirname, '..', 'src')
const GERBANG = join('lib', 'gerbang-kirim.ts')

/**
 * Berkas yang memanggil `kirimWa` sebagai BALASAN, bukan sebagai pesan
 * proaktif — jadi memang tak lewat gerbang.
 *
 * Daftar ini sengaja bukan pola. Nama ditulis penuh supaya penambahan
 * berikutnya terlihat di diff dan harus dijelaskan: tiap nama baru di sini
 * adalah satu jalur kirim yang berhenti dijaga.
 *
 *   wa-webhook.ts  membalas pesan yang BARU SAJA masuk (tolak-izin, gagal,
 *                  jawaban asisten). Ketiganya berkunci idempotensi dari
 *                  `pesanId` — tak mungkin lahir tanpa ada yang mengetik.
 *   wa-nomor.ts    kode verifikasi, dipicu klik manusia di halaman WhatsApp.
 */
const BALASAN_SAH = new Set(['routes/v1/wa-webhook.ts', 'routes/v1/wa-nomor.ts'])

const pelanggaran = []

// ── G-1 & G-2 & G-3: bentuk gerbangnya sendiri ─────────────────────────────
const jalurGerbang = resolve(SRC, GERBANG)
if (!existsSync(jalurGerbang)) {
  pelanggaran.push(`G-1 ${GERBANG} tidak ada — gerbang keluar hilang sepenuhnya`)
} else {
  const g = readFileSync(jalurGerbang, 'utf8')

  /*
   * Dicocokkan ke BADAN `bolehKirim`, bukan ke seluruh berkas.
   *
   * Versi pertama penjaga ini HIJAU-KARENA-BUTA: mencabut pemanggilan
   * `didalamJamTenang(...)` dari `bolehKirim` tak memerahkan apa pun, karena
   * fungsinya masih DIDEFINISIKAN di berkas yang sama — dan regex seluruh
   * berkas tetap menemukannya.
   *
   * Pola yang sama sudah menggigit dua kali di `audit-ingatan-tak-bocor`.
   * Yang dijaga bukan "kata itu ada di berkas", melainkan "keputusannya
   * benar-benar melewati pemeriksaan itu".
   */
  const badanBolehKirim = g.match(
    /export async function bolehKirim\([\s\S]*?\n\}/,
  )

  if (!badanBolehKirim) {
    pelanggaran.push('G-1 fungsi `bolehKirim` tidak ditemukan')
  } else {
    const badan = badanBolehKirim[0]
    const PEMERIKSAAN = [
      { pola: /pref\.berhenti/, nama: 'opt-out (berhenti)' },
      { pola: /didalamJamTenang\(/, nama: 'jam tenang' },
      { pola: /hari_libur/, nama: 'hari libur' },
      // Yang dicari KEPUTUSANNYA (`sisa` dihitung dari `maksPerHari`, lalu
      // dibandingkan), bukan sekadar sebutan namanya: pesan galat di bawah
      // juga menyebut `pref.maksPerHari`, jadi pola yang longgar tetap hijau
      // walau perbandingannya sudah dicabut.
      { pola: /const sisa = pref\.maksPerHari - dipakai/, nama: 'kuota harian (hitungan sisa)' },
      { pola: /sisa <= 0/, nama: 'kuota harian (perbandingan)' },
      { pola: /bolehSapaan/, nama: 'sapaan tanpa temuan' },
    ]
    for (const p of PEMERIKSAAN) {
      if (!p.pola.test(badan)) {
        pelanggaran.push(`G-1 pemeriksaan ${p.nama} HILANG dari bolehKirim`)
      }
    }
  }

  // G-2: kegagalan baca preferensi harus MENAHAN.
  //
  // Diperiksa sebagai bentuk `boleh: false` di dalam cabang galatnya, bukan
  // sekadar "ada kata gagal_baca_preferensi": nilai `boleh: true` di sana
  // membalik artinya sepenuhnya sambil tetap terlihat seperti penanganan galat.
  const mGalat = g.match(/if \(error\) \{[\s\S]{0,400}?\n  \}/)
  if (!mGalat) {
    pelanggaran.push('G-2 cabang penanganan galat preferensi tak ditemukan')
  } else if (!/boleh:\s*false/.test(mGalat[0])) {
    pelanggaran.push(
      'G-2 kegagalan baca preferensi TIDAK fail-closed — satu gangguan basis ' +
        'membuka pintu untuk seluruh pesan sekaligus, persis saat sistemnya tak sehat',
    )
  }

  // G-3: opt-out tak boleh ditembus `mendesak`.
  const mBerhenti = g.match(/if \(pref\.berhenti[^)]*\)/)
  if (mBerhenti && /mendesak/.test(mBerhenti[0])) {
    pelanggaran.push(
      'G-3 opt-out bisa ditembus `mendesak` — pengecualian yang bisa ditembus ' +
        'siapa pun bukan opt-out',
    )
  }
}

// ── G-4: pemanggil kirimWa di jalur proaktif ───────────────────────────────
function berkasTs(dir, keluar = []) {
  for (const nama of readdirSync(dir)) {
    if (nama === 'node_modules' || nama === '__tests__') continue
    const penuh = join(dir, nama)
    if (statSync(penuh).isDirectory()) berkasTs(penuh, keluar)
    else if (nama.endsWith('.ts')) keluar.push(penuh)
  }
  return keluar
}

for (const berkas of berkasTs(SRC)) {
  const rel = relative(SRC, berkas).replace(/\\/g, '/')
  // Pustaka kirimnya sendiri mendefinisikan `kirimWa`, bukan memanggilnya
  // sebagai pesan proaktif.
  if (rel === 'lib/wa-kirim.ts' || BALASAN_SAH.has(rel)) continue

  const isi = readFileSync(berkas, 'utf8')
  if (!/\bkirimWa\s*\(/.test(isi)) continue

  if (!/\bbolehKirim\s*\(/.test(isi)) {
    pelanggaran.push(
      `G-4 ${rel} memanggil kirimWa TANPA bolehKirim — pesan proaktif yang ` +
        'melewati gerbang bisa terkirim pukul 03:00, berulang, ke orang yang ' +
        'sudah menyatakan berhenti',
    )
  }
}

// ── Laporan ────────────────────────────────────────────────────────────────
if (pelanggaran.length > 0) {
  console.error('\n✗ GERBANG KELUAR BOCOR\n')
  for (const p of pelanggaran) console.error(`  • ${p}`)
  console.error(
    `\n  ${pelanggaran.length} pelanggaran. Ambang NOL.\n` +
      '  Pesan proaktif yang melewati gerbang TIDAK menghasilkan galat —\n' +
      '  gejalanya hanya telepon yang berbunyi pukul tiga pagi.\n',
  )
  process.exit(1)
}

console.log(
  `✓ Gerbang keluar utuh — 5 pemeriksaan fail-closed, opt-out tak tertembus, ` +
    `${BALASAN_SAH.size} jalur balasan tercatat beralasan.`,
)
