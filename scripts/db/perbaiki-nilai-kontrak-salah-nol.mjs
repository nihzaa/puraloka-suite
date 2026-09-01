#!/usr/bin/env node
/**
 * Memperbaiki nilai kontrak yang kelebihan tiga nol.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA SKRIP INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Ditemukan 2026-09-01 oleh `audit-nilai-kontrak-waras.mjs`:
 *
 *     Renovasi Dapur & KM Pak Hendra — Cihampelas
 *     contract_value  Rp 900.525.000.000
 *
 * Sembilan ratus miliar rupiah untuk renovasi dapur dan kamar mandi.
 *
 * ── Kenapa yakin ini salah ketik, bukan data yang memang begitu
 *
 * TIGA pengukuran yang saling bebas, semuanya sejalan:
 *
 *   1. Belanja nyata     Rp 150.290.000  → 0,017% dari kontrak.
 *                        Dengan nilai /1000: 16,7% — wajar.
 *
 *   2. Invoice terbit    Rp  82.365.000 (3 baris) → 0,009% dari kontrak.
 *                        Dengan nilai /1000: 9,1% — wajar.
 *
 *   3. Skala sejenis     Delapan proyek "renovasi" lain di basis ini
 *                        berkisar Rp 95 juta – Rp 510 juta. Rp 900,5 JUTA
 *                        masuk rentang itu; Rp 900,5 MILIAR seribu kali
 *                        di luarnya.
 *
 * Satu pengukuran bisa kebetulan. Tiga yang menunjuk faktor 1000 yang sama
 * tidak.
 *
 * ── Kenapa lewat skrip, bukan satu UPDATE
 *
 * Angka uang. Skrip ini mencetak keadaan SEBELUM dan SESUDAH, memeriksa
 * hasilnya sendiri, dan bisa dibalik (`--balikkan`). Satu `UPDATE` di
 * konsol tak meninggalkan jejak apa pun tentang kenapa angkanya berubah.
 *
 * ── Wewenang
 *
 * Founder 2026-09-01: "semua datanya adalah dummy, kalo emang ada yg salah
 * kamu benerin." Sebelum itu nilainya SENGAJA tidak diubah meski cacatnya
 * sudah terukur — tebakan yang konsisten bukan izin mengubah angka uang.
 *
 * ⚠ Basis ini dipakai produksi DAN pengembangan (terbukti 2026-09-01:
 * sandi yang disetel "di dev" berlaku untuk login produksi). "Dummy"
 * berlaku sejauh yang founder nyatakan; jangan memperluasnya sendiri ke
 * data lain.
 *
 *     node scripts/db/perbaiki-nilai-kontrak-salah-nol.mjs
 *     node scripts/db/perbaiki-nilai-kontrak-salah-nol.mjs --balikkan
 */
import { buatClient } from './_koneksi.mjs'

/**
 * Perbaikan yang dimaksudkan — DIPAKU, bukan dihitung dari pola.
 *
 * Aturan otomatis ("apa pun yang rasionya < 1%, bagi 1000") akan mengubah
 * angka yang belum pernah dilihat siapa pun. Tiap baris di sini punya tiga
 * pengukuran pendukung yang sudah diperiksa satu per satu.
 */
const PERBAIKAN = [
  {
    nama: 'Renovasi Dapur & KM Pak Hendra — Cihampelas',
    dari: 900_525_000_000,
    jadi: 900_525_000,
  },
]

const BALIK = process.argv.includes('--balikkan')
const rp = (n) => new Intl.NumberFormat('id-ID').format(Number(n ?? 0))

const c = buatClient()
await c.connect()

let diubah = 0
const gagal = []

try {
  console.log('══ Perbaiki nilai kontrak kelebihan nol ═══════════════════════')
  console.log(`  arah : ${BALIK ? 'BALIKKAN (jadi → dari)' : 'perbaiki (dari → jadi)'}`)
  console.log('')

  for (const p of PERBAIKAN) {
    const asal = BALIK ? p.jadi : p.dari
    const tuju = BALIK ? p.dari : p.jadi

    const kini = await c.query(
      `SELECT id, contract_value::numeric v FROM public.projects WHERE name = $1`,
      [p.nama]
    )

    if (kini.rowCount === 0) {
      gagal.push(`${p.nama}: proyek tak ditemukan`)
      console.log(`  ❌ ${p.nama.slice(0, 44)}`)
      console.log('     proyek tak ditemukan — nama berubah, atau sudah dihapus')
      continue
    }
    if (kini.rowCount > 1) {
      gagal.push(`${p.nama}: ${kini.rowCount} proyek bernama sama`)
      console.log(`  ❌ ${p.nama.slice(0, 44)} — ${kini.rowCount} proyek bernama sama, tak diubah`)
      continue
    }

    const sekarang = Number(kini.rows[0].v)
    console.log(`  ${p.nama.slice(0, 46)}`)
    console.log(`     sebelum : Rp ${rp(sekarang)}`)

    if (sekarang === tuju) {
      console.log(`     sesudah : Rp ${rp(tuju)}  (sudah begitu — tak diubah)`)
      console.log('')
      continue
    }

    /*
      Nilai asal DIPERIKSA sebelum menimpa.

      Kalau angkanya bukan yang diharapkan, seseorang sudah mengubahnya —
      dan menimpanya berarti membuang perubahan itu tanpa ada yang tahu.
    */
    if (sekarang !== asal) {
      gagal.push(`${p.nama}: nilai sekarang Rp ${rp(sekarang)}, bukan Rp ${rp(asal)}`)
      console.log(`     ❌ diharapkan Rp ${rp(asal)} — TAK DIUBAH`)
      console.log('        Nilainya sudah disentuh orang lain; menimpanya membuang')
      console.log('        perubahan itu tanpa jejak.')
      console.log('')
      continue
    }

    const u = await c.query(
      `UPDATE public.projects SET contract_value = $2
        WHERE id = $1 AND contract_value = $3 RETURNING contract_value::numeric v`,
      [kini.rows[0].id, tuju, asal]
    )

    if (u.rowCount !== 1) {
      gagal.push(`${p.nama}: UPDATE mengubah ${u.rowCount} baris`)
      console.log(`     ❌ UPDATE mengubah ${u.rowCount} baris, bukan 1`)
      console.log('')
      continue
    }

    diubah++
    console.log(`     sesudah : Rp ${rp(u.rows[0].v)}  ✓`)
    console.log('')
  }
} finally {
  await c.end()
}

console.log(`  diubah : ${diubah} dari ${PERBAIKAN.length}`)

if (gagal.length > 0) {
  console.log('')
  for (const g of gagal) console.log(`  ❌ ${g}`)
  console.log('')
  process.exit(1)
}

console.log('')
console.log('✅ Selesai.')
console.log('   Buktikan lewat penjaganya, bukan dari keluaran ini:')
console.log('   node apps/api/scripts/audit-nilai-kontrak-waras.mjs')
