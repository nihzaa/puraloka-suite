import type { FastifyInstance, FastifyRequest } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { requireModul } from '../../utils/gerbang-modul.js'
import { logAuditEvent } from '../../utils/audit.js'
import {
  evaluateEntityApproval, recordApproval, idAlurPersetujuan, periksaGerbangSod,
} from '../../utils/approval.js'
import {
  validasiItem, periksaTransisiKlaim, ringkasKlaim,
  type StatusKlaim, type RingkasKlaim,
} from '../../lib/klaim-perjalanan.js'

/**
 * KLAIM PERJALANAN (G1) — penggantian biaya yang ditalangi karyawan.
 *
 * ── Kenapa modul ini ada
 *
 * Yang ada hari ini hanya KASBON: uang muka, dicairkan SEBELUM belanja.
 * Klaim arah uangnya berlawanan — karyawan menalangi, perusahaan mengganti.
 * Kasbon yang belum diselesaikan adalah PIUTANG; klaim yang belum dibayar
 * adalah UTANG. Mencatat keduanya di satu tabel membuat saldo salah tanda.
 *
 * ── Empat izin, dan itu intinya
 *
 * `klaim:view`     melihat
 * `klaim:kelola`   mengajukan & menyunting klaim sendiri
 * `klaim:setujui`  memutuskan
 * `klaim:bayar`    mencairkan
 *
 * `setujui` TERPISAH dari `kelola` supaya pengaju tak memutuskan
 * penggantiannya sendiri; `bayar` terpisah lagi supaya yang memutuskan bukan
 * yang mengeluarkan uang. Basis juga menegakkan SoD lewat trigger — importer
 * dan psql menulis ke sini juga.
 *
 * ── Tenancy
 *
 * `klaim_perjalanan` kategori B (`company_id` langsung); itemnya lewat
 * `klaim_id` ke induk yang sudah diverifikasi.
 */
export default async function klaimPerjalananRoutes(app: FastifyInstance) {
  const ALASAN = 'kategori B; disaring company_id di baris berikutnya'
  const ALASAN_ITEM = 'induk klaim sudah diverifikasi milik tenant ini'

  const SELECT_KLAIM = `
    id, nomor, tujuan, keperluan, tanggal_berangkat, tanggal_kembali,
    total_diajukan, total_disetujui, status, alasan_tolak, catatan,
    disetujui_pada, dibayar_pada, project_id, pegawai_id, cash_account_id, dibuat_pada,
    pegawai:pegawai ( id, nomor_induk, jabatan, user:users ( id, name ) ),
    penyetuju:users!klaim_perjalanan_disetujui_oleh_fkey ( id, name ),
    proyek:projects ( id, name )
  `

  /** Pegawai milik pengguna yang login — null bila ia bukan pegawai terdaftar. */
  async function pegawaiSaya(request: FastifyRequest) {
    const { data } = await request.db!
      .unsafe('pegawai', 'kategori B; disaring company_id di baris ini')
      .select('id')
      .eq('company_id', request.companyId!)
      .eq('user_id', request.currentUser!.id)
      .maybeSingle()
    return (data as { id: string } | null)?.id ?? null
  }

  // ── GET /api/v1/klaim-perjalanan ─────────────────────────────────────────
  app.get<{ Querystring: { status?: string; pegawai_id?: string; project_id?: string } }>(
    '/api/v1/klaim-perjalanan',
    { preHandler: [authenticate, requireModul('modul.sdm'), requirePermission('klaim:view')] },
    async (request, reply) => {
      const db = request.db!
      const q = request.query

      let query = db.unsafe('klaim_perjalanan', ALASAN)
        .select(SELECT_KLAIM)
        .eq('company_id', request.companyId!)
        .order('tanggal_berangkat', { ascending: false })

      if (q.status) query = query.eq('status', q.status)
      if (q.pegawai_id) query = query.eq('pegawai_id', q.pegawai_id)
      if (q.project_id) query = query.eq('project_id', q.project_id)

      const { data, error } = await query
      if (error) return reply.status(500).send({ error: error.message })

      const baris = (data ?? []) as Array<Record<string, unknown>>
      return reply.send({
        klaim: baris,
        // Ringkasan ikut dikirim: layar butuh "berapa utang yang menunggu
        // dibayar" sebelum memutuskan satu per satu, dan menghitungnya di
        // klien berarti aturannya ditulis dua kali.
        ringkasan: ringkasKlaim(baris as unknown as RingkasKlaim[]),
      })
    },
  )

  // ── GET /api/v1/klaim-perjalanan/:id ─────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    '/api/v1/klaim-perjalanan/:id',
    { preHandler: [authenticate, requireModul('modul.sdm'), requirePermission('klaim:view')] },
    async (request, reply) => {
      const db = request.db!
      const { id } = request.params

      const { data: klaim, error } = await db.unsafe('klaim_perjalanan', ALASAN)
        .select(SELECT_KLAIM)
        .eq('id', id).eq('company_id', request.companyId!)
        .maybeSingle()
      if (error) return reply.status(500).send({ error: error.message })
      if (!klaim) return reply.status(404).send({ error: 'Klaim tidak ditemukan' })

      const { data: item, error: errItem } = await db.unsafe('klaim_perjalanan_item', ALASAN_ITEM)
        .select('id, jenis, uraian, tanggal, nominal, bukti_url, catatan, urutan')
        .eq('klaim_id', id)
        .order('urutan')
      if (errItem) return reply.status(500).send({ error: errItem.message })

      return reply.send({ klaim, item: item ?? [] })
    },
  )

  // ── POST /api/v1/klaim-perjalanan ────────────────────────────────────────
  app.post<{
    Body: {
      pegawai_id?: string
      project_id?: string | null
      tujuan?: string
      keperluan?: string
      tanggal_berangkat?: string
      tanggal_kembali?: string
      catatan?: string
      item?: Array<{
        jenis?: string
        uraian?: string
        tanggal?: string
        nominal?: number | string
        bukti_url?: string | null
        catatan?: string
      }>
    }
  }>(
    '/api/v1/klaim-perjalanan',
    { preHandler: [authenticate, requireModul('modul.sdm'), requirePermission('klaim:kelola')] },
    async (request, reply) => {
      const db = request.db!
      const b = request.body

      if (!b?.tujuan?.trim()) return reply.status(400).send({ error: 'Tujuan wajib diisi' })
      if (!b.keperluan?.trim()) {
        return reply.status(400).send({
          error: 'Keperluan wajib diisi — klaim tanpa keperluan tak bisa dinilai penyetujunya.',
        })
      }
      const TGL = /^\d{4}-\d{2}-\d{2}$/
      if (!b.tanggal_berangkat || !TGL.test(b.tanggal_berangkat)) {
        return reply.status(400).send({ error: 'tanggal_berangkat wajib, bentuk YYYY-MM-DD' })
      }
      if (!b.tanggal_kembali || !TGL.test(b.tanggal_kembali)) {
        return reply.status(400).send({ error: 'tanggal_kembali wajib, bentuk YYYY-MM-DD' })
      }
      if (b.tanggal_kembali < b.tanggal_berangkat) {
        return reply.status(400).send({
          error: `Tanggal kembali (${b.tanggal_kembali}) mendahului berangkat `
            + `(${b.tanggal_berangkat}) — perjalanan itu tak pernah terjadi.`,
        })
      }

      // Validasi RINCIAN lebih dulu, sebelum menyelesaikan siapa pengajunya.
      //
      // Urutan ini menentukan pesan mana yang sampai: kesalahan isian (400)
      // bisa diperbaiki pengaju sendiri, sementara "akun belum terhubung ke
      // kepegawaian" (422) menuntut HRD. Melaporkan yang kedua lebih dulu
      // mengirim orang ke HRD untuk masalah yang sebenarnya salah ketik.
      const v = validasiItem(b.item, {
        berangkat: b.tanggal_berangkat,
        kembali: b.tanggal_kembali,
      })
      if (!v.ok) return reply.status(400).send({ error: v.galat })

      // Pengaju: default DIRI SENDIRI. `pegawai_id` dari body hanya diterima
      // bila ia milik tenant ini — tanpa cek, klaim bisa diatasnamakan pegawai
      // perusahaan lain, dan penggantiannya masuk ke orang yang salah.
      let pegawaiId = await pegawaiSaya(request)
      if (b.pegawai_id) {
        const { data: peg, error: errPeg } = await db
          .unsafe('pegawai', 'kategori B; disaring company_id di baris ini')
          .select('id')
          .eq('id', b.pegawai_id)
          .eq('company_id', request.companyId!)
          .maybeSingle()
        if (errPeg) return reply.status(500).send({ error: errPeg.message })
        if (!peg) return reply.status(404).send({ error: 'Pegawai tidak ditemukan' })
        pegawaiId = b.pegawai_id
      }
      if (!pegawaiId) {
        return reply.status(422).send({
          error: 'Akun Anda belum terhubung ke data kepegawaian, jadi penggantiannya '
            + 'tak punya tujuan. Hubungi HRD, atau pilih pegawai secara eksplisit.',
        })
      }

      if (b.project_id) {
        if (!(await db.projectIds()).includes(b.project_id)) {
          return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
        }
      }

      const tahun = b.tanggal_berangkat.slice(0, 4)
      const { data: terakhir, error: errNomor } = await db.unsafe('klaim_perjalanan', ALASAN)
        .select('nomor').eq('company_id', request.companyId!)
        .like('nomor', `KLM-${tahun}-%`)
        .order('nomor', { ascending: false }).limit(1).maybeSingle()
      // Galat DIPERIKSA: kalau gagal, nomornya kembali ke 0001 dan ditolak
      // UNIQUE dengan pesan yang membicarakan hal lain.
      if (errNomor) return reply.status(500).send({ error: errNomor.message })
      const urut = terakhir?.nomor ? Number(String(terakhir.nomor).split('-').pop()) + 1 : 1
      const nomor = `KLM-${tahun}-${String(urut).padStart(4, '0')}`

      const { data: klaim, error } = await db.unsafe('klaim_perjalanan', ALASAN)
        .insert({
          company_id: request.companyId!,
          project_id: b.project_id ?? null,
          pegawai_id: pegawaiId,
          nomor,
          tujuan: b.tujuan.trim(),
          keperluan: b.keperluan.trim(),
          tanggal_berangkat: b.tanggal_berangkat,
          tanggal_kembali: b.tanggal_kembali,
          catatan: b.catatan?.trim() || null,
          dibuat_oleh: request.currentUser!.id,
        })
        .select('id, nomor, status')
        .single()
      if (error) {
        if ((error as { code?: string }).code === '23505') {
          return reply.status(409).send({ error: `Nomor ${nomor} sudah dipakai` })
        }
        if ((error as { code?: string }).code === '23514') {
          return reply.status(422).send({ error: error.message })
        }
        return reply.status(500).send({ error: error.message })
      }

      const idKlaim = (klaim as { id: string }).id

      // Total induk DITURUNKAN trigger dari rinciannya — tak dikirim dari sini.
      const { error: errItem } = await db.unsafe('klaim_perjalanan_item', ALASAN_ITEM)
        .insert(v.nilai.map((it, i) => ({
          klaim_id: idKlaim,
          jenis: it.jenis,
          uraian: it.uraian,
          tanggal: it.tanggal,
          nominal: it.nominal,
          bukti_url: it.bukti_url,
          urutan: i + 1,
        })))
      if (errItem) return reply.status(500).send({ error: errItem.message })

      void logAuditEvent(request, {
        tableName: 'klaim_perjalanan', recordId: idKlaim,
        action: 'klaim_perjalanan.create',
        actorId: request.currentUser!.id,
        newValues: { nomor, pegawai_id: pegawaiId, total: v.total, item: v.nilai.length },
        severity: 'info',
      })

      return reply.status(201).send({
        klaim: { ...(klaim as Record<string, unknown>), total_diajukan: v.total },
        item_dibuat: v.nilai.length,
      })
    },
  )

  // ── PATCH /api/v1/klaim-perjalanan/:id/putuskan ──────────────────────────
  app.patch<{
    Params: { id: string }
    // `alasan_override` dipakai pemegang `approval:override_sod` — dicatat
    // ke `sod_override` SEBELUM approval berlanjut, bukan sesudahnya.
    Body: {
      setujui?: boolean
      total_disetujui?: number | string
      alasan?: string
      alasan_override?: string
    }
  }>(
    '/api/v1/klaim-perjalanan/:id/putuskan',
    { preHandler: [authenticate, requireModul('modul.sdm'), requirePermission('klaim:setujui')] },
    async (request, reply) => {
      const db = request.db!
      const { id } = request.params
      const b = request.body ?? {}

      const { data: klaim, error: errBaca } = await db.unsafe('klaim_perjalanan', ALASAN)
        .select('id, nomor, status, total_diajukan, pegawai_id')
        .eq('id', id).eq('company_id', request.companyId!)
        .maybeSingle()
      if (errBaca) return reply.status(500).send({ error: errBaca.message })
      if (!klaim) return reply.status(404).send({ error: 'Klaim tidak ditemukan' })

      const k = klaim as Record<string, unknown>
      const menolak = b.setujui === false

      // SoD — pengaju tak memutuskan klaimnya sendiri.
      //
      // Basis juga menolaknya lewat trigger, tetapi galat Postgres tak bisa
      // ditindaklanjuti pengguna. Di sini alasannya dijelaskan.
      const { data: peg } = await db
        .unsafe('pegawai', 'kategori B; id pegawai berasal dari klaim yang sudah diverifikasi')
        .select('user_id')
        .eq('id', k.pegawai_id as string)
        .maybeSingle()
      if ((peg as { user_id?: string } | null)?.user_id === request.currentUser!.id) {
        return reply.status(403).send({
          error: 'Anda yang mengajukan klaim ini, jadi tak bisa memutuskannya sendiri. '
            + 'Uang yang keluar untuk diri sendiri wajib diputuskan orang lain.',
        })
      }

      // `Number('') === 0` — kosong ditangani SEBELUM konversi supaya "belum
      // diisi" tak berubah jadi "disetujui Rp 0".
      let disetujui: number | null = null
      if (!menolak) {
        const mentah = b.total_disetujui
        // Tak diisi = setujui PENUH. Itu kasus terbanyak, dan memaksa
        // mengetik ulang angka yang sama mengundang salah ketik.
        if (mentah === null || mentah === undefined || String(mentah).trim() === '') {
          disetujui = Number(k.total_diajukan ?? 0)
        } else {
          const n = Number(mentah)
          if (!Number.isFinite(n)) {
            return reply.status(400).send({ error: 'Nominal yang disetujui tak terbaca sebagai angka' })
          }
          disetujui = n
        }
      }

      const verdict = periksaTransisiKlaim({
        statusSekarang: k.status as StatusKlaim,
        statusTujuan: menolak ? 'ditolak' : 'disetujui',
        alasanTolak: b.alasan,
        totalDisetujui: disetujui,
        totalDiajukan: Number(k.total_diajukan ?? 0),
      })
      if (!verdict.boleh) return reply.status(409).send({ error: verdict.sebab })

      // ── Rantai persetujuan (migrasi 339) ─────────────────────────────
      //
      // Menyetujui klaim MENGELUARKAN uang perusahaan, dan sebagian tenant
      // menuntut klaim di atas nominal tertentu disetujui atasan langsung
      // lalu keuangan. Menulis `disetujui_oleh` langsung membuat rantai dua
      // langkah lolos dengan satu ketukan sementara halaman pengaturannya
      // tetap menampilkan dua.
      //
      // Menolak TIDAK lewat sini: menutup pengajuan yang belum membebankan
      // apa pun bukan keputusan yang mengeluarkan uang, dan mensyaratkan
      // rantai untuk menolak berarti klaim yang jelas salah tetap menggantung
      // menunggu penyetuju kedua.
      if (!menolak) {
        const decision = await evaluateEntityApproval(request, {
          entityType: 'klaim_perjalanan', entityId: id, amount: disetujui,
        })
        if (decision.configError) {
          request.log.error({ configError: decision.configError, id },
            'evaluasi rantai approval klaim gagal')
          return reply.status(500).send({ error: 'Gagal memeriksa konfigurasi approval' })
        }
        if (!decision.allowed) {
          if (decision.reason === 'already_approved') {
            return reply.status(409).send({ error: 'Klaim ini sudah disetujui penuh' })
          }
          return reply.status(403).send({ error: 'Akses ditolak' })
        }

        // Pemegang izin override lewat sini, dan pemakaiannya TERCATAT di
        // `sod_override` sebelum approval berlanjut. Pemeriksaan SoD di atas
        // sudah menolak pengaju TANPA izin override; yang ini menangani yang
        // punya.
        const sod = await periksaGerbangSod(request, 'klaim_perjalanan', id, {
          alasanOverride: b.alasan_override,
          level: decision.step?.level,
        })
        if (!sod.ok) return reply.status(403).send({ error: sod.pesan })

        if (decision.step) {
          const rec = await recordApproval({
            entityType: 'klaim_perjalanan', entityId: id, level: decision.step.level,
            approvedBy: request.currentUser!.id, companyId: request.companyId!,
          })
          if (!rec.ok) {
            return reply.status(500).send({ error: 'Gagal mencatat persetujuan: ' + rec.error })
          }

          // Belum langkah terakhir: status TETAP `diajukan`, jadi klaimnya
          // belum jadi utang dan belum bisa dibayar. Menandainya disetujui di
          // sini membuat separuh rantai membuka pintu pencairan penuh.
          if (!decision.isFinalStep) {
            const next = decision.applicable.find((x) => x.level > decision.step!.level)
            void logAuditEvent(request, {
              tableName: 'klaim_perjalanan', recordId: id,
              action: 'klaim_perjalanan.approval.level',
              actorId: request.currentUser!.id,
              newValues: { level: decision.step.level, of: decision.applicable.length },
              workflowId: idAlurPersetujuan(id),
              severity: 'critical',
            })
            return reply.send({
              ok: true, pending_next_level: true,
              message: `Persetujuan level ${decision.step.level} tercatat. `
                + `Menunggu level ${next?.level ?? '-'} sebelum klaim bisa dibayar.`,
            })
          }
        }
      }

      const patch = menolak
        ? { status: 'ditolak' as const, alasan_tolak: b.alasan!.trim() }
        : {
            status: 'disetujui' as const,
            total_disetujui: disetujui,
            disetujui_oleh: request.currentUser!.id,
            disetujui_pada: new Date().toISOString(),
          }

      const { data, error } = await db.unsafe('klaim_perjalanan', ALASAN)
        .update(patch)
        .eq('id', id).eq('company_id', request.companyId!)
        // Status lama IKUT di WHERE: dua keputusan bersamaan hanya boleh
        // menghasilkan satu yang berhasil.
        .eq('status', 'diajukan')
        .select('id, nomor, status, total_diajukan, total_disetujui')
      if (error) {
        if (/check_violation|violates check/i.test(error.message)) {
          return reply.status(422).send({ error: error.message })
        }
        return reply.status(500).send({ error: error.message })
      }
      if (!data || data.length === 0) {
        return reply.status(409).send({
          error: 'Klaim ini sudah diputuskan dari tempat lain. Muat ulang halaman.',
        })
      }

      void logAuditEvent(request, {
        tableName: 'klaim_perjalanan', recordId: id,
        action: menolak ? 'klaim_perjalanan.tolak' : 'klaim_perjalanan.setujui',
        actorId: request.currentUser!.id,
        newValues: patch as Record<string, unknown>,
        severity: 'critical',
      })

      return reply.send({
        klaim: data[0],
        pesan: menolak
          ? `${k.nomor} ditolak.`
          : `${k.nomor} disetujui ${disetujui}. Utang ini menunggu pencairan — `
            + 'belum ada uang yang keluar sampai dibayar.',
      })
    },
  )

  // ── PATCH /api/v1/klaim-perjalanan/:id/bayar ─────────────────────────────
  app.patch<{ Params: { id: string }; Body: { cash_account_id?: string } }>(
    '/api/v1/klaim-perjalanan/:id/bayar',
    { preHandler: [authenticate, requireModul('modul.sdm'), requirePermission('klaim:bayar')] },
    async (request, reply) => {
      const db = request.db!
      const { id } = request.params
      const akun = request.body?.cash_account_id

      const { data: klaim, error: errBaca } = await db.unsafe('klaim_perjalanan', ALASAN)
        .select('id, nomor, status, total_disetujui, total_diajukan')
        .eq('id', id).eq('company_id', request.companyId!)
        .maybeSingle()
      if (errBaca) return reply.status(500).send({ error: errBaca.message })
      if (!klaim) return reply.status(404).send({ error: 'Klaim tidak ditemukan' })

      const k = klaim as Record<string, unknown>

      // Akun kas WAJIB milik tenant ini — tanpa cek, pembayaran tercatat
      // keluar dari kas perusahaan lain, dan rekonsiliasinya tak pernah cocok
      // di kedua sisi.
      if (akun) {
        const { data: ca, error: errCa } = await db
          .unsafe('cash_accounts', 'kategori B; disaring company_id di baris ini')
          .select('id')
          .eq('id', akun).eq('company_id', request.companyId!)
          .maybeSingle()
        if (errCa) return reply.status(500).send({ error: errCa.message })
        if (!ca) return reply.status(404).send({ error: 'Akun kas tidak ditemukan' })
      }

      const verdict = periksaTransisiKlaim({
        statusSekarang: k.status as StatusKlaim,
        statusTujuan: 'dibayar',
        totalDiajukan: Number(k.total_diajukan ?? 0),
        totalDisetujui: k.total_disetujui === null ? null : Number(k.total_disetujui),
        adaAkunKas: !!akun,
      })
      if (!verdict.boleh) return reply.status(409).send({ error: verdict.sebab })

      const { data, error } = await db.unsafe('klaim_perjalanan', ALASAN)
        .update({
          status: 'dibayar',
          dibayar_pada: new Date().toISOString(),
          cash_account_id: akun,
        })
        .eq('id', id).eq('company_id', request.companyId!)
        .eq('status', 'disetujui')
        .select('id, nomor, status, total_disetujui, dibayar_pada')
      if (error) {
        if (/check_violation|violates check/i.test(error.message)) {
          return reply.status(422).send({ error: error.message })
        }
        return reply.status(500).send({ error: error.message })
      }
      if (!data || data.length === 0) {
        return reply.status(409).send({
          error: 'Klaim sudah dibayar dari tempat lain. Muat ulang halaman.',
        })
      }

      void logAuditEvent(request, {
        tableName: 'klaim_perjalanan', recordId: id,
        action: 'klaim_perjalanan.bayar',
        actorId: request.currentUser!.id,
        newValues: { cash_account_id: akun, total: k.total_disetujui },
        severity: 'critical',
      })

      return reply.send({ klaim: data[0] })
    },
  )
}
