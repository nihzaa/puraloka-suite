import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission, hasPermission } from '../../plugins/auth.js'
import {
  SUMBER, OPERATOR, BATAS_MAKS,
  periksaSusunan, daftarSelect, nilaiSaringan,
  type Susunan,
} from '../../lib/laporan-susun.js'

/**
 * REPORT BUILDER (G6d) — menjalankan susunan yang sudah diperiksa.
 *
 * ── Dua gerbang, bukan satu
 *
 * `requirePermission('reports:susun')` menjaga bahwa orangnya boleh memakai
 * fitur ini sama sekali. Yang TIDAK dijaganya: apakah ia boleh membaca sumber
 * yang dipilihnya.
 *
 * Karena itu tiap sumber menyatakan izinnya sendiri, dan dicek terpisah di
 * dalam handler. Tanpa gerbang kedua, siapa pun yang boleh menyusun laporan
 * bisa membaca invoice — termasuk peran yang seluruh menu keuangannya
 * disembunyikan.
 *
 * ── Kenapa tenancy tak bisa dilewatkan
 *
 * Sumber ber-tenancy `company` dibaca lewat `request.db.from()` yang sudah
 * menyaring. Yang ber-tenancy `project` dibaca lewat `viaProject`. Tak ada
 * cabang ketiga — sumber yang tak menyatakan salah satunya ditolak penjaga
 * `audit-sumber-laporan-nyata.mjs` sebelum sampai ke sini.
 */

export default async function laporanSusunRoutes(app: FastifyInstance) {
  // ── GET /laporan/sumber — apa yang bisa disusun ──────────────────────────
  app.get(
    '/api/v1/laporan/sumber',
    { preHandler: [authenticate, requirePermission('reports:susun')] },
    async (request, reply) => {
      // Hanya sumber yang BOLEH dibaca orangnya yang ditampilkan. Menampilkan
      // seluruhnya lalu menolak saat dijalankan menghasilkan layar yang
      // menjanjikan sesuatu yang tak bisa ditepati.
      const boleh = []
      for (const s of SUMBER) {
        if (await hasPermission(request, s.izin)) {
          boleh.push({
            kunci: s.kunci, label: s.label, keterangan: s.keterangan,
            kolom: s.kolom,
          })
        }
      }
      return reply.send({ sumber: boleh, operator: OPERATOR, batas_maks: BATAS_MAKS })
    },
  )

  // ── POST /laporan/susun — jalankan ───────────────────────────────────────
  app.post<{ Body: Susunan & { project_id?: string } }>(
    '/api/v1/laporan/susun',
    { preHandler: [authenticate, requirePermission('reports:susun')] },
    async (request, reply) => {
      const p = periksaSusunan(request.body ?? ({} as Susunan))
      if (!p.sah) return reply.status(400).send({ error: p.galat })

      const { sumber, susunan } = p

      // Gerbang KEDUA — lihat kepala berkas.
      if (!(await hasPermission(request, sumber.izin))) {
        return reply.status(403).send({
          error: `Anda tidak punya izin membaca sumber "${sumber.label}". `
            + `Butuh: ${sumber.izin}`,
        })
      }

      const pilih = daftarSelect(sumber, susunan.kolom)
      if (!pilih) {
        // Mustahil lewat jalur biasa (periksaSusunan sudah menolak), tetapi
        // kalau tetap terjadi yang benar adalah BERHENTI — bukan mengirim
        // query tanpa daftar kolom, yang di PostgREST berarti "seluruh kolom".
        return reply.status(400).send({ error: 'Tidak ada kolom sah yang dipilih' })
      }

      // ── Penyaringan tenant
      //
      // `viaProject` menuntut nama tabel yang TERDAFTAR di peta tenancy
      // (`TabelViaProject`), dan tsc menolak string bebas. Itu jaminan yang
      // benar dan TIDAK dilemahkan dengan cast di sini: memaksanya lewat
      // `as` akan membuat sumber baru yang lupa didaftarkan lolos diam-diam.
      //
      // Yang dipakai: satu jalur `unsafe` + saringan `project_id` eksplisit,
      // untuk kedua kasus (dengan maupun tanpa proyek tertentu). Alasannya
      // ikut ditulis supaya `audit-gerbang-tenancy` bisa menilainya, dan
      // daftar proyeknya sendiri berasal dari `projectIds()` yang sudah
      // menyaring ke tenant.
      let q
      if (sumber.tenancy === 'company') {
        q = request.db!.from(sumber.tabel).select(pilih)
      } else {
        const idProyek = await request.db!.projectIds()

        // Proyek yang diminta harus MILIK tenant ini. Tanpa pemeriksaan ini,
        // id proyek perusahaan lain akan menghasilkan daftar kosong yang
        // terbaca sebagai "proyek itu tak punya data" — dan itu sudah
        // mengkonfirmasi proyeknya ada.
        if (request.body.project_id && !idProyek.includes(request.body.project_id)) {
          return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
        }

        q = request.db!
          .unsafe(sumber.tabel, 'disaring ke proyek milik tenant lewat projectIds()')
          .select(pilih)
          .in('project_id', request.body.project_id ? [request.body.project_id] : idProyek)
      }

      for (const f of susunan.saringan) {
        const kol = sumber.kolom.find((k) => k.kunci === f.kolom)!
        const nilai = nilaiSaringan(kol.jenis, f.operator, f.nilai)
        switch (f.operator) {
          case '=': q = q.eq(f.kolom, nilai); break
          case '>': q = q.gt(f.kolom, nilai); break
          case '>=': q = q.gte(f.kolom, nilai); break
          case '<': q = q.lt(f.kolom, nilai); break
          case '<=': q = q.lte(f.kolom, nilai); break
          case 'mengandung':
          case 'diawali': q = q.ilike(f.kolom, nilai); break
          default:
            // Mustahil — `periksaSusunan` menolak operator asing. Tetapi
            // `default` yang MELANJUTKAN berarti saringan hilang diam-diam,
            // dan laporannya jauh lebih besar dari yang diminta.
            return reply.status(400).send({
              error: `Operator tidak dikenal: ${f.operator}`,
            })
        }
      }

      if (susunan.urut) {
        q = q.order(susunan.urut.kolom, { ascending: susunan.urut.arah === 'naik' })
      }

      const { data, error } = await q.limit(susunan.batas)
      if (error) {
        request.log.error({ err: error, sumber: sumber.kunci }, 'gagal menjalankan laporan')
        return reply.status(500).send({ error: 'Gagal menjalankan laporan' })
      }

      const baris = (data ?? []) as unknown as Array<Record<string, unknown>>

      return reply.send({
        sumber: { kunci: sumber.kunci, label: sumber.label },
        kolom: susunan.kolom.map((k) => sumber.kolom.find((x) => x.kunci === k)!),
        baris,
        jumlah: baris.length,
        // Dinyatakan supaya "kenapa cuma segini?" punya jawaban. Tanpa ini,
        // laporan yang terpotong batas terbaca sebagai data yang memang
        // sedikit — dan itu kesimpulan yang salah tentang bisnisnya sendiri.
        terpotong: baris.length >= susunan.batas,
        batas: susunan.batas,
      })
    },
  )
}
