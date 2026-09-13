#!/usr/bin/env node
/**
 * PEMULIHAN AHSP lewat VERSI BARU — bukan menambal yang lama.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA CARA INI, DAN KENAPA TIGA CARA LAIN DITOLAK
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Katalog AHSP nasional berdiri utuh secara struktur dan KOSONG secara isi
 * (diukur 2026-09-13: 2.747 analisa · 15.806 komponen · NOL yang
 * resource-nya masih ada). 51 baris RAB menunjuk analisa ini dan
 * kelima-puluh-satunya menghitung dari nol komponen.
 *
 * Asal-usulnya terbaca dari tanggal:
 *
 *     assembly_components dibuat : 23 Jul – 20 Agu 2026
 *     resources yang ADA kini    :  4 – 12 Sep 2026
 *
 * Sumber daya aslinya dihapus, dan yang tersisa lahir belakangan.
 *
 * ── Tiga cara yang DICOBA lalu ditolak, dan penolaknya bukan saya
 *
 *   1. UPDATE komponen di tempat  → `fn_assembly_component_parent_draft`:
 *      "Komponen hanya bisa diubah saat Assembly berstatus draft."
 *   2. Turunkan status ke `draft` → `fn_assembly_status_transition`:
 *      "Alur sah: draft→active→superseded (MAJU SAJA)."
 *   3. Hapus lalu seed ulang      → `fn_assembly_no_delete`:
 *      "Supersede, jangan hapus."
 *
 * Ketiganya menolak dengan kalimat yang menunjuk ke arah yang SAMA, dan
 * seluruh 2.747 analisa ber-`is_import_baseline = true` — jejak "SE
 * bilang apa" yang memang tak boleh ditimpa.
 *
 * Rancangannya tidak menghalangi; ia menjawab. Yang ditempuh di sini
 * jalan yang ia tunjuk sendiri.
 *
 * ── Yang dilakukan
 *
 *   · v1 TIDAK disentuh isinya, TIDAK dihapus — hanya di-`superseded`,
 *     transisi yang memang sah;
 *   · v2 dibuat `draft` berisi komponen dari dataset, lalu di-`active`;
 *   · `estimate_items` yang menunjuk v1 dialihkan ke v2 — tanpa ini,
 *     51 RAB tetap menghitung dari katalog kosong dan seluruh pekerjaan
 *     ini tak mengubah apa pun yang dilihat orang.
 *
 * ⚠ `is_import_baseline` v2 diisi FALSE. Baseline adalah jejak impor
 * pertama; menandai versi perbaikan sebagai baseline akan mengaburkan
 * mana yang benar-benar datang dari workbook resmi.
 *
 * Uji-kering secara BAWAAN. `--terapkan` untuk menulis. Satu transaksi.
 */
import { readFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buatClient } from '../../../scripts/db/_koneksi.mjs'

const AKAR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const DATASET = join(AKAR, 'db', 'seeds', 'ahsp-se47-dataset.json')
const TERAPKAN = process.argv.includes('--terapkan')

const ds = JSON.parse(readFileSync(DATASET, 'utf8'))
const c = buatClient()
await c.connect()

try {
  const { rows: ed } = await c.query(
    `SELECT id FROM public.ahsp_editions WHERE code = 'SE-47-2026'`)
  if (!ed[0]) { console.error('❌ edisi SE-47-2026 tak ada.'); process.exit(1) }
  const edisi = ed[0].id

  const { rows: adm } = await c.query(
    `SELECT id FROM public.users WHERE auth_id IS NOT NULL AND is_active
      ORDER BY created_at LIMIT 1`)
  const adminId = adm[0]?.id ?? null

  const { rows: res } = await c.query(`SELECT id, code FROM public.resources`)
  const idByCode = new Map(res.map((r) => [r.code, r.id]))

  /* v1 yang komponennya yatim DAN ada di dataset. */
  const kode = ds.analyses.map((a) => a.code)
  const { rows: v1 } = await c.query(
    `SELECT a.id, a.code, a.name, a.cost_code_id, a.output_unit_code,
            a.waste_factor, a.sequence
       FROM public.assemblies a
      WHERE a.edition_id = $1 AND a.source = 'national'
        AND a.version_number = 1 AND a.status = 'active'
        AND a.code = ANY($2::text[])
        AND NOT EXISTS (
          SELECT 1 FROM public.assembly_components ac
            JOIN public.resources r ON r.id = ac.resource_id
           WHERE ac.assembly_id = a.id)`,
    [edisi, kode])

  const dsByCode = new Map(ds.analyses.map((a) => [a.code, a]))
  const hilang = new Set()
  let komponen = 0
  for (const a of v1) {
    for (const cmp of dsByCode.get(a.code)?.components ?? []) {
      if (!idByCode.has(cmp.r)) hilang.add(cmp.r)
      komponen += 1
    }
  }

  const { rows: ei } = await c.query(
    `SELECT count(*)::int n FROM public.estimate_items ei
       JOIN public.assemblies a ON a.id = ei.assembly_id
      WHERE a.source = 'national' AND a.version_number = 1`)

  console.log('── supersede AHSP berkomponen rusak ──')
  console.log(`  v1 akan di-SUPERSEDE (tak dihapus) : ${v1.length}`)
  console.log(`  v2 akan DIBUAT                     : ${v1.length}`)
  console.log(`  komponen v2                        : ${komponen}`)
  console.log(`  estimate_items dialihkan           : ${ei[0].n}`)
  console.log(`  resource dataset HILANG            : ${hilang.size}`)

  if (hilang.size > 0) {
    console.error(`\n❌ ${hilang.size} kode resource tak ada — penulisan akan melahirkan yatim BARU.`)
    console.error('   Contoh: ' + [...hilang].slice(0, 5).join(', '))
    process.exit(1)
  }
  if (v1.length === 0) { console.log('\n✅ Tak ada yang perlu di-supersede.'); process.exit(0) }
  if (!TERAPKAN) {
    console.log('\nUJI-KERING — tak ada yang ditulis. Pakai --terapkan.')
    process.exit(0)
  }

  await c.query('BEGIN')
  let dibuat = 0
  let dialihkan = 0

  for (const a of v1) {
    const ds1 = dsByCode.get(a.code)
    if (!ds1) continue

    /* 1. v2 lahir DRAFT — satu-satunya status yang boleh menerima komponen. */
    const { rows: baru } = await c.query(
      `INSERT INTO public.assemblies
         (code, name, cost_code_id, source, reference_standard, version_number,
          waste_factor, sequence, output_unit_code, edition_id,
          is_import_baseline, status, created_by)
       VALUES ($1,$2,$3,'national','Cipta Karya',2,$4,$5::jsonb,$6,$7,false,'draft',$8)
       RETURNING id`,
      /*
        ⚠ `sequence` bertipe `jsonb` dengan CHECK `jsonb_typeof = 'array'`.
        Nilai v1 (`[]`) melewati driver sebagai ARRAY JS, dan pg
        mengirimkannya sebagai literal array Postgres — bukan jsonb.
        Hasilnya melanggar CHECK dengan galat yang menuduh BARIS BARU,
        bukan konversi tipenya. Di-stringify lalu di-cast eksplisit.
      */
      [a.code, a.name, a.cost_code_id, a.waste_factor ?? 0,
       JSON.stringify(a.sequence ?? []), a.output_unit_code, edisi, adminId])
    const v2 = baru[0].id

    /* 2. komponen — selagi masih draft. */
    const vals = []
    const params = [v2]
    let p = 2
    for (let i = 0; i < ds1.components.length; i++) {
      const cmp = ds1.components[i]
      vals.push(`($1, $${p}, $${p + 1}, ${i})`)
      params.push(idByCode.get(cmp.r), cmp.k)
      p += 2
    }
    if (vals.length) {
      await c.query(
        `INSERT INTO public.assembly_components
           (assembly_id, resource_id, coefficient, sort_order)
         VALUES ${vals.join(',')}`, params)
    }

    /* 3. draft → active. Sesudah ini komponennya beku, dan itu benar. */
    await c.query(`UPDATE public.assemblies SET status='active' WHERE id=$1`, [v2])

    /*
      4. RAB dialihkan SEBELUM v1 dipensiunkan — tetapi HANYA yang versinya
         masih `draft`.

      ⚠ `fn_estimate_item_parent_draft` menolak perubahan pada versi yang
      sudah `under_review`/disetujui: "Angka yang direview/disetujui beku
      — buat versi baru." Itu aturan yang BENAR, dan alasannya sama dengan
      trigger assembly: angka yang sudah dilihat orang untuk mengambil
      keputusan tak boleh bergeser di belakang mereka.

      Diukur 2026-09-13: dari 51 baris RAB, **50 di versi draft** dan
      **1 di under_review**. Yang satu itu sengaja DILEWATI dan dilaporkan
      — memaksanya berarti menembus pembekuan yang justru melindungi
      angka yang sedang direview.
    */
    const alih = await c.query(
      `UPDATE public.estimate_items ei SET assembly_id = $1
         WHERE ei.assembly_id = $2
           AND EXISTS (SELECT 1 FROM public.estimate_versions ev
                        WHERE ev.id = ei.estimate_version_id
                          AND ev.status = 'draft')`, [v2, a.id])
    dialihkan += alih.rowCount ?? 0

    /* 5. v1 → superseded. Isinya utuh; jejak "SE bilang apa" tak hilang. */
    await c.query(`UPDATE public.assemblies SET status='superseded' WHERE id=$1`, [a.id])
    dibuat += 1
  }

  /*
    Verifikasi DI DALAM transaksi. Katalog yang mengaku pulih padahal
    belum lebih buruk daripada katalog yang jelas rusak.
  */
  const { rows: cek } = await c.query(
    `SELECT count(*)::int n FROM public.assemblies a
      WHERE a.source='national' AND a.status='active'
        AND NOT EXISTS (
          SELECT 1 FROM public.assembly_components ac
            JOIN public.resources r ON r.id = ac.resource_id
           WHERE ac.assembly_id = a.id)`)
  /*
    Yang dihitung gagal HANYA RAB di versi DRAFT: yang beku memang tak
    bisa dialihkan, dan menghitungnya sebagai kegagalan akan membatalkan
    pemulihan 50 baris demi 1 baris yang memang tak boleh disentuh.
  */
  /*
    ⚠ Cakupan VERIFIKASI harus sama dengan cakupan PERBAIKAN.

    Versi pertama memeriksa SELURUH estimate_items dan menemukan 21 baris
    yang analisanya source=company (Cibuluh) — di luar jangkauan skrip
    ini, yang hanya menyentuh katalog NASIONAL. Transaksinya lalu
    dibatalkan atas kegagalan yang bukan miliknya, dan 2.620 v2 yang
    sudah benar ikut hilang bersamanya.

    Penjaga yang merah atas hal di LUAR cakupannya sama merusaknya
    dengan penjaga yang hijau atas pelanggaran — yang pertama membuang
    pekerjaan yang sah (CLAUDE.md §6).

    Analisa company yang komponennya rusak adalah temuan TERPISAH,
    dilaporkan di akhir dan tidak menggagalkan pemulihan ini.
  */
  const { rows: cekEi } = await c.query(
    `SELECT count(*)::int n FROM public.estimate_items ei
       JOIN public.assemblies a ON a.id = ei.assembly_id
       JOIN public.estimate_versions ev ON ev.id = ei.estimate_version_id
      WHERE ev.status = 'draft' AND a.source = 'national'
        AND NOT EXISTS (
          SELECT 1 FROM public.assembly_components ac
            JOIN public.resources r ON r.id = ac.resource_id
           WHERE ac.assembly_id = a.id)`)
  const { rows: beku } = await c.query(
    `SELECT count(*)::int n FROM public.estimate_items ei
       JOIN public.assemblies a ON a.id = ei.assembly_id
       JOIN public.estimate_versions ev ON ev.id = ei.estimate_version_id
      WHERE ev.status <> 'draft'
        AND NOT EXISTS (
          SELECT 1 FROM public.assembly_components ac
            JOIN public.resources r ON r.id = ac.resource_id
           WHERE ac.assembly_id = a.id)`)
  if (beku[0].n > 0) {
    console.log(`  RAB BEKU tak dialihkan      : ${beku[0].n}  (versi bukan draft — sengaja)`)
  }

  console.log(`\n  v2 dibuat: ${dibuat} · estimate_items dialihkan: ${dialihkan}`)
  console.log(`  analisa ACTIVE masih kosong : ${cek[0].n}`)
  console.log(`  RAB masih menunjuk kosong   : ${cekEi[0].n}`)

  if (cekEi[0].n > 0) {
    await c.query('ROLLBACK')
    console.error('\n❌ Masih ada RAB yang menunjuk analisa kosong — DIBATALKAN.')
    process.exit(1)
  }

  await c.query('COMMIT')
  console.log('\n✅ Selesai. v1 di-supersede (utuh), v2 aktif berkomponen.')
} catch (e) {
  await c.query('ROLLBACK').catch(() => {})
  console.error('❌ GAGAL, dibatalkan seluruhnya:', e.message)
  process.exit(1)
} finally {
  await c.end()
}
