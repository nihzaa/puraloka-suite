#!/usr/bin/env node
// ============================================================================
// PENJAGA — test tak boleh membandingkan DUA hitungan global schema bersama.
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA PENJAGA INI ADA
// ══════════════════════════════════════════════════════════════════════════
//
// TUJUH kali dalam satu rantai kerja, CI merah karena cacat yang SAMA: test
// membuat asumsi global atas schema `public` yang dipakai bersama 6 shard
// paralel. Daftarnya: F0-14, F0-16, iso-test-b tanpa owner, purge `[TEST]%`
// (dua kali), cecep-rap `LIMIT 1`, lalu t5b-kill-switch.
//
// Setelah keenam saya menambal satu per satu. Setelah ketujuh jelas bahwa
// menambal bukan jawabannya — pola ini akan terus lahir selama tak ada yang
// menolaknya secara otomatis.
//
// ── Bentuk cacatnya, tepatnya
//
// Yang berbahaya BUKAN `count(*)` tanpa saringan. Assertion ARAH kebal
// terhadap penulisan bersamaan:
//
//     expect(n).toBeGreaterThan(0)     ← shard lain menambah? tetap benar
//     expect(yatim).toBe(0)            ← "harus nol" tetap nol
//
// Yang berbahaya adalah DUA hitungan yang diambil pada DUA SAAT BERBEDA lalu
// dibandingkan dengan `.toBe()`:
//
//     const a = await c.query('SELECT count(*) FROM projects')      ← detik 1
//     const b = await c.query('SELECT count(*) FROM projects ...')  ← detik 2
//     expect(a).toBe(b)                ← satu baris lahir di antaranya → MERAH
//
// Testnya benar, kodenya benar, yang salah cuma pengukurannya. Dan kegagalan
// seperti ini mahal: bacaan pertamanya selalu menuduh RLS bocor.
//
// ── Jalan keluarnya (dua-duanya diterima penjaga ini)
//
//   1. Satu query untuk kedua angka — `count(*) FILTER (WHERE …)`. Satu
//      snapshot MVCC, kedua angka melihat keadaan yang sama persis.
//   2. Saring ke penanda milik test itu sendiri (`WHERE name LIKE '[UJI-X]%'`)
//      atas baris yang dibuat di dalam transaksinya sendiri.
//
// RATCHET: angka hari ini adalah lantai. Menaikkannya butuh ratifikasi (G-5).
// ============================================================================

import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src')
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

// ── LANTAI ──────────────────────────────────────────────────────────────────
//
// Dua berkas ini memuat polanya, tetapi TERUKUR belum terpapar: tak ada satu
// pun test lain yang menulis ke himpunan yang mereka hitung. Diverifikasi
// 2026-08-03:
//
//   menu_items                    → 0 berkas test menyisipkan
//   assemblies WHERE company_id IS NULL (katalog nasional)
//                                 → 0 berkas test menyisipkan baris nasional
//                                   (7 insert assemblies semuanya ber-company)
//
// Ulangi pengukurannya kapan saja:
//   grep -rl "INSERT INTO menu_items" apps/api/src --include=*.test.ts | wc -l
//
// Sengaja TIDAK diperbaiki sekarang. `tenant-isolation-nyata` pernah nyaris
// rusak oleh sapuan otomatis saya sendiri — ia SENGAJA menghilangkan
// `company_id` di satu tempat sebagai INTI pengujiannya. Mengubah test yang
// sedang benar demi keseragaman menambah risiko tanpa menambah jaminan.
//
// Begitu ada test yang mulai menyisipkan ke salah satu himpunan itu, cabut
// entrinya dari lantai dan perbaiki dengan pola FILTER.
const LANTAI = [
  'apps/api/src/routes/v1/__tests__/t7-menu-per-company.test.ts',
  'apps/api/src/routes/v1/__tests__/tenant-isolation-nyata.test.ts',
]

function* telusuri(d) {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name)
    if (e.isDirectory()) yield* telusuri(p)
    else if (e.name.endsWith('.test.ts')) yield p
  }
}

const temuan = []
for (const p of telusuri(AKAR)) {
  const s = readFileSync(p, 'utf8')
  // Hanya test yang benar-benar menyentuh schema `public` bersama.
  if (!/createRlsClient|DIRECT_URL/.test(s)) continue

  const L = s.split('\n')
  L.forEach((baris, i) => {
    if (!/SELECT\s+count\(\*\)/i.test(baris)) return

    // (2) Tersaring ke data milik sendiri → aman.
    const konteks = L.slice(i, i + 4).join(' ')
    /*
      Saringan LITERAL ikut dikenali — mis. `WHERE model = 'uji-ronde'` atau
      `WHERE nama_berkas = '[TEST] cacat.csv'`.

      Versi sebelumnya hanya menerima `LIKE`, parameter (`= $1`), `IN (…)`,
      dan `id =`. Test yang menyaring ke penanda miliknya sendiri dengan
      literal string karena itu dilaporkan sebagai hitungan GLOBAL — padahal
      itu persis cara yang penjaga ini sarankan di pesan galatnya.

      Diukur 2026-08-27: 3 dari 9 temuan berbentuk begini. Penjaga yang
      menghukum cara yang ia sarankan sendiri melatih pembacanya mengabaikan
      keluarannya.

      Yang dituntut tetap ada: sebuah literal berkutip DI SISI KANAN
      perbandingan. `WHERE 1 = 1` atau `WHERE aktif = true` TIDAK lolos —
      keduanya tak menyaring ke data milik test.
    */
    if (/WHERE/i.test(konteks) && /(LIKE|= ?\$|IN ?\(|id ?=|= ?'[^']+')/i.test(konteks)) return

    // (1) Satu query dua angka (FILTER) → aman.
    if (/FILTER\s*\(/i.test(konteks)) return

    // (3) Menghitung KATALOG, bukan baris tenant. `information_schema` dan
    // `pg_*` menggambarkan STRUKTUR — ia tak berubah karena shard lain
    // menyisipkan data. "Tabel ini ada" adalah fakta yang stabil.
    if (/\b(information_schema|pg_policies|pg_class|pg_constraint|pg_indexes|pg_trigger|pg_proc|pg_attribute)\b/i.test(konteks)) return

    // Assertion dalam 12 baris berikutnya. Hanya `.toBe(x)`/`.toEqual(x)`
    // dengan x BUKAN 0 yang berbahaya; sisanya assertion arah.
    const sesudah = L.slice(i, i + 12).join('\n')
    const m = sesudah.match(/\.toBe\(\s*([\w.]+)\s*\)|\.toEqual\(\s*([\w.]+)\s*\)/)
    if (!m) return
    const nilai = m[1] || m[2]
    if (nilai === '0' || nilai === 'false') return

    // (4) `.toBe(true)` atas hasil `.every(…)`/`.some(…)` — assertion-nya
    // bekerja pada BOOLEAN, dan predikat di dalamnya (`n >= 0`) berarah.
    // Angka boleh berubah tanpa mengubah jawabannya.
    if (nilai === 'true' && /\.(every|some)\s*\(/.test(sesudah)) return

    temuan.push({ berkas: relative(REPO, p).replace(/\\/g, '/'), baris: i + 1, nilai })
  })
}

const baru = temuan.filter((t) => !LANTAI.includes(t.berkas))

if (baru.length) {
  console.error('❌ Test membandingkan dua hitungan GLOBAL atas schema bersama:\n')
  for (const t of baru) {
    console.error(`   ${t.berkas}:${t.baris}`)
    console.error(`      count(*) tanpa saringan → dibandingkan .toBe(${t.nilai})`)
  }
  console.error(`
   Di CI 6 shard paralel, baris bisa lahir di antara dua hitungan — test merah
   tanpa ada yang rusak, dan bacaan pertamanya menuduh RLS bocor.

   Perbaiki dengan SALAH SATU:
     • satu query untuk kedua angka:  count(*) FILTER (WHERE …)
     • saring ke penanda milik test:  WHERE name LIKE '[UJI-X]%'

   JANGAN melonggarkan RLS untuk menghijaukannya — itu Gerbang Keras G-5.`)
  process.exit(1)
}

console.log(`✅ nol test yang membandingkan dua hitungan global (${LANTAI.length} di lantai).`)
