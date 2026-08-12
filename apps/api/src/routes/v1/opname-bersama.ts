import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'
import { pctOpname } from '../../lib/gerbang-opname.js'

/**
 * OPNAME BERSAMA (D1) — berita acara pengukuran yang mengunci pembayaran.
 *
 * ── Lubang yang ditutup
 *
 * Migrasi 044 (2024) merancang tabelnya lengkap dan menambahkan
 * `progress_payments.requires_opname` + `opname_report_id`. Tabelnya tak
 * pernah terbentuk (ledger-diff: TERCATAT-TAPI-ARTEFAK-HILANG), dan kedua
 * kolom itu tak pernah dibaca satu baris kode pun.
 *
 * Diukur 2026-08-12: 17 dari 20 lingkup kerja wajib opname, 5 dari 5
 * pembayaran bertanda wajib, NOL punya berita acara. Gerbang yang dijanjikan
 * schema selama dua tahun, tak pernah menjaga apa pun.
 *
 * ── Dua izin, dan itu intinya
 *
 * `opname:kelola`      mengukur & mengajukan
 * `opname:verifikasi`  menyetujui berita acara
 *
 * Yang mengukur di lapangan bukan yang memverifikasi. Menyatukannya membuat
 * berita acara "bersama" jadi klaim sepihak dengan dua kolom. Basis juga
 * menegakkannya lewat CHECK (`diverifikasi_oleh <> diukur_oleh`) — karena
 * importer dan skrip perbaikan data menulis ke sini juga.
 */
export default async function opnameBersamaRoutes(app: FastifyInstance) {
  const ALASAN = 'kategori B; disaring company_id di baris berikutnya'

  // ── GET /api/v1/opname ───────────────────────────────────────────────────
  app.get<{ Querystring: { work_scope_id?: string; project_id?: string; status?: string } }>(
    '/api/v1/opname',
    { preHandler: [authenticate, requirePermission('mandor:view')] },
    async (request, reply) => {
      const db = request.db!
      const q = request.query

      let query = db.unsafe('opname_bersama', ALASAN)
        .select(`
          id, nomor, tanggal_opname, status, catatan, alasan_sengketa, foto_url,
          project_id, work_scope_id, diukur_oleh, diverifikasi_oleh, diverifikasi_pada,
          dibuat_pada,
          pengukur:users!opname_bersama_diukur_oleh_fkey ( id, name ),
          penyetuju:users!opname_bersama_diverifikasi_oleh_fkey ( id, name ),
          opname_bersama_item ( id, uraian, satuan, volume_rencana, volume_terukur, pct_selesai, catatan, urutan )
        `)
        .eq('company_id', request.companyId!)
        .order('tanggal_opname', { ascending: false })

      if (q.work_scope_id) query = query.eq('work_scope_id', q.work_scope_id)
      if (q.project_id) query = query.eq('project_id', q.project_id)
      if (q.status) query = query.eq('status', q.status)

      const { data, error } = await query
      if (error) return reply.status(500).send({ error: error.message })

      // Persen dihitung DI SINI, bukan disimpan di induk: ia turunan dari
      // itemnya, dan menyimpannya berarti dua angka yang bisa berselisih.
      const hasil = (data ?? []).map((o) => {
        const r = o as Record<string, unknown>
        const p = pctOpname((r.opname_bersama_item ?? []) as never[])
        return { ...r, pct_selesai: p.pct, dasar_pct: p.dasar }
      })
      return reply.send({ opname: hasil })
    },
  )

  // ── POST /api/v1/opname ──────────────────────────────────────────────────
  app.post<{
    Body: {
      work_scope_id?: string
      tanggal_opname?: string
      catatan?: string
      foto_url?: string[]
      item?: Array<{
        scope_item_id?: string | null
        uraian?: string
        satuan?: string
        volume_rencana?: number | null
        volume_terukur?: number
        pct_selesai?: number
        catatan?: string
      }>
    }
  }>(
    '/api/v1/opname',
    { preHandler: [authenticate, requirePermission('opname:kelola')] },
    async (request, reply) => {
      const db = request.db!
      const b = request.body

      if (!b?.work_scope_id) return reply.status(400).send({ error: 'work_scope_id wajib diisi' })
      if (!b.tanggal_opname || !/^\d{4}-\d{2}-\d{2}$/.test(b.tanggal_opname)) {
        return reply.status(400).send({ error: 'tanggal_opname wajib, bentuk YYYY-MM-DD' })
      }
      if (!Array.isArray(b.item) || b.item.length === 0) {
        // Berita acara tanpa item tak mengukur apa pun — dan ia akan lolos
        // gerbang pembayaran dengan pct null yang diperlakukan nol.
        return reply.status(400).send({ error: 'Minimal satu item yang diukur' })
      }

      // Lingkup kerja WAJIB milik tenant ini. Tanpa cek, id dari body bisa
      // menunjuk scope tenant lain dan berita acaranya tertulis di sana.
      const { data: scope, error: errScope } = await db
        .unsafe('work_scopes', 'diverifikasi lewat rantai mandor_assignments → projects di bawah')
        .select('id, scope_name, assignment:mandor_assignments!inner(project_id)')
        .eq('id', b.work_scope_id)
        .maybeSingle()
      if (errScope) return reply.status(500).send({ error: errScope.message })
      if (!scope) return reply.status(404).send({ error: 'Lingkup kerja tidak ditemukan' })

      const projectId = ((scope as Record<string, unknown>).assignment as { project_id?: string })?.project_id
      if (!projectId || !(await db.projectIds()).includes(projectId)) {
        return reply.status(404).send({ error: 'Lingkup kerja tidak ditemukan' })
      }

      // Validasi item SEBELUM menulis apa pun.
      for (const [i, it] of b.item.entries()) {
        if (!it.uraian?.trim()) return reply.status(400).send({ error: `Item ${i + 1}: uraian wajib diisi` })
        if (!it.satuan?.trim()) return reply.status(400).send({ error: `Item ${i + 1}: satuan wajib diisi` })
        // `Number('') === 0`, bukan NaN — kosong ditolak SEBELUM konversi.
        if (it.volume_terukur === null || it.volume_terukur === undefined) {
          return reply.status(400).send({ error: `Item ${i + 1}: volume_terukur wajib diisi` })
        }
        const v = Number(it.volume_terukur)
        if (!Number.isFinite(v) || v < 0) {
          return reply.status(400).send({ error: `Item ${i + 1}: volume_terukur harus angka >= 0` })
        }
        const p = Number(it.pct_selesai)
        if (!Number.isFinite(p) || p < 0 || p > 100) {
          return reply.status(400).send({ error: `Item ${i + 1}: pct_selesai harus 0-100` })
        }
      }

      const tahun = b.tanggal_opname.slice(0, 4)
      const { data: terakhir, error: errNomor } = await db.unsafe('opname_bersama', ALASAN)
        .select('nomor').eq('company_id', request.companyId!)
        .like('nomor', `BA-OPN-${tahun}-%`)
        .order('nomor', { ascending: false }).limit(1).maybeSingle()
      // Galat DIPERIKSA: kalau gagal, nomornya kembali ke 0001 dan bentrok
      // dengan yang sudah ada — ditolak UNIQUE dengan pesan yang membicarakan
      // hal lain.
      if (errNomor) return reply.status(500).send({ error: errNomor.message })
      const urut = terakhir?.nomor ? Number(String(terakhir.nomor).split('-').pop()) + 1 : 1
      const nomor = `BA-OPN-${tahun}-${String(urut).padStart(4, '0')}`

      const { data: kepala, error } = await db.unsafe('opname_bersama', ALASAN)
        .insert({
          company_id: request.companyId!,
          project_id: projectId,
          work_scope_id: b.work_scope_id,
          nomor,
          tanggal_opname: b.tanggal_opname,
          diukur_oleh: request.currentUser!.id,
          catatan: b.catatan ?? null,
          foto_url: Array.isArray(b.foto_url) ? b.foto_url : [],
        })
        .select('id, nomor, status')
        .single()
      if (error) {
        if ((error as { code?: string }).code === '23505') {
          return reply.status(409).send({ error: `Nomor ${nomor} sudah dipakai` })
        }
        return reply.status(500).send({ error: error.message })
      }
      const opnameId = (kepala as { id: string }).id

      const { error: errItem } = await db
        .unsafe('opname_bersama_item', 'mewarisi tenancy dari induk yang baru dibuat di atas')
        .insert(b.item.map((it, i) => ({
          opname_id: opnameId,
          scope_item_id: it.scope_item_id ?? null,
          uraian: it.uraian!.trim(),
          satuan: it.satuan!.trim(),
          volume_rencana: it.volume_rencana ?? null,
          volume_terukur: Number(it.volume_terukur),
          pct_selesai: Number(it.pct_selesai),
          catatan: it.catatan ?? null,
          urutan: i + 1,
        })))
      if (errItem) {
        // Kepala SUDAH tertulis. Berita acara tanpa item akan lolos gerbang
        // pembayaran dengan pct null — dibersihkan, bukan dibiarkan.
        //
        // Hasil penghapusannya DIPERIKSA: nol baris terhapus berarti berita
        // acara kosong itu masih ada, dan nomornya harus disebutkan supaya
        // bisa dibereskan tangan — bukan hilang di balik pesan galat yang
        // membicarakan hal lain.
        const { data: terhapus } = await db.unsafe('opname_bersama', ALASAN)
          .delete().eq('id', opnameId).select('id')
        const sisa = !terhapus || terhapus.length === 0
        return reply.status(500).send({
          error: 'Gagal menulis item opname: ' + errItem.message
            + (sisa ? ` Berita acara kosong ${nomor} gagal dibersihkan — hapus manual.` : ''),
        })
      }

      void logAuditEvent(request, {
        tableName: 'opname_bersama', recordId: opnameId, action: 'opname.create',
        actorId: request.currentUser!.id,
        newValues: { nomor, work_scope_id: b.work_scope_id, item: b.item.length },
        severity: 'info',
      })
      return reply.status(201).send({ opname: kepala })
    },
  )

  // ── PATCH /api/v1/opname/:id/verifikasi ──────────────────────────────────
  app.patch<{ Params: { id: string }; Body: { setujui?: boolean; alasan?: string } }>(
    '/api/v1/opname/:id/verifikasi',
    { preHandler: [authenticate, requirePermission('opname:verifikasi')] },
    async (request, reply) => {
      const db = request.db!
      const { id } = request.params
      const b = request.body ?? {}

      const { data: op, error: errBaca } = await db.unsafe('opname_bersama', ALASAN)
        .select('id, nomor, status, diukur_oleh')
        .eq('id', id).eq('company_id', request.companyId!)
        .maybeSingle()
      if (errBaca) return reply.status(500).send({ error: errBaca.message })
      if (!op) return reply.status(404).send({ error: 'Berita acara tidak ditemukan' })

      const o = op as Record<string, unknown>
      if (o.status !== 'diajukan') {
        return reply.status(409).send({
          error: `Berita acara ${o.nomor} berstatus ${o.status}, hanya yang diajukan bisa diverifikasi.`,
        })
      }

      // SoD — pengukur tak boleh memverifikasi ukurannya sendiri.
      //
      // Basis juga menolaknya lewat CHECK, tetapi galat Postgres tak bisa
      // ditindaklanjuti pengguna. Di sini alasannya dijelaskan.
      if (o.diukur_oleh === request.currentUser!.id) {
        return reply.status(403).send({
          error: 'Anda yang mengukur berita acara ini, jadi tak bisa memverifikasinya sendiri. '
            + 'Yang membuat opname bernilai adalah dua pihak menyaksikan angka yang sama.',
        })
      }

      const menolak = b.setujui === false
      if (menolak && !b.alasan?.trim()) {
        return reply.status(400).send({
          error: 'Sengketa wajib beralasan — tanpa itu pembayaran berhenti tanpa ada yang tahu '
            + 'apa yang harus diperbaiki.',
        })
      }

      const patch = menolak
        ? { status: 'disengketakan', alasan_sengketa: b.alasan!.trim() }
        : {
            status: 'diverifikasi',
            diverifikasi_oleh: request.currentUser!.id,
            diverifikasi_pada: new Date().toISOString(),
          }

      const { data, error } = await db.unsafe('opname_bersama', ALASAN)
        .update(patch)
        .eq('id', id).eq('company_id', request.companyId!)
        // Status lama ikut di WHERE: dua verifikasi bersamaan hanya boleh
        // menghasilkan satu yang berhasil.
        .eq('status', 'diajukan')
        .select('id, nomor, status')
      if (error) return reply.status(500).send({ error: error.message })
      if (!data || data.length === 0) {
        return reply.status(409).send({ error: 'Berita acara sudah diputuskan pihak lain.' })
      }

      void logAuditEvent(request, {
        tableName: 'opname_bersama', recordId: id,
        action: menolak ? 'opname.sengketa' : 'opname.verifikasi',
        actorId: request.currentUser!.id,
        newValues: patch as Record<string, unknown>,
        severity: 'critical',
      })
      return reply.send({ opname: data[0] })
    },
  )
}
