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
