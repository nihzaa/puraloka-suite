import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'
import { scopeIdsTenant } from '../../utils/tenant-guard.js'
import { ringkasBackCharge, periksaSetujuBackCharge } from '../../lib/back-charge.js'

/**
 * BACK-CHARGE (D3) — biaya yang seharusnya ditanggung subkon.
 *
 * ── Lubang yang ditutup
 *
 * Pembayaran ke mandor punya `deducted_kasbon` dan `retensi_amount`. Tak satu
 * pun menampung biaya yang dikeluarkan KONTRAKTOR untuk pekerjaan yang
 * seharusnya jadi tanggungan subkon: perbaikan cacat yang tak dikerjakan
 * ulang, material yang dibeli lagi, alat yang disewa untuk membereskan.
 *
 * Dan `deducted_kasbon` diketik MANUAL saat konfirmasi, tanpa daftar yang
 * menjadi dasarnya. Angka potongan tanpa rincian di baliknya tak bisa
 * dijelaskan ke mandor saat ia bertanya "kenapa dipotong sekian".
 *
 * ── Dua izin
 *
 * `backcharge:kelola`  mengajukan beserta buktinya
 * `backcharge:setujui` mengesahkan potongan
 *
 * Yang mengajukan bukan yang menyetujui — back-charge MENGURANGI uang yang
 * diterima orang lain. Basis juga menegakkannya lewat CHECK, karena importer
 * dan psql menulis ke sini juga.
 */
export default async function backChargeRoutes(app: FastifyInstance) {
  const ALASAN = 'kategori B; disaring company_id di baris berikutnya'

  // ── GET /api/v1/back-charge ──────────────────────────────────────────────
  app.get<{ Querystring: { work_scope_id?: string; status?: string } }>(
    '/api/v1/back-charge',
    { preHandler: [authenticate, requirePermission('mandor:view')] },
    async (request, reply) => {
      const db = request.db!
      const q = request.query

      let query = db.unsafe('back_charge', ALASAN)
        .select(`
          id, nomor, tanggal, uraian, kategori, nilai, status, bukti_url,
          project_id, work_scope_id, punch_item_id,
          diajukan_oleh, disetujui_oleh, disetujui_pada, alasan_batal,
          progress_payment_id, dipotong_pada, dibuat_pada,
          pengaju:users!back_charge_diajukan_oleh_fkey ( id, name ),
          penyetuju:users!back_charge_disetujui_oleh_fkey ( id, name ),
          scope:work_scopes ( id, scope_name )
        `)
        .eq('company_id', request.companyId!)
        .order('tanggal', { ascending: false })

      if (q.work_scope_id) query = query.eq('work_scope_id', q.work_scope_id)
      if (q.status) query = query.eq('status', q.status)

      const { data, error } = await query
      if (error) return reply.status(500).send({ error: error.message })

      const baris = (data ?? []) as Array<Record<string, unknown>>
      return reply.send({
        back_charge: baris,
        // Ringkasan ikut dikirim: layar butuh "berapa yang siap memotong"
        // sebelum menyetujui pembayaran, dan menghitungnya di klien berarti
        // aturan statusnya ditulis dua kali.
        ringkasan: ringkasBackCharge(baris as never[]),
      })
    },
  )

  // ── POST /api/v1/back-charge ─────────────────────────────────────────────
  app.post<{
    Body: {
      work_scope_id?: string
      tanggal?: string
      uraian?: string
      kategori?: string
      nilai?: number
      bukti_url?: string[]
      punch_item_id?: string | null
    }
  }>(
    '/api/v1/back-charge',
    { preHandler: [authenticate, requirePermission('backcharge:kelola')] },
    async (request, reply) => {
      const db = request.db!
      const b = request.body

      if (!b?.work_scope_id) return reply.status(400).send({ error: 'work_scope_id wajib diisi' })
      if (!b.tanggal || !/^\d{4}-\d{2}-\d{2}$/.test(b.tanggal)) {
        return reply.status(400).send({ error: 'tanggal wajib, bentuk YYYY-MM-DD' })
      }
      if (!b.uraian?.trim()) {
        // Back-charge tanpa uraian adalah potongan yang tak bisa dijelaskan —
        // persis keadaan yang modul ini perbaiki.
        return reply.status(400).send({
          error: 'Uraian wajib diisi. Potongan tanpa sebab tak bisa dijelaskan ke mandor.',
        })
      }
      // `Number('') === 0`, bukan NaN — kosong ditolak SEBELUM konversi.
      if (b.nilai === null || b.nilai === undefined) {
        return reply.status(400).send({ error: 'nilai wajib diisi' })
      }
      const nilai = Number(b.nilai)
      if (!Number.isFinite(nilai) || nilai <= 0) {
        return reply.status(400).send({ error: 'nilai harus lebih dari nol' })
      }

      // Lingkup kerja WAJIB milik tenant ini.
      if (!(await scopeIdsTenant(request)).includes(b.work_scope_id)) {
        return reply.status(404).send({ error: 'Lingkup kerja tidak ditemukan' })
      }

      const { data: scope, error: errScope } = await db
        .unsafe('work_scopes', 'sudah diverifikasi lewat scopeIdsTenant di baris sebelumnya')
        .select('id, assignment:mandor_assignments!inner(project_id)')
        .eq('id', b.work_scope_id)
        .maybeSingle()
      if (errScope) return reply.status(500).send({ error: errScope.message })
      if (!scope) return reply.status(404).send({ error: 'Lingkup kerja tidak ditemukan' })

      const projectId = ((scope as Record<string, unknown>).assignment as { project_id?: string })?.project_id
      if (!projectId) return reply.status(500).send({ error: 'Lingkup kerja tanpa proyek' })

      const tahun = b.tanggal.slice(0, 4)
      const { data: terakhir, error: errNomor } = await db.unsafe('back_charge', ALASAN)
        .select('nomor').eq('company_id', request.companyId!)
        .like('nomor', `BC-${tahun}-%`)
        .order('nomor', { ascending: false }).limit(1).maybeSingle()
      // Galat DIPERIKSA: kalau gagal, nomornya kembali ke 0001 dan ditolak
      // UNIQUE dengan pesan yang membicarakan hal lain.
      if (errNomor) return reply.status(500).send({ error: errNomor.message })
      const urut = terakhir?.nomor ? Number(String(terakhir.nomor).split('-').pop()) + 1 : 1
      const nomor = `BC-${tahun}-${String(urut).padStart(4, '0')}`

      const { data, error } = await db.unsafe('back_charge', ALASAN)
        .insert({
          company_id: request.companyId!,
          project_id: projectId,
          work_scope_id: b.work_scope_id,
          nomor,
          tanggal: b.tanggal,
          uraian: b.uraian.trim(),
          kategori: b.kategori ?? 'perbaikan',
          nilai,
          bukti_url: Array.isArray(b.bukti_url) ? b.bukti_url : [],
          punch_item_id: b.punch_item_id ?? null,
          diajukan_oleh: request.currentUser!.id,
        })
        .select('id, nomor, status, nilai')
        .single()

      if (error) {
        if ((error as { code?: string }).code === '23505') {
          return reply.status(409).send({ error: `Nomor ${nomor} sudah dipakai` })
        }
        if ((error as { code?: string }).code === '23514') {
          return reply.status(422).send({ error: 'Nilai atau kategori tak memenuhi aturan basis' })
        }
        return reply.status(500).send({ error: error.message })
      }

      void logAuditEvent(request, {
        tableName: 'back_charge', recordId: (data as { id: string }).id,
        action: 'back_charge.create', actorId: request.currentUser!.id,
        newValues: { nomor, work_scope_id: b.work_scope_id, nilai },
        severity: 'info',
      })
      return reply.status(201).send({ back_charge: data })
    },
  )

  // ── PATCH /api/v1/back-charge/:id/putuskan ───────────────────────────────
  app.patch<{ Params: { id: string }; Body: { setujui?: boolean; alasan?: string } }>(
    '/api/v1/back-charge/:id/putuskan',
    { preHandler: [authenticate, requirePermission('backcharge:setujui')] },
    async (request, reply) => {
      const db = request.db!
      const { id } = request.params
      const b = request.body ?? {}

      const { data: bc, error: errBaca } = await db.unsafe('back_charge', ALASAN)
        .select('id, nomor, status, diajukan_oleh, nilai')
        .eq('id', id).eq('company_id', request.companyId!)
        .maybeSingle()
      if (errBaca) return reply.status(500).send({ error: errBaca.message })
      if (!bc) return reply.status(404).send({ error: 'Back-charge tidak ditemukan' })

      const r = bc as Record<string, unknown>
      const periksa = periksaSetujuBackCharge({
        status: r.status as string,
        pengajuId: r.diajukan_oleh as string,
        penyetujuId: request.currentUser!.id,
      })
      if (!periksa.boleh) {
        // 403 untuk SoD, 409 untuk status yang tak sesuai — dua sebab berbeda
        // yang menuntut tindakan berbeda dari pemanggilnya.
        const kode = periksa.sebab.includes('menyetujuinya sendiri') ? 403 : 409
        return reply.status(kode).send({ error: periksa.sebab })
      }

      const membatalkan = b.setujui === false
      if (membatalkan && !b.alasan?.trim()) {
        return reply.status(400).send({
          error: 'Pembatalan wajib beralasan — tanpa itu tak ada yang tahu kenapa '
            + 'potongan yang sudah diajukan tiba-tiba hilang.',
        })
      }

      const patch = membatalkan
        ? { status: 'dibatalkan', alasan_batal: b.alasan!.trim() }
        : {
            status: 'disetujui',
            disetujui_oleh: request.currentUser!.id,
            disetujui_pada: new Date().toISOString(),
          }

      const { data, error } = await db.unsafe('back_charge', ALASAN)
        .update(patch)
        .eq('id', id).eq('company_id', request.companyId!)
        // Status lama ikut di WHERE: dua keputusan bersamaan hanya boleh
        // menghasilkan satu yang berhasil.
        .eq('status', 'diajukan')
        .select('id, nomor, status, nilai')
      if (error) return reply.status(500).send({ error: error.message })
      if (!data || data.length === 0) {
        return reply.status(409).send({ error: 'Back-charge sudah diputuskan pihak lain.' })
      }

      void logAuditEvent(request, {
        tableName: 'back_charge', recordId: id,
        action: membatalkan ? 'back_charge.batal' : 'back_charge.setujui',
        actorId: request.currentUser!.id,
        newValues: patch as Record<string, unknown>,
        severity: 'critical',
      })
      return reply.send({ back_charge: data[0] })
    },
  )
}
