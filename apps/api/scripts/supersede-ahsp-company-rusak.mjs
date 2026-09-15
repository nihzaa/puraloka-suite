#!/usr/bin/env node
/**
 * PEMULIHAN AHSP COMPANY (Cibuluh) lewat VERSI BARU — bukan menambal yang lama.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA SKRIP INI ADA, TERPISAH DARI `supersede-ahsp-komponen-rusak.mjs`
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Saudaranya memulihkan katalog NASIONAL (R-014, 2026-09-13) dan menyatakan
 * sendiri bahwa company di luar jangkauannya. Catatan penutup R-014 di
 * `RATIFIKASI.md` mendaftar sisa yang TIDAK dipulihkan, dan salah satunya:
 *
 *     "420 analisa company (dataset berbeda)"
 *
 * Akibatnya company tertinggal rusak TOTAL. Diukur 2026-09-15:
 *
 *     company active      : 420 analisa · 2.698 komponen · SEHAT 0
 *     company superseded  :   4 analisa ·     8 komponen · SEHAT 0
 *
 * Nol — bukan sebagian. Setiap komponen analisa perusahaan menunjuk
 * `resources` yang sudah tak ada, dan 23 `estimate_items` yang memakainya
 * menghitung dari nol komponen TANPA satu pun galat.
 *
 * ── DUA lapis, sedangkan pemulihan nasional cuma satu
 *
 * Nasional hanya perlu komponennya ditulis ulang — ke-2.371 resource SE-47
 * masih ada. Untuk Cibuluh TIDAK:
 *
 *     kode CIB-R* dirujuk dataset : 441
 *     ADA di public.resources     :   0   ← seluruhnya ikut hilang
 *
 * Jadi `resources` dibuat lebih dulu; tanpa itu penulisan komponen hanya
 * melahirkan yatim BARU — persis yang sedang dipulihkan.
 *
 * ── Kenapa SUPERSEDE, dan bukan tiga cara lain
 *
 * Ketiganya dicoba pada pemulihan nasional dan DITOLAK basis, masing-masing
 * oleh trigger yang berbeda — dicoba ulang di sini, jawabannya sama:
 *
 *   1. UPDATE/DELETE komponen di tempat → `fn_assembly_component_parent_draft`:
 *      "Komponen hanya bisa diubah saat Assembly berstatus draft."
 *   2. Turunkan status ke `draft`       → `fn_assembly_status_transition`:
 *      "Alur sah: draft→active→superseded (MAJU SAJA)."
 *   3. Hapus lalu seed ulang            → `fn_assembly_no_delete`:
 *      "Supersede, jangan hapus."
 *
 * Ketiganya menunjuk arah yang SAMA, dan arah itu yang ditempuh di sini.
 * Rancangannya tidak menghalangi; ia menjawab.
 *
 * ── Yang dilakukan
 *
 *   · resource CIB-R* yang hilang dibuat lebih dulu (lapis 1);
 *   · v-lama TIDAK disentuh isinya, TIDAK dihapus — hanya di-`superseded`,
 *     transisi yang memang sah. Jejak "workbook bilang apa" tetap utuh;
 *   · v-baru lahir `draft` berisi komponen dari dataset, lalu di-`active`;
 *   · `estimate_items` yang menunjuk v-lama dialihkan ke v-baru — tanpa ini
 *     seluruh pekerjaan ini tak mengubah apa pun yang dilihat orang.
 *
 * ⚠ `version_number` v-baru = **MAX(versi kode itu) + 1**, bukan dipaku 2 dan
 * bukan pula `versi-baris-ini + 1`. Ketiganya pernah saya tulis, dan dua yang
 * pertama SALAH:
 *
 *   · dipaku 2      → menabrak koreksi migrasi 141 yang sudah memakai v2;
 *   · v-ini + 1     → mengandaikan baris AKTIF selalu versi tertinggi.
 *     Tidak. Diukur 2026-09-16, `CIB-BGK-B.3` berversi 1·2·3 dengan
 *     status superseded·ACTIVE·superseded — v-aktifnya 2, tertingginya 3.
 *     `2 + 1 = 3` menabrak v3 yang sudah ada.
 *
 * Galatnya menuduh BARIS BARU (`duplicate key … assembly_identity`), bukan
 * penomoran versinya, jadi arah perbaikannya tak terbaca dari pesan itu.
 * Karena itu maksimum dibaca dari basis per-kode, sekali, di muka.
 *
 * ⚠ `is_import_baseline` v-baru diisi FALSE — baseline adalah jejak impor
 * pertama; menandai versi perbaikan sebagai baseline mengaburkan mana yang
 * benar-benar datang dari workbook.
 *
 * ⚠ `edition_id` company adalah NULL (Cibuluh tak terikat edisi SE) dan
 * disalin apa adanya. `NULLS NOT DISTINCT` pada unik identitas berarti NULL
 * tetap dihitung — karena itu versinya wajib naik.
 *
 * ⚠ RAB yang versinya `under_review`/disetujui SENGAJA dilewati:
 * `fn_estimate_item_parent_draft` membekukannya, dan pembekuan itu justru
 * melindungi angka yang sedang dilihat orang untuk mengambil keputusan.
 * Yang dilewati DILAPORKAN, bukan didiamkan.
 *
 * Uji-kering secara BAWAAN. `--terapkan` untuk menulis. Satu transaksi,
 * dengan verifikasi SEBELUM commit: katalog yang MENGAKU pulih lebih
 * berbahaya daripada katalog yang jelas rusak.
 */
import { readFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buatClient } from '../../../scripts/db/_koneksi.mjs'

const AKAR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const DATASET = join(AKAR, 'db', 'seeds', 'ahsp-cibuluh-dataset.json')
const TERAPKAN = process.argv.includes('--terapkan')

const ds = JSON.parse(readFileSync(DATASET, 'utf8'))
const c = buatClient()
await c.connect()

try {
  const { rows: adm } = await c.query(
    `SELECT u.id FROM public.users u JOIN public.roles r ON r.id = u.role_id
      WHERE r.name = 'admin' AND u.is_active ORDER BY u.created_at LIMIT 1`)
  if (!adm[0]) { console.error('❌ tak ada admin aktif untuk dicatat sebagai pembuat.'); process.exit(1) }
  const adminId = adm[0].id

  /* ── Lapis 1: resource yang hilang ─────────────────────────────────── */
  const kodeDs = ds.resources.map((r) => r.code)
  const { rows: adaRes } = await c.query(
    `SELECT code FROM public.resources WHERE code = ANY($1)`, [kodeDs])
  const sudahAda = new Set(adaRes.map((r) => r.code))
  const resBaru = ds.resources.filter((r) => !sudahAda.has(r.code))

  /* Satuan diperiksa DULU supaya gagalnya menyebut satuan yang kurang,
     bukan galat FK mentah yang menuduh barisnya. */
  const satuan = [...new Set(ds.resources.map((r) => r.unit_code))]
  const { rows: adaU } = await c.query(
    `SELECT code FROM public.units WHERE code = ANY($1)`, [satuan])
  const satuanHilang = satuan.filter((s) => !adaU.some((u) => u.code === s))

  /* ── Lapis 2: analisa company AKTIF yang komponennya yatim ──────────── */
  const { rows: vLama } = await c.query(
    `SELECT a.id, a.code, a.name, a.cost_code_id, a.reference_standard,
            a.version_number, a.waste_factor, a.sequence, a.output_unit_code,
            a.edition_id, a.company_id
       FROM public.assemblies a
      WHERE a.source = 'company' AND a.status = 'active'
        AND EXISTS (SELECT 1 FROM public.assembly_components ac
                     WHERE ac.assembly_id = a.id)
        AND NOT EXISTS (
          SELECT 1 FROM public.assembly_components ac
            JOIN public.resources r ON r.id = ac.resource_id
           WHERE ac.assembly_id = a.id)
      ORDER BY a.code`)

  const dsByCode = new Map(ds.analyses.map((a) => [a.code, a]))
  const tanpaDataset = []
  const hilang = new Set()
  let akanTulis = 0
  let sasaran = 0
  for (const a of vLama) {
    const d = dsByCode.get(a.code)
    if (!d) { tanpaDataset.push(a.code); continue }
    sasaran += 1
    akanTulis += d.components.length
    for (const cmp of d.components) {
      if (!sudahAda.has(cmp.r) && !resBaru.some((r) => r.code === cmp.r)) hilang.add(cmp.r)
    }
  }

  /* RAB yang bergantung — dipisah draft vs beku supaya yang tak bisa
     dialihkan terlihat, bukan hilang dalam satu angka. */
  const { rows: rab } = await c.query(
    `SELECT ev.status, count(*)::int n
       FROM public.estimate_items ei
       JOIN public.assemblies a ON a.id = ei.assembly_id AND a.source = 'company'
       JOIN public.estimate_versions ev ON ev.id = ei.estimate_version_id
      GROUP BY 1`)

  console.log('── supersede komponen AHSP company (Cibuluh) ──')
  console.log(`  resource dataset                   : ${ds.resources.length}`)
  console.log(`     sudah ada di basis              : ${sudahAda.size}`)
  console.log(`     akan DIBUAT                     : ${resBaru.length}`)
  console.log(`  analisa company AKTIF berkomponen YATIM : ${vLama.length}`)
  console.log(`     ada di dataset                  : ${sasaran}`)
  console.log(`     TIDAK ada di dataset            : ${tanpaDataset.length}  (dilewati, bukan dihapus)`)
  console.log(`  versi baru akan DIBUAT             : ${sasaran}`)
  console.log(`  komponen akan DITULIS              : ${akanTulis}`)
  console.log(`  resource dataset HILANG            : ${hilang.size}`)
  for (const r of rab) {
    console.log(`  RAB memakai analisa company        : ${r.n} (versi ${r.status})` +
      (r.status === 'draft' ? '  ← akan dialihkan' : '  ← BEKU, dilewati'))
  }

  if (satuanHilang.length > 0) {
    console.error(`\n❌ ${satuanHilang.length} satuan dataset tak ada di tabel units: ${satuanHilang.join(', ')}`)
    process.exit(1)
  }
  if (hilang.size > 0) {
    console.error(`\n❌ ${hilang.size} kode resource tak terpetakan — penulisan akan melahirkan yatim BARU.`)
    console.error('   Contoh: ' + [...hilang].slice(0, 5).join(', '))
    process.exit(1)
  }
  if (sasaran === 0 && resBaru.length === 0) {
    console.log('\n✅ Tak ada yang perlu dipulihkan.')
    process.exit(0)
  }
  if (!TERAPKAN) {
    console.log('\nUJI-KERING — tak ada yang ditulis. Pakai --terapkan.')
    process.exit(0)
  }

  await c.query('BEGIN')

  /* Lapis 1 — resources. ON CONFLICT DO NOTHING: idempoten, dan resource
     yang sudah ada TIDAK ditimpa (namanya bisa saja sudah disunting). */
  let resDitulis = 0
  if (resBaru.length > 0) {
    const vals = []
    const params = []
    let p = 1
    for (const r of resBaru) {
      vals.push(`($${p}, $${p + 1}, $${p + 2}, $${p + 3})`)
      params.push(r.code, r.name, r.category, r.unit_code)
      p += 4
    }
    const ins = await c.query(
      `INSERT INTO public.resources (code, name, category, unit_code)
       VALUES ${vals.join(',')} ON CONFLICT (code) DO NOTHING`, params)
    resDitulis = ins.rowCount ?? 0
  }

  /* Peta kode → id dibaca SESUDAH lapis 1 supaya yang baru lahir ikut. */
  const { rows: semuaRes } = await c.query(
    `SELECT id, code FROM public.resources WHERE code = ANY($1)`, [kodeDs])
  const idByCode = new Map(semuaRes.map((r) => [r.code, r.id]))
  const takTerpeta = kodeDs.filter((k) => !idByCode.has(k))
  if (takTerpeta.length > 0) {
    await c.query('ROLLBACK')
    console.error(`\n❌ ${takTerpeta.length} kode resource tak terpetakan sesudah insert — DIBATALKAN.`)
    process.exit(1)
  }

  /*
    Versi TERTINGGI per kode, dibaca SEKALI di muka — termasuk baris
    `superseded`, sebab unik `assembly_identity` tak peduli status.
    Dinaikkan di memori tiap kali sebuah versi baru lahir, supaya dua
    analisa berkode sama dalam satu jalan pun tak bertabrakan.
  */
  const { rows: maksVersi } = await c.query(
    `SELECT code, max(version_number) AS maks
       FROM public.assemblies WHERE source = 'company' GROUP BY code`)
  const maksByCode = new Map(maksVersi.map((r) => [r.code, Number(r.maks)]))

  /* Lapis 2 — versi baru per analisa. */
  let dibuat = 0
  let dialihkan = 0
  for (const a of vLama) {
    const d = dsByCode.get(a.code)
    if (!d) continue

    /* Naikkan dari maksimum kode ini, lalu catat kembali — bukan dari versi
       baris yang sedang di-supersede (baris aktif belum tentu tertinggi). */
    const versiBaru = (maksByCode.get(a.code) ?? a.version_number ?? 1) + 1
    maksByCode.set(a.code, versiBaru)

    /* 1. v-baru lahir DRAFT — satu-satunya status yang boleh menerima
          komponen. `sequence` di-stringify lalu di-cast: nilai array JS
          dikirim pg sebagai literal array Postgres, bukan jsonb, dan
          melanggar CHECK `jsonb_typeof = 'array'` dengan galat yang
          menuduh baris barunya. */
    const { rows: baru } = await c.query(
      `INSERT INTO public.assemblies
         (code, name, cost_code_id, source, reference_standard, version_number,
          waste_factor, sequence, output_unit_code, edition_id,
          is_import_baseline, status, created_by, company_id)
       VALUES ($1,$2,$3,'company',$4,$5,$6,$7::jsonb,$8,$9,false,'draft',$10,$11)
       RETURNING id`,
      [a.code, a.name, a.cost_code_id, a.reference_standard,
       versiBaru, a.waste_factor ?? 0,
       JSON.stringify(a.sequence ?? []), a.output_unit_code, a.edition_id,
       adminId, a.company_id])
    const v2 = baru[0].id

    /* 2. komponen — selagi masih draft. */
    const vals = []
    const params = [v2]
    let p = 2
    for (let i = 0; i < d.components.length; i++) {
      const cmp = d.components[i]
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

    /* 4. RAB dialihkan SEBELUM v-lama dipensiunkan, dan HANYA yang
          versinya masih draft — yang beku memang tak boleh bergeser. */
    const alih = await c.query(
      `UPDATE public.estimate_items ei SET assembly_id = $1
         WHERE ei.assembly_id = $2
           AND EXISTS (SELECT 1 FROM public.estimate_versions ev
                        WHERE ev.id = ei.estimate_version_id
                          AND ev.status = 'draft')`, [v2, a.id])
    dialihkan += alih.rowCount ?? 0

    /* 5. v-lama → superseded. Isinya utuh; jejaknya tak hilang. */
    await c.query(`UPDATE public.assemblies SET status='superseded' WHERE id=$1`, [a.id])
    dibuat += 1
  }

  /* Verifikasi DI DALAM transaksi — hanya analisa company yang punya
     komponen; yang memang tak berkomponen bukan urusan skrip ini. */
  const { rows: cek } = await c.query(
    `SELECT count(*)::int n FROM public.assemblies a
      WHERE a.source='company' AND a.status='active'
        AND EXISTS (SELECT 1 FROM public.assembly_components ac
                     WHERE ac.assembly_id = a.id)
        AND NOT EXISTS (
          SELECT 1 FROM public.assembly_components ac
            JOIN public.resources r ON r.id = ac.resource_id
           WHERE ac.assembly_id = a.id)`)
  if (cek[0].n > 0) {
    await c.query('ROLLBACK')
    console.error(`\n❌ MASIH ${cek[0].n} analisa company aktif berkomponen yatim — DIBATALKAN.`)
    process.exit(1)
  }

  await c.query('COMMIT')
  console.log(`\n✅ resource dibuat ${resDitulis} · versi baru ${dibuat} · RAB dialihkan ${dialihkan} · nol yatim company aktif.`)
} catch (e) {
  await c.query('ROLLBACK').catch(() => {})
  console.error('❌ GAGAL, dibatalkan seluruhnya:', e.message)
  process.exit(1)
} finally {
  await c.end()
}
