/*
  Memotret PANEL RIWAYAT — sesudah elemennya benar-benar diubah dua kali.

  ── Kenapa memotret, padahal rutenya sudah diuji hidup

  `uji-riwayat-hidup.mjs` membuktikan revisi tercatat dan bisa dibaca lewat
  rute. Ia TIDAK membuktikan ada orang yang bisa MELIHATNYA. Panel yang tak
  pernah muncul, atau yang muncul tapi menampilkan "tidak ada medan yang
  berbeda" untuk perubahan yang jelas ada, tetap membuat fiturnya tak berguna.

  Selisih antar-revisi dihitung DI LAYAR, bukan di server — jadi justru bagian
  itu yang tak tersentuh uji rute sama sekali.

  Pakai: LAYAR_BASIS=http://localhost:3030 UJI_BASIS=http://127.0.0.1:3021 \
           node scripts/potret-riwayat.mjs
*/
import { chromium } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const BASIS = process.env.LAYAR_BASIS ?? 'http://localhost:3030'
const API = process.env.UJI_BASIS ?? 'http://127.0.0.1:3021'

function env(k) {
  const isi = readFileSync('.env.local', 'utf8')
  const m = isi.match(new RegExp(`^${k}=(.*)$`, 'm'))
  return m ? m[1].trim().replace(/^"|"$/g, '').replace(/\r$/, '') : undefined
}
const EMAIL = process.env.LAYAR_EMAIL ?? env('LAYAR_EMAIL')
const SANDI = process.env.LAYAR_SANDI ?? env('LAYAR_SANDI')
if (!EMAIL || !SANDI) { console.error('LAYAR_EMAIL/LAYAR_SANDI kosong'); process.exit(1) }

const KELUAR = join(process.cwd(), '.layar')
mkdirSync(KELUAR, { recursive: true })

/* Contoh input dibaca dari UI — jangan tulis ulang, lihat potret-lembar.mjs. */
const HAL = join(process.cwd(), 'app', '(dashboard)', 'estimasi', 'struktur', 'page.tsx')
const isiHal = readFileSync(HAL, 'utf8')
const iAwal = isiHal.indexOf('const CONTOH')
const iKurung = isiHal.indexOf('{', iAwal)
let dalam = 0
let iAkhir = -1
for (let k = iKurung; k < isiHal.length; k++) {
  if (isiHal[k] === '{') dalam++
  else if (isiHal[k] === '}') { dalam--; if (dalam === 0) { iAkhir = k; break } }
}
const badan = isiHal.slice(iKurung, iAkhir + 1)
const tanpaStr = badan.replace(/"[^"]*"|'[^']*'|`[^`]*`/g, '""')
const konst = []
for (const nama of new Set([...tanpaStr.matchAll(/\b([A-Z][A-Z0-9_]{2,})\b/g)].map((m) => m[1]))) {
  const m = isiHal.match(new RegExp(`^const ${nama} = ([\\s\\S]*?);$`, 'm'))
  if (m) konst.push(`const ${nama} = ${m[1]};`)
}
// eslint-disable-next-line no-new-func
const CONTOH = new Function(konst.join('\n') + '\nreturn (' + badan + ')')()

const masuk = await fetch(`${API}/api/v1/auth/login`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: SANDI }),
})
if (!masuk.ok) { console.error(`login API gagal ${masuk.status} — UKUR portnya`); process.exit(1) }
const cookie = (masuk.headers.getSetCookie?.() ?? [])
  .map((c) => c.split(';')[0]).filter((c) => /^puraloka_(token|refresh)=/.test(c)).join('; ')
const H = { 'content-type': 'application/json', cookie }

const jp = await (await fetch(`${API}/api/v1/projects?limit=1`, { headers: H })).json()
const proyek = (jp.data ?? jp.projects ?? jp)[0]
if (!proyek?.id) { console.error('tak ada proyek'); process.exit(1) }

const JALAN = (process.hrtime.bigint() % 100000n).toString(36)
const KODE = `POTRIW-${JALAN}`
const dibuat = []
let gagal = 0

try {
  const awal = structuredClone(CONTOH.balok)
  const buat = await fetch(`${API}/api/v1/projects/${proyek.id}/struktur`, {
    method: 'POST', headers: H,
    body: JSON.stringify({
      kode: KODE, nama: 'potret riwayat', jenis: 'balok', jumlah: 1, input: awal,
      catatan: 'potret-riwayat.mjs — dihapus otomatis',
    }),
  })
  if (!buat.ok) { console.error(`BUAT gagal ${buat.status}: ${(await buat.text()).slice(0, 200)}`); process.exit(1) }
  const jb = await buat.json()
  const id = (jb.data ?? jb)?.id
  if (!id) { console.error('balasan BUAT tak memuat id'); process.exit(1) }
  dibuat.push(id)

  /* DUA perubahan, supaya panelnya punya isi yang bermakna. */
  await fetch(`${API}/api/v1/struktur/${id}`, {
    method: 'PATCH', headers: H,
    body: JSON.stringify({ input: { ...awal, hMm: Number(awal.hMm) + 40 }, catatan: 'ditinggikan agar lolos geser' }),
  })
  await fetch(`${API}/api/v1/struktur/${id}`, {
    method: 'PATCH', headers: H,
    body: JSON.stringify({ input: { ...awal, hMm: Number(awal.hMm) + 40, mutu: { ...awal.mutu, fcMpa: 30 } } }),
  })
  console.log(`✓ ${KODE} dibuat + 2 revisi`)

  const browser = await chromium.launch()
  for (const mode of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: mode })
    const page = await ctx.newPage()
    await page.goto(`${BASIS}/login`, { waitUntil: 'networkidle' })
    await page.fill('input[type="email"]', EMAIL)
    await page.fill('input[type="password"]', SANDI)
    await page.click('button[type="submit"]')
    await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30000 })

    /* `proyek`, BUKAN `project` — halaman membaca params.get("proyek"). */
    await page.goto(`${BASIS}/estimasi/struktur?proyek=${proyek.id}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(2000)

    /* Buka detail elemen uji — panel riwayat hanya ada di dalamnya. */
    const baris = page.locator('tr', { hasText: KODE }).first()
    const tombolLihat = baris.getByRole('button').first()
    await tombolLihat.click()
    await page.waitForTimeout(2500)

    const teks = await page.locator('body').innerText()
    if (!/Riwayat revisi/i.test(teks)) {
      console.error(`❌ [${mode}] bagian "Riwayat revisi" TAK muncul di panel detail`)
      gagal++
    } else {
      console.log(`✓ [${mode}] panel riwayat muncul`)

      /*
        Panel yang muncul tapi melaporkan "tidak ada medan yang berbeda"
        untuk perubahan yang JELAS ada adalah kegagalan yang lebih halus —
        dan lebih menyesatkan — daripada panel yang tak muncul.
      */
      if (/tidak ada medan yang berbeda/i.test(teks)) {
        console.error(`❌ [${mode}] selisih revisi kosong padahal hMm & fcMpa berubah`)
        gagal++
      }

      /*
        KEDUA medan wajib disebut, masing-masing di revisinya sendiri.

        Versi pertama menerima /hMm|fcMpa/ di SELURUH halaman — dan lolos
        walau revisi mutu beton menampilkan "mutu: [object Object] ->
        [object Object]", karena `hMm` memang ada di revisi yang LAIN.
        Cacatnya baru ketahuan dari melihat tangkapan layarnya.
      */
      for (const medan of ["hMm", "fcMpa"]) {
        if (!teks.includes(medan)) {
          console.error(`❌ [${mode}] selisih tak menyebut "${medan}"`)
          gagal++
        } else console.log(`✓ [${mode}] selisih menyebut ${medan}`)
      }

      /*
        Dan tak boleh ada objek yang tercetak mentah. `[object Object]` di
        layar riwayat berarti "sesuatu berubah, tapi kami tak tahu apa" —
        yang justru pertanyaan yang membuat orang membukanya.
      */
      if (/\[object Object\]/.test(teks)) {
        console.error(`❌ [${mode}] ada "[object Object]" di layar — selisih tak diratakan sampai daun`)
        gagal++
      } else console.log(`✓ [${mode}] tak ada objek tercetak mentah`)
    }
    /*
      Digulir ke bagian riwayatnya. `fullPage` tak menolong di sini: panel
      detail panjang, dan bagian riwayat ada di ekornya — tangkapan setinggi
      viewport hanya memperlihatkan kepala panel.
    */
    const judulRiwayat = page.getByText(/Riwayat revisi/i).first()
    if (await judulRiwayat.count()) {
      await judulRiwayat.scrollIntoViewIfNeeded()
      await page.waitForTimeout(700)
    }
    await page.screenshot({ path: join(KELUAR, `riwayat-${mode}.png`), fullPage: false })
    await ctx.close()
  }
  await browser.close()
} finally {
  for (const id of dibuat) {
    const d = await fetch(`${API}/api/v1/struktur/${id}`, { method: 'DELETE', headers: { cookie } })
    if (!d.ok) { console.error(`⚠ elemen uji ${id} TAK terhapus (${d.status})`); gagal++ }
  }
  const sisa = await fetch(`${API}/api/v1/projects/${proyek.id}/struktur`, { headers: { cookie } })
  if (sisa.ok) {
    for (const y of ((await sisa.json()).data ?? []).filter((x) => x.kode === KODE)) {
      const d = await fetch(`${API}/api/v1/struktur/${y.id}`, { method: 'DELETE', headers: { cookie } })
      console.error(`⚠ baris yatim ${y.kode} disapu (${d.ok ? 'terhapus' : 'GAGAL'})`)
    }
  }
}

console.log(`\ntangkapan layar → ${KELUAR}`)
if (gagal) { console.error(`\n❌ ${gagal} masalah\n`); process.exit(1) }
console.log('\n✅ Panel riwayat tampil dan memperlihatkan medan yang berubah\n')
