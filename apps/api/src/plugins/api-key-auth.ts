import type { FastifyRequest, FastifyReply } from 'fastify'
import { supabase } from '../utils/supabase.js'
import {
  hashKunci, bentukSah, periksaKunci, punyaIzin,
  type KunciTersimpan,
} from '../lib/api-key.js'

/**
 * AUTENTIKASI LEWAT API KEY (G6c) — jalan masuk bagi sistem luar.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA JALUR TERPISAH, BUKAN MENAMBAH CABANG DI `authenticate()`
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `authenticate()` sudah menangani dua sumber token (Bearer header, cookie)
 * dan menurunkan `currentUser` beserta peran per-company. Menambahkan cabang
 * ketiga di sana berarti setiap rute yang memakainya diam-diam ikut menerima
 * API key — termasuk rute yang tak pernah dimaksudkan untuk mesin.
 *
 * Pintu yang terbuka karena tak ada yang memutuskan untuk menutupnya adalah
 * bentuk kegagalan yang paling sering di modul otorisasi. Karena itu di sini:
 * rute HARUS menyatakan dirinya menerima API key.
 *
 * ── Kenapa balasan penolakan TIDAK membedakan sebab
 *
 * `periksaKunci()` membedakan tak-dikenal / dicabut / kedaluwarsa, dan itu
 * dipakai untuk LOG. Yang dikirim ke pemanggil selalu sama: 401 dengan pesan
 * yang identik.
 *
 * Membedakannya berarti memberi tahu penyerang bahwa sebuah kunci "dikenal
 * tetapi kedaluwarsa" — dan itu sudah mengkonfirmasi kunci tersebut pernah
 * ada, yang cukup untuk menyempitkan pencarian.
 *
 * ── Kenapa `supabase` mentah dan bukan `request.db`
 *
 * `request.db` sadar-tenant, dan tenant-nya justru BELUM DIKETAHUI di titik
 * ini — company_id-nya berasal dari kunci yang sedang diperiksa. Ini satu
 * dari sedikit tempat yang memang harus mendahului gerbang tenancy, sama
 * seperti `authenticate()` sendiri.
 */

declare module 'fastify' {
  interface FastifyRequest {
    /** Terisi HANYA kalau permintaan datang lewat API key yang sah. */
    apiKey?: {
      id: string
      companyId: string
      izin: string[]
    }
  }
}

const PENOLAKAN = { error: 'Kunci API tidak valid' }

/**
 * Membaca kunci dari header.
 *
 * `X-API-Key` dan bukan `Authorization: Bearer` — supaya tak tertukar dengan
 * token sesi manusia. Dua kredensial berbeda di header yang sama adalah cara
 * paling mudah mengirim yang salah ke tempat yang salah tanpa gejala.
 */
function bacaHeader(request: FastifyRequest): string | null {
  const h = request.headers['x-api-key']
  const v = Array.isArray(h) ? h[0] : h
  return typeof v === 'string' && v.length > 0 ? v : null
}

/**
 * Mencatat pemakaian.
 *
 * Sengaja TIDAK di-await oleh pemanggil: pencatatan yang gagal tak boleh
 * menggagalkan permintaan yang sah. Tetapi galatnya TETAP dicatat — kegagalan
 * senyap di jalur audit berarti jejak yang hilang tanpa ada yang tahu.
 */
async function catatPakai(
  request: FastifyRequest,
  apiKeyId: string,
  status: number,
): Promise<void> {
  const { error } = await supabase.from('api_key_pakai').insert({
    api_key_id: apiKeyId,
    metode: request.method,
    jalur: request.url.split('?')[0],
    status,
    ip: request.ip,
  })
  if (error) {
    request.log.error({ err: error, apiKeyId }, 'gagal mencatat pemakaian kunci API')
  }

  // Penghitung di baris kunci — dipakai layar untuk menjawab "kunci mana yang
  // sudah lama tak dipakai dan sebaiknya dicabut".
  const { error: eHitung } = await supabase.rpc('api_key_catat_pakai', { p_id: apiKeyId })
  if (eHitung) {
    request.log.error({ err: eHitung, apiKeyId }, 'gagal menaikkan penghitung pakai')
  }
}

/**
 * preHandler: menerima permintaan yang membawa API key sah dengan izin yang
 * diminta.
 *
 * Gagal-tertutup pada SETIAP cabang: header hilang, bentuk salah, query
 * gagal, kunci tak ditemukan, dicabut, kedaluwarsa, izin kurang — semuanya
 * menolak. Tidak ada jalur yang "melanjutkan saja".
 */
export function requireApiKey(izinDiperlukan: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const kunci = bacaHeader(request)
    if (!kunci) {
      return reply.status(401).send({ error: 'Header X-API-Key wajib diisi' })
    }

    // Bentuk diperiksa lebih dulu supaya tebakan asal tak menyentuh basis.
    if (!bentukSah(kunci)) {
      request.log.warn({ ip: request.ip }, 'kunci API berbentuk salah ditolak')
      return reply.status(401).send(PENOLAKAN)
    }

    const { data, error } = await supabase
      .from('api_key')
      .select('id, company_id, izin, kedaluwarsa_pada, dicabut_pada')
      .eq('hash_kunci', hashKunci(kunci))
      .maybeSingle()

    if (error) {
      // Query gagal → TOLAK. Melanjutkan "karena mungkin basis sedang sibuk"
      // berarti gangguan basis berubah jadi lubang otorisasi.
      request.log.error({ err: error }, 'gagal memeriksa kunci API')
      return reply.status(503).send({ error: 'Tidak bisa memverifikasi kunci saat ini' })
    }

    const hasil = periksaKunci(data as KunciTersimpan | null)
    if (!hasil.sah) {
      // Sebabnya dicatat di LOG, tidak dikirim ke pemanggil — lihat kepala.
      request.log.warn(
        { kode: hasil.kode, ip: request.ip, apiKeyId: (data as { id?: string })?.id },
        `kunci API ditolak: ${hasil.alasan}`)
      if (data) void catatPakai(request, (data as { id: string }).id, 401)
      return reply.status(401).send(PENOLAKAN)
    }

    const k = hasil.kunci
    if (!punyaIzin(k.izin, izinDiperlukan)) {
      request.log.warn(
        { apiKeyId: k.id, perlu: izinDiperlukan },
        'kunci API tak punya izin yang diminta')
      void catatPakai(request, k.id, 403)
      // 403 di sini SAH dibedakan dari 401: pemegang kunci sudah terbukti
      // memegang kredensial yang benar, jadi memberitahunya bahwa izinnya
      // kurang tidak membocorkan apa pun kepada orang luar.
      return reply.status(403).send({
        error: `Kunci API tidak punya izin: ${izinDiperlukan}`,
      })
    }

    request.apiKey = {
      id: k.id,
      companyId: k.company_id,
      izin: k.izin ?? [],
    }

    void catatPakai(request, k.id, 200)
  }
}
