#!/usr/bin/env node
// ============================================================================
// MENCACAH DI ATAS PEMBACAAN YANG BISA TERPOTONG
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA PENJAGA INI ADA
// ══════════════════════════════════════════════════════════════════════════
//
// `GET /api/v1/cecep/editions` menghitung jumlah analisa per edisi begini:
//
//     const { data: asm } = await request.db!
//       .from('assemblies').select('edition_id').eq('status','active').limit(10000)
//     const per = new Map()
//     for (const a of asm ?? []) {
//       if (a.edition_id) per.set(a.edition_id, (per.get(a.edition_id) ?? 0) + 1)
//     }
//
// Tiap barisnya benar sendiri. Yang salah gabungannya: PostgREST memulangkan
// **maksimal 1.000 baris**, dan `.limit(10000)` tidak menembusnya — batas itu
// keras, ditegakkan server, dan pemotongannya TIDAK mengeluarkan galat.
// `data` terisi, `error` null, loop berjalan mulus atas seribu baris.
//
// Diukur ke produksi 2026-09-15:
//
//     endpoint melaporkan SE-47-2026 =   580 analisa
//     kebenaran di basis (SQL)       = 2.747 analisa
//
//     SELECT count(*) FILTER (WHERE edition_id IS NOT NULL)
//       FROM (SELECT edition_id FROM public.assemblies
//              WHERE status='active' LIMIT 1000) x;      →  580
//
// Angka 580 itu persis jumlah baris ber-`edition_id` di dalam seribu baris
// pertama. Salah 4,7 kali lipat.
//
// ── Kenapa cacat ini bertahan, dan kenapa ia butuh penjaganya sendiri
//
// 580 TERLIHAT MASUK AKAL. Ia bukan nol, bukan angka bulat mencurigakan, dan
// ia bergerak kalau katalog berubah. Tak ada di layar — maupun di tsc, test,
// atau penjaga mana pun — yang bisa membedakannya dari jumlah yang benar.
// Dan angka inilah yang dipakai orang untuk memutuskan apakah sebuah edisi
// layak dipilih saat menyusun RAB.
//
// ⚠ BUKAN duplikat `audit-baca-tak-terpotong.mjs`. Penjaga itu mencari
// pembacaan TANPA pembatas sama sekali, dan justru karena itu ia BUTA di
// sini: `.eq('status','active')` dan `.limit(10000)` KEDUANYA terdaftar
// sebagai pembatas di `PEMBATAS`-nya, jadi baris ini dilewati tanpa suara.
// Sudah diverifikasi dengan menjalankannya — ia hijau atas kode yang salah
// 4,7 kali lipat.
//
// Cacatnya hidup di CELAH: pembacaan yang PUNYA `.limit()`, tetapi limitnya
// DI ATAS 1.000 — jadi penulisnya jelas-jelas MENGHARAPKAN lebih dari seribu
// baris, sementara servernya tak akan pernah memberikannya.
//
// ── Yang dijaga
//
// Sebuah pelanggaran butuh KETIGA hal ini sekaligus:
//
//   1. `.from(tabel).select(...)` dengan `.limit(N)` di mana **N > 1.000**,
//      atau `.range(a, b)` dengan **b - a + 1 > 1.000**.
//      Limit di bawah 1.000 tak pernah terpotong — itu keputusan sadar untuk
//      mengambil sebagian, bukan harapan yang tak terpenuhi.
//
//   2. Hasilnya MENGALIR KE AGREGAT: di-`for`-kan, di-`reduce`, dihitung
//      `.length`-nya, di-`Set`/`Map`-kan, atau dijumlahkan.
//      Ini yang memisahkan cacat dari sekadar daftar panjang. Daftar yang
//      terpotong masih menampilkan barisnya — pemakainya melihat sebagian
//      dan (kalau rutenya jujur) diberi tahu. Sebuah ANGKA yang terpotong
//      tak punya sisa yang bisa dilihat: ia SATU nilai, dan nilai itu salah
//      tanpa jejak.
//
//   3. Tabelnya ada di basis dan jumlah barisnya sudah >= 1.000 — atau,
//      bila basis tak tersedia, poin 1+2 saja sudah cukup untuk MERAH.
//      Yang terakhir disengaja: menjadikan basis syarat berarti penjaga ini
//      diam-diam hijau di lingkungan tanpa `DATABASE_URL`, dan penjaga yang
//      hijau karena tak memeriksa apa pun lebih buruk daripada tak ada
//      (pelajaran `audit-ekspor-tanpa-pemanggil`, dikutip di
//      `audit-baca-tak-terpotong.mjs`).
//
// ── Cara memperbaikinya
//
// Minta BASIS yang menghitung, bukan menarik baris lalu mencacah di JS:
//
//     const { count } = await request.db!.from('assemblies')
//       .select('id', { count: 'exact', head: true })
//       .eq('status','active').eq('edition_id', id)
//
// `head: true` berarti nol baris melewati kabel — tak ada yang bisa
// terpotong. Kalau agregatnya memang menuntut seluruh barisnya (bukan cuma
// jumlahnya), ambil BERTAHAP per 1.000 sampai habis, seperti yang sudah
// dilakukan handler daftar katalog di berkas yang sama.
//
// AMBANG NOL.
// ============================================================================

import { readFileSync, globSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const AKAR_API = join(dirname(fileURLToPath(import.meta.url)), '..')
const requireDari = createRequire(join(AKAR_API, 'package.json'))

// `.env` dimuat sendiri — alasannya sama persis dengan
// `audit-baca-tak-terpotong.mjs`: `DATABASE_URL` ADA di `apps/api/.env` tapi
// tak pernah masuk ke `process.env` lewat pelari CI, sehingga penjaga yang
// mengandalkannya akan hijau tanpa memeriksa apa pun.
try {
  requireDari('dotenv').config({ path: join(AKAR_API, '.env') })
} catch { /* di CI env datang dari luar; ketiadaan dotenv bukan galat */ }

const BATAS_POSTGREST = 1000

/*
  ── Menemukan agregasi

  Yang dicari BUKAN "variabel ini dipakai", melainkan "variabel ini diperas
  jadi SATU nilai". Membaca `data.map(...)` lalu mengirimkannya sebagai daftar
  bukan pelanggaran kelas ini — barisnya sampai ke pemakai, dan pemotongannya
  dijaga penjaga lain.

  Pola yang dihitung agregasi:

      for (const x of NAMA)        · for (… NAMA …)
      NAMA.reduce(                 · NAMA.length
      NAMA.filter(…).length        · new Set(NAMA)  · new Map(NAMA)
      NAMA.forEach(                · NAMA.some( / .every( / .find(

  `.some`/`.every`/`.find` ikut: ketiganya juga memeras seluruh himpunan jadi
  satu jawaban, dan jawaban dari seribu baris pertama atas sebuah tabel
  berisi lima ribu adalah tebakan yang menyamar sebagai fakta.
*/
function polaAgregasi(nama) {
  const n = nama.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(
    `for\\s*\\([^)]*\\b${n}\\b` +
    `|\\b${n}\\s*(?:\\?\\?\\s*\\[\\])?\\s*\\)?\\s*\\.(?:reduce|forEach|some|every|find)\\s*\\(` +
    `|\\b${n}\\b[^\\n]{0,80}\\.length\\b` +
    `|new\\s+(?:Set|Map)\\s*\\(\\s*\\(?\\s*${n}\\b`
  )
}

/** Limit yang DIMINTA sebuah rantai, atau null bila tak ada/tak terbaca. */
function limitDiminta(rantai) {
  const mLimit = rantai.match(/\.limit\(\s*(\d+)\s*\)/)
  if (mLimit) return Number(mLimit[1])
  const mRange = rantai.match(/\.range\(\s*(\d+)\s*,\s*(\d+)\s*\)/)
  if (mRange) return Number(mRange[2]) - Number(mRange[1]) + 1
  return null
}

const berkas = globSync('src/**/*.ts', { cwd: AKAR_API })
  .filter((f) => !f.includes('__tests__') && !f.includes('test-utils'))

const temuan = []

for (const rel of berkas) {
  const isi = readFileSync(join(AKAR_API, rel), 'utf8')
  // ⚠ CR dibuang lebih dulu. Berkas di repo ini bisa berakhiran CRLF, dan
  //   perbandingan baris yang diam-diam membawa CR memulangkan NOL —
  //   yang terbaca seperti "tak ada", bukan "tak terdeteksi" (CLAUDE.md §7a).
  const baris = isi.split('\n').map((b) => b.replace(/\r/g, ''))

  for (let i = 0; i < baris.length; i++) {
    const m = baris[i].match(/\.from\(\s*['"`]([a-z_]+)['"`]\s*\)/)
    if (!m) continue
    const tabel = m[1]

    // Jendela 25 baris — query di repo ini dibangun bertahap (`q = q.eq(...)`),
    // jadi membaca rantai titik-bersambung saja melewatkan pembatasnya.
    const AKHIR = Math.min(i + 25, baris.length)
    let rantai = baris[i].slice(baris[i].indexOf('.from('))
    for (let j = i + 1; j < AKHIR; j++) {
      if (/\.from\(\s*['"`]/.test(baris[j])) break
      rantai += '\n' + baris[j]
    }
    if (!/\.select\s*\(/.test(rantai)) continue           // bukan pembacaan
    if (/count:\s*['"]exact['"]/.test(rantai)) continue   // sudah dihitung di basis

    const diminta = limitDiminta(rantai)
    if (diminta === null || diminta <= BATAS_POSTGREST) continue

    /*
      Nama variabel penampung hasilnya. Dua bentuk yang dipakai di repo ini:

          const { data: asm } = await …          → asm
          const { data } = await …               → data

      Tanpa nama, tak ada yang bisa ditelusuri ke agregasi — dan menuduh
      tanpa bisa menyebut variabelnya membuat orang berikutnya menyisir
      berkas sendiri (§8a.2: "merah tanpa menyebut namanya").
    */
    const awal = Math.max(0, i - 6)
    const kepala = baris.slice(awal, i + 1).join('\n')
    const mNama = kepala.match(/\{\s*data\s*:\s*(\w+)/) || kepala.match(/\{\s*(data)\b/)
    if (!mNama) continue
    const nama = mNama[1]

    // Agregasi dicari SESUDAH pembacaannya, dalam 40 baris — cukup untuk
    // seluruh pola di repo ini tanpa menyeberang ke handler berikutnya.
    const EKOR = Math.min(i + 40, baris.length)
    const sesudah = baris.slice(i, EKOR).join('\n')
    const pola = polaAgregasi(nama)
    if (!pola.test(sesudah)) continue

    const cocok = sesudah.match(pola)
    temuan.push({
      berkas: rel.replace(/\\/g, '/'), baris: i + 1, tabel, diminta, nama,
      buktiAgregasi: (cocok?.[0] ?? '').split('\n')[0].trim().slice(0, 90),
    })
  }
}

// ── Berapa baris yang sungguh ada di tabel-tabel itu ────────────────────────
//
// Basis TIDAK jadi syarat memerahkan (lihat kepala berkas), hanya memperkaya
// laporannya dengan angka nyata — "5.791 baris, 1.000 yang terbaca" jauh
// lebih sulit diabaikan daripada "berpotensi terpotong".
const DB = process.env.DATABASE_URL || process.env.DIRECT_URL
const jumlahTabel = new Map()
if (DB && temuan.length > 0) {
  let pg = null
  try { pg = requireDari('pg') } catch { /* dilaporkan sebagai ketiadaan angka */ }
  if (pg) {
    const c = new pg.Client({ connectionString: DB })
    try {
      await c.connect()
      for (const t of new Set(temuan.map((x) => x.tabel))) {
        try {
          const { rows } = await c.query(`SELECT count(*)::int n FROM public.${t}`)
          jumlahTabel.set(t, rows[0].n)
        } catch { /* bukan tabel public — biarkan tanpa angka */ }
      }
    } catch { /* basis tak bisa dihubungi — laporan tetap jalan tanpa angka */ }
    finally { try { await c.end() } catch { /* sudah tertutup */ } }
  }
}

if (temuan.length === 0) {
  console.log('✅ Cacah di atas baca terpotong: nol — tak ada agregasi di atas pembacaan >1.000 baris')
  process.exit(0)
}

console.error('\n❌ Agregasi di atas pembacaan yang DIPOTONG diam-diam di 1.000 baris:\n')
for (const t of temuan) {
  const n = jumlahTabel.get(t.tabel)
  console.error(`   ${t.berkas}:${t.baris}`)
  console.error(`     tabel        : ${t.tabel}${n != null ? ` (${n.toLocaleString('id-ID')} baris di basis)` : ''}`)
  console.error(`     limit diminta: ${t.diminta.toLocaleString('id-ID')} — PostgREST memulangkan ${BATAS_POSTGREST.toLocaleString('id-ID')}`)
  console.error(`     hasil "${t.nama}" lalu diperas jadi satu nilai oleh:`)
  console.error(`       ${t.buktiAgregasi}`)
  if (n != null && n > BATAS_POSTGREST) {
    console.error(`     ⇒ ${(n - BATAS_POSTGREST).toLocaleString('id-ID')} baris TAK PERNAH ikut terhitung, tanpa satu pun galat.`)
  }
  console.error('')
}
console.error('   Perbaikannya: minta BASIS yang menghitung —')
console.error("     .select('id', { count: 'exact', head: true })   ← nol baris melewati kabel")
console.error('   atau, bila seluruh barisnya memang dibutuhkan, ambil bertahap per 1.000')
console.error('   sampai habis (pola `HALAMAN` di GET /cecep/assemblies).\n')
console.error(`   Ambang NOL. Ditemukan: ${temuan.length}.\n`)
process.exit(1)
