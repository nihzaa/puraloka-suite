#!/usr/bin/env node
/**
 * PENJAGA — registry penyedia, ambang NOL.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA REGISTRY PANTAS PUNYA PENJAGA SENDIRI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Registry adalah tempat yang PALING MENGGODA untuk menaruh kunci API. Ia
 * sudah menyimpan alamat, instance, dan nama penyedia — menambahkan satu
 * kolom `api_key` terasa seperti kerapian, bukan kemunduran.
 *
 * Tapi kredensial di dua tempat berarti satu yang tak terjaga:
 * `audit-kredensial-tak-bocor.mjs` berambang NOL dan mengawasi
 * `app_credentials`; ia tak tahu apa-apa tentang tabel kedua.
 *
 * Yang dijaga:
 *
 *   P-1  registry TAK PUNYA kolom rahasia (diperiksa di migrasi & di kode)
 *   P-2  route penyedia tak pernah MENGEMBALIKAN nilai kredensial
 *   P-3  adaptor divalidasi terhadap katalog kode, bukan diterima apa adanya
 *   P-4  endpoint WhatsApp tak disentuh dari route ini (satu pintu — W-1)
 *   P-5  uji koneksi mencatat JEJAK, bukan hanya menimpa status
 *
 * Terbukti bisa MERAH: `bash scripts/bukti-mutasi-registry.sh`.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..')
const RUTE = join(AKAR, 'src', 'routes', 'v1', 'penyedia.ts')
const MIGRASI = join(AKAR, '..', '..', 'db', 'migrations')

function tanpaKomentar(src) {
  let blok = false
  return src
    .split('\n')
    .map((b) => {
      const t = b.trim()
      if (blok) {
        if (t.includes('*/')) blok = false
        return ''
      }
      if (t.startsWith('/*')) {
        if (!t.includes('*/')) blok = true
        return ''
      }
      if (t.startsWith('//') || t.startsWith('*')) return ''
      return b
    })
    .join('\n')
}

let gagal = 0
const lapor = (kode, pesan) => {
  console.error(`  ❌ ${kode}: ${pesan}`)
  gagal++
}

console.log('── audit: registry penyedia layanan ──')

const rute = tanpaKomentar(readFileSync(RUTE, 'utf8'))

// ── P-1: kolom rahasia tak boleh ada di DEFINISI tabel ─────────────────────
//
// Dibaca dari migrasi, bukan dari basis: penjaga CI berjalan tanpa koneksi,
// dan penjaga yang butuh basis adalah penjaga yang sering dilewati.
let defTabel = null
for (const f of readdirSync(MIGRASI).filter((x) => x.endsWith('.sql')).sort()) {
  const sql = readFileSync(join(MIGRASI, f), 'utf8')
  const m = sql.match(/CREATE TABLE IF NOT EXISTS penyedia_layanan\s*\(([\s\S]*?)\n\);/i)
  if (m) defTabel = { f, isi: m[1] }
  // Kolom yang DITAMBAHKAN belakangan juga dihitung — `ALTER TABLE … ADD`
  // adalah jalan paling mungkin sebuah kolom rahasia menyelinap masuk.
  for (const alter of sql.matchAll(
    /ALTER TABLE\s+penyedia_layanan\s+ADD\s+(?:COLUMN\s+)?(?:IF NOT EXISTS\s+)?(\w+)/gi)) {
    if (/api_key|secret|token|password|sandi|nilai_enc/i.test(alter[1])) {
      lapor('P-1', `${f}: kolom rahasia '${alter[1]}' ditambahkan ke registry`)
    }
  }
}

if (!defTabel) {
  lapor('P-1', 'definisi tabel `penyedia_layanan` tak ditemukan di migrasi mana pun')
} else {
  // Baris komentar SQL dibuang: migrasi memang MEMBAHAS kenapa kunci tak di
  // sini, dan menghukum penjelasan itu salah.
  const kolom = defTabel.isi
    .split('\n')
    .filter((b) => !b.trim().startsWith('--'))
    .join('\n')
  for (const buruk of ['api_key', 'secret', 'password', 'sandi', 'nilai_enc']) {
    if (new RegExp(`\\b${buruk}\\b`, 'i').test(kolom)) {
      lapor(
        'P-1',
        `${defTabel.f}: registry punya kolom '${buruk}'.\n` +
          `        Kredensial hanya boleh di app_credentials — dua tempat rahasia\n` +
          `        berarti satu yang tak dijaga penjaga kebocoran (ambang NOL).`,
      )
    }
  }
}

// ── P-2: route tak pernah mengembalikan nilai kredensial ───────────────────
//
// `ambilKredensial` BOLEH dipanggil (uji koneksi butuh nilainya), tapi
// nilainya tak boleh keluar lewat `reply.send`.
if (/reply\.send\([^)]*\bkunci\b/.test(rute)) {
  lapor('P-2', 'route mengirim variabel `kunci` ke pemanggil — nilai kredensial bocor')
}
for (const m of rute.matchAll(/reply\.send\(\{([^}]*)\}/g)) {
  if (/nilai_enc|api_key|apiKey/.test(m[1])) {
    lapor('P-2', 'balasan route memuat field kredensial')
  }
}

// ── P-3: adaptor divalidasi ────────────────────────────────────────────────
if (!/ADAPTOR_WA_DIKENAL\.some/.test(rute) || !/PENYEDIA_AI\.some/.test(rute)) {
  lapor(
    'P-3',
    'adaptor tak divalidasi terhadap katalog kode.\n' +
      '        Nilai karangan akan tersimpan rapi lalu gagal saat DIPAKAI —\n' +
      '        dengan galat yang muncul jauh dari tempat kesalahannya dibuat.',
  )
}

// ── P-4: satu pintu WhatsApp ───────────────────────────────────────────────
//
// Duplikat sengaja dari `audit-satu-pintu-wa` (yang memindai seluruh src).
// Di sini ia disebut ULANG karena route inilah yang paling menggoda untuk
// memanggil endpoint penyedia langsung — dan memang sempat melakukannya.
for (const jejak of ['api.fonnte.com', '/message/sendText', '/instance/connectionState']) {
  if (rute.includes(jejak)) {
    lapor(
      'P-4',
      `route menyentuh endpoint WhatsApp langsung (${jejak}).\n` +
        '        Uji koneksi WAJIB lewat `ujiSambunganWa` di lib/wa-kirim.ts.',
    )
  }
}

/*
 * ── P-5: jejak uji DITULIS, bukan sekadar disebut ─────────────────────────
 *
 * Yang dicari `.insert` ke `penyedia_uji_log` DI DALAM handler uji — bukan
 * kemunculan namanya di berkas.
 *
 * Versi pertama memeriksa `/penyedia_uji_log/.test(rute)` dan BUTA: mutasi
 * yang mengganti tabel tujuan insert tetap hijau, karena namanya masih muncul
 * di endpoint `/log` yang MEMBACA jejak. Menyebut sebuah tabel bukan menulis
 * ke sana.
 *
 * Ini kesalahan yang sama dengan G-5 di `audit-webhook-bergerbang` beberapa
 * jam sebelumnya — memeriksa KATA, bukan PERBUATAN. Pola ini pantas dicurigai
 * di tiap penjaga yang saya tulis.
 */
const iUji = rute.search(/\/api\/v1\/penyedia\/:id\/uji/)
if (iUji === -1) {
  lapor('P-5', 'endpoint uji koneksi tak ditemukan')
} else {
  // Sampai endpoint berikutnya — jejak harus ditulis di dalam handler ini.
  const badanUji = rute.slice(iUji, rute.indexOf("app.get<{ Params: { id: string } }>", iUji) + 1 || undefined)
  if (!/\.from\('penyedia_uji_log'\)[\s\S]{0,200}?\.insert\(/.test(badanUji)) {
    lapor(
      'P-5',
      'uji koneksi tak MENULIS ke `penyedia_uji_log`.\n' +
        '        Status terakhir menjawab "sekarang bagaimana"; yang tak terjawab\n' +
        '        "sejak kapan" dan "sesering apa" — dan penyedia yang gagal 3 dari\n' +
        '        10 percobaan adalah masalah berbeda dari yang gagal 10 dari 10.',
    )
  }
}

if (gagal > 0) {
  console.error(`\n❌ ${gagal} pelanggaran. Ambang penjaga ini NOL — lihat kepala berkas.`)
  process.exit(1)
}
console.log('  ✅ P-1..P-5 lulus (ambang NOL)')
