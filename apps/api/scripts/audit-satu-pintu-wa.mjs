#!/usr/bin/env node
/**
 * PENJAGA: SATU PINTU KELUAR WHATSAPP.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * PELAJARAN TJS — DAN ANGKANYA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * TJS baru merapikan pengirimannya SETELAH tersebar ke 10 titik di aplikasi +
 * 30 di n8n. Header `lib/wa/send.ts` mereka mencatat akibatnya:
 *
 *   "`alert-notifier.ts` mengirim `{ number, textMessage: { text } }`, padahal
 *    Evolution mewajibkan `{ number, text }`. Alert kedaluwarsa stok dan
 *    pemantauan sintetis TIDAK PERNAH terkirim, dan gagalnya senyap."
 *
 * Itu bentuk kegagalan yang paling mahal: fiturnya "ada", tak ada galat, dan
 * yang menemukan akhirnya bukan pemantauan melainkan orang yang bertanya
 * "kok saya tidak pernah dapat notifikasi?".
 *
 * Ketersebarannya tak terjadi sekaligus. Ia tumbuh satu titik demi satu titik,
 * masing-masing tampak wajar saat ditulis — dan itulah yang penjaga ini cegah.
 *
 * ── Yang diperiksa
 *
 *   W-1  nol `fetch` ke endpoint penyedia WA di luar `lib/wa-kirim.ts`
 *   W-2  nol pemakaian kredensial WA (apikey Evolution) di luar berkas itu
 *   W-3  `kirimWa` TIDAK PERNAH melempar — tak ada `throw` di jalur kirimnya
 *   W-4  registry adaptor ADA (penambahan penyedia tak menyentuh pemanggil)
 *
 * W-3 penting dan mudah dilanggar: satu `throw` di sana membuat invoice gagal
 * tersimpan hanya karena WhatsApp-nya mati.
 *
 * Ambang NOL.
 *
 * Pakai:  node apps/api/scripts/audit-satu-pintu-wa.mjs
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(__dirname, '..', 'src')
const PINTU = 'lib/wa-kirim.ts'

if (!existsSync(join(SRC, PINTU))) {
  console.error(`✗ Pintu keluar WA tak ditemukan: ${PINTU}`)
  console.error('  Kalau dipindah, perbarui PINTU di penjaga ini — daftar yang')
  console.error('  menunjuk berkas hilang membuat penjaga ini diam-diam melar.')
  process.exit(1)
}

/** Jejak endpoint penyedia WhatsApp. */
const JEJAK_WA = [
  '/message/sendText',
  '/message/sendMedia',
  '/message/sendButtons',
  'graph.facebook.com',
  'api.wablas.com',
  'api.fonnte.com',
]

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

const gagal = []

// ── W-1 & W-2: nol jejak penyedia di luar pintu ──────────────────────────
for (const path of berkasTs(SRC)) {
  const rel = path.slice(SRC.length + 1).replace(/\\/g, '/')
  if (rel === PINTU) continue
  if (rel.includes('__tests__') || rel.endsWith('.test.ts') || rel.includes('test-utils')) continue

  const src = tanpaKomentar(readFileSync(path, 'utf8'))
  src.split('\n').forEach((isi, i) => {
    for (const jejak of JEJAK_WA) {
      if (isi.includes(jejak)) {
        gagal.push({
          aturan: 'W-1',
          pesan: `${rel}:${i + 1} memanggil endpoint WhatsApp langsung (${jejak})`,
          akibat:
            'bentuk muatan yang menyimpang tak menimbulkan galat — ia hanya ' +
            'membuat pesannya tak pernah terkirim. Di TJS itu membuat alert ' +
            'stok diam selama berbulan-bulan.',
        })
      }
    }
    // Kredensial WA di luar pintu: tanda seseorang sedang membangun jalur kedua.
    if (/apikey\s*:/i.test(isi) && /evolution|wa[_-]?api|whatsapp/i.test(src.slice(0, 2000))) {
      gagal.push({
        aturan: 'W-2',
        pesan: `${rel}:${i + 1} memakai kredensial WhatsApp di luar ${PINTU}`,
        akibat: 'kredensial di dua tempat berarti dua jalur kirim, dan yang kedua tak terjaga.',
      })
    }
  })
}

// ── W-3 & W-4: bentuk pintu itu sendiri ──────────────────────────────────
const srcPintu = tanpaKomentar(readFileSync(join(SRC, PINTU), 'utf8'))

if (/\bthrow\s+/.test(srcPintu)) {
  gagal.push({
    aturan: 'W-3',
    pesan: `${PINTU} memuat \`throw\``,
    akibat:
      'notifikasi yang gagal akan menjatuhkan proses bisnis yang memicunya — ' +
      'invoice tak tersimpan hanya karena WhatsApp mati. Kembalikan HasilKirim, ' +
      'jangan melempar.',
  })
}

if (!/export function buatAdaptorWa/.test(srcPintu)) {
  gagal.push({
    aturan: 'W-4',
    pesan: `${PINTU} tak punya registry adaptor`,
    akibat:
      'menambah penyedia belakangan berarti menyentuh tiap pemanggil untuk ' +
      'kedua kalinya — persis biaya yang TJS bayar saat merapikan 40 titik.',
  })
}

if (!/wa_kirim_idempotensi/.test(srcPintu)) {
  gagal.push({
    aturan: 'W-5',
    pesan: `${PINTU} tak memakai tabel idempotensi`,
    akibat:
      'webhook yang diulang penyedia — hal biasa — mengirim notifikasi dua ' +
      'kali, dan yang kedua terbaca sebagai kejadian baru.',
  })
}

console.log('══ Satu pintu keluar WhatsApp ══════════════════════════════')
console.log(`  pintu sah    : ${PINTU}`)
console.log(`  pelanggaran  : ${gagal.length}`)
console.log('  ambang       : 0 (bukan ratchet)\n')

if (gagal.length > 0) {
  for (const g of gagal) {
    console.error(`   [${g.aturan}] ${g.pesan}`)
    console.error(`         → ${g.akibat}`)
  }
  console.error(`
   Ketersebaran tak terjadi sekaligus. Ia tumbuh satu titik demi satu titik,
   masing-masing tampak wajar saat ditulis — lalu bentuk muatannya menyimpang,
   dan pesannya berhenti terkirim tanpa satu pun galat.

   Pola yang sah:
     await kirimWa({ db, companyId, nomor, teks, kunciIdempotensi: 'invoice:<id>:jatuh-tempo' })
`)
  process.exit(1)
}

console.log('✓ Satu pintu, registry ada, tak melempar, idempotensi terpakai.')
