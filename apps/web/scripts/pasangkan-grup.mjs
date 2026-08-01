#!/usr/bin/env node
/**
 * CODEMOD — `<label>` yang menamai GRUP tombol pilihan, bukan satu kontrol.
 *
 * ── Kenapa terpisah dari `pasangkan-label.mjs`
 *
 * 44 label tersisa sesudah dua gelombang codemod itu, dan seluruhnya bentuk
 * yang sama: sebuah `<label>` di atas WADAH berisi beberapa `<button>` —
 * pemilih tipe akun, status transfer, sumber dana, tipe invoice.
 *
 * `htmlFor` tak berlaku di sini, dan memaksakannya justru salah: ia hanya
 * bisa menunjuk SATU kontrol, jadi label "Sumber Dana" akan menempel ke tombol
 * pertama saja seolah tiga tombol lainnya tak dinamai apa pun.
 *
 * Yang benar menurut WAI-ARIA: wadahnya diberi `role="group"` dan ditautkan ke
 * teks labelnya lewat `aria-labelledby`. Pembaca layar lalu mengumumkan
 * "Sumber Dana, grup" sebelum membacakan pilihan-pilihannya — sehingga orang
 * tahu tombol-tombol itu SATU pertanyaan, bukan empat tombol lepas.
 *
 * Label diganti `<span>`: elemen `<label>` yang tak menunjuk kontrol apa pun
 * memang bukan label menurut HTML, dan membiarkannya membuat pembaca layar
 * menjanjikan kaitan yang tak ada.
 *
 * Mode default: laporan saja. `--tulis` untuk benar-benar menyunting.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

const AKAR = join(import.meta.dirname, '..')
const TULIS = process.argv.includes('--tulis')

function berkasTsx(dir) {
  const h = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.') || e.name === 'ds-bundle') continue
    const p = join(dir, e.name)
    if (e.isDirectory()) h.push(...berkasTsx(p))
    else if (e.name.endsWith('.tsx')) h.push(p)
  }
  return h
}

/** Teks label → slug id yang stabil & terbaca. */
function keSlug(s) {
  return s
    .replace(/<[^>]*>/g, ' ')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .toLowerCase()
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

let diubah = 0
let dilewati = 0
const laporan = []

for (const f of [...berkasTsx(join(AKAR, 'app')), ...berkasTsx(join(AKAR, 'components'))]) {
  const rel = relative(AKAR, f).replace(/\\/g, '/')
  const baris = readFileSync(f, 'utf8').split('\n')
  const dipakai = new Set([...baris.join('\n').matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]))
  let ubahBerkas = 0

  for (let i = 0; i < baris.length - 1; i++) {
    const L = baris[i]
    if (!/<label\b/.test(L) || /htmlFor=/.test(L)) continue
    if (/<(input|select|textarea)\b/.test(L)) continue

    // Teks label harus ada di baris yang sama (bentuk satu-baris).
    const teks = L.match(/>([^<>{]*[A-Za-z][^<>{]*)</)
    if (!teks) continue

    // Baris berikutnya harus WADAH (bukan kontrol tunggal), dan dalam 6 baris
    // sesudahnya harus ada `<button` — itu yang membedakan grup pilihan dari
    // label yang kebetulan belum berpasangan.
    const berikut = baris[i + 1] ?? ''
    if (!/<div\b/.test(berikut)) continue
    if (/<(input|select|textarea)\b/.test(berikut)) continue
    const jendela = baris.slice(i + 1, i + 8).join('\n')
    if (!/<button\b/.test(jendela)) continue
    if (/role="group"/.test(jendela)) continue

    let id = keSlug(teks[1].trim())
    if (!id) { dilewati++; continue }
    if (dipakai.has(id)) {
      let n = 2
      while (dipakai.has(`${id}-${n}`)) n++
      id = `${id}-${n}`
    }
    dipakai.add(id)

    // `<label>` → `<span id=…>`: elemen label yang tak menunjuk kontrol apa pun
    // bukan label menurut HTML.
    baris[i] = L
      .replace(/<label\b/, `<span id="${id}"`)
      .replace(/<\/label>/, '</span>')
    baris[i + 1] = berikut.replace(/<div\b/, `<div role="group" aria-labelledby="${id}"`)
    ubahBerkas++
    diubah++
  }

  if (ubahBerkas > 0) {
    if (TULIS) writeFileSync(f, baris.join('\n'), 'utf8')
    laporan.push(`${rel}: ${ubahBerkas} grup ditandai`)
  }
}

for (const l of laporan) console.log('  ' + l)
console.log(`\n${diubah} grup ditandai · ${dilewati} dilewati`)
if (!TULIS) console.log('\nMode laporan. Jalankan dengan --tulis untuk menyunting.')
