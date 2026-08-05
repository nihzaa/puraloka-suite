#!/usr/bin/env node
/**
 * UKUR KONTRAS — menghitung rasio WCAG sebelum warna dipakai, bukan sesudah.
 *
 * Pelajaran mahal di repo ini: #6366F1 sempat dipilih sebagai aksen karena
 * "kelihatan bagus", lalu ternyata 4,47:1 di latar putih — gagal AA untuk teks
 * (butuh 4,5). Ditemukan hanya karena diukur. Sejak itu setiap warna teks
 * diukur lebih dulu.
 *
 * Pakai: node apps/web/scripts/ukur-kontras.mjs "#003366" "#FFFFFF"
 *        node apps/web/scripts/ukur-kontras.mjs --set    (uji set brand)
 */

const hexRgb = (h) => {
  const s = h.replace('#', '')
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16))
}

// WCAG 2.1 relative luminance.
const luminance = (hex) => {
  const [r, g, b] = hexRgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export const kontras = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

const nilai = (r) =>
  r >= 7 ? 'AAA' : r >= 4.5 ? 'AA' : r >= 3 ? 'AA-besar/UI' : 'GAGAL'

const arg = process.argv.slice(2)

if (arg[0] === '--set') {
  // Latar yang benar-benar dipakai aplikasi — mengukur terhadap putih murni
  // saja menyembunyikan kegagalan di permukaan kartu dan latar lembut.
  const LATAR_TERANG = {
    'putih #FFFFFF': '#FFFFFF',
    'kanvas #F7F8FA': '#F7F8FA',
    'kartu #FFFFFF': '#FFFFFF',
  }
  const LATAR_GELAP = {
    'kanvas #0F1117': '#0F1117',
    'kartu #171A23': '#171A23',
  }

  const KANDIDAT_TERANG = process.env.KANDIDAT?.split(',') ?? [
    '#003366', '#00478F', '#0B4F8F', '#0A4A85',
  ]
  const KANDIDAT_GELAP = process.env.KANDIDAT_GELAP?.split(',') ?? [
    '#5FA8F5', '#6DB3FF', '#78BEFF', '#8FCBFF',
  ]

  console.log('── Mode TERANG (warna sebagai teks/ikon) ──')
  for (const c of KANDIDAT_TERANG) {
    const baris = Object.entries(LATAR_TERANG)
      .map(([n, bg]) => `${n} ${kontras(c, bg).toFixed(2)} ${nilai(kontras(c, bg))}`)
      .join('  ·  ')
    console.log(`${c}  ${baris}`)
  }

  console.log('\n── Mode GELAP (warna sebagai teks/ikon) ──')
  for (const c of KANDIDAT_GELAP) {
    const baris = Object.entries(LATAR_GELAP)
      .map(([n, bg]) => `${n} ${kontras(c, bg).toFixed(2)} ${nilai(kontras(c, bg))}`)
      .join('  ·  ')
    console.log(`${c}  ${baris}`)
  }

  console.log('\n── Teks PUTIH di atas warna (untuk kartu bergradasi) ──')
  for (const c of [...KANDIDAT_TERANG, '#0050A0', '#2C7BD9']) {
    console.log(`putih di ${c}: ${kontras('#FFFFFF', c).toFixed(2)} ${nilai(kontras('#FFFFFF', c))}`)
  }
} else if (arg.length >= 2) {
  const r = kontras(arg[0], arg[1])
  console.log(`${arg[0]} vs ${arg[1]}: ${r.toFixed(2)}:1 — ${nilai(r)}`)
} else {
  console.log('Pakai: ukur-kontras.mjs "#hex" "#hex"   |   --set')
}
