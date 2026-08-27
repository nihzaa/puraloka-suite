/*
  Memotret ISIAN BEBAN — dan MEMAKAINYA dari layar sampai diagramnya terbit.

  ── Kenapa memotret

  Rutenya sudah terbukti (`uji-beban-balok-hidup.mjs`): momen dihitung benar,
  diagramnya terbit, katalognya memuat angka SNI. Yang BELUM terbukti: apakah
  ada orang yang bisa memakainya.

  Dan bagian yang paling mudah rusak justru ada di layar: pemetaan pilihan ke
  `input`, pembuangan medan kosong, dan syarat "hanya balok/sloof". Ketiganya
  tak tersentuh uji rute sama sekali.

  ── Yang diperiksa

    1. isian beban MUNCUL untuk balok
    2. TIDAK muncul untuk kolom — beban kolom aksial, bentuk hitungan berbeda,
       dan menampilkannya berarti menjanjikan sesuatu yang tak dihitung
    3. memilih fungsi ruang menampilkan angka SNI-nya di layar
    4. elemen yang disimpan dengan pilihan beban MENERBITKAN diagram

  Pakai: LAYAR_BASIS=http://localhost:3030 UJI_BASIS=http://127.0.0.1:3021 \
           node scripts/potret-isian-beban.mjs
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
const KODE = `POTBBN-${JALAN}`
const dibuat = []
let gagal = 0

try {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await ctx.newPage()
  await page.goto(`${BASIS}/login`, { waitUntil: 'networkidle' })
  await page.fill('input[type="email"]', EMAIL)
  await page.fill('input[type="password"]', SANDI)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30000 })

  await page.goto(`${BASIS}/estimasi/struktur?proyek=${proyek.id}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)

  await page.getByRole('button', { name: 'Tambah elemen', exact: true }).first().click()
  await page.waitForTimeout(1500)

  // ── (1) Muncul untuk BALOK ───────────────────────────────────────────────
  const pemilihFungsi = page.locator('#beban-fungsi')
  if (!(await pemilihFungsi.count())) {
    console.error('❌ isian beban TAK MUNCUL untuk balok')
    gagal++
    throw new Error('berhenti')
  }
  console.log('✓ isian beban muncul untuk balok')

  const opsi = await pemilihFungsi.locator('option').allInnerTexts()
  if (opsi.length < 10) {
    console.error(`❌ hanya ${opsi.length} pilihan fungsi ruang — katalog tak termuat`)
    gagal++
  } else console.log(`✓ ${opsi.length - 1} fungsi ruang tersedia`)

  /* Angka SNI harus TERLIHAT di pilihannya, bukan tersembunyi. */
  if (!opsi.some((o) => /1\.92|1,92/.test(o))) {
    console.error('❌ angka SNI tak terlihat di daftar pilihan')
    gagal++
  } else console.log('✓ angka SNI terlihat di tiap pilihan')

  // ── (3) Memilih menampilkan angkanya ─────────────────────────────────────
  await pemilihFungsi.selectOption('restoran')
  await page.waitForTimeout(600)
  const teksSesudah = await page.locator('body').innerText()
  if (!/4\.79|4,79/.test(teksSesudah)) {
    console.error('❌ memilih "restoran" tak menampilkan 4,79 kN/m²')
    gagal++
  } else console.log('✓ memilih fungsi ruang menampilkan angka SNI-nya')

  if (!/1727/.test(teksSesudah)) {
    console.error('❌ acuan SNI 1727 tak disebut di layar')
    gagal++
  } else console.log('✓ acuan SNI disebut di layar')

  /* Centang dua lapisan beban mati. */
  const centang = page.locator('input[type="checkbox"]')
  const nCentang = await centang.count()
  if (nCentang < 5) {
    console.error(`❌ hanya ${nCentang} lapisan beban mati — katalog tak termuat`)
    gagal++
  } else {
    await centang.nth(0).check()
    await centang.nth(5).check()
    await page.waitForTimeout(500)
    console.log(`✓ ${nCentang} lapisan beban mati bisa dicentang`)
  }

  await page.locator('#beban-fungsi').scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)
  await page.screenshot({ path: join(KELUAR, 'isian-beban.png'), fullPage: false })

  // ── (2) KOLOM: muncul, tapi dengan medan yang BERBEDA ────────────────────
  /*
    Dulu pemeriksa ini menuntut isian beban TIDAK muncul untuk kolom, dan
    itu benar SAAT ITU — beban kolom belum dihitung sama sekali.

    Sekarang sudah ada (`analisaBebanKolom`), jadi tuntutannya berubah:
    isian tetap muncul, tapi medannya HARUS berbeda. Balok memikul beban
    luasan sepanjang bentangnya; kolom memikul beban titik yang menumpuk
    dari tiap lantai.

    Pemeriksa yang tak ikut diperbarui akan menuduh produk atas perubahan
    yang disengaja — dan yang membacanya besok tak tahu mana yang benar.
  */
  const pemilihJenis = page.locator('#f-jenis')
  await pemilihJenis.selectOption('kolom')
  await page.waitForTimeout(1200)

  if (!(await page.locator('#beban-fungsi').count())) {
    console.error('❌ isian beban TAK muncul untuk kolom — padahal Pu bisa dihitung')
    gagal++
  } else {
    console.log('✓ isian beban muncul untuk kolom')

    /* Medan KHUSUS kolom wajib ada. */
    for (const [id, nama] of [['#beban-tributari', 'luas tributari'], ['#beban-lantai', 'jumlah lantai']]) {
      if (!(await page.locator(id).count())) {
        console.error(`❌ medan ${nama} tak ada di mode kolom`)
        gagal++
      }
    }
    console.log('✓ medan khusus kolom (tributari, jumlah lantai) tersedia')

    /*
      Dinding TIDAK boleh muncul untuk kolom: beban dinding sampai ke kolom
      LEWAT balok, jadi menghitungnya lagi di sini berarti dua kali.
    */
    if (await page.locator('#beban-dinding').count()) {
      console.error('❌ isian dinding muncul untuk kolom — bebannya akan terhitung DUA KALI')
      gagal++
    } else console.log('✓ isian dinding TIDAK muncul untuk kolom')

    /* Keterangan pembukanya menyebut momen tetap diketik. */
    const teksKolom = await page.locator('body').innerText()
    if (!/[Mm]omen kolom tetap diketik/.test(teksKolom)) {
      console.error('❌ layar tak menyatakan momen kolom tetap diketik')
      console.error('   Membiarkan pembacanya mengira momennya ikut terhitung adalah kelalaian.')
      gagal++
    } else console.log('✓ layar menyatakan momen kolom tetap diketik')

    await page.locator('#beban-tributari').scrollIntoViewIfNeeded()
    await page.waitForTimeout(400)
    await page.screenshot({ path: join(KELUAR, 'isian-beban-kolom.png'), fullPage: false })
  }
  await ctx.close()
  await browser.close()

  // ── (4) Elemen dengan pilihan beban menerbitkan DIAGRAM ──────────────────
  /*
    Diuji lewat rute, bukan layar: yang diperiksa adalah apakah bentuk data
    yang DISIMPAN layar cukup untuk menerbitkan diagram.
  */
  const buat = await fetch(`${API}/api/v1/projects/${proyek.id}/struktur`, {
    method: 'POST', headers: H,
    body: JSON.stringify({
      kode: KODE, nama: 'potret isian beban', jenis: 'balok', jumlah: 1,
      input: {
        bMm: 300, hMm: 500, panjangM: 6, selimutMm: 40,
        dUtamaMm: 16, nTarik: 5, nTekan: 2,
        dSengkangMm: 10, jarakSengkangMm: 150,
        mutu: { fcMpa: 25, fyMpa: 400 },
        muKnm: 120, vuKn: 90,
        /* Inilah yang disimpan komponen isian beban. */
        bentangM: 6, lebarPikulM: 3, tebalPelatMm: 120,
        fungsiRuangKunci: 'restoran',
        lapisMati: ['keramik-spesi', 'plafon-gypsum'],
        jenisDinding: 'bata-merah-plester', tinggiDindingM: 3,
      },
      catatan: 'potret-isian-beban.mjs — dihapus otomatis',
    }),
  })
  if (!buat.ok) {
    console.error(`❌ BUAT elemen berbeban gagal ${buat.status}: ${(await buat.text()).slice(0, 220)}`)
    gagal++
  } else {
    /*
      Rute memulangkan { id } di PUNCAK, bukan { data: { id } }.

      Ini kali KEEMPAT pola yang sama di sesi ini. Penguraian yang salah
      tak berteriak — ia cuma membuat pembersihan tak punya apa pun untuk
      dihapus, dan baris uji tertinggal di proyek sungguhan.
    */
    const jb = await buat.json()
    const idNyata = (jb.data ?? jb)?.id
    if (idNyata) dibuat.push(idNyata)
    if (!idNyata) {
      console.error('❌ balasan BUAT tak memuat id')
      gagal++
    } else {
      const baca = await fetch(`${API}/api/v1/struktur/${idNyata}?gambar=1`, { headers: { cookie } })
      const j = await baca.json()
      const g = j.gambar ?? {}
      if (g.diagramBebanGagal) {
        console.error(`❌ diagram gagal: ${g.diagramBebanGagal}`)
        gagal++
      } else if (!g.diagramBeban) {
        console.error('❌ diagramBeban TAK terbit padahal input memuat data beban')
        gagal++
      } else if (!/DIAGRAM MOMEN/.test(g.diagramBeban)) {
        console.error('❌ diagram terbit tapi tak memuat panel momen')
        gagal++
      } else {
        console.log('✓ elemen berbeban MENERBITKAN diagram lengkap')
        /* Momen harus DIHITUNG, bukan memakai 120 yang diketik. */
        const cat = (j.hasil?.catatan ?? []).join(' ')
        if (!/DIHITUNG dari beban/.test(cat)) {
          console.error('❌ catatan tak menyatakan momen dihitung dari beban')
          gagal++
        } else console.log('✓ catatan menyatakan Mu/Vu DIHITUNG dari beban, bukan diketik')
      }
    }
  }
} catch (e) {
  if (e.message !== 'berhenti') { console.error(`❌ ${e.message}`); gagal++ }
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
      if (!d.ok) gagal++
    }
  }
}

console.log(`\ntangkapan layar → ${KELUAR}`)
if (gagal) { console.error(`\n❌ ${gagal} masalah\n`); process.exit(1) }
console.log('\n✅ Isian beban bisa dipakai dari layar, dan diagramnya terbit\n')
