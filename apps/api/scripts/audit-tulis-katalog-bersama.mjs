#!/usr/bin/env node
/**
 * PENJAGA — katalog bersama (`company_id IS NULL`) boleh DIBACA semua tenant,
 * tetapi tak boleh DITULIS tenant mana pun.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-09-14, dari test merah `template-wbs.test.ts:238` — BUKAN dari
 * penjaga mana pun. Migrasi 374 memperketat `cbs_templates`/`cbs_nodes`:
 *
 *     RESTRICTIVE              → BERLAKU  ✅
 *     WITH CHECK tanpa IS NULL → TIDAK    ❌
 *
 * Satu berkas, dua pekerjaan, satu mendarat. Bentuk yang sama dengan migrasi
 * 372 (lihat 571) dan 111 (lihat 570).
 *
 * ── Kenapa penjaga yang SUDAH ADA tak bisa melihatnya
 *
 * `audit-badan-fungsi-mutakhir.mjs` (lahir sehari sebelumnya) membandingkan
 * BADAN FUNGSI, dan 374 memasang policy lewat `EXECUTE format(...)` —
 * dinamis, dan penjaga itu SENGAJA melewatinya. Batas itu tertulis di
 * kepalanya, dan ternyata batas yang nyata: 28 dari 169 migrasi ber-policy
 * memasangnya secara dinamis.
 *
 * `audit-tabel-force-berpagar.mjs` juga tak melihatnya — ia menjaga policy
 * ADA dan RESTRICTIVE, bukan ISI `with_check`-nya.
 *
 * Cacatnya hidup di CELAH antara dua penjaga yang keduanya jujur.
 *
 * ── Yang dijaga, dan kenapa arah TULIS
 *
 * `tenant_isolation` RESTRICTIVE digabung AND, jadi `WITH CHECK`-nya adalah
 * gerbang TULIS yang sesungguhnya. Cabang `company_id IS NULL` di sana
 * berarti tenant boleh MENULIS baris milik-bersama — dan baris NULL terbaca
 * SELURUH tenant (itu memang guna cabang NULL di `USING`).
 *
 * Jadi satu tenant bisa menyuntikkan atau menyunting cetakan yang dipakai
 * tenant lain. Bukan kebocoran BACA — kebocoran TULIS, arah yang lebih
 * jarang diperiksa orang.
 *
 * ── ⚠ KENAPA INI RATCHET, BUKAN AMBANG NOL
 *
 * Ini bagian terpenting berkas ini, dan ia lahir dari kekeliruan saya
 * sendiri pada hari yang sama.
 *
 * Pengukuran pertama saya melaporkan 17 tabel melanggar, 12 di antaranya
 * "BASI". **Keliru.** Regex saya mengambil blok `WITH CHECK` dari bagian
 * LAIN di berkas yang sama, sehingga "migrasi terakhir" per tabel salah.
 *
 * Dibaca langsung ke migrasi 131 §AB: kedua belas tabel katalog bersama
 * (`assemblies`, `cost_codes`, `materials`, `roles`, …) memang DITULIS
 * dengan `WITH CHECK (company_id IS NULL OR …)`. Basis COCOK dengan
 * berkasnya. Itu keputusan rancangan 2026-07-31, bukan cacat.
 *
 * Apakah keputusan itu masih tepat hari ini adalah pertanyaan yang SAH —
 * tetapi menjawabnya berarti menimbang, per tabel, siapa yang berhak
 * menulis katalog nasional. Itu keputusan founder, bukan efek samping
 * penjaga baru.
 *
 * Maka: yang dijaga JUMLAHNYA TIDAK BOLEH NAIK, bukan harus nol. Tabel yang
 * hari ini sudah ketat tak boleh dilonggarkan diam-diam, dan tabel baru tak
 * boleh lahir longgar. Menurunkannya dari 15 butuh keputusan sadar.
 *
 * ⚠ Lantainya menyimpan DAFTAR NAMA, bukan cuma angka — merah tanpa
 * menyebut pelakunya memaksa orang berikutnya menyisir 17 baris
 * (CLAUDE.md §8a.2).
 *
 * ⚠ BATAS: yang dibaca KEADAAN BASIS, bukan teks migrasi. Ia tahu policy
 * hari ini longgar; ia TIDAK tahu migrasi mana yang memaksudkannya ketat.
 * Untuk itulah `audit-badan-fungsi-mutakhir.mjs` ada — dan celah di
 * antaranya justru yang melahirkan berkas ini.
 *
 * Butuh basis, jadi TAK BOLEH ditabelkan di CLAUDE.md §6
 * (`audit-penjaga-tercatat-jalan.mjs` mewajibkan yang tertabel benar-benar
 * dijalankan `ci.yml`, dan ini tak bisa).
 */
import { buatClient } from '../../../scripts/db/_koneksi.mjs'

/*
  LANTAI — daftar tabel yang WITH CHECK-nya hari ini mengizinkan
  `company_id IS NULL`. Seluruhnya dari migrasi 131 §AB (katalog bersama)
  dan 519/155 (turunan template & modul), dan seluruhnya COCOK dengan
  berkas migrasinya — sudah diperiksa satu per satu 2026-09-14.

  Menambah nama ke daftar ini = melonggarkan gerbang tulis katalog bersama.
  Jangan lakukan tanpa alasan tertulis di sebelahnya.
*/
const LANTAI = new Set([
  'assemblies',
  'assembly_components',
  'cost_codes',
  'expense_category_templates',
  'feature_flags',
  'materials',
  'modules',
  'price_book_entries',
  'productivity_records',
  'role_permissions',
  'roles',
  'saas_invoice_line_items',
  'saas_invoices',
  'template_input',
  'template_item',
  'template_rab',
  'wa_pesan_masuk_dedup',
])

/*
  Tabel yang sudah SENGAJA diperketat — tak boleh kembali longgar.
  `cbs_*` diperketat migrasi 374, gagal mendarat, dipulihkan migrasi 573.
*/
const WAJIB_KETAT = {
  cbs_templates: 'migrasi 374 + 573 — cetakan WBS/CBS bersama tak boleh ditulis tenant',
  cbs_nodes: 'migrasi 374 + 573 — idem, node cetakannya',
}

const c = buatClient()
await c.connect()

try {
  const { rows } = await c.query(`
    SELECT tablename, policyname, permissive, with_check
      FROM pg_policies
     WHERE schemaname = 'public'
       AND policyname = 'tenant_isolation'
     ORDER BY tablename`)

  const longgar = rows
    .filter((r) => /company_id IS NULL/i.test(r.with_check ?? ''))
    .map((r) => r.tablename)

  const baru = longgar.filter((t) => !LANTAI.has(t))
  const membaik = [...LANTAI].filter((t) => !longgar.includes(t))

  /* Yang sudah diperketat WAJIB tetap ketat — arah kambuh. */
  const kambuh = Object.keys(WAJIB_KETAT).filter((t) => longgar.includes(t))

  console.log('── tulis katalog bersama ──')
  console.log(`  policy tenant_isolation     : ${rows.length}`)
  console.log(`  WITH CHECK izinkan NULL     : ${longgar.length}  (lantai ${LANTAI.size})`)
  console.log(`  wajib ketat & masih ketat   : ${Object.keys(WAJIB_KETAT).length - kambuh.length}/${Object.keys(WAJIB_KETAT).length}`)

  if (membaik.length) {
    console.log(`\n  ✅ ${membaik.length} tabel kini LEBIH ketat dari lantai:`)
    for (const t of membaik) console.log(`     ${t}`)
    console.log('\n     Turunkan LANTAI di berkas ini supaya perbaikannya terkunci.')
  }

  if (kambuh.length) {
    console.error('\n❌ Tabel yang SUDAH diperketat kembali mengizinkan tulis katalog bersama:')
    for (const t of kambuh) console.error(`   ${t} — ${WAJIB_KETAT[t]}`)
    console.error('\n   Ini bentuk cacat migrasi 374: pengetatan yang tak mendarat.')
    process.exit(1)
  }

  if (baru.length) {
    console.error(`\n❌ ${baru.length} tabel BARU mengizinkan tenant menulis katalog bersama:`)
    for (const t of baru) console.error(`   ${t}`)
    console.error('\n   `tenant_isolation` RESTRICTIVE digabung AND, jadi WITH CHECK adalah')
    console.error('   gerbang TULIS yang sesungguhnya. Cabang `company_id IS NULL` di sana')
    console.error('   berarti tenant boleh MENULIS baris milik-bersama — dan baris NULL')
    console.error('   terbaca SELURUH tenant.')
    console.error('\n   Yang benar untuk katalog bersama:')
    console.error('     USING      (company_id IS NULL OR company_id = (SELECT auth_company_id()))')
    console.error('     WITH CHECK (company_id = (SELECT auth_company_id()))')
    console.error('\n   Kalau memang disengaja, tambahkan ke LANTAI beserta alasannya.')
    process.exit(1)
  }

  console.log(`\n✅ Nol pelonggaran baru · ${Object.keys(WAJIB_KETAT).length} tabel yang diperketat tetap ketat.`)
} finally {
  await c.end()
}
