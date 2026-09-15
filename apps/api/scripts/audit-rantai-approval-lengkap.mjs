#!/usr/bin/env node
/**
 * PENJAGA — tiap company AKTIF wajib punya rantai approval LENGKAP, dan tiap
 * rantai wajib punya langkah.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * R-010 (dibuka 2026-08-05) mencatat pelanggan BARU lahir tanpa rantai
 * `submittal`, dan menutup entrinya dengan peringatan jujur: *"Perlu
 * diperiksa mana saja yang di-seed per-company lewat migrasi… BELUM
 * diperiksa — jangan diasumsikan hanya submittal."*
 *
 * Diperiksa 2026-09-14. Peringatan itu benar, dan cakupannya jauh lebih luas:
 *
 *     submittal · back_charge · klaim_perjalanan · opname_bersama   786-787 company
 *     sembilan jenis lain                                                 1 company
 *
 * **Sembilan dari tiga belas jenis hanya ada di tenant PERTAMA.** Dua tenant
 * nyata lain punya 4 dari 13.
 *
 * ── Kenapa gejalanya bukan "konfigurasi kurang"
 *
 * `canParticipateInChain()` fail-closed (`approval.ts:199`):
 *
 *     if (steps.length === 0) return { ok: false }
 *
 * Fail-closed itu BENAR — ember [C], jangan dilonggarkan. Tetapi rantai yang
 * TAK ADA karena itu berarti **nol orang** bisa menyetujui: kasbon, PO,
 * estimasi, cuti, change order tak bisa diputuskan siapa pun di tenant itu,
 * termasuk pemiliknya. Yang terlihat `403` untuk SEMUA orang — bukan pesan
 * yang menjelaskan bahwa rantainya belum dipasang.
 *
 * Ditutup migrasi 580 (trigger `AFTER INSERT ON companies` + backfill).
 * Penjaga ini usul (3) dari R-010: memastikan trigger itu tak pernah
 * diam-diam berhenti bekerja.
 *
 * ── DUA arah diperiksa, dan yang kedua bukan basa-basi
 *
 * Rantai yang ADA tetapi TANPA LANGKAH tetap fail-closed — `steps.length
 * === 0` memberi hasil yang sama persis dengan rantai yang hilang. Penjaga
 * yang hanya menghitung rantai akan hijau pada keadaan yang sama rusaknya.
 *
 * Arah ketiga: TRIGGER-nya sendiri. Tanpa itu, tenant berikutnya lahir cacat
 * lagi dan penjaga ini baru merah SESUDAH ada yang mendaftar.
 *
 * ⚠ BATAS: yang dibaca KEADAAN BASIS. Ia tak tahu apakah izin di tiap
 * langkah benar-benar dipegang seseorang di tenant itu — rantai yang
 * menuntut izin yang tak dipegang siapa pun juga fail-closed, dan itu
 * pengukuran tersendiri.
 *
 * Butuh basis, jadi TAK BOLEH ditabelkan di CLAUDE.md §6.
 */
import { buatClient } from '../../../scripts/db/_koneksi.mjs'

const c = buatClient()
await c.connect()

try {
  const { rows: jenis } = await c.query(
    `SELECT count(*)::int n FROM public.approval_chain_template`)

  if (jenis[0].n === 0) {
    console.error('❌ `approval_chain_template` KOSONG — trigger tenant baru tak')
    console.error('   menyalin apa pun, dan tiap pelanggan baru lahir fail-closed.')
    process.exit(1)
  }

  /* 1. company aktif × jenis yang belum punya rantai */
  const { rows: kurang } = await c.query(`
    SELECT co.name, t.entity_type
      FROM public.companies co
      CROSS JOIN public.approval_chain_template t
     WHERE co.is_active
       AND NOT EXISTS (
         SELECT 1 FROM public.approval_chains ch
          WHERE ch.company_id = co.id AND ch.entity_type = t.entity_type)
     ORDER BY co.name, t.entity_type`)

  /* 2. rantai yang ada TAPI tanpa langkah */
  const { rows: kosong } = await c.query(`
    SELECT co.name, ch.entity_type
      FROM public.approval_chains ch
      JOIN public.companies co ON co.id = ch.company_id
     WHERE co.is_active
       AND NOT EXISTS (SELECT 1 FROM public.approval_steps s WHERE s.chain_id = ch.id)
     ORDER BY co.name, ch.entity_type`)

  /* 3. trigger-nya terpasang */
  const { rows: trg } = await c.query(`
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.companies'::regclass
       AND tgname = 'trg_company_rantai_approval' AND NOT tgisinternal`)

  const { rows: co } = await c.query(
    `SELECT count(*)::int n FROM public.companies WHERE is_active`)

  console.log('── rantai approval lengkap ──')
  console.log(`  jenis di cetakan        : ${jenis[0].n}`)
  console.log(`  company AKTIF           : ${co[0].n}`)
  console.log(`  (company × jenis) KURANG: ${kurang.length}`)
  console.log(`  rantai TANPA langkah    : ${kosong.length}`)
  console.log(`  trigger tenant baru     : ${trg.length ? 'terpasang' : 'TIDAK ADA'}`)

  let gagal = false

  if (!trg.length) {
    gagal = true
    console.error('\n❌ Trigger `trg_company_rantai_approval` TIDAK terpasang.')
    console.error('   Tenant BERIKUTNYA akan lahir tanpa satu pun rantai approval,')
    console.error('   dan gejalanya 403 untuk semua orang — termasuk pemiliknya.')
  }

  if (kurang.length) {
    gagal = true
    console.error(`\n❌ ${kurang.length} (company × jenis) tanpa rantai approval:`)
    for (const r of kurang.slice(0, 20)) console.error(`   ${r.name} — ${r.entity_type}`)
    if (kurang.length > 20) console.error(`   … dan ${kurang.length - 20} lagi`)
  }

  if (kosong.length) {
    gagal = true
    console.error(`\n❌ ${kosong.length} rantai ADA tapi TANPA langkah:`)
    for (const r of kosong.slice(0, 20)) console.error(`   ${r.name} — ${r.entity_type}`)
    console.error('\n   Rantai kosong = fail-closed, sama persis dengan rantai yang hilang.')
  }

  if (gagal) {
    console.error('\n   Pulihkan lewat migrasi maju (pola 580): salin dari')
    console.error('   `approval_chain_template`, bukan ditulis tangan.')
    process.exit(1)
  }

  console.log('\n✅ Seluruh company aktif punya 13 jenis rantai + langkahnya · trigger hidup.')
} finally {
  await c.end()
}
