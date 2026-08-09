#!/usr/bin/env node
/**
 * PENJAGA T-1: TENANCY DI SELURUH JALUR AI, TERMASUK BENTUK YANG TAK TERLIHAT.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA `audit-gerbang-tenancy` YANG ADA TIDAK CUKUP
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Spec menandainya eksplisit (kriteria C1):
 *
 *   "penjaga tenancy DIPERLUAS ke arrow-const: hari ini ia hanya cocok pada
 *    `function nama(`, jadi `export const x = async () =>` TAK TERLIHAT
 *    sekalipun berada di direktori yang dipindai"
 *
 * Dan ada alasan kedua yang lebih dalam. Penjaga lama memakai RATCHET —
 * "jumlah rute tanpa gerbang tak boleh naik". Untuk utang lama itu benar. Untuk
 * jalur AI itu salah: satu tool yang bocor sudah cukup membuat asisten tenant A
 * menjawab dengan angka tenant B, dan ratchet mengizinkan pelanggaran selama
 * jumlahnya tak bertambah.
 *
 * Penjaga ini ambang NOL, dan hanya memindai berkas jalur AI.
 *
 * ── Yang diperiksa
 *
 *   T-1a  nol `supabase` mentah di jalur AI — apa pun bentuk penulisannya
 *         (`function`, `const … = async () =>`, method objek, IIFE)
 *   T-1b  tiap `db.unsafe(` disertai penyaring `.in(`/`.eq(` di dekatnya
 *   T-1c  `projectIds()`/`gudang` diambil lewat `db.from()` yang sadar tenant,
 *         bukan dari argumen pemanggil — id yang diterima dari luar bisa
 *         berasal dari tenant mana pun
 *   T-1d  nol `company_id` yang dibaca dari ARGUMEN tool; ia harus datang dari
 *         konteks server
 *
 * T-1c dan T-1d yang paling halus. Keduanya lolos TypeScript, lolos RLS
 * (karena `unsafe` memang diizinkan), dan hanya terlihat sebagai "asisten
 * menjawab lebih banyak dari seharusnya" — yang justru tampak seperti fitur.
 *
 * Ambang NOL.
 *
 * Pakai:  node apps/api/scripts/audit-tenancy-jalur-ai.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(__dirname, '..', 'src')

/**
 * Berkas jalur AI — yang membaca data atas nama model.
 *
 * Didaftarkan eksplisit, bukan dipindai dari pola nama. Berkas baru yang lupa
 * didaftarkan tak akan diperiksa, dan itu risiko yang diterima sadar: daftar
 * yang salah TERLIHAT saat berkasnya hilang (penjaga langsung gagal), sementara
 * pola nama yang meleset gagal senyap.
 */
const JALUR_AI = [
  'lib/ai-tool.ts',
  'lib/ai-loop.ts',
  'lib/ai-config.ts',
  'routes/v1/ai-chat.ts',
  'routes/v1/ai-config.ts',
  'routes/v1/ai.ts',
]

for (const rel of JALUR_AI) {
  if (!existsSync(join(SRC, rel))) {
    console.error(`✗ Berkas jalur AI tak ditemukan: ${rel}`)
    console.error('  Kalau dipindah/di-rename, perbarui JALUR_AI di penjaga ini.')
    console.error('  Daftar yang menunjuk berkas hilang membuat penjaga ini diam-diam melar.')
    process.exit(1)
  }
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

for (const rel of JALUR_AI) {
  const src = tanpaKomentar(readFileSync(join(SRC, rel), 'utf8'))
  const baris = src.split('\n')

  baris.forEach((isi, i) => {
    // ── T-1a: supabase mentah, APA PUN bentuk penulisannya ───────────────
    //
    // Tak bergantung pada `function nama(` sama sekali — yang dicari
    // pemakaiannya, bukan pembungkusnya. Itulah yang membuat arrow-const,
    // method objek, dan IIFE sama-sama terlihat.
    if (/\bsupabase\s*\.\s*(from|rpc|storage)\s*\(/.test(isi)) {
      gagal.push({
        aturan: 'T-1a',
        pesan: `${rel}:${i + 1} memakai klien supabase mentah`,
        akibat:
          'jalur AI yang tak lewat TenantDb membaca LINTAS TENANT. Asisten ' +
          'tenant A akan menjawab dengan angka tenant B, dengan nada yang sama ' +
          'percaya dirinya — dan tak ada galat di mana pun.',
      })
    }

    // ── T-1b: unsafe wajib bersaring ─────────────────────────────────────
    if (/\bdb\s*\.\s*unsafe\s*\(/.test(isi) || /\.\s*unsafe\s*\(\s*['"]/.test(isi)) {
      const jendela = baris.slice(i, i + 10).join('\n')
      if (!/\.\s*(in|eq)\s*\(/.test(jendela)) {
        gagal.push({
          aturan: 'T-1b',
          pesan: `${rel}:${i + 1} \`unsafe(\` tanpa penyaring .in()/.eq() dalam 10 baris`,
          akibat:
            '`unsafe` melewati saringan tenant OTOMATIS — itu memang gunanya. ' +
            'Tanpa saringan manual ia membaca seluruh tenant dan TETAP lolos ' +
            'RLS, karena jalur ini sah.',
        })
      }
    }

    // ── T-1d: company_id dari ARGUMEN model ──────────────────────────────
    //
    // Model bisa mengarang argumen apa pun, termasuk company_id tenant lain.
    // Nilai itu harus datang dari konteks server, tak pernah dari `argumen`.
    if (/\bargumen\s*(\.|\[['"])\s*company/i.test(isi) ||
        /\binput\s*(\.|\[['"])\s*company/i.test(isi)) {
      gagal.push({
        aturan: 'T-1d',
        pesan: `${rel}:${i + 1} membaca company_id dari argumen`,
        akibat:
          'argumen tool datang DARI MODEL, dan model bisa dibujuk lewat data ' +
          'yang dibacanya (§5.3). company_id wajib dari konteks server.',
      })
    }
  })

  // ── T-1c: id lintas-tenant tak boleh diterima dari luar ────────────────
  //
  // Diperiksa per BERKAS, bukan per baris: yang dicari keberadaan pola
  // pengambilan yang sah, bukan letaknya.
  if (rel === 'lib/ai-tool.ts') {
    if (/db\.unsafe\(\s*['"]material_requests/.test(src) && !/db\.projectIds\(\)/.test(src)) {
      gagal.push({
        aturan: 'T-1c',
        pesan: `${rel}: membaca material_requests tanpa db.projectIds()`,
        akibat:
          'id proyek yang tak diambil dari `db` bisa berasal dari tenant mana ' +
          'pun. Kategori C hanya aman kalau daftar id-nya sendiri ber-tenant.',
      })
    }
    if (/db\.unsafe\(\s*['"]gudang_stok/.test(src) && !/db\.from\(\s*['"]gudang['"]\s*\)/.test(src)) {
      gagal.push({
        aturan: 'T-1c',
        pesan: `${rel}: membaca gudang_stok tanpa mengambil id gudang lewat db.from('gudang')`,
        akibat:
          '`gudang_stok` tak punya company_id. Tanpa daftar gudang milik tenant, ' +
          'seluruh stok semua tenant terbaca tanpa satu pun galat.',
      })
    }
  }
}

console.log('══ Tenancy jalur AI (T-1) ══════════════════════════════════')
console.log(`  berkas dipindai : ${JALUR_AI.length}`)
console.log(`  pelanggaran     : ${gagal.length}`)
console.log('  ambang          : 0 (bukan ratchet)\n')

if (gagal.length > 0) {
  for (const g of gagal) {
    console.error(`   [${g.aturan}] ${g.pesan}`)
    console.error(`         → ${g.akibat}`)
  }
  console.error(`
   Penjaga ini AMBANG NOL, sementara \`audit-gerbang-tenancy\` memakai ratchet.
   Bedanya disengaja: untuk utang lama, "tak boleh bertambah" masuk akal. Untuk
   jalur AI tidak — SATU tool yang bocor sudah cukup membuat asisten tenant A
   menjawab dengan angka tenant B, dan ratchet mengizinkannya selama jumlahnya
   tetap.

   Pola yang sah:
     kategori B  → db.from('projects')
     kategori C  → db.unsafe('invoices', alasan).in('project_id', await db.projectIds())
     gudang_stok → ambil id gudang lewat db.from('gudang') lebih dulu
`)
  process.exit(1)
}

console.log('✓ Jalur AI ber-tenant: nol supabase mentah, unsafe bersaring, id dari db.')
