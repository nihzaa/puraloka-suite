#!/usr/bin/env node
/**
 * PEMINDAI TAUTAN RUSAK di docs/ dan berkas .md akar repo.
 *
 * Kenapa ada (ROADMAP #7): audit 2026-07-31 menemukan dokumen yang menaut ke
 * berkas yang tidak ada, dan yang lebih buruk — dokumen yang menaut ke template
 * KOSONG lalu mengutipnya sebagai bukti kelengkapan fase. Tautan rusak di repo
 * ini bukan gangguan kosmetik: dokumen-dokumen ini dipakai sebagai bukti audit,
 * dan tautan yang menunjuk ke ruang hampa membuat bukti itu tak bisa ditelusuri.
 *
 * Perapian docs/ akan memindahkan berkas. Tanpa pemindai, tautan yang putus
 * karena pemindahan itu baru ketahuan berbulan-bulan kemudian — persis pola
 * yang PETA-PRIORITAS-ERP.md §2 catat sebagai sumber 8 kontradiksi.
 *
 * Yang DIPERIKSA: tautan markdown relatif ke berkas lokal.
 * Yang DILEWATI: URL http(s), mailto, anchor murni (#bagian), dan jalur yang
 * menunjuk ke kode (dicek terpisah oleh typecheck/test).
 */
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join, dirname, resolve, relative } from 'node:path'
import { globSync } from 'node:fs'

const AKAR = resolve(import.meta.dirname, '..')

/** Tautan markdown `[teks](target)` — target tanpa spasi, bukan gambar inline. */
const POLA_TAUTAN = /\[([^\]]*)\]\(([^)\s]+)\)/g

function berkasMarkdown() {
  return globSync(['docs/**/*.md', '*.md'], { cwd: AKAR })
    .map((p) => p.replaceAll('\\', '/'))
    .sort()
}

function periksa(berkasRelatif) {
  const jalurPenuh = join(AKAR, berkasRelatif)
  const isi = readFileSync(jalurPenuh, 'utf8')
  const rusak = []

  for (const cocok of isi.matchAll(POLA_TAUTAN)) {
    const target = cocok[2]

    // Lewati yang bukan jalur berkas lokal.
    if (/^(https?:|mailto:|#)/.test(target)) continue

    // Buang anchor: `berkas.md#bagian` → `berkas.md`. Keberadaan anchor tidak
    // diperiksa — heading bisa berubah tanpa memutus maksud tautannya.
    const tanpaAnchor = target.split('#')[0]
    if (!tanpaAnchor) continue

    const tujuan = resolve(dirname(jalurPenuh), decodeURIComponent(tanpaAnchor))
    if (!existsSync(tujuan)) {
      const baris = isi.slice(0, cocok.index).split('\n').length
      rusak.push({ baris, teks: cocok[1], target })
    }
  }
  return rusak
}

const berkas = berkasMarkdown()
let totalRusak = 0
const perBerkas = []

for (const b of berkas) {
  const rusak = periksa(b)
  if (rusak.length) {
    totalRusak += rusak.length
    perBerkas.push({ berkas: b, rusak })
  }
}

if (totalRusak === 0) {
  console.log(`✅ Nol tautan rusak (${berkas.length} berkas markdown dipindai)`)
  process.exit(0)
}

console.error(`\n❌ ${totalRusak} TAUTAN RUSAK di ${perBerkas.length} berkas:\n`)
for (const { berkas: b, rusak } of perBerkas) {
  console.error(`   ${b}`)
  for (const r of rusak) {
    console.error(`      :${r.baris}  [${r.teks}](${r.target})`)
  }
}
console.error(
  `\n   Total ${berkas.length} berkas dipindai.` +
  `\n   Perbaiki targetnya, atau hapus tautannya kalau berkas tujuan memang sengaja dibuang.\n`,
)
process.exit(1)
