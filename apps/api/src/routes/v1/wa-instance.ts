import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'
import { ambilKredensial, lupakanKredensial } from '../../lib/kredensial.js'
import { kunciNilai, empatAkhir, sandiSiap } from '../../lib/kredensial-sandi.js'

/**
 * SAMBUNGAN WHATSAPP — instance Evolution dikelola DARI UI Puraloka.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA LEWAT SINI, BUKAN PERAMBAN LANGSUNG KE EVOLUTION
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Evolution punya UI sendiri (`/manager`), dan di mesin ini foldernya KOSONG —
 * UI itu tak pernah ikut terpasang. Tetapi memasangnya pun bukan jawabannya:
 *
 *   1. Ia tak kenal tenant. Satu layar Manager memperlihatkan SELURUH instance
 *      di server, termasuk milik perusahaan lain. Untuk SaaS multi-tenant itu
 *      bukan ketidaknyamanan, itu kebocoran.
 *
 *   2. Ia menuntut `apikey` Evolution dipegang orang yang membukanya. Kunci itu
 *      berkuasa penuh atas SEMUA instance — memberikannya ke admin satu tenant
 *      berarti memberi kuasa atas tenant lain.
 *
 *   3. Peramban yang memanggil `:8081` langsung berarti `WA_API_KEY` harus
 *      dikirim ke sisi klien. Kunci yang sampai ke peramban SUDAH bocor —
 *      penjaga `audit-kredensial-tak-bocor` di repo ini berambang NOL justru
 *      untuk itu.
 *
 * Jadi seluruh percakapan dengan Evolution terjadi di server, dan yang keluar
 * ke peramban hanya: status, QR (gambar), dan nomor yang tersambung.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * MODEL MULTI-TENANT — OPSI (a), DIPUTUSKAN FOUNDER 2026-08-13
 * ══════════════════════════════════════════════════════════════════════════
 *
 * SATU server Evolution, BANYAK instance — satu instance per company.
 *
 * Yang membuatnya bekerja sudah ada sebelum berkas ini: `app_credentials`
 * ber-`UNIQUE (company_id, kunci)`, jadi `WA_INSTANCE` memang sudah bernilai
 * berbeda per tenant. Dan `wa-kirim.ts` sengaja membaca kredensial PER
 * PANGGILAN, bukan di-cache modul — komentarnya sendiri menjelaskan kenapa:
 * nilai yang di-cache akan dipakai tenant berikutnya, bentuk kebocoran yang
 * tak menghasilkan galat, hanya jawaban milik orang lain.
 *
 * Pindah ke opsi (b) nanti (Evolution terpisah per tenant) tak menuntut
 * perubahan skema — cukup `WA_BASE_URL` yang berbeda per tenant, dan itu
 * sudah per-tenant juga.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * NAMA INSTANCE DITURUNKAN, TIDAK DIKETIK
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diturunkan dari `company_id`. Nama yang diketik manusia bisa BENTROK antar
 * tenant di server yang sama — dan tenant yang kalah tak menerima galat, ia
 * hanya memakai instance milik tenant lain: pesan perusahaan A terkirim dari
 * nomor perusahaan B, riwayat keduanya bercampur.
 *
 * Persis kelas cacat yang sudah tercatat di CLAUDE.md §7 untuk n8n/Evolution
 * TJS vs Puraloka.
 */

/** Batas satu panggilan ke Evolution. Jaringan lambat tak boleh menahan UI. */
const TIMEOUT_MS = 20_000

interface KonfigEvolution {
  baseUrl: string
  apiKey: string
  instance: string | null
}

/**
 * Konfigurasi Evolution milik TENANT INI.
 *
 * `instance` boleh null — itu keadaan SAH (belum pernah dibuat), bukan galat.
 * Yang membedakan "belum dipasang" dari "rusak" adalah pesan di UI, dan
 * keduanya tak boleh terlihat sama.
 */
async function konfig(
  request: Parameters<typeof ambilKredensial>[0],
): Promise<KonfigEvolution | null> {
  const baseUrl = (await ambilKredensial(request, 'WA_BASE_URL'))?.trim()
  const apiKey = (await ambilKredensial(request, 'WA_API_KEY'))?.trim()
  if (!baseUrl || !apiKey) return null
  return {
    // Slash di ujung membuat `${base}/instance/...` jadi `//instance/...`, dan
    // sebagian reverse-proxy menjawab 404 untuk itu — galat yang menunjuk ke
    // tempat yang salah.
    baseUrl: baseUrl.replace(/\/+$/, ''),
    apiKey,
    instance: (await ambilKredensial(request, 'WA_INSTANCE'))?.trim() || null,
  }
}

type HasilEvo =
  | { ok: true; data: unknown }
  | { ok: false; status: number; pesan: string }

async function evo(
  cfg: KonfigEvolution,
  jalur: string,
  opsi: { method?: string; body?: unknown } = {},
): Promise<HasilEvo> {
  const kendali = new AbortController()
  const jam = setTimeout(() => kendali.abort(), TIMEOUT_MS)
  try {
    const r = await fetch(`${cfg.baseUrl}${jalur}`, {
      method: opsi.method ?? 'GET',
      headers: { 'content-type': 'application/json', apikey: cfg.apiKey },
      body: opsi.body === undefined ? undefined : JSON.stringify(opsi.body),
      signal: kendali.signal,
    })
    const teks = await r.text()
    if (!r.ok) {
      // Badan balasan DIPOTONG: Evolution bisa memulangkan jejak tumpukan
      // panjang, dan meneruskannya utuh ke UI hanya menakuti tanpa memberi
      // tahu apa yang harus dilakukan.
      return { ok: false, status: r.status, pesan: teks.slice(0, 300) }
    }
    try {
      return { ok: true, data: JSON.parse(teks) }
    } catch {
      return { ok: true, data: null }
    }
  } catch (e) {
    const pesan =
      kendali.signal.aborted
        ? `Evolution tak menjawab dalam ${TIMEOUT_MS / 1000} detik`
        : e instanceof Error ? e.message : String(e)
    return { ok: false, status: 503, pesan }
  } finally {
    clearTimeout(jam)
  }
}

/**
 * Nama instance milik satu company — stabil, dan tak mungkin bentrok.
 *
 * `company_id` adalah UUID; 12 heksadesimal pertamanya sudah cukup untuk
 * membedakan di satu server, dan tetap terbaca manusia saat menengok daftar
 * instance di Evolution.
 */
function namaInstance(companyId: string): string {
  return `puraloka-${companyId.replace(/-/g, '').slice(0, 12)}`
}

const BELUM_SIAP = {
  error:
    'Kredensial Evolution belum lengkap. Isi WA_BASE_URL dan WA_API_KEY di ' +
    'Pengaturan → Kredensial lebih dulu.',
}

export default async function waInstanceRoutes(app: FastifyInstance) {

  /**
   * GET /api/v1/wa/instance — status sambungan tenant ini.
   *
   * TIDAK memanggil `fetchInstances` (yang memulangkan SELURUH instance di
   * server, termasuk milik tenant lain). Hanya instance milik tenant ini yang
   * ditanyakan, dan hanya bila namanya memang sudah tersimpan.
   */
  app.get(
    '/api/v1/wa/instance',
    { preHandler: [authenticate, requirePermission('settings:wa:view')] },
    async (request, reply) => {
      const cfg = await konfig(request)
      if (!cfg) return reply.send({ siap: false, ...BELUM_SIAP })
      if (!cfg.instance) {
        return reply.send({ siap: true, instance: null, state: 'belum_dibuat' })
      }

      const st = await evo(cfg, `/instance/connectionState/${cfg.instance}`)
      if (!st.ok) {
        // 404 dari Evolution berarti namanya tersimpan di kredensial TAPI
        // instance-nya tak ada di sana — mis. server diganti, atau instance
        // dihapus dari sisi Evolution. Dibedakan supaya UI bisa menawarkan
        // "buat ulang" alih-alih menampilkan galat buntu.
        if (st.status === 404) {
          return reply.send({
            siap: true, instance: cfg.instance, state: 'hilang_di_server',
          })
        }
        return reply.status(502).send({
          error: `Evolution tak bisa dihubungi: ${st.pesan}`,
        })
      }

      const state =
        (st.data as { instance?: { state?: string } })?.instance?.state ?? 'tak_diketahui'

      let nomor: string | null = null
      if (state === 'open') {
        const daftar = await evo(cfg, '/instance/fetchInstances')
        if (daftar.ok && Array.isArray(daftar.data)) {
          const milik = (daftar.data as Array<Record<string, unknown>>)
            .find((x) => x.name === cfg.instance)
          // Hanya nomor MILIK instance tenant ini yang diambil dari daftar —
          // sisanya tak pernah menyeberang ke balasan.
          nomor = (milik?.ownerJid as string | undefined)?.split('@')[0] ?? null
        }
      }

      return reply.send({ siap: true, instance: cfg.instance, state, nomor })
    })

  /**
   * POST /api/v1/wa/instance — buat instance untuk tenant ini.
   *
   * Idempoten terhadap nama: memanggilnya dua kali tak membuat dua instance,
   * karena namanya diturunkan dan Evolution menolak nama yang sudah ada.
   * Yang sudah ada tetap dipakai — dan `WA_INSTANCE` tetap ditulis, karena
   * kasus "instance ada di Evolution tapi kredensialnya kosong" nyata terjadi
   * saat kredensial pernah dihapus.
   */
  app.post(
    '/api/v1/wa/instance',
    { preHandler: [authenticate, requirePermission('settings:wa:manage')] },
    async (request, reply) => {
      const cfg = await konfig(request)
      if (!cfg) return reply.status(422).send(BELUM_SIAP)

      if (!sandiSiap()) {
        return reply.status(503).send({
          error:
            'Enkripsi kredensial belum terkonfigurasi (CREDENTIAL_ENCRYPTION_KEY). ' +
            'Menyimpan nama instance ditolak.',
        })
      }

      const nama = namaInstance(request.companyId!)

      const buat = await evo(cfg, '/instance/create', {
        method: 'POST',
        body: {
          instanceName: nama,
          qrcode: true,
          integration: 'WHATSAPP-BAILEYS',
        },
      })

      // 403/409 = sudah ada. Itu BUKAN kegagalan di sini: yang diinginkan
      // pemanggil adalah "tenant ini punya instance bernama X", dan itu
      // sudah terpenuhi.
      const sudahAda = !buat.ok && (buat.status === 403 || buat.status === 409)
      if (!buat.ok && !sudahAda) {
        return reply.status(502).send({
          error: `Evolution menolak membuat instance: ${buat.pesan}`,
        })
      }

      const { error } = await request.db!
        .from('app_credentials')
        .upsert(
          {
            company_id: request.companyId!,
            kunci: 'WA_INSTANCE',
            nilai_enc: kunciNilai(nama),
            empat_akhir: empatAkhir(nama),
            catatan: 'Dibuat otomatis dari Pengaturan → Kanal WhatsApp',
            diperbarui_oleh: request.currentUser!.id,
            diperbarui_pada: new Date().toISOString(),
          },
          { onConflict: 'company_id,kunci' },
        )
        .select('kunci')
      if (error) {
        request.log.error({ err: error }, 'gagal menyimpan WA_INSTANCE')
        return reply.status(500).send({ error: 'Instance dibuat, tetapi namanya gagal disimpan' })
      }

      // Cache kredensial per-proses harus dilupakan — tanpa ini, panggilan
      // berikutnya di proses yang sama masih memakai nilai lama (atau null),
      // dan QR yang diminta menunjuk instance yang salah.
      lupakanKredensial(request.companyId!, 'WA_INSTANCE')

      void logAuditEvent(request, {
        tableName: 'app_credentials',
        recordId: 'WA_INSTANCE',
        action: 'wa.instance.create',
        actorId: request.currentUser!.id,
        newValues: { instance: nama, sudah_ada: sudahAda },
        severity: 'critical',
      })

      return reply.status(sudahAda ? 200 : 201).send({ instance: nama, sudahAda })
    })

  /**
   * GET /api/v1/wa/instance/qr — kode QR untuk dipindai.
   *
   * Yang keluar hanya `base64` gambarnya. `apikey` Evolution tak pernah
   * menyeberang ke peramban.
   */
  app.get(
    '/api/v1/wa/instance/qr',
    { preHandler: [authenticate, requirePermission('settings:wa:manage')] },
    async (request, reply) => {
      const cfg = await konfig(request)
      if (!cfg) return reply.status(422).send(BELUM_SIAP)
      if (!cfg.instance) {
        return reply.status(422).send({ error: 'Instance belum dibuat untuk perusahaan ini.' })
      }

      const st = await evo(cfg, `/instance/connectionState/${cfg.instance}`)
      const state =
        st.ok
          ? (st.data as { instance?: { state?: string } })?.instance?.state ?? 'tak_diketahui'
          : 'tak_diketahui'

      // Sudah tersambung → TIDAK meminta QR.
      //
      // `/instance/connect` pada instance yang sudah `open` bisa memutus
      // sesi yang sedang berjalan di sebagian versi Evolution. Membuka
      // halaman QR karena penasaran lalu memutus WhatsApp yang sedang
      // dipakai adalah kerusakan yang tak bisa ditarik kembali.
      if (state === 'open') {
        return reply.send({ state, base64: null, pesan: 'Sudah tersambung.' })
      }

      const q = await evo(cfg, `/instance/connect/${cfg.instance}`)
      if (!q.ok) {
        return reply.status(502).send({ error: `Gagal meminta QR: ${q.pesan}` })
      }
      const d = q.data as { base64?: string; pairingCode?: string | null }
      return reply.send({
        state,
        base64: d?.base64 ?? null,
        pairingCode: d?.pairingCode ?? null,
      })
    })

  /**
   * POST /api/v1/wa/instance/putus — memutus sesi, instance TETAP ADA.
   *
   * Dipakai untuk berganti nomor: putuskan, lalu pindai QR dengan nomor lain.
   * Tak menghapus apa pun, jadi tak butuh konfirmasi berlapis.
   */
  app.post(
    '/api/v1/wa/instance/putus',
    { preHandler: [authenticate, requirePermission('settings:wa:manage')] },
    async (request, reply) => {
      const cfg = await konfig(request)
      if (!cfg) return reply.status(422).send(BELUM_SIAP)
      if (!cfg.instance) {
        return reply.status(422).send({ error: 'Instance belum dibuat untuk perusahaan ini.' })
      }

      const r = await evo(cfg, `/instance/logout/${cfg.instance}`, { method: 'DELETE' })
      if (!r.ok) {
        return reply.status(502).send({ error: `Gagal memutus sesi: ${r.pesan}` })
      }

      void logAuditEvent(request, {
        tableName: 'app_credentials',
        recordId: 'WA_INSTANCE',
        action: 'wa.instance.logout',
        actorId: request.currentUser!.id,
        newValues: { instance: cfg.instance },
        severity: 'critical',
      })

      return reply.send({ ok: true })
    })
}
