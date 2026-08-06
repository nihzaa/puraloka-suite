import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { scopeIdsTenant } from '../../utils/tenant-guard.js'
import { logAuditEvent } from '../../utils/audit.js'

/**
 * ABSENSI LAPANGAN (F5-1 INTI #9)
 *
 * ── Kenapa modul ini ada
 *
 * `wage_items.days_worked` adalah angka yang DIKETIK MANDOR saat menyusun
 * laporan upah mingguan. Tak ada catatan harian di baliknya. Triase F5-1:
 * "upah harian dihitung dari ingatan mandor; ini sumber selisih paling
 * sering".
 *
 * Modul ini memberi catatan harian yang menjadi SUMBER angka itu — bukan
 * tabel terpisah yang kebetulan berdampingan.
 *
 * ── Tenancy
 *
 * `absensi_harian` kategori C: tenancy diwarisi lewat
 * work_scopes → mandor_assignments → projects.company_id.
 *
 * ── Kenapa `viaProject(..., scopeId)` dan bukan `supabase` mentah
 *
 * Namanya menyesatkan, perilakunya tepat: `viaProject` menyaring lewat kolom
 * `lewat` yang tercatat di katalog tenancy, dan untuk `absensi_harian` katalog
 * mencatat `lewat: 'scope_id'` (dideteksi otomatis oleh `gen-tenant-map`).
 * Jadi yang disaring memang `scope_id`, bukan `project_id`.
 *
 * Versi pertama memakai `supabase` service-role + saringan manual. Itu bekerja,
 * tapi menaikkan ratchet "akses supabase mentah" dari 366 ke 369 — dan penjaga
 * itu benar: setiap akses mentah adalah satu tempat lagi di mana saringan
 * tenant bisa terlupa saat kode disunting nanti. Menaikkan ambangnya butuh
 * ratifikasi (R-011), dan tak ada alasan meminta itu untuk sesuatu yang bisa
 * lewat wrapper.
 *
 * Lapis KEDUA tetap ada: setiap handler memeriksa `scope_id` terhadap
 * `scopeIdsTenant()` sebelum query dan membalas 404 bila bukan miliknya.
 * Dua lapis, karena satu lapis yang dilewati diam-diam adalah nol lapis.
 * Sisi RLS-nya dijaga terpisah oleh `f2-3-batch3-tenancy-turunan`.
 */

/** Satu hari kerja penuh. Dipakai untuk mengubah porsi jadi "berapa hari". */
const HARI_PENUH = 1

export default async function absensiRoutes(app: FastifyInstance) {
  // ── GET /api/v1/absensi ───────────────────────────────────────────────────
  //
  // Daftar absensi satu lingkup pada rentang tanggal. Rentangnya WAJIB —
  // tanpa itu endpoint ini mengembalikan seluruh riwayat tenant, dan
  // ongkosnya tumbuh terus seiring pemakaian (pelajaran dari wage-reports).
  app.get('/api/v1/absensi', {
    preHandler: [authenticate, requirePermission('mandor:view')],
  }, async (request, reply) => {
    const q = request.query as Record<string, string>
    const scopeId = q.scope_id
    if (!scopeId) {
      return reply.status(400).send({ error: 'scope_id wajib diisi' })
    }

    // Gerbang tenancy di lapis aplikasi. Tanpa ini, `scope_id` milik tenant
    // lain akan dilayani oleh klien service-role yang melewati RLS.
    const milikTenant = await scopeIdsTenant(request)
    if (!milikTenant.includes(scopeId)) {
      // 404, bukan 403: membedakan "tidak ada" dari "bukan milik Anda"
      // memberi tahu penyerang bahwa id itu ADA di tenant lain.
      return reply.status(404).send({ error: 'Lingkup kerja tidak ditemukan' })
    }

    const dari = q.dari
    const sampai = q.sampai
    if (!dari || !sampai) {
      return reply.status(400).send({ error: 'dari & sampai wajib diisi (YYYY-MM-DD)' })
    }

    const { data, error } = await request.db!
      .viaProject('absensi_harian', scopeId)
      .select(`
        id, scope_id, worker_id, tanggal, porsi_hari, jam_lembur, keterangan,
        worker:workers ( id, name, tipe )
      `)
      .gte('tanggal', dari)
      .lte('tanggal', sampai)
      .order('tanggal', { ascending: true })

    if (error) return reply.status(500).send({ error: error.message })
    return reply.send({ absensi: data ?? [], dari, sampai })
  })

  // ── POST /api/v1/absensi ──────────────────────────────────────────────────
  //
  // Catat/perbarui absensi satu hari untuk beberapa pekerja sekaligus.
  //
  // UPSERT, bukan INSERT: mandor mengoreksi absensi hari yang sama berkali-
  // kali (tukang datang siang, pulang awal). INSERT murni akan menolak
  // koreksi dengan galat keunikan, dan mandor menyimpulkan sistemnya rusak.
  app.post('/api/v1/absensi', {
    preHandler: [authenticate, requirePermission('mandor:wage:create')],
  }, async (request, reply) => {
    const body = request.body as {
      scope_id?: string
      tanggal?: string
      entri?: Array<{ worker_id: string; porsi_hari?: number; jam_lembur?: number; keterangan?: string }>
    }

    if (!body.scope_id || !body.tanggal || !Array.isArray(body.entri) || body.entri.length === 0) {
      return reply.status(400).send({ error: 'scope_id, tanggal, dan entri[] wajib diisi' })
    }

    const milikTenant = await scopeIdsTenant(request)
    if (!milikTenant.includes(body.scope_id)) {
      return reply.status(404).send({ error: 'Lingkup kerja tidak ditemukan' })
    }

    // Validasi di sini, BUKAN hanya mengandalkan CHECK constraint.
    //
    // Constraint memang menolak nilai yang salah, tapi galatnya berupa pesan
    // Postgres yang menyebut nama constraint — tak terbaca oleh mandor di
    // lapangan. Yang ditolak di sini ditolak dengan kalimat yang menjelaskan.
    for (const e of body.entri) {
      if (!e.worker_id) {
        return reply.status(400).send({ error: 'Setiap entri wajib punya worker_id' })
      }
      const porsi = e.porsi_hari ?? HARI_PENUH
      if (!(porsi >= 0 && porsi <= 1)) {
        return reply.status(400).send({
          error: `Porsi hari harus antara 0 dan 1 (dapat ${porsi}). Lembur dicatat terpisah di jam_lembur.`,
        })
      }
      const lembur = e.jam_lembur ?? 0
      if (!(lembur >= 0 && lembur <= 16)) {
        return reply.status(400).send({
          error: `Jam lembur harus antara 0 dan 16 (dapat ${lembur}).`,
        })
      }
    }

    // Tanggal masa depan ditolak di sini juga — constraint memakai
    // CURRENT_DATE di zona server, dan pesannya tak menerangkan apa pun.
    const hariIni = new Date().toISOString().slice(0, 10)
    if (body.tanggal > hariIni) {
      return reply.status(400).send({
        error: 'Absensi untuk tanggal yang belum terjadi tidak bisa dicatat.',
      })
    }

    const baris = body.entri.map((e) => ({
      scope_id: body.scope_id!,
      worker_id: e.worker_id,
      tanggal: body.tanggal!,
      porsi_hari: e.porsi_hari ?? HARI_PENUH,
      jam_lembur: e.jam_lembur ?? 0,
      keterangan: e.keterangan ?? null,
      dicatat_oleh: request.currentUser?.id ?? null,
    }))

    const { data, error } = await request.db!
      .viaProject('absensi_harian', body.scope_id)
      .upsert(baris, { onConflict: 'scope_id,worker_id,tanggal' })
      .select('id, worker_id, tanggal, porsi_hari, jam_lembur')

    if (error) return reply.status(500).send({ error: error.message })

    // Absensi MENENTUKAN PEMBAYARAN. Perubahannya wajib berjejak: saat ada
    // sengketa upah, yang menyelesaikannya adalah catatan siapa mengubah apa,
    // kapan — bukan ingatan dua orang yang sama-sama yakin.
    await logAuditEvent(request, {
      tableName: 'absensi_harian',
      recordId: body.scope_id,
      action: 'update',
      actorId: request.currentUser!.id,
      newValues: { tanggal: body.tanggal, jumlah_entri: baris.length },
    })

    return reply.status(201).send({ absensi: data ?? [] })
  })

  // ── GET /api/v1/absensi/rekap ─────────────────────────────────────────────
  //
  // Jumlah hari kerja & lembur per pekerja pada satu rentang — bentuk yang
  // langsung dipakai laporan upah.
  //
  // Ini alasan modul ini ada: angka `days_worked` seharusnya BERASAL dari
  // sini, bukan diketik ulang dari ingatan.
  app.get('/api/v1/absensi/rekap', {
    preHandler: [authenticate, requirePermission('mandor:view')],
  }, async (request, reply) => {
    const q = request.query as Record<string, string>
    const { scope_id: scopeId, dari, sampai } = q

    if (!scopeId || !dari || !sampai) {
      return reply.status(400).send({ error: 'scope_id, dari, dan sampai wajib diisi' })
    }

    const milikTenant = await scopeIdsTenant(request)
    if (!milikTenant.includes(scopeId)) {
      return reply.status(404).send({ error: 'Lingkup kerja tidak ditemukan' })
    }

    const { data, error } = await request.db!
      .viaProject('absensi_harian', scopeId)
      .select('worker_id, porsi_hari, jam_lembur, worker:workers ( id, name, tipe )')
      .eq('scope_id', scopeId)
      .gte('tanggal', dari)
      .lte('tanggal', sampai)

    if (error) return reply.status(500).send({ error: error.message })

    type Baris = {
      worker_id: string
      porsi_hari: number | string
      jam_lembur: number | string
      worker?: { id: string; name: string; tipe: string | null } | { id: string; name: string; tipe: string | null }[] | null
    }

    const per = new Map<string, { worker_id: string; nama: string; tipe: string | null; hari: number; lembur: number }>()
    for (const b of (data ?? []) as Baris[]) {
      const w = Array.isArray(b.worker) ? b.worker[0] : b.worker
      const kunci = b.worker_id
      if (!per.has(kunci)) {
        per.set(kunci, { worker_id: kunci, nama: w?.name ?? '—', tipe: w?.tipe ?? null, hari: 0, lembur: 0 })
      }
      const e = per.get(kunci)!
      // `Number()` eksplisit: Postgres numeric datang sebagai STRING lewat
      // driver ini. `+` pada string menyambung, bukan menjumlah — "1" + "1"
      // menjadi "11", dan itu masuk ke laporan upah sebagai 11 hari kerja.
      e.hari += Number(b.porsi_hari)
      e.lembur += Number(b.jam_lembur)
    }

    const rekap = [...per.values()].sort((a, b) => a.nama.localeCompare(b.nama, 'id'))
    return reply.send({
      rekap,
      dari,
      sampai,
      total_hari: rekap.reduce((s, r) => s + r.hari, 0),
      total_lembur: rekap.reduce((s, r) => s + r.lembur, 0),
    })
  })
}
