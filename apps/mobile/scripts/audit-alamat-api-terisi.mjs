#!/usr/bin/env node
/**
 * PENJAGA — profil build rilis WAJIB punya alamat API yang benar.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * CACAT YANG DIJAGA, DIUKUR BUKAN DIDUGA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-19, sebelum `eas.json` ada:
 *
 *   apps/mobile/.env  →  EXPO_PUBLIC_API_URL=http://localhost:3001
 *   lib/api.ts        →  `?? 'http://localhost:3001'`
 *
 * `EXPO_PUBLIC_*` DIPANGGANG ke bundel saat build, bukan dibaca saat jalan.
 * Jadi APK yang dibuild dari mesin ini akan membawa `localhost:3001` — dan
 * di HP mandor, localhost adalah HP-NYA SENDIRI.
 *
 * Akibatnya bukan galat yang menunjuk sebabnya: tiap permintaan gagal dengan
 * galat jaringan yang MENUDUH SERVER, di tangan orang yang tak punya cara
 * memeriksanya, sesudah aplikasi telanjur disebar.
 *
 * `lib/api.ts` kini melempar saat modul dimuat bila alamatnya kosong pada
 * build rilis — artinya build salah-konfigurasi gagal di tangan PEMBUILD.
 * Penjaga ini lapis keduanya.
 *
 * ── Kenapa `development` dikecualikan
 *
 * Profil itu memang untuk mesin pengembang, dan localhost di sana benar.
 *
 * ── DUA TINGKAT, dan kenapa bukan satu
 *
 *   KOSONG       → PERINGATAN (exit 0). Belum ada yang salah: alamat API
 *                  publik adalah keputusan founder, dan tak ada build yang
 *                  bisa dibuat tanpanya. Memerahkan CI karena keputusan yang
 *                  belum diambil melatih orang mengabaikan CI merah — dan
 *                  penjaga yang diabaikan tak menjaga apa pun.
 *
 *   TERISI SALAH → MERAH (exit 1). Di sinilah bahayanya: alamat yang terisi
 *                  TERLIHAT sudah dipikirkan, dan localhost/LAN akan lolos
 *                  ke tangan mandor tanpa satu pun tanda.
 *
 * Ambang NOL untuk yang salah isi, sengaja lunak untuk yang belum diisi.
 * Begitu alamatnya diisi, penjaga ini otomatis jadi tegas — tanpa ada yang
 * perlu mengingat menaikkannya.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..')
const BERKAS = join(AKAR, 'eas.json')

/** Profil yang hasilnya dipasang di HP orang lain. */
const PROFIL_RILIS = ['preview', 'production']

/** Alamat yang tak akan pernah bisa dijangkau dari jaringan seluler. */
const TAK_TERJANGKAU = /localhost|127\.0\.0\.1|0\.0\.0\.0|192\.168\.|10\.\d+\.|172\.(1[6-9]|2\d|3[01])\./

let eas
try {
  eas = JSON.parse(readFileSync(BERKAS, 'utf8'))
} catch (e) {
  console.error(`❌ eas.json tak terbaca: ${e.message}`)
  console.error('   Tanpa berkas itu `eas build` menolak jalan, dan tak ada')
  console.error('   satu pun cara membuat APK yang bisa dipasang mandor.')
  process.exit(1)
}

const salah = []   // terisi TAPI keliru → MERAH
const kosong = []  // belum diputuskan   → PERINGATAN

for (const nama of PROFIL_RILIS) {
  const profil = eas?.build?.[nama]
  if (!profil) {
    salah.push({ nama, sebab: 'profil tak ada di eas.json' })
    continue
  }
  const alamat = String(profil.env?.EXPO_PUBLIC_API_URL ?? '').trim()
  if (!alamat) {
    kosong.push(nama)
  } else if (TAK_TERJANGKAU.test(alamat)) {
    salah.push({
      nama,
      sebab: `menunjuk ${alamat} — tak terjangkau dari jaringan seluler`,
    })
  }
}

console.log('══ Alamat API profil build rilis ══════════════════════════════')
console.log(`  profil diperiksa : ${PROFIL_RILIS.join(', ')}`)
console.log(`  salah isi        : ${salah.length} (ambang 0)`)
console.log(`  belum diisi      : ${kosong.length} (peringatan, bukan galat)`)

if (salah.length > 0) {
  console.error('\n❌ Profil rilis SALAH ISI:')
  for (const t of salah) console.error(`     ${t.nama.padEnd(12)} ${t.sebab}`)
  console.error('\n   Isi `build.<profil>.env.EXPO_PUBLIC_API_URL` dengan alamat yang')
  console.error('   BISA DIJANGKAU dari jaringan seluler. Alamat LAN kantor bekerja')
  console.error('   saat mandor di kantor lalu berhenti bekerja begitu ia sampai di')
  console.error('   proyek — kegagalan yang muncul justru di tempat aplikasi dipakai.')
  console.error('\n   Kenapa ditegakkan: EXPO_PUBLIC_* dipanggang ke bundel saat build.')
  console.error('   Salah isi tak menghasilkan galat saat membuild; ia menghasilkan')
  console.error('   aplikasi yang gagal di tangan mandor dengan pesan yang menuduh')
  console.error('   server.')
  console.error('\n   Langkah merilis: docs/RILIS-MOBILE.md')
  process.exit(1)
}

if (kosong.length > 0) {
  console.log(`\n⚠ Belum diisi: ${kosong.join(', ')}.`)
  console.log('   BUKAN galat — alamat API publik adalah keputusan founder, dan tak')
  console.log('   ada build yang bisa dibuat tanpanya. Penjaga ini otomatis jadi')
  console.log('   tegas begitu alamatnya diisi.')
  console.log('\n   Langkah merilis: docs/RILIS-MOBILE.md')
  process.exit(0)
}

console.log('\n✅ Seluruh profil rilis punya alamat API yang terjangkau.')
