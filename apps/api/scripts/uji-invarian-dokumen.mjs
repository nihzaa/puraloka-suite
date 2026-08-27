#!/usr/bin/env node
/**
 * UJI INVARIAN KENDALI DOKUMEN — membuktikan constraint migrasi 215 menolak.
 *
 * ── Kenapa lewat database, bukan unit test
 *
 * Constraint yang ditulis di migrasi bisa saja tak pernah aktif: salah nama
 * kolom, sintaks yang diterima tapi selalu benar, atau `CREATE TABLE IF NOT
 * EXISTS` melewatinya diam-diam. Satu-satunya cara tahu adalah MENCOBA
 * MELANGGARNYA.
 *
 * Contoh nyata dari kelompok sebelumnya: `UNIQUE (company_id, project_id,
 * tanggal)` di migrasi 212 TERLIHAT mencegah libur ganda, dan tidak — NULL
 * tak pernah sama dengan NULL. Ketahuan oleh skrip seperti ini, bukan oleh
 * membaca ulang migrasinya.
 *
 * ── Apa yang dijaga, dan kenapa ini soal uang
 *
 *   • gambar "digantikan" tanpa pengganti → yang membacanya tahu gambar ini
 *     mati tapi tak tahu mana yang hidup, lalu mengerjakan yang lama
 *   • transmittal "diterima" tanpa tanggal → klaim tanpa bukti, dan bukti
 *     itulah seluruh gunanya transmittal
 *   • terima SEBELUM kirim → jejak yang mustahil, tak bisa dipakai membela
 *   • butir tindakan tanpa penanggung jawab → keputusan yang tak pernah
 *     dikerjakan, dan rapat berikutnya membahasnya lagi
 *   • penerima distribusi tanpa cara dihubungi → bukan penerima
 *   • tanda tangan tanpa sidik SHA-256 sah → tak bisa diverifikasi ulang,
 *     dan tanda tangan yang tak bisa diverifikasi tak lebih baik dari nihil
 *   • jadwal mingguan tanpa hari → laporan yang tak pernah terkirim
 *
 * Pakai (dari apps/api): node scripts/uji-invarian-dokumen.mjs
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { Client } = require('pg')

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = {}
if (!process.env.DIRECT_URL) {
  try {
    for (const baris of readFileSync(join(AKAR, '.env'), 'utf8').replace(/^﻿/, '').split(/\r?\n/)) {
      const m = baris.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/)
      if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
    }
  } catch {
    console.error('❌ DIRECT_URL tak ada di environment dan apps/api/.env tak terbaca.')
    process.exit(2)
  }
}

const db = new Client({ connectionString: process.env.DIRECT_URL || env.DIRECT_URL })
await db.connect()

const { rows: pr } = await db.query(
  `SELECT id, company_id FROM projects ORDER BY created_at LIMIT 1`)
const { rows: us } = await db.query(`SELECT id FROM users LIMIT 1`)

if (!pr.length || !us.length) {
  console.log('⚠️  Butuh minimal 1 proyek dan 1 pengguna. Dilewati.')
  await db.end()
  process.exit(0)
}
const PID = pr[0].id
const CID = pr[0].company_id
const UID = us[0].id

let lolos = 0
let bocor = 0
let seri = 0

const DITOLAK = new Set(['23514', '23502', '23503', '23505', '22003', '22P02'])
/*
  ══════════════════════════════════════════════════════════════════════════
  NAMA UNIK PER-JALAN — dan kenapa `++seri` saja tak cukup
  ══════════════════════════════════════════════════════════════════════════

  `seri` mulai dari nol tiap kali skrip dijalankan, jadi nomor pertamanya
  SELALU `GB-UJI-1`. Selama tiap jalan bersih, itu aman — `coba()` menghapus
  barisnya sendiri.

  Tetapi satu jalan yang mati di tengah (koneksi putus, Ctrl-C, atau
  invarian yang memang bocor) meninggalkan barisnya. Jalan BERIKUTNYA lalu
  menabrak nomor yang sama dan mati dengan:

      duplicate key value violates unique constraint "gambar_unik"

  Diukur 2026-08-27: satu baris sisa di `register_gambar`, dan skrip ini
  merah di CI sejak entah kapan — bukan karena ada invarian yang bocor,
  melainkan karena sampahnya sendiri. Kegagalannya menuduh BASIS, padahal
  seluruh 8 pemeriksaannya lulus tepat sebelum galat itu.

  Cap waktu + acak membuat tiap jalan memakai ruang nomornya sendiri, jadi
  sisa dari jalan yang gagal tak pernah menghalangi jalan berikutnya.
*/
const CAP = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const nom = (awalan) => `${awalan}-UJI-${CAP}-${++seri}`

/*
  Sapu sisa jalan-jalan sebelumnya. Idempoten, dan sengaja HANYA menyentuh
  baris bertanda `-UJI-` — pola yang tak mungkin dipakai nomor sungguhan.

  Dijalankan di AWAL, bukan hanya di akhir: yang perlu dibersihkan justru
  sisa dari jalan yang TIDAK sampai ke akhir.
*/
for (const t of ['register_gambar', 'transmittal']) {
  try {
    const { rowCount } = await db.query(
      `DELETE FROM ${t} WHERE nomor LIKE '%-UJI-%'`)
    if (rowCount > 0) console.log(`  🧹 ${t}: ${rowCount} baris sisa uji dibersihkan`)
  } catch (e) {
    // Tabel bisa saja belum ada di lingkungan tertentu — bukan alasan gagal.
    console.log(`  ⏭  ${t}: lewati pembersihan (${e.code ?? e.message.slice(0, 40)})`)
  }
}

async function coba(tabel, nama, isi, harusMasuk) {
  const k = Object.keys(isi)
  const v = k.map((_, i) => `$${i + 1}`).join(', ')
  try {
    const { rows } = await db.query(
      `INSERT INTO ${tabel} (${k.join(', ')}) VALUES (${v}) RETURNING id`,
      k.map((x) => isi[x]))
    await db.query(`DELETE FROM ${tabel} WHERE id = $1`, [rows[0].id])
    if (harusMasuk) { console.log(`  ✅ diterima ${nama}`); lolos++ }
    else { console.log(`  ❌ BOCOR   ${nama} — basis MENERIMA nilai yang tak boleh masuk`); bocor++ }
  } catch (e) {
    if (harusMasuk) {
      console.log(`  ❌ BOCOR   ${nama} DITOLAK (${e.code} ${e.message.slice(0, 70)})`)
      bocor++
    } else if (DITOLAK.has(e.code)) {
      console.log(`  ✅ ditolak ${nama} (${e.code})`)
      lolos++
    } else {
      console.log(`  ❌ BOCOR   ${nama} — ditolak karena galat lain: ${e.code} ${e.message.slice(0, 60)}`)
      bocor++
    }
  }
}

console.log('\nINVARIAN kendali dokumen (migrasi 215)\n')

// ── register_gambar ───────────────────────────────────────────────────────
const gb = (o) => ({ company_id: CID, project_id: PID, nomor: nom('GB'), judul: 'Denah lantai 1', ...o })

await coba('register_gambar', 'revisi NEGATIF', gb({ revisi: -1 }), false)
await coba('register_gambar', 'disiplin karangan', gb({ disiplin: 'entah' }), false)
await coba('register_gambar', 'tahap karangan', gb({ tahap: 'XYZ' }), false)
await coba('register_gambar', 'DIGANTIKAN tanpa menyebut penggantinya',
  gb({ status: 'digantikan' }), false)
await coba('register_gambar', 'gambar sah', gb({ revisi: 0, tahap: 'IFC' }), true)

{
  const n = nom('GB')
  const { rows } = await db.query(
    `INSERT INTO register_gambar (company_id, project_id, nomor, judul, revisi)
     VALUES ($1,$2,$3,'A',1) RETURNING id`, [CID, PID, n])
  await coba('register_gambar', 'gambar GANDA (proyek+nomor+revisi sama)',
    { company_id: CID, project_id: PID, nomor: n, judul: 'B', revisi: 1 }, false)
  /*
    ════════════════════════════════════════════════════════════════════════
    REVISI BARU MENUNTUT YANG LAMA DIGANTIKAN LEBIH DULU
    ════════════════════════════════════════════════════════════════════════

    Versi sebelumnya menyisipkan revisi 2 begitu saja dan menuntutnya
    DITERIMA, dengan alasan "revisi berbeda untuk nomor sama HARUS boleh —
    itu inti register gambar". Niatnya benar, tetapi alurnya keliru, dan ia
    dilaporkan sebagai BOCOR sejak skrip ini bisa berjalan sampai selesai:

        duplicate key ... constraint "register_gambar_satu_berlaku"

    Yang menghalangi bukan `gambar_unik (project_id, nomor, revisi)` —
    revisi 2 memang berbeda dari revisi 1 — melainkan indeks parsial

        UNIQUE (project_id, nomor) WHERE status = 'berlaku'

    dan `status` berbawaan `'berlaku'`. Jadi revisi 2 masuk sebagai gambar
    kedua yang BERLAKU untuk nomor yang sama.

    Basisnya BENAR, dan justru inilah inti kendali dokumen: mustahil ada dua
    revisi gambar yang sama-sama berlaku di lapangan. Tukang yang memegang
    Rev-1 dan tukang yang memegang Rev-2 akan membangun dua hal berbeda dari
    gambar yang "sama-sama sah".

    Yang benar diuji adalah ALUR SUNGGUHAN: revisi lama ditandai
    `digantikan` (menyebut penggantinya), baru revisi barunya masuk.
  */
  await coba('register_gambar', 'revisi baru saat yang lama MASIH berlaku',
    { company_id: CID, project_id: PID, nomor: n, judul: 'B', revisi: 2 }, false)

  const { rows: baru2 } = await db.query(
    `INSERT INTO register_gambar (company_id, project_id, nomor, judul, revisi, status)
     VALUES ($1,$2,$3,'B',2,'ditarik') RETURNING id`, [CID, PID, n])
  await db.query(
    `UPDATE register_gambar SET status = 'digantikan', digantikan_oleh = $1 WHERE id = $2`,
    [baru2[0].id, rows[0].id])
  await db.query(
    `UPDATE register_gambar SET status = 'berlaku' WHERE id = $1`, [baru2[0].id])
  {
    const { rows: cek } = await db.query(
      `SELECT count(*)::int AS n FROM register_gambar
        WHERE project_id = $1 AND nomor = $2 AND status = 'berlaku'`, [PID, n])
    if (cek[0].n === 1) {
      console.log('  ✅ diterima revisi baru setelah yang lama DIGANTIKAN')
      lolos++
    } else {
      console.log(`  ❌ BOCOR   ${cek[0].n} revisi berlaku sekaligus untuk satu nomor`)
      bocor++
    }
  }
  /*
    URUTAN HAPUS PENTING — yang MENUNJUK dibuang lebih dulu.

    Baris lama menunjuk penggantinya lewat `digantikan_oleh`. Menghapus
    penggantinya duluan membuat FK men-set kolom itu NULL, dan

        CHECK (status <> 'digantikan' OR digantikan_oleh IS NOT NULL)

    langsung dilanggar — skrip mati di pembersihan, SESUDAH seluruh
    pemeriksaannya lulus. Kegagalan yang terbaca seperti invarian bocor,
    padahal cuma urutan hapus.
  */
  await db.query('DELETE FROM register_gambar WHERE id = $1', [rows[0].id])
  await db.query('DELETE FROM register_gambar WHERE id = $1', [baru2[0].id])
}

// ── transmittal ───────────────────────────────────────────────────────────
const tr = (o) => ({
  company_id: CID, project_id: PID, nomor: nom('TR'),
  perihal: 'Kirim gambar IFC', tujuan_nama: 'PT Konsultan', ...o,
})

await coba('transmittal', 'maksud karangan', tr({ maksud: 'entah' }), false)
await coba('transmittal', 'status DIKIRIM tanpa tanggal kirim',
  tr({ status: 'dikirim' }), false)
await coba('transmittal', 'status DITERIMA tanpa tanggal terima',
  tr({ status: 'diterima', dikirim_pada: '2026-08-01T08:00:00Z' }), false)
await coba('transmittal', 'DITERIMA sebelum DIKIRIM — jejak yang mustahil',
  tr({ status: 'diterima', dikirim_pada: '2026-08-05T08:00:00Z',
       diterima_pada: '2026-08-01T08:00:00Z' }), false)
await coba('transmittal', 'draft sah', tr({}), true)
await coba('transmittal', 'kirim-terima lengkap sah',
  tr({ status: 'diterima', dikirim_pada: '2026-08-01T08:00:00Z',
       diterima_pada: '2026-08-03T10:00:00Z', diterima_oleh: 'Budi' }), true)

{
  const n = nom('TR')
  const { rows } = await db.query(
    `INSERT INTO transmittal (company_id, project_id, nomor, perihal, tujuan_nama)
     VALUES ($1,$2,$3,'A','X') RETURNING id`, [CID, PID, n])
  await coba('transmittal', 'nomor transmittal GANDA dalam satu company',
    { company_id: CID, project_id: PID, nomor: n, perihal: 'B', tujuan_nama: 'Y' }, false)

  // ── transmittal_item ────────────────────────────────────────────────────
  await coba('transmittal_item', 'item TANPA isi apa pun',
    { company_id: CID, transmittal_id: rows[0].id }, false)
  await coba('transmittal_item', 'item uraian KOSONG (spasi saja)',
    { company_id: CID, transmittal_id: rows[0].id, uraian: '   ' }, false)
  await coba('transmittal_item', 'jumlah lembar NOL',
    { company_id: CID, transmittal_id: rows[0].id, uraian: 'Berkas', jumlah_lembar: 0 }, false)
  await coba('transmittal_item', 'item beruraian sah',
    { company_id: CID, transmittal_id: rows[0].id, uraian: 'Berkas', jumlah_lembar: 3 }, true)

  await db.query('DELETE FROM transmittal WHERE id = $1', [rows[0].id])
}

// ── notulen_rapat & notulen_tindakan ──────────────────────────────────────
const nt = (o) => ({
  company_id: CID, project_id: PID, nomor: nom('NR'),
  judul: 'Rapat mingguan', tanggal: '2026-08-05', ...o,
})

await coba('notulen_rapat', 'jenis rapat karangan', nt({ jenis: 'entah' }), false)
await coba('notulen_rapat', 'DISAHKAN tanpa tanggal pengesahan',
  nt({ status: 'disahkan' }), false)
await coba('notulen_rapat', 'notulen sah', nt({}), true)

{
  const { rows } = await db.query(
    `INSERT INTO notulen_rapat (company_id, project_id, nomor, judul, tanggal)
     VALUES ($1,$2,$3,'A','2026-08-05') RETURNING id`, [CID, PID, nom('NR')])
  const nid = rows[0].id

  await coba('notulen_tindakan', 'butir TANPA penanggung jawab',
    { company_id: CID, notulen_id: nid, uraian: 'Kirim shop drawing' }, false)
  await coba('notulen_tindakan', 'butir uraian KOSONG',
    { company_id: CID, notulen_id: nid, uraian: '  ', pj_nama: 'Budi' }, false)
  await coba('notulen_tindakan', 'butir SELESAI tanpa tanggal selesai',
    { company_id: CID, notulen_id: nid, uraian: 'X', pj_nama: 'Budi', status: 'selesai' }, false)
  await coba('notulen_tindakan', 'butir sah (pj nama)',
    { company_id: CID, notulen_id: nid, uraian: 'Kirim shop drawing',
      pj_nama: 'Budi', tenggat: '2026-08-15' }, true)
  await coba('notulen_tindakan', 'butir sah (pj pengguna sistem)',
    { company_id: CID, notulen_id: nid, uraian: 'Tinjau RAB', pj_user_id: UID }, true)

  await db.query('DELETE FROM notulen_rapat WHERE id = $1', [nid])
}

// ── matriks_distribusi ────────────────────────────────────────────────────
const md = (o) => ({
  company_id: CID, project_id: PID, jenis_dokumen: 'gambar_struktur',
  penerima_nama: 'Konsultan ' + (++seri), ...o,
})

await coba('matriks_distribusi', 'penerima TANPA cara dihubungi',
  md({}), false)
await coba('matriks_distribusi', 'surel tanpa @',
  md({ penerima_email: 'bukan-surel' }), false)
await coba('matriks_distribusi', 'peran distribusi karangan',
  md({ penerima_email: 'a@b.com', peran: 'entah' }), false)
await coba('matriks_distribusi', 'penerima ber-surel sah',
  md({ penerima_email: 'konsultan@contoh.co.id', peran: 'tinjauan' }), true)
await coba('matriks_distribusi', 'penerima pengguna sistem sah',
  md({ penerima_user_id: UID }), true)

// ── tanda_tangan_elektronik ───────────────────────────────────────────────
const SIDIK_SAH = 'a'.repeat(64)
const ttd = (o) => ({
  company_id: CID, jenis_objek: 'notulen',
  objek_id: '00000000-0000-0000-0000-000000000abc',
  penanda_tangan: UID, sidik_isi: SIDIK_SAH, ...o,
})

await coba('tanda_tangan_elektronik', 'sidik BUKAN SHA-256 (terlalu pendek)',
  ttd({ sidik_isi: 'abc123' }), false)
await coba('tanda_tangan_elektronik', 'sidik ber-HURUF BESAR (bukan hex baku)',
  ttd({ sidik_isi: 'A'.repeat(64) }), false)
await coba('tanda_tangan_elektronik', 'jenis objek karangan',
  ttd({ jenis_objek: 'entah' }), false)
await coba('tanda_tangan_elektronik', 'tanda tangan sah', ttd({}), true)

{
  const oid = '00000000-0000-0000-0000-0000000000de'
  const { rows } = await db.query(
    `INSERT INTO tanda_tangan_elektronik
       (company_id, jenis_objek, objek_id, penanda_tangan, sidik_isi)
     VALUES ($1,'notulen',$2,$3,$4) RETURNING id`, [CID, oid, UID, SIDIK_SAH])
  await coba('tanda_tangan_elektronik', 'orang yang SAMA menandatangani objek yang sama dua kali',
    { company_id: CID, jenis_objek: 'notulen', objek_id: oid,
      penanda_tangan: UID, sidik_isi: 'b'.repeat(64) }, false)
  await db.query('DELETE FROM tanda_tangan_elektronik WHERE id = $1', [rows[0].id])
}

// ── jadwal_distribusi_laporan ─────────────────────────────────────────────
const jd = (o) => ({
  company_id: CID, project_id: PID, nama: 'Laporan ' + (++seri),
  jenis_laporan: 'progres_mingguan', ...o,
})

await coba('jadwal_distribusi_laporan', 'MINGGUAN tanpa hari — kapan jalannya?',
  jd({ irama: 'mingguan' }), false)
await coba('jadwal_distribusi_laporan', 'mingguan hari ke-9',
  jd({ irama: 'mingguan', hari_ke: 9 }), false)
await coba('jadwal_distribusi_laporan', 'bulanan hari ke-31 (tak ada di Februari)',
  jd({ irama: 'bulanan', hari_ke: 31 }), false)
await coba('jadwal_distribusi_laporan', 'gagal berturut NEGATIF',
  jd({ irama: 'harian', gagal_berturut: -1 }), false)
await coba('jadwal_distribusi_laporan', 'irama karangan',
  jd({ irama: 'entah' }), false)
await coba('jadwal_distribusi_laporan', 'harian TANPA hari_ke sah',
  jd({ irama: 'harian' }), true)
await coba('jadwal_distribusi_laporan', 'mingguan Senin sah',
  jd({ irama: 'mingguan', hari_ke: 1 }), true)
await coba('jadwal_distribusi_laporan', 'bulanan tanggal 28 sah',
  jd({ irama: 'bulanan', hari_ke: 28 }), true)

// ── RLS ───────────────────────────────────────────────────────────────────
const TABEL = ['register_gambar', 'transmittal', 'transmittal_item',
  'notulen_rapat', 'notulen_tindakan', 'matriks_distribusi',
  'tanda_tangan_elektronik', 'jadwal_distribusi_laporan']

for (const t of TABEL) {
  const { rows: pol } = await db.query(
    `SELECT polpermissive, pg_get_expr(polqual, polrelid) q
       FROM pg_policy WHERE polrelid = $1::regclass`, [t])

  const restr = pol.find((p) => p.polpermissive === false)
  if (restr && (restr.q || '').includes('auth_company_id')) {
    console.log(`  ✅ RLS RESTRICTIVE ${t} menyaring company`)
    lolos++
  } else {
    console.log(`  ❌ BOCOR   ${t}: tak ada policy RESTRICTIVE penyaring tenant`)
    bocor++
  }

  // ADR-004 Rule #2 — pelajaran migrasi 202.
  const literal = pol.filter((p) => (p.q || '').includes('auth_role'))
  if (literal.length === 0) { console.log(`  ✅ ${t}: nol literal peran`); lolos++ }
  else { console.log(`  ❌ BOCOR   ${t}: ${literal.length} policy memakai auth_role()`); bocor++ }

  // InitPlan — pelajaran migrasi 214: helper telanjang dievaluasi per BARIS.
  const telanjang = pol.filter((p) => {
    const q = (p.q || '').replace(/\(\s*SELECT\s+(auth_company_id|has_permission)/gi, '(WRAPPED')
    return /(auth_company_id|has_permission)\s*\(/.test(q)
  })
  if (telanjang.length === 0) { console.log(`  ✅ ${t}: helper InitPlan (bukan per-baris)`); lolos++ }
  else { console.log(`  ❌ BOCOR   ${t}: ${telanjang.length} policy memanggil helper per baris`); bocor++ }

  const { rows: rls } = await db.query(
    `SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid = $1::regclass`, [t])
  if (rls[0]?.relrowsecurity && rls[0]?.relforcerowsecurity) {
    console.log(`  ✅ RLS aktif & dipaksa di ${t}`)
    lolos++
  } else {
    console.log(`  ❌ BOCOR   RLS tak aktif/tak dipaksa di ${t}`)
    bocor++
  }
}

console.log(`\n${bocor === 0 ? '✅' : '❌'} ${lolos} invarian terjaga, ${bocor} bocor\n`)
await db.end()
process.exit(bocor === 0 ? 0 : 1)
