#!/usr/bin/env node
/**
 * Tiap entri "Lainnya" wajib menunjuk LAYAR NATIVE yang benar-benar ada,
 * atau dinyatakan belum tersedia — tak ada keadaan ketiga.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI ADA, DAN KENAPA PREMISNYA BERUBAH
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Versi pertama (2026-08-31) menjaga hal yang berbeda: tiap modul WebView
 * wajib menunjuk halaman web yang punya `page.tsx`, sebab jalur tanpa
 * halaman membuka 404 Next.js DI DALAM bingkai aplikasi — tanpa tombol
 * kembali dan tanpa penjelasan.
 *
 * Ia hijau sampai akhir, dan tetap benar: ketujuh belas halamannya memang
 * ADA. Yang tak bisa ia lihat adalah apakah halamannya TAMPIL.
 *
 * Diukur 2026-09-11 ke produksi:
 *
 *     app.puraloka-suite.duckdns.org/keuangan      307 → /login
 *     …procurement · gudang · mutu · k3            307 → /login
 *
 * SEMUA tujuh belas, bukan sebagian. Founder: *"saya gamau ada webview
 * lagi, suka gagal dan ga nampil"* — dan WebView dicabut seluruhnya.
 *
 * ── Kenapa penjaga ini TIDAK ikut dihapus
 *
 * Premis lamanya hilang, tetapi bentuk cacatnya tidak: **peta di satu
 * berkas, tujuannya di berkas lain, dan tak ada yang menghubungkan.**
 *
 * Dulu petanya `web/[modul].tsx` → halaman di `apps/web`. Sekarang
 * `lainnya.tsx` → layar di `apps/mobile/app/(app)/`. Menghapus atau
 * me-rename satu layar tetap tak menimbulkan galat di daftar yang
 * menunjuknya.
 *
 * Bedanya cuma satu, dan menguntungkan: `nativeJalur` bertipe `Href`, jadi
 * `tsc` sudah menangkap jalur yang tak ada. Penjaga ini melengkapi dua hal
 * yang tak dilihat `tsc` — lihat "Yang diperiksa" di bawah.
 *
 * ── Yang diperiksa
 *
 *   1. tiap `nativeJalur` punya berkas layarnya di apps/mobile
 *      (`tsc` menangkap ini juga, TAPI hanya bila tipe rute sudah
 *      diregenerasi — `.expo/types/router.d.ts` dihasilkan saat build dan
 *      pernah basi enam hari, jadi hijaunya bisa berarti "belum tahu")
 *
 *   2. entri TANPA `nativeJalur` tak boleh punya jalur navigasi apa pun —
 *      ia wajib jadi baris MATI. Ini yang `tsc` tak bisa lihat sama
 *      sekali, dan justru inti keputusan founder: pintu yang bisa ditekan
 *      lalu gagal adalah yang menghapus kepercayaan pada aplikasinya.
 *
 *   3. nol jejak WebView di daftar itu — `/web/` sebagai tujuan navigasi
 *
 * ── Ambang NOL
 *
 * Satu pintu buntu sudah cukup mengajari orang bahwa aplikasinya tak bisa
 * dipercaya. Itu alasan yang sama dengan versi pertama penjaga ini, dan ia
 * tak berubah oleh pergantian teknologinya.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const LAINNYA = join(AKAR, 'apps', 'mobile', 'app', '(app)', 'lainnya.tsx')
const APP = join(AKAR, 'apps', 'mobile', 'app', '(app)')

if (!existsSync(LAINNYA)) {
  console.log('⏭  modul mobile nyata: DILEWATI (lainnya.tsx tak ada)')
  process.exit(0)
}

// ⚠ CR dibuang lebih dulu — CLAUDE.md §7a.
const lainnya = readFileSync(LAINNYA, 'utf8').replace(/\r/g, '')

/*
  Entri dibaca sebagai PASANGAN kunci→nativeJalur, bukan dua daftar
  terpisah yang lalu dicocokkan.

  Dua `matchAll` terpisah akan memasangkan entri ke-3 dengan jalur ke-3
  meski keduanya milik entri berbeda — dan hasilnya HIJAU yang salah,
  bukan merah. Regex di bawah memotong per-entri (`{ kunci: … }`), jadi
  pasangannya tak bisa bergeser.
*/
const entri = []
for (const blok of lainnya.matchAll(/\{\s*kunci:\s*'([a-z0-9-]+)'([\s\S]*?)\}\s*,/g)) {
  const kunci = blok[1]
  const isi = blok[2]
  const jalur = isi.match(/nativeJalur:\s*'([^']+)'/)?.[1] ?? null
  entri.push({ kunci, jalur })
}

/*
  Korpus kosong bukan bukti apa pun — pola yang meleset memulangkan nol
  temuan, dan nol terbaca seperti "semuanya benar". Ambang ini yang
  membedakan "tak ada pelanggaran" dari "tak ada yang terbaca".
*/
if (entri.length < 5) {
  console.error(`❌ Cuma ${entri.length} entri terbaca dari lainnya.tsx — polanya meleset.`)
  console.error('   Nol temuan dari korpus kosong bukan bukti apa pun.')
  process.exit(1)
}

/** Apakah `nativeJalur` punya berkas layarnya? expo-router: dir/index atau berkas. */
function layarAda(jalur) {
  const rel = jalur.replace(/^\//, '')
  return (
    existsSync(join(APP, `${rel}.tsx`)) ||
    existsSync(join(APP, rel, 'index.tsx'))
  )
}

const buntu = []
const webviewTersisa = []

for (const e of entri) {
  if (!e.jalur) continue
  if (/^\/web\//.test(e.jalur)) {
    webviewTersisa.push(e)
    continue
  }
  if (!layarAda(e.jalur)) buntu.push(e)
}

/*
  Entri tanpa `nativeJalur` WAJIB jadi baris mati.

  Yang diperiksa: tak ada `router.push` yang menebak jalur dari kunci —
  bentuk `\`/web/${m.kunci}\`` atau sejenisnya. Itulah persis mekanisme
  lama, dan ia bisa kembali tanpa satu pun `nativeJalur` ditambahkan.
*/
const tebakJalur = []
for (const m of lainnya.matchAll(/router\.push\(([^)]*)\)/g)) {
  const arg = m[1]
  if (/\$\{\s*m\.kunci\s*\}/.test(arg) || /\/web\//.test(arg)) {
    tebakJalur.push(arg.trim().slice(0, 60))
  }
}

const punyaNative = entri.filter((e) => e.jalur).length

console.log('══ Entri "Lainnya" menunjuk layar nyata ═══════════════════════')
console.log(`  entri di "Lainnya"   : ${entri.length}`)
console.log(`  punya layar native   : ${punyaNative}`)
console.log(`  baris mati (belum)   : ${entri.length - punyaNative}`)
console.log(`  jalur buntu          : ${buntu.length}`)
console.log(`  jejak WebView        : ${webviewTersisa.length + tebakJalur.length}`)

if (buntu.length || webviewTersisa.length || tebakJalur.length) {
  console.log('')
  for (const b of buntu) {
    console.log(`  ❌ ${b.kunci.padEnd(14)} ${b.jalur.padEnd(20)} layar native tak ada`)
  }
  for (const w of webviewTersisa) {
    console.log(`  ❌ ${w.kunci.padEnd(14)} ${w.jalur.padEnd(20)} masih menuju WebView`)
  }
  for (const t of tebakJalur) {
    console.log(`  ❌ router.push menebak jalur dari kunci: ${t}`)
  }
  console.log(`
  Entri yang BELUM punya layar native harus jadi baris MATI — tak bisa
  ditekan, dengan sebabnya tertulis. Bukan pintu yang gagal saat dibuka.

  Keputusan founder 2026-09-11: tidak ada WebView lagi. Diukur ke produksi,
  SELURUH 17 modul menjawab 307 → /login, dan menekan sesuatu yang tak
  pernah berhasil adalah cara tercepat mengajari orang bahwa aplikasinya
  tak bisa dipercaya.
`)
  process.exit(1)
}

console.log('')
console.log(
  `✅ ${punyaNative} entri menunjuk layar native yang ada; ` +
  `${entri.length - punyaNative} sisanya baris mati yang jujur.`
)
