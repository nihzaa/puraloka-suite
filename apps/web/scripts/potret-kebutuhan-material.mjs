/*
  Memotret KEBUTUHAN MATERIAL di halaman RAP — dua sudut pandang.

  ── Kenapa memotret

  Rutenya (`material-takeoff`) sudah terbukti benar lewat
  `uji-kebutuhan-material-hidup.mjs`. Yang BELUM terbukti: apakah ada orang
  yang bisa melihatnya. Rute yang benar di belakang layar yang tak pernah
  muncul persis sama tak bergunanya dengan rute yang salah — dan itu keadaan
  fitur ini selama ini (nol halaman memakainya).

  Pengelompokan "per jenis pekerjaan" dihitung DI PERAMBAN dari `details[]`,
  jadi justru bagian itu yang tak tersentuh uji rute sama sekali.

  Pakai: LAYAR_BASIS=http://localhost:3030 UJI_BASIS=http://127.0.0.1:3021 \
           node scripts/potret-kebutuhan-material.mjs
*/
import { chromium } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
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

const masuk = await fetch(`${API}/api/v1/auth/login`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: SANDI }),
})
if (!masuk.ok) { console.error(`login API gagal ${masuk.status} — UKUR portnya`); process.exit(1) }
const cookie = (masuk.headers.getSetCookie?.() ?? [])
  .map((c) => c.split(';')[0]).filter((c) => /^puraloka_(token|refresh)=/.test(c)).join('; ')
const H = { 'content-type': 'application/json', cookie }

let gagal = 0
const itemDibuat = []
let rapDibuat = null

const sini = dirname(fileURLToPath(import.meta.url))
const akar = resolve(sini, '..', '..', '..')
const sql = async (teks, params) => {
  const { buatClient } = await import(
    new URL('file://' + resolve(akar, 'scripts', 'db', '_koneksi.mjs').replace(/\\/g, '/')).href)
  const c = buatClient()
  await c.connect()
  const r = await c.query(teks, params)
  await c.end()
  return r
}

const cariAhsp = async (q) => {
  const r = await fetch(`${API}/api/v1/cecep/assemblies?limit=400&q=${encodeURIComponent(q)}`,
    { headers: { cookie } })
  return r.ok ? ((await r.json()).data ?? []) : []
}

try {
  /* Dua AHSP yang BERBAGI material — supaya sudut "per pekerjaan" punya isi. */
  const bata = (await cariAhsp('pasangan bata merah'))
    .find((a) => (a.components ?? []).some((c) => /bata merah/i.test(c.resource?.name ?? '')))
  const kodeA = new Set((bata?.components ?? []).map((c) => c.resource?.code).filter(Boolean))
  let kedua = null
  for (const q of ['plesteran', 'acian', 'beton']) {
    kedua = (await cariAhsp(q)).find((a) => a.id !== bata?.id
      && (a.components ?? []).some((c) => kodeA.has(c.resource?.code)))
    if (kedua) break
  }
  if (!bata || !kedua) { console.error('❌ AHSP uji tak ketemu'); process.exit(1) }

  /* Versi estimasi yang bisa ditulisi, dan proyeknya. */
  const lv = await fetch(`${API}/api/v1/estimate-versions?limit=50`, { headers: { cookie } })
  const versi = ((await lv.json()).data ?? []).find((v) => v.status !== 'approved')
  if (!versi?.id) { console.error('❌ tak ada versi estimasi'); process.exit(1) }

  const tambah = async (a, qty) => {
    const r = await fetch(`${API}/api/v1/estimate-versions/${versi.id}/items`, {
      method: 'POST', headers: H,
      body: JSON.stringify({
        item_type: 'assembly', assembly_id: a.id, quantity: qty,
        buk_fraction: 0.15, rounding: { mode: 'nearest', step: 1 },
        location: 'Kabupaten Bandung',
      }),
    })
    if (!r.ok) { console.error(`❌ tambah item gagal ${r.status}: ${(await r.text()).slice(0, 160)}`); return null }
    const id = ((await r.json()).item ?? {}).id
    if (id) itemDibuat.push(id)
    return id
  }
  if (!(await tambah(bata, 120)) || !(await tambah(kedua, 300))) {
    console.error('❌ item uji gagal — layar tak bisa dinilai')
    gagal++
    throw new Error('berhenti')
  }
  console.log('✓ 2 item RAB dibuat (120 m2 bata + 300 m2)')

  /* Proyek pemilik versi ini — untuk membuka halaman RAP-nya. */
  const pr = await sql(`
    SELECT p.id, p.name FROM public.estimate_versions ev
      JOIN public.scenarios s ON s.id = ev.scenario_id
      JOIN public.projects p ON p.id = s.project_id
     WHERE ev.id = $1`, [versi.id])
  const proyek = pr.rows[0]
  if (!proyek) { console.error('❌ proyek versi tak ketemu'); gagal++; throw new Error('berhenti') }

  /* RAP untuk versi itu — dibuat kalau belum ada. */
  const rapAda = await sql('SELECT id FROM public.rap_budget WHERE estimate_version_id = $1 LIMIT 1', [versi.id])
  if (!rapAda.rows.length) {
    /* POST-nya di bawah PROYEK, bukan /api/v1/rap — diukur dari rutenya. */
    const r = await fetch(`${API}/api/v1/projects/${proyek.id}/rap`, {
      method: 'POST', headers: H,
      body: JSON.stringify({ estimate_version_id: versi.id, name: 'RAP potret otomatis' }),
    })
    if (!r.ok) {
      console.error(`❌ buat RAP gagal ${r.status}: ${(await r.text()).slice(0, 200)}`)
      gagal++
      throw new Error('berhenti')
    }
    rapDibuat = ((await r.json()).data ?? {}).id ?? null
  }
  console.log(`✓ RAP siap untuk proyek ${proyek.name}`)

  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await ctx.newPage()
  await page.goto(`${BASIS}/login`, { waitUntil: 'networkidle' })
  await page.fill('input[type="email"]', EMAIL)
  await page.fill('input[type="password"]', SANDI)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30000 })

  await page.goto(`${BASIS}/estimasi/rap?proyek=${proyek.id}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)

  /*
    RAP-nya WAJIB DIPILIH dulu — halaman berhenti di "— Pilih RAP —" sampai
    ada yang dipilih, dan seluruh isinya (termasuk kebutuhan material) belum
    dirender sama sekali.

    Versi pertama skrip ini langsung memeriksa teks halaman dan melaporkan
    "bagian Kebutuhan material TAK muncul" — menuduh produknya, padahal
    skripnya yang belum menekan apa pun. Ketahuan dari MELIHAT tangkapan
    layarnya: yang terlihat cuma dua pemilih dan tombol "RAP Baru".
  */
  const pilihRap = page.locator('select').nth(1)
  const opsi = await pilihRap.locator('option').all()
  if (opsi.length < 2) {
    console.error('❌ tak ada RAP yang bisa dipilih di halaman ini')
    gagal++
    throw new Error('berhenti')
  }
  const nilai = await opsi[1].getAttribute('value')
  await pilihRap.selectOption(nilai)
  await page.waitForTimeout(3000)
  console.log('✓ RAP dipilih di layar')

  const teks1 = await page.locator('body').innerText()
  if (!/Kebutuhan material/i.test(teks1)) {
    console.error('❌ bagian "Kebutuhan material" TAK muncul di halaman RAP')
    console.error('   isi layar: ' + teks1.replace(/s+/g, ' ').slice(0, 300))
    await page.screenshot({ path: join(KELUAR, 'material-gagal.png'), fullPage: false })
    gagal++
  } else {
    console.log('✓ bagian kebutuhan material muncul')

    /* REKAP: material yang nyata, bukan tabel kosong. */
    if (/Belum ada material yang bisa dihitung/i.test(teks1)) {
      console.error('❌ tabel kosong padahal RAB-nya punya item ber-AHSP')
      gagal++
    } else if (!/Bata merah/i.test(teks1)) {
      console.error('❌ "Bata merah" tak muncul di rekap')
      gagal++
    } else console.log('✓ rekap memuat material nyata (Bata merah)')

    /*
      DESIMAL harus mengikuti satuannya.

      Cacat ini ditemukan dengan MELIHAT layarnya: bata tampil "16.800,000
      buah" — tiga desimal pada barang yang dihitung butiran. Tak ada 0,000
      buah bata, dan angka berdesimal pada satuan cacah membuat pembacanya
      ragu apakah itu 16.800 atau 16,8 ribu.
    */
    if (/16.800,000|,000s+buah/.test(teks1)) {
      console.error('❌ satuan CACAH (buah) tampil berdesimal — tak ada 0,000 buah bata')
      gagal++
    } else console.log('✓ desimal mengikuti satuannya')

    const judul = page.getByText(/Kebutuhan material/i).first()
    if (await judul.count()) { await judul.scrollIntoViewIfNeeded(); await page.waitForTimeout(600) }
    await page.screenshot({ path: join(KELUAR, 'material-rekap.png'), fullPage: false })

    /* PER PEKERJAAN — dihitung di peramban, jadi wajib diuji dari layar. */
    const tombol = page.getByRole('button', { name: /Per jenis pekerjaan/i }).first()
    if (!(await tombol.count())) {
      console.error('❌ tombol "Per jenis pekerjaan" tak ada')
      gagal++
    } else {
      await tombol.click()
      await page.waitForTimeout(1200)
      const teks2 = await page.locator('body').innerText()

      if (!/PEKERJAAN/i.test(teks2)) {
        console.error('❌ tabel per-pekerjaan tak muncul')
        gagal++
      } else console.log('✓ sudut per-pekerjaan muncul')

      /*
        Kolom DARI ("volume × koefisien") adalah yang menjawab "kenapa segini".
        Tanpa itu tabelnya cuma daftar angka tanpa asal.
      */
      if (!/\d+\s*×\s*[\d.,]+/.test(teks2)) {
        console.error('❌ kolom asal "volume × koefisien" tak terlihat')
        gagal++
      } else console.log('✓ asal angka (volume × koefisien) terlihat')

      const judul2 = page.getByText(/jenis pekerjaan —/i).first()
      if (await judul2.count()) { await judul2.scrollIntoViewIfNeeded(); await page.waitForTimeout(600) }
      await page.screenshot({ path: join(KELUAR, 'material-per-pekerjaan.png'), fullPage: false })
    }
  }

  await ctx.close()
  await browser.close()
} catch (e) {
  if (e.message !== 'berhenti') { console.error(`❌ ${e.message}`); gagal++ }
} finally {
  if (rapDibuat) {
    try {
      await sql('DELETE FROM public.rap_budget WHERE id = $1', [rapDibuat])
      console.log('  (RAP uji dibersihkan)')
    } catch (e) { console.error(`⚠ RAP uji ${rapDibuat} TAK terhapus: ${e.message}`); gagal++ }
  }
  if (itemDibuat.length) {
    try {
      const r = await sql('DELETE FROM public.estimate_items WHERE id = ANY($1::uuid[])', [itemDibuat])
      console.log(`  (${r.rowCount} item RAB uji dibersihkan)`)
      if (!r.rowCount) { console.error('❌ NOL item terhapus'); gagal++ }
    } catch (e) {
      console.error(`❌ GAGAL membersihkan item: ${e.message}`)
      console.error(`   SAPU MANUAL: ${itemDibuat.join(', ')}`)
      gagal++
    }
  }
}

console.log(`\ntangkapan layar → ${KELUAR}`)
if (gagal) { console.error(`\n❌ ${gagal} masalah\n`); process.exit(1) }
console.log('\n✅ Kebutuhan material tampil di RAP, dua sudut pandang, asal angka terlihat\n')
