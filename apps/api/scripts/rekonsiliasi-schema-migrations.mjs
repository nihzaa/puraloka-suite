#!/usr/bin/env node
// ============================================================
// REKONSILIASI schema_migrations — menyelaraskan BUKU dengan KENYATAAN.
//
// Default HANYA MEMBACA. Menulis hanya dengan `--tulis` yang eksplisit.
//
// ── Kenapa ada
//
// `supabase_migrations.schema_migrations` adalah buku besar migrasi: ia yang
// menentukan apa yang dianggap "sudah jalan". Di dev, buku itu MELESET DUA ARAH
// (diverifikasi 2026-07-31):
//
//   • 20 migrasi SUDAH di-apply tapi TIDAK TERCATAT — termasuk seluruh seri
//     multi-tenant 126–137 yang jelas hidup (tabel `companies`, `company_members`,
//     `rap_budget`, `project_price_override` semuanya ADA di `pg_class`).
//     Sebabnya: sebagian migrasi dijalankan ad-hoc lewat skrip sekali-pakai
//     (`node apply145.mjs` dan sejenisnya) yang menjalankan DDL-nya saja tanpa
//     menuliskan barisnya ke buku.
//
//   • 5 migrasi TERCATAT tapi objeknya tak pernah terbentuk (043–047) —
//     forward-draft yang memang sengaja belum di-apply.
//
// ── Kenapa ini berbahaya, bukan sekadar rapi-rapian
//
// `ci-project-setup.mjs` memutuskan "apa yang perlu dijalankan" MURNI dari buku
// ini (`SELECT 1 FROM schema_migrations WHERE version=$1`). Kalau alat itu
// diarahkan ke dev, ia akan MENJALANKAN ULANG 20 migrasi yang sudah jalan.
// Sebagian di antaranya menulis ulang policy RLS (131–134) dan melakukan
// backfill (127) — bukan sesuatu yang aman diulang tanpa dipikir.
//
// Bahaya keduanya lebih halus: buku ini juga yang dibaca manusia untuk menjawab
// "apakah migrasi X sudah jalan di produksi nanti?". Buku yang salah membuat
// jawabannya salah, dan tak ada gejala apa pun sampai seseorang bertindak
// berdasarkan jawaban itu.
//
// ── Kenapa TIDAK sekadar `INSERT` semua yang hilang
//
// Karena itu memindahkan masalah, bukan menyelesaikannya: kalau ternyata ada
// migrasi yang memang BELUM jalan, mencatatnya sebagai "sudah" membuatnya tak
// akan pernah dijalankan — persis kelas cacat 043–047, tapi dibuat sengaja.
//
// Maka tiap migrasi diverifikasi dulu ke `pg_class`/`pg_proc`: objek yang ia
// janjikan BENAR-BENAR ADA. Yang tak terbukti tidak dicatat, dan dilaporkan
// terpisah untuk ditinjau manusia.
//
// Jalankan:
//   node apps/api/scripts/rekonsiliasi-schema-migrations.mjs           (laporan saja)
//   node apps/api/scripts/rekonsiliasi-schema-migrations.mjs --tulis   (catat yang TERBUKTI)
// ============================================================
import 'dotenv/config'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'
import pg from 'pg'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MIGRASI = resolve(__dirname, '..', '..', '..', 'db', 'migrations')
const TULIS = process.argv.includes('--tulis')

/** Objek yang dijanjikan sebuah migrasi — dipakai membuktikan ia benar jalan. */
function objekDijanjikan(sql) {
  const bersih = sql.split('\n').filter((b) => !b.trim().startsWith('--')).join('\n')
  const tabel = new Set()
  const fungsi = new Set()
  const kolom = []
  const indeks = new Set()
  const constraint = new Set()
  for (const m of bersih.matchAll(
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi)) {
    tabel.add(m[1].toLowerCase())
  }
  for (const m of bersih.matchAll(
    /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi)) {
    fungsi.add(m[1].toLowerCase())
  }
  for (const m of bersih.matchAll(
    /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?[\s\S]{0,120}?ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-z_][a-z0-9_]*)"?/gi)) {
    kolom.push([m[1].toLowerCase(), m[2].toLowerCase()])
  }
  // Index & constraint ikut dihitung sebagai bukti. Tanpa keduanya, migrasi
  // yang HANYA membuat index (mis. 121 — dua unique index penjaga 3-way match)
  // atau HANYA mengganti constraint (mis. 145) masuk kategori "tak bisa
  // dibuktikan" dan harus diperiksa tangan satu per satu — padahal buktinya
  // ada dan mudah dibaca dari katalog.
  for (const m of bersih.matchAll(
    /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?"?([a-z_][a-z0-9_]*)"?/gi)) {
    indeks.add(m[1].toLowerCase())
  }
  for (const m of bersih.matchAll(
    /ADD\s+CONSTRAINT\s+"?([a-z_][a-z0-9_]*)"?/gi)) {
    constraint.add(m[1].toLowerCase())
  }
  // Constraint yang di-DROP di migrasi yang sama (pola drop-lalu-buat-ulang,
  // mis. 145) tak boleh dijadikan bukti negatif — ia dibuat ulang di bawahnya.
  for (const m of bersih.matchAll(
    /DROP\s+CONSTRAINT\s+(?:IF\s+EXISTS\s+)?"?([a-z_][a-z0-9_]*)"?/gi)) {
    if (!bersih.match(new RegExp(`ADD\\s+CONSTRAINT\\s+"?${m[1]}"?`, 'i'))) {
      constraint.delete(m[1].toLowerCase())
    }
  }
  // Tabel yang di-DROP di migrasi yang sama tak boleh dijadikan bukti.
  for (const m of bersih.matchAll(
    /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi)) {
    tabel.delete(m[1].toLowerCase())
  }
  return { tabel: [...tabel], fungsi: [...fungsi], kolom, indeks: [...indeks], constraint: [...constraint] }
}

const url = process.env.DIRECT_URL || process.env.DATABASE_URL
if (!url) { console.error('FATAL: DIRECT_URL/DATABASE_URL kosong'); process.exit(1) }

const c = new pg.Client({ connectionString: url })
await c.connect()

const adaTabel = async (t) =>
  (await c.query(`SELECT to_regclass($1) x`, ['public.' + t])).rows[0].x !== null
const adaFungsi = async (f) =>
  (await c.query(`SELECT 1 FROM pg_proc WHERE proname=$1 LIMIT 1`, [f])).rowCount > 0
const adaIndeks = async (i) =>
  (await c.query(`SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname=$1`, [i])).rowCount > 0
const adaConstraint = async (n) =>
  (await c.query(`SELECT 1 FROM pg_constraint WHERE conname=$1 LIMIT 1`, [n])).rowCount > 0
const adaKolom = async (t, k) =>
  (await c.query(
    `SELECT 1 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=$1 AND a.attname=$2 AND NOT a.attisdropped`,
    [t, k])).rowCount > 0

try {
  const { rows } = await c.query(`SELECT version FROM supabase_migrations.schema_migrations`)
  const tercatat = new Set(rows.map((r) => String(r.version)))
  const berkas = readdirSync(MIGRASI).filter((f) => /^\d+_.*\.sql$/.test(f)).sort()

  const terbukti = []      // jalan, tapi tak tercatat → aman dicatat
  const takTerbukti = []   // tak tercatat DAN objeknya tak ada → mungkin memang belum jalan
  const tanpaBukti = []    // tak tercatat, tapi migrasinya tak membuat objek yang bisa dicek

  for (const f of berkas) {
    const versi = f.match(/^(\d+)_/)[1]
    if (tercatat.has(versi)) continue

    const { tabel, fungsi, kolom, indeks, constraint } = objekDijanjikan(readFileSync(join(MIGRASI, f), 'utf8'))
    if (!tabel.length && !fungsi.length && !kolom.length && !indeks.length && !constraint.length) { tanpaBukti.push(f); continue }

    // SEMUA objek harus ada. Sebagian-ada = migrasi setengah jalan, dan itu
    // justru kondisi paling perlu dilihat manusia — bukan dicatat sebagai beres.
    let lengkap = true
    const kurang = []
    for (const t of tabel) if (!(await adaTabel(t))) { lengkap = false; kurang.push(`tabel ${t}`) }
    for (const fn of fungsi) if (!(await adaFungsi(fn))) { lengkap = false; kurang.push(`fungsi ${fn}()`) }
    for (const [t, k] of kolom) {
      if (!(await adaTabel(t))) continue          // tabelnya milik migrasi lain
      if (!(await adaKolom(t, k))) { lengkap = false; kurang.push(`kolom ${t}.${k}`) }
    }
    for (const i of indeks) if (!(await adaIndeks(i))) { lengkap = false; kurang.push(`index ${i}`) }
    for (const n of constraint) if (!(await adaConstraint(n))) { lengkap = false; kurang.push(`constraint ${n}`) }
    if (lengkap) terbukti.push(f)
    else takTerbukti.push({ f, kurang })
  }

  const garis = (t) => console.log(`\n${'═'.repeat(70)}\n${t}\n${'═'.repeat(70)}`)

  garis(`RINGKASAN — ${berkas.length} berkas migrasi · ${tercatat.size} tercatat di buku`)
  console.log(`  ✅ terbukti jalan tapi TAK tercatat : ${terbukti.length}`)
  console.log(`  ⚠️  tak tercatat & objek TIDAK lengkap: ${takTerbukti.length}`)
  console.log(`  ℹ️  tak tercatat, tak bisa dibuktikan : ${tanpaBukti.length}`)

  if (terbukti.length) {
    garis('TERBUKTI JALAN — objeknya ADA di database, hanya bukunya yang belum dicatat')
    terbukti.forEach((f) => console.log(`   ${f}`))
  }
  if (takTerbukti.length) {
    garis('TIDAK LENGKAP — JANGAN dicatat; tinjau manual')
    console.log('  Bisa berarti: (a) memang belum jalan, atau (b) jalan sebagian.')
    console.log('  Keduanya butuh mata manusia — mencatatnya sebagai "sudah" akan')
    console.log('  membuatnya tak pernah dijalankan.\n')
    takTerbukti.forEach(({ f, kurang }) =>
      console.log(`   ${f}\n      kurang: ${kurang.slice(0, 4).join(', ')}${kurang.length > 4 ? ` … +${kurang.length - 4}` : ''}`))
  }
  if (tanpaBukti.length) {
    garis('TAK BISA DIBUKTIKAN OTOMATIS — hanya data/policy/index, tak bikin objek baru')
    tanpaBukti.forEach((f) => console.log(`   ${f}`))
  }

  if (TULIS) {
    if (!terbukti.length) {
      console.log('\nTak ada yang perlu dicatat.')
    } else {
      // Ditandai `[REKONSILIASI]` supaya baris hasil penyelarasan ini bisa
      // dibedakan dari baris yang ditulis saat migrasinya benar-benar dijalankan.
      // Tanpa penanda, jejak "kenapa baris ini ada" hilang selamanya.
      for (const f of terbukti) {
        const versi = f.match(/^(\d+)_/)[1]
        await c.query(
          `INSERT INTO supabase_migrations.schema_migrations (version, name)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [versi, `${f} [REKONSILIASI 2026-07-31: terbukti dari pg_class]`])
      }
      console.log(`\n✅ ${terbukti.length} baris dicatat (ditandai [REKONSILIASI]).`)
    }
  } else {
    console.log(`\n${'─'.repeat(70)}`)
    console.log('MODE LAPORAN — nol perubahan. Jalankan ulang dengan `--tulis` untuk')
    console.log('mencatat yang TERBUKTI saja. Yang "tidak lengkap" tak akan disentuh.')
  }
} finally {
  await c.end()
}
