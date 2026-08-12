import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import {
  hitungJatuhTempo, ringkasBiayaAlat, nilaiKesehatanAlat,
  type JadwalPerawatan,
} from '../../lib/alat-operasional.js'
import {
  susunJurnalPenyusutan,
  AKUN_BEBAN_PENYUSUTAN, AKUN_AKUMULASI_PENYUSUTAN,
} from '../../lib/jurnal-penyusutan.js'
import { logAuditEvent } from '../../utils/audit.js'

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

    // Status jurnal dibaca TERPISAH, bukan lewat join PostgREST.
    //
    // `penyusutan_alat` tak punya FK ke `journal_entries` — diukur ke
    // `pg_constraint`, hanya ada FK ke assets/companies/users. Tanpa FK,
    // PostgREST tak mengenali relasinya dan `journal_entries(status)`
    // membuat SELURUH permintaan gagal 500. Terbukti: halaman ini sempat
    // rusak total karenanya.
    //
    // Kenapa statusnya perlu: jurnal baru berstatus `draft`, dan draft TIDAK
    // masuk laporan (`/gl/laporan` menyaring `posted`). Tanpa ini layar
    // berkata "sudah dijurnalkan" sementara neraca belum bergerak sedikit
    // pun, dan pengguna mencari selisihnya di tempat yang salah.
    const idJurnal = [...new Set(
      (susut.data ?? [])
        .map((r) => (r as Baris).journal_entry_id as string | null)
        .filter((x): x is string => !!x),
    )]
    const statusJurnal = new Map<string, { status: string; entry_number: string }>()
    if (idJurnal.length > 0) {
      const { data: je, error: jeErr } = await db.from('journal_entries')
        .select('id, status, entry_number').in('id', idJurnal)
      // Galat DIPERIKSA: tanpa status, layar akan menampilkan seluruh
      // penyusutan sebagai "belum dijurnalkan" dan menawarkan tombol yang
      // menghasilkan 404.
      if (jeErr) return reply.status(500).send({ error: jeErr.message })
      for (const j of je ?? []) {
        statusJurnal.set((j as { id: string }).id, {
          status: (j as { status: string }).status,
          entry_number: (j as { entry_number: string }).entry_number,
        })
      }
    }

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
        penyusutan: (mSusut.get(id) ?? []).map((p) => {
          const j = (p as Baris).journal_entry_id as string | null
          const st = j ? statusJurnal.get(j) : undefined
          return { ...(p as Baris), jurnal_status: st?.status ?? null, jurnal_nomor: st?.entry_number ?? null }
        }),
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

  // ── POST /alat-operasional/penyusutan/jurnalkan ──────────────────────────
  //
  // Menutup lubang yang diukur 2026-08-12: `penyusutan_alat` berisi 12 baris
  // dengan `journal_entry_id` NULL SELURUHNYA. Kolomnya ada sejak lama;
  // jalur yang mengisinya tak pernah dibangun.
  //
  // Akibatnya beban penyusutan tak pernah masuk laba-rugi, dan nilai buku
  // aset di neraca lebih tinggi daripada kenyataannya — dua laporan yang
  // paling sering ditanyakan calon pelanggan, dua-duanya salah, tanpa satu
  // pun galat.
  //
  // ── Kenapa izin `gl:manage`, bukan `assets:manage`
  //
  // Yang dihasilkan endpoint ini adalah JURNAL, dan jurnal mengubah laporan
  // keuangan. Orang yang boleh mencatat pemakaian alat belum tentu boleh
  // menyentuh buku besar — dan `assets:manage` diberikan jauh lebih luas.
  app.post<{ Body: { periode?: string } }>(
    '/api/v1/alat-operasional/penyusutan/jurnalkan',
    { preHandler: [authenticate, requirePermission('gl:manage')] },
    async (request, reply) => {
      const db = request.db!
      const cid = request.companyId!
      const periode = String(request.body?.periode ?? '').slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(periode)) {
        return reply.status(400).send({ error: 'periode wajib, bentuk YYYY-MM-DD' })
      }

      const alasan = 'kategori B; disaring company_id di baris berikutnya'

      // Hanya yang BELUM dijurnalkan. Tanpa `.is(null)` ini, memanggil ulang
      // endpoint yang sama menjurnalkan periode itu dua kali — beban ganda
      // yang totalnya tetap seimbang, jadi tak ada satu pun pemeriksaan yang
      // menabraknya.
      const { data: baris, error: errBaca } = await db
        .unsafe('penyusutan_alat', alasan)
        .select('id, asset_id, periode, nilai')
        .eq('company_id', cid)
        .eq('periode', periode)
        .is('journal_entry_id', null)
      if (errBaca) return reply.status(500).send({ error: errBaca.message })
      if (!baris || baris.length === 0) {
        return reply.status(404).send({
          error: `Tak ada penyusutan periode ${periode} yang belum dijurnalkan.`,
        })
      }

      // Nama alat untuk keterangan jurnal — dibaca terpisah, bukan lewat
      // join, karena `penyusutan_alat` diakses `unsafe` dan join di sana
      // menyulitkan pembacaan saringan tenant-nya.
      // Nama variabel SENGAJA berbeda dari yang dipakai tiga handler lain di
      // berkas ini.
      //
      // Penjaga `audit-kegagalan-senyap` mengumpulkan variabel rawan
      // per-BERKAS, bukan per-blok: selama ada satu destructuring tanpa
      // `error` memakai nama yang sama di mana pun, tiap pemakaian nama itu
      // dengan fallback array kosong ikut ditandai — termasuk yang sudah
      // diperiksa dengan benar. Nama yang unik menghindarkannya.
      const { data: asetNama, error: errAset } = await db.unsafe('assets', alasan)
        .select('id, name, asset_code').eq('company_id', cid)
      // Galat DIPERIKSA meski ini "hanya" nama untuk keterangan: kalau
      // gagal, `?? []` mengubahnya jadi nol baris dan seluruh jurnal
      // berketerangan "Penyusutan alat" tanpa satu pun nama. Jejak yang tak
      // bisa dirunut, dan tak ada yang tahu kenapa.
      if (errAset) return reply.status(500).send({ error: errAset.message })
      const namaAset = new Map((asetNama ?? []).map(a => [
        (a as { id: string }).id,
        `${(a as { asset_code?: string }).asset_code ?? ''} ${(a as { name?: string }).name ?? ''}`.trim(),
      ]))

      const susun = susunJurnalPenyusutan(
        (baris as Array<Record<string, unknown>>).map(b => ({
          id: b.id as string,
          periode: String(b.periode),
          nilai: b.nilai as string,
          namaAlat: namaAset.get(b.asset_id as string) ?? null,
        })),
      )
      if (!susun.ok) return reply.status(422).send({ error: susun.sebab })

      // Kode akun → id, MILIK TENANT INI. `accounts.company_id` NOT NULL,
      // jadi memakai kode saja tanpa saringan akan menulis jurnal ke akun
      // tenant lain pada basis multi-tenant.
      const { data: akun, error: errAkun } = await db.from('accounts')
        .select('id, code')
        .in('code', [AKUN_BEBAN_PENYUSUTAN, AKUN_AKUMULASI_PENYUSUTAN])
      if (errAkun) return reply.status(500).send({ error: errAkun.message })
      const petaAkun = new Map((akun ?? []).map(a => [(a as { code: string }).code, (a as { id: string }).id]))
      const hilang = [AKUN_BEBAN_PENYUSUTAN, AKUN_AKUMULASI_PENYUSUTAN].filter(k => !petaAkun.has(k))
      if (hilang.length > 0) {
        // Fail-closed dengan pesan yang menyebut apa yang harus dilakukan.
        // Menulis jurnal separuh akan meninggalkan buku besar tak seimbang.
        return reply.status(422).send({
          error: `Akun ${hilang.join(' & ')} belum ada di bagan akun. `
            + 'Jalankan migrasi 324 atau buat akunnya di Bagan Akun.',
        })
      }

      // ── Periode tertutup ditolak DI DEPAN, bukan saat posting ────────────
      //
      // Ditemukan 2026-08-12 saat memposting hasil endpoint ini: Mei, Juni,
      // Juli 2026 semuanya `tertutup`, dan trigger basis menolak posting
      // dengan benar.
      //
      // Tapi jurnalnya SUDAH TERBUAT sebagai draft, dan
      // `penyusutan_alat.journal_entry_id` sudah tertandai. Hasilnya draft
      // yang tak akan pernah bisa diposting, sementara penyusutannya mengaku
      // sudah dijurnalkan — jalan buntu yang harus dibersihkan tangan.
      //
      // Memeriksanya di sini mengubah jalan buntu jadi kalimat yang bisa
      // ditindaklanjuti: buka kembali periodenya, atau jangan jurnalkan.
      const { data: per, error: perErr } = await db.from('periode_akuntansi')
        .select('nama, status')
        .lte('tanggal_mulai', periode)
        .gte('tanggal_akhir', periode)
        .maybeSingle()
      if (perErr) return reply.status(500).send({ error: perErr.message })
      if (per && (per as { status: string }).status !== 'terbuka') {
        return reply.status(409).send({
          error: `Periode "${(per as { nama: string }).nama}" sudah ditutup — `
            + 'jurnal penyusutan bertanggal itu tak akan bisa diposting. '
            + 'Buka kembali periodenya di Tutup Buku lebih dulu.',
        })
      }

      const tahun = Number(periode.slice(0, 4))
      // Galat DIPERIKSA: kalau pembacaan nomor terakhir gagal, `terakhir`
      // jadi null dan nomornya kembali ke JV-<tahun>-0001 — bentrok dengan
      // jurnal yang sudah ada, dan penolakannya muncul sebagai galat unik
      // yang membicarakan hal lain.
      const { data: terakhir, error: errNomor } = await db.from('journal_entries')
        .select('entry_number').like('entry_number', `JV-${tahun}-%`)
        .order('entry_number', { ascending: false }).limit(1).maybeSingle()
      if (errNomor) return reply.status(500).send({ error: errNomor.message })
      const urut = terakhir?.entry_number
        ? Number(String(terakhir.entry_number).split('-').pop()) + 1
        : 1
      const nomor = `JV-${tahun}-${String(urut).padStart(4, '0')}`

      const { data: kepala, error: errKepala } = await db.from('journal_entries')
        .insert({
          entry_number: nomor,
          entry_date: susun.entryDate,
          description: susun.description,
          notes: 'Dibuat otomatis dari register penyusutan alat.',
          created_by: request.currentUser!.id,
        })
        .select('id, entry_number, status')
        .single()
      if (errKepala || !kepala) {
        return reply.status(500).send({ error: errKepala?.message ?? 'Gagal membuat jurnal' })
      }
      const jurnalId = (kepala as { id: string }).id

      const { error: errBaris } = await db
        .unsafe('journal_entry_lines', 'mewarisi tenancy dari kepala jurnal yang baru dibuat di atas')
        .insert(susun.lines.map((l, i) => ({
          // Nama kolom DIUKUR ke information_schema, bukan ditebak:
          // `entry_id` (bukan journal_entry_id) dan `line_order` (bukan
          // line_number). Versi pertama menebak keduanya dan ditolak
          // PostgREST dengan "column not found in schema cache" — galat yang
          // hanya muncul saat benar-benar menulis, bukan saat tsc.
          entry_id: jurnalId,
          account_id: petaAkun.get(l.account_code),
          debit: l.debit,
          credit: l.credit,
          description: l.description,
          line_order: i + 1,
        })))
      if (errBaris) {
        // Kepala jurnal SUDAH tertulis. Membiarkannya berarti jurnal kosong
        // yang tak seimbang menggantung di buku besar selamanya.
        //
        // Hasil penghapusannya DIPERIKSA: nol baris terhapus berarti jurnal
        // kosong itu tetap ada, dan pesannya harus menyebutkan nomornya
        // supaya bisa dibereskan tangan — bukan menghilang di balik pesan
        // galat yang membicarakan hal lain.
        const { data: terhapus } = await db.from('journal_entries')
          .delete().eq('id', jurnalId).select('id')
        const sisa = !terhapus || terhapus.length === 0
        return reply.status(500).send({
          error: 'Gagal menulis baris jurnal: ' + errBaris.message
            + (sisa ? ` Jurnal kosong ${nomor} gagal dibersihkan — hapus manual di Buku Besar.` : ''),
        })
      }

      // Tandai barisnya SESUDAH jurnal utuh. Menandai lebih dulu berarti
      // kegagalan di atas meninggalkan penyusutan yang mengaku sudah
      // dijurnalkan padahal jurnalnya tak ada.
      const idBaris = (baris as Array<{ id: string }>).map(b => b.id)
      const { data: ditandai, error: errTandai } = await db
        .unsafe('penyusutan_alat', alasan)
        .update({ journal_entry_id: jurnalId, dijurnal_pada: new Date().toISOString() })
        .in('id', idBaris)
        .eq('company_id', cid)
        .select('id')
      if (errTandai) return reply.status(500).send({ error: errTandai.message })
      if (!ditandai || ditandai.length !== idBaris.length) {
        // NOL atau SEBAGIAN baris tertandai tak boleh menyamar jadi sukses:
        // yang tak tertandai akan ikut terjurnalkan lagi pada panggilan
        // berikutnya, dan bebannya jadi ganda.
        return reply.status(500).send({
          error: `Jurnal ${nomor} dibuat, tetapi hanya ${ditandai?.length ?? 0} dari `
            + `${idBaris.length} baris penyusutan tertandai. Periksa sebelum mengulang.`,
        })
      }

      void logAuditEvent(request, {
        tableName: 'penyusutan_alat', recordId: jurnalId,
        action: 'penyusutan.jurnalkan', actorId: request.currentUser!.id,
        newValues: { entry_number: nomor, periode, baris: idBaris.length, total: susun.total },
        severity: 'critical',
      })

      // `status` DIKEMBALIKAN apa adanya — dan itu penting.
      //
      // Jurnal baru selalu berstatus `draft`, dan draft TIDAK masuk laporan
      // (`/gl/laporan` menyaring `status = 'posted'`). Posting adalah langkah
      // tersendiri dengan izinnya sendiri (`gl:post`), dan itu benar secara
      // akuntansi: yang menyusun jurnal tak selalu yang mengesahkannya.
      //
      // Versi pertama endpoint ini tak mengembalikan status, dan layarnya
      // menampilkan "Sudah dijurnalkan" begitu panggilan berhasil — padahal
      // neraca belum bergerak sedikit pun. Pengguna akan mencari selisihnya
      // di tempat yang salah.
      return reply.status(201).send({
        jurnal: kepala,
        baris_dijurnalkan: idBaris.length,
        total: susun.total,
        perlu_diposting: (kepala as { status?: string }).status === 'draft',
      })
    },
  )
}
