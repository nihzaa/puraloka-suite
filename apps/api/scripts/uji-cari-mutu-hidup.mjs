#!/usr/bin/env node
// ============================================================================
// PENCARIAN AHSP SADAR MUTU — dibuktikan lewat rute HIDUP, bukan pola saja.
// ============================================================================
//
// ── Kenapa harus lewat rute
//
// Yang diperluas modul ini adalah klausa `or()` PostgREST, dan di dalamnya ada
// tanda kutip tunggal (`f'c`). Apakah PostgREST menerimanya TIDAK bisa
// dijawab dengan menguji fungsi pembangun polanya — hanya basis yang tahu.
//
// Kegagalan yang paling mungkin justru senyap: klausa yang ditolak sebagian
// memulangkan HASIL, hanya hasil yang salah. Karena itu yang diperiksa bukan
// "ada hasil", melainkan hasil yang BENAR-BENAR memuat kedua bahasa.
//
// ── Yang diperiksa
//
//   1. "K-300" menemukan yang ber-K DAN yang ber-f'c 25
//   2. "K300" (tanpa tanda hubung) tidak lagi NOL
//   3. "f'c 25" menemukan balik yang ber-K-300
//   4. kata kunci BIASA tak berubah perilakunya
//   5. kata kunci ngawur tetap NOL — perluasan tak boleh membuat segalanya cocok
//
// Nomor 5 yang menahan cacat paling berbahaya di fitur ini: klausa `or` yang
// salah bentuk bisa membuat SETIAP baris cocok, dan daftar yang memuat
// segalanya terlihat seperti pencarian yang berhasil.
//
// Pakai: UJI_BASIS=http://127.0.0.1:3021 node scripts/uji-cari-mutu-hidup.mjs
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

let gagal = 0

const cari = async (q) => {
  const r = await fetch(
    `${BASIS}/api/v1/cecep/assemblies?limit=5000&q=${encodeURIComponent(q)}`,
    { headers: { cookie } })
  if (!r.ok) {
    console.error(`❌ cari "${q}" gagal HTTP ${r.status}: ${(await r.text()).slice(0, 250)}`)
    gagal++
    return null
  }
  const j = await r.json()
  return j.data ?? j.assemblies ?? j ?? []
}

console.log('══ Pencarian AHSP sadar mutu beton — lewat rute hidup ══════')
console.log(`   ${BASIS}\n`)

/* Berapa TOTAL katalog — dipakai memastikan perluasan tak membuat semua cocok. */
const semua = await cari('')
const TOTAL = Array.isArray(semua) ? semua.length : 0
console.log(`  katalog: ${TOTAL} analisa\n`)
if (TOTAL < 10) { console.error('❌ katalog terlalu kecil untuk menguji apa pun'); process.exit(1) }

// ── (1) K-300 menjangkau DUA bahasa ────────────────────────────────────────
const k300 = await cari('K-300')
if (k300) {
  const berK = k300.filter((x) => /K[- ]?300/i.test(x.name ?? ''))
  const berFc = k300.filter((x) => /f'c\s*25/i.test(x.name ?? ''))
  console.log(`  "K-300"  -> ${k300.length} hasil · ber-K ${berK.length} · ber-f'c25 ${berFc.length}`)
  if (!berK.length) { console.error('❌ tak menemukan satu pun yang ber-K-300'); gagal++ }
  if (!berFc.length) {
    console.error("❌ tak menemukan yang ber-f'c 25 — perluasan tak sampai ke bahasa satunya")
    console.error('   Inilah seluruh alasan fitur ini ada.')
    gagal++
  }
  if (berK.length && berFc.length) console.log('  ✓  "K-300" menjangkau KEDUA bahasa katalog')
}

// ── (2) K300 tanpa tanda hubung ────────────────────────────────────────────
const k300polos = await cari('K300')
if (k300polos) {
  console.log(`  "K300"   -> ${k300polos.length} hasil`)
  if (!k300polos.length) {
    console.error('❌ "K300" masih NOL — nol hasil terbaca sebagai "analisanya tak ada"')
    gagal++
  } else console.log('  ✓  "K300" tak lagi nol')
}

// ── (3) Arah sebaliknya ────────────────────────────────────────────────────
const fc25 = await cari("f'c 25")
if (fc25) {
  const berK = fc25.filter((x) => /K[- ]?300/i.test(x.name ?? ''))
  console.log(`  "f'c 25" -> ${fc25.length} hasil · di antaranya ber-K-300 ${berK.length}`)
  if (!berK.length) { console.error("❌ \"f'c 25\" tak menjangkau balik yang ber-K-300"); gagal++ }
  else console.log('  ✓  arah sebaliknya juga bekerja')
}

// ── (4) Kata kunci BIASA tak berubah ───────────────────────────────────────
const biasa = await cari('bekisting')
if (biasa) {
  const cocok = biasa.filter((x) => /bekisting/i.test(x.name ?? ''))
  console.log(`  "bekisting" -> ${biasa.length} hasil · benar-benar memuat kata itu ${cocok.length}`)
  if (biasa.length !== cocok.length) {
    console.error('❌ pencarian biasa ikut membawa baris yang tak memuat kata kuncinya')
    gagal++
  } else if (!biasa.length) {
    console.error('❌ "bekisting" nol — pencarian biasa RUSAK oleh perubahan ini')
    gagal++
  } else console.log('  ✓  pencarian biasa tak berubah perilakunya')
}

// ── (5) Ngawur tetap NOL ───────────────────────────────────────────────────
/*
  Penahan cacat paling berbahaya: klausa `or` yang salah bentuk bisa membuat
  SETIAP baris cocok — dan daftar yang memuat segalanya terlihat persis seperti
  pencarian yang berhasil.
*/
const ngawur = await cari('zzqqxx-tidak-ada-ini')
if (ngawur) {
  console.log(`  "zzqqxx…" -> ${ngawur.length} hasil (harus 0)`)
  if (ngawur.length) {
    console.error('❌ kata kunci ngawur memulangkan hasil — klausa or bocor')
    console.error('   Daftar yang memuat segalanya terlihat seperti pencarian yang berhasil.')
    gagal++
  } else console.log('  ✓  ngawur tetap nol')
}

/* Dan K-300 tak boleh memulangkan SELURUH katalog. */
if (k300 && k300.length >= TOTAL) {
  console.error(`❌ "K-300" memulangkan ${k300.length} dari ${TOTAL} — praktis seluruh katalog`)
  gagal++
}

if (gagal) { console.error(`\n❌ ${gagal} masalah pada pencarian sadar mutu\n`); process.exit(1) }
console.log('\n✅ Pencarian menjangkau dua bahasa katalog, tanpa merusak pencarian biasa\n')
