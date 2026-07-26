#!/usr/bin/env node
// ============================================================
// SEED PENUH AHSP SE 47/2026 — dari dataset kanonik (db/seeds/ahsp-se47-dataset.json)
//
// Zero-Invention: dataset = ekstraksi VERBATIM workbook resmi (extractor ter-commit,
// sha256 sumber di meta). Skrip ini TIDAK menghitung/menafsir apa pun — hanya memuat.
//
// Aturan:
// - Idempoten: identitas assembly (code, edition, source='national', version=1);
//   yang sudah ada di-skip (termasuk 10 thin-slice).
// - Resource DI-REUSE by (lower(name), unit_code) — thin-slice (AHSP-PEKERJA dst)
//   tidak diduplikasi; sisanya insert dgn kode dataset (AHSP-Rxxxx).
// - Cost code per SHEET (kategori pekerjaan SE): CC-SE47-<slug>.
// - Sanity gate sebelum tulis: dataset.meta.source_sha256 HARUS sama dengan
//   ahsp_editions.SE-47-2026.source_sha256 di DB (kalau sudah terisi) — mencegah
//   seed dari file sumber berbeda. Fail-loud.
// - Verifikasi akhir: jumlah assembly+komponen + spot-check koefisien.
// Target: DEV (assert ref) atau FP_URL eksplisit.
// ============================================================
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import pg from 'pg'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DEV_REF = 'tgozokxyvwmyvajgqfxw'
const DATASET = resolve(__dirname, '..', '..', '..', 'db', 'seeds', 'ahsp-se47-dataset.json')

function loadUrl() {
  if (process.env.FP_URL) return process.env.FP_URL
  const txt = readFileSync(resolve(__dirname, '..', '.env'), 'utf8')
  return txt.match(/^DIRECT_URL\s*=\s*(.+)$/m)[1].trim().replace(/^["']|["']$/g, '')
}
const slug = (s) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)

async function main() {
  const url = loadUrl()
  if (!process.env.FP_URL && !url.includes(DEV_REF)) throw new Error('DIRECT_URL bukan dev — batal (safety).')
  const ds = JSON.parse(readFileSync(DATASET, 'utf8'))
  console.log('dataset:', JSON.stringify(ds.meta.counts), '| sha', ds.meta.source_sha256.slice(0, 12))

  const c = new pg.Client({ connectionString: url })
  await c.connect()
  try {
    const admin = await c.query(
      `SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE r.name='admin' ORDER BY u.created_at LIMIT 1`)
    const adminId = admin.rows[0]?.id ?? null

    // 0. Edisi + sanity sha256
    const ed = await c.query(
      `SELECT id, source_sha256 FROM ahsp_editions WHERE code=$1`, [ds.meta.edition_code])
    if (!ed.rows.length) throw new Error(`Edisi ${ds.meta.edition_code} tidak ada (migration 117?)`)
    const editionId = ed.rows[0].id
    if (ed.rows[0].source_sha256 && ed.rows[0].source_sha256 !== ds.meta.source_sha256) {
      throw new Error('SHA256 dataset ≠ provenance edisi di DB — sumber berbeda, STOP.')
    }

    // 1. Unit baru harus sudah ada (migration 120) — fail-loud kalau belum
    const needUnits = [...new Set([...ds.new_units, ...ds.analyses.map(a => a.output_unit)])]
    const have = await c.query(`SELECT code FROM units WHERE code = ANY($1)`, [needUnits])
    const missingUnits = needUnits.filter(u => !have.rows.some(r => r.code === u))
    if (missingUnits.length) throw new Error(`Unit belum ada di DB (migration 120?): ${missingUnits.join(', ')}`)

    // 2. Cost code per sheet
    const sheets = [...new Set(ds.analyses.map(a => a.sheet))]
    const ccBySheet = {}
    for (const sh of sheets) {
      const code = `CC-SE47-${slug(sh)}`
      await c.query(
        `INSERT INTO cost_codes (code, name, description, created_by)
         VALUES ($1, $2, $3, $4) ON CONFLICT (code) DO NOTHING`,
        [code, sh.trim(), `Kategori pekerjaan SE 47/2026 — sheet "${sh.trim()}"`, adminId])
      const r = await c.query(`SELECT id FROM cost_codes WHERE code=$1`, [code])
      ccBySheet[sh] = r.rows[0].id
    }
    console.log(`cost codes: ${sheets.length} sheet siap`)

    // 3. Resources — reuse by (lower(name), unit); else insert kode dataset
    const resIdByCode = {}
    let resReused = 0, resNew = 0
    for (const r of ds.resources) {
      const found = await c.query(
        `SELECT id FROM resources WHERE lower(name)=lower($1) AND unit_code=$2 LIMIT 1`,
        [r.name, r.unit_code])
      if (found.rows.length) { resIdByCode[r.code] = found.rows[0].id; resReused++; continue }
      // Kode dataset bisa bentrok dgn resource LAIN di DB (penomoran dataset bisa
      // bergeser antar regen). Identitas sejati = (nama, unit) — kalau kode bentrok,
      // JANGAN ambil by-code (itu resource berbeda!); pakai kode alternatif.
      let code = r.code, inserted = null
      for (let sfx = 0; sfx < 5 && !inserted; sfx++) {
        const tryCode = sfx === 0 ? code : `${code}-${sfx + 1}`
        const ins = await c.query(
          `INSERT INTO resources (code, name, category, unit_code, created_by)
           VALUES ($1,$2,$3,$4,$5) ON CONFLICT (code) DO NOTHING RETURNING id`,
          [tryCode, r.name, r.category, r.unit_code, adminId])
        if (ins.rows.length) inserted = ins.rows[0].id
      }
      if (!inserted) throw new Error(`Gagal insert resource ${r.code} (${r.name}) — kode bentrok beruntun`)
      resIdByCode[r.code] = inserted; resNew++
    }
    console.log(`resources: ${resNew} baru, ${resReused} reuse`)

    // 4. Assemblies + komponen (batch per analisa; idempoten by identitas)
    let made = 0, skipped = 0
    for (const a of ds.analyses) {
      const exist = await c.query(
        `SELECT id FROM assemblies WHERE code=$1 AND edition_id=$2 AND source='national' AND version_number=1`,
        [a.code, editionId])
      if (exist.rows.length) { skipped++; continue }
      const ins = await c.query(
        `INSERT INTO assemblies
           (code, name, cost_code_id, source, reference_standard, version_number,
            waste_factor, sequence, output_unit_code, edition_id, is_import_baseline, created_by)
         VALUES ($1,$2,$3,'national','Cipta Karya',1,0,'[]'::jsonb,$4,$5,true,$6) RETURNING id`,
        [a.code, a.uraian.slice(0, 500), ccBySheet[a.sheet], a.output_unit, editionId, adminId])
      const asmId = ins.rows[0].id
      // multi-row insert komponen (satu statement per analisa)
      const vals = [], params = [asmId]
      let p = 2
      for (let i = 0; i < a.components.length; i++) {
        const cmp = a.components[i]
        vals.push(`($1, $${p}, $${p + 1}, ${i})`)
        params.push(resIdByCode[cmp.r], cmp.k)
        p += 2
      }
      await c.query(
        `INSERT INTO assembly_components (assembly_id, resource_id, coefficient, sort_order)
         VALUES ${vals.join(',')} ON CONFLICT (assembly_id, resource_id) DO NOTHING`, params)
      await c.query(`UPDATE assemblies SET status='active' WHERE id=$1`, [asmId])
      made++
      if (made % 300 === 0) console.log(`  … ${made} assemblies`)
    }
    console.log(`assemblies: ${made} dibuat+aktif, ${skipped} sudah ada`)

    // 5. Verifikasi
    const va = await c.query(
      `SELECT count(*)::int n FROM assemblies WHERE edition_id=$1 AND source='national'`, [editionId])
    const vc = await c.query(
      `SELECT count(*)::int n FROM assembly_components ac JOIN assemblies a ON a.id=ac.assembly_id
       WHERE a.edition_id=$1`, [editionId])
    console.log(`DB kini: ${va.rows[0].n} assemblies SE-47-2026 · ${vc.rows[0].n} komponen`)
    // spot-check: 3 analisa acak dari dataset — koefisien DB == dataset persis
    const picks = [ds.analyses[0], ds.analyses[Math.floor(ds.analyses.length / 2)], ds.analyses[ds.analyses.length - 1]]
    for (const a of picks) {
      const rows = await c.query(
        `SELECT r.name, ac.coefficient::float k FROM assemblies asm
         JOIN assembly_components ac ON ac.assembly_id=asm.id
         JOIN resources r ON r.id=ac.resource_id
         WHERE asm.code=$1 AND asm.edition_id=$2 AND asm.source='national' ORDER BY ac.sort_order`,
        [a.code, editionId])
      const ok = rows.rows.length === a.components.length
        && a.components.every((cmp, i) => Math.abs(rows.rows[i].k - cmp.k) < 1e-9)
      console.log(`  spot ${a.code}: ${ok ? 'COCOK' : 'BEDA!'} (${rows.rows.length} komponen)`)
      if (!ok) throw new Error(`Spot-check gagal di ${a.code}`)
    }
    console.log(`excluded (tak di-seed, lihat dataset.excluded): ${ds.meta.counts.excluded}`)
  } finally {
    await c.end()
  }
}
main().catch((e) => { console.error('FATAL:', e.message); process.exit(1) })
