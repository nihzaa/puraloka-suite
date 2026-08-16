#!/usr/bin/env node
/**
 * PENJAGA — katalog tool asisten tak boleh membengkak diam-diam. RATCHET.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * BIAYA YANG NAIK TANPA SATU PUN GALAT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Skema tool dikirim ULANG ke model di TIAP ronde. Diukur 2026-08-16:
 *
 *   40 tool  →  4.764 token skema
 *   rata-rata satu ronde nyata  →  2.230 token masuk
 *
 * Katalognya kini **lebih mahal daripada percakapannya sendiri**, lebih dari
 * dua kali lipat. Dan dengan `maks_ronde` 4, satu giliran bisa membayar
 * ~19.000 token hanya untuk mendaftarkan tool — sebagian besar tak dipakai.
 *
 * Yang membuatnya berbahaya: tak ada galat, tak ada test merah. Tool ke-41
 * menaikkan tagihan tiap tenant selamanya, dan yang menambahkannya tak pernah
 * melihat angkanya.
 *
 * ── Bukan larangan menambah tool
 *
 * Ambangnya RATCHET, bukan nol: katalog memang tumbuh. Yang ditahan adalah
 * pertumbuhan yang tak disadari. Menaikkan ambang harus disengaja, terlihat
 * di diff, dan disertai alasan — sama seperti ratchet lain di repo ini.
 *
 * ── Yang benar-benar menurunkan biaya
 *
 * Bukan menahan katalog, melainkan `tool_aktif` per asisten: `staff` cukup 15
 * tool (2.017 token, hemat 2.747). Penjaga ini mengingatkan, kurasi itu yang
 * menyelesaikan.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const akar = join(dirname(fileURLToPath(import.meta.url)), '..')

/*
 * AMBANG — dinaikkan hanya dengan sengaja.
 *
 * 5.200 = 4.764 (keadaan 2026-08-16) + ruang ~9% untuk satu-dua tool lagi
 * sebelum seseorang harus berhenti dan memikirkan kurasi.
 */
const AMBANG_TOKEN = 5200

/** Perkiraan token dari panjang karakter. Kasar, dan cukup untuk ratchet. */
const KE_TOKEN = 4

/*
 * Diukur dari SUMBER, bukan dengan mengimpor modulnya.
 *
 * Mengimpor `ai-tool.ts` menarik seluruh rantai (tenant-db, supabase, env) dan
 * membuat penjaga ini gagal di lingkungan tanpa kredensial — lalu dilewati,
 * lalu tak menjaga apa pun. Penjaga yang butuh basis untuk berjalan adalah
 * penjaga yang mati di CI.
 */
const berkas = [
  /*
   * `ai-tool.ts` IKUT — delapan tool dasar didefinisikan di berkas perakitnya
   * sendiri, bukan di berkas `ai-tool-*.ts` terpisah.
   *
   * Versi pertama penjaga ini melewatkannya dan melapor "32 tool" untuk
   * katalog berisi 40 — angka yang terlalu kecil, dan ambangnya jadi lebih
   * longgar 20% daripada yang dimaksud. Ketahuan karena jumlahnya dicetak;
   * kalau ia hanya mencetak "✓", kekeliruannya tak akan pernah terlihat.
   */
  'src/lib/ai-tool.ts',
  'src/lib/ai-tool-dasar.ts',
  'src/lib/ai-tool-konstruksi.ts',
  'src/lib/ai-tool-siapkan.ts',
  'src/lib/ai-tool-setujui.ts',
  'src/lib/ai-tool-ingat.ts',
  'src/lib/ai-tool-harga.ts',
  'src/lib/ai-tool-perhatian.ts',
  'src/lib/ai-tool-hitung.ts',
  'src/lib/ai-tool-jejak.ts',
  'src/lib/ai-tool-pengingat.ts',
  'src/lib/ai-tool-titip-pesan.ts',
  'src/lib/ai-tool-arus-kas.ts',
  'src/lib/ai-tool-banding-proyek.ts',
  'src/lib/ai-tool-alokasi-kas.ts',
  'src/lib/ai-tool-simulasi-kas.ts',
  'src/lib/ai-tool-serapan-biaya.ts',
  'src/lib/ai-tool-ikhtisar.ts',
  'src/lib/ai-tool-beban-mandor.ts',
  'src/lib/ai-tool-tukang-cocok.ts',
]

let jumlahTool = 0
let charSkema = 0
const takTerbaca = []

for (const b of berkas) {
  let isi
  try {
    isi = readFileSync(join(akar, b), 'utf8')
  } catch {
    takTerbaca.push(b)
    continue
  }

  /*
   * Yang dihitung: `keterangan` + `skema`, dua bagian yang benar-benar
   * dikirim ke model. Komentar dan kode `jalan()` TIDAK — keduanya tak pernah
   * meninggalkan server.
   */
  for (const m of isi.matchAll(/^ {2}nama: '([a-z_0-9]+)',$/gm)) {
    jumlahTool += 1
    void m
  }
  for (const m of isi.matchAll(/^ {2}keterangan:\s*([\s\S]*?)^ {2}izin:/gm)) {
    charSkema += m[1].replace(/\s+/g, ' ').length
  }
  for (const m of isi.matchAll(/^ {2}skema:\s*([\s\S]*?)^ {2}async jalan/gm)) {
    charSkema += m[1].replace(/\s+/g, ' ').length
  }
}

if (takTerbaca.length > 0) {
  console.error('✗ Berkas tool tak terbaca — daftar di penjaga ini sudah basi:')
  for (const b of takTerbaca) console.error(`  ${b}`)
  console.error('\n  Penjaga yang membaca berkas yang tak ada akan MELEWATKAN toolnya')
  console.error('  dan melapor angka yang terlalu kecil. Perbarui daftarnya.')
  process.exit(1)
}

if (jumlahTool === 0) {
  console.error('✗ NOL tool terbaca — pola pembacaannya patah.')
  console.error('  Penjaga yang membaca nol selalu hijau. Perbaiki polanya, jangan abaikan.')
  process.exit(1)
}

const token = Math.round(charSkema / KE_TOKEN)

if (token > AMBANG_TOKEN) {
  console.error(`✗ Katalog tool membengkak: ~${token} token (ambang ${AMBANG_TOKEN}).\n`)
  console.error(`  ${jumlahTool} tool, dan skemanya dikirim ULANG tiap ronde.`)
  console.error('  Rata-rata satu ronde nyata cuma ~2.230 token masuk — katalog yang')
  console.error('  lebih besar daripada percakapannya sendiri menaikkan tagihan tiap')
  console.error('  tenant tanpa satu pun galat.\n')
  console.error('  Dua jalan, dan yang kedua lebih benar:')
  console.error('   1. naikkan AMBANG_TOKEN — sengaja, terlihat di diff, sertai alasan')
  console.error('   2. kurasi `tool_aktif` per asisten (staff cukup 15 tool, hemat 2.747)')
  process.exit(1)
}

console.log(
  `✓ Katalog tool ~${token} token dari ${jumlahTool} tool (ambang ${AMBANG_TOKEN}).`,
)
