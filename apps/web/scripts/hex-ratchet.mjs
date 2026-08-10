#!/usr/bin/env node
// ============================================================================
// PENJAGA — hex literal di kode UI tak boleh bertambah (F4-1).
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA PENJAGA INI ADA
// ══════════════════════════════════════════════════════════════════════════
//
// F4-1 menuntut "hex literal hanya boleh di berkas token", dengan alasan yang
// bukan kerapian: **white-label per tenant**. Selama warna ditulis langsung di
// komponen, mengganti palet untuk satu pelanggan berarti menyunting puluhan
// berkas — dan yang terlewat akan tetap memakai warna perusahaan lain.
//
// F4-1 mengganti 391 hex yang punya padanan token persis. Sisanya (578) tak
// punya padanan dan butuh keputusan desain, bukan penggantian mekanis:
// abu-abu Tailwind (#FAFAFA, #94A3B8), ungu (#7C3AED), oranye (#0066CC) yang
// memang di luar palet Warm Clay.
//
// ── RATCHET, bukan tuntutan nol
//
// Menuntut nol sekarang berarti memaksa keputusan desain untuk 578 nilai
// dalam satu langkah — dan keputusan desain yang terburu-buru menghasilkan
// token bernama `--abu-abu-3` yang tak berarti apa-apa.
//
// Yang mendesak: menghentikan pertumbuhan. Tanpa penjaga, tiap komponen baru
// bebas menambah hex, dan white-label makin jauh setiap minggu.
//
// ⚠️ Hex di KOMENTAR tidak dihitung — ia bukan nilai yang dipakai, dan
//    beberapa komentar justru MENJELASKAN palet (mis. "navy #003366").
//    Menuduhnya akan mengajari orang menghapus dokumentasi yang berguna.
// ============================================================================

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { join, resolve, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const LANTAI = join(WEB, 'scripts', 'hex-lantai.json')
const LEWATI = new Set(['node_modules', '.next', 'dist', 'scripts'])

function* berkas(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (LEWATI.has(e.name)) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) yield* berkas(p)
    else if (/\.(tsx?|css)$/.test(e.name)) yield p
  }
}

const temuan = []
for (const dir of ['app', 'components', 'lib']) {
  let daftar
  try { daftar = [...berkas(join(WEB, dir))] } catch { continue }

  for (const p of daftar) {
    // globals.css adalah SUMBER token — hex di sana justru yang benar.
    if (p.endsWith('globals.css')) continue

    // lib/warna-merek.ts punya peran yang SAMA untuk tempat yang secara
    // teknis tak bisa memakai custom property: `metadata.themeColor` (dibaca
    // peramban dari <meta>, sebelum CSS mana pun dimuat) dan `app/icon.svg`
    // (berkas statis, tak punya akses ke :root).
    //
    // Ini bukan pelonggaran penjaga — ini memindahkan tiga hex yang tak bisa
    // ditokenkan ke SATU berkas bernama, alih-alih membiarkannya tersebar.
    // Kesinkronannya dengan globals.css dijaga `uji-token-merek.mjs`, yang
    // gagal kalau keduanya menyimpang.
    // Dinormalkan ke garis maju: `join()` menghasilkan `lib\warna-merek.ts`
    // di Windows tapi `lib/warna-merek.ts` di CI Linux, dan perbandingan
    // mentah akan cocok di satu tempat lalu gagal senyap di tempat lain.
    if (p.replace(/\\/g, '/').endsWith('lib/warna-merek.ts')) continue

    const isi = readFileSync(p, 'utf8')

    /**
     * Blok komentar dilacak dengan KEADAAN, bukan per-baris.
     *
     * Versi pertama hanya memeriksa apakah satu baris DIMULAI dengan `//`,
     * `*`, atau `/*`. Itu benar untuk JSDoc yang tiap barisnya diawali `*`,
     * dan melewatkan blok yang tidak — mis. komentar JSX berindentasi:
     *
     *     {\/*
     *       `opacity: 0.5` pada #111827 di atas putih menghasilkan
     *       #888C93 — diukur 3,38 : 1, di bawah ambang AA 4,5.
     *     *\/}
     *
     * Kedua baris tengahnya diawali teks biasa, jadi lolos filter dan
     * terhitung sebagai hex di kode. Diukur 2026-08-11: dua kalimat
     * PENJELASAN menaikkan angkanya 48 → 50 dan memerahkan penjaga.
     *
     * Itu persis kerusakan yang catatan ⚠️ di kepala berkas ini
     * memperingatkan: "menuduhnya akan mengajari orang menghapus dokumentasi
     * yang berguna" — dan hampir berhasil, karena jalan keluar termudahnya
     * adalah membuang angka dari komentar yang justru menjelaskannya.
     *
     * Cacat sekeluarga sudah memakan `judul-ratchet`, `suspense-ratchet`, dan
     * `a11y-ratchet` sebelumnya. Yang membedakan di sini: penulisnya SUDAH
     * mengantisipasi masalahnya, hanya pelaksanaannya yang tak sadar-blok.
     */
    let dalamBlok = false

    isi.split('\n').forEach((teks, i) => {
      const bersih = teks.trim()

      // Buka/tutup blok bisa terjadi di baris yang sama; yang menentukan
      // adalah penutup TERAKHIR.
      const buka = bersih.lastIndexOf('/*')
      const tutup = bersih.lastIndexOf('*/')

      if (dalamBlok) {
        if (tutup !== -1 && tutup > buka) dalamBlok = false
        return // seluruh baris di dalam blok komentar
      }
      if (buka !== -1 && tutup < buka) {
        dalamBlok = true
        return
      }

      if (bersih.startsWith('//') || bersih.startsWith('*') || bersih.startsWith('/*')) return
      const cocok = teks.match(/#[0-9a-fA-F]{6}\b/g)
      if (cocok) {
        for (let k = 0; k < cocok.length; k++) {
          temuan.push(`${relative(WEB, p).replace(/\\/g, '/')}:${i + 1}`)
        }
      }
    })
  }
}

const jumlah = temuan.length

if (process.argv.includes('--daftar')) {
  const per = {}
  for (const t of temuan) {
    const f = t.replace(/:\d+$/, '')
    per[f] = (per[f] ?? 0) + 1
  }
  for (const [f, n] of Object.entries(per).sort((a, b) => b[1] - a[1])) {
    console.log(`${String(n).padStart(4)}  ${f}`)
  }
  console.log(`\n  ${jumlah} hex di ${Object.keys(per).length} berkas`)
  process.exit(0)
}

console.log('══ RATCHET hex literal (F4-1) ' + '═'.repeat(38))
console.log(`  hex di kode UI  : ${jumlah}`)

if (!existsSync(LANTAI)) {
  writeFileSync(LANTAI, JSON.stringify({
    _catatan: 'Lantai hex literal UI (F4-1). Boleh TURUN, tak boleh NAIK.',
    _kenapa: 'White-label per tenant: warna yang ditulis langsung di komponen membuat penggantian palet menyentuh puluhan berkas, dan yang terlewat memakai warna perusahaan lain.',
    _cara: 'Pakai var(--token) dari app/globals.css. Kalau warnanya belum punya token, TAMBAHKAN tokennya — jangan tulis hex.',
    maks: jumlah,
  }, null, 2) + '\n')
  console.log(`  lantai awal     : ${jumlah}`)
  process.exit(0)
}

const lantai = JSON.parse(readFileSync(LANTAI, 'utf8'))
console.log(`  lantai (maks)   : ${lantai.maks}`)

if (jumlah > lantai.maks) {
  console.error(`
❌ HEX LITERAL BERTAMBAH: ${lantai.maks} → ${jumlah}

   Warna yang ditulis langsung di komponen membuat white-label per tenant
   mustahil: mengganti palet untuk satu pelanggan berarti menyunting puluhan
   berkas, dan yang terlewat akan memakai warna perusahaan lain.

   Perbaiki dengan SALAH SATU:
     • pakai var(--token) yang sudah ada  (lihat app/globals.css)
     • kalau warnanya belum punya token, TAMBAHKAN tokennya di globals.css

   Lihat yang baru: node scripts/hex-ratchet.mjs --daftar`)
  process.exit(1)
}

if (jumlah < lantai.maks) {
  console.log(`\n  ⬇️  TURUN ${lantai.maks - jumlah} — kencangkan lantai:`)
  console.log('     node scripts/hex-ratchet.mjs --naikkan')
  if (process.argv.includes('--naikkan')) {
    lantai.maks = jumlah
    writeFileSync(LANTAI, JSON.stringify(lantai, null, 2) + '\n')
    console.log(`     lantai DISETEL ke ${jumlah}.`)
  }
  process.exit(0)
}

console.log('\n  ✅ tidak bertambah.')
