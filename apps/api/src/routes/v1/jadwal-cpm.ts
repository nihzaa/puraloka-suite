import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import {
  buatKalender, hitungCpm, histogramSumberDaya, menutupLingkaran,
  type Pekerjaan, type Dependensi, type KebutuhanSumberDaya,
} from '../../lib/cpm.js'

/**
 * JADWAL: CPM · KALENDER KERJA · SUMBER DAYA · METHOD STATEMENT
 * (TUNDA kelompok C)
 *
 * ── Yang dijawab modul ini
 *
 * "Pekerjaan mana yang kalau telat SEHARI membuat seluruh proyek telat, dan
 * minggu mana yang tenaganya kurang?"
 *
 * ── Kenapa DIHITUNG tiap kali diminta, bukan disimpan
 *
 * Jalur kritis berubah setiap kali satu tanggal digeser. Menyimpannya sebagai
 * kolom membuat "kritis" basi diam-diam: pekerjaan berhenti jadi kritis pada
 * Selasa, layarnya masih merah sampai ada yang menjalankan ulang. Lalu semua
 * peringatan diabaikan karena selalu menyala.
 *
 * ── Kalender ikut dihitung, bukan diasumsikan
 *
 * Durasi dalam HARI KERJA. Pekerjaan 20 hari yang dimulai Senin tidak selesai
 * 20 hari kemudian — ada 6 hari Minggu dan mungkin Lebaran di antaranya.
 * Selisih itulah yang jadi sengketa denda keterlambatan.
 */
export default async function jadwalCpmRoutes(app: FastifyInstance) {
  // ── GET /api/v1/jadwal-cpm/:projectId ───────────────────────────────────
  app.get('/api/v1/jadwal-cpm/:projectId', {
    preHandler: [authenticate, requirePermission('projects:view')],
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string }
    const db = request.db!
    const cid = request.companyId!
    const alasan = 'kategori B; disaring company_id di baris berikutnya'

    // Proyek WAJIB milik tenant ini — tanpa ini, jadwal proyek tenant lain
    // bisa dibaca lewat id yang ditebak.
    const { data: proyek, error: galatProyek } = await db
      .unsafe('projects', 'memastikan proyek milik tenant sebelum jadwalnya dibaca')
      .select('id, name, start_date, end_date, company_id')
      .eq('id', projectId).eq('company_id', cid).maybeSingle()

    if (galatProyek) return reply.status(500).send({ error: galatProyek.message })
    if (!proyek) return reply.status(404).send({ error: 'Proyek tidak ditemukan' })

    const [pekerjaan, dependensi, libur, pola, sumberDaya, ms] = await Promise.all([
      db.viaProject('milestones', projectId)
        .select('id, title, target_date, completed_at, status, sort_order')
        .order('sort_order'),
      db.unsafe('milestone_dependencies', alasan)
        .select('milestone_id, bergantung_pada, jenis, jeda_hari')
        .eq('company_id', cid),
      db.unsafe('hari_libur', alasan)
        .select('tanggal, nama, jenis, tetap_bekerja, project_id')
        .eq('company_id', cid),
      db.unsafe('pola_kerja', alasan)
        .select('project_id, senin, selasa, rabu, kamis, jumat, sabtu, minggu, jam_per_hari')
        .eq('company_id', cid),
      db.unsafe('kebutuhan_sumber_daya', alasan)
        .select('milestone_id, jenis, nama, kuantitas, satuan, tersedia')
        .eq('company_id', cid),
      db.unsafe('method_statement', alasan)
        .select('id, milestone_id, nomor, judul, status, alasan_tolak, diputuskan_pada, pengendalian_risiko')
        .eq('company_id', cid).eq('project_id', projectId),
    ])

    // Diperiksa satu per satu dengan menyebut namanya, BUKAN lewat loop atas
    // array: query ketujuh yang ditambahkan nanti dan lupa dimasukkan ke
    // array itu akan gagal tanpa suara, lalu `?? []` mengubahnya jadi "nol
    // baris" yang sah — cacat yang membuat kurva-s kehilangan Rp 631,7 juta.
    if (pekerjaan.error) return reply.status(500).send({ error: pekerjaan.error.message })
    if (dependensi.error) return reply.status(500).send({ error: dependensi.error.message })
    if (libur.error) return reply.status(500).send({ error: libur.error.message })
    if (pola.error) return reply.status(500).send({ error: pola.error.message })
    if (sumberDaya.error) return reply.status(500).send({ error: sumberDaya.error.message })
    if (ms.error) return reply.status(500).send({ error: ms.error.message })

    type Baris = Record<string, unknown>

    // Pola & libur khusus proyek MENIMPA yang berlaku se-perusahaan.
    const polaProyek = (pola.data ?? []).find((p) => (p as Baris).project_id === projectId)
      ?? (pola.data ?? []).find((p) => (p as Baris).project_id == null)

    const liburBerlaku = (libur.data ?? []).filter((l) => {
      const pid = (l as Baris).project_id
      return pid == null || pid === projectId
    })

    const kalender = buatKalender(polaProyek as never, liburBerlaku as never)

    // Durasi diturunkan dari target_date bila tak dicatat tersendiri.
    // Milestone di repo ini menyimpan TANGGAL TARGET, bukan durasi — jadi
    // durasinya jarak hari kerja dari target sebelumnya.
    let sebelumnya: string | null = proyek.start_date ?? null
    const kerja: Pekerjaan[] = (pekerjaan.data ?? []).map((m) => {
      const b = m as Baris
      const target = b.target_date as string | null
      let durasi: number | null = null
      if (target && sebelumnya) durasi = kalender.hitungHariKerja(sebelumnya, target)
      if (target) sebelumnya = target
      return {
        id: b.id as string,
        title: b.title as string,
        durasi_hari: durasi,
        target_date: target,
      }
    })

    const mulaiProyek = (proyek.start_date as string | null)
      ?? kerja.find((k) => k.target_date)?.target_date
      ?? new Date().toISOString().slice(0, 10)

    const cpm = hitungCpm(
      kerja,
      (dependensi.data ?? []) as unknown as Dependensi[],
      kalender,
      mulaiProyek,
      (proyek.end_date as string | null) ?? null)

    const histogram = histogramSumberDaya(
      (sumberDaya.data ?? []) as unknown as KebutuhanSumberDaya[],
      cpm.pekerjaan)

    return reply.send({
      proyek: { id: proyek.id, nama: proyek.name,
                mulai: proyek.start_date, akhir: proyek.end_date },
      kalender: {
        pola: polaProyek ?? null,
        libur: liburBerlaku,
        // Dinyatakan supaya layar bisa menjelaskan ANGKANYA dari mana:
        // "30 hari kerja" dan "30 hari kalender" berbeda 5 hari.
        hariKerjaProyek: proyek.start_date && proyek.end_date
          ? kalender.hitungHariKerja(proyek.start_date as string, proyek.end_date as string)
          : null,
      },
      cpm,
      histogram,
      methodStatement: ms.data ?? [],
    })
  })

  // ── POST /api/v1/jadwal-cpm/dependensi ──────────────────────────────────
  app.post('/api/v1/jadwal-cpm/dependensi', {
    preHandler: [authenticate, requirePermission('milestones:manage')],
  }, async (request, reply) => {
    const b = request.body as {
      milestone_id?: string
      bergantung_pada?: string
      jenis?: string
      jeda_hari?: number
      catatan?: string
    }

    if (!b.milestone_id || !b.bergantung_pada) {
      return reply.status(400).send({ error: 'milestone_id dan bergantung_pada wajib diisi' })
    }
    if (b.milestone_id === b.bergantung_pada) {
      return reply.status(422).send({ error: 'Pekerjaan tak bisa menunggu dirinya sendiri' })
    }

    const db = request.db!
    const cid = request.companyId!

    // Kedua milestone WAJIB milik tenant ini, dan WAJIB satu proyek —
    // dependensi lintas proyek membuat jalur kritis satu proyek ditentukan
    // oleh keterlambatan proyek lain yang tak terlihat di layarnya.
    const { data: mm, error: galatMs } = await db
      .unsafe('milestones', 'memastikan kedua milestone milik tenant & satu proyek')
      .select('id, project_id, projects!inner(company_id)')
      .in('id', [b.milestone_id, b.bergantung_pada])

    if (galatMs) return reply.status(500).send({ error: galatMs.message })
    const daftar = (mm ?? []) as Array<{ id: string; project_id: string; projects?: { company_id?: string } }>
    if (daftar.length !== 2) {
      return reply.status(404).send({ error: 'Salah satu pekerjaan tidak ditemukan' })
    }
    if (daftar.some((m) => m.projects?.company_id !== cid)) {
      return reply.status(404).send({ error: 'Salah satu pekerjaan tidak ditemukan' })
    }
    if (daftar[0].project_id !== daftar[1].project_id) {
      return reply.status(422).send({
        error: 'Dependensi lintas proyek tidak diizinkan — jalur kritis satu proyek tak boleh ditentukan proyek lain',
      })
    }

    // Lingkaran yang lebih panjang dari 1 tak bisa ditolak constraint SQL.
    // Diperiksa di sini, SEBELUM disimpan: jaringan berlingkaran membuat
    // seluruh jadwal tak bisa dihitung, dan gejalanya cuma layar kosong.
    const { data: adaDep, error: galatDep } = await db
      .unsafe('milestone_dependencies', 'memeriksa lingkaran sebelum menyimpan')
      .select('milestone_id, bergantung_pada').eq('company_id', cid)

    if (galatDep) return reply.status(500).send({ error: galatDep.message })

    if (menutupLingkaran(
      (adaDep ?? []) as Array<{ milestone_id: string; bergantung_pada: string }>,
      b.milestone_id, b.bergantung_pada)) {
      return reply.status(422).send({
        error: 'Dependensi ini menutup lingkaran — jaringan yang melingkar tak punya jalur kritis, dan seluruh jadwal berhenti bisa dihitung',
      })
    }

    const { data, error } = await db
      .unsafe('milestone_dependencies', 'menyimpan dependensi; kedua milestone sudah diverifikasi')
      .insert({
        company_id: cid,
        milestone_id: b.milestone_id,
        bergantung_pada: b.bergantung_pada,
        jenis: b.jenis ?? 'FS',
        jeda_hari: b.jeda_hari ?? 0,
        catatan: b.catatan ?? null,
        created_by: request.currentUser!.id,
      })
      .select('id, jenis, jeda_hari')
      .single()

    if (error) {
      if (error.code === '23505') {
        return reply.status(409).send({ error: 'Dependensi ini sudah ada' })
      }
      if (error.code === '23514') {
        return reply.status(422).send({ error: 'Jenis relasi harus FS, SS, FF, atau SF' })
      }
      return reply.status(500).send({ error: error.message })
    }

    return reply.status(201).send({ dependensi: data })
  })

  // ── POST /api/v1/jadwal-cpm/libur ───────────────────────────────────────
  app.post('/api/v1/jadwal-cpm/libur', {
    preHandler: [authenticate, requirePermission('milestones:manage')],
  }, async (request, reply) => {
    const b = request.body as {
      tanggal?: string
      nama?: string
      jenis?: string
      project_id?: string | null
      tetap_bekerja?: boolean
    }

    if (!b.tanggal || !b.nama) {
      return reply.status(400).send({ error: 'tanggal dan nama wajib diisi' })
    }

    const db = request.db!
    const { data, error } = await db
      .unsafe('hari_libur', 'kategori B; company_id diisi dari sesi')
      .insert({
        company_id: request.companyId!,
        project_id: b.project_id ?? null,
        tanggal: b.tanggal,
        nama: b.nama,
        jenis: b.jenis ?? 'nasional',
        tetap_bekerja: b.tetap_bekerja ?? false,
        created_by: request.currentUser!.id,
      })
      .select('id, tanggal, nama, jenis, tetap_bekerja')
      .single()

    if (error) {
      if (error.code === '23505') {
        return reply.status(409).send({ error: 'Tanggal itu sudah tercatat sebagai hari libur' })
      }
      if (error.code === '23514') {
        return reply.status(422).send({
          error: 'Jenis libur harus nasional, cuti_bersama, perusahaan, atau proyek',
        })
      }
      return reply.status(500).send({ error: error.message })
    }

    return reply.status(201).send({ libur: data })
  })

  // ── POST /api/v1/jadwal-cpm/sumber-daya ─────────────────────────────────
  app.post('/api/v1/jadwal-cpm/sumber-daya', {
    preHandler: [authenticate, requirePermission('milestones:manage')],
  }, async (request, reply) => {
    const b = request.body as {
      milestone_id?: string
      jenis?: string
      nama?: string
      kuantitas?: number
      satuan?: string
      tersedia?: number | null
    }

    if (!b.milestone_id || !b.nama) {
      return reply.status(400).send({ error: 'milestone_id dan nama wajib diisi' })
    }

    const db = request.db!
    const cid = request.companyId!

    const { data: m } = await db
      .unsafe('milestones', 'memastikan pekerjaan milik tenant sebelum diberi kebutuhan')
      .select('id, projects!inner(company_id)')
      .eq('id', b.milestone_id).maybeSingle()

    if (!m || (m as { projects?: { company_id?: string } }).projects?.company_id !== cid) {
      return reply.status(404).send({ error: 'Pekerjaan tidak ditemukan' })
    }

    const { data, error } = await db
      .unsafe('kebutuhan_sumber_daya', 'menyimpan kebutuhan; pekerjaan sudah diverifikasi')
      .insert({
        company_id: cid,
        milestone_id: b.milestone_id,
        jenis: b.jenis ?? 'tenaga',
        nama: b.nama,
        kuantitas: b.kuantitas ?? 0,
        satuan: b.satuan ?? null,
        tersedia: b.tersedia ?? null,
        created_by: request.currentUser!.id,
      })
      .select('id, jenis, nama, kuantitas')
      .single()

    if (error) {
      if (error.code === '23505') {
        return reply.status(409).send({ error: 'Kebutuhan itu sudah tercatat untuk pekerjaan ini' })
      }
      if (error.code === '23514') {
        return reply.status(422).send({
          error: 'Kuantitas harus lebih dari nol, dan jenisnya tenaga/alat/material',
        })
      }
      return reply.status(500).send({ error: error.message })
    }

    return reply.status(201).send({ kebutuhan: data })
  })
}
