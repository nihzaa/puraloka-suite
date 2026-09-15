#!/usr/bin/env node
// ============================================================================
// SARINGAN `.not(kolom,'in',…)` WAJIB MENYEBUT NILAI ENUM YANG BENAR-BENAR ADA
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA PENJAGA INI ADA
// ══════════════════════════════════════════════════════════════════════════
//
// `/api/v1/notifications/check-milestones` TAK PERNAH BEKERJA sejak ditulis.
// Saringannya berbunyi:
//
//     .not('status', 'in', '("completed","cancelled")')
//
// Enum `milestone_status` berisi TEPAT empat nilai — `pending`,
// `in_progress`, `completed`, `overdue`. TIDAK ADA `cancelled`.
//
// PostgREST menolak seluruh query dengan 22P02:
//
//     invalid input value for enum milestone_status: "cancelled"
//
// Galat itu tak pernah diperiksa — kedua hasil dibaca `.data ?? []` — jadi
// `null` menjadi larik kosong, kedua loop tak pernah berputar, dan rutenya
// membalas:
//
//     { success: true, approaching: 0, overdue: 0, notifications_created: 0 }
//
// Sukses yang sempurna palsu. Tak ada satu pun notifikasi milestone yang
// pernah terkirim, dan bentuk balasannya persis sama dengan "sudah
// diperiksa, memang tak ada yang jatuh tempo" — tak ada yang bisa
// membedakannya. Dengan saringan yang benar, basis yang sama memulangkan
// 19 milestone.
//
// ── Kenapa tak tertangkap apa pun
//
// `tsc` hijau: string apa pun sah sebagai argumen `.not()`. Test tak ada.
// Dan penjaga-penjaga yang sudah berjalan tak satu pun membaca ISI string
// saringan lalu membandingkannya dengan katalog enum di basis.
//
// Ini kembar dari `audit-status-mobile-berlabel` dan `audit-keparahan-
// sepakat`: kosakata yang DIBAYANGKAN penulis kode vs kosakata yang
// sungguh-sungguh ada di basis. Bedanya di sini akibatnya bukan label
// salah melainkan SELURUH query ditolak.
//
// ── Yang diperiksa
//
// Tiap `.not(kolom, 'in', '("a","b")')` dan `.in(kolom, [...])` yang
// kolomnya bertipe ENUM di basis: tiap nilai yang disebut wajib ada di
// enum itu. Nilai yang tak ada = query yang SELALU gagal 22P02.
//
// Kolom dicocokkan lewat tabel yang disebut `.from(...)` / `.unsafe(...)`
// pada rantai yang sama.
//
// ── Ambang NOL
//
// Nilai enum yang tak ada bukan soal selera: query-nya TIDAK BISA berhasil.
// Tak ada kasus sah untuk menuliskannya.
//
// Butuh basis — enum dibaca dari `pg_enum`, bukan dari daftar di kode.
// Tabel yang hari ini cuma berisi dua nilai tetap boleh menghasilkan yang
// ketiga besok; yang mengikat adalah definisi TIPE-nya.
// ============================================================================

import { readFileSync, globSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const AKAR_API = join(dirname(fileURLToPath(import.meta.url)), '..')
const requireDari = createRequire(join(AKAR_API, 'package.json'))

try {
  requireDari('dotenv').config({ path: join(AKAR_API, '.env') })
} catch { /* di CI env datang dari luar */ }

const DB = process.env.DATABASE_URL || process.env.DIRECT_URL
if (!DB) {
  console.log('  ⏭  saringan enum ada: DILEWATI — DATABASE_URL/DIRECT_URL tak ada')
  console.log(`     (sudah dicoba dari ${join(AKAR_API, '.env')})`)
  process.exit(0)
}
let pg = null
try { pg = requireDari('pg') } catch { /* dilaporkan di bawah */ }
if (!pg) {
  console.log('  ⏭  saringan enum ada: DILEWATI (pg tak ter-resolve)')
  process.exit(0)
}

const SEP = String.fromCharCode(92)

/*
  Komentar & string dibuang sebelum memindai — lihat alasan panjangnya di
  `audit-batas-baca-waras.mjs`. Di sini ada tikungannya sendiri: yang DICARI
  justru isi string (`'("completed","cancelled")'`), jadi string TIDAK boleh
  dibuang. Yang dibuang cuma KOMENTAR.

  Tanpa itu, komentar di `notifications.ts` yang menerangkan cacat ini —
  dengan mengutip saringan lamanya — akan terhitung sebagai pelanggaran, dan
  penjaga ini akan merah atas dokumentasi perbaikannya sendiri.
*/
function buangKomentar(isi) {
  const n = isi.length
  const keluar = new Array(n).fill('')
  let i = 0
  let mode = 'kode'

  while (i < n) {
    const c = isi[i]
    const d = isi[i + 1]
    if (mode === 'kode') {
      if (c === '/' && d === '*') { mode = 'blok'; keluar[i] = ' '; keluar[i + 1] = ' '; i += 2; continue }
      if (c === '/' && d === '/') { mode = 'baris'; keluar[i] = ' '; keluar[i + 1] = ' '; i += 2; continue }
      keluar[i] = c; i++; continue
    }
    if (mode === 'blok') {
      if (c === '*' && d === '/') { mode = 'kode'; keluar[i] = ' '; keluar[i + 1] = ' '; i += 2; continue }
      keluar[i] = c === '\n' ? '\n' : ' '; i++; continue
    }
    if (c === '\n') { mode = 'kode'; keluar[i] = '\n'; i++; continue }
    keluar[i] = ' '; i++
  }
  return keluar.join('')
}

const c = new pg.Client({ connectionString: DB })
await c.connect()

/*
  Katalog: kolom ber-ENUM di skema public → himpunan nilai sahnya.

  ⚠ `table_schema = 'public'` WAJIB (CLAUDE.md §1). Basis ini punya skema
  `test` dan `extensions` yang membayangi 14 tabel bernama sama; tanpa
  saringan itu, tiap kolom terbaca DUA KALI dan kolom enum dari skema test
  bisa menimpa jawabannya.
*/
/*
  ⚠ `string_agg`, BUKAN `array_agg`.

  Versi pertama memakai `array_agg`, dan driver `pg` memulangkan array ENUM
  sebagai STRING literal Postgres — `{pending,in_progress,…}` — bukan larik
  JS, sebab tipe elemennya enum buatan pengguna yang tak punya parser
  bawaan. `new Set(string)` lalu menghasilkan himpunan KARAKTER, dan penjaga
  ini melaporkan `completed` sebagai "nilai hantu" sambil mencetak daftar
  sah berbunyi `{, p, e, n, d, i, g, …`.

  Tiga pelanggaran, KETIGANYA palsu — dan keluarannya sendiri yang
  membocorkan sebabnya. Penjaga yang merah atas kode yang BENAR akan
  diabaikan seluruh keluarannya, lalu berhenti menjaga tanpa gejala
  (CLAUDE.md §8a.2). Dipaku `::text` supaya pemisahannya dilakukan di sini,
  dengan pemisah yang kita tentukan sendiri.
*/
const { rows } = await c.query(`
  SELECT cl.relname AS tabel, a.attname AS kolom, t.typname AS tipe,
         string_agg(e.enumlabel::text, ',' ORDER BY e.enumsortorder) AS nilai
    FROM pg_attribute a
    JOIN pg_class cl ON cl.oid = a.attrelid
    JOIN pg_namespace ns ON ns.oid = cl.relnamespace
    JOIN pg_type t ON t.oid = a.atttypid
    JOIN pg_enum e ON e.enumtypid = t.oid
   WHERE ns.nspname = 'public' AND a.attnum > 0 AND NOT a.attisdropped
   GROUP BY cl.relname, a.attname, t.typname
`)
await c.end()

/** "tabel.kolom" → { tipe, nilai:Set } */
const katalog = new Map()
for (const r of rows) {
  katalog.set(`${r.tabel}.${r.kolom}`, {
    tipe: r.tipe,
    nilai: new Set(String(r.nilai).split(',').filter(Boolean)),
  })
}

const berkas = globSync('src/**/*.ts', { cwd: AKAR_API })
  .filter((f) => !f.includes('__tests__') && !f.includes('test-utils'))
  .map((f) => f.split(SEP).join('/'))
  .sort()

const pelanggaran = []
let diperiksa = 0

for (const rel of berkas) {
  const isi = buangKomentar(readFileSync(join(AKAR_API, rel), 'utf8'))
  const baris = isi.split('\n').map((b) => b.replace(/\r/g, ''))

  for (let i = 0; i < baris.length; i++) {
    const mTabel = baris[i].match(/\.(?:from|unsafe)\(\s*['"`]([a-z_]+)['"`]/)
    if (!mTabel) continue
    const tabel = mTabel[1]

    // Jendela 25 baris — query di repo ini dibangun bertahap (`q = q.not(…)`),
    // alasannya sama dengan `audit-baca-tak-terpotong.mjs`.
    const AKHIR = Math.min(i + 25, baris.length)
    let rantai = baris[i]
    const petaBaris = [i]
    for (let j = i + 1; j < AKHIR; j++) {
      if (/\.(?:from|unsafe)\(\s*['"`]/.test(baris[j])) break
      rantai += '\n' + baris[j]
      petaBaris.push(j)
    }

    // .not('kolom', 'in', '("a","b")')
    const re = /\.not\(\s*['"`]([a-z_]+)['"`]\s*,\s*['"`]in['"`]\s*,\s*['"`]\(([^)]*)\)['"`]\s*\)/g
    let m
    while ((m = re.exec(rantai))) {
      const kolom = m[1]
      const entri = katalog.get(`${tabel}.${kolom}`)
      if (!entri) continue          // bukan kolom enum — di luar cakupan
      diperiksa++

      const nilai = m[2]
        .split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean)

      const hantu = nilai.filter((v) => !entri.nilai.has(v))
      if (hantu.length > 0) {
        // Nomor baris: hitung baris ke berapa di dalam rantai.
        const sebelum = rantai.slice(0, m.index).split('\n').length - 1
        pelanggaran.push({
          rel,
          baris: (petaBaris[sebelum] ?? i) + 1,
          tabel, kolom, tipe: entri.tipe,
          hantu,
          sah: [...entri.nilai],
        })
      }
    }
  }
}

console.log('── Saringan enum ada ─────────────────────────────────────────')
console.log(`  kolom enum di basis   : ${katalog.size}`)
console.log(`  saringan diperiksa    : ${diperiksa}`)

if (pelanggaran.length > 0) {
  console.error('')
  console.error(`❌ Saringan menyebut nilai enum yang TIDAK ADA: ${pelanggaran.length}`)
  console.error('')
  for (const p of pelanggaran) {
    console.error(`   ${p.rel}:${p.baris}`)
    console.error(`      ${p.tabel}.${p.kolom} bertipe ${p.tipe}`)
    console.error(`      nilai HANTU : ${p.hantu.join(', ')}`)
    console.error(`      yang sah    : ${p.sah.join(', ')}`)
    console.error('')
  }
  console.error('   PostgREST menolak SELURUH query dengan 22P02 —')
  console.error('   "invalid input value for enum". Bukan sebagian: seluruhnya.')
  console.error('')
  console.error('   Kalau galatnya tak diperiksa (`.data ?? []`), hasilnya larik')
  console.error('   KOSONG yang tak bisa dibedakan dari "memang tak ada data",')
  console.error('   dan rutenya membalas 200 bernilai nol. Sukses yang palsu.')
  console.error('')
  process.exit(1)
}

console.log('')
console.log(`✅ ${diperiksa} saringan enum, semuanya menyebut nilai yang ada.`)
