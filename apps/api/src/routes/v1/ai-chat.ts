/**
 * POST /api/v1/ai/chat — asisten READ-ONLY.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * URUTAN GERBANG, DAN KENAPA URUTANNYA MENENTUKAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   1. permission `ai:chat`
 *   2. saklar mati per tenant (§5.5)      ← GRATIS, sebelum apa pun berbayar
 *   3. gerbang biaya (`periksaGerbangAi`) ← masih gratis
 *   4. kunci penyedia ada?                ← masih gratis
 *   5. satu giliran per user              ← masih gratis
 *   6. baru panggil model                 ← BERBAYAR
 *
 * Kriteria C1 menyebutnya "jalur gratis SEBELUM panggilan berbayar". Bukan
 * optimasi: tenant yang mematikan AI lalu tetap ditagih karena pemeriksaannya
 * di belakang akan menganggap saklar matinya rusak — dan mereka benar.
 *
 * ── Gerbang 2, 3, 4, dan 6 TINGGAL DI `lib/ai-jalankan.ts`
 *
 * Sejak kanal WhatsApp ada, urutan itu dipakai DUA route. Ia diangkat ke satu
 * fungsi supaya tak ada dua salinan aturan keamanan yang bisa berbeda diam-diam
 * — gejala terburuknya: tenant mematikan AI, web patuh, WhatsApp terus
 * menjawab, tanpa satu pun galat.
 *
 * Yang tinggal di sini hanya yang memang milik kanal web: permission lewat
 * `requirePermission`, rate limit per user, kunci giliran per percakapan, dan
 * penyimpanan riwayat.
 *
 * ── Satu giliran per user, dipegang di BASIS
 *
 * `ai_percakapan.giliran_terkunci_pada`. Bukan di memori proses: dua instance
 * API punya dua memori yang tak saling tahu, dan dua pesan bersamaan tetap
 * saling menimpa. Kuncinya kedaluwarsa sendiri supaya proses yang mati di
 * tengah tak mengunci percakapan selamanya.
 *
 * ── Teks pengguna TIDAK PERNAH disambung ke prompt sistem (I-2)
 *
 * Ia masuk sebagai pesan `user`, dan hasil tool masuk terbungkus penanda data.
 * Menyambungnya ke prompt sistem berarti teks yang diketik siapa pun punya
 * kedudukan yang sama dengan instruksi yang ditulis pengembang.
 */

import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'
import { ambilKredensial } from '../../lib/kredensial.js'
import { jalankanGiliranAi } from '../../lib/ai-jalankan.js'
import type { Asisten } from '../../lib/ai-config.js'

/** Kunci giliran kedaluwarsa — proses yang mati tak mengunci selamanya. */
const GILIRAN_KEDALUWARSA_MS = 2 * 60_000

/**
 * Asisten kanal ini — SATU konstanta, dipakai dua tempat.
 *
 * Nilainya masuk ke `ai_percakapan.asisten` (baris percakapan) DAN ke gerbang
 * biaya (baris `ai_biaya_token`). Kalau keduanya ditulis terpisah, satu bisa
 * diubah tanpa yang lain — dan hasilnya percakapan yang tercatat sebagai satu
 * asisten tetapi ditagih atas nama asisten lain. Tak ada galat, dan yang
 * membacanya nanti tak punya cara tahu mana yang benar.
 */
const ASISTEN_WEB: Asisten = 'web'

interface BadanChat {
  pesan?: string
  percakapan_id?: string
}

export default async function aiChatRoutes(app: FastifyInstance) {
  app.post<{ Body: BadanChat }>(
    '/api/v1/ai/chat',
    {
      preHandler: [authenticate, requirePermission('ai:chat')],
      config: {
        /*
         * Batas bulanan tak menahan pembakaran token dalam SATU JAM — itu
         * sebabnya rate limit tetap perlu meski gerbang biaya sudah ada
         * (SCOPE §4 #3: "spending limit + rate limit").
         *
         * ── PER USER, bukan per IP (kriteria B1)
         *
         * Bawaan `@fastify/rate-limit` memakai alamat IP. Untuk ERP itu
         * salah arah: satu kantor konstruksi duduk di belakang SATU IP, jadi
         * lima orang yang bertanya bersamaan saling memblokir — dan yang
         * kena bukan yang boros, melainkan yang kebetulan menekan Enter
         * paling akhir.
         *
         * Sebaliknya, satu orang yang membuka lima tab tetap satu kuota.
         *
         * `request.currentUser` sudah terisi `authenticate` di preHandler.
         * Jatuhannya ke IP hanya untuk permintaan yang lolos tanpa user —
         * dan itu seharusnya sudah ditolak 401 sebelum sampai sini.
         */
        rateLimit: {
          max: 30,
          timeWindow: '1 minute',
          keyGenerator: (request: { currentUser?: { id: string }; ip: string }) =>
            request.currentUser?.id ?? request.ip,
        },
      },
    },
    async (request, reply) => {
      const db = request.db!
      const companyId = request.companyId!
      const userId = request.currentUser!.id

      const pesanUser = (request.body?.pesan ?? '').trim()
      if (!pesanUser) {
        return reply.status(422).send({ error: 'Pesan tidak boleh kosong' })
      }
      if (pesanUser.length > 4_000) {
        // Bukan sekadar kerapian: pesan raksasa mendorong riwayat keluar
        // jendela konteks dan membuat jawaban kehilangan pertanyaannya sendiri.
        return reply.status(422).send({ error: 'Pesan terlalu panjang (maksimal 4.000 karakter)' })
      }

      // ── GERBANG 4 (gratis): satu giliran per user ──────────────────────
      //
      // Ini gerbang milik kanal WEB — nomor urutnya mengikuti kepala berkas,
      // meski gerbang 1–3 kini dijalankan `jalankanGiliranAi`. Dikunci LEBIH
      // DULU supaya dua tab yang menekan Enter bersamaan tak sama-sama
      // membayar; sisanya baru diperiksa inti bersama.
      const percakapanId = await ambilAtauBuatPercakapan(request, companyId, userId, request.body?.percakapan_id)
      if (!percakapanId.ok) {
        return reply.status(percakapanId.status).send({ error: percakapanId.pesan })
      }

      // `_permissionCache` SUDAH terisi: `requirePermission('ai:chat')` di
      // preHandler memuatnya sekali per request. Memuat ulang di sini akan
      // menambah satu RPC untuk data yang sudah ada.
      //
      // Kalau ternyata kosong (cache tak terisi karena alasan tak terduga),
      // katalognya jadi NOL tool — fail-closed, sesuai I-3. Asisten yang
      // kehilangan tool-nya menjawab "saya tak bisa membaca data itu", dan itu
      // jauh lebih baik daripada asisten yang mendapat tool yang tak ia miliki.
      const izinPengguna: ReadonlySet<string> = request._permissionCache ?? new Set<string>()

      // ── GERBANG 1–3 lalu BERBAYAR — inti yang sama dengan kanal WhatsApp.
      //
      // `asisten: 'web'` — sampai 2026-08-14 kanal ini diam-diam memakai
      // ember `staff`, sehingga baris config `web` (lengkap dengan halaman
      // pengaturannya) tak pernah dibaca sekali pun. Plafon biaya kini milik
      // tenant (migrasi 382), jadi memakai asistennya sendiri tidak lagi
      // berarti tenant punya dua kantong uang.
      const jalan = await jalankanGiliranAi({
        db,
        companyId,
        userId,
        izinPengguna,
        pesanUser,
        asisten: ASISTEN_WEB,
        ambilKunci: (nama) => ambilKredensial(request, nama),
        catatGalat: (p, err) => request.log.error({ err }, `ai/chat: ${p}`),
      })

      await lepasGiliran(request, percakapanId.id)

      if (!jalan.ok) {
        if (jalan.tahap === 'gerbang') {
          const status =
            jalan.alasan === 'ai_nonaktif'
              ? 403
              : jalan.alasan === 'batas_terlampaui' || jalan.alasan === 'nonaktif'
                ? 402
                : jalan.alasan === 'gagal_baca_pengaturan'
                  ? 500
                  : 503
          request.log.warn({ alasan: jalan.alasan }, 'ai/chat: dicegah gerbang')
          return reply.status(status).send({ error: jalan.pesan, alasan: jalan.alasan })
        }
        request.log.warn({ alasan: jalan.alasan, pesan: jalan.pesan }, 'ai/chat: loop gagal')
        return reply.status(503).send({
          error: 'Asisten sedang tidak bisa dihubungi. Coba lagi sebentar lagi.',
          alasan: jalan.alasan,
        })
      }

      const hasil = jalan.hasil

      // ── I-4: entitas yang disebut tapi tak pernah diambil tool ─────────
      const asing = jalan.entitasAsing
      if (asing.length > 0) {
        // Peringatan, bukan pemblokiran: model bisa menyebut nomor yang
        // pengguna sendiri ketik. Yang dituju: jejaknya terlihat.
        request.log.warn({ asing, userId }, 'ai/chat: jawaban menyebut entitas di luar hasil tool')
        void logAuditEvent(request, {
          tableName: 'ai_percakapan',
          recordId: percakapanId.id,
          action: 'ai.entitas.asing',
          actorId: userId,
          newValues: { entitas_asing: asing },
          severity: 'warning',
          via: 'web',
        })
      }

      await simpanPesan(request, companyId, percakapanId.id, pesanUser, hasil)

      return reply.send({
        percakapan_id: percakapanId.id,
        jawaban: hasil.teks,
        ronde: hasil.ronde,
        alasan: hasil.alasan,
        // Explainability (C2): pembaca bisa melihat tool APA yang dipakai dan
        // entitas apa yang benar-benar dibaca — jawaban yang tak bisa
        // diperiksa tak layak dipercaya untuk keputusan berkonsekuensi.
        sumber: {
          tool_tersedia: jalan.toolTersedia,
          entitas_dibaca: [...new Set(hasil.entitas)].slice(0, 50),
          ada_galat_tool: hasil.adaGalatTool,
        },
        peringatan: asing.length > 0
          ? `Jawaban menyebut ${asing.join(', ')} yang tidak berasal dari data yang dibaca. Periksa sebelum dipercaya.`
          : null,
      })
    },
  )
}

type HasilPercakapan =
  | { ok: true; id: string }
  | { ok: false; status: 409 | 500; pesan: string }

/**
 * Mengambil percakapan yang ada atau membuat baru, sekaligus MENGUNCI giliran.
 *
 * Kuncinya diambil dengan UPDATE bersyarat, bukan "baca lalu tulis": dua
 * permintaan bersamaan yang sama-sama membaca "tidak terkunci" akan sama-sama
 * mengunci, dan itu persis balapan yang hendak dicegah.
 */
async function ambilAtauBuatPercakapan(
  request: Parameters<typeof logAuditEvent>[0],
  companyId: string,
  userId: string,
  idDiminta?: string,
): Promise<HasilPercakapan> {
  const db = request.db!
  const batas = new Date(Date.now() - GILIRAN_KEDALUWARSA_MS).toISOString()
  const sekarang = new Date().toISOString()

  if (idDiminta) {
    // `.is(null)` ATAU kunci kedaluwarsa — satu pernyataan, tanpa celah baca.
    const { data, error } = await db
      .from('ai_percakapan')
      .update({ giliran_terkunci_pada: sekarang })
      .eq('id', idDiminta)
      .or(`giliran_terkunci_pada.is.null,giliran_terkunci_pada.lt.${batas}`)
      .select('id')
      .maybeSingle()

    if (error) {
      request.log.error({ err: error, idDiminta }, 'ai/chat: gagal mengunci giliran')
      return { ok: false, status: 500, pesan: 'Gagal memulai giliran' }
    }
    if (!data) {
      return {
        ok: false,
        status: 409,
        pesan: 'Pesan sebelumnya masih diproses. Tunggu jawabannya dulu.',
      }
    }
    return { ok: true, id: (data as { id: string }).id }
  }

  const { data, error } = await db
    .from('ai_percakapan')
    .insert({
      company_id: companyId,
      user_id: userId,
      asisten: ASISTEN_WEB,
      kanal: 'web',
      giliran_terkunci_pada: sekarang,
    })
    .select('id')
    .maybeSingle()

  if (error || !data) {
    request.log.error({ err: error }, 'ai/chat: gagal membuat percakapan')
    return { ok: false, status: 500, pesan: 'Gagal memulai percakapan' }
  }
  return { ok: true, id: (data as { id: string }).id }
}

async function lepasGiliran(request: Parameters<typeof logAuditEvent>[0], id: string) {
  const { error } = await request.db!
    .from('ai_percakapan')
    .update({ giliran_terkunci_pada: null })
    .eq('id', id)
    .select('id')
    .maybeSingle()

  // Gagal melepas berarti percakapan terkunci sampai kedaluwarsa. Tidak fatal,
  // tapi tak boleh senyap — pengguna akan melihat 409 tanpa sebab yang jelas.
  if (error) request.log.error({ err: error, id }, 'ai/chat: gagal melepas giliran')
}

/**
 * Menyimpan pesan pengguna dan jawaban asisten, BESERTA blok tool (C-5).
 *
 * Gagal simpan tidak membatalkan jawaban yang sudah dibayar — tapi dicatat,
 * karena riwayat yang bolong membuat pesan berikutnya kehilangan konteksnya.
 */
async function simpanPesan(
  request: Parameters<typeof logAuditEvent>[0],
  companyId: string,
  percakapanId: string,
  pesanUser: string,
  hasil: { teks: string; blok: unknown[]; adaGalatTool: boolean; ronde: number },
) {
  const db = request.db!

  const { data: terakhir, error: errUrut } = await db
    .from('ai_pesan')
    .select('urutan')
    .eq('percakapan_id', percakapanId)
    .order('urutan', { ascending: false })
    .limit(1)

  if (errUrut) {
    request.log.error({ err: errUrut, percakapanId }, 'ai/chat: gagal membaca urutan pesan')
    return
  }

  const mulai = ((terakhir ?? []) as Array<{ urutan: number }>)[0]?.urutan ?? -1

  const { error } = await db.from('ai_pesan').insert([
    {
      company_id: companyId,
      percakapan_id: percakapanId,
      peran: 'user',
      urutan: mulai + 1,
      teks: pesanUser,
      blok: [],
      ronde: 1,
      // WAJIB ditulis eksplisit meski kolomnya punya DEFAULT false.
      //
      // Diukur, bukan ditebak: insert BATCH lewat PostgREST menyatukan kolom
      // seluruh baris, lalu mengirim `null` untuk baris yang tak menyebutkannya
      // — bukan membiarkan DEFAULT berlaku. Baris kedua menyebut
      // `ada_galat_tool`, jadi baris pertama ikut mendapat kolomnya bernilai
      // null, dan NOT NULL menolak SELURUH batch.
      //
      // Gejalanya nihil: respons tetap 200 dan jawabannya benar. Yang hilang
      // riwayatnya, dan itu baru terasa pada pesan berikutnya.
      ada_galat_tool: false,
    },
    {
      company_id: companyId,
      percakapan_id: percakapanId,
      peran: 'assistant',
      urutan: mulai + 2,
      teks: hasil.teks,
      // Blok tool IKUT tersimpan (C-5) — inilah yang membuat pesan berikutnya
      // masih tahu hasil tool ronde ini.
      blok: hasil.blok,
      ronde: hasil.ronde,
      ada_galat_tool: hasil.adaGalatTool,
    },
  ]).select('id')

  if (error) {
    request.log.error({ err: error, percakapanId }, 'ai/chat: gagal menyimpan pesan')
  }
}

/**
 * Dipakai test untuk membuktikan penyimpanan pesan benar-benar jalan.
 *
 * Diekspor karena jalur ini sempat GAGAL SENYAP: `ai_percakapan` bertambah
 * sementara `ai_pesan` tetap nol, dan tak ada gejala di respons — jawabannya
 * 200 dan benar. Riwayat yang bolong baru terasa pada pesan berikutnya, saat
 * konteksnya hilang.
 */
export const _ujiSimpanPesan = simpanPesan
