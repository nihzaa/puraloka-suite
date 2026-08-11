import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'
import {
  rekapInsiden, hitungTrir, hitungInsidenSubkon, periksaSelaras,
  ringkasJsa, rekapTemuan, statusInduksi, rekapApd, rekapLingkungan,
  type Insiden, type LangkahJsa, type TemuanK3, type Induksi,
  type Apd, type UkurLingkungan, type JenisInsiden, type StatusInsiden,
} from '../../lib/k3-lapangan.js'

/**
 * K3 LAPANGAN — insiden · JSA · induksi · APD · inspeksi · lingkungan (G4).
 *
 * ── Kenapa insiden jadi pusat modul ini
 *
 * `lib/kepatuhan-k3.ts` MENGGUGURKAN subkon dari pekerjaan bila
 * `jumlah_kecelakaan > 0`, dan sebelum G4 angka itu diketik manual tanpa satu
 * pun baris yang menjelaskannya. `GET /proyek/:id/k3/selaras` menutup itu:
 * membandingkan angka yang DIKETIK di evaluasi dengan angka yang DIHITUNG
 * dari insiden, beserta id insidennya supaya bisa dibuka satu per satu.
 *
 * ── Peringatan tenancy
 *
 *   jsa                   kategori B (punya `company_id`)
 *   jsa_langkah           kategori C lewat `jsa_id`      ← BUKAN project_id
 *   temuan_k3             kategori C lewat `inspeksi_id` ← BUKAN project_id
 *   insiden_k3 / induksi_k3 / apd_serah_terima /
 *   inspeksi_k3 / pemantauan_lingkungan   kategori C lewat `project_id`
 *
 * `viaProject(tabel, id)` menyusun `.eq(<kolom lewat>, id)`. Salah argumen
 * mengembalikan NOL BARIS tanpa galat — dan pada modul K3 itu berarti layar
 * berkata "tak ada insiden" untuk proyek yang punya kecelakaan.
 */

const INSIDEN_SELECT = `
  id, project_id, nomor, jenis, tanggal, waktu, lokasi, kronologi,
  supplier_id, mandor_id, korban_nama, korban_worker_id, melukai,
  hari_kerja_hilang, cedera_uraian, penyebab_langsung, penyebab_dasar,
  tindakan_korektif, jsa_id, izin_kerja_id, status, ditutup_pada,
  biaya_akibat, catatan, created_at,
  pelapor:users!insiden_k3_dilaporkan_oleh_fkey ( id, name ),
  subkon:suppliers ( id, name )
`

const JSA_SELECT = `
  id, company_id, project_id, kode, jenis_pekerjaan, uraian,
  disetujui_pada, berlaku, catatan, created_at,
  penyusun:users!jsa_disusun_oleh_fkey ( id, name )
`

const LANGKAH_SELECT = `
  id, jsa_id, urutan, langkah, bahaya, pengendalian, apd_wajib,
  dampak, kemungkinan, skor, dampak_sisa, kemungkinan_sisa
`

const TEMUAN_SELECT = `
  id, inspeksi_id, uraian, kategori, tingkat, tindakan, tenggat,
  status, ditutup_pada, created_at,
  penanggung:users!temuan_k3_penanggung_id_fkey ( id, name )
`

const JENIS_SAH: JenisInsiden[] = [
  'nyaris_celaka', 'kecelakaan_ringan', 'kecelakaan_berat', 'fatal',
  'kerusakan_properti', 'pencemaran_lingkungan']
const STATUS_SAH: StatusInsiden[] = [
  'dilaporkan', 'diselidiki', 'tindakan_berjalan', 'ditutup']
const STATUS_TEMUAN_SAH = ['terbuka', 'diperbaiki', 'ditutup'] as const

const hariIni = () => new Date().toISOString().slice(0, 10)
const tanggalSah = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)

/** Skala 1..5. `Number('')` adalah 0 — hanya batas bawah yang menangkapnya. */
function skala(v: unknown, nama: string): { nilai: number } | { galat: string } {
  if (v == null || v === '') return { galat: `${nama} wajib diisi (1–5)` }
  const n = Number(v)
  if (!Number.isInteger(n) || n < 1 || n > 5) {
    return { galat: `${nama} harus bilangan bulat 1–5` }
  }
  return { nilai: n }
}

export default async function k3LapanganRoutes(app: FastifyInstance) {
  // ── GET /proyek/:id/k3 ───────────────────────────────────────────────────
  //
  // Ikhtisar satu proyek: insiden, inspeksi, induksi, APD, lingkungan.
  app.get<{
    Params: { id: string }
    Querystring: { pada?: string; jam_kerja?: string }
  }>(
    '/api/v1/proyek/:id/k3',
    { preHandler: [authenticate, requirePermission('k3:inspeksi:view')] },
    async (request, reply) => {
      const { id } = request.params
      const pada = request.query.pada ?? hariIni()
      if (!tanggalSah(pada)) {
        return reply.status(400).send({ error: 'pada harus berformat YYYY-MM-DD' })
      }
      // Jam kerja untuk TRIR. `null` bila tak diberikan — dan TRIR-nya pun
      // `null`, bukan 0 (lihat pustaka).
      const jamMentah = request.query.jam_kerja
      const jamKerja = jamMentah != null && jamMentah !== ''
        ? Number(jamMentah) : null
      if (jamKerja !== null && (!Number.isFinite(jamKerja) || jamKerja < 0)) {
        return reply.status(400).send({ error: 'jam_kerja harus angka >= 0' })
      }

      const { data: proyek, error: eProy } = await request.db!
        .from('projects').select('id, name').eq('id', id).maybeSingle()
      if (eProy) {
        request.log.error({ err: eProy, id }, 'gagal memuat proyek')
        return reply.status(500).send({ error: 'Gagal memuat proyek' })
      }
      if (!proyek) return reply.status(404).send({ error: 'Proyek tidak ditemukan' })

      const { data: insiden, error: eIns } = await request.db!
        .viaProject('insiden_k3', id)
        .select(INSIDEN_SELECT)
        .order('tanggal', { ascending: false })
        .limit(500)
      if (eIns) {
        request.log.error({ err: eIns, id }, 'gagal memuat insiden')
        return reply.status(500).send({ error: 'Gagal memuat insiden' })
      }

      const { data: inspeksi, error: eInsp } = await request.db!
        .viaProject('inspeksi_k3', id)
        .select('id, nomor, tanggal, area, pemeriksa_nama, ringkasan')
        .order('tanggal', { ascending: false })
        .limit(200)
      if (eInsp) {
        request.log.error({ err: eInsp, id }, 'gagal memuat inspeksi K3')
        return reply.status(500).send({ error: 'Gagal memuat inspeksi K3' })
      }

      // ⚠ `temuan_k3` lewat `inspeksi_id`, BUKAN project_id. Diambil sekali
      // untuk seluruh inspeksi lewat `unsafe` + saringan eksplisit atas id
      // yang barisnya baru saja lewat RLS.
      const idInspeksi = (inspeksi ?? []).map((x) => x.id as string)
      let temuan: Array<Record<string, unknown>> = []
      if (idInspeksi.length > 0) {
        const { data: t, error: eT } = await request.db!
          .unsafe('temuan_k3',
            'disaring ke id inspeksi yang barisnya sudah lewat RLS pada query di atas')
          .select(TEMUAN_SELECT)
          .in('inspeksi_id', idInspeksi)
          .limit(2000)
        if (eT) {
          request.log.error({ err: eT, id }, 'gagal memuat temuan K3')
          return reply.status(500).send({ error: 'Gagal memuat temuan K3' })
        }
        temuan = t ?? []
      }

      const tglInspeksi = new Map(
        (inspeksi ?? []).map((x) => [x.id as string, x.tanggal as string]))
      const temuanLengkap = temuan.map((t) => ({
        ...t,
        tanggal_inspeksi: tglInspeksi.get(t.inspeksi_id as string) ?? pada,
      })) as unknown as TemuanK3[]

      const { data: induksi, error: eInd } = await request.db!
        .viaProject('induksi_k3', id)
        .select('id, worker_id, peserta_nama, jenis, tanggal, berlaku_sampai, materi')
        .order('tanggal', { ascending: false })
        .limit(1000)
      if (eInd) {
        request.log.error({ err: eInd, id }, 'gagal memuat induksi')
        return reply.status(500).send({ error: 'Gagal memuat induksi' })
      }

      const { data: apd, error: eApd } = await request.db!
        .viaProject('apd_serah_terima', id)
        .select('id, worker_id, penerima_nama, jenis_apd, jumlah, tanggal, ganti_sebelum, kondisi')
        .order('tanggal', { ascending: false })
        .limit(1000)
      if (eApd) {
        request.log.error({ err: eApd, id }, 'gagal memuat APD')
        return reply.status(500).send({ error: 'Gagal memuat APD' })
      }

      const { data: lingkungan, error: eLing } = await request.db!
        .viaProject('pemantauan_lingkungan', id)
        .select('id, parameter, tanggal, lokasi, nilai, satuan, baku_mutu, metode')
        .order('tanggal', { ascending: false })
        .limit(500)
      if (eLing) {
        request.log.error({ err: eLing, id }, 'gagal memuat pemantauan lingkungan')
        return reply.status(500).send({ error: 'Gagal memuat pemantauan lingkungan' })
      }

      // Pekerja aktif PROYEK INI — dasar persentase induksi.
      //
      // Rantainya: `mandor_assignments.mandor_id` → `workers.mandor_id`.
      // DIUKUR, bukan ditebak.
      //
      // Versi pertama mengambil SELURUH `workers` perusahaan begitu proyeknya
      // punya penugasan — dan komentarnya sendiri menyatakan niat sebaliknya.
      // Terlihat di layar: "3 dari 60 pekerja · 5%" untuk proyek yang
      // sebenarnya punya 30 pekerja. Angka seperti itu menuduh proyek yang
      // baik-baik saja, dan orang berhenti mempercayai seluruh kartunya.
      const { data: tugas, error: eTugas } = await request.db!
        .viaProject('mandor_assignments', id)
        .select('mandor_id')
        .limit(500)
      if (eTugas) {
        request.log.error({ err: eTugas, id }, 'gagal memuat penugasan mandor')
        return reply.status(500).send({ error: 'Gagal memuat penugasan mandor' })
      }

      const idMandor = [...new Set(
        (tugas ?? []).map((t) => t.mandor_id as string | null).filter(Boolean))] as string[]

      let idPekerja: string[] = []
      if (idMandor.length > 0) {
        // `workers` kategori B — `.from()` sudah menyaringnya ke tenant;
        // saringan mandor menyempitkannya ke proyek ini.
        const { data: w, error: eW } = await request.db!
          .from('workers')
          .select('id')
          .eq('is_active', true)
          .in('mandor_id', idMandor)
          .limit(2000)
        if (eW) {
          request.log.error({ err: eW, id }, 'gagal memuat pekerja')
          return reply.status(500).send({ error: 'Gagal memuat pekerja' })
        }
        idPekerja = (w ?? []).map((x) => x.id as string)
      }

      const barisInsiden = (insiden ?? []) as unknown as Insiden[]

      return reply.send({
        proyek,
        pada,
        insiden: barisInsiden,
        rekap_insiden: rekapInsiden(barisInsiden),
        trir: hitungTrir(barisInsiden, jamKerja),
        inspeksi: inspeksi ?? [],
        temuan: temuanLengkap,
        rekap_temuan: rekapTemuan(temuanLengkap, pada),
        induksi: induksi ?? [],
        status_induksi: statusInduksi(
          (induksi ?? []) as unknown as Induksi[], idPekerja, pada),
        apd: apd ?? [],
        rekap_apd: rekapApd((apd ?? []) as unknown as Apd[], pada),
        lingkungan: lingkungan ?? [],
        rekap_lingkungan: rekapLingkungan((lingkungan ?? []) as unknown as UkurLingkungan[]),
      })
    },
  )

  // ── GET /proyek/:id/k3/selaras ───────────────────────────────────────────
  //
  // INTI G4. Membandingkan angka kecelakaan yang DIKETIK di evaluasi subkon
  // dengan angka yang DIHITUNG dari baris insiden.
  //
  // Selisihnya bukan kerapian: kalau evaluasi menulis 0 sementara ada 2
  // kecelakaan tercatat, subkon yang seharusnya gugur tetap dipakai.
  app.get<{
    Params: { id: string }
    Querystring: { dari?: string; sampai?: string }
  }>(
    '/api/v1/proyek/:id/k3/selaras',
    { preHandler: [authenticate, requirePermission('k3:insiden:view')] },
    async (request, reply) => {
      const { id } = request.params
      const { dari, sampai } = request.query
      for (const [nama, v] of [['dari', dari], ['sampai', sampai]] as const) {
        if (v && !tanggalSah(v)) {
          return reply.status(400).send({ error: `${nama} harus berformat YYYY-MM-DD` })
        }
      }

      const { data: proyek, error: eProy } = await request.db!
        .from('projects').select('id, name').eq('id', id).maybeSingle()
      if (eProy) return reply.status(500).send({ error: eProy.message })
      if (!proyek) return reply.status(404).send({ error: 'Proyek tidak ditemukan' })

      const { data: insiden, error: eIns } = await request.db!
        .viaProject('insiden_k3', id)
        .select('id, jenis, tanggal, melukai, hari_kerja_hilang, status, supplier_id, jsa_id, tindakan_korektif')
        .limit(1000)
      if (eIns) {
        request.log.error({ err: eIns, id }, 'gagal memuat insiden')
        return reply.status(500).send({ error: 'Gagal memuat insiden' })
      }

      // `evaluasi_subkon` kategori B (punya `company_id` sendiri) — DIUKUR
      // ke `tenant-map.generated.ts`, bukan ditebak dari kemiripannya dengan
      // tabel lain di modul ini. `.from()` sudah menyaring ke tenant; saringan
      // proyek ditambahkan eksplisit.
      const { data: evaluasi, error: eEval } = await request.db!
        .from('evaluasi_subkon')
        .select('id, supplier_id, pihak_nama, periode, jumlah_kecelakaan, jumlah_pelanggaran_k3, masuk_daftar_hitam')
        .eq('project_id', id)
        .limit(500)
      if (eEval) {
        request.log.error({ err: eEval, id }, 'gagal memuat evaluasi subkon')
        return reply.status(500).send({ error: 'Gagal memuat evaluasi subkon' })
      }

      const perSubkon = hitungInsidenSubkon(
        (insiden ?? []) as unknown as Insiden[],
        dari ?? null, sampai ?? null)

      const periksa = (evaluasi ?? [])
        .filter((e) => e.supplier_id)
        .map((e) => ({
          evaluasi_id: e.id,
          pihak_nama: e.pihak_nama,
          periode: e.periode,
          ...periksaSelaras(
            e.jumlah_kecelakaan as number | null,
            perSubkon.get(e.supplier_id as string),
            e.supplier_id as string),
        }))

      return reply.send({
        proyek,
        rentang: { dari: dari ?? null, sampai: sampai ?? null },
        periksa,
        // Yang TIDAK selaras — inilah yang menuntut perhatian. `null`
        // (belum ada insiden tercatat) TIDAK termasuk: itu belum tentu
        // salah, bisa jadi belum didata.
        tak_selaras: periksa.filter((p) => p.selaras === false),
      })
    },
  )

  // ── POST /proyek/:id/k3/insiden ──────────────────────────────────────────
  app.post<{
    Params: { id: string }
    Body: {
      jenis?: string; tanggal?: string; waktu?: string; lokasi?: string
      kronologi?: string; supplier_id?: string; mandor_id?: string
      korban_nama?: string; korban_worker_id?: string
      melukai?: boolean; hari_kerja_hilang?: number | string
      cedera_uraian?: string; jsa_id?: string; izin_kerja_id?: string
      nomor?: string; biaya_akibat?: number | string; catatan?: string
    }
  }>(
    '/api/v1/proyek/:id/k3/insiden',
    { preHandler: [authenticate, requirePermission('k3:insiden:manage')] },
    async (request, reply) => {
      const { id } = request.params
      const b = request.body

      if (!b.jenis || !JENIS_SAH.includes(b.jenis as JenisInsiden)) {
        return reply.status(400).send({
          error: `jenis harus salah satu dari: ${JENIS_SAH.join(', ')}`,
        })
      }
      const kronologi = b.kronologi?.trim() ?? ''
      if (kronologi.length < 10) {
        return reply.status(400).send({
          error: 'Kronologi wajib diisi minimal 10 huruf. Yang membaca laporan '
            + 'ini berbulan-bulan kemudian tak punya ingatan tentang kejadiannya '
            + '— hanya kalimat yang Anda tulis hari ini.',
        })
      }

      const tanggal = b.tanggal || hariIni()
      if (!tanggalSah(tanggal)) {
        return reply.status(400).send({ error: 'tanggal harus berformat YYYY-MM-DD' })
      }
      // Diperiksa di sini supaya pesannya terbaca manusia; trigger DB tetap
      // jadi lapis terakhir.
      if (tanggal > hariIni()) {
        return reply.status(422).send({
          error: 'Tanggal insiden ada di masa depan — periksa kembali tanggalnya. '
            + 'Angka ini masuk ke rekap keselamatan yang dipakai menilai subkon.',
        })
      }

      const melukai = b.melukai === true
      if (melukai && !b.korban_worker_id && !b.korban_nama?.trim()) {
        return reply.status(400).send({
          error: 'Insiden yang MELUKAI wajib menyebut korbannya. Tanpa itu tak '
            + 'ada yang bisa ditindaklanjuti — siapa yang diobati, siapa yang '
            + 'diberi santunan, siapa yang ditanya kronologinya.',
        })
      }

      let hari = 0
      if (b.hari_kerja_hilang != null && b.hari_kerja_hilang !== '') {
        const n = Number(b.hari_kerja_hilang)
        if (!Number.isInteger(n) || n < 0) {
          return reply.status(400).send({ error: 'hari_kerja_hilang harus bilangan bulat >= 0' })
        }
        hari = n
      }

      let biaya: number | null = null
      if (b.biaya_akibat != null && b.biaya_akibat !== '') {
        const n = Number(b.biaya_akibat)
        if (!Number.isFinite(n) || n < 0) {
          return reply.status(400).send({ error: 'biaya_akibat harus angka >= 0' })
        }
        biaya = n
      }

      const { data: proyek, error: eProy } = await request.db!
        .from('projects').select('id').eq('id', id).maybeSingle()
      if (eProy) return reply.status(500).send({ error: eProy.message })
      if (!proyek) return reply.status(404).send({ error: 'Proyek tidak ditemukan' })

      const { data, error } = await request.db!
        .viaProject('insiden_k3', id)
        .insert({
          project_id: id,
          nomor: b.nomor?.trim() || null,
          jenis: b.jenis,
          tanggal,
          waktu: b.waktu || null,
          lokasi: b.lokasi?.trim() || null,
          kronologi,
          supplier_id: b.supplier_id || null,
          mandor_id: b.mandor_id || null,
          korban_nama: b.korban_nama?.trim() || null,
          korban_worker_id: b.korban_worker_id || null,
          melukai,
          hari_kerja_hilang: hari,
          cedera_uraian: b.cedera_uraian?.trim() || null,
          jsa_id: b.jsa_id || null,
          izin_kerja_id: b.izin_kerja_id || null,
          biaya_akibat: biaya,
          catatan: b.catatan?.trim() || null,
          dilaporkan_oleh: request.currentUser!.id,
          created_by: request.currentUser!.id,
        })
        .select(INSIDEN_SELECT)
        .single()

      if (error) {
        request.log.error({ err: error, id }, 'gagal mencatat insiden')
        return reply.status(400).send({ error: error.message })
      }

      await logAuditEvent(request, {
        action: 'INSERT',
        actorId: request.currentUser!.id,
        tableName: 'insiden_k3',
        recordId: data!.id as string,
        newValues: data as Record<string, unknown>,
      })
      return reply.status(201).send({ insiden: data })
    },
  )

  // ── PATCH /k3/insiden/:id ────────────────────────────────────────────────
  //
  // Status lama WAJIB ikut di WHERE (penjaga `audit-klaim-status-atomik`).
  app.patch<{
    Params: { id: string }
    Body: {
      status?: string; penyebab_langsung?: string; penyebab_dasar?: string
      tindakan_korektif?: string; jsa_id?: string | null
      hari_kerja_hilang?: number | string; catatan?: string
    }
  }>(
    '/api/v1/k3/insiden/:id',
    { preHandler: [authenticate, requirePermission('k3:insiden:manage')] },
    async (request, reply) => {
      const { id } = request.params
      const b = request.body
      const idProyek = await request.db!.projectIds()

      const { data: lama, error: eLama } = await request.db!
        .unsafe('insiden_k3', 'dibaca lewat id; RLS + saringan proyek di WHERE')
        .select('id, project_id, status, tindakan_korektif')
        .eq('id', id)
        .in('project_id', idProyek)
        .maybeSingle()
      if (eLama) {
        request.log.error({ err: eLama, id }, 'gagal memuat insiden')
        return reply.status(500).send({ error: 'Gagal memuat insiden' })
      }
      if (!lama) return reply.status(404).send({ error: 'Insiden tidak ditemukan' })

      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (b.penyebab_langsung !== undefined) patch.penyebab_langsung = b.penyebab_langsung?.trim() || null
      if (b.penyebab_dasar !== undefined) patch.penyebab_dasar = b.penyebab_dasar?.trim() || null
      if (b.tindakan_korektif !== undefined) patch.tindakan_korektif = b.tindakan_korektif?.trim() || null
      if (b.jsa_id !== undefined) patch.jsa_id = b.jsa_id || null
      if (b.catatan !== undefined) patch.catatan = b.catatan?.trim() || null

      if (b.hari_kerja_hilang !== undefined) {
        const n = Number(b.hari_kerja_hilang)
        if (b.hari_kerja_hilang === '' || !Number.isInteger(n) || n < 0) {
          return reply.status(400).send({ error: 'hari_kerja_hilang harus bilangan bulat >= 0' })
        }
        patch.hari_kerja_hilang = n
      }

      const dari = lama.status as StatusInsiden
      if (b.status !== undefined) {
        if (!STATUS_SAH.includes(b.status as StatusInsiden)) {
          return reply.status(400).send({
            error: `status harus salah satu dari: ${STATUS_SAH.join(', ')}`,
          })
        }
        if (b.status === 'ditutup') {
          const korektif = (patch.tindakan_korektif as string | null)
            ?? (lama.tindakan_korektif as string | null)
          if (!korektif || korektif.trim().length < 10) {
            return reply.status(422).send({
              error: 'Menutup insiden wajib menuliskan tindakan korektif '
                + '(minimal 10 huruf). Insiden yang ditutup tanpa perbaikan '
                + 'hanya menunggu terulang — dan yang terulang biasanya lebih '
                + 'parah dari yang pertama.',
            })
          }
          patch.ditutup_pada = hariIni()
          patch.ditutup_oleh = request.currentUser!.id
        }
        patch.status = b.status
      }

      const q = request.db!
        .unsafe('insiden_k3', 'diperbarui lewat id; status lama + proyek di WHERE')
        .update(patch)
        .eq('id', id)
        .in('project_id', idProyek)

      // Status lama di WHERE hanya bila status memang diubah — supaya
      // penyuntingan biasa (mis. menambah penyebab) tak gagal karena lomba
      // yang tak pernah terjadi.
      const { data, error } = b.status !== undefined
        ? await q.eq('status', dari).select(INSIDEN_SELECT).maybeSingle()
        : await q.select(INSIDEN_SELECT).maybeSingle()

      if (error) {
        request.log.error({ err: error, id }, 'gagal memperbarui insiden')
        return reply.status(400).send({ error: error.message })
      }
      if (!data) {
        return b.status !== undefined
          ? reply.status(409).send({
              error: 'Status insiden sudah berubah lebih dulu oleh orang lain. '
                + 'Muat ulang halamannya sebelum mencoba lagi.',
            })
          : reply.status(404).send({ error: 'Insiden tidak ditemukan' })
      }

      await logAuditEvent(request, {
        action: 'UPDATE',
        actorId: request.currentUser!.id,
        tableName: 'insiden_k3',
        recordId: id,
        oldValues: lama as Record<string, unknown>,
        newValues: data as Record<string, unknown>,
      })
      return reply.send({ insiden: data })
    },
  )

  // ── GET /k3/jsa ──────────────────────────────────────────────────────────
  app.get<{ Querystring: { proyek?: string } }>(
    '/api/v1/k3/jsa',
    { preHandler: [authenticate, requirePermission('k3:jsa:view')] },
    async (request, reply) => {
      // `jsa` kategori B — punya `company_id` sendiri.
      const { data: daftar, error } = await request.db!
        .from('jsa')
        .select(JSA_SELECT)
        .order('jenis_pekerjaan', { ascending: true })
        .limit(300)
      if (error) {
        request.log.error({ err: error }, 'gagal memuat JSA')
        return reply.status(500).send({ error: 'Gagal memuat JSA' })
      }

      const ids = (daftar ?? []).map((j) => j.id as string)
      let langkah: Array<Record<string, unknown>> = []
      if (ids.length > 0) {
        // ⚠ `jsa_langkah` lewat `jsa_id`, BUKAN project_id.
        const { data: l, error: eL } = await request.db!
          .unsafe('jsa_langkah', 'disaring ke id JSA yang barisnya sudah lewat RLS')
          .select(LANGKAH_SELECT)
          .in('jsa_id', ids)
          .order('urutan', { ascending: true })
          .limit(3000)
        if (eL) {
          request.log.error({ err: eL }, 'gagal memuat langkah JSA')
          return reply.status(500).send({ error: 'Gagal memuat langkah JSA' })
        }
        langkah = l ?? []
      }

      const per = new Map<string, LangkahJsa[]>()
      for (const l of langkah) {
        const k = l.jsa_id as string
        if (!per.has(k)) per.set(k, [])
        per.get(k)!.push(l as unknown as LangkahJsa)
      }

      return reply.send({
        jsa: (daftar ?? []).map((j) => {
          const l = per.get(j.id as string) ?? []
          return { ...j, langkah: l, ringkas: ringkasJsa(l) }
        }),
      })
    },
  )

  // ── POST /k3/jsa ─────────────────────────────────────────────────────────
  app.post<{
    Body: {
      jenis_pekerjaan?: string; kode?: string; uraian?: string
      project_id?: string; catatan?: string
    }
  }>(
    '/api/v1/k3/jsa',
    { preHandler: [authenticate, requirePermission('k3:jsa:manage')] },
    async (request, reply) => {
      const b = request.body
      if (!b.jenis_pekerjaan?.trim()) {
        return reply.status(400).send({ error: 'jenis_pekerjaan wajib diisi' })
      }

      const { data, error } = await request.db!
        .from('jsa')
        .insert({
          jenis_pekerjaan: b.jenis_pekerjaan.trim(),
          kode: b.kode?.trim() || null,
          uraian: b.uraian?.trim() || null,
          project_id: b.project_id || null,
          catatan: b.catatan?.trim() || null,
          disusun_oleh: request.currentUser!.id,
          created_by: request.currentUser!.id,
        })
        .select(JSA_SELECT)
        .single()

      if (error) {
        request.log.error({ err: error }, 'gagal menambah JSA')
        return reply.status(400).send({ error: error.message })
      }

      await logAuditEvent(request, {
        action: 'INSERT',
        actorId: request.currentUser!.id,
        tableName: 'jsa',
        recordId: data!.id as string,
        newValues: data as Record<string, unknown>,
      })
      return reply.status(201).send({ jsa: data })
    },
  )

  // ── POST /k3/jsa/:id/langkah ─────────────────────────────────────────────
  app.post<{
    Params: { id: string }
    Body: {
      langkah?: string; bahaya?: string; pengendalian?: string
      apd_wajib?: string; dampak?: number | string; kemungkinan?: number | string
      dampak_sisa?: number | string; kemungkinan_sisa?: number | string
      urutan?: number
    }
  }>(
    '/api/v1/k3/jsa/:id/langkah',
    { preHandler: [authenticate, requirePermission('k3:jsa:manage')] },
    async (request, reply) => {
      const { id } = request.params
      const b = request.body

      for (const [nama, v] of [
        ['langkah', b.langkah], ['bahaya', b.bahaya], ['pengendalian', b.pengendalian],
      ] as const) {
        if (!v?.trim()) {
          return reply.status(400).send({
            error: nama === 'pengendalian'
              ? 'Pengendalian wajib diisi. Langkah tanpa pengendalian adalah '
                + 'daftar bahaya, bukan analisa — dan daftar bahaya tanpa '
                + 'jawaban justru membuat orang berhenti membacanya.'
              : `${nama} wajib diisi`,
          })
        }
      }

      const d = skala(b.dampak ?? 3, 'dampak')
      if ('galat' in d) return reply.status(400).send({ error: d.galat })
      const k = skala(b.kemungkinan ?? 3, 'kemungkinan')
      if ('galat' in k) return reply.status(400).send({ error: k.galat })

      let ds: number | null = null
      let ks: number | null = null
      if (b.dampak_sisa != null && b.dampak_sisa !== '') {
        const s = skala(b.dampak_sisa, 'dampak_sisa')
        if ('galat' in s) return reply.status(400).send({ error: s.galat })
        ds = s.nilai
      }
      if (b.kemungkinan_sisa != null && b.kemungkinan_sisa !== '') {
        const s = skala(b.kemungkinan_sisa, 'kemungkinan_sisa')
        if ('galat' in s) return reply.status(400).send({ error: s.galat })
        ks = s.nilai
      }
      if (ds != null && ks != null && ds * ks > d.nilai * k.nilai) {
        return reply.status(422).send({
          error: 'Risiko sesudah pengendalian tidak boleh LEBIH TINGGI dari '
            + 'risiko awal. Kalau bahayanya memang lebih besar dari perkiraan, '
            + 'yang dinaikkan adalah penilaian awalnya.',
        })
      }

      const { data: induk, error: eInduk } = await request.db!
        .from('jsa').select('id').eq('id', id).maybeSingle()
      if (eInduk) return reply.status(500).send({ error: eInduk.message })
      if (!induk) return reply.status(404).send({ error: 'JSA tidak ditemukan' })

      // ⚠ lewat `jsa_id`, BUKAN project_id.
      const { data, error } = await request.db!
        .viaProject('jsa_langkah', id)
        .insert({
          jsa_id: id,
          urutan: b.urutan ?? 1,
          langkah: b.langkah!.trim(),
          bahaya: b.bahaya!.trim(),
          pengendalian: b.pengendalian!.trim(),
          apd_wajib: b.apd_wajib?.trim() || null,
          dampak: d.nilai,
          kemungkinan: k.nilai,
          dampak_sisa: ds,
          kemungkinan_sisa: ks,
        })
        .select(LANGKAH_SELECT)
        .single()

      if (error) {
        request.log.error({ err: error, id }, 'gagal menambah langkah JSA')
        return reply.status(400).send({ error: error.message })
      }
      return reply.status(201).send({ langkah: data })
    },
  )

  // ── POST /proyek/:id/k3/inspeksi ─────────────────────────────────────────
  app.post<{
    Params: { id: string }
    Body: { tanggal?: string; area?: string; nomor?: string; ringkasan?: string; pemeriksa_nama?: string }
  }>(
    '/api/v1/proyek/:id/k3/inspeksi',
    { preHandler: [authenticate, requirePermission('k3:inspeksi:manage')] },
    async (request, reply) => {
      const { id } = request.params
      const b = request.body
      const tanggal = b.tanggal || hariIni()
      if (!tanggalSah(tanggal)) {
        return reply.status(400).send({ error: 'tanggal harus berformat YYYY-MM-DD' })
      }

      const { data: proyek, error: eProy } = await request.db!
        .from('projects').select('id').eq('id', id).maybeSingle()
      if (eProy) return reply.status(500).send({ error: eProy.message })
      if (!proyek) return reply.status(404).send({ error: 'Proyek tidak ditemukan' })

      const { data, error } = await request.db!
        .viaProject('inspeksi_k3', id)
        .insert({
          project_id: id,
          nomor: b.nomor?.trim() || null,
          tanggal,
          area: b.area?.trim() || null,
          ringkasan: b.ringkasan?.trim() || null,
          pemeriksa: request.currentUser!.id,
          pemeriksa_nama: b.pemeriksa_nama?.trim() || null,
          created_by: request.currentUser!.id,
        })
        .select('id, nomor, tanggal, area, pemeriksa_nama, ringkasan')
        .single()

      if (error) {
        request.log.error({ err: error, id }, 'gagal menambah inspeksi K3')
        return reply.status(400).send({ error: error.message })
      }
      return reply.status(201).send({ inspeksi: data })
    },
  )

  // ── POST /k3/inspeksi/:id/temuan ─────────────────────────────────────────
  app.post<{
    Params: { id: string }
    Body: {
      uraian?: string; kategori?: string; tingkat?: number | string
      tindakan?: string; tenggat?: string; penanggung_id?: string
    }
  }>(
    '/api/v1/k3/inspeksi/:id/temuan',
    { preHandler: [authenticate, requirePermission('k3:inspeksi:manage')] },
    async (request, reply) => {
      const { id } = request.params
      const b = request.body

      if (!b.uraian?.trim()) {
        return reply.status(400).send({ error: 'uraian wajib diisi' })
      }
      const tingkat = Number(b.tingkat ?? 2)
      if (!Number.isInteger(tingkat) || tingkat < 1 || tingkat > 3) {
        return reply.status(400).send({ error: 'tingkat harus 1, 2, atau 3' })
      }
      if (b.tenggat && !tanggalSah(b.tenggat)) {
        return reply.status(400).send({ error: 'tenggat harus berformat YYYY-MM-DD' })
      }

      const idProyek = await request.db!.projectIds()
      const { data: induk, error: eInduk } = await request.db!
        .unsafe('inspeksi_k3', 'memeriksa induk; RLS + saringan proyek di WHERE')
        .select('id')
        .eq('id', id)
        .in('project_id', idProyek)
        .maybeSingle()
      if (eInduk) return reply.status(500).send({ error: eInduk.message })
      if (!induk) return reply.status(404).send({ error: 'Inspeksi tidak ditemukan' })

      // ⚠ lewat `inspeksi_id`, BUKAN project_id.
      const { data, error } = await request.db!
        .viaProject('temuan_k3', id)
        .insert({
          inspeksi_id: id,
          uraian: b.uraian.trim(),
          // Kategori dipakai mencari temuan BERULANG — dinormalkan huruf
          // kecil supaya "APD" dan "apd" tak jadi dua kategori berbeda.
          kategori: b.kategori?.trim().toLowerCase() || null,
          tingkat,
          tindakan: b.tindakan?.trim() || null,
          tenggat: b.tenggat || null,
          penanggung_id: b.penanggung_id || null,
        })
        .select(TEMUAN_SELECT)
        .single()

      if (error) {
        request.log.error({ err: error, id }, 'gagal menambah temuan K3')
        return reply.status(400).send({ error: error.message })
      }
      return reply.status(201).send({ temuan: data })
    },
  )

  // ── PATCH /k3/temuan/:id ─────────────────────────────────────────────────
  app.patch<{
    Params: { id: string }
    Body: { status?: string; tindakan?: string; tenggat?: string | null }
  }>(
    '/api/v1/k3/temuan/:id',
    { preHandler: [authenticate, requirePermission('k3:inspeksi:manage')] },
    async (request, reply) => {
      const { id } = request.params
      const b = request.body
      const idProyek = await request.db!.projectIds()

      const { data: lama, error: eLama } = await request.db!
        .unsafe('temuan_k3', 'dibaca lewat id; induk disaring ke proyek tenant')
        .select('id, inspeksi_id, status, inspeksi:inspeksi_k3!inner ( id, project_id )')
        .eq('id', id)
        .in('inspeksi.project_id', idProyek)
        .maybeSingle()
      if (eLama) {
        request.log.error({ err: eLama, id }, 'gagal memuat temuan K3')
        return reply.status(500).send({ error: 'Gagal memuat temuan K3' })
      }
      if (!lama) return reply.status(404).send({ error: 'Temuan tidak ditemukan' })

      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (b.tindakan !== undefined) patch.tindakan = b.tindakan?.trim() || null
      if (b.tenggat !== undefined) {
        if (b.tenggat && !tanggalSah(b.tenggat)) {
          return reply.status(400).send({ error: 'tenggat harus berformat YYYY-MM-DD' })
        }
        patch.tenggat = b.tenggat || null
      }
      if (b.status !== undefined) {
        if (!STATUS_TEMUAN_SAH.includes(b.status as typeof STATUS_TEMUAN_SAH[number])) {
          return reply.status(400).send({ error: 'status tak dikenal' })
        }
        if (b.status === 'ditutup') {
          patch.ditutup_pada = hariIni()
          patch.ditutup_oleh = request.currentUser!.id
        }
        patch.status = b.status
      }

      const { data, error } = await request.db!
        .unsafe('temuan_k3', 'diperbarui lewat id yang sudah terbukti milik tenant')
        .update(patch)
        .eq('id', id)
        .eq('inspeksi_id', lama.inspeksi_id as string)
        .select(TEMUAN_SELECT)
        .maybeSingle()

      if (error) {
        request.log.error({ err: error, id }, 'gagal memperbarui temuan K3')
        return reply.status(400).send({ error: error.message })
      }
      if (!data) return reply.status(404).send({ error: 'Temuan tidak ditemukan' })

      await logAuditEvent(request, {
        action: 'UPDATE',
        actorId: request.currentUser!.id,
        tableName: 'temuan_k3',
        recordId: id,
        oldValues: lama as Record<string, unknown>,
        newValues: data as Record<string, unknown>,
      })
      return reply.send({ temuan: data })
    },
  )

  // ── POST /proyek/:id/k3/induksi ──────────────────────────────────────────
  app.post<{
    Params: { id: string }
    Body: {
      worker_id?: string; peserta_nama?: string; jenis?: string
      tanggal?: string; berlaku_sampai?: string; materi?: string; pemberi?: string
    }
  }>(
    '/api/v1/proyek/:id/k3/induksi',
    { preHandler: [authenticate, requirePermission('k3:induksi:manage')] },
    async (request, reply) => {
      const { id } = request.params
      const b = request.body

      if (!b.worker_id && !b.peserta_nama?.trim()) {
        return reply.status(400).send({
          error: 'Induksi wajib menyebut pesertanya — pilih pekerja terdaftar '
            + 'atau tulis namanya (tamu, pengemudi, tenaga harian).',
        })
      }
      const tanggal = b.tanggal || hariIni()
      if (!tanggalSah(tanggal)) {
        return reply.status(400).send({ error: 'tanggal harus berformat YYYY-MM-DD' })
      }
      if (b.berlaku_sampai) {
        if (!tanggalSah(b.berlaku_sampai)) {
          return reply.status(400).send({ error: 'berlaku_sampai harus berformat YYYY-MM-DD' })
        }
        if (b.berlaku_sampai < tanggal) {
          return reply.status(400).send({
            error: 'berlaku_sampai tidak boleh mendahului tanggal induksi',
          })
        }
      }

      const { data: proyek, error: eProy } = await request.db!
        .from('projects').select('id').eq('id', id).maybeSingle()
      if (eProy) return reply.status(500).send({ error: eProy.message })
      if (!proyek) return reply.status(404).send({ error: 'Proyek tidak ditemukan' })

      const { data, error } = await request.db!
        .viaProject('induksi_k3', id)
        .insert({
          project_id: id,
          worker_id: b.worker_id || null,
          peserta_nama: b.peserta_nama?.trim() || null,
          jenis: b.jenis?.trim() || 'induksi_awal',
          tanggal,
          berlaku_sampai: b.berlaku_sampai || null,
          materi: b.materi?.trim() || null,
          pemberi: b.pemberi?.trim() || null,
          created_by: request.currentUser!.id,
        })
        .select('id, worker_id, peserta_nama, jenis, tanggal, berlaku_sampai, materi')
        .single()

      if (error) {
        request.log.error({ err: error, id }, 'gagal mencatat induksi')
        return reply.status(400).send({ error: error.message })
      }
      return reply.status(201).send({ induksi: data })
    },
  )

  // ── POST /proyek/:id/k3/apd ──────────────────────────────────────────────
  app.post<{
    Params: { id: string }
    Body: {
      worker_id?: string; penerima_nama?: string; jenis_apd?: string
      jumlah?: number | string; tanggal?: string; ganti_sebelum?: string
      kondisi?: string
    }
  }>(
    '/api/v1/proyek/:id/k3/apd',
    { preHandler: [authenticate, requirePermission('k3:induksi:manage')] },
    async (request, reply) => {
      const { id } = request.params
      const b = request.body

      if (!b.jenis_apd?.trim()) {
        return reply.status(400).send({ error: 'jenis_apd wajib diisi' })
      }
      if (!b.worker_id && !b.penerima_nama?.trim()) {
        return reply.status(400).send({
          error: 'Serah terima APD wajib menyebut penerimanya — APD yang tak '
            + 'diketahui pemegangnya tak bisa diperiksa kondisinya.',
        })
      }
      const jumlah = Number(b.jumlah ?? 1)
      if (!Number.isInteger(jumlah) || jumlah < 1) {
        return reply.status(400).send({ error: 'jumlah harus bilangan bulat >= 1' })
      }
      const tanggal = b.tanggal || hariIni()
      if (!tanggalSah(tanggal)) {
        return reply.status(400).send({ error: 'tanggal harus berformat YYYY-MM-DD' })
      }
      if (b.ganti_sebelum) {
        if (!tanggalSah(b.ganti_sebelum)) {
          return reply.status(400).send({ error: 'ganti_sebelum harus berformat YYYY-MM-DD' })
        }
        if (b.ganti_sebelum < tanggal) {
          return reply.status(400).send({
            error: 'ganti_sebelum tidak boleh mendahului tanggal serah terima',
          })
        }
      }

      const { data: proyek, error: eProy } = await request.db!
        .from('projects').select('id').eq('id', id).maybeSingle()
      if (eProy) return reply.status(500).send({ error: eProy.message })
      if (!proyek) return reply.status(404).send({ error: 'Proyek tidak ditemukan' })

      const { data, error } = await request.db!
        .viaProject('apd_serah_terima', id)
        .insert({
          project_id: id,
          worker_id: b.worker_id || null,
          penerima_nama: b.penerima_nama?.trim() || null,
          jenis_apd: b.jenis_apd.trim(),
          jumlah,
          tanggal,
          ganti_sebelum: b.ganti_sebelum || null,
          kondisi: b.kondisi?.trim() || null,
          created_by: request.currentUser!.id,
        })
        .select('id, worker_id, penerima_nama, jenis_apd, jumlah, tanggal, ganti_sebelum, kondisi')
        .single()

      if (error) {
        request.log.error({ err: error, id }, 'gagal mencatat serah terima APD')
        return reply.status(400).send({ error: error.message })
      }
      return reply.status(201).send({ apd: data })
    },
  )

  // ── POST /proyek/:id/k3/lingkungan ───────────────────────────────────────
  app.post<{
    Params: { id: string }
    Body: {
      parameter?: string; tanggal?: string; lokasi?: string
      nilai?: number | string; satuan?: string
      baku_mutu?: number | string; metode?: string
    }
  }>(
    '/api/v1/proyek/:id/k3/lingkungan',
    { preHandler: [authenticate, requirePermission('k3:lingkungan:manage')] },
    async (request, reply) => {
      const { id } = request.params
      const b = request.body

      if (!b.parameter?.trim()) {
        return reply.status(400).send({ error: 'parameter wajib diisi' })
      }
      if (!b.satuan?.trim()) {
        return reply.status(400).send({
          error: 'Satuan wajib diisi. Angka tanpa satuan tak bisa dibandingkan '
            + 'dengan baku mutu — "55" bisa berarti aman atau tiga kali ambang.',
        })
      }
      if (b.nilai == null || b.nilai === '') {
        return reply.status(400).send({ error: 'nilai wajib diisi' })
      }
      const nilai = Number(b.nilai)
      if (!Number.isFinite(nilai)) {
        return reply.status(400).send({ error: 'nilai harus angka' })
      }
      let baku: number | null = null
      if (b.baku_mutu != null && b.baku_mutu !== '') {
        const n = Number(b.baku_mutu)
        if (!Number.isFinite(n) || n < 0) {
          return reply.status(400).send({ error: 'baku_mutu harus angka >= 0' })
        }
        baku = n
      }
      const tanggal = b.tanggal || hariIni()
      if (!tanggalSah(tanggal)) {
        return reply.status(400).send({ error: 'tanggal harus berformat YYYY-MM-DD' })
      }

      const { data: proyek, error: eProy } = await request.db!
        .from('projects').select('id').eq('id', id).maybeSingle()
      if (eProy) return reply.status(500).send({ error: eProy.message })
      if (!proyek) return reply.status(404).send({ error: 'Proyek tidak ditemukan' })

      const { data, error } = await request.db!
        .viaProject('pemantauan_lingkungan', id)
        .insert({
          project_id: id,
          parameter: b.parameter.trim(),
          tanggal,
          lokasi: b.lokasi?.trim() || null,
          nilai,
          satuan: b.satuan.trim(),
          baku_mutu: baku,
          metode: b.metode?.trim() || null,
          created_by: request.currentUser!.id,
        })
        .select('id, parameter, tanggal, lokasi, nilai, satuan, baku_mutu, metode')
        .single()

      if (error) {
        request.log.error({ err: error, id }, 'gagal mencatat pemantauan lingkungan')
        return reply.status(400).send({ error: error.message })
      }
      return reply.status(201).send({ ukur: data })
    },
  )
}
