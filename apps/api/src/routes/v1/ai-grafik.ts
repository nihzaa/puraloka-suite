/**
 * GET /api/v1/ai/grafik/kurva-s/:projectId — kurva S sebagai GAMBAR.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA MEMANGGIL RUTE YANG SUDAH ADA, BUKAN MENGHITUNG SENDIRI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Angkanya datang dari `/api/v1/projects/:id/kurva-s` lewat `server.inject`,
 * pola yang sudah dipakai automation 3.18 (`otomasi-terjadwal.ts`).
 *
 * Menghitung ulang di sini akan membuat DUA sumber angka untuk satu kurva —
 * dan yang kedua pasti menyimpang, karena rumus EVM di rute itu sudah
 * diperbaiki berkali-kali (sumber PV, cakupan jadwal, serapan vs aktual kas).
 * Grafik yang menampilkan angka berbeda dari halaman proyek lebih buruk
 * daripada tak ada grafik: dua-duanya terlihat resmi.
 *
 * Efek sampingnya menguntungkan — `authenticate`, izin, dan saringan tenant
 * rute itu berlaku apa adanya. Tak ada jalan pintas yang dibuat demi gambar.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG TIDAK DIGAMBAR
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Minggu yang tak punya data tetap kosong (`null`), sehingga garisnya PUTUS.
 * Rute sumber mengembalikan `progress` kumulatif yang bisa `0` untuk minggu
 * yang belum dilaporkan — nol itu BUKAN "progres nol", melainkan "belum ada
 * laporan", dan menggambarnya sebagai nol menuduh lapangan tak bekerja.
 */

import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { requireModul } from '../../utils/gerbang-modul.js'
import { grafikGarisSvg, svgKePng, WARNA_DERET } from '../../lib/grafik-svg.js'

interface TitikKurva {
  week?: string
  rencana?: number | null
  serapan?: number | null
  progress?: number | null
}

export default async function aiGrafikRoutes(app: FastifyInstance) {
  app.get<{ Params: { projectId: string }; Querystring: { format?: string } }>(
    '/api/v1/ai/grafik/kurva-s/:projectId',
    {
      preHandler: [authenticate, requireModul('modul.ai'), requirePermission('projects:view')],
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const { projectId } = request.params

      const res = await request.server.inject({
        method: 'GET',
        url: `/api/v1/projects/${projectId}/kurva-s`,
        headers: {
          // Token PEMANGGIL diteruskan apa adanya — izin & tenant rute sumber
          // berlaku persis sama. Tak ada akun layanan di jalur ini.
          authorization: request.headers.authorization ?? '',
          'x-company-id': (request.headers['x-company-id'] as string) ?? '',
        },
      })

      if (res.statusCode !== 200) {
        /*
          Diteruskan APA ADANYA, tidak diseragamkan jadi 500.

          404 dari rute sumber berarti "proyek tak ditemukan / bukan milik
          tenant ini" — jawaban yang benar dan sudah tepat. Menerjemahkannya
          jadi 500 akan membuat pemanggil mengira sistemnya rusak, lalu
          mencoba ulang untuk sesuatu yang tak akan pernah berhasil.
        */
        request.log.warn({ status: res.statusCode, projectId }, 'ai/grafik: kurva-s tak terbaca')
        return reply
          .status(res.statusCode)
          .send({ error: `Data kurva S tak bisa dibaca (${res.statusCode}).` })
      }

      const badan = res.json() as {
        meta?: { latestRencanaPct?: number; latestSerapanPct?: number; deviasi?: number }
        chartData?: TitikKurva[]
      }

      const data = Array.isArray(badan.chartData) ? badan.chartData : []
      const angka = (v: unknown): number | null =>
        typeof v === 'number' && Number.isFinite(v) ? v : null

      const svg = grafikGarisSvg({
        judul: 'Kurva S — rencana vs realisasi',
        subjudul:
          badan.meta && typeof badan.meta.deviasi === 'number'
            ? `Deviasi ${badan.meta.deviasi > 0 ? '+' : ''}${badan.meta.deviasi.toFixed(1)}% terhadap rencana`
            : undefined,
        satuan: '%',
        labelX: data.map((d) => String(d.week ?? '')),
        deret: [
          { nama: 'Rencana', warna: WARNA_DERET.rencana, titik: data.map((d) => angka(d.rencana)) },
          { nama: 'Serapan', warna: WARNA_DERET.aktual, titik: data.map((d) => angka(d.serapan)) },
          { nama: 'Progres fisik', warna: WARNA_DERET.ketiga, titik: data.map((d) => angka(d.progress)) },
        ],
      })

      // SVG untuk web (tajam di layar apa pun), PNG untuk WhatsApp.
      if ((request.query?.format ?? '').toLowerCase() === 'svg') {
        return reply.type('image/svg+xml').send(svg)
      }

      try {
        const png = await svgKePng(svg)
        return reply.type('image/png').send(png)
      } catch (err) {
        // `sharp` adalah binary native; kegagalannya (arsitektur, libvips)
        // tak boleh menjatuhkan seluruh permintaan tanpa penjelasan.
        request.log.error({ err }, 'ai/grafik: gagal merender PNG')
        return reply.status(503).send({ error: 'Perender gambar tidak tersedia.' })
      }
    },
  )
}
