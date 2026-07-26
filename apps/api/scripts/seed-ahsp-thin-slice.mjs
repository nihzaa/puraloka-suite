#!/usr/bin/env node
// ============================================================
// SEED AHSP THIN-SLICE — keluarga Pasangan Dinding Bata Merah (SE 47/2026)
//
// Zero-Invention (ADR-006): SEMUA angka di bawah = salinan VERBATIM dari
// workbook resmi `AHSP CIPTA KARYA SE BINA KONTRUKSI NO. 47 TAHUN 2026.xlsm`,
// sheet "Pasangan Dinding", blok 3.6.1.1–3.6.1.10 (ekstraksi data_only,
// diverifikasi silang dgn AHSP-GOLDEN-PROVENANCE). TIDAK ADA angka karangan.
//
// Provenance: mengisi ahsp_editions.SE-47-2026 (source_file + sha256 + imported_at)
// — write-once (migration 118). File sumber TIDAK di git (_source/ digitignore);
// sha256 dihitung dari file lokal bila ada, kalau tidak seed tetap jalan tanpa
// mengisi provenance file (dilaporkan).
//
// Idempoten: ON CONFLICT DO NOTHING pada seluruh insert; assembly diidentifikasi
// via (code, edition, source, version). Aman diulang.
// Target: DEV via DIRECT_URL apps/api/.env (assert ref) ATAU FP_URL eksplisit.
// ============================================================
import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import pg from 'pg'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DEV_REF = 'tgozokxyvwmyvajgqfxw'

function loadUrl() {
  if (process.env.FP_URL) return process.env.FP_URL
  const txt = readFileSync(resolve(__dirname, '..', '.env'), 'utf8')
  const m = txt.match(/^DIRECT_URL\s*=\s*(.+)$/m)
  return m[1].trim().replace(/^["']|["']$/g, '')
}

// ── DATA VERBATIM (sheet "Pasangan Dinding", SE 47/2026) ────────────────────
// resources: code → {name (verbatim), category RBS, unit}
const RESOURCES = [
  ['AHSP-PEKERJA',      'Pekerja',                                  'labor',    'OH'],
  ['AHSP-TUKANG-BATU',  'Tukang batu',                              'labor',    'OH'],
  ['AHSP-KEPALA-TUKANG','Kepala tukang',                            'labor',    'OH'],
  ['AHSP-MANDOR',       'Mandor',                                   'labor',    'OH'],
  ['AHSP-BATA-MERAH',   'Bata merah',                               'material', 'bh'],
  ['AHSP-SEMEN-PC',     'Semen portland (PC)',                      'material', 'kg'],
  ['AHSP-PASIR-PASANG', 'Pasir pasang (quarry - lokasi pekerjaan)', 'material', 'm3'],
]

// tiap analisa: [kode, uraian verbatim, {resource_code: koefisien}]
// koefisien upah 1-batu: 0.4/0.2/0.02/0.0067 · ½-batu: 0.2/0.1/0.01/0.0033 (verbatim)
const U1 = { 'AHSP-PEKERJA': 0.4, 'AHSP-TUKANG-BATU': 0.2, 'AHSP-KEPALA-TUKANG': 0.02, 'AHSP-MANDOR': 0.0067 }
const U5 = { 'AHSP-PEKERJA': 0.2, 'AHSP-TUKANG-BATU': 0.1, 'AHSP-KEPALA-TUKANG': 0.01, 'AHSP-MANDOR': 0.0033 }
const ANALYSES = [
  ['3.6.1.1',  'Pemasangan 1 m2 dinding bata merah tebal 1 batu dengan mortar tipe M,fc’ 17,2 MPa (Setara Campuran 1SP : 2PP)',
    { ...U1, 'AHSP-BATA-MERAH': 143.81, 'AHSP-SEMEN-PC': 43.5,  'AHSP-PASIR-PASANG': 0.08 }],
  ['3.6.1.2',  'Pemasangan 1 m2 dinding bata merah tebal 1 batu dengan mortar tipe S,fc’ 12,5 MPa (Setara Campuran 1SP : 3PP)',
    { ...U1, 'AHSP-BATA-MERAH': 143.81, 'AHSP-SEMEN-PC': 32.95, 'AHSP-PASIR-PASANG': 0.091 }],
  ['3.6.1.3',  'Pemasangan 1 m2 dinding bata merah tebal 1 batu dengan mortar tipe N,fc’ 5,2 MPa (Setara Campuran 1SP : 4PP)',
    { ...U1, 'AHSP-BATA-MERAH': 143.81, 'AHSP-SEMEN-PC': 26.55, 'AHSP-PASIR-PASANG': 0.093 }],
  ['3.6.1.4',  'Pemasangan 1 m2 dinding bata merah tebal 1 batu dengan mortar tipe O,fc’ 2,4 MPa (Setara Campuran 1SP : 5PP)',
    { ...U1, 'AHSP-BATA-MERAH': 143.81, 'AHSP-SEMEN-PC': 22.2,  'AHSP-PASIR-PASANG': 0.102 }],
  ['3.6.1.5',  'Pemasangan 1 m2 dinding bata merah tebal 1 batu campuran 1SP : 6PP',
    { ...U1, 'AHSP-BATA-MERAH': 143.81, 'AHSP-SEMEN-PC': 18.5,  'AHSP-PASIR-PASANG': 0.122 }],
  ['3.6.1.6',  'Pemasangan 1 m2 dinding bata merah tebal 1/2 batu dengan mortar tipe M,fc’ 17,2 MPa (Setara Campuran 1SP : 2PP)',
    { ...U5, 'AHSP-BATA-MERAH': 71.91,  'AHSP-SEMEN-PC': 18.95, 'AHSP-PASIR-PASANG': 0.038 }],
  ['3.6.1.7',  'Pemasangan 1 m2 dinding bata merah tebal 1/2 batu dengan mortar tipe S,fc’ 12,5 MPa (Setara Campuran 1SP : 3PP)',
    { ...U5, 'AHSP-BATA-MERAH': 71.91,  'AHSP-SEMEN-PC': 14.37, 'AHSP-PASIR-PASANG': 0.04 }],
  ['3.6.1.8',  'Pemasangan 1 m2 dinding bata merah tebal 1/2 batu dengan mortar tipe N,fc’ 5,2 MPa (Setara Campuran 1SP : 4PP)',
    { ...U5, 'AHSP-BATA-MERAH': 71.91,  'AHSP-SEMEN-PC': 11.5,  'AHSP-PASIR-PASANG': 0.043 }],
  ['3.6.1.9',  'Pemasangan 1 m2 dinding bata merah tebal 1/2 batu dengan mortar tipe O,fc’ 2,4 MPa (Setara Campuran 1SP : 5PP)',
    { ...U5, 'AHSP-BATA-MERAH': 71.91,  'AHSP-SEMEN-PC': 9.68,  'AHSP-PASIR-PASANG': 0.045 }],
  ['3.6.1.10', 'Pemasangan 1 m2 dinding bata merah tebal 1/2 batu campuran 1SP : 6PP',
    { ...U5, 'AHSP-BATA-MERAH': 71.91,  'AHSP-SEMEN-PC': 8.32,  'AHSP-PASIR-PASANG': 0.049 }],
]
const SOURCE_XLSM = resolve(__dirname, '..', '..', '..', '_source', 'ahsp',
  'AHSP CIPTA KARYA SE BINA KONTRUKSI NO. 47 TAHUN 2026.xlsm')

async function main() {
  const url = loadUrl()
  if (!process.env.FP_URL && !url.includes(DEV_REF)) {
    throw new Error('DIRECT_URL bukan proyek dev — batal (safety).')
  }
  const c = new pg.Client({ connectionString: url })
  await c.connect()
  try {
    const admin = await c.query(
      `SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name='admin' ORDER BY u.created_at LIMIT 1`)
    const adminId = admin.rows[0]?.id ?? null

    // 1. Provenance edisi (write-once; skip bila file tak ada / sudah terisi)
    const ed = await c.query(`SELECT id, source_sha256 FROM ahsp_editions WHERE code='SE-47-2026'`)
    if (!ed.rows.length) throw new Error('Edisi SE-47-2026 tidak ada — migration 117 belum applied?')
    const editionId = ed.rows[0].id
    if (!ed.rows[0].source_sha256 && existsSync(SOURCE_XLSM)) {
      const sha = createHash('sha256').update(readFileSync(SOURCE_XLSM)).digest('hex')
      await c.query(
        `UPDATE ahsp_editions SET source_file=$1, source_sha256=$2, imported_at=now(), imported_by=$3
         WHERE id=$4`,
        ['AHSP CIPTA KARYA SE BINA KONTRUKSI NO. 47 TAHUN 2026.xlsm', sha, adminId, editionId])
      console.log(`provenance edisi terisi (sha256 ${sha.slice(0, 12)}…)`)
    } else {
      console.log(ed.rows[0].source_sha256
        ? 'provenance edisi sudah terisi — skip (write-once)'
        : 'PERINGATAN: file sumber tak ditemukan lokal — provenance TIDAK diisi')
    }

    // 2. Cost code payung keluarga (registry 102: code+name)
    await c.query(
      `INSERT INTO cost_codes (code, name, description, created_by)
       VALUES ('CC-3.6.1', 'Pasangan Dinding Bata Merah',
               'Keluarga AHSP SE 47/2026 blok 3.6.1 (sheet Pasangan Dinding)', $1)
       ON CONFLICT (code) DO NOTHING`, [adminId])
    const cc = await c.query(`SELECT id FROM cost_codes WHERE code='CC-3.6.1'`)
    const costCodeId = cc.rows[0].id

    // 3. Resources (RBS) — verbatim nama, kategori RBS, unit AHSP
    for (const [code, name, category, unit] of RESOURCES) {
      await c.query(
        `INSERT INTO resources (code, name, category, unit_code, created_by)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT (code) DO NOTHING`,
        [code, name, category, unit, adminId])
    }

    // 4. Assemblies national baseline (edition SE-47-2026, is_import_baseline)
    let made = 0, skipped = 0
    for (const [code, uraian, comps] of ANALYSES) {
      const exist = await c.query(
        `SELECT id FROM assemblies
         WHERE code=$1 AND edition_id=$2 AND source='national' AND version_number=1`,
        [code, editionId])
      if (exist.rows.length) { skipped++; continue }
      const a = await c.query(
        `INSERT INTO assemblies
           (code, name, cost_code_id, source, reference_standard, version_number,
            waste_factor, sequence, output_unit_code, edition_id, is_import_baseline, created_by)
         VALUES ($1,$2,$3,'national','Cipta Karya',1,0,'[]'::jsonb,'m2',$4,true,$5)
         RETURNING id`,
        [code, uraian, costCodeId, editionId, adminId])
      const asmId = a.rows[0].id
      let sort = 0
      for (const [rcode, koef] of Object.entries(comps)) {
        await c.query(
          `INSERT INTO assembly_components (assembly_id, resource_id, coefficient, sort_order)
           SELECT $1, r.id, $2, $3 FROM resources r WHERE r.code=$4`,
          [asmId, koef, sort++, rcode])
      }
      // aktifkan: baseline siap dipakai estimasi; konten beku (guard baseline + active)
      await c.query(`UPDATE assemblies SET status='active' WHERE id=$1`, [asmId])
      made++
    }
    console.log(`assemblies: ${made} dibuat+aktif, ${skipped} sudah ada (idempoten)`)

    // 5. Verifikasi ringkas
    const v = await c.query(
      `SELECT count(*)::int n FROM assemblies WHERE edition_id=$1 AND source='national'`, [editionId])
    const vc = await c.query(
      `SELECT count(*)::int n FROM assembly_components ac
       JOIN assemblies a ON a.id=ac.assembly_id WHERE a.edition_id=$1`, [editionId])
    console.log(`total: ${v.rows[0].n} assemblies SE-47-2026 · ${vc.rows[0].n} komponen`)
  } finally {
    await c.end()
  }
}
main().catch((e) => { console.error('FATAL:', e.message); process.exit(1) })
