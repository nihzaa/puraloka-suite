#!/usr/bin/env node
/**
 * PENJAGA — tiap notifikasi WAJIB membawa `action_data.record_id`. Ratchet.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * PENJAGA YANG SUDAH ADA BUTA TERHADAP KASUS YANG PALING BUTUH DIJAGA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `audit-notifikasi-tak-kembar.mjs` menangkap notifikasi kembar lewat
 * `(user_id, type, record_id, tanggal)`. Baris terakhirnya:
 *
 *     WHERE action_data->>'record_id' IS NOT NULL
 *
 * Pengecualian itu BENAR — dua notifikasi berjudul sama bisa merujuk dua
 * catatan berbeda, dan menganggapnya kembar akan menahan yang sah.
 *
 * Tetapi akibatnya: notifikasi tanpa `record_id` kebal dedup DAN tak terlihat
 * penjaganya. Penjaga yang dibangun untuk menangkap kembar justru buta
 * terhadap baris yang paling kembar.
 *
 * Terukur 2026-08-16:
 *
 *     kasbon_approved    968 notifikasi  →  2 pasangan unik   rasio 484x
 *     kasbon_submitted 2.299 baris ber-record_id NULL (warisan sebelum
 *                      perbaikan 2026-08-14)
 *
 * `kasbons.ts` menulis `action_data: { kasbon_id: id }` — nama kolom yang
 * berbeda, jadi `record_id`-nya NULL.
 *
 * Pelajaran yang sama sudah dicatat panjang lebar di `mandor.ts` pada
 * 2026-08-14. Ia terulang di berkas lain dua hari kemudian. **Catatan saja
 * tak cukup** — itulah kenapa penjaga ini ada.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * RATCHET, BUKAN AMBANG NOL — DAN ITU DISENGAJA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Tujuh pemanggil yang tersisa tanpa `record_id` sebagian memang tak punya
 * catatan untuk ditunjuk: sapaan harian, ringkasan, titipan pesan bebas.
 * Memaksa mereka mengarang `record_id` menghasilkan nilai palsu yang membuat
 * dedup menahan hal yang seharusnya lewat — lebih buruk daripada kosong.
 *
 * Yang dijaga: jumlahnya TIDAK BOLEH NAIK. Yang menambah pemanggil baru tanpa
 * `record_id` harus menurunkan lantai lebih dulu, dan itu memaksa keputusannya
 * sadar.
 *
 *     node scripts/audit-notifikasi-punya-record.mjs              periksa
 *     node scripts/audit-notifikasi-punya-record.mjs --turunkan   turunkan lantai
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..')
const SUMBER = join(AKAR, 'src')
const LANTAI = join(AKAR, 'scripts', 'notifikasi-record-lantai.json')

function berkasTs(dir, out = []) {
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, f.name)
    if (f.isDirectory()) {
      if (!/node_modules|__tests__/.test(p)) berkasTs(p, out)
    } else if (f.name.endsWith('.ts')) out.push(p)
  }
  return out
}

/*
  Blok `createNotification(…)` / `createNotifications(…)` dipotong tekstual.

  Mengurai TypeScript menuntut kompiler, dan penjaga yang butuh kompiler
  cenderung dimatikan saat kompilernya berubah. Kalau bentuk berkasnya kelak
  berubah sampai tak satu pun blok terbaca, penjaga ini MERAH — bukan diam.
*/
const POLA = /createNotifications?\(\s*\[?\s*\{[\s\S]*?\n\s*\}\s*\]?\s*\)/g

const pelanggar = []
let total = 0

for (const f of berkasTs(SUMBER)) {
  const isi = readFileSync(f, 'utf8')
  for (const m of isi.match(POLA) ?? []) {
    total++
    /*
      KOMENTAR DIBUANG SEBELUM DIPERIKSA — dan ini ditemukan lewat mutasi.

      Versi pertama menguji `/record_id/` pada blok MENTAH. Mutasi membuang
      `record_id` dari `kasbons.ts` dan penjaganya tetap hijau: penjelasan
      panjang di atas pemanggilan itu menyebut `record_id` belasan kali, dan
      regexnya melihat komentar sebagai kode.

      Penjaga yang bisa dipuaskan dengan MENULIS TENTANG sesuatu alih-alih
      melakukannya adalah penjaga yang mendorong dokumentasi menggantikan
      perbaikan — kebalikan dari yang diinginkan repo ini.
    */
    const kode = m
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    if (/record_id/.test(kode)) continue
    const jenis = (kode.match(/type:\s*'([^']+)'/) ?? [])[1] ?? '(jenis tak terbaca)'
    pelanggar.push(`${f.replace(AKAR + '\\', '').replace(/\\/g, '/')} → ${jenis}`)
  }
}

if (total === 0) {
  console.error(
    '\n❌ audit-notifikasi-punya-record: tak satu pun pemanggil terbaca.\n\n'
    + '   Bentuk pemanggilan berubah dan penjaga ini berhenti memeriksa apa\n'
    + '   pun. Perbaiki polanya, jangan matikan penjaganya.\n')
  process.exit(1)
}

const jumlah = pelanggar.length

if (process.argv.includes('--turunkan')) {
  writeFileSync(LANTAI, JSON.stringify({ lantai: jumlah }, null, 2) + '\n')
  console.log(`✅ lantai diturunkan ke ${jumlah}`)
  process.exit(0)
}

const lantai = existsSync(LANTAI)
  ? JSON.parse(readFileSync(LANTAI, 'utf8')).lantai
  : jumlah

if (jumlah > lantai) {
  console.error(
    `\n❌ audit-notifikasi-punya-record: ${jumlah} pemanggil tanpa `
    + `\`record_id\` — lantainya ${lantai}.\n`)
  for (const p of pelanggar) console.error(`     · ${p}`)
  console.error(
    '\n   Tanpa `record_id`, notifikasi kebal dedup DAN tak terlihat\n'
    + '   `audit-notifikasi-tak-kembar` — penjaga itu sengaja melewati baris\n'
    + '   ber-record_id NULL. Terukur 968 `kasbon_approved` dengan hanya DUA\n'
    + '   pasangan unik: rasio 484 kali.\n\n'
    + '   Kalau notifikasi ini memang tak menunjuk catatan apa pun (sapaan,\n'
    + '   ringkasan), turunkan lantainya SADAR:\n'
    + '     node scripts/audit-notifikasi-punya-record.mjs --turunkan\n')
  process.exit(1)
}

if (jumlah < lantai) {
  console.log(
    `⚠️  audit-notifikasi-punya-record: ${jumlah} < lantai ${lantai} — `
    + 'turunkan lantainya:\n     node scripts/audit-notifikasi-punya-record.mjs --turunkan')
  process.exit(0)
}

console.log(
  `✅ audit-notifikasi-punya-record: ${total - jumlah} dari ${total} pemanggil `
  + `membawa record_id (${jumlah} sengaja tanpa, tepat di lantai)`)
