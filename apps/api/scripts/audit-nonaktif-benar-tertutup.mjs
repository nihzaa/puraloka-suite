#!/usr/bin/env node
/**
 * `users.is_active` wajib DITEGAKKAN di kedua pintu, bukan sekadar tercatat.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-09-01 lewat rute sungguhan, bukan dari membaca kode:
 *
 *     AKTIF     login=200   GET /projects = 200
 *     NONAKTIF  login=200   GET /projects = 200   ← SAMA PERSIS
 *
 * Menonaktifkan pengguna TIDAK menghentikan siapa pun masuk, dan tidak
 * menghentikannya membaca data proyek.
 *
 * ── Kenapa cacat ini bertahan tanpa satu pun gejala
 *
 * Fiturnya lengkap di tiap lapisan KECUALI yang menegakkannya:
 *
 *     PATCH /users/:id/toggle-active   ada, berpagar tenant, menolak diri sendiri
 *     users.is_active                  ada, terbaca di daftar pengguna
 *     UI                               menampilkan status aktif/nonaktif
 *
 * Semuanya benar untuk dirinya sendiri. Yang tak ada cuma pemeriksaannya
 * saat permintaan masuk — dan ketiadaan itu tak memunculkan galat, tak
 * menggagalkan test, tak terlihat di layar mana pun.
 *
 * Admin menekan "nonaktifkan". Layar berkata nonaktif. Orangnya tetap
 * masuk. Tak ada yang tahu sampai seseorang mengujinya.
 *
 * ── Kenapa DUA pintu, dan kenapa satu saja tak cukup
 *
 *     routes/v1/auth.ts    menerbitkan token — pintu masuk
 *     plugins/auth.ts      memvalidasi tiap permintaan — pintu berikutnya
 *
 * Menutup `plugins` saja: login berhasil, token diberikan, lalu setiap
 * permintaan 403. Pengguna melihat aplikasi yang "masuk lalu rusak".
 *
 * Menutup `auth.ts` saja: token yang SUDAH terbit tetap sah sampai
 * kedaluwarsa. Menonaktifkan orang tak mencabut sesi yang sedang berjalan
 * — dan itu justru saat pencabutan paling dibutuhkan.
 *
 * ── ⚠ `company_members.is_active` adalah kolom BERBEDA
 *
 * `resolveCompanyId` menyaring `company_members.is_active` — itu
 * KEANGGOTAAN, bukan akun. Pengujian 2026-09-01 membuktikan mematikannya
 * pun tak menutup akses (tetap 200). Jangan menganggap salah satunya
 * mencakup yang lain; penjaga ini memeriksa `users`, bukan keanggotaan.
 *
 * ── Ambang NOL
 *
 * Satu pintu yang tak menegakkan sudah cukup membuat "nonaktifkan" jadi
 * tombol yang berbohong.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

const PINTU = [
  {
    nama: 'apps/api/src/plugins/auth.ts',
    p: join(AKAR, 'apps', 'api', 'src', 'plugins', 'auth.ts'),
    akibat: 'token yang SUDAH terbit tetap sah — menonaktifkan orang tak '
      + 'mencabut sesi yang sedang berjalan',
  },
  {
    nama: 'apps/api/src/routes/v1/auth.ts',
    p: join(AKAR, 'apps', 'api', 'src', 'routes', 'v1', 'auth.ts'),
    akibat: 'akun nonaktif tetap BISA login dan menerima token baru',
  },
]

for (const { nama, p } of PINTU) {
  if (!existsSync(p)) {
    console.error(`❌ ${nama} tak ada di ${p} — jalurnya meleset.`)
    console.error('   Nol temuan dari korpus kosong bukan bukti apa pun.')
    process.exit(1)
  }
}

/*
  Komentar dibuang sebelum memeriksa.

  Kedua berkas MENJELASKAN penegakan ini panjang lebar di komentarnya, jadi
  mencari `is_active` apa adanya akan hijau meski kodenya sudah dihapus —
  persis kelas kesalahan yang sudah menggigit `audit-auth-mobile-utuh`.
*/
const tanpaKomentar = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')

const temuan = []

for (const { nama, p, akibat } of PINTU) {
  const kode = tanpaKomentar(readFileSync(p, 'utf8'))

  // 1. `is_active` benar-benar DIAMBIL dari tabel users.
  const diambil = /\.select\(\s*['"][^'"]*\bis_active\b[^'"]*['"]/.test(kode)

  /*
    2. Dan BENAR-BENAR dipakai sebagai gerbang.

    Memeriksa keberadaan `is_active` saja tak cukup: kolom yang diambil
    lalu diabaikan terlihat sama dari luar. Yang dicari adalah
    perbandingan eksplisit terhadap `false` yang memulangkan 403.

    `=== false`, bukan `!is_active` — kolomnya nullable, dan NULL berarti
    "belum disetel", bukan "dinonaktifkan". Menolak NULL akan mengunci
    setiap akun lama yang kolomnya belum terisi.
  */
  const jadiGerbang = /is_active\s*===\s*false/.test(kode)
    && /status\(403\)/.test(kode)

  if (!diambil) {
    temuan.push({ nama, apa: '`is_active` tak diambil dari tabel users', akibat })
  } else if (!jadiGerbang) {
    temuan.push({
      nama,
      apa: '`is_active` diambil tetapi tak dipakai sebagai gerbang '
        + '(butuh `is_active === false` + `status(403)`)',
      akibat,
    })
  }
}

console.log('══ Akun nonaktif benar-benar tertutup ═════════════════════════')
for (const { nama, p } of PINTU) {
  const kode = tanpaKomentar(readFileSync(p, 'utf8'))
  const d = /\.select\(\s*['"][^'"]*\bis_active\b[^'"]*['"]/.test(kode)
  const g = /is_active\s*===\s*false/.test(kode) && /status\(403\)/.test(kode)
  console.log(`  ${d && g ? '✓ ' : '❌'} ${nama.padEnd(34)} diambil=${d ? 'YA ' : 'TDK'} gerbang=${g ? 'YA' : 'TDK'}`)
}
console.log(`  pelanggaran : ${temuan.length}`)

if (temuan.length > 0) {
  console.log('')
  for (const t of temuan) {
    console.log(`  ❌ ${t.nama}`)
    console.log(`     ${t.apa}`)
    console.log(`     → ${t.akibat}`)
  }
  console.log('')
  console.log('  Diukur 2026-09-01 sebelum diperbaiki: akun NONAKTIF login=200')
  console.log('  dan GET /projects=200 — sama persis dengan akun aktif.')
  console.log('')
  console.log('  Cacat ini tak memunculkan galat, tak menggagalkan test, dan tak')
  console.log('  terlihat di layar mana pun. Admin menekan "nonaktifkan", layar')
  console.log('  berkata nonaktif, orangnya tetap masuk.')
  console.log('')
  process.exit(1)
}

console.log('')
console.log('✅ Kedua pintu menegakkan `users.is_active`.')
console.log('   Batas: yang dijaga BENTUK kodenya. Bukti perilakunya dari rute')
console.log('   sungguhan — diukur 2026-09-01: login 403, token lama 403.')
