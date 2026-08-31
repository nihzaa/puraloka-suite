import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { requireModul } from '../../utils/gerbang-modul.js'
import { logAuditEvent } from '../../utils/audit.js'
import {
  ringkasSertifikat, periksaSyarat, ringkasKinerja, bolehPindahTahap,
  type Sertifikat, type Penilaian, type TahapLamaran, type SyaratKompetensi,
} from '../../lib/kompetensi-sdm.js'

/**
 * SERTIFIKASI · KINERJA · REKRUTMEN (G2e).
 *
 * ── Kenapa satu berkas untuk tiga hal
 *
 * Ketiganya adalah sudut pandang atas ORANG YANG SAMA, dan halamannya satu
 * dengan tiga tab (`ARAH-VISUAL-2026` §6a: tab = sudut pandang berbeda atas
 * data yang sama). Memecahnya jadi tiga berkas berarti tiga rute yang
 * memuat pegawai yang sama tiga kali.
 *
 * ── Yang membedakan sertifikasi dari dua lainnya
 *
 * Sertifikasi punya pemicu NYATA: syarat prakualifikasi tender. Sertifikat
 * yang KEDALUWARSA tak boleh terhitung sebagai bukti kompetensi — tender yang
 * dipenuhi dengan sertifikat mati adalah dokumen palsu di mata panitia.
 *
 * Karena itu ada `POST /sdm/periksa-syarat`: memeriksa apakah syarat tender
 * terpenuhi pada TANGGAL ACUAN, bukan hari ini. Prakualifikasi yang diajukan
 * bulan lalu diperiksa dengan keadaan bulan lalu.
 *
 * ── Peringatan tenancy
 *
 * `sertifikat_pegawai` & `penilaian_kinerja` kategori C lewat `pegawai_id`.
 * `lamaran_kerja` kategori B (punya `company_id`).
 */

const SERTIFIKAT_SELECT = `
  id, pegawai_id, jenis, nama, nomor, penerbit, klasifikasi, kualifikasi,
  tanggal_terbit, berlaku_sampai, berjangka, path_berkas, catatan, created_at
`

const PENILAIAN_SELECT = `
  id, pegawai_id, periode, tanggal_mulai, tanggal_selesai, skala_maks, skor,
  kekuatan, perbaikan, rencana_tindak, status, penilai, dinilai_pada,
  tanggapan_pegawai, created_at,
  yang_menilai:users ( id, name )
`

const LAMARAN_SELECT = `
  id, nama, email, telepon, posisi, sumber, tahap, catatan_tahap,
  path_cv, catatan, pegawai_id, created_at, updated_at
`

const TAHAP_SAH: TahapLamaran[] = [
  'masuk', 'seleksi_berkas', 'wawancara', 'tawaran', 'diterima', 'ditolak']

/** Hari ini sebagai `YYYY-MM-DD`, tanpa melewati zona waktu mesin. */
const hariIni = () => new Date().toISOString().slice(0, 10)

export default async function kompetensiSdmRoutes(app: FastifyInstance) {
  // ── GET /sdm/pegawai/:id/kompetensi ──────────────────────────────────────
  app.get<{ Params: { id: string }; Querystring: { pada?: string; ambang?: string } }>(
    '/api/v1/sdm/pegawai/:id/kompetensi',
    { preHandler: [authenticate, requireModul('modul.sdm'), requirePermission('sdm:sertifikat:view')] },
    async (request, reply) => {
      const { id } = request.params
      const pada = request.query.pada ?? hariIni()
      const ambang = Number(request.query.ambang) || 60

      if (!/^\d{4}-\d{2}-\d{2}$/.test(pada)) {
        return reply.status(400).send({ error: 'pada harus berformat YYYY-MM-DD' })
      }

      const { data: peg, error: ePeg } = await request.db!
        .from('pegawai')
        .select('id, nomor_induk, jabatan, orang:users ( id, name )')
        .eq('id', id)
        .maybeSingle()
      if (ePeg) {
        request.log.error({ err: ePeg, id }, 'gagal memuat pegawai')
        return reply.status(500).send({ error: 'Gagal memuat pegawai' })
      }
      if (!peg) return reply.status(404).send({ error: 'Pegawai tidak ditemukan' })

      // ⚠ lewat `pegawai_id`, BUKAN project_id.
      const { data: sertifikat, error: eSer } = await request.db!
        .viaProject('sertifikat_pegawai', id)
        .select(SERTIFIKAT_SELECT)
        .order('berlaku_sampai', { ascending: true, nullsFirst: false })
        .limit(300)
      if (eSer) {
        request.log.error({ err: eSer, id }, 'gagal memuat sertifikat')
        return reply.status(500).send({ error: 'Gagal memuat sertifikat' })
      }

      const { data: penilaian, error: ePen } = await request.db!
        .viaProject('penilaian_kinerja', id)
        .select(PENILAIAN_SELECT)
        .order('periode', { ascending: false })
        .limit(100)
      if (ePen) {
        request.log.error({ err: ePen, id }, 'gagal memuat penilaian kinerja')
        return reply.status(500).send({ error: 'Gagal memuat penilaian kinerja' })
      }

      const barisSer = (sertifikat ?? []) as unknown as Sertifikat[]
      const barisPen = (penilaian ?? []) as unknown as Penilaian[]

      return reply.send({
        pegawai: peg,
        pada,
        sertifikat: ringkasSertifikat(barisSer, pada, ambang),
        penilaian: barisPen,
        kinerja: ringkasKinerja(barisPen),
      })
    },
  )

  // ── POST /sdm/pegawai/:id/sertifikat ─────────────────────────────────────
  app.post<{
    Params: { id: string }
    Body: {
      jenis?: string; nama?: string; nomor?: string; penerbit?: string
      klasifikasi?: string; kualifikasi?: string
      tanggal_terbit?: string; berlaku_sampai?: string
      berjangka?: boolean; catatan?: string
    }
  }>(
    '/api/v1/sdm/pegawai/:id/sertifikat',
    { preHandler: [authenticate, requireModul('modul.sdm'), requirePermission('sdm:sertifikat:manage')] },
    async (request, reply) => {
      const { id } = request.params
      const b = request.body

      if (!b.jenis?.trim()) return reply.status(400).send({ error: 'jenis wajib diisi' })
      if (!b.nama?.trim()) return reply.status(400).send({ error: 'nama wajib diisi' })

      // Bawaan `true`: sebagian besar sertifikat konstruksi BERJANGKA, dan
      // bawaan yang salah di sini menghasilkan "berlaku selamanya" palsu.
      const berjangka = b.berjangka !== false

      if (berjangka && !b.berlaku_sampai) {
        return reply.status(400).send({
          error: 'Sertifikat berjangka wajib punya tanggal kedaluwarsa. '
            + 'Kalau memang seumur hidup (ijazah, pelatihan tanpa masa berlaku), '
            + 'tandai sebagai tidak berjangka — sertifikat berjangka tanpa '
            + 'tanggal akan terbaca "berlaku selamanya" dan dipakai memenuhi '
            + 'syarat tender.',
        })
      }

      const { data: peg, error: ePeg } = await request.db!
        .from('pegawai').select('id').eq('id', id).maybeSingle()
      if (ePeg) return reply.status(500).send({ error: ePeg.message })
      if (!peg) return reply.status(404).send({ error: 'Pegawai tidak ditemukan' })

      const { data, error } = await request.db!
        .viaProject('sertifikat_pegawai', id)
        .insert({
          pegawai_id: id,
          jenis: b.jenis.trim(),
          nama: b.nama.trim(),
          nomor: b.nomor?.trim() || null,
          penerbit: b.penerbit?.trim() || null,
          klasifikasi: b.klasifikasi?.trim() || null,
          kualifikasi: b.kualifikasi?.trim() || null,
          tanggal_terbit: b.tanggal_terbit || null,
          berlaku_sampai: b.berlaku_sampai || null,
          berjangka,
          catatan: b.catatan?.trim() || null,
          dicatat_oleh: request.currentUser!.id,
        })
        .select(SERTIFIKAT_SELECT)
        .single()

      if (error) {
        request.log.error({ err: error, id }, 'gagal menambah sertifikat')
        return reply.status(400).send({ error: error.message })
      }

      await logAuditEvent(request, {
        action: 'INSERT',
        actorId: request.currentUser!.id,
        tableName: 'sertifikat_pegawai',
        recordId: data!.id as string,
        newValues: data as Record<string, unknown>,
      })
      return reply.status(201).send({ sertifikat: data })
    },
  )

  // ── POST /sdm/periksa-syarat ─────────────────────────────────────────────
  //
  // Inti alasan modul ini ada. Memeriksa apakah syarat kompetensi tender
  // terpenuhi pada TANGGAL ACUAN — bukan hari ini.
  app.post<{
    Body: { pada?: string; syarat?: SyaratKompetensi[] }
  }>(
    '/api/v1/sdm/periksa-syarat',
    { preHandler: [authenticate, requireModul('modul.sdm'), requirePermission('sdm:sertifikat:view')] },
    async (request, reply) => {
      const b = request.body
      const pada = b.pada ?? hariIni()

      if (!/^\d{4}-\d{2}-\d{2}$/.test(pada)) {
        return reply.status(400).send({ error: 'pada harus berformat YYYY-MM-DD' })
      }
      if (!Array.isArray(b.syarat) || b.syarat.length === 0) {
        return reply.status(400).send({
          error: 'syarat wajib berisi minimal satu tuntutan kompetensi',
        })
      }
      for (const s of b.syarat) {
        if (!s.jenis?.trim()) {
          return reply.status(400).send({ error: 'tiap syarat wajib punya jenis' })
        }
        if (!Number.isFinite(s.jumlah) || s.jumlah < 1) {
          return reply.status(400).send({
            error: `syarat "${s.jenis}" wajib punya jumlah minimal 1`,
          })
        }
      }

      // Pegawai aktif + sertifikatnya. Diambil sekaligus, bukan satu query
      // per pegawai — N+1 di sini berarti puluhan query untuk satu periksa.
      const { data: pegawai, error: ePeg } = await request.db!
        .from('pegawai')
        .select('id, nomor_induk, orang:users ( id, name )')
        .is('tanggal_keluar', null)
        .limit(500)
      if (ePeg) {
        request.log.error({ err: ePeg }, 'gagal memuat pegawai')
        return reply.status(500).send({ error: 'Gagal memuat daftar pegawai' })
      }

      const ids = (pegawai ?? []).map((p) => (p as { id: string }).id)
      let sertifikat: Array<Record<string, unknown>> = []
      if (ids.length > 0) {
        const { data, error } = await request.db!
          .unsafe('sertifikat_pegawai',
            'disaring .in(pegawai_id, id pegawai milik tenant ini) di query yang SAMA')
          .select(SERTIFIKAT_SELECT)
          .in('pegawai_id', ids)
          .limit(3000)
        if (error) {
          request.log.error({ err: error }, 'gagal memuat sertifikat')
          return reply.status(500).send({ error: 'Gagal memuat sertifikat' })
        }
        sertifikat = (data ?? []) as Array<Record<string, unknown>>
      }

      const pemegang = (pegawai ?? []).map((p) => {
        const r = p as unknown as { id: string; orang: { name: string } | null }
        return {
          pegawai_id: r.id,
          nama: r.orang?.name ?? '(tanpa nama)',
          sertifikat: sertifikat
            .filter((s) => s.pegawai_id === r.id) as unknown as Sertifikat[],
        }
      })

      const hasil = b.syarat.map((s) => periksaSyarat(s, pemegang, pada))

      return reply.send({
        pada,
        hasil,
        // Semua syarat terpenuhi = boleh ikut. Satu saja kurang, tidak.
        semua_terpenuhi: hasil.every((h) => h.cukup),
      })
    },
  )

  // ── POST /sdm/pegawai/:id/penilaian ──────────────────────────────────────
  app.post<{
    Params: { id: string }
    Body: {
      periode?: string; skala_maks?: number | string; skor?: number | string
      kekuatan?: string; perbaikan?: string; rencana_tindak?: string
      finalkan?: boolean
    }
  }>(
    '/api/v1/sdm/pegawai/:id/penilaian',
    { preHandler: [authenticate, requireModul('modul.sdm'), requirePermission('sdm:kinerja:manage')] },
    async (request, reply) => {
      const { id } = request.params
      const b = request.body

      if (!b.periode?.trim()) {
        return reply.status(400).send({ error: 'periode wajib diisi (mis. 2026-S1)' })
      }

      // `null` untuk kosong, bukan 0 — pelajaran G2a (`Number('') === 0`).
      const num = (v: unknown): number | null => {
        if (v === null || v === undefined) return null
        const s = String(v).trim()
        if (s === '') return null
        const n = Number(s)
        return Number.isFinite(n) ? n : null
      }

      const maks = num(b.skala_maks) ?? 5
      const skor = num(b.skor)

      if (maks <= 0) {
        return reply.status(400).send({ error: 'skala_maks harus lebih dari nol' })
      }
      if (skor !== null && (skor < 0 || skor > maks)) {
        return reply.status(400).send({
          error: `skor harus antara 0 dan ${maks} — skor di luar skala akan `
            + 'mengubah rata-rata seluruh tim tanpa ada yang tahu sebabnya',
        })
      }
      // Yang FINAL wajib punya skor: penilaian final tanpa skor adalah
      // pernyataan "sudah dinilai" yang tak memuat nilainya.
      if (b.finalkan && skor === null) {
        return reply.status(400).send({
          error: 'Penilaian yang difinalkan wajib punya skor',
        })
      }

      const { data: peg, error: ePeg } = await request.db!
        .from('pegawai').select('id').eq('id', id).maybeSingle()
      if (ePeg) return reply.status(500).send({ error: ePeg.message })
      if (!peg) return reply.status(404).send({ error: 'Pegawai tidak ditemukan' })

      // Satu penilaian per (pegawai, periode) — mengisi ulang MEMPERBARUI.
      const { data: lama, error: eLama } = await request.db!
        .viaProject('penilaian_kinerja', id)
        .select('id, status')
        .eq('periode', b.periode.trim())
        .maybeSingle()
      if (eLama) return reply.status(500).send({ error: eLama.message })

      // Yang sudah FINAL tak boleh diubah diam-diam: penilaian yang sudah
      // disampaikan ke pegawai adalah dasar keputusan tentang orang.
      if (lama && (lama as { status: string }).status === 'final') {
        return reply.status(409).send({
          error: 'Penilaian periode ini sudah difinalkan — buat periode baru '
            + 'kalau ada koreksi, supaya jejaknya terlihat.',
        })
      }

      const isi = {
        pegawai_id: id,
        periode: b.periode.trim(),
        skala_maks: maks,
        skor,
        kekuatan: b.kekuatan?.trim() || null,
        perbaikan: b.perbaikan?.trim() || null,
        rencana_tindak: b.rencana_tindak?.trim() || null,
        // Bentuk objek dibuat SERAGAM, bukan spread bersyarat: dua bentuk
        // berbeda membuat TypeScript menyimpulkan union yang tak diterima
        // query builder. Yang draf mengosongkan penilai — dan itu memang
        // benar: draf belum dinilai siapa pun.
        status: b.finalkan ? ('final' as const) : ('draf' as const),
        // Penilai diisi SERVER dari sesi, bukan diterima dari klien.
        penilai: b.finalkan ? request.currentUser!.id : null,
        dinilai_pada: b.finalkan ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }

      const q = request.db!.viaProject('penilaian_kinerja', id)
      const { data, error } = lama
        ? await q.update(isi).eq('id', (lama as { id: string }).id)
          .select(PENILAIAN_SELECT).maybeSingle()
        : await q.insert(isi).select(PENILAIAN_SELECT).single()

      if (error) {
        request.log.error({ err: error, id }, 'gagal menyimpan penilaian')
        return reply.status(400).send({ error: error.message })
      }
      if (!data) return reply.status(404).send({ error: 'Penilaian tak ditemukan' })

      await logAuditEvent(request, {
        action: lama ? 'UPDATE' : 'INSERT',
        actorId: request.currentUser!.id,
        tableName: 'penilaian_kinerja',
        recordId: data!.id as string,
        newValues: data as Record<string, unknown>,
      })
      return reply.status(lama ? 200 : 201).send({ penilaian: data })
    },
  )

  // ── GET /sdm/lamaran ─────────────────────────────────────────────────────
  app.get(
    '/api/v1/sdm/lamaran',
    { preHandler: [authenticate, requireModul('modul.sdm'), requirePermission('sdm:rekrutmen:view')] },
    async (request, reply) => {
      const { data, error } = await request.db!
        .from('lamaran_kerja')
        .select(LAMARAN_SELECT)
        .order('created_at', { ascending: false })
        .limit(300)
      if (error) {
        request.log.error({ err: error }, 'gagal memuat lamaran')
        return reply.status(500).send({ error: 'Gagal memuat lamaran' })
      }
      return reply.send({ lamaran: data ?? [] })
    },
  )

  // ── POST /sdm/lamaran ────────────────────────────────────────────────────
  app.post<{
    Body: { nama?: string; posisi?: string; email?: string; telepon?: string; sumber?: string }
  }>(
    '/api/v1/sdm/lamaran',
    { preHandler: [authenticate, requireModul('modul.sdm'), requirePermission('sdm:rekrutmen:manage')] },
    async (request, reply) => {
      const b = request.body
      if (!b.nama?.trim()) return reply.status(400).send({ error: 'nama wajib diisi' })
      if (!b.posisi?.trim()) return reply.status(400).send({ error: 'posisi wajib diisi' })

      const { data, error } = await request.db!
        .from('lamaran_kerja')
        .insert({
          company_id: request.companyId!,
          nama: b.nama.trim(),
          posisi: b.posisi.trim(),
          email: b.email?.trim() || null,
          telepon: b.telepon?.trim() || null,
          sumber: b.sumber?.trim() || null,
          dicatat_oleh: request.currentUser!.id,
        })
        .select(LAMARAN_SELECT)
        .single()

      if (error) {
        request.log.error({ err: error }, 'gagal mencatat lamaran')
        return reply.status(400).send({ error: error.message })
      }
      return reply.status(201).send({ lamaran: data })
    },
  )

  // ── POST /sdm/lamaran/:id/tahap ──────────────────────────────────────────
  app.post<{
    Params: { id: string }
    Body: { tahap?: string; catatan?: string; pegawai_id?: string }
  }>(
    '/api/v1/sdm/lamaran/:id/tahap',
    { preHandler: [authenticate, requireModul('modul.sdm'), requirePermission('sdm:rekrutmen:manage')] },
    async (request, reply) => {
      const { id } = request.params
      const b = request.body

      if (!b.tahap || !TAHAP_SAH.includes(b.tahap as TahapLamaran)) {
        return reply.status(400).send({
          error: `tahap wajib salah satu: ${TAHAP_SAH.join(', ')}`,
        })
      }
      const ke = b.tahap as TahapLamaran

      // Penolakan WAJIB beralasan — pelamar yang ditolak tanpa catatan akan
      // dihubungi lagi untuk lowongan yang sama.
      if (ke === 'ditolak' && !b.catatan?.trim()) {
        return reply.status(400).send({
          error: 'Penolakan wajib beralasan — tanpa catatan, pelamar yang sama '
            + 'akan dihubungi lagi untuk lowongan yang sama',
        })
      }
      // Yang DITERIMA wajib tersambung ke pegawainya: lamaran "diterima"
      // tanpa pegawai adalah pernyataan yang tak bisa ditelusuri.
      if (ke === 'diterima' && !b.pegawai_id) {
        return reply.status(400).send({
          error: 'Lamaran yang diterima wajib ditautkan ke data pegawainya — '
            + 'buat dulu data kepegawaiannya, lalu tautkan di sini',
        })
      }

      const { data: lama, error: eLama } = await request.db!
        .from('lamaran_kerja')
        .select('id, tahap')
        .eq('id', id)
        .maybeSingle()
      if (eLama) return reply.status(500).send({ error: eLama.message })
      if (!lama) return reply.status(404).send({ error: 'Lamaran tidak ditemukan' })

      const izin = bolehPindahTahap((lama as { tahap: TahapLamaran }).tahap, ke)
      if (!izin.boleh) {
        return reply.status(422).send({ error: izin.sebab ?? 'Tahap tak bisa dipindah' })
      }

      // Tahap lama ikut di WHERE — dua perpindahan bersamaan tak boleh
      // sama-sama berhasil.
      const { data, error } = await request.db!
        .from('lamaran_kerja')
        .update({
          tahap: ke,
          catatan_tahap: b.catatan?.trim() || null,
          ...(b.pegawai_id ? { pegawai_id: b.pegawai_id } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('tahap', (lama as { tahap: string }).tahap)
        .select(LAMARAN_SELECT)
        .maybeSingle()

      if (error) {
        request.log.error({ err: error, id }, 'gagal memindah tahap lamaran')
        return reply.status(400).send({ error: error.message })
      }
      if (!data) {
        return reply.status(409).send({
          error: 'Tahap lamaran ini baru saja berubah dari tempat lain. '
            + 'Muat ulang halaman.',
        })
      }

      await logAuditEvent(request, {
        action: 'UPDATE',
        actorId: request.currentUser!.id,
        tableName: 'lamaran_kerja',
        recordId: id,
        newValues: data as Record<string, unknown>,
      })
      return reply.send({ lamaran: data })
    },
  )
}
