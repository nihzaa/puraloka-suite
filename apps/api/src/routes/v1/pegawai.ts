import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission, hasPermission } from '../../plugins/auth.js'
import { requireModul } from '../../utils/gerbang-modul.js'
import { logAuditEvent } from '../../utils/audit.js'
import {
  validasiPegawai, ringkasPegawai, periksaKelengkapan,
  STATUS_PTKP, KATEGORI_TER,
  type BarisPegawai,
} from '../../lib/pegawai.js'

/**
 * DATA KEPEGAWAIAN — mengelola pegawai beserta data pajak & jaminan sosialnya.
 *
 * ── Lubang yang ditutup
 *
 * `sdm:pegawai:view` dan `sdm:pegawai:manage` ADA, DIBERIKAN ke dua peran, dan
 * dipakai policy RLS `pegawai_baca`/`pegawai_tulis` — tetapi NOL rute
 * memakainya (diukur 2026-08-12). Satu-satunya endpoint yang menyentuh tabel
 * ini bergerbang `sdm:timesheet:view` dan hanya MEMBACA.
 *
 * Akibatnya data kepegawaian tak bisa dibuat maupun disunting dari mana pun:
 * 5 pegawai masuk lewat seed, 21 pengguna lain tak punya data sama sekali.
 *
 * ── Kenapa GAJI dipisah izinnya
 *
 * `gaji_pokok` hanya keluar untuk pemegang `sdm:pegawai:manage`. Yang butuh
 * daftar pegawai untuk memilih siapa (timesheet, cuti, klaim) tak menuntut
 * kewenangan melihat gaji orang — dan mengirimkannya "karena sudah di-select"
 * adalah kebocoran yang tak pernah terlihat sebagai galat.
 */
export default async function pegawaiRoutes(app: FastifyInstance) {
  const ALASAN = 'kategori B; disaring company_id di baris berikutnya'

  // Gaji SENGAJA tak ada di sini — lihat catatan di header.
  const SELECT_AMAN = `
    id, user_id, nomor_induk, jabatan, departemen, tanggal_masuk, tanggal_keluar,
    status_ptkp, kategori_ter, npwp, nomor_bpjs_tk, nomor_bpjs_kes, jam_standar,
    catatan, created_at,
    user:users ( id, name, email )
  `

  // ── GET /api/v1/sdm/pegawai/kelola ───────────────────────────────────────
  //
  // Jalur terpisah dari `GET /sdm/pegawai` yang sudah ada (timesheet-staf.ts):
  // yang itu bergerbang `sdm:timesheet:view` dan dipakai memilih orang. Yang
  // ini bergerbang izin kepegawaian dan membawa kelengkapan datanya.
  app.get<{ Querystring: { aktif?: string } }>(
    '/api/v1/sdm/pegawai/kelola',
    { preHandler: [authenticate, requireModul('modul.sdm'), requirePermission('sdm:pegawai:view')] },
    async (request, reply) => {
      const db = request.db!

      const bolehLihatGaji = await hasPermission(request, 'sdm:pegawai:manage')
      const kolom = bolehLihatGaji ? `${SELECT_AMAN}, gaji_pokok` : SELECT_AMAN

      const { data, error } = await db.unsafe('pegawai', ALASAN)
        .select(kolom)
        .eq('company_id', request.companyId!)
        .order('nomor_induk', { ascending: true, nullsFirst: false })
      if (error) {
        request.log.error({ err: error }, 'gagal memuat data kepegawaian')
        return reply.status(500).send({ error: 'Gagal memuat data kepegawaian' })
      }

      const baris = (data ?? []) as unknown as BarisPegawai[]
      const hariIni = new Date().toISOString().slice(0, 10)

      const hasil = baris.map((p) => ({
        ...p,
        kelengkapan: periksaKelengkapan(p),
      }))

      return reply.send({
        pegawai: request.query.aktif === '1'
          ? hasil.filter((p) => !p.tanggal_keluar || p.tanggal_keluar > hariIni)
          : hasil,
        ringkasan: ringkasPegawai(baris, hariIni),
        // Pilihan yang sah dikirim server, bukan diketik ulang di klien —
        // dua daftar untuk hal yang sama pasti berselisih suatu saat.
        pilihan: { status_ptkp: STATUS_PTKP, kategori_ter: KATEGORI_TER },
        boleh_lihat_gaji: bolehLihatGaji,
      })
    },
  )

  // ── GET /api/v1/sdm/pegawai/calon ────────────────────────────────────────
  //
  // Pengguna yang BELUM punya data kepegawaian. Tanpa daftar ini, HRD harus
  // menebak siapa yang belum terdaftar — dan `pegawai_user_unik` menolaknya
  // dengan galat yang membicarakan constraint, bukan orangnya.
  app.get(
    '/api/v1/sdm/pegawai/calon',
    { preHandler: [authenticate, requireModul('modul.sdm'), requirePermission('sdm:pegawai:manage')] },
    async (request, reply) => {
      const db = request.db!

      const { data: sudah, error: errSudah } = await db.unsafe('pegawai', ALASAN)
        .select('user_id')
        .eq('company_id', request.companyId!)
      if (errSudah) return reply.status(500).send({ error: errSudah.message })
      const idSudah = new Set(((sudah ?? []) as Array<{ user_id: string }>).map((x) => x.user_id))

      const { data: anggota, error } = await db
        .unsafe('company_members', 'kategori B; disaring company_id di baris ini')
        // FK disebut EKSPLISIT: `company_members` punya DUA relasi ke `users`
        // (`user_id` dan `created_by`), dan tanpa menyebutnya PostgREST menolak
        // dengan "more than one relationship was found".
        .select('user_id, user:users!company_members_user_id_fkey ( id, name, email )')
        .eq('company_id', request.companyId!)
      if (error) return reply.status(500).send({ error: error.message })

      const calon = ((anggota ?? []) as Array<{ user_id: string; user?: unknown }>)
        .filter((a) => !idSudah.has(a.user_id))
        .map((a) => a.user)
        .filter(Boolean)

      return reply.send({ calon })
    },
  )

  // ── POST /api/v1/sdm/pegawai ─────────────────────────────────────────────
  app.post<{ Body: Record<string, unknown> & { user_id?: string } }>(
    '/api/v1/sdm/pegawai',
    { preHandler: [authenticate, requireModul('modul.sdm'), requirePermission('sdm:pegawai:manage')] },
    async (request, reply) => {
      const db = request.db!
      const b = request.body

      if (!b?.user_id) {
        return reply.status(400).send({
          error: 'user_id wajib diisi — data kepegawaian menempel pada akun pengguna, '
            + 'bukan berdiri sendiri.',
        })
      }

      // Pengguna WAJIB anggota tenant ini. Tanpa cek, data kepegawaian bisa
      // dibuat atas nama pengguna perusahaan lain — dan gajinya muncul di
      // payroll yang salah tanpa satu pun galat.
      const { data: anggota, error: errAnggota } = await db
        .unsafe('company_members', 'kategori B; disaring company_id di baris ini')
        .select('user_id')
        .eq('company_id', request.companyId!)
        .eq('user_id', b.user_id)
        .maybeSingle()
      if (errAnggota) return reply.status(500).send({ error: errAnggota.message })
      if (!anggota) {
        return reply.status(404).send({ error: 'Pengguna bukan anggota perusahaan ini' })
      }

      const v = validasiPegawai(b)
      if (!v.ok) return reply.status(400).send({ error: v.galat })

      const { data, error } = await db.unsafe('pegawai', ALASAN)
        .insert({ company_id: request.companyId!, user_id: b.user_id, ...v.nilai })
        .select('id, nomor_induk, jabatan')
        .single()
      if (error) {
        const kode = (error as { code?: string }).code
        if (kode === '23505') {
          // Dua sebab: pengguna sudah punya data kepegawaian, atau nomor
          // induknya dipakai orang lain. Menyebut keduanya lebih menolong
          // daripada menebak satu.
          return reply.status(409).send({
            error: 'Pengguna ini sudah punya data kepegawaian, atau nomor induknya '
              + 'sudah dipakai pegawai lain.',
          })
        }
        if (kode === '23514') return reply.status(422).send({ error: error.message })
        return reply.status(500).send({ error: error.message })
      }

      void logAuditEvent(request, {
        tableName: 'pegawai', recordId: (data as { id: string }).id,
        action: 'pegawai.create',
        actorId: request.currentUser!.id,
        // Gaji TIDAK ikut di audit trail yang bisa dibaca luas — nominalnya
        // ada di barisnya sendiri, dan menyalinnya ke log memperbanyak tempat
        // ia bisa terbaca.
        newValues: { user_id: b.user_id, nomor_induk: v.nilai.nomor_induk },
        severity: 'info',
      })

      return reply.status(201).send({ pegawai: data })
    },
  )

  // ── PATCH /api/v1/sdm/pegawai/:id ────────────────────────────────────────
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>(
    '/api/v1/sdm/pegawai/:id',
    { preHandler: [authenticate, requireModul('modul.sdm'), requirePermission('sdm:pegawai:manage')] },
    async (request, reply) => {
      const db = request.db!
      const { id } = request.params
      const b = request.body ?? {}

      const { data: ada, error: errBaca } = await db.unsafe('pegawai', ALASAN)
        .select('id, user_id, tanggal_masuk, tanggal_keluar, nomor_induk')
        .eq('id', id).eq('company_id', request.companyId!)
        .maybeSingle()
      if (errBaca) return reply.status(500).send({ error: errBaca.message })
      if (!ada) return reply.status(404).send({ error: 'Pegawai tidak ditemukan' })

      const lama = ada as Record<string, unknown>

      // Tanggal masuk yang tak dikirim diambil dari barisnya — kalau tidak,
      // memperbarui hanya `tanggal_keluar` akan lolos pemeriksaan urutan
      // tanggal karena `tanggal_masuk` terbaca null.
      const v = validasiPegawai({
        ...b,
        tanggal_masuk: (b.tanggal_masuk as string | undefined) ?? (lama.tanggal_masuk as string | null),
        tanggal_keluar: b.tanggal_keluar === undefined
          ? (lama.tanggal_keluar as string | null)
          : (b.tanggal_keluar as string | null),
      })
      if (!v.ok) return reply.status(400).send({ error: v.galat })

      // HANYA kolom yang BENAR-BENAR dikirim yang ditulis.
      //
      // Versi pertama rute ini menulis seluruh `v.nilai`, dan `validasiPegawai`
      // mengisi `null` untuk apa pun yang tak ada di body. Akibatnya menyunting
      // SATU kolom menghapus sisanya: memperbarui tanggal keluar menghapus
      // gaji, NPWP, dan status PTKP — diam-diam, tanpa satu pun galat.
      //
      // Ketahuan lewat test yang membandingkan gaji SESUDAH patch lain, bukan
      // lewat test patch-nya sendiri. Itu sebabnya testnya menyimpan angka
      // nyata dan membandingkannya, bukan sekadar memeriksa status 200.
      //
      // `user_id` sengaja TIDAK termasuk: memindahkan data kepegawaian ke akun
      // lain berarti riwayat gaji, cuti, dan timesheet ikut berpindah pemilik.
      const patchKolom: Record<string, unknown> = { updated_at: new Date().toISOString() }
      for (const k of [
        'nomor_induk', 'jabatan', 'departemen', 'tanggal_masuk', 'tanggal_keluar',
        'gaji_pokok', 'status_ptkp', 'kategori_ter', 'npwp',
        'nomor_bpjs_tk', 'nomor_bpjs_kes', 'jam_standar', 'catatan',
      ] as const) {
        if (k in b) patchKolom[k] = v.nilai[k]
      }

      if (Object.keys(patchKolom).length === 1) {
        return reply.status(400).send({ error: 'Tak ada kolom yang diubah' })
      }

      const { data, error } = await db.unsafe('pegawai', ALASAN)
        .update(patchKolom)
        .eq('id', id).eq('company_id', request.companyId!)
        .select('id, nomor_induk, jabatan, tanggal_keluar')
      if (error) {
        if ((error as { code?: string }).code === '23505') {
          return reply.status(409).send({ error: 'Nomor induk itu sudah dipakai pegawai lain' })
        }
        // Trigger `fn_pegawai_terkunci` melempar ERRCODE 23514 dengan pesan
        // yang sudah ditulis untuk manusia — diteruskan apa adanya.
        //
        // Dicocokkan lewat KODE SQL, bukan isi pesannya: pesan trigger sengaja
        // tak mengandung kata "check", dan versi pertama rute ini menjatuhkan
        // penolakan yang benar jadi 500 karena mencari kata itu.
        if ((error as { code?: string }).code === '23514'
            || /violates check/i.test(error.message)) {
          return reply.status(422).send({ error: error.message })
        }
        return reply.status(500).send({ error: error.message })
      }
      if (!data || data.length === 0) {
        return reply.status(409).send({ error: 'Data berubah dari tempat lain. Muat ulang.' })
      }

      void logAuditEvent(request, {
        tableName: 'pegawai', recordId: id,
        action: 'pegawai.ubah',
        actorId: request.currentUser!.id,
        oldValues: { nomor_induk: lama.nomor_induk, tanggal_keluar: lama.tanggal_keluar },
        newValues: { nomor_induk: v.nilai.nomor_induk, tanggal_keluar: v.nilai.tanggal_keluar },
        severity: 'info',
      })

      return reply.send({ pegawai: data[0] })
    },
  )
}
