import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { proyekMilikTenant } from '../../utils/tenant-guard.js'
import { susunRiwayatHarga, type BarisPembelian } from '../../lib/riwayat-harga.js'

/**
 * RIWAYAT HARGA MATERIAL (F5 PEMBEDA — semula "Eskalasi harga")
 *
 * ── Kenapa namanya bukan "Eskalasi"
 *
 * Triase menamainya eskalasi — kenaikan harga terhadap kontrak lama. Diukur
 * pada data nyata (2026-08-06), arahnya justru kebalikannya: Besi Ø12mm
 * 120.000 (Mar) → 100.000 (Agu), TURUN 16,7%.
 *
 * Layar bernama "eskalasi" menjanjikan kenaikan, dan pembacanya akan
 * menyimpulkan kenaikan bahkan saat angkanya turun. Modul ini netral terhadap
 * arah.
 *
 * ── Kenapa TIDAK ada tabel baru
 *
 * Seluruh datanya sudah ada di `purchase_order_items` + `purchase_orders`.
 * Menyalinnya ke tabel riwayat tersendiri menciptakan sumber kebenaran kedua
 * yang bisa berselisih dengan PO-nya — dan yang paling berkepentingan
 * menyunting riwayat harga adalah orang yang keputusannya sedang dinilai.
 *
 * ── Kenapa read-only
 *
 * Riwayat harga adalah BUKTI. Bukti yang bisa disunting berhenti jadi bukti
 * pada saat pertama seseorang menyuntingnya.
 */
export default async function riwayatHargaRoutes(app: FastifyInstance) {
  // ── GET /api/v1/riwayat-harga ────────────────────────────────────────────
  app.get('/api/v1/riwayat-harga', {
    preHandler: [authenticate, requirePermission('procurement:view')],
  }, async (request, reply) => {
    const q = request.query as Record<string, string>
    const db = request.db!

    const idProyek = await db.projectIds()
    if (idProyek.length === 0) {
      return reply.send({
        material: [], jumlah_naik: 0, jumlah_turun: 0,
        jumlah_satu_titik: 0, jumlah_beda_vendor: 0,
      })
    }

    // Satu proyek diminta? Pastikan ia milik tenant sebelum dipakai menyaring.
    if (q.project_id && !(await proyekMilikTenant(request, q.project_id))) {
      return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
    }

    // PO milik tenant lebih dulu. `purchase_order_items` mewarisi tenancy
    // lewat `po_id`, jadi menanyakan item langsung tanpa daftar PO milik
    // tenant ini akan mengembalikan harga pembelian perusahaan lain —
    // informasi komersial yang paling merugikan kalau bocor.
    let kueriPo = db
      .unsafe('purchase_orders', 'daftar lintas-proyek; viaProject butuh satu project sebagai konteks')
      .select('id, order_date, project_id, supplier_id, status, suppliers ( id, name )')
      .in('project_id', idProyek)
      // PO draft belum tentu jadi pembelian. Menghitungnya membuat harga yang
      // belum disepakati ikut membentuk "riwayat".
      .neq('status', 'draft')

    if (q.project_id) kueriPo = kueriPo.eq('project_id', q.project_id)

    const { data: po, error: e1 } = await kueriPo
    if (e1) return reply.status(500).send({ error: e1.message })

    const daftarPo = (po ?? []) as Array<{
      id: string
      order_date: string
      supplier_id: string | null
      suppliers?: { id: string; name: string } | { id: string; name: string }[] | null
    }>

    if (daftarPo.length === 0) {
      return reply.send({
        material: [], jumlah_naik: 0, jumlah_turun: 0,
        jumlah_satu_titik: 0, jumlah_beda_vendor: 0,
      })
    }

    const satu = <T,>(v: T | T[] | null | undefined): T | null =>
      Array.isArray(v) ? (v[0] ?? null) : (v ?? null)

    const infoPo = new Map(daftarPo.map((p) => [p.id, {
      tanggal: p.order_date,
      supplier_id: p.supplier_id,
      supplier_name: satu(p.suppliers)?.name ?? null,
    }]))

    // Satu query per PO, bukan satu `.in()`: wrapper menyaring per satu nilai
    // `lewat`. Jumlah PO puluhan, bukan ribuan, dan yang ditukar adalah
    // beberapa perjalanan DB demi gerbang tenancy yang tak bisa dilewati.
    const pembelian: BarisPembelian[] = []
    for (const p of daftarPo) {
      const { data, error } = await db
        .viaProject('purchase_order_items', p.id)
        .select('material_id, unit_price, qty_ordered, materials ( id, name, unit )')

      if (error) return reply.status(500).send({ error: error.message })

      const info = infoPo.get(p.id)!
      for (const it of (data ?? []) as Array<{
        material_id: string
        unit_price: number | string
        qty_ordered: number | string | null
        materials?: { id: string; name: string; unit: string | null } | { id: string; name: string; unit: string | null }[] | null
      }>) {
        const m = satu(it.materials)
        pembelian.push({
          material_id: it.material_id,
          material_name: m?.name,
          unit: m?.unit ?? null,
          tanggal: info.tanggal,
          unit_price: it.unit_price,
          supplier_id: info.supplier_id,
          supplier_name: info.supplier_name,
          qty: it.qty_ordered,
        })
      }
    }

    return reply.send(susunRiwayatHarga(pembelian))
  })
}
