/**
 * POST /api/v1/ai/preview-setujui  — menyiapkan (tak mengubah apa pun)
 * POST /api/v1/ai/setujui          — memakai token, MENJALANKAN persetujuan
 *
 * ══════════════════════════════════════════════════════════════════════════
 * P-2 — PERMISSION YANG SAMA, DAN LEBIH
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Kedua rute menuntut `ai:setujui`. Itu BUKAN pengganti permission approval
 * aslinya — ia tambahan.
 *
 * Persetujuan sesungguhnya dijalankan lewat `request.server.inject` ke rute
 * dashboard, dengan token pemanggil apa adanya. Jadi `authenticate` dan
 * `canParticipateInChain` di rute itu tetap berjalan, dan orang yang tak
 * berhak menyetujui kasbon tetap ditolak — sekalipun ia punya `ai:setujui`.
 *
 * Urutan wewenangnya: `ai:setujui` menentukan boleh-tidaknya memakai JALUR
 * ini; rantai approval menentukan boleh-tidaknya menyetujui DOKUMEN itu.
 * Yang kedua tak pernah dilewati oleh yang pertama.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * P-5 — AUDIT MENANDAI KANAL, DAN PERCOBAAN TAK SAH TERCATAT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Tiap keputusan dicatat dengan `via` (web/wa) supaya pertanyaan "ini disetujui
 * dari mana?" punya jawaban. Yang GAGAL juga dicatat — token yang dipakai dua
 * kali, token orang lain, nominal melebihi plafon. Percobaan yang tak terlihat
 * berarti pola penyalahgunaan tak pernah muncul di mana pun.
 */

import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'
import {
  JENIS_DIDUKUNG,
  jalankanSetujui,
  klaimToken,
  siapkanPreview,
} from '../../lib/ai-setujui.js'

interface BadanPreview {
  jenis?: string
  entity_id?: string
  kanal?: string
}

interface BadanSetujui {
  token?: string
}

export default async function aiSetujuiRoutes(app: FastifyInstance) {
  // ── PREVIEW: menghitung, tidak mengubah ──────────────────────────────────
  app.post<{ Body: BadanPreview }>(
    '/api/v1/ai/preview-setujui',
    {
      preHandler: [authenticate, requirePermission('ai:setujui')],
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const jenis = (request.body?.jenis ?? '').trim()
      const entityId = (request.body?.entity_id ?? '').trim()
      // `via` punya kosakata baku (`utils/audit.ts`): 'ai_whatsapp', BUKAN 'wa'.
      // Memakai nama sendiri berarti satu kanal punya dua nama di jejak audit,
      // dan pencarian "apa saja yang disetujui lewat WhatsApp" melewatkan separuhnya.
      const kanal: 'web' | 'ai_whatsapp' =
        request.body?.kanal === 'wa' || request.body?.kanal === 'ai_whatsapp'
          ? 'ai_whatsapp'
          : 'web'

      if (!jenis || !entityId) {
        return reply.status(422).send({ error: 'jenis dan entity_id wajib diisi' })
      }

      const hasil = await siapkanPreview({
        db: request.db!,
        companyId: request.companyId!,
        userId: request.currentUser!.id,
        jenis,
        entityId,
        kanal,
      })

      if (!hasil.ok) {
        // P-5: penolakan preview ikut tercatat. Percobaan berulang atas dokumen
        // yang melebihi plafon adalah pola yang layak terlihat.
        void logAuditEvent(request, {
          tableName: 'ai_token_setujui',
          recordId: entityId,
          action: 'ai.preview.ditolak',
          actorId: request.currentUser!.id,
          newValues: { jenis, alasan: hasil.alasan, kanal },
          severity: hasil.alasan === 'melebihi_batas' ? 'critical' : 'warning',
          via: kanal,
        })
        const status = hasil.alasan === 'melebihi_batas' ? 403 : 422
        return reply.status(status).send({ error: hasil.pesan, alasan: hasil.alasan })
      }

      void logAuditEvent(request, {
        tableName: 'ai_token_setujui',
        recordId: hasil.entityId,
        action: 'ai.preview.terbit',
        actorId: request.currentUser!.id,
        // Token TIDAK ikut dicatat. Jejak audit dibaca banyak orang, dan token
        // di dalamnya berarti siapa pun yang bisa membaca audit bisa memakai
        // persetujuan yang belum diklaim.
        newValues: { jenis: hasil.jenis, nominal: hasil.nominal, kanal },
        severity: 'warning',
        via: kanal,
      })

      return reply.send({
        token: hasil.token,
        jenis: hasil.jenis,
        entity_id: hasil.entityId,
        label: hasil.label,
        // Infinity tak bisa diwakili JSON — ia jadi `null`. Tapi cabang ini
        // tak pernah tercapai: nominal tak diketahui SELALU melebihi batas dan
        // sudah ditolak di atas. Ditulis eksplisit supaya pembaca tak menduga
        // `null` di sini berarti "gratis".
        nominal: Number.isFinite(hasil.nominal) ? hasil.nominal : null,
        batas: hasil.batas,
        kedaluwarsa: hasil.kedaluwarsa,
        pesan:
          `Siap disetujui: ${hasil.label} senilai Rp ${hasil.nominal.toLocaleString('id-ID')}. ` +
          `Token berlaku 15 menit.`,
      })
    },
  )

  // ── SETUJUI: klaim token, lalu dispatch ke rute sungguhan ────────────────
  app.post<{ Body: BadanSetujui }>(
    '/api/v1/ai/setujui',
    {
      preHandler: [authenticate, requirePermission('ai:setujui')],
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const token = (request.body?.token ?? '').trim()
      if (!token) return reply.status(422).send({ error: 'token wajib diisi' })

      const klaim = await klaimToken({
        db: request.db!,
        userId: request.currentUser!.id,
        token,
      })

      if (!klaim.ok) {
        // P-5: percobaan tak sah TERCATAT. Token orang lain dan token yang
        // dipakai dua kali adalah dua hal yang pantas dilihat manusia.
        void logAuditEvent(request, {
          tableName: 'ai_token_setujui',
          // Token tak dipakai sebagai recordId — ia rahasia. Yang dicatat:
          // siapa yang mencoba, dan kenapa gagal.
          recordId: request.currentUser!.id,
          action: 'ai.setujui.ditolak',
          actorId: request.currentUser!.id,
          newValues: { alasan: klaim.alasan },
          severity: 'critical',
        })
        const status =
          klaim.alasan === 'token_sudah_dipakai'
            ? 409
            : klaim.alasan === 'melebihi_batas' || klaim.alasan === 'bukan_pemilik_token'
              ? 403
              : 410
        return reply.status(status).send({ error: klaim.pesan, alasan: klaim.alasan })
      }

      /*
       * Token SUDAH diklaim di titik ini, dan itu disengaja.
       *
       * Kalau rutenya menolak (saldo kurang, bukan gilirannya di rantai), token
       * tetap habis. Terdengar keras, tapi alternatifnya lebih buruk:
       * mengembalikan token yang gagal berarti ia bisa dicoba berulang kali,
       * dan itu persis pintu untuk mencoba-coba sampai satu percobaan lolos.
       *
       * Pengguna cukup meminta preview baru — ongkosnya satu pesan.
       */
      const eksekusi = await jalankanSetujui(request, klaim.jenis, klaim.entityId)

      void logAuditEvent(request, {
        tableName: 'ai_token_setujui',
        recordId: klaim.entityId,
        action: eksekusi.status < 400 ? 'ai.setujui.berhasil' : 'ai.setujui.gagal',
        actorId: request.currentUser!.id,
        newValues: {
          jenis: klaim.jenis,
          nominal: Number.isFinite(klaim.nominal) ? klaim.nominal : null,
          status_rute: eksekusi.status,
        },
        severity: 'critical',
      })

      return reply.status(eksekusi.status).send(
        eksekusi.status < 400
          ? { ok: true, jenis: klaim.jenis, entity_id: klaim.entityId, hasil: eksekusi.badan }
          : (eksekusi.badan ?? { error: 'Persetujuan ditolak oleh rutenya.' }),
      )
    },
  )

  // ── Jenis apa saja yang didukung — supaya UI tak menebak ─────────────────
  app.get(
    '/api/v1/ai/setujui/jenis',
    { preHandler: [authenticate, requirePermission('ai:setujui')] },
    async (_request, reply) => reply.send({ jenis: JENIS_DIDUKUNG }),
  )

  /*
   * ── PLAFON per pengguna — config-first ────────────────────────────────────
   *
   * CHARTER §7 / CLAUDE.md §8: "kolom DB sudah ada" BUKAN selesai. Tanpa
   * halaman pengaturannya, plafon hanya bisa diisi lewat SQL — dan gerbang
   * uang yang cuma bisa diatur lewat SQL tak akan pernah diatur.
   *
   * Permission-nya `settings:ai:batas`, BUKAN `ai:setujui`. Orang yang boleh
   * MEMAKAI plafonnya bukan orang yang boleh MENENTUKAN plafonnya sendiri —
   * kalau sama, siapa pun bisa menaikkan batasnya sendiri sebelum menyetujui.
   */
  app.get(
    '/api/v1/ai/batas-setujui',
    { preHandler: [authenticate, requirePermission('settings:ai:batas')] },
    async (request, reply) => {
      // Seluruh anggota ditampilkan, termasuk yang belum punya plafon —
      // daftar yang hanya memuat yang sudah diatur menyembunyikan justru
      // orang-orang yang perlu diputuskan.
      /*
       * `users!company_members_user_id_fkey` — FK-nya DISEBUT, bukan dibiarkan
       * ditebak.
       *
       * `company_members` punya DUA foreign key ke `users`: `user_id` dan
       * `created_by` (diukur dari information_schema, bukan diduga). Embed
       * `users(name, email)` tanpa nama FK karena itu AMBIGU, dan PostgREST
       * menolaknya.
       *
       * Yang membuat cacat ini pantas dicatat: gejalanya bukan galat di layar
       * melainkan DAFTAR KOSONG. Versi pertama route ini hanya mencatat error
       * ke log lalu tetap membalas 200 dengan `[]`, dan halamannya menampilkan
       * "Belum ada anggota perusahaan" — kalimat yang terbaca sebagai fakta,
       * padahal ada 26 anggota. Tangkapan layar yang menemukannya: tabel
       * kosong DAN toast merah muncul bersamaan, dua keadaan yang tak mungkin
       * benar sekaligus.
       */
      /*
       * `unsafe`, dengan alasan — `company_members` KATEGORI D.
       *
       * Wrapper menolak `.from('company_members')` dan menuntut alasan
       * tertulis. Penolakan itu benar: tabel ini keanggotaan lintas-tenant,
       * dan scoping otomatis akan salah untuk sebagian pemakaian.
       *
       * Tenancy DI SINI dijaga oleh `.eq('company_id', request.companyId!)`
       * di bawah — eksplisit, satu baris, terlihat. Tanpa itu halaman plafon
       * akan menampilkan anggota perusahaan lain, dan lebih buruk lagi
       * membiarkan plafon diberikan kepada mereka.
       *
       * Ditemukan lewat TANGKAPAN LAYAR, bukan log: halaman menampilkan
       * "Belum ada anggota perusahaan" DAN toast merah bersamaan — dua
       * keadaan yang tak mungkin benar sekaligus. `TenantDbError` yang
       * dilempar wrapper jadi 500 yang tak pernah muncul di log rute.
       */
      const { data: anggota, error } = await request.db!
        .unsafe('company_members', 'halaman plafon: disaring company_id eksplisit di baris berikut')
        .select('user_id, users!company_members_user_id_fkey(name, email), roles(name)')
        .eq('company_id', request.companyId!)

      if (error) {
        request.log.error({ err: error }, 'ai/batas: gagal membaca anggota')
        return reply.status(500).send({ error: 'Gagal membaca daftar anggota' })
      }

      /*
       * `error` ikut di-destructure, dan benar-benar dilihat.
       *
       * Tanpa ini, basis yang gagal dibaca menghasilkan daftar plafon KOSONG
       * yang tampak sah: setiap orang tampil "belum diatur", termasuk yang
       * plafonnya sudah disetel. Admin yang melihatnya akan menyetel ulang —
       * dan menimpa angka yang sebenarnya masih ada.
       */
      const { data: batas, error: errBatas } = await request.db!
        .from('ai_batas_setujui')
        .select('user_id, batas_idr')

      if (errBatas) {
        request.log.error({ err: errBatas }, 'ai/batas: gagal membaca plafon')
        return reply.status(500).send({ error: 'Gagal membaca plafon' })
      }

      const petaBatas = new Map(
        (batas as Array<{ user_id: string; batas_idr: string | null }>).map((b) => [
          b.user_id,
          b.batas_idr === null ? null : Number(b.batas_idr),
        ]),
      )

      const satu = <T,>(v: T | T[] | null | undefined): T | undefined =>
        Array.isArray(v) ? v[0] : (v ?? undefined)

      const baris = (anggota as Array<{
        user_id: string
        users?: { name?: string; email?: string } | Array<{ name?: string; email?: string }>
        roles?: { name?: string } | Array<{ name?: string }>
      }>).map((a) => ({
        user_id: a.user_id,
        nama: satu(a.users)?.name ?? '(tanpa nama)',
        email: satu(a.users)?.email ?? '',
        peran: satu(a.roles)?.name ?? '',
        // `null` di sini berarti BELUM DIATUR, dan di kode dibaca sebagai NOL.
        // Dibedakan dari 0 eksplisit supaya UI bisa mengatakan mana yang
        // sengaja dinolkan dan mana yang belum pernah disentuh.
        batas_idr: petaBatas.has(a.user_id) ? petaBatas.get(a.user_id)! : null,
        sudah_diatur: petaBatas.has(a.user_id),
      }))

      baris.sort((x, y) => x.nama.localeCompare(y.nama, 'id'))
      return reply.send({ data: baris })
    },
  )

  app.put<{ Body: { user_id?: string; batas_idr?: number | null } }>(
    '/api/v1/ai/batas-setujui',
    { preHandler: [authenticate, requirePermission('settings:ai:batas')] },
    async (request, reply) => {
      const userId = (request.body?.user_id ?? '').trim()
      const nilai = request.body?.batas_idr

      if (!userId) return reply.status(422).send({ error: 'user_id wajib diisi' })

      if (nilai !== null && nilai !== undefined) {
        // `Number.isFinite` menolak NaN dan Infinity sekaligus. Tanpa ini,
        // `parseFloat('abc')` → NaN → `numeric` Postgres MENERIMA NaN, dan
        // setiap perbandingan batas sesudahnya bernilai false — plafon jadi
        // tak terbatas tanpa ada yang mengetiknya. (Cacat yang sama pernah
        // membuat sum() seluruh laporan jadi NaN, 2026-08-08.)
        if (typeof nilai !== 'number' || !Number.isFinite(nilai) || nilai < 0) {
          return reply.status(422).send({ error: 'batas_idr harus angka >= 0, atau null' })
        }
      }

      // Anggota tenant ini saja. Tanpa pemeriksaan ini, plafon bisa diberikan
      // kepada user_id mana pun — termasuk milik perusahaan lain.
      // `unsafe` + saringan company_id EKSPLISIT — sama seperti GET di atas,
      // dan di sini saringan itu justru inti pemeriksaannya: tanpa `company_id`
      // seseorang bisa memberi plafon kepada anggota perusahaan LAIN.
      const { data: anggota } = await request.db!
        .unsafe('company_members', 'verifikasi keanggotaan: disaring company_id eksplisit')
        .select('user_id')
        .eq('company_id', request.companyId!)
        .eq('user_id', userId)
        .maybeSingle()

      if (!anggota) {
        return reply.status(404).send({ error: 'Pengguna bukan anggota perusahaan ini' })
      }

      const { error } = await request.db!
        .from('ai_batas_setujui')
        .upsert(
          {
            company_id: request.companyId!,
            user_id: userId,
            batas_idr: nilai ?? null,
            diperbarui_pada: new Date().toISOString(),
          },
          { onConflict: 'company_id,user_id' },
        )
        .select('user_id')

      if (error) {
        request.log.error({ err: error }, 'ai/batas: gagal menyimpan')
        return reply.status(500).send({ error: 'Gagal menyimpan plafon' })
      }

      // Perubahan plafon adalah perubahan gerbang uang — `critical`, dan
      // nilai lamanya ikut supaya penurunan/kenaikan bisa dibaca dari jejak.
      void logAuditEvent(request, {
        tableName: 'ai_batas_setujui',
        recordId: userId,
        action: 'ai.batas.ubah',
        actorId: request.currentUser!.id,
        newValues: { batas_idr: nilai ?? null },
        severity: 'critical',
      })

      return reply.send({ ok: true })
    },
  )
}
