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
}

/**
 * Dedup harian — satu notifikasi per (type, record_id, hari).
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
async function pembuatDedup(request: FastifyRequest, today: string, tipe: string[]) {
  const { data, error } = await request.db!
    .from('notifications')
    .select('type, action_data')
    .in('type', tipe)
    .gte('sent_at', today + 'T00:00:00')

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

  const terkirim = new Set<string>()
  for (const n of data ?? []) {
    const rid = (n.action_data as { record_id?: unknown } | null)?.record_id
    if (typeof rid === 'string') terkirim.add(`${n.type} ${rid}`)
  }

  // Sinkron: pemanggilnya tetap `await`-able tanpa menyentuh basis lagi.
  return function sudahDikirim(type: string, recordId: string): boolean {
    return terkirim.has(`${type} ${recordId}`)
  }
}
