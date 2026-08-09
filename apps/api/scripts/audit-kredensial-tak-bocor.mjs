#!/usr/bin/env node
/**
 * PENJAGA: NILAI KREDENSIAL TAK PERNAH KELUAR DARI SERVER.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `app_credentials.nilai_enc` menyimpan kunci API pihak ketiga milik tiap
 * tenant. Aturan yang membuat "kunci tidak bisa dilihat" berlaku SUNGGUHAN
 * bukan penyembunyian di UI — melainkan kolomnya **tak pernah ikut di-select**.
 * Yang boleh keluar hanya: nama kunci, 4 karakter terakhir, dan kapan diubah.
 *
 * Aturan itu gampang ditulis di dokumen dan gampang dilanggar tanpa sadar.
 * Satu `select('*')` yang ditambahkan enam bulan lagi oleh orang yang tak
 * pernah membaca dokumen ini sudah cukup — dan kebocorannya TIDAK akan
 * menimbulkan error, test merah, atau gejala apa pun. Respons API-nya justru
 * terlihat lengkap dan rapi.
 *
 * Persis kelas cacat yang harus dijaga mesin.
 *
 * ── Yang diperiksa
 *
 *   K-1  `select('*')` pada tabel kredensial — DILARANG, ia menyapu nilai_enc
 *   K-2  `nilai_enc` disebut di daftar select mana pun
 *   K-3  `nilai_enc` masuk respons (`reply.send`) atau log
 *   K-4  `bukaNilai(...)` dipanggil di luar berkas yang berwenang
 *
 * K-4 yang paling halus: mendekripsi itu SAH — memang begitu kunci dipakai
 * saat memanggil penyedia. Yang dilarang adalah mendekripsi di rute yang
 * membalas ke browser, karena dari situ jaraknya ke `reply.send` cuma satu
 * baris.
 *
 * ── Ambang NOL, bukan ratchet
 *
 * Tak ada pelanggaran yang boleh "diwariskan" di sini. Tabelnya baru lahir
 * (migrasi 242), jadi lantainya nol sejak hari pertama — dan itulah satu-satunya
 * angka yang benar untuk kelas cacat yang akibatnya kebocoran kredensial.
 *
 * Pakai:  node apps/api/scripts/audit-kredensial-tak-bocor.mjs
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(__dirname, '..', 'src')

/** Kolom yang tak boleh keluar dari server, apa pun alasannya. */
const KOLOM_RAHASIA = ['nilai_enc']

/** Tabel yang memuatnya. */
const TABEL = ['app_credentials']

/**
 * Berkas yang BOLEH memanggil `bukaNilai` — satu-satunya tempat kredensial
 * dibuka, lalu langsung dipakai memanggil penyedia.
 *
 * Daftar ini sengaja pendek dan sengaja diketik tangan: menambah nama ke sini
 * adalah keputusan sadar yang terlihat di diff, bukan sesuatu yang menyelinap.
 */
const BOLEH_MEMBUKA = [
  'lib/kredensial-sandi.ts',        // yang mendefinisikannya
  'lib/kredensial.ts',              // pembaca terpusat
  'lib/__tests__/kredensial-sandi.test.ts',
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

/** Buang komentar TANPA mengubah jumlah baris — supaya nomor baris bisa diklik. */
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

const pelanggaran = []

if (!existsSync(SRC)) {
  console.error(`✗ Direktori sumber tak ditemukan: ${SRC}`)
  process.exit(1)
}

for (const path of berkasTs(SRC)) {
  const relatif = path.slice(SRC.length + 1).replace(/\\/g, '/')
  const src = tanpaKomentar(readFileSync(path, 'utf8'))
  const baris = src.split('\n')

  baris.forEach((isi, i) => {
    const no = i + 1

    // K-1 — select('*') pada tabel kredensial.
    for (const tabel of TABEL) {
      if (new RegExp(`['"\`]${tabel}['"\`]`).test(isi)) {
        // Periksa jendela kecil sesudahnya: rantai kerap dipecah antar baris.
        const jendela = baris.slice(i, i + 4).join('\n')
        if (/\.select\(\s*['"`]\*['"`]\s*\)/.test(jendela)) {
          pelanggaran.push({
            aturan: 'K-1', berkas: relatif, baris: no,
            pesan: `select('*') pada ${tabel} — ikut menyapu ${KOLOM_RAHASIA.join('/')}`,
          })
        }
      }
    }

    // K-2 & K-3 — kolom rahasia disebut di luar berkas yang berwenang.
    for (const kolom of KOLOM_RAHASIA) {
      if (!isi.includes(kolom)) continue
      if (BOLEH_MEMBUKA.includes(relatif)) continue
      // Migrasi & definisi tipe boleh menyebutnya; yang dilarang adalah
      // memasukkannya ke select / respons / log.
      const berbahaya = /\.select\(|reply\.send|return\s*\{|log\.|console\./.test(isi)
      if (berbahaya) {
        pelanggaran.push({
          aturan: 'K-2', berkas: relatif, baris: no,
          pesan: `'${kolom}' muncul di select/respons/log`,
        })
      }
    }

    // K-4 — dekripsi di luar berkas yang berwenang.
    if (/\bbukaNilai\s*\(/.test(isi) && !BOLEH_MEMBUKA.includes(relatif)) {
      pelanggaran.push({
        aturan: 'K-4', berkas: relatif, baris: no,
        pesan: 'bukaNilai() dipanggil di luar lapisan kredensial',
      })
    }
  })
}

console.log('══ Kredensial tak bocor ════════════════════════════════════')
console.log(`  berkas dipindai : ${berkasTs(SRC).length}`)
console.log(`  pelanggaran     : ${pelanggaran.length}`)
console.log('  ambang          : 0 (bukan ratchet)\n')

if (pelanggaran.length > 0) {
  for (const p of pelanggaran) {
    console.error(`   [${p.aturan}] ${p.berkas}:${p.baris}  ${p.pesan}`)
  }
  console.error(`
   Nilai kredensial TIDAK BOLEH meninggalkan server. Yang boleh keluar:
   nama kunci, 4 karakter terakhir, sumbernya, kapan diubah.

   Perbaiki dengan menyebut kolomnya satu per satu alih-alih select('*'):
     .select('id, kunci, empat_akhir, diperbarui_pada')

   Untuk memakai kredensialnya, panggil lapisan terpusat di
   src/lib/kredensial.ts — jangan mendekripsi di rute.
`)
  process.exit(1)
}

console.log('✓ Nol kebocoran.')
