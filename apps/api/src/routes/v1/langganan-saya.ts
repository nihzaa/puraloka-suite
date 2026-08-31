import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'

/**
 * LANGGANAN SAYA — apa yang perusahaan ini bayar, dan tagihannya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-31: pelanggan tak punya tempat melihat tagihannya. Layar
 * billing yang ada milik konsol vendor — yang membukanya founder.
 *
 * Akibatnya berurutan dan buruk: pelanggan tak tahu sudah bayar berapa,
 * kurang berapa, jatuh tempo kapan. Lalu 30 hari sesudah lewat tempo akunnya
 * jadi baca-saja dengan pesan yang menyebut nomor tagihan — nomor yang tak
 * pernah bisa ia periksa di mana pun.
 *
 * Membekukan akun atas tagihan yang tak bisa dilihat pemiliknya adalah bentuk
 * penegakan yang paling mudah dibenci.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * TIDAK DIGERBANG MODUL — ini jalur pemulihan
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Sengaja TANPA `requireModul`. Halaman langganan adalah tempat pelanggan
 * mencari tahu kenapa sesuatu tertutup, dan menggerbangnya berarti mengunci
 * orang di luar pintu yang ia bayar untuk masuk.
 *
 * Azure memperlihatkan kegagalannya: invoice terkunci → pembayaran swalayan
 * dinonaktifkan → pelanggan yang INGIN membayar harus menelepon dukungan.
 *
 * Dijaga `audit-modul-punya-gerbang.mjs` (daftar JALUR_PEMULIHAN).
 */
export default async function langgananSayaRoutes(app: FastifyInstance) {
  /**
   * GET /api/v1/langganan-saya
   *
   * Paket yang berlaku, keadaan akun, dan riwayat tagihan — satu panggilan.
   * Dipisah jadi tiga endpoint berarti tiga bolak-balik untuk satu layar yang
   * selalu menampilkan ketiganya bersamaan.
   */
  app.get(
    '/api/v1/langganan-saya',
    // `settings:manage` — keadaan langganan adalah urusan pengelola
    // perusahaan, bukan tiap pengguna. Kuncinya diperiksa ke tabel
    // `permissions`, bukan ditebak (audit-izin-benar-ada.mjs, ambang NOL).
    { preHandler: [authenticate, requirePermission('settings:manage')] },
    async (request, reply) => {
      const db = request.db!

      // ── Paket & keadaan akun ────────────────────────────────────────────
      const { data: snapshot, error: eSnap } = await db
        .from('entitlement_snapshot')
        .select('kunci, terbuka, batas, paket_kode, paket_nama, alasan, disegarkan')

      if (eSnap) {
        // Galat TIDAK didiamkan jadi "belum berlangganan": layar yang berkata
        // "tak ada langganan" pada pelanggan yang membayar adalah kesalahan
        // yang memicu telepon, dan penyebabnya tak terlihat di mana pun.
        return reply.status(500).send({ error: `Gagal memuat langganan: ${eSnap.message}` })
      }

      type Baris = {
        kunci: string
        terbuka: boolean | null
        batas: number | null
        paket_kode: string | null
        paket_nama: string | null
        alasan: string | null
        disegarkan: string
      }

      const baris = (snapshot ?? []) as Baris[]

      // Keadaan sistem dipisah dari fitur: `sistem.*` bukan sesuatu yang
      // dijual, ia keadaan akun.
      const sistem = baris.find((b) => b.kunci === 'sistem.baca_saja')
      const fitur = baris.filter((b) => !b.kunci.startsWith('sistem.'))

      const modulTerbuka = fitur.filter((b) => b.kunci.startsWith('modul.') && b.terbuka !== false)
      const modulTertutup = fitur.filter((b) => b.kunci.startsWith('modul.') && b.terbuka === false)
      const kuota = fitur.filter((b) => b.kunci.startsWith('kuota.'))

      // Nama paket diambil dari baris mana pun yang punya — seluruh baris satu
      // tenant berasal dari satu dorongan, jadi nilainya sama.
      const paketNama = baris.find((b) => b.paket_nama)?.paket_nama ?? null
      const paketKode = baris.find((b) => b.paket_kode)?.paket_kode ?? null

      // ── Tagihan ─────────────────────────────────────────────────────────
      const { data: tagihan, error: eTagihan } = await db
        .from('tagihan_tenant')
        .select('nomor, jumlah_idr, status, periode_mulai, periode_selesai, jatuh_tempo, dibayar_pada, cara_bayar')
        .order('jatuh_tempo', { ascending: false })
        // Batas eksplisit: tanpa ia, PostgREST memotong senyap di 1.000 baris
        // (dijaga `audit-baca-tak-terpotong.mjs`). Lima tahun langganan
        // bulanan = 60 baris, jadi 200 jauh di atas kebutuhan nyata.
        .limit(200)

      if (eTagihan) {
        return reply.status(500).send({ error: `Gagal memuat tagihan: ${eTagihan.message}` })
      }

      type BarisTagihan = {
        nomor: string
        jumlah_idr: string | number
        status: string
        jatuh_tempo: string
        dibayar_pada: string | null
        cara_bayar: string | null
      }

      const daftarTagihan = (tagihan ?? []) as unknown as BarisTagihan[]

      // ⚠ `Number()` di sini, bukan di layar. `numeric` PostgREST datang
      // sebagai STRING, dan menjumlahkannya di JavaScript tanpa konversi
      // menghasilkan "150000" + "200000" = "150000200000" — angka yang salah
      // besaran ribuan kali, tanpa satu pun galat.
      const belumLunas = daftarTagihan.filter(
        (t) => t.dibayar_pada === null && t.status !== 'dibatalkan'
      )
      const totalBelumLunas = belumLunas.reduce((n, t) => n + Number(t.jumlah_idr), 0)

      return reply.send({
        paket: { kode: paketKode, nama: paketNama },
        keadaan: {
          bacaSaja: sistem?.terbuka === false,
          alasan: sistem?.alasan ?? null,
          disegarkan: baris[0]?.disegarkan ?? null,
        },
        modul: {
          terbuka: modulTerbuka.map((b) => b.kunci),
          tertutup: modulTertutup.map((b) => b.kunci),
        },
        kuota: kuota.map((b) => ({ kunci: b.kunci, batas: b.batas })),
        tagihan: daftarTagihan.map((t) => ({
          ...t,
          jumlah_idr: Number(t.jumlah_idr),
        })),
        ringkasTagihan: {
          belumLunas: belumLunas.length,
          totalBelumLunas,
          caraBayar: daftarTagihan.find((t) => t.cara_bayar)?.cara_bayar ?? null,
        },
      })
    }
  )
}
