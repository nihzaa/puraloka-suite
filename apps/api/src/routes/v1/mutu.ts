import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { requireModul } from '../../utils/gerbang-modul.js'
import { proyekMilikTenant } from '../../utils/tenant-guard.js'
import { logAuditEvent } from '../../utils/audit.js'
import {
  ringkasChecklist, ringkasUji,
  type ButirChecklist, type BarisUji,
} from '../../lib/mutu-checklist.js'

/**
 * CHECKLIST INSPEKSI + HASIL UJI MATERIAL (G1d).
 *
 * ── Kenapa berkas terpisah dari `ncr.ts`
 *
 * `ncr.ts` sudah 900+ baris, dan uji material adalah ENTITAS BERBEDA: ia
 * lahir dari laboratorium, hidup lebih lama daripada inspeksi mana pun, dan
 * dirujuk berulang kali (sertifikat mutu, klaim, sengketa). Menyatukannya
 * hanya karena sama-sama "mutu" akan mengulang cacat yang sudah ada di repo
 * ini: halaman 3.667 baris yang tak bisa dibaca manusia.
 *
 * ── Kenapa checklist tak punya endpoint DAFTAR sendiri
 *
 * Butir checklist lahir dari inspeksi dan mati bersamanya. Daftar butir
 * lintas-inspeksi tak menjawab pertanyaan siapa pun — yang ditanyakan selalu
 * "inspeksi INI sudah diperiksa apa saja".
 *
 * Skema, constraint, dan alasannya ada di `db/migrations/279_*.sql`.
 */

const CHECKLIST_SELECT = `
  id, inspection_id, urutan, butir, acuan, lolos, catatan,
  diperiksa_oleh, diperiksa_pada,
  pemeriksa:users ( id, name )
`

const UJI_SELECT = `
  id, project_id, nomor, objek, jenis_uji, lembaga_uji, nomor_sertifikat,
  tanggal_uji, nilai_hasil, nilai_syarat, satuan, kesimpulan, catatan,
  material_id, ncr_id, dicatat_oleh, created_at,
  material:materials ( id, name, unit ),
  ncr:ncr_items ( id, nomor, judul )
`

export default async function mutuRoutes(app: FastifyInstance) {
  // ── GET /inspeksi/:inspectionId/checklist ────────────────────────────────
  //
  // Butir pemeriksaan satu inspeksi, beserta ringkasannya.
  app.get<{ Params: { inspectionId: string } }>(
    '/api/v1/inspeksi/:inspectionId/checklist',
    { preHandler: [authenticate, requireModul('modul.uji_mutu'), requirePermission('ncr:view')] },
    async (request, reply) => {
      const { inspectionId } = request.params

      // `inspection_requests` kategori C — `.from()` MELEMPAR untuknya, dan
      // itu penjagaan yang benar: tanpa `project_id`, query itu akan
      // mengembalikan baris milik tenant lain.
      //
      // Yang dipakai: `unsafe` dengan alasan tertulis, lalu disaring ke
      // daftar proyek tenant ini. Satu query, dan "bukan milik saya" otomatis
      // jadi 404 yang sama dengan "tidak ada" — nol kebocoran keberadaan.
      const { data: insp, error: eInsp } = await request.db!
        .unsafe('inspection_requests',
          'lookup by id, lalu disaring .in(project_id, projectIds()) di query yang SAMA')
        .select('id, project_id, nomor, judul, status')
        .eq('id', inspectionId)
        .in('project_id', await request.db!.projectIds())
        .maybeSingle()
      if (eInsp) return reply.status(500).send({ error: eInsp.message })
      if (!insp) return reply.status(404).send({ error: 'Inspeksi tidak ditemukan' })

      const { data, error } = await request.db!
        .viaProject('inspeksi_checklist', inspectionId)
        .select(CHECKLIST_SELECT)
        .order('urutan', { ascending: true })
        .limit(500)
      if (error) {
        request.log.error({ err: error, inspectionId }, 'gagal memuat checklist')
        return reply.status(500).send({ error: 'Gagal memuat checklist inspeksi' })
      }

      const butir = data as unknown as ButirChecklist[]
      return reply.send({
        inspeksi: insp,
        butir,
        ringkasan: ringkasChecklist(butir),
      })
    },
  )

  // ── POST /inspeksi/:inspectionId/checklist ───────────────────────────────
  //
  // Menambah butir. Satu per satu, bukan borongan: butir yang ditambahkan
  // massal dari template belum tentu berlaku untuk pekerjaan ini, dan butir
  // yang tak berlaku membuat seluruh checklist berhenti dibaca.
  app.post<{
    Params: { inspectionId: string }
    Body: { butir?: string; acuan?: string; urutan?: number }
  }>(
    '/api/v1/inspeksi/:inspectionId/checklist',
    { preHandler: [authenticate, requireModul('modul.uji_mutu'), requirePermission('ncr:manage')] },
    async (request, reply) => {
      const { inspectionId } = request.params
      const b = request.body

      if (!b.butir?.trim()) {
        return reply.status(400).send({ error: 'butir wajib diisi' })
      }

      // Sama seperti GET di atas: kategori C, jadi `unsafe` + saringan
      // `projectIds()` di query yang sama.
      const { data: insp, error: eInsp } = await request.db!
        .unsafe('inspection_requests',
          'lookup by id, lalu disaring .in(project_id, projectIds()) di query yang SAMA')
        .select('id, project_id')
        .eq('id', inspectionId)
        .in('project_id', await request.db!.projectIds())
        .maybeSingle()
      if (eInsp) return reply.status(500).send({ error: eInsp.message })
      if (!insp) return reply.status(404).send({ error: 'Inspeksi tidak ditemukan' })

      const { data, error } = await request.db!
        .viaProject('inspeksi_checklist', inspectionId)
        .insert({
          inspection_id: inspectionId,
          butir: b.butir.trim(),
          acuan: b.acuan?.trim() || null,
          urutan: Number.isFinite(b.urutan) ? b.urutan : 0,
        })
        .select('id, butir')
        .single()

      if (error) return reply.status(500).send({ error: error.message })
      return reply.status(201).send({ butir: data })
    },
  )

  // ── PATCH /checklist/:id — hasil pemeriksaan satu butir ──────────────────
  app.patch<{
    Params: { id: string }
    Body: { lolos?: boolean | null; catatan?: string | null }
  }>(
    '/api/v1/checklist/:id',
    { preHandler: [authenticate, requireModul('modul.uji_mutu'), requirePermission('ncr:manage')] },
    async (request, reply) => {
      const { id } = request.params
      const b = request.body

      // Butir TIDAK LOLOS wajib beralasan.
      //
      // Constraint DB sudah menegakkannya (`checklist_gagal_beralasan`), dan
      // ini BUKAN pengganti melainkan pesan yang bisa ditindaklanjuti: pesan
      // constraint mentah ("violates check constraint") tak bisa dibaca
      // siapa pun di layar.
      if (b.lolos === false && !b.catatan?.trim()) {
        return reply.status(400).send({
          error: 'Butir yang tidak lolos wajib punya catatan — '
            + 'yang menerima tugas perbaikan harus tahu APA yang salah',
        })
      }

      // Hasil pemeriksaan membawa pemeriksanya. Diisi SERVER dari sesi, bukan
      // diterima dari klien: pemeriksa yang bisa dipilih sendiri bukan bukti.
      const menilai = b.lolos !== undefined && b.lolos !== null
      const { data, error } = await request.db!
        .unsafe('inspeksi_checklist',
          'id butir langsung; tenancy dijamin RLS RESTRICTIVE lewat inspection→project')
        .update({
          ...(b.lolos !== undefined ? { lolos: b.lolos } : {}),
          ...(b.catatan !== undefined ? { catatan: b.catatan?.trim() || null } : {}),
          ...(menilai
            ? {
                diperiksa_oleh: request.currentUser!.id,
                diperiksa_pada: new Date().toISOString(),
              }
            : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select('id, lolos, catatan')
        .maybeSingle()

      if (error) return reply.status(500).send({ error: error.message })
      // Hasil diperiksa: `update` yang tak menyentuh baris mana pun BUKAN
      // sukses. Tanpa ini, butir milik tenant lain (yang disaring RLS)
      // membalas 200 seolah tersimpan.
      if (!data) return reply.status(404).send({ error: 'Butir tidak ditemukan' })

      return reply.send({ butir: data })
    },
  )

  // ── GET /projects/:projectId/uji-material ───────────────────────────────
  app.get<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId/uji-material',
    { preHandler: [authenticate, requireModul('modul.uji_mutu'), requirePermission('mutu:uji:view')] },
    async (request, reply) => {
      const { projectId } = request.params
      if (!(await proyekMilikTenant(request, projectId))) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }

      const { data, error } = await request.db!
        .viaProject('uji_material', projectId)
        .select(UJI_SELECT)
        .order('tanggal_uji', { ascending: false })
        .limit(300)
      if (error) {
        request.log.error({ err: error, projectId }, 'gagal memuat uji material')
        return reply.status(500).send({ error: 'Gagal memuat hasil uji material' })
      }

      const hasil = ringkasUji(data as unknown as BarisUji[])
      return reply.send({
        ...hasil,
        // Penyebutnya dibawa: "2 tidak memenuhi" tak bisa dinilai tanpa tahu
        // dari berapa uji.
        jumlah_uji: (data as unknown[]).length,
      })
    },
  )

  // ── POST /projects/:projectId/uji-material ──────────────────────────────
  app.post<{
    Params: { projectId: string }
    Body: {
      nomor?: string; objek?: string; jenis_uji?: string
      lembaga_uji?: string; nomor_sertifikat?: string
      tanggal_uji?: string
      nilai_hasil?: number; nilai_syarat?: number; satuan?: string
      kesimpulan?: string; catatan?: string
      material_id?: string; ncr_id?: string
    }
  }>(
    '/api/v1/projects/:projectId/uji-material',
    { preHandler: [authenticate, requireModul('modul.uji_mutu'), requirePermission('mutu:uji:manage')] },
    async (request, reply) => {
      const { projectId } = request.params
      const b = request.body

      if (!(await proyekMilikTenant(request, projectId))) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }

      if (!b.nomor?.trim() || !b.objek?.trim() || !b.jenis_uji?.trim()) {
        return reply.status(400).send({ error: 'nomor, objek, dan jenis_uji wajib diisi' })
      }
      if (!b.tanggal_uji) {
        return reply.status(400).send({ error: 'tanggal_uji wajib diisi' })
      }

      // Uji WAJIB punya nilai ATAU kesimpulan.
      //
      // Constraint DB menegakkannya juga; ini memberi pesan yang bisa
      // ditindaklanjuti. Barisnya berbahaya justru karena ia TERHITUNG
      // sebagai bukti saat auditor menghitung berapa uji sudah dilakukan.
      const adaNilai = typeof b.nilai_hasil === 'number' && Number.isFinite(b.nilai_hasil)
      if (!adaNilai && !b.kesimpulan) {
        return reply.status(400).send({
          error: 'Hasil uji wajib punya nilai ATAU kesimpulan — '
            + 'baris tanpa keduanya terhitung sebagai bukti tanpa mengatakan apa pun',
        })
      }

      if (b.ncr_id) {
        const { data: ncr, error: eNcr } = await request.db!
          .viaProject('ncr_items', projectId)
          .select('id')
          .eq('id', b.ncr_id)
          .maybeSingle()
        if (eNcr) return reply.status(500).send({ error: eNcr.message })
        if (!ncr) return reply.status(400).send({ error: 'NCR tidak ditemukan di proyek ini' })
      }

      const { data, error } = await request.db!
        .viaProject('uji_material', projectId)
        .insert({
          project_id: projectId,
          nomor: b.nomor.trim(),
          objek: b.objek.trim(),
          jenis_uji: b.jenis_uji.trim(),
          lembaga_uji: b.lembaga_uji?.trim() || null,
          nomor_sertifikat: b.nomor_sertifikat?.trim() || null,
          tanggal_uji: b.tanggal_uji,
          nilai_hasil: adaNilai ? b.nilai_hasil : null,
          nilai_syarat: typeof b.nilai_syarat === 'number' && Number.isFinite(b.nilai_syarat)
            ? b.nilai_syarat : null,
          satuan: b.satuan?.trim() || null,
          kesimpulan: b.kesimpulan || null,
          catatan: b.catatan?.trim() || null,
          material_id: b.material_id ?? null,
          ncr_id: b.ncr_id ?? null,
          dicatat_oleh: request.currentUser!.id,
        })
        .select('id, nomor')
        .single()

      if (error) {
        // Nomor uji unik per proyek — ia dirujuk dalam sertifikat dan surat
        // resmi, jadi pesan constraint mentah tak berguna di layar.
        if (error.code === '23505') {
          return reply.status(400).send({ error: `Nomor uji "${b.nomor.trim()}" sudah dipakai` })
        }
        return reply.status(500).send({ error: error.message })
      }

      await logAuditEvent(request, {
        action: 'INSERT',
        actorId: request.currentUser!.id,
        tableName: 'uji_material',
        recordId: data!.id as string,
        newValues: {
          nomor: b.nomor.trim(),
          objek: b.objek.trim(),
          jenis_uji: b.jenis_uji.trim(),
          kesimpulan: b.kesimpulan ?? null,
        },
      })

      return reply.status(201).send({ uji: data })
    },
  )
}
