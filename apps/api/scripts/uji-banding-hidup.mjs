#!/usr/bin/env node
// ============================================================================
// BANDING ALTERNATIF DESAIN lewat rute HIDUP — termasuk yang TIDAK ia lakukan.
// ============================================================================
//
// ── Yang diperiksa
//
//   1. banding memulangkan satu baris per kandidat + baris "Sekarang"
//   2. TIDAK MENULIS apa pun — input elemen tetap seperti semula, dan tak ada
//      revisi baru yang lahir dari mencoba-coba
//   3. medan yang tak ada DITOLAK, bukan dibuat diam-diam
//   4. `puncakBerubahPersen` menurun saat balok ditinggikan — arah yang
//      terbalik di sini menyesatkan ke arah BERBAHAYA (menyarankan penampang
//      lebih kecil)
//
// Nomor (2) adalah yang paling penting dan paling mudah rusak tanpa gejala:
// rute yang diam-diam menyimpan hasil percobaan membuat elemen menyimpan
// desain yang belum diputuskan siapa pun.
//
// Pakai: UJI_BASIS=http://127.0.0.1:3021 node scripts/uji-banding-hidup.mjs
// ============================================================================

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const BASIS = process.env.UJI_BASIS ?? 'http://127.0.0.1:3021'
const EMAIL = process.env.UJI_EMAIL ?? process.env.LAYAR_EMAIL
const SANDI = process.env.UJI_SANDI ?? process.env.LAYAR_SANDI
if (!EMAIL || !SANDI) { console.error('\n❌ kredensial kosong\n'); process.exit(1) }

const HAL = join(process.cwd(), '..', 'web', 'app', '(dashboard)', 'estimasi', 'struktur', 'page.tsx')
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

const masuk = await fetch(`${BASIS}/api/v1/auth/login`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: SANDI }),
}).catch((e) => ({ ok: false, status: 0, _err: e }))
if (!masuk.ok) { console.error(`\n❌ login gagal (${masuk.status}) — UKUR portnya\n`); process.exit(1) }
const cookie = (masuk.headers.getSetCookie?.() ?? [])
  .map((c) => c.split(';')[0]).filter((c) => /^puraloka_(token|refresh)=/.test(c)).join('; ')
const H = { 'content-type': 'application/json', cookie }

const jp = await (await fetch(`${BASIS}/api/v1/projects?limit=1`, { headers: H })).json()
const proyek = (jp.data ?? jp.projects ?? jp)[0]
if (!proyek?.id) { console.error('\n❌ tak ada proyek\n'); process.exit(1) }

const JALAN = (process.hrtime.bigint() % 100000n).toString(36)
const KODE = `UJI-BND-${JALAN}`
console.log('══ BANDING alternatif desain lewat rute hidup ══════════════')
console.log(`   ${BASIS} · proyek ${proyek.name ?? proyek.id}\n`)

const dibuat = []
let gagal = 0

try {
  const awal = structuredClone(CONTOH.balok)
  const buat = await fetch(`${BASIS}/api/v1/projects/${proyek.id}/struktur`, {
    method: 'POST', headers: H,
    body: JSON.stringify({
      kode: KODE, nama: 'uji banding', jenis: 'balok', jumlah: 1, input: awal,
      catatan: 'uji-banding-hidup.mjs — dihapus otomatis',
    }),
  })
  if (!buat.ok) { console.error(`❌ BUAT gagal ${buat.status}: ${(await buat.text()).slice(0, 200)}`); gagal++; throw new Error('berhenti') }
  const jb = await buat.json()
  const id = (jb.data ?? jb)?.id
  if (!id) { console.error('❌ balasan BUAT tak memuat id'); gagal++; throw new Error('berhenti') }
  dibuat.push(id)
  console.log(`  ✓  ${KODE} dibuat (h=${awal.hMm})`)

  // ── (1) Banding tiga tinggi ──────────────────────────────────────────────
  const r = await fetch(`${BASIS}/api/v1/struktur/${id}/banding`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ medan: 'hMm', nilai: [450, 550, 700] }),
  })
  if (!r.ok) {
    console.error(`❌ banding gagal ${r.status}: ${(await r.text()).slice(0, 250)}`)
    gagal++
    throw new Error('berhenti')
  }
  const b = await r.json()
  console.log(`  ✓  banding memulangkan ${b.data.length} kandidat + baris "Sekarang"`)
  if (b.data.length !== 3) { console.error(`❌ ${b.data.length} kandidat, seharusnya 3`); gagal++ }
  if (!b.sekarang) { console.error('❌ tak ada baris "Sekarang" — kandidat melayang tanpa acuan'); gagal++ }

  console.log('')
  console.log('     kandidat       aman  puncak-berubah          beton m3')
  for (const x of [b.sekarang, ...b.data]) {
    const nama = String(x.label).padEnd(14)
    const aman = x.aman === null ? ' ?? ' : x.aman ? ' YA ' : 'TIDAK'
    const pb = x.puncakBerubahPersen === null ? '   —' : `${x.puncakBerubahPersen.toFixed(1)}%`
    const pn = (x.puncakBerubahNama ?? '').slice(0, 18).padEnd(18)
    console.log(`     ${nama} ${aman}  ${pb.padStart(7)} ${pn} ${String(x.betonM3 ?? '—').slice(0, 6)}`)
  }
  console.log('')

  // ── (4) Arah: lebih tinggi = puncak-berubah lebih rendah ─────────────────
  const p450 = b.data.find((x) => x.label.includes('450'))
  const p700 = b.data.find((x) => x.label.includes('700'))
  if (!p450 || !p700) { console.error('❌ kandidat 450/700 tak ketemu'); gagal++ }
  else if (p450.puncakBerubahPersen === null || p700.puncakBerubahPersen === null) {
    console.error('❌ puncakBerubahPersen null — pemeriksaan yang berubah tak terdeteksi')
    console.error('   Tanpa itu seluruh perbandingan tak punya kolom penentu.')
    gagal++
  } else if (!(p700.puncakBerubahPersen < p450.puncakBerubahPersen)) {
    console.error(`❌ h=700 (${p700.puncakBerubahPersen}%) TIDAK lebih lega dari h=450 (${p450.puncakBerubahPersen}%)`)
    console.error('   Arah terbalik menyesatkan ke arah BERBAHAYA: menyarankan penampang lebih kecil.')
    gagal++
  } else {
    console.log(`  ✓  h=450 ${p450.puncakBerubahPersen}% → h=700 ${p700.puncakBerubahPersen}% (makin lega)`)
  }

  // ── (2) TIDAK MENULIS apa pun ────────────────────────────────────────────
  /*
    Bandingnya diulang dengan kandidat yang SETIDAKNYA SATU LOLOS.

    Ini bukan kelengkapan kosmetik. Mutasi sengaja — menyimpan kandidat aman
    pertama ke basis — LOLOS dari versi pertama pemeriksa ini, karena
    seluruh kandidatnya (variasi tinggi) tetap TIDAK AMAN: balok contoh
    gagal di selimut api, dan menaikkan tinggi tak menolong sama sekali.
    Jadi `find(x => x.aman)` tak menemukan apa pun dan tulisannya tak pernah
    terpicu.

    Pemeriksa yang jaminannya tak pernah benar-benar diuji adalah hiasan.
    Yang divariasikan sekarang `selimutMm` — medan yang MEMANG menentukan
    lolos-tidaknya balok contoh ini.
  */
  const rLolos = await fetch(`${BASIS}/api/v1/struktur/${id}/banding`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ medan: 'selimutMm', nilai: [30, 50, 60] }),
  })
  if (!rLolos.ok) {
    console.error(`❌ banding selimut gagal ${rLolos.status}`)
    gagal++
  } else {
    const bl = await rLolos.json()
    const adaYangLolos = bl.data.some((x) => x.aman === true)
    if (!adaYangLolos) {
      /*
        Kalau tak ada satu pun yang lolos, jaminan "tak menulis" di bawah
        TAK TERUJI — dan diamnya pemeriksa terbaca seperti bukti.
      */
      console.error('❌ tak satu pun kandidat selimut LOLOS — jaminan tak-menulis jadi tak teruji')
      console.error('   Perbaiki kandidatnya, jangan biarkan pemeriksa lulus tanpa menguji apa pun.')
      gagal++
    } else {
      console.log(' ✓  ada kandidat yang LOLOS — jaminan tak-menulis benar-benar teruji')
    }
  }

  const cek = await fetch(`${BASIS}/api/v1/struktur/${id}`, { headers: { cookie } })
  const jc = await cek.json()
  const inputSesudah = (jc.data ?? jc)?.elemen?.input ?? (jc.data ?? jc)?.input
  if (Number(inputSesudah?.hMm) !== Number(awal.hMm)
      || Number(inputSesudah?.selimutMm) !== Number(awal.selimutMm)) {
    console.error(`❌ input elemen BERUBAH (h=${inputSesudah?.hMm}, selimut=${inputSesudah?.selimutMm}) — banding menulis ke basis`)
    console.error('   Elemen jadi menyimpan desain yang belum diputuskan siapa pun.')
    gagal++
  } else console.log(` ✓  input elemen TIDAK berubah (h=${awal.hMm}, selimut=${awal.selimutMm})`)

  const riw = await fetch(`${BASIS}/api/v1/struktur/${id}/riwayat`, { headers: { cookie } })
  const jr = await riw.json()
  if ((jr.data ?? []).length !== 0) {
    console.error(`❌ banding melahirkan ${jr.data.length} revisi — penjajakan bukan keputusan`)
    console.error('   Riwayat yang penuh percobaan menenggelamkan perubahan yang sungguhan.')
    gagal++
  } else console.log(' ✓  banding TIDAK melahirkan revisi')
  // ── (3) Medan yang tak ada DITOLAK ───────────────────────────────────────
  const rt = await fetch(`${BASIS}/api/v1/struktur/${id}/banding`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ medan: 'tinggiBalokku', nilai: [500] }),
  })
  if (rt.status !== 400) {
    console.error(`❌ medan tak dikenal dijawab ${rt.status}, seharusnya 400`)
    console.error('   Kandidat yang medannya tak sampai menghasilkan hasil identik dengan dasar,')
    console.error('   dan pemakainya menyimpulkan "ubahan ini tak berpengaruh".')
    gagal++
  } else console.log('  ✓  medan yang tak ada ditolak 400')

  const rb = await fetch(`${BASIS}/api/v1/struktur/${id}/banding`, {
    method: 'POST', headers: H, body: JSON.stringify({}),
  })
  if (rb.status !== 400) { console.error(`❌ badan kosong dijawab ${rb.status}, seharusnya 400`); gagal++ }
  else console.log('  ✓  badan kosong ditolak 400')
} catch (e) {
  if (e.message !== 'berhenti') { console.error(`❌ ${e.message}`); gagal++ }
} finally {
  for (const id of dibuat) {
    const d = await fetch(`${BASIS}/api/v1/struktur/${id}`, { method: 'DELETE', headers: { cookie } })
    if (!d.ok) { console.error(`⚠ elemen uji ${id} TAK terhapus (${d.status})`); gagal++ }
  }
  const sisa = await fetch(`${BASIS}/api/v1/projects/${proyek.id}/struktur`, { headers: { cookie } })
  if (sisa.ok) {
    for (const y of ((await sisa.json()).data ?? []).filter((x) => x.kode === KODE)) {
      const d = await fetch(`${BASIS}/api/v1/struktur/${y.id}`, { method: 'DELETE', headers: { cookie } })
      console.error(`⚠ baris yatim ${y.kode} disapu (${d.ok ? 'terhapus' : 'GAGAL'})`)
      if (!d.ok) gagal++
    }
  }
}

if (gagal) { console.error(`\n❌ ${gagal} masalah pada banding\n`); process.exit(1) }
console.log('\n✅ Banding bekerja, dan TIDAK menulis apa pun ke basis\n')
