#!/usr/bin/env node
/**
 * PEMULIHAN — komponen AHSP yang menunjuk sumber daya yang sudah tak ada.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA SKRIP INI ADA, DAN KENAPA TERPISAH DARI SEED
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-09-13:
 *
 *     analisa AHSP (assemblies)      : 3.171
 *     baris komponen                 : 18.533
 *     komponen yang resource-nya ADA :      0
 *
 * Katalog AHSP berdiri UTUH secara struktur dan KOSONG secara isi. Dan ia
 * bukan cuma katalog yang menganggur: **51 baris RAB** menunjuk analisa
 * nasional, dan KELIMA PULUH SATU-nya menghitung dari nol komponen.
 *
 * ── Kenapa `seed-ahsp-full.mjs` tak bisa memperbaikinya
 *
 * Seed itu idempoten pada tingkat ASSEMBLY (baris 135):
 *
 *     if (exist.rows.length) { skipped++; continue }
 *
 * Komponen di-insert SESUDAH cabang itu, jadi analisa yang sudah ada
 * dilewati seluruhnya — termasuk komponennya yang rusak. Idempoten untuk
 * assembly, BUTA untuk komponen. Jalan keduanya melaporkan
 * "2620 sudah ada" lalu spot-check-nya sendiri merah.
 *
 * Memperbaikinya DI DALAM seed akan membuat seed menghapus baris, dan
 * seed yang bisa menghapus adalah alat yang berbeda sifat dari seed yang
 * hanya menambah. Dipisah supaya yang destruktif punya pintunya sendiri.
 *
 * ── Kenapa aman, dan kenapa itu DIUKUR bukan diasumsikan
 *
 *   · yang disentuh HANYA `source='national'` edisi SE-47-2026 yang
 *     komponennya terbukti yatim — analisa `company` (424, 2.706
 *     komponen) tak tersentuh sama sekali;
 *   · seluruh 2.371 resource dataset TERBUKTI sudah ada di basis, jadi
 *     penulisannya tak menebak satu id pun;
 *   · yang dihapus 15.149 dan yang ditulis 15.149 — simetris;
 *   · 51 RAB yang bergantung SUDAH rusak hari ini (diukur: 51 dari 51
 *     berkomponen-hidup NOL), jadi tak ada yang bekerja untuk dirusak.
 *
 * ── Uji-kering secara BAWAAN
 *
 * `--terapkan` untuk benar-benar menulis. Tanpa itu ia cuma melapor.
 * Seluruhnya dalam SATU transaksi: gagal di tengah berarti tak ada yang
 * berubah, bukan katalog setengah jadi.
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
  if (!ed[0]) {
    console.error('❌ edisi SE-47-2026 tak ada. Jalankan seed-ahsp-full.mjs dulu.')
    process.exit(1)
  }
  const edisi = ed[0].id

  /* Peta kode → id resource. Dibaca SEKALI; 2.371 baris. */
  const { rows: res } = await c.query(`SELECT id, code FROM public.resources`)
  const idByCode = new Map(res.map((r) => [r.code, r.id]))

  /* Analisa nasional edisi ini yang komponennya YATIM. */
  const { rows: sasaran } = await c.query(
    `SELECT a.id, a.code,
            (SELECT count(*) FROM public.assembly_components ac
              WHERE ac.assembly_id = a.id)::int AS komp
       FROM public.assemblies a
      WHERE a.edition_id = $1 AND a.source = 'national'
        AND NOT EXISTS (
          SELECT 1 FROM public.assembly_components ac
            JOIN public.resources r ON r.id = ac.resource_id
           WHERE ac.assembly_id = a.id)`,
    [edisi])

  const dsByCode = new Map(ds.analyses.map((a) => [a.code, a]))
  let akanHapus = 0
  let akanTulis = 0
  const tanpaDataset = []
  const resourceHilang = new Set()

  for (const s of sasaran) {
    const a = dsByCode.get(s.code)
    if (!a) { tanpaDataset.push(s.code); continue }
    akanHapus += s.komp
    for (const cmp of a.components) {
      if (!idByCode.has(cmp.r)) resourceHilang.add(cmp.r)
      akanTulis += 1
    }
  }

  console.log('── pulihkan komponen AHSP ──')
  console.log(`  analisa nasional berkomponen YATIM : ${sasaran.length}`)
  console.log(`     ada di dataset                  : ${sasaran.length - tanpaDataset.length}`)
  console.log(`     TIDAK ada di dataset            : ${tanpaDataset.length}  (dilewati)`)
  console.log(`  komponen akan DIHAPUS              : ${akanHapus}`)
  console.log(`  komponen akan DITULIS              : ${akanTulis}`)
  console.log(`  resource dataset yang HILANG       : ${resourceHilang.size}`)

  /*
    Resource yang hilang = penulisan akan menebak id, dan itu justru cara
    membuat yatim baru. Berhenti, jangan tulis sebagian.
  */
  if (resourceHilang.size > 0) {
    console.error(`\n❌ ${resourceHilang.size} kode resource dataset tak ada di basis.`)
    console.error('   Menulis sebagian akan melahirkan yatim BARU — persis yang sedang dipulihkan.')
    console.error('   Contoh: ' + [...resourceHilang].slice(0, 5).join(', '))
    console.error('\n   Jalankan `seed-ahsp-full.mjs` lebih dulu (ia membuat resources).')
    process.exit(1)
  }

  if (akanTulis === 0) {
    console.log('\n✅ Tak ada yang perlu dipulihkan.')
    process.exit(0)
  }

  if (!TERAPKAN) {
    console.log('\nUJI-KERING — tak ada yang ditulis. Pakai --terapkan untuk memulihkan.')
    process.exit(0)
  }

  /*
    SATU transaksi. Gagal di tengah berarti tak ada yang berubah — katalog
    setengah jadi lebih buruk daripada katalog yang jelas rusak, sebab
    yang setengah jadi terlihat sudah pulih.
  */
  await c.query('BEGIN')
  let hapus = 0
  let tulis = 0
  for (const s of sasaran) {
    const a = dsByCode.get(s.code)
    if (!a) continue

    const d = await c.query(
      `DELETE FROM public.assembly_components WHERE assembly_id = $1`, [s.id])
    hapus += d.rowCount ?? 0

    const vals = []
    const params = [s.id]
    let p = 2
    for (let i = 0; i < a.components.length; i++) {
      const cmp = a.components[i]
      vals.push(`($1, $${p}, $${p + 1}, ${i})`)
      params.push(idByCode.get(cmp.r), cmp.k)
      p += 2
    }
    if (vals.length === 0) continue
    const ins = await c.query(
      `INSERT INTO public.assembly_components (assembly_id, resource_id, coefficient, sort_order)
       VALUES ${vals.join(',')}`, params)
    tulis += ins.rowCount ?? 0
  }

  /*
    Verifikasi DI DALAM transaksi, sebelum commit. Kalau hasilnya masih
    yatim, batalkan — jangan menyerahkan katalog yang mengaku pulih.
  */
  const { rows: cek } = await c.query(
    `SELECT count(*)::int n FROM public.assembly_components ac
      WHERE NOT EXISTS (SELECT 1 FROM public.resources r WHERE r.id = ac.resource_id)`)
  if (cek[0].n > 0) {
    await c.query('ROLLBACK')
    console.error(`\n❌ MASIH ${cek[0].n} komponen yatim sesudah penulisan — DIBATALKAN.`)
    process.exit(1)
  }

  await c.query('COMMIT')
  console.log(`\n✅ dihapus ${hapus} · ditulis ${tulis} · nol yatim tersisa.`)
} catch (e) {
  await c.query('ROLLBACK').catch(() => {})
  console.error('❌ GAGAL, dibatalkan seluruhnya:', e.message)
  process.exit(1)
} finally {
  await c.end()
}
