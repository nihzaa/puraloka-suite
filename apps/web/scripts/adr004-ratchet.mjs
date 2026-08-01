#!/usr/bin/env node
/**
 * PENJAGA ADR-004 — UI memutuskan lewat PERMISSION, bukan nama jabatan.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ADR-004 menetapkan: kode hanya boleh memeriksa CAPABILITY (`punch:manage`),
 * tak boleh nama role (`admin`). Alasannya bukan kerapian — role adalah **data
 * konfigurasi** yang founder ubah lewat UI, sementara permission adalah
 * kontrak.
 *
 * Sisi API sudah patuh (`requirePermission` di mana-mana). Sisi WEB tidak:
 * ditemukan 29 pemakaian `user?.role === "admin"` di 14 berkas (2026-08-01).
 *
 * ── Bukan pelanggaran teoretis: sudah menggigit hari ini
 *
 * Role kustom `direktur` punya **7 permission procurement** — tapi UI
 * menyembunyikan tombolnya karena mengecek `role === "admin" || role === "pm"`.
 * Orang dengan wewenang penuh melihat halaman tanpa tombol, dan tak ada pesan
 * apa pun yang menjelaskan kenapa. Sepenuhnya senyap.
 *
 * Dampaknya "hanya kosmetik" karena API tetap menolak — tapi itu justru
 * membuatnya lebih buruk: tombol yang muncul lalu ditolak 403 setidaknya
 * memberi tahu; tombol yang tak pernah muncul tak memberi apa pun.
 *
 * ── Kenapa RATCHET, bukan larangan total
 *
 * 29 pelanggaran tersebar di 14 berkas, dan tiap satu butuh pemetaan
 * permission yang TEPAT — bukan penggantian mekanis. Memaksa nol sekarang
 * berarti menebak, dan permission yang salah lebih berbahaya daripada role
 * yang usang: ia MEMBUKA akses, bukan menutup.
 *
 * Yang ditegakkan: jangan bertambah. Turunkan angkanya tiap kali sekelompok
 * diperbaiki, seperti pola ratchet lain di repo ini.
 *
 * Jalankan: node apps/web/scripts/adr004-ratchet.mjs
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

const AKAR = join(import.meta.dirname, '..')

/**
 * AMBANG — pemakaian `role === "..."` untuk memutuskan tampilan.
 *
 * ⚠️ HANYA BOLEH TURUN. Kalau gagal karena NAIK, pakai `hasPermission("...")`
 * di kode baru Anda — jangan naikkan angkanya.
 *
 * **NOL sejak 2026-08-01.** Seluruh 27 pemakaian dipetakan ke capability yang
 * API BENAR-BENAR tuntut — diverifikasi satu per satu ke `requirePermission`
 * di rutenya, bukan ditebak dari nama tombolnya.
 *
 * Dua kasus butuh penilaian, bukan penggantian mekanis:
 *   · `isMandor` di halaman mandor → `!hasPermission('mandor:assign')`.
 *     Mandor tak punya capability itu, admin/pm/direktur punya — jadi "tak
 *     bisa menugaskan" = "melihat data sendiri". Efek sampingnya bagus:
 *     `direktur` kini melihat tab Penugasan yang dulu tersembunyi.
 *   · `canEdit` di halaman kas ternyata satu boolean untuk TIGA wewenang
 *     berbeda yang API pisahkan (transfer / konfirmasi / approve). Dipecah
 *     sesuai `requirePermission` masing-masing. Yang diperbaiki di sana dipetakan ke permission yang API
 * benar-benar tuntut, diverifikasi satu per satu:
 *   · approve MR   → `procurement:mr:manage` (level 1 rantai approval)
 *   · PO & GR      → `procurement:po:manage`
 *   · stok & opname→ `procurement:view`
 */
const AMBANG = 0

/**
 * Dikecualikan DENGAN ALASAN — bukan disembunyikan.
 *
 * Halaman yang memang bicara TENTANG role (bukan memutuskan berdasarkan role)
 * sah memakai nama role: itu datanya, bukan gerbangnya.
 */
const DIKECUALIKAN = new Map(Object.entries({
  'app/(dashboard)/pengaturan/roles/page.tsx':
    'halaman pengelolaan role — menampilkan & membandingkan nama role adalah isinya',
  'app/(dashboard)/users/page.tsx':
    'halaman kelola user — dropdown pilih role, bukan gerbang akses',
  'app/page.tsx':
    'pengalihan awal: client → /portal, sisanya → /dashboard. Ini IDENTITAS ' +
    '(portal mana yang jadi rumahnya), bukan kewenangan — tak ada permission ' +
    '"saya client", dan memaksakan satu justru mengaburkan bedanya.',

  // ── Tiga layout portal: alasan yang SAMA dengan app/page.tsx ──────────────
  //
  // Ditemukan 2026-08-01 saat pola diperlebar (nama variabel `u`, sebelumnya
  // hanya `currentUser|user|me` yang dijaga). Keempatnya menjawab pertanyaan
  // "kamu ada di alamat yang salah, ini rumahmu" — BUKAN "kamu tak berwenang".
  //
  // Bedanya nyata, bukan istilah: seorang `mandor` yang membuka `/portal`
  // tidak sedang ditolak, ia sedang salah alamat, dan yang benar adalah
  // MEMINDAHKANNYA ke `/mandor-portal`. Permission tak bisa menyatakan itu —
  // `hasPermission()` hanya menjawab boleh/tidak, tak menjawab "ke mana".
  //
  // Gerbang KEWENANGAN di dalam portal-portal ini tetap wajib pakai
  // `hasPermission()`, dan itu tetap dijaga: pengecualian ini hanya menutupi
  // pengalihan di layout, bukan seluruh isi halamannya.
  'app/portal/layout.tsx':
    'pengalihan identitas: bukan-client dipindahkan ke /dashboard',
  'app/mandor-portal/layout.tsx':
    'pengalihan identitas: bukan-mandor dipindahkan ke /dashboard',
  'app/pm-portal/layout.tsx':
    'pengalihan identitas: admin → /dashboard, client → /portal; `mandor` ' +
    'diizinkan karena bisa merangkap PM di suatu proyek (diverifikasi lewat ' +
    'API, bukan lewat nama role)',
}))

function berkasTsx(dir) {
  const h = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.') || e.name === 'ds-bundle') continue
    const p = join(dir, e.name)
    if (e.isDirectory()) h.push(...berkasTsx(p))
    else if (e.name.endsWith('.tsx')) h.push(p)
  }
  return h
}

// Perbandingan `.role` dengan nama jabatan literal, dalam BENTUK APA PUN.
//
// ── Dua kali diperlebar, dua-duanya karena angka nol yang PALSU
//
// (1) `!==` semula tak ditangkap. Yang lolos justru bentuk paling berbahaya:
//     `if (user?.role !== "admin") return <TidakBolehMasuk/>` di `/audit` dan
//     `/sistem`. Itu bukan menyembunyikan satu tombol — itu menutup SELURUH
//     halaman. `direktur` yang punya `audit:view` ditolak di depan pintu oleh
//     halaman yang API-nya sendiri akan melayani.
//
// (2) Nama variabelnya semula dibatasi `currentUser|user|me`. Apa pun di luar
//     tiga nama itu (`akun`, `profil`, `sesi`) lewat tanpa suara — dan tak ada
//     yang menghalangi orang menamainya begitu.
//
// Keduanya pelajaran yang sama, dan sudah berulang di repo ini: alat ukur yang
// melaporkan nol lebih berbahaya daripada tak ada alat ukur, karena ia
// menghentikan pencarian.
//
// ── Yang SENGAJA tidak dihitung: penyaringan daftar
//
// `users.filter(u => u.role === "pm")` memilih ISI dropdown, bukan menentukan
// wewenang. Versi pertama menangkapnya dan menuduh palsu `kas/page.tsx:959`.
// Dibedakan lewat konteks di bawah (`.filter(`/`.map(`/`.some(` pada baris yang
// sama), bukan lewat daftar nama variabel — karena nama bisa apa saja,
// sedangkan bentuk penyaringan cukup khas.
const POLA = /\b[A-Za-z_$][\w$]*\s*\??\.\s*role\s*[!=]==\s*["'][a-z_]+["']/g

/** Baris yang menyaring DAFTAR menurut role — sah, bukan gerbang akses. */
const PENYARINGAN_DAFTAR = /\.\s*(filter|map|some|every|find|findIndex|reduce|sort)\s*\(/

const temuan = []
for (const f of [...berkasTsx(join(AKAR, 'app')), ...berkasTsx(join(AKAR, 'components'))]) {
  const rel = relative(AKAR, f).replace(/\\/g, '/')
  if (DIKECUALIKAN.has(rel)) continue
  const baris = readFileSync(f, 'utf8').split('\n')
  for (let i = 0; i < baris.length; i++) {
    const t = baris[i].trim()
    // Komentar bukan kode — berkas di repo ini menjelaskan dirinya panjang
    // lebar, dan kalimat "sebelumnya mengecek role === admin" ikut terhitung.
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue
    if (PENYARINGAN_DAFTAR.test(baris[i])) continue
    const n = (baris[i].match(POLA) || []).length
    for (let k = 0; k < n; k++) temuan.push(`${rel}:${i + 1}`)
  }
}

console.log(`ADR-004: ${temuan.length} pemakaian \`role === "..."\` untuk memutuskan tampilan`)

if (temuan.length > AMBANG) {
  console.error(`\n❌ PENJAGA ADR-004 GAGAL: ${temuan.length} > ambang ${AMBANG}\n`)
  console.error('   ADR-004: kode memeriksa CAPABILITY, bukan nama jabatan. Role adalah')
  console.error('   data konfigurasi yang bisa diubah founder lewat UI; permission adalah')
  console.error('   kontrak.')
  console.error('\n   Sudah menggigit: role `direktur` punya 7 permission procurement tapi')
  console.error('   UI menyembunyikan tombolnya karena mengecek `role === "admin"`.')
  console.error('   Orang berwenang melihat halaman tanpa tombol, tanpa pesan apa pun.')
  console.error('\n   Perbaikan: `hasPermission("modul:aksi")` dari @/lib/api — dan pilih')
  console.error('   permission yang API BENAR-BENAR tuntut, jangan menebak.')
  console.error('\n   Baru:')
  temuan.slice(0, 12).forEach((t) => console.error(`     ${t}`))
  console.error('')
  process.exit(1)
}

if (temuan.length < AMBANG) {
  console.log(`\n📉 Turun dari ambang (${temuan.length} < ${AMBANG}) — kencangkan angkanya`)
  console.log('   di scripts/adr004-ratchet.mjs.')
}
