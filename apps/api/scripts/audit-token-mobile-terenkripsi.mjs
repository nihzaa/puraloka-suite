#!/usr/bin/env node
/**
 * audit-token-mobile-terenkripsi.mjs — ambang NOL
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-31: aplikasi mobile menyimpan `access_token` DAN
 * `refresh_token` di `AsyncStorage` — penyimpanan biasa, tanpa enkripsi.
 *
 *   Android  file SQLite di direktori aplikasi. Terbaca perangkat ter-root,
 *            dan ikut `adb backup` bila `allowBackup` belum dimatikan
 *   iOS      file di sandbox aplikasi, ikut backup iTunes/iCloud tak
 *            terenkripsi
 *
 * Yang bocor bukan sekadar sesi: `refresh_token` memperpanjang dirinya
 * sendiri. Satu kali terbaca berarti akses yang tak kedaluwarsa sampai
 * seseorang mencabutnya — dan tak seorang pun akan tahu untuk mencabutnya,
 * karena tak ada gejala apa pun.
 *
 * `expo-secure-store` sudah terpasang di `package.json` sejak awal, dan NOL
 * berkas memakainya. Paket yang terpasang tapi tak dipakai adalah bentuk
 * cacat yang paling mudah lolos: `package.json` terlihat benar.
 *
 * ── Yang dijaga
 *
 *   1. `lib/storage.ts` WAJIB memakai SecureStore untuk kunci rahasia
 *   2. Tak ada berkas lain yang menulis token langsung ke AsyncStorage —
 *      melewati lapisan `storage` berarti melewati enkripsinya
 *
 * ── Kenapa memeriksa TEKS, bukan menjalankan aplikasinya
 *
 * Menjalankan Expo di CI menuntut emulator. Yang dijaga di sini adalah
 * KEPUTUSAN di kode — kunci mana yang masuk lapisan aman — dan itu terbaca
 * dari sumbernya. Perilaku runtime-nya diuji terpisah di perangkat.
 *
 * Ambang NOL.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const SKRIP = dirname(fileURLToPath(import.meta.url))
const AKAR = dirname(dirname(SKRIP))              // apps/
const MOBILE = join(AKAR, 'mobile')

/** Kunci yang isinya rahasia — sama dengan daftar `RAHASIA` di storage.ts. */
const KUNCI_RAHASIA = ['puraloka_token', 'puraloka_refresh']

let berkasStorage
try {
  berkasStorage = readFileSync(join(MOBILE, 'lib', 'storage.ts'), 'utf8')
} catch {
  console.error('❌ apps/mobile/lib/storage.ts tak terbaca — jalur meleset.')
  console.error('   Nol temuan tanpa membaca berkasnya BUKAN bukti apa pun.')
  process.exit(1)
}

const temuan = []

/* ── 1. storage.ts wajib memakai SecureStore, dan menyebut tiap kunci rahasia */
if (!/expo-secure-store/.test(berkasStorage)) {
  temuan.push(
    'lib/storage.ts tak memakai `expo-secure-store` — token tersimpan tanpa enkripsi.\n' +
      '        Paketnya SUDAH terpasang; yang kurang cuma pemakaiannya.'
  )
} else {
  for (const k of KUNCI_RAHASIA) {
    if (!berkasStorage.includes(k)) {
      temuan.push(
        `lib/storage.ts memakai SecureStore tetapi tak menyebut "${k}".\n` +
          '        Kunci yang tak terdaftar tersimpan tanpa enkripsi, tanpa galat.'
      )
    }
  }
}

/* ── 2. Tak ada yang menulis token langsung ke AsyncStorage */
function telusuri(dir) {
  const keluar = []
  for (const nama of readdirSync(dir)) {
    if (nama === 'node_modules' || nama.startsWith('.')) continue
    const p = join(dir, nama)
    if (statSync(p).isDirectory()) keluar.push(...telusuri(p))
    else if (/\.(ts|tsx)$/.test(nama)) keluar.push(p)
  }
  return keluar
}

let berkas = []
try {
  berkas = telusuri(MOBILE)
} catch {
  console.error('❌ Tak bisa menelusuri apps/mobile.')
  process.exit(1)
}

if (berkas.length < 5) {
  console.error(`❌ Hanya ${berkas.length} berkas terbaca — penelusuran meleset.`)
  console.error('   Korpus yang terlalu kecil membuat nol temuan tak berarti.')
  process.exit(1)
}

for (const f of berkas) {
  const rel = relative(MOBILE, f).replace(/\\/g, '/')
  if (rel === 'lib/storage.ts') continue          // ia YANG melakukan enkripsinya
  const isi = readFileSync(f, 'utf8')
  if (!/AsyncStorage/.test(isi)) continue

  for (const k of KUNCI_RAHASIA) {
    /* Yang dicari: AsyncStorage DAN nama kunci rahasia di berkas yang sama. */
    if (isi.includes(k)) {
      temuan.push(
        `${rel} menyentuh AsyncStorage dan "${k}" sekaligus.\n` +
          '        Menulis token di luar `lib/storage.ts` melewati enkripsinya.'
      )
    }
  }
}

console.log('══ Token mobile wajib terenkripsi ═════════════════════════════')
console.log('  berkas dipindai :', berkas.length)
console.log('  kunci rahasia   :', KUNCI_RAHASIA.length)
console.log('  pelanggaran     :', temuan.length)

if (temuan.length) {
  console.error(`\n❌ ${temuan.length} pelanggaran:`)
  for (const t of temuan) console.error('     ·', t)
  console.error(`
   Perbaikan: simpan lewat \`storage\` dari \`lib/storage.ts\`, dan daftarkan
   kuncinya di himpunan \`RAHASIA\` di sana.

   Yang TIDAK cukup: memakai SecureStore di satu tempat lalu AsyncStorage di
   tempat lain — dua sumber kebenaran berarti logout yang menghapus salah
   satunya meninggalkan sesi yang masih sah.`)
  process.exit(1)
}

console.log('\n✅ Token mobile disimpan lewat lapisan terenkripsi.')
