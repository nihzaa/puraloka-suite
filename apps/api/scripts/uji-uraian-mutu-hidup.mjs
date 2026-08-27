#!/usr/bin/env node
// ============================================================================
// URAIAN RAB wajib menyebut MUTU dalam dua bahasa — lewat rute HIDUP.
// ============================================================================
//
// ── Yang diperiksa
//
//   1. uraian beton memuat f'c MPa DAN padanan K-nya
//   2. elemen BAJA tidak mendapat imbuhan mutu beton
//   3. AHSP yang terpilih BUKAN paket (yang sudah memuat tulangan/bekisting)
//
// Nomor 3 yang paling mahal kalau salah. Katalog memuat 32 AHSP "paket"
// bersatuan m3 seperti:
//
//     1 M3 BALOK STRUKTUR, 20/30 ( BETON SITE MIX K-250  TULANGAN BESI …)
//
// Modul struktur mengirim beton, bekisting, dan pembesian sebagai baris
// TERPISAH. Kalau baris betonnya tercocok ke paket, tulangan dan bekisting
// terhitung DUA KALI — dan RAB-nya tetap terlihat wajar, karena tiap barisnya
// masuk akal sendiri-sendiri. Tak ada satu pun galat.
//
// Pakai: UJI_BASIS=http://127.0.0.1:3021 node scripts/uji-uraian-mutu-hidup.mjs
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
const KODE_BETON = `UJI-URA-B-${JALAN}`
const KODE_BAJA = `UJI-URA-S-${JALAN}`
const dibuat = []
let gagal = 0

console.log('══ URAIAN RAB menyebut mutu — lewat rute hidup ═════════════')
console.log(`   ${BASIS} · proyek ${proyek.name ?? proyek.id}\n`)

const buatElemen = async (kode, jenis, input) => {
  const r = await fetch(`${BASIS}/api/v1/projects/${proyek.id}/struktur`, {
    method: 'POST', headers: H,
    body: JSON.stringify({
      kode, nama: `uji uraian ${jenis}`, jenis, jumlah: 1, input,
      catatan: 'uji-uraian-mutu-hidup.mjs — dihapus otomatis',
    }),
  })
  if (!r.ok) {
    console.error(`❌ BUAT ${jenis} gagal ${r.status}: ${(await r.text()).slice(0, 180)}`)
    gagal++
    return null
  }
  const j = await r.json()
  const id = (j.data ?? j)?.id
  if (id) dibuat.push(id)
  return id
}

try {
  await buatElemen(KODE_BETON, 'balok', structuredClone(CONTOH.balok))
  const adaBaja = Boolean(CONTOH.baja_balok)
  if (adaBaja) await buatElemen(KODE_BAJA, 'baja_balok', structuredClone(CONTOH.baja_balok))
  console.log(`  ✓  elemen uji dibuat (beton${adaBaja ? ' + baja' : ''})`)

  const r = await fetch(`${BASIS}/api/v1/projects/${proyek.id}/struktur/usulan-rab`,
    { headers: { cookie } })
  if (!r.ok) {
    console.error(`❌ usulan-rab gagal ${r.status}: ${(await r.text()).slice(0, 250)}`)
    gagal++
    throw new Error('berhenti')
  }
  const j = await r.json()
  const semua = j.data ?? j.usulan ?? []

  const beton = semua.filter((x) => /^Beton /i.test(x.uraian ?? ''))
  console.log('')
  for (const b of beton.slice(0, 4)) {
    console.log(`     ${String(b.uraian).slice(0, 62).padEnd(63)} ${b.satuan}`)
    if (b.assembly?.name) console.log(`        AHSP: ${String(b.assembly.name).slice(0, 66)}`)
  }
  console.log('')

  // ── (1) f'c DAN K ────────────────────────────────────────────────────────
  if (!beton.length) {
    console.error('❌ tak ada satu pun usulan beton — tak ada yang bisa diperiksa')
    gagal++
  } else {
    const b = beton[0]
    if (!/f'c\s*[0-9]/.test(b.uraian)) {
      console.error(`❌ uraian tak menyebut f'c: "${b.uraian}"`)
      gagal++
    } else console.log("  ✓  uraian menyebut f'c")

    if (!/\(~?K-[0-9]{2,3}\)/.test(b.uraian)) {
      console.error(`❌ uraian tak menyebut padanan K: "${b.uraian}"`)
      console.error('   Baris inilah yang dibaca orang yang MEMESAN betonnya.')
      gagal++
    } else console.log('  ✓  uraian menyebut padanan K')

    /*
      Urutan hanya diperiksa bila KEDUANYA ada.

      Tanpa penjagaan itu, hilangnya K memicu DUA galat: yang benar ("tak
      menyebut K") dan yang menyesatkan ("K mendahului f'c") — karena
      indexOf('K-') memulangkan -1, dan -1 selalu lebih kecil dari apa pun.
      Galat kedua menunjuk sebab yang tak ada.
    */
    if (/K-[0-9]/.test(b.uraian) && b.uraian.indexOf("f'c") > b.uraian.indexOf('K-')) {
      console.error('❌ K mendahului f\'c — yang masuk rumus adalah f\'c')
      gagal++
    }
  }

  // ── (2) BAJA tak dapat imbuhan mutu beton ────────────────────────────────
  if (adaBaja) {
    const baja = semua.filter((x) => /baja|profil/i.test(x.uraian ?? ''))
    const salah = baja.filter((x) => /K-[0-9]{2,3}|f'c/.test(x.uraian ?? ''))
    if (salah.length) {
      console.error(`❌ ${salah.length} usulan BAJA mendapat imbuhan mutu beton:`)
      for (const x of salah.slice(0, 2)) console.error(`     "${x.uraian}"`)
      gagal++
    } else console.log('  ✓  usulan baja TANPA imbuhan mutu beton')
  }

  // ── (3) AHSP terpilih BUKAN paket ────────────────────────────────────────
  /*
    Paket sudah memuat tulangan DAN bekisting. Modul ini mengirim ketiganya
    terpisah, jadi paket = hitung DUA KALI tanpa satu pun galat.
  */
  const pakePaket = beton.filter((x) => {
    const n = x.assembly?.name ?? ''
    return /tulangan|sengkang|bekisting|begisting/i.test(n)
  })
  if (pakePaket.length) {
    console.error(`❌ ${pakePaket.length} baris BETON tercocok ke AHSP PAKET:`)
    for (const x of pakePaket.slice(0, 2)) {
      console.error(`     "${x.uraian}"`)
      console.error(`        -> ${x.assembly.name}`)
    }
    console.error('   Tulangan & bekisting akan terhitung DUA KALI — RAB tetap terlihat wajar.')
    gagal++
  } else console.log('  ✓  tak ada baris beton yang tercocok ke AHSP paket')
} catch (e) {
  if (e.message !== 'berhenti') { console.error(`❌ ${e.message}`); gagal++ }
} finally {
  for (const id of dibuat) {
    const d = await fetch(`${BASIS}/api/v1/struktur/${id}`, { method: 'DELETE', headers: { cookie } })
    if (!d.ok) { console.error(`⚠ elemen uji ${id} TAK terhapus (${d.status})`); gagal++ }
  }
  const sisa = await fetch(`${BASIS}/api/v1/projects/${proyek.id}/struktur`, { headers: { cookie } })
  if (sisa.ok) {
    for (const y of ((await sisa.json()).data ?? [])
      .filter((x) => x.kode === KODE_BETON || x.kode === KODE_BAJA)) {
      const d = await fetch(`${BASIS}/api/v1/struktur/${y.id}`, { method: 'DELETE', headers: { cookie } })
      console.error(`⚠ baris yatim ${y.kode} disapu (${d.ok ? 'terhapus' : 'GAGAL'})`)
      if (!d.ok) gagal++
    }
  }
}

if (gagal) { console.error(`\n❌ ${gagal} masalah pada uraian RAB\n`); process.exit(1) }
console.log('\n✅ Uraian RAB menyebut mutu dua bahasa, dan AHSP-nya bukan paket\n')
