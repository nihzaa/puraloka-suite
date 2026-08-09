#!/usr/bin/env node
/**
 * PENJAGA: HARGA MODEL AI HANYA HIDUP DI SATU BERKAS.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * CACAT TJS YANG DICEGAH (spec lapisan AI §5.1 C-7)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * TJS punya DUA tabel harga hardcode yang tak sepakat:
 *
 *   lib/owner-ai/model-pricing.ts    Opus  $5 / $25   <- dipakai MENCATAT biaya
 *   lib/ai/providers/anthropic.ts    Opus $15 / $75   <- dipakai UI
 *
 * Biaya yang tercatat **3x lebih rendah** dari yang ditampilkan ke admin.
 * Keduanya "bekerja" — hanya menjawab pertanyaan yang sama dengan angka
 * berbeda, dan tak ada error yang menandainya.
 *
 * Angka biaya yang salah lebih berbahaya daripada tak ada angka: ia DIPERCAYA.
 * Admin yang melihat "Rp 200 ribu bulan ini" mengambil keputusan berdasarkan
 * itu, lalu tagihannya datang tiga kali lipat.
 *
 * ── Yang diperiksa
 *
 * Angka harga per-MTok di luar `lib/ai-harga.ts` = merah. Dikenali dari nama
 * kunci yang lazim dipakai (`masuk`/`keluar`/`inputPrice`/`perMTok`/…) yang
 * bernilai angka.
 *
 * Kursnya juga: `16000` / `16_000` di luar berkas itu berarti seseorang
 * memaku kurs di komponen — persis yang TJS lakukan di UI-nya.
 *
 * Ambang NOL. Harga yang tersebar bukan utang teknis; ia angka yang salah
 * sejak baris keduanya ditulis.
 *
 * Pakai:  node apps/api/scripts/audit-satu-sumber-harga.mjs
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(__dirname, '..', 'src')
const SUMBER = 'lib/ai-harga.ts'

if (!existsSync(join(SRC, 'lib', 'ai-harga.ts'))) {
  console.error(`✗ Sumber harga tak ditemukan: ${SUMBER}`)
  console.error('  Kalau dipindah, perbarui SUMBER di penjaga ini.')
  process.exit(1)
}

/** Nama kunci yang menandai "ini harga per juta token". */
const KUNCI_HARGA = [
  // `masuk`/`keluar` SENGAJA TIDAK di sini meski itu nama di `ai-harga.ts` —
  // terlalu umum. Keduanya diperiksa terpisah, hanya di berkas yang memang
  // berkonteks AI (lihat `berkonteksAi`).
  'cacheTulis', 'cacheBaca',
  'inputPrice', 'outputPrice', 'perMTok', 'per_mtok',
  'inputPerMillion', 'outputPerMillion',
  'hargaMasuk', 'hargaKeluar',
]

/**
 * Berkas yang isinya memang tentang harga model AI.
 *
 * `masuk`/`keluar` hanya dianggap harga BILA berkasnya juga menyebut model AI.
 * Versi pertama penjaga ini tak punya syarat itu dan langsung menuduh empat
 * baris arus kas — `{ masuk: 0, keluar: 0 }` di `finance.ts` dan `reports.ts`,
 * yang tak ada hubungannya dengan AI.
 *
 * Penjaga yang menuduh kode tak bersalah akan dimatikan orang, dan matinya
 * membawa serta tuduhan yang benar.
 */
function berkonteksAi(src) {
  return /claude-|gpt-|\bMTok\b|token_masuk|hargaModel|biayaUsd/i.test(src)
}

function berkasTs(dir) {
  const hasil = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) hasil.push(...berkasTs(p))
    else if (e.name.endsWith('.ts')) hasil.push(p)
  }
  return hasil
}

/** Buang komentar TANPA mengubah jumlah baris. */
function tanpaKomentar(src) {
  let dalamBlok = false
  return src.split('\n').map((b) => {
    const t = b.trim()
    if (dalamBlok) {
      if (t.includes('*/')) dalamBlok = false
      return ''
    }
    if (t.startsWith('/*')) {
      if (!t.includes('*/')) dalamBlok = true
      return ''
    }
    if (t.startsWith('//') || t.startsWith('*')) return ''
    return b
  }).join('\n')
}

const temuan = []
const berkas = berkasTs(SRC)

for (const path of berkas) {
  const rel = path.slice(SRC.length + 1).replace(/\\/g, '/')
  if (rel === SUMBER) continue
  // Test BOLEH menyebut angka harga — justru itu gunanya: memverifikasi
  // perhitungan terhadap angka yang diketahui.
  if (rel.includes('__tests__') || rel.endsWith('.test.ts')) continue

  const src = tanpaKomentar(readFileSync(path, 'utf8'))
  const aiKonteks = berkonteksAi(src)
  src.split('\n').forEach((isi, i) => {
    for (const k of KUNCI_HARGA) {
      // Pola ini punya DUA kelonggaran, dan keduanya lahir dari uji mutasi
      // yang menolak versi sebelumnya — bukan dari kerapian:
      //
      //   1. tanpa `\b` di kiri — `\binputPrice` menuntut batas kata sebelum
      //      `i`, dan di `inputPricePerMTok` huruf sebelumnya adalah huruf,
      //      jadi batas itu tak pernah terbentuk;
      //   2. `[A-Za-z_]*` di kanan — nama nyatanya `inputPricePerMTok`, bukan
      //      `inputPrice` polos, jadi menuntut `:` tepat setelah nama membuat
      //      seluruh kunci gabungan lolos.
      //
      // Dengan keduanya utuh, tabel harga kedua ala TJS akhirnya merah.
      // Penjaga yang hijau pada pelanggaran yang justru melahirkannya lebih
      // buruk daripada tak ada penjaga: ia memberi rasa aman yang keliru.
      if (new RegExp(`${k}[A-Za-z_]*\\s*:\\s*[0-9]`).test(isi)) {
        temuan.push({ berkas: rel, baris: i + 1, pesan: `harga \`${k}\` di luar ${SUMBER}` })
      }
    }
    // `masuk`/`keluar` hanya tersangka bila berkasnya memang tentang AI —
    // tanpa syarat ini, tiap objek arus kas jadi tertuduh.
    if (aiKonteks && /\b(masuk|keluar)\s*:\s*[0-9]+\.[0-9]/.test(isi)) {
      temuan.push({ berkas: rel, baris: i + 1, pesan: `harga masuk/keluar di luar ${SUMBER}` })
    }
    // Kurs dipaku — persis yang TJS lakukan di komponen UI-nya.
    if (/\b16[_,]?000\b/.test(isi) && /kurs|usd|idr|rate/i.test(isi)) {
      temuan.push({ berkas: rel, baris: i + 1, pesan: 'kurs USD→IDR dipaku' })
    }
  })
}

console.log('══ Satu sumber harga AI ════════════════════════════════════')
console.log(`  berkas dipindai : ${berkas.length}`)
console.log(`  sumber sah      : ${SUMBER}`)
console.log(`  pelanggaran     : ${temuan.length}`)
console.log('  ambang          : 0 (bukan ratchet)\n')

if (temuan.length > 0) {
  for (const t of temuan) console.error(`   ✗ ${t.berkas}:${t.baris}  ${t.pesan}`)
  console.error(`
   Dua tabel harga yang tak sepakat TIDAK menimbulkan error — keduanya
   "bekerja", hanya menjawab pertanyaan yang sama dengan angka berbeda. Di TJS,
   biaya yang tercatat 3x lebih rendah dari yang ditampilkan ke admin.

   Angka biaya yang salah lebih berbahaya daripada tak ada angka: ia dipercaya,
   dan keputusan diambil di atasnya.

   Impor dari src/${SUMBER}: hargaModel() · biayaUsd() · biayaIdr() · kursUsdIdr()
`)
  process.exit(1)
}

console.log('✓ Harga hanya hidup di satu berkas.')
