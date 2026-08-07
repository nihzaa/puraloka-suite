import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import {
  hitungJatuhTempo, ringkasBiayaAlat, nilaiKesehatanAlat,
  type JadwalPerawatan,
} from '../../lib/alat-operasional.js'

/**
 * OPERASIONAL ALAT (TUNDA kelompok B)
 *
 * ── Yang dijawab modul ini
 *
 * "Alat mana yang harus diservis MINGGU INI, dan mana yang biayanya sudah
 * tak masuk akal dibanding jam kerjanya?"
 *
 * ── Kenapa jatuh tempo DIHITUNG, bukan disimpan
 *
 * Kalau status "jatuh tempo" disimpan sebagai kolom, ia jadi basi diam-diam:
 * meter naik tiap hari, dan tak ada yang menjalankan ulang perhitungannya.
 * Excavator lewat ambang pada Selasa, tapi layarnya masih hijau sampai
 * seseorang ingat menekan tombol. Diturunkan tiap kali diminta = tak bisa
 * ketinggalan.
 *
 * ── `db.unsafe` dengan alasan tertulis
 *
 * Kelima tabel berkategori B (`company_id` NOT NULL), disaring
 * `eq('company_id', …)` di baris berikutnya — bukan lewat rantai proyek,
 * karena alat dimiliki TENANT dan berpindah antar proyek.
 */
export default async function alatOperasionalRoutes(app: FastifyInstance) {
  /** Tanggal acuan, dioper ke pustaka murni supaya hasilnya bisa diuji. */
  const hariIni = () => new Date().toISOString().slice(0, 10)

  // ── GET /api/v1/alat-operasional ────────────────────────────────────────
  //
  // Satu panggilan mengembalikan seluruh yang dibutuhkan layar: alat, meter
  // terkini, jatuh tempo per jadwal, ringkasan biaya, dan kesehatan pola
  // perawatan. Dipisah jadi lima endpoint akan membuat layar menampilkan
  // angka dari lima titik waktu berbeda.
  app.get('/api/v1/alat-operasional', {
    preHandler: [authenticate, requirePermission('assets:view')],
  }, async (request, reply) => {
    const db = request.db!
    const cid = request.companyId!
    const t = hariIni()

    const alasan = 'kategori B; disaring company_id di baris berikutnya'

    const [aset, pemakaian, jadwal, riwayat, biaya, susut] = await Promise.all([
      db.unsafe('assets', alasan)
        .select('id, asset_code, name, category, brand, model, status, condition, purchase_price, residual_value, useful_life_months, purchase_date')
        .eq('company_id', cid).order('asset_code'),
      db.unsafe('pemakaian_alat', alasan)
        .select('asset_id, tanggal, jam_mulai, jam_selesai, keperluan')
        .eq('company_id', cid).order('tanggal', { ascending: false }),
      db.unsafe('jadwal_perawatan', alasan)
        .select('id, asset_id, nama, jenis, setiap_jam, setiap_hari, jam_terakhir, tanggal_terakhir, perkiraan_biaya, aktif')
        .eq('company_id', cid).eq('aktif', true),
      db.unsafe('riwayat_perawatan', alasan)
        .select('id, asset_id, tanggal, biaya, bengkel, uraian, tak_terjadwal')
        .eq('company_id', cid).order('tanggal', { ascending: false }),
      db.unsafe('biaya_operasional_alat', alasan)
        .select('asset_id, tanggal, jenis, jumlah, kuantitas, satuan')
        .eq('company_id', cid),
      db.unsafe('penyusutan_alat', alasan)
        .select('asset_id, periode, nilai, akumulasi, journal_entry_id')
        .eq('company_id', cid).order('periode', { ascending: false }),
    ])

    // Diperiksa satu per satu dengan menyebut namanya, BUKAN lewat loop atas
    // sebuah array. Loop terlihat lebih ringkas, tapi query ketujuh yang
    // ditambahkan nanti dan lupa dimasukkan ke array itu akan gagal tanpa
    // suara — dan `?? []` di bawah mengubahnya jadi "nol baris" yang sah.
    // Itu persis cacat yang membuat kurva-s kehilangan Rp 631,7 juta.
    if (aset.error) return reply.status(500).send({ error: aset.error.message })
    if (pemakaian.error) return reply.status(500).send({ error: pemakaian.error.message })
    if (jadwal.error) return reply.status(500).send({ error: jadwal.error.message })
    if (riwayat.error) return reply.status(500).send({ error: riwayat.error.message })
    if (biaya.error) return reply.status(500).send({ error: biaya.error.message })
    if (susut.error) return reply.status(500).send({ error: susut.error.message })

    type Baris = Record<string, unknown>
    const perAset = <T extends { asset_id?: string }>(rows: T[] | null) => {
      const m = new Map<string, T[]>()
      for (const r of rows ?? []) {
        if (!r.asset_id) continue
        const a = m.get(r.asset_id) ?? []
        a.push(r)
        m.set(r.asset_id, a)
      }
      return m
    }

    const mPakai = perAset((pemakaian.data ?? []) as never[])
    const mJadwal = perAset((jadwal.data ?? []) as never[])
    const mRiwayat = perAset((riwayat.data ?? []) as never[])
    const mBiaya = perAset((biaya.data ?? []) as never[])
    const mSusut = perAset((susut.data ?? []) as never[])

    const alat = (aset.data ?? []).map((a) => {
      const id = (a as Baris).id as string
      const pakai = mPakai.get(id) ?? []

      // Meter terkini = pembacaan `jam_selesai` TERTINGGI, bukan yang
      // terbaru menurut tanggal. Entri mundur (salah ketik, koreksi) tak
      // boleh membuat alat terlihat "belum waktunya diservis".
      let meter: number | null = null
      let jamOperasi = 0
      for (const p of pakai as Baris[]) {
        const s = p.jam_selesai == null ? null : Number(p.jam_selesai)
        const m = p.jam_mulai == null ? null : Number(p.jam_mulai)
        if (s != null && Number.isFinite(s)) meter = meter == null ? s : Math.max(meter, s)
        if (s != null && m != null) jamOperasi += Math.max(0, s - m)
      }

      const jadwalAlat = (mJadwal.get(id) ?? []) as unknown as JadwalPerawatan[]
      const perawatan = jadwalAlat.map((j) => ({
        ...j,
        jatuhTempo: hitungJatuhTempo(j, meter, t),
      }))

      return {
        ...(a as Baris),
        meter,
        jamOperasi: Math.round(jamOperasi * 100) / 100,
        hariDipakai: pakai.length,
        perawatan,
        // Yang paling mendesak diangkat ke atas — layar tak boleh menuntut
        // pembacanya membandingkan sendiri belasan baris.
        palingMendesak: perawatan
          .filter((p) => p.jatuhTempo.status === 'jatuh_tempo' || p.jatuhTempo.status === 'segera')
          .sort((x, y) => (x.jatuhTempo.sisaJam ?? 9e9) - (y.jatuhTempo.sisaJam ?? 9e9))[0] ?? null,
        // Biaya perawatan ikut dijumlahkan — tanpa itu, alat yang paling
        // sering rusak justru terlihat paling murah karena kerusakannya
        // tercatat di tabel lain.
        biaya: ringkasBiayaAlat(
          (mBiaya.get(id) ?? []) as never[], jamOperasi,
          (mRiwayat.get(id) ?? []) as never[]),
        kesehatan: nilaiKesehatanAlat((mRiwayat.get(id) ?? []) as never[]),
        riwayat: mRiwayat.get(id) ?? [],
        penyusutan: mSusut.get(id) ?? [],
      }
    })

    return reply.send({ alat, total: alat.length, tanggal: t })
  })

  // ── POST /api/v1/alat-operasional/pemakaian ─────────────────────────────
  app.post('/api/v1/alat-operasional/pemakaian', {
    preHandler: [authenticate, requirePermission('assets:manage')],
  }, async (request, reply) => {
    const b = request.body as {
      asset_id?: string
      tanggal?: string
      jam_mulai?: number
      jam_selesai?: number
      project_id?: string | null
      keperluan?: string
      catatan?: string
    }

    if (!b.asset_id) return reply.status(400).send({ error: 'asset_id wajib diisi' })

    const db = request.db!
    const cid = request.companyId!

    // Alat WAJIB milik tenant ini — tanpa ini, jam operasi alat tenant lain
    // bisa ditulisi, dan jadwal perawatan mereka jatuh tempo lebih cepat.
    const { data: aset } = await db
      .unsafe('assets', 'memastikan alat milik tenant sebelum dicatat pemakaiannya')
      .select('id').eq('id', b.asset_id).eq('company_id', cid).maybeSingle()
    if (!aset) return reply.status(404).send({ error: 'Alat tidak ditemukan' })

    const { data, error } = await db
      .unsafe('pemakaian_alat', 'menyimpan pemakaian; alat sudah diverifikasi milik tenant')
      .insert({
        asset_id: b.asset_id,
        company_id: cid,
        project_id: b.project_id ?? null,
        tanggal: b.tanggal ?? hariIni(),
        jam_mulai: b.jam_mulai ?? null,
        jam_selesai: b.jam_selesai ?? null,
        keperluan: b.keperluan ?? null,
        catatan: b.catatan ?? null,
        created_by: request.currentUser!.id,
      })
      .select('id, tanggal, jam_mulai, jam_selesai')
      .single()

    if (error) {
      if (error.code === '23505') {
        return reply.status(409).send({
          error: 'Pemakaian alat ini pada tanggal tersebut sudah dicatat',
        })
      }
      if (error.code === '23514') {
        return reply.status(422).send({
          error: 'Pembacaan meter tidak wajar — jam selesai tak boleh lebih kecil dari jam mulai, dan tak boleh negatif',
        })
      }
      return reply.status(500).send({ error: error.message })
    }

    return reply.status(201).send({ pemakaian: data })
  })

  // ── POST /api/v1/alat-operasional/perawatan ─────────────────────────────
  app.post('/api/v1/alat-operasional/perawatan', {
    preHandler: [authenticate, requirePermission('assets:manage')],
  }, async (request, reply) => {
    const b = request.body as {
      asset_id?: string
      jadwal_id?: string | null
      tanggal?: string
      biaya?: number
      jam_meter?: number | null
      bengkel?: string
      uraian?: string
      tak_terjadwal?: boolean
    }

    if (!b.asset_id) return reply.status(400).send({ error: 'asset_id wajib diisi' })

    const db = request.db!
    const cid = request.companyId!

    const { data: aset } = await db
      .unsafe('assets', 'memastikan alat milik tenant sebelum dicatat servisnya')
      .select('id').eq('id', b.asset_id).eq('company_id', cid).maybeSingle()
    if (!aset) return reply.status(404).send({ error: 'Alat tidak ditemukan' })

    const { data, error } = await db
      .unsafe('riwayat_perawatan', 'menyimpan servis; alat sudah diverifikasi milik tenant')
      .insert({
        asset_id: b.asset_id,
        company_id: cid,
        jadwal_id: b.jadwal_id ?? null,
        tanggal: b.tanggal ?? hariIni(),
        biaya: b.biaya ?? 0,
        jam_meter: b.jam_meter ?? null,
        bengkel: b.bengkel ?? null,
        uraian: b.uraian ?? null,
        tak_terjadwal: b.tak_terjadwal ?? false,
        created_by: request.currentUser!.id,
      })
      .select('id, tanggal, biaya, tak_terjadwal')
      .single()

    if (error) {
      if (error.code === '23514') {
        return reply.status(422).send({
          error: 'Biaya dan jam meter tidak boleh negatif',
        })
      }
      return reply.status(500).send({ error: error.message })
    }

    // Servis yang tercatat menggeser acuan jadwalnya — kalau tidak, alat
    // yang BARU SAJA diservis tetap merah di layar, dan lama-lama semua
    // peringatan diabaikan karena selalu menyala.
    if (b.jadwal_id) {
      const { error: gagalGeser } = await db
        .unsafe('jadwal_perawatan', 'menggeser acuan jadwal setelah servis; alat sudah diverifikasi')
        .update({
          jam_terakhir: b.jam_meter ?? null,
          tanggal_terakhir: b.tanggal ?? hariIni(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', b.jadwal_id).eq('company_id', cid)
      if (gagalGeser) {
        request.log.error({ err: gagalGeser, jadwal_id: b.jadwal_id },
          'servis tercatat tapi acuan jadwal gagal digeser')
      }
    }

    return reply.status(201).send({ perawatan: data })
  })

  // ── POST /api/v1/alat-operasional/biaya ─────────────────────────────────
  app.post('/api/v1/alat-operasional/biaya', {
    preHandler: [authenticate, requirePermission('assets:manage')],
  }, async (request, reply) => {
    const b = request.body as {
      asset_id?: string
      tanggal?: string
      jenis?: string
      jumlah?: number
      kuantitas?: number | null
      satuan?: string | null
      project_id?: string | null
      uraian?: string
    }

    if (!b.asset_id) return reply.status(400).send({ error: 'asset_id wajib diisi' })
    if (!b.jenis) return reply.status(400).send({ error: 'jenis biaya wajib diisi' })

    const db = request.db!
    const cid = request.companyId!

    const { data: aset } = await db
      .unsafe('assets', 'memastikan alat milik tenant sebelum dicatat biayanya')
      .select('id').eq('id', b.asset_id).eq('company_id', cid).maybeSingle()
    if (!aset) return reply.status(404).send({ error: 'Alat tidak ditemukan' })

    const { data, error } = await db
      .unsafe('biaya_operasional_alat', 'menyimpan biaya; alat sudah diverifikasi milik tenant')
      .insert({
        asset_id: b.asset_id,
        company_id: cid,
        project_id: b.project_id ?? null,
        tanggal: b.tanggal ?? hariIni(),
        jenis: b.jenis,
        jumlah: b.jumlah ?? 0,
        kuantitas: b.kuantitas ?? null,
        satuan: b.satuan ?? null,
        uraian: b.uraian ?? null,
        created_by: request.currentUser!.id,
      })
      .select('id, tanggal, jenis, jumlah')
      .single()

    if (error) {
      if (error.code === '23514') {
        return reply.status(422).send({
          error: 'Jumlah biaya harus lebih dari nol, dan jenisnya harus salah satu yang dikenal',
        })
      }
      return reply.status(500).send({ error: error.message })
    }

    return reply.status(201).send({ biaya: data })
  })
}
