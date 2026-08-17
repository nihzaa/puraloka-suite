import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'
import {
  evaluasiBatasBalas, validasiKonsistensiSurat,
  type ArahSurat, type StatusSurat,
} from '../../lib/surat-korespondensi.js'

/**
 * SURAT MASUK/KELUAR — korespondensi proyek (INTI #5 · migrasi 185).
 *
 * ── Kenapa berkas sendiri, bukan menumpang `documents`
 *
 * `documents` adalah repositori BERKAS. Surat adalah PERISTIWA: ada pengirim,
 * penerima, tanggal kirim vs terima, dan rantai balasan. Berkasnya tetap
 * disimpan di `documents` lewat `dokumen_id` — yang dipisah adalah peristiwanya,
 * bukan filenya.
 *
 * ── Izin: `documents:manage`, bukan permission baru
 *
 * Surat adalah korespondensi dokumen, dan izin itu sudah ada. Menambah
 * `surat:manage` berarti tiap tenant harus mengonfigurasinya sebelum modul ini
 * bisa dipakai — biaya nyata untuk pemisahan yang tak menjawab kebutuhan siapa
 * pun hari ini.
 *
 * ── Yang paling dijaga di sini
 *
 * ARAH menentukan tanggal acuan DAN siapa yang lalai. Surat keluar lewat batas
 * = lawan belum menjawab (dasar klaim kita). Surat masuk lewat batas = KITA
 * belum menjawab (dasar klaim lawan). Alasannya di header
 * `lib/surat-korespondensi.ts`.
 */
export default async function suratRoutes(app: FastifyInstance) {

  /** Hari ini dalam WIB, `YYYY-MM-DD`. */
  function hariIniWIB(): string {
    // +7 jam lalu ambil bagian tanggalnya. Memakai tanggal UTC menggeser batas
    // sehari untuk surat yang dicatat malam hari WIB — dan sehari bisa
    // menentukan lalai atau tidak.
    return new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10)
  }

  /**
   * Bentuk baris surat apa adanya dari basis, sebelum `batas` dihitung.
   *
   * Ditulis sekali dan dipakai dua endpoint — per-proyek dan lintas-proyek.
   * Kalau tiap endpoint mendefinisikan bentuknya sendiri, keduanya akan
   * menyimpang begitu satu kolom ditambahkan, dan yang menyimpang diam-diam
   * adalah yang jarang dibuka.
   */
  type BarisSurat = Record<string, unknown> & {
    arah?: string; status?: string; butuh_balasan?: boolean
    batas_balas?: string | null
    tanggal_kirim?: string | null; tanggal_terima?: string | null
    // Disebut EKSPLISIT, bukan diambil lewat index signature. Hasil `.map()`
    // atas tipe ini kehilangan index signature-nya, jadi tanpa baris ini
    // pemakaian `s.project_id` di endpoint lintas-proyek hanya bisa lolos
    // lewat cast — dan cast di kolom yang menentukan tenancy adalah tempat
    // terakhir yang boleh kehilangan pemeriksaan tipe.
    project_id?: string
  }

  /**
   * Menempelkan status batas balas pada tiap surat.
   *
   * ⚠️ Dipakai BERSAMA oleh kedua endpoint dengan sengaja. Status batas adalah
   * satu-satunya bagian jawaban yang DIHITUNG, bukan dibaca — menyalinnya ke
   * dua tempat berarti dua tanggal acuan yang bisa berbeda, dan selisih satu
   * hari di sini menentukan lalai atau tidak (lihat header berkas).
   */
  function lengkapiBatas(rows: BarisSurat[], hariIni: string) {
    return rows.map((s) => ({
      ...s,
      batas: evaluasiBatasBalas({
        arah: (s.arah ?? 'keluar') as ArahSurat,
        butuhBalasan: Boolean(s.butuh_balasan),
        batasBalas: s.batas_balas ?? null,
        tanggalKirim: s.tanggal_kirim ?? null,
        tanggalTerima: s.tanggal_terima ?? null,
        status: (s.status ?? 'draft') as StatusSurat,
        hariIni,
      }),
    }))
  }

  /**
   * Ringkasan yang DIPISAH per pihak yang ditunggu.
   *
   * Dua angka ini menuntut tindakan yang BERLAWANAN — yang satu pekerjaan kita
   * hari ini, yang lain bahan penagihan ke lawan. Menjumlahkannya jadi satu
   * "lewat batas" membuat daftarnya tak bisa dipakai siapa pun.
   */
  function ringkasSurat(surat: ReturnType<typeof lengkapiBatas>) {
    const lewat = surat.filter((s) => s.batas.keadaan === 'lewat')
    return {
      jumlah: surat.length,
      masuk: surat.filter((s) => s.arah === 'masuk').length,
      keluar: surat.filter((s) => s.arah === 'keluar').length,
      kita_belum_menjawab: lewat.filter((s) => s.batas.siapaYangDitunggu === 'kita').length,
      lawan_belum_menjawab: lewat.filter((s) => s.batas.siapaYangDitunggu === 'lawan').length,
      mendesak: surat.filter((s) => s.batas.keadaan === 'mendesak').length,
    }
  }

  // ── GET /api/v1/letters ────────────────────────────────────────────────────
  //
  // Daftar surat SELURUH proyek tenant — dasar halaman `/kontrak/surat`.
  //
  // ── Kenapa endpoint ini ada, padahal yang per-proyek sudah ada
  //
  // Yang per-proyek menjawab "surat apa saja di proyek ini". Pertanyaan yang
  // dibawa orang ke menu Kontrak berbeda: "surat mana yang WAJIB saya jawab
  // hari ini" — dan jawabannya tersebar di semua proyek sekaligus. Tanpa ini,
  // halaman kontrak harus memanggil endpoint per-proyek sekali per proyek,
  // lalu menggabungkannya di peramban; dengan 30 proyek itu 30 permintaan yang
  // tiba di 30 waktu berbeda, dan ringkasannya menjumlah keadaan yang tak
  // pernah ada bersamaan.
  //
  // ── Tenancy
  //
  // `project_letters` kategori C (mewarisi lewat proyek), jadi `viaProject()`
  // menuntut SATU project_id dan tak bisa dipakai untuk daftar lintas-proyek.
  // Polanya sama dengan tabel kategori C lain: saring `project_id` dengan
  // `db.projectIds()`, yang isinya hanya proyek milik tenant ini.
  app.get<{ Querystring: { arah?: string; status?: string; project_id?: string } }>(
    '/api/v1/letters',
    { preHandler: [authenticate, requirePermission('documents:manage')] },
    async (request, reply) => {
      const idProyek = await request.db!.projectIds()

      // Tenant tanpa satu pun proyek: `in('project_id', [])` di PostgREST
      // menghasilkan daftar kosong yang benar, tapi ringkasannya tetap perlu
      // dibentuk supaya layar tak menerima `undefined` dan menampilkan "—".
      if (idProyek.length === 0) {
        return reply.send({ data: [], proyek: [], ringkas: ringkasSurat([]) })
      }

      const { project_id, arah, status } = request.query

      // Saringan proyek dari pengguna dipersempit ke yang MILIK TENANT, bukan
      // dipakai apa adanya. Tanpa irisan ini, `?project_id=<milik-tenant-lain>`
      // akan melewati `in()` dan mengembalikan nol baris — bocor tidak, tapi
      // juga tak membedakan "tak ada surat" dari "bukan proyek Anda".
      if (project_id && !idProyek.includes(project_id)) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }

      let q = request.db!
        .unsafe('project_letters',
          'kategori C lintas-proyek; disaring project_id ke db.projectIds() di baris berikutnya')
        .select('*')
        .in('project_id', project_id ? [project_id] : idProyek)

      if (arah === 'masuk' || arah === 'keluar') q = q.eq('arah', arah)
      if (status) q = q.eq('status', status)

      const { data, error } = await q.order('created_at', { ascending: false })
      if (error) {
        request.log.error({ err: error }, 'gagal memuat surat lintas proyek')
        return reply.status(500).send({ error: 'Gagal memuat surat' })
      }

      // Nama proyek diambil TERPISAH, bukan lewat join PostgREST.
      //
      // `project_letters` memang punya FK ke `projects`, tapi join di sini
      // akan ikut menarik baris proyek untuk tiap surat — dan daftar surat
      // tenant besar melewati batas 1.000 baris PostgREST jauh lebih cepat
      // bila tiap barisnya membawa objek proyek. Peta id→nama jauh lebih kecil.
      const { data: proyek, error: errProyek } = await request.db!
        .from('projects').select('id, name').in('id', idProyek).order('name')
      if (errProyek) {
        request.log.error({ err: errProyek }, 'gagal memuat nama proyek')
        return reply.status(500).send({ error: 'Gagal memuat daftar proyek' })
      }

      const namaProyek = new Map(
        (proyek ?? []).map((p) => [(p as { id: string }).id, (p as { name: string }).name]))

      const surat = lengkapiBatas((data ?? []) as BarisSurat[], hariIniWIB())
        .map((s) => ({ ...s, project_name: namaProyek.get(s.project_id ?? '') ?? '—' }))

      return reply.send({ data: surat, proyek: proyek ?? [], ringkas: ringkasSurat(surat) })
    },
  )

  // ── GET /api/v1/projects/:projectId/letters ────────────────────────────────
  app.get<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId/letters',
    { preHandler: [authenticate, requirePermission('documents:manage')] },
    async (request, reply) => {
      const { data: proyek } = await request.db!
        .from('projects').select('id').eq('id', request.params.projectId).maybeSingle()
      if (!proyek) return reply.status(404).send({ error: 'Proyek tidak ditemukan' })

      const { data, error } = await request.db!
        .viaProject('project_letters', request.params.projectId)
        .select('*')
        .order('created_at', { ascending: false })
      if (error) {
        request.log.error({ err: error }, 'gagal memuat surat')
        return reply.status(500).send({ error: 'Gagal memuat surat' })
      }

      // Status batas DIHITUNG saat dibaca, bukan disimpan: ia berubah tiap
      // hari berjalan, dan kolom yang perlu di-refresh harian pasti basi.
      //
      // Perhitungan dan ringkasannya DIBAGI dengan `GET /api/v1/letters` —
      // lihat alasannya di atas `lengkapiBatas`.
      const surat = lengkapiBatas((data ?? []) as BarisSurat[], hariIniWIB())
      return reply.send({ data: surat, ringkas: ringkasSurat(surat) })
    },
  )

  // ── POST /api/v1/projects/:projectId/letters ───────────────────────────────
  app.post<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId/letters',
    { preHandler: [authenticate, requirePermission('documents:manage')] },
    async (request, reply) => {
      const b = request.body as Record<string, unknown>
      const nomor = String(b.nomor ?? '').trim()
      const perihal = String(b.perihal ?? '').trim()
      const arah = String(b.arah ?? '') as ArahSurat
      const status = String(b.status ?? 'draft') as StatusSurat

      if (!nomor) return reply.status(400).send({ error: 'Nomor surat wajib diisi' })
      if (arah !== 'masuk' && arah !== 'keluar') {
        return reply.status(400).send({ error: 'Arah surat harus "masuk" atau "keluar"' })
      }
      if (perihal.length < 5) {
        // Perihal adalah yang dibaca pertama saat surat dicari kembali setahun
        // kemudian. "Surat" bukan perihal.
        return reply.status(400).send({
          error: 'Perihal wajib diisi, minimal 5 karakter — ini yang dibaca saat ' +
                 'surat dicari kembali',
        })
      }
      if (!String(b.dari_pihak ?? '').trim() || !String(b.kepada_pihak ?? '').trim()) {
        return reply.status(400).send({ error: 'Pihak pengirim dan penerima wajib diisi' })
      }

      const cek = validasiKonsistensiSurat({
        arah, status,
        tanggalKirim: (b.tanggal_kirim as string) ?? null,
        tanggalTerima: (b.tanggal_terima as string) ?? null,
        butuhBalasan: Boolean(b.butuh_balasan),
        batasBalas: (b.batas_balas as string) ?? null,
      })
      if (!cek.ok) return reply.status(422).send({ error: cek.galat })

      const { data: proyek } = await request.db!
        .from('projects').select('id').eq('id', request.params.projectId).maybeSingle()
      if (!proyek) return reply.status(404).send({ error: 'Proyek tidak ditemukan' })

      const { data, error } = await request.db!
        .viaProject('project_letters', request.params.projectId)
        .insert({
          project_id: request.params.projectId,
          nomor,
          arah,
          jenis: String(b.jenis ?? 'pemberitahuan'),
          perihal,
          ringkasan: (b.ringkasan as string) ?? null,
          dari_pihak: String(b.dari_pihak).trim(),
          kepada_pihak: String(b.kepada_pihak).trim(),
          tanggal_kirim: (b.tanggal_kirim as string) ?? null,
          tanggal_terima: (b.tanggal_terima as string) ?? null,
          membalas_id: (b.membalas_id as string) ?? null,
          butuh_balasan: Boolean(b.butuh_balasan),
          batas_balas: (b.batas_balas as string) ?? null,
          status,
          dokumen_id: (b.dokumen_id as string) ?? null,
          dicatat_oleh: request.currentUser!.id,
        })
        .select().single()

      if (error) {
        if (error.code === '23505') {
          return reply.status(409).send({ error: 'Nomor surat sudah dipakai di proyek ini' })
        }
        request.log.error({ err: error }, 'gagal mencatat surat')
        return reply.status(500).send({ error: 'Gagal mencatat surat' })
      }

      void logAuditEvent(request, {
        tableName: 'project_letters', recordId: data.id, action: 'surat.catat',
        actorId: request.currentUser!.id, newValues: data,
        // Teguran & peringatan sering jadi dasar pemutusan kontrak — dinaikkan
        // supaya terlihat di audit tanpa harus dicari.
        severity: ['teguran', 'peringatan'].includes(String(b.jenis)) ? 'critical' : undefined,
      })

      return reply.status(201).send({
        data,
        batas: evaluasiBatasBalas({
          arah, butuhBalasan: Boolean(b.butuh_balasan),
          batasBalas: (b.batas_balas as string) ?? null,
          tanggalKirim: (b.tanggal_kirim as string) ?? null,
          tanggalTerima: (b.tanggal_terima as string) ?? null,
          status, hariIni: hariIniWIB(),
        }),
      })
    },
  )

  // ── PATCH /api/v1/letters/:id ──────────────────────────────────────────────
  app.patch<{ Params: { id: string } }>(
    '/api/v1/letters/:id',
    { preHandler: [authenticate, requirePermission('documents:manage')] },
    async (request, reply) => {
      const b = request.body as Record<string, unknown>

      // ⚠️ `project_letters` kategori C — `project_id` WAJIB diketahui lebih
      // dulu. Preseden `contract_claims` (184): endpoint ini hanya menerima id
      // surat, jadi `project_id` diminta di body dan divalidasi milik tenant.
      // Terasa merepotkan; itulah yang membuat gerbangnya tak bisa lupa.
      const projectId = String(b.project_id ?? '').trim()
      if (!projectId) {
        return reply.status(400).send({
          error: 'project_id wajib disertakan — surat mewarisi tenancy lewat proyek',
        })
      }

      const { data: proyek } = await request.db!
        .from('projects').select('id').eq('id', projectId).maybeSingle()
      if (!proyek) return reply.status(404).send({ error: 'Proyek tidak ditemukan' })

      const { data: lamaRows, error: bacaErr } = await request.db!
        .viaProject('project_letters', projectId)
        .select('*')
        .eq('id', request.params.id)
      if (bacaErr) {
        request.log.error({ err: bacaErr }, 'gagal membaca surat')
        return reply.status(500).send({ error: 'Gagal membaca surat' })
      }
      const lama = ((lamaRows ?? []) as Array<Record<string, unknown>>)[0]
      if (!lama) return reply.status(404).send({ error: 'Surat tidak ditemukan' })

      // Nilai baru ditumpuk di atas yang lama SEBELUM divalidasi — memvalidasi
      // hanya field yang dikirim akan meloloskan kombinasi yang tak sah
      // (mis. status naik jadi 'terkirim' sementara tanggal kirim tetap kosong).
      const gabung = {
        arah: (b.arah ?? lama.arah) as ArahSurat,
        status: (b.status ?? lama.status) as StatusSurat,
        tanggalKirim: (b.tanggal_kirim ?? lama.tanggal_kirim) as string | null,
        tanggalTerima: (b.tanggal_terima ?? lama.tanggal_terima) as string | null,
        butuhBalasan: Boolean(b.butuh_balasan ?? lama.butuh_balasan),
        batasBalas: (b.batas_balas ?? lama.batas_balas) as string | null,
      }
      const cek = validasiKonsistensiSurat(gabung)
      if (!cek.ok) return reply.status(422).send({ error: cek.galat })

      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
      for (const k of ['jenis', 'perihal', 'ringkasan', 'dari_pihak', 'kepada_pihak',
        'tanggal_kirim', 'tanggal_terima', 'membalas_id', 'butuh_balasan',
        'batas_balas', 'status', 'dokumen_id', 'arah']) {
        if (k in b) patch[k] = b[k]
      }

      const { data, error } = await request.db!
        .viaProject('project_letters', projectId)
        .update(patch)
        .eq('id', request.params.id)
        .select().single()
      if (error) {
        request.log.error({ err: error }, 'gagal memperbarui surat')
        return reply.status(500).send({ error: 'Gagal memperbarui surat' })
      }

      void logAuditEvent(request, {
        tableName: 'project_letters', recordId: data.id, action: 'surat.ubah',
        actorId: request.currentUser!.id, oldValues: lama, newValues: data,
      })
      return reply.send({ data })
    },
  )
}
