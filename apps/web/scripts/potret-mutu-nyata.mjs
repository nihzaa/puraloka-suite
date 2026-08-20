/*
  Memotret PANEL MUTU NYATA — dan membuktikan ia DIAM saat tak ada temuan.

  ── Kenapa "diam" itu ikut diuji

  Panel yang selalu tampil dengan "semua aman" melatih orang mengabaikannya,
  dan yang terlatih mengabaikan tak akan membaca saat akhirnya ada temuan.
  Jadi dua-duanya harus terbukti: muncul saat perlu, DIAM saat tidak.

  Yang kedua tak mungkin diuji lewat rute saja — keputusan tampil/tidak
  diambil DI PERAMBAN.

  Pakai: LAYAR_BASIS=http://localhost:3030 UJI_BASIS=http://127.0.0.1:3021 \
           node scripts/potret-mutu-nyata.mjs
*/
import { chromium } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

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
const KODE = `POTMTU-${JALAN}`
const NOMOR_UJI = `POT-MUTU-${JALAN}`
const dibuat = []
let gagal = 0

/* Pembersihan uji_material lewat SQL — rutenya tak punya DELETE. */
const sini = dirname(fileURLToPath(import.meta.url))
const akarRepo = resolve(sini, '..', '..', '..')
const bersihkanUji = async () => {
  try {
    const { buatClient } = await import(
      new URL('file://' + resolve(akarRepo, 'scripts', 'db', '_koneksi.mjs').replace(/\\/g, '/')).href)
    const c = buatClient()
    await c.connect()
    const r = await c.query('DELETE FROM public.uji_material WHERE nomor LIKE $1', [`${NOMOR_UJI}%`])
    await c.end()
    return r.rowCount
  } catch (e) {
    console.error(`❌ GAGAL membersihkan uji_material: ${e.message}`)
    console.error(`   SAPU MANUAL: nomor LIKE ${NOMOR_UJI}%`)
    gagal++
    return -1
  }
}

const buka = async (page) => {
  await page.goto(`${BASIS}/estimasi/struktur?proyek=${proyek.id}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)
  return page.locator('body').innerText()
}

try {
  /* Selimut 60 supaya baloknya LOLOS di desain — elemen yang sudah gagal
     tak bisa "berubah jadi tidak aman". */
  const awal = { ...structuredClone(CONTOH.balok), selimutMm: 60 }
  const buat = await fetch(`${API}/api/v1/projects/${proyek.id}/struktur`, {
    method: 'POST', headers: H,
    body: JSON.stringify({
      kode: KODE, nama: 'potret mutu', jenis: 'balok', jumlah: 1, input: awal,
      catatan: 'potret-mutu-nyata.mjs — dihapus otomatis',
    }),
  })
  if (!buat.ok) { console.error(`BUAT gagal ${buat.status}`); process.exit(1) }
  const jb = await buat.json()
  const id = (jb.data ?? jb)?.id
  if (!id) { console.error('balasan BUAT tak memuat id'); process.exit(1) }
  dibuat.push(id)
  console.log(`✓ ${KODE} dibuat (lolos di desain)`)

  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await ctx.newPage()
  await page.goto(`${BASIS}/login`, { waitUntil: 'networkidle' })
  await page.fill('input[type="email"]', EMAIL)
  await page.fill('input[type="password"]', SANDI)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30000 })

  // ── (A) TANPA uji: panel WAJIB DIAM ──────────────────────────────────────
  const teksSepi = await buka(page)
  if (/TIDAK lagi memenuhi syarat|Mutu beton terpasang di bawah/i.test(teksSepi)) {
    console.error('❌ panel mutu TAMPIL padahal belum ada uji beton')
    console.error('   Panel yang selalu tampil melatih orang mengabaikannya.')
    gagal++
  } else console.log('✓ tanpa uji: panel DIAM')

  // ── (B) Dengan uji yang jeblok parah: panel WAJIB TAMPIL ─────────────────
  const buatUji = await fetch(`${API}/api/v1/projects/${proyek.id}/uji-material`, {
    method: 'POST', headers: H,
    body: JSON.stringify({
      nomor: NOMOR_UJI, objek: `Beton potret ${JALAN}`,
      jenis_uji: 'Kuat tekan 28 hari', tanggal_uji: '2026-08-20',
      nilai_hasil: 40, nilai_syarat: 250, satuan: 'kg/cm2',
      kesimpulan: 'tidak_memenuhi', catatan: 'potret-mutu-nyata.mjs — dihapus otomatis',
    }),
  })
  if (!buatUji.ok) {
    console.error(`❌ BUAT uji gagal ${buatUji.status}: ${(await buatUji.text()).slice(0, 200)}`)
    gagal++
  } else {
    console.log('✓ uji beton 40 kg/cm² (parah) dicatat')
    const teks = await buka(page)

    if (!/TIDAK lagi memenuhi syarat/i.test(teks)) {
      console.error('❌ panel temuan TAK TAMPIL padahal ada elemen yang berubah')
      gagal++
    } else console.log('✓ panel temuan TAMPIL')

    if (!teks.includes(KODE)) {
      console.error(`❌ ${KODE} tak disebut di panel — temuan tanpa alamat`)
      gagal++
    } else console.log(`✓ ${KODE} disebut di panel`)

    /*
      Kalimat penutup yang menegaskan desain TIDAK diubah wajib ada: tanpa itu
      pembacanya bisa mengira sistem sudah "memperbaiki" angkanya sendiri.
    */
    if (!/TIDAK diubah oleh hasil uji/i.test(teks)) {
      console.error('❌ panel tak menyatakan bahwa angka desain tak diubah')
      gagal++
    } else console.log('✓ panel menyatakan desain tak diubah')

    const judul = page.getByText(/TIDAK lagi memenuhi syarat/i).first()
    if (await judul.count()) { await judul.scrollIntoViewIfNeeded(); await page.waitForTimeout(600) }
    await page.screenshot({ path: join(KELUAR, 'mutu-nyata.png'), fullPage: false })
  }

  await ctx.close()
  await browser.close()
} finally {
  const n = await bersihkanUji()
  if (n === 0) { console.error('❌ NOL baris uji terhapus — padahal skrip ini membuatnya'); gagal++ }
  else if (n > 0) console.log(`  (${n} baris uji material dibersihkan)`)

  for (const id of dibuat) {
    const d = await fetch(`${API}/api/v1/struktur/${id}`, { method: 'DELETE', headers: { cookie } })
    if (!d.ok) { console.error(`⚠ elemen uji ${id} TAK terhapus (${d.status})`); gagal++ }
  }
  const sisa = await fetch(`${API}/api/v1/projects/${proyek.id}/struktur`, { headers: { cookie } })
  if (sisa.ok) {
    for (const y of ((await sisa.json()).data ?? []).filter((x) => x.kode === KODE)) {
      const d = await fetch(`${API}/api/v1/struktur/${y.id}`, { method: 'DELETE', headers: { cookie } })
      console.error(`⚠ baris yatim ${y.kode} disapu (${d.ok ? 'terhapus' : 'GAGAL'})`)
      if (!d.ok) gagal++
    }
  }
}

console.log(`\ntangkapan layar → ${KELUAR}`)
if (gagal) { console.error(`\n❌ ${gagal} masalah\n`); process.exit(1) }
console.log('\n✅ Panel mutu nyata: tampil saat ada temuan, DIAM saat tidak\n')
