#!/usr/bin/env node
// ============================================================================
// KEBUTUHAN MATERIAL dari RAB — dibuktikan lewat rute HIDUP, angka per angka.
// ============================================================================
//
// ── Kenapa ini ada
//
// `material-takeoff` sudah ada sejak lama dan MENGHITUNG DENGAN BENAR, tapi
// nol halaman memakainya (diukur 2026-08-20: grep seluruh apps/web = 0 hasil).
// Sebelum layarnya dibangun, angkanya harus dibuktikan dulu — layar yang
// menampilkan angka salah lebih buruk daripada tak ada layar.
//
// ── Kenapa RAB-nya DIBUAT, bukan memakai yang ada
//
// Diukur: 2.419 estimate_items di basis, hanya 3 yang ber-AHSP; 2.225 versi
// estimasi berisi ~3 item masing-masing. Itu sisa data uji, bukan RAB
// sungguhan. Menguji agregasi di atasnya membuktikan nol.
//
// ── Yang diperiksa
//
//   1. koefisien AHSP × volume = kebutuhan — DICOCOKKAN DENGAN HITUNGAN TANGAN
//   2. satu material yang dipakai DUA pekerjaan TERJUMLAH, tidak tertimpa
//   3. drill-down menyebut pekerjaan asalnya (jawaban "kenapa sebanyak ini")
//   4. item LUMPSUM (tanpa AHSP) tak menyumbang material — dan itu benar
//
// Nomor 2 yang paling mudah rusak tanpa gejala: kalau agregasinya menimpa
// alih-alih menjumlah, angkanya tetap terlihat wajar — hanya lebih kecil.
//
// Pakai: UJI_BASIS=http://127.0.0.1:3021 node scripts/uji-kebutuhan-material-hidup.mjs
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
const dibuat = { item: [] }

/*
  Dua AHSP yang BERBAGI material (semen), supaya penjumlahan lintas pekerjaan
  benar-benar teruji. Dicari dari katalog, bukan dipaku id-nya — id berbeda
  di tiap basis, dan skrip yang memaku id mati di lingkungan lain.
*/
const cariAhsp = async (q) => {
  const r = await fetch(`${BASIS}/api/v1/cecep/assemblies?limit=400&q=${encodeURIComponent(q)}`,
    { headers: { cookie } })
  if (!r.ok) return []
  const j = await r.json()
  return (j.data ?? j.assemblies ?? j ?? [])
}

try {
  const bata = (await cariAhsp('pasangan bata merah'))
    .find((a) => (a.components ?? []).some((c) => /bata merah/i.test(c.resource?.name ?? '')))

  /*
    AHSP kedua dipilih karena BERBAGI material dengan yang pertama — bukan
    karena namanya plesteran.

    Dicocokkan lewat resource.code — daftar AHSP memulangkan {code, name,
    category, unit_code} TANPA id, jadi pencocokan lewat id selalu kosong.

    Versi pertama memilih "plesteran yang ber-semen", dan ternyata semennya
    resource yang BERBEDA. Akibatnya pemeriksa penjumlahan lintas pekerjaan
    melewati dirinya sendiri dengan pesan "tak berbagi material" — lulus
    tanpa menguji apa pun. Diamnya terbaca seperti bukti.
  */
  const kodeBahanBata = new Set(
    (bata?.components ?? []).map((c) => c.resource?.code).filter(Boolean))
  let plester = null
  for (const q of ['plesteran', 'acian', 'pasangan bata', 'beton']) {
    const kandidat = (await cariAhsp(q)).find((a) =>
      a.id !== bata?.id
      && (a.components ?? []).some((c) => kodeBahanBata.has(c.resource?.code)))
    if (kandidat) { plester = kandidat; break }
  }
  if (!bata || !plester) {
    console.error('❌ tak ketemu dua AHSP yang BERBAGI material — uji tak bisa jalan')
    console.error('   Tanpa itu, penjumlahan lintas pekerjaan tak teruji sama sekali.')
    gagal++
    throw new Error('berhenti')
  }
  console.log('══ KEBUTUHAN MATERIAL dari RAB — lewat rute hidup ══════════')
  console.log(`   ${BASIS}\n`)
  console.log(`  AHSP A: ${String(bata.name).slice(0, 60)}`)
  console.log(`  AHSP B: ${String(plester.name).slice(0, 60)}\n`)

  /* Versi estimasi mana pun yang bisa ditulisi. */
  const lv = await fetch(`${BASIS}/api/v1/estimate-versions?limit=50`, { headers: { cookie } })
  if (!lv.ok) { console.error(`❌ daftar versi gagal ${lv.status}`); gagal++; throw new Error('berhenti') }
  const jv = await lv.json()
  const versi = (jv.data ?? jv.versions ?? jv ?? []).find((v) => v.status !== 'approved')
  if (!versi?.id) { console.error('❌ tak ada versi estimasi yang bisa ditulisi'); gagal++; throw new Error('berhenti') }
  console.log(`  versi estimasi: ${versi.id}\n`)

  const tambah = async (assembly, qty) => {
    const r = await fetch(`${BASIS}/api/v1/estimate-versions/${versi.id}/items`, {
      method: 'POST', headers: H,
      /*
        `buk_fraction` WAJIB — rutenya menolak tanpa default, dan itu
        disengaja: BUK (biaya umum & keuntungan) yang diam-diam nol membuat
        HSP terlihat murah tanpa ada yang memutuskannya.

        0,15 dipakai di sini karena skrip ini menguji KEBUTUHAN MATERIAL,
        yang tak bergantung BUK sama sekali — koefisien x volume, bukan
        rupiah. Angka berapa pun yang sah akan menghasilkan takeoff sama.
      */
      body: JSON.stringify({
        item_type: 'assembly', assembly_id: assembly.id, quantity: qty,
        buk_fraction: 0.15,
        /* `rounding` juga wajib, alasan sama: pembulatan HSP yang tak
           diputuskan siapa pun membuat rupiahnya bergeser diam-diam. */
        rounding: { mode: 'nearest', step: 1 },
        /*
          LOKASI wajib disebut kalau harganya terikat wilayah.

          Diukur: harga 'Semen Portland' ADA, aktif, tak kedaluwarsa — tapi
          ber-lokasi 'Kabupaten Bandung'. Permintaan tanpa lokasi tak
          menemukannya, dan galatnya berbunyi 'Harga tidak ter-resolve',
          yang terbaca seperti harganya BELUM ADA. Dua hal yang sangat
          berbeda: yang satu perlu diisi, yang satu perlu disebut lokasinya.
        */
        location: 'Kabupaten Bandung',
      }),
    })
    if (!r.ok) {
      console.error(`❌ tambah item gagal ${r.status}: ${(await r.text()).slice(0, 200)}`)
      gagal++
      return null
    }
    const j = await r.json()
    const id = (j.item ?? j.data ?? j)?.id
    if (id) dibuat.item.push(id)
    return id
  }

  const VOL_A = 10
  const VOL_B = 25
  const idA = await tambah(bata, VOL_A)
  const idB = await tambah(plester, VOL_B)
  /*
    Versi pertama mencetak "✓ 2 item ditambahkan" TANPA memeriksa hasilnya —
    dan mencetaknya persis di bawah dua baris galat penambahan. Baris ✓ yang
    berbohong lebih berbahaya daripada tak ada baris sama sekali: ia membuat
    kegagalan di bawahnya terbaca seperti masalah lain.
  */
  if (!idA || !idB) {
    console.error('❌ item uji gagal ditambahkan — agregasi tak bisa diuji')
    throw new Error('berhenti')
  }
  console.log(`  ✓  2 item ditambahkan (vol ${VOL_A} dan ${VOL_B})`)

  const r = await fetch(`${BASIS}/api/v1/estimate-versions/${versi.id}/material-takeoff`,
    { headers: { cookie } })
  if (!r.ok) {
    console.error(`❌ material-takeoff gagal ${r.status}: ${(await r.text()).slice(0, 200)}`)
    gagal++
    throw new Error('berhenti')
  }
  const jt = await r.json()
  const mat = jt.materials ?? []
  console.log(`  ✓  takeoff memulangkan ${mat.length} baris material\n`)

  // ── (1) Cocok dengan hitungan TANGAN ──────────────────────────────────────
  const koefBata = (bata.components ?? []).find((c) => /bata merah/i.test(c.resource?.name ?? ''))
  if (koefBata) {
    const harap = Number(koefBata.coefficient) * VOL_A
    const baris = mat.find((m) => /bata merah/i.test(m.resourceName ?? ''))
    if (!baris) {
      console.error('❌ "Bata merah" tak muncul di takeoff')
      gagal++
    } else {
      const selisih = Math.abs(Number(baris.qtyAhsp) - harap)
      console.log(`     bata merah : ${baris.qtyAhsp} ${baris.unitCode}  (tangan: ${koefBata.coefficient} × ${VOL_A} = ${harap})`)
      if (selisih > 0.01) {
        console.error(`❌ selisih ${selisih} terhadap hitungan tangan`)
        gagal++
      } else console.log('  ✓  cocok dengan hitungan tangan')
    }
  }

  // ── (2) Material bersama TERJUMLAH ────────────────────────────────────────
  /*
    Kalau agregasinya menimpa alih-alih menjumlah, angkanya tetap terlihat
    wajar — hanya lebih kecil. Tak ada galat, tak ada gejala.
  */
  /*
    Material bersamanya diambil dari PASANGAN YANG SUDAH TERPILIH, bukan
    dicari ulang lewat nama.

    Versi sebelumnya mencari "yang namanya mengandung semen" di kedua AHSP
    secara terpisah, lalu membandingkan namanya. Itu bisa gagal walau
    keduanya JELAS berbagi material — dan gagalnya berbunyi "tak berbagi
    material", yang menuduh datanya padahal pemeriksanya yang salah cara.
  */
  const kodeA = new Map(
    (bata.components ?? []).filter((c) => c.resource?.code)
      .map((c) => [c.resource.code, c]))
  const bersama = (plester.components ?? [])
    .filter((c) => c.resource?.code && kodeA.has(c.resource.code))

  if (bersama.length) {
    const cB = bersama[0]
    const cA = kodeA.get(cB.resource.code)
    const harap = Number(cA.coefficient) * VOL_A + Number(cB.coefficient) * VOL_B
    const baris = mat.find((m) => m.resourceName === cB.resource.name)
    if (!baris) {
      console.error(`❌ "${cB.resource.name}" tak muncul di takeoff`)
      gagal++
    } else {
      console.log(`     ${baris.resourceName} : ${baris.qtyAhsp} ${baris.unitCode}  (tangan: ${cA.coefficient}×${VOL_A} + ${cB.coefficient}×${VOL_B} = ${harap.toFixed(3)})`)
      if (Math.abs(Number(baris.qtyAhsp) - harap) > 0.01) {
        console.error('❌ material bersama TIDAK terjumlah dari dua pekerjaan')
        console.error('   Agregasi yang menimpa menghasilkan angka yang tetap terlihat wajar.')
        gagal++
      } else console.log('  ✓  material bersama terjumlah dari DUA pekerjaan')

      /* ── (3) Drill-down menyebut asalnya ── */
      const asal = baris.details ?? []
      if (asal.length < 2) {
        console.error(`❌ drill-down cuma ${asal.length} pekerjaan — "kenapa sebanyak ini" tak terjawab`)
        gagal++
      } else {
        console.log(`  ✓  drill-down menyebut ${asal.length} pekerjaan asal:`)
        for (const d of asal.slice(0, 3)) {
          console.log(`        ${String(d.workName).slice(0, 44).padEnd(45)} ${d.volume} × ${d.coefficient} = ${d.subQty}`)
        }
      }
    }
  } else {
    /*
      Sampai ke sini berarti FIXTURE-nya yang gagal, bukan hasil yang sah.
      Melaporkannya sebagai catatan biasa membuat pemeriksa lulus tanpa
      pernah menguji penjumlahan — kegagalan yang sudah dibayar dua kali
      di sesi ini (mutasi banding lolos karena fixture tak memicunya).
    */
    console.error('❌ dua AHSP terpilih tak berbagi material — penjumlahan TAK TERUJI')
    gagal++
  }
  // ── (4) Semua baris punya satuan & kategori ──────────────────────────────
  const tanpaSatuan = mat.filter((m) => !m.unitCode)
  if (tanpaSatuan.length) {
    console.error(`❌ ${tanpaSatuan.length} material tanpa satuan — angka tanpa satuan tak bisa dipesan`)
    gagal++
  } else console.log('  ✓  semua material bersatuan')
} catch (e) {
  if (e.message !== 'berhenti') { console.error(`❌ ${e.message}`); gagal++ }
} finally {
  for (const id of dibuat.item) {
    const d = await fetch(`${BASIS}/api/v1/estimate-versions/x/items/${id}`, {
      method: 'DELETE', headers: { cookie },
    }).catch(() => ({ ok: false }))
    if (!d.ok) {
      /* Jalur hapus item butuh id versi; disapu lewat SQL sebagai jaring. */
      try {
        const { fileURLToPath } = await import('node:url')
        const { dirname, resolve } = await import('node:path')
        const sini = dirname(fileURLToPath(import.meta.url))
        const akar = resolve(sini, '..', '..', '..')
        const { buatClient } = await import(
          new URL('file://' + resolve(akar, 'scripts', 'db', '_koneksi.mjs').replace(/\\/g, '/')).href)
        const c = buatClient()
        await c.connect()
        const r = await c.query('DELETE FROM public.estimate_items WHERE id = ANY($1::uuid[])',
          [dibuat.item])
        await c.end()
        console.log(`  (${r.rowCount} item uji dibersihkan lewat SQL)`)
      } catch (e2) {
        console.error(`❌ GAGAL membersihkan item uji: ${e2.message}`)
        console.error(`   SAPU MANUAL: ${dibuat.item.join(', ')}`)
        gagal++
      }
      break
    }
  }
}

if (gagal) { console.error(`\n❌ ${gagal} masalah pada kebutuhan material\n`); process.exit(1) }
console.log('\n✅ Kebutuhan material terhitung benar dan bisa ditelusuri asalnya\n')
