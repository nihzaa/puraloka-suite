/*
  Memotret TOMBOL LEMBAR PERHITUNGAN — dan MENEKANNYA sampai berkasnya turun.

  ── Kenapa memotret, padahal rutenya sudah diuji hidup

  `uji-lembar-hidup.mjs` membuktikan rutenya memulangkan PDF yang benar. Ia
  TIDAK membuktikan bahwa ada orang yang bisa memintanya: rute sempurna di
  belakang tombol yang tak pernah muncul tetap tak berguna.

  Sesi ini sudah membayar pelajaran itu beberapa kali — `Infinity%` yang
  hanya terlihat dari tangkapan layar, dan tiga cacat lain yang test tak
  pernah sentuh.

  ── Kenapa tombolnya DITEKAN, bukan hanya dilihat

  Tombol yang tampil bukan tombol yang bekerja. Kegagalan paling mungkin di
  sini justru senyap: `<a href>` biasa mengunduh HALAMAN LOGIN berformat HTML
  dengan nama `*.pdf`, dan tak ada galat yang muncul di layar mana pun.
  Karena itu yang diperiksa adalah BERKAS yang benar-benar turun — magic
  `%PDF-` dan ukurannya.

  Pakai: LAYAR_BASIS=http://localhost:3030 UJI_BASIS=http://127.0.0.1:3021 \
           node scripts/potret-lembar.mjs
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

/* ── Siapkan elemen uji lewat API ────────────────────────────────────────── */
const masuk = await fetch(`${API}/api/v1/auth/login`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: SANDI }),
})
if (!masuk.ok) { console.error(`login API gagal ${masuk.status} — UKUR portnya`); process.exit(1) }
const cookie = (masuk.headers.getSetCookie?.() ?? [])
  .map((c) => c.split(';')[0])
  .filter((c) => /^puraloka_(token|refresh)=/.test(c)).join('; ')
const H = { 'content-type': 'application/json', cookie }

const jp = await (await fetch(`${API}/api/v1/projects?limit=1`, { headers: H })).json()
const proyek = (jp.data ?? jp.projects ?? jp)[0]
if (!proyek?.id) { console.error('tak ada proyek'); process.exit(1) }

const JALAN = (process.hrtime.bigint() % 100000n).toString(36)
/*
  Contoh input DIBACA dari halaman UI, tidak ditulis ulang di sini.

  Versi pertama skrip ini menulis sendiri input baloknya dan langsung ditolak
  rute: `jarak sengkang harus angka > 0 (diterima: undefined)`. Itu bukan
  kebetulan — daftar contoh yang disalin selalu menyimpang dari yang dipakai
  UI, dan yang menyimpang tak ketahuan sampai ada yang menjalankannya.

  Sumbernya sama dengan yang ditekan pengguna lewat tombol "isi contoh".
*/
const HAL = join(process.cwd(), 'app', '(dashboard)', 'estimasi', 'struktur', 'page.tsx')
const isiHal = readFileSync(HAL, 'utf8')
const iAwal = isiHal.indexOf('const CONTOH')
if (iAwal < 0) { console.error('CONTOH tak ditemukan di halaman UI'); process.exit(1) }
const iKurung = isiHal.indexOf('{', iAwal)
let kedalaman = 0
let iAkhir = -1
for (let k = iKurung; k < isiHal.length; k++) {
  if (isiHal[k] === '{') kedalaman++
  else if (isiHal[k] === '}') { kedalaman--; if (kedalaman === 0) { iAkhir = k; break } }
}
if (iAkhir < 0) { console.error('badan CONTOH tak tertutup'); process.exit(1) }
const badanContoh = isiHal.slice(iKurung, iAkhir + 1)
const tanpaString = badanContoh.replace(/"[^"]*"|'[^']*'|`[^`]*`/g, '""')
const konstanta = []
for (const nama of new Set([...tanpaString.matchAll(/\b([A-Z][A-Z0-9_]{2,})\b/g)].map((m) => m[1]))) {
  const m = isiHal.match(new RegExp(`^const ${nama} = ([\\s\\S]*?);$`, 'm'))
  if (m) konstanta.push(`const ${nama} = ${m[1]};`)
}
let CONTOH
try {
  // `new Function` disengaja: berkas ini MEMBACA contoh data dari sumber
  // TypeScript lalu mengevaluasinya, supaya potret selalu memakai contoh
  // yang sama dengan yang dipakai kode — bukan salinan yang bisa menyimpang.
  //
  // Direktif `eslint-disable no-new-func` yang dulu di sini DIBUANG: aturan
  // itu tak pernah dikonfigurasi di repo ini, jadi direktifnya menonaktifkan
  // sesuatu yang tak ada — dan ESLint melaporkannya sebagai warning sendiri.
  CONTOH = new Function(konstanta.join(String.fromCharCode(10)) + String.fromCharCode(10)
    + 'return (' + badanContoh + ')')()
} catch (e) { console.error(`tak bisa mengurai CONTOH: ${e.message}`); process.exit(1) }
const CONTOH_BALOK = CONTOH.balok
if (!CONTOH_BALOK) { console.error('CONTOH.balok tak ada di halaman UI'); process.exit(1) }

const dibuat = []
let gagal = 0

try {
  const buat = await fetch(`${API}/api/v1/projects/${proyek.id}/struktur`, {
    method: 'POST', headers: H,
    body: JSON.stringify({
      kode: `POTRET-${JALAN}`, nama: 'potret lembar', jenis: 'balok',
      jumlah: 1, input: CONTOH_BALOK, catatan: 'potret-lembar.mjs — dihapus otomatis',
    }),
  })
  if (!buat.ok) { console.error(`BUAT gagal ${buat.status}: ${(await buat.text()).slice(0, 200)}`); process.exit(1) }
  const jb = await buat.json()
  const id = (jb.data ?? jb)?.id
  if (id) dibuat.push(id)
  console.log(`✓ elemen uji POTRET-${JALAN} dibuat`)

  const browser = await chromium.launch()

  for (const mode of ['light', 'dark']) {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      colorScheme: mode,
      acceptDownloads: true,
    })
    const page = await ctx.newPage()

    await page.goto(`${BASIS}/login`, { waitUntil: 'networkidle' })
    await page.fill('input[type="email"]', EMAIL)
    await page.fill('input[type="password"]', SANDI)
    await page.click('button[type="submit"]')
    await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30000 })

    /* `proyek`, BUKAN `project` — halaman membaca params.get("proyek").
       Salah nama membuat pemilih proyek tetap kosong, toolbar tak pernah
       muncul, dan tombolnya dilaporkan "tak terlihat" oleh sebab yang keliru. */
    await page.goto(`${BASIS}/estimasi/struktur?proyek=${proyek.id}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(2500)

    /*
      Tombolnya dicari lewat TEKS yang dilihat pengguna, bukan lewat
      selector internal. Selector bisa cocok pada elemen yang tak terlihat;
      teks yang terbaca adalah yang benar-benar dihadapi orang.
    */
    const tombol = page.getByRole('button', { name: /Lembar perhitungan|PDF/i }).first()
    const tampak = await tombol.isVisible().catch(() => false)
    if (!tampak) {
      console.error(`❌ [${mode}] Tombol lembar perhitungan TAK TERLIHAT`)
      console.error('   Rute yang sempurna di belakang tombol yang tak muncul tetap tak berguna.')
      gagal++
    } else {
      console.log(`✓ [${mode}] tombol terlihat`)
    }

    await page.screenshot({ path: join(KELUAR, `lembar-tombol-${mode}.png`), fullPage: false })

    /* ── TEKAN, dan periksa berkas yang turun ── */
    if (tampak && mode === 'light') {
      try {
        const [unduh] = await Promise.all([
          page.waitForEvent('download', { timeout: 45000 }),
          tombol.click(),
        ])
        const tujuan = join(KELUAR, 'lembar-dari-tombol.pdf')
        await unduh.saveAs(tujuan)
        const buf = readFileSync(tujuan)
        const magic = buf.subarray(0, 5).toString('latin1')
        console.log(`  berkas turun: ${unduh.suggestedFilename()} · ${buf.length} bytes · magic "${magic}"`)
        if (magic !== '%PDF-') {
          console.error('❌ Yang terunduh BUKAN PDF — kemungkinan halaman login berformat HTML.')
          gagal++
        } else if (buf.length < 5000) {
          console.error(`❌ PDF hanya ${buf.length} bytes — terlalu kecil untuk sebuah lembar.`)
          gagal++
        } else {
          console.log('✓ berkas yang turun adalah PDF yang berisi')
        }
      } catch (e) {
        console.error(`❌ Menekan tombol tak menghasilkan unduhan: ${e.message}`)
        gagal++
      }
      await page.waitForTimeout(1200)
      await page.screenshot({ path: join(KELUAR, 'lembar-sesudah-klik.png'), fullPage: false })
    }

    await ctx.close()
  }

  await browser.close()
} finally {
  /* Pembersihan di finally — baris uji tak boleh tertinggal di proyek sungguhan. */
  for (const id of dibuat) {
    const d = await fetch(`${API}/api/v1/struktur/${id}`, { method: 'DELETE', headers: { cookie } })
    if (!d.ok) { console.error(`⚠ elemen uji ${id} TAK terhapus (${d.status})`); gagal++ }
  }
  const sisa = await fetch(`${API}/api/v1/projects/${proyek.id}/struktur`, { headers: { cookie } })
  if (sisa.ok) {
    for (const y of ((await sisa.json()).data ?? []).filter((x) => x.kode === `POTRET-${JALAN}`)) {
      const d = await fetch(`${API}/api/v1/struktur/${y.id}`, { method: 'DELETE', headers: { cookie } })
      console.error(`⚠ baris yatim ${y.kode} disapu (${d.ok ? 'terhapus' : 'GAGAL'})`)
    }
  }
}

console.log(`\ntangkapan layar → ${KELUAR}`)
if (gagal) { console.error(`\n❌ ${gagal} masalah\n`); process.exit(1) }
console.log('\n✅ Tombol lembar perhitungan tampil DAN menurunkan PDF\n')
