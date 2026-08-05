#!/usr/bin/env node
/**
 * UJI API PUNYA UI (UI-3-1) — mendaftar endpoint yang ADA di API tapi TAK
 * PERNAH dipanggil dari web.
 *
 * ── Kenapa ini penting, bukan sekadar kerapian
 *
 * `/api/v1/finance/ar-aging` sudah lama ada, ber-test, dan tak pernah dipakai
 * satu pun layar. Akibatnya: informasi "piutang ini sudah menunggu 60 hari"
 * tidak pernah sampai ke orang yang bisa menindaklanjutinya — padahal
 * datanya siap, hanya tak ada jendelanya.
 *
 * Itu bentuk pemborosan yang paling tak terlihat: pekerjaan backend yang
 * selesai, teruji, dan tak berguna bagi siapa pun. CHARTER §7 menyebutnya
 * dengan tegas — "kolom DB sudah ada" BUKAN selesai.
 *
 * ── Bukan ratchet yang memerahkan CI (belum)
 *
 * Dijalankan sebagai LAPORAN, bukan gerbang. Banyak endpoint memang sah tak
 * punya UI: webhook, cron, health check, dan endpoint yang dipakai portal
 * mandor lewat jalur lain. Memerahkan CI atas dasar daftar mentah akan
 * membuat orang menambahkan pengecualian sampai daftarnya tak bermakna.
 *
 * Yang berguna: angkanya turun dari waktu ke waktu, dan setiap yang baru
 * masuk daftar KETAHUAN saat PR dibaca.
 *
 * Pakai (DARI ROOT REPO): node apps/web/scripts/uji-api-punya-ui.mjs
 *                         ... --semua   (tanpa menyaring yang wajar)
 */
import { readdirSync, statSync, readFileSync } from 'node:fs'
import { join, sep } from 'node:path'

const SEMUA = process.argv.includes('--semua')

const kumpul = (akar, filter) => {
  const out = []
  const jelajah = (d) => {
    for (const n of readdirSync(d)) {
      if (n[0] === '.' || n === 'node_modules' || n === 'dist') continue
      const p = join(d, n)
      if (statSync(p).isDirectory()) jelajah(p)
      else if (filter(n)) out.push(p)
    }
  }
  jelajah(akar)
  return out
}

const norm = (p) =>
  p.split('?')[0]
   .replace(/\$\{[^}]+\}/g, '*')
   .replace(/:[a-zA-Z_]+/g, '*')
   .replace(/\/+$/, '')

// ── Rute API, beserta metode dan berkasnya ────────────────────────────────
const RUTE = new Map()
for (const f of kumpul(join('apps', 'api', 'src', 'routes'), (n) => n.endsWith('.ts') && !n.includes('.test.'))) {
  const isi = readFileSync(f, 'utf8')
  const baris = isi.split(/\r?\n/)
  baris.forEach((l, i) => {
    const m = l.match(/['"`](\/api\/v\d[^'"`\s]*)['"`]/)
    if (!m) return
    // Metode diambil dari `app.<metode>` terdekat DI ATAS baris path —
    // path sering ditulis beberapa baris setelah pemanggilannya.
    let metode = '?'
    for (let k = i; k >= Math.max(0, i - 12); k--) {
      const mm = baris[k].match(/app\.(get|post|put|patch|delete)\b/)
      if (mm) { metode = mm[1].toUpperCase(); break }
    }
    if (metode === '?') return       // bukan pendaftaran rute
    const p = norm(m[1])
    if (!RUTE.has(p)) RUTE.set(p, { metode: new Set(), berkas: f.split(sep).join('/') })
    RUTE.get(p).metode.add(metode)
  })
}

// ── Path yang dipanggil web ───────────────────────────────────────────────
const DIPAKAI = new Set()
for (const f of kumpul(join('apps', 'web'), (n) => /\.(tsx?|mjs)$/.test(n))) {
  if (
    f.includes(`${sep}.next${sep}`) ||
    f.includes(`${sep}ds-bundle${sep}`) ||
    f.includes(`${sep}scripts${sep}`) ||
    /\.(test|spec)\.[tj]sx?$/.test(f)
  ) continue
  for (const m of readFileSync(f, 'utf8').matchAll(/['"`](\/api\/v\d[^'"`?\s]*)/g)) {
    DIPAKAI.add(norm(m[1]))
  }
}

/**
 * Endpoint yang SAH tak punya UI. Daftar ini disebut satu per satu — bukan
 * pola samar — supaya penambahan ke sini terlihat saat review.
 */
const WAJAR = [
  /\/health/, /\/webhook/, /\/cron/, /\/internal\//,
  /\/auth\/(logout|refresh|callback)/,
  // Dipanggil service worker / offline queue, bukan komponen.
  /\/sync\//,
]

const yatim = [...RUTE.entries()]
  .filter(([p]) => !DIPAKAI.has(p))
  // Path ber-* dianggap terpakai bila ada pemakaian web yang berawalan sama.
  .filter(([p]) => {
    if (!p.includes('*')) return true
    const awalan = p.split('*')[0]
    return ![...DIPAKAI].some((d) => d.startsWith(awalan))
  })
  .filter(([p]) => SEMUA || !WAJAR.some((re) => re.test(p)))
  .sort((a, b) => a[0].localeCompare(b[0]))

console.log(`Rute API   : ${RUTE.size}`)
console.log(`Dipakai web: ${DIPAKAI.size}`)
console.log(`\n── ${yatim.length} endpoint TANPA pemakaian di web ──\n`)

// Dikelompokkan per berkas: satu modul yang seluruhnya tak berlayar adalah
// cerita yang berbeda dari satu endpoint yang terlewat.
const perBerkas = new Map()
for (const [p, info] of yatim) {
  const k = info.berkas.replace(/.*routes\//, '')
  if (!perBerkas.has(k)) perBerkas.set(k, [])
  perBerkas.get(k).push(`${[...info.metode].join('/')} ${p}`)
}
for (const [berkas, daftar] of [...perBerkas].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`${berkas}  (${daftar.length})`)
  for (const d of daftar) console.log(`   ${d}`)
  console.log()
}
