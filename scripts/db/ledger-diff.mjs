#!/usr/bin/env node
// ============================================================================
// LEDGER-DIFF — membandingkan BUKU migrasi dengan ARTEFAK FISIK di schema.
// ============================================================================
//
// ── Kenapa berkas ini ada (cacat C-3)
//
// Audit 2026-08-02 merekomendasikan menjalankan `rekonsiliasi-schema-migrations.mjs
// --tulis` untuk menyelaraskan buku migrasi. Rekomendasi itu BERBAHAYA dan ditarik.
//
// Alat lama menurunkan "objek yang dijanjikan" sebuah migrasi lewat REGEX atas
// teks SQL-nya. Regex itu buta terhadap:
//
//   • DDL di dalam blok `DO $$ ... $$` / `EXECUTE format(...)` — tak terdeteksi
//     sama sekali, sehingga migrasi dianggap "tak bisa dibuktikan" atau, lebih
//     buruk, "lengkap" karena daftar janjinya kosong.
//   • `CREATE TABLE x` di migrasi A yang kemudian di-`DROP` migrasi B — objeknya
//     tak ada sekarang, padahal migrasi A memang pernah jalan.
//   • Nama objek yang dibentuk dinamis.
//
// Konsekuensinya fatal justru karena arahnya: buku migrasi menentukan apa yang
// DI-REPLAY oleh `ci-project-setup.mjs`. Satu entri palsu "sudah jalan" membuat
// migrasi itu **dilewati senyap selamanya** di setiap lingkungan baru — termasuk
// produksi. Kesalahan ini tidak menimbulkan gejala sampai seseorang bertanya
// "kenapa tabel ini tidak ada di produksi?".
//
// ── Aturan mengikat alat ini
//
//   1. Alat ini TIDAK PERNAH MENULIS. Tidak ada flag `--tulis`. Menulis ke buku
//      migrasi adalah Gerbang Keras G-2 dan wajib lewat RATIFIKASI.
//   2. Verdict `TERBUKTI-FISIK` hanya diberikan bila artefak yang dijanjikan
//      BENAR-BENAR ADA di katalog — dan daftar janji diambil dengan parser yang
//      sadar blok `DO`/`EXECUTE`, bukan regex polos.
//   3. Migrasi yang janjinya tak bisa diurai secara andal TIDAK mendapat verdict
//      hijau. Ia mendapat `PERLU-MATA-MANUSIA`. Ragu = tidak hijau, selalu.
//
// Pemakaian:  node scripts/db/ledger-diff.mjs [--json]
// Keluaran :  docs/execution/LEDGER-DIFF.md (ditulis manual dari output ini)
// ============================================================================

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { MIGRATIONS_DIR, SEEDS_DIR, pastikanCwdRootRepo, buatClient } from './_koneksi.mjs'

pastikanCwdRootRepo('scripts/db/ledger-diff.mjs')

const client = buatClient()
const q = async (sql, p = []) => (await client.query(sql, p)).rows

// ── Parser janji yang SADAR blok dinamis ─────────────────────────────────────
//
// Perbedaan pokok dari alat lama: kalau sebuah migrasi mengandung DDL di dalam
// `DO $$`/`EXECUTE`, kita TIDAK berpura-pura tahu apa yang dijanjikannya.
// Migrasi itu ditandai `dinamis` dan tak pernah mendapat verdict hijau otomatis.
function uraiJanji(sql) {
  const tanpaKomentar = sql
    .split('\n')
    .filter((b) => !b.trim().startsWith('--'))
    .join('\n')

  const adaBlokDinamis = /\bDO\s+\$\$|\bEXECUTE\s+(format|'|")/i.test(tanpaKomentar)

  const tabel = new Set()
  const fungsi = new Set()
  const indeks = new Set()
  const policy = new Set()
  const kolom = []

  for (const m of tanpaKomentar.matchAll(
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi)) {
    tabel.add(m[1].toLowerCase())
  }
  for (const m of tanpaKomentar.matchAll(
    /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi)) {
    fungsi.add(m[1].toLowerCase())
  }
  for (const m of tanpaKomentar.matchAll(
    /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?"?([a-z_][a-z0-9_]*)"?/gi)) {
    indeks.add(m[1].toLowerCase())
  }
  for (const m of tanpaKomentar.matchAll(
    /CREATE\s+POLICY\s+"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s+ON\s+(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi)) {
    policy.add(`${m[2].toLowerCase()}::${m[1]}`)
  }
  for (const m of tanpaKomentar.matchAll(
    /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?[\s\S]{0,160}?ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-z_][a-z0-9_]*)"?/gi)) {
    kolom.push([m[1].toLowerCase(), m[2].toLowerCase()])
  }

  // Objek yang di-DROP di migrasi yang SAMA tak boleh jadi janji.
  for (const m of tanpaKomentar.matchAll(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi)) {
    tabel.delete(m[1].toLowerCase())
  }

  return {
    tabel: [...tabel].sort(),
    fungsi: [...fungsi].sort(),
    indeks: [...indeks].sort(),
    policy: [...policy].sort(),
    kolom,
    adaBlokDinamis,
  }
}

const adaTabel = async (t) => (await q('SELECT to_regclass($1) x', ['public.' + t]))[0].x !== null
const adaFungsi = async (f) => (await q('SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=$2 AND p.proname=$1 LIMIT 1', [f, 'public'])).length > 0
const adaIndeks = async (i) => (await q("SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname=$1", [i])).length > 0
const adaPolicy = async (tab, pol) => (await q("SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=$1 AND policyname=$2", [tab, pol])).length > 0
const adaKolom = async (t, k) => (await q(
  `SELECT 1 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
     JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname=$1 AND a.attname=$2 AND NOT a.attisdropped`,
  [t, k])).length > 0

async function main() {
  await client.connect()

  let tercatat = []
  try {
    tercatat = await q('SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version')
  } catch { /* tabel buku belum ada */ }
  const setTercatat = new Set(tercatat.map((r) => String(r.version)))

  const berkas = readdirSync(MIGRATIONS_DIR).filter((f) => /^\d+_.*\.sql$/.test(f)).sort()
  const seeds = existsSync(SEEDS_DIR)
    ? readdirSync(SEEDS_DIR).filter((f) => f.endsWith('.sql')).map((f) => f.replace(/\.sql$/, ''))
    : []

  const hasil = []
  for (const f of berkas) {
    const versi = f.match(/^(\d+)_/)[1]
    const diBuku = setTercatat.has(versi)
    const janji = uraiJanji(readFileSync(join(MIGRATIONS_DIR, f), 'utf8'))

    const ada = []; const hilang = []
    for (const t of janji.tabel) ((await adaTabel(t)) ? ada : hilang).push(`tabel ${t}`)
    for (const fn of janji.fungsi) ((await adaFungsi(fn)) ? ada : hilang).push(`fungsi ${fn}()`)
    for (const i of janji.indeks) ((await adaIndeks(i)) ? ada : hilang).push(`index ${i}`)
    for (const p of janji.policy) {
      const [tab, pol] = p.split('::')
      ;((await adaPolicy(tab, pol)) ? ada : hilang).push(`policy ${p}`)
    }
    for (const [t, k] of janji.kolom) {
      if (!(await adaTabel(t))) { hilang.push(`kolom ${t}.${k} (tabel tak ada)`); continue }
      ;((await adaKolom(t, k)) ? ada : hilang).push(`kolom ${t}.${k}`)
    }

    const jmlJanji = ada.length + hilang.length
    let verdict
    if (diBuku) {
      verdict = hilang.length === 0 ? 'TERCATAT-KONSISTEN' : 'TERCATAT-TAPI-ARTEFAK-HILANG'
    } else if (janji.adaBlokDinamis) {
      // Sadar-diri: kalau ada DDL dinamis, parser tidak berhak yakin.
      verdict = 'PERLU-MATA-MANUSIA (DDL dinamis: DO/EXECUTE)'
    } else if (jmlJanji === 0) {
      verdict = 'PERLU-MATA-MANUSIA (tak menjanjikan objek yang bisa dicek)'
    } else if (hilang.length === 0) {
      verdict = 'TERBUKTI-FISIK'
    } else if (ada.length === 0) {
      verdict = 'BELUM-JALAN'
    } else {
      verdict = 'SETENGAH-JALAN'
    }

    hasil.push({ versi, berkas: f, di_buku: diBuku, verdict, artefak_ada: ada, artefak_hilang: hilang, dinamis: janji.adaBlokDinamis })
  }

  const catatanTanpaBerkas = tercatat
    .filter((r) => !new Set(berkas.map((f) => f.match(/^(\d+)_/)[1])).has(String(r.version)))
    .map((r) => ({ versi: String(r.version), nama: r.name, cocok_seed: seeds.includes(r.name ?? '') }))

  const ringkas = {}
  for (const h of hasil) {
    const k = h.verdict.split(' ')[0]
    ringkas[k] = (ringkas[k] ?? 0) + 1
  }

  console.error('══ RINGKASAN LEDGER-DIFF ' + '═'.repeat(44))
  console.error(`  berkas migrasi : ${berkas.length}`)
  console.error(`  tercatat buku  : ${tercatat.length}`)
  for (const [k, v] of Object.entries(ringkas).sort()) console.error(`  ${k.padEnd(30)} ${v}`)
  console.error('═'.repeat(69))
  console.error('\n── Yang TIDAK di buku ' + '─'.repeat(46))
  for (const h of hasil.filter((x) => !x.di_buku)) {
    console.error(`  ${h.versi}  ${h.verdict}`)
    if (h.artefak_hilang.length) console.error(`        hilang: ${h.artefak_hilang.slice(0, 4).join(', ')}`)
  }
  const inkonsisten = hasil.filter((h) => h.verdict === 'TERCATAT-TAPI-ARTEFAK-HILANG')
  if (inkonsisten.length) {
    console.error('\n── ⚠️  TERCATAT tapi artefaknya HILANG ' + '─'.repeat(30))
    for (const h of inkonsisten) {
      console.error(`  ${h.versi} ${h.berkas}`)
      console.error(`      ${h.artefak_hilang.slice(0, 6).join(', ')}`)
    }
  }

  process.stdout.write(JSON.stringify({ ringkas, hasil, catatanTanpaBerkas }, null, 2) + '\n')
  await client.end()
}

main().catch(async (e) => {
  console.error('FATAL:', e.message)
  try { await client.end() } catch { /* belum konek */ }
  process.exit(1)
})
