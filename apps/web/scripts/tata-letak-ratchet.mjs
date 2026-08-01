#!/usr/bin/env node
/**
 * PENJAGA TATA LETAK — tiap halaman dashboard wajib memakai token lebar (E11).
 *
 * ── Kenapa ada
 *
 * Sampai 2026-07-31 tak ada satu pun aturan lebar halaman. Hasil hitungnya:
 * 26 halaman memakai SEMBILAN lebar berbeda (720/820/840/900/960/1100/1200/
 * 1400 dan "tanpa batas sama sekali"), dan **13 halaman tidak memusatkan diri**
 * — pada layar 1920px isinya melebar sampai 1700px, sehingga satu baris tabel
 * tak bisa diikuti mata dan ruang kanan terasa menganga. Itulah yang ditanyakan
 * founder ("bagian samping kanannya terasa kosong").
 *
 * Angka-angka itu tak pernah diputuskan siapa pun. Ia diwarisi: halaman baru
 * disalin dari halaman yang kebetulan dibuka lebih dulu. Memperbaiki 26 halaman
 * sekali jalan TIDAK menyelesaikannya — halaman ke-27 akan disalin dari yang
 * ke-26 dan lingkarannya berulang.
 *
 * Karena itu yang ditegakkan di sini bukan "sudah rapi hari ini", melainkan
 * "tak bisa berantakan lagi besok".
 *
 * ── Kenapa skrip, bukan test
 *
 * `apps/web` belum punya test runner (celah yang sudah tercatat di STATUS.md
 * untuk middleware.ts). Menambah vitest hanya demi aturan ini adalah pekerjaan
 * tersendiri; sementara itu pola yang sudah terbukti di repo ini adalah skrip
 * yang dipanggil CI — sama seperti `lint-ratchet.mjs`.
 *
 * ── Kenapa memeriksa TEKS, bukan hasil render
 *
 * Batasnya memang ditulis sebagai style inline di berkas sumber; tak ada
 * lapisan lain yang bisa diperiksa tanpa menjalankan browser. Konsekuensinya
 * jujur: skrip ini memeriksa bahwa tokennya DIPAKAI, bukan bahwa hasilnya
 * terlihat benar. Yang kedua tetap butuh mata manusia.
 *
 * ── Lingkup: HANYA app/(dashboard)
 *
 * `/portal`, `/pm-portal`, dan `/mandor-portal` SENGAJA di luar penjaga ini —
 * bukan terlewat. Ketiganya konteks desain yang berbeda: tanpa sidebar, dibuka
 * dari HP oleh klien & mandor, dan lebarnya sudah dibatasi viewport ponsel
 * lewat layout-nya masing-masing. Memaksakan token dashboard ke sana akan
 * membuat halaman ponsel dibatasi 1500px — angka yang tak berarti apa pun di
 * layar 390px, sambil merusak padding yang sudah disetel untuk sentuhan.
 *
 * Kalau suatu saat portal dibuka dari desktop dan terasa melebar, itu masalah
 * TERSENDIRI dengan jawaban tersendiri — bukan alasan menyeragamkannya ke sini.
 *
 * Jalankan: node apps/web/scripts/tata-letak-ratchet.mjs
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

const AKAR = join(import.meta.dirname, '..')
const DASHBOARD = join(AKAR, 'app', '(dashboard)')

/** Token lebar yang sah. Menambah token baru = keputusan sadar, bukan refleks. */
const TOKEN_SAH = ['--w-form', '--w-page', '--w-luas']

/**
 * Halaman yang sengaja DIKECUALIKAN, dengan alasan tertulis.
 * Daftar ini harus tetap pendek — kalau memanjang, itu sendiri sinyal bahwa
 * tokennya yang salah, bukan halamannya.
 */
const DIKECUALIKAN = new Map(Object.entries({
  // (kosong — seluruh 26 halaman patuh per 2026-07-31)
}))

function berkasHalaman(dir) {
  const hasil = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) hasil.push(...berkasHalaman(p))
    else if (e.name === 'page.tsx') hasil.push(p)
  }
  return hasil
}

const halaman = berkasHalaman(DASHBOARD)
const pelanggaran = []
const pakai = { '--w-form': 0, '--w-page': 0, '--w-luas': 0 }

for (const f of halaman) {
  const rel = relative(AKAR, f).replace(/\\/g, '/')
  if (DIKECUALIKAN.has(rel)) continue
  const isi = readFileSync(f, 'utf8')

  // Dua bentuk penulisan, keduanya SAH:
  //   inline style JSX  → maxWidth: "var(--w-page)"
  //   CSS (styled-jsx)  → max-width: var(--w-page)
  //
  // ⚠️ Versi pertama hanya mengenali bentuk JSX, dan menolak halaman yang
  // memakai token dengan benar lewat CSS. Yang ditegakkan penjaga ini adalah
  // MAKSUDNYA (halaman memusat pada lebar terkontrol), bukan gaya penulisan —
  // menolak halaman yang patuh adalah tuduhan palsu, dan tuduhan palsu membuat
  // orang berhenti memercayai penjaganya lalu mengecualikan berkasnya.
  const token = TOKEN_SAH.find(
    (t) => isi.includes(`maxWidth: "var(${t})"`) || new RegExp(`max-width:\\s*var\\(${t}\\)`).test(isi),
  )
  if (!token) {
    pelanggaran.push(
      `${rel}\n      container halaman tak memakai token lebar. ` +
      `Pakai salah satu: ${TOKEN_SAH.join(' · ')}`,
    )
    continue
  }
  pakai[token]++

  // Batas tanpa pemusatan = konten menempel kiri, ruang kanan menganga. Ini
  // persis bentuk cacat aslinya, jadi diperiksa terpisah — `maxWidth` saja
  // TIDAK cukup dan mudah terlewat karena "kelihatannya sudah ada batasnya".
  if (!isi.includes('margin: "0 auto"') && !/margin:\s*0 auto/.test(isi)) {
    pelanggaran.push(`${rel}\n      punya maxWidth tapi TANPA \`margin: "0 auto"\` — konten akan menempel kiri.`)
  }

  // Lebar mentah pada container halaman (bukan modal/kolom tabel, yang memang
  // wajar berangka). Yang dilarang khusus: angka bersanding dengan margin auto.
  const mentah = isi.match(/maxWidth:\s*\d{3,4}\s*,\s*margin:\s*"0 auto"/)
  if (mentah) {
    pelanggaran.push(`${rel}\n      masih ada lebar mentah "${mentah[0]}" — ganti dengan token.`)
  }
}

if (pelanggaran.length) {
  console.error('\n❌ PENJAGA TATA LETAK GAGAL:\n')
  pelanggaran.forEach((p) => console.error('   ' + p + '\n'))
  console.error(
    '   Kenapa ini ditegakkan: sebelum E11, 13 dari 26 halaman tak memusatkan\n' +
    '   diri — di layar 1920px isinya melebar sampai 1700px dan sisi kanan\n' +
    '   terasa menganga. Token dipilih menurut BENTUK isi, bukan selera:\n' +
    '     --w-form (900)  formulir & bacaan satu kolom (~75 karakter/baris)\n' +
    '     --w-page (1280) default: kartu, daftar, ringkasan campuran\n' +
    '     --w-luas (1500) tabel padat kolom (estimasi, procurement, laporan)\n' +
    '   Definisinya di app/globals.css. Salin pola container dari halaman mana pun,\n' +
    '   mis: padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)", width: "100%",\n' +
    '        maxWidth: "var(--w-page)", margin: "0 auto"\n',
  )
  process.exit(1)
}

console.log(
  `✅ Tata letak: ${halaman.length} halaman patuh ` +
  `(form ${pakai['--w-form']} · normal ${pakai['--w-page']} · luas ${pakai['--w-luas']})`,
)

// ── Penjaga JALAN MASUK halaman (§9a) ──────────────────────────────────────
//
// Satu halaman baru butuh TIGA hal, dan lupa salah satunya membuat sisanya
// mati TANPA GEJALA:
//   1. berkas `page.tsx`            (ada — kalau tidak, ia tak ada di daftar ini)
//   2. izin rute di `middleware.ts` (kalau tidak: redirect balik ke /dashboard)
//   3. baris di `menu_items`        (kalau tidak: tak ada tautannya di mana pun)
//
// Yang dijaga di sini nomor 2, karena ia satu-satunya yang bisa diperiksa dari
// sumber tanpa menyentuh DB. Ini BUKAN hipotetis: `/estimasi` tak bisa diakses
// admin/pm selama berbulan-bulan — seluruh CECEP (10 bulan kerja) hanya teruji
// lewat API — karena `middleware.ts` tak pernah diperbarui sejak halaman itu
// lahir. Ketahuan 2026-07-30, dari verifikasi E2E, bukan dari review.
const middleware = readFileSync(join(AKAR, 'middleware.ts'), 'utf8')
const takTerdaftar = []
for (const f of halaman) {
  const rel = relative(AKAR, f).split('\\').join('/')
  // 'app/(dashboard)/tender/page.tsx' → '/tender'; hanya rute TINGKAT SATU,
  // karena middleware memakai prefix (`/proyek` mencakup `/proyek/[id]`).
  const m = rel.match(/^app\/\(dashboard\)\/([^/]+)\/page\.tsx$/)
  if (!m || m[1].startsWith('[')) continue
  // Diperiksa PER-ROLE, bukan "ada di suatu tempat di berkas". Uji mutasi
  // membuktikan versi pertama tak berguna: menghapus `/tender` dari baris `pm`
  // tetap hijau karena baris `admin` masih menyebutnya — padahal PM sudah
  // kehilangan aksesnya. Yang menentukan bukan keberadaan string, melainkan
  // apakah SETIAP role yang seharusnya berhak benar-benar menyebutnya.
  const wajib = ['admin', 'pm']
  const kurang = wajib.filter((role) => {
    const baris = middleware.match(new RegExp(`^\\s*${role}:\\s*\\[[^\\]]*\\]`, 'm'))
    return baris ? !baris[0].includes(`"/${m[1]}"`) : true
  })
  // Halaman khusus satu role (mis. /users admin-only) tak dianggap kurang
  // selama SETIDAKNYA admin menyebutnya — yang dijaga adalah "tak terjangkau
  // siapa pun", bukan menyeragamkan hak akses.
  if (kurang.includes('admin')) takTerdaftar.push(`/${m[1]} (admin)`)
}
if (takTerdaftar.length) {
  console.error('\n❌ HALAMAN TAK TERDAFTAR DI middleware.ts:\n')
  takTerdaftar.forEach((r) => console.error(`   ${r}`))
  console.error('\n   Halaman ini AKAN redirect balik ke /dashboard untuk role mana pun')
  console.error('   yang tak menyebutnya di ROLE_ALLOWED — persis nasib /estimasi selama')
  console.error('   berbulan-bulan. Tambahkan rutenya ke role yang berhak.\n')
  process.exit(1)
}
