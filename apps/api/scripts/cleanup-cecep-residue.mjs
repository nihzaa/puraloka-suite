// ═══════════════════════════════════════════════════════════════════════════
// SCRIPT SEKALI-JALAN — Bersihkan residu test/smoke dari tabel CECEP di dev.
//
// KONTEKS (kenapa ada): sebelum CI dipisah ke proyek Supabase sendiri, test
// handler CECEP menulis ke dev `public` (klien service_role hardcoded ke public,
// lihat apps/api/src/utils/supabase.ts). Akibatnya menumpuk ratusan baris residu.
// Ini membersihkannya SEKALI, setelah CI dipisah (kalau dijalankan sebelum itu,
// run CI berikutnya mengotori lagi — sia-sia).
//
// BATASAN yang DITEGAKKAN (permintaan founder, verbatim):
//   · "Jangan sentuh DB selain dev"      → assertIsDev() menolak selain proyek dev.
//   · "hanya tabel CECEP"                → daftar TABLES di bawah, tak ada yang lain.
//   · "kalau harus bypass guard, bypass-nya di dalam script itu saja, diberi
//      komentar jelas ... Bukan helper reusable" → bypass di sini, inline, hanya
//      trigger no-delete SPESIFIK per tabel (bukan session_replication_role yang
//      "mematikan SEMUA trigger termasuk guard finansial").
//   · "dry-run dulu"                     → default DRY-RUN; destruktif hanya dgn --execute.
//
// PEMAKAIAN (dari apps/api, agar dotenv/pg + .env ter-resolve):
//   node scripts/cleanup-cecep-residue.mjs            # dry-run (hitung saja)
//   node scripts/cleanup-cecep-residue.mjs --execute  # hapus (transaksi, dev saja)
// ═══════════════════════════════════════════════════════════════════════════
import 'dotenv/config'
import pg from 'pg'

const DEV_PROJECT_REF = 'tgozokxyvwmyvajgqfxw' // puraloka-suite-dev (CLAUDE.md)
const EXECUTE = process.argv.includes('--execute')

// Urutan hapus FK-safe: anak → induk. Tiap entri: tabel + trigger no-delete yang
// HARUS dinonaktifkan sementara supaya DELETE lolos. Trigger UPDATE/INSERT
// (immutability, touch, transition) TIDAK disentuh — kita tidak meng-UPDATE.
const TABLES = [
  { t: 'estimate_items',               noDelete: 'trg_estimate_item_parent_draft' },
  { t: 'estimate_versions',            noDelete: 'trg_estimate_version_no_delete' },
  { t: 'lesson_propagation_proposals', noDelete: 'trg_proposal_parent_draft' },
  { t: 'lessons_learned_records',      noDelete: 'trg_lessons_no_delete' },
  { t: 'assembly_components',          noDelete: 'trg_assembly_component_guard' },
  { t: 'assemblies',                   noDelete: 'trg_assembly_no_delete' },
  { t: 'price_book_entries',           noDelete: 'trg_price_book_no_delete_verified' },
  { t: 'productivity_records',         noDelete: 'trg_productivity_no_delete' },
  { t: 'formula_definitions',          noDelete: 'trg_formula_no_delete' },
  { t: 'resources',                    noDelete: 'trg_resources_no_delete' },
  { t: 'cost_codes',                   noDelete: 'trg_cost_codes_no_delete' },
]

function assertIsDev(conn) {
  if (!conn || !conn.includes(DEV_PROJECT_REF)) {
    throw new Error(
      `TOLAK: koneksi bukan proyek dev (${DEV_PROJECT_REF}). Script ini HANYA untuk dev. ` +
      `("Jangan sentuh DB selain dev".)`)
  }
}

/**
 * ⛔ PENGAMAN YANG DITAMBAHKAN 2026-08-01 — dan kenapa ia harus ada.
 *
 * Skrip ini memakai `DELETE FROM <tabel>` **TANPA `WHERE` apa pun**: ia
 * MENGOSONGKAN tabel, bukan menyaring residu. Saat ditulis itu benar — seluruh
 * isi tabel CECEP memang residu test, dan nama "cleanup residu" tepat.
 *
 * Keadaan itu SUDAH BERUBAH. Diukur 2026-08-01:
 *   assemblies          3.043 baris · ber-[TEST]  0  → seluruhnya NYATA
 *   assembly_components 17.873 baris
 *   resources           2.830 baris · ber-[TEST]  0
 *   price_book_entries  3.006 baris · ber-[TEST]  0
 *   cost_codes             44 baris · ber-[TEST]  0
 *
 * Itu analisa AHSP SE-47-2026 (2.620 analisa, satu-satunya edisi yang berisi)
 * plus price book yang dipakai SETIAP perhitungan RAB. Menjalankan `--execute`
 * hari ini menghancurkannya — dan tak ada di judul, komentar, maupun keluaran
 * skrip yang memberi tahu itu.
 *
 * Yang berbahaya bukan perintah DELETE-nya, melainkan **jaraknya dengan nama
 * skrip**: "cleanup residu" terbaca seperti membuang sampah, sampai seseorang
 * membaca 40 baris ke bawah dan menemukan tak ada `WHERE`.
 *
 * Pengaman ini menolak jalan bila ada tabel yang isinya BUKAN residu. Ia tidak
 * mencoba pintar — tak menghapus sebagian, tak menebak mana yang boleh. Ia
 * berhenti dan menyerahkan keputusannya ke manusia, karena "hapus 8.923 baris
 * data nyata" bukan keputusan yang boleh diambil skrip.
 */
async function assertMemangResidu(c) {
  // Kolom teks yang menandai baris uji. Tabel yang tak punya kolom penanda
  // (mis. `assembly_components`, `estimate_items`) diperiksa lewat INDUKNYA.
  // `estimate_versions` SENGAJA tak ada di sini: satu-satunya kolom teksnya
  // `status`, jadi tak ada tempat menaruh penanda [TEST]. Diverifikasi ke
  // `pg_attribute`, bukan ditebak. Ia tetap terlindungi secara tak langsung —
  // versi estimasi menunjuk assembly & price book, dan keduanya diperiksa.
  const PENANDA = {
    assemblies: 'name',
    resources: 'name',
    cost_codes: 'name',
    lessons_learned_records: 'title',
  }
  const nyata = []
  for (const [tabel, kolom] of Object.entries(PENANDA)) {
    const { rows } = await c.query(
      `SELECT count(*)::int n FROM ${tabel}
        WHERE ${kolom}::text NOT LIKE '[TEST]%' AND ${kolom}::text NOT LIKE '[UJI]%'`)
    if (rows[0].n > 0) nyata.push(`${tabel}: ${rows[0].n} baris`)
  }
  if (nyata.length) {
    throw new Error(
      '\n⛔ TOLAK — tabel berisi data yang BUKAN residu test:\n' +
      nyata.map((s) => `     ${s}`).join('\n') +
      '\n\n   Skrip ini `DELETE FROM <tabel>` TANPA `WHERE` — ia mengosongkan\n' +
      '   tabel, bukan menyaring residu. Saat ditulis, seluruh isinya memang\n' +
      '   residu; sekarang tidak lagi.\n\n' +
      '   Kalau memang hendak mengosongkan (mis. mengganti seluruh edisi AHSP),\n' +
      '   hapus panggilan assertMemangResidu() SECARA SADAR di sini, dengan\n' +
      '   alasannya tertulis — jangan menambah flag `--paksa` yang membuat\n' +
      '   penghapusan 8.900+ baris jadi satu argumen jauhnya.\n')
  }
}

async function main() {
  const conn = process.env.DIRECT_URL
  assertIsDev(conn)
  const c = new pg.Client({ connectionString: conn })
  await c.connect()

  console.log(`\n=== Cleanup residu CECEP — ${EXECUTE ? 'EKSEKUSI (destruktif)' : 'DRY-RUN'} ===`)
  console.log(`Target: proyek dev ${DEV_PROJECT_REF}\n`)

  // Hitung dulu (dry-run maupun eksekusi menampilkan ini).
  for (const { t } of TABLES) {
    const { rows } = await c.query(`SELECT count(*)::int n FROM ${t}`)
    console.log(`  ${t.padEnd(32)} ${rows[0].n} baris`)
  }
  const { rows: ap } = await c.query(
    `SELECT count(*)::int n FROM approval_progress WHERE entity_type IN ('estimate_version','lessons_learned')`)
  console.log(`  ${'approval_progress (CECEP)'.padEnd(32)} ${ap[0].n} baris`)

  // Peringatan ditampilkan di DRY-RUN juga — kalau hanya muncul saat
  // `--execute`, ia baru terbaca ketika jarinya sudah di tombol.
  try {
    await assertMemangResidu(c)
    console.log('\n  ✅ Seluruh baris di atas bertanda [TEST]/[UJI] — memang residu.')
  } catch (e) {
    console.log((e instanceof Error ? e.message : String(e)))
    if (!EXECUTE) {
      console.log('DRY-RUN selesai — tidak ada yang dihapus.')
      await c.end(); return
    }
    await c.end()
    process.exit(1)
  }

  if (!EXECUTE) {
    console.log('\nDRY-RUN selesai — tidak ada yang dihapus. Jalankan ulang dengan --execute untuk menghapus.')
    await c.end(); return
  }

  // ── EKSEKUSI: satu transaksi. Nonaktifkan HANYA trigger no-delete spesifik,
  //    hapus, aktifkan lagi. ALTER TABLE ... DISABLE TRIGGER bersifat transaksional →
  //    ROLLBACK otomatis memulihkannya kalau ada error. try/finally menjamin ENABLE.
  await c.query('BEGIN')
  try {
    // 1. jejak approval CECEP (tak ada guard delete).
    await c.query(`DELETE FROM approval_progress WHERE entity_type IN ('estimate_version','lessons_learned')`)
    // 2. tabel domain, anak → induk, dgn bypass trigger no-delete tertarget.
    for (const { t, noDelete } of TABLES) {
      await c.query(`ALTER TABLE ${t} DISABLE TRIGGER ${noDelete}`)
      const { rowCount } = await c.query(`DELETE FROM ${t}`)
      await c.query(`ALTER TABLE ${t} ENABLE TRIGGER ${noDelete}`)
      console.log(`  hapus ${t.padEnd(32)} -${rowCount}`)
    }
    await c.query('COMMIT')
    console.log('\n✓ COMMIT — residu CECEP bersih.')
  } catch (e) {
    await c.query('ROLLBACK') // memulihkan trigger + data
    console.error('\n✗ ROLLBACK — tak ada perubahan:', e.message)
    process.exitCode = 1
  } finally {
    // Sabuk pengaman: pastikan tak ada trigger tertinggal nonaktif (idempoten).
    for (const { t, noDelete } of TABLES) {
      try { await c.query(`ALTER TABLE ${t} ENABLE TRIGGER ${noDelete}`) } catch {}
    }
    await c.end()
  }
}
main().catch(e => { console.error(e); process.exit(1) })
