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
      // Tanpa `?? []`: gerbang error di atas sudah menjamin data ada, dan
      // fallback di sini justru akan menyembunyikan kegagalan yang lolos.
      for (const baris of data) peta[baris.kunci] = baris.nilai
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

      void logAuditEvent(request, {
        tableName: 'situs_konten', recordId: kunci, action: 'situs.konten.simpan',
        actorId: request.currentUser!.id,
        newValues: data as Record<string, unknown>, severity: 'info',
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

      void logAuditEvent(request, {
        tableName: 'situs_merek', recordId: data.warna_aksen, action: 'situs.merek.simpan',
        actorId: request.currentUser!.id,
        newValues: data as Record<string, unknown>, severity: 'info',
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
      return reply.send({ data })
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

      void logAuditEvent(request, {
        tableName: 'situs_seksi', recordId: kunci, action: 'situs.seksi.ubah',
        actorId: request.currentUser!.id,
        newValues: data[0] as Record<string, unknown>, severity: 'info',
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

      /*
        ── Pagar test, dan kenapa TIDAK cukup bersandar pada env (2026-08-14)

        Saya sempat mendaftarkan berkas ini sebagai pengecualian di
        `audit-saluran-keluar-berpagar.mjs`, dengan alasan "tanpa
        SITUS_REVALIDATE_URL/SECRET ia pulang lebih dulu, dan kedua env itu tak
        ada di lingkungan test".

        Alasan itu SALAH. Diukur sesudahnya: keduanya terisi di `apps/api/.env`
        (36 dan 17 karakter), jadi penjaga env di atas tidak menahan apa pun di
        sini. Yang membuat aman hanyalah kebetulan — nol test memanggil rute
        revalidate hari ini.

        Kebetulan bukan pagar. Test pertama yang menyentuh rute ini akan
        memicu revalidate SUNGGUHAN ke situs produksi, dan tak ada satu pun
        gejala yang menunjuk ke sana.
      */
      if (process.env.NODE_ENV === 'test') {
        return reply.send({ data: { direvalidasi: false, alasan: 'dilewati di lingkungan test' } })
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

      // SATU pembacaan, bukan tujuh — lewat `v_situs_publik` (migrasi 210).
      //
      // Dulu tujuh query `supabase.from(...)` terpisah. Kodenya benar, tapi
      // `tenancy-ratchet.test.ts` merah: 373 vs `PLAFON_R011` 366, dan plafon
      // itu diratifikasi founder sebagai satu-satunya kenaikan (G-5).
      //
      // View memindahkan tiga hal ke lapisan SQL:
      //   • penyaringan `tampil`/`aktif` — dulu tiap query mengingatnya
      //     sendiri, dan satu yang lupa menerbitkan draf ke publik
      //   • daftar kolom yang boleh publik — kolom baru yang ditambahkan
      //     besok TIDAK ikut terbit
      //   • agregasinya, jadi satu perjalanan ke database
      //
      // Yang TETAP kewajiban di sini: `eq('company_id', …)`. View sengaja
      // mengembalikan satu baris PER COMPANY, bukan satu baris global —
      // "situs milik siapa" adalah keputusan aplikasi, bukan skema.
      const { data, error } = await supabase
        .from('v_situs_publik')
        .select('konten, kategori, media, milestone, legalitas, seksi, merek')
        .eq('company_id', companyId)
        .maybeSingle()

      if (error) {
        request.log.error({ err: error }, 'gagal memuat situs publik')
        return reply.status(500).send({ error: 'Gagal memuat situs' })
      }
      // `null` = company-nya tak ada atau tak aktif. Dibedakan dari galat:
      // yang ini konfigurasi salah, bukan basis bermasalah.
      if (!data) {
        request.log.error({ companyId }, 'SITUS_COMPANY_ID tak cocok company aktif mana pun')
        return reply.status(503).send({ error: 'Situs belum dikonfigurasi' })
      }

      const barisKategori = data.kategori as Array<{
        id: string
        kunci: string
        judul: string
        ringkasan: string | null
        lokasi: string | null
        lingkup: string | null
        urutan: number
      }>
      const barisMedia = data.media as Array<{
        kategori_id: string | null
        path_storage: string
        alt: string
        lebar: number
        tinggi: number
        urutan: number
      }>

      // Media ditempelkan ke kategorinya, lalu `id` dan `kategori_id` DIBUANG.
      // Keduanya uuid internal: klien tak memakainya, dan menerbitkannya cuma
      // memperbesar permukaan tebak-tebakan.
      const daftarKategori = barisKategori.map(({ id, ...sisaKategori }) => ({
        ...sisaKategori,
        media: barisMedia
          .filter((m) => m.kategori_id === id)
          .map(({ kategori_id: _buang, ...sisaMedia }) => sisaMedia),
      }))

      return reply.send({
        data: {
          konten: data.konten,
          kategori: daftarKategori,
          milestone: data.milestone,
          legalitas: data.legalitas,
          seksi: data.seksi,
          merek: data.merek,
        },
      })
    },
  )

  /**
   * GET /api/v1/public/merek — logo & nama perusahaan untuk FAVICON.
   *
   * Founder 2026-08-09: *"saya minta favicon nya ganti dengan logo yg
   * diupload perusahaan"*.
   *
   * ── Kenapa publik, padahal favicon dipakai orang yang sudah login
   *
   * Favicon diminta peramban SEBELUM aplikasi memuat token — ia bagian dari
   * dokumen HTML, bukan dari kode yang berjalan sesudah login. Endpoint
   * ber-auth akan membalas 401 dan tab-nya kosong.
   *
   * Yang diterbitkan hanya dua hal yang memang sudah publik: logo (URL-nya
   * ada di halaman situs perusahaan) dan nama badan usaha (tercetak di
   * setiap invoice). Tak ada satu pun data operasional.
   *
   * ── Kolom ditulis satu per satu, bukan `select('*')`
   *
   * Alasan yang sama dengan `/api/v1/public/situs` di atas: `*` akan ikut
   * menerbitkan kolom apa pun yang ditambahkan seseorang kelak — termasuk
   * yang tak pernah dimaksudkan publik.
   */
  app.get(
    '/api/v1/public/merek',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const companyId = process.env.SITUS_COMPANY_ID
      if (!companyId) {
        // BUKAN 503. Favicon yang gagal tak boleh membuat tab kosong —
        // lebih baik klien memakai inisial cadangannya.
        return reply.send({ logo_url: null, nama: 'Puraloka' })
      }

      const { data, error } = await supabase
        .from('companies')
        .select('name, logo_url')
        .eq('id', companyId)
        .maybeSingle()

      if (error) {
        request.log.error({ err: error }, 'gagal memuat merek untuk favicon')
        return reply.send({ logo_url: null, nama: 'Puraloka' })
      }

      return reply.send({
        logo_url: data?.logo_url ?? null,
        nama: data?.name ?? 'Puraloka',
      })
    },
  )
}
