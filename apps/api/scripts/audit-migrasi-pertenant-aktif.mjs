#!/usr/bin/env node
/**
 * PENJAGA — migrasi yang menulis per-tenant wajib menyaring `is_active`.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Empat migrasi (396, 398, 399, 400) memakai pola `FROM companies` tanpa
 * syarat untuk menyemai baris konfigurasi per-tenant. Diukur 2026-08-16:
 *
 *     notification_rules          2.291 baris untuk tenant NONAKTIF
 *     notification_rule_targets   4.582
 *     company_settings            2.291
 *                                 ─────
 *                                 9.164
 *
 * Basis dev berisi 597 tenant sisa test yang sudah `is_active = false`. Migrasi
 * yang tak menyaringnya menulis untuk mereka semua.
 *
 * ── Kenapa itu bukan sekadar kotor
 *
 * Tiga cacat dalam satu hari berakar di sini, dan tak satu pun punya gejala
 * sendiri:
 *
 *   · `notification_rules` melewati 1.736 baris → melampaui batas potong
 *     senyap PostgREST. Halaman Aturan Notifikasi menampilkan 1.000 dari
 *     1.736 sambil terlihat menampilkan semuanya.
 *   · pembacaan penjadwal terpotong 1.000 dari 4.794 → tugas ke-1.001 dan
 *     seterusnya tak pernah dijalankan, respons tetap `ok: true`.
 *   · migrasi 401 menjadwalkan 8 tugas × 571 perusahaan → 2.018 gagal 403
 *     tiap denyut.
 *
 * ── Kenapa menyaring, bukan menghapus tenantnya
 *
 * Dicoba. Basis MENOLAK dengan pesannya sendiri: "Company tidak boleh dihapus.
 * Nonaktifkan (is_active=false) atau jalankan prosedur off-boarding."
 *
 * Pengaman itu disengaja dan tidak dilewati — dan ternyata tak perlu, karena
 * tenantnya sudah nonaktif. Yang salah bentuk migrasinya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * RATCHET, DAN KENAPA BUKAN AMBANG NOL
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Bentuk pertama penjaga ini berambang NOL — dan langsung merah pada DELAPAN
 * migrasi lama (152, 238, 242, 244, 249, 250, …).
 *
 * Kedelapannya SUDAH JALAN, dan §5.5 melarang mengedit migrasi lama: buku
 * migrasi menentukan apa yang di-replay CI, dan mengubah berkas yang sudah
 * tercatat membuat lingkungan bersih menghasilkan schema yang berbeda dari
 * lingkungan yang sudah berjalan.
 *
 * Jadi ambang nol di sini bukan ketegasan melainkan penjaga yang tak mungkin
 * hijau — dan penjaga yang tak mungkin hijau akan dimatikan orang pertama yang
 * CI-nya merah karenanya.
 *
 * Yang benar-benar perlu dijaga: **migrasi BARU tak boleh menambahnya.**
 * Delapan adalah lantai; ia hanya boleh turun, dan turunnya lewat migrasi maju
 * yang membersihkan akibat (pola 402), bukan lewat mengedit yang lama.
 *
 * Yang diperiksa: blok `INSERT` yang membaca `FROM companies` tanpa menyebut
 * `is_active` maupun `company_members` di pernyataan yang sama.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR_REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const DIR = join(AKAR_REPO, 'db/migrations')

/*
  Migrasi lama DIKECUALIKAN dengan alasan tertulis.

  Bukan kelonggaran: migrasi yang SUDAH jalan tak bisa diperbaiki dengan
  mengeditnya (§5.5 — mengedit migrasi lama dilarang). Yang bisa diperbaiki
  hanya akibatnya, dan itu tugas migrasi maju (402).

  Daftar ini tak boleh bertambah. Migrasi BARU tak punya alasan untuk masuk.
*/
const DIKECUALIKAN = new Map([
  ['402_migrasi_pertenant_hanya_tenant_aktif.sql',
   'justru migrasi yang MEMBERSIHKAN akibatnya — ia memang menyebut tenant nonaktif'],
])

/** Lantai — HANYA BOLEH TURUN. Menaikkannya butuh ratifikasi (G-5). */
const AMBANG = 8

const pelanggar = []

for (const nama of readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()) {
  if (DIKECUALIKAN.has(nama)) continue
  const isi = readFileSync(join(DIR, nama), 'utf8')

  /*
    Komentar dibuang lebih dulu.

    Tanpa ini, migrasi yang MENJELASKAN pola salah di komentarnya sendiri
    (seperti 398–401 sesudah dikoreksi) akan ditandai sebagai pelanggar —
    penjaga yang menghukum dokumentasi adalah penjaga yang membuat orang
    berhenti mendokumentasikan.
  */
  const kode = isi
    .split(/\r?\n/)
    .filter((b) => !b.trimStart().startsWith('--'))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')

  // Pernyataan INSERT dipisah kasar per `INSERT INTO` — cukup untuk pola ini,
  // dan tak menuntut parser SQL penuh yang justru punya cara gagal sendiri.
  for (const potongan of kode.split(/\bINSERT\s+INTO\b/i).slice(1)) {
    const sampaiTitikKoma = potongan.split(';')[0]
    if (!/\bFROM\s+companies\b/i.test(sampaiTitikKoma)) continue
    if (/\bis_active\b/i.test(sampaiTitikKoma)) continue
    /*
      `EXISTS (… company_members …)` diterima sebagai penyaring yang sah.

      Migrasi 401 memakainya alih-alih `is_active` — dan itu LEBIH ketat:
      tenant aktif yang belum punya anggota pun tak dijadwalkan, karena akun
      layanan akan ditolak 403.
    */
    if (/company_members/i.test(sampaiTitikKoma)) continue
    pelanggar.push(nama)
    break
  }
}

console.log('══ Migrasi per-tenant wajib menyaring tenant aktif ═════════')
console.log(`  berkas migrasi diperiksa : ${readdirSync(DIR).filter((f) => f.endsWith('.sql')).length}`)
console.log(`  dikecualikan (beralasan) : ${DIKECUALIKAN.size}`)
console.log(`  pelanggar                : ${pelanggar.length}`)
console.log(`  ambang (lantai)          : ${AMBANG}`)

if (pelanggar.length > AMBANG) {
  console.error('')
  console.error(`❌ RATCHET GAGAL: ${pelanggar.length} > ambang ${AMBANG}`)
  console.error('   Migrasi menulis per-tenant TANPA menyaring tenant aktif:')
  for (const f of pelanggar) console.error(`     · ${f}`)
  console.error('')
  console.error('   Perbaikan — tambahkan syaratnya di pernyataan yang sama:')
  console.error('')
  console.error('     SELECT c.id, …')
  console.error('       FROM companies c')
  console.error('      WHERE c.is_active')
  console.error('')
  console.error('   Atau, bila tugasnya menuntut akun layanan bisa masuk:')
  console.error('')
  console.error('      WHERE EXISTS (SELECT 1 FROM company_members m')
  console.error('                     WHERE m.company_id = c.id)')
  console.error('')
  console.error('   Tanpa itu, migrasi menulis untuk SELURUH tenant termasuk sisa')
  console.error('   test yang sudah nonaktif — 9.164 baris pada pengukuran')
  console.error('   2026-08-16, dan tiga cacat potong-senyap yang lahir darinya.')
  process.exit(1)
}

if (pelanggar.length < AMBANG) {
  console.log('')
  console.log(`📉 Turun dari ambang — kencangkan AMBANG jadi ${pelanggar.length}.`)
}

console.log('')
console.log(`✅ Migrasi per-tenant: ${pelanggar.length}/${AMBANG} — tidak bertambah.`)
console.log('   (kedelapan lantai adalah migrasi LAMA yang sudah jalan; §5.5')
console.log('    melarang mengeditnya — turunkan lewat migrasi maju, pola 402.)')
