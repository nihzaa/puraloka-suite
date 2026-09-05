#!/usr/bin/env node
/**
 * Kontrak login mobile wajib utuh di KEDUA sisinya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-09-01, langsung ke API produksi:
 *
 *     POST /auth/login  → session: { expires_at }     tanpa access_token
 *     mobile menyimpan  → undefined
 *     GET /projects     → 401
 *
 * **Aplikasi mobile tak pernah bisa login sekali pun** — bukan sejak
 * perubahan tertentu, melainkan sejak ia ditulis.
 *
 * Dan tak ada galat yang menyebutnya. `lib/auth.ts` menulis
 * `storage.set('puraloka_token', session.access_token)` tanpa memeriksa, dan
 * layar login menampilkan pesan kredensial. Mandor akan mengira sandinya
 * yang salah.
 *
 * ── Kenapa cacat ini bisa kembali tanpa gejala
 *
 * Kontraknya hidup di DUA berkas yang tak saling tahu:
 *
 *     apps/api/src/routes/v1/auth.ts   memeriksa header `x-client`
 *     apps/mobile/lib/api.ts           mengirim header `X-Client`
 *
 * Menghapus salah satunya tak menimbulkan galat build, tak menggagalkan
 * `tsc`, dan tak menyentuh satu test pun. Yang gagal cuma orang yang mencoba
 * masuk — di HP, di lokasi, tanpa cara melaporkannya.
 *
 * Bentuk yang sama dengan cacat lain minggu ini: benar di satu lapis, patah
 * di lapis yang sesungguhnya dipakai.
 *
 * ── Yang DIJAGA, dan yang TIDAK
 *
 * DIJAGA: kedua sisi kontrak ada, dan token diberikan HANYA saat header itu
 * hadir — bukan ke semua klien.
 *
 * Yang kedua itu penting: memberikan token di badan untuk semua klien
 * membuang perlindungan XSS yang jadi alasan cookie HttpOnly dipakai.
 * Halaman web yang tersuntik skrip bisa membaca balasan `fetch`; ia tak bisa
 * membaca cookie HttpOnly.
 *
 * TIDAK DIJAGA: bahwa loginnya benar-benar berhasil. Itu hanya ketahuan
 * dengan memanggil rutenya, dan penjaga CI tak punya kredensial. Batas itu
 * disebutkan supaya hijaunya tak dibaca sebagai "mobile pasti bisa login".
 *
 * ── Ambang NOL
 *
 * Kontrak yang putus sebagian sama saja dengan putus seluruhnya.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const API = join(AKAR, 'apps', 'api', 'src', 'routes', 'v1', 'auth.ts')
const MOB = join(AKAR, 'apps', 'mobile', 'lib', 'api.ts')
const CORS = join(AKAR, 'apps', 'api', 'src', 'index.ts')

for (const [nama, p] of [['auth.ts', API], ['mobile/lib/api.ts', MOB], ['api/src/index.ts', CORS]]) {
  if (!existsSync(p)) {
    console.error(`❌ ${nama} tak ada di ${p} — jalurnya meleset.`)
    console.error('   Nol temuan dari korpus kosong bukan bukti apa pun.')
    process.exit(1)
  }
}

const api = readFileSync(API, 'utf8')
const mob = readFileSync(MOB, 'utf8')
const cors = readFileSync(CORS, 'utf8')

/*
  Komentar dibuang sebelum memeriksa. Kedua berkas MENJELASKAN kontrak ini
  panjang lebar di komentarnya, jadi mencari `x-client` apa adanya akan hijau
  meski kodenya sudah dihapus — persis kelas kesalahan yang menggigit saya
  berkali-kali hari ini.
*/
const tanpaKomentar = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')

const apiKode = tanpaKomentar(api)
const mobKode = tanpaKomentar(mob)

const temuan = []

// ── 1. API membaca header
if (!/headers\s*\[\s*['"]x-client['"]\s*\]/i.test(apiKode)) {
  temuan.push({
    berkas: 'apps/api/src/routes/v1/auth.ts',
    apa: 'tak membaca header `x-client`',
    akibat: 'mobile tak pernah menerima token — setiap permintaan 401',
  })
}

// ── 2. API memberikan access_token, dan BERSYARAT
const beriToken = /access_token:\s*data\.session\.access_token/.test(apiKode)
if (!beriToken) {
  temuan.push({
    berkas: 'apps/api/src/routes/v1/auth.ts',
    apa: 'tak memulangkan `access_token` di badan',
    akibat: 'mobile menyimpan undefined; layar login menuduh kredensial',
  })
}

/*
  Bersyarat atau tidak. Yang dicari: `access_token` muncul di dalam ekspresi
  yang bergantung pada variabel klien — bukan dikirim tanpa syarat.
*/
/*
  ⚠ Memeriksa keberadaan `untukMobile` SAJA tak cukup.

  Uji mutasi membuktikannya: mengubah syaratnya jadi `true || klien === ...`
  membuat token diberikan ke SEMUA klien, sementara penjaga tetap melihat
  `klien ===` dan menyatakan hijau. Penjaga yang lolos pada mutasi yang
  benar-benar berbahaya adalah hiasan.

  Yang diperiksa sekarang: syaratnya benar-benar MEMBANDINGKAN klien dengan
  'mobile', dan tak ada `true` yang memintasnya.
*/
const syaratBersih =
  /const\s+untukMobile\s*=\s*klien\s*===\s*['"]mobile['"]/.test(apiKode)
  && /session:\s*untukMobile\s*$/m.test(apiKode.replace(/[ 	]+$/gm, ''))

if (beriToken && !syaratBersih) {
  temuan.push({
    berkas: 'apps/api/src/routes/v1/auth.ts',
    apa: '`access_token` diberikan TANPA syarat klien',
    akibat: 'web ikut menerima token di badan — XSS bisa membacanya, dan itu '
      + 'membuang alasan cookie HttpOnly dipakai',
  })
}

// ── 3. Mobile mengirim header
if (!/headers\s*\[\s*['"]X-Client['"]\s*\]\s*=/.test(mobKode)) {
  temuan.push({
    berkas: 'apps/mobile/lib/api.ts',
    apa: 'tak mengirim header `X-Client`',
    akibat: 'API memperlakukannya seperti browser — token hanya lewat cookie, '
      + 'yang tak bisa dipakai aplikasi ini',
  })
}

/*
  ── 4. CORS mengizinkan header itu lewat ────────────────────────────────

  Sisi KETIGA kontrak ini, dan yang paling lama tersembunyi.

  Aplikasi native tak mengirim preflight — tak ada Origin, jadi tak ada
  CORS sama sekali. `X-Client` ditambahkan 2026-09-01 dan tak pernah
  didaftarkan di `allowedHeaders`; nol gejala selama tiga hari.

  Ketahuan pada jalan pertama `potret-mobile.mjs` (2026-09-04), yang
  membuka aplikasi mobile lewat peramban:

      Request header field x-client is not allowed by
      Access-Control-Allow-Headers in preflight response

  ⚠ Dua pengukuran yang keduanya BENAR melewatkan ini: preflight OPTIONS
  menjawab 204 dengan origin yang diizinkan, dan `curl` POST menjawab 200.
  `curl` tak menegakkan CORS, dan OPTIONS yang lolos origin masih bisa
  menolak HEADER-nya.

  Yang terdampak bukan cuma potret: setiap kali mobile dijalankan di
  peramban — pengembangan, demo, atau Expo web — login mati total.
*/
if (!/allowedHeaders\s*:\s*\[[^\]]*['"]X-Client['"]/i.test(cors)) {
  temuan.push({
    berkas: 'apps/api/src/index.ts',
    apa: '`X-Client` tak ada di `allowedHeaders` CORS',
    akibat: 'peramban menolak permintaan di preflight — mobile lewat Expo '
      + 'web/demo tak bisa login sama sekali. Aplikasi NATIVE tak terdampak '
      + '(tak ada preflight), jadi cacat ini nol gejala di jalur utama',
  })
}

console.log('══ Kontrak login mobile utuh di kedua sisi ════════════════════')
console.log(`  auth.ts membaca x-client   : ${/headers\s*\[\s*['"]x-client['"]\s*\]/i.test(apiKode) ? 'YA' : 'TIDAK'}`)
console.log(`  CORS izinkan X-Client      : ${/allowedHeaders\s*:\s*\[[^\]]*['"]X-Client['"]/i.test(cors) ? 'YA' : 'TIDAK'}`)
console.log(`  auth.ts beri access_token  : ${beriToken ? 'YA' : 'TIDAK'}`)
console.log(`  diberikan BERSYARAT        : ${syaratBersih ? 'YA' : 'TIDAK'}`)
console.log(`  mobile kirim X-Client      : ${/headers\s*\[\s*['"]X-Client['"]\s*\]\s*=/.test(mobKode) ? 'YA' : 'TIDAK'}`)
console.log(`  pelanggaran                : ${temuan.length}`)

if (temuan.length > 0) {
  console.log('')
  for (const t of temuan) {
    console.log(`  ❌ ${t.berkas}`)
    console.log(`     ${t.apa}`)
    console.log(`     → ${t.akibat}`)
  }
  console.log('')
  console.log('  Cacat ini TAK menggagalkan tsc, TAK menyentuh satu test pun, dan')
  console.log('  TAK memunculkan galat. Yang gagal cuma orang yang mencoba masuk —')
  console.log('  di HP, di lokasi, tanpa cara melaporkannya.')
  console.log('')
  process.exit(1)
}

console.log('')
console.log('✅ Kontrak login mobile utuh: header dikirim, dibaca, dan token bersyarat.')
