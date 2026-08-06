import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { proyekMilikTenant } from '../../utils/tenant-guard.js'
import { hitungRekonsiliasi } from '../../lib/rekonsiliasi-material.js'

/**
 * REKONSILIASI MATERIAL (F5 PEMBEDA — rekonsiliasi material 1,5/5)
 *
 * ── Kenapa modul ini ada
 *
 * `PETA-PRIORITAS-ERP.md` menilai rekonsiliasi material sebagai pembeda
 * PALING LEMAH, dan menyebutnya "titik kebocoran terbesar kontraktor".
 *
 * Empat angka yang dibutuhkan sudah tersimpan rapi di basis, dan tak pernah
 * satu kali pun diadu:
 *
 *   project_rab_materials.rab_quantity  yang SEHARUSNYA dipakai
 *   goods_receipt_items.qty_received    yang DIBELI dan sampai
 *   stock_movements(type='usage')       yang DIPAKAI di lapangan
 *   project_stocks.qty_on_hand          yang MASIH di gudang
 *
 * Tanpa perhitungan ini, semen yang hilang 8 sak terlihat persis sama dengan
 * semen yang habis terpakai — dan tak ada satu pun layar yang membedakannya.
 *
 * ── Kenapa read-only
 *
 * Modul ini TIDAK mengubah apa pun. Ia hanya membaca dan membandingkan.
 * Angka susut yang bisa disunting berhenti menjadi bukti pada saat pertama
 * seseorang menyuntingnya — dan yang paling berkepentingan menyuntingnya
 * adalah orang yang angkanya sedang menuduh.
 */
export default async function rekonsiliasiMaterialRoutes(app: FastifyInstance) {
  // ── GET /api/v1/projects/:projectId/rekonsiliasi-material ────────────────
  app.get('/api/v1/projects/:projectId/rekonsiliasi-material', {
    preHandler: [authenticate, requirePermission('procurement:view')],
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string }
    const q = request.query as Record<string, string>

    // Gerbang tenancy di lapis aplikasi, sebelum satu query pun jalan.
    if (!(await proyekMilikTenant(request, projectId))) {
      // 404, bukan 403: membedakan "tidak ada" dari "bukan milik Anda"
      // memberi tahu penanya bahwa proyek itu ADA di tenant lain.
      return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
    }

    const db = request.db!

    // Ambang bisa ditimpa lewat query — keramik dan besi beton punya susut
    // wajar yang berbeda jauh, dan satu angka untuk semuanya menuduh yang
    // salah. Nilai tak masuk akal diabaikan, bukan diteruskan.
    const parseAmbang = (v: string | undefined): number | undefined => {
      const n = Number(v)
      return Number.isFinite(n) && n >= 0 && n <= 100 ? n : undefined
    }

    // ── 1. Kebutuhan teoritis (RAB) ────────────────────────────────────────
    const { data: teoritis, error: e1 } = await db
      .viaProject('project_rab_materials', projectId)
      .select('material_id, rab_quantity, materials ( id, name, unit )')

    if (e1) return reply.status(500).send({ error: e1.message })

    // ── 2. Yang dibeli ─────────────────────────────────────────────────────
    //
    // `goods_receipt_items` mewarisi tenancy lewat `gr_id`, bukan
    // `project_id` — jadi GR-nya diambil lebih dulu. Menanyakan item
    // langsung tanpa daftar GR milik tenant ini akan mengembalikan barang
    // yang diterima proyek orang lain.
    const { data: gr, error: e2 } = await db
      .viaProject('goods_receipts', projectId)
      .select('id, status')

    if (e2) return reply.status(500).send({ error: e2.message })

    // Hanya GR yang SUDAH dikonfirmasi dihitung sebagai "dibeli".
    //
    // GR draft adalah barang yang belum dipastikan diterima. Menghitungnya
    // membuat setiap penerimaan yang belum diperiksa muncul sebagai susut
    // sampai seseorang menekan tombol konfirmasi.
    const idGrSah = (gr ?? [])
      .filter((g: { status: string | null }) => g.status === 'confirmed')
      .map((g: { id: string }) => g.id)

    // `viaProject('goods_receipt_items', grId)` menyaring lewat kolom `lewat`
    // dari katalog — untuk tabel ini `gr_id`, bukan `project_id`. Namanya
    // menyesatkan, perilakunya tepat.
    //
    // Satu query per GR, bukan satu `.in()`: wrapper menyaring per satu nilai
    // `lewat`. Jumlah GR per proyek puluhan, bukan ribuan, dan yang ditukar
    // adalah beberapa perjalanan DB demi gerbang tenancy yang tak bisa
    // dilewati — bukan pertukaran yang sepadan untuk dibalik.
    const dibeli: Array<{ material_id: string; qty_received: number | string | null }> = []
    for (const grId of idGrSah) {
      const { data, error } = await db
        .viaProject('goods_receipt_items', grId)
        .select('material_id, qty_received')
      if (error) return reply.status(500).send({ error: error.message })
      dibeli.push(...((data ?? []) as typeof dibeli))
    }

    // ── 2b. Material MILIK KLIEN (free issue) — bukan pembelian kita ───────
    //
    // Tabel tersendiri, bukan penanda di `goods_receipts`: penerimaan material
    // owner memang bukan penerimaan pembelian — tak punya PO, tak punya
    // supplier, tak pernah dibayar. Rinciannya di migrasi 194.
    //
    // Dipisahkan, bukan DIBUANG: barangnya nyata ada di gudang, jadi kalau ia
    // hilang dari laporan, `sisa` akan terbaca sebagai kelebihan yang tak
    // berasal dari mana pun.
    const { data: klien, error: eKlien } = await db
      .viaProject('penerimaan_material_klien', projectId)
      .select('material_id, qty')

    if (eKlien) return reply.status(500).send({ error: eKlien.message })

    const dariKlien = ((klien ?? []) as Array<{ material_id: string; qty: number | string | null }>)
      .map((k) => ({ material_id: k.material_id, qty_received: k.qty }))

    // ── 3. Yang dipakai ────────────────────────────────────────────────────
    const { data: gerak, error: e3 } = await db
      .viaProject('stock_movements', projectId)
      .select('material_id, qty, movement_type')
      .eq('movement_type', 'usage')

    if (e3) return reply.status(500).send({ error: e3.message })

    // ── 4. Yang masih di gudang ────────────────────────────────────────────
    const { data: sisa, error: e4 } = await db
      .viaProject('project_stocks', projectId)
      .select('material_id, qty_on_hand')

    if (e4) return reply.status(500).send({ error: e4.message })

    // ── 5. Yang PINDAH ke/dari proyek lain ─────────────────────────────────
    //
    // Tanpa ini, material yang dikirim ke proyek sebelah terbaca sebagai susut.
    // Diukur pada data sungguhan (2026-08-06): memindahkan 10 batang besi
    // mengubah barisnya dari `selisih 0 / susut 0%` jadi `selisih 10 / susut
    // 5%` — satu batang lagi dan ia jadi "Susut tinggi", menuduh mandor atas
    // barang yang ia kirim atas perintah kantor.
    //
    // Kedua arah diambil: `transfer_out` (negatif) DAN `transfer_in` (positif).
    // Mengambil hanya sisi keluar membuat proyek penerima tampak punya barang
    // yang tak pernah dibeli.
    const { data: pindah, error: ePindah } = await db
      .viaProject('stock_movements', projectId)
      .select('material_id, qty, movement_type')
      .in('movement_type', ['transfer_out', 'transfer_in'])

    if (ePindah) return reply.status(500).send({ error: ePindah.message })

    type BarisRab = {
      material_id: string
      rab_quantity: number | string
      materials?: { id: string; name: string; unit: string | null } | { id: string; name: string; unit: string | null }[] | null
    }

    const hasil = hitungRekonsiliasi(
      ((teoritis ?? []) as BarisRab[]).map((t) => {
        const m = Array.isArray(t.materials) ? t.materials[0] : t.materials
        return {
          material_id: t.material_id,
          material_name: m?.name,
          unit: m?.unit ?? null,
          rab_quantity: t.rab_quantity,
        }
      }),
      dibeli,
      ((gerak ?? []) as Array<{ material_id: string; qty: number | string | null }>),
      ((sisa ?? []) as Array<{ material_id: string; qty_on_hand: number | string | null }>),
      ((pindah ?? []) as Array<{ material_id: string; qty: number | string | null }>),
      dariKlien,
      {
        ambangSusutPct: parseAmbang(q.ambang_susut),
        ambangLebihBeliPct: parseAmbang(q.ambang_lebih_beli),
      },
    )

    // Nama material untuk baris yang TIDAK ada di RAB.
    //
    // Baris-baris itu justru yang paling perlu dilihat (pembelian di luar
    // rencana), dan menampilkannya sebagai "—" membuat temuan terpenting
    // laporan ini tak bisa ditindaklanjuti siapa pun.
    const tanpaNama = hasil.baris.filter((b) => b.material_name === '—').map((b) => b.material_id)
    if (tanpaNama.length > 0) {
      const { data: nama, error: e5 } = await db.from('materials').select('id, name, unit').in('id', tanpaNama)

      // Kegagalan di sini TIDAK boleh diam. Tanpa pemeriksaan ini, query yang
      // gagal mengembalikan `data: null` — tak bisa dibedakan dari "memang tak
      // ada materialnya". Akibatnya seluruh baris pembelian di luar RAB tampil
      // sebagai "—", dan temuan paling penting laporan ini (belanja tanpa
      // rencana) jadi tak bisa ditindaklanjuti siapa pun tanpa satu pun pesan.
      if (e5) return reply.status(500).send({ error: e5.message })

      const peta = new Map((nama ?? []).map((m: { id: string; name: string; unit: string | null }) => [m.id, m]))
      for (const b of hasil.baris) {
        const m = peta.get(b.material_id)
        if (m) { b.material_name = m.name; b.unit = m.unit }
      }
    }

    return reply.send({
      ...hasil,
      // Dinyatakan supaya pembaca tahu angka mana yang sedang dipakai —
      // dua orang yang membuka laporan dengan ambang berbeda akan melihat
      // status berbeda untuk data yang sama.
      ambang: {
        susut_pct: parseAmbang(q.ambang_susut) ?? 5,
        lebih_beli_pct: parseAmbang(q.ambang_lebih_beli) ?? 10,
      },
      // Jumlah GR yang dilewati, dinyatakan bukan disembunyikan: laporan yang
      // diam-diam mengabaikan sebagian data terbaca seperti data lengkap.
      gr_belum_dikonfirmasi: (gr ?? []).length - idGrSah.length,
    })
  })
}
