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
import { readFileSync } from 'fs'

const url = process.env.DIRECT_URL || process.env.DATABASE_URL
if (!url) {
  console.error('❌ DIRECT_URL/DATABASE_URL kosong — penjaga tak bisa mengukur apa pun.')
  console.error('   Nol temuan tanpa koneksi BUKAN bukti tak ada pelanggaran.')
  process.exit(1)
}

/*
  Kategori C dibaca dari peta tenancy — sumber yang SAMA dengan `request.db`,
  supaya daftar ini tak bisa menyimpang diam-diam dari yang dipakai kode.

  Dibaca sebagai TEKS, bukan di-`import`: petanya berkas `.ts`, dan penjaga ini
  berjalan di node polos tanpa loader TypeScript. `import()` padanya gagal
  ERR_MODULE_NOT_FOUND — dan penjaga yang mati saat start tak menjaga apa pun.
*/
const petaSrc = readFileSync(
  new URL('../src/utils/tenant-map.generated.ts', import.meta.url), 'utf8')
const TABEL_C = [...petaSrc.matchAll(/'([a-z0-9_]+)':\s*\{[^}]*kategori:\s*'C'[^}]*\}/g)]
  .filter((m) => !/view:\s*true/.test(m[0]))
  .map((m) => m[1])
if (TABEL_C.length === 0) {
  console.error('❌ NOL tabel kategori C terbaca dari peta — pembacaan meleset, bukan basis yang bersih.')
  console.error('   Penjaga yang tak membaca apa-apa akan selalu hijau.')
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

const { rows: buntu } = await c.query(`
  SELECT cl.relname
    FROM pg_class cl
   WHERE cl.relnamespace = 'public'::regnamespace
     AND cl.relkind = 'r'
     AND cl.relforcerowsecurity
     AND NOT EXISTS (SELECT 1 FROM pg_policies p
                      WHERE p.schemaname = 'public' AND p.tablename = cl.relname
                        AND p.permissive = 'PERMISSIVE')
   ORDER BY cl.relname`)

/*
  Pemeriksaan KETIGA — tabel kategori C, titik buta dua pemeriksaan di atas.

  Keduanya menyaring `column_name = 'company_id'`, jadi tabel yang mewarisi
  tenancy lewat induknya tak pernah diperiksa. `takeoff_dimensi` duduk di titik
  buta itu dengan DUA policy izin dan NOL pagar tenant: pemegang
  `cecep:takeoff:view` membaca dimensi take-off — panjang, lebar, volume tiap
  elemen — milik SELURUH tenant.

  Justru di tabel kategori C pagar paling mudah terlupa: tak ada kolom
  `company_id` yang mengingatkan penulis migrasi bahwa baris ini milik
  seseorang.

  Yang dijaga: tiap tabel ber-RLS yang PETA_TENANCY nyatakan berkategori C
  wajib punya policy RESTRICTIVE. Bentuk pagarnya tak diperiksa di sini —
  rantai induknya berbeda-beda — hanya keberadaannya.
*/
const { rows: kategoriC } = await c.query(`
  SELECT cl.relname
    FROM pg_class cl
   WHERE cl.relnamespace = 'public'::regnamespace
     AND cl.relkind = 'r'
     AND cl.relrowsecurity
     AND cl.relname = ANY($1::text[])
     AND NOT EXISTS (SELECT 1 FROM pg_policies p
                      WHERE p.schemaname = 'public' AND p.tablename = cl.relname
                        AND p.permissive = 'RESTRICTIVE')
   ORDER BY cl.relname`, [TABEL_C])

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

/*
  Pemeriksaan KEDUA — arah sebaliknya, dan yang ini lahir dari cacat nyata.

  Migrasi 511 memasang pagar RESTRICTIVE pada dua tabel yang policy
  PERMISSIVE-nya bernama sama (`tenant_isolation`, dibuat tanpa
  `AS RESTRICTIVE` di migrasi 414 dan 442). `DROP … IF EXISTS` lalu
  membuang satu-satunya pemberi akses yang ada.

  Hasilnya: `penawaran` dan `pengingat_asisten` tak terbaca SIAPA PUN —
  himpunan permissive yang kosong bernilai FALSE. Pemeriksaan pertama di
  atas menjawab "YA, berpagar" justru KARENA kerusakannya.

  Penjaga yang hanya bertanya "apakah terkunci?" akan menyetujui tabel yang
  terkunci untuk semua orang. Ia harus juga bertanya "apakah masih ada yang
  bisa membacanya?"
*/
if (buntu.length > 0) {
  console.error(`\n❌ ${buntu.length} tabel di-FORCE TANPA satu pun policy PERMISSIVE:`)
  for (const t of buntu) console.error('     ·', t.relname)
  console.error(`
   Tabel ini tak terbaca siapa pun — himpunan permissive kosong bernilai
   FALSE. Diamnya BUKAN galat: halaman kosong tanpa pesan, kegagalan yang
   paling lama dilacak di repo ini (cacat migrasi 149, terulang di 511).

   Perbaikan — pasang pemberi akses, JANGAN lepas pagarnya:

     CREATE POLICY <tabel>_akses ON public.<tabel>
       FOR ALL USING (true) WITH CHECK (true);

   Isolasi tenant tetap dijamin lapis RESTRICTIVE yang digabung AND.`)
  process.exit(1)
}

console.log('  tanpa PERMISSIVE:', buntu.length)
console.log('  kategori C tanpa pagar:', kategoriC.length, `(dari ${TABEL_C.length} tabel C)`)

if (kategoriC.length > 0) {
  console.error(`\n❌ ${kategoriC.length} tabel kategori C tanpa pagar RESTRICTIVE:`)
  for (const t of kategoriC) console.error('     ·', t.relname)
  console.error(`
   Tabel kategori C mewarisi tenancy lewat induknya dan TAK punya kolom
   \`company_id\` sendiri — tak ada yang mengingatkan bahwa barisnya milik
   seseorang. Tanpa pagar, satu policy izin sudah cukup membocorkan seluruh
   tabel ke tenant lain.

   Perbaikan — telusuri induk sampai ketemu company (pola migrasi 515):

     CREATE POLICY tenant_isolation ON public.<tabel> AS RESTRICTIVE FOR ALL
       USING (EXISTS (SELECT 1 FROM <induk> i
                       WHERE i.id = <tabel>.<fk>
                         AND i.company_id = (SELECT auth_company_id())));`)
  process.exit(1)
}
console.log('\n✅ Nol tabel telanjang, nol tabel buntu.')
