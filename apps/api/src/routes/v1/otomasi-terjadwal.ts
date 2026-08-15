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
