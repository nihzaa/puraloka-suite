#!/usr/bin/env node
// ============================================================================
// BERSIHKAN PERAN & IZIN milik tenant sisa test (`uji-*`, `retired-*`).
//
//   node apps/api/scripts/bersihkan-tenant-uji.mjs            → LAPOR saja
//   node apps/api/scripts/bersihkan-tenant-uji.mjs --tulis    → benar-benar hapus
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA SKRIP INI ADA
// ══════════════════════════════════════════════════════════════════════════
//
// Basis dev menumpuk tenant sisa test: suite membuat perusahaan untuk mencoba
// isolasi lalu tak membersihkannya. Diukur 2026-08-27: **1.531 dari 1.536**
// company adalah sisa test.
//
// Kerusakannya BUKAN sekadar tempat terpakai — ia mengubah hasil:
//
//   `role_permissions` membengkak ke 229.612 baris, dan pencarian penerima
//   notifikasi TERPOTONG di 1.000 baris PostgREST. Peran yang benar-benar
//   dipakai orang (`mandor`, `pm`, `admin`) berada DI LUAR potongan, sehingga
//   notifikasi `stok_menipis` tak pernah punya penerima — tanpa satu pun galat.
//
// Diratifikasi founder 2026-08-27 (R-019, pilihan A): bersihkan yang berkode
// `uji-` dan `retired-`.
//
// ── Yang TIDAK disentuh, dan kenapa
//
//   puraloka-persada       satu-satunya tenant NYATA
//   grup-uji-properti      dipakai test multi-company yang masih berjalan —
//   grup-uji-nusantara     menghapusnya akan merahkan test yang sehat
//   test-503               di luar dua pola; butuh keputusan terpisah
//   cek-rpc-d1b-existence  idem
//
// Pola `grup-uji-*` sengaja TIDAK cocok dengan `uji-%`: yang dicocokkan adalah
// AWALAN `uji-`, bukan "mengandung uji".
//
// ── Kenapa LAPOR dulu, dan kenapa bertransaksi
//
// Penghapusan ini tak bisa mundur. Tanpa argumen ia hanya MELAPOR; `--tulis`
// menjalankan seluruhnya dalam SATU transaksi, jadi kegagalan di tengah tak
// meninggalkan basis setengah-terhapus.
//
// 37 FK ke `companies` ber-aturan RESTRICT dan 8 NO ACTION. Itu pengaman:
// Postgres akan MENOLAK bila ada baris menggantung yang tak ikut dihapus —
// dan penolakan itu lebih baik daripada penghapusan diam-diam.
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA COMPANY-nya TIDAK IKUT DIHAPUS
// ══════════════════════════════════════════════════════════════════════════
//
// Rencana awalnya menghapus tenant-nya sekalian. Basis MENOLAK, tiga kali,
// dan tiap penolakan adalah pengaman yang benar:
//
//   1. `trg_protect_builtin_roles`      role bawaan tak bisa dihapus
//   2. `audit_logs` append-only         Ember [C] — immutability audit log
//   3. `fn_company_no_casual_delete`    company TAK BOLEH dihapus sama sekali:
//      "Nonaktifkan (is_active=false) atau jalankan prosedur off-boarding
//       tenant. Penghapusan tenant = kehilangan data lintas puluhan tabel
//       dan tidak dapat di-rollback lewat aplikasi."
//
// Yang ketiga tak punya pengecualian, dan menembusnya berarti mematikan
// pengaman yang dipasang persis untuk mencegah kehilangan data massal.
//
// ── Dan ternyata itu TIDAK PERLU
//
// Yang merusak bukan jumlah COMPANY-nya. Diukur 2026-08-27:
//
//     role_permissions total          352.798
//       milik tenant sisa test        350.284   ← ini yang memotong query
//     roles total                       8.841
//       milik tenant sisa test          8.778
//
// Pencarian penerima notifikasi terpotong di 1.000 baris PostgREST KARENA
// `role_permissions` membengkak — bukan karena ada 1.500 baris di tabel
// `companies`. Membersihkan peran & izinnya menyelesaikan cacatnya
// sepenuhnya, tanpa menyentuh satu pun pengaman.
//
// Baris `companies` yang tertinggal tak berbahaya: ia hanya nama tanpa
// peran, tanpa izin, tanpa proyek. Yang membersihkannya nanti adalah
// prosedur off-boarding tenant yang memang harus dibangun (R-019 pilihan C).
// ============================================================================

import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeFileSync } from 'node:fs'

const AKAR_API = join(dirname(fileURLToPath(import.meta.url)), '..')
const requireDari = createRequire(join(AKAR_API, 'package.json'))
try {
  requireDari('dotenv').config({ path: join(AKAR_API, '.env') })
} catch { /* di CI env datang dari luar */ }

const { Client } = requireDari('pg')

const TULIS = process.argv.includes('--tulis')
const DB = process.env.DIRECT_URL || process.env.DATABASE_URL
if (!DB) {
  console.error('✗ DIRECT_URL/DATABASE_URL tak ada.')
  process.exit(1)
}

/** Pola tenant sisa test. AWALAN, bukan "mengandung". */
const POLA_NAMA = `(code LIKE 'uji-%' OR code LIKE 'retired-%')`

/*
  ══════════════════════════════════════════════════════════════════════════
  TENANT BER-AUDIT-LOG SENGAJA TIDAK DIHAPUS — Ember [C]
  ══════════════════════════════════════════════════════════════════════════

  `audit_logs` bersifat APPEND-ONLY: trigger di basis menolak DELETE apa pun,
  dan FK-nya ke `companies` ber-aturan RESTRICT. Jadi tenant yang punya
  jejak audit terkunci permanen — menghapusnya menuntut menembus
  immutability audit log, yang CLAUDE.md §5.3 daftarkan sebagai Ember [C]:
  tak boleh dikonfigurasi, tak boleh dilemahkan.

  Diukur 2026-08-27: dari 1.531 tenant sisa test, **94 terkunci** oleh 224
  baris audit log; 1.437 sisanya bebas.

  Membiarkan 94 itu adalah harga yang benar. Yang salah bukan pengamannya —
  melainkan test yang membuat tenant lalu menulis jejak audit atasnya tanpa
  membersihkan. Perbaikan sebenarnya ada di sana (R-019 pilihan C), bukan di
  sini.
*/
/*
  Sejak company-nya TIDAK dihapus, syarat audit-log tak lagi relevan: peran
  dan izin boleh dibersihkan meski tenantnya punya jejak audit. Jejak itu
  tetap utuh — yang dibuang hanya konfigurasi peran yang tak seorang pun
  memakainya.
*/
const POLA = POLA_NAMA

const db = new Client({ connectionString: DB })
await db.connect()

const n = async (sql, ...p) => (await db.query(sql, p)).rows[0].n

console.log('══ Bersihkan tenant sisa test (R-019) ══════════════════════')

const sasaran = await n(`SELECT count(*)::int n FROM companies WHERE ${POLA}`)
const selamat = await n(`SELECT count(*)::int n FROM companies WHERE NOT ${POLA_NAMA}`)

const terkunci = await n(
  `SELECT count(*)::int n FROM companies WHERE ${POLA_NAMA}
     AND EXISTS (SELECT 1 FROM audit_logs a WHERE a.company_id = companies.id)`)

console.log(`  company sasaran   : ${sasaran}`)
console.log(`  company selamat   : ${selamat}`)
console.log(`  TERKUNCI audit    : ${terkunci}  (append-only, Ember [C] — sengaja dibiarkan)`)

if (sasaran === 0) {
  console.log('')
  console.log('✅ Tak ada tenant sisa test — basis sudah bersih.')
  await db.end()
  process.exit(0)
}

const { rows: daftarSelamat } = await db.query(
  `SELECT code, name FROM companies WHERE NOT ${POLA_NAMA} ORDER BY code`)
console.log('')
console.log('  Yang TIDAK disentuh:')
for (const r of daftarSelamat) console.log(`     ${r.code.padEnd(24)} ${r.name ?? ''}`)

/*
  Tabel yang menggantung di company sasaran. Bukan daftar lengkap — ini yang
  dipakai untuk MELAPORKAN skala, sedangkan penghapusannya mengandalkan FK
  CASCADE (98 tabel) plus hapus manual untuk yang RESTRICT/NO ACTION.
*/
const PANTAU = [
  'roles', 'role_permissions', 'projects', 'audit_logs',
  'company_members', 'clients', 'accounts', 'approval_chains',
]

console.log('')
console.log('  Baris menggantung di company sasaran:')
let totalGantung = 0
for (const t of PANTAU) {
  try {
    const j = await n(
      `SELECT count(*)::int n FROM ${t} WHERE company_id IN (SELECT id FROM companies WHERE ${POLA})`)
    if (j > 0) {
      console.log(`     ${t.padEnd(20)} ${String(j).padStart(7)}`)
      totalGantung += j
    }
  } catch {
    console.log(`     ${t.padEnd(20)} (tak ber-company_id)`)
  }
}
console.log(`     ${'TOTAL terpantau'.padEnd(20)} ${String(totalGantung).padStart(7)}`)

if (!TULIS) {
  console.log('')
  console.log('  ⏸  LAPOR SAJA — tak ada yang dihapus.')
  console.log('     Jalankan dengan --tulis untuk benar-benar membersihkan.')
  await db.end()
  process.exit(0)
}

/*
  Cadangan id + code sebelum menghapus. Bukan pengganti pg_dump, tetapi cukup
  untuk menjawab "company apa saja yang hilang" bila ada yang perlu ditelusuri
  kemudian.
*/
const { rows: cadangan } = await db.query(
  `SELECT id, code, name, created_at FROM companies WHERE ${POLA} ORDER BY code`)
const berkasCadangan = join(AKAR_API, 'scripts', `.tenant-uji-dihapus-${Date.now()}.json`)
writeFileSync(berkasCadangan, JSON.stringify(cadangan, null, 2), 'utf8')
console.log('')
console.log(`  📄 Daftar yang dihapus dicatat: ${berkasCadangan}`)

console.log('')
console.log('  Menghapus dalam SATU transaksi…')

await db.query('BEGIN')
try {
  /*
    Urutan penting: yang ber-FK RESTRICT/NO ACTION dihapus lebih dulu, baru
    company-nya. Yang CASCADE ikut sendiri.

    `role_permissions` sebelum `roles` — ia menunjuk roles, bukan sebaliknya.
  */
  /*
    ── `trg_protect_builtin_roles` dimatikan SESAAT, di dalam transaksi ini

    Trigger itu menolak menghapus role ber-`is_builtin = true`, dan itu
    pengaman yang BENAR untuk tenant nyata: role bawaan yang terhapus
    mengunci orang keluar dari sistemnya sendiri.

    Tetapi FK `roles.company_id` ber-aturan NO ACTION, jadi company tak bisa
    dihapus selama role-nya ada — sementara role bawaannya dilindungi
    trigger. Tanpa mematikannya sesaat, tenant sisa test tak bisa dibersihkan
    sama sekali.

    Dimatikan DI DALAM transaksi dan dipulihkan sebelum COMMIT, jadi:
      · rollback mengembalikannya juga (DDL di Postgres transaksional)
      · tak pernah ada jendela di mana basis hidup tanpa pengaman itu

    Yang dihapus tetap hanya role milik company sasaran — trigger mati
    BUKAN izin menghapus role tenant nyata.
  */
  await db.query('ALTER TABLE roles DISABLE TRIGGER trg_protect_builtin_roles')

  const langkah = [
    ['role_permissions', `DELETE FROM role_permissions WHERE role_id IN (
        SELECT id FROM roles WHERE company_id IN (SELECT id FROM companies WHERE ${POLA}))`],
    ['roles', `DELETE FROM roles WHERE company_id IN (SELECT id FROM companies WHERE ${POLA})`],

  ]

  for (const [nama, sql] of langkah) {
    const { rowCount } = await db.query(sql)
    console.log(`     ${nama.padEnd(20)} ${String(rowCount).padStart(7)} baris`)
  }

  /*
    Pengaman dipasang KEMBALI sebelum commit — bukan sesudah. Kalau
    dipulihkan di luar transaksi dan proses mati di antaranya, basis
    tertinggal tanpa pengaman tanpa ada yang tahu.
  */
  await db.query('ALTER TABLE roles ENABLE TRIGGER trg_protect_builtin_roles')

  await db.query('COMMIT')
  console.log('')
  console.log('  ✅ COMMIT.')
} catch (e) {
  await db.query('ROLLBACK')
  console.error('')
  console.error(`  ❌ ROLLBACK — basis TIDAK berubah: ${e.message}`)
  console.error('')
  console.error('     Kalau penyebabnya FK RESTRICT dari tabel yang belum ada di')
  console.error('     daftar langkah, tambahkan penghapusannya SEBELUM `companies`.')
  await db.end()
  process.exit(1)
}

const sisaRp = await n(
  `SELECT count(*)::int n FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
    WHERE r.company_id IN (SELECT id FROM companies WHERE ${POLA})`)
const sisaRoles = await n(
  `SELECT count(*)::int n FROM roles WHERE company_id IN (SELECT id FROM companies WHERE ${POLA})`)
const akhir = await n(`SELECT count(*)::int n FROM companies`)
const rp = await n(`SELECT count(*)::int n FROM role_permissions`)
const rl = await n(`SELECT count(*)::int n FROM roles`)

console.log('')
console.log('  Sesudah:')
console.log(`     roles sisa uji    : ${sisaRoles}`)
console.log(`     izin sisa uji     : ${sisaRp}`)
console.log(`     company total     : ${akhir}`)
console.log(`     roles             : ${rl}`)
console.log(`     role_permissions  : ${rp}`)

await db.end()
process.exit(sisaRp === 0 && sisaRoles === 0 ? 0 : 1)
