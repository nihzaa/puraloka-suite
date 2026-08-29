/**
 * Membaca OPERATOR WARNA di dalam PDF — tanpa merender.
 *
 * Yang ditanyakan satu: apakah dokumen ini menggambar bidang HITAM sebesar
 * halaman? `var(--x)` yang tak ter-resolve jatuh ke rgb(0,0,0), jadi cacatnya
 * muncul sebagai operator `0 0 0 rg` yang mengisi area besar.
 */
import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'

const jalur = process.argv[2]
const buf = readFileSync(jalur)

// Ambil seluruh stream terkompresi lalu buka.
let teks = ''
let i = 0
while (true) {
  const s = buf.indexOf('stream', i)
  if (s === -1) break
  const e = buf.indexOf('endstream', s)
  if (e === -1) break
  let mulai = s + 6
  while (buf[mulai] === 0x0d || buf[mulai] === 0x0a) mulai++
  try { teks += inflateSync(buf.subarray(mulai, e)).toString('latin1') + '\n' } catch {}
  i = e + 9
}

const isian = [...teks.matchAll(/([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+(?:rg|scn)/g)]
  .map(m => [Number(m[1]), Number(m[2]), Number(m[3])])
const hitam = isian.filter(c => c[0] === 0 && c[1] === 0 && c[2] === 0)
const berwarna = isian.filter(c => !(c[0] === 0 && c[1] === 0 && c[2] === 0))

console.log(`operator isi warna       : ${isian.length}`)
console.log(`  hitam murni (0 0 0)   : ${hitam.length}`)
console.log(`  berwarna              : ${berwarna.length}`)
const unik = [...new Set(berwarna.map(c => c.map(x => Math.round(x * 255)).join(',')))]
console.log(`  warna unik            : ${unik.slice(0, 8).join(' | ')}`)

// Bidang besar berwarna hitam = gejala cacatnya.
const reHitamBesar = /0\s+0\s+0\s+rg[\s\S]{0,120}?re\s*\n?\s*f/g
const bidangHitam = [...teks.matchAll(reHitamBesar)].length
console.log(`  bidang terisi hitam   : ${bidangHitam}`)

if (isian.length === 0) { console.error('\n❌ Nol operator warna — stream tak terbaca, hasil TIDAK SAH.'); process.exit(1) }
if (berwarna.length === 0) { console.error('\n❌ SEMUA isian hitam — ini gejala var(--) tak ter-resolve.'); process.exit(1) }
console.log('\n✅ Dokumen memakai warna sungguhan, bukan hitam seluruhnya.')
