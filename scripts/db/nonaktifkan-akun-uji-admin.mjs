#!/usr/bin/env node
/**
 * Menonaktifkan tiga akun UJI berizin ADMIN PENUH — tanpa menghapus apa pun.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA SKRIP INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-09-01: produksi dan pengembangan BERBAGI SATU BASIS.
 * Dibuktikan, bukan diduga — sandi yang disetel "di dev" langsung berlaku
 * untuk login ke `api.puraloka-suite.duckdns.org` (200).
 *
 * Akibatnya sembilan akun uji berdomain `.test` bisa login dari internet,
 * dan tiga di antaranya punya izin PENUH:
 *
 *     layar.admin@puraloka.test     228 izin
 *     uji.admin@puraloka.test       228 izin
 *     uji.direktur@puraloka.test    228 izin
 *
 * Sandinya kini tersimpan di `apps/web/.env.local` pada mesin pengembang —
 * ter-gitignore, tetapi tetap satu berkas di satu laptop.
 *
 * ── Kenapa DINONAKTIFKAN, bukan dihapus
 *
 * Diukur: 39.130 baris di 54 tabel menunjuk kesembilan akun itu, dan
 * mereka anggota `Puraloka Persada` — perusahaan sungguhan, bersama 24
 * akun asli. Menghapusnya bukan pembersihan, melainkan penghapusan massal
 * data yang berantai lewat 284 kolom foreign key.
 *
 * `is_active = false` menutup aksesnya dan meninggalkan seluruh datanya
 * utuh. Bisa dinyalakan lagi kapan pun dengan satu perintah.
 *
 * ── ⚠ Ini baru bermakna SESUDAH penegakan diperbaiki
 *
 * Sebelum 2026-09-01, `users.is_active` tak diperiksa di mana pun:
 *
 *     AKTIF     login=200  GET /projects = 200
 *     NONAKTIF  login=200  GET /projects = 200
 *
 * Menonaktifkan akun tak menutup apa-apa. Penegakannya dipasang di dua
 * pintu (`routes/v1/auth.ts` dan `plugins/auth.ts`) dan dijaga
 * `audit-nonaktif-benar-tertutup.mjs`.
 *
 * Kalau penjaga itu dilemahkan, skrip ini kembali jadi hiasan.
 *
 * ── Idempoten, dan sempit
 *
 * Hanya tiga alamat yang disebutkan. Daftar dipaku, bukan pola `uji.%` —
 * pola akan ikut menyapu akun uji berizin rendah yang masih dipakai
 * memotret portal setiap hari.
 *
 *     node scripts/db/nonaktifkan-akun-uji-admin.mjs           # nonaktifkan
 *     node scripts/db/nonaktifkan-akun-uji-admin.mjs --nyalakan # pulihkan
 */
import { buatClient } from './_koneksi.mjs'

const AKUN = [
  'layar.admin@puraloka.test',
  'uji.admin@puraloka.test',
  'uji.direktur@puraloka.test',
]

const NYALAKAN = process.argv.includes('--nyalakan')
const aktif = NYALAKAN

const c = buatClient()
await c.connect()

try {
  console.log('══ Akun uji berizin admin penuh ═══════════════════════════════')
  console.log(`  tindakan : ${NYALAKAN ? 'NYALAKAN kembali' : 'NONAKTIFKAN'}`)
  console.log('')

  /*
    Keadaan SEBELUM dicetak lebih dulu. Tanpa itu, skrip yang tak mengubah
    apa pun (karena sudah dalam keadaan sasaran) terlihat sama dengan skrip
    yang berhasil mengubah — dan keduanya melaporkan sukses.
  */
  const sebelum = await c.query(
    `SELECT email, is_active FROM public.users WHERE email = ANY($1) ORDER BY email`,
    [AKUN]
  )

  if (sebelum.rowCount !== AKUN.length) {
    console.error(`❌ Hanya ${sebelum.rowCount} dari ${AKUN.length} akun ditemukan.`)
    console.error('   Berhenti TANPA mengubah apa pun — daftar yang tak cocok')
    console.error('   berarti asumsinya sudah basi.')
    process.exit(1)
  }

  for (const r of sebelum.rows) {
    console.log(`  sebelum : ${r.email.padEnd(30)} is_active=${r.is_active}`)
  }

  const hasil = await c.query(
    `UPDATE public.users SET is_active = $2
      WHERE email = ANY($1) AND is_active IS DISTINCT FROM $2
      RETURNING email`,
    [AKUN, aktif]
  )

  console.log('')
  console.log(`  diubah  : ${hasil.rowCount} baris`)
  if (hasil.rowCount === 0) {
    console.log('            (semuanya sudah dalam keadaan yang diminta)')
  }

  const sesudah = await c.query(
    `SELECT email, is_active FROM public.users WHERE email = ANY($1) ORDER BY email`,
    [AKUN]
  )
  console.log('')
  for (const r of sesudah.rows) {
    const benar = r.is_active === aktif
    console.log(`  ${benar ? '✓ ' : '❌'} ${r.email.padEnd(30)} is_active=${r.is_active}`)
  }

  const meleset = sesudah.rows.filter((r) => r.is_active !== aktif)
  if (meleset.length > 0) {
    console.error('')
    console.error(`❌ ${meleset.length} akun TIDAK berubah — periksa manual.`)
    process.exit(1)
  }

  console.log('')
  console.log(NYALAKAN
    ? '✅ Ketiga akun aktif kembali.'
    : '✅ Ketiga akun ditutup aksesnya. Datanya UTUH — nol baris dihapus.')
  console.log('')
  console.log('   Buktikan lewat rute login sungguhan, bukan dari keluaran ini:')
  console.log('   akun nonaktif harus menjawab 403, bukan 200.')
} finally {
  await c.end()
}
