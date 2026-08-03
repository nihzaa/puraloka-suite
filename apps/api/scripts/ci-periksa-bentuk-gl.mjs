// ============================================================================
// R-001 syarat (1) — PERIKSA BENTUK GL DI PROJECT CI, SEBELUM eksekusi apa pun.
// ============================================================================
//
// HANYA SELECT. Tidak ada satu pun jalur kode yang menulis.
//
// ── Kenapa berkas ini ada
//
// Migrasi 047 dan 167 sama-sama membuat `accounts` + `journal_entries` dengan
// bentuk yang TIDAK kompatibel:
//
//   047 → single-tenant : kolom `account_type`, NOL `company_id`
//   167 → tenant-aware  : kolom `type`,         `company_id` NOT NULL
//
// Karena 167 memakai `CREATE TABLE IF NOT EXISTS`, di lingkungan yang sudah
// menjalankan 047 lebih dulu ia **no-op senyap** — tak ada galat, tak ada test
// merah, dan buku besar diam-diam kehilangan kemampuan memisahkan perusahaan.
//
// Sebelum memensiunkan 047 (opsi A yang diratifikasi founder 2026-08-03), kita
// WAJIB tahu bentuk mana yang sedang hidup di project CI. Tiga kemungkinan,
// masing-masing menuntut tindakan berbeda:
//
//   A. `accounts` TIDAK ADA          → CI belum pernah menjalankan GL. Aman.
//   B. `accounts` ADA, ber-company_id → CI sudah memakai bentuk 167. Aman.
//   C. `accounts` ADA, TANPA company_id → CI memakai bentuk 047 yang salah.
//      Ini kondisi paling berbahaya: reset CI dari nol WAJIB setelah perbaikan,
//      karena tabelnya tak bisa diperbaiki dengan menjalankan 167 (IF NOT EXISTS).
//
// ── Pemakaian
//
// Kredensial CI hidup di GitHub Secrets (write-only), jadi berkas ini dijalankan
// lewat workflow `ci-isolation.yml`, BUKAN dari mesin lokal:
//
//     gh workflow run ci-isolation.yml -f action=periksa-gl
//
// Exit 0 = aman (kondisi A atau B). Exit 2 = kondisi C, butuh reset.
// ============================================================================

import pg from 'pg'

const url = process.env.CI_DIRECT_URL
if (!url) {
  console.error('FATAL: CI_DIRECT_URL kosong. Berkas ini hanya berjalan di workflow ci-isolation.yml.')
  process.exit(1)
}

// Jangan bocorkan kredensial — host saja.
try {
  console.log('Target host:', new URL(url.replace(/^postgres(ql)?:\/\//, 'http://')).host)
} catch { /* format tak terduga; lanjut tanpa menampilkan host */ }

const c = new pg.Client({ connectionString: url })
await c.connect()

try {
  const TABEL_GL = ['accounts', 'journal_entries', 'journal_entry_lines']
  const temuan = []

  for (const t of TABEL_GL) {
    const { rows: ada } = await c.query('SELECT to_regclass($1) AS x', ['public.' + t])
    if (!ada[0].x) { temuan.push({ tabel: t, ada: false }); continue }

    const { rows: kol } = await c.query(
      `SELECT column_name, is_nullable FROM information_schema.columns
        WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`, [t])
    const nama = kol.map((r) => r.column_name)
    const { rows: cnt } = await c.query(`SELECT count(*)::int n FROM public."${t}"`)

    temuan.push({
      tabel: t,
      ada: true,
      baris: cnt[0].n,
      punya_company_id: nama.includes('company_id'),
      company_id_nullable: kol.find((r) => r.column_name === 'company_id')?.is_nullable ?? null,
      // Penanda bentuk: 047 memakai `account_type`, 167 memakai `type`.
      penanda_047: nama.includes('account_type'),
      penanda_167: nama.includes('type') && nama.includes('company_id'),
      kolom: nama,
    })
  }

  console.log('\n── BENTUK TABEL GL DI PROJECT CI ' + '─'.repeat(36))
  for (const t of temuan) {
    if (!t.ada) { console.log(`  ${t.tabel.padEnd(22)} TIDAK ADA`); continue }
    console.log(`  ${t.tabel.padEnd(22)} ADA · ${t.baris} baris · company_id=${t.punya_company_id ? 'YA' : 'TIDAK'}` +
      (t.penanda_047 ? ' · ⚠️ penanda 047 (account_type)' : '') +
      (t.penanda_167 ? ' · penanda 167' : ''))
  }

  // Buku migrasi: apakah 047 dan 167 tercatat?
  let cat047 = null; let cat167 = null
  try {
    const { rows } = await c.query(
      `SELECT version, name FROM supabase_migrations.schema_migrations
        WHERE version IN ('047','167') ORDER BY version`)
    cat047 = rows.find((r) => String(r.version) === '047') ?? null
    cat167 = rows.find((r) => String(r.version) === '167') ?? null
  } catch { /* tabel buku belum ada di project baru */ }
  console.log(`\n  buku migrasi: 047=${cat047 ? 'TERCATAT' : 'tidak'} · 167=${cat167 ? 'TERCATAT' : 'tidak'}`)

  const acc = temuan.find((t) => t.tabel === 'accounts')
  console.log('\n══ VERDICT ' + '═'.repeat(57))

  if (!acc.ada) {
    console.log('  A. `accounts` TIDAK ADA — CI belum pernah menjalankan GL.')
    console.log('     AMAN. Setelah 047 dipensiunkan, replay berikutnya langsung memakai bentuk 167.')
    process.exit(0)
  }

  if (acc.punya_company_id && !acc.penanda_047) {
    console.log('  B. `accounts` memakai bentuk 167 (tenant-aware). AMAN.')
    console.log('     Tidak perlu reset; migrasi penegas bentuk akan lulus.')
    process.exit(0)
  }

  console.log('  C. ⚠️  `accounts` memakai bentuk 047 (TANPA company_id) — GL TENANT-BLIND.')
  console.log('')
  console.log('     Tabel ini TIDAK BISA diperbaiki dengan menjalankan 167, karena 167')
  console.log('     memakai CREATE TABLE IF NOT EXISTS dan akan no-op senyap.')
  console.log('')
  console.log('     WAJIB: reset project CI dari nol setelah 047 dipensiunkan —')
  console.log('       gh workflow run ci-isolation.yml -f action=setup-clean')
  console.log(`     Baris data yang akan hilang: accounts=${acc.baris}` +
    `, journal_entries=${temuan.find((t) => t.tabel === 'journal_entries')?.baris ?? 0}`)
  process.exit(2)
} finally {
  await c.end()
}
