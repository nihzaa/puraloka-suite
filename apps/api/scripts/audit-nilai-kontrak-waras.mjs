#!/usr/bin/env node
/**
 * Nilai kontrak proyek wajib MASUK AKAL terhadap belanjanya sendiri.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Ditemukan 2026-09-01 saat menyiapkan angka untuk keputusan founder soal
 * sumber realisasi:
 *
 *     Renovasi Dapur & KM Pak Hendra    kontrak Rp 900.525.000.000
 *
 * Sembilan ratus miliar rupiah untuk renovasi dapur dan kamar mandi.
 * Belanja nyatanya Rp 150 juta (kasbon 35 jt + expenses 115 jt) — dan
 * dengan nilai kontrak `900.525.000` (tiga nol lebih sedikit) serapannya
 * jadi 16,7%, angka yang wajar.
 *
 * ── Kenapa cacat ini tak menimbulkan galat
 *
 * Kolomnya `numeric`, jadi nilainya sah secara tipe. Tak ada batas atas di
 * basis, tak ada validasi di rute, dan tak ada test yang menghitung
 * kewajaran. Yang rusak cuma ARTINYA.
 *
 * Dan rusaknya ke arah yang paling sulit dilihat: serapan terhitung 0,0%,
 * yang terbaca seperti "proyek belum mulai belanja" — bukan seperti
 * "nilai kontraknya salah". Papan Portofolio Biaya menampilkannya dengan
 * tenang, dan otomasi yang memantau serapan tak akan pernah berbunyi.
 *
 * Bentuk yang sama dengan `audit-harga-satuan-waras`: harga per m³ yang
 * tersalin ke baris kg membuat 1 m³ beton terhitung Rp 626 juta, menyebar
 * ke 32 AHSP, tanpa satu pun galat.
 *
 * ── Yang diperiksa, dan kenapa BUKAN ambang mutlak
 *
 * "Kontrak di atas Rp X miliar itu salah" akan keliru untuk kontraktor
 * yang memang menggarap proyek besar — dan repo ini menuju SaaS multi-
 * tenant, jadi ambang yang cocok untuk satu perusahaan akan salah untuk
 * yang lain.
 *
 * Yang diperiksa: nilai kontrak yang JANGGAL TERHADAP BELANJANYA SENDIRI.
 * Proyek dengan belanja nyata tetapi serapan mendekati nol pada skala yang
 * mustahil — itu tanda salah ketik nol, bukan tanda proyek besar.
 *
 * Proyek yang BELUM belanja apa pun sengaja dilewati: nol belanja pada
 * kontrak besar adalah keadaan wajar proyek yang baru diteken.
 *
 * ── Ratchet, bukan ambang NOL
 *
 * Datanya milik pengguna dan mungkin memang begitu; penjaga ini menahan
 * yang BARU, bukan menuntut yang lama diperbaiki lebih dulu.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buatClient, adaKoneksi } from '../../../scripts/db/_koneksi.mjs'

/*
  DILEWATI bila basis tak terjangkau — mengikuti pola `audit-harga-satuan-waras`
  dan `audit-izin-benar-ada` yang sudah dipakai berkas tetangga.

  Ditambahkan 2026-09-04. Langkah CI yang menjalankan penjaga ini tidak diberi
  `DATABASE_URL`, dan tanpa pemeriksaan ini `buatClient()` mematikan proses
  dengan exit 2:

      FATAL: DIRECT_URL/DATABASE_URL tidak ditemukan
             Penjaga CI yang boleh dilewati: pakai `adaKoneksi()` SEBELUM
             memanggil ini — `try/catch` tak menangkap `process.exit`.

  Pesannya sendiri menyebut perbaikannya, dan penjaga tepat di ATASNYA
  melewati dirinya dengan benar di run yang sama.

  ⚠ `adaKoneksi()`, BUKAN `process.env` langsung.

  Versi pertama perbaikan ini memeriksa `process.env.DATABASE_URL` saja — dan
  penjaga langsung melewati dirinya SELALU, termasuk di mesin lokal yang jelas
  punya basis. Sebabnya `buatClient()` membaca kredensial dari `apps/api/.env`,
  bukan dari environment. `adaKoneksi()` memeriksa KEDUANYA, sumber yang sama
  dengan yang dipakai `buatClient()`.

  Penjaga yang selalu hijau lebih buruk daripada tak ada penjaga: ia memberi
  rasa aman yang salah. Ketahuan karena hasilnya diuji di DUA keadaan, bukan
  hanya yang sedang diperbaiki.

  Ini BUKAN melemahkan penjaga — ia tetap berjalan penuh di tiap lingkungan
  yang punya basis; yang dilewati hanya keadaan di mana ia tak bisa mengukur.
*/
if (!adaKoneksi()) {
  console.log('══ Nilai kontrak waras terhadap belanjanya ════════════════════')
  console.log('  ⏭  DILEWATI — tak ada DATABASE_URL / DIRECT_URL')
  process.exit(0)
}

const LANTAI_BERKAS = join(dirname(fileURLToPath(import.meta.url)), 'nilai-kontrak-lantai.json')

/*
  Ambang rasio: belanja < 1% dari kontrak DAN belanja di atas Rp 1 juta.

  Syarat kedua yang membuatnya tak berisik — tanpa itu, proyek dengan satu
  kasbon Rp 50.000 pada kontrak Rp 500 juta ikut tertangkap, dan itu wajar
  sepenuhnya.

  1% dipilih karena salah ketik nol menggeser rasio SERATUS KALI: proyek
  yang seharusnya 16,7% jatuh ke 0,167%. Cacat sebesar itu tak mungkin
  tertukar dengan proyek yang benar-benar baru mulai.
*/
const AMBANG_RASIO = 0.01
const BELANJA_MIN = 1_000_000

const c = buatClient()
await c.connect()

let temuan = []

try {
  const r = await c.query(`
    SELECT p.name,
           p.contract_value::numeric AS kontrak,
           (COALESCE(k.jml, 0) + COALESCE(e.jml, 0))::numeric AS belanja
      FROM public.projects p
      LEFT JOIN (
        SELECT project_id, SUM(amount) jml FROM public.kasbons
         WHERE status IN ('approved', 'settled') GROUP BY project_id
      ) k ON k.project_id = p.id
      LEFT JOIN (
        SELECT project_id, SUM(total_amount) jml FROM public.project_expenses
         WHERE status = 'approved' GROUP BY project_id
      ) e ON e.project_id = p.id
     WHERE p.contract_value IS NOT NULL AND p.contract_value > 0
  `)

  if (r.rowCount === 0) {
    console.log('══ Nilai kontrak waras ════════════════════════════════════════')
    console.log('  Nol proyek bernilai kontrak — tak ada yang bisa diperiksa.')
    console.log('  DILEWATI, bukan dinyatakan hijau.')
    process.exit(0)
  }

  for (const x of r.rows) {
    const kontrak = Number(x.kontrak)
    const belanja = Number(x.belanja)
    if (belanja < BELANJA_MIN) continue           // belum belanja — wajar
    if (belanja / kontrak >= AMBANG_RASIO) continue
    temuan.push({
      nama: x.nama ?? x.name,
      kontrak,
      belanja,
      rasio: ((belanja / kontrak) * 100).toFixed(3),
    })
  }
} finally {
  await c.end()
}

const rp = (n) => new Intl.NumberFormat('id-ID').format(n)

console.log('══ Nilai kontrak waras terhadap belanjanya ════════════════════')
console.log(`  ambang  : belanja < ${AMBANG_RASIO * 100}% kontrak, dan belanja > Rp ${rp(BELANJA_MIN)}`)
console.log(`  janggal : ${temuan.length}`)

for (const t of temuan) {
  console.log('')
  console.log(`  ⚠ ${t.nama}`)
  console.log(`     kontrak Rp ${rp(t.kontrak)} · belanja Rp ${rp(t.belanja)} · ${t.rasio}%`)
  console.log(`     kalau nolnya kelebihan tiga: ${((t.belanja / (t.kontrak / 1000)) * 100).toFixed(1)}%`)
}

const lantai = existsSync(LANTAI_BERKAS)
  ? JSON.parse(readFileSync(LANTAI_BERKAS, 'utf8')).lantai
  : null

if (process.argv.includes('--turunkan')) {
  writeFileSync(LANTAI_BERKAS, JSON.stringify({ lantai: temuan.length }, null, 2) + '\n')
  console.log(`\n✅ lantai diturunkan ke ${temuan.length}`)
  process.exit(0)
}

if (lantai == null) {
  console.error(`\n❌ ${LANTAI_BERKAS} belum ada. Tetapkan lantai:`)
  console.error('   node scripts/audit-nilai-kontrak-waras.mjs --turunkan\n')
  process.exit(1)
}

if (temuan.length > lantai) {
  console.error(`\n❌ Nilai kontrak janggal BERTAMBAH: ${temuan.length} (lantai ${lantai}).`)
  console.error('')
  console.error('   Serapan proyek ini terhitung ~0%, dan itu terbaca seperti')
  console.error('   "belum mulai belanja" — bukan seperti "nilai kontraknya salah".')
  console.error('   Papan Portofolio Biaya menampilkannya dengan tenang, dan otomasi')
  console.error('   yang memantau serapan tak akan pernah berbunyi.')
  console.error('')
  process.exit(1)
}

console.log('')
console.log(`✅ ${temuan.length} janggal (lantai ${lantai}) — tidak bertambah.`)
if (temuan.length > 0) {
  console.log('   Yang ada BELUM diperbaiki: nilai kontrak adalah data milik')
  console.log('   pengguna, dan mengubahnya butuh konfirmasi — bukan tebakan.')
}
