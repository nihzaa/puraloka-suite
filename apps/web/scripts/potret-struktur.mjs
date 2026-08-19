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
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } })
const page = await ctx.newPage()

await page.goto(`${BASIS}/login`, { waitUntil: 'networkidle' })
await page.fill('input[type=email]', EMAIL)
await page.fill('input[type=password]', SANDI)
await page.click('button[type=submit]')
await page.waitForURL(/dashboard|beranda/, { timeout: 30000 }).catch(() => {})

await page.goto(`${BASIS}/estimasi/struktur?proyek=${proyek.id}`, { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)
await page.screenshot({ path: join(KELUAR, 'struktur-daftar.png'), fullPage: false })
console.log('→ apps/web/.layar/struktur-daftar.png')

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

  await page.screenshot({ path: join(KELUAR, `struktur-detail-${jenis}.png`), fullPage: true })
  console.log(`→ apps/web/.layar/struktur-detail-${jenis}.png  (${kode})`)

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
      path: join(KELUAR, `struktur-gambar-${jenis}.png`),
    })
    console.log(`→ apps/web/.layar/struktur-gambar-${jenis}.png  (${nFigur} gambar)`)
  }
  const tutup = page.locator('[aria-label="Tutup detail"]').first()
  if (await tutup.count()) { await tutup.click(); await page.waitForTimeout(600) }
}

await browser.close()

/* ── Bersihkan ── */
for (const [id] of dibuat) {
  await fetch(`${API}/api/v1/struktur/${id}`, { method: 'DELETE', headers: { cookie } })
}
console.log(`${dibuat.length} elemen uji dihapus`)
