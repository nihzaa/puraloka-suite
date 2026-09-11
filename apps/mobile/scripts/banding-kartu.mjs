#!/usr/bin/env node
/**
 * BANDING KARTU DAFTAR — dua kandidat, dirender MESIN SUNGGUHAN.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA, DAN BEDANYA DENGAN `banding-dashboard.mjs`
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Founder 2026-09-12: *"harus terasa fluid dan mahal"*.
 *
 * `banding-dashboard.mjs` (2026-09-05) sudah menjawab pertanyaan yang mirip
 * dan **kandidat B-nya MENANG dan sudah terpasang** — `dashboard.tsx:331`
 * memakai `c.merekBidang`, dan potret dashboard hari ini memperlihatkan
 * bidang navy itu. (Keputusannya tak pernah masuk JOURNAL maupun
 * RATIFIKASI; yang basi dokumennya, bukan pekerjaannya.)
 *
 * Yang B selesaikan cuma KEPALA dashboard. Di bawah panel navy, dan di 18
 * layar lain yang tak punya panel sama sekali, bentuknya masih sama seperti
 * sebelum banding itu ada. Diukur 2026-09-12:
 *
 *     borderWidth di apps/mobile     : 66 pemakaian di 29 berkas
 *     berkas ber-`Animated`          : 1  (SplashMerek.tsx)
 *
 * Jadi yang dibandingkan di sini bukan kepala layar melainkan **kartu
 * daftar** — satuan yang menyusun hampir seluruh aplikasi.
 *
 * ── Kenapa merender ROUTE EXPO, bukan HTML seperti pendahulunya
 *
 * `banding-dashboard.mjs` merakit HTML dan memotretnya. Itu sah untuk
 * menilai tata letak, dan jauh lebih cepat.
 *
 * Ia TIDAK sah untuk yang dinilai kali ini. Tiga hal yang sedang
 * diputuskan cuma ada di mesin React Native:
 *
 *   `StyleSheet.hairlineWidth`  nilainya bergantung kerapatan piksel
 *                               perangkat; di HTML ia cuma angka karangan
 *   metrik Plus Jakarta Sans    tinggi baris & tabular-nums dihitung mesin
 *                               teks yang berbeda
 *   gerak driver native         HTML tak bisa memperlihatkan apakah
 *                               animasinya tersendat di daftar panjang
 *
 * Memutuskan "hairline sudah cukup terlihat?" dari garis 0,5px yang
 * digambar Chrome adalah memutuskan atas barang yang salah.
 *
 * ⚠ Karena itu skrip ini MENUNTUT Expo web hidup. Ia menolak jalan kalau
 * bundelnya gagal — halaman kosong yang terpotret tetap menghasilkan PNG,
 * dan PNG yang ada terbaca seperti bukti.
 *
 * ── Kenapa TIDAK menyentuh satu pun layar produk
 *
 * Rutenya di `app/_banding/` (awalan garis bawah = bukan rute produk).
 * Kalau usulnya ditolak: satu berkas dibuang, nol layar dipulihkan.
 *
 * ── Jalankan
 *
 *     cd apps/mobile && npx expo start --web --port 8081
 *     node apps/mobile/scripts/banding-kartu.mjs
 *     node apps/mobile/scripts/banding-kartu.mjs --gelap
 */
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = dirname(fileURLToPath(import.meta.url))
const AKAR = join(DIR, '..')
const KELUAR = join(AKAR, '.layar', 'banding-kartu')

const BASIS = process.env.UJI_BASIS ?? 'http://localhost:8081'
const GELAP = process.argv.includes('--gelap')

/** Lebar HP kecil — 375px adalah patokan yang dipakai potret matriks. */
const LEBAR = 390
const TINGGI = 844

/**
 * Kandidat yang dipotret.
 *
 * Keduanya hidup di SATU route dan ditukar lewat tombol, bukan dua route
 * terpisah. Alasannya bukan kemalasan: dua route berarti dua salinan data
 * contoh, dan salinan yang menyimpang membuat perbandingannya bohong tanpa
 * ada yang bisa menunjuk sebabnya.
 */
const KANDIDAT = [
  { kunci: 'A-sekarang', label: 'Sekarang' },
  { kunci: 'B-poles', label: 'Poles' },
  { kunci: 'C-poles-plus', label: 'Poles+' },
]

mkdirSync(KELUAR, { recursive: true })

const peramban = await chromium.launch()
const konteks = await peramban.newContext({
  viewport: { width: LEBAR, height: TINGGI },
  deviceScaleFactor: 2,
  colorScheme: GELAP ? 'dark' : 'light',
})
const hal = await konteks.newPage()

/*
  Galat konsol dikumpulkan, bukan diabaikan.

  Layar yang CRASH tetap menghasilkan potret — stack trace React adalah
  teks, dan teks lolos pemeriksaan "halamannya berisi sesuatu". Itu persis
  cacat yang tercatat di CLAUDE.md §8a.3, tempat empat layar dilaporkan
  "✅ semua layar terisi" padahal dua di antaranya crash.
*/
const galat = []
hal.on('console', (m) => {
  if (m.type() === 'error') galat.push(m.text())
})
hal.on('pageerror', (e) => galat.push(String(e)))

/*
  Perkenalan DILEWATI sebelum halaman dimuat.

  Tanpa ini `_layout.tsx` memantulkan SEMUA rute ke `/kenalan` — termasuk
  rute ini. Diukur 2026-09-12: halaman memulangkan 633 karakter berisi
  layar perkenalan, dengan NOL galat konsol. Tak ada yang rusak; rutenya
  memang tak pernah sempat dirender.

  Penandanya ditulis lewat `addInitScript` supaya sudah ada SEBELUM bundel
  berjalan. Menulisnya sesudah `goto` terlambat: pengalihannya sudah
  terjadi saat skrip kita mendapat giliran.
*/
await hal.addInitScript(() => {
  try {
    window.localStorage.setItem('puraloka_kenalan_selesai', '1')
  } catch {
    /* localStorage bisa ditolak; halamannya lalu jatuh ke perkenalan dan
       penjaga teks di bawah yang akan menggagalkan skrip ini. */
  }
})

const alamat = `${BASIS}/_banding/kartu`
await hal.goto(alamat, { waitUntil: 'networkidle', timeout: 120_000 })

/*
  Menunggu teks yang HANYA ADA kalau komponennya benar-benar merender.
  `networkidle` saja tak cukup: Metro menyajikan shell HTML lebih dulu, dan
  bundel yang gagal tetap meninggalkan halaman yang "selesai memuat".
*/
await hal.waitForSelector('text=Persetujuan', { timeout: 60_000 })

const hasil = []
for (const k of KANDIDAT) {
  /*
    `exact: true` WAJIB sejak kandidat ketiga ada: "Poles" cocok dengan
    "Poles" DAN "Poles+", dan Playwright menolak dengan galat yang menyebut
    strict mode — bukan menyebut bahwa namanya berawalan sama. Pencocokan
    longgar pada nama yang saling berawalan adalah cacat yang diam sampai
    kandidat ketiga muncul.
  */
  await hal
    .getByRole('button', { name: `Tampilkan versi ${k.label}`, exact: true })
    .click()

  /*
    Tunggu animasi masuk SELESAI sebelum memotret.

    260ms durasi + 6 × 45ms jeda bertahap = 530ms pada kartu terakhir.
    Dibulatkan ke 900ms supaya potretnya memperlihatkan keadaan AKHIR —
    kartu yang tertangkap di tengah transisi terbaca sebagai "pucat", dan
    itu akan dinilai sebagai kontras yang buruk, bukan sebagai gerak.
  */
  await hal.waitForTimeout(900)

  const berkas = join(KELUAR, `${k.kunci}${GELAP ? '-gelap' : ''}.png`)
  await hal.screenshot({ path: berkas })

  const tinggi = await hal.evaluate(() => document.body.scrollHeight)
  hasil.push({ ...k, tinggi, berkas })
}

await peramban.close()

if (galat.length) {
  console.error('══ GAGAL — halaman melempar galat ═══════════════════════')
  for (const g of galat.slice(0, 10)) console.error(`  ${g}`)
  console.error('')
  console.error('  Potret TIDAK sah. Perbaiki galatnya lebih dulu.')
  process.exit(1)
}

writeFileSync(
  join(KELUAR, 'CATATAN.md'),
  [
    `# Banding kartu daftar — ${GELAP ? 'mode GELAP' : 'mode TERANG'}`,
    '',
    'Dirender oleh mesin React Native (Expo web), bukan mockup HTML.',
    'Kode 19 layar produk TIDAK diubah.',
    '',
    '| Kandidat | Tinggi render |',
    '|---|---|',
    ...hasil.map((h) => `| ${h.kunci} | ${h.tinggi}px |`),
    '',
    '## Yang berbeda, dan alasan tiap satunya',
    '',
    '1. **Border 1px → hairline.** 66 border penuh membuat tiap kartu jadi',
    '   kotak bergaris berbobot sama; hierarki lalu terpaksa dititipkan ke',
    '   lencana kecil di pojok. Garis tetap ADA (dibaca di bawah matahari),',
    '   tapi berhenti bersaing dengan isinya.',
    '2. **Uang jadi subjek.** Nominal naik ke 24px + tabular-nums; jenisnya',
    '   turun jadi label kecil tanpa kotak. Tiga dari empat baris contoh',
    '   berbunyi "Kasbon" — memberinya kotak berwarna justru menonjolkan',
    '   hal yang paling TIDAK membedakan satu baris dari yang lain.',
    '3. **Umur jadi batang tepi, bukan pil kedua.** Dua pil berwarna',
    '   berdampingan sudah tercatat sebagai cacat (§8a.3). Batang 3px',
    '   membawa tingkat tanpa menambah objek.',
    '4. **Kartu MASUK bertahap** (45ms/kartu, maks 6). Menjawab "apa yang',
    '   baru termuat?" — bukan hiasan. Dimatikan penuh oleh',
    '   `useKurangiGerak()`.',
    '',
    '## Yang sengaja TIDAK dilakukan',
    '',
    '- **Bayangan per baris.** `audit-bayangan-mobile-bertoken.mjs` sudah',
    '  menjelaskan: tiap lapis bayangan satu alpha blending, dibayar tiap',
    '  baris tiap frame, dan daftar nyata 67 baris. Kedalaman datang dari',
    '  PERMUKAAN (`surfaceRaised`), bukan shadow.',
    '- **Warna aksen baru.** §10d mengikat: usul warna wajib menjawab dulu',
    '  "token ini mengendalikan berapa persen permukaan?". Usul ini tak',
    '  menambah satu warna pun — seluruhnya token yang sudah ada.',
    '- **Blur / glassmorphism.** Mahal di Android murah, hilang di bawah',
    '  matahari.',
    '',
  ].join('\n'),
)

console.log(`══ Banding kartu — ${GELAP ? 'GELAP' : 'TERANG'} ══════════════════════════`)
for (const h of hasil) console.log(`  ${h.kunci.padEnd(14)} ${h.tinggi}px`)
console.log('')
console.log(`  nol galat konsol · keluar di ${KELUAR}`)
