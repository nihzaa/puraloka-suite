import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'
import {
  hitungSlip, ringkasPayroll,
  type PegawaiPayroll, type HasilSlip,
} from '../../lib/payroll-staf.js'
import type { PeriodeTarif } from '../../lib/tarif-payroll.js'

/**
 * PAYROLL STAF (G2c) — menjalankan penggajian bulanan.
 *
 * ── Yang membentuk seluruh berkas ini
 *
 * **Slip MENYIMPAN hasilnya, bukan menghitung ulang saat dibaca.** Slip yang
 * sudah dibayarkan adalah pernyataan tentang uang yang SUDAH berpindah;
 * menghitungnya ulang dengan tarif hari ini membuat angka di layar tak cocok
 * dengan angka di rekening. Alasan lengkapnya di `db/migrations/287_*.sql`.
 *
 * Karena itu `POST /hitung` MENULIS hasilnya, dan `GET` hanya membaca yang
 * tersimpan. Dua endpoint yang berbeda sifatnya, bukan satu yang malas.
 *
 * ── Peringatan tenancy
 *
 * `payroll_periode` kategori B (punya `company_id`).
 * `slip_gaji` kategori C dengan `lewat: 'pegawai_id'` — BUKAN `periode_id`,
 * meski keduanya sama-sama menuju tenant. Peta tenancy yang memilih, dan
 * memakai kolom lain menghasilkan nol baris tanpa galat.
 * `slip_komponen` lewat `slip_id`.
 */

const PERIODE_SELECT = `
  id, bulan, status, tanggal_acuan, catatan,
  dihitung_pada, dikunci_oleh, dikunci_pada, created_at,
  pengunci:users!payroll_periode_dikunci_oleh_fkey ( id, name )
`

const SLIP_SELECT = `
  id, periode_id, pegawai_id, gaji_pokok, total_penghasilan, total_potongan,
  gaji_bersih, pph21, status_ptkp, kategori_ter, ptkp_setahun,
  tarif_ter_persen, jam_kerja, jam_lembur, catatan,
  tarif_ptkp_id, tarif_ter_id, tarif_bpjs_id,
  pegawai ( id, nomor_induk, jabatan, orang:users ( id, name ) )
`

export default async function payrollStafRoutes(app: FastifyInstance) {
  // ── GET /payroll/periode ─────────────────────────────────────────────────
  app.get(
    '/api/v1/payroll/periode',
    { preHandler: [authenticate, requirePermission('payroll:jalankan:view')] },
    async (request, reply) => {
      const { data, error } = await request.db!
        .from('payroll_periode')
        .select(PERIODE_SELECT)
        .order('bulan', { ascending: false })
        .limit(100)
      if (error) {
        request.log.error({ err: error }, 'gagal memuat periode payroll')
        return reply.status(500).send({ error: 'Gagal memuat periode payroll' })
      }
      return reply.send({ periode: data ?? [] })
    },
  )

  // ── POST /payroll/periode ────────────────────────────────────────────────
  app.post<{ Body: { bulan?: string; tanggal_acuan?: string; catatan?: string } }>(
    '/api/v1/payroll/periode',
    { preHandler: [authenticate, requirePermission('payroll:jalankan:manage')] },
    async (request, reply) => {
      const b = request.body

      if (!b.bulan || !/^\d{4}-\d{2}$/.test(b.bulan)) {
        return reply.status(400).send({ error: 'bulan wajib berformat YYYY-MM' })
      }

      // Tanggal acuan menentukan TARIF MANA yang dipakai. Bawaannya akhir
      // bulan — disimpan supaya perhitungan bisa diulang persis, termasuk
      // kalau kebijakannya berubah jadi awal bulan.
      const [y, m] = b.bulan.split('-').map(Number)
      const akhirBulan = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)

      const { data, error } = await request.db!
        .from('payroll_periode')
        .insert({
          company_id: request.companyId!,
          bulan: b.bulan,
          tanggal_acuan: b.tanggal_acuan || akhirBulan,
          catatan: b.catatan?.trim() || null,
          dibuat_oleh: request.currentUser!.id,
        })
        .select('id, bulan, status, tanggal_acuan')
        .single()

      if (error) {
        if ((error as { code?: string }).code === '23505') {
          return reply.status(409).send({
            error: `Periode payroll ${b.bulan} sudah ada. Buka yang itu, atau `
              + 'pilih bulan lain.',
          })
        }
        request.log.error({ err: error }, 'gagal membuat periode payroll')
        return reply.status(500).send({ error: error.message })
      }

      await logAuditEvent(request, {
        action: 'INSERT',
        actorId: request.currentUser!.id,
        tableName: 'payroll_periode',
        recordId: data!.id as string,
        newValues: data as Record<string, unknown>,
        severity: 'critical',
      })
      return reply.status(201).send({ periode: data })
    },
  )

  // ── GET /payroll/periode/:id ─────────────────────────────────────────────
  //
  // MEMBACA yang tersimpan. Tidak menghitung ulang — lihat kepala berkas.
  app.get<{ Params: { id: string } }>(
    '/api/v1/payroll/periode/:id',
    { preHandler: [authenticate, requirePermission('payroll:jalankan:view')] },
    async (request, reply) => {
      const { id } = request.params

      const { data: per, error: ePer } = await request.db!
        .from('payroll_periode')
        .select(PERIODE_SELECT)
        .eq('id', id)
        .maybeSingle()
      if (ePer) {
        request.log.error({ err: ePer, id }, 'gagal memuat periode payroll')
        return reply.status(500).send({ error: 'Gagal memuat periode payroll' })
      }
      if (!per) return reply.status(404).send({ error: 'Periode payroll tidak ditemukan' })

      const { data: slip, error: eSlip } = await request.db!
        .unsafe('slip_gaji',
          'daftar slip satu periode; tenancy dijamin RLS lewat periode→company')
        .select(SLIP_SELECT)
        .eq('periode_id', id)
        .limit(500)
      if (eSlip) {
        request.log.error({ err: eSlip, id }, 'gagal memuat slip')
        return reply.status(500).send({ error: 'Gagal memuat slip gaji' })
      }

      const daftar = (slip ?? []) as Array<Record<string, unknown>>

      // Komponen diambil sekaligus lalu dikelompokkan — bukan satu query per
      // slip. N+1 di sini berarti puluhan query untuk satu layar.
      const ids = daftar.map((s) => s.id as string)
      let komponen: Array<Record<string, unknown>> = []
      if (ids.length > 0) {
        const { data, error } = await request.db!
          .unsafe('slip_komponen',
            'disaring .in(slip_id, id slip milik periode ini) di query yang SAMA')
          .select('id, slip_id, urutan, jenis, kode, label, nominal, dasar_hitung')
          .in('slip_id', ids)
          .order('urutan', { ascending: true })
          .limit(5000)
        if (error) {
          request.log.error({ err: error, id }, 'gagal memuat komponen slip')
          return reply.status(500).send({ error: 'Gagal memuat komponen slip' })
        }
        komponen = (data ?? []) as Array<Record<string, unknown>>
      }

      const lengkap = daftar.map((s) => ({
        ...s,
        komponen: komponen.filter((k) => k.slip_id === s.id),
      }))

      return reply.send({
        periode: per,
        slip: lengkap,
        total: {
          pegawai: lengkap.length,
          penghasilan: daftar.reduce((t, s) => t + Number(s.total_penghasilan ?? 0), 0),
          potongan: daftar.reduce((t, s) => t + Number(s.total_potongan ?? 0), 0),
          bersih: daftar.reduce((t, s) => t + Number(s.gaji_bersih ?? 0), 0),
          pph21: daftar.reduce((t, s) => t + Number(s.pph21 ?? 0), 0),
        },
      })
    },
  )

  // ── POST /payroll/periode/:id/hitung ─────────────────────────────────────
  //
  // MENULIS hasilnya. Menghitung ulang menimpa slip yang ada — tetapi HANYA
  // selama periodenya belum dikunci (dijaga trigger 287).
  app.post<{ Params: { id: string } }>(
    '/api/v1/payroll/periode/:id/hitung',
    { preHandler: [authenticate, requirePermission('payroll:jalankan:manage')] },
    async (request, reply) => {
      const { id } = request.params

      const { data: per, error: ePer } = await request.db!
        .from('payroll_periode')
        .select('id, bulan, status, tanggal_acuan')
        .eq('id', id)
        .maybeSingle()
      if (ePer) return reply.status(500).send({ error: ePer.message })
      if (!per) return reply.status(404).send({ error: 'Periode payroll tidak ditemukan' })

      const p = per as { status: string; tanggal_acuan: string; bulan: string }
      if (p.status === 'dikunci') {
        return reply.status(409).send({
          error: 'Periode ini sudah dikunci — slip yang sudah dibayarkan tak boleh '
            + 'dihitung ulang. Buat periode penyesuaian kalau ada koreksi.',
        })
      }

      // ── Bahan: pegawai aktif + seluruh periode tarif ───────────────────
      const { data: pegawai, error: ePeg } = await request.db!
        .from('pegawai')
        .select('id, nomor_induk, gaji_pokok, status_ptkp, kategori_ter, orang:users ( id, name )')
        .is('tanggal_keluar', null)
        .limit(500)
      if (ePeg) return reply.status(500).send({ error: ePeg.message })

      const { data: tarifPeriode, error: eTar } = await request.db!
        .from('tarif_payroll_periode')
        .select('id, jenis, berlaku_sejak, dasar_hukum')
        .limit(500)
      if (eTar) return reply.status(500).send({ error: eTar.message })

      const tarifIds = (tarifPeriode ?? []).map((t) => (t as { id: string }).id)
      let tarifBaris: Array<Record<string, unknown>> = []
      if (tarifIds.length > 0) {
        const { data, error } = await request.db!
          .unsafe('tarif_payroll_baris',
            'disaring .in(periode_id, id periode tarif milik tenant ini) di query yang SAMA')
          .select('id, periode_id, urutan, kunci, label, batas_bawah, batas_atas, nilai_nominal, nilai_persen, persen_perusahaan, persen_karyawan')
          .in('periode_id', tarifIds)
          .limit(5000)
        if (error) return reply.status(500).send({ error: error.message })
        tarifBaris = (data ?? []) as Array<Record<string, unknown>>
      }

      const tarif: PeriodeTarif[] = (tarifPeriode ?? []).map((t) => ({
        ...(t as unknown as PeriodeTarif),
        baris: tarifBaris.filter((b) => b.periode_id === (t as { id: string }).id) as never,
      }))

      // ── Hitung ─────────────────────────────────────────────────────────
      const hasil: HasilSlip[] = (pegawai ?? []).map((row) => {
        const r = row as unknown as {
          id: string; nomor_induk: string | null
          gaji_pokok: unknown; status_ptkp: string | null; kategori_ter: string | null
          orang: { name: string } | null
        }
        const pp: PegawaiPayroll = {
          id: r.id,
          nomor_induk: r.nomor_induk,
          nama: r.orang?.name ?? '(tanpa nama)',
          gaji_pokok: r.gaji_pokok as never,
          status_ptkp: r.status_ptkp,
          kategori_ter: r.kategori_ter,
        }
        return hitungSlip(pp, tarif, p.tanggal_acuan)
      })

      // ── Simpan: hapus slip lama periode ini, tulis yang baru ───────────
      //
      // Hapus-lalu-tulis, bukan upsert per baris: komponen slip berubah
      // susunannya (komponen yang tak lagi berlaku harus HILANG, bukan
      // tertinggal). Aman karena periode terkunci sudah ditolak di atas.
      // best-effort: nol baris SAH di sini — periode yang baru dibuat memang
      // belum punya slip. Yang tak boleh diabaikan adalah GALAT-nya, dan itu
      // diperiksa di bawah.
      const { error: eHapus } = await request.db!
        .unsafe('slip_gaji',
          'menghapus slip lama periode ini sebelum menulis ulang; periode terkunci sudah ditolak di atas')
        .delete()
        .eq('periode_id', id)
      if (eHapus) {
        request.log.error({ err: eHapus, id }, 'gagal menghapus slip lama')
        return reply.status(500).send({ error: eHapus.message })
      }

      for (const h of hasil) {
        const { data: slip, error: eIns } = await request.db!
          .viaProject('slip_gaji', h.pegawai_id)
          .insert({
            periode_id: id,
            pegawai_id: h.pegawai_id,
            gaji_pokok: h.gaji_pokok,
            total_penghasilan: h.total_penghasilan,
            total_potongan: h.total_potongan,
            gaji_bersih: h.gaji_bersih,
            pph21: h.pph21,
            tarif_ptkp_id: h.tarif_ptkp_id,
            tarif_ter_id: h.tarif_ter_id,
            tarif_bpjs_id: h.tarif_bpjs_id,
            status_ptkp: h.status_ptkp,
            kategori_ter: h.kategori_ter,
            ptkp_setahun: h.ptkp_setahun,
            tarif_ter_persen: h.tarif_ter_persen,
          })
          .select('id')
          .single()
        if (eIns) {
          request.log.error({ err: eIns, pegawai: h.pegawai_id }, 'gagal menulis slip')
          return reply.status(500).send({ error: eIns.message })
        }

        if (h.komponen.length > 0) {
          const { error: eKom } = await request.db!
            .viaProject('slip_komponen', slip!.id as string)
            .insert(h.komponen.map((k) => ({
              slip_id: slip!.id,
              urutan: k.urutan,
              jenis: k.jenis,
              kode: k.kode,
              label: k.label,
              nominal: k.nominal,
              dasar_hitung: k.dasar_hitung,
            })))
          if (eKom) {
            request.log.error({ err: eKom, slip: slip!.id }, 'gagal menulis komponen slip')
            return reply.status(500).send({ error: eKom.message })
          }
        }
      }

      // Nol baris di sini BUKAN best-effort: periodenya sudah diperiksa ada
      // di awal handler, jadi update yang tak menyentuh baris berarti ia
      // terhapus di tengah jalan — dan slip yang baru ditulis jadi yatim.
      const { data: dUp, error: eUp } = await request.db!
        .from('payroll_periode')
        .update({
          status: 'dihitung',
          dihitung_pada: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select('id')
      if (eUp) return reply.status(500).send({ error: eUp.message })
      if (!dUp || dUp.length === 0) {
        request.log.error({ id }, 'periode payroll hilang saat menandai dihitung')
        return reply.status(404).send({ error: 'Periode payroll tidak ditemukan' })
      }

      const ringkas = ringkasPayroll(hasil)
      await logAuditEvent(request, {
        action: 'payroll.hitung',
        actorId: request.currentUser!.id,
        tableName: 'payroll_periode',
        recordId: id,
        newValues: {
          bulan: p.bulan, pegawai: ringkas.jumlah_pegawai,
          total_bersih: ringkas.total_bersih, bermasalah: ringkas.bermasalah.length,
        },
        severity: 'critical',
      })

      return reply.send({
        dihitung: ringkas.jumlah_pegawai,
        total: {
          penghasilan: ringkas.total_penghasilan,
          potongan: ringkas.total_potongan,
          bersih: ringkas.total_bersih,
          pph21: ringkas.total_pph21,
        },
        boleh_dikunci: ringkas.boleh_dikunci,
        // Penghalang dibawa keluar supaya layar bisa menunjukkan SIAPA dan
        // KENAPA — bukan sekadar "ada masalah".
        bermasalah: ringkas.bermasalah.map((s) => ({
          pegawai_id: s.pegawai_id,
          penghalang: s.penghalang,
        })),
      })
    },
  )

  // ── POST /payroll/periode/:id/kunci ──────────────────────────────────────
  app.post<{ Params: { id: string } }>(
    '/api/v1/payroll/periode/:id/kunci',
    { preHandler: [authenticate, requirePermission('payroll:jalankan:manage')] },
    async (request, reply) => {
      const { id } = request.params

      const { data: per, error: ePer } = await request.db!
        .from('payroll_periode')
        .select('id, bulan, status')
        .eq('id', id)
        .maybeSingle()
      if (ePer) return reply.status(500).send({ error: ePer.message })
      if (!per) return reply.status(404).send({ error: 'Periode payroll tidak ditemukan' })

      // Slip DIBACA dari yang tersimpan, bukan dihitung ulang: yang dikunci
      // adalah angka yang sudah tertulis, dan memeriksanya dengan hitungan
      // baru berarti memeriksa sesuatu yang lain.
      const { data: slip, error: eSlip } = await request.db!
        .unsafe('slip_gaji',
          'memeriksa slip tersimpan sebelum mengunci; tenancy dijamin RLS lewat periode→company')
        // `total_potongan` WAJIB ikut: pemeriksaan `slip-nol-potongan` di
        // bawah membacanya, dan kolom yang tak di-select tiba sebagai
        // `undefined` — `Number(undefined ?? 0) === 0` membuat SETIAP slip
        // terhitung nol potongan, sehingga penjaga menolak semuanya termasuk
        // yang benar. Ketahuan saat test menolak periode yang slipnya jelas
        // punya potongan.
        .select('id, gaji_bersih, tarif_bpjs_id, tarif_ter_id, gaji_pokok, total_potongan')
        .eq('periode_id', id)
        .limit(500)
      if (eSlip) return reply.status(500).send({ error: eSlip.message })

      const daftar = (slip ?? []) as Array<Record<string, unknown>>

      // Periode KOSONG tak boleh dikunci: menyatakan penggajian selesai tanpa
      // seorang pun dibayar.
      if (daftar.length === 0) {
        return reply.status(422).send({
          error: 'Belum ada slip di periode ini — jalankan hitung dulu.',
        })
      }

      // Slip tanpa jejak tarif berarti dihitung saat tarifnya belum ada.
      // Menguncinya membekukan angka yang lahir dari data yang hilang.
      const tanpaTarif = daftar.filter((s) => !s.tarif_bpjs_id || !s.tarif_ter_id)
      const tanpaGaji = daftar.filter((s) => Number(s.gaji_pokok ?? 0) === 0)

      // ⚠ NOL POTONGAN pada slip bergaji — penghalang yang paling mudah lolos.
      //
      // Ditemukan dari layar 2026-08-11: periode tarif dibuat tapi BARIS-nya
      // gagal tersimpan. Akibatnya `tarif_*_id` TERISI (periodenya ada!),
      // pemeriksaan di atas lolos, dan periode dikunci dengan potongan Rp 0
      // untuk SEMUA orang — slip yang tampak sah dengan angka yang salah.
      //
      // `kesiapanTarif` di G2a sudah memperingatkan kelas cacat ini ("periode
      // ada tapi nol baris"), tetapi endpoint ini tak memakainya. Pemeriksaan
      // berdasarkan HASIL, bukan berdasarkan keberadaan periode, menutupnya:
      // pegawai bergaji yang nol potongan hampir selalu berarti tabel tarifnya
      // kosong.
      const nolPotongan = daftar.filter(
        (s) => Number(s.gaji_pokok ?? 0) > 0 && Number(s.total_potongan ?? 0) === 0)

      if (tanpaTarif.length > 0 || tanpaGaji.length > 0 || nolPotongan.length > 0) {
        return reply.status(422).send({
          error: 'Belum bisa dikunci',
          penghalang: [
            ...(tanpaTarif.length > 0 ? [{
              kode: 'slip-tanpa-tarif',
              pesan: `${tanpaTarif.length} slip dihitung saat tarif belum ditetapkan. `
                + 'Isi tarifnya di halaman Tarif Payroll, lalu hitung ulang.',
            }] : []),
            ...(tanpaGaji.length > 0 ? [{
              kode: 'slip-tanpa-gaji-pokok',
              pesan: `${tanpaGaji.length} pegawai belum punya gaji pokok di data `
                + 'kepegawaian.',
            }] : []),
            ...(nolPotongan.length > 0 ? [{
              kode: 'slip-nol-potongan',
              pesan: `${nolPotongan.length} slip bergaji tapi NOL potongan — `
                + 'tabel tarifnya kemungkinan masih kosong (periodenya ada, '
                + 'barisnya belum diisi). Periksa halaman Tarif Payroll, lalu '
                + 'hitung ulang.',
            }] : []),
          ],
        })
      }

      // Status lama ikut di WHERE — dua penguncian bersamaan tak boleh
      // sama-sama berhasil.
      const { data, error } = await request.db!
        .from('payroll_periode')
        .update({
          status: 'dikunci',
          dikunci_oleh: request.currentUser!.id,
          dikunci_pada: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .neq('status', 'dikunci')
        .select('id, bulan, status, dikunci_pada')
        .maybeSingle()

      if (error) {
        request.log.error({ err: error, id }, 'gagal mengunci periode payroll')
        return reply.status(500).send({ error: error.message })
      }
      if (!data) {
        return reply.status(409).send({ error: 'Periode ini sudah dikunci' })
      }

      await logAuditEvent(request, {
        action: 'payroll.kunci',
        actorId: request.currentUser!.id,
        tableName: 'payroll_periode',
        recordId: id,
        newValues: data as Record<string, unknown>,
        severity: 'critical',
      })
      return reply.send({ periode: data })
    },
  )
}
