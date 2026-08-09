#!/usr/bin/env node
/**
 * PENJAGA: TOOL ASISTEN AI TIDAK MENULIS, DAN SADAR TENANT (I-1 + T-1).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA INI PENJAGA, BUKAN KOMENTAR
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Spec §5.3 menyebut satu-satunya pertahanan prompt injection yang TIDAK
 * bergantung pada model berperilaku baik: tombolnya tidak ada. Model boleh
 * dibujuk sesukses apa pun; kalau tak ada tool yang menulis, tak ada tulisan.
 *
 * Pertahanan itu punya satu titik lemah, dan bukan pada modelnya: **sesi
 * berikutnya menambahkan tool yang menulis karena kelihatannya berguna.**
 * "Sekalian bisa update status" adalah kalimat yang wajar, tak ada test yang
 * merah karenanya, dan pertahanan I-1 lenyap dalam satu commit.
 *
 * ── Yang diperiksa
 *
 *   I-1  nol `.insert/.update/.delete/.upsert/.rpc` di katalog tool
 *   T-1  nol `supabase` mentah — tool WAJIB lewat `TenantDb`
 *   T-1b `db.unsafe(` wajib disertai penyaring (`.in(` / `.eq(`) di dekatnya;
 *        `unsafe` tanpa saringan membaca LINTAS TENANT dan tetap lolos RLS
 *        karena `unsafe` memang jalur yang diizinkan
 *   I-3  tiap tool menyatakan `izin:` — fail-closed
 *
 * ── Arrow-const IKUT dipindai
 *
 * Spec menandai ini eksplisit: penjaga tenancy yang ada hanya cocok pada
 * `function nama(`, jadi `export const x = async () =>` TAK TERLIHAT sekalipun
 * berada di direktori yang dipindai. Penjaga ini memindai SELURUH isi berkas,
 * bukan hanya deklarasi fungsi, sehingga bentuk penulisannya tak menentukan.
 *
 * Ambang NOL.
 *
 * Pakai:  node apps/api/scripts/audit-tool-ai-read-only.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(__dirname, '..', 'src')

/** Berkas yang memuat tool asisten. */
const BERKAS_TOOL = ['lib/ai-tool.ts']

const TULIS = ['.insert(', '.update(', '.delete(', '.upsert(', '.rpc(']

for (const rel of BERKAS_TOOL) {
  if (!existsSync(join(SRC, rel))) {
    console.error(`✗ Berkas tool tak ada: ${rel}`)
    console.error('  Kalau dipindah, perbarui BERKAS_TOOL di penjaga ini — daftar')
    console.error('  yang menunjuk berkas hilang membuat penjaga ini diam-diam melar.')
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

for (const rel of BERKAS_TOOL) {
  const src = tanpaKomentar(readFileSync(join(SRC, rel), 'utf8'))
  const baris = src.split('\n')

  baris.forEach((isi, i) => {
    // ── I-1 nol jalur tulis ─────────────────────────────────────────────
    for (const t of TULIS) {
      if (isi.includes(t)) {
        gagal.push({
          aturan: 'I-1',
          pesan: `${rel}:${i + 1} memuat operasi tulis \`${t}\``,
          akibat:
            'kekebalan struktural terhadap prompt injection HILANG. Satu tool ' +
            'yang menulis membuat seluruh pertahanan §5.3 bergantung pada model ' +
            'berperilaku baik — dan model tak punya cara membedakan data yang ' +
            'dibacanya dari perintah yang diterimanya.',
        })
      }
    }

    // ── T-1 nol supabase mentah ─────────────────────────────────────────
    if (/\bsupabase\s*\.\s*from\s*\(/.test(isi) || /from\s+['"].*supabase.*['"]/.test(isi)) {
      gagal.push({
        aturan: 'T-1',
        pesan: `${rel}:${i + 1} memakai klien supabase mentah`,
        akibat:
          'tool yang tak lewat TenantDb membaca LINTAS TENANT. Asisten tenant A ' +
          'akan menjawab dengan angka tenant B, dan jawabannya terdengar benar.',
      })
    }

    // ── T-1b unsafe wajib bersaring ─────────────────────────────────────
    if (/\bdb\s*\.\s*unsafe\s*\(/.test(isi)) {
      // Saringannya boleh berada beberapa baris di bawah (rantai builder).
      const jendela = baris.slice(i, i + 8).join('\n')
      if (!/\.\s*(in|eq)\s*\(/.test(jendela)) {
        gagal.push({
          aturan: 'T-1b',
          pesan: `${rel}:${i + 1} \`db.unsafe(\` tanpa penyaring .in()/.eq() dalam 8 baris`,
          akibat:
            '`unsafe` melewati saringan tenant OTOMATIS — itu memang gunanya. ' +
            'Tanpa saringan manual, ia membaca seluruh tenant dan TETAP lolos ' +
            'RLS, karena jalur ini memang diizinkan.',
        })
      }
    }
  })

  // ── I-3 tiap tool menyatakan izin ─────────────────────────────────────
  //
  // Dihitung dari bentuk objeknya, bukan dari impor: `nama:` dan `izin:` harus
  // berjumlah sama. Tool yang lupa `izin` akan gagal TypeScript, tapi penjaga
  // ini juga menangkapnya kalau kelak tipenya dilonggarkan.
  const jumlahNama = (src.match(/^\s{2}nama:\s*'/gm) ?? []).length
  const jumlahIzin = (src.match(/^\s{2}izin:\s*'/gm) ?? []).length
  if (jumlahNama !== jumlahIzin) {
    gagal.push({
      aturan: 'I-3',
      pesan: `${rel}: ${jumlahNama} tool tapi ${jumlahIzin} deklarasi izin`,
      akibat:
        'tool tanpa izin adalah tool yang dimiliki SEMUA orang. ACL fail-closed ' +
        'hanya berlaku kalau tiap tool menyatakan izinnya.',
    })
  }
}

console.log('══ Tool AI read-only & sadar tenant ════════════════════════')
console.log(`  berkas tool  : ${BERKAS_TOOL.join(', ')}`)
console.log(`  pelanggaran  : ${gagal.length}`)
console.log('  ambang       : 0 (bukan ratchet)\n')

if (gagal.length > 0) {
  for (const g of gagal) {
    console.error(`   [${g.aturan}] ${g.pesan}`)
    console.error(`         → ${g.akibat}`)
  }
  console.error(`
   "Sekalian bisa update status" adalah kalimat yang wajar, tak ada test yang
   merah karenanya, dan pertahanan I-1 lenyap dalam satu commit.

   Kalau asisten memang perlu MENGUBAH sesuatu, jalurnya bukan tool baru di
   sini — melainkan preview & approve (TJS-E1): model menyiapkan usulan,
   manusia yang menekan tombol.
`)
  process.exit(1)
}

console.log('✓ Nol jalur tulis, nol supabase mentah, tiap tool ber-izin.')
