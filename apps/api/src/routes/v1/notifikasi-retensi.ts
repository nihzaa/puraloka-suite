/**
 * POST /api/v1/notifikasi/bersihkan — retensi notifikasi.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA RUTE INI ADA — diukur 2026-08-31 di basis produksi
 * ══════════════════════════════════════════════════════════════════════════
 *
 *     8.893 notifikasi · 0 dibaca · tertua 15 hari
 *
 *     0-1 hari    1.941
 *     1-7 hari    2.553
 *     7-30 hari   4.399
 *
 * Tak ada setelan retensi, tak ada tugas pembersih. Notifikasi menumpuk sejak
 * hari pertama dan tak pernah berkurang.
 *
 * ── KENAPA INI BUKAN SEKADAR KOTOR
 *
 * Kotak masuk berisi ribuan baris tak terbaca berhenti berfungsi sebagai kotak
 * masuk. Orang tak menggulir 8.893 baris mencari yang penting — mereka berhenti
 * membukanya sama sekali, dan yang mendesak tenggelam bersama yang tidak.
 *
 * Akar yang sama dengan cacat 2026-08-16 (9.009 notifikasi, 3 dibaca) yang
 * melahirkan jeda melandai. Bedanya: jeda melandai menahan PENGULANGAN, dan ia
 * BEKERJA — diukur hari ini, 17 notifikasi berarti 17 catatan berbeda, bukan
 * satu catatan ditagih 17 kali.
 *
 * Yang belum ditangani: yang sudah tak relevan tetap tinggal selamanya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG TIDAK PERNAH DIHAPUS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Notifikasi `urgent` yang BELUM dibaca — berapa pun umurnya. Ia berarti
 * sesuatu yang berbahaya (temuan K3 lewat tenggat, beton gagal, baku mutu
 * terlampaui) dan belum ada yang melihatnya. Menghapusnya karena "sudah lama"
 * kebalikan dari yang seharusnya: makin lama tak dibaca, makin mendesak dibaca.
 *
 * Kalau kotak masuk penuh oleh yang mendesak, jawabannya mengerjakannya.
 *
 * ── KENAPA PER-TENANT, BEDA DARI `idempotensi/bersihkan`
 *
 * Kunci idempotensi tak punya nilai bagi siapa pun sesudah jendela kirim-ulang
 * lewat — batasnya keputusan teknis. Notifikasi lain: berapa lama riwayat
 * peringatan disimpan adalah KEBIJAKAN, dan perusahaan yang diaudit ketat
 * punya kebutuhan berbeda dari yang tidak.
 *
 * Jadi ambangnya dibaca dari `company_settings` per tenant, dengan bawaan yang
 * dipasang migrasi.
 *
 * ── KENAPA POST, BUKAN GET
 *
 * Ia MENGHAPUS baris. Rute otomasi yang hanya memeriksa & mengirim notifikasi
 * memakai GET; yang menulis memakai POST — pola sama `ai/retensi/bersihkan`
 * dan `idempotensi/bersihkan`.
 */
import type { FastifyInstance } from 'fastify'
import { timingSafeEqual } from 'node:crypto'
import { supabase } from '../../utils/supabase.js'
import { nilaiRetensi } from '../../lib/retensi-notifikasi.js'

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
 * Bawaan bila tenant belum menyetel apa pun.
 *
 * Dipakai HANYA sebagai jaring pengaman — migrasi memasang setelannya untuk
 * tiap tenant aktif. Yang jatuh ke sini adalah tenant yang dibuat SESUDAH
 * migrasi itu, dan menghapus notifikasi mereka dengan angka yang lebih agresif
 * daripada yang pernah mereka lihat di layar akan terasa seperti kehilangan
 * data.
 *
 * Karena itu bawaannya sengaja LONGGAR — lebih baik menyimpan terlalu lama
 * daripada menghapus sesuatu yang pemiliknya tak pernah setujui.
 */
const BAWAAN_DIBACA = 30
const BAWAAN_TAK_DIBACA = 90

/** Berapa baris dihapus sekali jalan. Melindungi dari kunci tabel panjang. */
const UKURAN_BATCH = 500

export default async function notifikasiRetensiRoutes(app: FastifyInstance) {
  app.post('/api/v1/notifikasi/bersihkan', async (request, reply) => {
    /*
      Dipanggil penjadwal, bukan pengguna. Gagal-TERTUTUP: kalau rahasianya tak
      disetel, rutenya MATI alih-alih terbuka.

      Rute yang menghapus baris dan terbuka tanpa gerbang adalah tombol hapus
      yang bisa ditekan siapa saja yang tahu jalurnya.
    */
    const rahasia = process.env.SCHEDULER_SECRET?.trim()
    if (!rahasia) {
      request.log.error('notifikasi/bersihkan: SCHEDULER_SECRET belum disetel — rute dimatikan')
      return reply.status(503).send({ error: 'Penjadwal belum terkonfigurasi' })
    }
    const diberikan = (request.headers['x-scheduler-secret'] as string | undefined)?.trim() ?? ''
    if (!diberikan || !rahasiaCocok(diberikan, rahasia)) {
      return reply.status(401).send({ error: 'Rahasia penjadwal tidak cocok' })
    }

    /*
      `?dryrun=1` — menghitung TANPA menghapus.

      Ada karena rute ini menghapus, dan yang menghapus layak bisa dilihat
      dulu. Dipakai saat menyetel ambang: jalankan kering, lihat berapa yang
      akan hilang, baru putuskan.
    */
    const q = request.query as { dryrun?: string }
    const kering = q.dryrun === '1' || q.dryrun === 'true'

    /*
      `supabase` mentah, BUKAN `request.db`.

      Pembersihan ini LINTAS TENANT — penjadwal berjalan tanpa konteks tenant,
      dan `request.db` akan memulangkan nol baris. Penyaringan per-tenant
      dikerjakan eksplisit di bawah lewat `company_id`, dan ambangnya pun
      diambil per-tenant.
    */
    const { data: setelan, error: eSetelan } = await supabase
      .from('company_settings')
      .select('company_id, key, value')
      .in('key', ['notifikasi.retensi.hari_dibaca', 'notifikasi.retensi.hari_tak_dibaca'])

    if (eSetelan) {
      request.log.error({ err: eSetelan }, 'notifikasi/bersihkan: setelan tak terbaca')
      return reply.status(500).send({ error: 'Setelan retensi tak terbaca' })
    }

    const ambang = new Map<string, { dibaca: number; takDibaca: number }>()
    for (const s of (setelan ?? []) as Array<{ company_id: string; key: string; value: unknown }>) {
      const a = ambang.get(s.company_id) ?? { dibaca: BAWAAN_DIBACA, takDibaca: BAWAAN_TAK_DIBACA }
      const n = Number(typeof s.value === 'object' ? JSON.stringify(s.value) : s.value)
      if (Number.isFinite(n) && n > 0) {
        if (s.key.endsWith('hari_dibaca')) a.dibaca = n
        else a.takDibaca = n
      }
      ambang.set(s.company_id, a)
    }

    /*
      Dibaca BERHALAMAN — PostgREST memotong senyap di 1.000 baris.

      Penjaga `audit-baca-tak-terpotong` berambang NOL karena alasan itu, dan
      di sini akibat terpotongnya khusus: pembersih yang cuma melihat 1.000
      baris pertama akan melaporkan "selesai" sambil meninggalkan sisanya —
      dan karena ia berjalan tiap hari, tumpukannya tak pernah habis.
    */
    const HALAMAN = 1000
    const semua: Array<Record<string, unknown>> = []
    for (let dari = 0; ; dari += HALAMAN) {
      const r = await supabase
        .from('notifications')
        .select('id, company_id, created_at, is_read, priority')
        .order('id', { ascending: true })
        .range(dari, dari + HALAMAN - 1)
      if (r.error) {
        request.log.error({ err: r.error }, 'notifikasi/bersihkan: gagal membaca notifikasi')
        return reply.status(500).send({ error: 'Notifikasi tak terbaca' })
      }
      if (!r.data || r.data.length === 0) break
      semua.push(...(r.data as unknown as Array<Record<string, unknown>>))
      if (r.data.length < HALAMAN) break
    }

    const sekarang = Date.now()
    const HARI = 86_400_000
    const hitung = {
      masih_baru: 0,
      dibaca_kedaluwarsa: 0,
      tak_dibaca_kedaluwarsa: 0,
      mendesak_dilindungi: 0,
    }
    const buang: string[] = []

    for (const n of semua) {
      const t = Date.parse(String(n.created_at ?? ''))
      const cid = (n.company_id as string | null) ?? ''
      const a = ambang.get(cid) ?? { dibaca: BAWAAN_DIBACA, takDibaca: BAWAAN_TAK_DIBACA }

      const h = nilaiRetensi(
        {
          umurHari: Number.isNaN(t) ? Number.NaN : Math.floor((sekarang - t) / HARI),
          sudahDibaca: n.is_read === true,
          prioritas: String(n.priority ?? 'normal'),
        },
        a.dibaca,
        a.takDibaca,
      )

      hitung[h.sebab]++
      if (h.hapus) buang.push(n.id as string)
    }

    let terhapus = 0
    if (!kering) {
      /*
        Dihapus per potongan, bukan sekaligus.

        `.in('id', [...8000 id])` menghasilkan URL yang melewati batas panjang
        PostgREST dan gagal — dengan galat yang menyebut URL, bukan jumlahnya.
        Potongan juga menahan kunci tabel lebih pendek.
      */
      for (let i = 0; i < buang.length; i += UKURAN_BATCH) {
        const potongan = buang.slice(i, i + UKURAN_BATCH)
        const { error } = await supabase.from('notifications').delete().in('id', potongan)
        if (error) {
          request.log.error(
            { err: error, sudah_terhapus: terhapus, sisa: buang.length - terhapus },
            'notifikasi/bersihkan: gagal menghapus potongan',
          )
          /*
            Dilaporkan sebagai kegagalan SEBAGIAN, bukan 500 polos.

            Yang sudah terhapus tetap terhapus; menyembunyikannya di balik
            galat generik membuat jalan berikutnya tak tahu berapa yang tersisa.
          */
          return reply.status(500).send({
            error: 'Gagal menghapus sebagian notifikasi',
            terhapus,
            sisa: buang.length - terhapus,
          })
        }
        terhapus += potongan.length
      }
    }

    request.log.info(
      { terhapus, kering, dibaca: semua.length, ...hitung },
      'notifikasi: retensi dijalankan',
    )

    return reply.send({
      success: true,
      kering,
      dibaca: semua.length,
      akan_dihapus: buang.length,
      terhapus,
      ...hitung,
      tenant_bersetelan: ambang.size,
      bawaan: { hari_dibaca: BAWAAN_DIBACA, hari_tak_dibaca: BAWAAN_TAK_DIBACA },
    })
  })
}
