#!/usr/bin/env node
/**
 * GABUNG BANDING KARTU — empat tangkapan jadi SATU gambar.
 *
 * Keputusan selera diambil dengan mata MEMBANDINGKAN, bukan dengan membuka
 * empat berkas bergantian dan mengandalkan ingatan. Ini pelajaran yang
 * sudah dibayar: `gabung-banding.mjs` di apps/web lahir dari kebutuhan yang
 * sama saat memutuskan shell web.
 *
 * ⚠ Kenapa TIDAK memakai `apps/web/scripts/gabung-banding.mjs` langsung:
 * nama berkas di sana DIPAKU ke `A-kini-*` / `B-mirip-referensi-*` milik
 * banding-shell. Menggeneralisasinya berarti menyentuh alat yang sedang
 * dipakai keputusan lain; menyalin 40 baris lebih murah daripada
 * memperbaiki sesuatu yang tak rusak.
 *
 * Memakai `sharp` dari apps/api (sudah terpasang), bukan menambah pustaka.
 *
 * Jalankan dari ROOT repo, sesudah kedua mode dipotret:
 *   node apps/mobile/scripts/banding-kartu.mjs
 *   node apps/mobile/scripts/banding-kartu.mjs --gelap
 *   node apps/mobile/scripts/gabung-banding-kartu.mjs
 */
import sharp from '../../api/node_modules/sharp/dist/index.mjs'
import { join } from 'node:path'

const DIR = join('apps', 'mobile', '.layar', 'banding-kartu')
const JUDUL = 52
const SELA = 20

/** Pita judul sebagai SVG — tanpa font eksternal, tanpa aset. */
function pita(teks, sub, lebar, gelap) {
  const bg = gelap ? '#12151C' : '#F1F5F9'
  const fg = gelap ? '#E5E9F0' : '#0F172A'
  const fg2 = gelap ? '#9AA4B8' : '#55606E'
  const svg = `<svg width="${lebar}" height="${JUDUL}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${lebar}" height="${JUDUL}" fill="${bg}"/>
    <text x="18" y="24" font-family="Segoe UI, Arial, sans-serif" font-size="17"
          font-weight="700" fill="${fg}">${teks}</text>
    <text x="18" y="42" font-family="Segoe UI, Arial, sans-serif" font-size="12"
          fill="${fg2}">${sub}</text>
  </svg>`
  return Buffer.from(svg)
}

async function baris(mode) {
  const gelap = mode === 'gelap'
  const akhiran = gelap ? '-gelap' : ''
  const kiri = join(DIR, `A-sekarang${akhiran}.png`)
  const tengah = join(DIR, `B-poles${akhiran}.png`)
  const kanan = join(DIR, `C-poles-plus${akhiran}.png`)

  const meta = await sharp(kiri).metadata()
  const L = meta.width
  const T = meta.height

  const satu = async (jalur, judul, sub) =>
    sharp({
      create: {
        width: L,
        height: T + JUDUL,
        channels: 4,
        background: gelap ? '#12151C' : '#F1F5F9',
      },
    })
      .composite([
        { input: pita(judul, sub, L, gelap), top: 0, left: 0 },
        { input: await sharp(jalur).toBuffer(), top: JUDUL, left: 0 },
      ])
      .png()
      .toBuffer()

  const a = await satu(kiri, `SEKARANG · ${mode}`, 'border 1px penuh · tanpa gerak')
  const b = await satu(tengah, `POLES · ${mode}`, 'hairline · uang jadi subjek · masuk bertahap')
  const c = await satu(
    kanan,
    `POLES+ · ${mode}`,
    'nominal 38px + tracking — diukur ke Linear/Ramp/Revolut',
  )

  return sharp({
    create: {
      width: L * 3 + SELA * 2,
      height: T + JUDUL,
      channels: 4,
      background: gelap ? '#0B0D12' : '#E2E8F0',
    },
  })
    .composite([
      { input: a, top: 0, left: 0 },
      { input: b, top: 0, left: L + SELA },
      { input: c, top: 0, left: (L + SELA) * 2 },
    ])
    .png()
    .toBuffer()
}

const terang = await baris('terang')
const gelap = await baris('gelap')

const mT = await sharp(terang).metadata()
const mG = await sharp(gelap).metadata()

const keluar = join(DIR, 'berjajar.png')
await sharp({
  create: {
    width: Math.max(mT.width, mG.width),
    height: mT.height + mG.height + SELA,
    channels: 4,
    background: '#94A3B8',
  },
})
  .composite([
    { input: terang, top: 0, left: 0 },
    { input: gelap, top: mT.height + SELA, left: 0 },
  ])
  .png()
  .toFile(keluar)

console.log(`══ Banding kartu digabung ═══════════════════════════════`)
console.log(`  ${keluar}`)
console.log(`  ${Math.max(mT.width, mG.width)} × ${mT.height + mG.height + SELA}px`)
