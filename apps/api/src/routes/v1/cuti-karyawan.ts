import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { requireModul } from '../../utils/gerbang-modul.js'
import { logAuditEvent } from '../../utils/audit.js'
import {
  evaluateEntityApproval, recordApproval, idAlurPersetujuan, periksaGerbangSod,
} from '../../utils/approval.js'
import {
  hitungHariCuti, hitungSaldo, bolehAjukan,
  type BarisHak, type BarisAmbil, type HariLibur, type JenisCuti,
} from '../../lib/cuti-karyawan.js'

/**
 * CUTI & IZIN KARYAWAN (G2d).
 *
 * ── Dua aturan yang membentuk seluruh berkas ini
 *
 * 1. **Saldo diturunkan dari transaksi**, tak pernah disimpan sebagai kolom
 *    yang di-update. Kolom `sisa_cuti` akan menyimpang diam-diam dari
 *    riwayatnya, dan yang paling berkepentingan angkanya benar — karyawan —
 *    tak punya cara memeriksa.
 *
 * 2. **Jumlah hari dihitung SEKALI saat diajukan, lalu disimpan.** Kalender
 *    libur bisa berubah (cuti bersama diumumkan di tengah tahun), dan cuti
 *    yang sudah disetujui tak boleh tiba-tiba memakan jatah yang berbeda.
 *
 * Alasan lengkapnya di `lib/cuti-karyawan.ts` dan `db/migrations/288_*.sql`.
 *
 * ── Peringatan tenancy
 *
 * `cuti_hak` dan `cuti_ambil` kategori C dengan `lewat: 'pegawai_id'` —
 * BUKAN `project_id` maupun `company_id`. `hari_libur` kategori B.
 */

const AMBIL_SELECT = `
  id, pegawai_id, jenis, tanggal_mulai, tanggal_selesai, jumlah_hari,
  hari_dilewati, alasan, status, diputuskan_oleh, diputuskan_pada,
  alasan_tolak, created_at,
  pemutus:users!cuti_ambil_diputuskan_oleh_fkey ( id, name )
`

const HAK_SELECT = `
  id, pegawai_id, tahun, jumlah_hari, alasan, berlaku_sampai, created_at,
  pemberi:users ( id, name )
`

const JENIS_SAH: JenisCuti[] = [
  'tahunan', 'sakit', 'melahirkan', 'penting', 'besar', 'tanpa_gaji']

export default async function cutiKaryawanRoutes(app: FastifyInstance) {
  // ── GET /sdm/pegawai/:id/cuti?tahun=YYYY ─────────────────────────────────
  app.get<{ Params: { id: string }; Querystring: { tahun?: string } }>(
    '/api/v1/sdm/pegawai/:id/cuti',
    { preHandler: [authenticate, requireModul('modul.sdm'), requirePermission('sdm:cuti:view')] },
    async (request, reply) => {
      const { id } = request.params
      const tahun = Number(request.query.tahun) || new Date().getFullYear()

      const { data: peg, error: ePeg } = await request.db!
        .from('pegawai')
        .select('id, nomor_induk, jabatan, orang:users ( id, name )')
        .eq('id', id)
        .maybeSingle()
      if (ePeg) {
        request.log.error({ err: ePeg, id }, 'gagal memuat pegawai')
        return reply.status(500).send({ error: 'Gagal memuat pegawai' })
      }
      if (!peg) return reply.status(404).send({ error: 'Pegawai tidak ditemukan' })

      // ⚠ `cuti_hak`/`cuti_ambil` lewat `pegawai_id`, BUKAN project_id.
      const { data: hak, error: eHak } = await request.db!
        .viaProject('cuti_hak', id)
        .select(HAK_SELECT)
        .order('tahun', { ascending: false })
        .limit(200)
      if (eHak) {
        request.log.error({ err: eHak, id }, 'gagal memuat hak cuti')
        return reply.status(500).send({ error: 'Gagal memuat hak cuti' })
      }

      const { data: ambil, error: eAmbil } = await request.db!
        .viaProject('cuti_ambil', id)
        .select(AMBIL_SELECT)
        .order('tanggal_mulai', { ascending: false })
        .limit(300)
      if (eAmbil) {
        request.log.error({ err: eAmbil, id }, 'gagal memuat pengajuan cuti')
        return reply.status(500).send({ error: 'Gagal memuat pengajuan cuti' })
      }

      const barisHak = (hak ?? []) as unknown as BarisHak[]
      const barisAmbil = (ambil ?? []) as unknown as BarisAmbil[]

      // Saldo dihitung dari pengajuan TAHUN ITU saja — pengajuan tahun lain
      // memakai jatah tahun lain.
      const ambilTahunIni = barisAmbil.filter(
        (a) => a.tanggal_mulai.slice(0, 4) === String(tahun))

      return reply.send({
        pegawai: peg,
        tahun,
        hak: barisHak,
        ambil: barisAmbil,
        saldo: hitungSaldo(barisHak, ambilTahunIni, tahun),
      })
    },
  )

  // ── POST /sdm/pegawai/:id/cuti — ajukan ──────────────────────────────────
  app.post<{
    Params: { id: string }
    Body: {
      jenis?: string; tanggal_mulai?: string; tanggal_selesai?: string
      alasan?: string
    }
  }>(
    '/api/v1/sdm/pegawai/:id/cuti',
    { preHandler: [authenticate, requireModul('modul.sdm'), requirePermission('sdm:cuti:manage')] },
    async (request, reply) => {
      const { id } = request.params
      const b = request.body

      if (!b.jenis || !JENIS_SAH.includes(b.jenis as JenisCuti)) {
        return reply.status(400).send({
          error: `jenis wajib salah satu: ${JENIS_SAH.join(', ')}`,
        })
      }
      const TGL = /^\d{4}-\d{2}-\d{2}$/
      if (!b.tanggal_mulai || !TGL.test(b.tanggal_mulai)
        || !b.tanggal_selesai || !TGL.test(b.tanggal_selesai)) {
        return reply.status(400).send({
          error: 'tanggal_mulai dan tanggal_selesai wajib berformat YYYY-MM-DD',
        })
      }

      const { data: peg, error: ePeg } = await request.db!
        .from('pegawai')
        .select('id')
        .eq('id', id)
        .maybeSingle()
      if (ePeg) return reply.status(500).send({ error: ePeg.message })
      if (!peg) return reply.status(404).send({ error: 'Pegawai tidak ditemukan' })

      // Kalender libur yang BERLAKU SAAT INI — dipakai sekali, lalu hasilnya
      // disimpan. Lihat kepala berkas.
      const { data: libur, error: eLibur } = await request.db!
        .from('hari_libur')
        .select('tanggal, nama, tetap_bekerja')
        .gte('tanggal', b.tanggal_mulai)
        .lte('tanggal', b.tanggal_selesai)
        .limit(400)
      if (eLibur) {
        request.log.error({ err: eLibur }, 'gagal memuat kalender libur')
        return reply.status(500).send({ error: 'Gagal memuat kalender libur' })
      }

      const hitung = hitungHariCuti(
        b.tanggal_mulai, b.tanggal_selesai,
        (libur ?? []) as unknown as HariLibur[],
      )

      // Saldo & tumpang tindih diperiksa dengan data yang SAMA yang dipakai
      // layar — supaya penolakan bisa diramalkan, bukan mengejutkan.
      const tahun = Number(b.tanggal_mulai.slice(0, 4))

      // Galat DIPERIKSA, bukan diabaikan. Query yang gagal tanpa dilihat
      // menghasilkan `data = null` → saldo 0 → pengajuan ditolak dengan
      // pesan "sisa jatah 0 hari" yang SALAH, dan karyawan mengira jatahnya
      // habis. `audit-kegagalan-senyap` menangkap versi pertama berkas ini.
      const { data: hak, error: eHak2 } = await request.db!
        .viaProject('cuti_hak', id).select(HAK_SELECT).limit(200)
      if (eHak2) {
        request.log.error({ err: eHak2, id }, 'gagal memuat hak cuti saat mengajukan')
        return reply.status(500).send({ error: 'Gagal memeriksa saldo cuti' })
      }
      const { data: lain, error: eLain } = await request.db!
        .viaProject('cuti_ambil', id).select(AMBIL_SELECT).limit(300)
      if (eLain) {
        request.log.error({ err: eLain, id }, 'gagal memuat pengajuan lain')
        return reply.status(500).send({ error: 'Gagal memeriksa pengajuan lain' })
      }

      const barisLain = (lain ?? []) as unknown as BarisAmbil[]
      const saldo = hitungSaldo(
        (hak ?? []) as unknown as BarisHak[],
        barisLain.filter((a) => a.tanggal_mulai.slice(0, 4) === String(tahun)),
        tahun,
      )

      const izin = bolehAjukan(
        b.jenis as JenisCuti, b.tanggal_mulai, b.tanggal_selesai,
        hitung, saldo, barisLain,
      )
      if (!izin.boleh) {
        return reply.status(422).send({
          error: 'Pengajuan cuti belum bisa dibuat',
          penghalang: izin.penghalang,
        })
      }

      const { data, error } = await request.db!
        .viaProject('cuti_ambil', id)
        .insert({
          pegawai_id: id,
          jenis: b.jenis,
          tanggal_mulai: b.tanggal_mulai,
          tanggal_selesai: b.tanggal_selesai,
          // DISIMPAN, tak dihitung ulang saat dibaca.
          jumlah_hari: hitung.jumlah_hari,
          hari_dilewati: hitung.dilewati.length > 0
            ? hitung.dilewati.map((d) => `${d.tanggal} (${d.sebab})`).join(', ')
            : null,
          alasan: b.alasan?.trim() || null,
          diajukan_oleh: request.currentUser!.id,
        })
        .select(AMBIL_SELECT)
        .single()

      if (error) {
        request.log.error({ err: error, id }, 'gagal mengajukan cuti')
        return reply.status(400).send({ error: error.message })
      }

      await logAuditEvent(request, {
        action: 'INSERT',
        actorId: request.currentUser!.id,
        tableName: 'cuti_ambil',
        recordId: data!.id as string,
        newValues: data as Record<string, unknown>,
      })
      return reply.status(201).send({ cuti: data, hitung })
    },
  )

  // ── POST /sdm/cuti/:id/putuskan ──────────────────────────────────────────
  app.post<{ Params: { id: string }; Body: { setujui?: boolean; alasan?: string } }>(
    '/api/v1/sdm/cuti/:id/putuskan',
    { preHandler: [authenticate, requireModul('modul.sdm'), requirePermission('sdm:cuti:approve')] },
    async (request, reply) => {
      const { id } = request.params
      const b = request.body

      if (typeof b.setujui !== 'boolean') {
        return reply.status(400).send({ error: 'setujui wajib true atau false' })
      }
      // Penolakan WAJIB beralasan — cuti yang ditolak tanpa alasan akan
      // diajukan lagi dengan bentuk yang sama.
      if (!b.setujui && !b.alasan?.trim()) {
        return reply.status(400).send({
          error: 'Penolakan wajib beralasan — yang mengajukan harus tahu APA '
            + 'yang perlu diperbaiki',
        })
      }

      // ── Persetujuan lewat MESIN, bukan tulis kolom langsung ─────────────
      //
      // Versi pertama menulis `diputuskan_oleh` langsung, dan
      // `audit-approval-satu-pintu.mjs` merahkannya. Penjaga itu benar: cuti
      // TANPA GAJI memotong gaji, dan sebagian perusahaan menuntut cuti
      // panjang disetujui berjenjang (atasan lalu HRD). Tulis-langsung
      // membuat rantai dua langkah lolos dengan satu ketukan.
      //
      // PENOLAKAN tidak lewat mesin: menolak bukan "menyetujui langkah",
      // dan menuntut rantai penuh untuk menolak berarti pengajuan yang
      // jelas salah tetap menggantung menunggu level berikutnya.
      if (b.setujui) {
        const decision = await evaluateEntityApproval(request, {
          entityType: 'cuti_karyawan', entityId: id, amount: null,
        })
        if (decision.configError) {
          request.log.error({ configError: decision.configError, id },
            'evaluasi rantai approval cuti gagal')
          return reply.status(500).send({ error: 'Gagal memeriksa konfigurasi approval' })
        }
        if (!decision.allowed) {
          if (decision.reason === 'already_approved') {
            return reply.status(409).send({ error: 'Cuti ini sudah disetujui penuh' })
          }
          return reply.status(403).send({ error: 'Akses ditolak' })
        }

        // TJS-P4 — pengaju tak boleh menyetujui pengajuannya sendiri.
        const sod = await periksaGerbangSod(request, 'cuti_karyawan', id, {
          alasanOverride: (request.body as { alasan_override?: string } | undefined)?.alasan_override,
          level: decision.step?.level,
        })
        if (!sod.ok) return reply.status(403).send({ error: sod.pesan })
        if (decision.step) {
          const rec = await recordApproval({
            entityType: 'cuti_karyawan', entityId: id, level: decision.step.level,
            approvedBy: request.currentUser!.id, companyId: request.companyId!,
          })
          if (!rec.ok) {
            return reply.status(500).send({ error: 'Gagal mencatat persetujuan: ' + rec.error })
          }

          // Belum langkah terakhir: status TETAP `diajukan`. Menandainya
          // disetujui di sini persis kesalahan yang penjaga cegah — separuh
          // rantai, status penuh.
          if (!decision.isFinalStep) {
            const next = decision.applicable.find((x) => x.level > decision.step!.level)
            await logAuditEvent(request, {
              action: 'cuti.approval.level',
              actorId: request.currentUser!.id,
              tableName: 'cuti_ambil',
              recordId: id,
              newValues: { level: decision.step.level, of: decision.applicable.length },
              workflowId: idAlurPersetujuan(id),
            })
            return reply.send({
              ok: true, pending_next_level: true,
              message: `Persetujuan level ${decision.step.level} tercatat. `
                + `Menunggu level ${next?.level ?? '-'}.`,
            })
          }
        }
      }

      const perubahan = {
        status: b.setujui ? ('disetujui' as const) : ('ditolak' as const),
        // Pemutus diisi SERVER dari sesi, bukan diterima dari klien.
        diputuskan_oleh: request.currentUser!.id,
        diputuskan_pada: new Date().toISOString(),
        alasan_tolak: b.setujui ? null : b.alasan!.trim(),
        updated_at: new Date().toISOString(),
      }

      // Hanya yang DIAJUKAN yang bisa diputuskan, dan status lama ikut di
      // WHERE — dua keputusan bersamaan tak boleh sama-sama berhasil.
      const { data, error } = await request.db!
        .unsafe('cuti_ambil',
          'id baris langsung + status lama di WHERE; tenancy dijamin RLS lewat pegawai→company')
        .update(perubahan)
        .eq('id', id)
        .eq('status', 'diajukan')
        .select('id, jenis, tanggal_mulai, tanggal_selesai, jumlah_hari, status')
        .maybeSingle()

      if (error) {
        request.log.error({ err: error, id }, 'gagal memutuskan cuti')
        return reply.status(500).send({ error: error.message })
      }
      if (!data) {
        return reply.status(409).send({
          error: 'Pengajuan ini tidak berstatus diajukan — mungkin sudah '
            + 'diputuskan dari tempat lain. Muat ulang halaman.',
        })
      }

      await logAuditEvent(request, {
        action: b.setujui ? 'APPROVE' : 'REJECT',
        actorId: request.currentUser!.id,
        tableName: 'cuti_ambil',
        recordId: id,
        newValues: data as Record<string, unknown>,
      })
      return reply.send({ cuti: data })
    },
  )

  // ── POST /sdm/cuti/:id/batal ─────────────────────────────────────────────
  //
  // Membatalkan, BUKAN menghapus: pengajuan yang hilang tanpa jejak membuat
  // saldo yang pernah tertahan tak bisa dijelaskan.
  app.post<{ Params: { id: string } }>(
    '/api/v1/sdm/cuti/:id/batal',
    { preHandler: [authenticate, requireModul('modul.sdm'), requirePermission('sdm:cuti:manage')] },
    async (request, reply) => {
      const { id } = request.params

      // Yang sudah DISETUJUI juga boleh dibatalkan — rencana berubah, dan
      // memaksa cuti yang tak jadi diambil tetap memotong jatah adalah
      // hukuman untuk sesuatu yang bukan kesalahan.
      const { data, error } = await request.db!
        .unsafe('cuti_ambil',
          'id baris langsung + status lama di WHERE; tenancy dijamin RLS lewat pegawai→company')
        .update({ status: 'dibatalkan', updated_at: new Date().toISOString() })
        .eq('id', id)
        .in('status', ['diajukan', 'disetujui'])
        .select('id, status, jumlah_hari')
        .maybeSingle()

      if (error) {
        request.log.error({ err: error, id }, 'gagal membatalkan cuti')
        return reply.status(500).send({ error: error.message })
      }
      if (!data) {
        return reply.status(409).send({
          error: 'Pengajuan ini tak bisa dibatalkan — mungkin sudah ditolak '
            + 'atau dibatalkan sebelumnya.',
        })
      }

      await logAuditEvent(request, {
        action: 'UPDATE',
        actorId: request.currentUser!.id,
        tableName: 'cuti_ambil',
        recordId: id,
        newValues: data as Record<string, unknown>,
      })
      return reply.send({ cuti: data })
    },
  )

  // ── POST /sdm/pegawai/:id/cuti-hak — beri / koreksi jatah ────────────────
  app.post<{
    Params: { id: string }
    Body: { tahun?: number; jumlah_hari?: number | string; alasan?: string; berlaku_sampai?: string }
  }>(
    '/api/v1/sdm/pegawai/:id/cuti-hak',
    { preHandler: [authenticate, requireModul('modul.sdm'), requirePermission('sdm:cuti:hak')] },
    async (request, reply) => {
      const { id } = request.params
      const b = request.body

      const tahun = Number(b.tahun)
      if (!Number.isInteger(tahun) || tahun < 2000 || tahun > 2200) {
        return reply.status(400).send({ error: 'tahun wajib diisi (2000–2200)' })
      }

      // `null` untuk kosong, bukan 0 — pelajaran G2a (`Number('') === 0`).
      const s = String(b.jumlah_hari ?? '').trim()
      const jumlah = s === '' ? null : Number(s)
      if (jumlah === null || !Number.isFinite(jumlah) || jumlah === 0) {
        return reply.status(400).send({
          error: 'jumlah_hari wajib diisi dan tak boleh nol. Boleh NEGATIF '
            + 'untuk mengoreksi jatah yang terlanjur berlebih — koreksi dicatat '
            + 'sebagai baris tersendiri supaya jejaknya terlihat.',
        })
      }

      // Alasan WAJIB: angka jatah yang muncul tanpa keterangan tak bisa
      // dipertanggungjawabkan saat dipertanyakan.
      if (!b.alasan?.trim()) {
        return reply.status(400).send({
          error: 'alasan wajib diisi — angka jatah tanpa keterangan tak bisa '
            + 'dipertanggungjawabkan saat dipertanyakan',
        })
      }

      const { data: peg, error: ePeg } = await request.db!
        .from('pegawai').select('id').eq('id', id).maybeSingle()
      if (ePeg) return reply.status(500).send({ error: ePeg.message })
      if (!peg) return reply.status(404).send({ error: 'Pegawai tidak ditemukan' })

      const { data, error } = await request.db!
        .viaProject('cuti_hak', id)
        .insert({
          pegawai_id: id,
          tahun,
          jumlah_hari: jumlah,
          alasan: b.alasan.trim(),
          berlaku_sampai: b.berlaku_sampai || null,
          diberikan_oleh: request.currentUser!.id,
        })
        .select(HAK_SELECT)
        .single()

      if (error) {
        request.log.error({ err: error, id }, 'gagal menambah hak cuti')
        return reply.status(400).send({ error: error.message })
      }

      await logAuditEvent(request, {
        action: 'INSERT',
        actorId: request.currentUser!.id,
        tableName: 'cuti_hak',
        recordId: data!.id as string,
        newValues: data as Record<string, unknown>,
        // Jatah cuti adalah hak karyawan — perubahannya kritis.
        severity: 'critical',
      })
      return reply.status(201).send({ hak: data })
    },
  )
}
