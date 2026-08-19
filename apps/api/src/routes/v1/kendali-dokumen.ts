import type { FastifyInstance } from 'fastify'
import { createHash } from 'node:crypto'
import { pilihJatuhTempo, type JadwalKirim } from '../../lib/jadwal-laporan-jatuh-tempo.js'
import { kirimLaporanTerjadwal } from '../../utils/email.js'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import {
  nilaiRegisterGambar, nilaiTransmittal, nilaiTindakan, nilaiJadwalLaporan,
  type Gambar, type Transmittal, type Tindakan, type JadwalLaporan,
} from '../../lib/kendali-dokumen.js'

/**
 * KENDALI DOKUMEN (TUNDA kelompok D)
 *
 * ── Yang dijawab modul ini
 *
 * "Gambar revisi berapa yang BERLAKU sekarang, siapa sudah menerimanya, dan
 * butir rapat mana yang belum dikerjakan?"
 *
 * ── Kenapa status DIHITUNG, bukan cuma dibaca dari kolom
 *
 * Kolom `status` gambar hanya benar kalau ada yang ingat memperbaruinya saat
 * revisi baru terbit. Yang tidak lupa: membandingkan revisi baris ini dengan
 * revisi TERTINGGI nomor yang sama. Gambar rev-2 berstatus 'berlaku' yang
 * sudah punya rev-3 ditandai usang, apa pun kata kolomnya — dan itulah
 * keadaan yang membuat pekerjaan dibongkar.
 *
 * ── `db.unsafe` dengan alasan tertulis
 *
 * Kedelapan tabel berkategori B (`company_id` NOT NULL), disaring
 * `eq('company_id', …)` di baris berikutnya.
 */
export default async function kendaliDokumenRoutes(app: FastifyInstance) {
  const hariIni = () => new Date().toISOString().slice(0, 10)

  // ── GET /api/v1/kendali-dokumen ─────────────────────────────────────────
  //
  // Satu panggilan mengembalikan seluruh yang dibutuhkan layar. Dipisah jadi
  // enam endpoint akan membuat layar menampilkan angka dari enam titik waktu
  // berbeda — dan "gambar usang" adalah perbandingan LINTAS baris, jadi
  // datanya harus tiba bersamaan.
  app.get('/api/v1/kendali-dokumen', {
    preHandler: [authenticate, requirePermission('projects:view')],
  }, async (request, reply) => {
    const db = request.db!
    const cid = request.companyId!
    const t = hariIni()
    const { project_id } = request.query as { project_id?: string }
    const alasan = 'kategori B; disaring company_id di baris berikutnya'

    const q = <T>(x: T) => x

    const [gambar, transmittal, notulen, tindakan, distribusi, jadwal, ttd] =
      await Promise.all([
        q(db.unsafe('register_gambar', alasan)
          .select('id, project_id, nomor, judul, disiplin, revisi, tahap, status, digantikan_oleh, tanggal_terbit, file_url')
          .eq('company_id', cid).order('nomor')),
        q(db.unsafe('transmittal', alasan)
          .select('id, project_id, nomor, perihal, tujuan_nama, tujuan_organisasi, maksud, status, dikirim_pada, diterima_pada, diterima_oleh')
          .eq('company_id', cid).order('nomor', { ascending: false })),
        q(db.unsafe('notulen_rapat', alasan)
          .select('id, project_id, nomor, judul, tanggal, jenis, status, tempat, disahkan_pada')
          .eq('company_id', cid).order('tanggal', { ascending: false })),
        // Diurutkan `tenggat` ASC dengan NULL di BELAKANG.
        //
        // Default Postgres menaruh NULL terakhir pada ASC, tapi dinyatakan
        // eksplisit karena urutan di sini menentukan apa yang dibaca lebih
        // dulu — dan layar yang menaruh butir SELESAI di atas butir yang
        // sudah lewat tenggat adalah kebalikan dari yang dibutuhkan.
        // Pengurutan akhir (lewat tenggat dulu) dilakukan sesudah dinilai.
        q(db.unsafe('notulen_tindakan', alasan)
          .select('id, notulen_id, urutan, uraian, pj_nama, pj_user_id, tenggat, status, selesai_pada')
          .eq('company_id', cid).order('tenggat', { ascending: true, nullsFirst: false })),
        q(db.unsafe('matriks_distribusi', alasan)
          .select('id, project_id, jenis_dokumen, penerima_nama, penerima_email, organisasi, peran, aktif')
          .eq('company_id', cid).order('jenis_dokumen')),
        q(db.unsafe('jadwal_distribusi_laporan', alasan)
          .select('id, project_id, nama, jenis_laporan, irama, hari_ke, jam, aktif, terakhir_dikirim, gagal_berturut, galat_terakhir')
          .eq('company_id', cid).order('nama')),
        q(db.unsafe('tanda_tangan_elektronik', alasan)
          .select('id, jenis_objek, objek_id, penanda_tangan, peran_penanda, ditandatangani_pada')
          .eq('company_id', cid)),
      ])

    // Diperiksa satu per satu dengan menyebut namanya, BUKAN lewat loop atas
    // array: query kedelapan yang ditambahkan nanti dan lupa dimasukkan ke
    // array itu akan gagal tanpa suara, lalu `?? []` mengubahnya jadi "nol
    // baris" yang sah — cacat yang membuat kurva-s kehilangan Rp 631,7 juta.
    if (gambar.error) return reply.status(500).send({ error: gambar.error.message })
    if (transmittal.error) return reply.status(500).send({ error: transmittal.error.message })
    if (notulen.error) return reply.status(500).send({ error: notulen.error.message })
    if (tindakan.error) return reply.status(500).send({ error: tindakan.error.message })
    if (distribusi.error) return reply.status(500).send({ error: distribusi.error.message })
    if (jadwal.error) return reply.status(500).send({ error: jadwal.error.message })
    if (ttd.error) return reply.status(500).send({ error: ttd.error.message })

    type Baris = Record<string, unknown>
    const saring = <T extends Baris>(rows: T[] | null): T[] =>
      (rows ?? []).filter((r) => !project_id || r.project_id == null || r.project_id === project_id)

    const ringkasGambar = nilaiRegisterGambar(
      saring(gambar.data as Baris[]) as unknown as Gambar[])

    // Gambar USANG naik ke atas — itu satu-satunya baris di tabel ini yang
    // menuntut tindakan hari ini. Sisanya tetap urut nomor lalu revisi,
    // supaya register tetap bisa dibaca sebagai register.
    ringkasGambar.gambar.sort((a, b) => {
      if (a.usang !== b.usang) return a.usang ? -1 : 1
      if (a.nomor !== b.nomor) return a.nomor < b.nomor ? -1 : 1
      return Number(a.revisi) - Number(b.revisi)
    })
    const ringkasTransmittal = nilaiTransmittal(
      saring(transmittal.data as Baris[]) as unknown as Transmittal[], t)
    const ringkasTindakan = nilaiTindakan(
      (tindakan.data ?? []) as unknown as Tindakan[], t)

    // Yang menuntut tindakan naik ke atas: lewat tenggat → terbuka →
    // selesai/dibatalkan. Diurutkan DI SINI, bukan di layar, supaya
    // konsumen lain (ekspor, notifikasi) mendapat urutan yang sama.
    //
    // Ketahuan saat MEMOTRET halamannya: butir selesai muncul di baris
    // teratas sementara yang lewat tenggat tenggelam di bawah — kebalikan
    // dari yang dibutuhkan pembacanya.
    const bobotTindakan = (x: { lewatTenggat: boolean; status: string }) =>
      x.lewatTenggat ? 0 : x.status === 'terbuka' ? 1 : 2
    ringkasTindakan.tindakan.sort((a, b) => {
      const d = bobotTindakan(a) - bobotTindakan(b)
      if (d !== 0) return d
      // Dalam kelompok yang sama: tenggat terdekat lebih dulu, tanpa
      // tenggat paling belakang.
      if (!a.tenggat && !b.tenggat) return 0
      if (!a.tenggat) return 1
      if (!b.tenggat) return -1
      return a.tenggat < b.tenggat ? -1 : 1
    })
    const ringkasJadwal = nilaiJadwalLaporan(
      saring(jadwal.data as Baris[]) as unknown as JadwalLaporan[], t)

    return reply.send({
      tanggal: t,
      gambar: ringkasGambar,
      transmittal: ringkasTransmittal,
      notulen: saring(notulen.data as Baris[]),
      tindakan: ringkasTindakan,
      distribusi: saring(distribusi.data as Baris[]),
      jadwalLaporan: ringkasJadwal,
      tandaTangan: ttd.data ?? [],
    })
  })

  // ── POST /api/v1/kendali-dokumen/gambar ─────────────────────────────────
  app.post('/api/v1/kendali-dokumen/gambar', {
    preHandler: [authenticate, requirePermission('documents:manage')],
  }, async (request, reply) => {
    const b = request.body as {
      project_id?: string
      nomor?: string
      judul?: string
      disiplin?: string
      revisi?: number
      tahap?: string
      file_url?: string
      tanggal_terbit?: string
      catatan?: string
    }

    if (!b.project_id || !b.nomor || !b.judul) {
      return reply.status(400).send({ error: 'project_id, nomor, dan judul wajib diisi' })
    }

    const db = request.db!
    const cid = request.companyId!

    const { data: proyek } = await db
      .unsafe('projects', 'memastikan proyek milik tenant sebelum gambarnya didaftarkan')
      .select('id').eq('id', b.project_id).eq('company_id', cid).maybeSingle()
    if (!proyek) return reply.status(404).send({ error: 'Proyek tidak ditemukan' })

    const revisi = b.revisi ?? 0

    const { data, error } = await db
      .unsafe('register_gambar', 'menyimpan gambar; proyek sudah diverifikasi milik tenant')
      .insert({
        company_id: cid,
        project_id: b.project_id,
        nomor: b.nomor,
        judul: b.judul,
        disiplin: b.disiplin ?? 'arsitektur',
        revisi,
        tahap: b.tahap ?? 'IFR',
        file_url: b.file_url ?? null,
        tanggal_terbit: b.tanggal_terbit ?? null,
        catatan: b.catatan ?? null,
        created_by: request.currentUser!.id,
      })
      .select('id, nomor, revisi, status')
      .single()

    if (error) {
      if (error.code === '23505') {
        return reply.status(409).send({
          error: `Gambar ${b.nomor} revisi ${revisi} sudah terdaftar di proyek ini`,
        })
      }
      if (error.code === '23514') {
        return reply.status(422).send({
          error: 'Revisi tak boleh negatif, dan disiplin/tahap harus salah satu yang dikenal',
        })
      }
      return reply.status(500).send({ error: error.message })
    }

    // Revisi baru MENGGANTIKAN revisi lama pada nomor yang sama.
    //
    // Kalau langkah ini dilewatkan, register menyimpan dua baris 'berlaku'
    // untuk satu gambar — dan yang membacanya harus menebak mana yang
    // dipakai. Kegagalannya DICATAT, bukan ditelan: gambar yang baru masuk
    // tetap sah, tapi keadaan setengah-jadi ini harus bisa dilacak.
    const { error: gagalGanti } = await db
      .unsafe('register_gambar', 'menandai revisi lama digantikan; nomor & proyek sama')
      .update({ status: 'digantikan', digantikan_oleh: data!.id, updated_at: new Date().toISOString() })
      .eq('company_id', cid).eq('project_id', b.project_id)
      .eq('nomor', b.nomor).eq('status', 'berlaku').lt('revisi', revisi)

    if (gagalGanti) {
      request.log.error({ err: gagalGanti, nomor: b.nomor, revisi },
        'revisi baru tersimpan tapi revisi lama gagal ditandai digantikan')
    }

    return reply.status(201).send({ gambar: data })
  })

  // ── POST /api/v1/kendali-dokumen/transmittal ────────────────────────────
  app.post('/api/v1/kendali-dokumen/transmittal', {
    preHandler: [authenticate, requirePermission('documents:manage')],
  }, async (request, reply) => {
    const b = request.body as {
      project_id?: string
      nomor?: string
      perihal?: string
      tujuan_nama?: string
      tujuan_organisasi?: string
      maksud?: string
      catatan?: string
      items?: Array<{ gambar_id?: string; document_id?: string; uraian?: string; jumlah_lembar?: number }>
    }

    if (!b.project_id || !b.nomor || !b.perihal || !b.tujuan_nama) {
      return reply.status(400).send({
        error: 'project_id, nomor, perihal, dan tujuan_nama wajib diisi',
      })
    }
    if (!b.items?.length) {
      // Transmittal tanpa isi adalah bukti kirim atas ketiadaan.
      return reply.status(400).send({ error: 'Transmittal harus memuat minimal satu item' })
    }

    const db = request.db!
    const cid = request.companyId!

    const { data: proyek } = await db
      .unsafe('projects', 'memastikan proyek milik tenant sebelum transmittal dibuat')
      .select('id').eq('id', b.project_id).eq('company_id', cid).maybeSingle()
    if (!proyek) return reply.status(404).send({ error: 'Proyek tidak ditemukan' })

    const { data, error } = await db
      .unsafe('transmittal', 'menyimpan transmittal; proyek sudah diverifikasi milik tenant')
      .insert({
        company_id: cid,
        project_id: b.project_id,
        nomor: b.nomor,
        perihal: b.perihal,
        tujuan_nama: b.tujuan_nama,
        tujuan_organisasi: b.tujuan_organisasi ?? null,
        maksud: b.maksud ?? 'untuk_informasi',
        catatan: b.catatan ?? null,
        created_by: request.currentUser!.id,
      })
      .select('id, nomor, status')
      .single()

    if (error) {
      if (error.code === '23505') {
        return reply.status(409).send({ error: `Transmittal ${b.nomor} sudah ada` })
      }
      if (error.code === '23514') {
        return reply.status(422).send({ error: 'Maksud transmittal tak dikenal' })
      }
      return reply.status(500).send({ error: error.message })
    }

    const { error: galatItem } = await db
      .unsafe('transmittal_item', 'menyimpan isi transmittal yang baru dibuat')
      .insert(b.items.map((i) => ({
        company_id: cid,
        transmittal_id: data!.id,
        gambar_id: i.gambar_id ?? null,
        document_id: i.document_id ?? null,
        uraian: i.uraian ?? null,
        jumlah_lembar: i.jumlah_lembar ?? null,
      })))

    if (galatItem) {
      // Transmittal tanpa isi tak berguna — dan lebih buruk daripada tak ada,
      // karena ia terlihat seperti bukti kirim. Dibatalkan seluruhnya.
      //
      // Hasil pembatalannya DIPERIKSA: kalau `delete` ini pun gagal, yang
      // tertinggal adalah transmittal kosong yang tak seorang pun tahu harus
      // dihapus. Diamnya di sini persis kelas cacat yang dijaga
      // `audit-tulis-tanpa-periksa.mjs`, dan penjaga itu memang merahkannya.
      const { error: galatBatal } = await db
        .unsafe('transmittal', 'membatalkan transmittal yang isinya gagal disimpan')
        .delete().eq('id', data!.id).eq('company_id', cid)

      if (galatBatal) {
        request.log.error({ err: galatBatal, transmittal: data!.id, nomor: b.nomor },
          'transmittal kosong TERTINGGAL — isinya ditolak dan pembatalannya gagal')
        return reply.status(500).send({
          error: `Isi transmittal ditolak, dan transmittal ${b.nomor} gagal dibatalkan. Hapus manual sebelum membuat ulang — transmittal tanpa isi terlihat seperti bukti kirim.`,
        })
      }

      return reply.status(422).send({
        error: 'Isi transmittal ditolak — setiap item harus merujuk gambar/dokumen atau punya uraian',
      })
    }

    return reply.status(201).send({ transmittal: data })
  })

  // ── PATCH /api/v1/kendali-dokumen/transmittal/:id/kirim ─────────────────
  app.patch('/api/v1/kendali-dokumen/transmittal/:id/kirim', {
    preHandler: [authenticate, requirePermission('documents:manage')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const db = request.db!

    const { data, error } = await db
      .unsafe('transmittal', 'kategori B; disaring company_id di baris berikutnya')
      .update({ status: 'dikirim', dikirim_pada: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', id).eq('company_id', request.companyId!)
      .select('id, nomor, status, dikirim_pada')
      .maybeSingle()

    if (error) return reply.status(500).send({ error: error.message })
    if (!data) return reply.status(404).send({ error: 'Transmittal tidak ditemukan' })
    return reply.send({ transmittal: data })
  })

  // ── PATCH /api/v1/kendali-dokumen/transmittal/:id/terima ────────────────
  app.patch('/api/v1/kendali-dokumen/transmittal/:id/terima', {
    preHandler: [authenticate, requirePermission('documents:manage')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const b = request.body as { diterima_oleh?: string }
    const db = request.db!

    const { data, error } = await db
      .unsafe('transmittal', 'kategori B; disaring company_id di baris berikutnya')
      .update({
        status: 'diterima',
        diterima_pada: new Date().toISOString(),
        diterima_oleh: b.diterima_oleh ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id).eq('company_id', request.companyId!)
      .select('id, nomor, status, diterima_pada')
      .maybeSingle()

    if (error) {
      if (error.code === '23514') {
        return reply.status(422).send({
          error: 'Transmittal ini belum pernah dikirim — tak bisa ditandai diterima',
        })
      }
      return reply.status(500).send({ error: error.message })
    }
    if (!data) return reply.status(404).send({ error: 'Transmittal tidak ditemukan' })
    return reply.send({ transmittal: data })
  })

  // ── POST /api/v1/kendali-dokumen/notulen ────────────────────────────────
  app.post('/api/v1/kendali-dokumen/notulen', {
    preHandler: [authenticate, requirePermission('documents:manage')],
  }, async (request, reply) => {
    const b = request.body as {
      project_id?: string
      nomor?: string
      judul?: string
      tanggal?: string
      jenis?: string
      tempat?: string
      hadir?: string
      pembahasan?: string
      tindakan?: Array<{ uraian?: string; pj_nama?: string; pj_user_id?: string; tenggat?: string }>
    }

    if (!b.project_id || !b.nomor || !b.judul) {
      return reply.status(400).send({ error: 'project_id, nomor, dan judul wajib diisi' })
    }

    const db = request.db!
    const cid = request.companyId!

    const { data: proyek } = await db
      .unsafe('projects', 'memastikan proyek milik tenant sebelum notulen dibuat')
      .select('id').eq('id', b.project_id).eq('company_id', cid).maybeSingle()
    if (!proyek) return reply.status(404).send({ error: 'Proyek tidak ditemukan' })

    const { data, error } = await db
      .unsafe('notulen_rapat', 'menyimpan notulen; proyek sudah diverifikasi milik tenant')
      .insert({
        company_id: cid,
        project_id: b.project_id,
        nomor: b.nomor,
        judul: b.judul,
        tanggal: b.tanggal ?? hariIni(),
        jenis: b.jenis ?? 'mingguan',
        tempat: b.tempat ?? null,
        hadir: b.hadir ?? null,
        pembahasan: b.pembahasan ?? null,
        created_by: request.currentUser!.id,
      })
      .select('id, nomor, tanggal, status')
      .single()

    if (error) {
      if (error.code === '23505') {
        return reply.status(409).send({ error: `Notulen ${b.nomor} sudah ada` })
      }
      if (error.code === '23514') {
        return reply.status(422).send({ error: 'Jenis rapat tak dikenal' })
      }
      return reply.status(500).send({ error: error.message })
    }

    if (b.tindakan?.length) {
      const { error: galatTindakan } = await db
        .unsafe('notulen_tindakan', 'menyimpan butir tindakan notulen yang baru dibuat')
        .insert(b.tindakan.map((t, i) => ({
          company_id: cid,
          notulen_id: data!.id,
          urutan: i + 1,
          uraian: t.uraian ?? '',
          pj_nama: t.pj_nama ?? null,
          pj_user_id: t.pj_user_id ?? null,
          tenggat: t.tenggat ?? null,
        })))

      if (galatTindakan) {
        // Notulen tetap tersimpan — ringkasan rapatnya sendiri berguna.
        // Tapi butir yang gagal masuk HARUS terdengar: keputusan tanpa
        // penanggung jawab adalah keputusan yang tak pernah dikerjakan.
        request.log.error({ err: galatTindakan, notulen: data!.id },
          'notulen tersimpan tapi butir tindakannya ditolak')
        return reply.status(422).send({
          error: 'Notulen tersimpan, tetapi butir tindakan ditolak — setiap butir wajib punya penanggung jawab dan uraian',
          notulen: data,
        })
      }
    }

    return reply.status(201).send({ notulen: data })
  })

  // ── POST /api/v1/kendali-dokumen/tanda-tangan ───────────────────────────
  app.post('/api/v1/kendali-dokumen/tanda-tangan', {
    preHandler: [authenticate, requirePermission('documents:manage')],
  }, async (request, reply) => {
    const b = request.body as {
      jenis_objek?: string
      objek_id?: string
      isi?: string
      peran_penanda?: string
      alasan?: string
    }

    if (!b.jenis_objek || !b.objek_id || !b.isi) {
      return reply.status(400).send({ error: 'jenis_objek, objek_id, dan isi wajib diisi' })
    }

    // Sidik dihitung DI SERVER dari isi yang dikirim, bukan diterima jadi.
    //
    // Kalau klien yang mengirim hash-nya, ia bisa mengirim hash dokumen lain
    // — dan tanda tangannya jadi bukti atas sesuatu yang tak pernah dibaca
    // penandatangannya.
    const sidik = createHash('sha256').update(b.isi, 'utf8').digest('hex')

    const db = request.db!
    const { data, error } = await db
      .unsafe('tanda_tangan_elektronik', 'kategori B; company_id diisi dari sesi')
      .insert({
        company_id: request.companyId!,
        jenis_objek: b.jenis_objek,
        objek_id: b.objek_id,
        penanda_tangan: request.currentUser!.id,
        peran_penanda: b.peran_penanda ?? null,
        sidik_isi: sidik,
        alasan: b.alasan ?? null,
        ip_penanda: request.ip ?? null,
      })
      .select('id, jenis_objek, objek_id, sidik_isi, ditandatangani_pada')
      .single()

    if (error) {
      if (error.code === '23505') {
        return reply.status(409).send({
          error: 'Anda sudah menandatangani dokumen ini — tanda tangan ganda membuat "siapa yang mengesahkan" jadi ambigu',
        })
      }
      if (error.code === '23514') {
        return reply.status(422).send({ error: 'Jenis objek tak dikenal' })
      }
      return reply.status(500).send({ error: error.message })
    }

    return reply.status(201).send({ tandaTangan: data })
  })

  // ── POST /api/v1/kendali-dokumen/tanda-tangan/verifikasi ───────────────────
  //
  // Menghitung ulang sidik isi yang diberikan, lalu MEMBANDINGKANNYA dengan
  // yang tersimpan saat dokumen ditandatangani.
  //
  // ── Kenapa ini bukan tambahan, melainkan yang membuat sidiknya berarti
  //
  // `tanda_tangan_elektronik` menyimpan SHA-256 isi dokumen justru supaya
  // bisa dibuktikan dokumennya tak berubah sesudah ditandatangani. Diukur
  // 2026-08-16: tak ada satu pun jalan membandingkannya — sidiknya disimpan,
  // dibaca dashboard sebagai keberadaan belaka, dan tak pernah diadu dengan
  // apa pun.
  //
  // Sidik yang tak pernah bisa dibandingkan tidak membuktikan apa-apa. Ia
  // justru lebih buruk daripada tidak ada: orang melihat "ditandatangani
  // elektronik" dan menyimpulkan keasliannya sudah terjamin, padahal tak ada
  // mekanisme yang pernah memeriksanya.
  //
  // ── Kenapa isi dikirim, bukan diambil server dari objeknya
  //
  // Menandatangani `notulen`, `transmittal`, `berita_acara`, dan `kontrak`
  // berarti empat cara berbeda menyusun teks yang ditandatangani. Server yang
  // menyusun ulang sendiri harus MENIRU PERSIS cara pemanggil menyusunnya
  // dulu — dan begitu salah satunya berubah, seluruh tanda tangan lama
  // mendadak "tidak sah" tanpa satu pun dokumen benar-benar diubah.
  //
  // Yang menandatangani menyusun isinya; yang memverifikasi menyusunnya
  // dengan cara yang sama. Ketidakcocokan berarti salah satu dari dua hal —
  // dokumennya berubah, ATAU cara menyusunnya berubah — dan keduanya memang
  // harus diperiksa manusia, bukan disimpulkan diam-diam oleh server.
  // Izin `documents:manage`, bukan `documents:view` — diukur 2026-08-16,
  // `documents:view` TIDAK ADA di tabel `permissions`. Kunci hantu menolak
  // SEMUA orang tanpa gejala apa pun (dijaga `audit-izin-benar-ada.mjs`,
  // ambang NOL), jadi verifikasi akan selalu 403 dan terbaca sebagai
  // "fiturnya rusak".
  app.post('/api/v1/kendali-dokumen/tanda-tangan/verifikasi', {
    preHandler: [authenticate, requirePermission('documents:manage')],
  }, async (request, reply) => {
    const b = request.body as {
      jenis_objek?: string
      objek_id?: string
      isi?: string
    }

    if (!b.jenis_objek || !b.objek_id || typeof b.isi !== 'string') {
      return reply.status(400).send({
        error: 'jenis_objek, objek_id, dan isi wajib diisi',
      })
    }

    const sidikSekarang = createHash('sha256').update(b.isi, 'utf8').digest('hex')

    const db = request.db!
    const { data, error } = await db
      .unsafe('tanda_tangan_elektronik', 'kategori B; disaring ke company sesi di bawah')
      .select('id, penanda_tangan, peran_penanda, sidik_isi, ditandatangani_pada, alasan')
      .eq('company_id', request.companyId!)
      .eq('jenis_objek', b.jenis_objek)
      .eq('objek_id', b.objek_id)
      .order('ditandatangani_pada', { ascending: true })

    if (error) {
      request.log.error({ err: error }, 'gagal membaca tanda tangan untuk verifikasi')
      return reply.status(500).send({ error: 'Gagal membaca tanda tangan' })
    }

    const ttd = (data ?? []) as Array<{
      id: string; penanda_tangan: string; peran_penanda: string | null
      sidik_isi: string; ditandatangani_pada: string; alasan: string | null
    }>

    if (ttd.length === 0) {
      // BUKAN "tidak sah". Dokumen yang belum pernah ditandatangani berbeda
      // dari dokumen yang tanda tangannya tak cocok, dan menyamakan keduanya
      // membuat yang kedua — satu-satunya yang benar-benar gawat — tenggelam.
      return reply.send({
        keadaan: 'belum_ditandatangani',
        sidik_sekarang: sidikSekarang,
        tanda_tangan: [],
        pesan: 'Dokumen ini belum pernah ditandatangani secara elektronik.',
      })
    }

    const rinci = ttd.map((t) => ({
      id: t.id,
      penanda_tangan: t.penanda_tangan,
      peran_penanda: t.peran_penanda,
      ditandatangani_pada: t.ditandatangani_pada,
      alasan: t.alasan,
      cocok: t.sidik_isi === sidikSekarang,
    }))

    const semuaCocok = rinci.every((r) => r.cocok)

    return reply.send({
      keadaan: semuaCocok ? 'utuh' : 'berubah',
      sidik_sekarang: sidikSekarang,
      tanda_tangan: rinci,
      pesan: semuaCocok
        ? 'Isi dokumen sama persis dengan yang ditandatangani.'
        : 'Isi dokumen BERBEDA dari yang ditandatangani. Entah dokumennya '
          + 'diubah sesudah ditandatangani, atau cara menyusun isinya berubah — '
          + 'keduanya harus diperiksa sebelum dokumen ini dipakai sebagai bukti.',
    })
  })

  // ══════════════════════════════════════════════════════════════════════════
  // GET /api/v1/kendali-dokumen/kirim-laporan — dijalankan PENJADWAL
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Peta Modul `bi-terjadwal` bertanda `sebagian` dengan satu kalimat:
  // "Pengiriman surel otomatisnya sendiri belum dijalankan."
  //
  // Akibatnya lebih dari sekadar laporan tak terkirim. `terakhir_dikirim`
  // selamanya NULL, dan deteksi MACET — yang membandingkan umur kirim dengan
  // iramanya — melaporkan SELURUH jadwal sebagai macet begitu lewat dua kali
  // iramanya. Peringatan yang benar untuk sebab yang salah: bukan penjadwalnya
  // yang mati, melainkan pengirimnya yang tak pernah ditulis.
  //
  // ── Kegagalan DICATAT, bukan ditelan
  //
  // Tiap jadwal berdiri sendiri: satu yang gagal tak menghentikan sisanya, dan
  // kegagalannya masuk `galat_terakhir` + menaikkan `gagal_berturut`. Angka
  // itulah yang dibaca `nilaiJadwalLaporan` untuk menyatakan MACET — jadi
  // menelan galat di sini membuat deteksi macetnya buta.
  //
  // ── Zona waktu dihitung eksplisit, bukan dibaca dari mesin
  //
  // `jam` bertipe `time without time zone`, diisi orang di Indonesia.
  // Membandingkannya dengan jam mesin (CI berzona UTC) menggeser seluruh
  // jadwal tujuh jam — laporan "jam 7 pagi" terkirim tengah malam.
  app.get('/api/v1/kendali-dokumen/kirim-laporan', {
    preHandler: [authenticate, requirePermission('notifications:milestone:check')],
  }, async (request, reply) => {
    const db = request.db!
    const cid = request.companyId!

    // WIB = UTC+7, dihitung dari epoch. `toLocaleString` bergantung pada data
    // zona sistem operasi, dan wadah CI kerap tak memilikinya.
    const kiniWib = new Date(Date.now() + 7 * 60 * 60 * 1000)
    const kini = {
      tanggal: kiniWib.toISOString().slice(0, 10),
      jam: kiniWib.toISOString().slice(11, 16),
    }

    const { data: jadwalRow, error: eJadwal } = await db
      .unsafe('jadwal_distribusi_laporan', 'kategori B; disaring eq(company_id) di baris berikutnya')
      .select('id, nama, jenis_laporan, irama, hari_ke, jam, aktif, terakhir_dikirim')
      .eq('company_id', cid)
    if (eJadwal) return reply.status(500).send({ error: eJadwal.message })

    const { kirim, lewat } = pilihJatuhTempo(
      (jadwalRow ?? []) as unknown as JadwalKirim[], kini)

    // Yang DILEWATI ikut dilaporkan beserta sebabnya. "Kenapa laporan saya tak
    // datang" adalah pertanyaan yang pasti muncul, dan jawabannya harus ada di
    // sini — bukan disimpulkan dari ketiadaan baris.
    const dilewati = lewat.map((v) => ({
      id: v.jadwal.id, nama: v.jadwal.nama, alasan: v.alasan,
    }))

    if (kirim.length === 0) {
      return reply.send({ kini, dikirim: 0, gagal: 0, hasil: [], dilewati })
    }

    // Penerima dibaca SEKALI untuk seluruh jadwal — daftar yang sama diambil
    // berulang hanya menambah beban tanpa menambah jawaban.
    const { data: penerimaRow, error: ePenerima } = await db
      .unsafe('matriks_distribusi', 'kategori B; disaring eq(company_id) di baris berikutnya')
      .select('jenis_dokumen, penerima_email')
      .eq('company_id', cid)
      .eq('aktif', true)
    if (ePenerima) return reply.status(500).send({ error: ePenerima.message })

    const perJenis = new Map<string, string[]>()
    for (const p of (penerimaRow ?? []) as Array<Record<string, unknown>>) {
      const surel = String(p.penerima_email ?? '').trim()
      // Penerima tanpa surel BUKAN penerima. Menyertakannya membuat `to: ['']`
      // yang ditolak penyedia — dan penolakannya akan dibaca sebagai
      // "jadwalnya rusak", bukan "kontaknya belum lengkap".
      if (!surel) continue
      const jenis = String(p.jenis_dokumen ?? '')
      perJenis.set(jenis, [...(perJenis.get(jenis) ?? []), surel])
    }

    const { data: perusahaan } = await db
      .unsafe('companies', 'tabel tenant itu sendiri; di-scope eq(id, companyId)')
      .select('name')
      .eq('id', cid)
      .maybeSingle()
    const namaPerusahaan = (perusahaan as { name?: string } | null)?.name ?? 'Puraloka'

    const hasil: Array<{ id: string; nama: string; status: string; sebab?: string }> = []

    for (const j of kirim) {
      try {
        await kirimLaporanTerjadwal({
          to: perJenis.get(j.jenis_laporan) ?? [],
          namaJadwal: j.nama,
          jenisLaporan: j.jenis_laporan,
          namaPerusahaan,
          periode: kini.tanggal,
          baris: ringkasLaporan(j.jenis_laporan),
          // Tenant DINYATAKAN — kunci Resend & alamat pengirim miliknya yang
          // dipakai. Laporan berkala pergi ke pihak LUAR (owner, konsultan
          // pengawas), jadi surel yang berangkat dari akun operator alih-alih
          // akun tenant adalah kebocoran identitas: penerimanya melihat
          // domain operator, bukan domain perusahaan yang mengirim.
          companyId: cid,
        })

        // Hasil UPDATE DIPERIKSA. Nol baris berarti jadwalnya berubah dari
        // tempat lain — dan surelnya sudah terlanjur terkirim, jadi keadaan itu
        // harus terbaca, bukan lewat sebagai sukses.
        const { data: tersimpan, error: eUp } = await db
          .unsafe('jadwal_distribusi_laporan', 'id terbukti milik company ini di query di atas')
          .update({
            terakhir_dikirim: new Date().toISOString(),
            gagal_berturut: 0,
            galat_terakhir: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', j.id)
          .eq('company_id', cid)
          .select('id')
          .maybeSingle()

        if (eUp || !tersimpan) {
          hasil.push({
            id: j.id, nama: j.nama, status: 'terkirim-tak-tercatat',
            sebab: 'Surel terkirim tetapi jadwalnya gagal ditandai — ia akan '
              + 'terkirim lagi pada denyut berikutnya.',
          })
          continue
        }
        hasil.push({ id: j.id, nama: j.nama, status: 'terkirim' })
      } catch (e) {
        const sebab = e instanceof Error ? e.message : String(e)

        // `gagal_berturut` dinaikkan lewat baca-lalu-tulis. Bukan yang paling
        // elegan, tetapi angka inilah yang dibaca deteksi MACET — membiarkannya
        // tak naik membuat jadwal yang mati terbaca sehat.
        const { data: lama } = await db
          .unsafe('jadwal_distribusi_laporan', 'id terbukti milik company ini di query di atas')
          .select('gagal_berturut')
          .eq('id', j.id)
          .eq('company_id', cid)
          .maybeSingle()
        const gagalKe = Number((lama as { gagal_berturut?: number } | null)?.gagal_berturut ?? 0) + 1

        const { error: eCatat } = await db
          .unsafe('jadwal_distribusi_laporan', 'id terbukti milik company ini di query di atas')
          .update({
            gagal_berturut: gagalKe,
            galat_terakhir: sebab.slice(0, 500),
            updated_at: new Date().toISOString(),
          })
          .eq('id', j.id)
          .eq('company_id', cid)
        if (eCatat) {
          request.log.error({ err: eCatat, jadwal: j.id }, 'gagal mencatat kegagalan kirim')
        }

        request.log.error({ err: e, jadwal: j.id }, 'laporan terjadwal gagal dikirim')
        hasil.push({ id: j.id, nama: j.nama, status: 'gagal', sebab })
      }
    }

    return reply.send({
      kini,
      dikirim: hasil.filter((h) => h.status === 'terkirim').length,
      gagal: hasil.filter((h) => h.status !== 'terkirim').length,
      hasil,
      dilewati,
    })
  })
}
/**
 * Baris ringkasan untuk sebuah jenis laporan.
 *
 * SENGAJA sedikit. Laporan yang mencoba memuat segalanya berhenti dibaca, dan
 * yang berhenti dibaca sama saja dengan yang tak terkirim.
 *
 * Jenis yang tak dikenali TIDAK menggagalkan pengiriman — ia dikirim dengan
 * satu baris yang menyatakan ringkasannya belum disusun. Menggagalkan kiriman
 * karena jenisnya baru membuat orang mengira jadwalnya rusak, lalu mematikan
 * jadwalnya.
 */
function ringkasLaporan(jenis: string): Array<{ label: string; nilai: string; catatan?: string }> {
  return [
    {
      label: 'Jenis laporan',
      nilai: jenis,
      catatan: 'Angka rinciannya dibaca langsung di dashboard — surel ini '
        + 'penanda periode, bukan penggantinya.',
    },
    {
      label: 'Periode',
      nilai: 'sesuai jadwal distribusi',
      catatan: 'Irama dan harinya diatur di Kendali Dokumen → Jadwal Laporan.',
    },
  ]
}
