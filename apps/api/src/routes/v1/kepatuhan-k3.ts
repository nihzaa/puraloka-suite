import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import {
  nilaiKepatuhan, nilaiEvaluasiSubkon, nilaiIzinKerja, nilaiKesiapanPihak,
  type DokumenKepatuhan, type EvaluasiSubkon, type IzinKerja,
} from '../../lib/kepatuhan-k3.js'

/**
 * KEPATUHAN & K3 (TUNDA kelompok E)
 *
 * ── Yang dijawab modul ini
 *
 * "Pihak ini boleh bekerja hari ini, atau tidak?"
 *
 * Tiga sudut yang harus dijawab BERSAMAAN: kinerjanya (evaluasi), dokumennya
 * (izin/asuransi/pajak), dan izin kerjanya (K3). Menjawab satu per satu di
 * layar terpisah membuat jawaban yang bertentangan hidup berdampingan —
 * subkon berkinerja bagus dengan asuransi mati tetap terlihat hijau.
 *
 * ── Kenapa status DIHITUNG, bukan dibaca dari kolom
 *
 * Kolom `terverifikasi` hanya menyatakan seseorang PERNAH memeriksa dokumen
 * itu — bukan bahwa dokumennya masih hidup hari ini. Asuransi yang diperiksa
 * Januari dan mati Maret tetap bercentang hijau, dan itu ketahuan saat ada
 * pekerja terluka. Hal yang sama untuk izin kerja: status 'disetujui' tak
 * berarti jendela waktunya masih berjalan.
 */
export default async function kepatuhanK3Routes(app: FastifyInstance) {
  const hariIni = () => new Date().toISOString().slice(0, 10)

  // ── GET /api/v1/kepatuhan ───────────────────────────────────────────────
  app.get('/api/v1/kepatuhan', {
    preHandler: [authenticate, requirePermission('kepatuhan:view')],
  }, async (request, reply) => {
    const db = request.db!
    const cid = request.companyId!
    const t = hariIni()
    const alasan = 'kategori B; disaring company_id di baris berikutnya'

    const [dokumen, evaluasi, pemasok] = await Promise.all([
      db.unsafe('dokumen_kepatuhan', alasan)
        .select('id, supplier_id, pihak_nama, jenis, nomor, penerbit, berlaku_dari, berlaku_sampai, nilai_pertanggungan, terverifikasi, file_url')
        .eq('company_id', cid).order('berlaku_sampai', { ascending: true, nullsFirst: false }),
      db.unsafe('evaluasi_subkon', alasan)
        .select('id, project_id, supplier_id, pihak_nama, periode, skor_mutu, skor_waktu, skor_k3, skor_kepatuhan, skor_kerjasama, jumlah_kecelakaan, jumlah_pelanggaran_k3, masuk_daftar_hitam, alasan_daftar_hitam, catatan')
        .eq('company_id', cid).order('periode', { ascending: false }),
      db.unsafe('suppliers', 'melengkapi nama pihak dari register pemasok')
        .select('id, name').eq('company_id', cid),
    ])

    // Diperiksa satu per satu dengan menyebut namanya, BUKAN lewat loop atas
    // array: query keempat yang ditambahkan nanti dan lupa dimasukkan akan
    // gagal tanpa suara, lalu `?? []` mengubahnya jadi "nol baris" yang sah.
    if (dokumen.error) return reply.status(500).send({ error: dokumen.error.message })
    if (evaluasi.error) return reply.status(500).send({ error: evaluasi.error.message })
    if (pemasok.error) return reply.status(500).send({ error: pemasok.error.message })

    // Nama pemasok dilengkapi DI SINI supaya `nilaiKesiapanPihak` bisa
    // mengelompokkan dengan nama yang terbaca, bukan UUID.
    const namaPemasok = new Map(
      (pemasok.data ?? []).map((s) => [(s as { id: string }).id, (s as { name: string }).name]))

    const lengkapi = <T extends { supplier_id?: string | null; pihak_nama?: string | null }>(r: T): T => ({
      ...r,
      pihak_nama: r.pihak_nama ?? (r.supplier_id ? namaPemasok.get(r.supplier_id) ?? null : null),
    })

    const ringkasDokumen = nilaiKepatuhan(
      ((dokumen.data ?? []) as unknown as DokumenKepatuhan[]).map(lengkapi), t)

    const hasilEvaluasi = ((evaluasi.data ?? []) as unknown as EvaluasiSubkon[])
      .map(lengkapi)
      .map(nilaiEvaluasiSubkon)

    const kesiapan = nilaiKesiapanPihak(ringkasDokumen.dokumen, hasilEvaluasi)

    // Pengurutan kesiapan dilakukan di `nilaiKesiapanPihak` — tak diulang
    // di sini. Versi pertama rute ini mengurutkan ulang (tak boleh bekerja
    // dulu, lalu ABJAD), dan itu MENIMPA urutan pustaka yang menaruh skor
    // tertinggi lebih awal. Ketahuan dari memotret halamannya: kartu tetap
    // berurutan CV (73,7) - PT Baja (89,1) - PT Sinar (44,4) meski pustaka
    // sudah diperbaiki. Dua tempat mengurutkan hal yang sama = yang belakangan
    // menang diam-diam.

    // Dokumen bermasalah juga naik: kedaluwarsa → segera habis → sisanya.
    const bobotDok = (s: string) =>
      s === 'kedaluwarsa' ? 0 : s === 'segera_habis' ? 1 : s === 'belum_diverifikasi' ? 2 : 3
    ringkasDokumen.dokumen.sort((a, b) => {
      const d = bobotDok(a.status) - bobotDok(b.status)
      if (d !== 0) return d
      return (a.sisaHari ?? 9e9) - (b.sisaHari ?? 9e9)
    })

    return reply.send({
      tanggal: t,
      dokumen: ringkasDokumen,
      evaluasi: hasilEvaluasi,
      kesiapan,
    })
  })

  // ── GET /api/v1/kepatuhan/izin-kerja ────────────────────────────────────
  app.get('/api/v1/kepatuhan/izin-kerja', {
    preHandler: [authenticate, requirePermission('k3:permit:view')],
  }, async (request, reply) => {
    const db = request.db!
    const { project_id } = request.query as { project_id?: string }

    let q = db
      .unsafe('izin_kerja', 'kategori B; disaring company_id di baris berikutnya')
      .select('id, project_id, nomor, jenis, uraian_pekerjaan, lokasi, berlaku_dari, berlaku_sampai, pengendalian_risiko, apd_wajib, status, diajukan_oleh, diajukan_pada, diputuskan_oleh, diputuskan_pada, alasan_tolak')
      .eq('company_id', request.companyId!)
    if (project_id) q = q.eq('project_id', project_id)

    const { data, error } = await q.order('berlaku_dari', { ascending: false })
    if (error) return reply.status(500).send({ error: error.message })

    const hasil = nilaiIzinKerja(
      (data ?? []) as unknown as IzinKerja[], new Date().toISOString())

    // Yang "disetujui tapi lewat" naik ke atas — pekerjaan yang berjalan
    // atas izin itu TIDAK BERIZIN, dan itu tak boleh tenggelam di bawah.
    const bobot = (z: { disetujuiTapiLewat: boolean; statusNyata: string }) =>
      z.disetujuiTapiLewat ? 0 : z.statusNyata === 'menunggu' ? 1 : z.statusNyata === 'aktif' ? 2 : 3
    hasil.izin.sort((a, b) => bobot(a) - bobot(b))

    return reply.send(hasil)
  })

  // ── POST /api/v1/kepatuhan/dokumen ──────────────────────────────────────
  app.post('/api/v1/kepatuhan/dokumen', {
    preHandler: [authenticate, requirePermission('kepatuhan:manage')],
  }, async (request, reply) => {
    const b = request.body as {
      supplier_id?: string | null
      pihak_nama?: string
      jenis?: string
      nomor?: string
      penerbit?: string
      berlaku_dari?: string
      berlaku_sampai?: string | null
      nilai_pertanggungan?: number | null
      file_url?: string
      catatan?: string
    }

    if (!b.jenis) return reply.status(400).send({ error: 'jenis dokumen wajib diisi' })
    if (!b.supplier_id && !b.pihak_nama?.trim()) {
      return reply.status(400).send({
        error: 'Dokumen harus punya pemilik — pilih pemasok terdaftar atau isi nama pihaknya',
      })
    }

    const db = request.db!
    const cid = request.companyId!

    // Pemasok WAJIB milik tenant ini — tanpa ini, dokumen bisa dilekatkan ke
    // pemasok tenant lain dan terbaca di layar mereka.
    if (b.supplier_id) {
      const { data: s } = await db
        .unsafe('suppliers', 'memastikan pemasok milik tenant sebelum dilekati dokumen')
        .select('id').eq('id', b.supplier_id).eq('company_id', cid).maybeSingle()
      if (!s) return reply.status(404).send({ error: 'Pemasok tidak ditemukan' })
    }

    const { data, error } = await db
      .unsafe('dokumen_kepatuhan', 'menyimpan dokumen; pemasok sudah diverifikasi milik tenant')
      .insert({
        company_id: cid,
        supplier_id: b.supplier_id ?? null,
        pihak_nama: b.pihak_nama ?? null,
        jenis: b.jenis,
        nomor: b.nomor ?? null,
        penerbit: b.penerbit ?? null,
        berlaku_dari: b.berlaku_dari ?? null,
        berlaku_sampai: b.berlaku_sampai ?? null,
        nilai_pertanggungan: b.nilai_pertanggungan ?? null,
        file_url: b.file_url ?? null,
        catatan: b.catatan ?? null,
        created_by: request.currentUser!.id,
      })
      .select('id, jenis, nomor, berlaku_sampai, terverifikasi')
      .single()

    if (error) {
      if (error.code === '23514') {
        return reply.status(422).send({
          error: 'Jenis dokumen tak dikenal, masa berlakunya mundur, atau nilai pertanggungannya negatif',
        })
      }
      return reply.status(500).send({ error: error.message })
    }

    return reply.status(201).send({ dokumen: data })
  })

  // ── PATCH /api/v1/kepatuhan/dokumen/:id/verifikasi ──────────────────────
  app.patch('/api/v1/kepatuhan/dokumen/:id/verifikasi', {
    preHandler: [authenticate, requirePermission('kepatuhan:manage')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const db = request.db!

    // Siapa & kapan diisi DI SERVER, bukan diterima dari klien: "sudah
    // diperiksa" yang bisa disetel sendiri bukan verifikasi apa pun.
    const { data, error } = await db
      .unsafe('dokumen_kepatuhan', 'kategori B; disaring company_id di baris berikutnya')
      .update({
        terverifikasi: true,
        diverifikasi_oleh: request.currentUser!.id,
        diverifikasi_pada: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id).eq('company_id', request.companyId!)
      .select('id, jenis, terverifikasi, diverifikasi_pada')
      .maybeSingle()

    if (error) return reply.status(500).send({ error: error.message })
    if (!data) return reply.status(404).send({ error: 'Dokumen tidak ditemukan' })
    return reply.send({ dokumen: data })
  })

  // ── POST /api/v1/kepatuhan/evaluasi ─────────────────────────────────────
  app.post('/api/v1/kepatuhan/evaluasi', {
    preHandler: [authenticate, requirePermission('kepatuhan:manage')],
  }, async (request, reply) => {
    const b = request.body as {
      supplier_id?: string | null
      pihak_nama?: string
      project_id?: string | null
      periode?: string
      skor_mutu?: number
      skor_waktu?: number
      skor_k3?: number
      skor_kepatuhan?: number
      skor_kerjasama?: number
      jumlah_kecelakaan?: number
      jumlah_pelanggaran_k3?: number
      catatan?: string
      masuk_daftar_hitam?: boolean
      alasan_daftar_hitam?: string
    }

    if (!b.supplier_id && !b.pihak_nama?.trim()) {
      return reply.status(400).send({
        error: 'Evaluasi harus punya pihak — pilih pemasok terdaftar atau isi namanya',
      })
    }

    const db = request.db!
    const cid = request.companyId!

    if (b.supplier_id) {
      const { data: s } = await db
        .unsafe('suppliers', 'memastikan pemasok milik tenant sebelum dinilai')
        .select('id').eq('id', b.supplier_id).eq('company_id', cid).maybeSingle()
      if (!s) return reply.status(404).send({ error: 'Pemasok tidak ditemukan' })
    }

    const { data, error } = await db
      .unsafe('evaluasi_subkon', 'menyimpan evaluasi; pemasok sudah diverifikasi milik tenant')
      .insert({
        company_id: cid,
        project_id: b.project_id ?? null,
        supplier_id: b.supplier_id ?? null,
        pihak_nama: b.pihak_nama ?? null,
        periode: b.periode ?? hariIni(),
        skor_mutu: b.skor_mutu ?? 0,
        skor_waktu: b.skor_waktu ?? 0,
        skor_k3: b.skor_k3 ?? 0,
        skor_kepatuhan: b.skor_kepatuhan ?? 0,
        skor_kerjasama: b.skor_kerjasama ?? 0,
        jumlah_kecelakaan: b.jumlah_kecelakaan ?? 0,
        jumlah_pelanggaran_k3: b.jumlah_pelanggaran_k3 ?? 0,
        catatan: b.catatan ?? null,
        masuk_daftar_hitam: b.masuk_daftar_hitam ?? false,
        alasan_daftar_hitam: b.alasan_daftar_hitam ?? null,
        dinilai_oleh: request.currentUser!.id,
        created_by: request.currentUser!.id,
      })
      .select('id, periode, masuk_daftar_hitam')
      .single()

    if (error) {
      if (error.code === '23514') {
        return reply.status(422).send({
          error: 'Skor harus 0–100, jumlah kejadian tak boleh negatif, dan daftar hitam wajib beralasan (minimal 10 huruf)',
        })
      }
      return reply.status(500).send({ error: error.message })
    }

    return reply.status(201).send({ evaluasi: data })
  })

  // ── POST /api/v1/kepatuhan/izin-kerja ───────────────────────────────────
  app.post('/api/v1/kepatuhan/izin-kerja', {
    preHandler: [authenticate, requirePermission('k3:permit:manage')],
  }, async (request, reply) => {
    const b = request.body as {
      project_id?: string
      nomor?: string
      jenis?: string
      uraian_pekerjaan?: string
      lokasi?: string
      berlaku_dari?: string
      berlaku_sampai?: string
      pengendalian_risiko?: string
      apd_wajib?: string
      ajukan?: boolean
    }

    if (!b.project_id || !b.nomor || !b.jenis || !b.uraian_pekerjaan) {
      return reply.status(400).send({
        error: 'project_id, nomor, jenis, dan uraian_pekerjaan wajib diisi',
      })
    }
    if (!b.berlaku_dari || !b.berlaku_sampai) {
      return reply.status(400).send({
        error: 'Izin kerja berlaku untuk satu jendela waktu — berlaku_dari dan berlaku_sampai wajib diisi',
      })
    }

    const db = request.db!
    const cid = request.companyId!

    const { data: proyek } = await db
      .unsafe('projects', 'memastikan proyek milik tenant sebelum izin diterbitkan')
      .select('id').eq('id', b.project_id).eq('company_id', cid).maybeSingle()
    if (!proyek) return reply.status(404).send({ error: 'Proyek tidak ditemukan' })

    const diajukan = b.ajukan === true

    const { data, error } = await db
      .unsafe('izin_kerja', 'menyimpan izin; proyek sudah diverifikasi milik tenant')
      .insert({
        company_id: cid,
        project_id: b.project_id,
        nomor: b.nomor,
        jenis: b.jenis,
        uraian_pekerjaan: b.uraian_pekerjaan,
        lokasi: b.lokasi ?? null,
        berlaku_dari: b.berlaku_dari,
        berlaku_sampai: b.berlaku_sampai,
        pengendalian_risiko: b.pengendalian_risiko ?? null,
        apd_wajib: b.apd_wajib ?? null,
        status: diajukan ? 'diajukan' : 'draft',
        diajukan_oleh: diajukan ? request.currentUser!.id : null,
        diajukan_pada: diajukan ? new Date().toISOString() : null,
        created_by: request.currentUser!.id,
      })
      .select('id, nomor, jenis, status, berlaku_dari, berlaku_sampai')
      .single()

    if (error) {
      if (error.code === '23505') {
        return reply.status(409).send({ error: `Izin kerja ${b.nomor} sudah ada` })
      }
      if (error.code === '23514') {
        return reply.status(422).send({
          error: 'Jenis pekerjaan tak dikenal, atau jendela waktunya terbalik (berlaku_sampai harus sesudah berlaku_dari)',
        })
      }
      return reply.status(500).send({ error: error.message })
    }

    return reply.status(201).send({ izin: data })
  })

  // ── PATCH /api/v1/kepatuhan/izin-kerja/:id/putuskan ─────────────────────
  //
  // Permission TERPISAH dari yang mengajukan (`k3:permit:decide`), dan
  // constraint DB menolak pemutus yang sama dengan pengaju. Dua lapis untuk
  // satu aturan, karena inilah yang pertama ditanya saat ada kecelakaan.
  app.patch('/api/v1/kepatuhan/izin-kerja/:id/putuskan', {
    preHandler: [authenticate, requirePermission('k3:permit:decide')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const b = request.body as { setujui?: boolean; alasan_tolak?: string }
    const db = request.db!
    const cid = request.companyId!

    const { data: izin, error: galatBaca } = await db
      .unsafe('izin_kerja', 'kategori B; disaring company_id di baris berikutnya')
      .select('id, nomor, status, diajukan_oleh, pengendalian_risiko')
      .eq('id', id).eq('company_id', cid).maybeSingle()

    if (galatBaca) return reply.status(500).send({ error: galatBaca.message })
    if (!izin) return reply.status(404).send({ error: 'Izin kerja tidak ditemukan' })

    if (izin.status !== 'diajukan') {
      return reply.status(422).send({
        error: `Izin ini berstatus "${izin.status}" — hanya yang diajukan bisa diputuskan`,
      })
    }

    // Pemisahan tugas diperiksa DI SINI juga, bukan hanya di constraint:
    // pesan galat yang jelas lebih berguna daripada 23514 mentah.
    if (izin.diajukan_oleh === request.currentUser!.id) {
      return reply.status(403).send({
        error: 'Anda yang mengajukan izin ini — pemutus harus orang lain. Izin kerja yang disetujui sendiri bukan pengendalian apa pun.',
      })
    }

    const setujui = b.setujui === true

    if (setujui && (izin.pengendalian_risiko ?? '').trim().length < 10) {
      return reply.status(422).send({
        error: 'Izin ini belum memuat pengendalian risiko — menyetujuinya berarti menandatangani dokumen kosong',
      })
    }
    if (!setujui && (b.alasan_tolak ?? '').trim().length < 10) {
      return reply.status(422).send({
        error: 'Penolakan wajib beralasan (minimal 10 huruf) — tanpa itu pengaju akan mengajukan dokumen yang sama lagi',
      })
    }

    const { data, error } = await db
      .unsafe('izin_kerja', 'menyimpan keputusan; izin sudah diverifikasi milik tenant')
      .update({
        status: setujui ? 'disetujui' : 'ditolak',
        diputuskan_oleh: request.currentUser!.id,
        diputuskan_pada: new Date().toISOString(),
        alasan_tolak: setujui ? null : b.alasan_tolak,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id).eq('company_id', cid)
      .eq('status', 'diajukan')
      .select('id, nomor, status, diputuskan_pada')
      .maybeSingle()

    if (error) {
      if (error.code === '23514') {
        return reply.status(422).send({
          error: 'Keputusan ditolak basis — periksa pengendalian risiko dan alasan penolakannya',
        })
      }
      return reply.status(500).send({ error: error.message })
    }
    // Sejak klaim status ikut di WHERE (TJS-A0, 2026-08-09), nol baris punya
    // DUA sebab: izinnya tak ada, ATAU sudah diputus request lain. Izin sudah
    // dibaca di atas dan terbukti ada, jadi sampai di sini sebabnya yang kedua.
    if (!data) {
      request.log.warn({ izinId: id }, 'keputusan izin K3 serentak ditolak')
      return reply.status(409).send({
        error: 'Izin ini baru saja diputus dari tempat lain. Muat ulang halaman.',
      })
    }

    return reply.send({ izin: data })
  })
}
