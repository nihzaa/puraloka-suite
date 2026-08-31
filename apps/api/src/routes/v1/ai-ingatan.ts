/**
 * INGATAN ASISTEN — melihat, mengisi, menyunting, menghapus.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * DUA JALAN MASUK, KEDUANYA DIMINTA FOUNDER (2026-08-15)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Founder memilih **dua-duanya, bukan salah satu**:
 *
 *   1. asisten MENGUSULKAN → manusia menekan tombol   (pola token, `ai-tulis`)
 *   2. halaman untuk MENGISI SENDIRI                   (rute CRUD di sini)
 *
 * Yang pertama menahan prompt injection secara STRUKTURAL: kalimat di dalam
 * dokumen bisa membujuk model mengusulkan apa pun, tetapi tak bisa menekan
 * tombol. Yang kedua memastikan ingatannya benar-benar bisa terisi — kolom
 * yang hanya bisa diisi lewat percakapan akan bernasib sama dengan kolom
 * retensi yang dulu tak pernah menghapus apa pun.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA `ai:ingatan:kelola` DIPISAH DARI `ai:chat`
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Ingatan BERSAMA dibaca semua orang yang berizin. Memberi seseorang akses
 * asisten tak boleh diam-diam memberinya kuasa mengubah apa yang diingat
 * seluruh perusahaan — alasan yang sama memisahkan `ai:tulis` dari `ai:chat`
 * (migrasi 269).
 *
 * Ingatan PRIBADI adalah pengecualian: ia milik orangnya sendiri, jadi cukup
 * `ai:ingatan:lihat`. Menuntut izin kelola untuk mengubah catatan tentang
 * diri sendiri berarti hampir tak seorang pun bisa memakainya.
 */

import type { FastifyInstance } from 'fastify'
import { randomBytes } from 'node:crypto'
import { authenticate, requirePermission, hasPermission } from '../../plugins/auth.js'
import { requireModul } from '../../utils/gerbang-modul.js'
import { logAuditEvent } from '../../utils/audit.js'
import { SIFAT_BICARA } from '../../lib/ai-config.js'

/** Umur token usulan. Sama dengan token tulis & setujui — satu kebiasaan. */
const UMUR_TOKEN_MS = 15 * 60_000

const MAKS_KUNCI = 80
const MAKS_NILAI = 500

interface BadanUsul {
  kunci?: string
  nilai?: string
  lapis?: string
  izin_minimum?: string | null
  project_id?: string | null
  percakapan_id?: string | null
}

interface BadanSimpan extends BadanUsul {
  id?: string
}

/** Bentuk yang sah untuk sebuah ingatan, apa pun jalan masuknya. */
function periksaBentuk(b: BadanUsul): { ok: true; nilai: {
  kunci: string; nilai: string; lapis: 'pribadi' | 'bersama'
  izinMinimum: string | null; projectId: string | null
} } | { ok: false; pesan: string } {
  const kunci = (b.kunci ?? '').trim()
  const nilai = (b.nilai ?? '').trim()
  const lapis = (b.lapis ?? '').trim()

  if (kunci.length < 1 || kunci.length > MAKS_KUNCI) {
    return { ok: false, pesan: `kunci wajib diisi, maksimal ${MAKS_KUNCI} karakter` }
  }
  if (nilai.length < 1 || nilai.length > MAKS_NILAI) {
    // Ingatan dikirim ULANG tiap ronde, sama seperti riwayat. Yang panjang
    // menagih diam-diam pada tiap pertanyaan, selamanya.
    return { ok: false, pesan: `nilai wajib diisi, maksimal ${MAKS_NILAI} karakter` }
  }
  if (lapis !== 'pribadi' && lapis !== 'bersama') {
    return { ok: false, pesan: "lapis harus 'pribadi' atau 'bersama'" }
  }

  const izin = (b.izin_minimum ?? '').trim() || null
  const proyek = (b.project_id ?? '').trim() || null

  /*
   * Ingatan PRIBADI tak boleh ber-`izin_minimum`.
   *
   * Ia sudah hanya terbaca pemiliknya; menambah izin di atasnya hanya bisa
   * membuat orang tak bisa membaca catatannya sendiri — batas yang tak
   * menjaga siapa pun dan mengunci satu-satunya pihak yang berhak.
   */
  if (lapis === 'pribadi' && izin) {
    return { ok: false, pesan: 'Ingatan pribadi tidak memakai izin minimum — ia sudah hanya milik Anda.' }
  }

  return {
    ok: true,
    nilai: { kunci, nilai, lapis, izinMinimum: izin, projectId: proyek },
  }
}

export default async function aiIngatanRoutes(app: FastifyInstance) {
  // ── GET: apa saja yang diingat ──────────────────────────────────────────
  //
  // TIDAK memakai `bacaIngatan`: halaman pengelolaan harus memperlihatkan
  // ingatan APA ADANYA supaya bisa disunting — termasuk yang tak akan pernah
  // masuk prompt orang ini. Penyaringan izin/proyek milik jalur PROMPT, bukan
  // jalur kelola; yang menjaga di sini `requirePermission`.
  //
  // Yang TETAP disaring: lapis pribadi milik orang lain. Itu bukan soal izin
  // melainkan soal kepemilikan, dan tak ada permission yang membuatnya pantas
  // dibaca orang lain.
  app.get(
    '/api/v1/ai/ingatan',
    { preHandler: [authenticate, requireModul('modul.ai'), requirePermission('ai:ingatan:lihat')] },
    async (request, reply) => {
      const userId = request.currentUser!.id

      const { data, error } = await request.db!
        .from('ai_ingatan')
        .select('id, lapis, kunci, nilai, izin_minimum, project_id, user_id, diperbarui_pada')
        .order('diperbarui_pada', { ascending: false })

      if (error) {
        request.log.error({ err: error }, 'ai/ingatan: gagal membaca')
        return reply.status(500).send({ error: 'Gagal membaca ingatan' })
      }

      const baris = (data ?? []) as Array<{ lapis: string; user_id: string | null }>
      const terlihat = baris.filter(
        (b) => b.lapis !== 'pribadi' || b.user_id === userId,
      )

      return reply.send({
        data: terlihat,
        boleh_kelola: hasPermission(request, 'ai:ingatan:kelola'),
        batas: { kunci: MAKS_KUNCI, nilai: MAKS_NILAI },
      })
    },
  )

  // ── POST usul: asisten MENGUSULKAN. Tak menulis apa pun. ────────────────
  //
  // Menerbitkan token berumur pendek, persis pola `ai/siapkan-tulis`.
  // Injeksi lewat dokumen bisa membuat model memanggil ini; ia tak bisa
  // membuat manusia menekan tombol, dan token yang tak diklaim kedaluwarsa
  // dalam 15 menit tanpa mengubah apa pun.
  app.post<{ Body: BadanUsul }>(
    '/api/v1/ai/ingatan/usul',
    {
      preHandler: [authenticate, requireModul('modul.ai'), requirePermission('ai:chat')],
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const bentuk = periksaBentuk(request.body ?? {})
      if (!bentuk.ok) return reply.status(422).send({ error: bentuk.pesan })
      const v = bentuk.nilai

      // Ingatan BERSAMA menyentuh apa yang dibaca semua orang. Yang tak boleh
      // mengelolanya juga tak boleh mengusulkannya — kalau tidak, tombol
      // konfirmasinya akan muncul untuk orang yang tak bisa menekannya.
      if (v.lapis === 'bersama' && !hasPermission(request, 'ai:ingatan:kelola')) {
        return reply.status(403).send({
          error: 'Butuh permission: ai:ingatan:kelola untuk mengusulkan ingatan bersama',
        })
      }

      if (v.projectId) {
        const { data: proyek, error: errP } = await request.db!
          .from('projects')
          .select('id')
          .eq('id', v.projectId)
          .maybeSingle()
        if (errP) {
          request.log.error({ err: errP }, 'ai/ingatan: gagal memeriksa proyek')
          return reply.status(500).send({ error: 'Gagal memeriksa proyek' })
        }
        // Diverifikasi lewat `request.db` (sadar tenant): id proyek tenant
        // lain yang dikirim pemanggil tak boleh lolos.
        if (!proyek) return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }

      const token = randomBytes(24).toString('base64url')
      const kedaluwarsa = new Date(Date.now() + UMUR_TOKEN_MS).toISOString()

      const ringkasan =
        `${v.lapis === 'pribadi' ? 'Catatan pribadi' : 'Catatan bersama'} — ` +
        `${v.kunci}: ${v.nilai}`

      const { error } = await request.db!.from('ai_token_tulis').insert({
        company_id: request.companyId!,
        token,
        user_id: request.currentUser!.id,
        jenis: 'ingatan',
        aksi: 'buat',
        project_id: v.projectId,
        muatan: {
          kunci: v.kunci,
          nilai: v.nilai,
          lapis: v.lapis,
          izin_minimum: v.izinMinimum,
          percakapan_id: (request.body?.percakapan_id ?? '').trim() || null,
        },
        ringkasan,
        kanal: 'web',
        kedaluwarsa,
      })

      if (error) {
        request.log.error({ err: error }, 'ai/ingatan: gagal menerbitkan token usul')
        return reply.status(500).send({ error: 'Gagal menyiapkan usulan' })
      }

      return reply.send({ ok: true, token, ringkasan, kedaluwarsa })
    },
  )

  // ── POST simpan: MENULIS. Dari token (konfirmasi) atau langsung (manual).
  app.post<{ Body: BadanSimpan & { token?: string } }>(
    '/api/v1/ai/ingatan',
    {
      preHandler: [authenticate, requireModul('modul.ai'), requirePermission('ai:ingatan:lihat')],
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const userId = request.currentUser!.id
      const token = (request.body?.token ?? '').trim()

      let isi: BadanUsul
      let tokenId: string | null = null

      if (token) {
        const { data: lihat, error: errT } = await request.db!
          .from('ai_token_tulis')
          .select('id, user_id, jenis, project_id, muatan, kedaluwarsa, dipakai_pada')
          .eq('token', token)
          .maybeSingle()

        if (errT) {
          // Gangguan basis TIDAK boleh menyamar jadi "token tak dikenal" —
          // jejak audit akan terisi orang yang tak melakukan kesalahan.
          request.log.error({ err: errT }, 'ai/ingatan: gagal membaca token')
          return reply.status(503).send({ error: 'Gagal memeriksa token. Coba lagi.' })
        }
        if (!lihat) return reply.status(410).send({ error: 'Token tidak dikenal.' })

        const t = lihat as {
          id: string; user_id: string; jenis: string; project_id: string | null
          muatan: Record<string, unknown>; kedaluwarsa: string; dipakai_pada: string | null
        }

        if (t.jenis !== 'ingatan') {
          return reply.status(422).send({ error: 'Token ini bukan untuk ingatan.' })
        }
        if (t.user_id !== userId) {
          void logAuditEvent(request, {
            tableName: 'ai_token_tulis',
            recordId: userId,
            action: 'ai.ingatan.ditolak',
            actorId: userId,
            newValues: { alasan: 'bukan_pemilik_token' },
            severity: 'critical',
          })
          return reply.status(403).send({ error: 'Token ini bukan milik Anda.' })
        }
        if (t.dipakai_pada) return reply.status(409).send({ error: 'Token sudah dipakai.' })
        if (new Date(t.kedaluwarsa).getTime() < Date.now()) {
          return reply.status(410).send({ error: 'Token sudah kedaluwarsa.' })
        }

        tokenId = t.id
        isi = {
          kunci: String(t.muatan.kunci ?? ''),
          nilai: String(t.muatan.nilai ?? ''),
          lapis: String(t.muatan.lapis ?? ''),
          izin_minimum: (t.muatan.izin_minimum as string | null) ?? null,
          project_id: t.project_id,
          percakapan_id: (t.muatan.percakapan_id as string | null) ?? null,
        }
      } else {
        isi = request.body ?? {}
      }

      const bentuk = periksaBentuk(isi)
      if (!bentuk.ok) return reply.status(422).send({ error: bentuk.pesan })
      const v = bentuk.nilai

      if (v.lapis === 'bersama' && !hasPermission(request, 'ai:ingatan:kelola')) {
        return reply.status(403).send({
          error: 'Butuh permission: ai:ingatan:kelola untuk ingatan bersama',
        })
      }

      /*
       * `onConflict` mengikuti INDEKS PARSIAL migrasi 385 — dan indeksnya DUA,
       * bukan satu: `user_id` NULL pada lapis bersama, dan NULL tak pernah
       * sama dengan NULL, jadi satu UNIQUE biasa tak menahan duplikat di sana
       * sama sekali.
       */
      const { data, error } = await request.db!
        .from('ai_ingatan')
        .upsert(
          {
            company_id: request.companyId!,
            user_id: v.lapis === 'pribadi' ? userId : null,
            lapis: v.lapis,
            kunci: v.kunci,
            nilai: v.nilai,
            izin_minimum: v.izinMinimum,
            project_id: v.projectId,
            sumber_percakapan_id: (isi.percakapan_id ?? '').trim() || null,
            dibuat_oleh: userId,
          },
          /*
           * `company_id,pemilik,kunci` — indeks PENUH dari migrasi 386.
           *
           * Bukan indeks parsial 385 (`…WHERE user_id IS NOT NULL`): Postgres
           * menuntut klausa WHERE-nya ikut disebut untuk menyimpulkan indeks
           * parsial, dan `onConflict` PostgREST hanya menerima daftar kolom.
           * Hasilnya "there is no unique or exclusion constraint matching the
           * ON CONFLICT specification" — 500 pada TIAP penyimpanan.
           *
           * `pemilik` kolom turunan: `user_id`, atau UUID nol untuk lapis
           * bersama. Satu target untuk kedua lapis.
           */
          { onConflict: 'company_id,pemilik,kunci' },
        )
        .select('id, lapis, kunci, nilai, izin_minimum, project_id')
        .maybeSingle()

      if (error) {
        request.log.error({ err: error }, 'ai/ingatan: gagal menyimpan')
        return reply.status(500).send({ error: 'Gagal menyimpan ingatan' })
      }

      if (tokenId) {
        const { data: ditandai, error: errPakai } = await request.db!
          .from('ai_token_tulis')
          .update({ dipakai_pada: new Date().toISOString() })
          .eq('id', tokenId)
          // Status LAMA ikut di WHERE: dua permintaan yang mengklaim token
          // sama secara bersamaan hanya boleh membuat SATU di antaranya
          // benar-benar menandainya (pola `audit-klaim-status-atomik`).
          .is('dipakai_pada', null)
          .select('id')
          .maybeSingle()

        /*
         * DUA hal diperiksa, bukan satu.
         *
         * `error` saja tak cukup: UPDATE yang tak cocok satu baris pun
         * mengembalikan `error: null` dengan `data: null`. Token yang tetap
         * bertanda "belum dipakai" bisa diklaim LAGI dan menimpa ingatan yang
         * baru saja disetujui — dan tak ada satu pun galat yang menyebutkannya.
         *
         * Tidak membatalkan ingatan yang sudah tersimpan (ia sah, manusia
         * memang menekan tombolnya), tetapi tak boleh senyap.
         */
        if (errPakai || !ditandai) {
          request.log.error(
            { err: errPakai, tokenId, ditandai: Boolean(ditandai) },
            'ai/ingatan: token gagal ditandai terpakai — bisa diklaim ulang',
          )
        }
      }

      void logAuditEvent(request, {
        tableName: 'ai_ingatan',
        recordId: (data as { id: string } | null)?.id ?? v.kunci,
        action: 'ai.ingatan.simpan',
        actorId: userId,
        newValues: data ?? null,
        // Ingatan bersama masuk ke prompt SEMUA orang yang berizin. Yang
        // mengubahnya harus terlihat tanpa harus dicari.
        severity: v.lapis === 'bersama' ? 'critical' : 'info',
      })

      return reply.send({ ok: true, data })
    },
  )

  // ── DELETE: melupakan ───────────────────────────────────────────────────
  app.delete<{ Params: { id: string } }>(
    '/api/v1/ai/ingatan/:id',
    { preHandler: [authenticate, requireModul('modul.ai'), requirePermission('ai:ingatan:lihat')] },
    async (request, reply) => {
      const userId = request.currentUser!.id

      const { data: ada, error: errBaca } = await request.db!
        .from('ai_ingatan')
        .select('id, lapis, kunci, user_id')
        .eq('id', request.params.id)
        .maybeSingle()

      if (errBaca) {
        request.log.error({ err: errBaca }, 'ai/ingatan: gagal membaca sebelum hapus')
        return reply.status(500).send({ error: 'Gagal membaca ingatan' })
      }
      if (!ada) return reply.status(404).send({ error: 'Ingatan tidak ditemukan' })

      const t = ada as { lapis: string; user_id: string | null; kunci: string }

      if (t.lapis === 'pribadi' && t.user_id !== userId) {
        return reply.status(403).send({ error: 'Ingatan ini bukan milik Anda.' })
      }
      if (t.lapis === 'bersama' && !hasPermission(request, 'ai:ingatan:kelola')) {
        return reply.status(403).send({
          error: 'Butuh permission: ai:ingatan:kelola untuk menghapus ingatan bersama',
        })
      }

      const { data: terhapus, error } = await request.db!
        .from('ai_ingatan')
        .delete()
        .eq('id', request.params.id)
        .select('id')
        .maybeSingle()

      if (error) {
        request.log.error({ err: error }, 'ai/ingatan: gagal menghapus')
        return reply.status(500).send({ error: 'Gagal menghapus ingatan' })
      }
      // Hasil DELETE DIPERIKSA: penghapusan yang gagal senyap membuat orang
      // mengira asistennya sudah lupa, padahal ia masih mengingat.
      if (!terhapus) return reply.status(404).send({ error: 'Ingatan tidak ditemukan' })

      void logAuditEvent(request, {
        tableName: 'ai_ingatan',
        recordId: request.params.id,
        action: 'ai.ingatan.hapus',
        actorId: userId,
        oldValues: ada,
        severity: t.lapis === 'bersama' ? 'critical' : 'info',
      })

      return reply.send({ ok: true })
    },
  )

  // ── GET izin yang bisa dipakai sebagai penanda rahasia ───────────────────
  //
  // Dikirim dari server supaya UI tak menebak. Pola yang sama dengan
  // `tool_tersedia` di `/ai/config`: daftar yang dipaku di web akan basi
  // diam-diam begitu katalog izin bertambah.
  app.get(
    '/api/v1/ai/ingatan/izin-tersedia',
    { preHandler: [authenticate, requireModul('modul.ai'), requirePermission('ai:ingatan:lihat')] },
    async (request, reply) => {
      const { data, error } = await request.db!
        .shared('permissions')
        .select('key, label, module')
        .order('module', { ascending: true })
        .order('key', { ascending: true })

      if (error) {
        request.log.error({ err: error }, 'ai/ingatan: gagal membaca katalog izin')
        return reply.status(500).send({ error: 'Gagal membaca daftar izin' })
      }

      return reply.send({ data: data ?? [], sifat_bicara: SIFAT_BICARA })
    },
  )
}
