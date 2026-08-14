/**
 * POST /api/v1/wa/webhook — pesan MASUK dari WhatsApp.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * SATU-SATUNYA PINTU TANPA LOGIN — dan apa artinya
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Setiap route lain di aplikasi ini lewat `authenticate` + `requirePermission`.
 * Route ini TIDAK BISA: penyedia WhatsApp bukan pengguna, ia tak punya sesi.
 *
 * Akibatnya seluruh gerbang harus ditegakkan ulang di sini dengan tangan, dan
 * urutannya menentukan:
 *
 *   1. rahasia webhook          ← tanpa ini, siapa pun bisa mengaku penyedia
 *   2. bentuk payload           ← gratis
 *   3. dedup id pesan           ← gratis, ATOMIK (primary key)
 *   4. identitas dari nomor     ← gratis; gagal ⇒ dicatat, dibalas netral
 *   5. saklar mati + biaya      ← gratis, lewat `jalankanGiliranAi`
 *   6. panggil model            ← BERBAYAR
 *
 * ── Celah TJS yang TIDAK ditiru
 *
 * `automation-tjs/.../lib/wa/inbound/evolution-inbound.ts` (158 baris,
 * diperiksa 2026-08-10) punya deduplikasi tapi NOL verifikasi asal: tak ada
 * `signature`, tak ada `hmac`, tak ada pemeriksaan apikey.
 *
 * Tanpa itu, siapa pun yang tahu URL-nya bisa mengirim pesan atas nama nomor
 * mana pun yang terdaftar — dan asisten akan menjawabnya dengan data
 * perusahaan orang itu. Nomor terdaftar bukan rahasia; ia tertulis di kartu
 * nama. Di sini rahasia webhook diperiksa lebih dulu, dan penolakannya
 * dicatat.
 *
 * ── Kenapa SELALU membalas 200
 *
 * Penyedia webhook mencoba ulang saat menerima galat. Membalas 4xx/5xx untuk
 * pesan yang memang tak perlu dijawab (event bukan pesan, nomor asing, pesan
 * ganda) membuat penyedia mengulang selamanya, dan tumpukan itu jadi beban
 * yang tak ada hubungannya dengan masalah aslinya.
 *
 * Satu-satunya pengecualian: rahasia salah → 401. Yang mengetuk pintu dengan
 * kunci salah memang tidak berhak tahu apa pun, termasuk bahwa ia "berhasil".
 *
 * ── Balasan untuk nomor asing: NETRAL
 *
 * Tak ada balasan sama sekali. Membalas "nomor Anda tidak terdaftar" memberi
 * tahu penyapu nomor bahwa endpoint ini hidup dan terhubung ke sebuah ERP.
 * Percobaannya tetap tercatat di `ai_akses_ditolak` (C-9) — yang tak terlihat
 * hanya balasannya, bukan jejaknya.
 */

import type { FastifyInstance } from 'fastify'
import { supabase } from '../../utils/supabase.js'
import { createTenantDb } from '../../utils/tenant-db.js'
import { klaimPesanMasuk, tandaiDiproses, uraiPesanMasuk } from '../../lib/wa-masuk.js'
import { bangunSesiDariNomor, catatAksesDitolak } from '../../lib/wa-sesi.js'
import { kirimWa, konfigurasiKanal } from '../../lib/wa-kirim.js'
import { renderDariDb } from '../../lib/wa-template.js'
import { jalankanGiliranAi, GAYA_WHATSAPP } from '../../lib/ai-jalankan.js'
import { bacaRiwayat } from '../../lib/ai-riwayat-baca.js'
import { ambilAtauBuatPercakapanWa, simpanPertukaranWa } from '../../lib/ai-percakapan-wa.js'
import { ambilKredensial } from '../../lib/kredensial.js'

/**
 * Perbandingan rahasia yang tak bocor lewat waktu.
 *
 * `a === b` pada string berhenti di karakter pertama yang berbeda, dan selisih
 * waktunya cukup untuk menebak rahasia karakter demi karakter dari jarak jauh.
 * Terdengar teoretis, tapi ongkos menghindarinya nol.
 */
function samaAman(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let beda = 0
  for (let i = 0; i < a.length; i++) beda |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return beda === 0
}

interface BadanWebhook {
  [k: string]: unknown
}

export default async function waWebhookRoutes(app: FastifyInstance) {
  app.post<{ Body: BadanWebhook }>(
    '/api/v1/wa/webhook',
    {
      config: {
        /*
         * Rate limit per IP — di sini IP memang kunci yang benar, kebalikan
         * dari `/ai/chat`. Tak ada pengguna untuk dijadikan kunci, dan yang
         * ditahan justru pembanjir yang belum terbukti siapa pun.
         *
         * Angkanya longgar: satu instance WhatsApp yang sibuk bisa meneruskan
         * puluhan pesan semenit, dan memblokir pesan karyawan sendiri jauh
         * lebih merugikan daripada melayani beberapa ketukan asing yang
         * toh akan berhenti di gerbang rahasia.
         */
        rateLimit: { max: 120, timeWindow: '1 minute' },
      },
    },
    async (request, reply) => {
      /*
       * ── GERBANG 1: rahasia webhook ──────────────────────────────────────
       *
       * Dibaca dari ENV, bukan dari kredensial per-tenant, dan itu bukan
       * kelalaian: penyedia mengirim SATU header untuk semua pesan, dan tenant
       * mana yang dituju baru diketahui setelah nomornya diresolusi — dua
       * gerbang setelah ini.
       *
       * Kredensial per-tenant di sini akan jadi lingkaran: untuk tahu rahasia
       * mana yang berlaku, kita harus lebih dulu memercayai payload yang
       * belum diverifikasi.
       */
      const rahasia = process.env.WA_WEBHOOK_SECRET?.trim() || null
      if (!rahasia) {
        // Fail-closed. Rahasia yang belum diisi berarti pintu ini belum siap
        // dibuka — bukan berarti boleh dibuka untuk semua.
        request.log.error('wa/webhook: WA_WEBHOOK_SECRET belum diisi — webhook ditolak')
        return reply.status(503).send({ error: 'Webhook belum dikonfigurasi' })
      }

      const dikirim =
        (request.headers['x-webhook-secret'] as string | undefined) ??
        (request.headers['apikey'] as string | undefined) ??
        ''

      if (!samaAman(dikirim, rahasia)) {
        request.log.warn({ ip: request.ip }, 'wa/webhook: rahasia salah')
        return reply.status(401).send({ error: 'Tidak sah' })
      }

      // ── GERBANG 2: bentuk payload ────────────────────────────────────────
      const pesan = uraiPesanMasuk(request.body)
      if (!pesan) {
        // Bukan galat: sebagian besar webhook Evolution adalah peristiwa
        // koneksi, status baca, dsb.
        return reply.send({ ok: true, tindakan: 'diabaikan' })
      }

      /*
       * ── Klien LINTAS-TENANT dipakai untuk tiga hal, semuanya di pustaka ──
       *
       * `klaimPesanMasuk`, `bangunSesiDariNomor`/`catatAksesDitolak`, dan
       * `izinDariPeran`. Ketiganya memang harus melihat semua tenant: pesan
       * masuk belum punya tenant sampai nomornya dikenali. Begitu `companyId`
       * diketahui, seluruh akses berikutnya lewat `TenantDb`.
       *
       * `supabase` diteruskan LANGSUNG ke tiap pemanggilan, tanpa alias lokal.
       * Bukan gaya penulisan: ratchet T4f menghitung baris yang berakhir dengan
       * `supabase`, jadi `const lintas = supabase` masuk hitungan akses mentah
       * meski tak ada satu query pun di berkas ini. Menaikkan ambangnya
       * terlarang (tripwire R-011), dan memang tak pantas dinaikkan untuk
       * sekadar sebuah nama variabel.
       */

      // ── GERBANG 3: dedup, ATOMIK (lihat `klaimPesanMasuk`) ───────────────
      const klaim = await klaimPesanMasuk(supabase, pesan.pesanId, pesan.dari)
      if (klaim === 'duplikat') {
        return reply.send({ ok: true, tindakan: 'duplikat' })
      }
      if (klaim === 'gagal') {
        request.log.error({ pesanId: pesan.pesanId }, 'wa/webhook: dedup gagal')
        return reply.status(503).send({ error: 'Gagal memeriksa duplikat' })
      }

      // ── GERBANG 4: identitas dari nomor ──────────────────────────────────
      const sesi = await bangunSesiDariNomor(supabase, pesan.dari)
      if (!sesi.ok) {
        // C-9: percobaan dari nomor tak dikenal TIDAK boleh hilang.
        await catatAksesDitolak(supabase, pesan.dari, sesi.alasan)
        request.log.warn({ alasan: sesi.alasan }, 'wa/webhook: akses ditolak')
        // Sengaja tanpa balasan — lihat catatan kepala berkas.
        return reply.send({ ok: true, tindakan: 'ditolak' })
      }

      const { companyId, userId, nomor } = sesi.sesi

      // Mulai sini SEMUA akses sadar-tenant.
      const db = createTenantDb(companyId)

      /*
       * Kredensial dibaca dengan `companyId` yang SUDAH diresolusi.
       *
       * `ambilKredensial` menuntut bentuk request; yang dibutuhkannya hanya
       * `companyId`, `db`, dan `log`. Objek ini menyediakan ketiganya — bukan
       * request palsu untuk mengelabui pemeriksaan, melainkan konteks nyata
       * milik tenant yang barusan terbukti memiliki nomor ini.
       */
      const konteks = { companyId, db, log: request.log } as unknown as Parameters<
        typeof ambilKredensial
      >[0]
      const ambilKunci = (kunci: string) => ambilKredensial(konteks, kunci)
      const cfg = await konfigurasiKanal(ambilKunci)

      // Permission diresolusi dari peran yang DIBACA basis, bukan diterima.
      const izin = await izinDariPeran(supabase, sesi.sesi.peran)
      if (!izin.has('ai:chat')) {
        // Anggota yang perannya tak punya `ai:chat` diperlakukan sama dengan
        // di web: tak boleh memakai asisten. Diberi tahu, karena orang ini
        // dikenal — beda dengan nomor asing.
        await kirimWa({
          db,
          companyId,
          nomor,
          // Dari TEMPLATE (migrasi 270) — nada pesan ke orang yang ditolak
          // adalah hal yang tiap perusahaan ingin atur sendiri.
          teks: await renderDariDb(
            db,
            'asisten_tanpa_izin',
            {},
            'Peran Anda belum memiliki akses ke asisten. Hubungi admin perusahaan.',
            (pesan) => request.log.warn(`wa/template: ${pesan}`),
          ),
          konfigurasi: cfg,
          userId,
          kunciIdempotensi: `wa-tolak-izin:${pesan.pesanId}`,
        })
        return reply.send({ ok: true, tindakan: 'tanpa_izin' })
      }

      /*
       * ASISTEN MANA — `owner` atau `staff`.
       *
       * Dibedakan lewat PERMISSION, bukan literal peran (ADR-004): peran itu
       * data konfigurasi per-tenant, dan `'admin'`/`'pm'` yang dipaku di kode
       * akan salah begitu sebuah tenant menamai perannya "direktur".
       *
       * `settings:ai:manage` dipilih karena artinya persis yang dibutuhkan:
       * orang yang boleh MENGATUR asisten adalah orang yang percakapannya
       * pantas memakai watak pemilik. Yang tak memegangnya tetap di `staff`.
       *
       * Keduanya kini punya prompt & mode bicara sendiri, tetapi plafon
       * biayanya SATU dan milik tenant (migrasi 382) — jadi memisah asisten
       * tidak membuka kembali lubang "belanja 2× dengan pindah kanal".
       */
      const asistenWa = izin.has('settings:ai:manage') ? 'owner' : 'staff'

      /*
       * PERCAKAPAN & RIWAYAT — sampai 2026-08-15 kanal ini tak menyimpan
       * apa pun, jadi tiap pesan dijawab sebagai giliran pertama yang
       * berdiri sendiri.
       *
       * Justru di sinilah paling terasa: orang lapangan mengetik pendek dan
       * bersambung ("berapa sisa semen?" → "yang di Cimahi"). Kalimat kedua
       * tak berarti apa pun tanpa yang pertama.
       *
       * Gagal menyiapkan percakapan TIDAK menghentikan jawaban — yang hilang
       * ingatannya, bukan asistennya.
       */
      const catatGalatWa = (p: string, err: unknown) =>
        request.log.error({ err }, `wa/webhook: ${p}`)

      const percakapan = await ambilAtauBuatPercakapanWa(
        db,
        companyId,
        userId,
        asistenWa,
        { catatGalat: catatGalatWa },
      )
      const riwayat = percakapan.id
        ? await bacaRiwayat(db, percakapan.id, { catatGalat: catatGalatWa })
        : []

      // ── GERBANG 5 & 6: saklar mati, biaya, lalu model ────────────────────
      const jalan = await jalankanGiliranAi({
        db,
        companyId,
        userId,
        izinPengguna: izin,
        pesanUser: pesan.teks,
        riwayat,
        gayaKanal: GAYA_WHATSAPP,
        asisten: asistenWa,
        ambilKunci,
        catatGalat: catatGalatWa,
      })

      if (!jalan.ok) {
        /*
         * Pesan gerbang boleh dikirim apa adanya — isinya memang untuk
         * pengguna ("batas biaya tercapai"). Kegagalan LOOP tidak: `pesan`-nya
         * datang dari penyedia model dan bisa memuat rincian teknis, bahkan
         * potongan permintaan. Yang bukan untuk pengguna, jangan dikirim ke
         * pengguna.
         */
        /*
         * Pesan GERBANG dikirim apa adanya — ia sudah spesifik ("batas biaya
         * tercapai") dan menggantinya dengan template umum justru membuang
         * satu-satunya petunjuk yang berguna.
         *
         * Yang lewat template hanya pesan KEGAGALAN LOOP, yang memang generik.
         */
        const teks =
          jalan.tahap === 'gerbang'
            ? jalan.pesan
            : await renderDariDb(
                db,
                'asisten_gagal',
                {},
                'Asisten sedang tidak bisa dihubungi. Coba lagi sebentar lagi.',
                (pesan) => request.log.warn(`wa/template: ${pesan}`),
              )
        await kirimWa({
          db,
          companyId,
          nomor,
          teks,
          konfigurasi: cfg,
          userId,
          kunciIdempotensi: `wa-gagal:${pesan.pesanId}`,
        })
        return reply.send({ ok: true, tindakan: 'gagal', alasan: jalan.alasan })
      }

      // I-4: entitas yang disebut jawaban tapi tak pernah keluar dari tool.
      if (jalan.entitasAsing.length > 0) {
        request.log.warn(
          { asing: jalan.entitasAsing, userId, kanal: 'wa' },
          'wa/webhook: jawaban menyebut entitas di luar hasil tool',
        )
      }

      /*
       * Kunci idempotensi dari ID PESAN MASUK, bukan waktu atau acak.
       *
       * Kalau webhook yang sama entah bagaimana lolos dedup (mis. baris dedup
       * terhapus), lapisan kedua ini masih menahan balasan kedua. Dua jaring
       * untuk satu kesalahan yang mahal.
       */
      await kirimWa({
        db,
        companyId,
        nomor,
        teks: jalan.hasil.teks,
        konfigurasi: cfg,
        userId,
        kunciIdempotensi: `wa-jawab:${pesan.pesanId}`,
      })

      // Disimpan SESUDAH terkirim: yang layak jadi ingatan adalah jawaban
      // yang benar-benar sampai. Menyimpan lebih dulu berarti percakapan
      // memuat kalimat yang tak pernah dibaca siapa pun saat pengirimannya
      // gagal — dan giliran berikutnya membangun konteks di atas ucapan hantu.
      if (percakapan.id) {
        await simpanPertukaranWa(
          db,
          companyId,
          percakapan.id,
          pesan.teks,
          jalan.hasil,
          catatGalatWa,
        )
      }

      await tandaiDiproses(supabase, pesan.pesanId, companyId)

      return reply.send({ ok: true, tindakan: 'dijawab', ronde: jalan.hasil.ronde })
    },
  )
}

/**
 * Permission efektif dari NAMA PERAN.
 *
 * Memakai RPC yang sama dengan jalur web (`get_role_permissions`) — bukan
 * tabel yang dibaca sendiri. Dua cara membaca izin akan berbeda pada akhirnya,
 * dan perbedaan izin antar-kanal berarti seseorang bisa lewat WhatsApp
 * melakukan hal yang di web ditolak.
 */
async function izinDariPeran(
  db: typeof supabase,
  peran: string,
): Promise<ReadonlySet<string>> {
  // Nama parameternya `role_name` — sama persis dengan `plugins/auth.ts:197`.
  // Nama yang salah tidak melempar; PostgREST menjawab "fungsi tak ditemukan",
  // dan itu jatuh ke set kosong yang terbaca seperti "orang ini tak punya izin".
  const { data, error } = await db.rpc('get_role_permissions', { role_name: peran })
  if (error || !Array.isArray(data)) {
    // Fail-closed: gagal membaca izin berarti NOL izin, bukan semua izin.
    return new Set<string>()
  }
  return new Set(
    (data as Array<{ permission_key?: string }>)
      .map((d) => d.permission_key ?? '')
      .filter(Boolean),
  )
}
