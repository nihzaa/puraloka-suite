import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { requireModul } from '../../utils/gerbang-modul.js'
import { logAuditEvent } from '../../utils/audit.js'
import {
  nilaiRisiko, ringkasRegister, nilaiIzin, kesiapanIzin,
  bolehPindahTahapSengketa, ringkasSengketa,
  type Risiko, type IzinProyek, type Sengketa, type StatusSengketa,
} from '../../lib/risiko-proyek.js'

/**
 * REGISTER RISIKO · MITIGASI · PERIZINAN PROYEK · SENGKETA (G3).
 *
 * ── Kenapa satu berkas untuk empat tabel
 *
 * Keempatnya menjawab satu pertanyaan: *apa yang bisa menghentikan proyek
 * ini, dan siapa yang mengurusnya?* Risiko adalah yang mungkin terjadi, izin
 * adalah yang sudah pasti dibutuhkan, sengketa adalah yang sudah terjadi.
 *
 * Register tanpa izin dan sengketa akan mendaftar "izin terlambat" sebagai
 * risiko hipotetis, sementara izinnya sudah kedaluwarsa di tabel sebelah.
 *
 * ── Peringatan tenancy — keempatnya kategori C
 *
 *   risiko_proyek      lewat `project_id`
 *   izin_proyek        lewat `project_id`
 *   sengketa           lewat `project_id`
 *   tindakan_mitigasi  lewat `risiko_id`   ← BUKAN project_id
 *
 * `viaProject(tabel, id)` menyusun `.eq(<kolom lewat>, id)`. Melewatkan
 * project_id ke `tindakan_mitigasi` mengembalikan NOL BARIS tanpa galat —
 * dan halamannya akan terlihat seperti risiko yang memang belum punya
 * mitigasi. Sudah termakan sekali di G1; jangan dua kali.
 */

const RISIKO_SELECT = `
  id, project_id, kode, judul, uraian, kategori, penyebab, dampak_uraian,
  dampak, kemungkinan, skor, strategi, dampak_sisa, kemungkinan_sisa,
  pemilik_id, tenggat_tinjau, status, terjadi_pada, ditutup_pada, alasan_tutup,
  izin_kerja_id, dokumen_kepatuhan_id, catatan, created_at, updated_at,
  pemilik:users!risiko_proyek_pemilik_id_fkey ( id, name )
`

const MITIGASI_SELECT = `
  id, risiko_id, tindakan, penanggung_id, tenggat, status, selesai_pada,
  biaya_estimasi, catatan, created_at,
  penanggung:users!tindakan_mitigasi_penanggung_id_fkey ( id, name )
`

const IZIN_SELECT = `
  id, project_id, jenis, nomor, penerbit, status, diajukan_pada,
  berlaku_dari, berlaku_sampai, biaya, file_url, menghalangi_mulai,
  catatan, created_at, updated_at
`

const SENGKETA_SELECT = `
  id, project_id, klaim_id, nomor, judul, pihak_lawan, pokok_perkara,
  dasar_hukum, nilai_tuntutan, status, tanggal_mulai, forum, hasil,
  nilai_putusan, selesai_pada, catatan, created_at, updated_at
`

const KATEGORI_SAH = [
  'teknis', 'keuangan', 'jadwal', 'k3', 'lingkungan',
  'hukum', 'pengadaan', 'eksternal'] as const
const STRATEGI_SAH = ['hindari', 'kurangi', 'alihkan', 'terima'] as const
const STATUS_RISIKO_SAH = ['terpantau', 'terjadi', 'tertutup'] as const
const STATUS_TINDAKAN_SAH = ['rencana', 'berjalan', 'selesai', 'batal'] as const
const STATUS_IZIN_SAH = ['rencana', 'diajukan', 'terbit', 'ditolak', 'dicabut'] as const
const STATUS_SENGKETA_SAH: StatusSengketa[] = [
  'dicatat', 'negosiasi', 'mediasi', 'arbitrase', 'pengadilan', 'selesai']

/** Hari ini sebagai `YYYY-MM-DD`. */
const hariIni = () => new Date().toISOString().slice(0, 10)
const tanggalSah = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)

/**
 * Skala 1..5. `Number('')` adalah 0 — pelajaran G2a. Nilai 0 lolos
 * `Number.isInteger` dan hanya tertangkap oleh batas bawah di bawah ini.
 */
function skala(v: unknown, nama: string): { nilai: number } | { galat: string } {
  if (v == null || v === '') return { galat: `${nama} wajib diisi (1–5)` }
  const n = Number(v)
  if (!Number.isInteger(n) || n < 1 || n > 5) {
    return { galat: `${nama} harus bilangan bulat 1–5` }
  }
  return { nilai: n }
}

export default async function risikoProyekRoutes(app: FastifyInstance) {
  // ── GET /proyek/:id/risiko ───────────────────────────────────────────────
  //
  // Register + mitigasinya dalam satu panggilan: mitigasi tanpa risikonya
  // adalah daftar tugas tanpa alasan, dan halamannya menampilkan keduanya
  // bersamaan (§2 migrasi 291).
  app.get<{ Params: { id: string }; Querystring: { pada?: string } }>(
    '/api/v1/proyek/:id/risiko',
    { preHandler: [authenticate, requireModul('modul.risiko'), requirePermission('risiko:view')] },
    async (request, reply) => {
      const { id } = request.params
      const pada = request.query.pada ?? hariIni()
      if (!tanggalSah(pada)) {
        return reply.status(400).send({ error: 'pada harus berformat YYYY-MM-DD' })
      }

      const { data: proyek, error: eProy } = await request.db!
        .from('projects')
        .select('id, name, end_date')
        .eq('id', id)
        .maybeSingle()
      if (eProy) {
        request.log.error({ err: eProy, id }, 'gagal memuat proyek')
        return reply.status(500).send({ error: 'Gagal memuat proyek' })
      }
      if (!proyek) return reply.status(404).send({ error: 'Proyek tidak ditemukan' })

      const { data: risiko, error: eRis } = await request.db!
        .viaProject('risiko_proyek', id)
        .select(RISIKO_SELECT)
        .order('skor', { ascending: false })
        .limit(500)
      if (eRis) {
        request.log.error({ err: eRis, id }, 'gagal memuat register risiko')
        return reply.status(500).send({ error: 'Gagal memuat register risiko' })
      }

      const baris = (risiko ?? []) as unknown as Risiko[]

      // Mitigasi diambil sekali untuk seluruh risiko, bukan satu query per
      // baris. `tindakan_mitigasi` kategori C lewat `risiko_id`, jadi
      // `viaProject` tak bisa dipakai untuk BANYAK risiko sekaligus —
      // dipakai `unsafe` dengan penyaring eksplisit atas id yang sudah
      // terbukti milik tenant ini (barisnya baru saja lewat RLS).
      const idRisiko = baris.map((r) => r.id)
      let mitigasi: Array<Record<string, unknown>> = []
      if (idRisiko.length > 0) {
        const { data: mit, error: eMit } = await request.db!
          .unsafe('tindakan_mitigasi',
            'disaring ke id risiko yang barisnya sudah lewat RLS pada query di atas')
          .select(MITIGASI_SELECT)
          .in('risiko_id', idRisiko)
          .order('tenggat', { ascending: true, nullsFirst: false })
          .limit(2000)
        if (eMit) {
          request.log.error({ err: eMit, id }, 'gagal memuat tindakan mitigasi')
          return reply.status(500).send({ error: 'Gagal memuat tindakan mitigasi' })
        }
        mitigasi = mit ?? []
      }

      const perRisiko = new Map<string, Array<Record<string, unknown>>>()
      for (const m of mitigasi) {
        const k = m.risiko_id as string
        if (!perRisiko.has(k)) perRisiko.set(k, [])
        perRisiko.get(k)!.push(m)
      }

      const dinilai = baris.map((r) =>
        nilaiRisiko(
          { ...r, tindakan: (perRisiko.get(r.id) ?? []) as unknown as Risiko['tindakan'] },
          pada,
        ),
      )

      return reply.send({
        proyek,
        pada,
        risiko: dinilai,
        ringkas: ringkasRegister(dinilai),
      })
    },
  )

  // ── POST /proyek/:id/risiko ──────────────────────────────────────────────
  app.post<{
    Params: { id: string }
    Body: {
      kode?: string; judul?: string; uraian?: string; kategori?: string
      penyebab?: string; dampak_uraian?: string
      dampak?: number | string; kemungkinan?: number | string
      strategi?: string; pemilik_id?: string; tenggat_tinjau?: string
      izin_kerja_id?: string; dokumen_kepatuhan_id?: string; catatan?: string
    }
  }>(
    '/api/v1/proyek/:id/risiko',
    { preHandler: [authenticate, requireModul('modul.risiko'), requirePermission('risiko:manage')] },
    async (request, reply) => {
      const { id } = request.params
      const b = request.body

      if (!b.judul?.trim()) return reply.status(400).send({ error: 'judul wajib diisi' })
      if (!b.kategori || !KATEGORI_SAH.includes(b.kategori as typeof KATEGORI_SAH[number])) {
        return reply.status(400).send({
          error: `kategori harus salah satu dari: ${KATEGORI_SAH.join(', ')}`,
        })
      }
      const d = skala(b.dampak, 'dampak')
      if ('galat' in d) return reply.status(400).send({ error: d.galat })
      const k = skala(b.kemungkinan, 'kemungkinan')
      if ('galat' in k) return reply.status(400).send({ error: k.galat })

      const strategi = b.strategi ?? 'kurangi'
      if (!STRATEGI_SAH.includes(strategi as typeof STRATEGI_SAH[number])) {
        return reply.status(400).send({
          error: `strategi harus salah satu dari: ${STRATEGI_SAH.join(', ')}`,
        })
      }
      if (b.tenggat_tinjau && !tanggalSah(b.tenggat_tinjau)) {
        return reply.status(400).send({ error: 'tenggat_tinjau harus berformat YYYY-MM-DD' })
      }

      const { data: proyek, error: eProy } = await request.db!
        .from('projects').select('id').eq('id', id).maybeSingle()
      if (eProy) return reply.status(500).send({ error: eProy.message })
      if (!proyek) return reply.status(404).send({ error: 'Proyek tidak ditemukan' })

      const { data, error } = await request.db!
        .viaProject('risiko_proyek', id)
        .insert({
          project_id: id,
          kode: b.kode?.trim() || null,
          judul: b.judul.trim(),
          uraian: b.uraian?.trim() || null,
          kategori: b.kategori,
          penyebab: b.penyebab?.trim() || null,
          dampak_uraian: b.dampak_uraian?.trim() || null,
          dampak: d.nilai,
          kemungkinan: k.nilai,
          strategi,
          pemilik_id: b.pemilik_id || null,
          tenggat_tinjau: b.tenggat_tinjau || null,
          izin_kerja_id: b.izin_kerja_id || null,
          dokumen_kepatuhan_id: b.dokumen_kepatuhan_id || null,
          catatan: b.catatan?.trim() || null,
          created_by: request.currentUser!.id,
        })
        .select(RISIKO_SELECT)
        .single()

      if (error) {
        request.log.error({ err: error, id }, 'gagal menambah risiko')
        return reply.status(400).send({ error: error.message })
      }

      await logAuditEvent(request, {
        action: 'INSERT',
        actorId: request.currentUser!.id,
        tableName: 'risiko_proyek',
        recordId: data!.id as string,
        newValues: data as Record<string, unknown>,
      })
      return reply.status(201).send({ risiko: data })
    },
  )

  // ── PATCH /risiko/:id ────────────────────────────────────────────────────
  //
  // Termasuk penilaian ulang SESUDAH mitigasi (`dampak_sisa`,
  // `kemungkinan_sisa`) dan penutupan. Constraint DB menolak skor sisa yang
  // melebihi skor awal dan penutupan tanpa alasan — di sini alasannya
  // dijelaskan ke pengguna sebelum DB menolaknya dengan bahasa Postgres.
  app.patch<{
    Params: { id: string }
    Body: {
      dampak?: number | string; kemungkinan?: number | string
      dampak_sisa?: number | string | null; kemungkinan_sisa?: number | string | null
      strategi?: string; status?: string; pemilik_id?: string | null
      tenggat_tinjau?: string | null; terjadi_pada?: string
      ditutup_pada?: string; alasan_tutup?: string; catatan?: string
    }
  }>(
    '/api/v1/risiko/:id',
    { preHandler: [authenticate, requireModul('modul.risiko'), requirePermission('risiko:manage')] },
    async (request, reply) => {
      const { id } = request.params
      const b = request.body

      const { data: lama, error: eLama } = await request.db!
        .unsafe('risiko_proyek', 'dibaca lewat id; RLS menyaring ke tenant')
        .select('id, project_id, dampak, kemungkinan, status')
        .eq('id', id)
        .in('project_id', await request.db!.projectIds())
        .maybeSingle()
      if (eLama) {
        request.log.error({ err: eLama, id }, 'gagal memuat risiko')
        return reply.status(500).send({ error: 'Gagal memuat risiko' })
      }
      if (!lama) return reply.status(404).send({ error: 'Risiko tidak ditemukan' })

      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }

      if (b.dampak !== undefined) {
        const d = skala(b.dampak, 'dampak')
        if ('galat' in d) return reply.status(400).send({ error: d.galat })
        patch.dampak = d.nilai
      }
      if (b.kemungkinan !== undefined) {
        const k = skala(b.kemungkinan, 'kemungkinan')
        if ('galat' in k) return reply.status(400).send({ error: k.galat })
        patch.kemungkinan = k.nilai
      }

      // Skor sisa: boleh dikosongkan (null) untuk menyatakan "belum dinilai
      // ulang" — itu keadaan yang BERBEDA dari "dinilai dan tak turun".
      for (const nama of ['dampak_sisa', 'kemungkinan_sisa'] as const) {
        if (b[nama] === undefined) continue
        if (b[nama] === null || b[nama] === '') { patch[nama] = null; continue }
        const s = skala(b[nama], nama)
        if ('galat' in s) return reply.status(400).send({ error: s.galat })
        patch[nama] = s.nilai
      }

      const dampakAkhir = (patch.dampak as number) ?? lama.dampak as number
      const kemungkinanAkhir = (patch.kemungkinan as number) ?? lama.kemungkinan as number
      const sisaD = patch.dampak_sisa as number | null | undefined
      const sisaK = patch.kemungkinan_sisa as number | null | undefined
      if (sisaD != null && sisaK != null
          && sisaD * sisaK > dampakAkhir * kemungkinanAkhir) {
        return reply.status(422).send({
          error: 'Skor sesudah mitigasi tidak boleh LEBIH TINGGI dari skor awal. '
            + 'Kalau risikonya memang bertambah besar, yang dinaikkan adalah '
            + 'skor awalnya — bukan skor sisa. Angka inilah yang dibawa ke '
            + 'rapat sebagai "sudah kami tangani".',
        })
      }

      if (b.strategi !== undefined) {
        if (!STRATEGI_SAH.includes(b.strategi as typeof STRATEGI_SAH[number])) {
          return reply.status(400).send({ error: 'strategi tak dikenal' })
        }
        patch.strategi = b.strategi
      }

      if (b.status !== undefined) {
        if (!STATUS_RISIKO_SAH.includes(b.status as typeof STATUS_RISIKO_SAH[number])) {
          return reply.status(400).send({ error: 'status tak dikenal' })
        }
        if (b.status === 'tertutup') {
          const alasan = b.alasan_tutup?.trim() ?? ''
          if (alasan.length < 10) {
            return reply.status(422).send({
              error: 'Menutup risiko wajib beralasan (minimal 10 huruf). '
                + 'Risiko yang hilang tanpa penjelasan membuat "kami memutuskan '
                + 'menerimanya" tak bisa dibedakan dari "kami lupa" — dan '
                + 'keduanya terlihat sama: barisnya tidak ada.',
            })
          }
          patch.alasan_tutup = alasan
          patch.ditutup_pada = b.ditutup_pada || hariIni()
        }
        if (b.status === 'terjadi') {
          patch.terjadi_pada = b.terjadi_pada || hariIni()
        }
        patch.status = b.status
      }

      if (b.pemilik_id !== undefined) patch.pemilik_id = b.pemilik_id || null
      if (b.tenggat_tinjau !== undefined) {
        if (b.tenggat_tinjau && !tanggalSah(b.tenggat_tinjau)) {
          return reply.status(400).send({ error: 'tenggat_tinjau harus berformat YYYY-MM-DD' })
        }
        patch.tenggat_tinjau = b.tenggat_tinjau || null
      }
      if (b.catatan !== undefined) patch.catatan = b.catatan?.trim() || null

      const { data, error } = await request.db!
        .unsafe('risiko_proyek', 'diperbarui lewat id; RLS + saringan proyek di WHERE')
        .update(patch)
        .eq('id', id)
        .in('project_id', await request.db!.projectIds())
        .select(RISIKO_SELECT)
        .single()

      if (error) {
        request.log.error({ err: error, id }, 'gagal memperbarui risiko')
        return reply.status(400).send({ error: error.message })
      }
      if (!data) return reply.status(404).send({ error: 'Risiko tidak ditemukan' })

      await logAuditEvent(request, {
        action: 'UPDATE',
        actorId: request.currentUser!.id,
        tableName: 'risiko_proyek',
        recordId: id,
        oldValues: lama as Record<string, unknown>,
        newValues: data as Record<string, unknown>,
      })
      return reply.send({ risiko: data })
    },
  )

  // ── POST /risiko/:id/mitigasi ────────────────────────────────────────────
  app.post<{
    Params: { id: string }
    Body: {
      tindakan?: string; penanggung_id?: string; tenggat?: string
      biaya_estimasi?: number | string; catatan?: string
    }
  }>(
    '/api/v1/risiko/:id/mitigasi',
    { preHandler: [authenticate, requireModul('modul.risiko'), requirePermission('risiko:manage')] },
    async (request, reply) => {
      const { id } = request.params
      const b = request.body

      if (!b.tindakan?.trim()) {
        return reply.status(400).send({ error: 'tindakan wajib diisi' })
      }
      if (b.tenggat && !tanggalSah(b.tenggat)) {
        return reply.status(400).send({ error: 'tenggat harus berformat YYYY-MM-DD' })
      }

      let biaya: number | null = null
      if (b.biaya_estimasi != null && b.biaya_estimasi !== '') {
        const n = Number(b.biaya_estimasi)
        if (!Number.isFinite(n) || n < 0) {
          return reply.status(400).send({ error: 'biaya_estimasi harus angka >= 0' })
        }
        biaya = n
      }

      const { data: induk, error: eInduk } = await request.db!
        .unsafe('risiko_proyek', 'memeriksa induk; RLS + saringan proyek di WHERE')
        .select('id, project_id')
        .eq('id', id)
        .in('project_id', await request.db!.projectIds())
        .maybeSingle()
      if (eInduk) return reply.status(500).send({ error: eInduk.message })
      if (!induk) return reply.status(404).send({ error: 'Risiko tidak ditemukan' })

      // ⚠ `tindakan_mitigasi` lewat `risiko_id`, BUKAN project_id.
      const { data, error } = await request.db!
        .viaProject('tindakan_mitigasi', id)
        .insert({
          risiko_id: id,
          tindakan: b.tindakan.trim(),
          penanggung_id: b.penanggung_id || null,
          tenggat: b.tenggat || null,
          biaya_estimasi: biaya,
          catatan: b.catatan?.trim() || null,
          created_by: request.currentUser!.id,
        })
        .select(MITIGASI_SELECT)
        .single()

      if (error) {
        request.log.error({ err: error, id }, 'gagal menambah tindakan mitigasi')
        return reply.status(400).send({ error: error.message })
      }

      await logAuditEvent(request, {
        action: 'INSERT',
        actorId: request.currentUser!.id,
        tableName: 'tindakan_mitigasi',
        recordId: data!.id as string,
        newValues: data as Record<string, unknown>,
      })
      return reply.status(201).send({ tindakan: data })
    },
  )

  // ── PATCH /mitigasi/:id ──────────────────────────────────────────────────
  app.patch<{
    Params: { id: string }
    Body: {
      status?: string; selesai_pada?: string; tenggat?: string | null
      penanggung_id?: string | null; catatan?: string
    }
  }>(
    '/api/v1/mitigasi/:id',
    { preHandler: [authenticate, requireModul('modul.risiko'), requirePermission('risiko:manage')] },
    async (request, reply) => {
      const { id } = request.params
      const b = request.body

      const idProyek = await request.db!.projectIds()

      const { data: lama, error: eLama } = await request.db!
        .unsafe('tindakan_mitigasi', 'dibaca lewat id; induk disaring ke proyek tenant')
        .select('id, risiko_id, status, risiko:risiko_proyek!inner ( id, project_id )')
        .eq('id', id)
        .in('risiko.project_id', idProyek)
        .maybeSingle()
      if (eLama) {
        request.log.error({ err: eLama, id }, 'gagal memuat tindakan mitigasi')
        return reply.status(500).send({ error: 'Gagal memuat tindakan mitigasi' })
      }
      if (!lama) return reply.status(404).send({ error: 'Tindakan tidak ditemukan' })

      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }

      if (b.status !== undefined) {
        if (!STATUS_TINDAKAN_SAH.includes(b.status as typeof STATUS_TINDAKAN_SAH[number])) {
          return reply.status(400).send({ error: 'status tak dikenal' })
        }
        if (b.status === 'selesai') {
          patch.selesai_pada = b.selesai_pada || hariIni()
        }
        patch.status = b.status
      }
      if (b.tenggat !== undefined) {
        if (b.tenggat && !tanggalSah(b.tenggat)) {
          return reply.status(400).send({ error: 'tenggat harus berformat YYYY-MM-DD' })
        }
        patch.tenggat = b.tenggat || null
      }
      if (b.penanggung_id !== undefined) patch.penanggung_id = b.penanggung_id || null
      if (b.catatan !== undefined) patch.catatan = b.catatan?.trim() || null

      const { data, error } = await request.db!
        .unsafe('tindakan_mitigasi', 'diperbarui lewat id yang sudah terbukti milik tenant')
        .update(patch)
        .eq('id', id)
        .eq('risiko_id', lama.risiko_id as string)
        .select(MITIGASI_SELECT)
        .single()

      if (error) {
        request.log.error({ err: error, id }, 'gagal memperbarui tindakan mitigasi')
        return reply.status(400).send({ error: error.message })
      }
      if (!data) return reply.status(404).send({ error: 'Tindakan tidak ditemukan' })

      await logAuditEvent(request, {
        action: 'UPDATE',
        actorId: request.currentUser!.id,
        tableName: 'tindakan_mitigasi',
        recordId: id,
        oldValues: lama as Record<string, unknown>,
        newValues: data as Record<string, unknown>,
      })
      return reply.send({ tindakan: data })
    },
  )

  // ── GET /proyek/:id/izin ─────────────────────────────────────────────────
  //
  // Dinilai terhadap RENTANG PROYEK, bukan hari ini saja: izin yang habis
  // sebelum proyek selesai sudah bermasalah HARI INI (§ kepala pustaka).
  app.get<{ Params: { id: string }; Querystring: { pada?: string; ambang?: string } }>(
    '/api/v1/proyek/:id/izin',
    { preHandler: [authenticate, requireModul('modul.risiko'), requirePermission('izin:view')] },
    async (request, reply) => {
      const { id } = request.params
      const pada = request.query.pada ?? hariIni()
      const ambang = Number(request.query.ambang) || 60
      if (!tanggalSah(pada)) {
        return reply.status(400).send({ error: 'pada harus berformat YYYY-MM-DD' })
      }

      const { data: proyek, error: eProy } = await request.db!
        .from('projects')
        .select('id, name, start_date, end_date, status')
        .eq('id', id)
        .maybeSingle()
      if (eProy) {
        request.log.error({ err: eProy, id }, 'gagal memuat proyek')
        return reply.status(500).send({ error: 'Gagal memuat proyek' })
      }
      if (!proyek) return reply.status(404).send({ error: 'Proyek tidak ditemukan' })

      const { data: izin, error: eIzin } = await request.db!
        .viaProject('izin_proyek', id)
        .select(IZIN_SELECT)
        .order('berlaku_sampai', { ascending: true, nullsFirst: false })
        .limit(300)
      if (eIzin) {
        request.log.error({ err: eIzin, id }, 'gagal memuat izin proyek')
        return reply.status(500).send({ error: 'Gagal memuat izin proyek' })
      }

      const selesai = (proyek.end_date as string | null) ?? null
      const dinilai = ((izin ?? []) as unknown as IzinProyek[])
        .map((i) => nilaiIzin(i, pada, selesai, ambang))

      return reply.send({
        proyek,
        pada,
        izin: dinilai,
        kesiapan: kesiapanIzin(dinilai),
      })
    },
  )

  // ── POST /proyek/:id/izin ────────────────────────────────────────────────
  app.post<{
    Params: { id: string }
    Body: {
      jenis?: string; nomor?: string; penerbit?: string; status?: string
      diajukan_pada?: string; berlaku_dari?: string; berlaku_sampai?: string
      biaya?: number | string; menghalangi_mulai?: boolean; catatan?: string
    }
  }>(
    '/api/v1/proyek/:id/izin',
    { preHandler: [authenticate, requireModul('modul.risiko'), requirePermission('izin:manage')] },
    async (request, reply) => {
      const { id } = request.params
      const b = request.body

      if (!b.jenis?.trim()) return reply.status(400).send({ error: 'jenis wajib diisi' })

      const status = b.status ?? 'rencana'
      if (!STATUS_IZIN_SAH.includes(status as typeof STATUS_IZIN_SAH[number])) {
        return reply.status(400).send({
          error: `status harus salah satu dari: ${STATUS_IZIN_SAH.join(', ')}`,
        })
      }

      // Izin tanpa nomor tak bisa ditunjukkan ke pengawas — dijelaskan di
      // sini supaya pengguna tak menerima galat constraint Postgres.
      if (status === 'terbit') {
        if (!b.nomor?.trim()) {
          return reply.status(400).send({
            error: 'Izin yang sudah TERBIT wajib punya nomor — izin tanpa nomor '
              + 'tak bisa ditunjukkan saat pengawas datang.',
          })
        }
        if (!b.berlaku_dari) {
          return reply.status(400).send({
            error: 'Izin yang sudah TERBIT wajib punya tanggal mulai berlaku.',
          })
        }
      }

      for (const nama of ['diajukan_pada', 'berlaku_dari', 'berlaku_sampai'] as const) {
        const v = b[nama]
        if (v && !tanggalSah(v)) {
          return reply.status(400).send({ error: `${nama} harus berformat YYYY-MM-DD` })
        }
      }
      if (b.berlaku_dari && b.berlaku_sampai && b.berlaku_sampai < b.berlaku_dari) {
        return reply.status(400).send({
          error: 'berlaku_sampai tidak boleh mendahului berlaku_dari',
        })
      }

      let biaya: number | null = null
      if (b.biaya != null && b.biaya !== '') {
        const n = Number(b.biaya)
        if (!Number.isFinite(n) || n < 0) {
          return reply.status(400).send({ error: 'biaya harus angka >= 0' })
        }
        biaya = n
      }

      const { data: proyek, error: eProy } = await request.db!
        .from('projects').select('id').eq('id', id).maybeSingle()
      if (eProy) return reply.status(500).send({ error: eProy.message })
      if (!proyek) return reply.status(404).send({ error: 'Proyek tidak ditemukan' })

      const { data, error } = await request.db!
        .viaProject('izin_proyek', id)
        .insert({
          project_id: id,
          jenis: b.jenis.trim(),
          nomor: b.nomor?.trim() || null,
          penerbit: b.penerbit?.trim() || null,
          status,
          diajukan_pada: b.diajukan_pada || null,
          berlaku_dari: b.berlaku_dari || null,
          berlaku_sampai: b.berlaku_sampai || null,
          biaya,
          menghalangi_mulai: b.menghalangi_mulai === true,
          catatan: b.catatan?.trim() || null,
          created_by: request.currentUser!.id,
        })
        .select(IZIN_SELECT)
        .single()

      if (error) {
        request.log.error({ err: error, id }, 'gagal menambah izin proyek')
        return reply.status(400).send({ error: error.message })
      }

      await logAuditEvent(request, {
        action: 'INSERT',
        actorId: request.currentUser!.id,
        tableName: 'izin_proyek',
        recordId: data!.id as string,
        newValues: data as Record<string, unknown>,
      })
      return reply.status(201).send({ izin: data })
    },
  )

  // ── PATCH /izin-proyek/:id ───────────────────────────────────────────────
  app.patch<{
    Params: { id: string }
    Body: {
      status?: string; nomor?: string; penerbit?: string
      berlaku_dari?: string; berlaku_sampai?: string | null
      menghalangi_mulai?: boolean; catatan?: string
    }
  }>(
    '/api/v1/izin-proyek/:id',
    { preHandler: [authenticate, requireModul('modul.risiko'), requirePermission('izin:manage')] },
    async (request, reply) => {
      const { id } = request.params
      const b = request.body
      const idProyek = await request.db!.projectIds()

      const { data: lama, error: eLama } = await request.db!
        .unsafe('izin_proyek', 'dibaca lewat id; RLS + saringan proyek di WHERE')
        .select('id, project_id, status, nomor, berlaku_dari')
        .eq('id', id)
        .in('project_id', idProyek)
        .maybeSingle()
      if (eLama) {
        request.log.error({ err: eLama, id }, 'gagal memuat izin proyek')
        return reply.status(500).send({ error: 'Gagal memuat izin proyek' })
      }
      if (!lama) return reply.status(404).send({ error: 'Izin tidak ditemukan' })

      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }

      if (b.nomor !== undefined) patch.nomor = b.nomor?.trim() || null
      if (b.penerbit !== undefined) patch.penerbit = b.penerbit?.trim() || null
      if (b.berlaku_dari !== undefined) {
        if (b.berlaku_dari && !tanggalSah(b.berlaku_dari)) {
          return reply.status(400).send({ error: 'berlaku_dari harus berformat YYYY-MM-DD' })
        }
        patch.berlaku_dari = b.berlaku_dari || null
      }
      if (b.berlaku_sampai !== undefined) {
        if (b.berlaku_sampai && !tanggalSah(b.berlaku_sampai)) {
          return reply.status(400).send({ error: 'berlaku_sampai harus berformat YYYY-MM-DD' })
        }
        patch.berlaku_sampai = b.berlaku_sampai || null
      }
      if (b.menghalangi_mulai !== undefined) {
        patch.menghalangi_mulai = b.menghalangi_mulai === true
      }
      if (b.catatan !== undefined) patch.catatan = b.catatan?.trim() || null

      if (b.status !== undefined) {
        if (!STATUS_IZIN_SAH.includes(b.status as typeof STATUS_IZIN_SAH[number])) {
          return reply.status(400).send({ error: 'status tak dikenal' })
        }
        if (b.status === 'terbit') {
          const nomor = (patch.nomor as string | null) ?? (lama.nomor as string | null)
          const dari = (patch.berlaku_dari as string | null) ?? (lama.berlaku_dari as string | null)
          if (!nomor?.trim()) {
            return reply.status(422).send({
              error: 'Izin yang sudah TERBIT wajib punya nomor.',
            })
          }
          if (!dari) {
            return reply.status(422).send({
              error: 'Izin yang sudah TERBIT wajib punya tanggal mulai berlaku.',
            })
          }
        }
        patch.status = b.status
      }

      const { data, error } = await request.db!
        .unsafe('izin_proyek', 'diperbarui lewat id; RLS + saringan proyek di WHERE')
        .update(patch)
        .eq('id', id)
        .in('project_id', idProyek)
        .select(IZIN_SELECT)
        .single()

      if (error) {
        request.log.error({ err: error, id }, 'gagal memperbarui izin proyek')
        return reply.status(400).send({ error: error.message })
      }
      if (!data) return reply.status(404).send({ error: 'Izin tidak ditemukan' })

      await logAuditEvent(request, {
        action: 'UPDATE',
        actorId: request.currentUser!.id,
        tableName: 'izin_proyek',
        recordId: id,
        oldValues: lama as Record<string, unknown>,
        newValues: data as Record<string, unknown>,
      })
      return reply.send({ izin: data })
    },
  )

  // ── GET /proyek/:id/sengketa ─────────────────────────────────────────────
  app.get<{ Params: { id: string }; Querystring: { pada?: string } }>(
    '/api/v1/proyek/:id/sengketa',
    { preHandler: [authenticate, requireModul('modul.risiko'), requirePermission('sengketa:view')] },
    async (request, reply) => {
      const { id } = request.params
      const pada = request.query.pada ?? hariIni()
      if (!tanggalSah(pada)) {
        return reply.status(400).send({ error: 'pada harus berformat YYYY-MM-DD' })
      }

      const { data: proyek, error: eProy } = await request.db!
        .from('projects').select('id, name').eq('id', id).maybeSingle()
      if (eProy) {
        request.log.error({ err: eProy, id }, 'gagal memuat proyek')
        return reply.status(500).send({ error: 'Gagal memuat proyek' })
      }
      if (!proyek) return reply.status(404).send({ error: 'Proyek tidak ditemukan' })

      const { data: daftar, error } = await request.db!
        .viaProject('sengketa', id)
        .select(SENGKETA_SELECT)
        .order('tanggal_mulai', { ascending: false })
        .limit(300)
      if (error) {
        request.log.error({ err: error, id }, 'gagal memuat sengketa')
        return reply.status(500).send({ error: 'Gagal memuat sengketa' })
      }

      const baris = (daftar ?? []) as unknown as Sengketa[]
      return reply.send({
        proyek,
        pada,
        sengketa: baris,
        ringkas: ringkasSengketa(baris, pada),
      })
    },
  )

  // ── POST /proyek/:id/sengketa ────────────────────────────────────────────
  //
  // `klaim_id` opsional. Bila diisi, trigger DB menolak klaim yang masih
  // diproses — di sini alasannya dijelaskan lebih dulu.
  app.post<{
    Params: { id: string }
    Body: {
      judul?: string; pihak_lawan?: string; pokok_perkara?: string
      dasar_hukum?: string; nilai_tuntutan?: number | string
      tanggal_mulai?: string; forum?: string; klaim_id?: string
      nomor?: string; catatan?: string
    }
  }>(
    '/api/v1/proyek/:id/sengketa',
    { preHandler: [authenticate, requireModul('modul.risiko'), requirePermission('sengketa:manage')] },
    async (request, reply) => {
      const { id } = request.params
      const b = request.body

      if (!b.judul?.trim()) return reply.status(400).send({ error: 'judul wajib diisi' })
      if (!b.pihak_lawan?.trim()) {
        return reply.status(400).send({ error: 'pihak_lawan wajib diisi' })
      }
      if (!b.pokok_perkara?.trim()) {
        return reply.status(400).send({ error: 'pokok_perkara wajib diisi' })
      }
      const mulai = b.tanggal_mulai || hariIni()
      if (!tanggalSah(mulai)) {
        return reply.status(400).send({ error: 'tanggal_mulai harus berformat YYYY-MM-DD' })
      }

      let tuntutan: number | null = null
      if (b.nilai_tuntutan != null && b.nilai_tuntutan !== '') {
        const n = Number(b.nilai_tuntutan)
        if (!Number.isFinite(n) || n < 0) {
          return reply.status(400).send({ error: 'nilai_tuntutan harus angka >= 0' })
        }
        tuntutan = n
      }

      const { data: proyek, error: eProy } = await request.db!
        .from('projects').select('id').eq('id', id).maybeSingle()
      if (eProy) return reply.status(500).send({ error: eProy.message })
      if (!proyek) return reply.status(404).send({ error: 'Proyek tidak ditemukan' })

      // Klaim yang masih diproses tak boleh disengketakan — menyerah sebelum
      // jawabannya keluar. Diperiksa di sini supaya pesannya terbaca manusia;
      // trigger DB tetap jadi lapis terakhir.
      if (b.klaim_id) {
        const { data: klaim, error: eKlaim } = await request.db!
          .viaProject('contract_claims', id)
          .select('id, status, claim_number')
          .eq('id', b.klaim_id)
          .maybeSingle()
        if (eKlaim) return reply.status(500).send({ error: eKlaim.message })
        if (!klaim) return reply.status(404).send({ error: 'Klaim tidak ditemukan' })
        if (!['ditolak', 'gugur'].includes(klaim.status as string)) {
          return reply.status(422).send({
            error: `Klaim ${klaim.claim_number} masih berstatus ${klaim.status}. `
              + 'Sengketa hanya untuk klaim yang sudah ditolak atau gugur — '
              + 'menyengketakan klaim yang masih diproses adalah menyerah '
              + 'sebelum jawabannya keluar.',
          })
        }
      }

      const { data, error } = await request.db!
        .viaProject('sengketa', id)
        .insert({
          project_id: id,
          klaim_id: b.klaim_id || null,
          nomor: b.nomor?.trim() || null,
          judul: b.judul.trim(),
          pihak_lawan: b.pihak_lawan.trim(),
          pokok_perkara: b.pokok_perkara.trim(),
          dasar_hukum: b.dasar_hukum?.trim() || null,
          nilai_tuntutan: tuntutan,
          tanggal_mulai: mulai,
          forum: b.forum?.trim() || null,
          catatan: b.catatan?.trim() || null,
          created_by: request.currentUser!.id,
        })
        .select(SENGKETA_SELECT)
        .single()

      if (error) {
        request.log.error({ err: error, id }, 'gagal menambah sengketa')
        return reply.status(400).send({ error: error.message })
      }

      await logAuditEvent(request, {
        action: 'INSERT',
        actorId: request.currentUser!.id,
        tableName: 'sengketa',
        recordId: data!.id as string,
        newValues: data as Record<string, unknown>,
      })
      return reply.status(201).send({ sengketa: data })
    },
  )

  // ── PATCH /sengketa/:id/tahap ────────────────────────────────────────────
  //
  // Status lama WAJIB ikut di WHERE (penjaga `audit-klaim-status-atomik`):
  // dua permintaan bersamaan tak boleh keduanya berhasil, karena eskalasi
  // yang tercatat dua kali membuat riwayat perkaranya tak bisa dibaca.
  app.patch<{
    Params: { id: string }
    Body: {
      status?: string; forum?: string; hasil?: string
      nilai_putusan?: number | string; selesai_pada?: string; catatan?: string
    }
  }>(
    '/api/v1/sengketa/:id/tahap',
    { preHandler: [authenticate, requireModul('modul.risiko'), requirePermission('sengketa:manage')] },
    async (request, reply) => {
      const { id } = request.params
      const b = request.body
      const idProyek = await request.db!.projectIds()

      if (!b.status || !STATUS_SENGKETA_SAH.includes(b.status as StatusSengketa)) {
        return reply.status(400).send({
          error: `status harus salah satu dari: ${STATUS_SENGKETA_SAH.join(', ')}`,
        })
      }
      const ke = b.status as StatusSengketa

      const { data: lama, error: eLama } = await request.db!
        .unsafe('sengketa', 'dibaca lewat id; RLS + saringan proyek di WHERE')
        .select('id, project_id, status, tanggal_mulai, nomor')
        .eq('id', id)
        .in('project_id', idProyek)
        .maybeSingle()
      if (eLama) {
        request.log.error({ err: eLama, id }, 'gagal memuat sengketa')
        return reply.status(500).send({ error: 'Gagal memuat sengketa' })
      }
      if (!lama) return reply.status(404).send({ error: 'Sengketa tidak ditemukan' })

      const dari = lama.status as StatusSengketa
      const izin = bolehPindahTahapSengketa(dari, ke)
      if (!izin.boleh) {
        return reply.status(422).send({
          error: `Tak bisa pindah dari ${dari} ke ${ke}: ${izin.alasan}`,
        })
      }

      const patch: Record<string, unknown> = {
        status: ke,
        updated_at: new Date().toISOString(),
      }
      if (b.forum !== undefined) patch.forum = b.forum?.trim() || null
      if (b.catatan !== undefined) patch.catatan = b.catatan?.trim() || null

      if (ke === 'selesai') {
        const hasil = b.hasil?.trim() ?? ''
        if (hasil.length < 10) {
          return reply.status(422).send({
            error: 'Sengketa yang selesai wajib punya hasil (minimal 10 huruf). '
              + 'Sengketa yang ditutup tanpa hasil tercatat adalah sengketa '
              + 'yang hilang — dan yang hilang tak bisa dipakai saat perkara '
              + 'serupa datang lagi.',
          })
        }
        const selesai = b.selesai_pada || hariIni()
        if (!tanggalSah(selesai)) {
          return reply.status(400).send({ error: 'selesai_pada harus berformat YYYY-MM-DD' })
        }
        if (selesai < (lama.tanggal_mulai as string)) {
          return reply.status(422).send({
            error: 'Tanggal selesai tidak boleh mendahului tanggal mulai sengketa.',
          })
        }
        patch.hasil = hasil
        patch.selesai_pada = selesai

        if (b.nilai_putusan != null && b.nilai_putusan !== '') {
          const n = Number(b.nilai_putusan)
          if (!Number.isFinite(n) || n < 0) {
            return reply.status(400).send({ error: 'nilai_putusan harus angka >= 0' })
          }
          patch.nilai_putusan = n
        }
      }

      // Status lama di WHERE — inilah yang membuat dua permintaan bersamaan
      // tak bisa keduanya berhasil.
      const { data, error } = await request.db!
        .unsafe('sengketa', 'diperbarui lewat id; status lama + proyek di WHERE')
        .update(patch)
        .eq('id', id)
        .eq('status', dari)
        .in('project_id', idProyek)
        .select(SENGKETA_SELECT)
        .maybeSingle()

      if (error) {
        request.log.error({ err: error, id }, 'gagal memindahkan tahap sengketa')
        return reply.status(400).send({ error: error.message })
      }
      if (!data) {
        return reply.status(409).send({
          error: 'Tahap sengketa sudah berubah lebih dulu oleh orang lain. '
            + 'Muat ulang halamannya sebelum mencoba lagi.',
        })
      }

      await logAuditEvent(request, {
        action: 'UPDATE',
        actorId: request.currentUser!.id,
        tableName: 'sengketa',
        recordId: id,
        oldValues: lama as Record<string, unknown>,
        newValues: data as Record<string, unknown>,
      })
      return reply.send({ sengketa: data })
    },
  )
}
