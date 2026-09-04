#!/usr/bin/env node
/**
 * audit-alih-auth-tak-berputar.mjs — ambang NOL
 *
 * Menjaga fungsi yang mengalihkan pengguna keluar saat sesinya habis
 * (`clearAuthAndRedirect` di `apps/web/lib/api.ts`) tetap memenuhi empat
 * syarat yang MEMUTUS putaran muat-ulang.
 *
 * ── Cacat yang ditutup
 *
 * Dilaporkan founder 2026-09-04: `/dashboard` "reload terus". Direproduksi
 * dengan merusak `puraloka_token` — meniru token yang KEDALUWARSA sesudah
 * ~1 jam, sementara cookie-nya sendiri berumur 7 hari:
 *
 *     cookie dibiarkan   : 64 navigasi / 12 detik, berakhir di /dashboard
 *     cookie dibersihkan :  2 navigasi / 12 detik, berakhir di /login
 *
 * Urutan putarannya, terekam dari browser sungguhan:
 *
 *     200 GET  /dashboard
 *     401 GET  /api/v1/menu   (+6 endpoint lain)
 *     400 POST /api/v1/auth/refresh
 *     200 POST /api/v1/auth/logout   ← dikirim, TIDAK ditunggu
 *     307 GET  /login                ← middleware melempar BALIK
 *     200 GET  /dashboard            ← ulang, ~3x per detik
 *
 * `middleware.ts` hanya memeriksa cookie ADA atau tidak — bukan sah atau
 * tidak. Selama cookie belum terhapus, `/login` selalu dilempar balik ke
 * home. Dan cookie belum terhapus karena `logout` dipanggil tanpa `await`:
 * `window.location.href` menang balapan.
 *
 * ── Kenapa dijaga, bukan cukup diperbaiki
 *
 * Tak satu pun dari 200+ penjaga, `tsc`, maupun seluruh test menangkapnya —
 * kodenya sah di setiap lapisan. Yang salah cuma URUTAN dua operasi async,
 * dan akibatnya baru muncul satu jam sesudah login, di browser pengguna.
 *
 * Menghapus `await` kelak (mis. saat "merapikan" fire-and-forget) akan
 * menghidupkannya kembali tanpa satu pun gejala di CI.
 *
 * ── Yang diperiksa
 *
 *   1. logout DITUNGGU (`await axios.post(... /auth/logout ...)`)
 *   2. `puraloka_role` dihapus di klien — ia bukan HttpOnly, jadi server
 *      tak bisa menghapusnya, dan middleware memakainya memilih home
 *   3. ada penahan agar banyak 401 berbarengan tak mengalihkan berkali-kali
 *   4. tak mengalihkan bila SUDAH di /login
 *
 * Memeriksa BENTUK kode, bukan hasil runtime — dan itu batasnya: ia tak
 * bisa tahu apakah putarannya benar-benar berhenti di browser. Untuk itu:
 *
 *     node apps/web/scripts/uji-alih-auth.mjs   (butuh basis + akun uji)
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const BERKAS = join(AKAR, 'apps', 'web', 'lib', 'api.ts')

let isi
try {
  isi = readFileSync(BERKAS, 'utf8')
} catch {
  console.error(`❌ ${BERKAS} tak terbaca — berkas dipindah?`)
  console.error('   Penjaga ini menjaga alur keluar-saat-sesi-habis; kalau')
  console.error('   berkasnya pindah, PINDAHKAN penjaganya, jangan hapus.')
  process.exit(1)
}

// Ambil badan fungsinya saja — pemeriksaan di seluruh berkas akan lolos
// karena `await` dan `puraloka_role` muncul di tempat lain juga.
const mulai = isi.indexOf('function clearAuthAndRedirect')
if (mulai === -1) {
  console.error('❌ `clearAuthAndRedirect` tak ditemukan di apps/web/lib/api.ts')
  console.error('   Kalau fungsinya diganti nama, perbarui penjaga ini —')
  console.error('   jangan biarkan ia hijau atas fungsi yang tak ada.')
  process.exit(1)
}
/*
  Batas fungsi dicari lewat kurung berimbang, bukan `indexOf('}')`.
  Fungsinya memuat blok `try`/`if`, jadi kurung tutup pertama ada di
  tengah — dan potongan yang terlalu pendek membuat pemeriksaan di
  bawahnya melaporkan "hilang" untuk baris yang sebenarnya ada.
*/
const buka = isi.indexOf('{', mulai)
let dalam = 0
let akhir = -1
for (let i = buka; i < isi.length; i++) {
  if (isi[i] === '{') dalam++
  else if (isi[i] === '}') {
    dalam--
    if (dalam === 0) { akhir = i; break }
  }
}
if (akhir === -1) {
  console.error('❌ kurung fungsi `clearAuthAndRedirect` tak berimbang')
  process.exit(1)
}
const badan = isi.slice(mulai, akhir + 1)

const syarat = [
  {
    nama: 'logout DITUNGGU',
    ok: /await\s+axios\.post\([^)]*auth\/logout/s.test(badan),
    kenapa: 'tanpa `await`, window.location menang balapan dan cookie HttpOnly '
      + 'belum terhapus saat halaman berpindah — middleware lalu melempar '
      + '/login balik ke home, dan putarannya lahir.',
  },
  {
    nama: 'cookie puraloka_role dihapus',
    ok: /puraloka_role\s*=\s*;|puraloka_role=;/.test(badan),
    kenapa: 'ia dipasang JS (bukan HttpOnly), jadi /auth/logout tak '
      + 'menghapusnya. Middleware membacanya untuk memilih home.',
  },
  {
    nama: 'penahan alih-berulang',
    ok: /if\s*\(\s*sudahDialihkan\s*\)|alreadyRedirect|sedangKeluar/.test(badan),
    kenapa: 'tujuh permintaan gagal berbarengan; tanpa penahan ketujuhnya '
      + 'masing-masing memanggil window.location.href.',
  },
  {
    nama: 'tak mengalihkan bila sudah di /login',
    ok: /pathname[^\n]*\/login/.test(badan),
    kenapa: 'memuat ulang halaman yang sama hanya mengulang putarannya '
      + 'dari ujung yang lain.',
  },
]

const gagal = syarat.filter((s) => !s.ok)

if (gagal.length > 0) {
  console.error('❌ `clearAuthAndRedirect` kehilangan syarat anti-putaran:\n')
  for (const s of gagal) {
    console.error(`   ✗ ${s.nama}`)
    console.error(`     ${s.kenapa}\n`)
  }
  console.error('   Diukur 2026-09-04 tanpa syarat-syarat itu: 64 navigasi')
  console.error('   dalam 12 detik, halaman /dashboard memuat ulang dirinya')
  console.error('   sekitar 3x per detik sampai tab ditutup.\n')
  console.error('   Berkas: apps/web/lib/api.ts')
  process.exit(1)
}

console.log(`✅ clearAuthAndRedirect memenuhi ${syarat.length} syarat anti-putaran`)
