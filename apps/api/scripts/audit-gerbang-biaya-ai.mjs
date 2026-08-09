#!/usr/bin/env node
/**
 * PENJAGA: PANGGILAN AI BERBAYAR HARUS LEWAT GERBANG BIAYA — DAN DULUAN.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * CACAT TJS YANG DICEGAH (spec lapisan AI §5.1)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * TJS mencatat biaya token setelah tiap panggilan dan menampilkannya di
 * dashboard — tapi tak ada apa pun yang MENGHENTIKAN panggilan berikutnya.
 * Batas yang hanya dilaporkan bukan batas; ia laporan kerusakan.
 *
 * Di sini bahayanya lebih besar daripada di TJS: satu pesan WhatsApp bisa
 * memicu 16 ronde tool-calling. Kalau pemeriksaannya di akhir, tenant yang
 * batasnya Rp 100 ribu bisa tembus empat kali lipat dalam SATU percakapan, dan
 * barisnya baru terlihat setelah uangnya keluar.
 *
 * ── Yang diperiksa
 *
 *   G-1  tiap panggilan berbayar didahului `periksaGerbangAi(` di berkas yang
 *        sama, pada baris yang LEBIH KECIL nomornya
 *   G-2  tiap berkas yang memanggil model juga memanggil `catatBiayaRonde(` —
 *        panggilan yang tak tercatat membuat batas menghitung terlalu rendah,
 *        dan batas yang menghitung terlalu rendah tak pernah tercapai
 *   G-3  `lib/ai-config.ts` ada dan mengekspor keduanya
 *
 * ── Apa yang dihitung "panggilan berbayar" (diperbarui 2026-08-10, TJS-B2)
 *
 * Sejak lapisan adaptor ada, rute tidak lagi memanggil `messages.create`
 * langsung — ia memanggil `adaptor.chat()`. Penjaga versi pertama hanya
 * mengenali `messages.create`, dan begitu rutenya dipindahkan ia berubah jadi
 * HIJAU KARENA BUTA: tak melihat panggilan apa pun, jadi tak ada yang bisa
 * dilanggar. Ketahuan karena ia justru menuduh berkas adaptor.
 *
 * Yang dipindai sekarang `.chat(` pada adaptor. Berkas LAPISAN ADAPTOR sendiri
 * dikecualikan: adaptor memang tak boleh tahu soal tenant atau batas biaya —
 * kalau ia memanggil gerbang, gerbangnya jadi tak terlihat oleh rute yang
 * memutuskan apa yang harus dilakukan saat ditolak.
 *
 * G-1 memakai perbandingan NOMOR BARIS, bukan sekadar "kedua nama muncul di
 * berkas ini". Versi pertama penjaga ini hanya memeriksa keberadaan, dan uji
 * mutasi membuktikan ia hijau saat urutannya sengaja dibalik — persis satu-
 * satunya kesalahan yang ia ada untuk cegah.
 *
 * Ambang NOL.
 *
 * Pakai:  node apps/api/scripts/audit-gerbang-biaya-ai.mjs
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(__dirname, '..', 'src')
const GERBANG = join(SRC, 'lib', 'ai-config.ts')

/**
 * Berkas yang MEMANG memanggil SDK model — lapisan adaptor.
 *
 * Dijaga terpisah oleh `audit-satu-jalan-ke-model.mjs` (L-6), yang memastikan
 * tak ada berkas LAIN menyentuh SDK. Di sini ketiganya dikecualikan karena
 * adaptor tak boleh tahu soal tenant maupun batas biaya.
 */
const LAPISAN_ADAPTOR = new Set([
  'lib/ai-penyedia.ts',
  'lib/ai-penyedia-anthropic.ts',
  'lib/ai-penyedia-openai.ts',
  'lib/ai-adaptor.ts',
])

function berkasTs(dir) {
  const hasil = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) hasil.push(...berkasTs(p))
    else if (e.name.endsWith('.ts')) hasil.push(p)
  }
  return hasil
}

/** Buang komentar TANPA mengubah jumlah baris — nomor baris ikut dinilai. */
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

const gagal = []

// ── G-3 gerbangnya sendiri ada ───────────────────────────────────────────
if (!existsSync(GERBANG)) {
  gagal.push({
    aturan: 'G-3',
    pesan: 'lib/ai-config.ts tidak ada',
    akibat: 'tak ada tempat batas biaya ditegakkan; tiap pemanggil akan menebak sendiri.',
  })
} else {
  const g = readFileSync(GERBANG, 'utf8')
  for (const fn of ['periksaGerbangAi', 'catatBiayaRonde']) {
    if (!new RegExp(`export\\s+async\\s+function\\s+${fn}\\b`).test(g)) {
      gagal.push({
        aturan: 'G-3',
        pesan: `lib/ai-config.ts tak mengekspor ${fn}()`,
        akibat: 'pemanggil tak punya jalan sah; mereka akan memanggil model langsung.',
      })
    }
  }
}

// ── G-1 & G-2 per berkas pemanggil ───────────────────────────────────────
const pemanggil = []

for (const path of berkasTs(SRC)) {
  const rel = path.slice(SRC.length + 1).replace(/\\/g, '/')
  if (rel === 'lib/ai-config.ts') continue
  // Lapisan adaptor DIKECUALIKAN dengan sengaja. Adaptor tak tahu tenant, dan
  // memang tak boleh tahu — gerbang yang dipanggil dari dalam adaptor jadi tak
  // terlihat oleh rute, padahal rutelah yang memutuskan apa yang terjadi saat
  // panggilan ditolak (200 deterministik, 402, atau yang lain).
  if (LAPISAN_ADAPTOR.has(rel)) continue
  // Test BOLEH memanggil model tiruan tanpa gerbang — justru itu yang diuji.
  if (rel.includes('__tests__') || rel.endsWith('.test.ts') || rel.includes('test-utils')) continue

  const src = tanpaKomentar(readFileSync(path, 'utf8'))
  const baris = src.split('\n')

  const barisPanggil = []
  const barisGerbang = []
  let adaCatat = false

  baris.forEach((isi, i) => {
    // `messages.create(` — pintu berbayar SDK Anthropic. Juga `.stream(`,
    // karena streaming menagih token yang sama persis.
    // `messages.create(` — SDK langsung; kini hanya sah di dalam adaptor.
    // `.chat({` — pintu berbayar lapisan adaptor, yang dipakai rute sejak B2.
    //
    // Yang kedua WAJIB ada. Tanpa itu penjaga ini berubah jadi hijau-karena-buta
    // begitu rute dipindahkan ke adaptor: tak melihat panggilan apa pun, jadi
    // tak ada yang bisa dilanggar. Itu benar-benar terjadi hari ini, dan yang
    // menyingkapnya cuma tuduhan salah alamat ke berkas adaptor.
    if (/\bmessages\s*\.\s*(create|stream)\s*\(/.test(isi)) barisPanggil.push(i + 1)
    else if (/\.\s*chat\s*\(\s*\{/.test(isi)) barisPanggil.push(i + 1)
    if (/\bperiksaGerbangAi\s*\(/.test(isi)) barisGerbang.push(i + 1)
    if (/\bcatatBiayaRonde\s*\(/.test(isi)) adaCatat = true
  })

  if (barisPanggil.length === 0) continue
  pemanggil.push(rel)

  // Tiap panggilan dipasangkan dengan gerbang TERSENDIRI yang mendahuluinya —
  // bukan sekadar "ada gerbang di suatu tempat di atas".
  //
  // Versi pertama penjaga ini memakai gerbang PALING AWAL saja, dan uji mutasi
  // M2 membuktikannya buta: panggilan KEDUA yang disisipkan tanpa gerbang
  // sendiri tetap dianggap tertutup oleh gerbang panggilan pertama. Itu persis
  // bentuk kegagalan yang paling mungkin muncul nyata — seseorang menambah
  // ronde baru dan mengira pemeriksaan di atas masih berlaku, padahal batasnya
  // sudah dibaca sebelum ronde pertama menghabiskan apa pun.
  const belumTerpakai = [...barisGerbang]
  for (const b of barisPanggil) {
    const idx = belumTerpakai.findIndex((g) => g < b)
    if (idx === -1) {
      gagal.push({
        aturan: 'G-1',
        pesan:
          barisGerbang.length === 0
            ? `${rel}:${b} memanggil model TANPA periksaGerbangAi()`
            : `${rel}:${b} — panggilan ke-${barisPanggil.indexOf(b) + 1} tak punya gerbang sendiri sebelumnya ` +
              `(gerbang ada di baris ${barisGerbang.join(', ')})`,
        akibat:
          'batas biaya tak berlaku untuk panggilan ini. Memeriksa sekali lalu ' +
          'memanggil berkali-kali berarti batasnya dibaca sebelum biaya ' +
          'sesungguhnya keluar — dan uangnya sudah habis saat angkanya benar.',
      })
    } else {
      belumTerpakai.splice(idx, 1)
    }
  }

  if (!adaCatat) {
    gagal.push({
      aturan: 'G-2',
      pesan: `${rel} memanggil model tapi tak pernah catatBiayaRonde()`,
      akibat:
        'panggilan yang tak tercatat membuat pemakaian bulan ini menghitung ' +
        'terlalu rendah — dan batas yang menghitung terlalu rendah tak pernah ' +
        'tercapai, jadi mode `blokir` pun tak akan memblokir apa pun.',
    })
  }
}

console.log('══ Gerbang biaya AI ════════════════════════════════════════')
console.log(`  berkas pemanggil model : ${pemanggil.length}${pemanggil.length ? ` (${pemanggil.join(', ')})` : ''}`)
console.log(`  pelanggaran            : ${gagal.length}`)
console.log('  ambang                 : 0 (bukan ratchet)\n')

if (gagal.length > 0) {
  for (const g of gagal) {
    console.error(`   [${g.aturan}] ${g.pesan}`)
    console.error(`         → ${g.akibat}`)
  }
  console.error(`
   Batas biaya yang diperiksa SESUDAH panggilan bukan batas — ia laporan
   kerusakan. Satu pesan bisa memicu 16 ronde tool-calling, dan tenant yang
   batasnya Rp 100 ribu bisa tembus empat kali lipat sebelum barisnya terlihat.

   Pola yang sah:
     const gerbang = await periksaGerbangAi(db, 'insight')
     if (!gerbang.boleh) return ...jalur tanpa AI...
     const jawab = await anthropic.messages.create({ model: gerbang.konfigurasi.model, ... })
     await catatBiayaRonde(db, companyId, { ...pemakaian dari jawab.usage... })
`)
  process.exit(1)
}

console.log('✓ Semua panggilan model lewat gerbang biaya, dan gerbangnya duluan.')
