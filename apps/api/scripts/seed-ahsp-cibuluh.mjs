#!/usr/bin/env node
// ============================================================
// SEED AHSP CIBULUH (company) — dari dataset kanonik db/seeds/ahsp-cibuluh-dataset.json
//
// Keputusan founder 2026-07-28:
//   (a) seed Cibuluh SEKARANG (mendahului langkah 7), (b) VERBATIM apa adanya —
//   mega-analisa komposit TIDAK dipecah (dekomposisi = fitur builder belakangan).
//
// Zero-Invention: dataset = ekstraksi verbatim (extractor ter-commit, sha256 di meta).
// Skrip ini TIDAK menghitung/menafsir apa pun — hanya memuat.
//
// PENTING — source & edisi:
//   source        = 'company' (katalog milik proyek, BUKAN salinan resmi SNI)
//   edition_id    = NULL. Guard 117 hanya mewajibkan edisi utk source='national'.
//                   Metode/edisi induk (SNI 2013) dicatat di reference_standard +
//                   notes, BUKAN dengan mengklaim baris ini sebagai edisi resmi.
//   is_import_baseline = true → konten beku (jejak "workbook aslinya bilang apa").
//
// Harga TIDAK di-seed (desain §3.6: harga = sumbu terpisah wilayah+tanggal).
//
// Idempoten: identitas (code, edition_id NULL, source, version) via cek existing.
// Target: DEV (assert ref) atau FP_URL eksplisit.
// ============================================================
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import pg from 'pg'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DEV_REF = 'tgozokxyvwmyvajgqfxw'
const DATASET = resolve(__dirname, '..', '..', '..', 'db', 'seeds', 'ahsp-cibuluh-dataset.json')

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
  const byParity = {}
  for (const a of ds.analyses) byParity[a.parity ?? 'n/a'] = (byParity[a.parity ?? 'n/a'] ?? 0) + 1
  console.log('status paritas:', JSON.stringify(byParity))

  const c = new pg.Client({ connectionString: url })
  await c.connect()
  try {
    const admin = await c.query(
      `SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE r.name='admin' ORDER BY u.created_at LIMIT 1`)
    const adminId = admin.rows[0]?.id ?? null

    // 1. Unit yang dipakai harus sudah ada — fail-loud (nol tebak satuan).
    const needUnits = [...new Set([
      ...ds.resources.map(r => r.unit_code), ...ds.analyses.map(a => a.output_unit),
    ])]
    const have = await c.query(`SELECT code FROM units WHERE code = ANY($1)`, [needUnits])
    const missingUnits = needUnits.filter(u => !have.rows.some(r => r.code === u))
    if (missingUnits.length) throw new Error(`Unit belum ada di DB: ${missingUnits.join(', ')}`)

    // 2. Cost code per sheet Cibuluh (kategori pekerjaan versi proyek).
    const sheets = [...new Set(ds.analyses.map(a => a.sheet))]
    const ccBySheet = {}
    for (const sh of sheets) {
      const code = `CC-CIB-${slug(sh)}`
      await c.query(
        `INSERT INTO cost_codes (code, name, description, created_by)
         VALUES ($1, $2, $3, $4) ON CONFLICT (code) DO NOTHING`,
        [code, sh.trim(), `Kategori pekerjaan workbook Cibuluh — sheet "${sh.trim()}"`, adminId])
      const r = await c.query(`SELECT id FROM cost_codes WHERE code=$1`, [code])
      ccBySheet[sh] = r.rows[0].id
    }
    console.log(`cost codes: ${sheets.length} sheet siap`)

    // 3. Resources — REUSE by (lower(name), unit_code) supaya tak menduplikasi
    //    resource nasional yang sudah ada (mis. "Semen Portland" kg).
    const resIdByCode = {}
    let resNew = 0, resReuse = 0
    for (const r of ds.resources) {
      const found = await c.query(
        `SELECT id FROM resources WHERE lower(name)=lower($1) AND unit_code=$2 LIMIT 1`,
        [r.name, r.unit_code])
      if (found.rows.length) { resIdByCode[r.code] = found.rows[0].id; resReuse++; continue }
      let inserted = null
      for (let sfx = 0; sfx < 5 && !inserted; sfx++) {
        const tryCode = sfx === 0 ? r.code : `${r.code}-${sfx + 1}`
        const ins = await c.query(
          `INSERT INTO resources (code, name, category, unit_code, created_by)
           VALUES ($1,$2,$3,$4,$5) ON CONFLICT (code) DO NOTHING RETURNING id`,
          [tryCode, r.name, r.category, r.unit_code, adminId])
        if (ins.rows.length) inserted = ins.rows[0].id
      }
      if (!inserted) throw new Error(`Gagal insert resource ${r.code} (${r.name})`)
      resIdByCode[r.code] = inserted; resNew++
    }
    console.log(`resources: ${resNew} baru, ${resReuse} reuse (dipakai bersama katalog nasional)`)

    // 4. Assemblies company + komponen (idempoten by identitas).
    let made = 0, skipped = 0
    for (const a of ds.analyses) {
      const exist = await c.query(
        `SELECT id FROM assemblies
         WHERE code=$1 AND edition_id IS NULL AND source='company' AND version_number=1`, [a.code])
      if (exist.rows.length) { skipped++; continue }

      // Provenance metode + status paritas ikut tersimpan sbg catatan (transparan).
      const noteParts = [
        `Sumber: workbook Cibuluh sheet "${a.sheet}" no ${a.source_no}`,
        `Metode: SNI 2013 (BUK 10%, TRUNC Rp10 pada total, tanpa PPN)`,
        `Paritas vs HSP workbook: ${a.parity}`,
      ]
      if (a.workbook_defects?.length) noteParts.push(`Cacat workbook: ${a.workbook_defects.join(' | ')}`)
      if (a.notes) noteParts.push(a.notes)

      const ins = await c.query(
        `INSERT INTO assemblies
           (code, name, cost_code_id, source, reference_standard, version_number,
            waste_factor, sequence, output_unit_code, edition_id, is_import_baseline, created_by)
         VALUES ($1,$2,$3,'company',$4,1,0,$5::jsonb,$6,NULL,true,$7) RETURNING id`,
        [a.code, a.uraian.slice(0, 500), ccBySheet[a.sheet],
         'SNI 2013 (workbook Cibuluh)', JSON.stringify([{ note: noteParts.join(' · ') }]),
         a.output_unit, adminId])
      const asmId = ins.rows[0].id

      const vals = [], params = [asmId]
      let p = 2
      for (let i = 0; i < a.components.length; i++) {
        vals.push(`($1, $${p}, $${p + 1}, ${i})`)
        params.push(resIdByCode[a.components[i].r], a.components[i].k)
        p += 2
      }
      await c.query(
        `INSERT INTO assembly_components (assembly_id, resource_id, coefficient, sort_order)
         VALUES ${vals.join(',')} ON CONFLICT (assembly_id, resource_id) DO NOTHING`, params)
      await c.query(`UPDATE assemblies SET status='active' WHERE id=$1`, [asmId])
      made++
      if (made % 100 === 0) console.log(`  … ${made} assemblies`)
    }
    console.log(`assemblies company: ${made} dibuat+aktif, ${skipped} sudah ada`)

    // 5. Verifikasi + spot-check koefisien DB == dataset
    const va = await c.query(
      `SELECT count(*)::int n FROM assemblies WHERE source='company' AND code LIKE 'CIB-%'`)
    const vc = await c.query(
      `SELECT count(*)::int n FROM assembly_components ac JOIN assemblies a ON a.id=ac.assembly_id
       WHERE a.source='company' AND a.code LIKE 'CIB-%'`)
    console.log(`DB kini: ${va.rows[0].n} assemblies company · ${vc.rows[0].n} komponen`)

    const picks = [ds.analyses[0], ds.analyses[Math.floor(ds.analyses.length / 2)], ds.analyses.at(-1)]
    for (const a of picks) {
      const rows = await c.query(
        `SELECT ac.coefficient::float8 k FROM assemblies asm
         JOIN assembly_components ac ON ac.assembly_id=asm.id
         WHERE asm.code=$1 AND asm.source='company' ORDER BY ac.sort_order`, [a.code])
      // Toleransi = presisi kolom `coefficient NUMERIC(14,6)`. Koefisien hasil
      // pembagian di workbook (mis. 1/2,88 = 0,347222…) TIDAK bisa disimpan penuh
      // di 6 desimal — selisih <= 5e-7 adalah pembulatan kolom, BUKAN data salah.
      const TOL = 5e-7
      const ok = rows.rows.length === a.components.length
        && a.components.every((cmp, i) => Math.abs(rows.rows[i].k - cmp.k) <= TOL)
      console.log(`  spot ${a.code}: ${ok ? 'COCOK' : 'BEDA!'} (${rows.rows.length} komponen)`)
      if (!ok) {
        const bad = a.components
          .map((cmp, i) => ({ i, ds: cmp.k, db: rows.rows[i]?.k }))
          .filter(x => Math.abs((x.db ?? NaN) - x.ds) > TOL)
        throw new Error(`Spot-check gagal di ${a.code}: ${JSON.stringify(bad.slice(0, 3))}`)
      }
    }
    console.log(`excluded (tak di-seed): ${ds.meta.counts.excluded}`)
  } finally {
    await c.end()
  }
}
main().catch((e) => { console.error('FATAL:', e.message); process.exit(1) })
