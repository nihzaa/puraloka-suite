import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { proyekMilikTenant } from '../../utils/tenant-guard.js'
import {
  susunTender, periksaPenetapan, periksaPenutupan, type BarisPenawaranSubkon,
} from '../../lib/tender-subkon.js'
import { logAuditEvent } from '../../utils/audit.js'

/**
 * TENDER & AWARD SUBKONTRAKTOR (F5 PEMBEDA)
 *
 * ── Cacat yang ditutup, diukur pada data nyata
 *
 * 20 lingkup kerja bernilai Rp 15.000.000 sampai Rp 280.000.000, SELURUHNYA
 * ber-`contract_status = 'unsigned'`, dan tak satu pun punya jejak bagaimana
 * mandornya dipilih.
 *
 * Kesenjangan yang persis sama dengan yang ditutup RFQ (migrasi 195), tapi di
 * sisi subkontraktor.
 *
 * ── Kenapa memakai `workers`, bukan tabel subkontraktor baru
 *
 * Sistem ini memakai MANDOR sebagai padanan lokal subkontraktor. Membuat
 * daftar terpisah menciptakan dua sumber kebenaran tentang siapa mengerjakan
 * apa. Rinciannya di migrasi 201.
 *
 * ── Kenapa perbandingannya DIHITUNG, bukan disimpan
 *
 * Tabulasi diturunkan dari penawaran tiap kali diminta. Menyimpannya sebagai
 * kolom membuat angka "termurah" bisa basi diam-diam saat satu penawaran
 * disunting — dan yang paling berkepentingan menyuntingnya adalah orang yang
 * mandornya sedang kalah.
 */
export default async function tenderSubkonRoutes(app: FastifyInstance) {
  // ── GET /api/v1/tender-subkon ────────────────────────────────────────────
  app.get('/api/v1/tender-subkon', {
    preHandler: [authenticate, requirePermission('projects:view')],
  }, async (request, reply) => {
    const q = request.query as Record<string, string>
    const db = request.db!

    const idProyek = await db.projectIds()
    if (idProyek.length === 0) return reply.send({ tender: [], total: 0 })

    if (q.project_id && !(await proyekMilikTenant(request, q.project_id))) {
      return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
    }

    const batas = Math.min(Math.max(Number(q.limit) || 100, 1), 500)

    let kueri = db
      .unsafe('tender_subkon', 'daftar lintas-proyek; viaProject butuh satu project sebagai konteks')
      .select(
        // `penawaran_subkon(count)` — jumlah penawaran per tender.
        //
        // Bukan hiasan: tanpa angka ini layar tak punya cara memilih tender
        // mana yang dibuka lebih dulu, dan urutan `tanggal DESC` membuat
        // tender TERBARU yang menang — yang justru paling mungkin belum ada
        // penawarannya. Pengguna membuka layar perbandingan dan disambut
        // "belum ada penawaran", padahal tender lain penuh isinya.
        `id, nomor, judul, lingkup_kerja, nilai_perkiraan, tanggal, batas_masuk,
         status, alasan_pilih, created_at,
         proyek:projects ( id, name ),
         pembuat:users ( id, name ),
         penawaran_subkon ( count )`,
        { count: 'exact' },
      )
      .in('project_id', idProyek)

    if (q.project_id) kueri = kueri.eq('project_id', q.project_id)
    if (q.status) kueri = kueri.eq('status', q.status)

    const { data, error, count } = await kueri
      .order('tanggal', { ascending: false })
      .order('created_at', { ascending: false })
      .range(0, batas - 1)

    if (error) return reply.status(500).send({ error: error.message })

    return reply.send({ tender: data ?? [], total: count ?? 0 })
  })

  // ── GET /api/v1/tender-subkon/:id — beserta perbandingannya ──────────────
  app.get('/api/v1/tender-subkon/:id', {
    preHandler: [authenticate, requirePermission('projects:view')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const db = request.db!

    const idProyek = await db.projectIds()
    if (idProyek.length === 0) return reply.status(404).send({ error: 'Tender tidak ditemukan' })

    // Gerbang tenancy: tender diambil dengan saringan proyek milik tenant.
    // Tanpa `.in()`, `eq('id', ...)` mengembalikan tender tenant lain beserta
    // SELURUH nilai penawaran mandornya — informasi komersial yang paling
    // merugikan kalau bocor, terutama ke sesama mandor yang bersaing.
    const { data: kepala, error: e1 } = await db
      .unsafe('tender_subkon', 'ambil satu tender dengan saringan projectIds')
      .select(`id, nomor, judul, lingkup_kerja, nilai_perkiraan, tanggal, batas_masuk,
               status, alasan_pilih, catatan, project_id, work_scope_id,
               proyek:projects ( id, name )`)
      .eq('id', id)
      .in('project_id', idProyek)
      .maybeSingle()

    if (e1) return reply.status(500).send({ error: e1.message })
    if (!kepala) return reply.status(404).send({ error: 'Tender tidak ditemukan' })

    const { data: penawaran, error: e2 } = await db
      .viaProject('penawaran_subkon', id)
      .select(`id, worker_id, nilai_penawaran, waktu_kerja_hari, tidak_menawar,
               status, catatan, workers ( id, name )`)

    if (e2) return reply.status(500).send({ error: e2.message })

    const satu = <T,>(v: T | T[] | null | undefined): T | null =>
      Array.isArray(v) ? (v[0] ?? null) : (v ?? null)

    const baris: BarisPenawaranSubkon[] = ((penawaran ?? []) as Array<{
      id: string; worker_id: string
      nilai_penawaran: number | string
      waktu_kerja_hari: number | null
      tidak_menawar: boolean | null
      status: string | null
      catatan: string | null
      workers?: { id: string; name: string } | { id: string; name: string }[] | null
    }>).map((p) => ({
      id: p.id,
      worker_id: p.worker_id,
      worker_name: satu(p.workers)?.name ?? null,
      nilai_penawaran: p.nilai_penawaran,
      waktu_kerja_hari: p.waktu_kerja_hari,
      tidak_menawar: p.tidak_menawar,
      status: (p.status ?? 'diajukan') as BarisPenawaranSubkon['status'],
      catatan: p.catatan,
    }))

    return reply.send({
      tender: kepala,
      perbandingan: susunTender(baris, (kepala as { nilai_perkiraan: number | string | null }).nilai_perkiraan),
    })
  })

  // ── POST /api/v1/tender-subkon ───────────────────────────────────────────
  //
  // `projects:contract` — DIVERIFIKASI ada di tabel `permissions`. Menender
  // pekerjaan adalah tindakan kontraktual: hasilnya kontrak borongan.
  app.post('/api/v1/tender-subkon', {
    preHandler: [authenticate, requirePermission('projects:contract')],
  }, async (request, reply) => {
    const b = request.body as {
      project_id?: string; nomor?: string; judul?: string
      lingkup_kerja?: string; nilai_perkiraan?: number
      tanggal?: string; batas_masuk?: string; catatan?: string
    }

    if (!b.project_id || !b.nomor?.trim() || !b.judul?.trim()) {
      return reply.status(400).send({ error: 'project_id, nomor, dan judul wajib diisi' })
    }

    if (b.batas_masuk && b.tanggal && b.batas_masuk < b.tanggal) {
      // Dijaga juga oleh CHECK di basis. Diperiksa di sini supaya penggunanya
      // dapat kalimat yang bisa dimengerti, bukan galat constraint mentah.
      return reply.status(400).send({
        error: 'batas_masuk tidak boleh lebih awal daripada tanggal tender',
      })
    }

    if (!(await proyekMilikTenant(request, b.project_id))) {
      return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
    }

    const { data, error } = await request.db!
      .viaProject('tender_subkon', b.project_id)
      .insert({
        project_id: b.project_id,
        nomor: b.nomor.trim(),
        judul: b.judul.trim(),
        lingkup_kerja: b.lingkup_kerja?.trim() || null,
        nilai_perkiraan: b.nilai_perkiraan ?? null,
        tanggal: b.tanggal ?? new Date().toISOString().slice(0, 10),
        batas_masuk: b.batas_masuk ?? null,
        catatan: b.catatan?.trim() || null,
        created_by: request.currentUser!.id,
      })
      .select('id, nomor, judul, status')
      .single()

    if (error) {
      if (error.code === '23505') {
        return reply.status(400).send({ error: `Nomor tender "${b.nomor.trim()}" sudah dipakai` })
      }
      return reply.status(500).send({ error: error.message })
    }

    return reply.status(201).send({ tender: data })
  })

  // ── POST /api/v1/tender-subkon/:id/penawaran ─────────────────────────────
  app.post('/api/v1/tender-subkon/:id/penawaran', {
    preHandler: [authenticate, requirePermission('projects:contract')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const b = request.body as {
      worker_id?: string; nilai_penawaran?: number
      waktu_kerja_hari?: number; tidak_menawar?: boolean; catatan?: string
    }

    if (!b.worker_id) {
      return reply.status(400).send({ error: 'worker_id wajib diisi' })
    }

    const tidakMenawar = b.tidak_menawar === true
    const nilai = Number(b.nilai_penawaran ?? 0)

    if (!tidakMenawar && (!Number.isFinite(nilai) || nilai <= 0)) {
      // Harga 0 hanya sah bila mandor MENYATAKAN tak menawar. Tanpa pagar
      // ini, "0" selalu menang sebagai termurah — dan borongan jatuh ke
      // mandor yang tak pernah mengajukan harga.
      return reply.status(400).send({
        error: 'nilai_penawaran harus lebih dari 0, atau tandai tidak_menawar',
      })
    }

    const db = request.db!
    const idProyek = await db.projectIds()
    if (idProyek.length === 0) return reply.status(404).send({ error: 'Tender tidak ditemukan' })

    const { data: tender, error: eT } = await db
      .unsafe('tender_subkon', 'verifikasi kepemilikan tender lewat projectIds sebelum menulis penawaran')
      .select('id, project_id, status')
      .eq('id', id)
      .in('project_id', idProyek)
      .maybeSingle()

    if (eT) return reply.status(500).send({ error: eT.message })
    if (!tender) return reply.status(404).send({ error: 'Tender tidak ditemukan' })

    if (tender.status === 'selesai' || tender.status === 'batal') {
      // Penawaran yang masuk sesudah keputusan mengubah perbandingan di
      // belakang keputusan yang sudah diambil — dan jejak auditnya berbohong.
      return reply.status(400).send({
        error: `Tender berstatus "${tender.status}" tidak menerima penawaran baru`,
      })
    }

    const { data, error } = await db
      .viaProject('penawaran_subkon', id)
      .insert({
        tender_id: id,
        worker_id: b.worker_id,
        nilai_penawaran: tidakMenawar ? 0 : nilai,
        waktu_kerja_hari: b.waktu_kerja_hari ?? null,
        tidak_menawar: tidakMenawar,
        catatan: b.catatan?.trim() || null,
        created_by: request.currentUser!.id,
      })
      .select('id')
      .single()

    if (error) {
      if (error.code === '23505') {
        return reply.status(400).send({
          error: 'Mandor ini sudah menawar di tender tersebut — sunting penawarannya, jangan tambah baris baru',
        })
      }
      return reply.status(500).send({ error: error.message })
    }

    return reply.status(201).send({ penawaran: data })
  })

  // ── PATCH /api/v1/tender-subkon/:id/pemenang ─────────────────────────────
  //
  // Endpoint yang selama ini HILANG. Diukur 2026-08-13: `status = 'menang'`
  // dibaca dua halaman (`mandor/spk/page.tsx:610` mencarinya untuk menerbitkan
  // SPK) tetapi tak satu pun rute menulisnya. Modul ini bisa membandingkan
  // penawaran dengan sangat baik, lalu berhenti tepat sebelum gunanya.
  //
  // Penetapan TIDAK menutup tendernya. Keduanya dipisah supaya masih ada
  // kesempatan meninjau ulang sebelum penutupan — yang tak bisa dibatalkan.
  app.patch('/api/v1/tender-subkon/:id/pemenang', {
    preHandler: [authenticate, requirePermission('projects:contract')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const b = request.body as { penawaran_id?: string; alasan?: string }

    if (!b.penawaran_id) {
      return reply.status(400).send({ error: 'penawaran_id wajib diisi' })
    }

    const db = request.db!
    const idProyek = await db.projectIds()
    if (idProyek.length === 0) return reply.status(404).send({ error: 'Tender tidak ditemukan' })

    const { data: tender, error: eT } = await db
      .unsafe('tender_subkon', 'kepemilikan diverifikasi lewat projectIds() di baris berikutnya')
      .select('id, status, nilai_perkiraan')
      .eq('id', id)
      .in('project_id', idProyek)
      .maybeSingle()
    if (eT) return reply.status(500).send({ error: eT.message })
    if (!tender) return reply.status(404).send({ error: 'Tender tidak ditemukan' })

    const { data: penawaran, error: eP } = await db
      .viaProject('penawaran_subkon', id)
      .select('id, worker_id, nilai_penawaran, waktu_kerja_hari, tidak_menawar, status')
      .eq('tender_id', id)
    if (eP) return reply.status(500).send({ error: eP.message })

    const verdict = periksaPenetapan({
      penawaran: (penawaran ?? []) as unknown as BarisPenawaranSubkon[],
      idPemenang: b.penawaran_id,
      statusTender: (tender as { status: string }).status,
      alasan: b.alasan,
    })
    if (!verdict.boleh) {
      // 404 hanya untuk yang benar-benar tak ada; sisanya 409 — permintaannya
      // bisa dimengerti, keadaannya yang menolak.
      return reply.status(verdict.kode === 'tak_ada' ? 404 : 409).send({ error: verdict.sebab })
    }

    // Yang KALAH ditandai lebih dulu, pemenang belakangan.
    //
    // Urutan ini bukan selera: basis memasang indeks unik parsial "satu
    // pemenang per tender" (migrasi 201:157). Menulis pemenang baru sebelum
    // pemenang lama diturunkan akan ditolak indeks itu — dan pesannya
    // ("duplicate key") tak memberitahu siapa pun apa yang harus dilakukan.
    const { data: diturunkan, error: eKalah } = await db
      .viaProject('penawaran_subkon', id)
      .update({ status: 'kalah', updated_at: new Date().toISOString() })
      .eq('tender_id', id)
      .neq('id', b.penawaran_id)
      .in('status', ['diajukan', 'menang'])
      // Yang menyatakan TIDAK MENAWAR tidak ikut diturunkan jadi 'kalah'.
      //
      // Kalah berarti bersaing lalu tidak terpilih. Mandor yang menjawab
      // "saya tidak menawar" tak pernah masuk persaingan, dan menandainya
      // kalah membuat rekam jejaknya berbohong: daftar "berapa kali kalah
      // tender" akan menghitung undangan yang bahkan tak pernah ia jawab
      // dengan harga.
      .eq('tidak_menawar', false)
      .select('id')
    if (eKalah) return reply.status(500).send({ error: eKalah.message })
    // NOL baris di sini SAH: tender berpenawar tunggal tak punya siapa pun
    // untuk diturunkan. Yang tidak sah adalah tidak tahu — jumlahnya ikut di
    // balasan supaya layar bisa menyatakan "2 penawar lain ditandai kalah"
    // alih-alih membiarkan pengguna menebak apa yang barusan terjadi.
    const jumlahKalah = (diturunkan ?? []).length

    // `.in('status', …)` ikut di WHERE: penetapan yang berlomba dengan
    // penetapan lain tak boleh menimpa hasil yang sudah berpindah status.
    const { data: jadi, error: eMenang } = await db
      .viaProject('penawaran_subkon', id)
      .update({ status: 'menang', updated_at: new Date().toISOString() })
      .eq('id', b.penawaran_id)
      .eq('tender_id', id)
      .in('status', ['diajukan', 'kalah'])
      .select('id, worker_id, nilai_penawaran, status')
      .maybeSingle()
    if (eMenang) return reply.status(500).send({ error: eMenang.message })
    if (!jadi) {
      return reply.status(409).send({
        error: 'Penawaran itu berubah dari tempat lain sebelum penetapan tersimpan. Muat ulang.',
      })
    }

    const { data: alasanTersimpan, error: eAlasan } = await db
      .unsafe('tender_subkon', 'id sudah diverifikasi milik tenant ini di atas')
      .update({ alasan_pilih: (b.alasan ?? '').trim(), updated_at: new Date().toISOString() })
      .eq('id', id)
      .in('project_id', idProyek)
      .select('id')
      .maybeSingle()
    if (eAlasan) return reply.status(500).send({ error: eAlasan.message })
    if (!alasanTersimpan) {
      // NOL baris di sini TIDAK sah: pemenangnya sudah tercatat, tapi alasan
      // yang menjelaskannya tidak. Itu justru keadaan yang paling berbahaya —
      // keputusan tanpa keterangan, dan endpointnya melapor berhasil.
      return reply.status(409).send({
        error: 'Pemenang tersimpan tetapi alasannya gagal ditulis — tender berubah dari '
          + 'tempat lain. Muat ulang dan periksa alasan pemilihannya.',
      })
    }

    await logAuditEvent(request, {
      action: 'update',
      tableName: 'penawaran_subkon',
      recordId: b.penawaran_id,
      actorId: request.currentUser!.id,
      newValues: { status: 'menang', tender_id: id, alasan_pilih: (b.alasan ?? '').trim() },
      reason: (b.alasan ?? '').trim(),
    })

    return reply.send({
      pemenang: jadi,
      peringatan: verdict.peringatan,
      penawar_dikalahkan: jumlahKalah,
    })
  })

  // ── PATCH /api/v1/tender-subkon/:id/tutup ────────────────────────────────
  //
  // Menutup tender = menyatakan keputusannya final. Trigger 347 menuntut
  // tepat satu pemenang DAN alasan terisi; diperiksa juga di sini supaya
  // penolakannya berupa kalimat yang bisa ditindaklanjuti.
  app.patch('/api/v1/tender-subkon/:id/tutup', {
    preHandler: [authenticate, requirePermission('projects:contract')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const db = request.db!
    const idProyek = await db.projectIds()
    if (idProyek.length === 0) return reply.status(404).send({ error: 'Tender tidak ditemukan' })

    const { data: tender, error: eT } = await db
      .unsafe('tender_subkon', 'kepemilikan diverifikasi lewat projectIds() di baris berikutnya')
      .select('id, status, alasan_pilih')
      .eq('id', id)
      .in('project_id', idProyek)
      .maybeSingle()
    if (eT) return reply.status(500).send({ error: eT.message })
    if (!tender) return reply.status(404).send({ error: 'Tender tidak ditemukan' })

    const { data: penawaran, error: eP } = await db
      .viaProject('penawaran_subkon', id)
      .select('id, worker_id, nilai_penawaran, waktu_kerja_hari, tidak_menawar, status')
      .eq('tender_id', id)
    if (eP) return reply.status(500).send({ error: eP.message })

    const t = tender as { status: string; alasan_pilih: string | null }
    const verdict = periksaPenutupan({
      penawaran: (penawaran ?? []) as unknown as BarisPenawaranSubkon[],
      statusTender: t.status,
      alasan: t.alasan_pilih,
    })
    if (!verdict.boleh) return reply.status(409).send({ error: verdict.sebab })

    // Status lama ikut di WHERE — dua penutupan bersamaan tak boleh keduanya
    // mengira berhasil.
    const { data: jadi, error } = await db
      .unsafe('tender_subkon', 'id sudah diverifikasi milik tenant ini di atas')
      .update({ status: 'selesai', updated_at: new Date().toISOString() })
      .eq('id', id)
      .in('project_id', idProyek)
      .eq('status', t.status)
      .select('id, nomor, status')
      .maybeSingle()

    if (error) {
      // Trigger 347 menolak dengan kalimat yang sudah dirancang untuk dibaca
      // manusia; diteruskan apa adanya alih-alih ditimpa "gagal menutup".
      const pesan = (error as { message?: string }).message ?? ''
      if (/pemenang|[Aa]lasan/.test(pesan)) {
        return reply.status(409).send({ error: pesan })
      }
      return reply.status(500).send({ error: error.message })
    }
    if (!jadi) {
      return reply.status(409).send({
        error: 'Tender berubah dari tempat lain sebelum penutupan tersimpan. Muat ulang.',
      })
    }

    await logAuditEvent(request, {
      action: 'update',
      tableName: 'tender_subkon',
      recordId: id,
      actorId: request.currentUser!.id,
      oldValues: { status: t.status },
      newValues: { status: 'selesai' },
    })

    return reply.send({ tender: jadi })
  })
}
