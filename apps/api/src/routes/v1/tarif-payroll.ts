import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'
import {
  periodeBerlaku, kesiapanTarif,
  type PeriodeTarif, type JenisTarif,
} from '../../lib/tarif-payroll.js'

/**
 * TARIF PAYROLL (G2a) — tarif sebagai DATA, bukan konstanta.
 *
 * ── Kenapa berkas ini ada sebelum payroll-nya sendiri
 *
 * R-011 mencabut larangan membangun payroll dengan syarat: PTKP, lapisan
 * PPh 21, dan persentase BPJS **tidak boleh ditulis ke dalam kode**. Sampai
 * founder mengisinya lewat halaman pengaturan, layar payroll menyatakan
 * "tarif belum ditetapkan" dan tidak menghitung apa pun.
 *
 * "Config-first" tanpa layar pengisian hanyalah klaim — kolomnya ada, dan
 * tak ada satu pun cara mengisinya. Itu kelas cacat yang sudah tujuh kali
 * terjadi di repo ini (`audit-kolom-tak-tersambung.mjs` lahir darinya).
 *
 * ── Peringatan tenancy
 *
 * `tarif_payroll_periode` kategori B (punya `company_id` sendiri).
 * `tarif_payroll_baris` kategori C dengan `lewat: 'periode_id'` — BUKAN
 * `project_id` maupun `company_id`.
 *
 * Skema, constraint, dan alasannya ada di `db/migrations/284_*.sql`.
 */

const BARIS_SELECT = `
  id, periode_id, urutan, kunci, label, batas_bawah, batas_atas,
  nilai_nominal, nilai_persen, persen_perusahaan, persen_karyawan
`

const JENIS_SAH: JenisTarif[] = ['ptkp', 'ter_pph21', 'bpjs']

export default async function tarifPayrollRoutes(app: FastifyInstance) {
  // ── GET /payroll/tarif — seluruh periode + barisnya ──────────────────────
  //
  // Dikirim SELURUHNYA, bukan hanya yang berlaku: halaman pengaturan harus
  // menampilkan riwayat supaya perubahan tarif bisa ditelusuri. Slip lama
  // dihitung dengan tarif lama, dan yang memeriksanya perlu melihat tarif
  // mana yang berlaku saat itu.
  app.get<{ Querystring: { pada?: string } }>(
    '/api/v1/payroll/tarif',
    { preHandler: [authenticate, requirePermission('payroll:tarif:view')] },
    async (request, reply) => {
      const { data: periode, error } = await request.db!
        .from('tarif_payroll_periode')
        .select('id, jenis, berlaku_sejak, dasar_hukum, catatan, ditetapkan_oleh, created_at')
        .order('jenis', { ascending: true })
        .order('berlaku_sejak', { ascending: false })
        .limit(500)
      if (error) {
        request.log.error({ err: error }, 'gagal memuat periode tarif')
        return reply.status(500).send({ error: 'Gagal memuat tarif payroll' })
      }

      const daftar = (periode ?? []) as Array<Record<string, unknown>>

      // Baris diambil sekaligus lalu dikelompokkan — bukan satu query per
      // periode. Halaman pengaturan menampilkan semuanya, dan N+1 di sini
      // berarti puluhan query untuk satu layar.
      const ids = daftar.map((p) => p.id as string)
      let baris: Array<Record<string, unknown>> = []
      if (ids.length > 0) {
        const { data, error: eB } = await request.db!
          .unsafe('tarif_payroll_baris',
            'disaring .in(periode_id, id periode milik tenant ini) di query yang SAMA')
          .select(BARIS_SELECT)
          .in('periode_id', ids)
          .order('urutan', { ascending: true })
          .limit(5000)
        if (eB) {
          request.log.error({ err: eB }, 'gagal memuat baris tarif')
          return reply.status(500).send({ error: 'Gagal memuat baris tarif' })
        }
        baris = (data ?? []) as Array<Record<string, unknown>>
      }

      const lengkap: PeriodeTarif[] = daftar.map((p) => ({
        ...(p as unknown as PeriodeTarif),
        baris: baris.filter((b) => b.periode_id === p.id) as never,
      }))

      // Tanggal acuan kesiapan. Bawaan: hari ini — pertanyaan yang paling
      // sering diajukan adalah "boleh jalankan payroll bulan ini?".
      const pada = request.query.pada ?? new Date().toISOString().slice(0, 10)

      return reply.send({
        periode: lengkap,
        kesiapan: kesiapanTarif(lengkap, pada),
        pada,
        // Yang BERLAKU pada tanggal itu, per jenis — dipisahkan supaya layar
        // tak perlu mengulang logika pemilihan periode (dan berisiko
        // memilih beda dari server).
        berlaku: Object.fromEntries(
          JENIS_SAH.map((j) => [j, periodeBerlaku(lengkap, j, pada)?.id ?? null]),
        ),
      })
    },
  )

  // ── POST /payroll/tarif — periode baru ───────────────────────────────────
  app.post<{
    Body: { jenis?: string; berlaku_sejak?: string; dasar_hukum?: string; catatan?: string }
  }>(
    '/api/v1/payroll/tarif',
    { preHandler: [authenticate, requirePermission('payroll:tarif:manage')] },
    async (request, reply) => {
      const b = request.body

      if (!b.jenis || !JENIS_SAH.includes(b.jenis as JenisTarif)) {
        return reply.status(400).send({
          error: `jenis wajib salah satu: ${JENIS_SAH.join(', ')}`,
        })
      }
      if (!b.berlaku_sejak) {
        return reply.status(400).send({ error: 'berlaku_sejak wajib diisi' })
      }
      // Dasar hukum WAJIB. Tarif tanpa dasar hukum tak bisa
      // dipertanggungjawabkan saat pemeriksaan, dan yang mengisinya tak
      // punya cara menunjukkan dari mana angkanya.
      if (!b.dasar_hukum?.trim()) {
        return reply.status(400).send({
          error: 'dasar_hukum wajib diisi — tarif tanpa dasar hukum tak bisa '
            + 'dipertanggungjawabkan saat pemeriksaan',
        })
      }

      const { data, error } = await request.db!
        .from('tarif_payroll_periode')
        .insert({
          company_id: request.companyId!,
          jenis: b.jenis,
          berlaku_sejak: b.berlaku_sejak,
          dasar_hukum: b.dasar_hukum.trim(),
          catatan: b.catatan?.trim() || null,
          ditetapkan_oleh: request.currentUser!.id,
        })
        .select('id, jenis, berlaku_sejak, dasar_hukum')
        .single()

      if (error) {
        // 23505 = periode dengan jenis + tanggal yang sama sudah ada.
        if ((error as { code?: string }).code === '23505') {
          return reply.status(409).send({
            error: 'Sudah ada tarif jenis ini yang berlaku sejak tanggal tersebut. '
              + 'Sunting yang ada, atau pakai tanggal berlaku yang berbeda.',
          })
        }
        request.log.error({ err: error }, 'gagal membuat periode tarif')
        return reply.status(500).send({ error: error.message })
      }

      // Tarif menentukan isi slip gaji dan setoran pajak — jejaknya kritis.
      await logAuditEvent(request, {
        action: 'INSERT',
        actorId: request.currentUser!.id,
        tableName: 'tarif_payroll_periode',
        recordId: data!.id as string,
        newValues: data as Record<string, unknown>,
        severity: 'critical',
      })
      return reply.status(201).send({ periode: data })
    },
  )

  // ── POST /payroll/tarif/:id/baris ────────────────────────────────────────
  app.post<{
    Params: { id: string }
    Body: {
      kunci?: string; label?: string; urutan?: number
      batas_bawah?: number | string | null; batas_atas?: number | string | null
      nilai_nominal?: number | string | null; nilai_persen?: number | string | null
      persen_perusahaan?: number | string | null; persen_karyawan?: number | string | null
    }
  }>(
    '/api/v1/payroll/tarif/:id/baris',
    { preHandler: [authenticate, requirePermission('payroll:tarif:manage')] },
    async (request, reply) => {
      const { id } = request.params
      const b = request.body

      if (!b.kunci?.trim()) return reply.status(400).send({ error: 'kunci wajib diisi' })

      // Kepemilikan periode diperiksa lebih dulu supaya baris tak bisa
      // ditempelkan ke periode tenant lain — RLS menolaknya di basis, tapi
      // dengan pesan yang tak bisa dibaca di layar.
      const { data: per, error: ePer } = await request.db!
        .from('tarif_payroll_periode')
        .select('id, jenis')
        .eq('id', id)
        .maybeSingle()
      if (ePer) return reply.status(500).send({ error: ePer.message })
      if (!per) return reply.status(404).send({ error: 'Periode tarif tidak ditemukan' })

      // `null` untuk yang kosong, BUKAN 0.
      //
      // String kosong dari form (`''`) yang diteruskan apa adanya akan
      // tersimpan sebagai NUMERIC 0 — tarif nol yang tampak sah. Ini cacat
      // yang sama yang ditemukan di `angka()` (`Number('') === 0`), hanya di
      // sisi tulis.
      const num = (v: unknown): number | null => {
        if (v === null || v === undefined) return null
        const s = String(v).trim()
        if (s === '') return null
        const n = Number(s)
        return Number.isFinite(n) ? n : null
      }

      const isi = {
        periode_id: id,
        urutan: Number.isFinite(b.urutan) ? b.urutan : 0,
        kunci: b.kunci.trim(),
        label: b.label?.trim() || null,
        batas_bawah: num(b.batas_bawah),
        batas_atas: num(b.batas_atas),
        nilai_nominal: num(b.nilai_nominal),
        nilai_persen: num(b.nilai_persen),
        persen_perusahaan: num(b.persen_perusahaan),
        persen_karyawan: num(b.persen_karyawan),
      }

      // Baris tanpa satu pun nilai ditolak di aplikasi juga, bukan hanya di
      // basis: ia akan terhitung sebagai "tarif sudah diisi" oleh pemeriksaan
      // kelengkapan, sehingga layar berhenti memperingatkan sementara
      // perhitungannya menghasilkan nol.
      if (isi.nilai_nominal === null && isi.nilai_persen === null
        && isi.persen_perusahaan === null && isi.persen_karyawan === null) {
        return reply.status(400).send({
          error: 'Baris tarif wajib punya nilai — nominal, persen, atau persen '
            + 'perusahaan/karyawan. Baris tanpa nilai terhitung "sudah diisi" '
            + 'tapi menghasilkan nol.',
        })
      }

      const { data, error } = await request.db!
        .viaProject('tarif_payroll_baris', id)
        .insert(isi)
        .select(BARIS_SELECT)
        .single()

      if (error) {
        if ((error as { code?: string }).code === '23505') {
          return reply.status(409).send({
            error: 'Baris dengan kunci dan batas bawah yang sama sudah ada di periode ini.',
          })
        }
        request.log.error({ err: error, id }, 'gagal menambah baris tarif')
        return reply.status(400).send({ error: error.message })
      }

      await logAuditEvent(request, {
        action: 'INSERT',
        actorId: request.currentUser!.id,
        tableName: 'tarif_payroll_baris',
        recordId: data!.id as string,
        newValues: data as Record<string, unknown>,
        severity: 'critical',
      })
      return reply.status(201).send({ baris: data })
    },
  )

  // ── DELETE /payroll/tarif/baris/:id ──────────────────────────────────────
  app.delete<{ Params: { id: string } }>(
    '/api/v1/payroll/tarif/baris/:id',
    { preHandler: [authenticate, requirePermission('payroll:tarif:manage')] },
    async (request, reply) => {
      const { id } = request.params

      const { data, error } = await request.db!
        .unsafe('tarif_payroll_baris',
          'id baris langsung; tenancy dijamin RLS RESTRICTIVE lewat periode→company')
        .delete()
        .eq('id', id)
        .select('id, kunci')

      if (error) {
        request.log.error({ err: error, id }, 'gagal menghapus baris tarif')
        return reply.status(500).send({ error: error.message })
      }
      // Nol baris terhapus BUKAN keberhasilan: barisnya tak ada, atau milik
      // tenant lain. Membalas 200 membuat layar menghapus baris dari tampilan
      // sementara di basis ia masih ada.
      if (!data || data.length === 0) {
        return reply.status(404).send({ error: 'Baris tarif tidak ditemukan' })
      }

      await logAuditEvent(request, {
        action: 'DELETE',
        actorId: request.currentUser!.id,
        tableName: 'tarif_payroll_baris',
        recordId: id,
        oldValues: data[0] as Record<string, unknown>,
        severity: 'critical',
      })
      return reply.send({ ok: true })
    },
  )
}
