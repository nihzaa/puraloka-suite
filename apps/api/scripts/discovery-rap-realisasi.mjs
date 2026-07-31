// ROADMAP #8a — DISCOVERY pemetaan `resources` (RAP) ↔ realisasi belanja.
//
// HANYA SELECT. Tidak menulis, tidak membuat, tidak mengubah apa pun.
//
// Kenapa skrip ini ada. Migrasi 138 (`rap_budget`) sengaja TIDAK membangun
// sambungan ke realisasi belanja, dengan alasan tertulis di berkasnya:
//
//   "titik sambungnya (`resource_id` ↔ material procurement) belum dipastikan,
//    dan menebaknya sekarang berarti menulis join yang harus dibongkar lagi."
//
// Jadi langkah pertama #8 bukan membangun rekonsiliasi, melainkan MENGUKUR:
// seberapa jauh dua registry itu benar-benar bisa dipertemukan pada data nyata.
// Keputusan desainnya menyusul dari angka, bukan dari tebakan.
//
// Yang diukur:
//   1. Ukuran kedua registry + berapa yang benar-benar terpakai
//   2. Kandidat pemetaan by-name (persis / normalized) — beserta yang GAGAL
//   3. Ke mana realisasi belanja sesungguhnya menunjuk (materials? teks bebas?)
//   4. Apakah satuan (`unit`) sepakat — pagu qty tak berarti kalau unitnya beda
//
// Jalankan: node apps/api/scripts/discovery-rap-realisasi.mjs
import 'dotenv/config'
import pg from 'pg'

const url = process.env.DIRECT_URL || process.env.DATABASE_URL
if (!url) {
  console.error('FATAL: DIRECT_URL/DATABASE_URL kosong (cek apps/api/.env)')
  process.exit(1)
}

const c = new pg.Client({ connectionString: url })
await c.connect()

/** Jalankan query; kembalikan [] kalau tabelnya belum ada (bukan fatal). */
async function q(sql, params = []) {
  try {
    const { rows } = await c.query(sql, params)
    return rows
  } catch (e) {
    if (e.code === '42P01') return null // undefined_table
    throw e
  }
}

function judul(t) {
  console.log(`\n${'═'.repeat(72)}\n${t}\n${'═'.repeat(72)}`)
}

try {
  judul('1. UKURAN DUA REGISTRY')

  const res = await q(`
    SELECT category, status, count(*)::int n
      FROM resources GROUP BY 1,2 ORDER BY 1,2`)
  console.log('resources (CECEP, dipakai RAP):')
  if (!res?.length) console.log('  (kosong / tabel tak ada)')
  else res.forEach((r) => console.log(`  ${r.category.padEnd(12)} ${r.status.padEnd(9)} ${r.n}`))

  const mat = await q(`
    SELECT is_active, count(*)::int n FROM materials GROUP BY 1 ORDER BY 1`)
  console.log('\nmaterials (procurement, dipakai belanja):')
  if (!mat?.length) console.log('  (kosong / tabel tak ada)')
  else mat.forEach((r) => console.log(`  is_active=${r.is_active}  ${r.n}`))

  judul('2. YANG BENAR-BENAR TERPAKAI (bukan sekadar terdaftar)')

  const dipakaiRap = await q(`
    SELECT count(DISTINCT resource_id)::int n, count(*)::int baris
      FROM rap_material_line`)
  console.log(`rap_material_line : ${dipakaiRap?.[0]?.baris ?? 0} baris, ` +
              `${dipakaiRap?.[0]?.n ?? 0} resource unik`)

  const dipakaiPo = await q(`
    SELECT count(DISTINCT material_id)::int n, count(*)::int baris
      FROM purchase_order_items`)
  console.log(`purchase_order_items : ${dipakaiPo?.[0]?.baris ?? 0} baris, ` +
              `${dipakaiPo?.[0]?.n ?? 0} material unik`)

  const dipakaiGr = await q(`
    SELECT count(*)::int baris FROM goods_receipt_items`)
  console.log(`goods_receipt_items : ${dipakaiGr?.[0]?.baris ?? 0} baris`)

  judul('3. KANDIDAT PEMETAAN by-name')

  const persis = await q(`
    SELECT count(*)::int n FROM resources r
     WHERE r.category = 'material'
       AND EXISTS (SELECT 1 FROM materials m WHERE lower(trim(m.name)) = lower(trim(r.name)))`)
  const totalResMat = await q(`
    SELECT count(*)::int n FROM resources WHERE category = 'material'`)
  const nTotal = totalResMat?.[0]?.n ?? 0
  const nPersis = persis?.[0]?.n ?? 0
  console.log(`resources(category=material) : ${nTotal}`)
  console.log(`  cocok nama persis (case/spasi-insensitif) : ${nPersis}` +
              (nTotal ? `  (${((nPersis / nTotal) * 100).toFixed(1)}%)` : ''))

  // Yang GAGAL dipetakan justru yang paling informatif — ia menunjukkan apakah
  // penyebabnya beda ejaan (bisa dinormalisasi) atau memang entity berbeda.
  const gagal = await q(`
    SELECT r.code, r.name
      FROM resources r
     WHERE r.category = 'material'
       AND NOT EXISTS (SELECT 1 FROM materials m WHERE lower(trim(m.name)) = lower(trim(r.name)))
     ORDER BY r.name LIMIT 25`)
  if (gagal?.length) {
    console.log(`\n  CONTOH yang TIDAK cocok (maks 25 dari ${nTotal - nPersis}):`)
    gagal.forEach((r) => console.log(`    ${(r.code ?? '-').padEnd(18)} ${r.name}`))
  }

  judul('4. APAKAH SATUAN SEPAKAT?')

  // Pagu = qty × harga. Kalau resource memakai 'kg' dan material 'sak',
  // menjumlahkan realisasi ke pagu menghasilkan angka yang terlihat benar
  // tapi salah — kegagalan paling berbahaya karena tak ada yang error.
  const unit = await q(`
    SELECT r.name, r.code, m.unit AS unit_material,
           (SELECT string_agg(DISTINCT l.unit_code, '/') FROM rap_material_line l
             WHERE l.resource_id = r.id) AS unit_rap
      FROM resources r
      JOIN materials m ON lower(trim(m.name)) = lower(trim(r.name))
     WHERE r.category = 'material'
     LIMIT 30`)
  if (!unit?.length) {
    console.log('  (tak ada pasangan by-name untuk dibandingkan)')
  } else {
    let beda = 0
    for (const u of unit) {
      const tandai = u.unit_rap && u.unit_material &&
        u.unit_rap.toLowerCase() !== u.unit_material.toLowerCase()
      if (tandai) beda++
      console.log(
        `  ${tandai ? '⚠️ ' : '   '}${(u.name ?? '').slice(0, 38).padEnd(40)}` +
        `RAP=${String(u.unit_rap ?? '-').padEnd(10)} MAT=${u.unit_material ?? '-'}`)
    }
    console.log(`\n  Satuan berbeda pada ${beda} dari ${unit.length} pasangan yang diperiksa.`)
  }

  judul('5. KE MANA REALISASI BELANJA MENUNJUK')

  // project_expenses = jalur belanja bebas (nota warung, tanpa PO).
  const pe = await q(`
    SELECT count(*)::int n,
           count(*) FILTER (WHERE project_id IS NOT NULL)::int ada_project
      FROM project_expenses`)
  console.log(`project_expenses : ${pe?.[0]?.n ?? 0} baris ` +
              `(${pe?.[0]?.ada_project ?? 0} punya project_id)`)
  const peKolom = await q(`
    SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name='project_expenses'
       AND column_name ~ 'material|resource|item'`)
  console.log(`  kolom yang menyerempet material/resource: ` +
              `${peKolom?.map((k) => k.column_name).join(', ') || '(TIDAK ADA)'}`)

  const poKolom = await q(`
    SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name='purchase_order_items'
     ORDER BY ordinal_position`)
  console.log(`\npurchase_order_items kolom : ${poKolom?.map((k) => k.column_name).join(', ')}`)

  judul('RINGKASAN UNTUK KEPUTUSAN')
  console.log(
`Pertanyaan yang harus terjawab sebelum menulis join apa pun:
  a. Berapa % resource(material) punya pasangan di materials?      -> ${nTotal ? ((nPersis / nTotal) * 100).toFixed(1) + '%' : 'n/a'}
  b. Kalau rendah: penyebabnya beda ejaan, atau memang entity beda?
  c. Apakah satuan sepakat? (lihat bagian 4 — ini yang paling sunyi kalau salah)
  d. Realisasi mana yang dipakai: PO (komitmen) atau GR (barang diterima)?

Kalau (a) rendah DAN (b) menunjukkan entity berbeda, jawabannya BUKAN join
by-name — melainkan kolom pemetaan eksplisit yang diisi manusia sekali,
lalu dipakai selamanya. Menebak di sini persis yang dilarang migrasi 138.`)
} finally {
  await c.end()
}
