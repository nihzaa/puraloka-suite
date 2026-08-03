#!/usr/bin/env node
// ============================================================================
// ALAT INTROSPEKSI DB KANONIK — SATU-SATUNYA sumber angka schema.
// ============================================================================
//
// ── Kenapa berkas ini ada
//
// Audit 2026-08-02 menghasilkan angka DB yang TIDAK STABIL: kesimpulan soal GL
// dibalik empat kali, dua alat berbeda melaporkan hasil berbeda atas database
// yang sama, dan `process.cwd()` melayang ke `apps/api` tanpa disadari sehingga
// `require('pg')` dan `dotenv.config()` membaca sumber yang berbeda antar-run.
//
// Akar masalahnya BUKAN kecerobohan sesaat, melainkan tiga hal struktural:
//
//   1. Dua metode koneksi dipakai bergantian (driver `pg` vs Supabase client),
//      masing-masing dengan search_path dan hak akses berbeda.
//   2. Path relatif → hasil bergantung pada cwd saat perintah dijalankan.
//   3. Tidak ada cara memverifikasi bahwa dua run membaca database yang SAMA.
//
// Berkas ini menutup ketiganya, dan menjadi aturan mengikat: setiap angka schema
// yang masuk dokumen HARUS berasal dari sini.
//
// ── Keputusan: driver `pg` langsung, BUKAN Supabase client
//
// Alasan (dicatat supaya tidak diperdebatkan ulang tiap sesi):
//
//   • Supabase client (PostgREST) hanya melihat apa yang di-expose PostgREST,
//     tunduk pada RLS bila memakai anon/authenticated key, dan TIDAK bisa
//     membaca `pg_catalog` — padahal `pg_class.relrowsecurity`, `pg_policies`,
//     `pg_trigger`, dan `pg_constraint` justru inti pekerjaan alat ini.
//   • Driver `pg` berbicara langsung ke PostgreSQL, melihat katalog apa adanya,
//     dan identitas koneksinya bisa dibuktikan (`current_user`, `inet_server_addr`).
//   • Introspeksi adalah operasi baca-katalog, bukan operasi aplikasi. Memakai
//     lapis aplikasi untuk memeriksa lapis penyimpanan adalah lapisan salah.
//
// Konsekuensi yang diterima: alat ini butuh DIRECT_URL/DATABASE_URL, tidak bisa
// jalan hanya dengan anon key. Itu benar — introspeksi memang bukan operasi publik.
//
// ── Jaminan yang diberikan berkas ini
//
//   • IDENTITAS: tiap run mencetak host, database, user, schema, dan
//     `schema_hash` — hash stabil atas daftar (tabel, kolom, tipe). Dua run yang
//     menghasilkan hash berbeda berarti database berubah ATAU koneksinya beda;
//     keduanya wajib diketahui manusia, bukan lewat begitu saja.
//   • DETERMINISME: seluruh query memakai ORDER BY eksplisit. Output JSON
//     terurut. Run berulang atas DB yang sama = byte-identik.
//   • ANTI-CWD-DRIFT: menolak jalan bila cwd bukan root repo, dan seluruh path
//     diselesaikan dari lokasi berkas ini (bukan dari cwd).
//   • READ-ONLY: hanya SELECT. Tidak ada jalur kode yang menulis.
//
// ── Pemakaian
//
//   node scripts/db/introspect.mjs <subperintah> [--json] [--env=DIRECT_URL]
//
//   tables · columns · rls · policies · indexes · triggers · enums · fks
//   money-types · tenancy-coverage · migration-ledger · orphans
//   nullable-suspects · identity · all
//
// stdout = JSON (mesin). stderr = tabel terbaca (manusia). Jadi `| jq` aman.
// ============================================================================

import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
// Root repo diturunkan dari lokasi BERKAS INI, bukan dari cwd. Ini yang membuat
// alat tetap benar walau dipanggil dari apps/api, dari docs/, atau dari mana pun.
const REPO_ROOT = resolve(__dirname, '..', '..')
const MIGRATIONS_DIR = join(REPO_ROOT, 'db', 'migrations')
const SEEDS_DIR = join(REPO_ROOT, 'db', 'seeds')

// `pg` terpasang di apps/api, bukan di root. Resolusinya DIANCHOR ke REPO_ROOT
// (yang diturunkan dari lokasi berkas ini), bukan ke cwd — inilah bagian kedua
// dari penjagaan anti-cwd-drift. Tanpa ini, `node scripts/db/introspect.mjs`
// berhasil dari root tapi gagal/berbeda dari direktori lain: persis cacat C-1.
const requireDari = createRequire(join(REPO_ROOT, 'apps', 'api', 'package.json'))
const pg = requireDari('pg')

// ── Penjaga cwd ──────────────────────────────────────────────────────────────
// Kenapa keras: seluruh cacat C-1 berakar pada cwd yang melayang. Menolak jalan
// lebih baik daripada menghasilkan angka yang benar-secara-kebetulan.
function pastikanCwdRootRepo() {
  const cwd = process.cwd()
  if (resolve(cwd) !== REPO_ROOT) {
    console.error(
      `FATAL: alat ini wajib dijalankan dari root repo.\n` +
      `  cwd sekarang : ${cwd}\n` +
      `  root repo    : ${REPO_ROOT}\n` +
      `Jalankan ulang: cd "${REPO_ROOT}" && node scripts/db/introspect.mjs ${process.argv.slice(2).join(' ')}`,
    )
    process.exit(2)
  }
}

// ── Env ──────────────────────────────────────────────────────────────────────
// Dibaca MANUAL dari path absolut, bukan lewat dotenv.config() yang bergantung cwd.
function bacaEnv() {
  const kandidat = [
    join(REPO_ROOT, 'apps', 'api', '.env'),
    join(REPO_ROOT, '.env'),
  ]
  const env = {}
  for (const p of kandidat) {
    if (!existsSync(p)) continue
    for (const baris of readFileSync(p, 'utf8').split('\n')) {
      const t = baris.trim()
      if (!t || t.startsWith('#')) continue
      const i = t.indexOf('=')
      if (i < 0) continue
      const k = t.slice(0, i).trim()
      let v = t.slice(i + 1).trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1)
      }
      if (!(k in env)) env[k] = v   // berkas pertama menang
    }
  }
  return env
}

const argv = process.argv.slice(2)
const sub = argv.find((a) => !a.startsWith('--')) ?? 'all'
const wantJson = argv.includes('--json')
const envPilihan = (argv.find((a) => a.startsWith('--env=')) ?? '').split('=')[1] || null

pastikanCwdRootRepo()

const ENV = bacaEnv()
const CONN =
  (envPilihan && ENV[envPilihan]) ||
  ENV.DIRECT_URL ||
  ENV.DATABASE_URL ||
  process.env.DIRECT_URL ||
  process.env.DATABASE_URL

if (!CONN) {
  console.error('FATAL: DIRECT_URL/DATABASE_URL tidak ditemukan di apps/api/.env maupun environment.')
  process.exit(2)
}

const client = new pg.Client({ connectionString: CONN, ssl: { rejectUnauthorized: false } })

const q = async (sql, params = []) => (await client.query(sql, params)).rows

// ── Identitas koneksi + schema hash ──────────────────────────────────────────
async function identity() {
  const [info] = await q(`
    SELECT current_database() AS db,
           current_user       AS usr,
           current_schema()   AS schema,
           version()          AS server
  `)
  // Hash atas (tabel, kolom, tipe) — stabil, terurut, tidak terpengaruh data.
  const sidik = await q(`
    SELECT table_name, column_name, data_type
      FROM information_schema.columns
     WHERE table_schema = 'public'
     ORDER BY table_name, column_name, data_type
  `)
  const schema_hash = createHash('sha256')
    .update(sidik.map((r) => `${r.table_name}.${r.column_name}:${r.data_type}`).join('\n'))
    .digest('hex')
    .slice(0, 16)

  const host = CONN.replace(/:\/\/[^@]*@/, '://***@').split('@')[1]?.split('/')[0] ?? '(tak terbaca)'
  return {
    host,
    database: info.db,
    user: info.usr,
    schema: info.schema,
    server: info.server.split(' ').slice(0, 2).join(' '),
    kolom_terhitung: sidik.length,
    schema_hash,
  }
}

// ── Subperintah ──────────────────────────────────────────────────────────────

const tables = () => q(`
  SELECT c.relname AS tabel,
         c.relrowsecurity AS rls_aktif,
         (SELECT count(*) FROM pg_policies p
           WHERE p.schemaname='public' AND p.tablename=c.relname)::int AS jml_policy
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname='public' AND c.relkind='r'
   ORDER BY c.relname
`)

const columns = () => q(`
  SELECT table_name AS tabel, column_name AS kolom, data_type AS tipe,
         is_nullable AS nullable, column_default AS bawaan
    FROM information_schema.columns
   WHERE table_schema='public'
   ORDER BY table_name, ordinal_position
`)

const rls = () => q(`
  SELECT c.relname AS tabel, c.relrowsecurity AS rls_aktif, c.relforcerowsecurity AS rls_dipaksa
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relkind='r'
   ORDER BY c.relrowsecurity, c.relname
`)

const policies = () => q(`
  SELECT tablename AS tabel, policyname AS policy, cmd AS perintah,
         permissive AS permisif, roles::text AS peran
    FROM pg_policies WHERE schemaname='public'
   ORDER BY tablename, policyname
`)

const indexes = () => q(`
  SELECT tablename AS tabel, indexname AS indeks
    FROM pg_indexes WHERE schemaname='public'
   ORDER BY tablename, indexname
`)

// CATATAN penting (koreksi audit): angka trigger sangat bergantung pada apakah
// schema disaring. `SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal`
// tanpa filter schema mencakup `auth`, `storage`, `realtime` milik Supabase —
// itu sebabnya audit 2026-08-02 melaporkan 192, sedangkan trigger milik APLIKASI
// (schema `public`) berjumlah lain. Alat ini SELALU menyaring ke `public`; untuk
// melihat sebarannya lintas schema, pakai subperintah `triggers-all-schemas`.
const triggers = () => q(`
  SELECT c.relname AS tabel, t.tgname AS trigger,
         CASE WHEN t.tgenabled='D' THEN false ELSE true END AS aktif
    FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE NOT t.tgisinternal AND n.nspname='public'
   ORDER BY c.relname, t.tgname
`)

const triggersAllSchemas = () => q(`
  SELECT n.nspname AS schema, count(*)::int AS jml
    FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE NOT t.tgisinternal
   GROUP BY n.nspname ORDER BY jml DESC, n.nspname
`)

const enums = () => q(`
  SELECT t.typname AS enum, string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) AS nilai
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid=t.oid
    JOIN pg_namespace n ON n.oid=t.typnamespace
   WHERE n.nspname='public'
   GROUP BY t.typname ORDER BY t.typname
`)

const fks = () => q(`
  SELECT c.conname AS constraint_name,
         src.relname AS tabel, tgt.relname AS referensi,
         pg_get_constraintdef(c.oid) AS definisi
    FROM pg_constraint c
    JOIN pg_class src ON src.oid=c.conrelid
    JOIN pg_class tgt ON tgt.oid=c.confrelid
    JOIN pg_namespace n ON n.oid=src.relnamespace
   WHERE c.contype='f' AND n.nspname='public'
   ORDER BY src.relname, c.conname
`)

// Uang: yang berbahaya adalah float. numeric aman. Alat memisahkan keduanya
// supaya klaim "nol kolom float" bisa dibuktikan, bukan diasumsikan.
const moneyTypes = () => q(`
  SELECT table_name AS tabel, column_name AS kolom, data_type AS tipe,
         numeric_precision AS presisi, numeric_scale AS skala
    FROM information_schema.columns
   WHERE table_schema='public'
     AND (data_type IN ('double precision','real','money')
          OR column_name ~ '(amount|total|price|harga|nilai|biaya|cost|value|saldo|balance|upah|bayar|tarif)')
   ORDER BY
     CASE WHEN data_type IN ('double precision','real','money') THEN 0 ELSE 1 END,
     table_name, column_name
`)

const timestampTypes = () => q(`
  SELECT data_type AS tipe, count(*)::int AS jml
    FROM information_schema.columns
   WHERE table_schema='public' AND data_type LIKE 'timestamp%'
   GROUP BY data_type ORDER BY data_type
`)

// Cakupan tenancy: daftar LENGKAP yang punya dan yang tidak punya company_id.
// Audit lama hanya melaporkan angka 42/122 tanpa daftar — tidak bisa ditindaklanjuti.
async function tenancyCoverage() {
  const punya = await q(`
    SELECT DISTINCT table_name AS tabel FROM information_schema.columns
     WHERE table_schema='public' AND column_name='company_id' ORDER BY table_name
  `)
  const semua = await q(`
    SELECT c.relname AS tabel FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname
  `)
  const set = new Set(punya.map((r) => r.tabel))
  return {
    total_tabel: semua.length,
    punya_company_id: punya.map((r) => r.tabel),
    tanpa_company_id: semua.map((r) => r.tabel).filter((t) => !set.has(t)),
  }
}

// Buku migrasi: berkas vs catatan. TIDAK memberi verdict "sudah jalan" — itu
// pekerjaan ledger-diff yang wajib memeriksa artefak fisik (lihat C-3).
async function migrationLedger() {
  let tercatat = []
  try {
    tercatat = await q(`SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version`)
  } catch {
    tercatat = []
  }
  const berkas = existsSync(MIGRATIONS_DIR)
    ? readdirSync(MIGRATIONS_DIR).filter((f) => /^\d+_.*\.sql$/.test(f)).sort()
    : []
  const seeds = existsSync(SEEDS_DIR)
    ? readdirSync(SEEDS_DIR).filter((f) => f.endsWith('.sql')).map((f) => f.replace(/\.sql$/, ''))
    : []
  const versiBerkas = new Set(berkas.map((f) => f.match(/^(\d+)_/)[1]))
  const versiTercatat = new Set(tercatat.map((r) => String(r.version)))
  return {
    jml_berkas: berkas.length,
    jml_tercatat: tercatat.length,
    versi_tertinggi_berkas: berkas.length ? berkas[berkas.length - 1].match(/^(\d+)_/)[1] : null,
    versi_tertinggi_tercatat: tercatat.length ? String(tercatat[tercatat.length - 1].version) : null,
    berkas_tanpa_catatan: berkas.filter((f) => !versiTercatat.has(f.match(/^(\d+)_/)[1])),
    catatan_tanpa_berkas: tercatat
      .filter((r) => !versiBerkas.has(String(r.version)))
      .map((r) => ({ versi: String(r.version), nama: r.name, cocok_seed: seeds.includes(r.name ?? '') })),
  }
}

// Orphan: baris anak yang FK-nya menunjuk induk yang tak ada. Dijalankan lewat
// definisi FK nyata, bukan tebakan nama kolom.
async function orphans() {
  const daftar = await q(`
    SELECT c.conname, src.relname AS anak, tgt.relname AS induk,
           (SELECT a.attname FROM pg_attribute a
             WHERE a.attrelid=c.conrelid AND a.attnum=c.conkey[1]) AS kol_anak,
           (SELECT a.attname FROM pg_attribute a
             WHERE a.attrelid=c.confrelid AND a.attnum=c.confkey[1]) AS kol_induk
      FROM pg_constraint c
      JOIN pg_class src ON src.oid=c.conrelid
      JOIN pg_class tgt ON tgt.oid=c.confrelid
      JOIN pg_namespace n ON n.oid=src.relnamespace
     WHERE c.contype='f' AND n.nspname='public' AND array_length(c.conkey,1)=1
     ORDER BY src.relname, c.conname
  `)
  const hasil = []
  for (const d of daftar) {
    const sql = `SELECT count(*)::int AS n FROM public."${d.anak}" a
                  WHERE a."${d.kol_anak}" IS NOT NULL
                    AND NOT EXISTS (SELECT 1 FROM public."${d.induk}" p
                                     WHERE p."${d.kol_induk}" = a."${d.kol_anak}")`
    try {
      const [r] = await q(sql)
      if (r.n > 0) hasil.push({ ...d, yatim: r.n })
    } catch (e) {
      hasil.push({ ...d, yatim: null, error: e.message })
    }
  }
  return hasil
}

// Kolom nullable yang mencurigakan: yang namanya menyiratkan wajib.
const nullableSuspects = () => q(`
  SELECT table_name AS tabel, column_name AS kolom, data_type AS tipe
    FROM information_schema.columns
   WHERE table_schema='public' AND is_nullable='YES'
     AND (column_name IN ('company_id','project_id','created_at','id')
          OR column_name LIKE '%_id' AND column_name NOT LIKE '%parent%')
   ORDER BY table_name, column_name
`)

// ── Penyaji ──────────────────────────────────────────────────────────────────
function cetakTabel(judul, baris) {
  console.error(`\n── ${judul} (${Array.isArray(baris) ? baris.length : 1}) ${'─'.repeat(Math.max(0, 50 - judul.length))}`)
  if (!Array.isArray(baris)) { console.error(JSON.stringify(baris, null, 2)); return }
  if (!baris.length) { console.error('  (kosong)'); return }
  const kols = Object.keys(baris[0])
  const lebar = kols.map((k) => Math.max(k.length, ...baris.slice(0, 200).map((r) => String(r[k] ?? '').length)))
  console.error('  ' + kols.map((k, i) => k.padEnd(lebar[i])).join('  '))
  console.error('  ' + lebar.map((w) => '─'.repeat(w)).join('  '))
  for (const r of baris.slice(0, 200)) {
    console.error('  ' + kols.map((k, i) => String(r[k] ?? '').padEnd(lebar[i])).join('  '))
  }
  if (baris.length > 200) console.error(`  … ${baris.length - 200} baris lagi (pakai --json untuk semua)`)
}

const PERINTAH = {
  identity, tables, columns, rls, policies, indexes, triggers, enums, fks,
  'triggers-all-schemas': triggersAllSchemas,
  'money-types': moneyTypes,
  'timestamp-types': timestampTypes,
  'tenancy-coverage': tenancyCoverage,
  'migration-ledger': migrationLedger,
  orphans,
  'nullable-suspects': nullableSuspects,
}

async function main() {
  await client.connect()
  const id = await identity()

  // Identitas SELALU dicetak lebih dulu — inilah yang membuat dua run bisa
  // dibandingkan dan cacat C-1 tidak bisa terulang diam-diam.
  console.error('══ IDENTITAS KONEKSI ' + '═'.repeat(48))
  for (const [k, v] of Object.entries(id)) console.error(`  ${k.padEnd(18)} ${v}`)
  console.error('═'.repeat(69))

  let out
  if (sub === 'all') {
    out = { identity: id }
    for (const [nama, fn] of Object.entries(PERINTAH)) {
      if (nama === 'identity' || nama === 'orphans') continue  // orphans mahal; minta eksplisit
      out[nama] = await fn()
      cetakTabel(nama, out[nama])
    }
  } else if (PERINTAH[sub]) {
    out = { identity: id, [sub]: await PERINTAH[sub]() }
    cetakTabel(sub, out[sub])
  } else {
    console.error(`FATAL: subperintah tidak dikenal: ${sub}`)
    console.error(`Tersedia: ${Object.keys(PERINTAH).join(', ')}, all`)
    process.exit(2)
  }

  if (wantJson || sub !== 'all') process.stdout.write(JSON.stringify(out, null, 2) + '\n')
  await client.end()
}

main().catch(async (e) => {
  console.error('FATAL:', e.message)
  try { await client.end() } catch { /* koneksi mungkin belum terbuka */ }
  process.exit(1)
})
