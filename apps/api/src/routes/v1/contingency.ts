import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { proyekMilikTenant } from '../../utils/tenant-guard.js'
import {
  hitungContingency,
  type BarisPos,
  type BarisPenggunaan,
} from '../../lib/contingency.js'
import {
  coLayakJadiSumber,
  ringkasCoSumber,
  type ChangeOrderRingkas,
} from '../../lib/co-sumber-contingency.js'

/**
 * MANAJEMEN CONTINGENCY (F5 PEMBEDA)
 *
 * ── Cacat yang ditutup
 *
 * Diukur 2026-08-07: NOL kolom contingency di seluruh basis. Cadangan risiko
 * adalah bagian nilai kontrak yang SENGAJA disisihkan untuk hal tak terduga.
 * Tanpa dilacak, ia tak hilang — ia terpakai diam-diam, dan baru ketahuan
 * habis saat dibutuhkan.
 *
 * Buktinya sudah ada di basis: CO-001 disetujui Rp 50.000.000 pada proyek
 * berkontrak Rp 570.000.000, tanpa catatan cadangan mana yang berkurang.
 *
 * ── Kenapa sisa DIHITUNG, bukan disimpan
 *
 * Kolom sisa yang disimpan bisa basi diam-diam saat satu penggunaan disunting
 * atau dihapus. Angka "cadangan masih aman" yang basi lebih berbahaya
 * daripada tak ada angka: ia dipakai untuk menyetujui pengeluaran berikutnya.
 */
export default async function contingencyRoutes(app: FastifyInstance) {
  // ── GET /api/v1/contingency/co-sumber?project_id= ────────────────────────
  //
  // Change order mana di proyek ini yang boleh jadi DASAR penarikan cadangan.
  //
  // Ditemukan 2026-08-08 oleh `audit-kolom-tak-tersambung.mjs`:
  // `sumber_change_order_id` diterima di body penarikan tapi UI tak punya
  // cara mengirimnya — jadi tiap penarikan lahir tanpa dasar tertulis, dan
  // kolom yang menyimpan dasarnya selamanya NULL.
  //
  // Ditaruh SEBELUM rute ber-`:id` mana pun — kalau di bawahnya, "co-sumber"
  // dibaca sebagai id pos dan membalas 404 yang membingungkan.
  app.get('/api/v1/contingency/co-sumber', {
    preHandler: [authenticate, requirePermission('projects:view')],
  }, async (request, reply) => {
    const { project_id } = request.query as Record<string, string>
    if (!project_id) return reply.status(400).send({ error: 'project_id wajib diisi' })

    if (!(await proyekMilikTenant(request, project_id))) {
      return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
    }

    const { data, error } = await request.db!
      .viaProject('change_orders', project_id)
      .select('id, co_number, status, project_id, title, description, total_amount_delta')
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) return reply.status(500).send({ error: error.message })

    // Tipe eksplisit, bukan `?? []`: pola itu ditandai penjaga
    // `audit-kegagalan-senyap` karena menyamarkan galat yang belum diperiksa
    // jadi daftar kosong. Di sini `error` SUDAH diperiksa di atas.
    const daftar = (data ?? []) as unknown as ChangeOrderRingkas[]
    const hasil = ringkasCoSumber(daftar, project_id)

    return reply.send({
      layak: hasil.layak,
      tak_layak: hasil.tak_layak,
      // Penyebutnya dibawa: "1" tak bisa dinilai, "1 dari 2" bisa.
      jumlah_co: daftar.length,
    })
  })

  // ── GET /api/v1/contingency ──────────────────────────────────────────────
  app.get('/api/v1/contingency', {
    preHandler: [authenticate, requirePermission('projects:view')],
  }, async (request, reply) => {
    const q = request.query as Record<string, string>
    const db = request.db!

    const idProyek = await db.projectIds()
    const kosong = {
      pos: [], total_cadangan: 0, total_terpakai: 0, total_sisa: 0,
      jumlah_aman: 0, jumlah_menipis: 0, jumlah_kritis: 0, jumlah_terlampaui: 0,
      proyek_tanpa_pos: [],
    }
    if (idProyek.length === 0) return reply.send(kosong)

    if (q.project_id && !(await proyekMilikTenant(request, q.project_id))) {
      return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
    }

    const dipakai = q.project_id ? [q.project_id] : idProyek

    // Nilai kontrak dibutuhkan untuk menghitung porsi cadangan terhadap
    // kontrak — itu yang menjawab "cadangannya wajar atau tidak".
    const { data: proyek, error: e1 } = await db
      .unsafe('projects', 'daftar lintas-proyek; viaProject butuh satu project sebagai konteks')
      .select('id, name, contract_value')
      .in('id', dipakai)

    if (e1) return reply.status(500).send({ error: e1.message })

    const { data: pos, error: e2 } = await db
      .unsafe('pos_contingency', 'daftar lintas-proyek; disaring dengan projectIds')
      .select('id, project_id, nama, nilai, persen_kontrak, dasar, status')
      .in('project_id', dipakai)

    if (e2) return reply.status(500).send({ error: e2.message })

    const daftarPos = (pos ?? []) as Array<{
      id: string; project_id: string; nama: string
      nilai: number | string; persen_kontrak: number | string | null
      dasar: string | null; status: string | null
    }>

    // Penggunaan diambil hanya untuk pos milik tenant ini. Tanpa saringan
    // `pos_id`, penarikan tenant lain ikut terjumlah — dan sisa cadangan
    // yang salah adalah dasar keputusan "boleh ambil lagi atau tidak".
    let penggunaan: BarisPenggunaan[] = []
    if (daftarPos.length > 0) {
      const { data: g, error: e3 } = await db
        .unsafe('penggunaan_contingency', 'disaring dengan daftar pos milik tenant')
        .select(`id, pos_id, nilai, tanggal, alasan, sumber_change_order_id,
                 change_orders ( co_number )`)
        .in('pos_id', daftarPos.map((p) => p.id))

      if (e3) return reply.status(500).send({ error: e3.message })

      const satu = <T,>(v: T | T[] | null | undefined): T | null =>
        Array.isArray(v) ? (v[0] ?? null) : (v ?? null)

      penggunaan = ((g ?? []) as Array<{
        id: string; pos_id: string; nilai: number | string; tanggal: string
        alasan: string; sumber_change_order_id: string | null
        change_orders?: { co_number: string } | { co_number: string }[] | null
      }>).map((x) => ({
        id: x.id, pos_id: x.pos_id, nilai: x.nilai, tanggal: x.tanggal,
        alasan: x.alasan, sumber_change_order_id: x.sumber_change_order_id,
        co_number: satu(x.change_orders)?.co_number ?? null,
      }))
    }

    const petaProyek = new Map(
      ((proyek ?? []) as Array<{ id: string; name: string; contract_value: number | string | null }>)
        .map((p) => [p.id, p]))

    const barisPos: BarisPos[] = daftarPos.map((p) => ({
      ...p,
      project_name: petaProyek.get(p.project_id)?.name,
      contract_value: petaProyek.get(p.project_id)?.contract_value ?? null,
    }))

    return reply.send(hitungContingency(
      barisPos,
      penggunaan,
      ((proyek ?? []) as Array<{ id: string; name: string }>)
        .map((p) => ({ project_id: p.id, project_name: p.name })),
    ))
  })

  // ── POST /api/v1/contingency ─────────────────────────────────────────────
  //
  // `projects:contract` — DIVERIFIKASI ada. Menetapkan cadangan adalah
  // keputusan kontraktual: berapa bagian nilai kontrak yang disisihkan.
  app.post('/api/v1/contingency', {
    preHandler: [authenticate, requirePermission('projects:contract')],
  }, async (request, reply) => {
    const b = request.body as {
      project_id?: string; nama?: string; nilai?: number
      persen_kontrak?: number; dasar?: string; catatan?: string
    }

    if (!b.project_id || !b.nama?.trim() || !b.nilai) {
      return reply.status(400).send({ error: 'project_id, nama, dan nilai wajib diisi' })
    }

    const nilai = Number(b.nilai)
    if (!Number.isFinite(nilai) || nilai <= 0) {
      return reply.status(400).send({ error: 'nilai cadangan harus lebih dari 0' })
    }

    if (!(await proyekMilikTenant(request, b.project_id))) {
      return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
    }

    const { data, error } = await request.db!
      .viaProject('pos_contingency', b.project_id)
      .insert({
        project_id: b.project_id,
        nama: b.nama.trim(),
        nilai,
        persen_kontrak: b.persen_kontrak ?? null,
        dasar: b.dasar?.trim() || null,
        catatan: b.catatan?.trim() || null,
        created_by: request.currentUser!.id,
      })
      .select('id, nama, nilai')
      .single()

    if (error) {
      if (error.code === '23505') {
        return reply.status(400).send({
          error: `Pos cadangan "${b.nama.trim()}" sudah ada di proyek ini`,
        })
      }
      return reply.status(500).send({ error: error.message })
    }

    return reply.status(201).send({ pos: data })
  })

  // ── POST /api/v1/contingency/:id/penggunaan ──────────────────────────────
  app.post('/api/v1/contingency/:id/penggunaan', {
    preHandler: [authenticate, requirePermission('projects:contract')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const b = request.body as {
      nilai?: number; tanggal?: string; alasan?: string
      sumber_change_order_id?: string; catatan?: string
    }

    if (!b.nilai || !b.alasan?.trim()) {
      // `alasan` WAJIB: cadangan yang terpakai tanpa alasan tertulis adalah
      // persis "hilang ke biaya lain-lain" yang modul ini akhiri.
      return reply.status(400).send({ error: 'nilai dan alasan wajib diisi' })
    }

    const nilai = Number(b.nilai)
    if (!Number.isFinite(nilai) || nilai <= 0) {
      return reply.status(400).send({ error: 'nilai penarikan harus lebih dari 0' })
    }

    const db = request.db!
    const idProyek = await db.projectIds()
    if (idProyek.length === 0) return reply.status(404).send({ error: 'Pos cadangan tidak ditemukan' })

    // Pos-nya wajib milik tenant ini SEBELUM satu baris penarikan pun ditulis.
    const { data: pos, error: ePos } = await db
      .unsafe('pos_contingency', 'verifikasi kepemilikan pos lewat projectIds sebelum menulis penarikan')
      .select('id, project_id, status')
      .eq('id', id)
      .in('project_id', idProyek)
      .maybeSingle()

    if (ePos) return reply.status(500).send({ error: ePos.message })
    if (!pos) return reply.status(404).send({ error: 'Pos cadangan tidak ditemukan' })

    if (pos.status === 'ditutup') {
      return reply.status(400).send({
        error: 'Pos cadangan sudah ditutup — tidak menerima penarikan baru',
      })
    }

    // `sumber_change_order_id` sudah lama diterima di sini dan LANGSUNG
    // di-insert tanpa diperiksa sama sekali. Ditemukan 2026-08-08 oleh
    // `audit-kolom-tak-tersambung.mjs`, bersama alasan kenapa ia tak pernah
    // ketahuan: UI tak punya cara mengirimnya, jadi celahnya tak terpakai.
    //
    // Yang dijaga: CO harus ADA, milik proyek yang sama, dan DISETUJUI.
    // Penarikan cadangan yang mengaku bersumber dari CO yang ditolak adalah
    // jejak audit yang berbohong — dan itu lebih buruk daripada tak ada
    // jejak sama sekali, karena ia dipercaya.
    if (b.sumber_change_order_id) {
      const { data: co, error: eCo } = await db
        .viaProject('change_orders', pos.project_id)
        .select('id, co_number, status, project_id, title, description, total_amount_delta')
        .eq('id', b.sumber_change_order_id)
        .maybeSingle()
      if (eCo) return reply.status(500).send({ error: eCo.message })

      const nilaiCo = coLayakJadiSumber(co as ChangeOrderRingkas | null, pos.project_id)
      if (!nilaiCo.layak) {
        // Sebabnya diteruskan apa adanya: "DITOLAK" dan "belum disetujui"
        // adalah dua keadaan berlawanan, dan pesan generik membuat orang
        // menunggu persetujuan yang tak akan pernah datang.
        return reply.status(400).send({ error: nilaiCo.sebab })
      }
    }

    const { data, error } = await db
      .viaProject('penggunaan_contingency', id)
      .insert({
        pos_id: id,
        nilai,
        tanggal: b.tanggal ?? new Date().toISOString().slice(0, 10),
        alasan: b.alasan.trim(),
        sumber_change_order_id: b.sumber_change_order_id ?? null,
        created_by: request.currentUser!.id,
      })
      .select('id, nilai')
      .single()

    if (error) return reply.status(500).send({ error: error.message })

    return reply.status(201).send({ penggunaan: data })
  })
}
