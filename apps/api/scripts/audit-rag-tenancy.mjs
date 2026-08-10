#!/usr/bin/env node
/**
 * PENJAGA — jalur RAG, ambang NOL (TJS-C2).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA RAG PANTAS PUNYA PENJAGA SENDIRI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Kriteria C2 menyebutnya eksplisit: "T-2 adalah kebocoran lintas-tenant
 * PALING MUNGKIN di seluruh rencana ini."
 *
 * Alasannya bukan bahwa kodenya lebih sulit, melainkan bahwa kebocorannya
 * **tak menghasilkan gejala**. Pencarian vector mengembalikan "yang paling
 * mirip", dan spesifikasi beton K-300 di dua perusahaan konstruksi hampir
 * identik. Kalau dokumen tenant lain menang, jawabannya tetap terdengar
 * benar — dan tak seorang pun melaporkan jawaban yang terdengar benar.
 *
 * Yang dijaga:
 *
 *   R-1  tiap query `rag_potongan` menyertakan `company_id` di WHERE
 *   R-2  NOL `file_url` di seluruh jalur RAG (T-5: signed URL 10 TAHUN)
 *   R-3  ACL diturunkan dari PERMISSION, bukan literal nama peran (ADR-004)
 *   R-4  RPC vektor tak pernah memakai `auth_company_id()` — ia KOSONG pada
 *        klien service-role, dan memakainya mematikan fungsi tanpa gejala
 *   R-5  saringan ACL ditulis SATU tempat, dipakai kedua jalur
 *
 * Terbukti bisa MERAH: `bash scripts/bukti-mutasi-rag.sh`.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')
const MIGRASI = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'db', 'migrations')

const CARI = join(AKAR, 'lib', 'rag-cari.ts')
const ACL = join(AKAR, 'lib', 'rag-acl.ts')
const INGEST = join(AKAR, 'lib', 'rag-ingest.ts')

/** Komentar dibuang — penjaga yang membaca komentar menghukum penjelasan. */
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

console.log('── audit: jalur RAG (T-2/T-4/T-5) ──')

const cari = tanpaKomentar(readFileSync(CARI, 'utf8'))
const acl = tanpaKomentar(readFileSync(ACL, 'utf8'))
const ingest = tanpaKomentar(readFileSync(INGEST, 'utf8'))

// ── R-1: company_id di WHERE, di SETIAP berkas yang menyentuh rag_potongan ─
for (const [nama, isi] of [['rag-cari.ts', cari], ['rag-ingest.ts', ingest]]) {
  if (!isi.includes('rag_potongan')) continue
  if (!/eq\(\s*'company_id'\s*,/.test(isi)) {
    lapor(
      'R-1',
      `${nama} menyentuh rag_potongan TANPA \`.eq('company_id', ...)\`.\n` +
        `        Pencarian vector mengembalikan "paling mirip" — dokumen tenant lain\n` +
        `        BISA menang, dan jawabannya tetap terdengar benar.`,
    )
  }
}

// ── R-2: T-5, nol file_url ─────────────────────────────────────────────────
for (const [nama, isi] of [['rag-cari.ts', cari], ['rag-acl.ts', acl], ['rag-ingest.ts', ingest]]) {
  if (isi.includes('file_url')) {
    lapor(
      'R-2',
      `${nama} menyentuh \`file_url\` — signed URL berumur 10 TAHUN (documents.ts:138).\n` +
        `        Kalau ia sampai ke WhatsApp, ia bertahan setelah hak akses dicabut,\n` +
        `        di riwayat chat yang di luar kendali kita.`,
    )
  }
}

// ── R-3: ACL dari permission, bukan literal peran (ADR-004) ────────────────
//
// `documents.ts:31-37` memakai literal `admin`/`pm`/`mandor`/`client` sebagai
// kunci ACL. Itu hutang yang sudah tercatat (QUEUE F3-1); yang dijaga di sini
// adalah bahwa RAG TIDAK mereproduksinya.
for (const peran of ['admin', 'pm', 'mandor', 'client', 'direktur']) {
  const pola = new RegExp(`['"\`]${peran}['"\`]\\s*(?:\\]|:|===|==)`)
  if (pola.test(acl)) {
    lapor(
      'R-3',
      `rag-acl.ts memakai literal peran '${peran}' sebagai kunci ACL (ADR-004).\n` +
        `        Peran adalah data konfigurasi per-tenant: tenant yang membuat peran\n` +
        `        baru mendapat NOL dokumen — diam-diam, tanpa galat.`,
    )
  }
}
if (!acl.includes("izin.has('documents:manage')")) {
  lapor('R-3', 'rag-acl.ts tak menurunkan ACL dari permission `documents:manage`')
}

// ── R-4: RPC vektor tak boleh memakai auth_company_id() ────────────────────
//
// Diukur 2026-08-10: `auth_company_id()` (migrasi 126) membaca GUC
// `app.company_id` atau keanggotaan `auth_user_id()`. KEDUANYA kosong pada
// klien service-role — satu-satunya klien yang bisa memanggil RPC di repo ini
// (`TenantDb.raw`). Migrasi 264 memakainya dan fungsinya mengembalikan NOL
// baris untuk SETIAP pemanggilan sah: fitur mati total, testnya tetap hijau.
const berkasMigrasi = readdirSync(MIGRASI).filter((f) => f.endsWith('.sql')).sort()
let defTerakhir = null
for (const f of berkasMigrasi) {
  const sql = readFileSync(join(MIGRASI, f), 'utf8')
  if (/CREATE OR REPLACE FUNCTION\s+rag_cari_vektor/i.test(sql)) defTerakhir = { f, sql }
}
if (!defTerakhir) {
  lapor('R-4', 'tak ada migrasi yang mendefinisikan `rag_cari_vektor`')
} else {
  const { f, sql } = defTerakhir
  // Hanya badan fungsinya yang diperiksa — komentar migrasi memang MEMBAHAS
  // `auth_company_id()` panjang lebar, dan menghukum penjelasan itu salah.
  const iFn = sql.search(/CREATE OR REPLACE FUNCTION\s+rag_cari_vektor/i)
  const badan = sql.slice(iFn).split(/^DO \$\$/m)[0]
  const kode = tanpaKomentar(badan.replace(/^--.*$/gm, ''))

  if (/auth_company_id\s*\(/.test(kode)) {
    lapor(
      'R-4',
      `${f}: \`rag_cari_vektor\` memakai auth_company_id() — ia KOSONG pada klien\n` +
        `        service-role, jadi fungsinya mengembalikan nol baris untuk SETIAP\n` +
        `        pemanggilan sah. Fitur mati, dan testnya tetap hijau.`,
    )
  }
  if (!/company_members/.test(kode)) {
    lapor('R-4', `${f}: keanggotaan tenant tidak dibuktikan di dalam fungsi`)
  }
  if (!/company_id\s*=\s*p_company/.test(kode)) {
    lapor('R-4', `${f}: company_id tidak ada di WHERE fungsi (T-2)`)
  }
  if (/security\s+definer/i.test(kode)) {
    lapor('R-4', `${f}: SECURITY DEFINER akan MELEWATI RLS`)
  }
  if (/file_url/.test(kode)) {
    lapor('R-4', `${f}: fungsi menyentuh file_url (T-5)`)
  }
}

// ── R-5: saringan ACL SATU tempat ──────────────────────────────────────────
if (!cari.includes('function terapkanAcl')) {
  lapor('R-5', 'rag-cari.ts tak punya `terapkanAcl` — saringan tersebar = dua saringan')
} else {
  /*
   * Yang dihitung PEMANGGILAN, bukan seluruh kemunculan.
   *
   * Versi pertama menuntut `terapkanAcl\s*\(` muncul ≥2× ("1 definisi + 1
   * pemakaian") dan langsung merah. Definisinya ternyata
   * `function terapkanAcl<T>(` — parameter generik duduk di antara nama dan
   * kurung, jadi regex itu TIDAK cocok dengan definisinya sama sekali.
   *
   * Ambang yang dihitung dari asumsi tentang bentuk kode adalah ambang yang
   * salah. Yang benar-benar dijaga: saringannya DIPANGGIL, minimal sekali.
   */
  const nPanggil = (cari.match(/=\s*terapkanAcl\s*\(|await\s+terapkanAcl\s*\(/g) ?? []).length
  if (nPanggil < 1) {
    lapor('R-5', '`terapkanAcl` didefinisikan tapi tak pernah DIPANGGIL')
  }
}

if (gagal > 0) {
  console.error(`\n❌ ${gagal} pelanggaran. Ambang penjaga ini NOL — lihat kepala berkas.`)
  process.exit(1)
}
console.log('  ✅ R-1..R-5 lulus (ambang NOL)')
