#!/usr/bin/env node
/**
 * GABUNG BANDING — menempel empat tangkapan `banding-shell` jadi SATU gambar
 * berdampingan, karena keputusan selera dibuat dengan mata membandingkan, bukan
 * dengan membuka empat berkas bergantian dan mengandalkan ingatan.
 *
 * Memakai `sharp` yang sudah ada di apps/api (dependency terpasang), bukan
 * menambah pustaka baru untuk satu alat sekali-pakai.
 *
 * Jalankan (dari ROOT repo, sesudah banding-shell.mjs):
 *   node apps/web/scripts/gabung-banding.mjs
 */
import sharp from '../../api/node_modules/sharp/dist/index.mjs'
import { join } from 'node:path'

const DIR = join('apps', 'web', '.layar', 'banding-shell')
const JUDUL_TINGGI = 44

/** Membuat pita judul sebagai SVG — tanpa font eksternal, tanpa aset. */
function pita(teks, lebar, gelap) {
  const bg = gelap ? '#12151C' : '#F1F5F9'
  const fg = gelap ? '#E5E9F0' : '#0F172A'
  const svg = `<svg width="${lebar}" height="${JUDUL_TINGGI}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${lebar}" height="${JUDUL_TINGGI}" fill="${bg}"/>
    <text x="16" y="28" font-family="Segoe UI, Arial, sans-serif" font-size="18"
          font-weight="700" fill="${fg}">${teks}</text>
  </svg>`
  return Buffer.from(svg)
}

async function barisMode(mode) {
  const kiri = join(DIR, `A-kini-${mode}.png`)
  const kanan = join(DIR, `B-mirip-referensi-${mode}.png`)

  const a = sharp(kiri)
  const meta = await a.metadata()
  const L = meta.width
  const T = meta.height
  const gelap = mode === 'gelap'

  // Tiap sisi: pita judul di atas, gambar di bawah.
  const sisi = async (berkas, judul) =>
    sharp({
      create: { width: L, height: T + JUDUL_TINGGI, channels: 3, background: gelap ? '#12151C' : '#F1F5F9' },
    })
      .composite([
        { input: pita(judul, L, gelap), top: 0, left: 0 },
        { input: await sharp(berkas).toBuffer(), top: JUDUL_TINGGI, left: 0 },
      ])
      .png()
      .toBuffer()

  const kiriBuf = await sisi(kiri, `A — SEKARANG (${mode})`)
  const kananBuf = await sisi(kanan, `B — MIRIP REFERENSI (${mode})`)

  return sharp({
    create: { width: L * 2 + 12, height: T + JUDUL_TINGGI, channels: 3, background: gelap ? '#000000' : '#CBD5E1' },
  })
    .composite([
      { input: kiriBuf, top: 0, left: 0 },
      { input: kananBuf, top: 0, left: L + 12 },
    ])
    .png()
    .toBuffer()
}

const terang = await barisMode('terang')
const gelap = await barisMode('gelap')

const mTerang = await sharp(terang).metadata()
const mGelap = await sharp(gelap).metadata()
const lebar = Math.max(mTerang.width, mGelap.width)

const keluar = join(DIR, 'BANDING.png')
await sharp({
  create: { width: lebar, height: mTerang.height + mGelap.height + 12, channels: 3, background: '#64748B' },
})
  .composite([
    { input: terang, top: 0, left: 0 },
    { input: gelap, top: mTerang.height + 12, left: 0 },
  ])
  .png()
  .toFile(keluar)

console.log('✓', keluar, `(${lebar}x${mTerang.height + mGelap.height + 12})`)
