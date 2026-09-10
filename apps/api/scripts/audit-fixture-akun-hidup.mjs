#!/usr/bin/env node
/**
 * PENJAGA — FIXTURE YANG MEMILIH USER UNTUK LOGIN WAJIB MENYARING `u.is_active`.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA — cacat nyata, diukur 2026-09-11
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Suite penuh melaporkan 68 test merah di 32 berkas. Galatnya seragam dan
 * menuduh rute:
 *
 *     wage-reports-batas.test.ts:277
 *     AssertionError: expected 403 to be 200
 *
 * Rutenya benar. Yang salah fixture-nya: ia memilih user lewat
 *
 *     WHERE u.auth_id IS NOT NULL AND cm.is_active AND u.role_id IS NOT NULL
 *     ORDER BY (COALESCE(r2.name,'')='mandor'), u.email
 *     LIMIT 1
 *
 * dan mendarat di `isolasi-1787086713517@ujicoba.test` — akun uji yang
 * `users.is_active = false`, menang secara alfabetis.
 *
 * ── DUA KOLOM BERNAMA SAMA, MENYARING HAL BERBEDA
 *
 *     company_members.is_active  → KEANGGOTAAN. Disaring resolveCompanyId().
 *     users.is_active            → AKUN.        Disaring plugins/auth.ts:181.
 *
 * `plugins/auth.ts` menolak akun nonaktif dengan 403 **sebelum** resolusi
 * company berjalan, jadi `cm.is_active` tak pernah sempat menolong. Menyaring
 * salah satu TIDAK mencakup yang lain — dan berkas `plugins/auth.ts` sendiri
 * sudah memperingatkan ini:
 *
 *     ⚠ `company_members.is_active` adalah kolom BERBEDA. Ia menyaring
 *       KEANGGOTAAN, bukan akun. Jangan menganggap salah satunya mencakup
 *       yang lain.
 *
 * ── KENAPA TAK ADA YANG MELIHATNYA
 *
 * Tiga hal berkonspirasi, dan tiap satunya masuk akal sendiri:
 *
 *   1. Test HIJAU selama basis kebetulan tak punya akun nonaktif yang
 *      menang urutan. Ia berubah merah karena DATA berubah, bukan kode —
 *      jadi `git bisect` menunjuk commit yang tak bersalah.
 *   2. Galatnya 403, yang terbaca sebagai cacat otorisasi di rute.
 *   3. `menu-etag.test.ts` bahkan punya komentar yang BENAR di atas query
 *      yang salah — "ia menyaring is_active = true" merujuk
 *      `resolveCompanyId()`, dan pembaca berikutnya menyimpulkan query itu
 *      sudah lengkap. Penjelasan benar yang mendampingi keadaan salah
 *      (CLAUDE.md §8a.2) — bentuk yang paling lama bertahan.
 *
 * ── YANG DIPERIKSA, DAN YANG TIDAK
 *
 * Diperiksa: query yang MEMILIH `u.auth_id` dari `company_members`+`users`
 * — yaitu fixture yang mengambil identitas untuk dipakai login — wajib
 * menyebut `u.is_active` (atau alias apa pun untuk tabel `users`) di
 * predikatnya.
 *
 * TIDAK diperiksa: query yang menerima user id sebagai PARAMETER
 * (`WHERE cm.user_id = $1`), karena ia tak memilih siapa pun; dan query
 * yang mengambil `u.id` untuk dipakai sebagai data (mis. pemilik baris),
 * bukan untuk autentikasi. `t10-peran-per-company.test.ts` dan
 * `otomasi-gr-matching.test.ts` masuk kategori ini dan sengaja dibiarkan.
 *
 * Pembatas itu penting: penjaga yang merah atas hal yang BENAR akan
 * diabaikan seluruh keluarannya, lalu berhenti menjaga tanpa gejala
 * (pelajaran `audit-kosong-berpetunjuk.mjs`).
 *
 * ── AMBANG NOL
 *
 * Tak ada nilai parsial. Satu fixture yang memilih akun mati membuat
 * SELURUH berkasnya merah, dan galatnya menunjuk ke tempat yang salah.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR_API = join(dirname(fileURLToPath(import.meta.url)), '..')
const AKAR_SRC = join(AKAR_API, 'src')

/** Semua *.test.ts di bawah src/, rekursif. */
function berkasTest(dir, keluar = []) {
  for (const nama of readdirSync(dir)) {
    const p = join(dir, nama)
    if (statSync(p).isDirectory()) berkasTest(p, keluar)
    else if (nama.endsWith('.test.ts')) keluar.push(p)
  }
  return keluar
}

/*
  Query SQL diambil dari template literal backtick.

  ⚠ CR dibuang lebih dulu. CLAUDE.md §7a mencatat LIMA kali dalam satu hari
  perbandingan baris gagal senyap karena CR ikut terbawa — dan hasilnya
  selalu nol, yang terbaca seperti "tidak ada" alih-alih "tidak terdeteksi".
*/
const pelanggaran = []

for (const berkas of berkasTest(AKAR_SRC)) {
  const isi = readFileSync(berkas, 'utf8').replace(/\r/g, '')

  // Tiap template literal backtick — itulah bentuk query di repo ini.
  for (const m of isi.matchAll(/`([^`]*)`/g)) {
    const q = m[1]
    if (!/company_members/i.test(q)) continue

    /*
      Yang dicari: fixture yang MEMILIH identitas untuk login.

      Penandanya `auth_id` di daftar SELECT — kolom itu satu-satunya gunanya
      adalah dioper ke `actAs()`/header autentikasi. Query yang mengambil
      `u.id` untuk dipakai sebagai data tidak lewat sini.
    */
    if (!/select[\s\S]*?\bauth_id\b/i.test(q)) continue

    /*
      ── Query yang MENERIMA identitas, bukan MEMILIHNYA, dilewati ──

      Uji mutasi pertama penjaga ini melaporkan 10 pelanggaran, dan
      KESEMBILAN di antaranya BENAR: `WHERE u.auth_id = $1` menerima
      identitasnya dari pemanggil, jadi tak ada yang "terpilih" dan tak
      ada yang bisa mendarat di akun mati.

      Penjaga yang merah atas hal yang benar akan diabaikan SELURUH
      keluarannya, lalu berhenti menjaga tanpa gejala — pelajaran
      `audit-kosong-berpetunjuk.mjs`, yang aturannya diganti persis karena
      ini. Jadi pembatasnya di sini bukan kelonggaran, melainkan syarat
      supaya penjaganya tetap dipercaya.
    */
    if (/\bcm\.user_id\s*=\s*\$\d/i.test(q)) continue
    if (/\bauth_id\s*=\s*\$\d/i.test(q)) continue

    /*
      Sengaja mencari user TANPA keanggotaan (mis. menguji cabang
      "pengguna yatim"). `is_active` tak relevan di sana — yang diuji
      justru ketiadaan barisnya.
    */
    if (/NOT\s+EXISTS/i.test(q)) continue

    /*
      Alias tabel `users` dibaca dari FROM/JOIN, bukan ditebak "u".
      Menebaknya membuat penjaga ini buta terhadap `JOIN users usr`.
    */
    const alias = [...q.matchAll(/\busers\s+(?:as\s+)?([a-z_][a-z0-9_]*)/gi)]
      .map((x) => x[1].toLowerCase())
      .filter((a) => a !== 'on' && a !== 'where' && a !== 'join')

    const punyaSaringanAkun = alias.some((a) =>
      new RegExp(`\\b${a}\\.is_active\\b`, 'i').test(q),
    ) || /\busers\.is_active\b/i.test(q)

    if (punyaSaringanAkun) continue

    const baris = isi.slice(0, m.index).split('\n').length
    pelanggaran.push({
      berkas: relative(AKAR_API, berkas).replace(/\\/g, '/'),
      baris,
      alias: alias[0] ?? 'users',
    })
  }
}

console.log('══ Fixture yang memilih akun untuk login ══════════════════════')
console.log(`  berkas test dipindai : ${berkasTest(AKAR_SRC).length}`)
console.log(`  fixture pemilih akun : melanggar ${pelanggaran.length}`)
console.log('  ambang               : 0')

if (pelanggaran.length === 0) {
  console.log('\n✅ Semua fixture yang memilih identitas menyaring akun aktif.')
  process.exit(0)
}

console.log('\n❌ Fixture memilih user TANPA menyaring akun aktif:\n')
for (const p of pelanggaran) {
  console.log(`   ${p.berkas}:${p.baris}`)
  console.log(`      tambahkan  AND ${p.alias}.is_active  ke predikatnya`)
}
console.log(`
   \`cm.is_active\` menyaring KEANGGOTAAN, bukan AKUN. plugins/auth.ts:181
   menolak akun nonaktif dengan 403 sebelum keanggotaan dibaca sama sekali.

   Tanpa saringan ini, fixture bisa mendarat di akun uji nonaktif dan
   SELURUH berkasnya merah dengan "expected 403 to be 200" — galat yang
   menuduh rute, bukan fixture. Terjadi 2026-09-11: 68 test dari sebab ini.`)
process.exit(1)
