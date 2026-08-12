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
      const { data: logs } = await request.db!
        .viaProject('progress_logs', p.id)
        .select('rab_item_id, logged_at, pct_completion')
        .eq('mode', 'detail')
        .not('rab_item_id', 'is', null)
        .order('logged_at', { ascending: true })

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
  const { data } = await request.db!
    .from('notifications')
    .select('type, action_data')
    .in('type', tipe)
    .gte('sent_at', today + 'T00:00:00')

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
