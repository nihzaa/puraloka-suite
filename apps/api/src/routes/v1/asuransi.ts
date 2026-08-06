import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { proyekMilikTenant } from '../../utils/tenant-guard.js'
import {
  hitungRegisterAsuransi,
  type BarisPolis,
  type BarisProyek,
} from '../../lib/register-asuransi.js'

/**
 * REGISTER ASURANSI (F5 PEMBEDA)
 *
 * ── Cacat yang ditutup
 *
 * Diukur 2026-08-06: NOL tabel dan NOL kolom asuransi di seluruh basis.
 * Kontrak konstruksi hampir selalu mensyaratkan polis (CAR/TPL/Jamsostek),
 * dan saat klaim terjadi yang ditanya pertama adalah nomor polis + masa
 * berlakunya. Tanpa register, jawabannya ada di map fisik seseorang.
 *
 * ── Kenapa bukan `contract_bonds`
 *
 * Tabel itu polanya mirip, tapi isinya JAMINAN BANK — CHECK-nya membatasi
 * `bond_type` ke penawaran/pelaksanaan/uang_muka/pemeliharaan. Asuransi
 * berbeda pihaknya, berbeda gunanya, dan berbeda yang ditanyakan saat klaim.
 * Rinciannya di migrasi 199.
 */
export default async function asuransiRoutes(app: FastifyInstance) {
  // ── GET /api/v1/asuransi ─────────────────────────────────────────────────
  app.get('/api/v1/asuransi', {
    preHandler: [authenticate, requirePermission('projects:contract')],
  }, async (request, reply) => {
    const q = request.query as Record<string, string>
    const db = request.db!

    const idProyek = await db.projectIds()
    const kosong = {
      polis: [], jumlah_aktif: 0, jumlah_kadaluarsa: 0, jumlah_segera_berakhir: 0,
      jumlah_belum_berlaku: 0, jumlah_ada_celah: 0, proyek_tanpa_polis: [],
      total_nilai_pertanggungan: 0,
    }
    if (idProyek.length === 0) return reply.send(kosong)

    if (q.project_id && !(await proyekMilikTenant(request, q.project_id))) {
      return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
    }

    const dipakai = q.project_id ? [q.project_id] : idProyek

    // Tanggal proyek dibutuhkan untuk menghitung CELAH pertanggungan —
    // itulah yang membuat register ini berguna, bukan sekadar daftar nomor.
    const { data: proyek, error: e1 } = await db
      .unsafe('projects', 'daftar lintas-proyek; viaProject butuh satu project sebagai konteks')
      .select('id, name, start_date, end_date')
      .in('id', dipakai)

    if (e1) return reply.status(500).send({ error: e1.message })

    const { data: polis, error: e2 } = await db
      .unsafe('polis_asuransi', 'daftar lintas-proyek; disaring dengan projectIds')
      .select(`id, project_id, jenis, jenis_lain, nomor_polis, penerbit,
               nilai_pertanggungan, premi, periode_mulai, periode_selesai,
               tertanggung, status`)
      .in('project_id', dipakai)

    if (e2) return reply.status(500).send({ error: e2.message })

    const daftarProyek: BarisProyek[] = ((proyek ?? []) as Array<{
      id: string; name: string; start_date: string | null; end_date: string | null
    }>).map((p) => ({
      project_id: p.id, project_name: p.name,
      start_date: p.start_date, end_date: p.end_date,
    }))

    // `hariIni` ditentukan DI SINI, bukan di dalam fungsi murninya — supaya
    // fungsinya bisa diuji tanpa hasilnya berubah besok.
    const hariIni = new Date().toISOString().slice(0, 10)

    return reply.send(
      hitungRegisterAsuransi((polis ?? []) as BarisPolis[], daftarProyek, hariIni))
  })

  // ── POST /api/v1/asuransi ────────────────────────────────────────────────
  //
  // `projects:contract` — DIVERIFIKASI ada di tabel `permissions`. Polis
  // adalah dokumen kontraktual: yang berwenang mengurus kontrak adalah yang
  // berwenang mencatat pertanggungannya.
  app.post('/api/v1/asuransi', {
    preHandler: [authenticate, requirePermission('projects:contract')],
  }, async (request, reply) => {
    const b = request.body as {
      project_id?: string
      jenis?: string
      jenis_lain?: string
      nomor_polis?: string
      penerbit?: string
      nilai_pertanggungan?: number
      premi?: number
      periode_mulai?: string
      periode_selesai?: string
      tertanggung?: string
      catatan?: string
    }

    if (!b.project_id || !b.jenis || !b.nomor_polis?.trim() || !b.penerbit?.trim()
        || !b.periode_mulai || !b.periode_selesai) {
      return reply.status(400).send({
        error: 'project_id, jenis, nomor_polis, penerbit, periode_mulai, dan periode_selesai wajib diisi',
      })
    }

    const JENIS_SAH = ['car', 'tpl', 'jamsostek', 'car_tpl', 'lainnya']
    if (!JENIS_SAH.includes(b.jenis)) {
      return reply.status(400).send({ error: `jenis harus salah satu: ${JENIS_SAH.join(', ')}` })
    }

    if (b.periode_selesai < b.periode_mulai) {
      // Dijaga juga oleh CHECK di basis. Diperiksa di sini supaya penggunanya
      // dapat kalimat yang bisa dimengerti, bukan galat constraint mentah.
      return reply.status(400).send({
        error: 'periode_selesai tidak boleh lebih awal daripada periode_mulai',
      })
    }

    if (!(await proyekMilikTenant(request, b.project_id))) {
      return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
    }

    const { data, error } = await request.db!
      .viaProject('polis_asuransi', b.project_id)
      .insert({
        project_id: b.project_id,
        jenis: b.jenis,
        // `jenis_lain` hanya bermakna bila jenisnya `lainnya` — dijaga CHECK
        // di basis, dan dibersihkan di sini supaya tak pernah menabraknya.
        jenis_lain: b.jenis === 'lainnya' ? (b.jenis_lain?.trim() || null) : null,
        nomor_polis: b.nomor_polis.trim(),
        penerbit: b.penerbit.trim(),
        nilai_pertanggungan: b.nilai_pertanggungan ?? null,
        premi: b.premi ?? null,
        periode_mulai: b.periode_mulai,
        periode_selesai: b.periode_selesai,
        tertanggung: b.tertanggung?.trim() || null,
        catatan: b.catatan?.trim() || null,
        created_by: request.currentUser!.id,
      })
      .select('id, nomor_polis')
      .single()

    if (error) {
      if (error.code === '23505') {
        return reply.status(400).send({
          error: `Polis "${b.nomor_polis.trim()}" dari ${b.penerbit.trim()} sudah tercatat di proyek ini`,
        })
      }
      return reply.status(500).send({ error: error.message })
    }

    return reply.status(201).send({ polis: data })
  })
}
