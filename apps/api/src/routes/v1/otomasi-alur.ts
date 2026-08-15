/**
 * ALUR OTOMASI — katalog workflow, status, jejak jalan, dan pemicu manual.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG DIUKUR DI TJS LEBIH DULU
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `automation-tjs/admin-dashboard` punya 6 endpoint automation dan 3 halaman.
 * Dua bentuknya ditiru karena terbukti, satu sengaja tidak:
 *
 *   DITIRU — katalog terpisah dari n8n. Halaman tetap terbaca saat n8n mati.
 *   DITIRU — kesehatan dihitung ULANG dari log, bukan counter yang ditambah.
 *   TIDAK  — dua namespace yang dijembatani peta tulis-tangan. Di sini
 *            `otomasi_jalan.alur_id` adalah FK, jadi tak ada yang bisa
 *            "unmapped".
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA MENJALANKAN PUNYA IZINNYA SENDIRI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `otomasi:alur:jalankan` terpisah dari `otomasi:alur:lihat`. Yang boleh
 * memeriksa kenapa notifikasi tak terkirim bukan otomatis yang boleh memicu
 * ulang pengirimannya — dan alur di sini mengirim pesan KE PELANGGAN. Satu
 * klik yang salah terlihat oleh orang di luar perusahaan, dan tak bisa
 * ditarik kembali.
 */

import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'
import { ambilKredensial } from '../../lib/kredensial.js'
import { KATALOG_OTOMASI } from '../../lib/katalog-otomasi.js'
import { AMBANG_OTOMASI } from '../../lib/ambang-otomasi.js'
import {
  konfigurasiN8n,
  daftarWorkflowN8n,
  jalankanAlur,
  segarkanKesehatanAlur,
  ujiSambunganN8n,
} from '../../lib/otomasi-n8n.js'

const KOLOM_ALUR =
  'id, kode, nama, keterangan, n8n_id, jalur_webhook, pemicu, jadwal_cron, ' +
  'kategori, aktif, kesehatan, kesehatan_pada, jalan_terakhir, sukses_terakhir, ' +
  'gagal_terakhir, pesan_gagal, diperbarui_pada'

/** Kode alur: huruf kecil, angka, strip. Dipakai di URL dan pencatatan. */
const POLA_KODE = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/

function cfgTenant(request: Parameters<typeof ambilKredensial>[0]) {
  return konfigurasiN8n((kunci) => ambilKredensial(request, kunci))
}

export default async function otomasiAlurRoutes(app: FastifyInstance) {
  // ── GET /api/v1/otomasi/alur ─────────────────────────────────────────────
  app.get(
    '/api/v1/otomasi/alur',
    { preHandler: [authenticate, requirePermission('otomasi:alur:lihat')] },
    async (request, reply) => {
      const { data, error } = await request.db!
        .from('otomasi_alur')
        .select(KOLOM_ALUR)
        .order('kategori')
        .order('kode')

      if (error) {
        request.log.error({ err: error }, 'otomasi/alur: gagal membaca katalog')
        return reply.status(500).send({ error: 'Gagal membaca katalog alur' })
      }

      /*
       * Kesiapan kanal dinyatakan BERSAMA katalognya, bukan lewat panggilan
       * kedua dari UI.
       *
       * Pola yang sama dengan `wa/nomor` (`kanal_siap`): tombol "Jalankan"
       * yang baru gagal SESUDAH diklik memberi tahu terlambat, dan pesannya
       * ("N8N_BASE_URL belum diisi") datang pada saat orang sudah mengira
       * sesuatu terjadi.
       */
      const cfg = await cfgTenant(request)
      return reply.send({ data: data ?? [], n8n_siap: cfg !== null })
    },
  )

  // ── GET /api/v1/otomasi/alur/:id/jalan — jejak ───────────────────────────
  app.get<{ Params: { id: string } }>(
    '/api/v1/otomasi/alur/:id/jalan',
    { preHandler: [authenticate, requirePermission('otomasi:alur:lihat')] },
    async (request, reply) => {
      const { data, error } = await request.db!
        .from('otomasi_jalan')
        .select('id, status, sumber, n8n_jalan_id, dimulai_pada, selesai_pada, durasi_ms, pesan, oleh')
        .eq('alur_id', request.params.id)
        .order('dimulai_pada', { ascending: false })
        .limit(50)

      if (error) {
        request.log.error({ err: error }, 'otomasi/alur: gagal membaca jejak')
        return reply.status(500).send({ error: 'Gagal membaca jejak jalan' })
      }
      return reply.send({ data: data ?? [] })
    },
  )

  // ── POST /api/v1/otomasi/alur — daftarkan / ubah ─────────────────────────
  app.post<{
    Body: {
      id?: string
      kode?: string
      nama?: string
      keterangan?: string
      n8n_id?: string
      jalur_webhook?: string
      pemicu?: string
      jadwal_cron?: string
      kategori?: string
      aktif?: boolean
    }
  }>(
    '/api/v1/otomasi/alur',
    { preHandler: [authenticate, requirePermission('otomasi:alur:kelola')] },
    async (request, reply) => {
      const b = request.body ?? {}

      // ── Mengubah yang sudah ada ──────────────────────────────────────────
      if (b.id) {
        const muatan: Record<string, unknown> = {
          diperbarui_pada: new Date().toISOString(),
          diperbarui_oleh: request.currentUser!.id,
        }
        for (const k of ['nama', 'keterangan', 'n8n_id', 'jalur_webhook', 'pemicu', 'jadwal_cron', 'kategori'] as const) {
          if (typeof b[k] === 'string') muatan[k] = b[k]
        }
        if (typeof b.aktif === 'boolean') muatan.aktif = b.aktif

        const { data, error } = await request.db!
          .from('otomasi_alur')
          .update(muatan)
          .eq('id', b.id)
          .select('id')

        if (error) {
          request.log.error({ err: error }, 'otomasi/alur: gagal mengubah')
          return reply.status(500).send({ error: 'Gagal mengubah alur' })
        }
        // Nol baris BUKAN keberhasilan — pelajaran S4 (`wa/template`), dan
        // penjaga `audit-tulis-tanpa-periksa` ambang kedua menahannya.
        if (!data || data.length === 0) {
          return reply.status(404).send({ error: 'Alur tidak ditemukan' })
        }

        void logAuditEvent(request, {
          tableName: 'otomasi_alur',
          recordId: b.id,
          action: 'otomasi.alur.ubah',
          actorId: request.currentUser!.id,
          newValues: muatan,
          severity: 'warning',
        })
        return reply.send({ ok: true, id: b.id })
      }

      // ── Mendaftarkan baru ────────────────────────────────────────────────
      const kode = (b.kode ?? '').trim().toLowerCase()
      if (!POLA_KODE.test(kode)) {
        return reply.status(422).send({
          error:
            'Kode alur hanya huruf kecil, angka, dan strip (3-50 karakter). ' +
            'Contoh: pengingat-invoice-jatuh-tempo.',
        })
      }
      const nama = (b.nama ?? '').trim()
      if (!nama) return reply.status(422).send({ error: 'Nama alur wajib diisi' })

      const { data, error } = await request.db!
        .from('otomasi_alur')
        .insert({
          company_id: request.companyId!,
          kode,
          nama,
          keterangan: b.keterangan ?? null,
          n8n_id: b.n8n_id ?? null,
          jalur_webhook: b.jalur_webhook ?? null,
          pemicu: b.pemicu ?? 'manual',
          jadwal_cron: b.jadwal_cron ?? null,
          kategori: b.kategori ?? 'umum',
          diperbarui_oleh: request.currentUser!.id,
        })
        .select('id')

      if (error) {
        // Kode ganda punya pesannya sendiri: "gagal menyimpan" membuat orang
        // mengulang tindakan yang sama dan mendapat hasil yang sama.
        if (/duplicate|unique/i.test(error.message)) {
          return reply.status(409).send({ error: `Kode "${kode}" sudah dipakai alur lain.` })
        }
        request.log.error({ err: error }, 'otomasi/alur: gagal mendaftarkan')
        return reply.status(500).send({ error: 'Gagal mendaftarkan alur' })
      }

      const id = (data as Array<{ id: string }> | null)?.[0]?.id ?? null
      void logAuditEvent(request, {
        tableName: 'otomasi_alur',
        recordId: id ?? kode,
        action: 'otomasi.alur.daftar',
        actorId: request.currentUser!.id,
        newValues: { kode, nama },
        severity: 'warning',
      })
      return reply.status(201).send({ ok: true, id })
    },
  )

  // ── DELETE /api/v1/otomasi/alur/:id ──────────────────────────────────────
  //
  // ── Kenapa ini sebelumnya TIDAK ADA, dan kenapa itu masalah
  //
  // Alur bisa didaftarkan dan diubah, tak pernah dihapus. Kolom `aktif` ada
  // dan API menerimanya, tapi modal-nya tak pernah menampilkan togglenya —
  // jadi alur yang salah ketik, atau workflow n8n yang sudah dibuang,
  // menetap selamanya di daftar. Satu-satunya jalan keluar: SQL langsung.
  //
  // Daftar yang tak bisa dibersihkan pelan-pelan berhenti dipercaya, dan
  // daftar yang tak dipercaya berhenti dibaca.
  //
  // ── Kenapa MENGHAPUS, bukan cuma menonaktifkan
  //
  // Keduanya disediakan, karena keduanya menjawab hal berbeda:
  //
  //   nonaktif  alur SAH tapi sedang tak dipakai — riwayat jalannya masih
  //             bernilai, dan suatu saat dinyalakan lagi
  //   hapus     alur yang seharusnya tak pernah ada — salah ketik, percobaan,
  //             sisa workflow yang sudah dibuang di n8n
  //
  // Memaksa yang kedua memakai yang pertama membuat daftar penuh bangkai
  // ber-status "nonaktif" yang tak seorang pun berani sentuh karena tak
  // yakin apakah masih terpakai.
  //
  // `otomasi_jalan` ikut terhapus lewat FK CASCADE (migrasi 272) — riwayat
  // eksekusi milik alur yang tak ada tak bisa dibaca siapa pun, dan jejak
  // penghapusannya sendiri tetap ada di audit log yang append-only.
  app.delete<{ Params: { id: string } }>(
    '/api/v1/otomasi/alur/:id',
    { preHandler: [authenticate, requirePermission('otomasi:alur:kelola')] },
    async (request, reply) => {
      const { id } = request.params

      // Dibaca DULU supaya audit log memuat apa yang hilang. Sesudah
      // terhapus, `kode` dan `nama`-nya tak bisa diambil dari mana pun —
      // dan jejak "sesuatu dihapus" tanpa menyebut apa nyaris tak berguna.
      const { data: sebelum, error: eBaca } = await request.db!
        .from('otomasi_alur')
        .select('id, kode, nama, n8n_id, aktif')
        .eq('id', id)
        .maybeSingle()

      if (eBaca) {
        request.log.error({ err: eBaca }, 'otomasi/alur: gagal membaca sebelum hapus')
        return reply.status(500).send({ error: 'Gagal membaca alur' })
      }
      if (!sebelum) return reply.status(404).send({ error: 'Alur tidak ditemukan' })

      const { data, error } = await request.db!
        .from('otomasi_alur')
        .delete()
        .eq('id', id)
        .select('id')

      if (error) {
        request.log.error({ err: error }, 'otomasi/alur: gagal menghapus')
        return reply.status(500).send({ error: 'Gagal menghapus alur' })
      }
      // Nol baris BUKAN keberhasilan — sama seperti jalur ubah di atas.
      // Tanpa pemeriksaan ini, penghapusan yang ditolak RLS terbaca sebagai
      // sukses, dan barisnya muncul lagi begitu halaman disegarkan.
      if (!data || data.length === 0) {
        return reply.status(404).send({ error: 'Alur tidak ditemukan' })
      }

      void logAuditEvent(request, {
        tableName: 'otomasi_alur',
        recordId: id,
        action: 'otomasi.alur.hapus',
        actorId: request.currentUser!.id,
        oldValues: sebelum as Record<string, unknown>,
        severity: 'warning',
      })
      return reply.send({ ok: true, id })
    },
  )

  // ── POST /api/v1/otomasi/alur/:id/jalankan ───────────────────────────────
  app.post<{ Params: { id: string }; Body: { muatan?: Record<string, unknown> } }>(
    '/api/v1/otomasi/alur/:id/jalankan',
    {
      preHandler: [authenticate, requirePermission('otomasi:alur:jalankan')],
      // Per user: memicu alur berarti mengirim pesan keluar. Klik beruntun
      // yang tak dibatasi mengirimkannya berkali-kali ke orang yang sama.
      config: {
        rateLimit: {
          max: 20,
          timeWindow: '1 minute',
          keyGenerator: (r: { currentUser?: { id: string }; ip: string }) =>
            r.currentUser?.id ?? r.ip,
        },
      },
    },
    async (request, reply) => {
      const { data: alur, error } = await request.db!
        .from('otomasi_alur')
        .select('id, kode, nama, n8n_id, jalur_webhook, aktif')
        .eq('id', request.params.id)
        .maybeSingle()

      if (error) {
        request.log.error({ err: error }, 'otomasi/alur: gagal membaca alur')
        return reply.status(500).send({ error: 'Gagal membaca alur' })
      }
      if (!alur) return reply.status(404).send({ error: 'Alur tidak ditemukan' })

      const a = alur as {
        id: string; kode: string; nama: string
        n8n_id: string | null; jalur_webhook: string | null; aktif: boolean
      }
      // Alur NONAKTIF tak boleh dipicu walau tombolnya sampai terklik —
      // "nonaktif" yang masih bisa dijalankan bukan nonaktif.
      if (!a.aktif) {
        return reply.status(409).send({ error: `Alur "${a.nama}" sedang nonaktif.` })
      }

      const hasil = await jalankanAlur({
        db: request.db!,
        companyId: request.companyId!,
        cfg: await cfgTenant(request),
        alur: a,
        sumber: 'manual',
        oleh: request.currentUser!.id,
        muatan: request.body?.muatan,
      })

      await segarkanKesehatanAlur(request.db!, a.id)

      void logAuditEvent(request, {
        tableName: 'otomasi_alur',
        recordId: a.id,
        action: 'otomasi.alur.jalankan',
        actorId: request.currentUser!.id,
        newValues: { kode: a.kode, berhasil: hasil.ok, durasi_ms: hasil.durasiMs },
        severity: 'warning',
      })

      if (!hasil.ok) {
        // 502, bukan 500: yang gagal adalah n8n, bukan kita. Kode status yang
        // menyalahkan diri sendiri mengirim orang memeriksa tempat yang salah.
        return reply.status(hasil.alasan === 'tak_terkonfigurasi' ? 503 : 502).send({
          error: hasil.pesan,
          alasan: hasil.alasan,
        })
      }
      return reply.send({ ok: true, durasi_ms: hasil.durasiMs, n8n_jalan_id: hasil.n8nJalanId })
    },
  )

  // ── GET /api/v1/otomasi/n8n/status ───────────────────────────────────────
  app.get(
    '/api/v1/otomasi/n8n/status',
    { preHandler: [authenticate, requirePermission('otomasi:alur:lihat')] },
    async (request, reply) => {
      const cfg = await cfgTenant(request)
      const uji = await ujiSambunganN8n(cfg)
      return reply.send({
        terkonfigurasi: cfg !== null,
        ok: uji.ok,
        pesan: uji.pesan,
        durasi_ms: uji.durasiMs,
      })
    },
  )

  // ── GET /api/v1/otomasi/n8n/workflow — apa yang ADA di n8n ───────────────
  //
  // Dipakai untuk MENCOCOKKAN katalog dengan kenyataan: alur yang terdaftar
  // di sini tetapi tak ada lagi di n8n adalah alur yang tak akan pernah
  // jalan — dan tanpa halaman ini, ketiadaannya baru ketahuan saat seseorang
  // menunggu notifikasi yang tak datang.
  app.get(
    '/api/v1/otomasi/n8n/workflow',
    { preHandler: [authenticate, requirePermission('otomasi:alur:kelola')] },
    async (request, reply) => {
      const hasil = await daftarWorkflowN8n(await cfgTenant(request))
      if (!hasil.ok) return reply.status(502).send({ error: hasil.pesan })

      // Cocokkan dengan katalog supaya UI bisa menandai yang belum terdaftar
      // dan yang sudah hilang — dua keadaan yang sama-sama tak bergejala.
      const { data } = await request.db!.from('otomasi_alur').select('kode, nama, n8n_id')
      const katalog = (data ?? []) as Array<{ kode: string; nama: string; n8n_id: string | null }>
      const terpakai = new Set(katalog.map((k) => k.n8n_id).filter(Boolean))
      const adaDiN8n = new Set(hasil.data.map((w) => w.id))

      return reply.send({
        data: hasil.data.map((w) => ({ ...w, terdaftar: terpakai.has(w.id) })),
        hilang: katalog
          .filter((k) => k.n8n_id && !adaDiN8n.has(k.n8n_id))
          .map((k) => ({ kode: k.kode, nama: k.nama, n8n_id: k.n8n_id })),
      })
    },
  )

  // ── GET /api/v1/otomasi/alur/ikhtisar — empat angka di kepala halaman ────
  //
  // Di bawah `/alur/`, BUKAN `/otomasi/ikhtisar` — nama itu sudah dipakai
  // ikhtisar menu induk AI & Otomasi (penyedia.ts, migrasi 267). Fastify
  // menolak rute ganda saat boot, jadi bentroknya ketahuan seketika; kalau
  // ia diam, dua halaman berbeda akan memanggil endpoint yang sama dan salah
  // satunya menampilkan angka milik yang lain.
  //
  // Dihitung di SERVER, bukan diturunkan di UI dari daftar alur.
  //
  // Daftar dibatasi 50 baris; menghitung "gagal 24 jam" dari 50 baris pertama
  // menghasilkan angka yang BENAR hari ini dan diam-diam salah begitu alurnya
  // lebih dari 50. Angka ringkasan yang meleset lebih buruk daripada tak ada
  // angka: ia menenangkan tanpa dasar.
  app.get(
    '/api/v1/otomasi/alur/ikhtisar',
    { preHandler: [authenticate, requirePermission('otomasi:alur:lihat')] },
    async (request, reply) => {
      const db = request.db!
      const sejak24j = new Date(Date.now() - 24 * 60 * 60_000).toISOString()

      const [alur, jalan24j] = await Promise.all([
        db.from('otomasi_alur').select('id, aktif, kesehatan, jalan_terakhir, n8n_id, jalur_webhook'),
        db.from('otomasi_jalan').select('status, dimulai_pada').gte('dimulai_pada', sejak24j),
      ])

      if (alur.error || jalan24j.error) {
        request.log.error(
          { err: alur.error ?? jalan24j.error },
          'otomasi/ikhtisar: gagal menghitung',
        )
        // Angka yang gagal dihitung TIDAK dibalas sebagai nol — nol berarti
        // "tak ada masalah", dan itu kalimat paling menyesatkan yang bisa
        // ditampilkan saat sistemnya sedang tak bisa melihat.
        return reply.status(500).send({ error: 'Gagal menghitung ikhtisar otomasi' })
      }

      const a = (alur.data ?? []) as Array<{
        aktif: boolean; kesehatan: string; jalan_terakhir: string | null
        n8n_id: string | null; jalur_webhook: string | null
      }>
      const j = (jalan24j.data ?? []) as Array<{ status: string }>

      return reply.send({
        aktif: a.filter((x) => x.aktif).length,
        gagal: a.filter((x) => x.aktif && x.kesehatan === 'gagal').length,
        jalan_24j: j.length,
        gagal_24j: j.filter((x) => x.status === 'gagal').length,
        // "Belum pernah jalan" dipisah dari "gagal": yang satu belum dicoba,
        // yang satu sudah dan patah. Menyatukannya membuat alur baru terlihat
        // seperti alur rusak.
        belum_pernah: a.filter((x) => x.aktif && !x.jalan_terakhir).length,
        belum_tersambung: a.filter((x) => x.aktif && !x.n8n_id && !x.jalur_webhook).length,
        total: a.length,
      })
    },
  )

  // ── GET /api/v1/otomasi/alur/jalan — log eksekusi SELURUH alur ───────────
  //
  // Terpisah dari `/alur/:id/jalan` yang per-alur. Yang ini menjawab
  // pertanyaan berbeda: "apa yang terjadi belakangan ini?" — dan itu tak bisa
  // dijawab dengan membuka empat belas alur satu per satu.
  app.get<{ Querystring: { status?: string } }>(
    '/api/v1/otomasi/alur/jalan',
    { preHandler: [authenticate, requirePermission('otomasi:alur:lihat')] },
    async (request, reply) => {
      let q = request.db!
        .from('otomasi_jalan')
        .select('id, alur_id, status, sumber, n8n_jalan_id, dimulai_pada, selesai_pada, durasi_ms, pesan')
        .order('dimulai_pada', { ascending: false })
        .limit(100)

      // Saringan status: yang membuka log hampir selalu mencari yang GAGAL.
      if (request.query?.status && ['jalan', 'sukses', 'gagal'].includes(request.query.status)) {
        q = q.eq('status', request.query.status)
      }

      const { data, error } = await q
      if (error) {
        request.log.error({ err: error }, 'otomasi/jalan: gagal membaca log')
        return reply.status(500).send({ error: 'Gagal membaca log eksekusi' })
      }

      const baris = (data ?? []) as Array<{ alur_id: string }>
      if (baris.length === 0) return reply.send({ data: [] })

      /*
       * Nama alur ditempelkan di sini, bukan di-join.
       *
       * Log tanpa nama menuntut orang menghafal UUID untuk tahu alur mana yang
       * gagal — dan yang menghafal UUID tak akan memeriksa apa pun. Diambil
       * terpisah karena `TenantDb` tak menyusun join, dan dua query yang jelas
       * lebih mudah diperiksa daripada satu join yang tersirat.
       */
      const { data: alur, error: errNama } = await request.db!
        .from('otomasi_alur')
        .select('id, nama, kode')
        .in('id', [...new Set(baris.map((b) => b.alur_id))])

      /*
       * Gagal membaca nama TIDAK boleh jadi "(alur terhapus)" diam-diam.
       *
       * Itu kalimat yang menuduh: seluruh log akan terbaca seolah alurnya
       * memang sudah dihapus, padahal yang gagal cuma satu query nama. Yang
       * membaca log lalu mencari alur yang tak pernah hilang.
       */
      if (errNama) {
        request.log.error({ err: errNama }, 'otomasi/alur/jalan: nama alur gagal dibaca')
        return reply.status(500).send({ error: 'Gagal membaca nama alur untuk log' })
      }

      const nama = new Map(
        ((alur ?? []) as Array<{ id: string; nama: string; kode: string }>).map((x) => [
          x.id,
          { nama: x.nama, kode: x.kode },
        ]),
      )

      return reply.send({
        data: baris.map((b) => ({
          ...b,
          nama_alur: nama.get(b.alur_id)?.nama ?? '(alur terhapus)',
          kode_alur: nama.get(b.alur_id)?.kode ?? null,
        })),
      })
    },
  )

  // ── GET /api/v1/otomasi/katalog ──────────────────────────────────────────
  //
  // Penjelasan tiap otomasi + status yang DIUKUR, bukan yang dicatat.
  //
  // Founder 2026-08-15 meminta "katalog otomasi di UI beserta semua penjelasan
  // dan flow kerja otomasi tersebut". Halaman Ikhtisar menjawab "sehat atau
  // tidak", Riwayat menjawab "kapan terakhir jalan"; tak satu pun menjawab
  // "sebenarnya ini mengerjakan apa".
  //
  // ── Kenapa status TIDAK ikut disimpan di katalog
  //
  // Repo ini sudah punya satu katalog otomasi yang membusuk justru karena
  // menyimpan status (`06-agentic-ai-*.md`: tujuh otomasi hidup masih tertulis
  // `Next`). Jadi pembagiannya tegas:
  //
  //   dari berkas katalog  → penjelasan, pemicu, langkah kerja, penempatan
  //   dari basis SAAT INI  → terpasang/tidak, aktif, kapan terakhir jalan
  //
  // Yang bisa basi diukur tiap permintaan; yang ditulis tak bisa basi.
  app.get(
    '/api/v1/otomasi/katalog',
    { preHandler: [authenticate, requirePermission('otomasi:alur:lihat')] },
    async (request, reply) => {
      /*
        Alur dibaca SEKALI lalu dipetakan, bukan satu query per entri.

        Tujuh belas entri berarti tujuh belas perjalanan bolak-balik, dan
        halaman katalog adalah halaman yang orang buka justru saat curiga ada
        yang lambat.
      */
      const { data: alur, error } = await request.db!
        .from('otomasi_alur')
        .select('kode, nama, aktif, kesehatan, jalan_terakhir, sukses_terakhir, gagal_terakhir, pesan_gagal')

      if (error) {
        request.log.error({ err: error }, 'otomasi/katalog: gagal membaca status alur')
        return reply.status(500).send({ error: 'Gagal membaca status otomasi' })
      }

      const petaAlur = new Map(
        (alur ?? []).map((a) => [(a as { kode: string }).kode, a]),
      )

      /*
        Ambang dibaca dari pengaturan tenant, dengan bawaan sebagai cadangan.

        Menampilkan bawaan kepada tenant yang sudah mengubahnya lebih buruk
        daripada tidak menampilkan apa-apa: orang membaca "7 hari", menunggu
        pesan di hari ketujuh, dan pesannya datang di hari ketiga.
      */
      const { data: setelan } = await request.db!
        .from('company_settings')
        .select('key, value')
        .in('key', Object.keys(AMBANG_OTOMASI))

      const petaAmbang = new Map(
        (setelan ?? []).map((r) => {
          const s = r as { key: string; value: unknown }
          return [s.key, s.value]
        }),
      )

      const data = KATALOG_OTOMASI.map((e) => {
        const a = petaAlur.get(e.kunci) as {
          nama?: string
          aktif?: boolean
          kesehatan?: string
          jalan_terakhir?: string | null
          sukses_terakhir?: string | null
          gagal_terakhir?: string | null
          pesan_gagal?: string | null
        } | undefined

        const metaAmbang = e.ambang ? AMBANG_OTOMASI[e.ambang as keyof typeof AMBANG_OTOMASI] : null

        return {
          ...e,
          /*
            `terpasang` memisahkan dua keadaan yang mudah tertukar dan
            berakibat berbeda:

              belum terpasang → alurnya memang belum dibuat di n8n
              terpasang, mati → sengaja dimatikan orang

            UI yang menyamakan keduanya membuat orang mencari tombol nyalakan
            untuk sesuatu yang belum ada.
          */
          terpasang: Boolean(a),
          aktif: a?.aktif ?? false,
          kesehatan: a?.kesehatan ?? null,
          jalan_terakhir: a?.jalan_terakhir ?? null,
          sukses_terakhir: a?.sukses_terakhir ?? null,
          gagal_terakhir: a?.gagal_terakhir ?? null,
          pesan_gagal: a?.pesan_gagal ?? null,
          ambang_nilai: e.ambang
            ? Number(petaAmbang.get(e.ambang) ?? metaAmbang?.bawaan ?? 0)
            : null,
          ambang_label: metaAmbang?.label ?? null,
          ambang_bawaan: metaAmbang?.bawaan ?? null,
          /* Apakah nilainya sudah disetel tenant, atau masih bawaan. */
          ambang_disetel: e.ambang ? petaAmbang.has(e.ambang) : false,
        }
      })

      return reply.send({ data })
    },
  )
}
