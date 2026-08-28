#!/usr/bin/env node
/**
 * audit-tabel-force-berpagar.mjs — ambang NOL
 *
 * Tiap tabel yang di-FORCE RLS dan punya `company_id` WAJIB punya policy
 * RESTRICTIVE yang menyaring tenant.
 *
 * ── Kenapa penjaga ini ada
 *
 * Diukur 2026-08-28: `document_number_series` membocorkan 27 dari 27 baris
 * ke admin tenant lain. Tabelnya punya EMPAT policy permissive, dan dua di
 * antaranya hanya memeriksa izin (`has_permission('penomoran:view')`) tanpa
 * menyebut `company_id` sama sekali.
 *
 * Policy PERMISSIVE digabung dengan OR — jadi satu policy yang lupa menyaring
 * tenant MEMBATALKAN penyaringan yang dilakukan saudaranya. Menambah policy
 * justru melonggarkan. Intuisi yang terbalik dari kebanyakan sistem izin,
 * dan itu sebabnya cacat begini lolos review berkali-kali.
 *
 * Yang menyelamatkan 129 tabel lain adalah lapis RESTRICTIVE `tenant_isolation`
 * (`company_id = auth_company_id()`), yang digabung dengan AND sehingga menahan
 * apa pun yang diloloskan lapis permissive. Sembilan tabel tak punya lapis itu.
 *
 * Penjaga ini menjaga lapis itu tetap ada — bukan menjaga tiap policy permissive
 * ditulis benar, karena yang terakhir mustahil dijamin untuk policy yang belum
 * ditulis. Yang dijaga: bawaannya gagal-tertutup.
 *
 * Kebocorannya TIDAK mengeluarkan galat. Ia halaman yang menampilkan data
 * perusahaan lain seolah miliknya sendiri.
 *
 * Tunduk Ember [C] — isolasi tenant tak boleh bisa dikonfigurasi.
 */
import 'dotenv/config'
import pg from 'pg'

const url = process.env.DIRECT_URL || process.env.DATABASE_URL
if (!url) {
  console.error('❌ DIRECT_URL/DATABASE_URL kosong — penjaga tak bisa mengukur apa pun.')
  console.error('   Nol temuan tanpa koneksi BUKAN bukti tak ada pelanggaran.')
  process.exit(1)
}

const c = new pg.Client({ connectionString: url })
await c.connect()

const { rows: telanjang } = await c.query(`
  SELECT cl.relname
    FROM pg_class cl
   WHERE cl.relnamespace = 'public'::regnamespace
     AND cl.relkind = 'r'
     AND cl.relforcerowsecurity
     AND EXISTS (SELECT 1 FROM information_schema.columns co
                  WHERE co.table_schema = 'public' AND co.table_name = cl.relname
                    AND co.column_name = 'company_id')
     AND NOT EXISTS (SELECT 1 FROM pg_policies p
                      WHERE p.schemaname = 'public' AND p.tablename = cl.relname
                        AND p.permissive = 'RESTRICTIVE'
                        AND p.qual ~ 'company_id|auth_company_id|is_member_of')
   ORDER BY cl.relname`)

/* Berapa yang DIPERIKSA — nol pemeriksaan terbaca sama dengan nol pelanggaran. */
const { rows: [{ n: diperiksa }] } = await c.query(`
  SELECT count(*)::int n FROM pg_class cl
   WHERE cl.relnamespace='public'::regnamespace AND cl.relkind='r' AND cl.relforcerowsecurity
     AND EXISTS (SELECT 1 FROM information_schema.columns co
                  WHERE co.table_schema='public' AND co.table_name=cl.relname
                    AND co.column_name='company_id')`)

await c.end()

console.log('══ Tabel FORCE ber-company_id wajib berpagar tenant ══════════')
console.log('  tabel diperiksa :', diperiksa)
console.log('  tanpa pagar     :', telanjang.length)

if (diperiksa === 0) {
  console.error('\n❌ NOL tabel diperiksa — kueri meleset, bukan basis yang bersih.')
  process.exit(1)
}

if (telanjang.length > 0) {
  console.error(`\n❌ ${telanjang.length} tabel di-FORCE tanpa pagar tenant RESTRICTIVE:`)
  for (const t of telanjang) console.error('     ·', t.relname)
  console.error(`
   Tabel ini bergantung sepenuhnya pada kedisiplinan tiap policy
   permissive-nya. Satu policy yang memeriksa izin saja — tanpa
   \`company_id\` — sudah cukup membocorkan SELURUH tabel ke tenant lain,
   karena PERMISSIVE digabung dengan OR.

   Perbaikan — pasang lapis yang sama dengan 244 tabel lain:

     CREATE POLICY tenant_isolation ON public.<tabel> AS RESTRICTIVE FOR ALL
       USING (company_id = (SELECT auth_company_id()));

   Periksa dulu \`company_id\` NULL: baris NULL akan hilang dari
   pandangan semua orang, tanpa galat.`)
  process.exit(1)
}

console.log('\n✅ Nol tabel telanjang.')
