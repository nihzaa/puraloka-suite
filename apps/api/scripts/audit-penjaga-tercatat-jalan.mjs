#!/usr/bin/env node
/**
 * Penjaga yang TERCATAT wajib benar-benar JALAN.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ARAH YANG DIJAGA, DAN ARAH YANG SENGAJA TIDAK
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Ada dua ketidakcocokan yang mungkin antara tabel penjaga di CLAUDE.md dan
 * `ci.yml`, dan keduanya TIDAK sama beratnya.
 *
 *   B. tercatat di tabel, TIDAK jalan di CI   ← YANG DIJAGA, ambang NOL
 *
 *      Dokumen menjanjikan perlindungan yang tak ada. Yang membacanya
 *      berhenti memeriksa hal yang sebenarnya tak dijaga siapa pun — dan
 *      berhentinya tak punya gejala. Bentuk yang sama dengan
 *      `audit-klaim-layar-nyata`: catatan yang mengklaim sesuatu SELESAI
 *      atas pekerjaan yang tak pernah ada.
 *
 *   A. jalan di CI, tidak tercatat di tabel   ← TIDAK dijaga, sengaja
 *
 *      Diukur 2026-08-31: 206 penjaga jalan, 49 tertabel. Yang 151 lainnya
 *      bukan cacat — tabel itu memang bukan daftar isi, melainkan penjaga
 *      yang ALASANNYA perlu diketahui sebelum menyentuh kode terkait.
 *      Menuntutnya lengkap akan menghasilkan tabel 206 baris yang tak
 *      seorang pun baca, dan dokumen yang tak dibaca tak menjaga apa pun.
 *
 *      Kepala bagian 6 CLAUDE.md sekarang menyatakan ketidaklengkapan itu
 *      eksplisit, dan menyebut cara mengukurnya. Itu perbaikan yang benar
 *      untuknya — bukan penjaga.
 *
 * ── Kenapa pemindaian `ci.yml` tidak boleh hanya mencari `run: node …`
 *
 * Versi pertama pengukur ini memakai `/run:\s*node\s+…/` dan MELEWATKAN
 * bentuk `run: cd ../web && node scripts/x.mjs`. Dua penjaga terhitung
 * "tercatat tapi tak jalan" padahal keduanya jalan (ci.yml:988 dan 1011).
 *
 * Temuan palsu ke arah "ada yang tak dijaga" mengirim orang memperbaiki yang
 * tak rusak, lalu melatih mereka mengabaikan penjaga ini. Sekarang seluruh
 * berkas dipindai untuk `node …*.mjs`, apa pun yang mendahuluinya.
 */
import { readFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

const ci = readFileSync(join(AKAR, '.github', 'workflows', 'ci.yml'), 'utf8')
const md = readFileSync(join(AKAR, 'CLAUDE.md'), 'utf8')

/** Semua skrip .mjs yang dijalankan CI — bentuk pemanggilan apa pun. */
const jalan = new Set()
for (const m of ci.matchAll(/node\s+(?:[\w./-]*\/)?([\w-]+\.mjs)/g)) jalan.add(m[1])

/** Penjaga yang tercatat di TABEL (baris `| \`nama.mjs\` | … |`). */
const tercatat = new Set()
for (const m of md.matchAll(/^\|\s*`([\w-]+\.mjs)`[^|]*\|/gm)) tercatat.add(m[1])

/*
  Korpus kosong = pola meleset, BUKAN repo yang bersih. Cacat yang sudah
  menggigit dua penjaga lain di repo ini. Ambang jauh di bawah jumlah nyata.
*/
if (jalan.size < 50) {
  console.error(`❌ Cuma ${jalan.size} skrip terbaca dari ci.yml — polanya meleset.`)
  console.error('   Nol temuan dari korpus kosong bukan bukti apa pun.')
  process.exit(1)
}
if (tercatat.size < 10) {
  console.error(`❌ Cuma ${tercatat.size} baris tabel terbaca dari CLAUDE.md — polanya meleset.`)
  process.exit(1)
}

const janjiPalsu = [...tercatat].filter((n) => !jalan.has(n)).sort()

console.log('══ Penjaga tercatat wajib benar-benar jalan ═══════════════════')
console.log(`  dijalankan ci.yml    : ${jalan.size}`)
console.log(`  tercatat di tabel    : ${tercatat.size}`)
console.log(`  tercatat TAPI TAK jalan : ${janjiPalsu.length}`)

if (janjiPalsu.length > 0) {
  console.log('')
  for (const n of janjiPalsu) console.log(`  ❌ ${n}`)
  console.log('')
  console.log('  Tabel penjaga CLAUDE.md menjanjikan perlindungan yang tak ada.')
  console.log('  Yang membacanya berhenti memeriksa hal yang tak dijaga siapa pun,')
  console.log('  dan berhentinya tak punya gejala.')
  console.log('')
  console.log('  Perbaikannya SALAH SATU: pasang penjaganya di ci.yml, atau')
  console.log('  keluarkan barisnya dari tabel. Jangan biarkan keduanya berbeda.')
  console.log('')
  console.log(`❌ ${janjiPalsu.length} penjaga tercatat tapi tak dijalankan CI.`)
  process.exit(1)
}

console.log('')
console.log(`✅ ${tercatat.size} penjaga tertabel, semuanya benar-benar dijalankan CI.`)
