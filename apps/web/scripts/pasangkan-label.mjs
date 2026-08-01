#!/usr/bin/env node
/**
 * CODEMOD — memasangkan `<label>` dengan kontrolnya lewat `htmlFor` ↔ `id`.
 *
 * ── Kenapa
 *
 * 253 `<label>` di `apps/web` berdiri sendiri di atas kontrolnya tanpa kaitan
 * apa pun. Secara visual jelas — orang melihat "Nama Lengkap" persis di atas
 * kotaknya. Bagi pembaca layar tidak: ia menyebut kotak itu "suntingan teks",
 * tanpa nama, dan pemakainya harus menebak dari urutan.
 *
 * Dampaknya bukan teoretis untuk aplikasi ini. Penggunanya mandor dan tukang
 * di lapangan — perangkat lama, layar kecil, sering di bawah matahari, dan
 * sebagian mengandalkan pembesaran/pembacaan layar. Form yang kontrolnya tak
 * bernama adalah form yang harus ditebak.
 *
 * Efek sampingnya bagus untuk semua orang: `htmlFor` membuat teks label bisa
 * DIKLIK untuk memfokuskan kontrolnya — target sentuh jadi jauh lebih besar,
 * yang persis dibutuhkan di HP.
 *
 * ── Cara kerja, dan apa yang SENGAJA tidak dilakukan
 *
 * Id TIDAK dikarang. Ia diturunkan dari yang sudah ada di kode:
 *   1. `value={namaState}` pada kontrolnya → `id="nama-state"`
 *   2. `name="..."` kalau ada
 * Kalau keduanya gagal, blok itu DILEWATI dan dilaporkan — id yang salah
 * memasangkan label ke kontrol yang keliru, dan itu lebih menyesatkan
 * daripada tak ada pasangan sama sekali.
 *
 * Yang tidak disentuh:
 *   · label yang SUDAH punya `htmlFor`
 *   · kontrol yang sudah punya `id`
 *   · label yang membungkus kontrolnya (`<label><input/></label>` — sudah sah)
 *   · komponen yang dirender berulang (`.map(`) di 2 baris sekitarnya — id
 *     harus unik per halaman, dan pengulangan akan menghasilkan duplikat
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

/** `namaState` → `nama-state` (id yang stabil & terbaca di DevTools). */
function keSlug(s) {
  return s
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .toLowerCase()
    .replace(/^-+|-+$/g, '')
}

let diubah = 0
let dilewati = 0
const laporan = []

for (const f of [...berkasTsx(join(AKAR, 'app')), ...berkasTsx(join(AKAR, 'components'))]) {
  const rel = relative(AKAR, f).replace(/\\/g, '/')
  const baris = readFileSync(f, 'utf8').split('\n')
  let ubahBerkas = 0
  const dipakai = new Set(
    [...baris.join('\n').matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]),
  )

  for (let i = 0; i < baris.length - 1; i++) {
    const L = baris[i]
    if (!/<label\b/.test(L)) continue
    if (/htmlFor=/.test(L)) continue
    // Label yang membungkus kontrolnya sudah sah menurut WCAG.
    if (/<(input|select|textarea)\b/.test(L)) continue
    // Harus benar-benar punya teks; label kosong bukan urusan codemod ini.
    if (!/>[^<>{]*[A-Za-z][^<>{]*</.test(L)) continue

    // Kontrol dicari di baris berikutnya (pola dominan di repo ini) atau
    // dua baris sesudahnya untuk atribut yang dipecah.
    let j = -1
    for (let k = i + 1; k <= Math.min(i + 2, baris.length - 1); k++) {
      if (/<(input|select|textarea)\b/.test(baris[k])) { j = k; break }
      // Berhenti kalau sudah bertemu label lain — berarti kontrolnya bukan
      // milik label ini.
      if (/<label\b/.test(baris[k])) break
    }
    if (j === -1) continue
    if (/\bid=/.test(baris[j])) continue

    // Jangan sentuh yang dirender berulang: id wajib unik per halaman, dan
    // `.map()` akan menghasilkan sekian salinan id yang sama — itu memasangkan
    // semua label ke kontrol PERTAMA, yang lebih buruk daripada tak dipasangkan.
    const sekitar = baris.slice(Math.max(0, i - 2), j + 1).join('\n')
    if (/\.map\s*\(/.test(sekitar)) {
      dilewati++
      laporan.push(`${rel}:${i + 1} dilewati — di dalam .map(), id tak akan unik`)
      continue
    }

    const dariValue = baris[j].match(/value=\{([A-Za-z_$][\w$]*)/)
    const dariName = baris[j].match(/name="([^"]+)"/)
    const asal = dariValue?.[1] ?? dariName?.[1]
    if (!asal) {
      dilewati++
      laporan.push(`${rel}:${i + 1} dilewati — tak ada value={state} atau name= untuk menurunkan id`)
      continue
    }

    let id = keSlug(asal)
    if (dipakai.has(id)) {
      let n = 2
      while (dipakai.has(`${id}-${n}`)) n++
      id = `${id}-${n}`
    }
    dipakai.add(id)

    baris[i] = L.replace(/<label\b/, `<label htmlFor="${id}"`)
    baris[j] = baris[j].replace(/<(input|select|textarea)\b/, `<$1 id="${id}"`)
    ubahBerkas++
    diubah++
  }

  if (ubahBerkas > 0 && TULIS) writeFileSync(f, baris.join('\n'), 'utf8')
  if (ubahBerkas > 0) laporan.push(`${rel}: ${ubahBerkas} label dipasangkan`)
}

for (const l of laporan) console.log('  ' + l)
console.log(`\n${diubah} label dipasangkan · ${dilewati} dilewati (butuh penilaian manusia)`)
if (!TULIS) console.log('\nMode laporan. Jalankan dengan --tulis untuk benar-benar menyunting.')
