#!/usr/bin/env node
/**
 * PENJAGA: SESI SINTETIS TAK PERNAH MENERIMA PERAN DARI PEMANGGIL.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * CACAT YANG DITUNJUK KRITERIA D1 — DAN IA NYATA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Kriteria menyebut `approval.ts:62` membaca `request.currentUser.role` apa
 * adanya. Diperiksa 2026-08-10: benar. Baris itu memanggil
 * `get_role_permissions(request.currentUser.role)`.
 *
 * Untuk sesi WEB itu aman — `authenticate` yang mengisinya, dari basis. Untuk
 * sesi SINTETIS tidak: pesan WhatsApp tak lewat `authenticate`, jadi siapa pun
 * yang menyusun objek request-nya menentukan perannya sendiri.
 *
 * Satu pemanggil yang ceroboh (atau satu webhook yang dipalsukan) cukup
 * mengirim `peran: 'admin'` untuk mendapat seluruh permission. Tak ada galat,
 * tak ada gejala — hanya seseorang yang tiba-tiba bisa melakukan lebih dari
 * seharusnya, lewat kanal yang paling sedikit diawasi.
 *
 * ── Yang diperiksa
 *
 *   S-1  `bangunSesiDariNomor` TIDAK punya parameter peran/role
 *   S-2  peran diresolusi dari `company_members`, bukan kolom salinan
 *   S-3  nol pembuatan objek sesi ber-peran di luar pabrik ini
 *   S-4  nomor yang BELUM terverifikasi ditolak — siapa pun bisa mengetik
 *        nomor orang lain di halaman profil
 *
 * S-3 yang paling mudah dilanggar: menyusun `{ currentUser: { role: 'admin' } }`
 * di satu rute terlihat seperti kemudahan pengujian, dan ia lolos TypeScript.
 *
 * Ambang NOL.
 *
 * Pakai:  node apps/api/scripts/audit-sesi-sintetis-aman.mjs
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(__dirname, '..', 'src')
const PABRIK = 'lib/wa-sesi.ts'

if (!existsSync(join(SRC, PABRIK))) {
  console.error(`✗ Pabrik sesi sintetis tak ditemukan: ${PABRIK}`)
  console.error('  Kalau dipindah, perbarui PABRIK di penjaga ini.')
  process.exit(1)
}

function berkasTs(dir) {
  const hasil = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) hasil.push(...berkasTs(p))
    else if (e.name.endsWith('.ts')) hasil.push(p)
  }
  return hasil
}

/** Buang komentar TANPA mengubah jumlah baris. */
function tanpaKomentar(src) {
  let dalamBlok = false
  return src.split('\n').map((b) => {
    const t = b.trim()
    if (dalamBlok) {
      if (t.includes('*/')) dalamBlok = false
      return ''
    }
    if (t.startsWith('/*')) {
      if (!t.includes('*/')) dalamBlok = true
      return ''
    }
    if (t.startsWith('//') || t.startsWith('*')) return ''
    return b
  }).join('\n')
}

const gagal = []
const srcPabrik = tanpaKomentar(readFileSync(join(SRC, PABRIK), 'utf8'))

// ── S-1: tanda tangan tanpa parameter peran ──────────────────────────────
const tandaTangan = /export async function bangunSesiDariNomor\(([\s\S]{0,300}?)\)/.exec(srcPabrik)
if (!tandaTangan) {
  gagal.push({
    aturan: 'S-1',
    pesan: `${PABRIK} tak mengekspor bangunSesiDariNomor`,
    akibat: 'tak ada pabrik tunggal; tiap pemanggil akan menyusun sesinya sendiri.',
  })
} else if (/\b(peran|role)\b/i.test(tandaTangan[1])) {
  gagal.push({
    aturan: 'S-1',
    pesan: `${PABRIK}: bangunSesiDariNomor menerima peran sebagai parameter`,
    akibat:
      'satu pemanggil yang ceroboh cukup mengirim `admin` untuk mendapat ' +
      'seluruh permission — lewat kanal yang paling sedikit diawasi.',
  })
}

// ── S-2: peran dari company_members ──────────────────────────────────────
if (!/company_members/.test(srcPabrik)) {
  gagal.push({
    aturan: 'S-2',
    pesan: `${PABRIK} tak meresolusi peran dari company_members`,
    akibat:
      'peran yang disalin ke kolom lain akan basi begitu peran orangnya diubah ' +
      'di ERP — dan basinya tak terlihat sampai seseorang memakai wewenang ' +
      'yang sudah dicabut. Ini persis celah TJS (daftar kontak terpisah).',
  })
}

// ── S-4: nomor belum terverifikasi ditolak ───────────────────────────────
//
// Diperiksa BERLAPIS: kolomnya harus ikut di-SELECT, DAN nilainya harus
// dipakai menolak. Versi pertama hanya mencari kata `terverifikasi_pada` di
// berkas — dan uji mutasi membuktikannya buta: menghapus kolom itu dari
// `.select()` membuat nilainya selalu undefined (jadi pemeriksaannya selalu
// lolos), sementara katanya masih muncul di baris `if`.
//
// Kolom yang tak di-SELECT tak menimbulkan galat. PostgREST hanya
// mengembalikan yang diminta, dan `undefined` di JavaScript adalah falsy —
// jadi `if (!baris.terverifikasi_pada)` justru MENOLAK semuanya, atau, kalau
// logikanya kebalik, MELOLOSKAN semuanya.
const adaDiSelect = /\.select\([^)]*terverifikasi_pada/.test(srcPabrik)
const dipakaiMenolak = /belum_terverifikasi/.test(srcPabrik)
if (!adaDiSelect || !dipakaiMenolak) {
  gagal.push({
    aturan: 'S-4',
    pesan: adaDiSelect
      ? `${PABRIK} membaca terverifikasi_pada tapi tak memakainya menolak`
      : `${PABRIK} tak meng-SELECT terverifikasi_pada`,
    akibat:
      'siapa pun bisa mengetik nomor orang lain di halaman profil. Tanpa ' +
      'verifikasi, mendaftarkan nomor korban sudah cukup untuk membaca datanya.',
  })
}

// ── S-3: nol sesi ber-peran dibuat di luar pabrik ────────────────────────
for (const path of berkasTs(SRC)) {
  const rel = path.slice(SRC.length + 1).replace(/\\/g, '/')
  if (rel === PABRIK) continue
  // `plugins/auth.ts` MEMANG membuat currentUser — itu jalur web yang sah,
  // dan perannya diambil dari basis di sana.
  if (rel === 'plugins/auth.ts') continue
  if (rel.includes('__tests__') || rel.endsWith('.test.ts') || rel.includes('test-utils')) continue

  const src = tanpaKomentar(readFileSync(path, 'utf8'))
  src.split('\n').forEach((isi, i) => {
    // Menyusun objek yang menyerupai currentUser dengan peran literal.
    if (/currentUser\s*[:=]\s*\{[^}]*\brole\s*:/.test(isi)) {
      gagal.push({
        aturan: 'S-3',
        pesan: `${rel}:${i + 1} menyusun currentUser dengan peran sendiri`,
        akibat:
          'peran yang ditulis di kode melewati seluruh pemeriksaan basis. ' +
          'Ia lolos TypeScript, dan terlihat seperti kemudahan pengujian.',
      })
    }
  })
}

console.log('══ Sesi sintetis aman ══════════════════════════════════════')
console.log(`  pabrik sah   : ${PABRIK}`)
console.log(`  pelanggaran  : ${gagal.length}`)
console.log('  ambang       : 0 (bukan ratchet)\n')

if (gagal.length > 0) {
  for (const g of gagal) {
    console.error(`   [${g.aturan}] ${g.pesan}`)
    console.error(`         → ${g.akibat}`)
  }
  console.error(`
   Peran yang diterima dari pemanggil tak menimbulkan galat apa pun. Yang
   terlihat hanya seseorang yang bisa melakukan lebih dari seharusnya — lewat
   kanal yang paling sedikit diawasi.

   Pola yang sah:
     const hasil = await bangunSesiDariNomor(db, nomor)
     if (!hasil.ok) { await catatAksesDitolak(db, nomor, hasil.alasan); return }
     // hasil.sesi.peran DIRESOLUSI dari company_members
`)
  process.exit(1)
}

console.log('✓ Peran diresolusi dari basis; nol sesi ber-peran dibuat di luar pabrik.')
