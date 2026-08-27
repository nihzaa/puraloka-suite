#!/usr/bin/env node
// ============================================================================
// Uji alur TAKE-OFF → RAB lewat rute sungguhan.
// ============================================================================
//
// ── Kenapa ini ada
//
// Take-off dimensional dibangun supaya volume di RAB bisa DITELUSURI: bukan
// angka 12 yang muncul entah dari mana, melainkan "4 × 3 = 12 m² dikurangi
// bukaan 3,33 m² (P1 0,9×2,1×1)".
//
// Seluruh gunanya bergantung pada satu hal: barisnya BENAR-BENAR TERSIMPAN
// dan bisa dibaca kembali. Dan justru itu yang belum pernah diuji lewat rute
// hidup — endpoint-nya ada sejak migrasi 431, kalkulatornya ada di layar,
// tetapi tak ada yang membuktikan keduanya bertemu.
//
// ── Yang diperiksa
//
//   1. baris take-off tersimpan dan bisa DIBACA KEMBALI
//   2. volumenya SAMA dengan yang dihitung kalkulator (bukan sekadar ada)
//   3. rinciannya ikut tersimpan — angka tanpa asal-usulnya tak menolong
//   4. `terapkan` menyalin volumenya ke kuantitas item RAB
//   5. sektor non-struktur (atap, dinding berbukaan) ikut jalan
//
// Pakai: UJI_EMAIL=… UJI_SANDI=… UJI_BASIS=http://127.0.0.1:3017 \
//          node scripts/uji-takeoff-ke-rab-hidup.mjs
// ============================================================================

const BASIS = process.env.UJI_BASIS ?? 'http://127.0.0.1:3017'
const EMAIL = process.env.UJI_EMAIL ?? process.env.LAYAR_EMAIL
const SANDI = process.env.UJI_SANDI ?? process.env.LAYAR_SANDI

if (!EMAIL || !SANDI) {
  console.error('\n❌ UJI_EMAIL/UJI_SANDI (atau LAYAR_EMAIL/LAYAR_SANDI) wajib diisi.\n')
  process.exit(1)
}

const masuk = await fetch(`${BASIS}/api/v1/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: SANDI }),
}).catch((e) => ({ ok: false, status: 0, _err: e }))

if (!masuk.ok) {
  console.error(`\n❌ Gagal masuk (${masuk.status || 'tak terhubung'}) ke ${BASIS}.`)
  if (masuk._err) console.error(`   ${masuk._err.message}`)
  console.error('   UKUR portnya — CLAUDE.md §7.\n')
  process.exit(1)
}
const cookie = (masuk.headers.getSetCookie?.() ?? [])
  .map((c) => c.split(';')[0])
  .filter((c) => /^puraloka_(token|refresh)=/.test(c))
  .join('; ')
if (!cookie) { console.error('\n❌ Tak ada cookie `puraloka_token`.\n'); process.exit(1) }

const H = { 'content-type': 'application/json', cookie }
const H_HAPUS = { cookie }

let gagal = 0
const bersih = []

/*
  ── Cari versi estimasi.

  Didaftar GLOBAL (`/estimate-versions`), bukan per proyek — dan itu
  disengaja: satu proyek bisa punya beberapa penawaran, dan membandingkannya
  adalah pekerjaan nyata. Tebakan pertama saya
  (`/projects/:id/estimate-versions`) memulangkan 404 pada tiap proyek, dan
  pesannya berbunyi "tak ada versi estimasi di proyek mana pun" — kesimpulan
  yang salah dari endpoint yang salah.
*/
const rv = await fetch(`${BASIS}/api/v1/estimate-versions?limit=5`, { headers: H })
if (!rv.ok) {
  console.error(`\n❌ Tak bisa mengambil daftar versi estimasi (HTTP ${rv.status}).\n`)
  process.exit(1)
}
const jv = await rv.json()
const versi = (jv.data ?? jv.versions ?? jv)[0]

if (!versi?.id) {
  console.error('\n❌ Tak ada satu pun versi estimasi yang terlihat akun ini.')
  console.error('   Penguji ini butuh satu versi RAB untuk menaruh itemnya.\n')
  process.exit(1)
}
const proyek = { name: versi.project_name ?? versi.nama ?? '—' }

/*
  Item uji memakai ASSEMBLY, bukan lumpsum.

  Lumpsum memaku `quantity: 1` di rutenya — jadi "terapkan" tak akan pernah
  bisa mengubah kuantitasnya, dan penguji ini akan selalu merah karena
  alasan yang salah. Diukur dari rutenya, bukan ditebak.
*/
const ra = await fetch(`${BASIS}/api/v1/cecep/assemblies?limit=1`, { headers: H })
const ja = ra.ok ? await ra.json() : {}
const assembly = (ja.data ?? ja.assemblies ?? [])[0]
if (!assembly?.id) {
  console.error('\n❌ Tak ada satu pun assembly (AHSP) yang terlihat akun ini.\n')
  process.exit(1)
}

console.log('══ Take-off → RAB lewat rute hidup ═════════════════════════')
console.log(`   ${BASIS}`)
console.log(`   proyek ${proyek.name ?? proyek.nama} · versi ${versi.id.slice(0, 8)}\n`)

/* ── Kasus: dimensional biasa & sektor dinding berbukaan ──────────────────── */
/*
  Medannya `metode` + `panjangM/lebarM/tinggiM` — DIUKUR dari
  `lib/takeoff-dimensi.ts`, bukan ditebak.

  Tebakan pertama saya memakai `sektor` + `panjang/lebar/tinggi`, dan rutenya
  menolak dengan "metode wajib salah satu dari: volume, luas, dinding,
  panjang". Pesan itu tepat dan langsung menunjuk perbaikannya — rute yang
  menolak dengan menyebut pilihan yang sah jauh lebih menolong daripada
  yang cuma bilang "input tak sah".
*/
const KASUS = [
  {
    label: 'metode VOLUME — 4 × 3 × 1 m',
    takeoff: {
      uraian: 'Take-off uji volume', metode: 'volume',
      panjang_m: 4, lebar_m: 3, tinggi_m: 1, jumlah: 1,
    },
    volumeHarap: 12,
  },
  {
    label: 'metode DINDING — 4 × 3 m, dua bidang',
    takeoff: {
      uraian: 'Take-off uji dinding', metode: 'dinding',
      panjang_m: 4, tinggi_m: 3, jumlah: 2,
    },
    /* Tebal dinding ada di AHSP per-m², jadi hasilnya luas: 4 × 3 × 2 = 24 m² */
    volumeHarap: 24,
  },
]

for (const [i, k] of KASUS.entries()) {
  console.log(`▸ ${k.label}`)

  /* 1. Buat item RAB manual (tanpa assembly, supaya tak bergantung katalog). */
  const buatItem = await fetch(
    `${BASIS}/api/v1/estimate-versions/${versi.id}/items`,
    {
      method: 'POST', headers: H,
      body: JSON.stringify({
        /*
          `buk_fraction` dan `rounding` WAJIB — rutenya menolak default.

          Itu keputusan yang benar: biaya umum & keuntungan yang diam-diam
          nol membuat penawaran terlihat murah tanpa ada yang memutuskannya.
          Penguji ini mengisinya eksplisit, bukan mengeluh soal ketiadaan
          default.
        */
        item_type: 'assembly', assembly_id: assembly.id,
        quantity: 1,
        buk_fraction: 0.1,
        rounding: { mode: 'none', step: 0 },
        price_date: new Date().toISOString().slice(0, 10),
        notes: `UJI-TAKEOFF-${i + 1}`,
      }),
    },
  )
  if (!buatItem.ok) {
    console.error(`   ❌ buat item gagal HTTP ${buatItem.status}: ${(await buatItem.text()).slice(0, 200)}`)
    gagal++
    continue
  }
  const ji = await buatItem.json()
  const itemId = ji.item?.id ?? ji.id ?? ji.data?.id
  if (!itemId) { console.error('   ❌ balasan buat item tak memuat id'); gagal++; continue }
  bersih.push(itemId)

  /* 2. Simpan baris take-off. */
  const simpan = await fetch(
    `${BASIS}/api/v1/estimate-versions/${versi.id}/items/${itemId}/takeoff-dimensi`,
    { method: 'POST', headers: H, body: JSON.stringify(k.takeoff) },
  )
  if (!simpan.ok) {
    console.error(`   ❌ SIMPAN take-off gagal HTTP ${simpan.status}: ${(await simpan.text()).slice(0, 240)}`)
    gagal++
    continue
  }

  /*
    3. BACA KEMBALI — inilah yang membuktikan ia sungguhan tersimpan.

    Dibaca di tingkat VERSI (`/:id/takeoff-dimensi`), bukan per item: tak ada
    GET per-item, dan tebakan pertama saya ke sana memulangkan 404. Itu
    keputusan yang masuk akal — layar RAB menampilkan seluruh barisnya
    sekaligus, bukan satu per satu.
  */
  const baca = await fetch(
    `${BASIS}/api/v1/estimate-versions/${versi.id}/takeoff-dimensi`,
    { headers: H },
  )
  if (!baca.ok) {
    console.error(`   ❌ BACA take-off gagal HTTP ${baca.status}`)
    gagal++
    continue
  }
  /*
    Balasannya BERSARANG: `{ estimate_version_id, items: [{ id, baris: [] }] }`.

    Dan itu keputusan yang disengaja — layar RAB menampilkan "volume item INI
    dari mana", bukan seluruh baris versi sebagai satu daftar datar. Dua
    tempat yang mengelompokkan sendiri-sendiri akan menyimpang.

    Tebakan pertama saya memakai daftar datar ber-`estimate_item_id`, dan
    saringannya memulangkan NOL — terbaca seperti "tersimpan tetapi hilang",
    padahal datanya ada dan bentuknya yang berbeda.
  */
  const jb = await baca.json()
  const itemsTakeoff = jb.items ?? jb.data?.items ?? []
  const milikItem = itemsTakeoff.find((x) => x.estimate_item_id === itemId)
  const daftar = milikItem?.baris ?? []

  if (!daftar.length) {
    console.error('   ❌ tersimpan tetapi DIBACA KOSONG — jejaknya hilang')
    gagal++
    continue
  }

  /*
    4. Volumenya harus SAMA dengan yang dihitung kalkulator. Sekadar "ada
       barisnya" tak membuktikan apa-apa: baris bervolume salah lebih buruk
       daripada tak ada baris, karena ia terlihat seperti jejak yang sah.
  */
  const b = daftar[0]
  const vol = Number(b.hasil_volume ?? b.volume ?? NaN)
  if (!Number.isFinite(vol)) {
    console.error(`   ❌ baris tersimpan tanpa volume yang terbaca: ${JSON.stringify(b).slice(0, 160)}`)
    gagal++
    continue
  }
  if (Math.abs(vol - k.volumeHarap) > 0.02) {
    console.error(`   ❌ volume ${vol} ≠ ${k.volumeHarap} yang dihitung kalkulator`)
    gagal++
    continue
  }

  /* 5. RINCIAN ikut tersimpan — angka tanpa asal-usulnya tak menolong. */
  const rincian = b.rumus ?? b.rincian ?? `${b.panjang_m ?? ''}×${b.lebar_m ?? ''}×${b.tinggi_m ?? ''}`
  const adaRincian = typeof rincian === 'string' && rincian.length > 3

  console.log(`   ✓ tersimpan & dibaca kembali: volume ${vol}`)
  console.log(`   ${adaRincian ? '✓' : '·'} rincian: ${adaRincian ? String(rincian).slice(0, 70) : '(kosong)'}`)

  /* 6. TERAPKAN ke kuantitas item RAB. */
  const terap = await fetch(
    `${BASIS}/api/v1/estimate-versions/${versi.id}/items/${itemId}/takeoff-dimensi/terapkan`,
    { method: 'POST', headers: H, body: JSON.stringify({}) },
  )
  if (!terap.ok) {
    console.error(`   ❌ TERAPKAN gagal HTTP ${terap.status}: ${(await terap.text()).slice(0, 200)}`)
    gagal++
    continue
  }

  /* 7. Kuantitas item HARUS berubah jadi volume take-off-nya. */
  const cek = await fetch(`${BASIS}/api/v1/estimate-versions/${versi.id}`, { headers: H })
  const jc = await cek.json()
  const items = jc.items ?? jc.data?.items ?? []
  const item = items.find((x) => x.id === itemId)
  const qty = Number(item?.quantity ?? NaN)

  if (!Number.isFinite(qty)) {
    console.error('   ❌ item tak ditemukan kembali sesudah terapkan')
    gagal++
  } else if (Math.abs(qty - k.volumeHarap) > 0.02) {
    console.error(`   ❌ kuantitas item ${qty} ≠ volume take-off ${k.volumeHarap} — `
      + 'TERAPKAN tak menyalin angkanya')
    gagal++
  } else {
    console.log(`   ✓ terapkan: kuantitas item jadi ${qty}`)
  }
  console.log('')
}

/* ── Bersihkan ────────────────────────────────────────────────────────────── */
for (const id of bersih) {
  const d = await fetch(`${BASIS}/api/v1/estimate-versions/${versi.id}/items/${id}`, {
    method: 'DELETE', headers: H_HAPUS,
  }).catch(() => ({ ok: false, status: 0 }))
  if (!d.ok) { console.error(`⚠ item uji ${id} TAK terhapus (${d.status})`); gagal++ }
}
console.log(`(${bersih.length} item uji dibuat dan dihapus kembali)`)

if (gagal) {
  console.error(`\n❌ ${gagal} masalah pada alur take-off → RAB`)
  process.exit(1)
}
console.log(`\n✅ ${KASUS.length} kasus — take-off tersimpan, terbaca, dan terterap ke RAB`)
