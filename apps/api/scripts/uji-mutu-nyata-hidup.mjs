#!/usr/bin/env node
// ============================================================================
// MUTU NYATA vs DESAIN lewat rute HIDUP — dengan data uji yang SENGAJA jeblok.
// ============================================================================
//
// ── Kenapa data ujinya dibuat sendiri, bukan memakai yang sudah ada
//
// Yang diuji di sini adalah TEMUAN: elemen yang tadinya lolos, tidak lagi
// lolos pada mutu yang benar-benar terpasang. Kalau data uji di basis
// kebetulan bagus semua, pemeriksanya lulus tanpa pernah menguji apa pun —
// dan diamnya terbaca seperti bukti.
//
// Pelajaran ini dibayar di fitur banding pada sesi yang sama: mutasi
// "simpan ke basis" LOLOS karena seluruh kandidat fixture-nya kebetulan tak
// aman, sehingga cabang tulisnya tak pernah jalan.
//
// ── Yang diperiksa
//
//   1. proyek TANPA uji tekan beton dijawab `adaUji: false`, BUKAN "aman"
//   2. uji yang jeblok menurunkan f'c dan MENAIKKAN rasio terpakai
//   3. elemen yang tadinya lolos bisa berubah jadi TIDAK lolos — inilah
//      temuan yang menentukan boleh-tidaknya lantai dibebani
//   4. TIDAK MENULIS apa pun: input elemen tetap, riwayat tetap kosong
//   5. kuat TARIK baja tidak ikut terbaca sebagai mutu beton
//
// Pakai: UJI_BASIS=http://127.0.0.1:3021 node scripts/uji-mutu-nyata-hidup.mjs
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

const jp = await (await fetch(`${BASIS}/api/v1/projects?limit=5`, { headers: H })).json()
const proyekSemua = jp.data ?? jp.projects ?? jp
const proyek = proyekSemua[0]
if (!proyek?.id) { console.error('\n❌ tak ada proyek\n'); process.exit(1) }

const JALAN = (process.hrtime.bigint() % 100000n).toString(36)
const KODE = `UJI-MTU-${JALAN}`
const NOMOR_UJI = `UJI-MUTU-${JALAN}`

console.log('══ MUTU NYATA vs DESAIN lewat rute hidup ═══════════════════')
console.log(`   ${BASIS} · proyek ${proyek.name ?? proyek.id}\n`)

const elemenDibuat = []
const ujiDibuat = []
let gagal = 0

const bacaMutu = async () => {
  const r = await fetch(`${BASIS}/api/v1/projects/${proyek.id}/struktur/mutu-nyata`, { headers: { cookie } })
  if (!r.ok) {
    console.error(`❌ mutu-nyata gagal ${r.status}: ${(await r.text()).slice(0, 250)}`)
    gagal++
    return null
  }
  return r.json()
}

try {
  // ── (1) Keadaan awal: tanpa uji tekan beton milik kita ───────────────────
  const awalMutu = await bacaMutu()
  if (awalMutu) {
    console.log(`  · keadaan awal: adaUji=${awalMutu.adaUji}, ${awalMutu.terukur?.length ?? 0} uji tekan terbaca`)
    if (!awalMutu.adaUji && !/BUKAN berarti/i.test(awalMutu.catatan ?? '')) {
      console.error('❌ "belum ada uji" tak menyatakan bahwa itu BUKAN bukti mutu baik')
      gagal++
    }
  }

  // ── Elemen uji: balok dengan selimut yang LOLOS, supaya bisa berubah ─────
  /*
    Selimut 30 mm membuat balok contoh gagal di api APA PUN mutunya — dan
    elemen yang sudah gagal tak bisa "berubah jadi tidak aman". Selimut 60 mm
    membuatnya lolos, sehingga penurunan mutu benar-benar diuji.
  */
  const awal = { ...structuredClone(CONTOH.balok), selimutMm: 60 }
  const buat = await fetch(`${BASIS}/api/v1/projects/${proyek.id}/struktur`, {
    method: 'POST', headers: H,
    body: JSON.stringify({
      kode: KODE, nama: 'uji mutu nyata', jenis: 'balok', jumlah: 1, input: awal,
      catatan: 'uji-mutu-nyata-hidup.mjs — dihapus otomatis',
    }),
  })
  if (!buat.ok) { console.error(`❌ BUAT elemen gagal ${buat.status}: ${(await buat.text()).slice(0, 200)}`); gagal++; throw new Error('berhenti') }
  const jb = await buat.json()
  const idEl = (jb.data ?? jb)?.id
  if (!idEl) { console.error('❌ balasan BUAT tak memuat id'); gagal++; throw new Error('berhenti') }
  elemenDibuat.push(idEl)
  console.log(`  ✓  ${KODE} dibuat (fc desain ${awal.mutu.fcMpa} MPa, selimut 60)`)

  // ── Uji beton yang SENGAJA jeblok ────────────────────────────────────────
  /*
    120 kg/cm² kubus → ~9,8 MPa silinder. Jauh di bawah fc desain 25 MPa,
    jadi penurunannya pasti menggigit dan temuannya benar-benar teruji.
  */
  const buatUji = await fetch(`${BASIS}/api/v1/projects/${proyek.id}/uji-material`, {
    method: 'POST', headers: H,
    body: JSON.stringify({
      nomor: NOMOR_UJI, objek: `Beton uji otomatis ${JALAN}`,
      jenis_uji: 'Kuat tekan 28 hari', tanggal_uji: '2026-08-20',
      nilai_hasil: 120, nilai_syarat: 250, satuan: 'kg/cm2',
      kesimpulan: 'tidak_memenuhi', catatan: 'uji-mutu-nyata-hidup.mjs — dihapus otomatis',
    }),
  })
  if (!buatUji.ok) {
    console.error(`❌ BUAT uji material gagal ${buatUji.status}: ${(await buatUji.text()).slice(0, 250)}`)
    gagal++
    throw new Error('berhenti')
  }
  const ju = await buatUji.json()
  const idUji = (ju.uji ?? ju.data ?? ju)?.id
  if (idUji) ujiDibuat.push(idUji)
  console.log(`  ✓  uji beton 120 kg/cm² (jeblok) dicatat`)

  // ── (2)(3) Dampaknya ─────────────────────────────────────────────────────
  const m = await bacaMutu()
  if (!m) throw new Error('berhenti')
  if (!m.adaUji) { console.error('❌ adaUji=false padahal uji baru saja dicatat'); gagal++; throw new Error('berhenti') }

  const baris = (m.data ?? []).find((x) => x.kode === KODE)
  if (!baris) {
    console.error(`❌ ${KODE} tak muncul di hasil mutu-nyata`)
    gagal++
  } else {
    console.log('')
    console.log(`     fc desain      ${baris.fcDesainMpa} MPa`)
    console.log(`     fc nyata       ${baris.fcNyataMpa} MPa  (${baris.selisihPersen}%)`)
    console.log(`     aman desain    ${baris.amanDesain}`)
    console.log(`     aman nyata     ${baris.amanNyata}`)
    console.log(`     terpakai       ${baris.terpakaiDesain}% → ${baris.terpakaiNyata}%`)
    if (baris.gagalNyata?.length) console.log(`     gagal nyata    ${baris.gagalNyata.join(', ')}`)
    console.log('')

    if (!(baris.fcNyataMpa < baris.fcDesainMpa)) {
      console.error(`❌ fc nyata ${baris.fcNyataMpa} tidak di bawah desain ${baris.fcDesainMpa}`)
      gagal++
    } else console.log('  ✓  fc nyata terbaca lebih rendah dari desain')

    /*
      ── Konversi diperiksa terhadap NILAI YANG DIHARAPKAN, bukan ambang longgar

      Versi pertama hanya menuntut `fcNyata < 15`. Mutasi sengaja —
      mematikan faktor kubus→silinder (0,83 → 1,0) — LOLOS dari ambang itu:
      120 kg/cm² jadi 11,77 MPa alih-alih 9,77, dan 11,77 tetap di bawah 15.

      Ambang longgar pada angka yang menentukan keselamatan adalah pemeriksa
      yang berpura-pura memeriksa. Yang dituntut sekarang nilai yang dihitung
      tangan:

          120 / 10,197 × 0,83 = 9,77 MPa

      Kalau faktornya dimatikan hasilnya 11,77 — selisih 2 MPa, jauh di luar
      toleransi 0,1 di bawah.
    */
    const FC_HARAP = (120 / 10.197) * 0.83
    if (Math.abs(baris.fcNyataMpa - FC_HARAP) > 0.1) {
      console.error(`❌ fc nyata ${baris.fcNyataMpa} MPa, seharusnya ${FC_HARAP.toFixed(2)} MPa`)
      console.error('   120 kg/cm2 kubus = 120 / 10,197 x 0,83. Salah satu langkahnya tak jalan.')
      console.error('   Kalau ~11,8: faktor kubus->silinder (0,83) mati — beton dianggap 20% lebih kuat.')
      console.error('   Kalau ~120: konversi satuan mati sama sekali.')
      gagal++
    } else {
      console.log(`  ✓  konversi tepat: 120 kg/cm2 -> ${baris.fcNyataMpa} MPa (harap ${FC_HARAP.toFixed(2)})`)
    }
    if (!(baris.terpakaiNyata > baris.terpakaiDesain)) {
      console.error(`❌ rasio terpakai TIDAK naik (${baris.terpakaiDesain}% → ${baris.terpakaiNyata}%)`)
      console.error('   Beton lebih lemah harus membuat elemen lebih terbebani, bukan sebaliknya.')
      gagal++
    } else console.log('  ✓  rasio terpakai NAIK saat mutu turun')

    /*
      ── Temuan hanya SAH bila ambangnya benar-benar terlewati

      Versi pertama menuntut `berubahJadiTidakAman === true` begitu elemen
      lolos di desain. Itu salah: pada 9,77 MPa balok ini MASIH lolos
      (95% < 100%), jadi `false` adalah jawaban yang BENAR. Yang keliru
      adalah tuntutannya.

      Menuntut temuan yang seharusnya tak ada sama buruknya dengan
      melewatkan temuan yang ada — keduanya membuat pemeriksa berbohong.

      Jadi yang diperiksa sekarang: bendera itu KONSISTEN dengan vonisnya,
      apa pun vonisnya.
    */
    const seharusnyaBerubah = baris.amanDesain === true && baris.amanNyata === false
    if (baris.berubahJadiTidakAman !== seharusnyaBerubah) {
      console.error(`❌ bendera berubahJadiTidakAman=${baris.berubahJadiTidakAman}, seharusnya ${seharusnyaBerubah}`)
      gagal++
    } else if (seharusnyaBerubah) {
      console.log('  ✓  TEMUAN: elemen lolos di desain, TIDAK lolos pada mutu nyata')
    } else {
      console.log(`  ·  pada mutu ini elemen masih lolos (${baris.terpakaiNyata}%) — belum jadi temuan`)
    }

    /*
      ── Dan temuannya WAJIB benar-benar terpicu di suatu titik

      Kalau tak pernah, jaminan "temuan terdeteksi" tak teruji sama sekali —
      persis kegagalan yang sudah dibayar di fitur banding sesi ini: mutasi
      lolos karena fixture-nya tak pernah memicu cabangnya.

      Mutu diturunkan lagi sampai ambangnya PASTI terlewati.
    */
    const buatParah = await fetch(`${BASIS}/api/v1/projects/${proyek.id}/uji-material`, {
      method: 'POST', headers: H,
      body: JSON.stringify({
        nomor: `${NOMOR_UJI}-P`, objek: `Beton parah ${JALAN}`,
        jenis_uji: 'Kuat tekan 28 hari', tanggal_uji: '2026-08-20',
        nilai_hasil: 40, nilai_syarat: 250, satuan: 'kg/cm2',
        kesimpulan: 'tidak_memenuhi',
        catatan: 'uji-mutu-nyata-hidup.mjs — dihapus otomatis',
      }),
    })
    if (!buatParah.ok) {
      console.error(`❌ BUAT uji parah gagal ${buatParah.status}`)
      gagal++
    } else {
      const jpx = await buatParah.json()
      const idP = (jpx.uji ?? jpx.data ?? jpx)?.id
      if (idP) ujiDibuat.push(idP)
      const mp = await bacaMutu()
      const bp = (mp?.data ?? []).find((x) => x.kode === KODE)
      if (!bp) {
        console.error('❌ elemen hilang dari hasil sesudah uji parah')
        gagal++
      } else if (!bp.berubahJadiTidakAman) {
        console.error(`❌ pada fc ${bp.fcNyataMpa} MPa elemen TETAP dianggap aman (${bp.terpakaiNyata}%)`)
        console.error('   Temuan tak pernah terpicu — jaminannya tak teruji sama sekali.')
        gagal++
      } else {
        console.log(`  ✓  TEMUAN terpicu pada fc ${bp.fcNyataMpa} MPa: lolos di desain, TIDAK lolos nyata`)
        console.log(`     gagal: ${(bp.gagalNyata ?? []).join(", ")}`)
        if ((mp.jumlahBerubah ?? 0) < 1) {
          console.error('❌ jumlahBerubah tak menghitungnya')
          gagal++
        }
      }
    }
  }

  // ── (5) Kuat TARIK baja tak ikut terbaca ────────────────────────────────
  const buatTarik = await fetch(`${BASIS}/api/v1/projects/${proyek.id}/uji-material`, {
    method: 'POST', headers: H,
    body: JSON.stringify({
      nomor: `${NOMOR_UJI}-T`, objek: `Besi D13 uji ${JALAN}`,
      jenis_uji: 'Kuat tarik', tanggal_uji: '2026-08-20',
      nilai_hasil: 4250, nilai_syarat: 4000, satuan: 'kg/cm2',
      catatan: 'uji-mutu-nyata-hidup.mjs — dihapus otomatis',
    }),
  })
  if (buatTarik.ok) {
    const jt = await buatTarik.json()
    const idT = (jt.uji ?? jt.data ?? jt)?.id
    if (idT) ujiDibuat.push(idT)
    const m2 = await bacaMutu()
    const b2 = (m2?.data ?? []).find((x) => x.kode === KODE)
    if (b2 && b2.fcNyataMpa > 100) {
      console.error(`❌ kuat TARIK baja terbaca sebagai mutu beton (fc ${b2.fcNyataMpa} MPa)`)
      console.error('   Ini membuat SELURUH elemen terlihat sangat aman — arah yang berbahaya.')
      gagal++
    } else console.log('  ✓  kuat tarik baja TIDAK terbaca sebagai mutu beton')
  }

  // ── (4) TIDAK MENULIS apa pun ───────────────────────────────────────────
  const cek = await fetch(`${BASIS}/api/v1/struktur/${idEl}`, { headers: { cookie } })
  const jc = await cek.json()
  const inputSesudah = (jc.data ?? jc)?.elemen?.input ?? (jc.data ?? jc)?.input
  const fcSesudah = inputSesudah?.mutu?.fcMpa
  if (Number(fcSesudah) !== Number(awal.mutu.fcMpa)) {
    console.error(`❌ input elemen BERUBAH (fc ${fcSesudah}) — mutu-nyata menimpa desain`)
    console.error('   Desain adalah KEPUTUSAN; hasil uji adalah PENGUKURAN. Menimpanya')
    console.error('   menghapus jejak apa yang sebenarnya direncanakan.')
    gagal++
  } else console.log(`  ✓  input desain TIDAK ditimpa (fc tetap ${awal.mutu.fcMpa})`)

  const riw = await fetch(`${BASIS}/api/v1/struktur/${idEl}/riwayat`, { headers: { cookie } })
  const jr = await riw.json()
  if ((jr.data ?? []).length !== 0) {
    console.error(`❌ mutu-nyata melahirkan ${jr.data.length} revisi`)
    gagal++
  } else console.log('  ✓  mutu-nyata TIDAK melahirkan revisi')
} catch (e) {
  if (e.message !== 'berhenti') { console.error(`❌ ${e.message}`); gagal++ }
} finally {
  /*
    ── uji_material dibersihkan lewat SQL, bukan lewat rute

    Rutenya TAK PUNYA DELETE — diukur, bukan diasumsikan: `mutu.ts` hanya
    memuat GET dan POST untuk `uji-material`. Versi pertama skrip ini
    memanggil DELETE yang tak pernah ada; ia akan gagal diam-diam dan
    meninggalkan baris uji di proyek SUNGGUHAN.

    Menambah rute DELETE hanya demi pembersihan uji adalah menambah jalan
    hapus untuk catatan mutu ber-sertifikat — persis yang TIDAK boleh
    dipermudah. Jadi pembersihannya lewat basis, memakai id yang skrip ini
    sendiri catat.
  */
  {
    try {
      /*
        Jalur diturunkan dari LETAK SKRIP INI, bukan dihitung tangan.

        Hitungan tangan sudah salah dua kali di sini ('../../../' lalu
        '../../../../') karena worktree bersarang dua tingkat di bawah
        `.claude/`. Yang salah tak berteriak: pembersihannya gagal diam-diam
        dan MENINGGALKAN dua baris uji di basis sungguhan.
      */
      const { fileURLToPath } = await import('node:url')
      const { dirname, resolve } = await import('node:path')
      const sini = dirname(fileURLToPath(import.meta.url))
      const akar = resolve(sini, '..', '..', '..')   // apps/api/scripts -> akar repo
      const { buatClient } = await import(
        new URL('file://' + resolve(akar, 'scripts', 'db', '_koneksi.mjs').replace(/\\/g, '/')).href)
      const c = buatClient()
      await c.connect()
      /*
        Disapu berdasarkan NOMOR, bukan hanya id yang sempat terurai.

        Rute uji-material memulangkan `{ uji: data }` — bukan `{ id }` dan
        bukan `{ data: { id } }`. Versi pertama skrip ini mencari dua bentuk
        terakhir, gagal, lalu `ujiDibuat` tetap kosong: pembersihannya tak
        punya apa pun untuk dihapus dan MELAPOR BERHASIL. Tiga baris uji
        tertinggal di basis sungguhan sementara skripnya exit 0.

        Ini kali KETIGA dalam sesi ini penguraian id menyebabkan kebocoran.
        Pelajarannya sama tiap kali: pembersihan tak boleh bergantung pada
        penguraian jawaban berhasil. Nomor sudah kita tentukan sendiri
        SEBELUM permintaan dikirim — itu yang dipakai.
      */
      const r = await c.query(
        'DELETE FROM public.uji_material WHERE nomor LIKE $1',
        [NOMOR_UJI + '%'])
      await c.end()
      console.log(`  (${r.rowCount} baris uji material dibersihkan)`)
      /*
        NOL baris terhapus adalah KEGAGALAN, bukan "tak ada yang perlu
        dibersihkan": skrip ini selalu membuat setidaknya satu baris uji.
      */
      if (!r.rowCount) {
        console.error('❌ NOL baris uji terhapus — padahal skrip ini membuat beberapa.')
        console.error(`   Sapu manual: nomor LIKE ${NOMOR_UJI}%`)
        gagal++
      }
    } catch (e) {
      console.error(`❌ GAGAL membersihkan uji_material: ${e.message}`)
      console.error('   Baris uji TERTINGGAL di basis sungguhan — sapu manual:')
      console.error(`   id: ${ujiDibuat.join(", ")}`)
      gagal++
    }
  }
  for (const id of elemenDibuat) {
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

if (gagal) { console.error(`\n❌ ${gagal} masalah pada banding mutu nyata\n`); process.exit(1) }
console.log('\n✅ Mutu nyata dibandingkan ke desain, dan TIDAK menimpa apa pun\n')
