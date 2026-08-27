#!/usr/bin/env node
// ============================================================================
// RIWAYAT ELEMEN wajib benar-benar TERCATAT — dibuktikan lewat rute hidup.
// ============================================================================
//
// ── Kenapa ini tak bisa diganti unit test
//
// Cacat pertama di fitur ini LOLOS dari `tsc --noEmit` yang exit 0:
// `ambilElemen()` tak mengambil `company_id`, jadi insert riwayat masuk
// dengan nilai undefined dan DITOLAK RLS. Penyuntingan tetap berhasil, layar
// tetap normal, dan riwayatnya diam-diam kosong selamanya.
//
// Yang menyembunyikannya adalah `as never` di pemanggil — cast yang membuat
// TypeScript berhenti memeriksa persis di tempat yang perlu diperiksa.
//
// Satu-satunya cara membuktikan riwayat tercatat adalah MENGUBAH elemen
// sungguhan lewat rute, lalu MEMBACA riwayatnya kembali lewat rute.
//
// ── Yang diperiksa
//
//   1. mengubah input MELAHIRKAN revisi
//   2. revisi memuat input LAMA (bukan yang baru — kalau yang baru, riwayat
//      selalu kembar dengan keadaan sekarang dan tak menjelaskan apa pun)
//   3. mengubah NAMA saja TIDAK melahirkan revisi
//   4. nomor urut naik, tidak kembar
//
// Pakai: UJI_BASIS=http://127.0.0.1:3021 node scripts/uji-riwayat-hidup.mjs
// ============================================================================

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const BASIS = process.env.UJI_BASIS ?? 'http://127.0.0.1:3021'
const EMAIL = process.env.UJI_EMAIL ?? process.env.LAYAR_EMAIL
const SANDI = process.env.UJI_SANDI ?? process.env.LAYAR_SANDI
if (!EMAIL || !SANDI) { console.error('\n❌ kredensial kosong\n'); process.exit(1) }

/* Contoh input dibaca dari UI — alasannya di uji-gambar-semua-jenis.mjs. */
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
const KODE = `UJI-RIW-${JALAN}`
console.log('══ RIWAYAT elemen struktur lewat rute hidup ════════════════')
console.log(`   ${BASIS} · proyek ${proyek.name ?? proyek.id}\n`)

const dibuat = []
let gagal = 0

try {
  const awal = structuredClone(CONTOH.balok)
  const buat = await fetch(`${BASIS}/api/v1/projects/${proyek.id}/struktur`, {
    method: 'POST', headers: H,
    body: JSON.stringify({
      kode: KODE, nama: 'uji riwayat', jenis: 'balok', jumlah: 1, input: awal,
      catatan: 'uji-riwayat-hidup.mjs — dihapus otomatis',
    }),
  })
  if (!buat.ok) { console.error(`❌ BUAT gagal ${buat.status}: ${(await buat.text()).slice(0, 200)}`); gagal++; throw new Error('berhenti') }
  /* Rute memulangkan `{ id }` di PUNCAK, bukan `{ data: { id } }` — penguji lain
     pernah salah menguraikannya dan meninggalkan tiga baris uji di proyek
     sungguhan. Kedua bentuk diterima di sini. */
  const jb = await buat.json()
  const idNyata = (jb.data ?? jb)?.id
  if (!idNyata) {
    console.error(`❌ balasan BUAT tak memuat id — ${JSON.stringify(jb).slice(0, 150)}`)
    gagal++
    throw new Error('berhenti')
  }
  dibuat.push(idNyata)
  console.log(`  ✓  ${KODE} dibuat (h=${awal.hMm})`)

  const bacaRiwayat = async () => {
    const r = await fetch(`${BASIS}/api/v1/struktur/${idNyata}/riwayat`, { headers: { cookie } })
    if (!r.ok) { console.error(`❌ BACA riwayat gagal ${r.status}: ${(await r.text()).slice(0, 200)}`); gagal++; return null }
    return r.json()
  }

  /* Elemen baru: riwayat masih kosong. */
  const r0 = await bacaRiwayat()
  if (r0 && r0.data.length !== 0) {
    console.error(`❌ elemen baru sudah punya ${r0.data.length} revisi — seharusnya 0`)
    gagal++
  } else console.log('  ✓  elemen baru: riwayat kosong')

  // ── (1)(2) Ubah INPUT → wajib melahirkan revisi berisi input LAMA ────────
  const hBaru = Number(awal.hMm) + 40
  const ub1 = await fetch(`${BASIS}/api/v1/struktur/${idNyata}`, {
    method: 'PATCH', headers: H,
    body: JSON.stringify({ input: { ...awal, hMm: hBaru }, catatan: 'ditinggikan untuk uji' }),
  })
  if (!ub1.ok) { console.error(`❌ PATCH gagal ${ub1.status}: ${(await ub1.text()).slice(0, 200)}`); gagal++ }
  else console.log(`  ✓  input diubah h=${awal.hMm} -> ${hBaru}`)

  const r1 = await bacaRiwayat()
  if (r1) {
    if (r1.data.length !== 1) {
      console.error(`❌ sesudah ubah input: ${r1.data.length} revisi — seharusnya 1`)
      console.error('   Riwayat yang tak tercatat TAK punya gejala di layar mana pun.')
      gagal++
    } else {
      console.log('  ✓  satu revisi tercatat')
      const rev = r1.data[0]
      /* Revisi harus memuat input LAMA. */
      if (Number(rev.input?.hMm) !== Number(awal.hMm)) {
        console.error(`❌ revisi memuat h=${rev.input?.hMm}, seharusnya yang LAMA (${awal.hMm})`)
        console.error('   Riwayat yang menyimpan keadaan BARU selalu kembar dengan keadaan sekarang.')
        gagal++
      } else console.log(`  ✓  revisi memuat input LAMA (h=${rev.input.hMm})`)

      if (rev.urutan !== 1) { console.error(`❌ urutan revisi ${rev.urutan}, seharusnya 1`); gagal++ }
      if (!rev.dicatat_pada) { console.error('❌ revisi tanpa dicatat_pada'); gagal++ }
      if (!rev.dicatat_oleh) { console.error('❌ revisi tanpa dicatat_oleh — "siapa yang mengubah" tak terjawab'); gagal++ }
      if (Number(r1.sekarang?.input?.hMm) !== hBaru) {
        console.error(`❌ "sekarang" memuat h=${r1.sekarang?.input?.hMm}, seharusnya ${hBaru}`)
        gagal++
      } else console.log(`  ✓  "sekarang" memuat input BARU (h=${hBaru})`)
    }
  }

  // ── (3) Ubah NAMA saja → TIDAK boleh melahirkan revisi ───────────────────
  const ub2 = await fetch(`${BASIS}/api/v1/struktur/${idNyata}`, {
    method: 'PATCH', headers: H, body: JSON.stringify({ nama: 'nama baru saja' }),
  })
  if (!ub2.ok) { console.error(`❌ PATCH nama gagal ${ub2.status}`); gagal++ }
  const r2 = await bacaRiwayat()
  if (r2) {
    if (r2.data.length !== 1) {
      console.error(`❌ ubah NAMA melahirkan revisi (jadi ${r2.data.length}) — seharusnya tetap 1`)
      console.error('   Mengubah nama bukan perubahan desain; revisi untuk itu menenggelamkan yang penting.')
      gagal++
    } else console.log('  ✓  ubah nama TIDAK melahirkan revisi')
  }

  // ── (4) Ubah input LAGI → urutan naik, tidak kembar ──────────────────────
  const hKetiga = hBaru + 40
  await fetch(`${BASIS}/api/v1/struktur/${idNyata}`, {
    method: 'PATCH', headers: H, body: JSON.stringify({ input: { ...awal, hMm: hKetiga } }),
  })
  const r3 = await bacaRiwayat()
  if (r3) {
    if (r3.data.length !== 2) {
      console.error(`❌ sesudah dua perubahan input: ${r3.data.length} revisi — seharusnya 2`)
      gagal++
    } else {
      const urut = r3.data.map((x) => x.urutan)
      console.log(`  ✓  dua revisi, urutan ${urut.join(', ')} (terbaru dulu)`)
      if (new Set(urut).size !== urut.length) {
        console.error('❌ nomor urut KEMBAR — "revisi 2" menunjuk dua baris berbeda')
        gagal++
      }
      if (urut[0] <= urut[1]) { console.error('❌ urutan tidak menurun — terbaru harus di atas'); gagal++ }
    }
  }
} catch (e) {
  if (e.message !== 'berhenti') { console.error(`❌ ${e.message}`); gagal++ }
} finally {
  /* Pembersihan di finally, dan menyapu berdasarkan KODE — riwayat ikut
     terhapus lewat ON DELETE CASCADE. */
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

if (gagal) { console.error(`\n❌ ${gagal} masalah pada riwayat\n`); process.exit(1) }
console.log('\n✅ Riwayat tercatat, memuat keadaan LAMA, dan tak melahirkan revisi palsu\n')
