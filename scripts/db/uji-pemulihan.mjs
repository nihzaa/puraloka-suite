#!/usr/bin/env node
// ============================================================================
// F1-4 — UJI PEMULIHAN SUNGGUHAN.
//
//   node scripts/db/uji-pemulihan.mjs --dari cadangan/puraloka-….dump
//
// ══════════════════════════════════════════════════════════════════════════
// APA YANG SEBENARNYA DIBUKTIKAN DI SINI
// ══════════════════════════════════════════════════════════════════════════
//
// "Backup berhasil dibuat" BUKAN jaminan apa pun. Berkas bisa terbentuk,
// berukuran wajar, dan tetap tak bisa dipulihkan. Satu-satunya bukti bahwa
// sebuah cadangan berguna adalah cadangan itu PERNAH DIPULIHKAN.
//
// Karena itu skrip ini tidak memeriksa berkasnya — ia MENJALANKANNYA, ke
// Postgres sungguhan di dalam kontainer sekali-pakai, lalu membandingkan
// hasilnya dengan sumber.
//
// ── Kenapa targetnya kontainer, bukan "database staging"
//
// Restore adalah operasi yang MENIMPA. Mengarahkannya ke basis data yang punya
// nama dan alamat berarti suatu hari nanti seseorang akan salah menyalin URL.
// Kontainer sekali-pakai tak punya nilai yang bisa hilang, dan mati sendiri
// setelah selesai — ia tak bisa menjadi target yang salah.
//
// SKRIP INI TIDAK PERNAH MENULIS KE DATABASE SUMBER. Sumber hanya di-SELECT
// untuk membandingkan jumlah baris.
//
// ── Yang dibandingkan, dan kenapa itu yang dipilih
//
//   1. Jumlah TABEL — struktur sampai.
//   2. Jumlah BARIS per tabel — isinya sampai, bukan cuma kerangkanya.
//      Inilah yang membedakan restore sungguhan dari "skema kosong berhasil".
//   3. Keberadaan RLS + POLICY — di sistem multi-tenant, memulihkan data TANPA
//      memulihkan RLS bukan pemulihan; itu KEBOCORAN. Tenant akan saling
//      melihat data, dan semua pemeriksaan jumlah baris di atas tetap hijau.
//      Ini pemeriksaan terpenting di berkas ini.
//
// Waktu setiap tahap dicatat — F1-4 mensyaratkan "waktu pemulihan tercatat",
// dan angka itu yang menentukan janji RTO yang jujur.
// ============================================================================

import { execFileSync, execSync } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { bacaEnv, buatClient, pastikanCwdRootRepo, REPO_ROOT, pg } from './_koneksi.mjs'

pastikanCwdRootRepo()

const argv = process.argv.slice(2)
const ambil = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d }

const DUMP = ambil('--dari', null)
if (!DUMP || !existsSync(resolve(REPO_ROOT, DUMP))) {
  console.error('❌ pakai: node scripts/db/uji-pemulihan.mjs --dari <berkas.dump>')
  process.exit(1)
}
const JALUR_DUMP = resolve(REPO_ROOT, DUMP)

const NAMA = 'puraloka-uji-pemulihan'
const PORT = ambil('--port', '55432')
const SANDI = 'uji-sekali-pakai'
const catatan = []
const jam = (label, ms) => {
  const d = (ms / 1000).toFixed(1)
  catatan.push([label, d])
  console.log(`   ⏱  ${label}: ${d} dtk`)
}

function sh(cmd, opsi = {}) {
  return execSync(cmd, { encoding: 'utf8', maxBuffer: 1 << 28, ...opsi })
}

// ── 0. Prasyarat ────────────────────────────────────────────────────────────
try { sh('docker info', { stdio: 'ignore' }) } catch {
  console.error(`
❌ Docker tidak berjalan.

   Uji pemulihan butuh Postgres sekali-pakai sebagai target. Nyalakan Docker
   Desktop, lalu ulangi. Alternatif tanpa Docker: docs/ops/RUNBOOK-PEMULIHAN.md
   §"Restore tanpa Docker".`)
  process.exit(1)
}

const env = bacaEnv()
const sumber = buatClient()
await sumber.connect()
const vs = await sumber.query('SELECT version() AS v')
const MAYOR = Number(vs.rows[0].v.match(/PostgreSQL (\d+)/)[1])
console.log(`sumber : PostgreSQL ${MAYOR}`)
console.log(`dump   : ${DUMP}\n`)

// ── 1. Nyalakan target sekali-pakai ─────────────────────────────────────────
console.log('1. Menyalakan Postgres sekali-pakai…')
let t = Date.now()
try { sh(`docker rm -f ${NAMA}`, { stdio: 'ignore' }) } catch { /* belum ada */ }
sh(`docker run -d --name ${NAMA} -e POSTGRES_PASSWORD=${SANDI} -p ${PORT}:5432 postgres:${MAYOR}`,
   { stdio: ['ignore', 'ignore', 'inherit'] })

// Tunggu sampai benar-benar menerima koneksi — `docker run` kembali jauh
// sebelum Postgres siap, dan restore ke server yang belum siap gagal dengan
// pesan yang menyesatkan.
let siap = false
for (let i = 0; i < 60; i++) {
  try { sh(`docker exec ${NAMA} pg_isready -U postgres`, { stdio: 'ignore' }); siap = true; break }
  catch { execSync('node -e "setTimeout(()=>{},1000)"', { stdio: 'ignore' }) }
}
if (!siap) { console.error('❌ Postgres target tak kunjung siap'); sh(`docker rm -f ${NAMA}`); process.exit(1) }
jam('nyalakan target', Date.now() - t)

const URL_TARGET = `postgresql://postgres:${SANDI}@localhost:${PORT}/postgres`
let keluar = 0

try {
  // ── 2. RESTORE ────────────────────────────────────────────────────────────
  //
  // Dijalankan DI DALAM kontainer supaya versi pg_restore selalu cocok dengan
  // servernya — ketidakcocokan versi adalah penyebab kegagalan restore yang
  // paling sering, dan paling tak perlu.
  // Peran Supabase harus ADA sebelum restore: sebagian policy terikat ke
  // `authenticated`/`anon`/`service_role`. Di Postgres polos peran itu tak ada,
  // dan pg_restore MELEWATI policy-nya diam-diam — drill lalu melaporkan
  // "policy tidak ikut pulih" padahal cadangannya baik-baik saja.
  // Terbukti di CI: 377 vs 349, selisihnya persis 28 policy ber-`authenticated`.
  // Schema `extensions` WAJIB ada lebih dulu: banyak tabel memakai
  // `extensions.uuid_generate_v4()` sebagai DEFAULT. Tanpa ini setiap tabel
  // yang memakainya gagal, lalu policy/comment/FK yang mengacu ikut runtuh —
  // 753 galat berantai, terbukti di CI run 30830650218.
  sh(`docker exec ${NAMA} psql -U postgres -v ON_ERROR_STOP=1 -c "` +
     `CREATE SCHEMA IF NOT EXISTS extensions;` +
     `CREATE EXTENSION IF NOT EXISTS \\"uuid-ossp\\" WITH SCHEMA extensions;` +
     `CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;"`,
     { stdio: ['ignore', 'ignore', 'inherit'] })

  sh(`docker exec ${NAMA} psql -U postgres -v ON_ERROR_STOP=1 -c "DO $$ BEGIN` +
     ` IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN NOINHERIT; END IF;` +
     ` IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN NOINHERIT; END IF;` +
     ` IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS; END IF;` +
     ` END $$;"`, { stdio: ['ignore', 'ignore', 'inherit'] })

  console.log('\n2. Memulihkan…')
  t = Date.now()
  sh(`docker cp "${JALUR_DUMP}" ${NAMA}:/tmp/c.dump`)
  let peringatanRestore = ''
  try {
    sh(`docker exec ${NAMA} pg_restore --no-owner --no-privileges --dbname "postgresql://postgres:${SANDI}@localhost:5432/postgres" /tmp/c.dump 2>&1`)
  } catch (e) {
    // pg_restore keluar non-nol untuk galat yang bisa diabaikan (mis. role
    // yang tak ada di target). Yang menentukan bukan kode keluarnya,
    // melainkan apakah DATANYA sampai — itu diperiksa di tahap 3.
    peringatanRestore = (e.stdout || '').split('\n').filter((l) => /error/i.test(l)).slice(0, 5).join('\n')
  }
  const msRestore = Date.now() - t
  jam('restore', msRestore)

  // ── 3. BANDINGKAN ─────────────────────────────────────────────────────────
  console.log('\n3. Membandingkan target dengan sumber…')
  const target = new pg.Client({ connectionString: URL_TARGET })
  await target.connect()

  const Q_TABEL = `SELECT count(*)::int AS n FROM information_schema.tables
                    WHERE table_schema='public' AND table_type='BASE TABLE'`
  const nSumber = (await sumber.query(Q_TABEL)).rows[0].n
  const nTarget = (await target.query(Q_TABEL)).rows[0].n
  console.log(`   tabel   sumber=${nSumber}  target=${nTarget}  ${nSumber === nTarget ? '✅' : '❌'}`)
  if (nSumber !== nTarget) keluar = 1

  // ── Jumlah baris per tabel — HITUNGAN NYATA, bukan perkiraan ────────────
  //
  // Versi pertama memakai `reltuples`. Itu SALAH, dan drill CI membuktikannya:
  // reltuples hanya perkiraan yang mutakhir sejauh ANALYZE terakhir. Sumber
  // melaporkan goods_receipts≈4 dan financial_config≈8 padahal isi sebenarnya
  // 2 dan 14 — perbandingannya mengadu tebakan BASI dengan angka SEGAR.
  //
  // Toleransi 5% pun tak menolong; ia menyamarkan sebagian dan membuat sisanya
  // makin sulit dipercaya. Untuk "apakah datanya sampai", satu-satunya jawaban
  // yang sah adalah COUNT(*).
  const daftar = (await sumber.query(
    `SELECT c.relname AS t FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind='r' ORDER BY 1`,
  )).rows

  let berisi = 0, cocok = 0, beda = []
  for (const { t } of daftar) {
    const s = Number((await sumber.query(`SELECT count(*)::int n FROM "${t}"`)).rows[0].n)
    if (s === 0) continue
    berisi++
    let g = -1
    try { g = Number((await target.query(`SELECT count(*)::int n FROM "${t}"`)).rows[0].n) } catch { g = -1 }
    if (g === s) cocok++
    else beda.push(`${t}: sumber=${s} target=${g < 0 ? 'TABEL-TIDAK-ADA' : g}`)
  }
  console.log(`   isi     ${cocok}/${berisi} tabel berisi data cocok  ${cocok === berisi ? '✅' : '❌'}`)
  if (beda.length) { console.log(beda.slice(0, 10).map((b) => `           ${b}`).join('\n')); keluar = 1 }

  // RLS + POLICY — pemeriksaan TERPENTING di berkas ini.
  //
  // Memulihkan data tanpa memulihkan RLS bukan pemulihan, melainkan KEBOCORAN
  // lintas-tenant. Dan itu lolos dari semua pemeriksaan jumlah baris di atas.
  const Q_RLS = `SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                  WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity`
  const Q_POL = `SELECT count(*)::int AS n FROM pg_policies WHERE schemaname='public'`
  const rlsS = (await sumber.query(Q_RLS)).rows[0].n, rlsT = (await target.query(Q_RLS)).rows[0].n
  const polS = (await sumber.query(Q_POL)).rows[0].n, polT = (await target.query(Q_POL)).rows[0].n
  console.log(`   RLS     sumber=${rlsS}  target=${rlsT}  ${rlsS === rlsT ? '✅' : '❌ ISOLASI TENANT TAK IKUT PULIH'}`)
  console.log(`   policy  sumber=${polS}  target=${polT}  ${polS === polT ? '✅' : '❌ ISOLASI TENANT TAK IKUT PULIH'}`)
  if (rlsS !== rlsT || polS !== polT) keluar = 1

  await target.end()

  // ── 4. Catatan waktu ──────────────────────────────────────────────────────
  const total = catatan.reduce((a, [, d]) => a + Number(d), 0).toFixed(1)
  const laporan = [
    `# Bukti uji pemulihan — ${new Date().toISOString()}`,
    '',
    `dump        : ${DUMP}`,
    `server      : PostgreSQL ${MAYOR}`,
    `tabel       : sumber ${nSumber} / target ${nTarget}`,
    `isi cocok   : ${cocok}/${berisi}`,
    `RLS         : sumber ${rlsS} / target ${rlsT}`,
    `policy      : sumber ${polS} / target ${polT}`,
    '',
    ...catatan.map(([l, d]) => `${l.padEnd(20)}: ${d} dtk`),
    `${'TOTAL'.padEnd(20)}: ${total} dtk`,
    '',
    peringatanRestore ? `catatan pg_restore:\n${peringatanRestore}` : '',
    keluar ? 'HASIL: GAGAL' : 'HASIL: LULUS',
  ].join('\n')
  writeFileSync(resolve(REPO_ROOT, 'cadangan', 'BUKTI-UJI-PEMULIHAN.txt'), laporan)

  console.log(`\n${keluar ? '❌ PEMULIHAN GAGAL' : '✅ PEMULIHAN TERBUKTI'} — total ${total} dtk`)
  console.log('   bukti → cadangan/BUKTI-UJI-PEMULIHAN.txt')
} finally {
  await sumber.end()
  // Kontainer SELALU dibersihkan, termasuk saat gagal — kontainer yatim yang
  // memegang port akan membuat percobaan berikutnya gagal dengan sebab yang
  // sama sekali berbeda dari yang sedang didiagnosis.
  try { sh(`docker rm -f ${NAMA}`, { stdio: 'ignore' }) } catch { /* sudah hilang */ }
}
process.exit(keluar)
