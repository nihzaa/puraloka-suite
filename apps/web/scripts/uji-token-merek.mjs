#!/usr/bin/env node
/**
 * UJI TOKEN MEREK — memastikan permukaan merek TIDAK berbalik di mode gelap.
 *
 * ── Kenapa ada
 *
 * `--grad-merek` sengaja tak didefinisikan ulang di blok `.dark`. Itu bukan
 * kelalaian — itu perilakunya: panel kiri halaman masuk adalah kop surat
 * perusahaan, bukan permukaan data, dan kop surat tak berubah warna karena
 * lampu ruangan.
 *
 * Masalahnya, "sengaja tidak ada" terlihat persis seperti "lupa ditulis".
 * Orang berikutnya yang menyisir globals.css akan melihat token tanpa
 * pasangan gelap dan menambahkannya dengan niat baik — lalu panel masuk
 * kembali menyala biru di mode gelap, dan tak ada yang menyadarinya sampai
 * seseorang kebetulan membuka halaman masuk dengan tema gelap.
 *
 * Uji ini membuat niat itu bisa dieksekusi, bukan sekadar dikomentari.
 *
 * Sekalian menjaga hal kedua: gradasi aksen harus tetap NAVY sepanjang
 * rentangnya (rona 210° ± toleransi). Founder menolak versi yang berakhir di
 * biru langit — "ke yang paling terang itu warna brand-nya, jangan ke warna
 * lain". Rona yang melenceng adalah cara paling halus merek itu bocor.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const CSS = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'app', 'globals.css'),
  'utf8'
)
const potongGelap = CSS.indexOf('.dark')
const TERANG = CSS.slice(0, potongGelap)
const GELAP = CSS.slice(potongGelap)

let gagal = 0
const salah = (pesan) => { console.log(`  ✗ ${pesan}`); gagal++ }
const benar = (pesan) => console.log(`  ✓ ${pesan}`)

// ── 1. Token merek tak boleh ditimpa di mode gelap ────────────────────────
console.log('── Permukaan merek tetap sama di kedua mode ──')
for (const t of ['--grad-merek', '--on-merek']) {
  if (!TERANG.includes(`${t}:`)) salah(`${t} tak ada di :root`)
  else if (GELAP.includes(`${t}:`))
    salah(`${t} DITIMPA di blok .dark — permukaan merek harus tetap navy pekat. ` +
          `Kalau perubahan ini disengaja, hapus token ini dari uji-token-merek.mjs ` +
          `dan jelaskan alasannya di globals.css.`)
  else benar(`${t} tidak ditimpa`)
}

// ── 2. Gradasi aksen harus tetap navy sepanjang rentangnya ────────────────
const hexHsl = (h) => {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i + 1, i + 3), 16) / 255)
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn
  if (!d) return [0, 0, (mx + mn) / 2]
  let hh = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
  const l = (mx + mn) / 2
  return [hh * 60, l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn), l]
}

// Rona merek 210°. Toleransi ±8° memberi ruang untuk penyetelan halus tanpa
// membiarkannya menyeberang ke cyan atau indigo.
//
// ⚠️ SATURASI juga dijaga, dan itu ketahuan dari mutation test — bukan dari
// menebak. Suntikan #2C7BD9 (warna yang founder tolak: *"ke yang paling
// terang itu warna brand-nya, jangan ke warna lain"*) LOLOS uji rona: 213°,
// masih dalam toleransi. Yang sebenarnya bergeser adalah saturasinya — 69%
// vs 100% — dan itulah yang membuatnya terbaca sebagai biru langit alih-alih
// navy yang dinaikkan.
//
// Pelajarannya umum: penjaga yang hanya mengukur satu sumbu akan dilewati
// oleh pelanggaran di sumbu lain, dan tampak hijau sambil membiarkannya.
const RONA = 210, TOL_RONA = 8, SAT_MIN = 0.85
console.log(`\n── Gradasi aksen tetap navy (rona 210°±8, saturasi ≥${SAT_MIN * 100}%) ──`)
for (const nama of ['--grad-aksen', '--grad-aksen-tegak', '--grad-merek', '--grad-navy']) {
  for (const [blok, teks] of [['terang', TERANG], ['gelap', GELAP]]) {
    const m = teks.match(new RegExp(`${nama}:\\s*([^;]+);`))
    if (!m) continue
    const stops = [...m[1].matchAll(/#[0-9A-Fa-f]{6}/g)].map((x) => x[0])
    const melenceng = []
    for (const s of stops) {
      const [h, sat] = hexHsl(s)
      // Warna nyaris kelabu tak punya rona bermakna — jangan dinilai ronanya.
      if (sat <= 0.15) continue
      if (Math.abs(h - RONA) > TOL_RONA) melenceng.push(`${s} rona ${h.toFixed(0)}°`)
      else if (sat < SAT_MIN) melenceng.push(`${s} saturasi ${(sat * 100).toFixed(0)}% (pudar jadi biru langit)`)
    }
    if (melenceng.length) {
      salah(`${nama} (${blok}): ${melenceng.join(', ')} — keluar dari navy merek`)
    } else {
      benar(`${nama} (${blok}): ${stops.length} perhentian, semua navy`)
    }
  }
}

// ── 3. lib/warna-merek.ts harus sinkron dengan globals.css ────────────────
//
// Berkas itu menyimpan hex sungguhan untuk tempat yang tak bisa memakai
// custom property (metadata.themeColor, app/icon.svg). Dua sumber yang
// menggambarkan warna yang sama akan menyimpang — pertanyaannya kapan, bukan
// apakah. Ini yang membuatnya ketahuan pada hari yang sama.
console.log('\n── lib/warna-merek.ts sinkron dengan globals.css ──')
const TS = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'warna-merek.ts'),
  'utf8'
)
const ambilTs = (nama) => TS.match(new RegExp(`${nama} = '(#[0-9A-Fa-f]{6})'`))?.[1]?.toUpperCase()
const ambilCss = (teks, token) =>
  teks.match(new RegExp(`${token}:\\s*(#[0-9A-Fa-f]{6})`))?.[1]?.toUpperCase()

for (const [konst, token, blok, teks] of [
  ['NAVY', '--navy', ':root', TERANG],
  ['GELAP', '--bg', '.dark', GELAP],
  ['DI_ATAS_NAVY', '--on-aksen', ':root', TERANG],
]) {
  const a = ambilTs(konst), b = ambilCss(teks, token)
  if (!a) salah(`${konst} tak ditemukan di lib/warna-merek.ts`)
  else if (!b) salah(`${token} tak ditemukan di ${blok} globals.css`)
  else if (a !== b) salah(`${konst}=${a} tapi ${token}=${b} di ${blok} — dua sumber menyimpang`)
  else benar(`${konst} = ${token} = ${a}`)
}

if (gagal) {
  console.log(`\n${gagal} pelanggaran identitas merek.`)
  process.exit(1)
}
console.log('\n✓ Identitas merek utuh di kedua mode.')
