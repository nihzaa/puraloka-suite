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

/**
 * Berkas yang boleh MENYEBUT nama kunci WA tanpa jadi jalur kirim kedua.
 *
 * Hanya satu, dan alasannya sempit: `lib/kredensial.ts` adalah KATALOG
 * kredensial. Ia harus menyebut `WA_BASE_URL`/`WA_API_KEY`/`WA_INSTANCE`
 * supaya ketiganya muncul di halaman Kredensial dan bisa diisi tanpa menyentuh
 * berkas `.env` — inti dari "semuanya bisa dikonfigurasi di UI".
 *
 * Menyebut nama kunci di katalog bukan mengirim WhatsApp. Yang dicegah W-2
 * adalah berkas yang MEMAKAI kredensial itu untuk membangun jalur kirim
 * sendiri; katalog tak memanggil apa pun.
 *
 * Daftar ini sengaja bukan pola. Satu nama berkas, ditulis penuh, supaya
 * penambahan berikutnya terlihat di diff dan harus dijelaskan.
 */
const KATALOG_BOLEH_MENYEBUT = new Set(['lib/kredensial.ts'])

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

/**
 * Berkas yang MEMAKAI kredensial WA tetapi BUKAN jalur kirim pesan.
 *
 * Yang dijaga penjaga ini adalah SATU PINTU KELUAR PESAN — bukan larangan
 * menyentuh kredensial. Dua berkas di bawah menyentuhnya untuk tujuan lain,
 * dan menuntut keduanya lewat `wa-kirim.ts` tak masuk akal: yang satu tak
 * mengirim pesan sama sekali, yang satu memang sudah diputuskan lewat spec.
 *
 * Tiap entri WAJIB menyebut alasannya. Daftar pengecualian tanpa alasan
 * berubah jadi tempat pembuangan, dan penjaganya kehilangan gigi.
 */
const SAH_BUKAN_KIRIM = new Map([
  ['routes/v1/wa-instance.ts',
   'MANAJEMEN SAMBUNGAN, bukan kirim pesan. Endpoint Evolution yang '
   + 'dipanggilnya hanya /instance/connect, /instance/connection, dan '
   + '/instance/logout — diukur ke kodenya, nol pemanggilan /message/*. '
   + 'Rute ini yang memasangkan QR dan membaca status sambungan; ia BUTUH '
   + 'kredensial untuk itu, dan memaksanya lewat pintu kirim pesan berarti '
   + 'memberi pintu itu tanggung jawab yang bukan miliknya.'],

  ['utils/terbit-peristiwa.ts',
   'Kredensial DITERUSKAN ke n8n, yang mengirimkan pesannya. Ini memang '
   + 'jalur kirim kedua, dan itu keputusan arsitektur yang sudah diambil '
   + 'SADAR — spec 2026-08-22-n8n-shared-multi-tenant-design §5.2 '
   + 'menyebutnya trade-off yang diterima, dengan mitigasi retensi log '
   + 'eksekusi n8n yang diperketat (§7.1). Berkasnya sendiri mencatat itu '
   + 'di kepalanya. Menandainya sebagai pelanggaran berarti penjaga ini '
   + 'melawan keputusan yang sudah diratifikasi, tiap kali dijalankan.'],
])

/*
  ⚠ Pengecualian ini berlaku atas JALUR BERKAS, jadi ia hanya sah selama isi
  berkasnya masih seperti yang dijelaskan di atas. Kalau `wa-instance.ts`
  kelak benar-benar mengirim pesan, penjaga ini TIDAK akan berbunyi.

  Yang menutup celah itu: `audit-alur-tercatat.mjs` (webhook n8n wajib lewat
  `jalankanAlur()`) dan `audit-saluran-keluar-berpagar.mjs` (modul ber-fetch
  wajib berpagar NODE_ENV==='test'), keduanya berambang NOL.
*/

const gagal = []

// ── W-1 & W-2: nol jejak penyedia di luar pintu ──────────────────────────
for (const path of berkasTs(SRC)) {
  const rel = path.slice(SRC.length + 1).replace(/\\/g, '/')
  if (rel === PINTU) continue
  if (rel.includes('__tests__') || rel.endsWith('.test.ts') || rel.includes('test-utils')) continue
  if (SAH_BUKAN_KIRIM.has(rel)) continue

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
    /*
     * Kredensial WA di luar pintu: tanda seseorang membangun jalur kedua.
     *
     * ── Kenapa yang dicari NAMA KUNCINYA, bukan kata "whatsapp"
     *
     * Versi pertama menuntut `apikey:` di baris ini DAN kata
     * `evolution|wa_api|whatsapp` di mana pun dalam 2.000 karakter pertama.
     * Pada 2026-08-10 ia menuduh `lib/ai-jalankan.ts:236` — baris
     * `apiKey: kunci ?? ''` milik penyedia MODEL, disandingkan dengan
     * konstanta `GAYA_WHATSAPP` (teks gaya jawaban, bukan kredensial).
     *
     * Dua hal salah sekaligus: `apiKey` model bukan kredensial WA, dan
     * menyebut "WhatsApp" bukan bukti mengirim WhatsApp. Penjaga yang menuduh
     * berdasarkan kata akan mendorong orang mengganti nama variabel supaya
     * hijau — dan itu membuatnya lebih buta, bukan lebih tajam.
     *
     * Yang dicari sekarang: nama kunci kredensial WA yang sesungguhnya.
     * Mereka hanya punya satu alasan untuk muncul di sebuah berkas.
     */
    if (/\bWA_(API_KEY|BASE_URL|INSTANCE)\b/.test(isi) && !KATALOG_BOLEH_MENYEBUT.has(rel)) {
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
