#!/usr/bin/env node
// ============================================================================
// MOMEN DARI BEBAN lewat rute HIDUP — angka DAN gambarnya.
// ============================================================================
//
// ── Yang diperiksa
//
//   1. angkanya cocok dengan HITUNGAN TANGAN (bukan dengan dirinya sendiri)
//   2. gambar SVG terbit, ber-aria-label, dan memuat ketiga panel
//   3. KANTILEVER berbeda bentuk dari sederhana — inilah gunanya digambar
//   4. input yang salah dijawab 400 dengan menyebut medannya, bukan 500
//   5. rute TIDAK menulis apa pun ke basis
//
// Nomor 3 yang paling menentukan keselamatan: kantilever yang dihitung sebagai
// balok sederhana menghasilkan momen SEPEREMPAT dari yang sebenarnya, dan
// angkanya tetap "kNm yang wajar". Yang membedakannya cuma bentuk diagram dan
// letak tulangan tariknya.
//
// Pakai: UJI_BASIS=http://127.0.0.1:3021 node scripts/uji-beban-balok-hidup.mjs
// ============================================================================

const BASIS = process.env.UJI_BASIS ?? 'http://127.0.0.1:3021'
const EMAIL = process.env.UJI_EMAIL ?? process.env.LAYAR_EMAIL
const SANDI = process.env.UJI_SANDI ?? process.env.LAYAR_SANDI
if (!EMAIL || !SANDI) { console.error('\n❌ kredensial kosong\n'); process.exit(1) }

const masuk = await fetch(`${BASIS}/api/v1/auth/login`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: SANDI }),
}).catch((e) => ({ ok: false, status: 0, _err: e }))
if (!masuk.ok) { console.error(`\n❌ login gagal (${masuk.status}) — UKUR portnya\n`); process.exit(1) }
const cookie = (masuk.headers.getSetCookie?.() ?? [])
  .map((c) => c.split(';')[0]).filter((c) => /^puraloka_(token|refresh)=/.test(c)).join('; ')
const H = { 'content-type': 'application/json', cookie }

let gagal = 0

const hitung = async (badan) => {
  const r = await fetch(`${BASIS}/api/v1/struktur/beban-balok`, {
    method: 'POST', headers: H, body: JSON.stringify(badan),
  })
  return { status: r.status, json: await r.json().catch(() => null) }
}

/*
  Kasus acuan — bisa dihitung tangan, dan angkanya ditulis di sini supaya
  pemeriksa berikutnya tak perlu memercayai kode:

    balok 300x500, bentang 6 m, lebar pikul 3 m, pelat 120 mm
    mati tambahan 1,5 kN/m2 · hidup 2,5 kN/m2

    berat sendiri 0,30 x 0,50 x 24 = 3,60 | pelat 0,12 x 24 x 3 = 8,64
    tambahan 1,5 x 3 = 4,50           -> D = 16,74 kN/m
    hidup 2,5 x 3                     -> L =  7,50 kN/m
    qu = 1,2(16,74) + 1,6(7,50)          = 32,088 kN/m
    Mu = 32,088 x 6^2 / 8                = 144,396 kNm
    Vu = 32,088 x 6 x 0,5                =  96,264 kN
*/
const DASAR = {
  bentangM: 6, lebarPikulM: 3, bMm: 300, hMm: 500, tebalPelatMm: 120,
  bebanMatiTambahan: [{ nama: 'Finishing + plafon', nilai: 1.5 }],
  bebanHidupKnM2: 2.5,
}

console.log('══ MOMEN DARI BEBAN lewat rute hidup ══════════════════════')
console.log(`   ${BASIS}\n`)

// ── (1) Angka cocok hitungan tangan ────────────────────────────────────────
const a = await hitung(DASAR)
if (a.status !== 200) {
  console.error(`❌ hitung gagal ${a.status}: ${JSON.stringify(a.json).slice(0, 220)}`)
  gagal++
} else {
  const h = a.json.hasil
  console.log(`     D  = ${h.qMatiKnM.toFixed(2)} kN/m   (tangan: 16,74)`)
  console.log(`     L  = ${h.qHidupKnM.toFixed(2)} kN/m   (tangan: 7,50)`)
  console.log(`     qu = ${h.quKnM.toFixed(3)} kN/m  (tangan: 32,088)`)
  console.log(`     Mu = ${h.muKnm.toFixed(3)} kNm  (tangan: 144,396)`)
  console.log(`     Vu = ${h.vuKn.toFixed(3)} kN   (tangan: 96,264)`)
  console.log('')

  const cocok = (nama, dapat, harap) => {
    if (Math.abs(dapat - harap) > 0.01) {
      console.error(`❌ ${nama} = ${dapat}, hitungan tangan ${harap}`)
      gagal++
      return false
    }
    return true
  }
  const semua = cocok('D', h.qMatiKnM, 16.74)
    && cocok('L', h.qHidupKnM, 7.5)
    && cocok('qu', h.quKnM, 32.088)
    && cocok('Mu', h.muKnm, 144.396)
    && cocok('Vu', h.vuKn, 96.264)
  if (semua) console.log('  ✓  seluruh angka cocok dengan hitungan tangan')

  /* Rincian yang tak berjumlah adalah rincian yang berbohong. */
  const jml = (h.rincianMati ?? []).reduce((x, y) => x + y.knM, 0)
  if (Math.abs(jml - h.qMatiKnM) > 0.001) {
    console.error(`❌ rincian beban mati berjumlah ${jml}, sementara D = ${h.qMatiKnM}`)
    gagal++
  } else {
    console.log(`  ✓  ${h.rincianMati.length} rincian beban mati BERJUMLAH sama dengan D`)
  }

  // ── (2) Gambar ───────────────────────────────────────────────────────────
  const svg = a.json.gambar
  if (typeof svg !== 'string' || !svg.includes('<svg')) {
    console.error('❌ gambar diagram tak terbit')
    gagal++
  } else {
    const panel = ['BEBAN RENCANA', 'DIAGRAM MOMEN', 'DIAGRAM GAYA LINTANG']
      .filter((x) => svg.includes(x))
    if (panel.length !== 3) {
      console.error(`❌ hanya ${panel.length}/3 panel: ${panel.join(', ')}`)
      gagal++
    } else console.log('  ✓  gambar memuat KETIGA panel (beban, momen, geser)')

    if (!/aria-label="[^"]+"/.test(svg)) {
      console.error('❌ SVG tanpa aria-label — gambar tanpa nama bagi pembaca layar')
      gagal++
    } else console.log('  ✓  SVG ber-aria-label')

    /*
      `rgba()` tak dikenali sebagian perender dan jatuh ke HITAM PEKAT —
      diagramnya jadi blok hitam yang menutupi garis batasnya sendiri.
      Cacat ini nyata, ditemukan dengan merender lalu melihat.
    */
    if (/rgba\(/.test(svg)) {
      console.error('❌ SVG memakai rgba() — sebagian perender menjatuhkannya ke hitam pekat')
      gagal++
    } else console.log('  ✓  transparansi lewat fill-opacity, bukan rgba()')

    /* Angka di gambar wajib SAMA dengan hasil hitungnya. */
    if (!svg.includes(String(Math.round(h.muKnm * 100) / 100))) {
      console.error('❌ Mu di gambar BERBEDA dari hasil hitung — dua sumber kebenaran')
      gagal++
    } else console.log('  ✓  angka di gambar sama dengan hasil hitung')
  }
}

// ── (3) Kantilever berbeda bentuk ──────────────────────────────────────────
const k = await hitung({ ...DASAR, skema: 'kantilever', bentangM: 2.5 })
if (k.status !== 200) {
  console.error(`❌ kantilever gagal ${k.status}`)
  gagal++
} else {
  const svgK = k.json.gambar ?? ''
  if (!/tarik di ATAS/.test(svgK)) {
    console.error('❌ kantilever tak menyatakan "tarik di ATAS"')
    console.error('   Salah menaruh tulangan tarik membuat balok runtuh jauh di bawah rencana.')
    gagal++
  } else console.log('  ✓  kantilever menyatakan tarik di ATAS')

  if (!/JEPIT/.test(svgK)) {
    console.error('❌ kantilever tak menggambar tumpuan jepit')
    gagal++
  } else console.log('  ✓  kantilever menggambar tumpuan JEPIT')

  if (a.status === 200 && /tarik di ATAS/.test(a.json.gambar ?? '')) {
    console.error('❌ balok SEDERHANA juga menyatakan tarik di ATAS — bentuknya tak membedakan')
    gagal++
  }
}

// ── (4) Input salah dijawab 400, bukan 500 ─────────────────────────────────
const { bebanMatiTambahan, ...tanpaMati } = DASAR
const b = await hitung(tanpaMati)
if (b.status !== 400) {
  console.error(`❌ daftar beban mati yang HILANG dijawab ${b.status}, seharusnya 400`)
  console.error('   Nol yang tak disengaja membuat balok terlihat lebih kuat dari kenyataannya.')
  gagal++
} else if (!/bebanMatiTambahan/.test(b.json?.error ?? '')) {
  console.error(`❌ pesan galat tak menyebut medannya: "${b.json?.error}"`)
  gagal++
} else console.log('  ✓  input hilang dijawab 400 dan menyebut medannya')

const c = await hitung({ ...DASAR, skema: 'melayang' })
if (c.status !== 400) {
  console.error(`❌ skema karangan dijawab ${c.status}, seharusnya 400`)
  console.error('   Jatuh diam-diam ke "sederhana" membuat kantilever bermomen seperempatnya.')
  gagal++
} else console.log('  ✓  skema karangan ditolak 400')

// ── (5) Tak menulis apa pun ────────────────────────────────────────────────
const sebelum = await fetch(`${BASIS}/api/v1/projects?limit=1`, { headers: { cookie } })
if (sebelum.ok) {
  const pj = (await sebelum.json()).data?.[0]
  if (pj?.id) {
    const el = await fetch(`${BASIS}/api/v1/projects/${pj.id}/struktur`, { headers: { cookie } })
    if (el.ok) {
      const n = ((await el.json()).data ?? []).length
      await hitung(DASAR)
      const el2 = await fetch(`${BASIS}/api/v1/projects/${pj.id}/struktur`, { headers: { cookie } })
      const n2 = el2.ok ? ((await el2.json()).data ?? []).length : -1
      if (n2 !== n) {
        console.error(`❌ jumlah elemen berubah ${n} -> ${n2} — rute ini MENULIS ke basis`)
        gagal++
      } else console.log('  ✓  rute TIDAK menulis apa pun ke basis')
    }
  }
}

if (gagal) { console.error(`\n❌ ${gagal} masalah pada hitungan beban\n`); process.exit(1) }
console.log('\n✅ Momen & geser dihitung dari beban, tergambar, dan bentuknya membedakan skema\n')
