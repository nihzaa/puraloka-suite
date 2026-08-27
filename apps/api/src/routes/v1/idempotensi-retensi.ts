/**
 * POST /api/v1/idempotensi/bersihkan — retensi kunci idempotensi.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA RUTE INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Migrasi 508 membuat `fn_bersihkan_idempotency_kadaluarsa()`, dan sampai
 * berkas ini ada, **fungsi itu tak pernah dipanggil siapa pun**. Fungsi
 * pembersih yang tak pernah berjalan sama saja dengan tak ada — hanya lebih
 * menyesatkan, karena pemeriksaan skema melaporkannya "ada".
 *
 * Ini bentuk cacat yang sama persis dengan yang dicatat `ai-retensi.ts`:
 * kolom `retensi_hari` yang tampil di layar tapi tak pernah menghapus baris.
 * Bedanya, di sini yang menumpuk bukan percakapan melainkan kunci
 * idempotensi — dan sejak antrean offline mobile hidup, TIAP kiriman progres
 * & kasbon dari TIAP HP mandor menulis satu baris ke sana.
 *
 * ── Kenapa tak ada yang perlu diputuskan per-tenant
 *
 * Beda dari retensi percakapan (yang batasnya pilihan tenant), kunci
 * idempotensi tak punya nilai bagi siapa pun sesudah jendela pengiriman
 * ulang lewat. Batas 7 harinya keputusan teknis, bukan kebijakan — alasannya
 * tertulis di migrasi 508.
 *
 * ── Kenapa POST, bukan GET
 *
 * Ia MENGHAPUS baris. Rute otomasi lain yang hanya memeriksa & mengirim
 * notifikasi memakai GET; yang menulis memakai POST, pola sama
 * `ai/retensi/bersihkan`.
 */
import type { FastifyInstance } from 'fastify'
import { timingSafeEqual } from 'node:crypto'
import { supabase } from '../../utils/supabase.js'

/** Bandingkan rahasia tanpa membocorkan panjangnya lewat waktu. */
function rahasiaCocok(diberikan: string, benar: string): boolean {
  const a = Buffer.from(diberikan)
  const b = Buffer.from(benar)
  if (a.length !== b.length) {
    timingSafeEqual(b, b)
    return false
  }
  return timingSafeEqual(a, b)
}

/**
 * Umur bawaan, SAMA dengan bawaan fungsi SQL-nya (migrasi 508).
 *
 * Ditulis di sini juga supaya balasannya bisa menyebut angka yang dipakai —
 * penjadwal yang melaporkan "berhasil" tanpa menyebut umurnya tak memberi
 * tahu apa pun tentang apa yang barusan dihapus.
 */
const UMUR_HARI = 7

export default async function idempotensiRetensiRoutes(app: FastifyInstance) {
  app.post('/api/v1/idempotensi/bersihkan', async (request, reply) => {
    /*
      Dipanggil penjadwal, bukan pengguna. Gagal-TERTUTUP: kalau rahasianya
      tak disetel, rutenya MATI alih-alih terbuka.

      Pola identik `ai/retensi/bersihkan` — dan alasannya bukan kerapian:
      rute yang menghapus baris dan terbuka tanpa gerbang adalah tombol hapus
      yang bisa ditekan siapa saja yang tahu jalurnya.
    */
    const rahasia = process.env.SCHEDULER_SECRET?.trim()
    if (!rahasia) {
      request.log.error('idempotensi/bersihkan: SCHEDULER_SECRET belum disetel — rute dimatikan')
      return reply.status(503).send({ error: 'Penjadwal belum terkonfigurasi' })
    }
    const diberikan = (request.headers['x-scheduler-secret'] as string | undefined)?.trim() ?? ''
    if (!diberikan || !rahasiaCocok(diberikan, rahasia)) {
      return reply.status(401).send({ error: 'Rahasia penjadwal tidak cocok' })
    }

    /*
      `supabase` mentah, BUKAN `request.db`.

      Pembersihan ini LINTAS TENANT — kunci kedaluwarsa milik siapa pun tak
      berguna lagi. Menyaringnya per-tenant justru salah: penjadwal berjalan
      tanpa konteks tenant, dan `request.db` akan memulangkan nol baris.

      Fungsinya sendiri `SECURITY DEFINER` ber-`search_path` dipaku, jadi
      cakupannya sudah ditentukan di sisi basis.
    */
    const { data, error } = await supabase.rpc('fn_bersihkan_idempotency_kadaluarsa', {
      p_umur_hari: UMUR_HARI,
    })

    if (error) {
      request.log.error({ err: error }, 'idempotensi/bersihkan: gagal menjalankan fungsi')
      return reply.status(500).send({ error: 'Gagal membersihkan kunci idempotensi' })
    }

    const terhapus = Number(data ?? 0)
    request.log.info({ terhapus, umur_hari: UMUR_HARI }, 'idempotensi: kunci kedaluwarsa dibersihkan')

    return reply.send({
      terhapus,
      umur_hari: UMUR_HARI,
    })
  })
}
