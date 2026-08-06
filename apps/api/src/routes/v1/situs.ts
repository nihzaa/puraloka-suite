import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'
import { supabase } from '../../utils/supabase.js'
import { validasiAksen, validasiPasangan } from '../../lib/situs-warna.js'

// ─────────────────────────────────────────────────────────────────────────────
// Konten situs publik (compro) — migrasi 205.
//
// Seluruh teks, angka, media, dan urutan seksi halaman publik ada di sini.
// Aturan yang mengikat: NOL string konten di berkas .tsx situs publik. Kalau
// sebuah kalimat bisa berubah tanpa deploy, ia tinggal di tabel ini.
//
// Baca = situs:view. Tulis = situs:manage. Keduanya dibuat migrasi 205.
// ─────────────────────────────────────────────────────────────────────────────

/** Varian tampilan yang SUDAH dirancang. Cermin CHECK di migrasi 205. */
const VARIAN_SAH = ['baku', 'grid', 'carousel', 'split'] as const

export default async function situsRoutes(app: FastifyInstance) {
  // ── GET /api/v1/situs/konten ───────────────────────────────────────────────
  // Dikembalikan sebagai peta kunci→nilai: pemanggil menyebut `konten['hero.judul']`,
  // bukan mencari di array. Bentuk array memaksa tiap pemanggil menulis
  // pencariannya sendiri, dan tiap pemanggil akan memilih default berbeda.
  app.get(
    '/api/v1/situs/konten',
    { preHandler: [authenticate, requirePermission('situs:view')] },
    async (request, reply) => {
      const { data, error } = await request.db!
        .from('situs_konten')
        .select('kunci, nilai')

      if (error) {
        request.log.error({ err: error }, 'gagal memuat konten situs')
        return reply.status(500).send({ error: 'Gagal memuat konten situs' })
      }

      const peta: Record<string, unknown> = {}
      for (const baris of data ?? []) peta[baris.kunci] = baris.nilai
      return reply.send({ data: peta })
    },
  )

  // ── PUT /api/v1/situs/konten ───────────────────────────────────────────────
  app.put(
    '/api/v1/situs/konten',
    { preHandler: [authenticate, requirePermission('situs:manage')] },
    async (request, reply) => {
      const { kunci, nilai } = request.body as { kunci?: string; nilai?: unknown }

      if (!kunci || typeof kunci !== 'string' || kunci.trim() === '') {
        return reply.status(422).send({ error: 'Kunci konten wajib diisi.' })
      }
      // `null` sah (mengosongkan sebuah kolom); `undefined` berarti field-nya
      // memang tak dikirim — dua hal berbeda, dan menyamakannya membuat
      // "kosongkan nilai ini" mustahil diungkapkan.
      if (nilai === undefined) {
        return reply.status(422).send({ error: 'Nilai konten wajib diisi.' })
      }

      const { data, error } = await request.db!
        .from('situs_konten')
        .upsert(
          { kunci: kunci.trim(), nilai, diperbarui: new Date().toISOString() },
          { onConflict: 'company_id,kunci' },
        )
        .select('kunci, nilai')
        .single()

      if (error) {
        request.log.error({ err: error, kunci }, 'gagal menyimpan konten situs')
        return reply.status(500).send({ error: 'Gagal menyimpan konten situs' })
      }

      await logAuditEvent(request, {
        action: 'situs.konten.simpan',
        entity: 'situs_konten',
        entityId: kunci,
      })

      return reply.send({ data })
    },
  )

  // ── GET /api/v1/situs/merek ────────────────────────────────────────────────
  app.get(
    '/api/v1/situs/merek',
    { preHandler: [authenticate, requirePermission('situs:view')] },
    async (request, reply) => {
      const { data, error } = await request.db!
        .from('situs_merek')
        .select('warna_utama, warna_aksen, logo_path')
        .maybeSingle()

      if (error) {
        request.log.error({ err: error }, 'gagal memuat merek situs')
        return reply.status(500).send({ error: 'Gagal memuat merek situs' })
      }
      return reply.send({ data })
    },
  )

  // ── PUT /api/v1/situs/merek ────────────────────────────────────────────────
  //
  // Kontras divalidasi DI SINI, bukan lewat CHECK constraint: baris DB tak tahu
  // latar mana dipakai peran mana. Kuning merek #FFD600 lulus 11,77:1 di navy
  // pekat dan gagal 1,41:1 di putih — verdikt butuh konteks, dan konteks itu
  // hanya ada di lapisan yang tahu halaman apa yang sedang dirender.
  app.put(
    '/api/v1/situs/merek',
    { preHandler: [authenticate, requirePermission('situs:manage')] },
    async (request, reply) => {
      const { warna_utama, warna_aksen, logo_path } = request.body as {
        warna_utama?: string
        warna_aksen?: string
        logo_path?: string | null
      }

      if (!warna_utama || !warna_aksen) {
        return reply
          .status(422)
          .send({ error: 'Warna utama dan warna aksen wajib diisi.' })
      }

      // Aksen diuji terhadap SELURUH latar landing. Gagal di salah satunya =
      // gagal: aksen yang hilang di satu latar tetap menghasilkan teks tak
      // terbaca di sebagian halaman.
      const gagalAksen = validasiAksen(warna_aksen).filter((h) => !h.lulus)
      if (gagalAksen.length > 0) {
        return reply.status(422).send({
          error: 'Warna aksen gagal syarat kontras.',
          detail: gagalAksen.map((h) => h.pesan),
        })
      }

      // Warna utama dipakai sebagai LATAR teks putih — arah pemeriksaannya
      // terbalik dari aksen, dan menukarnya menghasilkan verdikt yang salah.
      const utamaSebagaiLatar = validasiPasangan('#FFFFFF', warna_utama, 'teks')
      if (!utamaSebagaiLatar.lulus) {
        return reply.status(422).send({
          error: 'Warna utama gagal syarat kontras.',
          detail: [utamaSebagaiLatar.pesan],
        })
      }

      const { data, error } = await request.db!
        .from('situs_merek')
        .upsert(
          {
            warna_utama,
            warna_aksen,
            logo_path: logo_path ?? null,
            diperbarui: new Date().toISOString(),
          },
          { onConflict: 'company_id' },
        )
        .select('warna_utama, warna_aksen, logo_path')
        .single()

      if (error) {
        request.log.error({ err: error }, 'gagal menyimpan merek situs')
        return reply.status(500).send({ error: 'Gagal menyimpan merek situs' })
      }

      await logAuditEvent(request, {
        action: 'situs.merek.simpan',
        entity: 'situs_merek',
        entityId: data.warna_aksen,
      })

      return reply.send({ data })
    },
  )

  // ── GET /api/v1/situs/seksi ────────────────────────────────────────────────
  app.get(
    '/api/v1/situs/seksi',
    { preHandler: [authenticate, requirePermission('situs:view')] },
    async (request, reply) => {
      const { data, error } = await request.db!
        .from('situs_seksi')
        .select('kunci, aktif, urutan, varian')
        .order('urutan', { ascending: true })

      if (error) {
        request.log.error({ err: error }, 'gagal memuat seksi situs')
        return reply.status(500).send({ error: 'Gagal memuat seksi situs' })
      }
      return reply.send({ data: data ?? [] })
    },
  )

  // ── PATCH /api/v1/situs/seksi ──────────────────────────────────────────────
  app.patch(
    '/api/v1/situs/seksi',
    { preHandler: [authenticate, requirePermission('situs:manage')] },
    async (request, reply) => {
      const { kunci, aktif, urutan, varian } = request.body as {
        kunci?: string
        aktif?: boolean
        urutan?: number
        varian?: string
      }

      if (!kunci) {
        return reply.status(422).send({ error: 'Kunci seksi wajib diisi.' })
      }
      if (varian !== undefined && !VARIAN_SAH.includes(varian as never)) {
        return reply.status(422).send({
          error: `Varian "${varian}" tak dikenal. Pilih: ${VARIAN_SAH.join(', ')}.`,
        })
      }

      const perubahan: Record<string, unknown> = {}
      if (aktif !== undefined) perubahan.aktif = aktif
      if (urutan !== undefined) perubahan.urutan = urutan
      if (varian !== undefined) perubahan.varian = varian

      if (Object.keys(perubahan).length === 0) {
        return reply.status(422).send({ error: 'Tidak ada yang diubah.' })
      }

      const { data, error } = await request.db!
        .from('situs_seksi')
        .update(perubahan)
        .eq('kunci', kunci)
        .select('kunci, aktif, urutan, varian')

      if (error) {
        request.log.error({ err: error, kunci }, 'gagal memperbarui seksi situs')
        return reply.status(500).send({ error: 'Gagal memperbarui seksi situs' })
      }
      // Update yang tak mengenai baris mana pun BUKAN sukses. Tanpa cek ini,
      // salah ketik kunci membalas 200 dan admin mengira perubahannya tersimpan.
      if (!data || data.length === 0) {
        return reply.status(404).send({ error: `Seksi "${kunci}" tidak ada.` })
      }

      await logAuditEvent(request, {
        action: 'situs.seksi.ubah',
        entity: 'situs_seksi',
        entityId: kunci,
      })

      return reply.send({ data: data[0] })
    },
  )

  // ── POST /api/v1/situs/revalidate ─────────────────────────────────────────
  //
  // Memberi tahu situs publik bahwa kontennya berubah. Tanpa ini, pengunjung
  // tetap menerima HTML lama sampai jendela ISR 5 menit habis — dan admin yang
  // baru menyimpan mengira perubahannya tidak tersimpan.
  //
  // Balas 200 dengan `direvalidasi: false` bila belum dikonfigurasi, BUKAN
  // galat: situs publik boleh saja belum terpasang di lingkungan ini, dan
  // penyimpanan kontennya sendiri sudah berhasil.
  app.post(
    '/api/v1/situs/revalidate',
    { preHandler: [authenticate, requirePermission('situs:manage')] },
    async (request, reply) => {
      const url = process.env.SITUS_REVALIDATE_URL
      const rahasia = process.env.SITUS_REVALIDATE_SECRET

      if (!url || !rahasia) {
        request.log.warn('revalidate situs dilewati — URL/secret belum diset')
        return reply.send({ data: { direvalidasi: false, alasan: 'belum dikonfigurasi' } })
      }

      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'x-revalidate-secret': rahasia },
        })
        if (!r.ok) {
          request.log.error({ status: r.status }, 'revalidate situs ditolak')
          return reply.status(502).send({ error: 'Gagal menyegarkan situs publik' })
        }
      } catch (err) {
        request.log.error({ err }, 'revalidate situs tak terjangkau')
        return reply.status(502).send({ error: 'Situs publik tidak merespons' })
      }

      return reply.send({ data: { direvalidasi: true } })
    },
  )

  // ── GET /api/v1/public/situs ───────────────────────────────────────────────
  //
  // PENGECUALIAN BERNAMA (QUEUE.yaml:434): tanpa auth, field dibatasi, rate
  // limit. Mengikuti preseden `/api/v1/public/invoice/:id` di settings.ts.
  //
  // ⚠️ Memakai `supabase` mentah, BUKAN `request.db` — tak ada user, jadi tak
  // ada konteks tenant untuk disaring wrapper. Konsekuensinya: filter
  // `company_id` WAJIB eksplisit di SETIAP query di bawah. RLS tidak bisa
  // menolong di sini; `auth_company_id()` bernilai NULL tanpa sesi, sehingga
  // policy RESTRICTIVE justru menolak semuanya. Satu query yang lupa filter =
  // konten tenant lain terbit di halaman publik tenant ini.
  //
  // Daftar kolom sengaja ditulis satu per satu, bukan `select('*')`: `*` akan
  // ikut menerbitkan kolom apa pun yang ditambahkan seseorang di kemudian hari,
  // termasuk yang tak pernah dimaksudkan publik.
  app.get(
    '/api/v1/public/situs',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const companyId = process.env.SITUS_COMPANY_ID
      if (!companyId) {
        request.log.error('SITUS_COMPANY_ID belum diset — situs publik mati')
        return reply.status(503).send({ error: 'Situs belum dikonfigurasi' })
      }

      const [konten, kategori, media, milestone, legalitas, seksi, merek] =
        await Promise.all([
          supabase.from('situs_konten')
            .select('kunci, nilai').eq('company_id', companyId),
          supabase.from('situs_kategori')
            .select('id, kunci, judul, ringkasan, lokasi, lingkup, urutan')
            .eq('company_id', companyId).eq('tampil', true)
            .order('urutan', { ascending: true }),
          supabase.from('situs_media')
            .select('kategori_id, path_storage, alt, lebar, tinggi, urutan')
            .eq('company_id', companyId).eq('tampil', true)
            .order('urutan', { ascending: true }),
          supabase.from('situs_milestone')
            .select('tahun, judul, keterangan, urutan')
            .eq('company_id', companyId).eq('tampil', true)
            .order('urutan', { ascending: true }),
          supabase.from('situs_legalitas')
            .select('kode, judul, urutan')
            .eq('company_id', companyId).eq('tampil', true)
            .order('urutan', { ascending: true }),
          supabase.from('situs_seksi')
            .select('kunci, aktif, urutan, varian')
            .eq('company_id', companyId)
            .order('urutan', { ascending: true }),
          supabase.from('situs_merek')
            .select('warna_utama, warna_aksen, logo_path')
            .eq('company_id', companyId).maybeSingle(),
        ])

      // Tiap bagian diperiksa. Membiarkan satu error lewat menghasilkan halaman
      // yang kehilangan seksi tanpa ada yang tahu kenapa.
      for (const [nama, hasil] of Object.entries({
        konten, kategori, media, milestone, legalitas, seksi, merek,
      })) {
        if (hasil.error) {
          request.log.error(
            { err: hasil.error, bagian: nama },
            'gagal memuat bagian situs publik',
          )
          return reply.status(500).send({ error: 'Gagal memuat situs' })
        }
      }

      const petaKonten: Record<string, unknown> = {}
      for (const baris of konten.data ?? []) petaKonten[baris.kunci] = baris.nilai

      // Media ditempelkan ke kategorinya, lalu `id` dan `kategori_id` DIBUANG.
      // Keduanya uuid internal: klien tak memakainya, dan menerbitkannya cuma
      // memperbesar permukaan tebak-tebakan.
      const daftarKategori = (kategori.data ?? []).map(({ id, ...sisaKategori }) => ({
        ...sisaKategori,
        media: (media.data ?? [])
          .filter((m) => m.kategori_id === id)
          .map(({ kategori_id: _buang, ...sisaMedia }) => sisaMedia),
      }))

      return reply.send({
        data: {
          konten: petaKonten,
          kategori: daftarKategori,
          milestone: milestone.data ?? [],
          legalitas: legalitas.data ?? [],
          seksi: seksi.data ?? [],
          merek: merek.data ?? null,
        },
      })
    },
  )
}
