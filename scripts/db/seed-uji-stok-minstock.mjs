#!/usr/bin/env node
/**
 * Data uji stok untuk memverifikasi peringatan `min_stock` di Portal PM.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA SEED INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `MINSTOK-GUDANG-STOK-READONLY` menuntut bukti VISUAL: badge peringatan
 * harus terlihat saat qty on-hand <= min_stock, dibuka sebagai PM.
 *
 * Diukur 2026-09-01: akun `uji.pm.portal@puraloka.test` memegang tiga
 * proyek `[UJI]`, dan ketiganya NOL stok. Enam baris stok yang benar-benar
 * di bawah ambang ada di proyek milik PM lain — tak terlihat oleh akun uji,
 * dan memang tak boleh (penyaringan tenant bekerja sebagaimana mestinya).
 *
 * Tanpa data ini, kriteria verifikasinya tak bisa dipenuhi — dan
 * "diverifikasi lewat kode saja" persis yang dilarang CHARTER §7.
 *
 * ── Tiga baris, bukan satu
 *
 * Satu baris hanya membuktikan badge BISA muncul. Yang perlu dibuktikan
 * juga: ia TIDAK muncul saat tak seharusnya.
 *
 *     di bawah ambang   qty 5   min 20   → badge WAJIB muncul
 *     tepat di ambang   qty 20  min 20   → badge WAJIB muncul (`<=`)
 *     di atas ambang    qty 99  min 20   → badge WAJIB TIDAK muncul
 *
 * Yang ketiga menangkap pagar yang kelewat longgar; tanpanya, `qty <= min`
 * yang keliru ditulis `true` akan lolos sebagai "badge muncul, berhasil".
 *
 * ── Idempoten
 *
 * Semua baris bertanda `[SEED-MINSTOK]` dan dihapus di awal tiap jalan.
 * Aman dijalankan berkali-kali; tak menyentuh material atau stok lain.
 *
 *     node scripts/db/seed-uji-stok-minstock.mjs
 *     node scripts/db/seed-uji-stok-minstock.mjs --bersihkan   # hapus saja
 */
import { buatClient } from './_koneksi.mjs'

const EMAIL_PM = 'uji.pm.portal@puraloka.test'
const TANDA = '[SEED-MINSTOK]'
const BERSIHKAN_SAJA = process.argv.includes('--bersihkan')

/** qty, min_stock, dan apa yang HARUS terjadi — dipakai juga saat verifikasi. */
const BARIS = [
  { nama: `${TANDA} Semen Portland 50kg`, satuan: 'sak', qty: 5, min: 20, harapBadge: true },
  { nama: `${TANDA} Pasir Beton`, satuan: 'm3', qty: 20, min: 20, harapBadge: true },
  { nama: `${TANDA} Batu Split 1-2`, satuan: 'm3', qty: 99, min: 20, harapBadge: false },
]

const c = buatClient()
await c.connect()

try {
  const u = await c.query(`SELECT id FROM public.users WHERE email = $1`, [EMAIL_PM])
  if (u.rowCount === 0) {
    console.error(`❌ Akun ${EMAIL_PM} tak ada — seed dibatalkan.`)
    process.exit(1)
  }

  const p = await c.query(
    `SELECT id, name, company_id FROM public.projects WHERE pm_id = $1 ORDER BY name LIMIT 1`,
    [u.rows[0].id]
  )
  if (p.rowCount === 0) {
    console.error(`❌ ${EMAIL_PM} tak memegang satu proyek pun — seed dibatalkan.`)
    console.error('   Tanpa proyek, stoknya tak akan terlihat oleh akun itu.')
    process.exit(1)
  }
  const proyek = p.rows[0]

  console.log('══ Seed stok uji min_stock ════════════════════════════════════')
  console.log(`  proyek : ${proyek.name}`)
  console.log('')

  /*
    Bersih-bersih DULU, lewat nama bertanda. Menghapus berdasarkan
    project_id akan menyapu stok lain yang mungkin dibuat sesi berikutnya
    di proyek yang sama.
  */
  const hapusStok = await c.query(
    `DELETE FROM public.project_stocks ps
      USING public.materials m
      WHERE ps.material_id = m.id AND m.name LIKE $1`,
    [TANDA + '%']
  )
  const hapusMat = await c.query(`DELETE FROM public.materials WHERE name LIKE $1`, [TANDA + '%'])
  console.log(`  dibersihkan : ${hapusStok.rowCount} stok · ${hapusMat.rowCount} material`)

  if (BERSIHKAN_SAJA) {
    console.log('')
    console.log('✅ Hanya membersihkan (--bersihkan). Nol baris baru dibuat.')
    process.exit(0)
  }

  for (const b of BARIS) {
    const m = await c.query(
      `INSERT INTO public.materials (name, unit, min_stock, company_id)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [b.nama, b.satuan, b.min, proyek.company_id]
    )
    await c.query(
      `INSERT INTO public.project_stocks (project_id, material_id, qty_on_hand, last_updated_at)
       VALUES ($1, $2, $3, now())`,
      [proyek.id, m.rows[0].id, b.qty]
    )
    console.log(`  + ${b.nama.replace(TANDA + ' ', '').padEnd(24)} qty=${String(b.qty).padStart(3)} min=${b.min}  badge ${b.harapBadge ? 'WAJIB muncul' : 'wajib TIDAK muncul'}`)
  }

  console.log('')
  console.log(`✅ ${BARIS.length} baris stok uji siap di "${proyek.name}".`)
  console.log('   Buka /pm-portal/gudang/stok sebagai PM dan LIHAT badge-nya —')
  console.log('   keluaran ini bukan bukti bahwa badge-nya tergambar.')
} finally {
  await c.end()
}
