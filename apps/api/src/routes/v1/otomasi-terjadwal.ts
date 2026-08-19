/**
 * OTOMASI TERJADWAL — automation rule-based dari katalog Phase 2.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA BERKAS TERPISAH DARI `notifications.ts`
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `check-deadlines` sudah memuat empat pemeriksaan dalam satu handler 220
 * baris. Menambah empat lagi di sana membuatnya tak terbaca, dan yang tak
 * terbaca tak pernah diperiksa ulang saat salah.
 *
 * Yang DISALIN dari sana — sengaja, bukan karena lalai:
 *
 *   `alreadySent()`   dedup harian ber-`action_data.record_id`
 *   pola T4i          data di-scope `projectIds()` sebelum jadi ISI notifikasi
 *
 * Duplikasi kecil dua fungsi lebih murah daripada satu handler yang tak
 * seorang pun berani sentuh. Kalau nanti bertambah lagi, keduanya naik ke
 * `lib/`, bukan dipaksa menyatu di rute.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * DEDUP ADALAH SYARAT, BUKAN HIASAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Denyut penjadwal berjalan tiap 15 menit (`.github/workflows/jadwal-tugas.yml`).
 * Tanpa dedup, mandor menerima 96 pesan "belum lapor progres" per hari, dan
 * pada hari kedua ia mematikan notifikasi — automation-nya jadi lebih buruk
 * daripada tidak ada.
 *
 * Ledger dedup-nya adalah tabel `notifications` itu sendiri: tak ada tabel
 * status terpisah yang bisa melenceng dari kenyataan.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * AMBANG: KONFIGURASI, BUKAN ANGKA DI KODE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Ambang hari dibaca dari query (`?hari_kasbon=`, dst.) dengan default yang
 * masuk akal. Config-first (CHARTER §8) menuntut ini akhirnya punya halaman
 * pengaturan; sampai itu ada, ambangnya minimal tidak terkubur di kode.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { ambilAmbang } from '../../lib/ambang-otomasi.js'

/** Rupiah tanpa desimal — dipakai di seluruh pesan agar bentuknya seragam. */
const rp = (n: number) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', maximumFractionDigits: 0,
  }).format(n)

/** Batasi angka dari query ke rentang waras. */
function angka(v: unknown, bawaan: number, min: number, max: number): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return bawaan
  return Math.min(Math.max(Math.trunc(n), min), max)
}

const HARI_MS = 86_400_000

export default async function otomasiTerjadwalRoutes(app: FastifyInstance) {

  // ── GET /api/v1/otomasi/jalankan/kasbon-outstanding ──────────────────────
  //
  // Automation 2.10 — kasbon yang SUDAH DISETUJUI tapi tak kunjung dilunasi.
  //
  // Berbeda dari pemeriksaan #3 di `check-deadlines`, yang mengejar kasbon
  // PENDING (menunggu persetujuan). Keduanya terdengar mirip dan mudah
  // dikira duplikat — bedanya tegas:
  //
  //   check-deadlines   status='pending'   → belum diputuskan siapa pun
  //   di sini           status='approved'  → uang sudah keluar, belum kembali
  //
  // Yang kedua adalah uang perusahaan yang menggantung di lapangan. Tak ada
  // yang memeriksanya sebelum ini.
  app.get('/api/v1/otomasi/jalankan/kasbon-outstanding', {
    preHandler: [authenticate, requirePermission('notifications:milestone:check')],
  }, async (request, reply) => {
    const { createNotification } = await import('../../utils/notifications.js')
    const { resolveRecipients } = await import('../../utils/notification-routing.js')

    const ambangHari = angka((request.query as any)?.hari, 30, 1, 365)
    const now = new Date()
    const today = now.toISOString().split('T')[0]
    const batas = new Date(now.getTime() - ambangHari * HARI_MS).toISOString()

    const sudah = await pembuatDedup(request, today, ['kasbon_outstanding'])

    // T4i — isi notifikasi memuat nominal kasbon, jadi datanya disaring di
    // sumbernya, bukan cuma penerimanya.
    //
    // `kasbons` kategori B (punya `company_id` sendiri), jadi `.from()` di
    // `request.db` sudah menyaringnya. Bentuk pertama memakai `supabase`
    // mentah + `.in('project_id', …)` — lolos test unit tapi MENAIKKAN
    // `tenancy-ratchet` 366 → 370, dan ratchet itu Gerbang Keras G-5.
    const { data: kasbons, error } = await request.db!
      .from('kasbons')
      .select(`
        id, amount, purpose, kasbon_date, approved_at, settled_at, status,
        project:projects!kasbons_project_id_fkey(id, name, pm_id),
        mandor:users!kasbons_requested_by_fkey(id, name)
      `)
      .eq('status', 'approved')
      .is('settled_at', null)
      .lt('approved_at', batas)

    // Query yang gagal TIDAK boleh terbaca sebagai "tak ada yang menggantung".
    if (error) return reply.status(500).send({ error: error.message })

    let dibuat = 0
    for (const k of kasbons ?? []) {
      const proj = k.project as any
      if (!proj) continue
      if (sudah('kasbon_outstanding', k.id)) continue

      const hari = Math.round((now.getTime() - new Date(k.approved_at).getTime()) / HARI_MS)
      const penerima = await resolveRecipients('kasbon_outstanding', {
        projectId: proj.id, companyId: request.companyId!,
      })
      const namaMandor = (k.mandor as any)?.name ?? 'Mandor'

      for (const uid of penerima) {
        await createNotification({
          company_id: request.companyId!,
          user_id:    uid,
          title:      'Kasbon Belum Dilunasi',
          message:    `Kasbon ${rp(Number(k.amount))} atas nama ${namaMandor} di proyek "${proj.name}" sudah ${hari} hari sejak disetujui dan belum dilunasi`,
          type:       'kasbon_outstanding',
          priority:   hari >= ambangHari * 2 ? 'urgent' : 'high',
          project_id: proj.id,
          action_url: '/mandor',
          action_data: { record_id: k.id, hari_menggantung: hari },
        })
        dibuat++
      }
    }

    return reply.send({
      success: true, notifications_created: dibuat,
      checked: { kasbon_outstanding: (kasbons ?? []).length, ambang_hari: ambangHari },
    })
  })

  // ── GET /api/v1/otomasi/jalankan/kasbon-tukang ───────────────────────────
  //
  // Automation 6.6 — cicilan kasbon tukang yang menggantung.
  //
  // Pelunasannya sudah otomatis di DB: trigger `trg_wage_report_settle_kasbon`
  // (migrasi 018) menambah `amount_settled` tiap laporan upah disetujui. Yang
  // hilang cuma pengingatnya — kasbon yang tak pernah dipotong tak pernah
  // memunculkan galat, ia hanya diam sampai tukangnya berhenti bekerja.
  app.get('/api/v1/otomasi/jalankan/kasbon-tukang', {
    preHandler: [authenticate, requirePermission('notifications:milestone:check')],
  }, async (request, reply) => {
    const { createNotification } = await import('../../utils/notifications.js')
    const { resolveRecipients } = await import('../../utils/notification-routing.js')

    const ambangHari = angka((request.query as any)?.hari, 14, 1, 365)
    const now = new Date()
    const today = now.toISOString().split('T')[0]
    const batas = new Date(now.getTime() - ambangHari * HARI_MS).toISOString().split('T')[0]

    const sudah = await pembuatDedup(request, today, ['worker_kasbon_reminder'])

    // `worker_kasbons` kategori C (mewarisi tenancy lewat `project_id`) dan
    // ini layar LINTAS-PROYEK, jadi polanya `.unsafe()` + `.in('project_id',
    // await projectIds())` — persis yang didokumentasikan di `tenant-db.ts`.
    // `viaProject()` tak berlaku: tak ada satu proyek sebagai konteks.
    const idProyek = await request.db!.projectIds()
    const { data: kasbons, error } = await request
      .db!.unsafe('worker_kasbons', 'penjadwal lintas-proyek: disaring .in(project_id, projectIds())')
      .select(`
        id, amount, amount_settled, kasbon_date, mandor_id,
        worker:workers!worker_kasbons_worker_id_fkey(id, name),
        project:projects!worker_kasbons_project_id_fkey(id, name)
      `)
      .in('project_id', idProyek)
      .eq('is_settled', false)
      .lte('kasbon_date', batas)

    if (error) return reply.status(500).send({ error: error.message })

    let dibuat = 0
    for (const k of kasbons ?? []) {
      const proj = k.project as any
      if (!proj) continue
      if (sudah('worker_kasbon_reminder', k.id)) continue

      // `chk_worker_kasbon_settled` menjamin 0 <= settled <= amount, jadi
      // sisanya tak pernah negatif — tak perlu dijaga lagi di sini.
      const sisa = Number(k.amount) - Number(k.amount_settled)
      const hari = Math.round((now.getTime() - new Date(k.kasbon_date).getTime()) / HARI_MS)
      const namaTukang = (k.worker as any)?.name ?? 'Tukang'

      const penerima = await resolveRecipients('worker_kasbon_reminder', {
        projectId: proj.id, companyId: request.companyId!,
      })

      for (const uid of penerima) {
        await createNotification({
          company_id: request.companyId!,
          user_id:    uid,
          title:      'Cicilan Kasbon Tukang',
          message:    `Kasbon ${namaTukang} di proyek "${proj.name}" menyisakan ${rp(sisa)} dari ${rp(Number(k.amount))} — sudah ${hari} hari, potong lewat laporan upah`,
          type:       'worker_kasbon_reminder',
          priority:   'normal',
          project_id: proj.id,
          action_url: '/mandor',
          action_data: { record_id: k.id, sisa, hari_menggantung: hari },
        })
        dibuat++
      }
    }

    return reply.send({
      success: true, notifications_created: dibuat,
      checked: { kasbon_tukang: (kasbons ?? []).length, ambang_hari: ambangHari },
    })
  })

  // ── GET /api/v1/otomasi/jalankan/progres-belum-lapor ─────────────────────
  //
  // Automation 3.11 — mandor yang belum melapor progres hari ini.
  //
  // ── Kenapa memakai anti-join, bukan "cari yang tidak ada"
  //
  // Pertanyaannya bukan "siapa yang melapor" melainkan "siapa yang TIDAK" —
  // dan yang tidak ada tak bisa di-query langsung. Jadi: ambil mandor
  // ber-assignment aktif, ambil laporan hari ini, kurangkan.
  //
  // ── Kenapa hanya hari kerja, dan kenapa itu keputusan sementara
  //
  // Mengirim "belum lapor" pada hari Minggu melatih orang mengabaikan pesannya.
  // Hari libur nasional BELUM dikenali — kalendernya tak ada di basis ini.
  // Itu keterbatasan yang dinyatakan, bukan disembunyikan: begitu tabel hari
  // libur ada, saringannya ditambah di sini.
  app.get('/api/v1/otomasi/jalankan/progres-belum-lapor', {
    preHandler: [authenticate, requirePermission('notifications:milestone:check')],
  }, async (request, reply) => {
    const { createNotification } = await import('../../utils/notifications.js')

    const now = new Date()
    const today = now.toISOString().split('T')[0]
    const hariPekan = now.getDay()   // 0 = Minggu

    if (hariPekan === 0) {
      return reply.send({
        success: true, notifications_created: 0,
        checked: { dilewati: 'hari-minggu' },
      })
    }

    const sudah = await pembuatDedup(request, today, ['progress_belum_lapor'])

    // Proyek aktif milik tenant ini saja.
    const { data: proyek, error: eProyek } = await request.db!
      .from('projects')
      .select('id, name')
      // Enum  HANYA punya: draft|active|on_hold|completed|
      // cancelled. 'in_progress' TIDAK PERNAH ADA — Postgres menolak seluruh
      // query dengan 22P02, jadi pemeriksaan ini gagal TOTAL tiap kali jalan.
      .eq('status', 'active')
      .eq('is_deleted', false)

    if (eProyek) return reply.status(500).send({ error: eProyek.message })

    const idProyek = (proyek ?? []).map(p => p.id)
    if (idProyek.length === 0) {
      return reply.send({ success: true, notifications_created: 0, checked: { proyek_aktif: 0 } })
    }

    // Mandor ber-assignment aktif.
    //
    // Kolomnya `status`, BUKAN `is_active` — diukur ke schema hidup; nilainya
    // 'active' | 'completed'. Menebak `is_active` menghasilkan galat kolom,
    // dan itu justru nasib baik: saringan yang salah tapi SAH secara SQL akan
    // mengirimi pengingat ke mandor yang penugasannya sudah selesai.
    const { data: penugasan, error: ePenugasan } = await request
      .db!.unsafe('mandor_assignments', 'penjadwal lintas-proyek: disaring .in(project_id, proyek aktif tenant)')
      .select('mandor_id, project_id')
      .in('project_id', idProyek)
      .eq('status', 'active')

    if (ePenugasan) return reply.status(500).send({ error: ePenugasan.message })

    // Yang SUDAH melapor hari ini — sisi kanan anti-join.
    const { data: laporan, error: eLaporan } = await request
      .db!.unsafe('progress_logs', 'penjadwal lintas-proyek: disaring .in(project_id, proyek aktif tenant)')
      .select('project_id, reported_by')
      .in('project_id', idProyek)
      // `logged_at` bertipe TIMESTAMPTZ, bukan kolom DATE — "hari ini" adalah
      // RENTANG, bukan kesamaan. `.eq('2026-08-12')` tak pernah cocok dengan
      // nilai bertimestamp: seluruh mandor akan dikira belum melapor dan
      // ditegur tiap hari, TANPA satu pun galat muncul.
      //
      // Batasnya memakai waktu server. Kalau kelak ada tenant lintas zona
      // waktu, ini harus ikut zona proyeknya — dicatat, belum dikerjakan.
      .gte('logged_at', today + 'T00:00:00')
      .lt('logged_at', new Date(now.getTime() + HARI_MS).toISOString().split('T')[0] + 'T00:00:00')

    if (eLaporan) return reply.status(500).send({ error: eLaporan.message })

    const sudahLapor = new Set(
      (laporan ?? []).map(l => `${l.project_id} ${l.reported_by}`),
    )
    const namaProyek = new Map((proyek ?? []).map(p => [p.id, p.name]))

    let dibuat = 0
    let belum = 0
    for (const t of penugasan ?? []) {
      if (sudahLapor.has(`${t.project_id} ${t.mandor_id}`)) continue
      belum++

      // Kunci sintetis: tak ada satu baris pun yang mewakili "ketiadaan
      // laporan", jadi dedup-nya dirakit dari pasangan mandor+proyek.
      const kunci = `progres_${t.mandor_id}_${t.project_id}`
      if (sudah('progress_belum_lapor', kunci)) continue

      await createNotification({
        company_id: request.companyId!,
        user_id:    t.mandor_id,
        title:      'Progres Belum Dilaporkan',
        message:    `Laporan progres proyek "${namaProyek.get(t.project_id) ?? '—'}" untuk hari ini belum masuk`,
        type:       'progress_belum_lapor',
        priority:   'normal',
        project_id: t.project_id,
        action_url: `/mandor-portal`,
        action_data: { record_id: kunci, project_id: t.project_id },
      })
      dibuat++
    }

    return reply.send({
      success: true, notifications_created: dibuat,
      checked: { proyek_aktif: idProyek.length, penugasan: (penugasan ?? []).length, belum_lapor: belum },
    })
  })

  // ── GET /api/v1/otomasi/jalankan/dependency-breach ───────────────────────
  //
  // Automation 3.10 — pendahulu Gantt belum cukup progresnya.
  //
  // ── Aturannya tidak dikarang di sini
  //
  // Ia sudah hidup di `apps/web/components/gantt-section.tsx` dan sudah
  // dibiasakan pengguna. Yang dilakukan di sini cuma memanggilnya dari
  // server (`lib/gantt-dependency.ts`) supaya penjadwal bisa memakainya.
  // Menulis ulang ambangnya di sini akan membuat layar dan notifikasi
  // memberi angka berbeda untuk pekerjaan yang sama.
  //
  // ── Kenapa hanya `danger`, bukan semua peringatan
  //
  // Peringatan `warning` sudah terlihat di layar Gantt tiap kali dibuka.
  // Mengirim semuanya sebagai notifikasi berarti mengulang apa yang sudah
  // terlihat — dan pada proyek dengan 200 baris RAB, itu puluhan pesan
  // sehari yang berujung notifikasi dimatikan. Yang dikirim hanya yang
  // parah: progres di bawah SETENGAH ambang, atau tumpang tindih >14 hari.
  app.get('/api/v1/otomasi/jalankan/dependency-breach', {
    preHandler: [authenticate, requirePermission('notifications:milestone:check')],
  }, async (request, reply) => {
    const { createNotification } = await import('../../utils/notifications.js')
    const { resolveRecipients } = await import('../../utils/notification-routing.js')
    const { cariPelanggaranDependency, bacaAturanDependency } =
      await import('../../lib/gantt-dependency.js')

    const now = new Date()
    const today = now.toISOString().split('T')[0]
    const sudah = await pembuatDedup(request, today, ['gantt_dep_breach'])

    const { data: proyek, error: eProyek } = await request.db!
      .from('projects')
      .select('id, name')
      // Enum  HANYA punya: draft|active|on_hold|completed|
      // cancelled. 'in_progress' TIDAK PERNAH ADA — Postgres menolak seluruh
      // query dengan 22P02, jadi pemeriksaan ini gagal TOTAL tiap kali jalan.
      .eq('status', 'active')
      .eq('is_deleted', false)

    if (eProyek) return reply.status(500).send({ error: eProyek.message })

    let dibuat = 0
    let totalPelanggaran = 0

    for (const p of proyek ?? []) {
      const { data: items, error: eItems } = await request.db!
        .viaProject('rab_items', p.id)
        .select('id, name, planned_start, planned_end, progress_pct, gantt_dep_rules')

      // Satu proyek gagal tak boleh menghentikan sisanya — tapi juga tak
      // boleh lolos tanpa jejak. Dicatat, lalu lanjut.
      if (eItems) {
        request.log.error({ err: eItems, projectId: p.id }, 'gagal membaca rab_items untuk dependency breach')
        continue
      }

      // Progres NYATA dari progress log, sejajar dengan yang dipakai layar
      // Gantt (`rab.ts:651` → `latest_pct`). Tanpa ini, pekerjaan yang sudah
      // selesai di lapangan tetap diperingatkan karena `progress_pct`
      // rencananya tak pernah diperbarui.
      // Kegagalan di sini membuat `pctNyata` kosong, dan pekerjaan yang sudah
      // selesai di lapangan ikut diperingatkan — tepat yang komentar di atas
      // hendak cegah. Dicatat lalu proyek ini DILEWATI, bukan diperingatkan
      // dengan data yang tak lengkap.
      const { data: logs, error: errLogs } = await request.db!
        .viaProject('progress_logs', p.id)
        .select('rab_item_id, logged_at, pct_completion')
        .eq('mode', 'detail')
        .not('rab_item_id', 'is', null)
        .order('logged_at', { ascending: true })

      if (errLogs) {
        request.log.warn(
          { err: errLogs, projectId: p.id },
          'dependency-breach: progres nyata tak terbaca, proyek dilewati',
        )
        continue
      }

      const pctNyata = new Map<string, number | null>()
      for (const l of logs ?? []) {
        pctNyata.set(l.rab_item_id as string, l.pct_completion as number | null)
      }

      const tugas = (items ?? []).map(i => ({
        id: i.id as string,
        uraian: (i.name as string) ?? '—',
        planned_start: i.planned_start as string | null,
        planned_end: i.planned_end as string | null,
        progress_pct: i.progress_pct as number | null,
        actual_pct: pctNyata.get(i.id as string) ?? null,
        dep_rules: bacaAturanDependency(i.gantt_dep_rules),
      }))

      const pelanggaran = cariPelanggaranDependency(tugas)
      totalPelanggaran += pelanggaran.length

      for (const w of pelanggaran) {
        if (w.severity !== 'danger') continue

        // Kunci dedup dirakit dari pasangan pendahulu→penerus: satu
        // pelanggaran yang sama tak boleh dilaporkan dua kali sehari,
        // tetapi pasangan berbeda tetap dilaporkan masing-masing.
        const kunci = `dep_${w.fromId}_${w.toId}`
        if (sudah('gantt_dep_breach', kunci)) continue

        const penerima = await resolveRecipients('gantt_dep_breach', {
          projectId: p.id, companyId: request.companyId!,
        })

        for (const uid of penerima) {
          await createNotification({
            company_id: request.companyId!,
            user_id:    uid,
            title:      'Ambang Dependency Terlampaui',
            message:    `${w.message} — proyek "${p.name}"`,
            type:       'gantt_dep_breach',
            priority:   'high',
            project_id: p.id,
            action_url: `/proyek/${p.id}#sec-gantt`,
            action_data: { record_id: kunci, from_id: w.fromId, to_id: w.toId },
          })
          dibuat++
        }
      }
    }

    return reply.send({
      success: true, notifications_created: dibuat,
      checked: { proyek: (proyek ?? []).length, pelanggaran: totalPelanggaran },
    })
  })

  // ── GET /api/v1/otomasi/jalankan/invoice-termin ──────────────────────────
  //
  // Automation 5.1 — termin yang sudah memenuhi syarat tagih diterbitkan
  // invoice-nya, tanpa menunggu seseorang mencatat pembayaran.
  //
  // ── Yang BERUBAH dari sebelumnya, dan kenapa itu penting
  //
  // Sampai sekarang invoice termin hanya lahir sebagai EFEK SAMPING dari
  // pencatatan pembayaran (`termin-payment.ts`). Urutannya terbalik dari
  // kenyataan: klien membayar SETELAH menerima invoice, bukan sebaliknya.
  // Akibatnya invoice diterbitkan mundur, bertanggal sama dengan pembayaran,
  // dan tak pernah ada dokumen yang benar-benar dikirim untuk menagih.
  //
  // `check-deadlines` sudah memperingatkan "Termin Siap Ditagih" sejak lama —
  // tapi peringatan itu berhenti di notifikasi. Yang ini menutup jaraknya.
  //
  // ── Kenapa TIDAK menyalin logika penerbitannya
  //
  // Ia dipakai bersama `termin-payment.ts` lewat `lib/invoice-termin.ts`.
  // Dua tempat yang menomori invoice dengan cara berbeda pasti berselisih,
  // dan selisihnya baru terlihat saat dua nomor bertabrakan — di dokumen
  // yang sudah terkirim ke pelanggan.
  //
  // ── Kenapa notifikasi TETAP dikirim
  //
  // Invoice yang terbit diam-diam sama tak bergunanya dengan yang tak terbit:
  // tak ada yang tahu ia harus dikirim ke klien. Tipe `invoice_created`
  // dipakai, BUKAN `invoice_due` — yang kedua sudah dipakai `check-deadlines`
  // untuk peringatan "siap ditagih", dan menyatukannya membuat dedup keduanya
  // saling menelan.
  app.get('/api/v1/otomasi/jalankan/invoice-termin', {
    preHandler: [authenticate, requirePermission('notifications:milestone:check')],
  }, async (request, reply) => {
    const { createNotification } = await import('../../utils/notifications.js')
    const { resolveRecipients } = await import('../../utils/notification-routing.js')
    const { terbitkanInvoiceTermin, terminSiapTagih } =
      await import('../../lib/invoice-termin.js')

    const now = new Date()
    const today = now.toISOString().split('T')[0]
    const sudah = await pembuatDedup(request, today, ['invoice_created'])

    // Termin yang belum ditagih, pada proyek yang masih berjalan.
    const idProyek = await request.db!.projectIds()
    const { data: termins, error } = await request.db!
      .unsafe('termin_schedules', 'penjadwal lintas-proyek: disaring .in(project_id, projectIds())')
      .select(`
        id, termin_number, amount, trigger_type, trigger_pct, status, project_id,
        project:projects!termin_schedules_project_id_fkey(id, name, progress_pct, status, tax_scheme)
      `)
      .in('project_id', idProyek)
      .eq('status', 'pending')

    if (error) return reply.status(500).send({ error: error.message })

    let terbit = 0
    let dilewati = 0
    let gagal = 0

    for (const t of termins ?? []) {
      const proj = t.project as unknown as {
        id: string; name: string; progress_pct: number | null
        status: string; tax_scheme: string | null
      } | null
      if (!proj) continue

      // Proyek batal/selesai tak menagih apa pun lagi.
      if (proj.status === 'cancelled' || proj.status === 'completed') continue

      if (!terminSiapTagih(t.trigger_type as string | null, t.trigger_pct as number | null, proj.progress_pct)) {
        continue
      }
      if (sudah('invoice_created', t.id as string)) continue

      const hasil = await terbitkanInvoiceTermin(
        request,
        { id: t.id as string, amount: t.amount as number, project_id: proj.id },
        { id: proj.id, tax_scheme: proj.tax_scheme },
        today,
        request.currentUser!.id,
      )

      if (!hasil.ok) {
        // Satu termin gagal tak boleh menghentikan sisanya — tapi juga tak
        // boleh lolos tanpa jejak. Uang yang tak tertagih adalah kegagalan
        // paling mahal yang bisa terjadi diam-diam.
        request.log.error(
          { alasan: hasil.alasan, pesan: hasil.pesan, terminId: t.id },
          'otomasi 5.1: gagal menerbitkan invoice termin',
        )
        gagal++
        continue
      }

      // Sudah ada sebelumnya — bukan pekerjaan baru, dan bukan kegagalan.
      if (!hasil.baru) { dilewati++; continue }

      const penerima = await resolveRecipients('invoice_created', {
        projectId: proj.id, companyId: request.companyId!,
      })

      for (const uid of penerima) {
        await createNotification({
          company_id: request.companyId!,
          user_id:    uid,
          title:      'Invoice Termin Terbit',
          message:    `Invoice ${hasil.nomor} (${rp(hasil.total)}) untuk termin ${t.termin_number} proyek "${proj.name}" sudah terbit — kirim ke klien`,
          type:       'invoice_created',
          priority:   'high',
          project_id: proj.id,
          action_url: `/keuangan`,
          action_data: { record_id: t.id, invoice_id: hasil.invoiceId, nomor: hasil.nomor },
        })
      }
      terbit++
    }

    return reply.send({
      success: true,
      notifications_created: terbit,
      checked: {
        termin_pending: (termins ?? []).length,
        invoice_terbit: terbit,
        sudah_ada: dilewati,
        gagal,
      },
    })
  })

  // ── GET /api/v1/otomasi/jalankan/gr-matching ─────────────────────────────
  //
  // Automation 4.10 — cocokkan Goods Receipt dengan PO.
  //
  // ── Yang SUDAH dijaga, dan karena itu TIDAK diulang di sini
  //
  // OVER-receipt sudah ditolak di dua tempat (`procurement.ts` saat GR dibuat
  // DAN saat dikonfirmasi), dan UI sudah mengisi baris GR otomatis dari PO
  // beserta sisa qty-nya. Menambah pemeriksaan keempat untuk hal yang sama
  // hanya menghasilkan kebisingan.
  //
  // ── Yang TIDAK dijaga siapa pun: arah sebaliknya
  //
  // Tiga kelas ketidakcocokan yang lolos semua penjagaan itu, karena semuanya
  // adalah KETIADAAN — dan yang tidak terjadi tak memicu apa pun:
  //
  //   STATUS BOHONG   PO ber-status `fully_received` padahal qty diterimanya
  //                   belum lengkap. Diukur di basis dev: PO-2026-001
  //                   tertulis "fully_received" dengan 0 dari 430 unit
  //                   diterima. Status inilah yang dibaca laporan dan
  //                   pembayaran supplier — bukan qty-nya.
  //
  //   MENGGANTUNG     PO diterima SEBAGIAN lalu dilupakan. Tak ada galat,
  //                   tak ada tenggat yang lewat, hanya barang yang tak
  //                   pernah datang dan uang muka yang sudah dibayar.
  //
  //   LEWAT TENGGAT   `expected_delivery_date` lewat, nol barang diterima.
  //
  // Ketiganya soal UANG: barang dibayar tapi tak diterima, atau dianggap
  // diterima padahal tidak.
  app.get('/api/v1/otomasi/jalankan/gr-matching', {
    preHandler: [authenticate, requirePermission('notifications:milestone:check')],
  }, async (request, reply) => {
    const { createNotification } = await import('../../utils/notifications.js')
    const { resolveRecipients } = await import('../../utils/notification-routing.js')

    // Ambang hari untuk "menggantung" — sejak tenggat kirim terlewat.
    const ambangHari = angka((request.query as any)?.hari, 7, 1, 365)
    const now = new Date()
    const today = now.toISOString().split('T')[0]
    const batas = new Date(now.getTime() - ambangHari * HARI_MS).toISOString().split('T')[0]

    const sudah = await pembuatDedup(request, today, ['gr_tak_cocok'])

    const idProyek = await request.db!.projectIds()
    const { data: baris, error } = await request.db!
      .unsafe('purchase_orders', 'penjadwal lintas-proyek: disaring .in(project_id, projectIds())')
      .select(`
        id, po_number, status, expected_delivery_date, project_id,
        project:projects!purchase_orders_project_id_fkey(id, name),
        items:purchase_order_items(id, qty_ordered, qty_received)
      `)
      .in('project_id', idProyek)
      .not('status', 'in', '("cancelled","draft")')

    if (error) return reply.status(500).send({ error: error.message })

    let dibuat = 0
    const hitung = { status_bohong: 0, menggantung: 0, lewat_tenggat: 0 }

    for (const po of baris ?? []) {
      const proj = po.project as unknown as { id: string; name: string } | null
      if (!proj) continue

      const items = (po.items ?? []) as Array<{ qty_ordered: number; qty_received: number | null }>
      if (items.length === 0) continue

      const pesan = items.reduce((s, i) => s + Number(i.qty_ordered ?? 0), 0)
      const terima = items.reduce((s, i) => s + Number(i.qty_received ?? 0), 0)
      if (pesan <= 0) continue

      const lengkap = terima >= pesan
      const tenggatLewat = Boolean(
        po.expected_delivery_date && String(po.expected_delivery_date).slice(0, 10) < batas,
      )

      // Urutannya menentukan: satu PO menghasilkan SATU peringatan, dengan
      // sebab yang paling serius. Mengirim tiga notifikasi untuk satu PO
      // membuat orang berhenti membaca ketiganya.
      let jenis: keyof typeof hitung | null = null
      let judul = ''
      let pesanTeks = ''

      if (po.status === 'fully_received' && !lengkap) {
        jenis = 'status_bohong'
        judul = 'Status PO Tak Cocok dengan Barang'
        pesanTeks = `PO ${po.po_number} bertanda "diterima penuh" tetapi baru ${terima} dari ${pesan} unit yang tercatat diterima — proyek "${proj.name}"`
      } else if (!lengkap && terima > 0 && tenggatLewat) {
        jenis = 'menggantung'
        judul = 'PO Diterima Sebagian'
        pesanTeks = `PO ${po.po_number} baru ${terima} dari ${pesan} unit, dan tenggat kirimnya sudah lewat — proyek "${proj.name}"`
      } else if (terima === 0 && tenggatLewat) {
        jenis = 'lewat_tenggat'
        judul = 'PO Lewat Tenggat, Barang Belum Datang'
        pesanTeks = `PO ${po.po_number} (${pesan} unit) melewati tenggat kirim dan belum ada barang diterima — proyek "${proj.name}"`
      }

      if (!jenis) continue
      hitung[jenis]++

      if (sudah('gr_tak_cocok', po.id as string)) continue

      const penerima = await resolveRecipients('gr_tak_cocok', {
        projectId: proj.id, companyId: request.companyId!,
      })

      for (const uid of penerima) {
        await createNotification({
          company_id: request.companyId!,
          user_id:    uid,
          title:      judul,
          message:    pesanTeks,
          type:       'gr_tak_cocok',
          // Status yang berbohong lebih gawat daripada barang terlambat:
          // ia sudah masuk laporan dan bisa memicu pembayaran supplier.
          priority:   jenis === 'status_bohong' ? 'urgent' : 'high',
          project_id: proj.id,
          action_url: '/procurement/penerimaan',
          action_data: { record_id: po.id, jenis, pesan_unit: pesan, terima_unit: terima },
        })
        dibuat++
      }
    }

    return reply.send({
      success: true, notifications_created: dibuat,
      checked: { po_diperiksa: (baris ?? []).length, ...hitung, ambang_hari: ambangHari },
    })
  })

  // ── GET /api/v1/otomasi/jalankan/stok-menipis ────────────────────────────
  //
  // Automation 3.5 — stok menyentuh ambang pesan-ulang.
  //
  // ══════════════════════════════════════════════════════════════════════
  // KENAPA MEMPERINGATKAN, BUKAN MEMBUAT MR OTOMATIS
  // ══════════════════════════════════════════════════════════════════════
  //
  // Katalog menulis "Draft MR otomatis saat stok menyentuh ambang", dan
  // penjadwal MEMANG bisa memanggil `POST /material-requests`. Tidak
  // dilakukan, karena tiga hal yang terukur:
  //
  // 1. MR menentukan BERAPA BANYAK yang dibeli. Ambang hanya mengatakan
  //    "kurang", tak mengatakan "beli berapa". Menebaknya berarti membuat
  //    dokumen pengadaan berisi angka yang tak seorang pun putuskan.
  //
  // 2. Ketergantungan yang katalog sebut sendiri — 3.4 Material Consumption
  //    Prediction — bergerbang **Phase 6** dan butuh AI. Tanpa ia, "berapa
  //    banyak" tak punya sumber selain tebakan.
  //
  // 3. MR draft yang lahir sendiri menumpuk. Yang menumpuk tak dibaca, dan
  //    yang tak dibaca membuat MR sungguhan ikut terabaikan.
  //
  // Yang dikirim: peringatan yang MEMBAWA angkanya — material, sisa, ambang,
  // dan kekurangannya — supaya manusia menekan "Buat MR" dengan angka yang
  // sudah terhitung. Satu klik, bukan satu dokumen karangan.
  //
  // ══════════════════════════════════════════════════════════════════════
  // ⚠ HARI INI AUTOMATION INI HAMPIR PASTI DIAM
  // ══════════════════════════════════════════════════════════════════════
  //
  // Diukur 2026-08-12: dari 24 material, **1** punya `min_stock > 0`. Dari
  // 12 baris `project_stocks`, **nol** di bawah ambang.
  //
  // Itu BUKAN alasan menunda automation-nya — kolomnya ada, UI pengisiannya
  // ada (`procurement/material`), dan begitu founder mengisi ambang, ia
  // langsung bekerja. Tapi dinyatakan di sini supaya tak ada yang menyimpulkan
  // "sudah jalan" dari log yang selalu nol.
  app.get('/api/v1/otomasi/jalankan/stok-menipis', {
    preHandler: [authenticate, requirePermission('notifications:milestone:check')],
  }, async (request, reply) => {
    const { createNotification } = await import('../../utils/notifications.js')
    const { resolveRecipients } = await import('../../utils/notification-routing.js')

    const now = new Date()
    const today = now.toISOString().split('T')[0]
    const sudah = await pembuatDedup(request, today, ['stok_menipis'])

    const idProyek = await request.db!.projectIds()
    const { data: stok, error } = await request.db!
      .unsafe('project_stocks', 'penjadwal lintas-proyek: disaring .in(project_id, projectIds())')
      .select(`
        id, qty_on_hand, project_id, material_id,
        material:materials(id, name, unit, min_stock),
        project:projects!project_stocks_project_id_fkey(id, name, status, is_deleted)
      `)
      .in('project_id', idProyek)

    if (error) return reply.status(500).send({ error: error.message })

    let dibuat = 0
    let menipis = 0
    let tanpaAmbang = 0

    for (const s of stok ?? []) {
      const mat = s.material as unknown as
        { id: string; name: string; unit: string | null; min_stock: number | null } | null
      const proj = s.project as unknown as
        { id: string; name: string; status: string; is_deleted: boolean } | null
      if (!mat || !proj) continue

      // Proyek selesai/batal tak perlu dipesankan apa pun lagi.
      if (proj.is_deleted || proj.status === 'cancelled' || proj.status === 'completed') continue

      const ambang = Number(mat.min_stock ?? 0)
      // Ambang nol = belum ditentukan, BUKAN "boleh habis". Menganggapnya nol
      // sebagai batas membuat tiap material berstok 0 diperingatkan selamanya.
      if (ambang <= 0) { tanpaAmbang++; continue }

      const sisa = Number(s.qty_on_hand ?? 0)
      if (sisa >= ambang) continue
      menipis++

      // Kunci dedup per-baris stok: material yang sama di dua proyek adalah
      // dua kekurangan berbeda, dan keduanya perlu diketahui.
      if (sudah('stok_menipis', s.id as string)) continue

      const kurang = ambang - sisa
      const satuan = mat.unit ?? 'unit'

      const penerima = await resolveRecipients('stok_menipis', {
        projectId: proj.id, companyId: request.companyId!,
      })

      for (const uid of penerima) {
        await createNotification({
          company_id: request.companyId!,
          user_id:    uid,
          title:      'Stok Menipis',
          message:    `${mat.name} di proyek "${proj.name}" tersisa ${sisa} ${satuan}, di bawah ambang ${ambang} — kurang ${kurang} ${satuan}`,
          // `urgent` saat stok benar-benar HABIS: pekerjaan berhenti, bukan
          // sekadar menipis.
          priority:   sisa <= 0 ? 'urgent' : 'high',
          type:       'stok_menipis',
          project_id: proj.id,
          action_url: '/procurement/material-request',
          // Angkanya ikut supaya UI bisa mengisi form MR tanpa menghitung
          // ulang — inilah yang membuat "satu klik" mungkin.
          action_data: {
            record_id: s.id, material_id: mat.id, material: mat.name,
            sisa, ambang, kurang, unit: satuan,
          },
        })
        dibuat++
      }
    }

    return reply.send({
      success: true, notifications_created: dibuat,
      checked: {
        stok_diperiksa: (stok ?? []).length,
        menipis,
        tanpa_ambang: tanpaAmbang,
      },
    })
  })

  // ── GET /api/v1/otomasi/jalankan/invoice-terlambat ───────────────────────
  //
  // Automation 2.6 — invoice yang lewat jatuh tempo dan belum lunas.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // MEMBACA `amount_due`, BUKAN `status = 'overdue'`
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Enum `invoice_status` punya `overdue`, dan menggodanya sederhana: saring
  // status itu. Ditolak, karena status harus DIUBAH seseorang — dan kalau tak
  // ada yang mengubahnya, invoice yang benar-benar telat tetap tertulis `sent`
  // dan automation ini diam untuk persis kasus yang ia cari.
  //
  // Yang dibaca: tanggal jatuh tempo sudah lewat DAN masih ada sisa tagihan.
  // Keduanya fakta yang tak menunggu siapa pun memperbaruinya.
  //
  // `amount_due > 0` juga menangkap `partial` — invoice yang dibayar sebagian
  // dan sisanya menggantung. Menyaring `status='sent'` saja melewatkannya, dan
  // justru itu yang paling sering terlupakan.
  app.get('/api/v1/otomasi/jalankan/invoice-terlambat', {
    preHandler: [authenticate, requirePermission('notifications:milestone:check')],
  }, async (request, reply) => {
    const { createNotification } = await import('../../utils/notifications.js')
    const { resolveRecipients } = await import('../../utils/notification-routing.js')

    const q = request.query as { hari?: string }
    /*
      Ambang dari PENGATURAN TENANT, bukan angka di kode.

      Founder: *"kalo bisa workflownya itu kalo bisa jangan di hardcode
      langsung yaa"*. Urutannya query → `company_settings` → bawaan; alasan
      tiap lapisnya di `lib/ambang-otomasi.ts`.
    */
    const hari = await ambilAmbang(request, 'otomasi.invoice_terlambat.hari', q.hari)

    const today = new Date().toISOString().split('T')[0]
    const batas = new Date(Date.now() - hari * 86_400_000).toISOString().split('T')[0]
    const sudah = await pembuatDedup(request, today, ['invoice_overdue'])

    // T4i — isi notifikasi memuat nominal tagihan, jadi datanya disaring di
    // SUMBERNYA. Pola sama dengan `invoice-termin`: `viaProject()` menuntut
    // satu project_id, sementara automation ini memang lintas-proyek.
    const idProyek = await request.db!.projectIds()
    const { data: invoices, error } = await request.db!
      .unsafe('invoices', 'penjadwal lintas-proyek: disaring .in(project_id, projectIds())')
      .select(`
        id, invoice_number, total_amount, amount_due, due_date, status, project_id,
        project:projects!invoices_project_id_fkey(id, name, pm_id)
      `)
      .in('project_id', idProyek)
      .lt('due_date', batas)
      .gt('amount_due', 0)
      .not('status', 'in', '("paid","cancelled","draft")')

    // Query yang gagal TIDAK boleh terbaca sebagai "tak ada yang telat".
    if (error) return reply.status(500).send({ error: error.message })

    let dibuat = 0
    for (const inv of invoices ?? []) {
      /*
        Embed PostgREST memulangkan ARRAY meski relasinya satu-ke-satu.
        Memperlakukannya sebagai objek menghasilkan `undefined` di dalam pesan
        notifikasi — dan itu tak melempar apa pun.
      */
      const embed = (inv as { project?: unknown }).project
      const proyek = (Array.isArray(embed) ? embed[0] : embed) as
        { id: string; name: string } | null | undefined
      if (!proyek) continue
      if (sudah('invoice_overdue', inv.id as string)) continue

      const telat = Math.floor(
        (Date.now() - new Date(inv.due_date as string).getTime()) / 86_400_000,
      )
      const sisa = Number(inv.amount_due ?? 0)

      const penerima = await resolveRecipients('invoice_overdue', {
        projectId: proyek.id,
        companyId: request.companyId!,
      })

      for (const uid of penerima) {
        createNotification({
          company_id: request.companyId!,
          user_id: uid,
          title: 'Invoice Lewat Jatuh Tempo',
          message: `${inv.invoice_number} (${proyek.name}) telat ${telat} hari — `
            + `sisa Rp ${sisa.toLocaleString('id-ID')}`,
          type: 'invoice_overdue' as const,
          priority: telat > 30 ? ('high' as const) : ('normal' as const),
          project_id: proyek.id,
          action_url: '/keuangan/invoice',
          // `record_id` WAJIB — tanpanya dedup harian tak bisa menilai kembar,
          // dan tegurannya berulang tiap denyut penjadwal.
          action_data: { record_id: inv.id },
        })
        dibuat++
      }
    }

    return reply.send({
      success: true, notifications_created: dibuat,
      checked: { invoice_terlambat: (invoices ?? []).length, ambang_hari: hari },
    })
  })

  // ── GET /api/v1/otomasi/jalankan/saldo-menipis ───────────────────────────
  //
  // Automation 2.11 — rekening kas yang saldonya turun di bawah ambang aman.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // AMBANGNYA PENGATURAN TENANT, BUKAN KOLOM DAN BUKAN ANGKA DI KODE
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Dua bentuk yang ditolak, masing-masing karena alasan terukur:
  //
  //   kolom di `cash_accounts`   tak ada (diukur), dan menambahkannya berarti
  //                              tiap tenant WAJIB mengisinya lebih dulu.
  //                              `stok-menipis` membuktikan akibatnya: dari 24
  //                              material, SATU punya `min_stock` terisi, dan
  //                              automation-nya diam berbulan-bulan sambil
  //                              melaporkan sehat.
  //
  //   angka di kode              "saldo berapa yang bikin khawatir" berbeda
  //                              antara kontraktor rumah tinggal dan
  //                              infrastruktur. Memilihkannya berarti memutuskan
  //                              soal uang perusahaan orang lain.
  //
  // Yang dipakai: `company_settings` — mekanisme yang SUDAH ada dan sudah
  // dipakai lima pengaturan lain, lengkap dengan halaman pengaturannya.
  // Bawaannya tetap ada sebagai jaring, jadi tenant yang belum mengisi tetap
  // mendapat otomasi yang bekerja. Lihat `lib/ambang-otomasi.ts`.
  app.get('/api/v1/otomasi/jalankan/saldo-menipis', {
    preHandler: [authenticate, requirePermission('notifications:milestone:check')],
  }, async (request, reply) => {
    const { createNotification } = await import('../../utils/notifications.js')
    const { resolveRecipients } = await import('../../utils/notification-routing.js')

    const q = request.query as { ambang?: string }
    const ambang = await ambilAmbang(request, 'otomasi.saldo_menipis.rupiah', q.ambang)

    const today = new Date().toISOString().split('T')[0]
    const sudah = await pembuatDedup(request, today, ['saldo_menipis'])

    // `cash_accounts` kategori B — `.from()` sudah menyaring `company_id`.
    const { data: rekening, error } = await request.db!
      .from('cash_accounts')
      .select('id, name, balance, is_active')
      .eq('is_active', true)

    if (error) return reply.status(500).send({ error: error.message })

    let dibuat = 0
    let menipis = 0

    for (const r of rekening ?? []) {
      const saldo = Number(r.balance ?? 0)
      if (saldo >= ambang) continue
      menipis++
      if (sudah('saldo_menipis', r.id as string)) continue

      /*
        TANPA `projectId` — rekening kas milik COMPANY, bukan proyek.

        Memaksakan project_id di sini membuat notifikasi kas ikut tersaring
        per-proyek, dan rekening yang tak terikat proyek mana pun (kas induk,
        kas kantor) tak akan pernah mengabari siapa pun.
      */
      const penerima = await resolveRecipients('saldo_menipis', {
        companyId: request.companyId!,
      })

      for (const uid of penerima) {
        createNotification({
          company_id: request.companyId!,
          user_id: uid,
          title: 'Saldo Kas Menipis',
          message: `${r.name}: sisa Rp ${saldo.toLocaleString('id-ID')} `
            + `(di bawah Rp ${ambang.toLocaleString('id-ID')})`,
          type: 'saldo_menipis' as const,
          // Saldo nol atau minus bukan "menipis" lagi — pembayaran berikutnya
          // akan gagal, dan itu perlu dilihat hari ini.
          priority: saldo <= 0 ? ('high' as const) : ('normal' as const),
          action_url: '/kas',
          action_data: { record_id: r.id },
        })
        dibuat++
      }
    }

    return reply.send({
      success: true, notifications_created: dibuat,
      checked: { rekening_diperiksa: (rekening ?? []).length, menipis, ambang },
    })
  })

  // ── GET /api/v1/otomasi/jalankan/milestone-berisiko ──────────────────────
  //
  // Automation 3.7 — milestone yang mendekati tenggat tetapi belum selesai.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // `completed_at IS NULL`, BUKAN `status <> 'completed'`
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Alasan yang sama dengan `invoice-terlambat`: `status` harus DIUBAH
  // seseorang. Dua arah kesalahannya sama-sama nyata —
  //
  //   status tertinggal    milestone yang sudah selesai di lapangan tetapi
  //                        belum diperbarui akan ditegur terus, dan tegurannya
  //                        yang salah membuat orang berhenti membaca.
  //
  //   status mendahului    milestone yang ditandai `completed` padahal belum
  //                        selesai TAK AKAN PERNAH ditegur — dan itu justru
  //                        yang paling perlu terlihat.
  //
  // `completed_at` adalah fakta: ia terisi saat pekerjaan benar-benar
  // dinyatakan selesai. Keduanya diperiksa — status untuk melewati yang jelas
  // selesai, `completed_at` sebagai kebenarannya.
  app.get('/api/v1/otomasi/jalankan/milestone-berisiko', {
    preHandler: [authenticate, requirePermission('notifications:milestone:check')],
  }, async (request, reply) => {
    const { createNotification } = await import('../../utils/notifications.js')
    const { resolveRecipients } = await import('../../utils/notification-routing.js')

    const q = request.query as { hari?: string }
    const hari = await ambilAmbang(request, 'otomasi.milestone_berisiko.hari', q.hari)

    const today = new Date().toISOString().split('T')[0]
    const batas = new Date(Date.now() + hari * 86_400_000).toISOString().split('T')[0]
    const sudah = await pembuatDedup(request, today, ['milestone_approaching'])

    const idProyek = await request.db!.projectIds()
    const { data: ms, error } = await request.db!
      .unsafe('milestones', 'penjadwal lintas-proyek: disaring .in(project_id, projectIds())')
      .select(`
        id, title, target_date, status, completed_at, project_id,
        project:projects!milestones_project_id_fkey(id, name)
      `)
      .in('project_id', idProyek)
      .is('completed_at', null)
      .neq('status', 'completed')
      .lte('target_date', batas)

    if (error) return reply.status(500).send({ error: error.message })

    let dibuat = 0
    for (const m of ms ?? []) {
      // Embed PostgREST memulangkan ARRAY meski relasinya satu-ke-satu.
      const embed = (m as { project?: unknown }).project
      const proyek = (Array.isArray(embed) ? embed[0] : embed) as
        { id: string; name: string } | null | undefined
      if (!proyek) continue
      if (sudah('milestone_approaching', m.id as string)) continue

      const sisaHari = Math.ceil(
        (new Date(m.target_date as string).getTime() - Date.now()) / 86_400_000,
      )
      const telat = sisaHari < 0

      const penerima = await resolveRecipients('milestone_approaching', {
        projectId: proyek.id,
        companyId: request.companyId!,
      })

      for (const uid of penerima) {
        createNotification({
          company_id: request.companyId!,
          user_id: uid,
          title: telat ? 'Milestone Terlewat' : 'Milestone Mendekati Tenggat',
          message: telat
            ? `${m.title} (${proyek.name}) terlewat ${Math.abs(sisaHari)} hari`
            : `${m.title} (${proyek.name}) jatuh tempo ${sisaHari} hari lagi`,
          type: 'milestone_approaching' as const,
          priority: telat ? ('high' as const) : ('normal' as const),
          project_id: proyek.id,
          action_url: `/proyek/${proyek.id}`,
          action_data: { record_id: m.id },
        })
        dibuat++
      }
    }

    return reply.send({
      success: true, notifications_created: dibuat,
      checked: { milestone_diperiksa: (ms ?? []).length, ambang_hari: hari },
    })
  })

  // ── GET /api/v1/otomasi/jalankan/hutang-supplier ─────────────────────────
  //
  // Automation 2.2 — tagihan supplier yang mendekati/melewati jatuh tempo.
  //
  // Kembaran `invoice-terlambat`, tetapi arah uangnya TERBALIK: yang itu uang
  // yang belum kita terima, yang ini uang yang belum kita bayar.
  //
  // Bedanya menentukan kapan ditegur. Invoice masuk ditegur SESUDAH lewat
  // tempo — kita yang menagih, dan menagih sebelum jatuh tempo tak sopan.
  // Hutang supplier ditegur SEBELUM: telat membayar merusak hubungan dagang,
  // dan tak ada yang bisa dilakukan sesudahnya kecuali meminta maaf.
  app.get('/api/v1/otomasi/jalankan/hutang-supplier', {
    preHandler: [authenticate, requirePermission('notifications:milestone:check')],
  }, async (request, reply) => {
    const { createNotification } = await import('../../utils/notifications.js')
    const { resolveRecipients } = await import('../../utils/notification-routing.js')

    const q = request.query as { hari?: string }
    const hari = await ambilAmbang(request, 'otomasi.hutang_supplier.hari', q.hari)

    const today = new Date().toISOString().split('T')[0]
    const batas = new Date(Date.now() + hari * 86_400_000).toISOString().split('T')[0]
    const sudah = await pembuatDedup(request, today, ['hutang_supplier_jatuh_tempo'])

    // `supplier_invoices` punya `company_id` (kategori B) — `.from()` cukup.
    const { data: tagihan, error } = await request.db!
      .from('supplier_invoices')
      .select(`
        id, invoice_number, due_date, amount_due, status, project_id,
        supplier:suppliers!supplier_invoices_supplier_id_fkey(id, name)
      `)
      .gt('amount_due', 0)
      .lte('due_date', batas)
      .not('status', 'in', '("paid","cancelled")')

    if (error) return reply.status(500).send({ error: error.message })

    let dibuat = 0
    for (const t of tagihan ?? []) {
      if (sudah('hutang_supplier_jatuh_tempo', t.id as string)) continue

      const embed = (t as { supplier?: unknown }).supplier
      const pemasok = (Array.isArray(embed) ? embed[0] : embed) as
        { name: string } | null | undefined

      const sisaHari = Math.ceil(
        (new Date(t.due_date as string).getTime() - Date.now()) / 86_400_000,
      )
      const telat = sisaHari < 0
      const nilai = Number(t.amount_due ?? 0)

      /*
        `projectId` disertakan HANYA bila tagihannya terikat proyek.

        Sebagian tagihan supplier memang tak punya proyek (pembelian kantor,
        alat bersama). Memaksakan `projectId: null` ke `resolveRecipients`
        membuat penyaringnya mencari proyek bernama `null` dan memulangkan nol
        penerima — tagihan itu tak akan pernah dikabari.
      */
      const penerima = await resolveRecipients('hutang_supplier_jatuh_tempo', {
        companyId: request.companyId!,
        ...(t.project_id ? { projectId: t.project_id as string } : {}),
      })

      for (const uid of penerima) {
        createNotification({
          company_id: request.companyId!,
          user_id: uid,
          title: telat ? 'Hutang Supplier Terlambat' : 'Hutang Supplier Jatuh Tempo',
          message: `${t.invoice_number}${pemasok?.name ? ` — ${pemasok.name}` : ''}: `
            + `Rp ${nilai.toLocaleString('id-ID')} `
            + (telat ? `telat ${Math.abs(sisaHari)} hari` : `jatuh tempo ${sisaHari} hari lagi`),
          type: 'hutang_supplier_jatuh_tempo' as const,
          priority: telat ? ('high' as const) : ('normal' as const),
          ...(t.project_id ? { project_id: t.project_id as string } : {}),
          action_url: '/procurement/hutang',
          action_data: { record_id: t.id },
        })
        dibuat++
      }
    }

    return reply.send({
      success: true, notifications_created: dibuat,
      checked: { tagihan_diperiksa: (tagihan ?? []).length, ambang_hari: hari },
    })
  })

  // ── GET /api/v1/otomasi/jalankan/harga-material-naik ─────────────────────
  //
  // Automation 4.9 — harga aktif sebuah material naik signifikan.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // INI BUKAN PREDIKSI, DAN TIDAK MENGAKU BEGITU
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Katalog menandai 4.9 `Predictive`, dan versi penuhnya memang butuh model.
  // Yang dibangun di sini bagian rule-based-nya: kenaikan yang SUDAH TERJADI
  // dan melampaui ambang. Menyebutnya prediksi akan mengklaim lebih dari yang
  // ia lakukan — dan orang akan mengira sistem memperingatkan kenaikan yang
  // BELUM terjadi.
  //
  // `price_book_entries` menyimpan riwayat: tiap perubahan harga jadi baris
  // baru, yang lama jadi `expired`. Jadi "naik" bisa diukur tanpa menyimpan
  // apa pun tambahan — bandingkan harga `active` dengan harga `expired`
  // TERAKHIR untuk resource yang sama.
  app.get('/api/v1/otomasi/jalankan/harga-material-naik', {
    preHandler: [authenticate, requirePermission('notifications:milestone:check')],
  }, async (request, reply) => {
    const { createNotification } = await import('../../utils/notifications.js')
    const { resolveRecipients } = await import('../../utils/notification-routing.js')

    const q = request.query as { persen?: string }
    const ambangPersen = await ambilAmbang(request, 'otomasi.harga_material.persen', q.persen)

    const today = new Date().toISOString().split('T')[0]
    const sudah = await pembuatDedup(request, today, ['harga_material_naik'])

    /*
      Dibaca BERHALAMAN — `price_book_entries` sudah 3.103 baris (diukur), dan
      PostgREST memulangkan maksimal 1.000 tanpa galat maupun penanda.

      Pelajaran `audit-baca-tak-terpotong` (dan cacat anti-lockout yang
      melahirkannya): tanpa paging, 2.103 baris terakhir tak pernah terbaca,
      dan automation ini diam untuk material yang kebetulan di luar 1.000
      pertama — tanpa satu pun gejala.
    */
    const HALAMAN = 1000
    const semua: Array<Record<string, unknown>> = []
    for (let dari = 0; ; dari += HALAMAN) {
      const { data, error } = await request.db!
        .from('price_book_entries')
        .select(`
          id, amount, status, effective_date, resource_id,
          resource:resources!price_book_entries_resource_id_fkey(id, code, name)
        `)
        .in('status', ['active', 'expired'])
        .order('resource_id', { ascending: true })
        .range(dari, dari + HALAMAN - 1)

      if (error) return reply.status(500).send({ error: error.message })
      if (!data || data.length === 0) break
      semua.push(...(data as Array<Record<string, unknown>>))
      if (data.length < HALAMAN) break
    }

    // Kelompokkan per resource: harga aktif, dan harga expired TERBARU.
    const perResource = new Map<string, {
      aktif?: Record<string, unknown>
      lama?: Record<string, unknown>
    }>()
    for (const e of semua) {
      const rid = e.resource_id as string
      if (!rid) continue
      const slot = perResource.get(rid) ?? {}
      if (e.status === 'active') {
        slot.aktif = e
      } else {
        const tglBaru = String(e.effective_date ?? '')
        const tglLama = String(slot.lama?.effective_date ?? '')
        if (!slot.lama || tglBaru > tglLama) slot.lama = e
      }
      perResource.set(rid, slot)
    }

    let dibuat = 0
    let naik = 0

    for (const [rid, slot] of perResource) {
      if (!slot.aktif || !slot.lama) continue
      const baru = Number(slot.aktif.amount ?? 0)
      const lama = Number(slot.lama.amount ?? 0)
      // Pembagi nol dijaga: harga lama 0 membuat persentase jadi Infinity, dan
      // Infinity selalu melampaui ambang mana pun.
      if (lama <= 0 || baru <= lama) continue

      const persen = ((baru - lama) / lama) * 100
      if (persen < ambangPersen) continue
      naik++
      if (sudah('harga_material_naik', rid)) continue

      const embed = (slot.aktif as { resource?: unknown }).resource
      const res = (Array.isArray(embed) ? embed[0] : embed) as
        { code: string; name: string } | null | undefined

      const penerima = await resolveRecipients('harga_material_naik', {
        companyId: request.companyId!,
      })

      for (const uid of penerima) {
        createNotification({
          company_id: request.companyId!,
          user_id: uid,
          title: 'Harga Material Naik',
          message: `${res?.name ?? res?.code ?? 'Material'} naik ${persen.toFixed(1)}% — `
            + `Rp ${lama.toLocaleString('id-ID')} → Rp ${baru.toLocaleString('id-ID')}`,
          type: 'harga_material_naik' as const,
          priority: persen >= 25 ? ('high' as const) : ('normal' as const),
          action_url: '/procurement/material',
          // `record_id` = resource, BUKAN baris harga: yang penting "material
          // ini sudah dikabari hari ini", bukan "baris harga ini".
          action_data: { record_id: rid },
        })
        dibuat++
      }
    }

    return reply.send({
      success: true, notifications_created: dibuat,
      checked: {
        resource_diperiksa: perResource.size,
        naik,
        ambang_persen: ambangPersen,
        baris_harga_dibaca: semua.length,
      },
    })
  })

  // ── GET /api/v1/otomasi/jalankan/evm-kinerja ─────────────────────────────
  //
  // Automation 3.18 — Earned Value Trend Alert.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // KENAPA INI MEMANGGIL RUTE LAIN, BUKAN MENGHITUNG SENDIRI
  // ══════════════════════════════════════════════════════════════════════════
  //
  // 3.18 ditunda pada 2026-08-15 dengan alasan yang tercatat: EVM tak disimpan
  // di tabel mana pun, dan merakit ulang BAC/AC/EV/PV di sini butuh ~25 baris
  // salinan dari `kurva-s.ts`.
  //
  // Alasan itu masih berlaku — yang berubah cuma jalan keluarnya. Perakitan
  // EVM bukan sekadar rumus (`calculateEVM` sudah fungsi murni sejak Task
  // 1.2.2); yang mahal adalah MENENTUKAN MASUKANNYA:
  //
  //   BAC   berjenjang: pagu RAP terkunci → nilai RAB → nilai kontrak
  //   PV    dari kurva rencana mingguan, yang sumbernya sendiri berjenjang
  //         (jadwal RAB → Gantt → kurva lonceng generik)
  //   AC    serapan dana manual, bukan aktual kas
  //
  // Menyalin ketiganya berarti dua sumber untuk satu angka. Dan angka yang
  // punya dua sumber akan berselisih — bukan mungkin, melainkan pada
  // perubahan pertama yang hanya diterapkan di salah satunya. Yang membaca
  // notifikasi "SPI 0.7" lalu membuka layar Kurva-S dan melihat 0.85 tak
  // punya cara tahu mana yang benar.
  //
  // Jadi otomasi ini MEMANGGIL rute kurva-S lewat `server.inject` — pola yang
  // sudah ada dan sudah beralasan di `lib/ai-setujui.ts` dan
  // `routes/v1/jadwal.ts`. Header asli pemanggil ikut, jadi `authenticate` dan
  // saringan tenant berlaku persis sama; tak ada jalan pintas yang dibuat
  // untuk otomasi.
  //
  // Ongkosnya nyata: satu permintaan per proyek aktif, dan kurva-S bukan rute
  // ringan. Karena itu ia dibatasi proyek berstatus `active` saja — proyek
  // `draft` belum punya rencana untuk dibandingkan, dan `completed` tak lagi
  // bisa diperbaiki.
  app.get('/api/v1/otomasi/jalankan/evm-kinerja', {
    preHandler: [authenticate, requirePermission('notifications:milestone:check')],
  }, async (request, reply) => {
    const { createNotification } = await import('../../utils/notifications.js')
    const { resolveRecipients } = await import('../../utils/notification-routing.js')

    const q = request.query as { spi?: string; cpi?: string }
    const minSpi = await ambilAmbang(request, 'otomasi.evm_spi.minimum', q.spi)
    const minCpi = await ambilAmbang(request, 'otomasi.evm_cpi.minimum', q.cpi)

    const today = new Date().toISOString().split('T')[0]
    const sudah = await pembuatDedup(request, today, ['evm_kinerja_menurun'])

    const { data: proyek, error } = await request.db!
      .from('projects')
      .select('id, name, pm_id')
      .eq('status', 'active')

    // Query yang gagal TIDAK boleh terbaca sebagai "tak ada proyek aktif".
    if (error) return reply.status(500).send({ error: error.message })

    let dibuat = 0
    let diperiksa = 0
    let takTerhitung = 0
    let sudahDikirimHariIni = 0

    for (const p of proyek ?? []) {
      /*
        Ember KETIGA, dan ia harus dihitung.

        Test pertama saya mengandaikan tiap proyek aktif berakhir di salah satu
        dari dua ember (terhitung / tak terhitung), lalu merah — karena proyek
        yang sudah dikirimi hari ini keluar dari perulangan SEBELUM masuk
        keduanya.

        Testnya benar menuntut penjumlahan yang utuh; rutenya yang kurang satu
        angka. Tanpa ini, "0 notifikasi" pada panggilan kedua tak bisa
        dibedakan dari "0 proyek bermasalah" — dan itu persis pertanyaan yang
        orang bawa saat memeriksa kenapa pesannya tak datang.
      */
      if (sudah('evm_kinerja_menurun', p.id)) {
        sudahDikirimHariIni++
        continue
      }

      const res = await request.server.inject({
        method: 'GET',
        url: `/api/v1/projects/${p.id}/kurva-s`,
        headers: {
          // Header ASLI pemanggil — bukan header layanan yang melewati apa pun.
          authorization: request.headers.authorization ?? '',
          'x-company-id': (request.headers['x-company-id'] as string) ?? '',
        },
      })

      /*
        Proyek yang kurva-S-nya gagal DILEWATI, tidak menggagalkan seluruh
        jalannya — dan DIHITUNG, tidak ditelan.

        Satu proyek tanpa tanggal mulai membuat kurva-S balas 500; kalau itu
        menghentikan otomasi, sepuluh proyek lain yang benar-benar bermasalah
        tak pernah diperiksa. Tapi melewatinya tanpa mencatat berarti
        "0 proyek bermasalah" bisa berarti "semua sehat" ATAU "semuanya gagal
        dihitung", dan keduanya terlihat sama persis di respons.
      */
      if (res.statusCode !== 200) {
        takTerhitung++
        request.log.warn(
          { projectId: p.id, status: res.statusCode },
          'evm-kinerja: kurva-s tak bisa dihitung, proyek dilewati',
        )
        continue
      }

      let spi = NaN
      let cpi = NaN
      let cakupan = 0
      try {
        const badan = res.json() as {
          meta?: { evm?: Record<string, number>; cakupanJadwalPct?: number }
        }
        spi = Number(badan.meta?.evm?.spi ?? NaN)
        cpi = Number(badan.meta?.evm?.cpi ?? NaN)
        cakupan = Number(badan.meta?.cakupanJadwalPct ?? 0)
      } catch {
        takTerhitung++
        continue
      }

      /*
        SPI/CPI nol atau bukan angka berarti BAC nol — proyek tanpa RAP, RAB,
        maupun nilai kontrak. Itu bukan kinerja buruk, itu KETIADAAN DATA, dan
        menegur orang karenanya membuat mereka berhenti mempercayai pesannya.
      */
      if (!Number.isFinite(spi) || !Number.isFinite(cpi) || (spi === 0 && cpi === 0)) {
        takTerhitung++
        continue
      }

      diperiksa++

      const spiBuruk = spi < minSpi
      const cpiBuruk = cpi < minCpi
      if (!spiBuruk && !cpiBuruk) continue

      /*
        Pesannya menyebut CAKUPAN JADWAL, dan itu bukan hiasan.

        `kurva-s.ts` memperingatkan sendiri: PV dari Gantt hanya sekuat cakupan
        item yang punya tanggal rencana. Lima belas dari 296 item berjadwal
        menghasilkan SPI yang terlihat sama meyakinkannya dengan SPI dari
        jadwal penuh. Angka yang dikirim tanpa cakupannya mengundang keputusan
        yang lebih percaya diri daripada datanya.
      */
      const bagian: string[] = []
      if (spiBuruk) bagian.push(`jadwal SPI ${spi.toFixed(2)} (batas ${minSpi})`)
      if (cpiBuruk) bagian.push(`biaya CPI ${cpi.toFixed(2)} (batas ${minCpi})`)

      const penerima = await resolveRecipients('evm_kinerja_menurun', {
        projectId: p.id, companyId: request.companyId!,
      })

      for (const uid of penerima) {
        await createNotification({
          company_id: request.companyId!,
          user_id:    uid,
          title:      'Kinerja Proyek Menurun',
          message:
            `Proyek "${p.name}": ${bagian.join(' dan ')}. `
            + `Cakupan jadwal ${cakupan.toFixed(0)}% dari nilai pekerjaan.`,
          type:       'evm_kinerja_menurun',
          // Keduanya buruk = mendesak. Satu saja masih bisa ditangani dalam
          // ritme kerja biasa.
          priority:   spiBuruk && cpiBuruk ? 'urgent' : 'high',
          project_id: p.id,
          action_url: `/proyek/${p.id}`,
          action_data: { record_id: p.id, spi, cpi, cakupan_jadwal_pct: cakupan },
        })
        dibuat++
      }
    }

    return reply.send({
      success: true, notifications_created: dibuat,
      checked: {
        proyek_aktif: (proyek ?? []).length,
        evm_terhitung: diperiksa,
        // Dilaporkan EKSPLISIT: tanpa angka ini, "0 bermasalah" tak bisa
        // dibedakan dari "semua gagal dihitung".
        evm_tak_terhitung: takTerhitung,
        sudah_dikirim_hari_ini: sudahDikirimHariIni,
        ambang_spi: minSpi, ambang_cpi: minCpi,
      },
    })
  })

  // ── GET /api/v1/otomasi/jalankan/polis-berakhir ──────────────────────────
  //
  // Automation 5.7 (Expired Document Alert) + 9.2 (Insurance Coverage Gap).
  //
  // ══════════════════════════════════════════════════════════════════════════
  // ROADMAP MENYEBUT KEDUANYA "BUTUH MODUL YANG BELUM DIBANGUN" — ITU SALAH
  // ══════════════════════════════════════════════════════════════════════════
  //
  // `ROADMAP-WORKFLOW.md` §2 menulis modul Insurance & Surety "nol halaman,
  // nol rute (diukur 2026-08-15)". Diukur ulang 2026-08-16: tabel
  // `polis_asuransi` ada, rute `/api/v1/asuransi` ada, dan
  // `lib/register-asuransi.ts` SUDAH menghitung status kedaluwarsa DAN celah
  // pertanggungan sebagai fungsi murni.
  //
  // Pengukuran pertama saya hanya mencari nama berkas ber-kata "insurance" —
  // bahasa Inggris, di repo yang menamai berkasnya bahasa Indonesia. Pelajaran
  // yang sama dengan §1 dokumen itu: yang bisa basi jangan ditulis, dan yang
  // ditulis harus dari pengukuran yang benar-benar mengukur.
  //
  // ── Satu rute untuk dua automation, dan itu disengaja
  //
  // 5.7 menanyakan "polis mana yang segera berakhir", 9.2 menanyakan "proyek
  // mana yang tak tertanggung". Keduanya dijawab satu panggilan
  // `hitungRegisterAsuransi()` — memisahkannya berarti dua rute yang membaca
  // tabel yang sama dan menghitung hal yang sama dua kali.
  //
  // Notifikasinya tetap DUA JENIS, karena penerima dan tindakannya berbeda:
  // polis yang berakhir diperpanjang, proyek tanpa polis diasuransikan.
  app.get('/api/v1/otomasi/jalankan/polis-berakhir', {
    preHandler: [authenticate, requirePermission('notifications:milestone:check')],
  }, async (request, reply) => {
    const { createNotification } = await import('../../utils/notifications.js')
    const { resolveRecipients } = await import('../../utils/notification-routing.js')
    const { hitungRegisterAsuransi } = await import('../../lib/register-asuransi.js')
    type BarisPolis = import('../../lib/register-asuransi.js').BarisPolis
    type BarisProyek = import('../../lib/register-asuransi.js').BarisProyek

    const q = request.query as { hari?: string }
    const ambangHari = await ambilAmbang(request, 'otomasi.polis_berakhir.hari', q.hari)

    const today = new Date().toISOString().split('T')[0]
    const sudah = await pembuatDedup(request, today, [
      'polis_segera_berakhir', 'proyek_tanpa_asuransi',
    ])

    const db = request.db!
    const idProyek = await db.projectIds()
    if (idProyek.length === 0) {
      return reply.send({
        success: true, notifications_created: 0,
        checked: { proyek: 0, polis: 0, ambang_hari: ambangHari },
      })
    }

    /*
      `unsafe` dengan alasan yang SAMA PERSIS dengan rute `/api/v1/asuransi`:
      ini daftar lintas-proyek, dan `viaProject` menuntut satu proyek sebagai
      konteks. Penyaringannya lewat `projectIds()` di atas — yang sudah sadar
      tenant.

      Alasannya disalin apa adanya, bukan ditulis ulang dengan kata sendiri:
      alasan `unsafe` yang berbeda-beda untuk hal yang sama membuat audit
      berikutnya harus menilai keduanya terpisah.
    */
    const { data: proyek, error: e1 } = await db
      .unsafe('projects', 'daftar lintas-proyek; viaProject butuh satu project sebagai konteks')
      .select('id, name, start_date, end_date')
      .in('id', idProyek)

    if (e1) return reply.status(500).send({ error: e1.message })

    const { data: polis, error: e2 } = await db
      .unsafe('polis_asuransi', 'daftar lintas-proyek; disaring dengan projectIds')
      .select(`id, project_id, jenis, jenis_lain, nomor_polis, penerbit,
               nilai_pertanggungan, premi, periode_mulai, periode_selesai,
               tertanggung, status`)
      .in('project_id', idProyek)

    if (e2) return reply.status(500).send({ error: e2.message })

    const daftarProyek: BarisProyek[] = ((proyek ?? []) as Array<{
      id: string; name: string; start_date: string | null; end_date: string | null
    }>).map((p) => ({
      project_id: p.id, project_name: p.name,
      start_date: p.start_date, end_date: p.end_date,
    }))

    /*
      Fungsi yang SAMA dengan yang dipakai layar Register Asuransi — pelajaran
      3.18, diterapkan sebelum cacatnya sempat terjadi.

      Ambangnya dioper, bukan dipaku: bawaan pustaka 30 hari, tetapi tenant
      yang preminya diurus tiga bulan di muka butuh peringatan lebih awal.
    */
    const reg = hitungRegisterAsuransi(
      (polis ?? []) as BarisPolis[], daftarProyek, today, ambangHari,
    )

    let dibuat = 0

    // ── 5.7 — polis yang segera berakhir atau sudah lewat ──────────────────
    for (const p of reg.polis) {
      if (p.status !== 'segera_berakhir' && p.status !== 'kadaluarsa') continue
      if (sudah('polis_segera_berakhir', p.id)) continue

      const penerima = await resolveRecipients('polis_segera_berakhir', {
        projectId: p.project_id, companyId: request.companyId!,
      })

      const lewat = p.sisa_hari < 0
      for (const uid of penerima) {
        await createNotification({
          company_id: request.companyId!,
          user_id:    uid,
          title:      lewat ? 'Polis Asuransi Kadaluarsa' : 'Polis Asuransi Segera Berakhir',
          message:
            `${p.jenis_label} ${p.nomor_polis} (${p.penerbit}) untuk proyek `
            + `"${p.project_name}" `
            + (lewat
              ? `sudah kadaluarsa ${Math.abs(p.sisa_hari)} hari lalu.`
              : `berakhir dalam ${p.sisa_hari} hari.`),
          type:       'polis_segera_berakhir',
          // Yang sudah lewat mendesak: proyek berjalan TANPA pertanggungan
          // hari ini, bukan nanti.
          priority:   lewat ? 'urgent' : 'high',
          project_id: p.project_id,
          action_url: '/kontrak/asuransi',
          action_data: { record_id: p.id, sisa_hari: p.sisa_hari, jenis: p.jenis },
        })
        dibuat++
      }
    }

    // ── 9.2 — proyek yang tak punya satu polis pun ─────────────────────────
    //
    // Jenis notifikasi TERPISAH, bukan digabung ke atas. "Polis berakhir" dan
    // "tak ada polis sama sekali" menuntut tindakan berbeda, dan menyamakan
    // jenisnya membuat dedup harian menahan salah satu secara keliru.
    for (const pr of reg.proyek_tanpa_polis) {
      if (sudah('proyek_tanpa_asuransi', pr.project_id)) continue

      const penerima = await resolveRecipients('proyek_tanpa_asuransi', {
        projectId: pr.project_id, companyId: request.companyId!,
      })

      for (const uid of penerima) {
        await createNotification({
          company_id: request.companyId!,
          user_id:    uid,
          title:      'Proyek Tanpa Asuransi',
          message:
            `Proyek "${pr.project_name}" belum punya polis asuransi yang tercatat. `
            + 'Pekerjaan yang berjalan tanpa pertanggungan menanggung sendiri '
            + 'seluruh risikonya.',
          type:       'proyek_tanpa_asuransi',
          priority:   'high',
          project_id: pr.project_id,
          action_url: '/kontrak/asuransi',
          action_data: { record_id: pr.project_id },
        })
        dibuat++
      }
    }

    return reply.send({
      success: true, notifications_created: dibuat,
      checked: {
        proyek: daftarProyek.length,
        polis: reg.polis.length,
        segera_berakhir: reg.jumlah_segera_berakhir,
        kadaluarsa: reg.jumlah_kadaluarsa,
        // Dilaporkan supaya "nol polis kadaluarsa" tak terbaca sebagai
        // "semuanya aman" — pustaka registernya sendiri memperingatkan ini.
        proyek_tanpa_polis: reg.proyek_tanpa_polis.length,
        ambang_hari: ambangHari,
      },
    })
  })

  // ── GET /api/v1/otomasi/jalankan/transmittal-menggantung ─────────────────
  //
  // Automation 5.11 — Transmittal Auto-Log.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // KATALOG MENYEBUTNYA "AUTO-LOG". YANG DIBANGUN BUKAN ITU.
  // ══════════════════════════════════════════════════════════════════════════
  //
  // "Auto-log" menyiratkan otomasi yang MENCATAT transmittal sendiri. Ditolak,
  // dengan alasan yang sama dengan 3.5 (draft MR otomatis):
  //
  //   Transmittal menyatakan dokumen APA yang dikirim ke SIAPA untuk maksud
  //   apa. Tak satu pun dari ketiganya bisa disimpulkan otomasi — ia hanya
  //   tahu bahwa sebuah dokumen berubah, bukan bahwa seseorang bermaksud
  //   mengirimkannya.
  //
  // Dan catatan yang lahir sendiri menumpuk; yang menumpuk tak dibaca.
  //
  // Yang dibangun bagian yang benar-benar hilang: **transmittal yang sudah
  // dikirim tetapi tak pernah dikonfirmasi diterima.**
  //
  // Itulah kegagalan yang mahal pada kendali dokumen. Gambar revisi terakhir
  // yang tak pernah sampai tak memunculkan galat apa pun — pekerjaan berjalan
  // dengan gambar lama, dan selisihnya baru terlihat di lapangan. Status
  // `dikirim` yang menggantung adalah satu-satunya jejak yang tersisa, dan tak
  // ada yang memeriksanya.
  //
  // ── Status diukur, bukan ditebak
  //
  // `pg_constraint` menyatakan sendiri bentuknya:
  //
  //     status IN ('draft', 'dikirim', 'diterima', 'ditolak')
  //     status <> 'diterima' OR diterima_pada IS NOT NULL
  //
  // Jadi `dikirim` + `diterima_pada IS NULL` adalah keadaan yang tak ambigu:
  // basis sendiri menjamin `diterima` selalu punya tanggalnya.
  app.get('/api/v1/otomasi/jalankan/transmittal-menggantung', {
    preHandler: [authenticate, requirePermission('notifications:milestone:check')],
  }, async (request, reply) => {
    const { createNotification } = await import('../../utils/notifications.js')
    const { resolveRecipients } = await import('../../utils/notification-routing.js')

    const q = request.query as { hari?: string }
    const ambangHari = await ambilAmbang(request, 'otomasi.transmittal_menggantung.hari', q.hari)

    const today = new Date().toISOString().split('T')[0]
    const sudah = await pembuatDedup(request, today, ['transmittal_menggantung'])
    const batas = new Date(Date.now() - ambangHari * HARI_MS).toISOString()

    /*
      `transmittal` kategori B (punya `company_id` sendiri — diukur ke
      `tenant-map.generated.ts`), jadi `.from()` sudah menyaringnya.

      Yang TIDAK dilakukan: `.in('project_id', …)` dengan daftar proyek. Itu
      pola yang menaikkan ratchet tenancy pada 2.10 dan sama sekali tak perlu
      di sini.
    */
    const { data: gantung, error } = await request.db!
      .from('transmittal')
      .select(`
        id, nomor, perihal, tujuan_nama, tujuan_organisasi, maksud,
        dikirim_pada, project_id,
        proyek:projects!transmittal_project_id_fkey(id, name)
      `)
      .eq('status', 'dikirim')
      .is('diterima_pada', null)
      .lt('dikirim_pada', batas)

    // Query yang gagal TIDAK boleh terbaca sebagai "tak ada yang menggantung".
    if (error) return reply.status(500).send({ error: error.message })

    let dibuat = 0
    for (const t of gantung ?? []) {
      if (sudah('transmittal_menggantung', t.id)) continue

      /*
        Join PostgREST memulangkan ARRAY, bukan objek — tipe menangkapnya
        sebelum ia jadi `undefined.name` saat dijalankan.

        Rute lain di berkas ini memakai `as any` untuk hal yang sama; di sini
        dibentuk eksplisit supaya bentuk sesungguhnya terbaca dari kode.
      */
      const projArr = t.proyek as unknown as Array<{ id: string; name: string }> | null
      const proj = Array.isArray(projArr) ? (projArr[0] ?? null) : projArr
      const hari = Math.round(
        (Date.now() - new Date(t.dikirim_pada as string).getTime()) / HARI_MS,
      )

      const penerima = await resolveRecipients('transmittal_menggantung', {
        projectId: proj?.id ?? (t.project_id as string),
        companyId: request.companyId!,
      })

      /*
        Tujuan disebut dengan organisasinya bila ada.

        "Belum dikonfirmasi Pak Budi" menuntut penerimanya mengingat Budi yang
        mana; "Belum dikonfirmasi Pak Budi (PT Konsultan X)" tidak. Nama tanpa
        organisasi adalah bentuk paling umum pesan yang harus ditanyakan
        ulang, dan pesan yang harus ditanyakan ulang lebih lambat daripada tak
        dikirim.
      */
      const tujuan = t.tujuan_organisasi
        ? `${t.tujuan_nama} (${t.tujuan_organisasi})`
        : String(t.tujuan_nama)

      for (const uid of penerima) {
        await createNotification({
          company_id: request.companyId!,
          user_id:    uid,
          title:      'Transmittal Belum Dikonfirmasi',
          message:
            `Transmittal ${t.nomor} "${t.perihal}" ke ${tujuan} sudah ${hari} `
            + 'hari terkirim dan belum dikonfirmasi diterima.'
            // Maksud `untuk_persetujuan` menahan pekerjaan; yang lain tidak.
            + (t.maksud === 'untuk_persetujuan'
              ? ' Dokumen ini menunggu persetujuan.'
              : ''),
          type:       'transmittal_menggantung',
          // Yang menunggu persetujuan mendesak: ada pekerjaan yang tertahan
          // di ujung sana, bukan sekadar catatan yang belum lengkap.
          priority:   t.maksud === 'untuk_persetujuan' ? 'urgent' : 'high',
          project_id: proj?.id ?? (t.project_id as string),
          action_url: '/dokumen/kendali',
          action_data: { record_id: t.id, hari_menggantung: hari, maksud: t.maksud },
        })
        dibuat++
      }
    }

    return reply.send({
      success: true, notifications_created: dibuat,
      checked: {
        transmittal_menggantung: (gantung ?? []).length,
        ambang_hari: ambangHari,
      },
    })
  })

  // ── GET /api/v1/otomasi/jalankan/sertifikat-berakhir ─────────────────────
  //
  // Automation 6.9 — HR Document Reminder.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // MEMANGGIL `nilaiSertifikat()`, TIDAK MENGHITUNG SENDIRI
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Pelajaran 3.18, dan di sini taruhannya lebih halus daripada sekadar dua
  // angka yang berselisih: `berlaku_sampai` yang NULL punya DUA arti berbeda
  // akibat, dan yang membedakannya kolom `berjangka`.
  //
  //   berjangka = false                     → berlaku selamanya (ijazah)
  //   berjangka = true, berlaku_sampai NULL  → KEDALUWARSA menurut pustaka —
  //                                            tetapi keadaan itu DITOLAK basis,
  //                                            lihat catatan di bawah
  //
  // Diukur: 3 dari 8 baris ber-`berlaku_sampai` NULL, ketiganya `berjangka =
  // false` (dua ijazah S1, satu pelatihan). Otomasi yang memperlakukan NULL
  // sebagai "sudah lewat" akan menegur orang soal ijazahnya.
  //
  // `lib/kompetensi-sdm.ts` sudah memutuskan ini dan mengunci keputusannya di
  // 33 test. Menyalin logikanya berarti membuat cabang kedua yang akan
  // menyimpang.
  //
  // ⚠ Satu cabang pustaka itu TAK BISA DICAPAI lewat basis ini:
  //
  //     CHECK (NOT berjangka OR berlaku_sampai IS NOT NULL)
  //     -- sertifikat_berjangka_bertanggal
  //
  // `berjangka = true` tanpa tanggal ditolak sejak insert. Pustakanya tetap
  // benar mempertahankan cabang itu — ia fungsi murni yang bisa dipanggil dari
  // mana saja — tetapi otomasi ini tak mengklaim menjaganya. Ketahuan saat test
  // mencoba menyisipkan barisnya dan basis menolak.
  //
  // ── Batas BAWAH, dan kenapa ia ada
  //
  // Diukur: satu sertifikat kedaluwarsa sejak 2025-05-31 — **empat belas
  // bulan**. Dedup harian menahan pesan kembar DALAM satu hari, bukan lintas
  // hari, jadi tanpa batas bawah otomasi ini menegur dokumen yang sama tiap
  // pagi selamanya. Yang ditegur tiap hari berhenti dibaca.
  app.get('/api/v1/otomasi/jalankan/sertifikat-berakhir', {
    preHandler: [authenticate, requirePermission('notifications:milestone:check')],
  }, async (request, reply) => {
    const { createNotification } = await import('../../utils/notifications.js')
    const { resolveRecipients } = await import('../../utils/notification-routing.js')
    const { nilaiSertifikat } = await import('../../lib/kompetensi-sdm.js')
    type Sertifikat = import('../../lib/kompetensi-sdm.js').Sertifikat

    const q = request.query as { hari?: string; lewat?: string }
    const ambangHari = await ambilAmbang(request, 'otomasi.sertifikat_berakhir.hari', q.hari)
    const batasLewat = await ambilAmbang(request, 'otomasi.sertifikat_lewat.maks_hari', q.lewat)

    const today = new Date().toISOString().split('T')[0]
    const sudah = await pembuatDedup(request, today, ['sertifikat_berakhir'])

    /*
      `pegawai` kategori B — `.from()` sudah menyaringnya ke tenant.

      Namanya DI-JOIN dari `users`, bukan dibaca dari `pegawai`: tabel itu
      TIDAK punya kolom nama sama sekali (diukur — `nomor_induk`, `jabatan`,
      `departemen`, gaji, BPJS, tak ada `nama`).

      Bentuk pertama saya menulis `.select('id, nama')` dan otomasinya balas
      500 "column pegawai.nama does not exist" pada jalan pertama lewat
      penjadwal. Keenam kalinya dalam sesi ini saya menebak nama kolom;
      typecheck tak bisa menangkapnya karena nama kolom PostgREST hanyalah
      string.

      `nomor_induk` disertakan sebagai cadangan — kelima pegawai punya
      `user_id` hari ini, tetapi kolomnya nullable dan pegawai tanpa akun
      adalah keadaan yang wajar.
    */
    const { data: pegawai, error: ePeg } = await request.db!
      .from('pegawai')
      .select('id, nomor_induk, user_id, akun:users!pegawai_user_id_fkey(name)')

    if (ePeg) return reply.status(500).send({ error: ePeg.message })

    const idPegawai = (pegawai ?? []).map((p) => p.id as string)
    if (idPegawai.length === 0) {
      return reply.send({
        success: true, notifications_created: 0,
        checked: { pegawai: 0, sertifikat: 0, ambang_hari: ambangHari },
      })
    }

    /*
      `unsafe` dengan alasan yang SAMA PERSIS dengan `polis-berakhir`.

      `sertifikat_pegawai` kategori C lewat `pegawai_id` — dan `viaProject()`
      menuntut SATU induk sebagai konteks, sementara otomasi harian menyapu
      seluruh pegawai. Penyaringnya `idPegawai` di atas, yang barisnya sudah
      lewat RLS.

      Alasannya disalin apa adanya, bukan ditulis ulang dengan kata sendiri:
      alasan `unsafe` yang berbeda-beda untuk hal yang sama membuat audit
      berikutnya harus menilai keduanya terpisah.
    */
    const { data: sertifikat, error: eSer } = await request.db!
      .unsafe('sertifikat_pegawai',
        'daftar lintas-pegawai; viaProject butuh satu pegawai sebagai konteks')
      .select(`id, pegawai_id, jenis, nama, nomor, penerbit, klasifikasi,
               kualifikasi, tanggal_terbit, berlaku_sampai, berjangka`)
      .in('pegawai_id', idPegawai)

    if (eSer) return reply.status(500).send({ error: eSer.message })

    /*
      Join PostgREST memulangkan ARRAY, bukan objek — pelajaran yang sama
      dengan `transmittal-menggantung`. Tanpa perataan ini, namanya jadi
      `undefined` dan pesannya berbunyi "atas nama Pegawai" untuk semua orang.
    */
    const namaPegawai = new Map(
      (pegawai ?? []).map((p) => {
        const akun = p.akun as unknown as Array<{ name?: string }> | { name?: string } | null
        const nama = Array.isArray(akun) ? akun[0]?.name : akun?.name
        return [p.id as string, nama || (p.nomor_induk as string) || 'Pegawai']
      }),
    )

    let dibuat = 0
    let perluTindakan = 0
    let dilewatiTerlaluLama = 0

    for (const row of sertifikat ?? []) {
      const s = row as unknown as Sertifikat & { pegawai_id: string }
      const dinilai = nilaiSertifikat(s, today, ambangHari)

      if (dinilai.status === 'berlaku') continue

      /*
        Yang kedaluwarsa TERLALU lama dilewati — dan dihitung, tidak ditelan.

        `sisa_hari` null pada `berjangka = true` berarti tanggalnya memang tak
        diisi; itu justru yang paling perlu diberitahukan, jadi ia TIDAK masuk
        saringan ini.
      */
      if (dinilai.sisa_hari !== null && dinilai.sisa_hari < -batasLewat) {
        dilewatiTerlaluLama++
        continue
      }

      if (sudah('sertifikat_berakhir', s.id)) continue
      perluTindakan++

      const penerima = await resolveRecipients('sertifikat_berakhir', {
        projectId: null, companyId: request.companyId!,
      })

      const orang = namaPegawai.get(s.pegawai_id) ?? 'Pegawai'
      const lewat = dinilai.status === 'kedaluwarsa'
      const kapan = dinilai.sisa_hari === null
        ? 'tanpa tanggal berlaku yang tercatat'
        : lewat
          ? `kedaluwarsa ${Math.abs(dinilai.sisa_hari)} hari lalu`
          : `berakhir dalam ${dinilai.sisa_hari} hari`

      for (const uid of penerima) {
        await createNotification({
          company_id: request.companyId!,
          user_id:    uid,
          title:      lewat ? 'Sertifikat Pegawai Kedaluwarsa' : 'Sertifikat Pegawai Segera Berakhir',
          message:    `${s.nama} atas nama ${orang} ${kapan}.`,
          type:       'sertifikat_berakhir',
          priority:   lewat ? 'urgent' : 'high',
          /*
            TANPA `project_id`, dan itu disengaja — sertifikat melekat pada
            ORANG, bukan proyek.

            Tipenya `string | undefined`, jadi `null` ditolak COMPILE. Bukan
            formalitas: kolomnya nullable di basis, tetapi memaksakan sebuah
            proyek di sini akan membuat notifikasinya tersaring keluar dari
            inbox orang yang justru mengurusnya, dan `resolveRecipients` di
            atas sudah dipanggil dengan `projectId: null` supaya targetnya
            berbasis izin lintas-proyek.
          */
          action_url: '/sdm/kompetensi',
          action_data: { record_id: s.id, sisa_hari: dinilai.sisa_hari, status: dinilai.status },
        })
        dibuat++
      }
    }

    return reply.send({
      success: true, notifications_created: dibuat,
      checked: {
        pegawai: idPegawai.length,
        sertifikat: (sertifikat ?? []).length,
        perlu_tindakan: perluTindakan,
        // Dilaporkan EKSPLISIT: tanpa angka ini, "0 notifikasi" tak bisa
        // dibedakan dari "semua sertifikat sehat".
        dilewati_terlalu_lama: dilewatiTerlaluLama,
        ambang_hari: ambangHari,
        batas_lewat_hari: batasLewat,
      },
    })
  })

  // ── GET /api/v1/otomasi/jalankan/k3-kepatuhan ────────────────────────────
  //
  // Automation 9.8 — HSE Compliance.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // KATALOG MEMINTA "SCORE". YANG DIBANGUN BUKAN ITU.
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Katalog menamainya *HSE Compliance Score*. Ditolak, dengan tiga alasan
  // yang diukur — bukan selera:
  //
  //   1. `inspeksi_k3` TAK PUNYA kolom rencana/frekuensi apa pun. Komponen
  //      "inspeksi terlewat" dalam sebuah skor akan berdasar ambang karangan.
  //   2. `statusInduksi().persen_berlaku` sengaja `null` bila nol pekerja
  //      aktif (`k3-lapangan.ts`). Skor gabungan memaksa `null` jadi angka —
  //      persis kesalahan yang pustaka itu dibangun untuk mencegah.
  //   3. Datanya 7 temuan · 3 inspeksi · 25 induksi. Skor tunggal dari tujuh
  //      baris bergerak belasan persen per satu penutupan: bising, dan bising
  //      yang terlihat presisi lebih menyesatkan daripada tak ada angka.
  //
  // Yang dikirim: TIGA jenis peringatan yang masing-masing bisa
  // ditindaklanjuti, dan masing-masing punya `type` sendiri — bukan karena
  // rapi, melainkan karena dedup harian bekerja per (jenis, record). Satu
  // jenis untuk ketiganya membuat dua di antaranya tertahan keliru pada hari
  // yang sama. Pelajaran 9.2, diterapkan sebelum cacatnya terjadi.
  app.get('/api/v1/otomasi/jalankan/k3-kepatuhan', {
    preHandler: [authenticate, requirePermission('notifications:milestone:check')],
  }, async (request, reply) => {
    const { createNotification } = await import('../../utils/notifications.js')
    const { resolveRecipients } = await import('../../utils/notification-routing.js')
    const { rekapTemuan, statusInduksi } = await import('../../lib/k3-lapangan.js')
    type TemuanK3 = import('../../lib/k3-lapangan.js').TemuanK3
    type Induksi = import('../../lib/k3-lapangan.js').Induksi

    const today = new Date().toISOString().split('T')[0]
    const sudah = await pembuatDedup(request, today, [
      'k3_temuan_berat_menggantung', 'k3_temuan_berulang', 'k3_induksi_kedaluwarsa',
    ])

    const { data: proyek, error } = await request.db!
      .from('projects')
      .select('id, name')
      .eq('status', 'active')

    if (error) return reply.status(500).send({ error: error.message })

    let dibuat = 0
    let diperiksa = 0
    let takTerhitung = 0

    for (const p of proyek ?? []) {
      const pid = p.id as string

      // ── Temuan: inspeksi dulu, baru temuannya ───────────────────────────
      //
      // `temuan_k3` kategori C lewat `inspeksi_id` — ia TAK PUNYA
      // `project_id`. Pola ini disalin dari `k3-lapangan.ts` yang sudah
      // memakainya, termasuk alasan `unsafe`-nya.
      const { data: inspeksi, error: eIns } = await request.db!
        .viaProject('inspeksi_k3', pid)
        .select('id, tanggal')

      if (eIns) {
        takTerhitung++
        request.log.warn({ err: eIns, projectId: pid }, 'k3-kepatuhan: inspeksi tak terbaca')
        continue
      }

      const petaTanggal = new Map(
        (inspeksi ?? []).map((x) => [x.id as string, x.tanggal as string]),
      )
      const idInspeksi = [...petaTanggal.keys()]

      let temuan: TemuanK3[] = []
      if (idInspeksi.length > 0) {
        const { data: t, error: eT } = await request.db!
          .unsafe('temuan_k3',
            'disaring ke id inspeksi yang barisnya sudah lewat RLS pada query di atas')
          .select('id, inspeksi_id, uraian, kategori, tingkat, status, tenggat')
          .in('inspeksi_id', idInspeksi)

        if (eT) {
          takTerhitung++
          request.log.warn({ err: eT, projectId: pid }, 'k3-kepatuhan: temuan tak terbaca')
          continue
        }

        /*
          `tanggal_inspeksi` BUKAN kolom `temuan_k3` — ia di-join dari
          `inspeksi_k3.tanggal`, dan `rekapTemuan` memakainya untuk mengurutkan
          pengulangan. Merakitnya di sini, bukan menambah kolom ke basis.
        */
        temuan = (t ?? []).map((x) => ({
          ...(x as unknown as TemuanK3),
          tanggal_inspeksi: petaTanggal.get(x.inspeksi_id as string) ?? today,
        }))
      }

      const rekap = rekapTemuan(temuan, today)

      const penerima = await resolveRecipients('k3_temuan_berat_menggantung', {
        projectId: pid, companyId: request.companyId!,
      })

      // ── A. Temuan BERAT yang lewat tenggat ──────────────────────────────
      //
      // Yang paling kuat dari ketiganya: `tingkat` dijamin 1–3 oleh CHECK,
      // `tenggat` terisi, dan `penanggung_id` menunjuk orangnya. Yang berat
      // dan lewat tenggat adalah keadaan yang tak bisa dibaca sebagai apa pun
      // selain "harus ditangani hari ini".
      if (rekap.berat_terbuka > 0 && rekap.lewat_tenggat > 0
          && !sudah('k3_temuan_berat_menggantung', pid)) {
        for (const uid of penerima) {
          await createNotification({
            company_id: request.companyId!,
            user_id:    uid,
            title:      'Temuan K3 Berat Belum Ditutup',
            message:
              `Proyek "${p.name}": ${rekap.berat_terbuka} temuan berat masih terbuka, `
              + `${rekap.lewat_tenggat} sudah lewat tenggat.`,
            type:       'k3_temuan_berat_menggantung',
            priority:   'urgent',
            project_id: pid,
            action_url: '/k3',
            action_data: {
              record_id: pid,
              berat_terbuka: rekap.berat_terbuka,
              lewat_tenggat: rekap.lewat_tenggat,
            },
          })
          dibuat++
        }
      }

      // ── B. Temuan BERULANG ──────────────────────────────────────────────
      //
      // Yang tak bisa dilihat orang dari layar mana pun: kategori yang sama
      // muncul lagi sesudah ditutup berarti perbaikannya tak menyentuh
      // sebabnya. Pustakanya sudah menghitungnya.
      if (rekap.berulang.length > 0 && !sudah('k3_temuan_berulang', pid)) {
        const daftar = rekap.berulang.map((b) => b.kategori).slice(0, 3).join(', ')
        for (const uid of penerima) {
          await createNotification({
            company_id: request.companyId!,
            user_id:    uid,
            title:      'Temuan K3 Berulang',
            message:
              `Proyek "${p.name}": ${rekap.berulang.length} kategori temuan berulang `
              + `(${daftar}). Perbaikan sebelumnya tampaknya tak menyentuh sebabnya.`,
            type:       'k3_temuan_berulang',
            priority:   'high',
            project_id: pid,
            action_url: '/k3',
            action_data: { record_id: pid, kategori: rekap.berulang.map((b) => b.kategori) },
          })
          dibuat++
        }
      }

      // ── C. Induksi kedaluwarsa ──────────────────────────────────────────
      //
      // Rantai pekerja aktif DISALIN dari `k3-lapangan.ts`, bukan dikarang:
      // `mandor_assignments.mandor_id` → `workers.mandor_id` + `is_active`.
      // Versi pertama rute itu mengambil SELURUH pekerja perusahaan dan
      // menampilkan "3 dari 60 · 5%" untuk proyek yang punya 30 — angka yang
      // menuduh proyek baik-baik saja.
      /*
        Ketiga query di bawah MEMERIKSA `error`, dan itu bukan formalitas.

        Bentuk pertama saya membiarkan ketiganya tanpa pemeriksaan, dan
        `audit-kegagalan-senyap` menangkapnya. Akibat kalau lolos:

          penugasan gagal  → nol mandor  → nol pekerja → `persen_berlaku` null
                             → proyeknya DILEWATI, terbaca sebagai "belum ada
                               pekerja terdaftar"
          pekerja gagal    → sama
          induksi gagal    → nol induksi → SELURUH pekerja terhitung "belum
                               diinduksi" → peringatan yang menuduh proyek
                               yang sebenarnya patuh

        Dua arah kegagalan yang berlawanan, keduanya sunyi, dan keduanya
        merusak kepercayaan pada pesannya.

        Proyeknya dilewati dan DIHITUNG, bukan menggagalkan seluruh jalan:
        satu proyek bermasalah tak boleh menghentikan pemeriksaan sembilan
        lainnya.
      */
      const { data: tugas, error: eTugas } = await request.db!
        .viaProject('mandor_assignments', pid)
        .select('mandor_id')

      if (eTugas) {
        takTerhitung++
        request.log.warn({ err: eTugas, projectId: pid }, 'k3-kepatuhan: penugasan tak terbaca')
        continue
      }

      const idMandor = [...new Set(
        (tugas ?? []).map((t) => t.mandor_id as string | null).filter(Boolean))] as string[]

      let idPekerja: string[] = []
      if (idMandor.length > 0) {
        const { data: w, error: eW } = await request.db!
          .from('workers')
          .select('id')
          .eq('is_active', true)
          .in('mandor_id', idMandor)

        if (eW) {
          takTerhitung++
          request.log.warn({ err: eW, projectId: pid }, 'k3-kepatuhan: pekerja tak terbaca')
          continue
        }
        idPekerja = (w ?? []).map((x) => x.id as string)
      }

      const { data: induksi, error: eInd } = await request.db!
        .viaProject('induksi_k3', pid)
        .select('id, worker_id, peserta_nama, tanggal, berlaku_sampai')

      if (eInd) {
        takTerhitung++
        request.log.warn({ err: eInd, projectId: pid }, 'k3-kepatuhan: induksi tak terbaca')
        continue
      }

      const st = statusInduksi((induksi ?? []) as unknown as Induksi[], idPekerja, today)

      /*
        `persen_berlaku === null` berarti NOL pekerja aktif — bukan kepatuhan
        buruk melainkan ketiadaan data. Pustaka sengaja memulangkan `null`
        alih-alih 0 untuk membedakannya, dan menegur berdasarkan itu akan
        menuduh proyek yang belum punya pekerja terdaftar.
      */
      if (st.persen_berlaku !== null && (st.kedaluwarsa > 0 || st.belum > 0)
          && !sudah('k3_induksi_kedaluwarsa', pid)) {
        for (const uid of penerima) {
          await createNotification({
            company_id: request.companyId!,
            user_id:    uid,
            title:      'Induksi K3 Belum Lengkap',
            message:
              `Proyek "${p.name}": ${st.kedaluwarsa} induksi kedaluwarsa dan `
              + `${st.belum} pekerja belum diinduksi, dari ${st.total_pekerja} pekerja aktif `
              + `(${st.persen_berlaku}% masih berlaku).`,
            type:       'k3_induksi_kedaluwarsa',
            priority:   st.belum > 0 ? 'urgent' : 'high',
            project_id: pid,
            action_url: '/k3',
            action_data: {
              record_id: pid,
              kedaluwarsa: st.kedaluwarsa,
              belum: st.belum,
              persen_berlaku: st.persen_berlaku,
            },
          })
          dibuat++
        }
      }

      /*
        DIHITUNG DI SINI, bukan di tengah — dan itu hasil koreksi.

        Bentuk pertama menaikkan `diperiksa` tepat sesudah rekap temuan, jauh
        SEBELUM tiga query induksi. Kalau salah satunya gagal, proyeknya
        terhitung di DUA ember sekaligus (`diperiksa` dan `tak_terhitung`), dan
        penjumlahannya melampaui jumlah proyek aktif.

        Test "tiap proyek aktif masuk tepat satu ember" hanya menangkapnya saat
        kegagalan benar-benar terjadi — jadi ia bisa hijau berbulan-bulan
        sambil cacatnya menunggu. Menaruh penghitungnya di akhir membuat
        invariannya benar secara struktur, bukan secara kebetulan.
      */
      diperiksa++
    }

    return reply.send({
      success: true, notifications_created: dibuat,
      checked: {
        proyek_aktif: (proyek ?? []).length,
        diperiksa,
        // Dilaporkan EKSPLISIT: "0 notifikasi" tak boleh terbaca sebagai
        // "semua patuh" saat sebenarnya datanya tak terbaca.
        tak_terhitung: takTerhitung,
      },
    })
  })

  // ── GET /api/v1/otomasi/jalankan/kepatuhan-dokumen ───────────────────────
  //
  // Automation 9.1 — Regulatory Compliance.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // LINGKUPNYA SENGAJA DIPERSEMPIT — DUA TABEL DIKELUARKAN
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Enam tabel di repo ini punya kolom `berlaku_sampai`. Hanya DUA yang masuk
  // otomasi ini, dan yang dikeluarkan punya alasan terukur:
  //
  //   MASUK  `dokumen_kepatuhan`  9 baris  → 1 lewat, 1 ≤60 hari, 1 belum verif
  //   MASUK  `izin_proyek`        5 baris  → 1 lewat 283 hari, `menghalangi_mulai`
  //
  //   KELUAR `izin_kerja`         4 baris, dan KEEMPATNYA sudah kedaluwarsa
  //          (WP-2026-001..004, berakhir 6–9 Agustus). Itu data seed basi,
  //          bukan sinyal — memasukkannya berarti mengirim empat peringatan
  //          usang tiap hari. Ia sudah punya layarnya sendiri, dan
  //          `disetujuiTapiLewat` sudah tampil di sana.
  //
  //   KELUAR `dokumen_prakualifikasi` — 7 dari 11 baris ber-`berlaku_sampai`
  //          NULL. Tabelnya belum terisi tanggal secara sistematis; sinyalnya
  //          belum ada, dan otomasi yang membaca tabel setengah-terisi
  //          menghasilkan peringatan yang menuduh secara acak.
  //
  //   KELUAR `sertifikat_pegawai` dan `polis_asuransi` — sudah dipegang 6.9
  //          dan 5.7/9.2. Dua otomasi atas satu tabel berarti dua pesan untuk
  //          satu kejadian.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // DUA JENIS PESAN, KARENA TINDAKANNYA BERBEDA
  // ══════════════════════════════════════════════════════════════════════════
  //
  //   kepatuhan_dokumen  → dokumen PIHAK (supplier/subkon) diperpanjang
  //   izin_proyek_habis  → izin PROYEK; pekerjaannya berhenti kalau
  //                        `menghalangi_mulai`
  //
  // Dedup harian bekerja per (jenis, record) — satu jenis untuk keduanya
  // membuat salah satunya tertahan keliru di hari yang sama. Pelajaran 9.2.
  app.get('/api/v1/otomasi/jalankan/kepatuhan-dokumen', {
    preHandler: [authenticate, requirePermission('notifications:milestone:check')],
  }, async (request, reply) => {
    const { createNotification } = await import('../../utils/notifications.js')
    const { resolveRecipients } = await import('../../utils/notification-routing.js')
    const { nilaiKepatuhan, labelJenis } = await import('../../lib/kepatuhan-k3.js')
    const { nilaiIzin } = await import('../../lib/risiko-proyek.js')
    type DokumenKepatuhan = import('../../lib/kepatuhan-k3.js').DokumenKepatuhan
    type IzinProyek = import('../../lib/risiko-proyek.js').IzinProyek

    const q = request.query as { hari?: string; lewat?: string }
    const ambangHari = await ambilAmbang(request, 'otomasi.kepatuhan_dokumen.hari', q.hari)
    const batasLewat = await ambilAmbang(request, 'otomasi.kepatuhan_lewat.maks_hari', q.lewat)

    const today = new Date().toISOString().split('T')[0]
    const sudah = await pembuatDedup(request, today, ['kepatuhan_dokumen', 'izin_proyek_habis'])

    let dibuat = 0
    let dilewatiTerlaluLama = 0

    // ── (a) Dokumen kepatuhan pihak ────────────────────────────────────────
    //
    // Kategori B — `.from()` sudah menyaringnya ke tenant.
    const { data: dok, error: eDok } = await request.db!
      .from('dokumen_kepatuhan')
      .select(`id, jenis, nomor, pihak_nama, supplier_id, berlaku_dari,
               berlaku_sampai, terverifikasi, nilai_pertanggungan`)

    if (eDok) return reply.status(500).send({ error: eDok.message })

    /*
      `nilaiKepatuhan` dipanggil SEKALI atas seluruh daftar, bukan per baris —
      itu bentuk yang dipakai layar Kepatuhan, dan ia menghitung agregat
      (`hijauTapiMati`, `belumDiverifikasi`) yang tak bisa disimpulkan dari satu
      baris.
    */
    const ringkas = nilaiKepatuhan((dok ?? []) as unknown as DokumenKepatuhan[], today)

    const penerimaDok = await resolveRecipients('kepatuhan_dokumen', {
      projectId: null, companyId: request.companyId!,
    })

    for (const d of ringkas.dokumen) {
      /*
        Hanya DUA status yang ditegur.

        `tanpa_masa` TIDAK — 2 dari 9 dokumen (`npwp`, `bpjs_ketenagakerjaan`)
        memang tak punya masa berlaku, dan menagihnya sebagai "kedaluwarsa"
        adalah bug yang menuduh dokumen yang benar.

        `belum_diverifikasi` juga tidak: itu pekerjaan administrasi internal,
        bukan kepatuhan yang habis, dan mencampurnya membuat pesan kepatuhan
        terasa seperti daftar tugas.
      */
      if (d.status !== 'kedaluwarsa' && d.status !== 'segera_habis') continue

      /*
        Batas bawah — terukur perlunya.

        Satu dokumen sudah lewat 106 hari, dan dedup harian menahan kembar
        DALAM satu hari, bukan lintas hari. Tanpa batas ini ia ditagih tiap
        minggu selamanya, dan yang ditagih terus berhenti dibaca.
      */
      if (d.sisaHari !== null && d.sisaHari < -batasLewat) {
        dilewatiTerlaluLama++
        continue
      }

      if (sudah('kepatuhan_dokumen', d.id)) continue

      const pihak = d.pihak_nama || 'pihak tak bernama'
      const lewat = d.status === 'kedaluwarsa'

      /*
        `hijauTapiMati` disebut EKSPLISIT dalam pesannya, dan itu sinyal
        terkuat di seluruh himpunan ini: dokumen yang ditandai TERVERIFIKASI
        tetapi tanggalnya sudah lewat. Terukur ada satu — asuransi CAR yang
        lewat 106 hari sambil bercentang hijau.

        Orang yang melihat centang hijau berhenti memeriksanya. Itu sebabnya
        keadaan ini lebih berbahaya daripada dokumen yang jelas-jelas merah.
      */
      const catatanHijau = d.hijauTapiMati
        ? ' Dokumen ini masih bercentang terverifikasi — itu sebabnya tak ada yang menyadarinya.'
        : ''

      for (const uid of penerimaDok) {
        await createNotification({
          company_id: request.companyId!,
          user_id:    uid,
          title:      lewat ? 'Dokumen Kepatuhan Kedaluwarsa' : 'Dokumen Kepatuhan Segera Habis',
          message:
            `${labelJenis(d.jenis)} milik ${pihak} `
            + (lewat
              ? `sudah kedaluwarsa ${Math.abs(d.sisaHari ?? 0)} hari lalu.`
              : `berakhir dalam ${d.sisaHari} hari.`)
            + catatanHijau,
          type:       'kepatuhan_dokumen',
          priority:   lewat ? 'urgent' : 'high',
          /*
            TANPA `project_id` — dokumen kepatuhan melekat pada PIHAK, bukan
            proyek. Dan `record_id` memakai id dokumennya, bukan `supplier_id`:
            diukur, `supplier_id` NULL pada SELURUH sembilan baris, jadi
            dedup berbasis supplier akan menyatukan dokumen yang tak
            berhubungan.
          */
          action_url: '/kepatuhan?bagian=dokumen',
          action_data: {
            record_id: d.id,
            sisa_hari: d.sisaHari,
            status: d.status,
            hijau_tapi_mati: d.hijauTapiMati,
          },
        })
        dibuat++
      }
    }

    // ── (b) Izin proyek ────────────────────────────────────────────────────
    const { data: proyek, error: eProy } = await request.db!
      .from('projects')
      .select('id, name, end_date')
      .eq('status', 'active')

    if (eProy) return reply.status(500).send({ error: eProy.message })

    let izinDiperiksa = 0
    for (const p of proyek ?? []) {
      const pid = p.id as string

      const { data: izin, error: eIzin } = await request.db!
        .viaProject('izin_proyek', pid)
        .select('id, jenis, nomor, status, berlaku_dari, berlaku_sampai, menghalangi_mulai')

      if (eIzin) {
        request.log.warn({ err: eIzin, projectId: pid }, 'kepatuhan: izin proyek tak terbaca')
        continue
      }

      const penerimaIzin = await resolveRecipients('izin_proyek_habis', {
        projectId: pid, companyId: request.companyId!,
      })

      for (const row of izin ?? []) {
        const dinilai = nilaiIzin(
          row as unknown as IzinProyek,
          today,
          (p.end_date as string | null) ?? null,
          ambangHari,
        )
        izinDiperiksa++

        if (dinilai.masa !== 'kedaluwarsa' && dinilai.masa !== 'akan_habis') continue

        if (dinilai.sisa_hari !== null && dinilai.sisa_hari < -batasLewat) {
          dilewatiTerlaluLama++
          continue
        }

        if (sudah('izin_proyek_habis', dinilai.id)) continue

        const lewat = dinilai.masa === 'kedaluwarsa'

        for (const uid of penerimaIzin) {
          await createNotification({
            company_id: request.companyId!,
            user_id:    uid,
            title:      dinilai.memblokir
              ? 'Izin Proyek Habis — Pekerjaan Terhalang'
              : 'Izin Proyek Segera Habis',
            message:
              `Proyek "${p.name}": izin ${dinilai.jenis} `
              + (lewat
                ? `sudah kedaluwarsa ${Math.abs(dinilai.sisa_hari ?? 0)} hari lalu.`
                : `berakhir dalam ${dinilai.sisa_hari} hari.`)
              // `memblokir` dibawa apa adanya dari pustaka, bukan disimpulkan
              // di sini: ia menggabungkan `menghalangi_mulai` dengan keadaan
              // masa berlakunya, dan menyalin aturannya berarti dua sumber.
              + (dinilai.memblokir
                ? ' Pekerjaan tak boleh berjalan tanpa izin ini.'
                : ''),
            type:       'izin_proyek_habis',
            priority:   dinilai.memblokir ? 'urgent' : 'high',
            project_id: pid,
            action_url: '/risiko/izin',
            action_data: {
              record_id: dinilai.id,
              sisa_hari: dinilai.sisa_hari,
              masa: dinilai.masa,
              memblokir: dinilai.memblokir,
            },
          })
          dibuat++
        }
      }
    }

    return reply.send({
      success: true, notifications_created: dibuat,
      checked: {
        dokumen: ringkas.total,
        dokumen_kedaluwarsa: ringkas.kedaluwarsa,
        dokumen_segera_habis: ringkas.segeraHabis,
        // Dilaporkan meski tak ditegur: angka ini yang membuat "0 notifikasi"
        // bisa dibedakan dari "semua dokumen sehat".
        dokumen_belum_diverifikasi: ringkas.belumDiverifikasi,
        dokumen_hijau_tapi_mati: ringkas.hijauTapiMati,
        izin_diperiksa: izinDiperiksa,
        dilewati_terlalu_lama: dilewatiTerlaluLama,
        ambang_hari: ambangHari,
      },
    })
  })

  // ── GET /api/v1/otomasi/jalankan/serapan-anggaran ────────────────────────
  //
  // Automation 2.9 — Budget vs Actual.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // SAYA SEMPAT MEMBATALKAN INI. PEMBATALANNYA SALAH.
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Alasan pembatalan (2026-08-16): `project_expenses` NOL baris, sementara
  // Rp 545 juta ada di `kasbons` — jadi otomasi akan melaporkan 0% untuk
  // proyek yang sebenarnya 45%.
  //
  // Diukur ulang sesudah founder bertanya "emang gabisa banget dibangun?":
  //
  //     trg_kasbon_approved_create_expense
  //       AFTER UPDATE ... IF NEW.status='approved' AND OLD.status<>'approved'
  //       → INSERT INTO project_expenses
  //
  // Kasbon yang disetujui MEMANG membuat baris pengeluaran. `project_expenses`
  // kosong karena data seed **disisipkan langsung** berstatus `approved`,
  // sehingga trigger `AFTER UPDATE` tak pernah menyala.
  //
  // Jadi yang saya temukan bukan cacat rancangan melainkan **artefak seed**.
  // Di produksi `analisaProyek` membaca sumber yang benar, dan otomasi ini
  // bekerja sebagaimana mestinya.
  //
  // Pelajarannya: "tabel sumbernya kosong" bukan alasan yang cukup. Yang harus
  // ditanyakan adalah KENAPA kosong — dan jawabannya di sini membalikkan
  // kesimpulan.
  //
  // ── Memanggil rutenya, bukan merakit ulang
  //
  // Pola 3.18: `server.inject` ke `/api/v1/cost-analytics/portfolio`, sehingga
  // angka di notifikasi dijamin sama dengan angka di layar Portofolio Biaya.
  // Merakit ulang BAC/serapan di sini berarti dua sumber untuk satu angka.
  app.get('/api/v1/otomasi/jalankan/serapan-anggaran', {
    preHandler: [authenticate, requirePermission('notifications:milestone:check')],
  }, async (request, reply) => {
    const { createNotification } = await import('../../utils/notifications.js')
    const { resolveRecipients } = await import('../../utils/notification-routing.js')

    const q = request.query as { persen?: string }
    const ambangPersen = await ambilAmbang(request, 'otomasi.serapan_anggaran.persen', q.persen)

    const today = new Date().toISOString().split('T')[0]
    const sudah = await pembuatDedup(request, today, ['serapan_anggaran'])

    const res = await request.server.inject({
      method: 'GET',
      url: '/api/v1/cost-analytics/portfolio',
      headers: {
        authorization: request.headers.authorization ?? '',
        'x-company-id': (request.headers['x-company-id'] as string) ?? '',
      },
    })

    if (res.statusCode !== 200) {
      /*
        Endpoint portofolio kini MELEMPAR saat salah satu querynya gagal
        (diperbaiki hari ini juga). Otomasi mewarisi kejujuran itu: lebih baik
        mati daripada mengirim "semua proyek 0%" yang lahir dari kegagalan.
      */
      request.log.error({ status: res.statusCode }, 'serapan-anggaran: portofolio tak terhitung')
      return reply.status(500).send({
        error: `Portofolio biaya tak bisa dihitung (${res.statusCode}).`,
      })
    }

    /*
      TANPA `?? []`, dan itu disengaja.

      Status 200 sudah diperiksa di atas, jadi sampai di sini responsnya sah.
      Menulis `?? []` di sini tetap ditandai `audit-kegagalan-senyap` — dan
      penandaan itu BENAR sebagai aturan umum: pola itulah yang membuat
      gangguan basis terbaca sebagai "nol baris" di puluhan tempat lain.

      Bentuk yang menggantikannya memeriksa BENTUKNYA: respons 200 yang tak
      membawa larik `data` berarti endpoint portofolio berubah kontrak, dan itu
      layak berhenti keras — bukan diteruskan sebagai "nol proyek", yang akan
      terbaca persis seperti perusahaan tanpa proyek.

      Pola yang sama dipakai `ai-tulis.ts` untuk alasan yang sama.
    */
    const badan = res.json() as {
      data?: Array<{
        projectId: string; nama: string; status: string
        pagu: number; serapan: number
        serapanPct: number | null; dasarPembanding: string
      }>
    }

    if (!Array.isArray(badan.data)) {
      request.log.error({ badan }, 'serapan-anggaran: portofolio tak membawa larik data')
      return reply.status(500).send({
        error: 'Portofolio biaya membalas bentuk yang tak dikenali.',
      })
    }
    const daftar = badan.data

    let dibuat = 0
    let diperiksa = 0
    let takTerhitung = 0

    for (const p of daftar) {
      /*
        Hanya proyek AKTIF. Yang `completed` tak lagi bisa diperbaiki, dan yang
        `draft` belum punya rencana untuk dilampaui.
      */
      if (p.status !== 'active') continue

      /*
        `serapanPct === null` berarti pagunya nol — proyek tanpa RAP, RAB,
        maupun nilai kontrak. Itu KETIADAAN DATA, bukan pemborosan, dan
        menegur orang karenanya membuat mereka berhenti mempercayai pesannya.

        Pustakanya sengaja memulangkan `null` alih-alih 0 untuk membedakan
        keduanya — pembedaan itu akan sia-sia kalau otomasi menyamakannya lagi.
      */
      if (p.serapanPct === null || !Number.isFinite(p.serapanPct)) {
        takTerhitung++
        continue
      }

      diperiksa++
      if (p.serapanPct < ambangPersen) continue
      if (sudah('serapan_anggaran', p.projectId)) continue

      const penerima = await resolveRecipients('serapan_anggaran', {
        projectId: p.projectId, companyId: request.companyId!,
      })

      /*
        `dasarPembanding` WAJIB ikut di pesannya.

        RAB adalah harga JUAL, bukan biaya. Persentase terhadapnya terlihat
        lebih kecil daripada kenyataan, dan pustakanya sendiri memperingatkan
        itu. Angka tanpa dasarnya mengundang keputusan yang lebih percaya diri
        daripada datanya.
      */
      const labelDasar = p.dasarPembanding === 'rap_locked'
        ? 'pagu RAP terkunci'
        : p.dasarPembanding === 'rab'
          ? 'nilai RAB (harga jual — serapan sesungguhnya lebih tinggi)'
          : 'nilai kontrak'

      for (const uid of penerima) {
        await createNotification({
          company_id: request.companyId!,
          user_id:    uid,
          title:      p.serapanPct >= 100 ? 'Anggaran Proyek Terlampaui' : 'Serapan Anggaran Tinggi',
          message:
            `Proyek "${p.nama}": serapan ${p.serapanPct.toFixed(1)}% `
            + `(${rp(p.serapan)} dari ${rp(p.pagu)}), dihitung terhadap ${labelDasar}.`,
          type:       'serapan_anggaran',
          priority:   p.serapanPct >= 100 ? 'urgent' : 'high',
          project_id: p.projectId,
          action_url: `/proyek/${p.projectId}#sec-rab`,
          action_data: {
            record_id: p.projectId,
            serapan_pct: p.serapanPct,
            dasar: p.dasarPembanding,
          },
        })
        dibuat++
      }
    }

    return reply.send({
      success: true, notifications_created: dibuat,
      checked: {
        proyek_di_portofolio: daftar.length,
        diperiksa,
        // Dilaporkan EKSPLISIT: "0 notifikasi" tak boleh terbaca sebagai
        // "semua hemat" saat sebenarnya pagunya tak diketahui.
        tanpa_pagu: takTerhitung,
        ambang_persen: ambangPersen,
      },
    })
  })

  // ── GET /api/v1/otomasi/jalankan/absensi-berhenti ────────────────────────
  //
  // Automation 6.3 — dan BUKAN "validasi absensi" seperti namanya di katalog.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // TIGA DIMENSI DIMINTA; DUA TAK BISA, SATU BISA DAN BERGUNA
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Katalog meminta: tak absen berhari-hari · absen tanpa penugasan · jam kerja
  // tak masuk akal. Diukur satu per satu:
  //
  //   "jam kerja tak masuk akal"  MUSTAHIL. `absensi_harian` tak punya jam
  //                               masuk/keluar sama sekali — hanya
  //                               `porsi_hari`, dan CHECK sudah mengunci 0–1
  //                               serta lembur 0–16. Pelanggaran: NOL, dan
  //                               akan selalu nol. Detektor yang tak mungkin
  //                               berbunyi memberi rasa aman palsu.
  //
  //   "absen tanpa penugasan"     85% baris (1.088 dari 1.279) di luar rentang
  //                               scope-nya. Itu bentuk seed, bukan
  //                               pelanggaran — mengirimkannya berarti 1.088
  //                               peringatan tentang data uji.
  //
  //   "tak absen berhari-hari"    BISA, tetapi bukan sebagai tuduhan kepada
  //                               PEKERJA. Diukur: 60 dari 60 pekerja aktif
  //                               berjarak ≥7 hari, karena seed berhenti di
  //                               2026-08-08. Yang sesungguhnya terjadi bukan
  //                               "semua orang mangkir" melainkan "tak ada
  //                               yang mencatat".
  //
  // Jadi yang dibangun peringatan OPERASIONAL, satu pesan per scope:
  // **mandor berhenti mencatat absensi**. Itu keadaan yang benar-benar terjadi
  // di lapangan, punya penerima yang jelas, dan tindakannya tunggal — tanyakan
  // ke mandornya.
  //
  // Satu pesan per scope, bukan per pekerja: enam puluh pesan tentang satu
  // sebab yang sama adalah kebisingan, bukan enam puluh kabar.
  app.get('/api/v1/otomasi/jalankan/absensi-berhenti', {
    preHandler: [authenticate, requirePermission('notifications:milestone:check')],
  }, async (request, reply) => {
    const { createNotification } = await import('../../utils/notifications.js')
    const { resolveRecipients } = await import('../../utils/notification-routing.js')

    const q = request.query as { hari?: string }
    const ambangHari = await ambilAmbang(request, 'otomasi.absensi_berhenti.hari', q.hari)

    const today = new Date().toISOString().split('T')[0]
    const sudah = await pembuatDedup(request, today, ['absensi_berhenti'])

    const { data: proyek, error: eProy } = await request.db!
      .from('projects')
      .select('id, name')
      .eq('status', 'active')

    if (eProy) return reply.status(500).send({ error: eProy.message })

    let dibuat = 0
    let scopeDiperiksa = 0
    let scopeBerhenti = 0

    for (const p of proyek ?? []) {
      const pid = p.id as string

      /*
        RANTAINYA TIGA LAPIS, dan bentuk pertama saya melewatkannya:

            absensi_harian.scope_id → work_scopes.assignment_id
                                    → mandor_assignments.project_id

        `work_scopes` kategori C lewat **`assignment_id`**, bukan `project_id`.
        Saya sempat menulis `viaProject('work_scopes', pid)` — mengoper id
        PROYEK ke tempat yang menunggu id PENUGASAN. Hasilnya nol baris, rute
        balas 200, nol notifikasi, dan tak ada satu pun galat.

        Terukur saat dijalankan sungguhan: 17 lingkup aktif memenuhi syarat,
        otomasinya mengirim NOL. Typecheck tak bisa menangkapnya karena
        keduanya `string`; hanya menjalankannya yang bisa.

        Pola yang benar sama dengan `temuan_k3` di `k3-kepatuhan`: ambil induk
        yang SEHARUSNYA lewat `viaProject()`, lalu turunannya lewat `unsafe`
        yang disaring ke id hasil query pertama.
      */
      const { data: tugas, error: eTugas } = await request.db!
        .viaProject('mandor_assignments', pid)
        .select('id')

      if (eTugas) {
        request.log.warn({ err: eTugas, projectId: pid }, 'absensi-berhenti: penugasan tak terbaca')
        continue
      }

      const idTugas = (tugas ?? []).map((t) => t.id as string)
      if (idTugas.length === 0) continue

      const { data: scope, error: eScope } = await request.db!
        .unsafe('work_scopes',
          'disaring ke id penugasan yang barisnya sudah lewat RLS pada query di atas')
        .select('id, scope_name')
        .in('assignment_id', idTugas)
        .eq('status', 'active')

      if (eScope) {
        request.log.warn({ err: eScope, projectId: pid }, 'absensi-berhenti: scope tak terbaca')
        continue
      }

      const idScope = (scope ?? []).map((s) => s.id as string)
      if (idScope.length === 0) continue

      const namaScope = new Map(
        (scope ?? []).map((s) => [s.id as string, s.scope_name as string]),
      )

      /*
        `absensi_harian` kategori C lewat `scope_id`. Disaring ke id scope yang
        barisnya sudah lewat RLS pada query di atas — alasan yang sama dengan
        `temuan_k3` di `k3-kepatuhan`.
      */
      const { data: absen, error: eAbsen } = await request.db!
        .unsafe('absensi_harian',
          'disaring ke id scope yang barisnya sudah lewat RLS pada query di atas')
        .select('scope_id, tanggal')
        .in('scope_id', idScope)

      if (eAbsen) {
        request.log.warn({ err: eAbsen, projectId: pid }, 'absensi-berhenti: absensi tak terbaca')
        continue
      }

      // Tanggal TERAKHIR per scope — dihitung di memori, bukan lewat satu
      // query per scope yang akan jadi N+1 begitu proyeknya bertambah.
      const terakhir = new Map<string, string>()
      for (const a of absen ?? []) {
        const sid = a.scope_id as string
        const tgl = String(a.tanggal).slice(0, 10)
        const lama = terakhir.get(sid)
        if (!lama || tgl > lama) terakhir.set(sid, tgl)
      }

      const penerima = await resolveRecipients('absensi_berhenti', {
        projectId: pid, companyId: request.companyId!,
      })

      for (const sid of idScope) {
        scopeDiperiksa++
        const tgl = terakhir.get(sid)

        /*
          Scope yang BELUM PERNAH dicatat sekalipun dilewati, bukan ditegur.

          Ia bisa saja baru dibuat hari ini. Membedakan "belum mulai" dari
          "berhenti" butuh tanggal mulai scope-nya, dan menuduh yang pertama
          sebagai yang kedua adalah tuduhan atas pekerjaan yang belum jalan.
        */
        if (!tgl) continue

        const jarak = Math.round(
          (Date.parse(today + 'T00:00:00Z') - Date.parse(tgl + 'T00:00:00Z')) / 86_400_000,
        )
        if (jarak < ambangHari) continue

        scopeBerhenti++
        if (sudah('absensi_berhenti', sid)) continue

        for (const uid of penerima) {
          await createNotification({
            company_id: request.companyId!,
            user_id:    uid,
            title:      'Absensi Berhenti Dicatat',
            message:
              `Proyek "${p.name}", lingkup "${namaScope.get(sid) ?? sid}": `
              + `absensi terakhir ${jarak} hari lalu (${tgl}). `
              + 'Tanyakan ke mandornya — tanpa absensi, upah tak bisa dihitung.',
            type:       'absensi_berhenti',
            priority:   jarak >= ambangHari * 2 ? 'urgent' : 'high',
            project_id: pid,
            action_url: '/mandor/absensi',
            action_data: { record_id: sid, hari_sejak: jarak, terakhir: tgl },
          })
          dibuat++
        }
      }
    }

    return reply.send({
      success: true, notifications_created: dibuat,
      checked: {
        scope_aktif: scopeDiperiksa,
        scope_berhenti: scopeBerhenti,
        ambang_hari: ambangHari,
      },
    })
  })

  // ── GET /api/v1/otomasi/jalankan/subkon-tak-layak ────────────────────────
  //
  // Automation 3.6 — dan BUKAN "scoring" maupun deteksi penurunan.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // KENAPA BUKAN TREN
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Deteksi penurunan butuh ≥2 periode per pihak. Diukur:
  //
  //     evaluasi_subkon  : 1 dari 4 pihak punya ≥2 periode
  //     evaluasi_vendor  : 0 dari 4 supplier
  //
  // Dan satu-satunya yang punya tren justru NAIK (mutu 60 → 90).
  //
  // Tetapi itu bukan alasan utamanya, karena periode akan terisi sendiri
  // seiring waktu. Yang TIDAK akan sembuh sendiri: **identitas pihaknya tak
  // stabil.** Tiga dari lima baris ber-`supplier_id` NULL, dikenali hanya lewat
  // teks bebas `pihak_nama`. Mengelompokkan tren dengan string bebas berarti
  // satu salah ketik menciptakan subjek baru — dan trennya patah tanpa gejala.
  //
  // ── Yang dibangun: STATUS, bukan tren
  //
  // `nilaiEvaluasiSubkon()` sudah memulangkan `bolehDipakai` beserta
  // alasannya: daftar hitam, ada kecelakaan, atau ≥3 pelanggaran K3. Itu
  // keadaan satu baris — tak butuh periode kedua, tak butuh identitas stabil,
  // dan terukur ADA: 2 dari 5 baris memenuhi hari ini.
  //
  // Dan ia lebih mendesak daripada tren: subkon yang tak boleh dipakai tetapi
  // masih diundang adalah risiko yang berjalan hari ini, bukan kecenderungan.
  app.get('/api/v1/otomasi/jalankan/subkon-tak-layak', {
    preHandler: [authenticate, requirePermission('notifications:milestone:check')],
  }, async (request, reply) => {
    const { createNotification } = await import('../../utils/notifications.js')
    const { resolveRecipients } = await import('../../utils/notification-routing.js')
    const { nilaiEvaluasiSubkon } = await import('../../lib/kepatuhan-k3.js')
    type EvaluasiSubkon = import('../../lib/kepatuhan-k3.js').EvaluasiSubkon

    const today = new Date().toISOString().split('T')[0]
    const sudah = await pembuatDedup(request, today, ['subkon_tak_layak'])

    // Kategori B — `.from()` sudah menyaringnya ke tenant.
    const { data: evaluasi, error } = await request.db!
      .from('evaluasi_subkon')
      .select(`id, supplier_id, pihak_nama, periode, skor_mutu, skor_waktu,
               skor_k3, skor_kepatuhan, skor_kerjasama, jumlah_kecelakaan,
               jumlah_pelanggaran_k3, masuk_daftar_hitam`)

    if (error) return reply.status(500).send({ error: error.message })

    /*
      Hanya evaluasi TERBARU per pihak yang dinilai.

      Tanpa ini, subkon yang tahun lalu masuk daftar hitam lalu diperbaiki
      tetap ditegur berdasar baris lamanya — dan pesan yang menuduh atas
      keadaan yang sudah berubah adalah cara tercepat membuat orang berhenti
      membacanya.

      Kuncinya `supplier_id` kalau ada, `pihak_nama` kalau tidak. Itu memang
      rapuh (3 dari 5 baris tanpa supplier_id), tetapi di sini rapuhnya hanya
      berarti dua baris pihak yang sama dinilai terpisah — bukan tren yang
      patah diam-diam.
    */
    const terbaru = new Map<string, Record<string, unknown>>()
    for (const e of evaluasi ?? []) {
      const kunci = (e.supplier_id as string | null) ?? `nama:${e.pihak_nama ?? '?'}`
      const lama = terbaru.get(kunci)
      if (!lama || String(e.periode) > String(lama.periode)) terbaru.set(kunci, e)
    }

    const penerima = await resolveRecipients('subkon_tak_layak', {
      projectId: null, companyId: request.companyId!,
    })

    let dibuat = 0
    let diperiksa = 0
    let takLayak = 0

    for (const e of terbaru.values()) {
      diperiksa++
      const hasil = nilaiEvaluasiSubkon(e as unknown as EvaluasiSubkon)
      if (hasil.bolehDipakai) continue

      takLayak++
      const id = e.id as string
      if (sudah('subkon_tak_layak', id)) continue

      const nama = (e.pihak_nama as string | null) ?? 'Subkontraktor'

      for (const uid of penerima) {
        await createNotification({
          company_id: request.companyId!,
          user_id:    uid,
          title:      'Subkontraktor Tak Layak Dipakai',
          message:
            `${nama} tak boleh dipakai berdasar evaluasi ${String(e.periode).slice(0, 10)}: `
            + `${hasil.alasanTakBolehDipakai.join('; ')}.`,
          type:       'subkon_tak_layak',
          priority:   'urgent',
          /*
            TANPA `project_id` — evaluasi melekat pada PIHAK. Dan `record_id`
            memakai id evaluasinya, bukan `supplier_id`: tiga dari lima baris
            tak punya `supplier_id`, jadi dedup berbasis supplier akan
            menyatukan pihak yang tak berhubungan.
          */
          action_url: '/kepatuhan?bagian=evaluasi',
          action_data: {
            record_id: id,
            skor: hasil.skor,
            alasan: hasil.alasanTakBolehDipakai,
          },
        })
        dibuat++
      }
    }

    return reply.send({
      success: true, notifications_created: dibuat,
      checked: { pihak_dinilai: diperiksa, tak_layak: takLayak },
    })
  })

  // ── GET /api/v1/otomasi/jalankan/retensi-tertahan ────────────────────────
  //
  // Automation 2.3 — Retention Tracking.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // BUKAN "RETENSI JATUH TEMPO" — DAN ITU BUKAN PENYEDERHANAAN
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Retensi lazimnya dicairkan sesudah masa pemeliharaan berakhir. Otomasi
  // berbasis tanggal itu MUSTAHIL hari ini, dan sebabnya diukur:
  //
  //   · tak ada satu pun kolom tanggal jatuh tempo retensi di seluruh schema
  //   · satu-satunya durasi masa pemeliharaan ada di
  //     `serah_terima.masa_pemeliharaan_hari`, dan tanggal akhirnya sengaja
  //     TIDAK disimpan — diturunkan saat baca oleh `akhirMasaPemeliharaan()`
  //   · `serah_terima` NOL baris
  //
  // Jadi otomasi kalender akan memicu nol baris selamanya. Yang berguna versi
  // EKSPOSUR: berapa uang retensi yang tertahan pada pekerjaan yang sudah
  // lewat waktunya.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // DUA ANGKA YANG BERBEDA, DAN KEDUANYA DISEBUT
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Ini bagian terpentingnya.
  //
  //   `projects.retention_amount`  retensi KONTRAKTUAL — yang disepakati
  //                                ditahan. Terukur Rp 302,9 jt di 14 proyek.
  //
  //   `invoices.retensi_amount`    retensi TEREALISASI — yang benar-benar
  //                                dipotong di invoice. Terukur NOL di 26
  //                                dari 26 invoice.
  //
  // Layar Register Retensi (`/piutang`) membaca yang KEDUA, jadi ia
  // menampilkan nol untuk semua proyek. Empty-state-nya pun sudah menjelaskan
  // itu: *"Retensi muncul saat invoice memakai potongan retensi."*
  //
  // Kalau otomasi ini mengirim "Rp 101 juta tertahan" lalu orang menekan
  // tautannya dan melihat NOL, ia akan menyimpulkan salah satunya rusak — dan
  // berhenti mempercayai keduanya. Itu kegagalan yang lebih mahal daripada
  // tidak mengirim apa pun.
  //
  // Maka pesannya menyebut KEDUANYA, dan selisihnya justru jadi isi
  // peringatannya: retensi yang disepakati tetapi tak pernah dipotong di
  // invoice adalah uang yang tak terlacak — bukan uang yang aman.
  app.get('/api/v1/otomasi/jalankan/retensi-tertahan', {
    preHandler: [authenticate, requirePermission('notifications:milestone:check')],
  }, async (request, reply) => {
    const { createNotification } = await import('../../utils/notifications.js')
    const { resolveRecipients } = await import('../../utils/notification-routing.js')

    const q = request.query as { hari?: string }
    const ambangHari = await ambilAmbang(request, 'otomasi.retensi_tertahan.hari', q.hari)

    const today = new Date().toISOString().split('T')[0]
    const sudah = await pembuatDedup(request, today, ['retensi_tertahan'])

    /*
      `projects` adalah ANCHOR tenancy — `.from()` menyaringnya langsung.

      `actual_end_date` SENGAJA tidak dipakai: terukur NULL di ketujuh proyek
      yang memenuhi syarat, jadi menyaring dengannya menghasilkan nol baris
      tanpa satu pun gejala.
    */
    const { data: proyek, error } = await request.db!
      .from('projects')
      .select('id, name, status, end_date, retention_amount, retention_pct, client_id')
      .gt('retention_amount', 0)

    if (error) return reply.status(500).send({ error: error.message })

    const idProyek = (proyek ?? []).map((p) => p.id as string)
    if (idProyek.length === 0) {
      return reply.send({
        success: true, notifications_created: 0,
        checked: { proyek_beretensi: 0, ambang_hari: ambangHari },
      })
    }

    /*
      Retensi TEREALISASI per proyek, dari invoice.

      `invoices` kategori C lewat `project_id`; disaring ke id proyek yang
      barisnya sudah lewat RLS pada query di atas — pola yang sama dengan
      `invoice-terlambat`.
    */
    const { data: inv, error: eInv } = await request.db!
      .unsafe('invoices',
        'daftar lintas-proyek; disaring ke id proyek dari query ter-scope tenant di atas')
      .select('project_id, retensi_amount')
      .in('project_id', idProyek)

    if (eInv) return reply.status(500).send({ error: eInv.message })

    const terealisasi = new Map<string, number>()
    for (const i of inv ?? []) {
      const pid = i.project_id as string
      terealisasi.set(pid, (terealisasi.get(pid) ?? 0) + Number(i.retensi_amount ?? 0))
    }

    /*
      Berita acara serah terima MEMBUKA pencairan retensi. Yang sudah punya
      BAST tak lagi "tertahan tanpa jalan keluar" — ia sedang dalam proses,
      dan menegurnya adalah menegur pekerjaan yang sudah berjalan.

      `serah_terima` kategori B, jadi `.from()` cukup. Nol baris hari ini,
      tetapi saringannya tetap dipasang: begitu orang mulai mengisinya,
      otomasi ini harus langsung berhenti menegur yang sudah beres — bukan
      menunggu seseorang ingat memperbaiki kodenya.
    */
    const { data: bast, error: eBast } = await request.db!
      .from('serah_terima')
      .select('project_id')

    if (eBast) return reply.status(500).send({ error: eBast.message })
    const punyaBast = new Set((bast ?? []).map((b) => b.project_id as string))

    let dibuat = 0
    let lewatWaktu = 0
    let tanpaRealisasi = 0

    for (const p of proyek ?? []) {
      const pid = p.id as string
      const akhir = p.end_date as string | null
      if (!akhir) continue

      const jarak = Math.round(
        (Date.parse(today + 'T00:00:00Z') - Date.parse(String(akhir).slice(0, 10) + 'T00:00:00Z'))
        / 86_400_000,
      )

      // Pekerjaan yang belum lewat waktunya belum punya persoalan retensi.
      if (jarak < ambangHari) continue
      lewatWaktu++

      if (punyaBast.has(pid)) continue

      const kontraktual = Number(p.retention_amount ?? 0)
      const nyata = terealisasi.get(pid) ?? 0
      if (nyata === 0) tanpaRealisasi++

      if (sudah('retensi_tertahan', pid)) continue

      const penerima = await resolveRecipients('retensi_tertahan', {
        projectId: pid, companyId: request.companyId!,
      })

      /*
        Selisih antara yang disepakati dan yang tercatat ADALAH isi
        peringatannya, bukan catatan kaki.

        Retensi kontraktual yang tak pernah muncul di invoice berarti
        potongannya tak pernah benar-benar diterapkan — uangnya mungkin sudah
        dibayarkan penuh, dan yang tersisa cuma angka di kontrak.
      */
      const catatanSelisih = nyata === 0
        ? ' Belum ada satu pun invoice yang mencatat potongan retensi — '
          + 'angka ini masih kontraktual, bukan uang yang benar-benar ditahan.'
        : nyata < kontraktual
          ? ` Baru ${rp(nyata)} yang tercatat dipotong di invoice.`
          : ''

      for (const uid of penerima) {
        await createNotification({
          company_id: request.companyId!,
          user_id:    uid,
          title:      'Retensi Tertahan Belum Diurus',
          message:
            `Proyek "${p.name}" (${p.status}) sudah lewat tanggal selesai `
            + `${jarak} hari, retensi ${rp(kontraktual)}`
            + (p.retention_pct ? ` (${p.retention_pct}%)` : '')
            + ' dan belum ada berita acara serah terima.'
            + catatanSelisih,
          type:       'retensi_tertahan',
          // Yang statusnya masih `active` padahal tanggal selesainya lewat
          // lebih mendesak: pekerjaannya sendiri belum ditutup.
          priority:   p.status === 'completed' ? 'high' : 'urgent',
          project_id: pid,
          action_url: '/piutang',
          action_data: {
            record_id: pid,
            retensi_kontraktual: kontraktual,
            retensi_tercatat: nyata,
            hari_lewat: jarak,
          },
        })
        dibuat++
      }
    }

    return reply.send({
      success: true, notifications_created: dibuat,
      checked: {
        proyek_beretensi: (proyek ?? []).length,
        lewat_waktu: lewatWaktu,
        // Dilaporkan EKSPLISIT: inilah selisih antara angka kontrak dan angka
        // yang benar-benar tercatat di invoice, dan ia yang membuat layar
        // Register Retensi menampilkan nol.
        tanpa_realisasi_invoice: tanpaRealisasi,
        ambang_hari: ambangHari,
      },
    })
  })

  // ── GET /api/v1/otomasi/jalankan/audit-aksi-berisiko ─────────────────────
  //
  // Automation 5.12′ — Ringkasan Aksi Berisiko Harian.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // TANDA KUTIP PADA NOMORNYA DISENGAJA
  // ══════════════════════════════════════════════════════════════════════════
  //
  // 5.12 ASLI berbunyi *"Document Access Audit Summary — ringkasan siapa
  // mengakses dokumen sensitif kapan"*. Itu MUSTAHIL hari ini, dan sebabnya
  // bukan yang saya duga.
  //
  // Akses baca BUKAN tak dicatat — jalur pipanya utuh: tabel
  // `document_access_logs` ada sejak migrasi 055, endpoint penulisnya ada
  // (`POST /documents/:id/access-log`), dan frontend memanggilnya. Yang tak
  // ada ISINYA:
  //
  //     documents               0 baris
  //     document_access_logs    0 baris
  //     submittal_documents     0 baris
  //
  // Dan tak ada satu pun kolom yang menyatakan sebuah dokumen rahasia.
  // `documents.is_visible_to_client` yang paling dekat, tetapi itu kontrol
  // tampilan portal klien — bukan klasifikasi kerahasiaan, dan memakainya
  // sebagai proksi harus dinyatakan, bukan diam-diam.
  //
  // Jadi 5.12 asli akan mengirim ringkasan KOSONG tiap hari selamanya.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // YANG DIBANGUN: SEMANGAT YANG SAMA, SUMBER YANG BENAR-BENAR BERISI
  // ══════════════════════════════════════════════════════════════════════════
  //
  // `audit_logs` — 61.505 baris, dan SEGAR: 7.831 event dalam 24 jam
  // terakhir, tulisan termuda 26 menit sebelum pengukuran. Pertanyaan
  // "siapa melakukan apa yang berisiko, kapan" dijawab dari situ.
  //
  // ── Tiga sinyal yang DIBUANG, dan kenapa
  //
  // Ketiganya terdengar masuk akal dan ketiganya diukur mati:
  //
  //     IP mencurigakan     `127.0.0.1` = 61.002 dari 61.505 (99,2%)
  //     di luar jam kerja   6.021 dari 7.831 event 24 jam = 77%
  //     akhir pekan         7.831 dari 7.831 = 100%
  //
  // Memakai salah satunya berarti menyalakan alarm untuk hampir semua hal.
  // Dan "pengguna ini menyimpang dibanding pengguna lain" pun mustahil: hanya
  // ada TIGA `user_id` berbeda di seluruh jejak.
  //
  // Maka pembandingnya DIRI SENDIRI — median empat belas hari pengguna itu —
  // yang tetap sah saat penggunanya bertambah jadi ratusan.
  app.get('/api/v1/otomasi/jalankan/audit-aksi-berisiko', {
    preHandler: [authenticate, requirePermission('notifications:milestone:check')],
  }, async (request, reply) => {
    const { createNotification } = await import('../../utils/notifications.js')
    const { resolveRecipients } = await import('../../utils/notification-routing.js')

    const q = request.query as { perjam?: string; klaster?: string }
    const ambangJam = await ambilAmbang(request, 'otomasi.audit_ledakan.per_jam', q.perjam)
    const ambangHapus = await ambilAmbang(request, 'otomasi.audit_hapus.klaster', q.klaster)

    const today = new Date().toISOString().split('T')[0]
    const sudah = await pembuatDedup(request, today, ['audit_aksi_berisiko'])

    const sejak = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    /*
      `audit_logs` kategori D — punya `company_id` NOT NULL yang diisi trigger,
      dan sengaja TIDAK di-join ke induknya supaya jejak tetap terbaca meski
      baris induknya hilang.

      Karena itu ia menuntut `.unsafe()` + saringan `company_id` EKSPLISIT,
      bukan `.from()`. Bentuk pertama saya memakai `.from()` dan ditolak
      pembungkusnya dengan pesan yang menyebut jalannya sendiri:

          'audit_logs' kategori D (identitas/platform) — scoping-nya khusus.
          Pakai db.unsafe('audit_logs', '<alasan>') dan jelaskan bagaimana
          tenancy dijaga.

      Kesembilan kalinya dalam sesi ini nama/bentuk ditebak alih-alih diukur,
      dan lagi-lagi typecheck tak bisa menangkapnya — nama tabel hanyalah
      string. Yang menangkapnya kali ini pembungkus tenancy-nya sendiri, saat
      dijalankan sungguhan.

      Dibaca BERHALAMAN: 7.831 event per hari sudah melewati batas potong
      senyap PostgREST di 1.000, dan pemotongan itu akan membuat ringkasan
      melaporkan angka yang lebih kecil daripada kenyataan — tanpa galat.
    */
    const HALAMAN = 1000
    const jejak: Array<Record<string, unknown>> = []
    for (let dari = 0; ; dari += HALAMAN) {
      const { data, error } = await request.db!
        .unsafe('audit_logs', 'kategori D — disaring eksplisit dengan .eq(company_id) di bawah')
        .select('id, user_id, action, table_name, severity, created_at')
        .eq('company_id', request.companyId!)
        .gte('created_at', sejak)
        .order('created_at', { ascending: true })
        .range(dari, dari + HALAMAN - 1)

      if (error) return reply.status(500).send({ error: error.message })
      if (!data || data.length === 0) break
      jejak.push(...(data as Array<Record<string, unknown>>))
      if (data.length < HALAMAN) break
    }

    /*
      Daftar aksi keamanan DIPAKU, bukan ditebak dari kata kunci.

      Pencarian berpola ("apa pun yang mengandung 'delete'") akan menyeret
      penghapusan biasa yang tak berisiko, dan melewatkan yang berisiko tetapi
      tak berkata itu. Keempat nilai di bawah diukur benar-benar ada di jejak:
      `role.permissions` 80 · `credential.set` 72 · `credential.delete` 18 ·
      `payroll.kunci` 34.
    */
    const AKSI_KEAMANAN = new Set([
      'role.permissions', 'credential.set', 'credential.delete', 'payroll.kunci',
    ])

    const keamanan: Array<{ aksi: string; user: string | null }> = []
    const perJam = new Map<string, number>()
    const hapusPer = new Map<string, number>()
    let kritis = 0
    let aiDitolak = 0

    for (const e of jejak) {
      const aksi = String(e.action ?? '')
      const uid = (e.user_id as string | null) ?? null
      const tabel = String(e.table_name ?? '')

      if (AKSI_KEAMANAN.has(aksi)) keamanan.push({ aksi, user: uid })
      if (e.severity === 'critical') kritis++
      if (aksi === 'ai.tulis.ditolak') aiDitolak++

      // Ledakan: pengguna × jam. Jam diambil dari stempel UTC-nya apa adanya;
      // yang dicari kepadatan, bukan jam dinding setempat.
      const jam = String(e.created_at ?? '').slice(0, 13)
      if (uid) perJam.set(`${uid}|${jam}`, (perJam.get(`${uid}|${jam}`) ?? 0) + 1)

      // Klaster hapus: pengguna × tabel.
      if (aksi === 'DELETE' || aksi.endsWith('.delete') || aksi.endsWith('.hapus')) {
        if (uid) hapusPer.set(`${uid}|${tabel}`, (hapusPer.get(`${uid}|${tabel}`) ?? 0) + 1)
      }
    }

    const ledakan = [...perJam.entries()].filter(([, n]) => n >= ambangJam)
    const klasterHapus = [...hapusPer.entries()].filter(([, n]) => n >= ambangHapus)

    const temuan: string[] = []
    if (keamanan.length > 0) {
      const per = new Map<string, number>()
      for (const k of keamanan) per.set(k.aksi, (per.get(k.aksi) ?? 0) + 1)
      temuan.push(
        `${keamanan.length} aksi keamanan: `
        + [...per.entries()].map(([a, n]) => `${a} ${n}×`).join(', '))
    }
    if (klasterHapus.length > 0) {
      temuan.push(
        `${klasterHapus.length} penghapusan berklaster (≥${ambangHapus} baris oleh satu orang `
        + `di satu tabel): ${klasterHapus.slice(0, 3).map(([k, n]) => `${k.split('|')[1]} ${n}×`).join(', ')}`)
    }
    if (ledakan.length > 0) {
      const puncak = Math.max(...ledakan.map(([, n]) => n))
      temuan.push(`${ledakan.length} lonjakan aktivitas (≥${ambangJam} aksi/jam, tertinggi ${puncak})`)
    }
    if (aiDitolak > 0) {
      temuan.push(`${aiDitolak} percobaan tulis lewat asisten DITOLAK`)
    }

    /*
      Nol temuan TIDAK mengirim apa pun — dan itu keputusan, bukan kelalaian.

      Ringkasan harian yang selalu datang meski kosong berhenti dibaca dalam
      seminggu, dan pada hari ia sungguh berisi, tak ada yang membukanya.
    */
    if (temuan.length === 0) {
      return reply.send({
        success: true, notifications_created: 0,
        checked: {
          event_24jam: jejak.length, kritis, ai_ditolak: aiDitolak,
          ledakan: 0, klaster_hapus: 0,
          ambang_per_jam: ambangJam, ambang_hapus: ambangHapus,
        },
      })
    }

    // `record_id` = tanggalnya. Ringkasan ini SATU per hari per tenant, dan
    // dedup harian bekerja per (jenis, record) — memakai tanggal membuatnya
    // tepat satu, bukan satu per temuan.
    let dibuat = 0
    if (!sudah('audit_aksi_berisiko', today)) {
      const penerima = await resolveRecipients('audit_aksi_berisiko', {
        projectId: null, companyId: request.companyId!,
      })

      for (const uid of penerima) {
        await createNotification({
          company_id: request.companyId!,
          user_id:    uid,
          title:      'Ringkasan Aksi Berisiko 24 Jam',
          message:
            `Dari ${jejak.length} kejadian tercatat: ${temuan.join('; ')}.`
            + (kritis > 0 ? ` ${kritis} bertingkat kritis.` : ''),
          type:       'audit_aksi_berisiko',
          // Penghapusan berklaster yang paling pantas dilihat hari itu juga;
          // sisanya bisa menunggu jam kerja.
          priority:   klasterHapus.length > 0 ? 'urgent' : 'high',
          project_id: undefined,
          action_url: '/audit',
          action_data: {
            record_id: today,
            event_24jam: jejak.length,
            kritis,
            ledakan: ledakan.length,
            klaster_hapus: klasterHapus.length,
            ai_ditolak: aiDitolak,
          },
        })
        dibuat++
      }
    }

    return reply.send({
      success: true, notifications_created: dibuat,
      checked: {
        event_24jam: jejak.length, kritis, ai_ditolak: aiDitolak,
        ledakan: ledakan.length, klaster_hapus: klasterHapus.length,
        ambang_per_jam: ambangJam, ambang_hapus: ambangHapus,
      },
    })
  })

  // ── GET /api/v1/otomasi/jalankan/kontrak-payung-habis ────────────────────
  //
  // Kontrak payung (blanket order) yang mendekati akhir masa berlakunya.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // TANPA NOMOR KATALOG, DAN ITU DISENGAJA
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Kandidat terdekat di katalog adalah 7.10 *Contract Renewal Reminder*,
  // tetapi bunyinya: *"Ingatkan peluang repeat business dari klien existing"*
  // — itu kontrak KLIEN, sisi penjualan.
  //
  // Yang dibangun di sini kontrak SUPPLIER: `kontrak_payung` punya
  // `supplier_id`, bukan `client_id`. Menempelkan nomor 7.10 padanya akan
  // membuat katalog mengklaim sesuatu yang tak dikerjakan, dan orang yang
  // mencari pengingat repeat-business menemukan otomasi pengadaan.
  //
  // Nomor katalog bersifat opsional di `EntitasKatalog` justru untuk keadaan
  // seperti ini: kebutuhan nyata yang tak punya padanan di daftar. Lebih baik
  // kosong daripada salah.
  //
  // ── Kenapa ini pantas ada
  //
  // Kontrak payung yang habis berarti pemesanan di bawahnya berhenti bisa
  // dibuat — dan itu ketahuan saat seseorang mencoba memesan, bukan sebelumnya.
  // Terukur: BO-2026-003 habis dalam 12 hari.
  app.get('/api/v1/otomasi/jalankan/kontrak-payung-habis', {
    preHandler: [authenticate, requirePermission('notifications:milestone:check')],
  }, async (request, reply) => {
    const { createNotification } = await import('../../utils/notifications.js')
    const { resolveRecipients } = await import('../../utils/notification-routing.js')

    const q = request.query as { hari?: string }
    const ambangHari = await ambilAmbang(request, 'otomasi.kontrak_payung.hari', q.hari)

    const today = new Date().toISOString().split('T')[0]
    const sudah = await pembuatDedup(request, today, ['kontrak_payung_habis'])

    /*
      `kontrak_payung` kategori B — `.from()` menyaringnya ke tenant.

      Hanya yang berstatus `aktif`. Nilai lain dari CHECK-nya (`draft`,
      `habis`, `kedaluwarsa`, `dibatalkan`) memang tak perlu ditegur: yang
      pertama belum berlaku, tiga sisanya sudah selesai urusannya.
    */
    const { data, error } = await request.db!
      .from('kontrak_payung')
      .select(`
        id, nomor, judul, berlaku_sampai, pagu_nilai, status,
        pemasok:suppliers!kontrak_payung_supplier_id_fkey(name)
      `)
      .eq('status', 'aktif')

    if (error) return reply.status(500).send({ error: error.message })

    let dibuat = 0
    let mendekat = 0

    for (const k of data ?? []) {
      const sampai = String(k.berlaku_sampai ?? '').slice(0, 10)
      if (!sampai) continue

      const sisa = Math.round(
        (Date.parse(sampai + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86_400_000,
      )
      if (sisa > ambangHari) continue

      mendekat++
      if (sudah('kontrak_payung_habis', k.id as string)) continue

      const penerima = await resolveRecipients('kontrak_payung_habis', {
        projectId: null, companyId: request.companyId!,
      })

      // Join PostgREST memulangkan ARRAY — pelajaran yang sama dengan
      // `transmittal-menggantung` dan `sertifikat-berakhir`.
      const arr = k.pemasok as unknown as Array<{ name?: string }> | { name?: string } | null
      const pemasok = (Array.isArray(arr) ? arr[0]?.name : arr?.name) ?? 'pemasok'

      const lewat = sisa < 0

      for (const uid of penerima) {
        await createNotification({
          company_id: request.companyId!,
          user_id:    uid,
          title:      lewat ? 'Kontrak Payung Sudah Habis' : 'Kontrak Payung Segera Habis',
          message:
            `${k.nomor} "${k.judul}" dengan ${pemasok} `
            + (lewat
              ? `sudah habis ${Math.abs(sisa)} hari lalu.`
              : `berakhir dalam ${sisa} hari.`)
            + ' Pemesanan di bawahnya berhenti bisa dibuat sesudah tanggal itu.',
          type:       'kontrak_payung_habis',
          priority:   lewat ? 'urgent' : 'high',
          // TANPA `project_id` — kontrak payung melekat pada PEMASOK dan
          // dipakai lintas proyek.
          action_url: '/procurement/lanjutan',
          action_data: { record_id: k.id, sisa_hari: sisa, pagu: k.pagu_nilai ?? null },
        })
        dibuat++
      }
    }

    return reply.send({
      success: true, notifications_created: dibuat,
      checked: {
        kontrak_aktif: (data ?? []).length,
        mendekati_habis: mendekat,
        ambang_hari: ambangHari,
      },
    })
  })

  // ── GET /api/v1/otomasi/jalankan/penyusutan-belum-ditutup ────────────────
  //
  // Automation 10.8 — Asset Depreciation Schedule.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // TIDAK MENGHITUNG DIAM-DIAM — MENAGIH ORANG YANG BERWENANG MENUTUP BUKU
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Godaan terbesar di otomasi ini adalah membuatnya MENULIS: hitung sendiri
  // bebannya, sisipkan barisnya, jurnalkan. Itu ditolak.
  //
  // Penyusutan masuk buku besar. Baris yang muncul tanpa seorang pun menekan
  // tombol adalah baris yang tak seorang pun merasa bertanggung jawab atasnya,
  // dan pada saat auditor bertanya "siapa yang memutuskan ini", jawabannya
  // "sistem" — jawaban yang tak diterima di mana pun.
  //
  // Maka ia MEMBACA dan MENAGIH. Tombolnya tetap ditekan manusia.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // DUA KEKURANGAN YANG BERBEDA, DAN KENAPA KEDUANYA DIKIRIM TERPISAH
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Diukur 2026-08-16:
  //
  //   belum DIHITUNG   14 dari 18 aset dalam masa manfaat tak punya baris
  //                    `penyusutan_alat` untuk periode 2026-07
  //
  //   belum DIJURNAL   8 baris (2026-05 dan 2026-06) sudah dihitung tetapi
  //                    `journal_entry_id IS NULL` — Rp 110.544.642,86 tak
  //                    pernah sampai ke neraca
  //
  // Keduanya terlihat mirip di layar dan berbeda total dalam tindakan: yang
  // pertama membuka halaman Aset dan menekan "hitung periode", yang kedua
  // menekan "jurnalkan". Menggabungkannya jadi satu pesan membuat penerimanya
  // menebak mana yang dimaksud.
  //
  // Yang KEDUA lebih berbahaya dan itu tercermin di prioritasnya: beban yang
  // sudah dihitung tetapi tak terjurnal membuat laporan laba-rugi TERLIHAT
  // benar — angkanya ada di halaman Aset — sementara neraca tak pernah
  // menerimanya. Tak ada satu pun galat yang menunjuk ke sana.
  //
  // ── Periode yang ditagih adalah bulan LALU, bukan bulan berjalan
  //
  // Menagih penutupan bulan yang belum selesai adalah menagih sesuatu yang
  // memang belum bisa dikerjakan. Ambangnya (`tanggal`) menahan lebih jauh:
  // penutupan buku butuh beberapa hari kerja, dan menegur pada tanggal 1
  // hanya melatih orang mengabaikan notifikasi.
  app.get('/api/v1/otomasi/jalankan/penyusutan-belum-ditutup', {
    preHandler: [authenticate, requirePermission('notifications:milestone:check')],
  }, async (request, reply) => {
    const { createNotification } = await import('../../utils/notifications.js')
    const { resolveRecipients } = await import('../../utils/notification-routing.js')
    const { bebanPeriode } = await import('../../lib/aset.js')

    const q = request.query as { tanggal?: string }
    const ambangTanggal = await ambilAmbang(request, 'otomasi.penyusutan_tutup.tanggal', q.tanggal)

    const today = new Date().toISOString().split('T')[0]
    const sudah = await pembuatDedup(request, today,
      ['penyusutan_belum_dihitung', 'penyusutan_belum_dijurnal'])

    // Periode yang ditagih = bulan sebelum bulan berjalan.
    const [thIni, blIni] = today.split('-').map(Number)
    const thLalu = blIni === 1 ? thIni - 1 : thIni
    const blLalu = blIni === 1 ? 12 : blIni - 1
    const periodeLalu = `${thLalu}-${String(blLalu).padStart(2, '0')}`
    const tanggalKini = Number(today.slice(8, 10))

    /*
      `assets` dan `penyusutan_alat` keduanya kategori B — `.from()` menyaring
      langsung lewat `company_id`.
    */
    const { data: aset, error } = await request.db!
      .from('assets')
      .select(`id, asset_code, name, purchase_date, purchase_price, residual_value,
               useful_life_months, depreciation_method, status`)

    if (error) return reply.status(500).send({ error: error.message })

    const { data: susut, error: eSusut } = await request.db!
      .from('penyusutan_alat')
      .select('id, asset_id, periode, nilai, journal_entry_id')

    if (eSusut) return reply.status(500).send({ error: eSusut.message })

    /*
      Aset yang SEHARUSNYA punya baris periode itu ditentukan oleh
      `bebanPeriode()` — pustaka yang sama yang dipakai halaman Aset menghitung.

      Menuliskan ulang syaratnya di sini ("umur belum habis") akan membuat dua
      definisi masa manfaat hidup berdampingan, dan pada hari keduanya
      berselisih, notifikasi ini menagih baris yang halaman Aset sendiri tak
      mau membuatnya.
    */
    const punyaBaris = new Set(
      (susut ?? [])
        .filter((s) => String(s.periode ?? '').slice(0, 7) === periodeLalu)
        .map((s) => s.asset_id as string),
    )

    const belumHitung: Array<{ kode: string; nama: string; beban: number }> = []
    for (const a of aset ?? []) {
      if (a.status === 'dijual') continue
      const umur = Number(a.useful_life_months ?? 0)
      const harga = Number(a.purchase_price ?? 0)
      if (!a.purchase_date || umur <= 0 || harga <= 0) continue

      const beban = bebanPeriode({
        hargaPerolehan: harga,
        nilaiResidu:    Number(a.residual_value ?? 0),
        umurBulan:      umur,
        metode:         (a.depreciation_method as 'garis_lurus' | 'saldo_menurun')
                        ?? 'garis_lurus',
        tanggalPerolehan: String(a.purchase_date),
      }, thLalu, blLalu)

      // Nol beban berarti periode itu DI LUAR masa manfaat — bukan kelalaian.
      if (beban <= 0) continue
      if (punyaBaris.has(a.id as string)) continue

      belumHitung.push({
        kode: String(a.asset_code ?? '—'),
        nama: String(a.name ?? '—'),
        beban,
      })
    }

    const belumJurnal = (susut ?? []).filter((s) => !s.journal_entry_id)
    const nilaiBelumJurnal = belumJurnal.reduce((t, s) => t + Number(s.nilai ?? 0), 0)
    const periodeBelumJurnal = [...new Set(
      belumJurnal.map((s) => String(s.periode ?? '').slice(0, 7)),
    )].sort()

    let dibuat = 0

    // ── Temuan 1: buku periode lalu belum ditutup
    if (belumHitung.length > 0 && tanggalKini >= ambangTanggal
        && !sudah('penyusutan_belum_dihitung', periodeLalu)) {
      const totalBeban = belumHitung.reduce((t, b) => t + b.beban, 0)
      const penerima = await resolveRecipients('penyusutan_belum_dihitung', {
        projectId: null, companyId: request.companyId!,
      })

      for (const uid of penerima) {
        await createNotification({
          company_id: request.companyId!,
          user_id:    uid,
          title:      `Penyusutan ${periodeLalu} Belum Dihitung`,
          message:
            `${belumHitung.length} alat belum punya catatan penyusutan untuk `
            + `${periodeLalu}, kira-kira ${rp(totalBeban)}. `
            + `Contohnya ${belumHitung.slice(0, 3).map((b) => b.kode).join(', ')}`
            + `${belumHitung.length > 3 ? ', dan lainnya' : ''}. `
            + 'Selama belum dihitung, biaya alat terlihat lebih kecil daripada '
            + 'yang sebenarnya.',
          type:       'penyusutan_belum_dihitung',
          priority:   'high',
          project_id: undefined,
          action_url: '/aset',
          action_data: {
            record_id: periodeLalu,
            periode: periodeLalu,
            aset: belumHitung.length,
            perkiraan_beban: totalBeban,
          },
        })
        dibuat++
      }
    }

    // ── Temuan 2: sudah dihitung, belum sampai ke buku besar
    if (belumJurnal.length > 0 && !sudah('penyusutan_belum_dijurnal', 'tertunda')) {
      const penerima = await resolveRecipients('penyusutan_belum_dijurnal', {
        projectId: null, companyId: request.companyId!,
      })

      for (const uid of penerima) {
        await createNotification({
          company_id: request.companyId!,
          user_id:    uid,
          title:      'Penyusutan Sudah Dihitung Tapi Belum Masuk Buku Besar',
          message:
            `${belumJurnal.length} catatan penyusutan senilai ${rp(nilaiBelumJurnal)} `
            + `(periode ${periodeBelumJurnal.join(', ')}) belum dijurnalkan. `
            + 'Angkanya sudah terlihat di halaman Aset tetapi belum masuk neraca — '
            + 'jadi laporan keuangan menampilkan nilai alat yang lebih tinggi '
            + 'daripada yang sebenarnya.',
          type:       'penyusutan_belum_dijurnal',
          // Lebih mendesak daripada temuan pertama: yang ini membuat laporan
          // TERLIHAT benar sambil salah, dan tak ada galat yang menunjuknya.
          priority:   'urgent',
          project_id: undefined,
          action_url: '/aset',
          action_data: {
            record_id: 'tertunda',
            baris: belumJurnal.length,
            nilai: nilaiBelumJurnal,
            periode: periodeBelumJurnal,
          },
        })
        dibuat++
      }
    }

    return reply.send({
      success: true, notifications_created: dibuat,
      checked: {
        periode_ditagih: periodeLalu,
        aset_belum_dihitung: belumHitung.length,
        baris_belum_dijurnal: belumJurnal.length,
        nilai_belum_dijurnal: nilaiBelumJurnal,
        // Dilaporkan EKSPLISIT supaya "0 notifikasi" pada tanggal 3 tak
        // terbaca sebagai "bukunya sudah beres".
        tanggal_hari_ini: tanggalKini,
        ambang_tanggal: ambangTanggal,
      },
    })
  })

  // ── GET /api/v1/otomasi/jalankan/perawatan-alat ──────────────────────────
  //
  // Automation 10.7 — Equipment Maintenance & Certification.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // NAMANYA "PERAWATAN & SERTIFIKASI", BUKAN "SERTIFIKASI" SAJA
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Katalog menyebutnya *Equipment Certification Expiry*, dan membacanya
  // harfiah menuntun ke kolom `assets.sertifikat_berakhir` yang TIDAK ADA —
  // tak ada satu pun kolom kedaluwarsa sertifikat di seluruh tabel `assets`.
  //
  // Yang ada, dan ISINYA nyata: `jadwal_perawatan`. Sertifikasi tersimpan di
  // sana sebagai jadwal berulang — terukur satu baris bernama
  // "Sertifikasi SILO Depnaker", `setiap_hari` 365.
  //
  // Jadi bentuk datanya menyatakan sendiri: sertifikasi ADALAH perawatan
  // berkala di sistem ini. Membangunnya sebagai dua otomasi terpisah akan
  // membaca tabel yang sama dua kali untuk mengirim dua pesan yang sama.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // JAM ATAU HARI — YANG LEBIH DULU TERCAPAI
  // ══════════════════════════════════════════════════════════════════════════
  //
  // `hitungJatuhTempo()` sudah memutuskan itu, dan ia dipakai apa adanya.
  // Excavator yang menganggur sebulan tak butuh ganti oli; yang bekerja 300
  // jam butuh — meski kalendernya baru setengah jalan.
  //
  // Meter terkini diturunkan dari `pemakaian_alat.jam_selesai` TERTINGGI,
  // bukan yang terbaru menurut tanggal — persis seperti halaman
  // `/aset/operasional`. Entri mundur (salah ketik, koreksi) tak boleh membuat
  // alat terlihat "belum waktunya diservis".
  //
  // ── Temuan kedua: alat yang tak punya jadwal sama sekali
  //
  // Terukur 12 dari 16 alat milik sendiri yang siap pakai tak punya satu pun
  // jadwal perawatan aktif. Otomasi yang hanya membaca jadwal akan melaporkan
  // alat-alat itu SEHAT selamanya — bukan karena terawat, melainkan karena tak
  // ada yang pernah menuliskan kapan ia harus dirawat.
  //
  // Diam pada kasus itu adalah kegagalan yang paling mahal: ia terlihat persis
  // seperti keberhasilan.
  app.get('/api/v1/otomasi/jalankan/perawatan-alat', {
    preHandler: [authenticate, requirePermission('notifications:milestone:check')],
  }, async (request, reply) => {
    const { createNotification } = await import('../../utils/notifications.js')
    const { resolveRecipients } = await import('../../utils/notification-routing.js')
    const { hitungJatuhTempo } = await import('../../lib/alat-operasional.js')

    const q = request.query as { hari?: string }
    const ambangHari = await ambilAmbang(request, 'otomasi.perawatan_alat.hari', q.hari)

    const today = new Date().toISOString().split('T')[0]
    const sudah = await pembuatDedup(request, today,
      ['perawatan_alat_jatuh_tempo', 'alat_tanpa_jadwal_perawatan'])

    // `assets`, `jadwal_perawatan`, `pemakaian_alat` — ketiganya kategori B.
    const { data: aset, error } = await request.db!
      .from('assets')
      .select('id, asset_code, name, status, ownership, current_project_id')

    if (error) return reply.status(500).send({ error: error.message })

    const { data: jadwal, error: eJadwal } = await request.db!
      .from('jadwal_perawatan')
      .select(`id, asset_id, nama, jenis, setiap_jam, setiap_hari, jam_terakhir,
               tanggal_terakhir, aktif`)
      .eq('aktif', true)

    if (eJadwal) return reply.status(500).send({ error: eJadwal.message })

    const { data: pakai, error: ePakai } = await request.db!
      .from('pemakaian_alat')
      .select('asset_id, jam_selesai')

    if (ePakai) return reply.status(500).send({ error: ePakai.message })

    // Meter terkini per aset = pembacaan TERTINGGI.
    const meter = new Map<string, number>()
    for (const p of pakai ?? []) {
      const s = p.jam_selesai == null ? null : Number(p.jam_selesai)
      if (s == null || !Number.isFinite(s)) continue
      const id = p.asset_id as string
      meter.set(id, Math.max(meter.get(id) ?? s, s))
    }

    const namaAset = new Map<string, { kode: string; nama: string; proyek: string | null }>()
    for (const a of aset ?? []) {
      namaAset.set(a.id as string, {
        kode: String(a.asset_code ?? '—'),
        nama: String(a.name ?? '—'),
        proyek: (a.current_project_id as string | null) ?? null,
      })
    }

    let dibuat = 0
    let lewat = 0
    let segera = 0

    for (const j of jadwal ?? []) {
      const idAset = j.asset_id as string
      const hasil = hitungJatuhTempo(
        j as never, meter.get(idAset) ?? null, today,
      )

      /*
        `belum_ada_acuan` sengaja DILEWATI tanpa notifikasi sendiri.

        Jadwal yang tak punya `tanggal_terakhir` maupun pembacaan jam bukan
        alat yang terlambat dirawat — ia jadwal yang belum pernah dipakai.
        Menegurnya tiap hari tak menghasilkan tindakan, hanya kebisingan.
      */
      if (hasil.status === 'belum_ada_acuan') continue

      /*
        ANGKA YANG DILAPORKAN HARUS ANGKA YANG MEMICU.

        Versi pertama memeriksa jam DAN hari lalu selalu menulis sisa HARI di
        pesannya. Hasilnya terbaca di basis nyata:

          [URGENT] Perawatan Alat Jatuh Tempo
          Excavator 20 Ton — "Ganti oli mesin & filter" 154 hari lagi.

        Yang memicu adalah meter jam yang sudah melewati 1.250, dan itu benar.
        Tetapi orang yang membacanya melihat "154 hari lagi" berlabel URGENT
        dan menyimpulkan sistemnya rusak — lalu berhenti mempercayai seluruh
        peringatan perawatan, termasuk yang benar.

        `hitungJatuhTempo()` sudah memutuskan mana yang lebih dulu tercapai dan
        menyatakannya di `pemicu`. Itu yang dipakai, bukan ditebak ulang.
      */
      const sisaHari = hasil.sisaHari
      const sisaJam = hasil.sisaJam
      const pakaiJam = hasil.pemicu === 'jam'
      const sisa = pakaiJam ? sisaJam : sisaHari
      if (sisa == null) continue

      /*
        Jam TAK punya padanan "N hari sebelum".

        Ambang hari bisa dibaca sebagai kalender; ambang jam tidak — 14 jam
        operasi bisa habis dalam dua hari atau dua bulan tergantung alatnya.
        Jadi untuk jalur jam ambangnya nol: yang sudah melewati jam servisnya
        sudah terlambat, titik.
      */
      if (!(pakaiJam ? sisa <= 0 : sisa <= ambangHari)) continue

      const terlambat = sisa < 0
      if (terlambat) lewat++
      else segera++

      if (sudah('perawatan_alat_jatuh_tempo', j.id as string)) continue

      const a = namaAset.get(idAset)
      const penerima = await resolveRecipients('perawatan_alat_jatuh_tempo', {
        projectId: a?.proyek ?? null, companyId: request.companyId!,
      })

      /*
        Sertifikasi diberi kalimatnya sendiri.

        "Servis terlambat 14 hari" berarti alatnya makin aus. "Sertifikat
        kedaluwarsa 14 hari" berarti alatnya ILEGAL dipakai, dan yang
        menanggung akibatnya bukan bengkel melainkan proyek. Menyamakan
        keduanya membuat yang kedua terbaca seperti urusan pemeliharaan biasa.
      */
      const sertifikat = /sertifikas|sertifikat|kalibrasi|izin|silo|depnaker/i
        .test(String(j.nama ?? ''))

      const satuan = pakaiJam ? 'jam operasi' : 'hari'
      const kapan = sisa < 0 ? `lewat ${Math.abs(sisa)} ${satuan}`
        : sisa === 0 ? (pakaiJam ? 'jatuh tempo pada jam operasi SEKARANG'
                                 : 'jatuh tempo HARI INI')
        : `${sisa} ${satuan} lagi`

      for (const uid of penerima) {
        await createNotification({
          company_id: request.companyId!,
          user_id:    uid,
          title:      sertifikat ? 'Sertifikasi Alat Perlu Diperpanjang'
                                 : 'Perawatan Alat Jatuh Tempo',
          message:
            `${a?.nama ?? 'Alat'} (${a?.kode ?? '—'}) — "${j.nama}" ${kapan}.`
            + (sertifikat
              ? ' Sesudah tanggal itu alatnya tidak boleh dioperasikan sampai'
                + ' sertifikatnya diperbarui.'
              : ''),
          type:       'perawatan_alat_jatuh_tempo',
          priority:   terlambat ? 'urgent' : sertifikat ? 'high' : 'normal',
          project_id: a?.proyek ?? undefined,
          action_url: '/aset/operasional',
          action_data: {
            record_id: j.id as string,
            asset_id: idAset,
            sisa_hari: sisaHari,
            sisa_jam: sisaJam,
            pemicu: hasil.pemicu,
            sertifikasi: sertifikat,
          },
        })
        dibuat++
      }
    }

    /*
      Alat siap pakai TANPA satu pun jadwal aktif.

      Hanya `ownership = 'milik'`: alat sewaan dirawat pemiliknya, dan menagih
      jadwal perawatan untuk alat orang lain adalah menagih pekerjaan yang
      bukan milik penerimanya.
    */
    const punyaJadwal = new Set((jadwal ?? []).map((j) => j.asset_id as string))
    const tanpaJadwal = (aset ?? []).filter((a) =>
      a.ownership === 'milik'
      && (a.status === 'dipakai' || a.status === 'tersedia')
      && !punyaJadwal.has(a.id as string))

    if (tanpaJadwal.length > 0 && !sudah('alat_tanpa_jadwal_perawatan', today)) {
      const penerima = await resolveRecipients('alat_tanpa_jadwal_perawatan', {
        projectId: null, companyId: request.companyId!,
      })

      for (const uid of penerima) {
        await createNotification({
          company_id: request.companyId!,
          user_id:    uid,
          title:      'Alat Belum Punya Jadwal Perawatan',
          message:
            `${tanpaJadwal.length} alat milik sendiri yang siap pakai belum punya `
            + 'satu pun jadwal perawatan: '
            + `${tanpaJadwal.slice(0, 4).map((a) => a.asset_code).join(', ')}`
            + `${tanpaJadwal.length > 4 ? ', dan lainnya' : ''}. `
            + 'Selama jadwalnya kosong, alat-alat ini akan terus terlihat sehat '
            + 'di laporan — bukan karena terawat, melainkan karena tak ada yang '
            + 'pernah menuliskan kapan ia harus dirawat.',
          type:       'alat_tanpa_jadwal_perawatan',
          priority:   'normal',
          project_id: undefined,
          action_url: '/aset/operasional',
          action_data: {
            record_id: today,
            alat: tanpaJadwal.length,
            kode: tanpaJadwal.slice(0, 10).map((a) => a.asset_code),
          },
        })
        dibuat++
      }
    }

    return reply.send({
      success: true, notifications_created: dibuat,
      checked: {
        jadwal_aktif: (jadwal ?? []).length,
        lewat_tempo: lewat,
        segera: segera,
        // Dilaporkan EKSPLISIT: inilah alat yang TAK BISA dinilai sama sekali,
        // dan tanpa angka ini "0 lewat tempo" terbaca sebagai kabar baik.
        alat_tanpa_jadwal: tanpaJadwal.length,
        ambang_hari: ambangHari,
      },
    })
  })

  // ── GET /api/v1/otomasi/jalankan/konflik-mandor ──────────────────────────
  //
  // Automation 3.9 — Resource Conflict Detection.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // MANDOR SAJA. ALAT SENGAJA DIKELUARKAN, DAN ITU DIUKUR
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Katalog menyebut "resource" — orang DAN alat. Sisi alat dibuang setelah
  // empat pengukuran, seluruhnya nol baris:
  //
  //   pemakaian sama-hari lintas proyek untuk aset sama    0
  //   rentang pemakaian per aset+proyek yang tumpang       0
  //   aset dipakai di lebih dari satu proyek (kapan pun)   0
  //   aset keluar ke lebih dari satu proyek tujuan         0
  //
  // Sebabnya struktural, bukan kebetulan: alokasi alat disimpan sebagai
  // `assets.current_project_id` — SATU pointer. Sebuah alat tak bisa menunjuk
  // dua proyek sekaligus, jadi "dialokasikan ganda" mustahil dinyatakan.
  // `asset_rentals` punya rentang tanggal yang bisa tumpang tindih, dan ia nol
  // baris.
  //
  // Membangunnya tetap akan menghasilkan rute yang memicu nol selamanya, lalu
  // dilaporkan sebagai "otomasi konflik sudah ada".
  //
  // ══════════════════════════════════════════════════════════════════════════
  // RENTANGNYA DARI `work_scopes`, BUKAN `mandor_assignments`
  // ══════════════════════════════════════════════════════════════════════════
  //
  // `mandor_assignments` hanya punya `assigned_at` — satu tanggal mulai, tanpa
  // akhir. Tumpang tindih tak bisa dihitung dari sana. Yang punya rentang
  // adalah `work_scopes.start_date`/`end_date`, dan keduanya terisi 20 dari 20.
  //
  // ── Kenapa BUKAN `CURRENT_DATE BETWEEN start AND end`
  //
  // Itu cara paling naif dan ia menyusutkan hasil jadi SATU mandor. Lebih
  // penting: peringatan yang baru datang saat bentroknya sudah terjadi tak
  // menolong siapa pun — mandornya sudah berada di dua tempat.
  //
  // Yang dipakai: tumpang tindihnya BELUM SELESAI (`akhir >= hari ini`). Itu
  // menangkap bentrok yang masih bisa dihindari dengan menggeser jadwal.
  //
  //   Terukur 2026-08-16: 21 pasangan (5 mandor) tanpa saringan status,
  //   15 pasangan bila kedua sisi harus aktif.
  app.get('/api/v1/otomasi/jalankan/konflik-mandor', {
    preHandler: [authenticate, requirePermission('notifications:milestone:check')],
  }, async (request, reply) => {
    const { createNotification } = await import('../../utils/notifications.js')
    const { resolveRecipients } = await import('../../utils/notification-routing.js')

    const q = request.query as { hari?: string }
    const ambangHari = await ambilAmbang(request, 'otomasi.konflik_mandor.hari', q.hari)

    const today = new Date().toISOString().split('T')[0]
    const sudah = await pembuatDedup(request, today, ['konflik_mandor'])

    /*
      `projects` ANCHOR → `mandor_assignments` (C lewat `project_id`) →
      `work_scopes` (C lewat `assignment_id`).

      `work_scopes` TIDAK punya `project_id`, jadi `.viaProject()` tak berlaku
      padanya — rantainya harus ditempuh lewat penugasan. Beberapa rute lama di
      `mandor.ts` memakai `supabase` mentah untuk tabel ini; itu bukan pola
      yang ditiru di sini.
    */
    const { data: proyek, error } = await request.db!
      .from('projects')
      .select('id, name')

    if (error) return reply.status(500).send({ error: error.message })

    const idProyek = (proyek ?? []).map((p) => p.id as string)
    const namaProyek = new Map((proyek ?? []).map((p) => [p.id as string, String(p.name ?? '—')]))

    if (idProyek.length === 0) {
      return reply.send({
        success: true, notifications_created: 0,
        checked: { pasangan_bentrok: 0, mandor_bentrok: 0, ambang_hari: ambangHari },
      })
    }

    const { data: tugas, error: eTugas } = await request.db!
      .unsafe('mandor_assignments',
        'kategori C lewat project_id; disaring ke id proyek dari query ter-scope tenant di atas')
      .select('id, project_id, mandor_id, status')
      .in('project_id', idProyek)
      .eq('status', 'active')

    if (eTugas) return reply.status(500).send({ error: eTugas.message })

    const idTugas = (tugas ?? []).map((t) => t.id as string)
    if (idTugas.length === 0) {
      return reply.send({
        success: true, notifications_created: 0,
        checked: { pasangan_bentrok: 0, mandor_bentrok: 0, ambang_hari: ambangHari },
      })
    }

    const { data: lingkup, error: eLingkup } = await request.db!
      .unsafe('work_scopes',
        'kategori C berhop-jauh lewat assignment_id; disaring ke id penugasan ter-scope tenant di atas')
      .select('id, assignment_id, scope_name, start_date, end_date, status')
      .in('assignment_id', idTugas)
      .eq('status', 'active')

    if (eLingkup) return reply.status(500).send({ error: eLingkup.message })

    /*
      `users` kategori D — identitas lintas-tenant. Namanya diambil TERBATAS
      pada mandor yang penugasannya sudah lewat saringan di atas, jadi tak ada
      nama dari tenant lain yang bisa masuk ke isi notifikasi.
    */
    const idMandor = [...new Set((tugas ?? []).map((t) => t.mandor_id as string))]
    const { data: orang, error: eOrang } = await request.db!
      .unsafe('users', 'kategori D identitas; dibatasi ke mandor dari penugasan ter-scope di atas')
      .select('id, name')
      .in('id', idMandor)

    if (eOrang) return reply.status(500).send({ error: eOrang.message })
    const namaMandor = new Map((orang ?? []).map((u) => [u.id as string, String(u.name ?? '—')]))

    // Lingkup + proyek + mandornya, siap dibandingkan berpasangan.
    const tugasKe = new Map((tugas ?? []).map((t) => [t.id as string, t]))
    type Baris = {
      id: string; mandor: string; proyek: string; nama: string
      mulai: string; akhir: string
    }
    const baris: Baris[] = []
    for (const w of lingkup ?? []) {
      const t = tugasKe.get(w.assignment_id as string)
      if (!t) continue
      const mulai = String(w.start_date ?? '').slice(0, 10)
      const akhir = String(w.end_date ?? '').slice(0, 10)
      // Tanpa rentang, tumpang tindih tak bisa dinyatakan — dilewati, bukan
      // ditebak dengan tanggal penugasan.
      if (!mulai || !akhir) continue
      baris.push({
        id: w.id as string,
        mandor: t.mandor_id as string,
        proyek: t.project_id as string,
        nama: String(w.scope_name ?? '—'),
        mulai, akhir,
      })
    }

    const hariAntara = (a: string, b: string) =>
      Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)

    let dibuat = 0
    let pasangan = 0
    const mandorBentrok = new Set<string>()

    for (let i = 0; i < baris.length; i++) {
      for (let k = i + 1; k < baris.length; k++) {
        const a = baris[i]
        const b = baris[k]
        if (a.mandor !== b.mandor) continue
        // Dua lingkup di proyek yang SAMA bukan bentrok — itu memang satu
        // penugasan yang dipecah beberapa pekerjaan.
        if (a.proyek === b.proyek) continue

        const mulaiTumpang = a.mulai > b.mulai ? a.mulai : b.mulai
        const akhirTumpang = a.akhir < b.akhir ? a.akhir : b.akhir
        if (mulaiTumpang > akhirTumpang) continue

        const lama = hariAntara(mulaiTumpang, akhirTumpang) + 1
        // Serah-terima beberapa hari antar proyek itu normal di lapangan.
        if (lama < ambangHari) continue
        // Yang tumpang tindihnya sudah lewat tak bisa diperbaiki lagi.
        if (akhirTumpang < today) continue

        pasangan++
        mandorBentrok.add(a.mandor)

        // Kunci pasangan diurutkan supaya A–B dan B–A tak jadi dua notifikasi.
        const kunci = [a.id, b.id].sort().join('_')
        if (sudah('konflik_mandor', kunci)) continue

        const penerima = await resolveRecipients('konflik_mandor', {
          projectId: a.proyek, companyId: request.companyId!,
        })

        const belumMulai = mulaiTumpang > today

        for (const uid of penerima) {
          await createNotification({
            company_id: request.companyId!,
            user_id:    uid,
            title:      'Mandor Dipegang Dua Proyek Sekaligus',
            message:
              `${namaMandor.get(a.mandor) ?? 'Mandor'} memegang `
              + `"${a.nama}" di ${namaProyek.get(a.proyek)} dan `
              + `"${b.nama}" di ${namaProyek.get(b.proyek)} `
              + `yang bertabrakan ${lama} hari `
              + `(${mulaiTumpang} s.d. ${akhirTumpang}). `
              + (belumMulai
                ? 'Tabrakannya belum mulai — jadwalnya masih bisa digeser.'
                : 'Tabrakannya sudah berjalan.'),
            type:       'konflik_mandor',
            // Yang belum mulai masih bisa dihindari; yang sudah berjalan
            // menuntut keputusan hari ini juga.
            priority:   belumMulai ? 'normal' : 'high',
            project_id: a.proyek,
            action_url: '/mandor/penugasan',
            action_data: {
              record_id: kunci,
              mandor_id: a.mandor,
              proyek: [a.proyek, b.proyek],
              hari_tumpang: lama,
              mulai_tumpang: mulaiTumpang,
              akhir_tumpang: akhirTumpang,
            },
          })
          dibuat++
        }
      }
    }

    return reply.send({
      success: true, notifications_created: dibuat,
      checked: {
        lingkup_aktif: baris.length,
        pasangan_bentrok: pasangan,
        mandor_bentrok: mandorBentrok.size,
        ambang_hari: ambangHari,
      },
    })
  })

  // ── GET /api/v1/otomasi/jalankan/rab-harga-menyimpang ────────────────────
  //
  // Automation 3.12 — RAB Component Anomaly Detection.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // ANGKA PALING MENCOLOK DI BASIS INI JUSTRU YANG SALAH
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Diukur lebih dulu, seluruh item yang namanya sama di lebih dari satu
  // proyek, diurutkan menurut rasio harga tertinggi:
  //
  //     Air Kerja              ls    Rp    800.000 → Rp 10.000.000   12,50×
  //     Listrik kerja          ls    Rp  1.200.000 → Rp 12.000.000   10,00×
  //     Kebersihan lokasi      ls    Rp  2.000.000 → Rp  5.000.000    2,50×
  //     Pengecatan Interior    m²    Rp     30.000 → Rp     46.000    1,53×
  //     Sumur Bor              m     Rp    350.000 → Rp    500.000    1,43×
  //     Pasang bouwplank       m'    Rp     72.290 → Rp    100.000    1,38×
  //
  // Tiga teratas satuannya `ls` — LUMP SUM. Harganya memang menskala dengan
  // besar proyek: air kerja Rp 800 ribu untuk renovasi dapur dan Rp 10 juta
  // untuk gedung bukan penyimpangan, itu aritmetika.
  //
  // Kalau `ls` ikut dibandingkan, tiga temuan paling nyaring adalah tiga
  // temuan yang paling salah — dan orang yang memeriksanya sekali lalu
  // menemukan ketiganya wajar akan berhenti memeriksa yang keempat.
  //
  // Maka `ls` DIKELUARKAN, dan itu dinyatakan di sini karena ia membuang
  // angka terbesar dengan sengaja.
  //
  // Sisanya bersatuan ukur — m², m, m', kg — dan satu meter persegi cat
  // tembok interior adalah satu meter persegi cat tembok interior di proyek
  // mana pun. Terukur 3 temuan hari ini.
  //
  // ── Yang dibandingkan HARGA SATUAN, bukan total
  //
  // Total berbeda karena volumenya berbeda; itu bukan kabar. Yang jadi
  // pertanyaan kenapa satu meter persegi dihargai berbeda.
  app.get('/api/v1/otomasi/jalankan/rab-harga-menyimpang', {
    preHandler: [authenticate, requirePermission('notifications:milestone:check')],
  }, async (request, reply) => {
    const { createNotification } = await import('../../utils/notifications.js')
    const { resolveRecipients } = await import('../../utils/notification-routing.js')

    const q = request.query as { rasio?: string }
    const ambangRasio = await ambilAmbang(request, 'otomasi.rab_anomali.rasio', q.rasio)

    const today = new Date().toISOString().split('T')[0]
    const sudah = await pembuatDedup(request, today, ['rab_harga_menyimpang'])

    const idProyek = await request.db!.projectIds()
    if (idProyek.length === 0) {
      return reply.send({
        success: true, notifications_created: 0,
        checked: { item_dibandingkan: 0, menyimpang: 0, ambang_rasio: ambangRasio },
      })
    }

    /*
      `rab_items` kategori C lewat `project_id`.

      Dibaca BERHALAMAN: 377 baris hari ini masih di bawah batas potong senyap
      PostgREST di 1.000, tetapi RAB tumbuh per proyek — dan pemotongan itu
      akan membuat perbandingan lintas-proyek kehilangan sisi pembandingnya
      tanpa satu pun galat. Yang hilang justru anomali di proyek terakhir.
    */
    const HALAMAN = 1000
    const item: Array<Record<string, unknown>> = []
    for (let dari = 0; ; dari += HALAMAN) {
      const { data, error } = await request.db!
        .unsafe('rab_items', 'kategori C lewat project_id; disaring ke projectIds() milik tenant')
        .select('id, project_id, name, unit, unit_price, qty')
        .in('project_id', idProyek)
        .gt('unit_price', 0)
        .order('id', { ascending: true })
        .range(dari, dari + HALAMAN - 1)

      if (error) return reply.status(500).send({ error: error.message })
      if (!data || data.length === 0) break
      item.push(...(data as Array<Record<string, unknown>>))
      if (data.length < HALAMAN) break
    }

    const { data: proyek, error: eProyek } = await request.db!
      .from('projects')
      .select('id, name')
    if (eProyek) return reply.status(500).send({ error: eProyek.message })
    const namaProyek = new Map((proyek ?? []).map((p) => [p.id as string, String(p.name ?? '—')]))

    /*
      Satuan yang TIDAK dibandingkan.

      `ls` lump sum · `unit`/`unit` borongan per-titik · kosong. Ketiganya
      tidak menyatakan ukuran, jadi dua angkanya tak sebanding walau namanya
      sama.
    */
    const SATUAN_TAK_SEBANDING = new Set(['ls', 'lot', 'paket', 'set', ''])

    type Kelompok = { nama: string; satuan: string; baris: Array<{ p: string; h: number }> }
    const kelompok = new Map<string, Kelompok>()
    for (const r of item) {
      const satuan = String(r.unit ?? '').trim().toLowerCase()
      if (SATUAN_TAK_SEBANDING.has(satuan)) continue
      const nama = String(r.name ?? '').trim()
      if (!nama) continue
      const kunci = `${nama.toLowerCase()}|${satuan}`
      const k = kelompok.get(kunci) ?? { nama, satuan, baris: [] }
      k.baris.push({ p: r.project_id as string, h: Number(r.unit_price ?? 0) })
      kelompok.set(kunci, k)
    }

    let dibandingkan = 0
    let menyimpang = 0
    let dibuat = 0

    for (const [kunci, k] of kelompok) {
      // Butuh sedikitnya DUA proyek berbeda — dua baris di proyek yang sama
      // adalah dua item RAB, bukan dua harga untuk pekerjaan yang sama.
      const perProyek = new Map<string, number>()
      for (const b of k.baris) {
        const ada = perProyek.get(b.p)
        // Harga TERTINGGI per proyek dipakai: kalau satu proyek punya dua
        // baris bernama sama, yang mahal yang jadi pertanyaan.
        perProyek.set(b.p, ada == null ? b.h : Math.max(ada, b.h))
      }
      if (perProyek.size < 2) continue
      dibandingkan++

      const nilai = [...perProyek.entries()]
      const min = nilai.reduce((a, b) => (b[1] < a[1] ? b : a))
      const max = nilai.reduce((a, b) => (b[1] > a[1] ? b : a))
      if (min[1] <= 0) continue

      const rasio = Math.round((max[1] / min[1]) * 100) / 100
      if (rasio < ambangRasio) continue
      menyimpang++

      if (sudah('rab_harga_menyimpang', kunci)) continue

      const penerima = await resolveRecipients('rab_harga_menyimpang', {
        projectId: max[0], companyId: request.companyId!,
      })

      for (const uid of penerima) {
        await createNotification({
          company_id: request.companyId!,
          user_id:    uid,
          title:      'Harga Satuan Berbeda Jauh Antar Proyek',
          message:
            `"${k.nama}" (per ${k.satuan}) dihargai ${rp(min[1])} di `
            + `${namaProyek.get(min[0])} tetapi ${rp(max[1])} di `
            + `${namaProyek.get(max[0])} — ${rasio}× lipat. `
            + 'Satu di antaranya kemungkinan salah, dan yang kemahalan '
            + 'memakan margin sementara yang kemurahan dibayar sendiri.',
          type:       'rab_harga_menyimpang',
          priority:   rasio >= ambangRasio * 2 ? 'high' : 'normal',
          project_id: max[0],
          action_url: `/proyek/${max[0]}`,
          action_data: {
            record_id: kunci,
            item: k.nama, satuan: k.satuan, rasio,
            termurah: min[1], termahal: max[1],
            proyek_termurah: min[0], proyek_termahal: max[0],
          },
        })
        dibuat++
      }
    }

    return reply.send({
      success: true, notifications_created: dibuat,
      checked: {
        item_dibandingkan: dibandingkan,
        menyimpang,
        // Dilaporkan EKSPLISIT: berapa item yang sengaja TIDAK dibandingkan
        // karena satuannya tak menyatakan ukuran. Tanpa angka ini, "3 temuan"
        // terbaca seolah seluruh RAB sudah diperiksa.
        satuan_tak_sebanding_dilewati:
          item.filter((r) => SATUAN_TAK_SEBANDING.has(
            String(r.unit ?? '').trim().toLowerCase())).length,
        ambang_rasio: ambangRasio,
      },
    })
  })

  // ── GET /api/v1/otomasi/jalankan/upah-menyimpang ─────────────────────────
  //
  // Automation 6.4 — Wage Report Anomaly Check.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // PEMBANDINGNYA RIWAYAT LINGKUP ITU SENDIRI, BUKAN RATA-RATA SEMUA ORANG
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Sebaran upah mingguan terukur sangat lebar: rata-rata Rp 5,67 juta dengan
  // simpangan baku Rp 3,82 juta. Membandingkan satu laporan dengan rata-rata
  // SELURUH perusahaan berarti menandai hampir semua hal — pekerjaan struktur
  // dengan 12 tukang memang berlipat dibanding finishing dengan 3.
  //
  // Maka pembandingnya lingkup kerja ITU SENDIRI: berapa yang biasanya
  // dibayarkan minggu-minggu sebelumnya untuk pekerjaan yang sama, oleh mandor
  // yang sama.
  //
  // ── MEDIAN, bukan rata-rata
  //
  // Satu minggu lembur besar akan menarik rata-rata naik dan membuat minggu
  // berikutnya yang normal terlihat "kekecilan". Median tak bergerak oleh satu
  // pencilan — dan pencilan adalah justru yang sedang dicari.
  //
  // ── Yang TAK BISA DINILAI dilaporkan, bukan dilewati diam-diam
  //
  // Terukur: dari laporan berstatus `submitted`, ada yang riwayat lingkupnya
  // NOL. Laporan itu tak bisa dibandingkan dengan apa pun — dan diam
  // terhadapnya membuat "0 anomali" terbaca sebagai "semuanya wajar".
  app.get('/api/v1/otomasi/jalankan/upah-menyimpang', {
    preHandler: [authenticate, requirePermission('notifications:milestone:check')],
  }, async (request, reply) => {
    const { createNotification } = await import('../../utils/notifications.js')
    const { resolveRecipients } = await import('../../utils/notification-routing.js')

    const q = request.query as { rasio?: string; riwayat?: string }
    const ambangRasio = await ambilAmbang(request, 'otomasi.upah_anomali.rasio', q.rasio)
    const minRiwayat = await ambilAmbang(request, 'otomasi.upah_anomali.riwayat', q.riwayat)

    const today = new Date().toISOString().split('T')[0]
    const sudah = await pembuatDedup(request, today, ['upah_menyimpang'])

    const idProyek = await request.db!.projectIds()
    if (idProyek.length === 0) {
      return reply.send({
        success: true, notifications_created: 0,
        checked: { menunggu_persetujuan: 0, menyimpang: 0, ambang_rasio: ambangRasio },
      })
    }

    const { data: tugas, error: eTugas } = await request.db!
      .unsafe('mandor_assignments',
        'kategori C lewat project_id; disaring ke projectIds() milik tenant')
      .select('id, project_id, mandor_id')
      .in('project_id', idProyek)

    if (eTugas) return reply.status(500).send({ error: eTugas.message })
    const idTugas = (tugas ?? []).map((t) => t.id as string)
    if (idTugas.length === 0) {
      return reply.send({
        success: true, notifications_created: 0,
        checked: { menunggu_persetujuan: 0, menyimpang: 0, ambang_rasio: ambangRasio },
      })
    }

    /*
      `weekly_wage_reports` kategori C lewat `assignment_id` — tabel berhop
      jauh, jadi `.viaProject()` tak berlaku. Disaring ke id penugasan yang
      sudah lewat scope tenant di atas.
    */
    const { data: laporan, error } = await request.db!
      .unsafe('weekly_wage_reports',
        'kategori C berhop-jauh lewat assignment_id; disaring ke penugasan ter-scope di atas')
      .select('id, assignment_id, scope_id, week_start, week_end, status, net_amount')
      .in('assignment_id', idTugas)

    if (error) return reply.status(500).send({ error: error.message })

    // Riwayat = laporan yang SUDAH dibayar untuk lingkup yang sama.
    const riwayat = new Map<string, number[]>()
    for (const l of laporan ?? []) {
      if (l.status !== 'paid') continue
      const sid = (l.scope_id as string | null) ?? ''
      if (!sid) continue
      const arr = riwayat.get(sid) ?? []
      arr.push(Number(l.net_amount ?? 0))
      riwayat.set(sid, arr)
    }

    const median = (a: number[]) => {
      const s = [...a].sort((x, y) => x - y)
      const t = Math.floor(s.length / 2)
      return s.length % 2 ? s[t] : (s[t - 1] + s[t]) / 2
    }

    const proyekTugas = new Map((tugas ?? []).map((t) => [t.id as string, t.project_id as string]))

    let menunggu = 0
    let takBisaDinilai = 0
    let menyimpang = 0
    let dibuat = 0

    for (const l of laporan ?? []) {
      if (l.status !== 'submitted') continue
      menunggu++

      const sid = (l.scope_id as string | null) ?? ''
      const r = riwayat.get(sid) ?? []
      if (r.length < minRiwayat) { takBisaDinilai++; continue }

      const acuan = median(r)
      if (acuan <= 0) { takBisaDinilai++; continue }

      const nilai = Number(l.net_amount ?? 0)

      /*
        Dibandingkan MENTAH, dibulatkan hanya untuk ditampilkan.

        Membulatkan lebih dulu menggeser ambangnya sampai 0,005 — dan pada
        basis ini selisih itu nyata: satu laporan berasio 0,66667 (Rp 2,8 jt
        lawan median Rp 4,2 jt) membulat jadi 0,67 dan lolos dari ambang
        1/1,5 = 0,66667. Ambang yang bergerak tergantung pembulatan bukan
        ambang.
      */
      const rasioMentah = nilai / acuan
      const rasio = Math.round(rasioMentah * 100) / 100
      // Menyimpang ke ATAS maupun ke BAWAH. Upah yang tiba-tiba separuh
      // biasanya berarti pekerjaan berhenti — kabar yang sama pentingnya
      // dengan upah yang tiba-tiba dobel.
      if (rasioMentah < ambangRasio && rasioMentah > 1 / ambangRasio) continue
      menyimpang++

      if (sudah('upah_menyimpang', l.id as string)) continue

      const pid = proyekTugas.get(l.assignment_id as string) ?? null
      const penerima = await resolveRecipients('upah_menyimpang', {
        projectId: pid, companyId: request.companyId!,
      })

      const arah = rasioMentah > 1 ? 'lebih besar' : 'lebih kecil'
      const lipat = rasioMentah > 1 ? rasio : Math.round((1 / rasioMentah) * 100) / 100

      for (const uid of penerima) {
        await createNotification({
          company_id: request.companyId!,
          user_id:    uid,
          title:      'Laporan Upah Menyimpang dari Kebiasaannya',
          message:
            `Laporan upah minggu ${String(l.week_start ?? '').slice(0, 10)} `
            + `sebesar ${rp(nilai)} — ${lipat}× ${arah} daripada biasanya `
            + `untuk pekerjaan yang sama (${rp(acuan)}, dari ${r.length} minggu `
            + 'sebelumnya). Periksa dulu sebelum menyetujui.',
          type:       'upah_menyimpang',
          // Ke ATAS lebih mendesak: uangnya keluar. Ke bawah pun perlu
          // diperiksa, tetapi ia tak memindahkan apa pun.
          priority:   rasioMentah > 1 ? 'high' : 'normal',
          project_id: pid ?? undefined,
          action_url: '/mandor/upah',
          action_data: {
            record_id: l.id as string,
            nilai, acuan, rasio, minggu_riwayat: r.length,
          },
        })
        dibuat++
      }
    }

    return reply.send({
      success: true, notifications_created: dibuat,
      checked: {
        menunggu_persetujuan: menunggu,
        menyimpang,
        // Dilaporkan EKSPLISIT: laporan yang riwayatnya terlalu tipis untuk
        // dinilai. Tanpa angka ini, "0 anomali" terbaca sebagai "semuanya
        // wajar" padahal sebagiannya belum pernah dibandingkan dengan apa pun.
        tak_bisa_dinilai: takBisaDinilai,
        ambang_rasio: ambangRasio,
        min_riwayat: minRiwayat,
      },
    })
  })

  // ── GET /api/v1/otomasi/jalankan/kontrak-klien-berakhir ──────────────────
  //
  // Automation 7.10 — Contract Renewal Reminder.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // NOMOR INI PERNAH SENGAJA TIDAK DIKLAIM — SEKARANG DIKERJAKAN SUNGGUHAN
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Otomasi `kontrak-payung-habis` dibangun TANPA nomor katalog, dan alasannya
  // ditulis di sana: 7.10 berbunyi *"peluang repeat business dari klien
  // existing"* — kontrak KLIEN, sementara kontrak payung adalah kontrak
  // PEMASOK. Arah uangnya berlawanan.
  //
  // Inilah 7.10 yang sebenarnya, dan test di
  // `otomasi-kontrak-payung.test.ts` yang menjaga pemisahan itu TETAP berlaku.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // INI PEKERJAAN PENJUALAN, BUKAN PERINGATAN OPERASIONAL
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Bedanya nyata dan menentukan bentuk pesannya. Proyek yang mendekati selesai
  // bukan masalah — ia peluang: kliennya sedang paling puas, paling sering
  // bertemu, dan paling mudah dihubungi. Sesudah serah terima, hubungan itu
  // mendingin dalam hitungan minggu.
  //
  // Maka pesannya menyebut nilai kontrak dan berapa proyek yang pernah
  // dikerjakan untuk klien itu — dua hal yang menentukan apakah percakapan
  // berikutnya layak dimulai, dan keduanya tak ada di layar mana pun secara
  // berdampingan.
  //
  // Terukur 14 proyek berakhir dalam rentang ±180 hari.
  app.get('/api/v1/otomasi/jalankan/kontrak-klien-berakhir', {
    preHandler: [authenticate, requirePermission('notifications:milestone:check')],
  }, async (request, reply) => {
    const { createNotification } = await import('../../utils/notifications.js')
    const { resolveRecipients } = await import('../../utils/notification-routing.js')

    const q = request.query as { hari?: string }
    const ambangHari = await ambilAmbang(request, 'otomasi.kontrak_klien.hari', q.hari)

    const today = new Date().toISOString().split('T')[0]
    const sudah = await pembuatDedup(request, today, ['kontrak_klien_berakhir'])

    // `projects` ANCHOR, `clients` kategori B — keduanya `.from()`.
    const { data: proyek, error } = await request.db!
      .from('projects')
      .select('id, name, status, end_date, contract_value, client_id')

    if (error) return reply.status(500).send({ error: error.message })

    const { data: klien, error: eKlien } = await request.db!
      .from('clients')
      .select('id, company_name, contact_person, phone')

    if (eKlien) return reply.status(500).send({ error: eKlien.message })
    /*
      NAMA klien: `company_name` ATAU `contact_person`.

      Terukur: seluruh 10 klien berjenis `perorangan`, dan `company_name`
      NULL di kesepuluhnya. Memakainya langsung menghasilkan kalimat
      "klien null" — yang terkirim sungguhan ke basis sebelum ini diperbaiki.

      Perusahaan konstruksi kecil bekerja untuk orang, bukan hanya badan
      usaha; kolom nama badan yang kosong adalah keadaan NORMAL di sini,
      bukan data rusak.
    */
    const namaKlien = new Map((klien ?? []).map((k) => [k.id as string, k]))
    const sebutKlien = (k?: { company_name?: unknown; contact_person?: unknown } | null) => {
      const badan = String(k?.company_name ?? '').trim()
      const orang = String(k?.contact_person ?? '').trim()
      return badan || orang || ''
    }

    // Berapa proyek yang pernah dikerjakan untuk tiap klien — dihitung dari
    // seluruh proyek yang sudah lewat saringan tenant di atas.
    const proyekPerKlien = new Map<string, number>()
    for (const p of proyek ?? []) {
      const cid = p.client_id as string | null
      if (!cid) continue
      proyekPerKlien.set(cid, (proyekPerKlien.get(cid) ?? 0) + 1)
    }

    let mendekat = 0
    let dibuat = 0

    for (const p of proyek ?? []) {
      /*
        `draft` DILEWATI: proyek yang belum berjalan tak punya klien yang
        sedang puas, dan menawarkan pekerjaan berikutnya sebelum yang pertama
        dimulai adalah percakapan yang salah waktu.
      */
      if (p.status === 'draft') continue

      const akhir = p.end_date as string | null
      if (!akhir) continue
      const sisa = Math.round(
        (Date.parse(String(akhir).slice(0, 10) + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z'))
        / 86_400_000,
      )

      /*
        Jendela DUA ARAH, dan sisi lampaunya disengaja.

        Proyek yang tanggal selesainya baru lewat justru saat terbaik menyapa:
        pekerjaannya masih segar, kliennya masih sering dihubungi. Membatasinya
        pada masa depan saja akan melewatkan seluruh proyek yang sudah rampung
        bulan lalu — dan itu bukan peluang yang lebih kecil, melainkan lebih
        matang.
      */
      if (sisa > ambangHari || sisa < -ambangHari) continue
      mendekat++

      if (sudah('kontrak_klien_berakhir', p.id as string)) continue

      const cid = p.client_id as string | null
      const k = cid ? namaKlien.get(cid) : null

      const penerima = await resolveRecipients('kontrak_klien_berakhir', {
        projectId: p.id as string, companyId: request.companyId!,
      })

      const riwayat = cid ? (proyekPerKlien.get(cid) ?? 1) : 1
      const kapan = sisa > 0 ? `berakhir ${sisa} hari lagi`
        : sisa === 0 ? 'berakhir HARI INI'
        : `sudah berakhir ${Math.abs(sisa)} hari lalu`

      for (const uid of penerima) {
        await createNotification({
          company_id: request.companyId!,
          user_id:    uid,
          title:      'Kontrak Klien Mendekati Akhir',
          message:
            `"${p.name}" ${kapan}`
            + (sebutKlien(k) ? ` — klien ${sebutKlien(k)}` : '')
            + `, nilai kontrak ${rp(Number(p.contract_value ?? 0))}. `
            + (riwayat > 1
              ? `Sudah ${riwayat} proyek dikerjakan untuk klien ini. `
              : 'Ini proyek pertama untuk klien ini. ')
            + 'Saat paling mudah menawarkan pekerjaan berikutnya adalah '
            + 'sekarang, selagi mereka masih sering dihubungi.'
            + (k?.contact_person && String(k.contact_person) !== sebutKlien(k)
              ? ` Kontak: ${k.contact_person}` : '')
            + (k?.phone ? ` Telepon ${k.phone}.` : '.'),
          type:       'kontrak_klien_berakhir',
          // Peluang penjualan, bukan kegentingan operasional. `normal` sengaja
          // dipilih supaya ia tak menyaingi peringatan yang menahan uang atau
          // menghentikan pekerjaan.
          priority:   'normal',
          project_id: p.id as string,
          action_url: cid ? `/klien/${cid}` : `/proyek/${p.id}`,
          action_data: {
            record_id: p.id as string,
            sisa_hari: sisa,
            nilai_kontrak: Number(p.contract_value ?? 0),
            proyek_untuk_klien_ini: riwayat,
          },
        })
        dibuat++
      }
    }

    return reply.send({
      success: true, notifications_created: dibuat,
      checked: {
        proyek_diperiksa: (proyek ?? []).length,
        mendekati_akhir: mendekat,
        ambang_hari: ambangHari,
      },
    })
  })

  // ── GET /api/v1/otomasi/jalankan/insiden-k3-belum-ditutup ────────────────
  //
  // Automation 3.15 — Site Safety Incident Triage.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // SATU AMBANG UNTUK SEMUA JENIS INSIDEN ADALAH KESALAHAN, BUKAN PENYEDERHANAAN
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Enam jenis insiden terdaftar di basis ini, dan jaraknya sangat jauh:
  //
  //     fatal                   nyawa hilang
  //     kecelakaan_berat        orang dirawat
  //     pencemaran_lingkungan   ada pihak luar yang dirugikan
  //     kecelakaan_ringan       luka yang bisa diobati di lokasi
  //     kerusakan_properti      alat atau bangunan rusak
  //     nyaris_celaka           tak ada korban, tetapi hampir
  //
  // Ambang tunggal memaksa memilih: kalau dipasang longgar, kecelakaan berat
  // menganggur berminggu-minggu tanpa berbunyi; kalau ketat, tiap nyaris-celaka
  // berbunyi tiap hari sampai orang mematikan notifikasinya — dan yang mati
  // ikut membungkam yang berat.
  //
  // Maka ambangnya BERSKALA: ambang dasar dikali pengali per jenis. Satu angka
  // yang bisa disetel tenant, enam perilaku yang tetap masuk akal terhadapnya.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // TEMUAN KEDUA YANG LEBIH TAJAM DARIPADA "BELUM DITUTUP"
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Terukur di basis dev:
  //
  //     INS-04  kecelakaan_berat  status `diselidiki`  18 hari
  //             tindakan_korektif  NULL
  //
  // Insiden berat yang sudah 18 hari diselidiki TANPA satu pun tindakan
  // korektif tercatat bukan sekadar "belum ditutup" — ia berarti tak ada yang
  // berubah di lapangan sesudahnya, dan penyebabnya masih di sana.
  //
  // Itu dikirim sebagai temuan TERSENDIRI dengan prioritas tertinggi, karena
  // tindakannya berbeda: yang satu menutup berkas, yang satu mencegah kejadian
  // kedua.
  app.get('/api/v1/otomasi/jalankan/insiden-k3-belum-ditutup', {
    preHandler: [authenticate, requirePermission('notifications:milestone:check')],
  }, async (request, reply) => {
    const { createNotification } = await import('../../utils/notifications.js')
    const { resolveRecipients } = await import('../../utils/notification-routing.js')

    const q = request.query as { hari?: string }
    const ambangDasar = await ambilAmbang(request, 'otomasi.insiden_k3.hari', q.hari)

    const today = new Date().toISOString().split('T')[0]
    const sudah = await pembuatDedup(request, today,
      ['insiden_k3_menggantung', 'insiden_k3_tanpa_tindakan'])

    const idProyek = await request.db!.projectIds()
    if (idProyek.length === 0) {
      return reply.send({
        success: true, notifications_created: 0,
        checked: { terbuka: 0, menggantung: 0, ambang_hari: ambangDasar },
      })
    }

    // `insiden_k3` kategori C lewat `project_id`.
    const { data: insiden, error } = await request.db!
      .unsafe('insiden_k3', 'kategori C lewat project_id; disaring ke projectIds() milik tenant')
      .select(`id, project_id, nomor, jenis, status, tanggal,
               tindakan_korektif, korban_nama, lokasi`)
      .in('project_id', idProyek)
      .neq('status', 'ditutup')

    if (error) return reply.status(500).send({ error: error.message })

    const { data: proyek, error: eProyek } = await request.db!
      .from('projects').select('id, name')
    if (eProyek) return reply.status(500).send({ error: eProyek.message })
    const namaProyek = new Map((proyek ?? []).map((p) => [p.id as string, String(p.name ?? '—')]))

    /*
      Pengali ambang per jenis, dan nilainya DIPAKU bukan disetel.

      Yang boleh disetel tenant adalah ambang DASAR — seberapa cepat mereka
      menuntut penutupan. Perbandingan ANTAR jenis tidak boleh ikut disetel:
      membuat kecelakaan berat bisa dikonfigurasi lebih longgar daripada
      nyaris-celaka adalah pilihan yang tak boleh tersedia di UI mana pun.

      Pengali < 1 berarti lebih cepat berbunyi daripada ambang dasar.
    */
    const PENGALI: Record<string, number> = {
      fatal: 0,                     // berbunyi HARI ITU JUGA, tanpa tenggang
      kecelakaan_berat: 0.2,
      pencemaran_lingkungan: 0.5,
      kecelakaan_ringan: 1,
      kerusakan_properti: 1.5,
      nyaris_celaka: 2,
    }
    const BERAT = new Set(['fatal', 'kecelakaan_berat', 'pencemaran_lingkungan'])

    let menggantung = 0
    let tanpaTindakan = 0
    let dibuat = 0

    for (const i of insiden ?? []) {
      const jenis = String(i.jenis ?? '')
      const tgl = String(i.tanggal ?? '').slice(0, 10)
      if (!tgl) continue

      const umur = Math.round(
        (Date.parse(today + 'T00:00:00Z') - Date.parse(tgl + 'T00:00:00Z')) / 86_400_000)

      // Jenis yang tak dikenali diperlakukan seperti ambang dasar, BUKAN
      // dilewati. Jenis baru yang ditambahkan kelak tak boleh diam-diam
      // menghilang dari pengawasan.
      const ambang = Math.round(ambangDasar * (PENGALI[jenis] ?? 1))
      const pid = i.project_id as string
      const punyaTindakan = String(i.tindakan_korektif ?? '').trim().length > 0

      /*
        Temuan TERSENDIRI: insiden berat tanpa satu pun tindakan korektif.

        Tindakannya berbeda dari "belum ditutup" — yang satu menutup berkas,
        yang satu mencegah kejadian kedua. Terukur INS-04: kecelakaan berat,
        18 hari `diselidiki`, `tindakan_korektif` NULL.
      */
      if (BERAT.has(jenis) && !punyaTindakan && umur >= ambang) {
        tanpaTindakan++
        if (!sudah('insiden_k3_tanpa_tindakan', i.id as string)) {
          const penerima = await resolveRecipients('insiden_k3_tanpa_tindakan', {
            projectId: pid, companyId: request.companyId!,
          })
          for (const uid of penerima) {
            await createNotification({
              company_id: request.companyId!,
              user_id:    uid,
              title:      'Insiden Berat Tanpa Tindakan Korektif',
              message:
                `${i.nomor} (${jenis.replace(/_/g, ' ')}) di `
                + `${namaProyek.get(pid)} sudah ${umur} hari berstatus `
                + `"${String(i.status ?? '').replace(/_/g, ' ')}" dan belum ada `
                + 'satu pun tindakan korektif tercatat. Selama itu belum ada, '
                + 'penyebabnya masih di lokasi.'
                + (i.lokasi ? ` Lokasi: ${i.lokasi}.` : ''),
              type:       'insiden_k3_tanpa_tindakan',
              priority:   'urgent',
              project_id: pid,
              action_url: '/k3',
              action_data: {
                record_id: i.id as string,
                nomor: i.nomor, jenis, umur_hari: umur, status: i.status,
              },
            })
            dibuat++
          }
        }
        // Sengaja TIDAK `continue`: insiden yang sama juga menggantung, dan
        // dua orang berbeda mungkin yang menanganinya.
      }

      if (umur < ambang) continue
      menggantung++

      if (sudah('insiden_k3_menggantung', i.id as string)) continue

      const penerima = await resolveRecipients('insiden_k3_menggantung', {
        projectId: pid, companyId: request.companyId!,
      })

      for (const uid of penerima) {
        await createNotification({
          company_id: request.companyId!,
          user_id:    uid,
          title:      'Insiden K3 Belum Ditutup',
          message:
            `${i.nomor} — ${jenis.replace(/_/g, ' ')} di ${namaProyek.get(pid)}, `
            + `${umur} hari sejak kejadian, masih berstatus `
            + `"${String(i.status ?? '').replace(/_/g, ' ')}".`
            + (i.korban_nama ? ` Korban: ${i.korban_nama}.` : '')
            + (punyaTindakan ? '' : ' Belum ada tindakan korektif tercatat.'),
          type:       'insiden_k3_menggantung',
          priority:   BERAT.has(jenis) ? 'urgent' : 'high',
          project_id: pid,
          action_url: '/k3',
          action_data: {
            record_id: i.id as string,
            nomor: i.nomor, jenis, umur_hari: umur,
            ambang_jenis_ini: ambang,
          },
        })
        dibuat++
      }
    }

    return reply.send({
      success: true, notifications_created: dibuat,
      checked: {
        terbuka: (insiden ?? []).length,
        menggantung,
        berat_tanpa_tindakan: tanpaTindakan,
        ambang_hari: ambangDasar,
      },
    })
  })

  // ── GET /api/v1/otomasi/jalankan/stok-di-bawah-minimum ───────────────────
  //
  // Automation 4.5 — Auto Reorder Point.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // YANG PALING PENTING DI SINI BUKAN STOKNYA — MELAINKAN BERAPA YANG TAK
  // PUNYA BATAS SAMA SEKALI
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Terukur: dari 24 material, hanya SATU yang punya `min_stock` > 0. Dua
  // puluh tiga sisanya tak punya batas minimum sama sekali.
  //
  // Otomasi yang hanya membaca `min_stock` akan melaporkan 23 material itu
  // AMAN selamanya — bukan karena stoknya cukup, melainkan karena tak ada yang
  // pernah menuliskan berapa yang disebut cukup. Diam pada kasus itu terlihat
  // persis seperti keberhasilan, dan itu kegagalan yang paling mahal.
  //
  // Maka temuan keduanya justru yang utama hari ini: material tanpa batas
  // minimum, dikirim sebagai satu ringkasan.
  //
  // ── Stok dijumlahkan dari DUA tempat
  //
  // `project_stocks` (di lokasi proyek) DAN `gudang_stok` (di gudang). Membaca
  // salah satunya saja membuat material yang menumpuk di gudang terlihat habis
  // di proyek — lalu dipesan lagi.
  app.get('/api/v1/otomasi/jalankan/stok-di-bawah-minimum', {
    preHandler: [authenticate, requirePermission('notifications:milestone:check')],
  }, async (request, reply) => {
    const { createNotification } = await import('../../utils/notifications.js')
    const { resolveRecipients } = await import('../../utils/notification-routing.js')

    const today = new Date().toISOString().split('T')[0]
    const sudah = await pembuatDedup(request, today,
      ['stok_di_bawah_minimum', 'material_tanpa_batas_minimum'])

    /*
      `materials` kategori AB — master data bersama, jadi `.from()` menyaringnya
      sesuai aturannya sendiri. Yang TIDAK bersama adalah stoknya.
    */
    const { data: material, error } = await request.db!
      .from('materials')
      .select('id, code, name, unit, min_stock, is_active')

    if (error) return reply.status(500).send({ error: error.message })

    const idProyek = await request.db!.projectIds()

    const { data: stokProyek, error: eSP } = idProyek.length
      ? await request.db!
          .unsafe('project_stocks', 'kategori C lewat project_id; disaring ke projectIds()')
          .select('material_id, qty_on_hand')
          .in('project_id', idProyek)
      : { data: [], error: null }
    if (eSP) return reply.status(500).send({ error: eSP.message })

    // `gudang` kategori B; `gudang_stok` kategori C lewat `gudang_id`.
    const { data: gudang, error: eG } = await request.db!
      .from('gudang').select('id')
    if (eG) return reply.status(500).send({ error: eG.message })

    const idGudang = (gudang ?? []).map((g) => g.id as string)
    const { data: stokGudang, error: eSG } = idGudang.length
      ? await request.db!
          .unsafe('gudang_stok', 'kategori C lewat gudang_id; disaring ke gudang milik tenant')
          .select('material_id, qty')
          .in('gudang_id', idGudang)
      : { data: [], error: null }
    if (eSG) return reply.status(500).send({ error: eSG.message })

    const total = new Map<string, number>()
    for (const s of stokProyek ?? []) {
      const id = s.material_id as string
      total.set(id, (total.get(id) ?? 0) + Number(s.qty_on_hand ?? 0))
    }
    for (const s of stokGudang ?? []) {
      const id = s.material_id as string
      total.set(id, (total.get(id) ?? 0) + Number(s.qty ?? 0))
    }

    const aktif = (material ?? []).filter((m) => m.is_active !== false)
    const berbatas = aktif.filter((m) => Number(m.min_stock ?? 0) > 0)
    const tanpaBatas = aktif.filter((m) => Number(m.min_stock ?? 0) <= 0)

    let menipis = 0
    let dibuat = 0

    for (const m of berbatas) {
      const id = m.id as string
      const ada = total.get(id) ?? 0
      const min = Number(m.min_stock ?? 0)
      if (ada >= min) continue
      menipis++

      if (sudah('stok_di_bawah_minimum', id)) continue

      const penerima = await resolveRecipients('stok_di_bawah_minimum', {
        projectId: null, companyId: request.companyId!,
      })

      for (const uid of penerima) {
        await createNotification({
          company_id: request.companyId!,
          user_id:    uid,
          title:      'Stok Material di Bawah Batas Minimum',
          message:
            `${String(m.name ?? '—').trim()}`
            + (m.code ? ` (${m.code})` : '')
            + ` tersisa ${ada} ${m.unit ?? ''} dari batas minimum ${min} `
            + `${m.unit ?? ''}. Dihitung dari stok di proyek DAN di gudang, `
            + 'jadi angka ini sudah termasuk yang menumpuk di gudang.',
          type:       'stok_di_bawah_minimum',
          priority:   ada <= 0 ? 'urgent' : 'high',
          project_id: undefined,
          action_url: '/gudang',
          action_data: {
            record_id: id,
            tersisa: ada, minimum: min, satuan: m.unit ?? null,
          },
        })
        dibuat++
      }
    }

    /*
      Material TANPA batas minimum — satu ringkasan, bukan satu per material.

      Ini bukan peringatan stok; ini peringatan bahwa pengawasannya belum
      dinyalakan. Mengirimnya per material membuat 23 notifikasi untuk satu
      pekerjaan tunggal: duduk sekali dan mengisi batasnya.
    */
    if (tanpaBatas.length > 0 && !sudah('material_tanpa_batas_minimum', today)) {
      const penerima = await resolveRecipients('material_tanpa_batas_minimum', {
        projectId: null, companyId: request.companyId!,
      })

      for (const uid of penerima) {
        await createNotification({
          company_id: request.companyId!,
          user_id:    uid,
          title:      'Material Belum Punya Batas Minimum',
          message:
            `${tanpaBatas.length} dari ${aktif.length} material aktif belum `
            + 'punya batas stok minimum: '
            + `${tanpaBatas.slice(0, 4).map((m) => String(m.name ?? '').trim()).join(', ')}`
            + `${tanpaBatas.length > 4 ? ', dan lainnya' : ''}. `
            + 'Selama batasnya kosong, material ini akan terus terlihat aman '
            + 'di laporan — bukan karena stoknya cukup, melainkan karena tak '
            + 'ada yang pernah menuliskan berapa yang disebut cukup.',
          type:       'material_tanpa_batas_minimum',
          priority:   'normal',
          project_id: undefined,
          action_url: '/procurement/material',
          action_data: {
            record_id: today,
            tanpa_batas: tanpaBatas.length,
            material_aktif: aktif.length,
          },
        })
        dibuat++
      }
    }

    return reply.send({
      success: true, notifications_created: dibuat,
      checked: {
        material_aktif: aktif.length,
        berbatas: berbatas.length,
        menipis,
        // Dilaporkan EKSPLISIT: inilah material yang TAK BISA dinilai sama
        // sekali. Tanpa angka ini, "1 menipis" terbaca sebagai "23 aman".
        tanpa_batas_minimum: tanpaBatas.length,
      },
    })
  })

  // ── GET /api/v1/otomasi/jalankan/audit-mutu-lewat-jadwal ─────────────────
  //
  // Automation 3.14 — Quality Checklist / Audit Reminder.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // AUDIT MUTU YANG LEWAT JADWAL BERBEDA DARI AUDIT YANG BELUM SELESAI
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Terukur: AM-2608-02 berstatus `berjalan` dengan `tanggal_rencana` 6 hari
  // lalu. Auditnya SUDAH dimulai — yang lewat jadwal adalah penyelesaiannya.
  //
  // Membedakannya penting karena tindakannya berbeda: audit yang belum
  // dijadwalkan butuh orang menetapkan tanggal; audit yang berjalan terlalu
  // lama butuh orang menyelesaikan temuannya.
  //
  // ── Rencana mutu yang belum disetujui ikut diperiksa
  //
  // `rencana_mutu` berstatus `diajukan` berarti dokumennya sudah disusun
  // tetapi belum ada yang menyetujuinya — dan selama itu, seluruh audit di
  // bawahnya berpijak pada rencana yang belum sah.
  app.get('/api/v1/otomasi/jalankan/audit-mutu-lewat-jadwal', {
    preHandler: [authenticate, requirePermission('notifications:milestone:check')],
  }, async (request, reply) => {
    const { createNotification } = await import('../../utils/notifications.js')
    const { resolveRecipients } = await import('../../utils/notification-routing.js')

    const q = request.query as { hari?: string }
    const ambangHari = await ambilAmbang(request, 'otomasi.audit_mutu.hari', q.hari)

    const today = new Date().toISOString().split('T')[0]
    const sudah = await pembuatDedup(request, today,
      ['audit_mutu_lewat_jadwal', 'rencana_mutu_belum_disetujui'])

    const idProyek = await request.db!.projectIds()
    if (idProyek.length === 0) {
      return reply.send({
        success: true, notifications_created: 0,
        checked: { audit_terbuka: 0, lewat_jadwal: 0, ambang_hari: ambangHari },
      })
    }

    const { data: audit, error } = await request.db!
      .unsafe('audit_mutu', 'kategori C lewat project_id; disaring ke projectIds()')
      .select('id, project_id, nomor, judul, status, tanggal_rencana, tanggal_selesai')
      .in('project_id', idProyek)

    if (error) return reply.status(500).send({ error: error.message })

    const { data: rmp, error: eRmp } = await request.db!
      .unsafe('rencana_mutu', 'kategori C lewat project_id; disaring ke projectIds()')
      .select('id, project_id, nomor, judul, status')
      .in('project_id', idProyek)

    if (eRmp) return reply.status(500).send({ error: eRmp.message })

    const { data: proyek, error: eProyek } = await request.db!
      .from('projects').select('id, name')
    if (eProyek) return reply.status(500).send({ error: eProyek.message })
    const namaProyek = new Map((proyek ?? []).map((p) => [p.id as string, String(p.name ?? '—')]))

    let terbuka = 0
    let lewat = 0
    let dibuat = 0

    for (const a of audit ?? []) {
      // `selesai` dan `dibatalkan` sudah tak menunggu siapa pun.
      const st = String(a.status ?? '')
      if (st === 'selesai' || st === 'dibatalkan') continue
      terbuka++

      const rencana = String(a.tanggal_rencana ?? '').slice(0, 10)
      if (!rencana) continue
      const telat = Math.round(
        (Date.parse(today + 'T00:00:00Z') - Date.parse(rencana + 'T00:00:00Z')) / 86_400_000)
      if (telat < ambangHari) continue
      lewat++

      if (sudah('audit_mutu_lewat_jadwal', a.id as string)) continue

      const pid = a.project_id as string
      const penerima = await resolveRecipients('audit_mutu_lewat_jadwal', {
        projectId: pid, companyId: request.companyId!,
      })

      for (const uid of penerima) {
        await createNotification({
          company_id: request.companyId!,
          user_id:    uid,
          title:      'Audit Mutu Lewat Jadwal',
          message:
            `${a.nomor} "${a.judul}" di ${namaProyek.get(pid)} direncanakan `
            + `${rencana} dan sudah lewat ${telat} hari, masih berstatus `
            + `"${st.replace(/_/g, ' ')}". `
            + (st === 'berjalan'
              ? 'Auditnya sudah dimulai — yang tertunda penyelesaiannya.'
              : 'Auditnya belum dimulai sama sekali.'),
          type:       'audit_mutu_lewat_jadwal',
          priority:   telat >= ambangHari * 3 ? 'high' : 'normal',
          project_id: pid,
          action_url: '/mutu',
          action_data: {
            record_id: a.id as string,
            nomor: a.nomor, telat_hari: telat, status: st,
          },
        })
        dibuat++
      }
    }

    /*
      Rencana mutu yang belum disetujui.

      Selama ia `diajukan`, seluruh audit di bawahnya berpijak pada rencana
      yang belum sah — dan temuan audit yang mengacu ke dokumen belum-sah sulit
      dipertahankan kalau kelak dipersoalkan.
    */
    const belumSah = (rmp ?? []).filter((r) =>
      String(r.status ?? '') === 'diajukan' || String(r.status ?? '') === 'draft')

    let dibuatRmp = 0
    for (const r of belumSah) {
      if (sudah('rencana_mutu_belum_disetujui', r.id as string)) continue
      const pid = r.project_id as string
      const penerima = await resolveRecipients('rencana_mutu_belum_disetujui', {
        projectId: pid, companyId: request.companyId!,
      })
      for (const uid of penerima) {
        await createNotification({
          company_id: request.companyId!,
          user_id:    uid,
          title:      'Rencana Mutu Belum Disetujui',
          message:
            `${r.nomor} "${r.judul}" di ${namaProyek.get(pid)} masih berstatus `
            + `"${String(r.status ?? '')}". Selama belum disahkan, temuan audit `
            + 'yang mengacu padanya berpijak pada dokumen yang belum berlaku.',
          type:       'rencana_mutu_belum_disetujui',
          priority:   'normal',
          project_id: pid,
          action_url: '/mutu',
          action_data: { record_id: r.id as string, nomor: r.nomor, status: r.status },
        })
        dibuatRmp++
      }
    }

    return reply.send({
      success: true, notifications_created: dibuat + dibuatRmp,
      checked: {
        audit_terbuka: terbuka,
        lewat_jadwal: lewat,
        rencana_mutu_belum_sah: belumSah.length,
        ambang_hari: ambangHari,
      },
    })
  })

  // ── GET /api/v1/otomasi/jalankan/izin-kedaluwarsa ────────────────────────
  //
  // Automation 9.1 — Regulatory Compliance Checklist.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // DUA JENIS IZIN YANG BERBEDA AKIBATNYA
  // ══════════════════════════════════════════════════════════════════════════
  //
  //   `izin_proyek`  izin dari pemerintah — PBG, UKL-UPL, Izin Pemanfaatan
  //                  Ruang. Kedaluwarsa berarti bangunannya berdiri tanpa
  //                  dasar hukum, dan yang menanggung pemiliknya.
  //
  //   `izin_kerja`   izin kerja internal (permit to work) — bekerja di
  //                  ketinggian, panas, ruang terbatas. Kedaluwarsa berarti
  //                  orang masih bekerja di bawah izin yang sudah habis.
  //
  // Terukur di basis dev:
  //
  //     Izin Pemanfaatan Ruang  650/IPR/2024/0098  status `terbit`
  //                             berlaku sampai 2025-11-05 — SUDAH LEWAT
  //     PBG 503/PBG/2025/0417   berakhir 46 hari lagi
  //     2 izin kerja `disetujui` yang masa berlakunya sudah habis
  //
  // ══════════════════════════════════════════════════════════════════════════
  // IZIN YANG BELUM DIURUS SAMA SEKALI IKUT DIPERIKSA
  // ══════════════════════════════════════════════════════════════════════════
  //
  // `izin_proyek.menghalangi_mulai` menandai izin yang tanpanya pekerjaan tak
  // boleh dimulai. Izin semacam itu yang masih berstatus `rencana` atau
  // `diajukan` sementara proyeknya sudah berjalan adalah keadaan yang jauh
  // lebih genting daripada izin yang habis masa berlakunya — yang kedua pernah
  // sah, yang pertama tidak pernah.
  app.get('/api/v1/otomasi/jalankan/izin-kedaluwarsa', {
    preHandler: [authenticate, requirePermission('notifications:milestone:check')],
  }, async (request, reply) => {
    const { createNotification } = await import('../../utils/notifications.js')
    const { resolveRecipients } = await import('../../utils/notification-routing.js')

    const q = request.query as { hari?: string }
    const ambangHari = await ambilAmbang(request, 'otomasi.izin.hari', q.hari)

    const today = new Date().toISOString().split('T')[0]
    const sudah = await pembuatDedup(request, today,
      ['izin_proyek_kedaluwarsa', 'izin_penghalang_belum_terbit', 'izin_kerja_kedaluwarsa'])

    const idProyek = await request.db!.projectIds()

    const { data: izinProyek, error } = idProyek.length
      ? await request.db!
          .unsafe('izin_proyek', 'kategori C lewat project_id; disaring ke projectIds()')
          .select('id, project_id, jenis, nomor, status, berlaku_sampai, menghalangi_mulai')
          .in('project_id', idProyek)
      : { data: [], error: null }
    if (error) return reply.status(500).send({ error: error.message })

    // `izin_kerja` kategori B — `.from()` menyaringnya langsung.
    const { data: izinKerja, error: eKerja } = await request.db!
      .from('izin_kerja')
      .select('id, project_id, nomor, jenis, status, berlaku_sampai, lokasi')

    if (eKerja) return reply.status(500).send({ error: eKerja.message })

    const { data: proyek, error: eProyek } = await request.db!
      .from('projects').select('id, name, status')
    if (eProyek) return reply.status(500).send({ error: eProyek.message })
    const namaProyek = new Map((proyek ?? []).map((p) => [p.id as string, String(p.name ?? '—')]))
    const berjalan = new Set((proyek ?? [])
      .filter((p) => p.status === 'active' || p.status === 'on_hold')
      .map((p) => p.id as string))

    const sisaHari = (sampai: unknown) => {
      const t = String(sampai ?? '').slice(0, 10)
      if (!t) return null
      return Math.round(
        (Date.parse(t + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86_400_000)
    }

    let lewatProyek = 0
    let penghalang = 0
    let lewatKerja = 0
    let tanpaMasaBerlaku = 0
    let dibuat = 0

    for (const z of izinProyek ?? []) {
      const pid = z.project_id as string
      const st = String(z.status ?? '')

      /*
        Izin PENGHALANG yang belum terbit, sementara proyeknya sudah berjalan.

        Lebih genting daripada izin yang habis masa berlakunya: yang kedua
        pernah sah, yang pertama tidak pernah. Dan `menghalangi_mulai`
        menyatakan sendiri bahwa pekerjaan seharusnya belum dimulai.
      */
      if (z.menghalangi_mulai === true && st !== 'terbit' && berjalan.has(pid)) {
        penghalang++
        if (!sudah('izin_penghalang_belum_terbit', z.id as string)) {
          const penerima = await resolveRecipients('izin_penghalang_belum_terbit', {
            projectId: pid, companyId: request.companyId!,
          })
          for (const uid of penerima) {
            await createNotification({
              company_id: request.companyId!,
              user_id:    uid,
              title:      'Izin Penghalang Belum Terbit — Proyek Sudah Berjalan',
              message:
                `${z.jenis} untuk ${namaProyek.get(pid)} masih berstatus `
                + `"${st}", padahal izin ini ditandai menghalangi dimulainya `
                + 'pekerjaan dan proyeknya sudah berjalan.',
              type:       'izin_penghalang_belum_terbit',
              priority:   'urgent',
              project_id: pid,
              action_url: '/risiko/izin',
              action_data: { record_id: z.id as string, jenis: z.jenis, status: st },
            })
            dibuat++
          }
        }
        continue
      }

      // Hanya izin yang sudah TERBIT yang punya masa berlaku untuk habis.
      if (st !== 'terbit') continue

      const sisa = sisaHari(z.berlaku_sampai)
      /*
        `berlaku_sampai` KOSONG dihitung dan dilaporkan, bukan dilewati diam.

        Izin tanpa tanggal akhir mungkin memang berlaku selamanya — atau
        mungkin tanggalnya belum diisi. Keduanya terlihat sama di basis, dan
        otomasi ini tak boleh memilih tafsir yang lebih nyaman.
      */
      if (sisa == null) { tanpaMasaBerlaku++; continue }
      if (sisa > ambangHari) continue
      lewatProyek++

      if (sudah('izin_proyek_kedaluwarsa', z.id as string)) continue

      const penerima = await resolveRecipients('izin_proyek_kedaluwarsa', {
        projectId: pid, companyId: request.companyId!,
      })
      const kapan = sisa < 0 ? `SUDAH LEWAT ${Math.abs(sisa)} hari`
        : sisa === 0 ? 'berakhir HARI INI' : `berakhir ${sisa} hari lagi`

      for (const uid of penerima) {
        await createNotification({
          company_id: request.companyId!,
          user_id:    uid,
          title:      sisa < 0 ? 'Izin Proyek Sudah Kedaluwarsa'
                               : 'Izin Proyek Mendekati Akhir Masa Berlaku',
          message:
            `${z.jenis} (${z.nomor}) untuk ${namaProyek.get(pid)} ${kapan}.`
            + (sisa < 0
              ? ' Selama belum diperbarui, pekerjaan di lokasi berjalan tanpa'
                + ' dasar izin yang sah.'
              : ' Pengurusan perpanjangan biasanya makan waktu berminggu-minggu.'),
          type:       'izin_proyek_kedaluwarsa',
          priority:   sisa < 0 ? 'urgent' : 'high',
          project_id: pid,
          action_url: '/risiko/izin',
          action_data: {
            record_id: z.id as string, jenis: z.jenis, nomor: z.nomor, sisa_hari: sisa,
          },
        })
        dibuat++
      }
    }

    for (const k of izinKerja ?? []) {
      /*
        Hanya izin kerja yang DISETUJUI yang berbahaya saat kedaluwarsa —
        itulah yang dipakai orang untuk bekerja. Yang `diajukan` atau `ditolak`
        tak pernah memberi hak masuk kepada siapa pun.
      */
      if (String(k.status ?? '') !== 'disetujui') continue
      const sisa = sisaHari(k.berlaku_sampai)
      if (sisa == null || sisa >= 0) continue
      lewatKerja++

      if (sudah('izin_kerja_kedaluwarsa', k.id as string)) continue

      const pid = (k.project_id as string | null) ?? null
      const penerima = await resolveRecipients('izin_kerja_kedaluwarsa', {
        projectId: pid, companyId: request.companyId!,
      })

      for (const uid of penerima) {
        await createNotification({
          company_id: request.companyId!,
          user_id:    uid,
          title:      'Izin Kerja Sudah Habis Masa Berlakunya',
          message:
            `Izin kerja ${k.nomor} (${k.jenis}) masih berstatus disetujui `
            + `tetapi masa berlakunya habis ${Math.abs(sisa)} hari lalu`
            + (k.lokasi ? ` — lokasi ${k.lokasi}` : '')
            + '. Kalau pekerjaannya masih berjalan, ia berjalan tanpa izin; '
            + 'kalau sudah selesai, izinnya perlu ditutup.',
          type:       'izin_kerja_kedaluwarsa',
          priority:   'high',
          project_id: pid ?? undefined,
          action_url: '/k3',
          action_data: {
            record_id: k.id as string, nomor: k.nomor, lewat_hari: Math.abs(sisa),
          },
        })
        dibuat++
      }
    }

    return reply.send({
      success: true, notifications_created: dibuat,
      checked: {
        izin_proyek: (izinProyek ?? []).length,
        mendekat_atau_lewat: lewatProyek,
        penghalang_belum_terbit: penghalang,
        izin_kerja_lewat: lewatKerja,
        // Dilaporkan EKSPLISIT: izin terbit yang tanggal akhirnya kosong.
        // Mungkin berlaku selamanya, mungkin tanggalnya belum diisi — dan
        // keduanya terlihat sama.
        izin_tanpa_masa_berlaku: tanpaMasaBerlaku,
        ambang_hari: ambangHari,
      },
    })
  })

  // ── GET /api/v1/otomasi/jalankan/risiko-lewat-tinjau ─────────────────────
  //
  // Automation 9.4 — Risk Register Review.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // YANG DITEGUR BUKAN RISIKONYA — MELAINKAN PENINJAUANNYA YANG BERHENTI
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Daftar risiko yang tak pernah ditinjau ulang berubah jadi dokumen
  // kepatuhan: ada, lengkap, dan tak seorang pun membacanya. Yang membuatnya
  // hidup adalah tenggat tinjau — dan tenggat yang lewat tanpa berbunyi
  // membuat seluruh daftar itu diam-diam kedaluwarsa.
  //
  // Terukur: RSK-01 "Keterlambatan pasokan baja tulangan", skor 16 (dampak 4 ×
  // kemungkinan 4), tenggat tinjau lewat 10 hari.
  //
  // ── Tenggangnya BERSKALA menurut skor, seperti insiden K3
  //
  // Risiko berskor 16 yang telat ditinjau seminggu berbeda jauh dari risiko
  // berskor 2 yang telat sebulan. Ambang tunggal memaksa memilih satu di
  // antara dua kesalahan.
  //
  // Skornya `dampak × kemungkinan`, jadi 1–25. Pembaginya dipaku: risiko
  // berskor tinggi mendapat tenggang lebih pendek, dan perbandingan itu tak
  // boleh bisa disetel terbalik dari UI.
  app.get('/api/v1/otomasi/jalankan/risiko-lewat-tinjau', {
    preHandler: [authenticate, requirePermission('notifications:milestone:check')],
  }, async (request, reply) => {
    const { createNotification } = await import('../../utils/notifications.js')
    const { resolveRecipients } = await import('../../utils/notification-routing.js')

    const q = request.query as { hari?: string; skor?: string }
    const ambangHari = await ambilAmbang(request, 'otomasi.risiko_tinjau.hari', q.hari)
    const ambangSkor = await ambilAmbang(request, 'otomasi.risiko_tinjau.skor', q.skor)

    const today = new Date().toISOString().split('T')[0]
    const sudah = await pembuatDedup(request, today,
      ['risiko_lewat_tinjau', 'risiko_tinggi_tanpa_tenggat'])

    const idProyek = await request.db!.projectIds()
    if (idProyek.length === 0) {
      return reply.send({
        success: true, notifications_created: 0,
        checked: { risiko_aktif: 0, lewat_tinjau: 0, ambang_hari: ambangHari },
      })
    }

    const { data: risiko, error } = await request.db!
      .unsafe('risiko_proyek', 'kategori C lewat project_id; disaring ke projectIds()')
      .select('id, project_id, kode, judul, kategori, skor, strategi, status, tenggat_tinjau')
      .in('project_id', idProyek)

    if (error) return reply.status(500).send({ error: error.message })

    const { data: proyek, error: eProyek } = await request.db!
      .from('projects').select('id, name')
    if (eProyek) return reply.status(500).send({ error: eProyek.message })
    const namaProyek = new Map((proyek ?? []).map((p) => [p.id as string, String(p.name ?? '—')]))

    let aktif = 0
    let lewat = 0
    let tanpaTenggat = 0
    let dibuat = 0

    for (const r of risiko ?? []) {
      const st = String(r.status ?? '')
      /*
        `tertutup`, DIUKUR dari enum `status_risiko` — bukan ditebak.

        Versi pertama menyaring `ditutup`/`selesai`/`batal`, dan tak satu pun
        dari ketiganya ada di enum ini (`terjadi` · `terpantau` · `tertutup`).
        Saringannya tak pernah cocok dengan apa pun, jadi risiko yang sudah
        ditutup tetap ditegur selamanya — tanpa satu pun galat, karena
        membandingkan teks dengan teks selalu sah.

        `terjadi` SENGAJA tetap diawasi: risiko yang sudah terjadi justru
        paling butuh ditinjau, bukan paling boleh dilupakan.
      */
      if (st === 'tertutup') continue
      aktif++

      const skor = Number(r.skor ?? 0)
      const pid = r.project_id as string

      /*
        Risiko berskor tinggi TANPA tenggat tinjau sama sekali.

        Ini bukan risiko yang terlambat ditinjau — ini risiko yang tak pernah
        dijadwalkan untuk ditinjau. Diam terhadapnya membuat risiko paling
        besar justru yang paling mungkin terlupakan, karena ia tak akan pernah
        muncul di daftar "lewat tenggat" mana pun.
      */
      if (!r.tenggat_tinjau) {
        if (skor < ambangSkor) continue
        tanpaTenggat++
        if (sudah('risiko_tinggi_tanpa_tenggat', r.id as string)) continue

        const penerima = await resolveRecipients('risiko_tinggi_tanpa_tenggat', {
          projectId: pid, companyId: request.companyId!,
        })
        for (const uid of penerima) {
          await createNotification({
            company_id: request.companyId!,
            user_id:    uid,
            title:      'Risiko Tinggi Belum Dijadwalkan Ditinjau',
            message:
              `${r.kode} "${r.judul}" di ${namaProyek.get(pid)} berskor ${skor} `
              + 'tetapi belum punya tenggat tinjau. Selama tak dijadwalkan, ia '
              + 'tak akan pernah muncul di daftar yang lewat tenggat — risiko '
              + 'paling besar justru jadi yang paling mungkin terlupakan.',
            type:       'risiko_tinggi_tanpa_tenggat',
            priority:   'high',
            project_id: pid,
            action_url: '/risiko',
            action_data: { record_id: r.id as string, kode: r.kode, skor },
          })
          dibuat++
        }
        continue
      }

      const tenggat = String(r.tenggat_tinjau).slice(0, 10)
      const telat = Math.round(
        (Date.parse(today + 'T00:00:00Z') - Date.parse(tenggat + 'T00:00:00Z')) / 86_400_000)

      /*
        Tenggang BERSKALA: makin tinggi skornya, makin pendek tenggangnya.

        Skor 1–25. Pembagi 5 dipilih supaya skor 25 hampir tak punya tenggang
        dan skor 1 mendapat tenggang penuh. Perbandingannya dipaku di kode —
        membuat risiko berskor 25 bisa disetel lebih longgar daripada skor 1
        adalah pilihan yang tak boleh tersedia.
      */
      const tenggangnya = Math.max(0, Math.round(ambangHari * (1 - Math.min(skor, 25) / 26)))
      if (telat < tenggangnya) continue
      lewat++

      if (sudah('risiko_lewat_tinjau', r.id as string)) continue

      const penerima = await resolveRecipients('risiko_lewat_tinjau', {
        projectId: pid, companyId: request.companyId!,
      })

      for (const uid of penerima) {
        await createNotification({
          company_id: request.companyId!,
          user_id:    uid,
          title:      'Risiko Lewat Tenggat Tinjau',
          message:
            `${r.kode} "${r.judul}" (${r.kategori}, skor ${skor}) di `
            + `${namaProyek.get(pid)} seharusnya ditinjau ${tenggat} — sudah `
            + `lewat ${telat} hari. Strategi tercatat: ${r.strategi ?? '—'}. `
            + 'Daftar risiko yang berhenti ditinjau berubah jadi dokumen '
            + 'kepatuhan yang tak seorang pun membacanya.',
          type:       'risiko_lewat_tinjau',
          priority:   skor >= ambangSkor ? 'high' : 'normal',
          project_id: pid,
          action_url: '/risiko',
          action_data: {
            record_id: r.id as string, kode: r.kode, skor,
            telat_hari: telat, tenggang_skor_ini: tenggangnya,
          },
        })
        dibuat++
      }
    }

    return reply.send({
      success: true, notifications_created: dibuat,
      checked: {
        risiko_aktif: aktif,
        lewat_tinjau: lewat,
        tinggi_tanpa_tenggat: tanpaTenggat,
        ambang_hari: ambangHari,
        ambang_skor: ambangSkor,
      },
    })
  })

  // ── GET /api/v1/otomasi/jalankan/biaya-kembar ────────────────────────────
  //
  // Automation 2.7 — Duplicate Transaction Detection.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // YANG DICOCOKKAN VENDOR + NOMINAL + KEDEKATAN TANGGAL — BUKAN URAIANNYA
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Pencatatan ganda hampir tak pernah menghasilkan dua kalimat yang sama
  // persis. Nota yang sama diinput ulang karena yang pertama dikira gagal
  // tersimpan, dan orang kedua mengetiknya dengan kata-katanya sendiri:
  //
  //     "Besi beton D13 20 batang"
  //     "BESI BETON D13 20 BATANG"
  //     "Beton readymix K-250 8 m3"
  //     "Beton readymix K250 8m3"
  //
  // Mencocokkan uraian akan melewatkan keempatnya. Yang tak berubah saat
  // diketik ulang: siapa vendornya, berapa nominalnya, dan kapan kira-kira.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // JENDELANYA PENDEK, DAN ITU YANG MEMBEDAKANNYA DARI 2.14
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Sewa direksi keet Rp 3.500.000 dari vendor yang sama, tiap bulan, adalah
  // vendor + nominal yang identik berulang kali — dan ia BUKAN pencatatan
  // ganda. Yang membedakannya cuma jarak hari.
  //
  // Jendela tiga hari memisahkan keduanya dengan bersih: nota yang diinput
  // ulang datang dalam hitungan jam sampai hari; biaya tetap bulanan datang
  // tiap tiga puluh hari. Otomasi 2.14 yang mengurus yang kedua.
  app.get('/api/v1/otomasi/jalankan/biaya-kembar', {
    preHandler: [authenticate, requirePermission('notifications:milestone:check')],
  }, async (request, reply) => {
    const { createNotification } = await import('../../utils/notifications.js')
    const { resolveRecipients } = await import('../../utils/notification-routing.js')

    const q = request.query as { hari?: string }
    const ambangHari = await ambilAmbang(request, 'otomasi.biaya_kembar.hari', q.hari)

    const today = new Date().toISOString().split('T')[0]
    const sudah = await pembuatDedup(request, today, ['biaya_kembar'])

    const idProyek = await request.db!.projectIds()
    if (idProyek.length === 0) {
      return reply.send({
        success: true, notifications_created: 0,
        checked: { biaya_diperiksa: 0, pasangan_kembar: 0, ambang_hari: ambangHari },
      })
    }

    /*
      `project_expenses` kategori C lewat `project_id`.

      Dibaca BERHALAMAN: biaya proyek adalah tabel yang paling cepat tumbuh di
      sistem ini, dan pemotongan senyap PostgREST di 1.000 baris akan membuat
      pasangan kembar kehilangan sisi pembandingnya — persis pasangan terbaru
      yang paling mungkin masih bisa dibatalkan.
    */
    const HALAMAN = 1000
    const biaya: Array<Record<string, unknown>> = []
    for (let dari = 0; ; dari += HALAMAN) {
      const { data, error } = await request.db!
        .unsafe('project_expenses', 'kategori C lewat project_id; disaring ke projectIds()')
        .select(`id, project_id, description, expense_date, total_amount,
                 vendor_name, status, category_id`)
        .in('project_id', idProyek)
        .neq('status', 'rejected')
        .order('expense_date', { ascending: true })
        .range(dari, dari + HALAMAN - 1)

      if (error) return reply.status(500).send({ error: error.message })
      if (!data || data.length === 0) break
      biaya.push(...(data as Array<Record<string, unknown>>))
      if (data.length < HALAMAN) break
    }

    const { data: proyek, error: eProyek } = await request.db!
      .from('projects').select('id, name')
    if (eProyek) return reply.status(500).send({ error: eProyek.message })
    const namaProyek = new Map((proyek ?? []).map((p) => [p.id as string, String(p.name ?? '—')]))

    /*
      Dikelompokkan lebih dulu per (proyek, vendor, nominal), bukan
      dibandingkan semua-lawan-semua.

      Perbandingan berpasangan penuh berbiaya kuadrat; pada 10.000 baris itu
      50 juta perbandingan tiap kali penjadwal berdenyut. Pengelompokan
      membuatnya sebanding jumlah baris, dan hasilnya sama persis — dua baris
      yang vendor atau nominalnya berbeda tak akan pernah jadi pasangan.
    */
    const kelompok = new Map<string, Array<Record<string, unknown>>>()
    for (const b of biaya) {
      const vendor = String(b.vendor_name ?? '').trim().toLowerCase()
      // Tanpa nama vendor, kesamaan nominal saja bukan bukti apa-apa —
      // dua belanja Rp 500.000 di hari yang sama itu biasa.
      if (!vendor) continue
      const nominal = Number(b.total_amount ?? 0)
      if (nominal <= 0) continue
      const kunci = `${b.project_id}|${vendor}|${nominal}`
      const arr = kelompok.get(kunci) ?? []
      arr.push(b)
      kelompok.set(kunci, arr)
    }

    const hariAntara = (a: string, b: string) =>
      Math.abs(Math.round(
        (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000))

    let pasangan = 0
    let dibuat = 0
    let nilaiKembar = 0

    for (const [, anggota] of kelompok) {
      if (anggota.length < 2) continue
      for (let i = 0; i < anggota.length; i++) {
        for (let k = i + 1; k < anggota.length; k++) {
          const a = anggota[i]
          const b = anggota[k]
          const ta = String(a.expense_date ?? '').slice(0, 10)
          const tb = String(b.expense_date ?? '').slice(0, 10)
          if (!ta || !tb) continue
          const jarak = hariAntara(ta, tb)
          if (jarak > ambangHari) continue

          pasangan++
          const nominal = Number(a.total_amount ?? 0)
          nilaiKembar += nominal

          // Kunci diurutkan supaya A–B dan B–A tak jadi dua notifikasi.
          const kunci = [a.id as string, b.id as string].sort().join('_')
          if (sudah('biaya_kembar', kunci)) continue

          const pid = a.project_id as string
          const penerima = await resolveRecipients('biaya_kembar', {
            projectId: pid, companyId: request.companyId!,
          })

          for (const uid of penerima) {
            await createNotification({
              company_id: request.companyId!,
              user_id:    uid,
              title:      'Dua Pengeluaran Kembar',
              message:
                `Di ${namaProyek.get(pid)}: "${a.description}" (${ta}) dan `
                + `"${b.description}" (${tb}) sama-sama ${rp(nominal)} dari `
                + `${a.vendor_name}`
                + (jarak === 0 ? ' pada hari yang sama.' : `, berselang ${jarak} hari.`)
                + ' Uraiannya berbeda tetapi vendor dan nominalnya sama persis — '
                + 'periksa apakah satu nota tercatat dua kali.',
              type:       'biaya_kembar',
              // Yang sudah disetujui lebih mendesak: uangnya sudah diakui
              // sebagai biaya, dan membatalkannya menuntut jurnal koreksi.
              priority:   (a.status === 'approved' && b.status === 'approved')
                ? 'high' : 'normal',
              project_id: pid,
              action_url: '/kas/pengeluaran',
              action_data: {
                record_id: kunci,
                nominal, jarak_hari: jarak,
                vendor: a.vendor_name,
                id_a: a.id, id_b: b.id,
              },
            })
            dibuat++
          }
        }
      }
    }

    return reply.send({
      success: true, notifications_created: dibuat,
      checked: {
        biaya_diperiksa: biaya.length,
        pasangan_kembar: pasangan,
        nilai_kembar: nilaiKembar,
        ambang_hari: ambangHari,
      },
    })
  })

  // ── GET /api/v1/otomasi/jalankan/biaya-berulang ──────────────────────────
  //
  // Automation 2.14 — Recurring Expense Detection.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // YANG DIBERITAHUKAN BUKAN "ADA BIAYA BERULANG" — ITU SUDAH JELAS
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Sewa direksi keet Rp 3.500.000 sebulan tak mengejutkan siapa pun. Yang
  // mengejutkan angka setahunnya: Rp 42 juta, dan ia dicatat sebagai belanja
  // proyek satu-satu tiap bulan — tak pernah muncul sebagai satu keputusan
  // yang pernah disetujui seseorang.
  //
  // Maka pesannya menyebut TOTAL yang sudah keluar dan PERKIRAAN SETAHUN.
  // Dua angka itu yang membuat orang berhenti dan bertanya "kita masih butuh
  // ini?", dan keduanya tak ada di layar mana pun secara berdampingan.
  //
  // Terukur di basis: 2 pola × 2 proyek, masing-masing 6 bulan berturut-turut —
  // sewa direksi keet Rp 21 juta dan langganan internet Rp 5,1 juta.
  //
  // ── BULAN BERBEDA, bukan jumlah baris
  //
  // Enam nota di bulan yang sama bukan biaya berulang, itu enam belanja.
  // Yang menandakan langganan adalah kehadirannya di bulan demi bulan.
  app.get('/api/v1/otomasi/jalankan/biaya-berulang', {
    preHandler: [authenticate, requirePermission('notifications:milestone:check')],
  }, async (request, reply) => {
    const { createNotification } = await import('../../utils/notifications.js')
    const { resolveRecipients } = await import('../../utils/notification-routing.js')

    const q = request.query as { bulan?: string }
    const ambangBulan = await ambilAmbang(request, 'otomasi.biaya_berulang.bulan', q.bulan)

    const today = new Date().toISOString().split('T')[0]
    const sudah = await pembuatDedup(request, today, ['biaya_berulang'])

    const idProyek = await request.db!.projectIds()
    if (idProyek.length === 0) {
      return reply.send({
        success: true, notifications_created: 0,
        checked: { biaya_diperiksa: 0, pola_berulang: 0, ambang_bulan: ambangBulan },
      })
    }

    const HALAMAN = 1000
    const biaya: Array<Record<string, unknown>> = []
    for (let dari = 0; ; dari += HALAMAN) {
      const { data, error } = await request.db!
        .unsafe('project_expenses', 'kategori C lewat project_id; disaring ke projectIds()')
        .select('id, project_id, description, expense_date, total_amount, vendor_name, status')
        .in('project_id', idProyek)
        .neq('status', 'rejected')
        .order('expense_date', { ascending: true })
        .range(dari, dari + HALAMAN - 1)

      if (error) return reply.status(500).send({ error: error.message })
      if (!data || data.length === 0) break
      biaya.push(...(data as Array<Record<string, unknown>>))
      if (data.length < HALAMAN) break
    }

    const { data: proyek, error: eProyek } = await request.db!
      .from('projects').select('id, name')
    if (eProyek) return reply.status(500).send({ error: eProyek.message })
    const namaProyek = new Map((proyek ?? []).map((p) => [p.id as string, String(p.name ?? '—')]))

    type Pola = {
      pid: string; vendor: string; nominal: number
      bulan: Set<string>; total: number; contoh: string; terakhir: string
    }
    const pola = new Map<string, Pola>()

    for (const b of biaya) {
      const vendor = String(b.vendor_name ?? '').trim()
      if (!vendor) continue
      const nominal = Number(b.total_amount ?? 0)
      if (nominal <= 0) continue
      const tgl = String(b.expense_date ?? '').slice(0, 10)
      if (!tgl) continue

      const kunci = `${b.project_id}|${vendor.toLowerCase()}|${nominal}`
      const p = pola.get(kunci) ?? {
        pid: b.project_id as string, vendor, nominal,
        bulan: new Set<string>(), total: 0,
        contoh: String(b.description ?? '—'), terakhir: tgl,
      }
      p.bulan.add(tgl.slice(0, 7))
      p.total += nominal
      if (tgl > p.terakhir) p.terakhir = tgl
      pola.set(kunci, p)
    }

    let berulang = 0
    let dibuat = 0

    for (const [kunci, p] of pola) {
      if (p.bulan.size < ambangBulan) continue
      berulang++

      if (sudah('biaya_berulang', kunci)) continue

      const penerima = await resolveRecipients('biaya_berulang', {
        projectId: p.pid, companyId: request.companyId!,
      })

      // Perkiraan setahun dari nominal bulanannya, BUKAN dari total yang sudah
      // keluar — yang kedua menjawab "sudah habis berapa", yang pertama
      // menjawab "kalau diteruskan, habis berapa". Pertanyaan kedua yang
      // membuat orang memutuskan.
      const setahun = p.nominal * 12

      for (const uid of penerima) {
        await createNotification({
          company_id: request.companyId!,
          user_id:    uid,
          title:      'Pengeluaran Berulang Tiap Bulan',
          message:
            `"${p.contoh}" dari ${p.vendor} tercatat ${rp(p.nominal)} di `
            + `${p.bulan.size} bulan berbeda pada ${namaProyek.get(p.pid)} — `
            + `sudah ${rp(p.total)} seluruhnya, dan ${rp(setahun)} setahun bila `
            + 'diteruskan. Biaya seperti ini dicatat satu-satu tiap bulan, jadi '
            + 'ia tak pernah muncul sebagai satu keputusan yang pernah disetujui.',
          type:       'biaya_berulang',
          priority:   'normal',
          project_id: p.pid,
          action_url: '/kas/pengeluaran',
          action_data: {
            record_id: kunci,
            vendor: p.vendor, nominal_bulanan: p.nominal,
            bulan: p.bulan.size, total: p.total, perkiraan_setahun: setahun,
            terakhir: p.terakhir,
          },
        })
        dibuat++
      }
    }

    return reply.send({
      success: true, notifications_created: dibuat,
      checked: {
        biaya_diperiksa: biaya.length,
        pola_berulang: berulang,
        ambang_bulan: ambangBulan,
      },
    })
  })

  // ── GET /api/v1/otomasi/jalankan/margin-bocor ────────────────────────────
  //
  // Automation 2.5 — Margin Leakage Detection.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // TEMUAN TERBESARNYA BUKAN KEBOCORAN — MELAINKAN PROYEK YANG MARGINNYA
  // TIDAK BISA DINILAI SAMA SEKALI
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Diukur dari 16 proyek:
  //
  //     13   tak punya satu pun baris RAB
  //      2   RAB MELAMPAUI nilai kontraknya
  //      1   biaya nyata melampaui RAB
  //
  // Proyek tanpa RAB bukan proyek yang marginnya aman — ia proyek yang
  // marginnya tak diketahui siapa pun. Otomasi yang hanya membandingkan
  // biaya dengan RAB akan melaporkan ketiga belasnya sehat selamanya, dan
  // laporan itu terlihat persis seperti kabar baik.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // RAB > NILAI KONTRAK: SALAH SATUNYA PASTI KELIRU
  // ══════════════════════════════════════════════════════════════════════════
  //
  //     Pembangunan Rumah Bu Sari — Dago    kontrak Rp 1,07 M · RAB Rp 3,74 M
  //     Renovasi Rumah Pak Andi — Buah Batu kontrak Rp  285 jt · RAB Rp 1,30 M
  //
  // Rencana biaya yang lebih besar daripada uang yang akan diterima berarti
  // proyeknya direncanakan RUGI sebelum sekop pertama turun. Itu jarang
  // benar-benar terjadi; yang jauh lebih lazim salah satu angkanya keliru —
  // RAB tersalin dari proyek lain, atau nilai kontrak belum diperbarui
  // sesudah addendum.
  //
  // Pesannya menyatakan keduanya sebagai kemungkinan, tidak menuduh satu.
  // Otomasi yang menebak mana yang salah akan menyuruh orang memperbaiki
  // angka yang benar.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // HANYA BARIS `item` YANG DIJUMLAHKAN
  // ══════════════════════════════════════════════════════════════════════════
  //
  // `rab_items` berjenjang: `category` · `subcategory` · `item`. Menjumlahkan
  // seluruhnya menghitung ganda — induk memuat jumlah anaknya. Hasilnya RAB
  // terlihat dua sampai tiga kali lipat, dan tiap proyek jadi "rugi".
  app.get('/api/v1/otomasi/jalankan/margin-bocor', {
    preHandler: [authenticate, requirePermission('notifications:milestone:check')],
  }, async (request, reply) => {
    const { createNotification } = await import('../../utils/notifications.js')
    const { resolveRecipients } = await import('../../utils/notification-routing.js')

    const q = request.query as { persen?: string }
    const ambangPersen = await ambilAmbang(request, 'otomasi.margin_bocor.persen', q.persen)

    const today = new Date().toISOString().split('T')[0]
    const sudah = await pembuatDedup(request, today,
      ['margin_rab_lampaui_kontrak', 'margin_biaya_lampaui_rab', 'proyek_tanpa_rab'])

    const { data: proyek, error } = await request.db!
      .from('projects')
      .select('id, name, status, contract_value')

    if (error) return reply.status(500).send({ error: error.message })

    const idProyek = (proyek ?? []).map((p) => p.id as string)
    if (idProyek.length === 0) {
      return reply.send({
        success: true, notifications_created: 0,
        checked: { proyek: 0, ambang_persen: ambangPersen },
      })
    }

    /*
      RAB dijumlahkan dari baris berjenjang `item` SAJA — lihat komentar di
      atas. Dibaca berhalaman: RAB adalah tabel terbesar per proyek di sistem
      ini, dan pemotongan senyap di 1.000 baris membuat totalnya lebih kecil
      daripada kenyataan. Akibatnya proyek yang biayanya melampaui RAB justru
      terlihat aman.
    */
    const HALAMAN = 1000
    const rabPer = new Map<string, number>()
    for (let dari = 0; ; dari += HALAMAN) {
      const { data, error: eRab } = await request.db!
        .unsafe('rab_items', 'kategori C lewat project_id; disaring ke proyek ter-scope di atas')
        .select('project_id, total_price, level')
        .in('project_id', idProyek)
        .eq('level', 'item')
        .order('id', { ascending: true })
        .range(dari, dari + HALAMAN - 1)

      if (eRab) return reply.status(500).send({ error: eRab.message })
      if (!data || data.length === 0) break
      for (const r of data) {
        const pid = r.project_id as string
        rabPer.set(pid, (rabPer.get(pid) ?? 0) + Number(r.total_price ?? 0))
      }
      if (data.length < HALAMAN) break
    }

    const biayaPer = new Map<string, number>()
    for (let dari = 0; ; dari += HALAMAN) {
      const { data, error: eBiaya } = await request.db!
        .unsafe('project_expenses', 'kategori C lewat project_id; disaring ke proyek ter-scope')
        .select('project_id, total_amount, status')
        .in('project_id', idProyek)
        .eq('status', 'approved')
        .order('id', { ascending: true })
        .range(dari, dari + HALAMAN - 1)

      if (eBiaya) return reply.status(500).send({ error: eBiaya.message })
      if (!data || data.length === 0) break
      for (const b of data) {
        const pid = b.project_id as string
        biayaPer.set(pid, (biayaPer.get(pid) ?? 0) + Number(b.total_amount ?? 0))
      }
      if (data.length < HALAMAN) break
    }

    let rabLampau = 0
    let biayaLampau = 0
    const tanpaRab: Array<{ nama: string; kontrak: number }> = []
    let dibuat = 0

    for (const p of proyek ?? []) {
      const pid = p.id as string
      const st = String(p.status ?? '')
      // `draft` belum punya keputusan apa pun untuk dipertanyakan.
      if (st === 'draft' || st === 'cancelled') continue

      const kontrak = Number(p.contract_value ?? 0)
      const rab = rabPer.get(pid) ?? 0
      const biaya = biayaPer.get(pid) ?? 0

      /*
        Proyek TANPA RAB. Dikumpulkan jadi satu ringkasan, bukan satu pesan
        per proyek: pekerjaannya tunggal — duduk sekali dan menyusun RAB —
        dan tiga belas notifikasi untuk satu pekerjaan hanya jadi kebisingan.
      */
      if (rab <= 0) {
        if (kontrak > 0) tanpaRab.push({ nama: String(p.name ?? '—'), kontrak })
        continue
      }

      // ── Temuan 1: rencana biaya melampaui uang yang akan diterima
      if (kontrak > 0 && rab > kontrak) {
        rabLampau++
        if (!sudah('margin_rab_lampaui_kontrak', pid)) {
          const penerima = await resolveRecipients('margin_rab_lampaui_kontrak', {
            projectId: pid, companyId: request.companyId!,
          })
          const lipat = Math.round((rab / kontrak) * 10) / 10
          for (const uid of penerima) {
            await createNotification({
              company_id: request.companyId!,
              user_id:    uid,
              title:      'Rencana Biaya Melampaui Nilai Kontrak',
              message:
                `"${p.name}" bernilai kontrak ${rp(kontrak)} tetapi RAB-nya `
                + `${rp(rab)} — ${lipat}× lipat. Rencana biaya yang lebih besar `
                + 'daripada uang yang akan diterima berarti proyeknya '
                + 'direncanakan rugi. Yang jauh lebih lazim salah satu angkanya '
                + 'keliru: RAB tersalin dari proyek lain, atau nilai kontrak '
                + 'belum diperbarui sesudah addendum.',
              type:       'margin_rab_lampaui_kontrak',
              priority:   'high',
              project_id: pid,
              action_url: `/proyek/${pid}`,
              action_data: {
                record_id: pid, kontrak, rab, lipat,
              },
            })
            dibuat++
          }
        }
      }

      /*
        ── Temuan 2: biaya nyata mendekati atau melampaui RAB

        Ambangnya persen dari RAB, bukan selisih rupiah — proyek Rp 100 juta
        dan proyek Rp 10 miliar tak bisa dinilai dengan angka mutlak yang sama.
      */
      const serap = rab > 0 ? (biaya / rab) * 100 : 0
      if (serap >= ambangPersen) {
        biayaLampau++
        if (!sudah('margin_biaya_lampaui_rab', pid)) {
          const penerima = await resolveRecipients('margin_biaya_lampaui_rab', {
            projectId: pid, companyId: request.companyId!,
          })
          const lewat = biaya > rab
          for (const uid of penerima) {
            await createNotification({
              company_id: request.companyId!,
              user_id:    uid,
              title:      lewat ? 'Biaya Nyata Sudah Melampaui RAB'
                                : 'Biaya Nyata Mendekati Batas RAB',
              message:
                `"${p.name}": biaya yang sudah disetujui ${rp(biaya)} dari RAB `
                + `${rp(rab)} (${Math.round(serap)}%).`
                + (lewat
                  ? ` Kelebihannya ${rp(biaya - rab)} — setiap rupiah di atas `
                    + 'ini memakan margin, bukan anggaran.'
                  : ' Sisa anggarannya ' + rp(rab - biaya) + '.'),
              type:       'margin_biaya_lampaui_rab',
              priority:   lewat ? 'urgent' : 'high',
              project_id: pid,
              action_url: `/proyek/${pid}`,
              action_data: {
                record_id: pid, rab, biaya,
                serapan_persen: Math.round(serap),
              },
            })
            dibuat++
          }
        }
      }
    }

    /*
      ── Temuan 3: proyek bernilai kontrak TANPA RAB

      Inilah temuan terbesar hari ini, dan ia bukan kebocoran melainkan
      ketiadaan alat ukur. Proyek tanpa RAB bukan proyek yang marginnya aman —
      ia proyek yang marginnya tak diketahui siapa pun.
    */
    if (tanpaRab.length > 0 && !sudah('proyek_tanpa_rab', today)) {
      const penerima = await resolveRecipients('proyek_tanpa_rab', {
        projectId: null, companyId: request.companyId!,
      })
      const nilai = tanpaRab.reduce((t, x) => t + x.kontrak, 0)

      for (const uid of penerima) {
        await createNotification({
          company_id: request.companyId!,
          user_id:    uid,
          title:      'Proyek Berjalan Tanpa RAB',
          message:
            `${tanpaRab.length} proyek bernilai total ${rp(nilai)} belum punya `
            + 'satu pun baris RAB: '
            + `${tanpaRab.slice(0, 3).map((x) => `"${x.nama}"`).join(', ')}`
            + `${tanpaRab.length > 3 ? ', dan lainnya' : ''}. `
            + 'Tanpa RAB, tak ada yang bisa mengatakan apakah proyek ini untung '
            + 'atau rugi — dan ia akan terus terlihat sehat di laporan mana pun '
            + 'karena tak ada angka pembandingnya.',
          type:       'proyek_tanpa_rab',
          priority:   'high',
          project_id: undefined,
          action_url: '/estimasi',
          action_data: {
            record_id: today,
            proyek: tanpaRab.length,
            nilai_kontrak_total: nilai,
          },
        })
        dibuat++
      }
    }

    return reply.send({
      success: true, notifications_created: dibuat,
      checked: {
        proyek_diperiksa: (proyek ?? []).length,
        rab_lampaui_kontrak: rabLampau,
        biaya_mendekati_rab: biayaLampau,
        // Dilaporkan EKSPLISIT dan sengaja diletakkan di sini: tanpa angka
        // ini, "2 temuan" terbaca seolah 14 proyek lain sudah diperiksa dan
        // sehat. Tiga belas di antaranya tak pernah bisa diperiksa.
        tanpa_rab: tanpaRab.length,
        ambang_persen: ambangPersen,
      },
    })
  })

  // ── GET /api/v1/otomasi/jalankan/pemasok-terpencar ───────────────────────
  //
  // Automation 4.11 — Vendor Consolidation Advisor.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // ANGKA YANG DILAPORKAN ADALAH BATAS ATAS, DAN ITU DINYATAKAN DI PESANNYA
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Selisih harga tertinggi dikali seluruh volume yang dipesan menghasilkan
  // angka yang RAPI dan MENGGODA:
  //
  //     Besi Beton Ø12mm SNI   2 pemasok   Rp 100.000 → Rp 120.000
  //                            160 batang  selisih × qty = Rp 3.200.000
  //
  // Tetapi itu penghematan yang hanya terjadi kalau SELURUH pesanan bisa
  // dialihkan ke harga terendah, dan itu jarang benar. Harga berbeda karena
  // alasan yang tak terlihat di tabel: tempo pembayaran, ongkos kirim, siapa
  // yang bisa mengantar hari itu juga, dan siapa yang mau menalangi saat kas
  // sedang seret.
  //
  // Otomasi yang menyodorkan Rp 3,2 juta sebagai "penghematan" akan membuat
  // orang mengejar angka yang tak pernah ada, lalu berhenti percaya saat
  // ternyata tak tercapai. Maka pesannya menyebutnya SELISIH, menyatakan
  // sendiri bahwa itu batas atas, dan menyebut alasan-alasan sah yang mungkin
  // menjelaskannya.
  //
  // Yang benar-benar berguna dari otomasi ini bukan angkanya melainkan
  // PERTANYAANNYA: kenapa material yang sama dibeli dengan dua harga?
  //
  // ══════════════════════════════════════════════════════════════════════════
  // DIBACA DARI PESANAN PEMBELIAN, BUKAN DARI CATATAN BIAYA
  // ══════════════════════════════════════════════════════════════════════════
  //
  // `project_expenses.vendor_name` teks bebas yang diketik orang — "UD Besi
  // Kuat Mandiri" dan "UD. Besi Kuat" akan terbaca sebagai dua pemasok
  // berbeda, dan tiap salah ketik jadi temuan palsu.
  //
  // `purchase_orders.supplier_id` menunjuk baris pemasok yang sungguhan, dan
  // `purchase_order_items.material_id` menunjuk material yang sungguhan. Dua
  // penunjuk itu yang membuat perbandingannya bisa dipercaya.
  app.get('/api/v1/otomasi/jalankan/pemasok-terpencar', {
    preHandler: [authenticate, requirePermission('notifications:milestone:check')],
  }, async (request, reply) => {
    const { createNotification } = await import('../../utils/notifications.js')
    const { resolveRecipients } = await import('../../utils/notification-routing.js')

    const q = request.query as { persen?: string }
    const ambangPersen = await ambilAmbang(request, 'otomasi.pemasok_terpencar.persen', q.persen)

    const today = new Date().toISOString().split('T')[0]
    const sudah = await pembuatDedup(request, today, ['pemasok_terpencar'])

    const idProyek = await request.db!.projectIds()
    if (idProyek.length === 0) {
      return reply.send({
        success: true, notifications_created: 0,
        checked: { material_dibandingkan: 0, terpencar: 0, ambang_persen: ambangPersen },
      })
    }

    /*
      `purchase_orders` kategori C lewat `project_id`.

      `cancelled` DIBUANG: pesanan yang dibatalkan tak pernah jadi harga yang
      benar-benar dibayar, dan memasukkannya membuat selisih terhitung dari
      angka yang tak pernah terjadi.
    */
    const { data: po, error } = await request.db!
      .unsafe('purchase_orders', 'kategori C lewat project_id; disaring ke projectIds()')
      .select('id, project_id, supplier_id, status, order_date')
      .in('project_id', idProyek)
      .neq('status', 'cancelled')

    if (error) return reply.status(500).send({ error: error.message })

    const idPo = (po ?? []).map((p) => p.id as string)
    if (idPo.length === 0) {
      return reply.send({
        success: true, notifications_created: 0,
        checked: { material_dibandingkan: 0, terpencar: 0, ambang_persen: ambangPersen },
      })
    }

    const pemasokPo = new Map((po ?? []).map((p) => [p.id as string, p.supplier_id as string]))

    const HALAMAN = 1000
    const item: Array<Record<string, unknown>> = []
    for (let dari = 0; ; dari += HALAMAN) {
      const { data, error: eItem } = await request.db!
        .unsafe('purchase_order_items',
          'kategori C berhop-jauh lewat po_id; disaring ke pesanan ter-scope tenant di atas')
        .select('id, po_id, material_id, qty_ordered, unit, unit_price')
        .in('po_id', idPo)
        .gt('unit_price', 0)
        .order('id', { ascending: true })
        .range(dari, dari + HALAMAN - 1)

      if (eItem) return reply.status(500).send({ error: eItem.message })
      if (!data || data.length === 0) break
      item.push(...(data as Array<Record<string, unknown>>))
      if (data.length < HALAMAN) break
    }

    // `materials` kategori AB — master bersama; `suppliers` kategori B.
    const { data: material, error: eMat } = await request.db!
      .from('materials').select('id, name, unit')
    if (eMat) return reply.status(500).send({ error: eMat.message })
    const namaMaterial = new Map((material ?? []).map((m) => [m.id as string, m]))

    const { data: pemasok, error: ePem } = await request.db!
      .from('suppliers').select('id, name')
    if (ePem) return reply.status(500).send({ error: ePem.message })
    const namaPemasok = new Map((pemasok ?? []).map((s) => [s.id as string, String(s.name ?? '—')]))

    type Harga = { pemasok: string; harga: number; qty: number }
    const perMaterial = new Map<string, Harga[]>()
    for (const it of item) {
      const mid = it.material_id as string | null
      if (!mid) continue
      const sid = pemasokPo.get(it.po_id as string)
      if (!sid) continue
      const arr = perMaterial.get(mid) ?? []
      arr.push({
        pemasok: sid,
        harga: Number(it.unit_price ?? 0),
        qty: Number(it.qty_ordered ?? 0),
      })
      perMaterial.set(mid, arr)
    }

    let dibandingkan = 0
    let terpencar = 0
    let selisihTotal = 0
    let dibuat = 0

    for (const [mid, baris] of perMaterial) {
      const pemasokBeda = new Set(baris.map((b) => b.pemasok))
      // Satu pemasok saja bukan "terpencar" — tak ada yang bisa dikonsolidasi.
      if (pemasokBeda.size < 2) continue
      dibandingkan++

      /*
        Harga per PEMASOK diambil RATA-RATA tertimbang volumenya, bukan harga
        satu baris.

        Pemasok yang sekali memberi harga promosi lalu seterusnya normal tak
        boleh terlihat sebagai "yang termurah" hanya karena satu baris murah.
        Yang jadi pembanding harga yang benar-benar dibayar sepanjang periode.
      */
      const perPemasok = new Map<string, { nilai: number; qty: number }>()
      for (const b of baris) {
        const p = perPemasok.get(b.pemasok) ?? { nilai: 0, qty: 0 }
        p.nilai += b.harga * b.qty
        p.qty += b.qty
        perPemasok.set(b.pemasok, p)
      }

      const rata = [...perPemasok.entries()]
        .filter(([, v]) => v.qty > 0)
        .map(([sid, v]) => ({ sid, harga: v.nilai / v.qty }))
      if (rata.length < 2) continue

      const murah = rata.reduce((a, b) => (b.harga < a.harga ? b : a))
      const mahal = rata.reduce((a, b) => (b.harga > a.harga ? b : a))
      if (murah.harga <= 0) continue

      const bedaPersen = ((mahal.harga - murah.harga) / murah.harga) * 100
      if (bedaPersen < ambangPersen) continue
      terpencar++

      const qtyTotal = baris.reduce((t, b) => t + b.qty, 0)
      // BATAS ATAS, bukan penghematan. Lihat komentar kepala rute.
      const selisih = (mahal.harga - murah.harga) * qtyTotal
      selisihTotal += selisih

      if (sudah('pemasok_terpencar', mid)) continue

      const m = namaMaterial.get(mid)
      const penerima = await resolveRecipients('pemasok_terpencar', {
        projectId: null, companyId: request.companyId!,
      })

      for (const uid of penerima) {
        await createNotification({
          company_id: request.companyId!,
          user_id:    uid,
          title:      'Material Sama Dibeli dari Beberapa Pemasok',
          message:
            `${m?.name ?? 'Material'} dipesan dari ${pemasokBeda.size} pemasok `
            + `dengan harga rata-rata berbeda ${Math.round(bedaPersen)}%: `
            + `${namaPemasok.get(murah.sid)} ${rp(Math.round(murah.harga))} `
            + `lawan ${namaPemasok.get(mahal.sid)} ${rp(Math.round(mahal.harga))} `
            + `per ${m?.unit ?? 'satuan'}. `
            + `Atas ${qtyTotal} ${m?.unit ?? 'satuan'} yang sudah dipesan, `
            + `selisihnya ${rp(Math.round(selisih))} — itu BATAS ATAS, bukan `
            + 'penghematan yang pasti didapat: harga bisa berbeda karena tempo '
            + 'pembayaran, ongkos kirim, atau siapa yang sanggup mengantar '
            + 'lebih cepat. Yang layak ditanyakan: kenapa dua harga?',
          type:       'pemasok_terpencar',
          priority:   'normal',
          project_id: undefined,
          action_url: '/procurement/material',
          action_data: {
            record_id: mid,
            material: m?.name ?? null,
            pemasok: pemasokBeda.size,
            harga_terendah: Math.round(murah.harga),
            harga_tertinggi: Math.round(mahal.harga),
            beda_persen: Math.round(bedaPersen),
            qty_total: qtyTotal,
            selisih_batas_atas: Math.round(selisih),
          },
        })
        dibuat++
      }
    }

    return reply.send({
      success: true, notifications_created: dibuat,
      checked: {
        material_dibandingkan: dibandingkan,
        terpencar,
        // Dinamai `selisih`, BUKAN `potensi_hemat`. Nama kolom ikut terbaca
        // orang, dan "potensi hemat" adalah janji yang tak bisa ditepati
        // otomasi ini.
        selisih_batas_atas_total: Math.round(selisihTotal),
        ambang_persen: ambangPersen,
      },
    })
  })

  // ── GET /api/v1/otomasi/jalankan/stok-melenceng ──────────────────────────
  //
  // Automation 4.8 — Stock Opname Discrepancy Analysis.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // NOMOR INI SEMPAT SAYA CORET, DAN CORETANNYA SALAH
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Saya menyimpulkan 4.8 tak bisa dibangun karena `opname_bersama` mengukur
  // VOLUME PEKERJAAN, bukan stok gudang. Bagian itu benar — tetapi
  // kesimpulannya berhenti di tabel pertama yang tak cocok, tanpa menanyakan
  // pertanyaan berikutnya: *lalu di mana opname stok dicatat?*
  //
  // Jawabannya `stock_movements.movement_type = 'adjustment'`. Terukur tiga
  // baris, dan catatannya menyebut dirinya sendiri:
  //
  //     "Opname mingguan — koreksi 2 m² pecah saat handling"
  //
  // Bentuk kesalahan yang sama sudah terjadi dua kali hari ini pada penomoran
  // katalog: mencari di satu tempat, tak menemukan, lalu menyimpulkan tak ada.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // TEMUAN TERBESARNYA BUKAN PENYESUAIANNYA — MELAINKAN BUKU YANG TAK COCOK
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Diukur: 8 dari 12 baris `project_stocks` TIDAK cocok dengan jumlah
  // gerakannya sendiri.
  //
  //     Besi Beton Ø12mm SNI   sistem 5    buku gerakan 240
  //     Semen Portland 50kg    sistem 5    buku gerakan 152
  //
  // Ini kejadian KETIGA hari ini dari bentuk yang sama: kolom ringkasan yang
  // terlihat benar di satu layar, dan tak cocok dengan buku di belakangnya.
  // Dua sebelumnya penyusutan (dihitung, tak terjurnal) dan invoice
  // (diakui masuk, tanpa bukti penerimaan).
  //
  // Yang membuatnya berbahaya di gudang: `qty_on_hand` yang dipakai memutuskan
  // "perlu pesan lagi atau tidak". Kalau ia lebih kecil daripada kenyataan,
  // material dipesan padahal menumpuk; kalau lebih besar, pekerjaan berhenti
  // menunggu barang yang dikira ada.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // ARAH GERAKAN DIHITUNG PER JENIS, BUKAN DIJUMLAH MENTAH
  // ══════════════════════════════════════════════════════════════════════════
  //
  //     goods_receipt   menambah   → +qty
  //     usage           mengurangi → −qty
  //     adjustment      arahnya di `qty_after - qty_before`, bukan di `qty`
  //
  // Menjumlahkan `qty` apa adanya membuat pemakaian ikut menambah stok, dan
  // tiap baris jadi "melenceng" — laporan yang tak bisa dipakai.
  app.get('/api/v1/otomasi/jalankan/stok-melenceng', {
    preHandler: [authenticate, requirePermission('notifications:milestone:check')],
  }, async (request, reply) => {
    const { createNotification } = await import('../../utils/notifications.js')
    const { resolveRecipients } = await import('../../utils/notification-routing.js')

    const q = request.query as { satuan?: string }
    const ambangSatuan = await ambilAmbang(request, 'otomasi.stok_melenceng.satuan', q.satuan)

    const today = new Date().toISOString().split('T')[0]
    const sudah = await pembuatDedup(request, today,
      ['stok_melenceng', 'stok_susut_berulang'])

    const idProyek = await request.db!.projectIds()
    if (idProyek.length === 0) {
      return reply.send({
        success: true, notifications_created: 0,
        checked: { stok_diperiksa: 0, melenceng: 0, ambang_satuan: ambangSatuan },
      })
    }

    const { data: stok, error } = await request.db!
      .unsafe('project_stocks', 'kategori C lewat project_id; disaring ke projectIds()')
      .select('id, project_id, material_id, qty_on_hand')
      .in('project_id', idProyek)

    if (error) return reply.status(500).send({ error: error.message })

    /*
      Gerakan dibaca BERHALAMAN. Ia tumbuh tiap penerimaan dan tiap pemakaian —
      tabel paling ramai di gudang — dan pemotongan senyap membuat jumlahnya
      lebih kecil daripada kenyataan. Akibatnya stok yang sehat dilaporkan
      melenceng, dan itu jenis kesalahan yang paling cepat membuat orang
      berhenti membaca peringatan.
    */
    const HALAMAN = 1000
    const gerakan: Array<Record<string, unknown>> = []
    for (let dari = 0; ; dari += HALAMAN) {
      const { data, error: eGerak } = await request.db!
        .unsafe('stock_movements', 'kategori C lewat project_id; disaring ke projectIds()')
        .select('id, project_id, material_id, movement_type, qty, qty_before, qty_after, notes, created_at')
        .in('project_id', idProyek)
        .order('id', { ascending: true })
        .range(dari, dari + HALAMAN - 1)

      if (eGerak) return reply.status(500).send({ error: eGerak.message })
      if (!data || data.length === 0) break
      gerakan.push(...(data as Array<Record<string, unknown>>))
      if (data.length < HALAMAN) break
    }

    const { data: material, error: eMat } = await request.db!
      .from('materials').select('id, name, unit')
    if (eMat) return reply.status(500).send({ error: eMat.message })
    const namaMaterial = new Map((material ?? []).map((m) => [m.id as string, m]))

    const { data: proyek, error: eProyek } = await request.db!
      .from('projects').select('id, name')
    if (eProyek) return reply.status(500).send({ error: eProyek.message })
    const namaProyek = new Map((proyek ?? []).map((p) => [p.id as string, String(p.name ?? '—')]))

    /*
      Arah tiap jenis gerakan DIPAKU, bukan ditebak dari tanda `qty`.

      `adjustment` menyimpan arahnya di selisih `qty_after - qty_before`;
      `qty`-nya sendiri bisa negatif maupun positif tergantung siapa yang
      mencatat. Menebaknya dari tanda membuat koreksi turun terbaca sebagai
      penambahan pada sebagian baris.
    */
    const arah = (g: Record<string, unknown>): number => {
      const jenis = String(g.movement_type ?? '')
      if (jenis === 'goods_receipt') return Number(g.qty ?? 0)
      if (jenis === 'usage') return -Number(g.qty ?? 0)
      return Number(g.qty_after ?? 0) - Number(g.qty_before ?? 0)
    }

    const buku = new Map<string, number>()
    const penyesuaian = new Map<string, Array<Record<string, unknown>>>()
    for (const g of gerakan) {
      const kunci = `${g.project_id}|${g.material_id}`
      buku.set(kunci, (buku.get(kunci) ?? 0) + arah(g))
      if (String(g.movement_type ?? '') === 'adjustment') {
        const arr = penyesuaian.get(kunci) ?? []
        arr.push(g)
        penyesuaian.set(kunci, arr)
      }
    }

    let melenceng = 0
    let dibuat = 0

    for (const s of stok ?? []) {
      const pid = s.project_id as string
      const mid = s.material_id as string
      const kunci = `${pid}|${mid}`
      const sistem = Number(s.qty_on_hand ?? 0)
      const dariBuku = buku.get(kunci) ?? 0
      const selisih = Math.abs(sistem - dariBuku)

      if (selisih < ambangSatuan) continue
      melenceng++

      if (sudah('stok_melenceng', s.id as string)) continue

      const m = namaMaterial.get(mid)
      const penerima = await resolveRecipients('stok_melenceng', {
        projectId: pid, companyId: request.companyId!,
      })

      const lebihKecil = sistem < dariBuku
      for (const uid of penerima) {
        await createNotification({
          company_id: request.companyId!,
          user_id:    uid,
          title:      'Stok Tercatat Tak Cocok dengan Buku Gerakannya',
          message:
            `${m?.name ?? 'Material'} di ${namaProyek.get(pid)}: tercatat `
            + `${sistem} ${m?.unit ?? ''}, tetapi jumlah seluruh penerimaan, `
            + `pemakaian, dan penyesuaiannya ${dariBuku} ${m?.unit ?? ''} — `
            + `selisih ${selisih}. `
            + (lebihKecil
              ? 'Angka yang tercatat LEBIH KECIL: material bisa dipesan lagi '
                + 'padahal sebenarnya menumpuk.'
              : 'Angka yang tercatat LEBIH BESAR: pekerjaan bisa berhenti '
                + 'menunggu barang yang dikira ada.'),
          type:       'stok_melenceng',
          priority:   'high',
          project_id: pid,
          action_url: '/procurement/stok',
          action_data: {
            record_id: s.id as string,
            material: m?.name ?? null,
            sistem, buku: dariBuku, selisih,
          },
        })
        dibuat++
      }
    }

    /*
      ── Temuan kedua: penyesuaian opname yang selalu MENGURANGI

      Satu koreksi turun itu biasa — barang pecah, tumpah, salah hitung. Yang
      layak ditanyakan pola: material yang tiap opname selalu berkurang dan
      tak pernah bertambah. Kesalahan hitung menyimpang ke dua arah;
      kebocoran hanya ke satu.

      Terukur: tiga penyesuaian, semuanya −2, semuanya "pecah saat handling".
    */
    let susutBerulang = 0
    for (const [kunci, daftar] of penyesuaian) {
      if (daftar.length < 2) continue
      const semuaTurun = daftar.every((g) => arah(g) < 0)
      if (!semuaTurun) continue
      susutBerulang++

      const [pid, mid] = kunci.split('|')
      if (sudah('stok_susut_berulang', kunci)) continue

      const total = daftar.reduce((t, g) => t + Math.abs(arah(g)), 0)
      const m = namaMaterial.get(mid)
      const penerima = await resolveRecipients('stok_susut_berulang', {
        projectId: pid, companyId: request.companyId!,
      })

      for (const uid of penerima) {
        await createNotification({
          company_id: request.companyId!,
          user_id:    uid,
          title:      'Penyesuaian Stok Selalu Berkurang',
          message:
            `${m?.name ?? 'Material'} di ${namaProyek.get(pid)} sudah `
            + `${daftar.length} kali disesuaikan turun, total ${total} `
            + `${m?.unit ?? ''} — dan tak sekali pun naik. `
            + 'Kesalahan hitung menyimpang ke dua arah; yang hanya turun '
            + 'biasanya berarti barangnya benar-benar berkurang. '
            + `Catatan terakhir: "${String(daftar[daftar.length - 1].notes ?? '—')}".`,
          type:       'stok_susut_berulang',
          priority:   'normal',
          project_id: pid,
          action_url: '/procurement/stok',
          action_data: {
            record_id: kunci,
            material: m?.name ?? null,
            kali: daftar.length, total_turun: total,
          },
        })
        dibuat++
      }
    }

    return reply.send({
      success: true, notifications_created: dibuat,
      checked: {
        stok_diperiksa: (stok ?? []).length,
        melenceng,
        susut_berulang: susutBerulang,
        penyesuaian_opname: [...penyesuaian.values()].reduce((t, a) => t + a.length, 0),
        ambang_satuan: ambangSatuan,
      },
    })
  })

  // ── GET /api/v1/otomasi/jalankan/biaya-pencilan ──────────────────────────
  //
  // Automation 2.13 — Financial Anomaly Alert.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // SATU SINYAL YANG DIUKUR LALU DITOLAK
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Kandidat pertama terlihat menjanjikan: `gl.entry_voided` 424 kali lawan
  // `gl.entry_created` 3.387 — pembatalan jurnal massal terdengar persis
  // seperti anomali keuangan.
  //
  // Diukur lebih jauh: 424 pembatalan itu tersebar di **101 jam berbeda**,
  // oleh satu pengguna, sementara `journal_entries` yang tersisa cuma 19.
  // Itu bukan pembatalan mencurigakan melainkan aktivitas pengembangan yang
  // berulang — dan otomasi yang menandainya akan berbunyi tiap hari sampai
  // orang mematikannya.
  //
  // Sinyal yang terdengar paling nyaring sering yang paling harus diukur dua
  // kali. Ini kedua kalinya di berkas ini: 5.12′ menolak "di luar jam kerja"
  // karena 77% jejak memenuhinya.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // YANG DIPAKAI: PENCILAN TERHADAP KEBIASAAN PROYEK ITU SENDIRI
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Membandingkan satu pengeluaran dengan rata-rata SELURUH perusahaan tak
  // memisahkan apa pun: proyek gudang Rp 380 juta dan renovasi dapur Rp 90
  // juta memang berbelanja pada skala berbeda.
  //
  // Pembandingnya proyek itu sendiri, dan ukurannya simpangan baku:
  //
  //     Keramik 60x60 40 dus   Rp 6.880.000   z = 2,53   (rata Rp 2.867.500)
  //
  // Pola yang sama dengan 6.4 (upah menyimpang), dan alasan yang sama.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // YANG SUDAH DITANGKAP 2.7 SENGAJA DIKELUARKAN
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Nota yang tercatat dua kali sering ikut jadi pencilan — nominalnya sama,
  // jadi dua-duanya menonjol. Membiarkannya berarti satu baris yang sama
  // ditegur dua otomasi dengan dua penjelasan berbeda, dan penerimanya
  // menyimpulkan salah satunya salah.
  //
  // `biaya-kembar` sudah menanganinya dengan penjelasan yang tepat.
  app.get('/api/v1/otomasi/jalankan/biaya-pencilan', {
    preHandler: [authenticate, requirePermission('notifications:milestone:check')],
  }, async (request, reply) => {
    const { createNotification } = await import('../../utils/notifications.js')
    const { resolveRecipients } = await import('../../utils/notification-routing.js')

    const q = request.query as { sigma?: string; minimum?: string }
    const ambangSigma = await ambilAmbang(request, 'otomasi.biaya_pencilan.sigma', q.sigma)
    const minRiwayat = await ambilAmbang(request, 'otomasi.biaya_pencilan.minimum', q.minimum)

    const today = new Date().toISOString().split('T')[0]
    const sudah = await pembuatDedup(request, today, ['biaya_pencilan'])

    const idProyek = await request.db!.projectIds()
    if (idProyek.length === 0) {
      return reply.send({
        success: true, notifications_created: 0,
        checked: { biaya_diperiksa: 0, pencilan: 0, ambang_sigma: ambangSigma },
      })
    }

    const HALAMAN = 1000
    const biaya: Array<Record<string, unknown>> = []
    for (let dari = 0; ; dari += HALAMAN) {
      const { data, error } = await request.db!
        .unsafe('project_expenses', 'kategori C lewat project_id; disaring ke projectIds()')
        .select('id, project_id, description, expense_date, total_amount, vendor_name, status')
        .in('project_id', idProyek)
        .eq('status', 'approved')
        .order('id', { ascending: true })
        .range(dari, dari + HALAMAN - 1)

      if (error) return reply.status(500).send({ error: error.message })
      if (!data || data.length === 0) break
      biaya.push(...(data as Array<Record<string, unknown>>))
      if (data.length < HALAMAN) break
    }

    const { data: proyek, error: eProyek } = await request.db!
      .from('projects').select('id, name')
    if (eProyek) return reply.status(500).send({ error: eProyek.message })
    const namaProyek = new Map((proyek ?? []).map((p) => [p.id as string, String(p.name ?? '—')]))

    // Kelompokkan per proyek; sebaran dihitung dari proyek itu sendiri.
    const perProyek = new Map<string, Array<Record<string, unknown>>>()
    for (const b of biaya) {
      const pid = b.project_id as string
      const arr = perProyek.get(pid) ?? []
      arr.push(b)
      perProyek.set(pid, arr)
    }

    /*
      Pasangan KEMBAR dikeluarkan lebih dulu — bukan disaring belakangan.

      Nota yang tercatat dua kali membuat nominalnya muncul dua kali, dan itu
      MENGGESER rata-rata serta simpangan baku proyeknya. Membuangnya sesudah
      menghitung sebaran berarti sebarannya sudah tercemar oleh baris yang
      seharusnya tak dihitung.
    */
    const kembar = new Set<string>()
    for (const [, daftar] of perProyek) {
      for (let i = 0; i < daftar.length; i++) {
        for (let k = i + 1; k < daftar.length; k++) {
          const a = daftar[i]
          const b = daftar[k]
          if (Number(a.total_amount) !== Number(b.total_amount)) continue
          const va = String(a.vendor_name ?? '').trim().toLowerCase()
          const vb = String(b.vendor_name ?? '').trim().toLowerCase()
          if (!va || va !== vb) continue
          const ta = Date.parse(String(a.expense_date ?? '').slice(0, 10))
          const tb = Date.parse(String(b.expense_date ?? '').slice(0, 10))
          if (Math.abs(ta - tb) > 3 * 86_400_000) continue
          kembar.add(a.id as string)
          kembar.add(b.id as string)
        }
      }
    }

    let diperiksa = 0
    let pencilan = 0
    let takBisaDinilai = 0
    let dibuat = 0

    for (const [pid, semua] of perProyek) {
      const daftar = semua.filter((b) => !kembar.has(b.id as string))

      /*
        Sebaran butuh cukup titik. Dengan tiga pengeluaran, satu belanja besar
        MEMBUAT simpangan bakunya sendiri — dan lalu tampak wajar terhadap
        sebaran yang ia bentuk. Yang riwayatnya tipis DILAPORKAN, bukan
        dilewati diam.
      */
      if (daftar.length < minRiwayat) { takBisaDinilai += daftar.length; continue }
      diperiksa += daftar.length

      const nilai = daftar.map((b) => Number(b.total_amount ?? 0))
      const rata = nilai.reduce((a, b) => a + b, 0) / nilai.length
      const varian = nilai.reduce((t, v) => t + (v - rata) ** 2, 0) / (nilai.length - 1)
      const sd = Math.sqrt(varian)
      if (!(sd > 0)) continue

      for (const b of daftar) {
        const n = Number(b.total_amount ?? 0)
        const z = (n - rata) / sd
        // Hanya ke ATAS. Pengeluaran yang jauh lebih kecil daripada biasanya
        // bukan kejanggalan keuangan — itu belanja kecil, dan menegurnya
        // membuat daftar penuh hal yang tak perlu ditindaklanjuti.
        if (z < ambangSigma) continue
        pencilan++

        if (sudah('biaya_pencilan', b.id as string)) continue

        const penerima = await resolveRecipients('biaya_pencilan', {
          projectId: pid, companyId: request.companyId!,
        })

        for (const uid of penerima) {
          await createNotification({
            company_id: request.companyId!,
            user_id:    uid,
            title:      'Pengeluaran Jauh di Atas Kebiasaan Proyeknya',
            message:
              `"${b.description}" ${rp(n)} di ${namaProyek.get(pid)}`
              + (b.vendor_name ? ` dari ${b.vendor_name}` : '')
              + ` — biasanya proyek ini berbelanja sekitar ${rp(Math.round(rata))} `
              + `per catatan, dari ${daftar.length} pengeluaran. `
              + 'Bukan berarti salah: belanja besar memang ada. Yang layak '
              + 'diperiksa apakah ia sudah masuk anggaran, atau baru muncul '
              + 'setelahnya.',
            type:       'biaya_pencilan',
            priority:   z >= ambangSigma * 1.5 ? 'high' : 'normal',
            project_id: pid,
            action_url: '/kas/pengeluaran',
            action_data: {
              record_id: b.id as string,
              nominal: n,
              rata_proyek: Math.round(rata),
              simpangan: Math.round(z * 100) / 100,
              dari_catatan: daftar.length,
            },
          })
          dibuat++
        }
      }
    }

    return reply.send({
      success: true, notifications_created: dibuat,
      checked: {
        biaya_diperiksa: diperiksa,
        pencilan,
        // Dilaporkan EKSPLISIT — dua angka yang mudah tertukar dengan "aman":
        // pasangan kembar yang sengaja diserahkan ke 2.7, dan proyek yang
        // riwayatnya terlalu tipis untuk punya sebaran.
        dikeluarkan_karena_kembar: kembar.size,
        tak_bisa_dinilai: takBisaDinilai,
        ambang_sigma: ambangSigma,
        minimum_riwayat: minRiwayat,
      },
    })
  })

  // ── GET /api/v1/otomasi/jalankan/proyeksi-selesai ────────────────────────
  //
  // Automation 3.3 — Delay Prediction.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // KENAPA INI BUKAN PENGULANGAN 3.18 (EVM)
  // ══════════════════════════════════════════════════════════════════════════
  //
  // `evm-kinerja` sudah menjawab *"tertinggal berapa"* lewat indeks jadwal.
  // Pertanyaan di sini berbeda dan jauh lebih bisa ditindaklanjuti:
  //
  //     "Kalau laju ini diteruskan, selesainya kapan?"
  //
  // "SPI 0,4" menuntut penerimanya menerjemahkan sendiri. "Dengan laju enam
  // puluh hari terakhir, proyek ini selesai 14 November — 76 hari sesudah
  // tanggal kontrak" tidak.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // LAJU NOL ADALAH TEMUAN, BUKAN KEGAGALAN MENGHITUNG
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Terukur di basis: keenam proyek aktif terakhir melaporkan progres 2–4
  // BULAN lalu, dan semua tanggal targetnya sudah lewat. Lajunya nol.
  //
  // Otomasi yang membagi dengan laju nol menghasilkan tak-terhingga, lalu
  // memilih diam karena "tak bisa dihitung". Padahal proyek yang mandek di 50%
  // dengan target dua minggu lewat adalah sinyal keterlambatan TERKUAT yang
  // ada — bukan yang paling lemah.
  //
  // Maka laju nol dikirim sebagai temuannya sendiri, dengan kalimat yang
  // menyebut sejak kapan berhentinya.
  //
  // ── Beda dengan `progres-belum-lapor`
  //
  // Yang itu menegur MANDOR yang belum menyetor laporan. Yang ini bicara ke
  // manajer proyek tentang AKIBATNYA pada tanggal selesai. Sumbernya sama,
  // pertanyaannya beda, dan penerimanya beda.
  app.get('/api/v1/otomasi/jalankan/proyeksi-selesai', {
    preHandler: [authenticate, requirePermission('notifications:milestone:check')],
  }, async (request, reply) => {
    const { createNotification } = await import('../../utils/notifications.js')
    const { resolveRecipients } = await import('../../utils/notification-routing.js')

    const q = request.query as { hari?: string; diam?: string }
    const ambangHari = await ambilAmbang(request, 'otomasi.proyeksi_selesai.hari', q.hari)
    const ambangDiam = await ambilAmbang(request, 'otomasi.proyeksi_selesai.diam', q.diam)

    const today = new Date().toISOString().split('T')[0]
    const sudah = await pembuatDedup(request, today,
      ['proyeksi_selesai_meleset', 'progres_mandek'])

    const { data: proyek, error } = await request.db!
      .from('projects')
      .select('id, name, status, start_date, end_date')
      .eq('status', 'active')

    if (error) return reply.status(500).send({ error: error.message })

    const idProyek = (proyek ?? []).map((p) => p.id as string)
    if (idProyek.length === 0) {
      return reply.send({
        success: true, notifications_created: 0,
        checked: { proyek_aktif: 0, meleset: 0, mandek: 0, ambang_hari: ambangHari },
      })
    }

    /*
      Dibaca BERHALAMAN: satu proyek saja punya 244 catatan progres, dan
      pemotongan senyap membuat catatan TERBARU hilang — persis yang dipakai
      menghitung laju. Akibatnya proyek yang mandek terlihat masih bergerak.
    */
    const HALAMAN = 1000
    const log: Array<Record<string, unknown>> = []
    for (let dari = 0; ; dari += HALAMAN) {
      const { data, error: eLog } = await request.db!
        .unsafe('progress_logs', 'kategori C lewat project_id; disaring ke proyek aktif ter-scope')
        .select('id, project_id, pct_overall, logged_at')
        .in('project_id', idProyek)
        .not('pct_overall', 'is', null)
        .order('logged_at', { ascending: true })
        .range(dari, dari + HALAMAN - 1)

      if (eLog) return reply.status(500).send({ error: eLog.message })
      if (!data || data.length === 0) break
      log.push(...(data as Array<Record<string, unknown>>))
      if (data.length < HALAMAN) break
    }

    const perProyek = new Map<string, Array<{ pct: number; tgl: string }>>()
    for (const l of log) {
      const pid = l.project_id as string
      const tgl = String(l.logged_at ?? '').slice(0, 10)
      if (!tgl) continue
      const arr = perProyek.get(pid) ?? []
      arr.push({ pct: Number(l.pct_overall ?? 0), tgl })
      perProyek.set(pid, arr)
    }

    const hari = (a: string, b: string) =>
      Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)

    let meleset = 0
    let mandek = 0
    let takBisaDinilai = 0
    let dibuat = 0

    for (const p of proyek ?? []) {
      const pid = p.id as string
      const target = String(p.end_date ?? '').slice(0, 10)
      const daftar = (perProyek.get(pid) ?? []).sort((a, b) => (a.tgl < b.tgl ? -1 : 1))

      /*
        Butuh dua titik untuk punya laju. Satu catatan progres bukan laju —
        ia satu foto, dan memproyeksikan garis dari satu titik adalah menebak
        yang dibungkus angka.
      */
      if (daftar.length < 2 || !target) { takBisaDinilai++; continue }

      const akhir = daftar[daftar.length - 1]
      const diam = hari(akhir.tgl, today)

      // ── Temuan 1: laporan berhenti. Lajunya nol, dan itu SINYAL.
      if (diam >= ambangDiam) {
        mandek++
        if (!sudah('progres_mandek', pid)) {
          const penerima = await resolveRecipients('progres_mandek', {
            projectId: pid, companyId: request.companyId!,
          })
          const lewatTarget = hari(target, today)
          for (const uid of penerima) {
            await createNotification({
              company_id: request.companyId!,
              user_id:    uid,
              title:      'Progres Berhenti Dilaporkan — Tanggal Selesai Tak Bisa Diperkirakan',
              message:
                `"${p.name}" terakhir dilaporkan ${akhir.pct}% pada ${akhir.tgl}, `
                + `${diam} hari lalu. `
                + (lewatTarget > 0
                  ? `Tanggal targetnya (${target}) sudah lewat ${lewatTarget} hari `
                    + 'dan pekerjaannya belum 100%.'
                  : `Targetnya ${target}.`)
                + ' Tanpa laporan baru, tak ada yang bisa memperkirakan kapan '
                + 'ini selesai — dan berhentinya laporan sendiri sering tanda '
                + 'pekerjaannya memang berhenti.',
              type:       'progres_mandek',
              priority:   lewatTarget > 0 ? 'urgent' : 'high',
              project_id: pid,
              action_url: `/proyek/${pid}`,
              action_data: {
                record_id: pid,
                pct_terakhir: akhir.pct, tanggal_terakhir: akhir.tgl,
                diam_hari: diam, target, lewat_target: lewatTarget,
              },
            })
            dibuat++
          }
        }
        continue
      }

      /*
        ── Temuan 2: proyeksi tanggal selesai dari laju NYATA

        Lajunya diambil dari catatan pertama dan terakhir dalam jendela yang
        ada — bukan rata-rata seluruh riwayat. Proyek yang dua bulan pertamanya
        lambat lalu dipercepat tak boleh dinilai dari periode lambatnya.
      */
      const awal = daftar[0]
      const rentang = hari(awal.tgl, akhir.tgl)
      const naik = akhir.pct - awal.pct
      if (rentang <= 0 || naik <= 0) { takBisaDinilai++; continue }

      const perHari = naik / rentang
      const sisa = 100 - akhir.pct
      if (sisa <= 0) continue

      const hariLagi = Math.ceil(sisa / perHari)
      const proyeksi = new Date(Date.parse(`${akhir.tgl}T00:00:00Z`) + hariLagi * 86_400_000)
        .toISOString().slice(0, 10)
      const selisih = hari(target, proyeksi)

      if (selisih < ambangHari) continue
      meleset++

      if (sudah('proyeksi_selesai_meleset', pid)) continue

      const penerima = await resolveRecipients('proyeksi_selesai_meleset', {
        projectId: pid, companyId: request.companyId!,
      })

      for (const uid of penerima) {
        await createNotification({
          company_id: request.companyId!,
          user_id:    uid,
          title:      'Proyeksi Selesai Lewat dari Tanggal Kontrak',
          message:
            `"${p.name}" baru ${akhir.pct}% pada ${akhir.tgl}. `
            + `Dengan laju ${Math.round(perHari * 100) / 100}% per hari — `
            + `dihitung dari ${daftar.length} catatan sejak ${awal.tgl} — `
            + `sisanya butuh ${hariLagi} hari lagi, jadi selesai sekitar `
            + `${proyeksi}: ${selisih} hari setelah tanggal kontrak ${target}. `
            + 'Ini proyeksi dari laju yang sudah terjadi, bukan ramalan — ia '
            + 'berubah begitu lajunya berubah.',
          type:       'proyeksi_selesai_meleset',
          priority:   selisih >= ambangHari * 3 ? 'urgent' : 'high',
          project_id: pid,
          action_url: `/proyek/${pid}`,
          action_data: {
            record_id: pid,
            pct_terakhir: akhir.pct, laju_per_hari: Math.round(perHari * 1000) / 1000,
            proyeksi_selesai: proyeksi, target, meleset_hari: selisih,
            dari_catatan: daftar.length,
          },
        })
        dibuat++
      }
    }

    return reply.send({
      success: true, notifications_created: dibuat,
      checked: {
        proyek_aktif: (proyek ?? []).length,
        meleset,
        mandek,
        // Dilaporkan EKSPLISIT: proyek yang lajunya tak bisa dihitung sama
        // sekali — satu catatan, atau tanpa tanggal target. Tanpa angka ini,
        // "0 meleset" terbaca sebagai "semuanya tepat waktu".
        tak_bisa_dinilai: takBisaDinilai,
        ambang_hari: ambangHari,
        ambang_diam: ambangDiam,
      },
    })
  })

  // ── GET /api/v1/otomasi/jalankan/po-luar-kontrak ─────────────────────────
  //
  // Automation 4.13 — Contract Compliance Check (Supplier).
  //
  // ══════════════════════════════════════════════════════════════════════════
  // MEMBELI DI LUAR KONTRAK YANG SUDAH DINEGOSIASI SENDIRI
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Kontrak payung ada supaya harga terkunci untuk satu periode. Pesanan ke
  // pemasok yang punya kontrak aktif TETAPI tak menyebut kontraknya berarti
  // salah satu dari dua hal, dan keduanya perlu diketahui:
  //
  //   · dibeli di harga lain — negosiasinya terbuang
  //   · dibeli di harga kontrak tetapi tak tercatat — kuotanya tak berkurang,
  //     dan pemasok bisa menagih dua kali atas jatah yang sama
  //
  // Terukur: 4 pesanan ke pemasok berkontrak aktif, `kontrak_payung_id` NULL
  // di keempatnya.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // KUOTA HABIS ADALAH TEMUAN TERPISAH, DAN LEBIH MENDESAK
  // ══════════════════════════════════════════════════════════════════════════
  //
  //     Besi beton ulir D16   100 / 100 ton    HABIS
  //     Besi beton ulir D13    60 /  60 ton    HABIS
  //     Semen PCC 40 kg     11.040 / 12.000    92%
  //
  // Kuota yang habis berarti pesanan BERIKUTNYA tak lagi tercakup harga
  // kontrak — dan itu ketahuan saat pemasok mengirim tagihan dengan harga
  // berbeda, bukan sebelumnya.
  //
  // Dikirim terpisah karena tindakannya berbeda: yang satu mengoreksi pesanan
  // yang sudah dibuat, yang satu menegosiasikan tambahan kuota.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // 4.3 (FRAUD DETECTION) DIUKUR DAN TAK DIBANGUN — ALASANNYA DICATAT
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Pola penipuan pengadaan yang lazim semuanya diukur NOL di basis ini:
  // pesanan dipecah untuk menghindari ambang persetujuan (tak ada ambang yang
  // disetel sama sekali), dan pesanan ganda ke vendor sama pada hari sama (nol
  // pasangan).
  //
  // Membangunnya tetap menghasilkan rute yang memicu nol selamanya, lalu
  // dilaporkan "deteksi fraud sudah ada" — dan itu lebih berbahaya daripada
  // tak punya sama sekali, karena ia memberi rasa aman yang tak berdasar.
  app.get('/api/v1/otomasi/jalankan/po-luar-kontrak', {
    preHandler: [authenticate, requirePermission('notifications:milestone:check')],
  }, async (request, reply) => {
    const { createNotification } = await import('../../utils/notifications.js')
    const { resolveRecipients } = await import('../../utils/notification-routing.js')

    const q = request.query as { kuota?: string }
    const ambangKuota = await ambilAmbang(request, 'otomasi.kuota_payung.persen', q.kuota)

    const today = new Date().toISOString().split('T')[0]
    const sudah = await pembuatDedup(request, today,
      ['po_luar_kontrak', 'kuota_payung_menipis'])

    // `kontrak_payung` kategori B.
    const { data: payung, error } = await request.db!
      .from('kontrak_payung')
      .select('id, nomor, judul, supplier_id, status, berlaku_sampai, pagu_nilai')
      .eq('status', 'aktif')

    if (error) return reply.status(500).send({ error: error.message })

    if ((payung ?? []).length === 0) {
      return reply.send({
        success: true, notifications_created: 0,
        checked: { kontrak_aktif: 0, po_luar_kontrak: 0, kuota_menipis: 0 },
      })
    }

    const idPayung = (payung ?? []).map((k) => k.id as string)
    const pemasokBerkontrak = new Map<string, Array<Record<string, unknown>>>()
    for (const k of payung ?? []) {
      const sid = k.supplier_id as string
      const arr = pemasokBerkontrak.get(sid) ?? []
      arr.push(k)
      pemasokBerkontrak.set(sid, arr)
    }

    const idProyek = await request.db!.projectIds()
    const { data: po, error: ePo } = idProyek.length
      ? await request.db!
          .unsafe('purchase_orders', 'kategori C lewat project_id; disaring ke projectIds()')
          .select('id, po_number, project_id, supplier_id, status, order_date, kontrak_payung_id')
          .in('project_id', idProyek)
          .neq('status', 'cancelled')
      : { data: [], error: null }
    if (ePo) return reply.status(500).send({ error: ePo.message })

    const { data: pemasok, error: ePem } = await request.db!
      .from('suppliers').select('id, name')
    if (ePem) return reply.status(500).send({ error: ePem.message })
    const namaPemasok = new Map((pemasok ?? []).map((s) => [s.id as string, String(s.name ?? '—')]))

    const { data: proyek, error: eProyek } = await request.db!
      .from('projects').select('id, name')
    if (eProyek) return reply.status(500).send({ error: eProyek.message })
    const namaProyek = new Map((proyek ?? []).map((p) => [p.id as string, String(p.name ?? '—')]))

    let luarKontrak = 0
    let dibuat = 0

    for (const p of po ?? []) {
      // Sudah menyebut kontraknya — tak ada yang perlu ditanyakan.
      if (p.kontrak_payung_id) continue

      const kontrak = pemasokBerkontrak.get(p.supplier_id as string)
      // Pemasok tanpa kontrak aktif memang dibeli lepas; itu normal.
      if (!kontrak || kontrak.length === 0) continue

      /*
        Kontrak yang masa berlakunya sudah lewat pada TANGGAL PESANAN tak
        bisa dituntut dipakai. Membandingkannya dengan hari ini akan menuduh
        pesanan lama yang saat itu memang tak punya kontrak.
      */
      const tglPo = String(p.order_date ?? '').slice(0, 10)
      const berlaku = kontrak.filter((k) => {
        const sampai = String(k.berlaku_sampai ?? '').slice(0, 10)
        return !sampai || !tglPo || sampai >= tglPo
      })
      if (berlaku.length === 0) continue

      luarKontrak++
      if (sudah('po_luar_kontrak', p.id as string)) continue

      const pid = p.project_id as string
      const penerima = await resolveRecipients('po_luar_kontrak', {
        projectId: pid, companyId: request.companyId!,
      })

      for (const uid of penerima) {
        await createNotification({
          company_id: request.companyId!,
          user_id:    uid,
          title:      'Pesanan ke Pemasok Berkontrak Tanpa Menyebut Kontraknya',
          message:
            `${p.po_number} ke ${namaPemasok.get(p.supplier_id as string)} `
            + `di ${namaProyek.get(pid)} tidak menunjuk kontrak payung mana pun, `
            + `padahal pemasok itu punya ${berlaku.length} kontrak aktif `
            + `(${berlaku.map((k) => k.nomor).join(', ')}). `
            + 'Kalau dibeli di harga lain, negosiasinya terbuang; kalau dibeli '
            + 'di harga kontrak tetapi tak tercatat, kuotanya tak berkurang dan '
            + 'pemasok bisa menagih dua kali atas jatah yang sama.',
          type:       'po_luar_kontrak',
          priority:   'high',
          project_id: pid,
          action_url: '/procurement/lanjutan',
          action_data: {
            record_id: p.id as string,
            po: p.po_number,
            kontrak_tersedia: berlaku.map((k) => k.nomor),
          },
        })
        dibuat++
      }
    }

    /*
      ── Temuan kedua: kuota kontrak menipis atau habis

      Pesanan BERIKUTNYA tak lagi tercakup harga kontrak, dan itu ketahuan
      saat pemasok mengirim tagihan dengan harga berbeda — bukan sebelumnya.
    */
    /*
      `kontrak_payung_item` kategori B — `.from()` menyaringnya langsung lewat
      `company_id`. Versi pertama memakai `.unsafe()` dengan alasan "kategori C
      lewat kontrak_id", dan alasan itu KELIRU: tabelnya memang punya
      `company_id` sendiri.

      Alasan `.unsafe()` yang salah lebih buruk daripada tak ada: ia lolos
      penjaga tenancy dan meninggalkan pembenaran tertulis yang membuat
      pembaca berikutnya percaya keputusannya sudah diperiksa.

      Saringan `.in('kontrak_id', …)` tetap dipasang — bukan untuk tenancy,
      melainkan supaya hanya item milik kontrak AKTIF yang ikut terhitung.
    */
    const { data: item, error: eItem } = await request.db!
      .from('kontrak_payung_item')
      .select('id, kontrak_id, uraian, satuan, harga_satuan, kuota, terpakai')
      .in('kontrak_id', idPayung)

    if (eItem) return reply.status(500).send({ error: eItem.message })

    const nomorKontrak = new Map((payung ?? []).map((k) => [k.id as string, k]))
    /*
      TAK ADA cabang "item tanpa kuota", dan itu keputusan yang diukur.

      Versi pertama memasang penghitung `item_tanpa_kuota` sebagai pengaman —
      pola yang benar di tempat lain di berkas ini. Di sini ia KODE MATI:

          kuota  NOT NULL
          CHECK (kuota > 0)              payung_item_kuota_positif
          CHECK (terpakai <= kuota)      payung_item_tak_lebih_kuota

      Schema-nya menjamin tiap item punya kuota positif dan pemakaian tak
      pernah melampauinya. Penghitung itu akan melaporkan NOL selamanya.

      Medan `checked` yang selalu nol lebih buruk daripada tak ada: ia
      terlihat seperti pemeriksaan yang berjalan dan lulus, padahal tak pernah
      memeriksa apa pun. Kalau kelak constraint-nya dilonggarkan, yang harus
      berubah kode ini — bukan diam-diam mengandalkan pengaman yang tak
      pernah teruji.
    */
    let kuotaMenipis = 0

    for (const it of item ?? []) {
      const kuota = Number(it.kuota ?? 0)
      const pakai = Number(it.terpakai ?? 0)
      const persen = (pakai / kuota) * 100
      if (persen < ambangKuota) continue
      kuotaMenipis++

      if (sudah('kuota_payung_menipis', it.id as string)) continue

      const k = nomorKontrak.get(it.kontrak_id as string)
      const penerima = await resolveRecipients('kuota_payung_menipis', {
        projectId: null, companyId: request.companyId!,
      })

      const habis = pakai >= kuota
      for (const uid of penerima) {
        await createNotification({
          company_id: request.companyId!,
          user_id:    uid,
          title:      habis ? 'Kuota Kontrak Payung HABIS' : 'Kuota Kontrak Payung Menipis',
          message:
            `"${it.uraian}" pada ${k?.nomor ?? 'kontrak payung'}: `
            + `${pakai} dari ${kuota} ${it.satuan ?? ''} terpakai `
            + `(${Math.round(persen)}%). `
            + (habis
              ? 'Pesanan berikutnya TIDAK lagi tercakup harga kontrak — dan itu '
                + 'biasanya baru ketahuan saat tagihan datang dengan harga lain.'
              : `Harga kontraknya ${rp(Number(it.harga_satuan ?? 0))} per `
                + `${it.satuan ?? 'satuan'}; menambah kuota menuntut negosiasi, `
                + 'bukan sekadar memesan lagi.'),
          type:       'kuota_payung_menipis',
          priority:   habis ? 'urgent' : 'high',
          project_id: undefined,
          action_url: '/procurement/lanjutan',
          action_data: {
            record_id: it.id as string,
            kontrak: k?.nomor ?? null,
            uraian: it.uraian, kuota, terpakai: pakai,
            persen: Math.round(persen),
          },
        })
        dibuat++
      }
    }

    return reply.send({
      success: true, notifications_created: dibuat,
      checked: {
        kontrak_aktif: (payung ?? []).length,
        po_diperiksa: (po ?? []).length,
        po_luar_kontrak: luarKontrak,
        kuota_menipis: kuotaMenipis,
        item_kontrak: (item ?? []).length,
        ambang_persen: ambangKuota,
      },
    })
  })

  // ── GET /api/v1/otomasi/jalankan/invoice-ringkasan-melenceng ─────────────
  //
  // TANPA nomor katalog — dan itu diperiksa, bukan diasumsikan.
  //
  // Kandidat terdekat 2.1 *Auto Bank Reconciliation* menuntut integrasi
  // rekening koran bank, yang belum ada. Yang ini rekonsiliasi INTERNAL:
  // kolom ringkasan di `invoices` lawan baris `payments` yang sesungguhnya.
  // Tak ada nomor di katalog 140 yang menggambarkannya.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // ANGKA YANG BENAR DI SATU TEMPAT DAN KOSONG DI TEMPAT LAIN
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Terukur di basis dev:
  //
  //     INV/PRL/2026/016   status `partial`
  //     invoices.amount_paid           Rp 19.200.000
  //     jumlah baris `payments`        Rp          0
  //
  // Rp 19,2 juta tercatat sebagai sudah diterima tanpa satu pun bukti
  // penerimaan di belakangnya.
  //
  // Yang membuatnya berbahaya: pemeriksaan `total_amount = amount_paid +
  // amount_due` LULUS SEMPURNA di seluruh 26 invoice. Invoice itu konsisten
  // dengan dirinya sendiri; yang tak konsisten hubungannya dengan buku
  // pembayaran. Tak ada pemeriksaan satu-tabel yang bisa melihatnya.
  //
  // Bentuknya sama persis dengan temuan penyusutan (10.8): angka yang sudah
  // terlihat benar di satu layar, dan tak pernah sampai ke tempat yang
  // seharusnya membuktikannya.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // STATUS IKUT DIPERIKSA, KARENA IA YANG DIBACA ORANG
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Selisih rupiah dilihat bagian keuangan; STATUS dilihat semua orang —
  // termasuk klien di portal. Invoice berstatus `paid` yang bukunya belum
  // penuh berarti seseorang menutup tagihan yang belum lunas, dan penagihan
  // berhenti mengejarnya.
  app.get('/api/v1/otomasi/jalankan/invoice-ringkasan-melenceng', {
    preHandler: [authenticate, requirePermission('notifications:milestone:check')],
  }, async (request, reply) => {
    const { createNotification } = await import('../../utils/notifications.js')
    const { resolveRecipients } = await import('../../utils/notification-routing.js')

    const q = request.query as { rupiah?: string }
    const ambangRupiah = await ambilAmbang(request, 'otomasi.invoice_melenceng.rupiah', q.rupiah)

    const today = new Date().toISOString().split('T')[0]
    const sudah = await pembuatDedup(request, today,
      ['invoice_ringkasan_melenceng', 'invoice_status_melenceng'])

    const idProyek = await request.db!.projectIds()
    if (idProyek.length === 0) {
      return reply.send({
        success: true, notifications_created: 0,
        checked: { invoice: 0, melenceng: 0, ambang_rupiah: ambangRupiah },
      })
    }

    /*
      Keduanya dibaca BERHALAMAN. Invoice dan pembayaran tumbuh seumur
      perusahaan, bukan seumur proyek — dan pemotongan senyap PostgREST akan
      membuat sebagian pembayaran hilang dari penjumlahan. Akibatnya invoice
      yang sehat dilaporkan melenceng, dan itu jenis kesalahan yang paling
      cepat membuat orang berhenti membaca peringatan.
    */
    const HALAMAN = 1000
    const invoice: Array<Record<string, unknown>> = []
    for (let dari = 0; ; dari += HALAMAN) {
      const { data, error } = await request.db!
        .unsafe('invoices', 'kategori C lewat project_id; disaring ke projectIds()')
        .select('id, project_id, invoice_number, status, total_amount, amount_paid, amount_due')
        .in('project_id', idProyek)
        .order('id', { ascending: true })
        .range(dari, dari + HALAMAN - 1)

      if (error) return reply.status(500).send({ error: error.message })
      if (!data || data.length === 0) break
      invoice.push(...(data as Array<Record<string, unknown>>))
      if (data.length < HALAMAN) break
    }

    const idInvoice = invoice.map((i) => i.id as string)
    const dibayar = new Map<string, number>()
    for (let dari = 0; idInvoice.length > 0; dari += HALAMAN) {
      const { data, error: eBayar } = await request.db!
        .unsafe('payments',
          'kategori C berhop-jauh lewat invoice_id; disaring ke invoice ter-scope di atas')
        .select('id, invoice_id, amount_paid')
        .in('invoice_id', idInvoice)
        .order('id', { ascending: true })
        .range(dari, dari + HALAMAN - 1)

      if (eBayar) return reply.status(500).send({ error: eBayar.message })
      if (!data || data.length === 0) break
      for (const p of data) {
        const iid = p.invoice_id as string
        dibayar.set(iid, (dibayar.get(iid) ?? 0) + Number(p.amount_paid ?? 0))
      }
      if (data.length < HALAMAN) break
    }

    const { data: proyek, error: eProyek } = await request.db!
      .from('projects').select('id, name')
    if (eProyek) return reply.status(500).send({ error: eProyek.message })
    const namaProyek = new Map((proyek ?? []).map((p) => [p.id as string, String(p.name ?? '—')]))

    let melenceng = 0
    let statusSalah = 0
    let selisihTotal = 0
    let dibuat = 0

    for (const inv of invoice) {
      const iid = inv.id as string
      const pid = inv.project_id as string
      const ringkas = Number(inv.amount_paid ?? 0)
      const buku = dibayar.get(iid) ?? 0
      const total = Number(inv.total_amount ?? 0)
      const st = String(inv.status ?? '')

      // Invoice yang dibatalkan tak lagi menagih apa pun.
      if (st === 'cancelled' || st === 'void') continue

      const selisih = Math.abs(ringkas - buku)

      // ── Temuan 1: kolom ringkasan tak cocok dengan buku pembayaran
      if (selisih >= ambangRupiah) {
        melenceng++
        selisihTotal += selisih

        if (!sudah('invoice_ringkasan_melenceng', iid)) {
          const penerima = await resolveRecipients('invoice_ringkasan_melenceng', {
            projectId: pid, companyId: request.companyId!,
          })
          const lebihBesar = ringkas > buku
          for (const uid of penerima) {
            await createNotification({
              company_id: request.companyId!,
              user_id:    uid,
              title:      'Invoice: Angka Ringkasan Tak Cocok dengan Buku Pembayaran',
              message:
                `${inv.invoice_number} di ${namaProyek.get(pid)} mencatat `
                + `${rp(ringkas)} sudah diterima, tetapi jumlah seluruh baris `
                + `pembayarannya ${rp(buku)} — selisih ${rp(selisih)}. `
                + (lebihBesar
                  ? 'Uang yang diakui masuk tak punya bukti penerimaan di '
                    + 'belakangnya.'
                  : 'Ada pembayaran tercatat yang belum diakui di invoicenya, '
                    + 'jadi tagihan ini terlihat lebih besar daripada sisanya.')
                + ' Pemeriksaan "total = dibayar + sisa" tetap lulus pada '
                + 'invoice ini, jadi selisihnya tak terlihat dari layar mana pun.',
              type:       'invoice_ringkasan_melenceng',
              priority:   'urgent',
              project_id: pid,
              action_url: '/piutang',
              action_data: {
                record_id: iid,
                nomor: inv.invoice_number,
                ringkasan: ringkas, buku, selisih,
              },
            })
            dibuat++
          }
        }
      }

      /*
        ── Temuan 2: STATUS tak sejalan dengan buku pembayaran

        Dipisah karena pembacanya berbeda. Selisih rupiah dilihat bagian
        keuangan; status dilihat semua orang, termasuk klien di portal.
      */
      const bukuLunas = total > 0 && buku >= total - 0.005
      const salah =
        (st === 'paid' && !bukuLunas) ? 'ditandai LUNAS tetapi buku pembayarannya belum penuh'
        : (st === 'partial' && buku <= 0) ? 'ditandai DIBAYAR SEBAGIAN tetapi belum ada satu pun pembayaran tercatat'
        : (st === 'sent' && buku > 0) ? 'masih ditandai TERKIRIM padahal sudah ada pembayaran tercatat'
        : null

      if (!salah) continue
      statusSalah++
      if (sudah('invoice_status_melenceng', iid)) continue

      const penerima = await resolveRecipients('invoice_status_melenceng', {
        projectId: pid, companyId: request.companyId!,
      })
      for (const uid of penerima) {
        await createNotification({
          company_id: request.companyId!,
          user_id:    uid,
          title:      'Status Invoice Tak Sejalan dengan Pembayarannya',
          message:
            `${inv.invoice_number} di ${namaProyek.get(pid)} ${salah}. `
            + `Nilai tagihan ${rp(total)}, tercatat masuk ${rp(buku)}. `
            + (st === 'paid'
              ? 'Selama berstatus lunas, penagihan berhenti mengejarnya.'
              : 'Status ini juga yang dilihat klien di portal.'),
          type:       'invoice_status_melenceng',
          priority:   st === 'paid' ? 'urgent' : 'high',
          project_id: pid,
          action_url: '/piutang',
          action_data: {
            record_id: iid, nomor: inv.invoice_number,
            status: st, total, buku,
          },
        })
        dibuat++
      }
    }

    return reply.send({
      success: true, notifications_created: dibuat,
      checked: {
        invoice: invoice.length,
        ringkasan_melenceng: melenceng,
        status_melenceng: statusSalah,
        selisih_total: Math.round(selisihTotal),
        ambang_rupiah: ambangRupiah,
      },
    })
  })

  // ── GET /api/v1/otomasi/jalankan/kesiapan-audit ──────────────────────────
  //
  // Automation 9.9 — Audit Readiness Checker.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // YANG DIPERIKSA KELENGKAPAN JENIS, BUKAN JUMLAH BERKAS
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Proyek dengan tiga puluh foto progres dan tanpa satu pun kontrak lebih
  // tak siap diaudit daripada proyek dengan empat berkas yang tepat. Menghitung
  // "punya dokumen atau tidak" menyamakan keduanya.
  //
  // Empat jenis yang dianggap wajib, dan alasannya masing-masing:
  //
  //     kontrak        dasar hukum seluruh pekerjaan
  //     spk            perintah kerja — tanpa ini, siapa menyuruh apa tak jelas
  //     gambar_kerja   acuan pelaksanaan; sengketa mutu selalu kembali ke sini
  //     berita_acara   bukti pekerjaan diserahkan dan diterima
  //
  // ══════════════════════════════════════════════════════════════════════════
  // BERITA ACARA HANYA WAJIB PADA PROYEK YANG SUDAH ATAU HAMPIR SELESAI
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Menuntutnya pada proyek yang baru berjalan dua minggu adalah menuntut
  // bukti serah terima untuk pekerjaan yang belum diserahkan. Otomasi yang
  // melakukannya membuat tiap proyek baru langsung "tidak siap audit", dan
  // daftar yang selalu penuh berhenti dibaca.
  app.get('/api/v1/otomasi/jalankan/kesiapan-audit', {
    preHandler: [authenticate, requirePermission('notifications:milestone:check')],
  }, async (request, reply) => {
    const { createNotification } = await import('../../utils/notifications.js')
    const { resolveRecipients } = await import('../../utils/notification-routing.js')

    const today = new Date().toISOString().split('T')[0]
    const sudah = await pembuatDedup(request, today, ['kesiapan_audit'])

    const idProyek = await request.db!.projectIds()
    if (idProyek.length === 0) {
      return reply.send({
        success: true, notifications_created: 0,
        checked: { proyek: 0, belum_lengkap: 0 },
      })
    }

    const { data: proyek, error } = await request.db!
      .from('projects')
      .select('id, name, status, end_date, contract_value')

    if (error) return reply.status(500).send({ error: error.message })

    /*
      `documents` kategori C lewat `project_id`. Dibaca BERHALAMAN: berkas
      proyek tumbuh paling cepat di antara semua tabel — foto progres saja
      bisa ratusan per bulan — dan pemotongan senyap membuat jenis yang ada
      terlihat hilang. Akibatnya proyek yang lengkap dilaporkan kurang.
    */
    const HALAMAN = 1000
    const punyaJenis = new Map<string, Set<string>>()
    for (let dari = 0; ; dari += HALAMAN) {
      const { data, error: eDok } = await request.db!
        .unsafe('documents', 'kategori C lewat project_id; disaring ke projectIds()')
        .select('id, project_id, doc_type')
        .in('project_id', idProyek)
        .order('id', { ascending: true })
        .range(dari, dari + HALAMAN - 1)

      if (eDok) return reply.status(500).send({ error: eDok.message })
      if (!data || data.length === 0) break
      for (const d of data) {
        const pid = d.project_id as string
        const s = punyaJenis.get(pid) ?? new Set<string>()
        s.add(String(d.doc_type ?? ''))
        punyaJenis.set(pid, s)
      }
      if (data.length < HALAMAN) break
    }

    const WAJIB_SELALU = [
      { jenis: 'kontrak', sebut: 'kontrak' },
      { jenis: 'spk', sebut: 'SPK' },
      { jenis: 'gambar_kerja', sebut: 'gambar kerja' },
    ]

    let belumLengkap = 0
    let dibuat = 0
    let takBisaDinilai = 0

    for (const p of proyek ?? []) {
      const pid = p.id as string
      const st = String(p.status ?? '')
      // `draft` dan `cancelled` belum/tak lagi punya kewajiban arsip.
      if (st === 'draft' || st === 'cancelled') continue

      const ada = punyaJenis.get(pid) ?? new Set<string>()
      const kurang = WAJIB_SELALU.filter((w) => !ada.has(w.jenis)).map((w) => w.sebut)

      /*
        Berita acara: hanya dituntut kalau pekerjaannya sudah selesai atau
        tanggal selesainya sudah lewat. Sebelum itu, ketiadaannya normal.
      */
      const akhir = String(p.end_date ?? '').slice(0, 10)
      const sudahRampung = st === 'completed'
        || (akhir !== '' && akhir <= today)
      if (sudahRampung && !ada.has('berita_acara')) kurang.push('berita acara')

      if (kurang.length === 0) continue
      belumLengkap++
      if (ada.size === 0) takBisaDinilai++

      if (sudah('kesiapan_audit', pid)) continue

      const penerima = await resolveRecipients('kesiapan_audit', {
        projectId: pid, companyId: request.companyId!,
      })

      const nilai = Number(p.contract_value ?? 0)
      for (const uid of penerima) {
        await createNotification({
          company_id: request.companyId!,
          user_id:    uid,
          title:      ada.size === 0 ? 'Proyek Tanpa Satu Pun Berkas Tersimpan'
                                     : 'Berkas Proyek Belum Lengkap untuk Diaudit',
          message:
            `"${p.name}"`
            + (nilai > 0 ? ` (nilai kontrak ${rp(nilai)})` : '')
            + ` belum punya ${kurang.join(', ')}.`
            + (ada.size === 0
              ? ' Tak ada satu pun berkas tersimpan untuk proyek ini — kalau '
                + 'auditor atau klien memintanya, tak ada yang bisa dikeluarkan.'
              : ` Yang sudah ada: ${[...ada].join(', ').replace(/_/g, ' ')}.`)
            + (sudahRampung && kurang.includes('berita acara')
              ? ' Pekerjaannya sudah lewat tanggal selesai, jadi berita acara '
                + 'seharusnya sudah ada.'
              : ''),
          type:       'kesiapan_audit',
          // Yang NOL berkas paling mendesak: yang lain tinggal melengkapi,
          // yang ini belum mulai mengarsip sama sekali.
          priority:   ada.size === 0 ? 'high' : 'normal',
          project_id: pid,
          action_url: '/dokumen/kendali',
          action_data: {
            record_id: pid,
            kurang, jenis_ada: [...ada], nilai_kontrak: nilai,
          },
        })
        dibuat++
      }
    }

    return reply.send({
      success: true, notifications_created: dibuat,
      checked: {
        proyek_diperiksa: (proyek ?? []).length,
        belum_lengkap: belumLengkap,
        // Dipisah karena maknanya berbeda: yang ini bukan "kurang berkas",
        // melainkan belum mengarsip sama sekali.
        tanpa_berkas_sama_sekali: takBisaDinilai,
      },
    })
  })

  // ── GET /api/v1/otomasi/jalankan/opname-menggantung ──────────────────────
  //
  // TANPA nomor katalog, dan itu diperiksa.
  //
  // Kandidat terdekat 4.8 *Stock Opname Discrepancy Analysis* — dan itu opname
  // STOK GUDANG. `opname_bersama` mengukur VOLUME PEKERJAAN bersama mandor;
  // yang satu menghitung barang di rak, yang satu menentukan berapa orang
  // dibayar. Menempelkan 4.8 padanya akan membuat katalog mengklaim modul
  // gudang yang tak dikerjakan — kesalahan yang sama persis dengan menempelkan
  // 7.10 pada kontrak pemasok.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // OPNAME YANG MENGGANTUNG ADALAH UPAH YANG TERTAHAN
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Opname bersama menentukan berapa volume pekerjaan yang diakui, dan dari
  // situlah tagihan mandor dihitung. Selama berstatus `diajukan`, mandor sudah
  // mengerjakan tetapi belum bisa menagih.
  //
  // Itu membuat keterlambatan di sini berbeda sifatnya dari keterlambatan
  // administratif lain: yang menanggung bukan perusahaan melainkan orang yang
  // sudah bekerja.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // SENGKETA DIKIRIM TERPISAH, DAN TENGGANGNYA NOL
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Opname `disengketakan` bukan opname yang lambat diproses — ia opname yang
  // pengukurnya dan mandornya TIDAK SEPAKAT. Menunggu tenggang untuk itu tak
  // masuk akal: yang dibutuhkan orang ketiga yang memutuskan, dan ia dibutuhkan
  // sejak hari sengketanya dicatat.
  app.get('/api/v1/otomasi/jalankan/opname-menggantung', {
    preHandler: [authenticate, requirePermission('notifications:milestone:check')],
  }, async (request, reply) => {
    const { createNotification } = await import('../../utils/notifications.js')
    const { resolveRecipients } = await import('../../utils/notification-routing.js')

    const q = request.query as { hari?: string }
    const ambangHari = await ambilAmbang(request, 'otomasi.opname_menggantung.hari', q.hari)

    const today = new Date().toISOString().split('T')[0]
    const sudah = await pembuatDedup(request, today,
      ['opname_menggantung', 'opname_disengketakan'])

    // `opname_bersama` kategori B — `.from()` menyaringnya langsung.
    const { data: opname, error } = await request.db!
      .from('opname_bersama')
      .select(`id, project_id, work_scope_id, nomor, tanggal_opname, status,
               alasan_sengketa`)
      .neq('status', 'diverifikasi')

    if (error) return reply.status(500).send({ error: error.message })

    const { data: proyek, error: eProyek } = await request.db!
      .from('projects').select('id, name')
    if (eProyek) return reply.status(500).send({ error: eProyek.message })
    const namaProyek = new Map((proyek ?? []).map((p) => [p.id as string, String(p.name ?? '—')]))

    let menggantung = 0
    let sengketa = 0
    let dibuat = 0

    for (const o of opname ?? []) {
      const tgl = String(o.tanggal_opname ?? '').slice(0, 10)
      if (!tgl) continue
      const umur = Math.round(
        (Date.parse(today + 'T00:00:00Z') - Date.parse(tgl + 'T00:00:00Z')) / 86_400_000)
      const pid = o.project_id as string

      // ── Sengketa: tenggangnya NOL
      if (String(o.status ?? '') === 'disengketakan') {
        sengketa++
        if (sudah('opname_disengketakan', o.id as string)) continue

        const penerima = await resolveRecipients('opname_disengketakan', {
          projectId: pid, companyId: request.companyId!,
        })
        for (const uid of penerima) {
          await createNotification({
            company_id: request.companyId!,
            user_id:    uid,
            title:      'Opname Bersama Disengketakan',
            message:
              `${o.nomor} di ${namaProyek.get(pid)} (${umur} hari lalu) `
              + 'disengketakan: '
              // Alasannya diketik orang dan sering sudah berakhiran titik —
              // menambah satu lagi menghasilkan ".." yang terbaca seperti
              // teks yang terpotong.
              + `${String(o.alasan_sengketa ?? 'alasan tak dicatat').replace(/[.\s]+$/, '')}. `
              + 'Selama belum diputuskan, volume yang diakui belum ada — dan '
              + 'mandor tak bisa menagih pekerjaan yang sudah dikerjakannya.',
            type:       'opname_disengketakan',
            priority:   'urgent',
            project_id: pid,
            action_url: '/mandor/opname',
            action_data: {
              record_id: o.id as string, nomor: o.nomor, umur_hari: umur,
            },
          })
          dibuat++
        }
        continue
      }

      if (umur < ambangHari) continue
      menggantung++

      if (sudah('opname_menggantung', o.id as string)) continue

      const penerima = await resolveRecipients('opname_menggantung', {
        projectId: pid, companyId: request.companyId!,
      })
      for (const uid of penerima) {
        await createNotification({
          company_id: request.companyId!,
          user_id:    uid,
          title:      'Opname Bersama Belum Diverifikasi',
          message:
            `${o.nomor} di ${namaProyek.get(pid)} diajukan ${umur} hari lalu `
            + 'dan belum diverifikasi. Selama belum, mandor sudah mengerjakan '
            + 'tetapi belum bisa menagih — yang menanggung keterlambatannya '
            + 'bukan perusahaan melainkan orang yang sudah bekerja.',
          type:       'opname_menggantung',
          priority:   umur >= ambangHari * 2 ? 'urgent' : 'high',
          project_id: pid,
          action_url: '/mandor/opname',
          action_data: {
            record_id: o.id as string, nomor: o.nomor, umur_hari: umur,
          },
        })
        dibuat++
      }
    }

    return reply.send({
      success: true, notifications_created: dibuat,
      checked: {
        belum_diverifikasi: (opname ?? []).length,
        menggantung,
        disengketakan: sengketa,
        ambang_hari: ambangHari,
      },
    })
  })

  // ── GET /api/v1/otomasi/jalankan/kirim-pengingat ──────────────────────────
  //
  // Pasangan `titip_pengingat`. Tanpa rute ini, janji yang dititipkan pengguna
  // tersimpan rapi dan TAK PERNAH dibacakan kembali — pola setengah-rantai yang
  // sudah enam kali terjadi di repo ini (tombol konfirmasi tak pernah dibuat,
  // riwayat tak pernah diisi, sub-menu tak pernah dinyalakan, asisten
  // owner/web tak pernah dipanggil, label UI tertinggal, seluruh jalur
  // approval). Catatan yang tak pernah dibacakan ulang sama saja dengan tak
  // dicatat.
  //
  // ── Kenapa TIDAK lewat dedup harian
  //
  // `pembuatDedup()` menahan notifikasi kembar per (type, record_id, hari).
  // Di sini yang menahan lebih kuat: `dikirim_pada` ditulis SETELAH terkirim,
  // dan baris yang sudah terisi tak pernah terambil lagi. Menambah dedup di
  // atasnya hanya menyembunyikan kalau penandaan itu gagal.
  app.get('/api/v1/otomasi/jalankan/kirim-pengingat', {
    preHandler: [authenticate, requirePermission('notifications:milestone:check')],
  }, async (request, reply) => {
    const { createNotification } = await import('../../utils/notifications.js')

    /*
     * Yang jatuh tempo DAN belum terkirim DAN belum dibatalkan.
     *
     * `jatuh_pada <= now()` — bukan "hari ini": pengingat yang terlewat
     * (server mati, tugas tertunda) tetap harus sampai, terlambat lebih baik
     * daripada hilang. Indeks parsial di migrasi 414 melayani query ini.
     */
    const { data, error } = await request.db!
      .from('pengingat_asisten')
      .select('id, user_id, isi, jatuh_pada, project_id')
      .is('dikirim_pada', null)
      .is('dibatalkan_pada', null)
      .lte('jatuh_pada', new Date().toISOString())
      .order('jatuh_pada', { ascending: true })
      .limit(200)

    if (error) {
      request.log.error({ err: error }, 'kirim-pengingat: gagal membaca')
      return reply.status(500).send({ error: 'Gagal membaca pengingat' })
    }

    const jatuh = (data ?? []) as unknown as Array<{
      id: string; user_id: string; isi: string; jatuh_pada: string; project_id: string | null
    }>

    let dikirim = 0
    for (const p of jatuh) {
      /*
       * DITANDAI DULU, baru dikirim — dan `dikirim_pada IS NULL` ikut di WHERE.
       *
       * Urutan sebaliknya membuat dua putaran yang tumpang-tindih sama-sama
       * melihat "belum terkirim" lalu sama-sama mengirim. Pengingat ganda
       * bukan bencana, tetapi ia mengajari orang mengabaikan pengingat — dan
       * itu menghapus seluruh gunanya.
       *
       * Konsekuensi yang diterima sadar: kalau pengirimannya gagal SESUDAH
       * penandaan, pengingatnya hilang. Itu dicatat di log, dan lebih ringan
       * daripada pengingat yang berbunyi berkali-kali.
       */
      const { data: diklaim, error: errKlaim } = await request.db!
        .from('pengingat_asisten')
        .update({ dikirim_pada: new Date().toISOString() })
        .eq('id', p.id)
        .is('dikirim_pada', null)
        .select('id')

      if (errKlaim || !Array.isArray(diklaim) || diklaim.length === 0) continue

      await createNotification({
        company_id: request.companyId!,
        user_id: p.user_id,
        title: 'Pengingat Anda',
        message: p.isi,
        type: 'pengingat_asisten',
        priority: 'normal',
        ...(p.project_id ? { project_id: p.project_id } : {}),
      })
      dikirim++
    }

    return reply.send({
      success: true,
      notifications_created: dikirim,
      checked: { jatuh_tempo: jatuh.length },
    })
  })

  // ── GET /api/v1/otomasi/jalankan/perawatan-diprediksi ────────────────────
  //
  // Automation 10.2 — Predictive Maintenance Alert.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // KENAPA INI BUKAN DUPLIKAT `perawatan-alat` (10.7)
  // ══════════════════════════════════════════════════════════════════════════
  //
  // 10.7 memperingatkan berdasarkan JATUH TEMPO, dan untuk jalur jam ia menulis
  // batasannya sendiri di komentar:
  //
  //     "Jam TAK punya padanan 'N hari sebelum'. Ambang hari bisa dibaca
  //      sebagai kalender; ambang jam tidak — 14 jam operasi bisa habis dalam
  //      dua hari atau dua bulan tergantung alatnya. Jadi untuk jalur jam
  //      ambangnya nol: yang sudah melewati jam servisnya sudah terlambat."
  //
  // Benar — SELAMA lajunya tak diketahui. Begitu jam-meter tercatat berkali-kali
  // pada tanggal berbeda, lajunya terukur dan sisa jam punya padanan hari.
  //
  // Diukur pada basis nyata 2026-08-16:
  //
  //   Excavator 20 Ton   8,7 jam/hari   sisa  −18 jam   10.7 sudah bersuara
  //   Truk Mixer 7 m3    6,7 jam/hari   sisa  190 jam   10.7 DIAM — 28 hari lagi
  //   Mobile Crane       tak ada meter  sisa  500 jam   10.7 DIAM SELAMANYA
  //
  // Dua baris terakhir itulah yang rute ini tangkap.
  //
  // ── Baris ketiga adalah cacat yang paling berbahaya
  //
  // `hitungJatuhTempo` memulangkan `belum_ada_acuan` untuk jadwal tanpa
  // `tanggal_terakhir` MAUPUN pembacaan meter, dan 10.7 sengaja MELEWATINYA
  // tanpa notifikasi — dengan alasan yang sah: "jadwal yang belum pernah
  // dipakai, menegurnya tiap hari cuma kebisingan".
  //
  // Tapi ada kasus yang tak sama: jadwal berbasis JAM pada alat yang jelas-jelas
  // DIPAKAI, hanya saja jam-meternya tak pernah dicatat. Kalibrasi load
  // indicator Mobile Crane 25 Ton seharga Rp 12.000.000 tiap 500 jam berada di
  // basis dalam keadaan itu: aktif, tak pernah bisa jatuh tempo, tak pernah
  // memicu apa pun. Ia bukan jadwal yang menganggur — ia jadwal yang RUSAK, dan
  // kerusakannya tak punya gejala sama sekali.
  //
  // Rute ini menegurnya SEKALI (lalu tunduk jeda melandai seperti yang lain),
  // karena yang dibutuhkan tindakan sekali: mulai mencatat meternya.
  app.get('/api/v1/otomasi/jalankan/perawatan-diprediksi', {
    preHandler: [authenticate, requirePermission('notifications:milestone:check')],
  }, async (request, reply) => {
    const { createNotification } = await import('../../utils/notifications.js')
    const { resolveRecipients } = await import('../../utils/notification-routing.js')
    const { hitungJatuhTempo, hitungLajuPakai, prediksiHariDariJam } =
      await import('../../lib/alat-operasional.js')

    const q = request.query as { hari?: string; min?: string }
    const ambangHari = await ambilAmbang(request, 'otomasi.perawatan_prediksi.hari', q.hari)
    const minBaca = await ambilAmbang(
      request, 'otomasi.perawatan_prediksi.min_pembacaan', q.min,
    )

    const today = new Date().toISOString().split('T')[0]
    const sudah = await pembuatDedup(request, today,
      ['perawatan_diprediksi', 'alat_jam_tanpa_meter'])

    // `assets`, `jadwal_perawatan`, `pemakaian_alat` — ketiganya kategori B.
    const { data: aset, error: eAset } = await request.db!
      .from('assets')
      .select('id, asset_code, name, current_project_id, status')
    if (eAset) return reply.status(500).send({ error: eAset.message })

    const { data: jadwal, error: eJadwal } = await request.db!
      .from('jadwal_perawatan')
      .select('id, asset_id, nama, jenis, setiap_jam, setiap_hari, jam_terakhir, tanggal_terakhir, aktif, perkiraan_biaya')
      .eq('aktif', true)
      .not('setiap_jam', 'is', null)
    if (eJadwal) return reply.status(500).send({ error: eJadwal.message })

    /*
      BERHALAMAN — wajib. `pemakaian_alat` tumbuh tiap sesi alat dan sudah
      pasti melewati 1.000 baris pada perusahaan yang benar-benar memakai
      alatnya. PostgREST memotongnya TANPA galat, dan yang terpotong adalah
      pembacaan TERBARU bila urutannya tak dipaku — lajunya lalu dihitung dari
      data lama dan perkiraannya meleset ke arah yang lebih berbahaya
      (terlihat lebih santai daripada kenyataan).
      Dijaga `audit-baca-tak-terpotong` (ambang NOL).
    */
    const HALAMAN = 1000
    const pakai: Array<Record<string, unknown>> = []
    for (let dari = 0; ; dari += HALAMAN) {
      const r = await request.db!
        .from('pemakaian_alat')
        .select('asset_id, tanggal, jam_selesai')
        .not('jam_selesai', 'is', null)
        .order('tanggal', { ascending: true })
        .range(dari, dari + HALAMAN - 1)
      if (r.error) return reply.status(500).send({ error: r.error.message })
      if (!r.data || r.data.length === 0) break
      pakai.push(...(r.data as Array<Record<string, unknown>>))
      if (r.data.length < HALAMAN) break
    }

    /** asset_id → pembacaan meter, untuk laju DAN untuk meter terkini. */
    const bacaan = new Map<string, Array<{ tanggal: string; jam: number | string | null }>>()
    for (const p of pakai) {
      const id = p.asset_id as string
      if (!id) continue
      const daftar = bacaan.get(id) ?? []
      daftar.push({ tanggal: String(p.tanggal ?? ''), jam: p.jam_selesai as number | null })
      bacaan.set(id, daftar)
    }

    const meterKini = new Map<string, number>()
    for (const [id, daftar] of bacaan) {
      for (const b of daftar) {
        const n = b.jam == null ? NaN : Number(b.jam)
        if (Number.isFinite(n)) meterKini.set(id, Math.max(meterKini.get(id) ?? n, n))
      }
    }

    const namaAset = new Map<string, { kode: string; nama: string; proyek: string | null }>()
    for (const a of aset ?? []) {
      namaAset.set(a.id as string, {
        kode: String(a.asset_code ?? '—'),
        nama: String(a.name ?? '—'),
        proyek: (a.current_project_id as string | null) ?? null,
      })
    }

    let dibuat = 0
    let diprediksi = 0
    let tanpaMeter = 0
    let lajuTakCukup = 0

    for (const j of jadwal ?? []) {
      const idAset = j.asset_id as string
      const a = namaAset.get(idAset)
      const label = a ? `${a.nama} (${a.kode})` : 'Alat'

      /*
        JADWAL JAM TANPA SATU PUN PEMBACAAN METER.

        Diperiksa LEBIH DULU dari laju, karena keduanya menghasilkan "tak bisa
        dihitung" dan mencampurnya membuat jadwal rusak terlihat seperti alat
        yang datanya baru sedikit. Yang pertama butuh tindakan; yang kedua
        cukup ditunggu.
      */
      if (!meterKini.has(idAset)) {
        tanpaMeter++
        if (sudah('alat_jam_tanpa_meter', j.id as string)) continue
        const penerima = await resolveRecipients('alat_jam_tanpa_meter', {
          companyId: request.companyId!,
          projectId: a?.proyek ?? undefined,
        })
        for (const uid of penerima) {
          await createNotification({
            company_id: request.companyId!,
            user_id: uid,
            title: 'Jadwal perawatan tak bisa jatuh tempo',
            message:
              `${label} — "${String(j.nama ?? 'perawatan')}" dijadwalkan tiap `
              + `${Number(j.setiap_jam)} jam, tetapi jam-meter alat ini belum pernah `
              + 'dicatat sekali pun. Selama itu, jadwal ini tak akan pernah '
              + 'memicu peringatan apa pun.',
            type: 'alat_jam_tanpa_meter',
            priority: 'normal',
            project_id: a?.proyek ?? undefined,
            action_url: '/alat',
            // `record_id` WAJIB - lihat `audit-notifikasi-punya-record.mjs`.
            action_data: { record_id: j.id, asset_id: idAset },
          })
          dibuat++
        }
        continue
      }

      const laju = hitungLajuPakai(bacaan.get(idAset) ?? [], minBaca)
      if (laju.perHari == null) { lajuTakCukup++; continue }

      const hasil = hitungJatuhTempo(j as never, meterKini.get(idAset) ?? null, today)
      const hari = prediksiHariDariJam(hasil.sisaJam, laju.perHari)
      if (hari == null) { lajuTakCukup++; continue }

      /*
        Yang SUDAH lewat sengaja dilewati — itu wilayah 10.7, dan ia sudah
        memperingatkannya. Dua peringatan untuk satu alat pada hari yang sama
        adalah cara tercepat membuat orang mematikan keduanya.

        Batas bawah 0 dipilih, bukan 1: alat yang jatuh tempo TEPAT hari ini
        masih milik rute ini sampai 10.7 menghitungnya lewat.
      */
      if (hari < 0 || hari > ambangHari) continue

      diprediksi++
      if (sudah('perawatan_diprediksi', j.id as string)) continue

      const biaya = j.perkiraan_biaya == null ? null : Number(j.perkiraan_biaya)
      const rupiah = biaya != null && Number.isFinite(biaya)
        ? ` Perkiraan biaya Rp ${biaya.toLocaleString('id-ID')}.`
        : ''

      const penerima = await resolveRecipients('perawatan_diprediksi', {
        companyId: request.companyId!,
        projectId: a?.proyek ?? undefined,
      })
      for (const uid of penerima) {
        await createNotification({
          company_id: request.companyId!,
          user_id: uid,
          title: 'Perawatan alat diperkirakan jatuh tempo',
          message:
            `${label} — "${String(j.nama ?? 'perawatan')}" tinggal `
            + `${hasil.sisaJam} jam lagi. Pada laju ${laju.perHari} jam/hari `
            + `(${laju.pembacaan} pembacaan, ${laju.rentangHari} hari), itu `
            + `sekitar ${hari} hari dari sekarang.${rupiah}`,
          type: 'perawatan_diprediksi',
          priority: hari <= Math.ceil(ambangHari / 3) ? 'high' : 'normal',
          project_id: a?.proyek ?? undefined,
          action_url: '/alat',
          // `record_id` WAJIB - lihat `audit-notifikasi-punya-record.mjs`.
          action_data: { record_id: j.id, asset_id: idAset, hari_lagi: hari },
        })
        dibuat++
      }
    }

    return reply.send({
      success: true,
      notifications_created: dibuat,
      checked: {
        jadwal_berbasis_jam: (jadwal ?? []).length,
        diprediksi_jatuh_tempo: diprediksi,
        jadwal_tanpa_meter: tanpaMeter,
        laju_tak_cukup: lajuTakCukup,
        ambang_hari: ambangHari,
        min_pembacaan: minBaca,
      },
    })
  })

  // ── GET /api/v1/otomasi/jalankan/kebiasaan-bayar ─────────────────────────
  //
  // Automation 2.12 — Payment Timing Optimization.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // PENILAIAN PERTAMA SAYA SALAH, DAN SALAHNYA LAYAK DICATAT
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Automation ini sempat dicoret dengan alasan "23 dari 23 pembayaran memakai
  // metode yang sama, nol sinyal". Itu mengukur kolom yang salah: judul
  // rencananya berbunyi "metode/WAKTU bayar optimal (cash flow timing)", dan
  // waktunya punya sebaran yang jelas.
  //
  // Diukur ulang 2026-08-16:
  //
  //   4 dari 23 pembayaran TELAT, terparah 98 hari
  //   satu invoice dibayar 30 hari LEBIH AWAL senilai Rp 252.480.000
  //
  //   Ratna Sari      2 invoice   rata +33 hari   terparah  67   Rp 364,6 jt
  //   Eko Prasetyo    3 invoice   rata +31 hari   terparah  98   Rp 342,7 jt
  //   Melati Indah    3 invoice   rata  −2 hari   tepat waktu
  //
  // ══════════════════════════════════════════════════════════════════════════
  // KENAPA INI BUKAN DUPLIKAT `invoice-terlambat` (2.6)
  // ══════════════════════════════════════════════════════════════════════════
  //
  // 2.6 menjawab "invoice mana yang lewat jatuh tempo" — satu tagihan, dan
  // tindakannya menagih. Rute ini menjawab "klien mana yang SELALU telat", dan
  // tindakannya lain sama sekali: menaikkan uang muka, memperpendek termin,
  // atau menolak proyek berikutnya.
  //
  // Dua nama teratas di atas tak pernah terlihat oleh 2.6 sebagai POLA — hanya
  // sebagai beberapa invoice terlambat yang tersebar di beberapa bulan.
  app.get('/api/v1/otomasi/jalankan/kebiasaan-bayar', {
    preHandler: [authenticate, requirePermission('notifications:milestone:check')],
  }, async (request, reply) => {
    const { createNotification } = await import('../../utils/notifications.js')
    const { resolveRecipients } = await import('../../utils/notification-routing.js')
    const { nilaiKebiasaanBayar } = await import('../../lib/kebiasaan-bayar.js')

    const q = request.query as { hari?: string; porsi?: string; min?: string }
    const ambangHari = await ambilAmbang(request, 'otomasi.kebiasaan_bayar.hari', q.hari)
    const ambangPorsiPersen = await ambilAmbang(request, 'otomasi.kebiasaan_bayar.porsi', q.porsi)
    const minInvoice = await ambilAmbang(request, 'otomasi.kebiasaan_bayar.min_invoice', q.min)
    const ambangPorsi = ambangPorsiPersen / 100

    const today = new Date().toISOString().split('T')[0]
    const sudah = await pembuatDedup(request, today, ['kebiasaan_bayar_klien'])

    /*
      BERHALAMAN — wajib untuk ketiganya. `payments` dan `invoices` tumbuh
      seumur perusahaan, dan PostgREST memotong di 1.000 baris TANPA galat.
      Terpotong di sini berarti riwayat sebagian klien hilang, rata-ratanya
      dihitung dari sisa yang kebetulan terbaca, dan angkanya SALAH tanpa satu
      pun gejala. Dijaga `audit-baca-tak-terpotong` (ambang NOL).
    */
    const HALAMAN = 1000

    /*
      Tiga baca berhalaman ditulis TERPISAH, bukan lewat satu helper generik
      bernama `ambil-semua(tabel, kolom)`.

      Helper itu ditulis lebih dulu dan DITOLAK typecheck: nama tabel di
      `request.db.from()` bertipe union seluruh tabel yang ada, dan menerimanya
      sebagai `string` mematikan pengecekan itu. Yang hilang bukan kerapian
      melainkan penjagaan - salah ketik nama tabel berubah dari galat kompilasi
      menjadi galat runtime pada tugas terjadwal yang tak seorang pun
      menontonnya.
    */
    /*
      URUTAN BACANYA DITENTUKAN TENANCY, BUKAN KENYAMANAN.

      `projects` ANCHOR, `clients` B — keduanya boleh dibaca langsung.
      `invoices` dan `payments` kategori C: keduanya mewarisi tenant lewat
      proyek (`invoices.project_id`, lalu `payments.invoice_id` → invoices).

      Bentuk pertama membaca `invoices` langsung dan DITOLAK gerbang tenancy
      saat berjalan — bukan saat kompilasi, dan bukan oleh saya. Penjaga itu
      benar: tanpa saringan proyek, query itu memulangkan invoice milik
      SELURUH tenant, dan kebiasaan bayar klien perusahaan lain akan dikirim
      ke kotak masuk perusahaan ini.

      Jadi proyek dibaca DULU, id-nya dipakai menyaring, dan `.unsafe()`
      dipakai dengan alasan yang menyebut saringan itu — bukan sebagai jalan
      pintas melewati gerbangnya.
    */
    const proyek: Array<Record<string, unknown>> = []
    for (let dari = 0; ; dari += HALAMAN) {
      const r = await request.db!
        .from('projects').select('id, client_id, name')
        .order('id', { ascending: true }).range(dari, dari + HALAMAN - 1)
      if (r.error) return reply.status(500).send({ error: r.error.message })
      if (!r.data || r.data.length === 0) break
      proyek.push(...(r.data as Array<Record<string, unknown>>))
      if (r.data.length < HALAMAN) break
    }
    const idProyek = proyek.map((p) => p.id as string)

    const invoices: Array<Record<string, unknown>> = []
    if (idProyek.length > 0) {
      for (let dari = 0; ; dari += HALAMAN) {
        const r = await request.db!
          .unsafe('invoices', 'disaring .in(project_id, ...) milik tenant ini')
          .select('id, project_id, due_date')
          .in('project_id', idProyek)
          .order('id', { ascending: true }).range(dari, dari + HALAMAN - 1)
        if (r.error) return reply.status(500).send({ error: r.error.message })
        if (!r.data || r.data.length === 0) break
        invoices.push(...(r.data as Array<Record<string, unknown>>))
        if (r.data.length < HALAMAN) break
      }
    }
    const idInvoice = invoices.map((i) => i.id as string)

    const bayar: Array<Record<string, unknown>> = []
    if (idInvoice.length > 0) {
      for (let dari = 0; ; dari += HALAMAN) {
        const r = await request.db!
          .unsafe('payments', 'disaring .in(invoice_id, ...) milik proyek tenant ini')
          .select('invoice_id, paid_at, amount_paid')
          .in('invoice_id', idInvoice)
          .order('invoice_id', { ascending: true }).range(dari, dari + HALAMAN - 1)
        if (r.error) return reply.status(500).send({ error: r.error.message })
        if (!r.data || r.data.length === 0) break
        bayar.push(...(r.data as Array<Record<string, unknown>>))
        if (r.data.length < HALAMAN) break
      }
    }

    const { data: klien, error: eKlien } = await request.db!
      .from('clients').select('id, company_name, contact_person')
    if (eKlien) return reply.status(500).send({ error: eKlien.message })

    const proyekKlien = new Map<string, string>()
    for (const p of proyek) {
      const cid = p.client_id as string | null
      if (cid) proyekKlien.set(p.id as string, cid)
    }

    const invoiceKlien = new Map<string, { klien: string; jatuh: string }>()
    for (const i of invoices) {
      const jatuh = i.due_date as string | null
      if (!jatuh) continue                       // tanpa jatuh tempo, tak ada selisih
      const cid = proyekKlien.get(i.project_id as string)
      if (!cid) continue
      invoiceKlien.set(i.id as string, { klien: cid, jatuh })
    }

    /** client_id → riwayat selisih hari. */
    const riwayat = new Map<string, Array<{ selisihHari: number; nominal: number }>>()
    const HARI = 86_400_000
    for (const b of bayar) {
      const inv = invoiceKlien.get(b.invoice_id as string)
      if (!inv) continue
      const dibayar = Date.parse(String(b.paid_at ?? '').slice(0, 10))
      const jatuh = Date.parse(String(inv.jatuh).slice(0, 10))
      if (Number.isNaN(dibayar) || Number.isNaN(jatuh)) continue
      const daftar = riwayat.get(inv.klien) ?? []
      daftar.push({
        selisihHari: Math.round((dibayar - jatuh) / HARI),
        nominal: Number(b.amount_paid ?? 0),
      })
      riwayat.set(inv.klien, daftar)
    }

    /*
      Nama klien: `company_name` bisa NULL — sepuluh klien di basis ini
      berjenis perorangan dan kolomnya kosong pada SEMUANYA. Versi sebelumnya
      di rute lain mengirim pesan berbunyi "klien null" ke kotak masuk sungguhan
      sebelum cacat itu terlihat.
    */
    const namaKlien = new Map<string, string>()
    for (const k of klien ?? []) {
      const nama = (k.company_name as string | null)?.trim()
        || (k.contact_person as string | null)?.trim()
        || 'Klien tanpa nama'
      namaKlien.set(k.id as string, nama)
    }

    let dibuat = 0
    let dilaporkan = 0
    let diperiksa = 0

    for (const [idKlien, daftar] of riwayat) {
      diperiksa++
      const h = nilaiKebiasaanBayar(daftar, minInvoice, ambangHari, ambangPorsi)
      if (!h.layakLapor) continue
      dilaporkan++
      if (sudah('kebiasaan_bayar_klien', idKlien)) continue

      const nama = namaKlien.get(idKlien) ?? 'Klien tanpa nama'
      const alasan = h.sebab === 'sering_telat'
        ? `${h.jumlahTelat} dari ${h.invoice} invoice dibayar lewat jatuh tempo`
        : `rata-rata ${h.rataSelisih} hari lewat jatuh tempo`

      const penerima = await resolveRecipients('kebiasaan_bayar_klien', {
        companyId: request.companyId!,
      })
      for (const uid of penerima) {
        await createNotification({
          company_id: request.companyId!,
          user_id: uid,
          title: 'Klien cenderung telat membayar',
          message:
            `${nama} — ${alasan} (${h.invoice} invoice, terparah ${h.palingTelat} `
            + `hari, total Rp ${h.nilaiTotal.toLocaleString('id-ID')}). Pertimbangkan `
            + 'uang muka lebih besar atau termin lebih pendek untuk proyek berikutnya.',
          type: 'kebiasaan_bayar_klien',
          priority: h.palingTelat >= 60 ? 'high' : 'normal',
          action_url: '/keuangan/invoice',
          // `record_id` WAJIB - lihat `audit-notifikasi-punya-record.mjs`.
          action_data: {
            record_id: idKlien,
            client_id: idKlien,
            rata_selisih: h.rataSelisih,
            paling_telat: h.palingTelat,
          },
        })
        dibuat++
      }
    }

    return reply.send({
      success: true,
      notifications_created: dibuat,
      checked: {
        klien_punya_riwayat: diperiksa,
        klien_dilaporkan: dilaporkan,
        ambang_hari: ambangHari,
        ambang_porsi_persen: ambangPorsiPersen,
        min_invoice: minInvoice,
      },
    })
  })

  // ── GET /api/v1/otomasi/jalankan/ringkasan-mingguan ──────────────────────
  //
  // Automation 1.14 — Weekly Digest.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // SATU RINGKASAN, BUKAN TIGA — DAN ITU KEPUTUSAN, BUKAN KEMALASAN
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Rencana memuat tiga automation ringkasan: 1.14 Weekly Digest, 8.11 Morning
  // Briefing + Evening Wrap, 8.12 Anomaly Digest (weekly). Yang dibangun SATU.
  //
  // Founder menyatakan tak mau banyak pesan, dan pengukuran 2026-08-16
  // membenarkannya dengan angka: 9.009 notifikasi, 3 dibaca. Menambah tiga
  // pengirim baru ke sistem yang baru saja dibersihkan adalah cara tercepat
  // mengulang cacat yang baru diperbaiki.
  //
  //   8.11 berarti DUA pesan sehari — empat belas seminggu. Itu kebalikan arah
  //        dari jeda melandai yang baru dipasang di berkas ini.
  //   8.12 adalah himpunan bagian: anomali sudah menjadi notifikasi, jadi ia
  //        sudah terhitung di sini. Membangunnya terpisah berarti satu
  //        kejadian dilaporkan dua kali dalam minggu yang sama.
  //
  // Keduanya dicatat di katalog sebagai DILIPUT oleh rute ini, bukan sebagai
  // "belum dikerjakan" — supaya sesi berikutnya tak membangunnya dan menyangka
  // sedang menutup celah.
  app.get('/api/v1/otomasi/jalankan/ringkasan-mingguan', {
    preHandler: [authenticate, requirePermission('notifications:milestone:check')],
  }, async (request, reply) => {
    const { createNotification } = await import('../../utils/notifications.js')
    const { resolveRecipients } = await import('../../utils/notification-routing.js')
    const { susunRingkasan } = await import('../../lib/ringkasan-mingguan.js')

    const q = request.query as { hari?: string; min?: string }
    const jendelaHari = await ambilAmbang(request, 'otomasi.ringkasan_mingguan.hari', q.hari)
    const minJenis = await ambilAmbang(request, 'otomasi.ringkasan_mingguan.min_jenis', q.min)

    const JENIS_SENDIRI = 'ringkasan_mingguan'

    const sejak = new Date()
    sejak.setUTCDate(sejak.getUTCDate() - jendelaHari)

    /*
      BERHALAMAN — wajib, dan di sinilah paling penting.

      `notifications` adalah tabel paling ramai di basis ini: 9.009 baris dalam
      17 hari sebelum dibersihkan. Satu jendela tujuh hari sudah melewati 1.000
      baris, dan PostgREST memotongnya TANPA galat.

      Terpotong berarti ringkasannya melaporkan angka yang terlalu kecil —
      dan angka yang terlalu kecil pada RINGKASAN adalah kebohongan yang paling
      sulit ketahuan: tak ada yang membandingkannya dengan apa pun.
      Dijaga `audit-baca-tak-terpotong` (ambang NOL).
    */
    const HALAMAN = 1000
    const baris: Array<Record<string, unknown>> = []
    for (let dari = 0; ; dari += HALAMAN) {
      const r = await request.db!
        .from('notifications')
        .select('type, priority, read_at, sent_at')
        .gte('sent_at', sejak.toISOString())
        .order('sent_at', { ascending: true })
        .range(dari, dari + HALAMAN - 1)
      if (r.error) return reply.status(500).send({ error: r.error.message })
      if (!r.data || r.data.length === 0) break
      baris.push(...(r.data as Array<Record<string, unknown>>))
      if (r.data.length < HALAMAN) break
    }

    const h = susunRingkasan(
      baris.map((b) => ({
        type: String(b.type ?? ''),
        priority: b.priority as string | null,
        sudahDibaca: b.read_at != null,
      })),
      JENIS_SENDIRI,
      minJenis,
    )

    if (!h.layakKirim) {
      return reply.send({
        success: true,
        notifications_created: 0,
        checked: { dibaca: baris.length, jenis: h.perJenis.length, alasan: 'minggu sepi' },
      })
    }

    /*
      Dedup memakai KUNCI TETAP, bukan id catatan.

      Ringkasan ini tak menunjuk satu catatan pun — ia merangkum banyak. Tanpa
      `record_id` ia kebal dedup DAN tak terlihat `audit-notifikasi-tak-kembar`
      (yang sengaja melewati baris ber-record_id NULL), jadi tiap denyut
      penjadwal akan mengirim ulang seluruh ringkasan.

      Kunci tetap per-perusahaan membuat jeda melandai berlaku padanya seperti
      pada yang lain: terkirim, lalu tertahan sampai jedanya lewat.
    */
    const kunci = `ringkasan-${request.companyId}`
    const sudah = await pembuatDedup(request, new Date().toISOString().split('T')[0],
      [JENIS_SENDIRI])
    if (sudah(JENIS_SENDIRI, kunci)) {
      return reply.send({
        success: true,
        notifications_created: 0,
        checked: { dibaca: baris.length, jenis: h.perJenis.length, alasan: 'sudah dikirim' },
      })
    }

    // Lima jenis teratas saja. Ringkasan yang memuat dua puluh baris bukan
    // ringkasan — ia salinan kotak masuk dengan langkah tambahan.
    const puncak = h.perJenis.slice(0, 5)
      .map((p) => `${p.type.replace(/_/g, ' ')} ${p.jumlah}${p.belumDibaca > 0 ? ` (${p.belumDibaca} belum dibaca)` : ''}`)
      .join(' · ')

    const penerima = await resolveRecipients(JENIS_SENDIRI, {
      companyId: request.companyId!,
    })

    let dibuat = 0
    for (const uid of penerima) {
      await createNotification({
        company_id: request.companyId!,
        user_id: uid,
        title: `Ringkasan ${jendelaHari} hari terakhir`,
        message:
          `${h.total} peringatan dari ${h.perJenis.length} jenis`
          + `${h.mendesak > 0 ? `, ${h.mendesak} mendesak` : ''}`
          + `, ${h.belumDibaca} belum dibaca. Terbanyak: ${puncak}.`,
        type: JENIS_SENDIRI,
        priority: h.mendesak > 0 ? 'high' : 'normal',
        action_url: '/notifications',
        // `record_id` WAJIB - lihat `audit-notifikasi-punya-record.mjs`.
        action_data: {
          record_id: kunci,
          total: h.total,
          mendesak: h.mendesak,
          belum_dibaca: h.belumDibaca,
        },
      })
      dibuat++
    }

    return reply.send({
      success: true,
      notifications_created: dibuat,
      checked: {
        dibaca: baris.length,
        total_diringkas: h.total,
        jenis: h.perJenis.length,
        mendesak: h.mendesak,
        jendela_hari: jendelaHari,
        min_jenis: minJenis,
      },
    })
  })

  // ── GET /api/v1/otomasi/jalankan/material-kurang ─────────────────────────
  //
  // Automation 3.4 — Material Consumption Prediction.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // PENCORETAN SAYA YANG KEEMPAT, DAN SALAH DENGAN BENTUK YANG SAMA
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Automation ini sempat dicoret: "tabel pemeta RAB→material NOL baris, tak
  // bisa dibangun". Tabelnya memang kosong — tetapi ADA, dan bentuknya tepat.
  // Yang benar bukan "tak bisa dibangun" melainkan "petanya belum diisi".
  //
  // Bentuk kesalahan yang sama dengan tiga pencoretan keliru sebelumnya:
  // berhenti di pengukuran pertama yang tak cocok alih-alih bertanya "lalu apa
  // yang kurang, dan bisakah diadakan?". Founder yang menjawabnya: "buat aja
  // datanya". Migrasi 425 mengisi petanya — 11 baris di 2 proyek.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // BUKAN DUPLIKAT `stok-menipis` (4.5)
  // ══════════════════════════════════════════════════════════════════════════
  //
  // 4.5 menjawab "stok tinggal berapa" dan melihat GUDANG. Rute ini menjawab
  // pertanyaan lain: "proyek sudah 40% jalan, materialnya baru datang 25% dari
  // rencana — cukup sampai selesai?"
  //
  // Bedanya WAKTU. Stok menipis baru terlihat saat barangnya hampir habis;
  // kekurangan terhadap RENCANA terlihat berminggu-minggu sebelumnya — dan itu
  // justru rentang yang dibutuhkan untuk memesan.
  app.get('/api/v1/otomasi/jalankan/material-kurang', {
    preHandler: [authenticate, requirePermission('notifications:milestone:check')],
  }, async (request, reply) => {
    const { createNotification } = await import('../../utils/notifications.js')
    const { resolveRecipients } = await import('../../utils/notification-routing.js')
    const { nilaiKebutuhan } = await import('../../lib/kebutuhan-material.js')

    const q = request.query as { bantalan?: string; min?: string }
    const bantalanPersen = await ambilAmbang(request, 'otomasi.material_kurang.bantalan', q.bantalan)
    const minProgres = await ambilAmbang(request, 'otomasi.material_kurang.min_progres', q.min)
    const bantalan = bantalanPersen / 100

    const today = new Date().toISOString().split('T')[0]
    const sudah = await pembuatDedup(request, today, ['material_kurang'])

    const HALAMAN = 1000

    /*
      `projects` ANCHOR — dibaca lebih dulu, dan id-nya menyaring sisanya.
      `project_rab_materials`, `project_stocks`, `progress_logs` semuanya
      kategori C lewat `project_id`; membacanya langsung ditolak gerbang
      tenancy saat berjalan (pelajaran dari 2.12, yang tertangkap begitu).
    */
    const proyek: Array<Record<string, unknown>> = []
    for (let dari = 0; ; dari += HALAMAN) {
      const r = await request.db!
        .from('projects').select('id, name, status, is_deleted')
        .order('id', { ascending: true }).range(dari, dari + HALAMAN - 1)
      if (r.error) return reply.status(500).send({ error: r.error.message })
      if (!r.data || r.data.length === 0) break
      proyek.push(...(r.data as Array<Record<string, unknown>>))
      if (r.data.length < HALAMAN) break
    }

    const aktif = proyek.filter((p) => p.is_deleted !== true && p.status === 'active')
    const idAktif = aktif.map((p) => p.id as string)
    if (idAktif.length === 0) {
      return reply.send({ success: true, notifications_created: 0, checked: { proyek_aktif: 0 } })
    }
    const namaProyek = new Map(aktif.map((p) => [p.id as string, String(p.name ?? 'Proyek')]))

    /*
      Tiga baca ditulis TERPISAH, bukan lewat satu helper bertipe union.

      Helper itu ditulis lebih dulu dan DITOLAK typecheck untuk kedua kalinya
      di berkas ini: tipe kembalian `.select()` bergantung pada nama tabelnya,
      dan meratakannya lewat parameter union menghilangkan pengetikan yang
      justru menahan salah ketik nama kolom.

      Kali pertama (rute 2.12) alasannya sudah ditulis; menuliskannya lagi di
      sini bukan pengulangan melainkan penanda bahwa jalan pintasnya memang
      menggoda dan memang tak bisa.
    */
    const ALASAN = 'disaring .in(project_id, ...) proyek aktif milik tenant ini'

    const peta: Array<Record<string, unknown>> = []
    for (let dari = 0; ; dari += HALAMAN) {
      const r = await request.db!
        .unsafe('project_rab_materials', ALASAN)
        .select('project_id, material_id, rab_quantity, received_quantity')
        .in('project_id', idAktif)
        .order('project_id', { ascending: true }).range(dari, dari + HALAMAN - 1)
      if (r.error) return reply.status(500).send({ error: r.error.message })
      if (!r.data || r.data.length === 0) break
      peta.push(...(r.data as Array<Record<string, unknown>>))
      if (r.data.length < HALAMAN) break
    }

    const stok: Array<Record<string, unknown>> = []
    for (let dari = 0; ; dari += HALAMAN) {
      const r = await request.db!
        .unsafe('project_stocks', ALASAN)
        .select('project_id, material_id, qty_on_hand')
        .in('project_id', idAktif)
        .order('project_id', { ascending: true }).range(dari, dari + HALAMAN - 1)
      if (r.error) return reply.status(500).send({ error: r.error.message })
      if (!r.data || r.data.length === 0) break
      stok.push(...(r.data as Array<Record<string, unknown>>))
      if (r.data.length < HALAMAN) break
    }

    const progres: Array<Record<string, unknown>> = []
    for (let dari = 0; ; dari += HALAMAN) {
      const r = await request.db!
        .unsafe('progress_logs', ALASAN)
        .select('project_id, pct_overall, logged_at')
        .in('project_id', idAktif)
        .order('project_id', { ascending: true }).range(dari, dari + HALAMAN - 1)
      if (r.error) return reply.status(500).send({ error: r.error.message })
      if (!r.data || r.data.length === 0) break
      progres.push(...(r.data as Array<Record<string, unknown>>))
      if (r.data.length < HALAMAN) break
    }

    const { data: bahan, error: eBahan } = await request.db!
      .from('materials').select('id, code, name, unit')
    if (eBahan) return reply.status(500).send({ error: eBahan.message })
    const namaBahan = new Map<string, { nama: string; satuan: string }>()
    for (const m of bahan ?? []) {
      namaBahan.set(m.id as string, {
        nama: String(m.name ?? 'Material'), satuan: String(m.unit ?? ''),
      })
    }

    /*
      Progres TERBARU per proyek, bukan rata-rata dan bukan yang pertama.

      Rata-rata membuat proyek yang baru melonjak terlihat masih di awal, dan
      kebutuhan materialnya dilaporkan lebih kecil daripada kenyataan — arah
      salah yang paling berbahaya, karena ia MENYEMBUNYIKAN kekurangan.
    */
    const pctProyek = new Map<string, { pct: number; waktu: number }>()
    for (const g of progres) {
      const id = g.project_id as string
      const pct = Number(g.pct_overall)
      const waktu = Date.parse(String(g.logged_at ?? ''))
      if (!Number.isFinite(pct) || Number.isNaN(waktu)) continue
      const p = pctProyek.get(id)
      if (!p || waktu > p.waktu) pctProyek.set(id, { pct, waktu })
    }

    const stokProyek = new Map<string, number>()
    for (const s of stok) {
      const k = `${s.project_id}::${s.material_id}`
      stokProyek.set(k, (stokProyek.get(k) ?? 0) + (Number(s.qty_on_hand) || 0))
    }

    let dibuat = 0
    let kurang = 0
    let diperiksa = 0
    let dilewatiProgres = 0

    for (const b of peta) {
      const idProyek = b.project_id as string
      const p = pctProyek.get(idProyek)

      /*
        Proyek tanpa laporan progres DILEWATI, bukan dianggap 0%.

        Dianggap 0% berarti kebutuhannya nol dan ia SELALU "cukup" — proyek
        yang justru paling tak terpantau menjadi yang paling sunyi. Dilewati
        dan dihitung terpisah supaya ketiadaannya terlihat di jawaban rute.
      */
      if (!p) { dilewatiProgres++; continue }

      const pct = p.pct / 100
      if (pct * 100 < minProgres) { dilewatiProgres++; continue }

      diperiksa++
      const h = nilaiKebutuhan({
        rencana: Number(b.rab_quantity),
        diterima: Number(b.received_quantity) || 0,
        ditangan: stokProyek.get(`${idProyek}::${b.material_id}`) ?? 0,
      }, pct, bantalan)

      if (!h.kurang) continue
      kurang++

      const kunci = `${idProyek}::${b.material_id}`
      if (sudah('material_kurang', kunci)) continue

      const m = namaBahan.get(b.material_id as string)
      const penerima = await resolveRecipients('material_kurang', {
        companyId: request.companyId!,
        projectId: idProyek,
      })
      for (const uid of penerima) {
        await createNotification({
          company_id: request.companyId!,
          user_id: uid,
          title: 'Material kurang terhadap progres',
          message:
            `${namaProyek.get(idProyek) ?? 'Proyek'} — ${m?.nama ?? 'Material'}: `
            + `rencana ${h.rencana.toLocaleString('id-ID')} ${m?.satuan ?? ''}, `
            + `tersedia ${(h.diterima + h.ditangan).toLocaleString('id-ID')} `
            + `(${Math.round(h.porsiTersedia * 100)}%) pada progres `
            + `${Math.round(p.pct)}%. Kurang sekitar `
            + `${Math.abs(h.selisih).toLocaleString('id-ID')} ${m?.satuan ?? ''}.`,
          type: 'material_kurang',
          priority: h.porsiTersedia < 0.5 ? 'high' : 'normal',
          project_id: idProyek,
          action_url: '/gudang/stok',
          // `record_id` WAJIB - lihat `audit-notifikasi-punya-record.mjs`.
          action_data: {
            record_id: kunci,
            project_id: idProyek,
            material_id: b.material_id,
            porsi_tersedia: h.porsiTersedia,
          },
        })
        dibuat++
      }
    }

    return reply.send({
      success: true,
      notifications_created: dibuat,
      checked: {
        proyek_aktif: idAktif.length,
        baris_peta: peta.length,
        diperiksa,
        kurang,
        dilewati_progres: dilewatiProgres,
        bantalan_persen: bantalanPersen,
        min_progres: minProgres,
      },
    })
  })

  // ── GET /api/v1/otomasi/jalankan/alat-tak-sehat ──────────────────────────
  //
  // Automation 10.6 — Maintenance Cost Trend Analysis.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // BUKAN DUPLIKAT 10.7 MAUPUN 10.2 — PERTANYAANNYA BEDA
  // ══════════════════════════════════════════════════════════════════════════
  //
  //   10.7 `perawatan-alat`        alat mana yang JATUH TEMPO servis
  //   10.2 `perawatan-diprediksi`  alat mana yang AKAN jatuh tempo
  //   ini  `alat-tak-sehat`        alat mana yang mulai lebih sering RUSAK
  //                                daripada dirawat
  //
  // Dua yang pertama menjadwalkan bengkel. Yang ini memutuskan apakah alatnya
  // masih layak dipertahankan, atau lebih murah disewa.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // DUA TANDA, DAN YANG KEDUA JAUH LEBIH TAJAM
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Diukur 2026-08-16 pada basis nyata:
  //
  //   DTR-002 Dump Truck   Rp 19,85 jt / Rp 780 jt = 2,54%   4 dari 6 TAK TERJADWAL
  //   TRK-004 Truk Mixer   Rp  6,70 jt / Rp 950 jt = 0,71%   0 dari 2
  //   EXC-001 Excavator    Rp  6,43 jt / Rp 1,85 M = 0,35%   1 dari 3
  //
  // Angka rupiahnya sudah membedakan. Tetapi yang benar-benar menceritakan
  // keadaannya adalah kolom terakhir: uraian keenam servis Dump Truck berbunyi
  // *turun mesin sebagian, ganti kopling set, perbaikan rem angin, ganti gardan
  // belakang*. Itu bukan alat yang mahal dirawat — itu alat yang RUSAK BERUNTUN.
  //
  // Rasio biaya bisa tinggi karena SATU servis besar yang wajar (overhaul
  // terjadwal). Porsi tak terjadwal tak bisa: tiap satu berarti alat berhenti
  // bekerja di tengah pekerjaan.
  //
  // Karena itu keduanya diperiksa TERPISAH, dan yang kedua LEBIH DULU.
  app.get('/api/v1/otomasi/jalankan/alat-tak-sehat', {
    preHandler: [authenticate, requirePermission('notifications:milestone:check')],
  }, async (request, reply) => {
    const { createNotification } = await import('../../utils/notifications.js')
    const { resolveRecipients } = await import('../../utils/notification-routing.js')
    const { nilaiKesehatanPerawatan } = await import('../../lib/kesehatan-perawatan.js')

    const q = request.query as { persen?: string; porsi?: string; min?: string }
    const ambangPersen = await ambilAmbang(request, 'otomasi.alat_tak_sehat.persen', q.persen)
    const ambangPorsiPersen = await ambilAmbang(request, 'otomasi.alat_tak_sehat.porsi', q.porsi)
    const minServis = await ambilAmbang(request, 'otomasi.alat_tak_sehat.min_servis', q.min)
    const ambangPorsi = ambangPorsiPersen / 100

    const today = new Date().toISOString().split('T')[0]
    const sudah = await pembuatDedup(request, today, ['alat_tak_sehat'])

    // `assets` dan `riwayat_perawatan` KEDUANYA kategori B — master data
    // ber-`company_id`, jadi `.from()` sudah menyaringnya. Tak perlu
    // `.unsafe()`, dan memakainya di sini justru melemahkan gerbangnya.
    const { data: aset, error: eAset } = await request.db!
      .from('assets')
      .select('id, asset_code, name, purchase_price, status, current_project_id')
    if (eAset) return reply.status(500).send({ error: eAset.message })

    /*
      BERHALAMAN — wajib. `riwayat_perawatan` tumbuh tiap servis dan melewati
      1.000 baris pada perusahaan yang benar-benar memakai alatnya bertahun.
      PostgREST memotongnya TANPA galat, dan yang terpotong membuat alat paling
      bermasalah justru terlihat paling sehat: riwayatnya hilang, jadi
      hitungannya nol. Dijaga `audit-baca-tak-terpotong` (ambang NOL).
    */
    const HALAMAN = 1000
    const riwayat: Array<Record<string, unknown>> = []
    for (let dari = 0; ; dari += HALAMAN) {
      const r = await request.db!
        .from('riwayat_perawatan')
        .select('asset_id, biaya, tak_terjadwal, tanggal')
        .order('asset_id', { ascending: true })
        .range(dari, dari + HALAMAN - 1)
      if (r.error) return reply.status(500).send({ error: r.error.message })
      if (!r.data || r.data.length === 0) break
      riwayat.push(...(r.data as Array<Record<string, unknown>>))
      if (r.data.length < HALAMAN) break
    }

    const perAset = new Map<string, Array<{ biaya: number; takTerjadwal: boolean }>>()
    for (const s of riwayat) {
      const id = s.asset_id as string
      if (!id) continue
      const biaya = Number(s.biaya)
      if (!Number.isFinite(biaya)) continue
      const daftar = perAset.get(id) ?? []
      daftar.push({ biaya, takTerjadwal: s.tak_terjadwal === true })
      perAset.set(id, daftar)
    }

    let dibuat = 0
    let ditandai = 0
    let diperiksa = 0

    for (const a of aset ?? []) {
      const id = a.id as string
      const daftar = perAset.get(id)
      if (!daftar || daftar.length === 0) continue      // belum pernah diservis
      diperiksa++

      const h = nilaiKesehatanPerawatan(
        daftar,
        a.purchase_price == null ? null : Number(a.purchase_price),
        minServis, ambangPersen, ambangPorsi,
      )
      if (!h.perlu) continue
      ditandai++
      if (sudah('alat_tak_sehat', id)) continue

      const label = `${String(a.name ?? 'Alat')} (${String(a.asset_code ?? '—')})`
      const rupiah = h.totalBiaya.toLocaleString('id-ID')

      /*
        Pesannya menyebut SEBAB yang memicu, bukan menggabung keduanya.

        Cacat yang sama pernah terjadi di `perawatan-alat`: ia memeriksa jam DAN
        hari lalu selalu menulis sisa HARI, menghasilkan "[URGENT] 154 hari lagi"
        untuk sesuatu yang dipicu meter jam. Yang membacanya menyimpulkan
        sistemnya rusak, lalu berhenti mempercayai seluruh peringatan.
      */
      const pesan = h.sebab === 'sering_rusak'
        ? `${label} — ${h.takTerjadwal} dari ${h.servis} servis TAK TERJADWAL `
          + `(${Math.round(h.porsiRusak * 100)}%). Tiap kerusakan berarti alat `
          + `berhenti bekerja di tengah pekerjaan. Total perawatan Rp ${rupiah}.`
        : `${label} — biaya perawatan kumulatif Rp ${rupiah}, `
          + `${h.persenHarga}% dari harga beli, dari ${h.servis} servis. `
          + 'Pertimbangkan mengganti atau menyewa.'

      const penerima = await resolveRecipients('alat_tak_sehat', {
        companyId: request.companyId!,
        projectId: (a.current_project_id as string | null) ?? undefined,
      })
      for (const uid of penerima) {
        await createNotification({
          company_id: request.companyId!,
          user_id: uid,
          title: h.sebab === 'sering_rusak'
            ? 'Alat sering rusak di luar jadwal'
            : 'Biaya perawatan alat menanjak',
          message: pesan,
          type: 'alat_tak_sehat',
          priority: h.sebab === 'sering_rusak' ? 'high' : 'normal',
          project_id: (a.current_project_id as string | null) ?? undefined,
          action_url: '/aset',
          // `record_id` WAJIB - lihat `audit-notifikasi-punya-record.mjs`.
          action_data: {
            record_id: id,
            asset_id: id,
            sebab: h.sebab,
            porsi_rusak: h.porsiRusak,
            persen_harga: h.persenHarga,
          },
        })
        dibuat++
      }
    }

    return reply.send({
      success: true,
      notifications_created: dibuat,
      checked: {
        aset_punya_riwayat: diperiksa,
        ditandai,
        ambang_persen: ambangPersen,
        ambang_porsi_persen: ambangPorsiPersen,
        min_servis: minServis,
      },
    })
  })

  // ── GET /api/v1/otomasi/jalankan/celah-asuransi ──────────────────────────
  //
  // Automation 9.2 — Insurance Coverage Gap Detection.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // TIGA CELAH, DAN YANG KETIGA TAK TERLIHAT OLEH PEMERIKSAAN BIASA
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Pemeriksaan yang lazim ditulis orang: "proyek ini punya polis?" — satu
  // hitungan, satu jawaban. Itu menangkap celah pertama saja.
  //
  //   1. TAK ADA POLIS         terlihat oleh hitungan apa pun
  //   2. POLIS KADALUARSA      terlihat kalau statusnya ikut diperiksa
  //   3. PUNYA POLIS AKTIF,    TIDAK terlihat oleh keduanya
  //      TAPI BUKAN YANG
  //      MENANGGUNG PEKERJAAN
  //
  // Celah ketiga paling berbahaya justru karena paling tenang. Proyek dengan
  // TPL saja punya polis AKTIF, muncul sebagai "terasuransi" di daftar mana
  // pun, dan lolos audit yang cuma menghitung.
  //
  // Tetapi TPL menanggung kerugian PIHAK KETIGA — tetangga yang temboknya
  // retak, pejalan kaki yang tertimpa. Kerusakan pekerjaannya SENDIRI
  // (kebakaran, longsor, banjir) tak ditanggung siapa pun. Itu baru ketahuan
  // saat klaim ditolak.
  //
  // ── YANG DITEMUKAN SAAT DIUKUR, dan ini bukan cacat data
  //
  // Enam proyek aktif berjalan tanpa polis apa pun, tiga di antaranya
  // infrastruktur bernilai miliaran. Angkanya BERGERAK — sesi lain menambah
  // proyek sementara ini ditulis — jadi jangan percaya angka di komentar ini;
  // ukur sendiri lewat jawaban rutenya (`checked.tanpa_polis`).
  app.get('/api/v1/otomasi/jalankan/celah-asuransi', {
    preHandler: [authenticate, requirePermission('notifications:milestone:check')],
  }, async (request, reply) => {
    const { createNotification } = await import('../../utils/notifications.js')
    const { resolveRecipients } = await import('../../utils/notification-routing.js')
    const { nilaiCelahAsuransi } = await import('../../lib/celah-asuransi.js')

    const q = request.query as { hari?: string }
    const ambangHari = await ambilAmbang(request, 'otomasi.celah_asuransi.hari', q.hari)

    const today = new Date().toISOString().split('T')[0]
    const sudah = await pembuatDedup(request, today, ['celah_asuransi'])

    const HALAMAN = 1000

    /*
      `projects` ANCHOR — dibaca lebih dulu, id-nya menyaring sisanya.
      `polis_asuransi` kategori C lewat `project_id`; membacanya langsung
      ditolak gerbang tenancy saat berjalan.

      Pelajaran dari rute 2.12, yang tertangkap persis begitu: tanpa saringan,
      query itu memulangkan polis SELURUH tenant — dan pada automation asuransi
      akibatnya lebih buruk daripada sekadar salah angka. Proyek tenant ini bisa
      terlihat "terlindungi" oleh polis milik perusahaan LAIN.
    */
    const proyek: Array<Record<string, unknown>> = []
    for (let dari = 0; ; dari += HALAMAN) {
      const r = await request.db!
        .from('projects')
        .select('id, name, status, is_deleted, contract_value')
        .order('id', { ascending: true }).range(dari, dari + HALAMAN - 1)
      if (r.error) return reply.status(500).send({ error: r.error.message })
      if (!r.data || r.data.length === 0) break
      proyek.push(...(r.data as Array<Record<string, unknown>>))
      if (r.data.length < HALAMAN) break
    }

    const aktif = proyek.filter((p) => p.is_deleted !== true && p.status === 'active')
    const idAktif = aktif.map((p) => p.id as string)
    if (idAktif.length === 0) {
      return reply.send({ success: true, notifications_created: 0, checked: { proyek_aktif: 0 } })
    }

    const polis: Array<Record<string, unknown>> = []
    for (let dari = 0; ; dari += HALAMAN) {
      const r = await request.db!
        .unsafe('polis_asuransi', 'disaring .in(project_id, ...) proyek aktif milik tenant ini')
        .select('project_id, jenis, status, periode_selesai, nilai_pertanggungan')
        .in('project_id', idAktif)
        .order('project_id', { ascending: true }).range(dari, dari + HALAMAN - 1)
      if (r.error) return reply.status(500).send({ error: r.error.message })
      if (!r.data || r.data.length === 0) break
      polis.push(...(r.data as Array<Record<string, unknown>>))
      if (r.data.length < HALAMAN) break
    }

    const perProyek = new Map<string, Array<{
      jenis: string; status: string; periodeSelesai: string; nilaiPertanggungan: number | null
    }>>()
    for (const p of polis) {
      const id = p.project_id as string
      if (!id) continue
      const daftar = perProyek.get(id) ?? []
      daftar.push({
        jenis: String(p.jenis ?? ''),
        status: String(p.status ?? ''),
        periodeSelesai: String(p.periode_selesai ?? ''),
        nilaiPertanggungan: p.nilai_pertanggungan == null ? null : Number(p.nilai_pertanggungan),
      })
      perProyek.set(id, daftar)
    }

    let dibuat = 0
    const hitung = {
      tanpa_polis: 0, semua_kadaluarsa: 0,
      tak_menanggung_pekerjaan: 0, segera_berakhir: 0, terlindungi: 0,
    }

    for (const p of aktif) {
      const id = p.id as string
      const h = nilaiCelahAsuransi(perProyek.get(id) ?? [], today, ambangHari)
      hitung[h.sebab]++
      if (!h.celah) continue
      if (sudah('celah_asuransi', id)) continue

      const nama = String(p.name ?? 'Proyek')
      const nilai = p.contract_value == null ? null : Number(p.contract_value)
      const rupiah = nilai != null && Number.isFinite(nilai)
        ? ` Nilai kontrak Rp ${nilai.toLocaleString('id-ID')}.`
        : ''

      /*
        Tiap sebab menyebut TINDAKANNYA, bukan sekadar keadaannya.

        "Tak ada asuransi" memberi tahu apa yang salah. "Beli polis CAR"
        memberi tahu apa yang harus dilakukan — dan pada peringatan yang datang
        ke orang yang mungkin bukan ahli asuransi, bedanya menentukan apakah
        pesannya ditindaklanjuti atau ditunda.
      */
      const pesan = {
        tanpa_polis:
          `${nama} berjalan TANPA asuransi apa pun.${rupiah} `
          + 'Kebakaran, longsor, atau kecelakaan pihak ketiga ditanggung sendiri. '
          + 'Terbitkan polis CAR sebelum pekerjaan berlanjut.',
        semua_kadaluarsa:
          `${nama} — seluruh ${h.polis} polisnya sudah kadaluarsa atau dibatalkan.`
          + `${rupiah} Proyeknya masih berjalan; perpanjang segera.`,
        tak_menanggung_pekerjaan:
          `${nama} punya ${h.polisAktif} polis AKTIF, tetapi tak satu pun `
          + 'menanggung pekerjaannya sendiri — yang ada hanya tanggung jawab '
          + `pihak ketiga atau asuransi tenaga kerja.${rupiah} `
          + 'Tambahkan CAR (Contractor All Risk).',
        segera_berakhir:
          `${nama} — polis CAR berakhir dalam ${h.hariTersisa} hari.${rupiah} `
          + 'Urus perpanjangan sebelum jatuh tempo; jeda satu hari pun berarti '
          + 'proyeknya tak terlindungi.',
        terlindungi: '',
      }[h.sebab]

      const penerima = await resolveRecipients('celah_asuransi', {
        companyId: request.companyId!,
        projectId: id,
      })
      for (const uid of penerima) {
        await createNotification({
          company_id: request.companyId!,
          user_id: uid,
          title: h.sebab === 'segera_berakhir'
            ? 'Polis asuransi proyek segera berakhir'
            : 'Proyek tanpa perlindungan asuransi',
          message: pesan,
          // `segera_berakhir` masih punya waktu; tiga lainnya berarti proyeknya
          // TIDAK terlindungi sekarang juga.
          type: 'celah_asuransi',
          priority: h.sebab === 'segera_berakhir' ? 'normal' : 'high',
          project_id: id,
          action_url: '/kontrak/asuransi',
          // `record_id` WAJIB - lihat `audit-notifikasi-punya-record.mjs`.
          action_data: { record_id: id, project_id: id, sebab: h.sebab },
        })
        dibuat++
      }
    }

    return reply.send({
      success: true,
      notifications_created: dibuat,
      checked: { proyek_aktif: idAktif.length, ...hitung, ambang_hari: ambangHari },
    })
  })

  // ── GET /api/v1/otomasi/jalankan/klien-didiamkan ─────────────────────────
  //
  // Automation TANPA NOMOR — tak ada di rencana 140 item.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // KENAPA INI DIBANGUN MESKI TAK DIRENCANAKAN
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Founder bertanya: adakah otomasi yang menangani SEMUA kemungkinan di dunia
  // proyek — pemasok, orang lapangan, kantor, klien?
  //
  // Dipetakan 51 peristiwa nyata lintas tujuh pihak, lalu dicocokkan ke
  // katalog. Empat puluh enam sudah tertangani. Lima celah, dan yang ini
  // sinyalnya paling kuat sekaligus paling mahal bila dibiarkan.
  //
  // Diukur 2026-08-16:
  //
  //   15 proyek aktif
  //    5 TAK PERNAH punya satu pun laporan progres — termasuk dua proyek
  //      Dinas PUPR senilai Rp 11 miliar
  //    9 terakhir dilaporkan lebih dari dua pekan lalu, terlama 131 hari
  //
  // Empat belas dari lima belas proyek berjalan tanpa kabar ke pemiliknya.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // BUKAN DUPLIKAT `progres-belum-lapor` (3.11)
  // ══════════════════════════════════════════════════════════════════════════
  //
  // 3.11 menegur MANDOR yang belum mengisi laporan harian — soal disiplin
  // pencatatan, penerimanya orang dalam.
  //
  // Yang ini menjawab "klien mana yang sudah lama tak mendengar kabar apa pun
  // tentang proyeknya?" — penerimanya yang mengurus hubungan klien, dan
  // tindakannya MENELEPON, bukan menegur mandor.
  //
  // Keduanya bisa benar sekaligus: mandor rajin melapor ke sistem tetapi tak
  // seorang pun meneruskannya ke klien; atau sebaliknya, proyek sepi laporan
  // tetapi kliennya rutin ditelepon.
  app.get('/api/v1/otomasi/jalankan/klien-didiamkan', {
    preHandler: [authenticate, requirePermission('notifications:milestone:check')],
  }, async (request, reply) => {
    const { createNotification } = await import('../../utils/notifications.js')
    const { resolveRecipients } = await import('../../utils/notification-routing.js')
    const { nilaiKabarKlien } = await import('../../lib/kabar-klien.js')

    const q = request.query as { hari?: string }
    const ambangHari = await ambilAmbang(request, 'otomasi.klien_didiamkan.hari', q.hari)

    const today = new Date().toISOString().split('T')[0]
    const sudah = await pembuatDedup(request, today, ['klien_didiamkan'])

    const HALAMAN = 1000

    // `projects` ANCHOR; `progress_logs` kategori C lewat `project_id`.
    const proyek: Array<Record<string, unknown>> = []
    for (let dari = 0; ; dari += HALAMAN) {
      const r = await request.db!
        .from('projects')
        .select('id, name, status, is_deleted, client_id, contract_value')
        .order('id', { ascending: true }).range(dari, dari + HALAMAN - 1)
      if (r.error) return reply.status(500).send({ error: r.error.message })
      if (!r.data || r.data.length === 0) break
      proyek.push(...(r.data as Array<Record<string, unknown>>))
      if (r.data.length < HALAMAN) break
    }

    const aktif = proyek.filter((p) => p.is_deleted !== true && p.status === 'active')
    const idAktif = aktif.map((p) => p.id as string)
    if (idAktif.length === 0) {
      return reply.send({ success: true, notifications_created: 0, checked: { proyek_aktif: 0 } })
    }

    /*
      BERHALAMAN — dan di sini pemotongan senyap paling menyesatkan.

      `progress_logs` adalah tabel paling ramai kedua di basis ini. Kalau
      terpotong, proyek yang laporannya TERBARU justru yang hilang — dan
      hasilnya proyek yang paling rajin dilaporkan dilaporkan sebagai
      "belum pernah dikabari". Kebalikan dari kebenarannya.
      Dijaga `audit-baca-tak-terpotong` (ambang NOL).
    */
    const laporan: Array<Record<string, unknown>> = []
    for (let dari = 0; ; dari += HALAMAN) {
      const r = await request.db!
        .unsafe('progress_logs', 'disaring .in(project_id, ...) proyek aktif milik tenant ini')
        .select('project_id, logged_at')
        .in('project_id', idAktif)
        .order('project_id', { ascending: true }).range(dari, dari + HALAMAN - 1)
      if (r.error) return reply.status(500).send({ error: r.error.message })
      if (!r.data || r.data.length === 0) break
      laporan.push(...(r.data as Array<Record<string, unknown>>))
      if (r.data.length < HALAMAN) break
    }

    /** project_id → tanggal laporan TERBARU. */
    const terakhir = new Map<string, string>()
    for (const l of laporan) {
      const id = l.project_id as string
      const tgl = String(l.logged_at ?? '').slice(0, 10)
      if (!id || tgl.length !== 10) continue
      const lama = terakhir.get(id)
      if (!lama || tgl > lama) terakhir.set(id, tgl)
    }

    const { data: klien, error: eKlien } = await request.db!
      .from('clients').select('id, company_name, contact_person')
    if (eKlien) return reply.status(500).send({ error: eKlien.message })

    /*
      Nama klien: `company_name` bisa NULL — sepuluh klien di basis ini
      berjenis perorangan dan kolomnya kosong pada SEMUANYA. Rute lain pernah
      mengirim pesan berbunyi "klien null" ke kotak masuk sungguhan sebelum
      cacat itu terlihat.
    */
    const namaKlien = new Map<string, string>()
    for (const k of klien ?? []) {
      namaKlien.set(k.id as string,
        (k.company_name as string | null)?.trim()
        || (k.contact_person as string | null)?.trim()
        || 'Klien tanpa nama')
    }

    let dibuat = 0
    const hitung = { belum_pernah: 0, lama_diam: 0, terkabari: 0 }

    for (const p of aktif) {
      const id = p.id as string
      const h = nilaiKabarKlien(terakhir.get(id) ?? null, today, ambangHari)
      hitung[h.sebab]++
      if (!h.perlu) continue
      if (sudah('klien_didiamkan', id)) continue

      const nama = String(p.name ?? 'Proyek')
      const cid = p.client_id as string | null
      const siapa = cid ? (namaKlien.get(cid) ?? 'Klien tanpa nama') : 'tanpa klien terdaftar'
      const nilai = p.contract_value == null ? null : Number(p.contract_value)
      const rupiah = nilai != null && Number.isFinite(nilai) && nilai > 0
        ? ` Nilai kontrak Rp ${nilai.toLocaleString('id-ID')}.`
        : ''

      /*
        Dua sebab, dua tindakan — dan pesannya menyebut tindakannya.

        "Belum pernah" berarti proses pelaporannya yang belum ada; satu laporan
        susulan tak menyelesaikannya. "Lama diam" berarti jalurnya ada dan
        berhenti. Menyamakan pesannya membuat yang pertama diperlakukan seperti
        yang kedua.
      */
      const pesan = h.sebab === 'belum_pernah'
        ? `${nama} (${siapa}) berjalan tanpa SATU PUN laporan progres.${rupiah} `
          + 'Kliennya belum pernah menerima kabar apa pun — yang perlu dibereskan '
          + 'jalur pelaporannya, bukan satu laporan susulan.'
        : `${nama} (${siapa}) — laporan progres terakhir ${h.hariDiam} hari lalu.`
          + `${rupiah} Kirim kabar sebelum kliennya yang bertanya duluan.`

      const penerima = await resolveRecipients('klien_didiamkan', {
        companyId: request.companyId!,
        projectId: id,
      })
      for (const uid of penerima) {
        await createNotification({
          company_id: request.companyId!,
          user_id: uid,
          title: h.sebab === 'belum_pernah'
            ? 'Proyek tanpa laporan progres sama sekali'
            : 'Klien lama tak dikabari',
          message: pesan,
          priority: h.sebab === 'belum_pernah' ? 'high' : 'normal',
          type: 'klien_didiamkan',
          project_id: id,
          action_url: '/lapangan/harian',
          // `record_id` WAJIB - lihat `audit-notifikasi-punya-record.mjs`.
          action_data: { record_id: id, project_id: id, sebab: h.sebab, hari_diam: h.hariDiam },
        })
        dibuat++
      }
    }

    return reply.send({
      success: true,
      notifications_created: dibuat,
      checked: { proyek_aktif: idAktif.length, ...hitung, ambang_hari: ambangHari },
    })
  })
}

/**
 * Jeda MELANDAI — satu notifikasi per (type, record_id), makin jarang.
 *
 * ── Kenapa bukan dedup harian lagi
 *
 * Bentuk sebelumnya menahan kembar **per hari**. Terdengar benar, dan selama
 * berbulan-bulan tak ada yang menyadari akibatnya: masalah yang belum
 * diperbaiki menagih ulang **tiap hari, selamanya**.
 *
 * Diukur 2026-08-16 terhadap basis nyata:
 *
 *   9.009 notifikasi · 3 dibaca · 3.474 masuk ke kotak pemilik sendiri
 *   satu `gr_tak_cocok` menagih orang yang sama 5 hari berturut-turut
 *   untuk penerimaan barang yang sama
 *
 * 100% tak dibaca bukan kebetulan — itu yang terjadi pada alarm yang berbunyi
 * tiap hari untuk hal yang sama. Orang berhenti melihatnya, lalu berhenti
 * melihat notifikasi SAMA SEKALI, termasuk yang penting. Otomasi yang
 * membanjiri lebih buruk daripada otomasi yang tak ada: yang tak ada tak
 * merusak kepercayaan pada yang lain.
 *
 * Jadwal barunya: tagih hari ini, lalu **+3 hari, +7 hari, lalu tiap 14 hari**.
 * Sinyalnya tak hilang satu pun — yang hilang cuma pengulangannya. Masalah yang
 * bertahan sebulan menghasilkan 5 notifikasi, bukan 30.
 *
 * Nilainya sengaja TIDAK bisa disetel dari UI. Ini bukan ambang bisnis
 * ("berapa hari invoice dianggap telat") melainkan sifat alat itu sendiri;
 * menjadikannya bisa disetel mengundang orang mengembalikannya ke "tiap hari"
 * ketika sedang panik, dan cacat ini lahir kembali.
 *
 * ── Kenapa SATU query di muka, bukan satu query per catatan
 *
 * Bentuk pertama menyalin `alreadySent()` dari `check-deadlines` apa adanya:
 * satu SELECT per catatan, berurutan. Di basis dev ia berjalan **102 detik
 * untuk 46 kasbon** — dan itu ketahuan hanya karena test-nya kehabisan waktu.
 *
 * Angka itu bukan sekadar lambat, ia salah secara arsitektur: penjadwal
 * memanggil endpoint ini tiap 15 menit, dan tugas yang butuh dua menit akan
 * bertumpuk dengan denyut berikutnya. Tenant dengan 500 kasbon menggantung
 * membuatnya tak pernah selesai sama sekali.
 *
 * `check-deadlines` punya cacat yang sama; ia lolos selama ini karena
 * jumlah barisnya kebetulan kecil. Diperbaiki di sini lebih dulu karena di
 * sinilah ia terukur — perbaikan di sana pekerjaan tersendiri, dicatat.
 *
 * Bentuk sekarang: satu SELECT mengambil SELURUH `record_id` yang sudah
 * dikirim hari ini untuk tipe tersebut, lalu pemeriksaan berikutnya cuma
 * `Set.has` di memori.
 */
/**
 * Jarak minimum ke tagihan berikutnya, menurut sudah berapa kali dikirim.
 *
 * Indeks = jumlah yang SUDAH terkirim. Kiriman ke-1 tak punya jarak (baru).
 * Sesudah daftar habis, jarak terakhir berlaku seterusnya.
 */
const JEDA_HARI = [3, 7, 14] as const

/** Berapa hari ke belakang riwayat dibaca. Harus > jeda terpanjang. */
const JENDELA_HARI = 45

async function pembuatDedup(request: FastifyRequest, today: string, tipe: string[]) {
  const sejak = new Date(today + 'T00:00:00Z')
  sejak.setUTCDate(sejak.getUTCDate() - JENDELA_HARI)

  /*
    BERHALAMAN — wajib. Jendela 45 hari untuk satu tipe ramai sudah melewati
    1.000 baris, dan PostgREST memotongnya TANPA galat. Terpotong di sini
    berarti riwayat terlihat kosong, jeda melandai tak pernah berlaku, dan
    banjirnya kembali persis seperti semula — tanpa satu pun gejala.
    Dijaga `audit-baca-tak-terpotong` (ambang NOL).
  */
  const HALAMAN = 1000
  const data: Array<Record<string, unknown>> = []
  let error: { message: string } | null = null
  for (let dari = 0; ; dari += HALAMAN) {
    const r = await request.db!
      .from('notifications')
      .select('type, action_data, sent_at')
      .in('type', tipe)
      .gte('sent_at', sejak.toISOString())
      .order('sent_at', { ascending: true })
      .range(dari, dari + HALAMAN - 1)

    if (r.error) { error = r.error; break }
    if (!r.data || r.data.length === 0) break
    data.push(...(r.data as Array<Record<string, unknown>>))
    if (r.data.length < HALAMAN) break
  }

  /*
    Kegagalan baca di SINI adalah yang paling berbahaya di seluruh berkas, dan
    ia sempat tak diperiksa sama sekali.

    Query yang gagal memulangkan `data: null`, dan `?? []` di bawah mengubahnya
    jadi himpunan kosong — yang artinya **tak ada satu pun yang dianggap sudah
    terkirim**. Seluruh dua belas otomasi lalu mengirim ulang semuanya, dan
    tak ada satu pun galat: dari luar ia terlihat persis seperti hari dengan
    banyak temuan baru.

    Kerusakan yang sama pernah terjadi lewat jalan lain (pemisah `NUL` di 2.10)
    dan butuh penjaga sendiri untuk ditemukan. Yang ini ditangkap
    `audit-kegagalan-senyap` — angka 187 yang saya kira regresi saya ternyata
    sudah ada di HEAD.

    DILEMPAR, bukan dikembalikan kosong: otomasi yang mati lebih baik daripada
    otomasi yang membanjiri semua orang dengan pesan kembar. Yang mati
    ketahuan; yang membanjiri membuat orang mematikan notifikasinya.
  */
  if (error) {
    request.log.error({ err: error, tipe }, 'dedup: gagal membaca notifikasi hari ini')
    throw new Error(`Dedup harian tak bisa dibaca: ${error.message}`)
  }

  /*
    Per (type, record_id): berapa kali DITAGIH, dan kapan yang TERAKHIR.

    ⚠ "Berapa kali ditagih" BUKAN "berapa baris notifikasi". Satu tagihan yang
    ditujukan ke tiga orang menulis tiga baris; menghitung baris membuat
    tagihan PERTAMA langsung dianggap yang ketiga, dan jedanya melompat dari
    3 hari ke 14 hari seketika.

    Cacat ini tak punya gejala apa pun dari luar — notifikasinya tetap
    terkirim, cuma jauh lebih jarang daripada yang dirancang, dan makin jarang
    makin banyak penerimanya. Ia ketahuan hanya karena test menuntut angka
    yang tepat pada hari ke-4.

    Yang dihitung: HARI BERBEDA. Satu hari = satu tagihan, seberapa pun banyak
    orang yang menerimanya.
  */
  const riwayat = new Map<string, { hari: Set<string>; terakhir: number }>()
  for (const n of data) {
    const rid = (n.action_data as { record_id?: unknown } | null)?.record_id
    if (typeof rid !== 'string') continue
    const mentah = String(n.sent_at ?? '')
    const waktu = Date.parse(mentah)
    if (Number.isNaN(waktu)) continue
    const k = `${n.type} ${rid}`
    const p = riwayat.get(k)
    if (p) { p.hari.add(mentah.slice(0, 10)); if (waktu > p.terakhir) p.terakhir = waktu }
    else riwayat.set(k, { hari: new Set([mentah.slice(0, 10)]), terakhir: waktu })
  }

  const sekarang = Date.parse(today + 'T00:00:00Z')
  const HARI = 86_400_000

  // Sinkron: pemanggilnya tetap `await`-able tanpa menyentuh basis lagi.
  return function sudahDikirim(type: string, recordId: string): boolean {
    const p = riwayat.get(`${type} ${recordId}`)
    if (!p) return false                       // belum pernah — kirim

    /*
      `hari.size` selalu ≥ 1 di sini, jadi indeksnya `size - 1`. Melewati ujung
      daftar memakai jeda TERAKHIR selamanya — bukan berhenti menagih. Masalah
      yang bertahan setahun tetap terdengar, cuma dua minggu sekali.
    */
    const jeda = JEDA_HARI[Math.min(p.hari.size - 1, JEDA_HARI.length - 1)]
    return sekarang - p.terakhir < jeda * HARI  // belum waktunya — tahan
  }
}
