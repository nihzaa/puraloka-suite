/**
 * KEAMANAN AKUN — MFA (TOTP), sesi aktif, dan riwayat masuk.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA MFA LEWAT SUPABASE, BUKAN DIBANGUN SENDIRI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * TJS membangun TOTP-nya sendiri: rahasia disimpan di tabel aplikasi, kode
 * cadangan di-hash sendiri, verifikasi dihitung sendiri. Itu masuk akal di
 * sana karena auth-nya memang milik sendiri.
 *
 * Di sini tidak. Diukur 2026-08-11, Supabase sudah menyediakan seluruhnya:
 *
 *     auth.mfa_factors      faktor terdaftar per pengguna
 *     auth.mfa_challenges   tantangan yang sedang berjalan
 *     auth.mfa_amr_claims   bukti metode apa yang dipakai saat masuk
 *
 * Menulis ulang kripto TOTP di atas basis yang SUDAH punya tabelnya bukan
 * kemandirian, melainkan permukaan serangan kedua yang harus dijaga sendiri —
 * dan rahasia TOTP yang salah simpan setara dengan tak punya MFA sama sekali.
 *
 * ── Konsekuensinya: rute ini TIDAK memegang rahasia apa pun
 *
 * Seluruh alur (daftar faktor, tantangan, verifikasi) dijalankan Supabase
 * memakai **access token milik pengguna itu sendiri**, bukan service role.
 * Itu disengaja dan penting: dengan service role, siapa pun yang bisa
 * memanggil rute ini bisa mendaftarkan faktor MFA untuk akun ORANG LAIN.
 *
 * Karena itu tiap handler membuat klien sekali-pakai dari token pemanggil.
 * `utils/supabase.ts` sengaja tidak dipakai di jalur MFA.
 *
 * ── Sesi & riwayat: baca-saja, dan hanya milik sendiri
 *
 * `auth.sessions` dan `auth.audit_log_entries` adalah skema `auth`, bukan
 * `public` — `request.db` (sadar tenant) tak menjangkaunya. Dipakai service
 * role dengan saringan `user_id` yang DIPAKU ke pemanggil, bukan diambil dari
 * parameter. Parameter yang menentukan akun siapa yang dibaca adalah cara
 * paling langsung membuat kebocoran lintas-akun.
 */

import { FastifyInstance, FastifyRequest } from 'fastify'
import { createClient } from '@supabase/supabase-js'
import { authenticate } from '../../plugins/auth.js'

/**
 * Klien Supabase yang bertindak SEBAGAI pemanggil.
 *
 * Tokennya diambil ulang dari request dengan cara yang sama seperti
 * `plugins/auth.ts` — tidak diubah supaya plugin yang dipakai seluruh
 * aplikasi tak perlu disentuh demi satu modul.
 */
function klienSebagaiPengguna(request: FastifyRequest) {
  const authHeader = request.headers.authorization
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.replace('Bearer ', '')
    : request.cookies?.puraloka_token

  if (!token) return null

  // `PUBLISHABLE_KEY`, bukan `SECRET_KEY`. Kunci publik + Authorization header
  // membuat Supabase memperlakukan panggilan ini SEBAGAI pemanggil; kunci
  // rahasia akan melewati batas itu dan membuat rute ini bisa mendaftarkan
  // faktor MFA untuk akun orang lain.
  //
  // Nama variabelnya diperiksa ke `apps/api/.env`, bukan ditebak dari
  // konvensi Supabase — repo ini memakai PUBLISHABLE/SECRET, bukan
  // ANON/SERVICE_ROLE.
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    },
  )
}

export default async function keamananRoutes(app: FastifyInstance) {
  /**
   * GET /api/v1/keamanan/status — apakah akun ini punya MFA, sesi apa saja
   * yang hidup, dan sepuluh peristiwa masuk terakhir.
   *
   * Satu panggilan, bukan tiga: halaman ini menampilkan ketiganya bersamaan,
   * dan tiga permintaan terpisah membuat bagian-bagiannya muncul berurutan
   * seperti halaman yang tersendat.
   */
  app.get('/api/v1/keamanan/status', { preHandler: [authenticate] }, async (request, reply) => {
    const authId = request.currentUser!.auth_id

    const klien = klienSebagaiPengguna(request)
    if (!klien) return reply.status(401).send({ error: 'Token tidak ditemukan' })

    const { data: faktor, error: galatFaktor } = await klien.auth.mfa.listFactors()
    if (galatFaktor) {
      request.log.error({ err: galatFaktor }, 'gagal membaca faktor MFA')
      return reply.status(502).send({ error: 'Status MFA tidak bisa dibaca' })
    }

    // ── Kenapa RPC, bukan `.schema('auth').from(...)`
    //
    // Percobaan pertama membaca `auth.sessions` langsung lewat PostgREST dan
    // GAGAL — diuji, bukan diperkirakan:
    //
    //     Invalid schema: auth
    //     Only the following schemas are exposed: public, graphql_public
    //
    // PostgREST memang tidak mengekspos `auth`, dan itu benar: membukanya
    // membuat seluruh tabel kredensial terjangkau lewat REST. Jalannya adalah
    // fungsi SECURITY DEFINER di `public` (migrasi 277), yang memberi akses
    // sama sempitnya tanpa menambah kredensial basis di proses API.
    //
    // ── Kenapa `request.db.raw`, bukan `supabase` yang diimpor langsung
    //
    // `audit-gerbang-tenancy` menandai rute yang menyentuh `supabase` mentah
    // tanpa saringan tenant — dan ia BENAR menandai versi pertama berkas ini.
    // Bukan karena datanya milik perusahaan lain (bukan), melainkan karena
    // dari kode TypeScript-nya saja tak ada yang menunjukkan batasnya.
    //
    // `db.raw` adalah pintu yang memang disediakan untuk `.rpc()` (lihat
    // `utils/tenant-db.ts`), dan memakainya menyatakan rute ini sadar-tenant
    // alih-alih melewati mekanismenya. Batas sesungguhnya tetap `p_user_id`
    // yang DIPAKU ke pemanggil — tak pernah dari parameter HTTP.
    const { data: sesi, error: galatSesi } = await request.db!.raw.rpc('keamanan_sesi', {
      p_user_id: authId,
    })

    if (galatSesi) {
      request.log.error({ err: galatSesi }, 'gagal membaca sesi')
      return reply.status(502).send({ error: 'Daftar sesi tidak bisa dibaca' })
    }

    const { data: riwayat, error: galatRiwayat } = await request.db!.raw.rpc(
      'keamanan_riwayat_masuk',
      { p_user_id: authId },
    )

    if (galatRiwayat) {
      request.log.error({ err: galatRiwayat }, 'gagal membaca riwayat masuk')
      return reply.status(502).send({ error: 'Riwayat masuk tidak bisa dibaca' })
    }

    return reply.send({
      mfa: {
        aktif: (faktor?.totp ?? []).some((f) => f.status === 'verified'),
        faktor: (faktor?.totp ?? []).map((f) => ({
          id: f.id,
          nama: f.friendly_name ?? null,
          status: f.status,
          dibuat: f.created_at,
        })),
      },
      // Bentuknya sudah berbahasa Indonesia dari fungsinya (migrasi 277) —
      // tak ada pemetaan ulang di sini, jadi tak ada tempat untuk dua nama
      // kolom yang pelan-pelan berbeda.
      sesi: sesi ?? [],
      riwayat: riwayat ?? [],

      /**
       * Apakah riwayat masuk memang DICATAT di proyek ini.
       *
       * Diukur 2026-08-11: `auth.audit_log_entries` **kosong seluruhnya** —
       * nol baris, bukan nol baris untuk pengguna ini. Supabase mencatat audit
       * hanya bila fiturnya dinyalakan di proyek, dan di sini tidak. Login
       * aplikasi pun tak dicatat ke `audit_logs`; yang ada hanya
       * `users.last_login_at` yang DITIMPA tiap kali masuk.
       *
       * Tanpa penanda ini, halaman menampilkan daftar kosong yang tak bisa
       * dibedakan dari "fitur rusak" atau "Anda belum pernah masuk" — dan
       * keduanya salah. Kekosongan yang punya sebab harus MENYEBUTKAN
       * sebabnya.
       */
      riwayat_tersedia: (riwayat ?? []).length > 0,
    })
  })

  /**
   * POST /api/v1/keamanan/mfa/daftar — mulai pendaftaran faktor TOTP.
   *
   * Mengembalikan URI otpauth dan rahasianya. QR-nya digambar DI PERAMBAN,
   * bukan di server: mengirim gambar QR berarti rahasianya melewati satu
   * lapisan lagi tanpa alasan.
   *
   * Faktor yang baru didaftarkan berstatus `unverified` sampai kode pertama
   * dimasukkan — jadi memanggil rute ini saja TIDAK mengunci akun siapa pun.
   */
  app.post('/api/v1/keamanan/mfa/daftar', { preHandler: [authenticate] }, async (request, reply) => {
    const klien = klienSebagaiPengguna(request)
    if (!klien) return reply.status(401).send({ error: 'Token tidak ditemukan' })

    // Faktor `unverified` yang menumpuk dari percobaan yang ditinggalkan
    // membuat daftar penuh sampah dan pendaftaran berikutnya DITOLAK Supabase.
    // Dibersihkan lebih dulu — yang `verified` TIDAK disentuh.
    //
    // `listFactors()` hanya mengembalikan yang sudah terverifikasi pada
    // sebagian versi klien, jadi `all` dipakai bila tersedia. Diuji: tanpa ini
    // faktor `unverified` dari percobaan sebelumnya tetap tinggal dan
    // pendaftaran kedua gagal.
    const { data: adaFaktor } = await klien.auth.mfa.listFactors()
    const semua = adaFaktor?.all ?? adaFaktor?.totp ?? []
    for (const f of semua) {
      if (f.status !== 'verified') await klien.auth.mfa.unenroll({ factorId: f.id })
    }

    // ── Kenapa nama faktor memakai jam-menit-detik, bukan tanggal saja
    //
    // Versi pertama memakai `toISOString().slice(0, 10)` — hanya tanggal. Uji
    // alur nyata langsung menolaknya:
    //
    //     A factor with the friendly name "Puraloka 2026-08-10" already exists
    //
    // Supabase menuntut `friendly_name` unik per pengguna, jadi PERCOBAAN
    // KEDUA DI HARI YANG SAMA selalu gagal. Itu justru jalur paling umum:
    // orang memindai QR, salah memasukkan kode, menutup halaman, lalu mencoba
    // lagi. Cacat yang hanya muncul pada percobaan kedua adalah cacat yang
    // lolos dari uji sekali-jalan.
    const cap = new Date().toISOString().slice(0, 19).replace('T', ' ')

    const { data, error } = await klien.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: `Puraloka ${cap}`,
    })

    if (error) {
      request.log.error({ err: error }, 'gagal mendaftarkan faktor MFA')
      return reply.status(400).send({ error: error.message })
    }

    return reply.send({
      faktor_id: data.id,
      rahasia: data.totp.secret,
      uri: data.totp.uri,
    })
  })

  /**
   * POST /api/v1/keamanan/mfa/verifikasi — buktikan kodenya benar.
   *
   * Inilah yang mengaktifkan MFA. Sebelum langkah ini faktornya ada tetapi
   * tak berlaku — penting supaya orang yang salah memindai QR tidak terkunci
   * di luar akunnya sendiri.
   */
  app.post('/api/v1/keamanan/mfa/verifikasi', { preHandler: [authenticate] }, async (request, reply) => {
    const { faktor_id, kode } = (request.body ?? {}) as { faktor_id?: string; kode?: string }
    if (!faktor_id || !kode) {
      return reply.status(400).send({ error: 'faktor_id dan kode wajib diisi' })
    }

    const klien = klienSebagaiPengguna(request)
    if (!klien) return reply.status(401).send({ error: 'Token tidak ditemukan' })

    const { data: tantangan, error: galatTantangan } = await klien.auth.mfa.challenge({
      factorId: faktor_id,
    })
    if (galatTantangan) {
      request.log.error({ err: galatTantangan }, 'gagal membuat tantangan MFA')
      return reply.status(400).send({ error: galatTantangan.message })
    }

    const { error: galatVerif } = await klien.auth.mfa.verify({
      factorId: faktor_id,
      challengeId: tantangan.id,
      code: kode,
    })

    if (galatVerif) {
      // Pesan Supabase untuk kode salah cukup jelas; diteruskan apa adanya
      // supaya orang tahu bedanya "kode salah" dan "waktu perangkat meleset".
      return reply.status(400).send({ error: galatVerif.message })
    }

    request.log.info({ userId: request.currentUser!.id }, 'MFA diaktifkan')
    return reply.send({ ok: true })
  })

  /**
   * DELETE /api/v1/keamanan/mfa/:faktorId — matikan MFA.
   *
   * Tidak menuntut kode lagi: pemanggil SUDAH terbukti memegang sesi yang sah,
   * dan menuntut kode dari perangkat yang mungkin hilang justru mengunci orang
   * di luar akunnya. Yang hilang perangkatnya adalah alasan paling umum
   * seseorang membuka halaman ini.
   */
  app.delete<{ Params: { faktorId: string } }>(
    '/api/v1/keamanan/mfa/:faktorId',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const klien = klienSebagaiPengguna(request)
      if (!klien) return reply.status(401).send({ error: 'Token tidak ditemukan' })

      const { error } = await klien.auth.mfa.unenroll({ factorId: request.params.faktorId })
      if (error) {
        request.log.error({ err: error }, 'gagal menonaktifkan MFA')
        return reply.status(400).send({ error: error.message })
      }

      request.log.warn({ userId: request.currentUser!.id }, 'MFA dinonaktifkan')
      return reply.send({ ok: true })
    },
  )
}
