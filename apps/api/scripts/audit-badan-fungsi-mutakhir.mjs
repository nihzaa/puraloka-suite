#!/usr/bin/env node
/**
 * PENJAGA — badan fungsi di BASIS wajib sama dengan migrasi TERAKHIR yang
 * mendefinisikannya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-09-13. Migrasi 111 TERCATAT sudah jalan di
 * `supabase_migrations.schema_migrations`, `ledger-diff.mjs` menyatakannya
 * TERBUKTI-FISIK, dan relaksasi yang ditulisnya TIDAK ADA di basis:
 *
 *     estimate-versions.ts:35   diagram: under_review --reject--> draft
 *     migrasi 111               "izinkan under_review→draft"
 *     schema_migrations         111 TERCATAT JALAN
 *     pg_proc                   baris reject TIDAK ADA
 *
 * Akibatnya estimasi yang ditolak reviewer tersangkut di `under_review`
 * selamanya, dan rutenya menjawab 500 dengan pesan yang menuduh transisi
 * tak sah — padahal transisi itu memang dirancang ada.
 *
 * ── KENAPA `ledger-diff.mjs` TAK BISA MELIHATNYA
 *
 * Pemeriksanya (`scripts/db/ledger-diff.mjs` baris 106):
 *
 *     SELECT 1 FROM pg_proc WHERE proname = $1
 *
 * Ia memeriksa NAMA fungsi ada, bukan ISI-nya. `CREATE OR REPLACE` yang
 * gagal berlaku tetap meninggalkan fungsi bernama sama dari migrasi
 * SEBELUMNYA — jadi verdict "TERBUKTI-FISIK" diberikan atas artefak yang
 * memuat versi LAMA. Penjaga yang benar untuk pertanyaannya sendiri,
 * menjawab pertanyaan yang salah.
 *
 * Itu bukan cacat satu berkas. Diukur atas 546 migrasi: **21 fungsi
 * didefinisikan lebih dari sekali**, dan **26 migrasi** hanya MENGGANTI ISI
 * fungsi yang sudah ada — seluruhnya tak terperiksa dengan cara itu.
 * Termasuk `has_permission`, `auth_role`, dan `get_role_permissions`:
 * inti otorisasi.
 *
 * Ditelusuri satu per satu pada hari yang sama, kedua puluh lima sisanya
 * MUTAKHIR. Migrasi 111 satu-satunya yang basi — tapi itu keberuntungan
 * yang tak dijaga apa pun, dan keberuntungan tak bisa diandalkan dua kali.
 *
 * ── YANG DIBANDINGKAN, DAN KENAPA BUKAN TEKS MENTAH
 *
 * `pg_proc.prosrc` menyimpan badan SESUDAH parser — komentar `--` ikut
 * tersimpan, tetapi jarak, kapitalisasi kata kunci, dan pembungkus
 * `CREATE FUNCTION … AS $$` TIDAK ada di sana. Membandingkan teks mentah
 * akan merah atas perbedaan yang tak bermakna.
 *
 * ⚠ Percobaan pertama membandingkan TOKEN ber-kutip dari seluruh potongan
 * berkas, dan ia melaporkan 12 tersangka yang SEMBILAN di antaranya palsu:
 * `'public'` dan nama fungsinya sendiri hidup di baris `CREATE`, tak pernah
 * di `prosrc`; `'admin'` dan `'persetujuan'` datang dari KOMENTAR dan teks
 * `RAISE`, bukan dari logika. Penjaga yang merah atas hal yang benar akan
 * diabaikan seluruh keluarannya, lalu berhenti menjaga tanpa gejala
 * (CLAUDE.md §8a.2).
 *
 * Jadi yang dibandingkan: badan di antara pembatas dolar, dinormalkan —
 * komentar dibuang, spasi dirapatkan, huruf diseragamkan. Yang tersisa
 * LOGIKA-nya.
 *
 * ⚠ BATAS — tertulis di sini supaya tak disalahbaca sebagai jaminan:
 *
 *   · hanya fungsi ber-badan dolar-ganda di skema `public`;
 *   · hanya migrasi TERAKHIR yang mendefinisikan tiap fungsi — migrasi
 *     tengah yang dilewati tak terlihat kalau yang terakhir berlaku;
 *   · fungsi yang badannya dirakit DINAMIS (EXECUTE format(...)) dilewati,
 *     sebab teks berkasnya memang bukan badan akhirnya;
 *   · skema `test` TIDAK diperiksa — ia punya salinan triggernya sendiri
 *     (terukur: `test.estimate_versions` memanggil `test.fn_…`), dan
 *     menyamakannya keputusan tersendiri.
 *
 * Butuh basis, jadi TAK BOLEH ditabelkan di CLAUDE.md §6
 * (`audit-penjaga-tercatat-jalan.mjs` mewajibkan yang tertabel benar-benar
 * dijalankan `ci.yml`, dan ini tak bisa).
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buatClient } from '../../../scripts/db/_koneksi.mjs'

const AKAR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const DIR = join(AKAR, 'db', 'migrations')

/*
  PENGECUALIAN — fungsi yang badannya SENGAJA berbeda dari berkasnya.

  ⚠ Tiap entri wajib membawa ALASAN-nya di sini, bukan cuma namanya. Daftar
  pengecualian tanpa alasan adalah cara penjaga berhenti menjaga secara
  perlahan: orang berikutnya menambah satu nama untuk memerahkan yang
  mengganggu, dan tak ada yang bisa menilai apakah itu sah.

  Dan pengecualian ini TIDAK diam — ia dicetak tiap jalan. Yang disembunyikan
  akan terlupa; yang terlihat akan ditanyakan.
*/
const DIKECUALIKAN = {
  fn_lessons_status_transition:
    'R-013 (RATIFIKASI): berkas 114 MENGAKTIFKAN approved→propagated; basis ' +
    'menolaknya dengan pesan "butuh keputusan founder". BASIS yang benar — ' +
    'propagasi menulis productivity_records & price_book_entries, angka yang ' +
    'menghitung RAB proyek BERIKUTNYA. Menyamakannya = menurunkan keputusan ' +
    'produk diam-diam lewat migrasi perapian.',
}

/*
  Normalisasi: yang dibandingkan LOGIKA, bukan tata letak.
  Komentar dibuang lebih dulu — `prosrc` menyimpannya, tetapi komentar yang
  berubah bukan perilaku yang berubah, dan penjaga yang merah karenanya
  akan diabaikan.
*/
const normal = (s) =>
  s
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\s+/g, ' ')
    /*
      Spasi di SEBELAH tanda baca & operator rangkai dibuang. Tanpa ini,
      `now(), 'yyyy'` versus `now(),'yyyy'` dan `'gr-' || v_tahun` versus
      `'gr-'||v_tahun` dilaporkan sebagai selisih.

      Keduanya nyata: `generate_gr_number` muncul sebagai satu dari tujuh
      tersangka pada jalan pertama, dan sesudah ditelusuri sampai teks
      penuhnya, SATU-SATUNYA bedanya adalah spasi di sekitar `||`.

      Penjaga yang merah atas peletakan spasi akan diabaikan seluruh
      keluarannya, lalu berhenti menjaga tanpa gejala (CLAUDE.md §8a.2).

      ⚠ Ini juga BATASNYA: perbedaan yang hanya berupa spasi di dalam
      STRING LITERAL ikut terhapus, jadi `'a b'` vs `'a  b'` tak terlihat.
      Ditukar sadar — pesan galat yang berubah spasinya bukan perilaku yang
      berubah, dan memburunya berarti memerahkan hal yang benar.
    */
    .replace(/\s*(\|\||[(),;])\s*/g, '$1')
    .trim()
    .toLowerCase()

/* Badan di antara pembatas dolar. Memulangkan definisi TERAKHIR di berkas. */
function badanDariBerkas(isi, nama) {
  const re = new RegExp(
    `CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+(?:public\\.)?${nama}\\b`,
    'gi',
  )
  let m
  let terakhir = null
  while ((m = re.exec(isi))) {
    const sisa = isi.slice(m.index)
    const buka = sisa.match(/AS\s+(\$[a-zA-Z0-9_]*\$)/i)
    if (!buka) continue
    const tag = buka[1]
    const mulai = sisa.indexOf(tag, buka.index) + tag.length
    const tutup = sisa.indexOf(tag, mulai)
    if (tutup === -1) continue
    terakhir = sisa.slice(mulai, tutup)
  }
  return terakhir
}

const berkas = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()

/* fungsi → migrasi TERAKHIR yang mendefinisikannya + badannya */
const terakhirOleh = new Map()
for (const f of berkas) {
  const isi = readFileSync(join(DIR, f), 'utf8')
  const re = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?([a-zA-Z0-9_]+)/gi
  let m
  const nama = new Set()
  while ((m = re.exec(isi))) nama.add(m[1].toLowerCase())
  for (const n of nama) {
    const badan = badanDariBerkas(isi, n)
    if (badan === null) continue
    terakhirOleh.set(n, { berkas: f, badan })
  }
}

const c = buatClient()
await c.connect()

try {
  const { rows } = await c.query(`
    SELECT lower(p.proname) AS nama, p.prosrc
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prokind = 'f'`)

  /* Satu nama bisa punya beberapa overload; cocok bila SALAH SATU cocok. */
  const src = new Map()
  for (const r of rows) {
    if (!src.has(r.nama)) src.set(r.nama, [])
    src.get(r.nama).push(r.prosrc)
  }

  const basi = []
  const tanpaBasis = []
  const dikecualikan = []
  let dilewatiDinamis = 0
  let diperiksa = 0

  for (const [nama, { berkas: f, badan }] of [...terakhirOleh].sort()) {
    /*
      Badan yang dirakit dinamis bukan badan akhirnya — teks berkasnya
      memang tak akan pernah sama dengan `prosrc`.
    */
    if (/EXECUTE\s+format\s*\(/i.test(badan)) {
      dilewatiDinamis++
      continue
    }

    if (DIKECUALIKAN[nama]) {
      dikecualikan.push({ nama, berkas: f, alasan: DIKECUALIKAN[nama] })
      continue
    }

    const daftar = src.get(nama)
    if (!daftar) {
      tanpaBasis.push({ nama, berkas: f })
      continue
    }

    diperiksa++
    const mau = normal(badan)
    if (daftar.some((s) => normal(s) === mau)) continue
    basi.push({ nama, berkas: f, mau, ada: normal(daftar[0]) })
  }

  console.log('── badan fungsi mutakhir ──')
  console.log(`  fungsi berbadan di berkas : ${terakhirOleh.size}`)
  console.log(`     dilewati (dinamis)     : ${dilewatiDinamis}`)
  console.log(`     dikecualikan (sengaja) : ${dikecualikan.length}`)
  console.log(`     diperiksa vs basis     : ${diperiksa}`)
  console.log(`     TAK ADA di basis       : ${tanpaBasis.length}`)
  console.log(`     BADANNYA BEDA          : ${basi.length}`)

  /*
    Pengecualian DICETAK, tak pernah disembunyikan. Selisih yang sengaja
    dibiarkan tetap harus terlihat — kalau tidak, ia berhenti jadi keputusan
    dan berubah jadi hal yang terlupa.
  */
  if (dikecualikan.length) {
    console.log('\n  ── sengaja dibiarkan berbeda ──')
    for (const d of dikecualikan) {
      console.log(`     ${d.nama}  (${d.berkas})`)
      console.log(`       ${d.alasan}`)
    }
  }

  if (tanpaBasis.length) {
    console.log('\n  ⚠ ada di berkas, tak ada di basis (migrasi belum jalan?):')
    for (const t of tanpaBasis) console.log(`     ${t.nama}  ← ${t.berkas}`)
  }

  if (basi.length) {
    console.error('\n❌ Badan fungsi di BASIS berbeda dari migrasi yang mendefinisikannya.')
    console.error('\n   Ini bentuk cacat migrasi 111: buku migrasi menyatakan sudah jalan,')
    console.error('   nama fungsinya ada, dan ISINYA versi lama. Tak satu pun alat lain')
    console.error('   di repo ini bisa melihatnya — `ledger-diff.mjs` memeriksa NAMA.\n')
    for (const b of basi) {
      console.error(`   ── ${b.nama}  (didefinisikan terakhir di ${b.berkas})`)
      console.error(`      berkas : ${b.mau.slice(0, 160)}`)
      console.error(`      basis  : ${b.ada.slice(0, 160)}`)
    }
    console.error('\n   Perbaiki lewat MIGRASI MAJU bernomor baru (§5.5) — jangan edit yang lama.')
    process.exit(1)
  }

  console.log(`\n✅ ${diperiksa} badan fungsi di basis sama dengan migrasi terakhirnya.`)
} finally {
  await c.end()
}
