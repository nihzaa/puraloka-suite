#!/usr/bin/env node
/**
 * AUDIT GERBANG TENANCY — rute yang menyentuh `supabase` mentah TANPA saringan
 * tenant apa pun di badan handler-nya.
 *
 * HANYA MEMBACA. Keluarannya laporan, bukan vonis.
 *
 * ── Kenapa ada
 *
 * `tenancy-ratchet.test.ts` menjaga JUMLAH akses `supabase` mentah tidak naik.
 * Itu berguna, tapi ia tak bisa membedakan dua hal yang sangat berbeda:
 *
 *   • akses mentah SESUDAH gerbang tenant  → aman, sekadar hutang adopsi wrapper
 *   • akses mentah TANPA gerbang sama sekali → celah lintas-tenant
 *
 * Angka 468 di ratchet mencampur keduanya, sehingga "masih 468" terbaca sama
 * menakutkannya baik ketika semuanya bergerbang maupun ketika ada yang bolong.
 * Skrip ini memisahkannya.
 *
 * ── Kenapa nama gerbang DITEMUKAN, bukan didaftar
 *
 * Tiap modul menamai gerbangnya sendiri: `proyekMilikTenant`, `coMilikTenant`,
 * `versiMilikTenant`, `skenarioMilikTenant`, `tolakRoleTenantLain`,
 * `proyekBolehDibaca`, `resolveScopeItemOwnership`, `idAnggotaCompany`, …
 *
 * Versi pertama skrip ini memakai daftar yang diketik tangan, dan hasilnya
 * menyesatkan persis seperti yang mau dicegah: 58 rute dilaporkan "tanpa
 * gerbang", lalu turun ke 36 begitu daftarnya dilengkapi, lalu masih salah
 * lagi karena `proyekBolehDibaca` belum masuk. Daftar yang diketik tangan
 * SELALU ketinggalan satu, dan tiap yang ketinggalan adalah tuduhan palsu.
 *
 * Maka nama gerbang kini DITURUNKAN dari sumbernya: fungsi yang menerima
 * `request` DAN menyentuh `company_id`/`companyId`/`request.db` di badannya.
 * Menambah gerbang baru otomatis dikenali, tanpa menyunting skrip ini.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(__dirname, '..', 'src')
const RUTE = join(SRC, 'routes', 'v1')

/** Petunjuk tenancy langsung — bukan nama fungsi, melainkan mekanismenya. */
const PETUNJUK_LANGSUNG = [
  'request.db', 'request.companyId', '.shared(', '.viaProject(',
  'company_id', 'companyId', 'auth_company_id',
]

/**
 * Temukan fungsi-gerbang: menerima `request`, dan badannya menyentuh tenancy.
 * Dipindai di routes/ DAN utils/ karena sebagian gerbang dipakai lintas modul.
 */
function temukanGerbang() {
  // Dijalankan BERLAPIS sampai stabil (fixpoint), bukan sekali.
  //
  // Sebabnya konkret: `ambilPunchMilikTenant()` adalah gerbang sungguhan — ia
  // memanggil `proyekMilikTenant()` dan membalas null bila bukan haknya — tapi
  // ia tak pernah menyebut `company_id` SENDIRI. Dengan satu lapis, ia tak
  // dikenali, dan keempat rute yang memakainya dituduh bolong. Tuduhan palsu
  // yang persis dilarang catatan di kepala berkas ini: daftar gerbang yang
  // meleset satu membuat orang berhenti memercayai penjaganya.
  //
  // Gerbang yang dibangun DI ATAS gerbang lain adalah pola yang benar dan akan
  // makin sering — mendaftarkannya manual mengulangi kesalahan yang justru
  // diselesaikan dengan menurunkan nama dari sumber.
  let nama = new Set()
  for (let lapis = 0; lapis < 5; lapis++) {
    const sebelum = nama.size
    nama = satuLapis(nama)
    if (nama.size === sebelum) break
  }
  return nama
}

/** Satu lapis penemuan; `dikenal` = gerbang dari lapis sebelumnya. */
function satuLapis(dikenal) {
  const nama = new Set(dikenal)
  const berkas = [
    ...readdirSync(RUTE).filter((f) => f.endsWith('.ts')).map((f) => join(RUTE, f)),
    ...readdirSync(join(SRC, 'utils')).filter((f) => f.endsWith('.ts')).map((f) => join(SRC, 'utils', f)),
  ]
  for (const f of berkas) {
    const isi = readFileSync(f, 'utf8')
    const baris = isi.split('\n')
    for (let i = 0; i < baris.length; i++) {
      const m = baris[i].match(/(?:async\s+)?function\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/)
      if (!m) continue
      // Badan fungsi: sampai kurung kurawal penutup pada INDENTASI YANG SAMA.
      //
      // Versi lama memotong "60 baris atau deklarasi berikutnya", dan itu
      // menyerempet kode di LUAR fungsi. Akibatnya `getMondayOf` — fungsi
      // tanggal bersarang di rab-schedule.ts — terhitung "menyentuh tenancy"
      // hanya karena rute di bawahnya menyentuh. Gerbang PALSU lebih berbahaya
      // daripada tuduhan palsu: ia membuat rute yang benar-benar bolong
      // terhitung aman, dan penjaganya berhenti menjaga apa pun.
      //
      // Membatasi ke fungsi top-level BUKAN jawabannya — `ambilEOT` dan
      // `resolveScopeItemOwnership` adalah gerbang sungguhan yang juga
      // bersarang. Yang membedakan bukan posisinya, tapi apakah badan fungsi
      // ITU SENDIRI memeriksa tenancy.
      const indentasi = (baris[i].match(/^(\s*)/) || ['', ''])[1]
      let akhir = Math.min(i + 80, baris.length)
      for (let j = i + 1; j < akhir; j++) {
        if (baris[j].replace(/\r$/, '') === `${indentasi}}`) { akhir = j + 1; break }
      }
      const badan = baris.slice(i, akhir).join('\n')
      // Fungsi PENDAFTAR RUTE (`cashRoutes(app)`, `ahspRoutes(app)`) juga
      // menyentuh tenancy di dalamnya, tapi ia BUKAN gerbang — ia induk dari
      // rute-rute yang sedang diperiksa. Memasukkannya membuat setiap rute di
      // berkas itu dianggap bergerbang hanya karena nama induknya disebut.
      if (/Routes$/.test(m[1])) continue
      // Gerbang menerima `request` sebagai PARAMETER, bukan `app`.
      const terimaRequest = /\(\s*request\b|request:\s*FastifyRequest/.test(badan)
      // Menyentuh tenancy LANGSUNG, atau lewat gerbang yang sudah dikenal.
      // `g !== m[1]` mencegah fungsi menyatakan dirinya sendiri gerbang lewat
      // rekursi — yang akan membuat penjaga ini meluluskan apa pun.
      const sentuhTenancy =
        PETUNJUK_LANGSUNG.some((p) => badan.includes(p)) ||
        [...dikenal].some((g) => g !== m[1] && badan.includes(g))
      if (terimaRequest && sentuhTenancy) nama.add(m[1])
    }
  }
  return nama
}

const gerbang = temukanGerbang()
const semua = [...PETUNJUK_LANGSUNG, ...gerbang]

const temuan = []
let bergerbang = 0
for (const f of readdirSync(RUTE).filter((x) => x.endsWith('.ts'))) {
  const baris = readFileSync(join(RUTE, f), 'utf8').split('\n')
  for (let i = 0; i < baris.length; i++) {
    const m = baris[i].match(/app\.(get|post|patch|put|delete)[<(]/)
    if (!m) continue
    let akhir = baris.length
    for (let j = i + 1; j < Math.min(i + 250, baris.length); j++) {
      if (/^\s{2}app\.(get|post|patch|put|delete)[<(]/.test(baris[j])) { akhir = j; break }
    }
    const badan = baris.slice(i, akhir).join('\n')
    if (!/\bsupabase\s*\.\s*(from|rpc|storage)/.test(badan)) continue
    const rute = (badan.match(/'(\/api\/v1\/[^']*)'/) || [])[1] ?? '(?)'
    if (semua.some((g) => badan.includes(g))) { bergerbang++; continue }
    temuan.push(`${f}:${i + 1}  ${m[1].toUpperCase()} ${rute}`)
  }
}

/**
 * AMBANG — jumlah rute ber-supabase-mentah yang BELUM bergerbang.
 *
 * ⚠️ HANYA BOLEH TURUN. Kalau gagal karena NAIK, beri gerbang tenant pada rute
 * baru Anda — jangan naikkan angkanya.
 *
 * 6 tersisa per 2026-08-03, seluruhnya DIPERIKSA satu per satu (dibaca
 * kodenya, bukan dinilai dari namanya) dan sah lintas-tenant by design:
 *   · auth/login + google-callback       — jalan sebelum tenant bisa diketahui
 *   · notifications/subscribe (POST+DEL) — `.eq('id', user.id)`, baris sendiri
 *   · roles: /permissions + /auth/me/permissions — katalog capability; kunci
 *     permission adalah kontrak arsitektur, sama untuk setiap perusahaan
 *
 * ── Turun 7 → 6 (F1-2, 2026-08-03): `mandor/kasbon-photo/upload`
 *
 * Dulu dikecualikan dengan alasan "tulis storage, tak membaca apa pun". Alasan
 * itu benar tentang TABEL, tapi melewatkan bahwa ia menaruh berkas di bucket
 * BERSAMA dengan path `worker-kasbons/<timestamp>_<nama>` — nol penanda
 * perusahaan.
 *
 * Pada perusahaan kedua, seluruh nota kasbon semua perusahaan bertumpuk di satu
 * folder: kebijakan storage per-tenant mustahil ditulis (tak ada predikat), dan
 * "berkas ini milik siapa" hanya bisa ditebak dari nama.
 *
 * Path kini diawali `request.companyId`. Ini pengulangan pelajaran `modules` di
 * bawah, dengan bentuk berbeda: pengecualian yang menilai jalur BACA sambil
 * melewatkan jalur TULIS.
 *
 * ⚠️ `modules` DULU ada di daftar ini dengan alasan "kategori A, katalog global,
 * bukan data pelanggan". Penilaian itu SALAH dan bertahan karena tak seorang pun
 * memeriksa apa yang DITULIS: `is_enabled` tersimpan di baris katalog bersama,
 * jadi satu perusahaan mematikan modul → mati untuk semua (ditutup migrasi 155).
 * Pelajarannya: "kategori A" menjawab dari mana data DIBACA, bukan apakah rute
 * itu boleh MENULIS lintas-tenant. Saat menambah pengecualian ke daftar ini,
 * baca jalur tulisnya — bukan kategori tabelnya.
 *
 * Angka ini hasil UKUR sesudah celah nyata ditutup (182 → 192 → 195 bergerbang),
 * bukan target yang dipilih supaya hijau.
 */
const AMBANG_TANPA_GERBANG = 6

console.log(`Gerbang yang DITEMUKAN otomatis (${gerbang.size}): ${[...gerbang].sort().join(', ')}`)
console.log(`\nRute ber-supabase-mentah: ${bergerbang + temuan.length} · bergerbang ${bergerbang} · TANPA gerbang ${temuan.length}`)
if (temuan.length) {
  console.log('\n⚠️  Perlu ditinjau — akses mentah tanpa saringan tenant terdeteksi:')
  temuan.forEach((t) => console.log('   ' + t))
  console.log('\n   Sebagian SAH: endpoint lintas-tenant by design (login, katalog')
  console.log('   bersama, /my/companies), atau gerbangnya di luar 250 baris pertama.')
  console.log('   Yang perlu dilihat: rute yang MENULIS atau membaca by-id.')
}

// ── Penjaga (ratchet) ──────────────────────────────────────────────────────
// Dijadikan gerbang CI, bukan sekadar laporan: 8 celah yang ditutup 2026-07-31
// semuanya LOLOS review manusia selama berbulan-bulan. Yang menemukannya alat,
// dan alat yang cuma dijalankan saat seseorang ingat tak menjaga apa pun.
if (temuan.length > AMBANG_TANPA_GERBANG) {
  console.error(`\n❌ PENJAGA GERBANG GAGAL: ${temuan.length} rute tanpa gerbang (ambang ${AMBANG_TANPA_GERBANG}).`)
  console.error('   Rute baru yang menyentuh `supabase` mentah WAJIB punya saringan tenant.')
  console.error('   Pakai `request.db` (.from/.viaProject/.shared), atau gerbang eksplisit')
  console.error('   (proyekMilikTenant, idAnggotaCompany, dst) lalu balas 404 bila bukan haknya.')
  console.error('   JANGAN menaikkan ambang di scripts/audit-gerbang-tenancy.mjs.\n')
  process.exit(1)
}
if (temuan.length < AMBANG_TANPA_GERBANG) {
  console.log(`\n📉 Turun dari ambang (${temuan.length} < ${AMBANG_TANPA_GERBANG}) — kencangkan angkanya.`)
}
