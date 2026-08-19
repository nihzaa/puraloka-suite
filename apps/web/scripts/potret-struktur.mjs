/*
  Memotret PANEL DETAIL elemen struktur — layar tempat gambar kerja muncul.

  Bukan sekadar daftar elemennya: gambar hanya dimuat saat sebuah elemen
  DIBUKA (`?gambar=1`), jadi memotret daftarnya saja tak membuktikan apa pun
  tentang gambarnya.

  Empat cacat di sesi ini ditemukan dengan MELIHAT layar, bukan dari test:
  `satuan-beli.ts` yang tak pernah dipanggil, profil WF tertulis
  "Ulir (BjTS) D200", judul gambar berupa kunci mentah, dan klaim layar yang
  tak pernah ada.
*/
import { chromium } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const BASIS = process.env.LAYAR_BASIS ?? 'http://localhost:3010'
const API = process.env.UJI_BASIS ?? 'http://127.0.0.1:3017'

function env(k) {
  const isi = readFileSync('apps/web/.env.local', 'utf8')
  const m = isi.match(new RegExp(`^${k}=(.*)$`, 'm'))
  return m ? m[1].trim().replace(/^"|"$/g, '').replace(/\r$/, '') : undefined
}
const EMAIL = process.env.LAYAR_EMAIL ?? env('LAYAR_EMAIL')
const SANDI = process.env.LAYAR_SANDI ?? env('LAYAR_SANDI')
if (!EMAIL || !SANDI) { console.error('LAYAR_EMAIL/LAYAR_SANDI kosong'); process.exit(1) }

const KELUAR = join(process.cwd(), 'apps', 'web', '.layar')
mkdirSync(KELUAR, { recursive: true })

/* ── Siapkan elemen uji lewat API, supaya yang dipotret pasti ada ── */
const masuk = await fetch(`${API}/api/v1/auth/login`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: SANDI }),
})
const cookie = (masuk.headers.getSetCookie?.() ?? [])
  .map((c) => c.split(';')[0])
  .filter((c) => /^puraloka_(token|refresh)=/.test(c)).join('; ')
const H = { 'content-type': 'application/json', cookie }

const jp = await (await fetch(`${API}/api/v1/projects?limit=1`, { headers: H })).json()
const proyek = (jp.data ?? jp.projects ?? jp)[0]

const JALAN = (process.hrtime.bigint() % 100000n).toString(36)
const KASUS = [
  ['baja_balok', 'penampang profil baja', {
    profil: {
      designation: '200x100x5.5x8', profile_type: 'WF',
      hMm: 200, bMm: 100, t1Mm: 5.5, t2Mm: 8,
      beratKgPerM: 21.3, panjangStandarM: 12,
    },
    mutu: { fyMpa: 240, fuMpa: 370 }, bentangM: 6, jarakPengakuM: 2,
    muKnm: 60, vuKn: 50, bebanLayanKnPerM: 8,
  }],
  ['dinding_penahan', 'potongan + tekanan tanah', {
    tinggiM: 3, tebalAtasM: 0.25, tebalBawahM: 0.4,
    panjangTelapakM: 2.2, tebalTelapakM: 0.4, kakiM: 0.6,
    gammaTanahKnM3: 18, phiDerajat: 30, qaKnM2: 150,
    panjangDindingM: 12, selimutMm: 50, dUtamaMm: 13, jarakUtamaMm: 150,
    mutu: { fcMpa: 25, fyMpa: 400 },
    pgaG: 0.3,
  }],
  ['footplat', 'penurunan pondasi — batas BARU', {
    lxM: 2, lyM: 2, hM: 0.4, bxM: 0.4, byM: 0.4, pxM: 1, pyM: 1, zM: 1,
    gammaTanahKnM3: 17, letakKolom: 'tengah',
    mutu: { fcMpa: 25, fyMpa: 400, fyvMpa: 240 }, dAksenM: 0.08,
    dTulanganMm: 16, jarakTulanganMm: 150,
    pukKn: 600, muxKnm: 20, muyKnm: 20, qaKnM2: 200,
    jenisTanahPenurunan: 'lempung', nSptPenurunan: 8, jarakKolomM: 4,
  }],
  ['sambungan_kayu', 'pola sambungan — judul BARU', {
    alat: 'paku', diameterMm: 4.1, jumlahAlat: 14,
    tebalUtamaMm: 60, tebalSisiMm: 30, penetrasiMm: 45,
    kelas: 'II', durasi: 'tetap', kadarAir: 'kering', gayaKn: 6,
    jarakTepiSejajarMm: 70, jarakTepiTegakMm: 25, jarakAntarAlatMm: 65,
  }],
]

const dibuat = []
for (const [jenis, nama, input] of KASUS) {
  const r = await fetch(`${API}/api/v1/projects/${proyek.id}/struktur`, {
    method: 'POST', headers: H,
    body: JSON.stringify({
      kode: `POTRET-${JALAN}-${dibuat.length + 1}`, nama, jenis, jumlah: 1, input,
      catatan: 'potret-struktur.mjs — dihapus otomatis',
    }),
  })
  if (!r.ok) { console.error(`buat ${jenis} gagal ${r.status}: ${(await r.text()).slice(0,150)}`); continue }
  const jb = await r.json()
  dibuat.push([(jb.data ?? jb).id, jenis])
}
console.log(`${dibuat.length} elemen uji dibuat`)

/* ── Potret ── */
const browser = await chromium.launch()
try {
/*
  Mode GELAP ikut dipotret bila diminta (--gelap).

  Gambar teknik memakai garis gelap di atas kertas putih, dan halaman ini
  sengaja MEMAKU latar putih untuk galeri gambarnya (`--kertas-gambar`).
  Yang perlu diperiksa justru itu: apakah pemakuan itu benar-benar bekerja,
  atau garis hitamnya menghilang di atas latar gelap.
*/
const GELAP = process.argv.includes('--gelap')
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
  colorScheme: GELAP ? 'dark' : 'light',
})
const page = await ctx.newPage()

await page.goto(`${BASIS}/login`, { waitUntil: 'networkidle' })
await page.fill('input[type=email]', EMAIL)
await page.fill('input[type=password]', SANDI)
await page.click('button[type=submit]')
await page.waitForURL(/dashboard|beranda/, { timeout: 30000 }).catch(() => {})

/*
  Tema DITEKAN lewat tombol aplikasinya, bukan lewat `colorScheme` Playwright.

  Aplikasi ini menyimpan pilihan temanya sendiri (bukan mengikuti preferensi
  sistem), jadi `colorScheme: dark` menghasilkan halaman yang tetap TERANG —
  dan potretnya terlihat berhasil sambil tak menguji mode gelap sama sekali.
  Ini kesalahan yang sama bentuknya dengan tiga kesalahan potret sebelumnya:
  alat ukurnya yang salah, bukan yang diukur.
*/
if (GELAP) {
  const tombolTema = page.locator('[aria-label="Ganti ke mode gelap"]').first()
  if (await tombolTema.count()) {
    await tombolTema.click()
    await page.waitForTimeout(800)
  } else {
    console.error('  ⚠ tombol tema tak ditemukan — potret mungkin TETAP TERANG')
  }
}

await page.goto(`${BASIS}/estimasi/struktur?proyek=${proyek.id}`, { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)
await page.screenshot({ path: join(KELUAR, `struktur-daftar${GELAP ? '-gelap' : ''}.png`), fullPage: false })
console.log(`→ apps/web/.layar/struktur-daftar${GELAP ? '-gelap' : ''}.png`)

/*
  Tiap elemen dibuka lewat tombolnya SENDIRI, dikenali dari kode uniknya.

  Versi pertama memakai `.first()` untuk ketiganya, dan ketiga potretnya
  memperlihatkan elemen yang SAMA — potret yang terlihat berhasil sambil tak
  membuktikan apa pun tentang dua elemen lainnya. Ketahuan hanya karena
  potretnya dibuka dan dibaca.
*/
for (const [idx, [id, jenis]] of dibuat.entries()) {
  const kode = `POTRET-${JALAN}-${idx + 1}`
  const tombol = page.locator(`[aria-label*="${kode}"]`).first()
  if (!(await tombol.count())) {
    console.error(`  ⚠ tombol untuk ${kode} tak ditemukan — potret dilewati`)
    continue
  }
  await tombol.click()
  await page.waitForTimeout(2500)

  /*
    Panel WAJIB memperlihatkan elemen yang dimaksud sebelum dipotret. Potret
    yang memperlihatkan elemen LAIN tetap terlihat berhasil, dan itulah yang
    terjadi pada versi pertama skrip ini.
  */
  const judulPanel = await page.locator('h2').filter({ hasText: kode }).count()
  if (!judulPanel) {
    console.error(`  ⚠ panel tak memperlihatkan ${kode} — potret TIDAK sah`)
  }

  await page.screenshot({ path: join(KELUAR, `struktur-detail-${jenis}${GELAP ? "-gelap" : ""}.png`), fullPage: true })
  console.log(`→ apps/web/.layar/struktur-detail-${jenis}${GELAP ? "-gelap" : ""}.png  (${kode})`)

  /*
    ── GAMBAR KERJANYA dipotret TERPISAH.

    `fullPage: true` ternyata hanya memotret setinggi viewport pada halaman
    ini (panel detail memakai kontainer bergulir sendiri), jadi galeri
    gambar — yang letaknya paling bawah — tak pernah ikut terpotret. Potret
    yang tak memuat hal yang mau dibuktikan tetap terlihat berhasil.

    Dipotret dari elemen `<figure>`-nya langsung, jadi tak bergantung pada
    seberapa jauh halaman bisa digulir.
  */
  const figur = page.locator('figure')
  const nFigur = await figur.count()
  if (!nFigur) {
    console.error(`  ⚠ ${kode} tak punya satu pun <figure> — gambar TIDAK muncul di layar`)
  } else {
    await figur.first().scrollIntoViewIfNeeded()
    await page.waitForTimeout(400)
    await figur.first().screenshot({
      path: join(KELUAR, `struktur-gambar-${jenis}${GELAP ? "-gelap" : ""}.png`),
    })
    console.log(`→ apps/web/.layar/struktur-gambar-${jenis}${GELAP ? "-gelap" : ""}.png  (${nFigur} gambar)`)
  }
  const tutup = page.locator('[aria-label="Tutup detail"]').first()
  if (await tutup.count()) { await tutup.click(); await page.waitForTimeout(600) }
}

} finally {
  await browser.close()
  /*
    Pembersihan DI DALAM finally, bukan sesudah bloknya.

    Diukur: menaruh  SESUDAH try/finally tetap tak
    berjalan saat blok itu melempar — lemparan naik ke atas dan mematikan
    proses sebelum baris berikutnya sempat dijalankan. Empat elemen POTRET-*
    tertinggal di proyek SUNGGUHAN, dan rekap volume proyek ikut
    menghitungnya.

    Ini ketiga kalinya di sesi ini bersih-bersih ditaruh di jalur bahagia.
  */
  await bersihkan()
}

/*
  ══════════════════════════════════════════════════════════════════════════════
  Pembersihan dipanggil dari `finally`, bukan di sini saja.

  Diukur 2026-08-19: satu jalan gagal di tengah (web mati saat Playwright
  membuka /login), dan seluruh baris di bawah `browser.close()` tak pernah
  dijalankan. Empat elemen `POTRET-*` tertinggal di proyek SUNGGUHAN — dan
  proyek sungguhan itu yang dipakai founder.

  Elemen uji yang tertinggal bukan sekadar berantakan: rekap volume proyek
  ikut menghitungnya, dan angka yang salah di RAB adalah angka yang
  ditawarkan ke klien.

  Ini kedua kalinya di sesi ini — yang pertama `UJI-SAMB-*` dari penguji
  sambungan. Pola yang sama: bersih-bersih ditaruh di jalur bahagia.
  ══════════════════════════════════════════════════════════════════════════════
*/

async function bersihkan() {
  let gagal = 0
  for (const [id] of dibuat) {
    const r = await fetch(`${API}/api/v1/struktur/${id}`, {
      method: 'DELETE', headers: { cookie },
    }).catch(() => ({ ok: false, status: 0 }))
    if (!r.ok) { console.error(`  ⚠ elemen uji ${id} TAK terhapus (${r.status})`); gagal++ }
  }
  console.log(`${dibuat.length - gagal} elemen uji dihapus`
    + (gagal ? ` — ${gagal} TERTINGGAL, hapus manual` : ''))
}
