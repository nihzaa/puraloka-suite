import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'
import { periksaKelayakan } from '../../lib/gerbang-kelayakan.js'

/**
 * MITRA — satu identitas, banyak peran, dua BENTUK.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA MODUL INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Founder menjawab R-017 pada 2026-08-19. Saya bertanya *"subkon itu
 * perusahaan ATAU orang?"* dan jawabannya menolak pilihan itu: **bisa
 * dua-duanya**. Pertanyaan sayalah yang salah — praktik konstruksi Indonesia
 * memang campuran: mandor borongan diikat ORANGNYA, spesialis ME/lift
 * diikat BADAN USAHANYA.
 *
 * ── Cacat yang ditutup, DIUKUR bukan diduga
 *
 * Sampai migrasi 461, identitas mitra terpecah tiga tabel yang tak saling
 * mengenal. Yang membuatnya berbahaya bukan kerapian melainkan **gerbang
 * kelayakan yang cuma menutup satu pintu**. Diukur 2026-08-19:
 *
 *   evaluasi_subkon.supplier_id       → suppliers   (5 evaluasi)
 *   prakualifikasi_vendor.supplier_id → suppliers   (5 prakualifikasi)
 *   penawaran_subkon.worker_id        → workers     (8 penawaran)
 *
 * Kedelapan penawaran tender datang lewat `workers`, sementara penanda
 * daftar hitam hanya bisa menunjuk `suppliers` — dan rute tendernya tak
 * memeriksanya sama sekali.
 *
 * ── Kenapa daftar hitam punya endpoint SENDIRI
 *
 * Mem-blacklist bukan "menyunting mitra". Ia keputusan yang menghentikan
 * seseorang mencari nafkah dari perusahaan ini, dan CHARTER menuntut
 * keputusan semacam itu punya jejak. Menyatukannya ke PATCH umum berarti ia
 * bisa berubah sebagai efek samping penyuntingan nomor telepon — dan
 * jejaknya tercatat sebagai "mitra diperbarui".
 */

/** Kolom yang dibaca layar. `statements` dsb sengaja tak ikut. */
const KOLOM = 'id, bentuk, nama, npwp, bentuk_badan, telepon, email, alamat, '
  + 'catatan, daftar_hitam, alasan_daftar_hitam, daftar_hitam_sejak, aktif, created_at'

export default async function mitraRoutes(app: FastifyInstance) {
  // ── GET /api/v1/mitra ─────────────────────────────────────────────────────
  app.get('/api/v1/mitra', {
    preHandler: [authenticate, requirePermission('mitra:view')],
  }, async (request, reply) => {
    const { bentuk, search, status } = request.query as Record<string, string>

    let q = request.db!.from('mitra').select(KOLOM).order('nama')

    if (bentuk === 'orang' || bentuk === 'badan_usaha') q = q.eq('bentuk', bentuk)
    if (status === 'aktif') q = q.eq('aktif', true)
    else if (status === 'nonaktif') q = q.eq('aktif', false)
    else if (status === 'hitam') q = q.eq('daftar_hitam', true)
    if (search) q = q.ilike('nama', `%${search}%`)

    const { data, error } = await q
    if (error) return reply.status(500).send({ error: error.message })

    const baris = (data ?? []) as unknown as Record<string, unknown>[]
    return reply.send({
      mitra: baris,
      // Ringkasan ikut supaya layar tak perlu menghitung sendiri dari halaman
      // yang mungkin terpotong — dan angka daftar hitam adalah yang paling
      // salah kalau dihitung dari sebagian data.
      ringkasan: {
        total: baris.length,
        orang: baris.filter((m) => m.bentuk === 'orang').length,
        badan_usaha: baris.filter((m) => m.bentuk === 'badan_usaha').length,
        daftar_hitam: baris.filter((m) => m.daftar_hitam === true).length,
      },
    })
  })

  // ── GET /api/v1/mitra/:id ─────────────────────────────────────────────────
  // Termasuk PERAN yang ia pegang. Itu inti tabel ini: satu identitas yang
  // memperlihatkan semua pintu yang ia lewati.
  app.get<{ Params: { id: string } }>('/api/v1/mitra/:id', {
    preHandler: [authenticate, requirePermission('mitra:view')],
  }, async (request, reply) => {
    const db = request.db!
    const { data: mitra, error } = await db
      .from('mitra').select(KOLOM).eq('id', request.params.id).maybeSingle()
    if (error) return reply.status(500).send({ error: error.message })
    if (!mitra) return reply.status(404).send({ error: 'Mitra tidak ditemukan' })

    const [w, s] = await Promise.all([
      db.from('workers').select('id, name, is_active').eq('mitra_id', request.params.id),
      db.from('suppliers').select('id, name, code, is_active').eq('mitra_id', request.params.id),
    ])

    /*
      Diperiksa SATU PER SATU dan disebut namanya (`w.error`, `s.error`),
      bukan lewat perulangan `for (const r of [w, s])`.

      Bentuk perulangan BENAR secara logika, tapi `audit-kegagalan-senyap.mjs`
      tak bisa melihatnya: ia mencari `<v>.error` secara harfiah, dan
      perulangan menyembunyikan nama variabelnya di balik `r`.

      Menuliskannya harfiah bukan sekadar menyenangkan penjaga. Peran yang
      gagal dibaca lalu jatuh ke `?? []` menampilkan "mitra ini tak memegang
      peran apa pun" — kalimat yang terbaca seperti FAKTA, dan yang membacanya
      bisa menyimpulkan bahwa aman menghapus identitas ini.
    */
    if (w.error) return reply.status(500).send({ error: w.error.message })
    if (s.error) return reply.status(500).send({ error: s.error.message })

    return reply.send({
      mitra,
      peran: {
        sebagai_tukang: w.data ?? [],
        sebagai_pemasok: s.data ?? [],
      },
      kelayakan: periksaKelayakan(mitra as never),
    })
  })

  // ── POST /api/v1/mitra ────────────────────────────────────────────────────
  app.post('/api/v1/mitra', {
    preHandler: [authenticate, requirePermission('mitra:manage')],
  }, async (request, reply) => {
    const b = request.body as Record<string, string | undefined>
    const nama = (b.nama ?? '').trim()
    const bentuk = b.bentuk

    if (!nama) return reply.status(400).send({ error: 'Nama mitra wajib diisi' })
    if (bentuk !== 'orang' && bentuk !== 'badan_usaha') {
      return reply.status(400).send({
        error: 'Bentuk wajib "orang" atau "badan_usaha" — mandor borongan diikat orangnya, '
          + 'spesialis diikat badan usahanya',
      })
    }
    const bentukBadan = (b.bentuk_badan ?? '').trim()
    if (bentuk === 'badan_usaha' && !bentukBadan) {
      // Dijaga CHECK basis juga, tapi galat constraint berbunyi seperti
      // kerusakan sistem. Ditolak di sini dengan kalimat yang bisa ditindak.
      return reply.status(400).send({
        error: 'Badan usaha wajib menyebut bentuknya (PT / CV / UD / Firma) — '
          + 'kop surat dan kontrak akan salah sebut tanpa itu',
      })
    }

    const { data, error } = await request.db!
      .from('mitra')
      .insert({
        bentuk, nama,
        npwp: (b.npwp ?? '').trim() || null,
        bentuk_badan: bentuk === 'badan_usaha' ? bentukBadan : null,
        telepon: (b.telepon ?? '').trim() || null,
        email: (b.email ?? '').trim() || null,
        alamat: (b.alamat ?? '').trim() || null,
        catatan: (b.catatan ?? '').trim() || null,
        created_by: request.currentUser!.id,
      })
      .select(KOLOM)
      .single()

    if (error) {
      if (error.code === '23505') {
        return reply.status(409).send({
          error: `Sudah ada mitra bernama "${nama}" dengan bentuk yang sama. `
            + 'Pakai yang ada — identitas kembar membuat daftar hitam hanya menutup salah satunya.',
        })
      }
      return reply.status(500).send({ error: error.message })
    }

    await logAuditEvent(request, {
      tableName: 'mitra',
      recordId: (data as unknown as { id: string }).id,
      action: 'create',
      actorId: request.currentUser!.id,
      newValues: { nama, bentuk },
    })
    return reply.status(201).send({ mitra: data })
  })

  // ── PATCH /api/v1/mitra/:id ───────────────────────────────────────────────
  //
  // ⚠ TIDAK bisa mengubah `daftar_hitam`. Itu keputusan tersendiri dengan
  // endpoint tersendiri — lihat alasannya di kepala berkas.
  app.patch<{ Params: { id: string } }>('/api/v1/mitra/:id', {
    preHandler: [authenticate, requirePermission('mitra:manage')],
  }, async (request, reply) => {
    const b = request.body as Record<string, unknown>
    const tambalan: Record<string, unknown> = { updated_at: new Date().toISOString() }

    // `undefined` (tak dikirim) DIBEDAKAN dari `null` (sengaja dikosongkan).
    // Tanpa pembedaan itu, menyunting nomor telepon akan menghapus alamat.
    for (const k of ['nama', 'npwp', 'bentuk_badan', 'telepon', 'email', 'alamat', 'catatan']) {
      if (b[k] === undefined) continue
      const v = b[k] === null ? null : String(b[k]).trim() || null
      tambalan[k] = v
    }
    if (b.aktif !== undefined) tambalan.aktif = b.aktif === true

    if (tambalan.nama === null || tambalan.nama === '') {
      return reply.status(400).send({ error: 'Nama mitra tak boleh dikosongkan' })
    }

    const { data, error } = await request.db!
      .from('mitra').update(tambalan).eq('id', request.params.id).select(KOLOM).maybeSingle()
    if (error) {
      if (error.code === '23505') {
        return reply.status(409).send({ error: 'Sudah ada mitra bernama itu dengan bentuk yang sama' })
      }
      if (error.code === '23514') {
        return reply.status(400).send({
          error: 'Badan usaha wajib punya bentuk badan, dan orang tak boleh punya bentuk badan',
        })
      }
      return reply.status(500).send({ error: error.message })
    }
    if (!data) return reply.status(404).send({ error: 'Mitra tidak ditemukan' })

    await logAuditEvent(request, {
      tableName: 'mitra',
      recordId: request.params.id,
      action: 'update',
      actorId: request.currentUser!.id,
      newValues: tambalan,
    })
    return reply.send({ mitra: data })
  })

  // ── PATCH /api/v1/mitra/:id/daftar-hitam ──────────────────────────────────
  //
  // Endpoint TERSENDIRI karena ini keputusan, bukan penyuntingan. Lihat
  // alasannya di kepala berkas.
  app.patch<{ Params: { id: string } }>('/api/v1/mitra/:id/daftar-hitam', {
    preHandler: [authenticate, requirePermission('mitra:daftar_hitam')],
  }, async (request, reply) => {
    const b = request.body as { daftar_hitam?: boolean; alasan?: string }
    const masuk = b.daftar_hitam === true
    const alasan = (b.alasan ?? '').trim()

    if (masuk && alasan.length < 10) {
      // Ambang 10 huruf, bukan sekadar "tak kosong". "ok" atau "-" memenuhi
      // syarat basis tetapi tak memberitahu apa pun kepada orang yang
      // meninjaunya enam bulan lagi — dan blacklist tanpa sebab yang bisa
      // dibaca jadi hukuman seumur hidup.
      return reply.status(400).send({
        error: 'Alasan daftar hitam wajib diisi minimal 10 huruf. Tanpa sebab yang bisa '
          + 'dibaca, keputusan ini tak bisa ditinjau ulang maupun dicabut oleh siapa pun '
          + 'yang tak ada saat itu.',
      })
    }

    const { data, error } = await request.db!
      .from('mitra')
      .update({
        daftar_hitam: masuk,
        // Alasan DIHAPUS saat dicabut. Membiarkannya membuat mitra bersih
        // tetap membawa kalimat tuduhan di datanya.
        alasan_daftar_hitam: masuk ? alasan : null,
        daftar_hitam_sejak: masuk ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', request.params.id)
      // Status LAMA ikut di WHERE — dua orang yang memutuskan berlawanan pada
      // saat yang sama tak boleh saling menimpa diam-diam.
      .eq('daftar_hitam', !masuk)
      .select(KOLOM)
      .maybeSingle()

    if (error) return reply.status(500).send({ error: error.message })
    if (!data) {
      // Bisa berarti tak ada, bisa berarti sudah berstatus itu. Dibedakan,
      // karena "sudah di daftar hitam" bukan kegagalan yang perlu ditakuti.
      // `error` DIPERIKSA — dan itu bukan formalitas.
      //
      // Query yang gagal memulangkan `data: null`, dan tanpa pemeriksaan ini
      // rutenya menjawab "Mitra tidak ditemukan": menuduh DATA yang hilang
      // untuk kegagalan BASIS. Orang lalu mencari mitra yang sebenarnya ada.
      const { data: ada, error: eAda } = await request.db!
        .from('mitra').select('id, daftar_hitam').eq('id', request.params.id).maybeSingle()
      if (eAda) return reply.status(500).send({ error: eAda.message })
      if (!ada) return reply.status(404).send({ error: 'Mitra tidak ditemukan' })
      return reply.status(409).send({
        error: masuk ? 'Mitra ini sudah ada di daftar hitam' : 'Mitra ini tidak di daftar hitam',
      })
    }

    // `severity` dinaikkan: ini bukan penyuntingan biasa. Keputusan yang
    // menghentikan sebuah pihak berbisnis dengan perusahaan ini harus mudah
    // ditemukan di antara ribuan baris jejak "mitra diperbarui".
    await logAuditEvent(request, {
      tableName: 'mitra',
      recordId: request.params.id,
      action: masuk ? 'blacklist' : 'unblacklist',
      actorId: request.currentUser!.id,
      newValues: { daftar_hitam: masuk, alasan: masuk ? alasan : null },
      severity: 'critical',
      reason: masuk ? alasan : 'daftar hitam dicabut',
    })
    return reply.send({ mitra: data, kelayakan: periksaKelayakan(data as never) })
  })
}
