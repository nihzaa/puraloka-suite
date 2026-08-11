import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'
import {
  periksaKesiapan, selisihSeimbang, ringkasPeriode, bolehBukaKembali,
  type Periode, type IsiPeriode,
} from '../../lib/tutup-buku.js'

/**
 * PERIODE AKUNTANSI & TUTUP BUKU (G5).
 *
 * ⚠ EMBER [C] — CLAUDE.md §5.3. Penguncian ditegakkan TRIGGER di basis
 *   (migrasi 294). Berkas ini memberi PESAN yang bisa dibaca orang sebelum
 *   trigger menolaknya; ia bukan tempat aturannya hidup.
 *
 *   Menghapus pemeriksaan di sini membuat pesannya jelek. Menghapus
 *   triggernya membuat pembukuan bisa diubah setelah dilaporkan.
 *
 * ── Kenapa menutup dan MEMBUKA KEMBALI punya capability berbeda
 *
 * Menutup periode adalah pekerjaan rutin akhir bulan (`gl:periode:manage`).
 * Membuka kembali mengubah angka yang mungkin sudah dikirim ke bank atau
 * dipakai menghitung pajak — dan yang menandatanganinya direktur
 * (`gl:periode:reopen`, hanya peran `direktur`).
 *
 * ── Peringatan tenancy
 *
 *   periode_akuntansi          kategori B (punya `company_id`)
 *   periode_akuntansi_riwayat  kategori C lewat `periode_id` ← BUKAN project
 */

const PERIODE_SELECT = `
  id, company_id, nama, tanggal_mulai, tanggal_akhir, status,
  ditutup_pada, ditutup_oleh, catatan_tutup, dibuka_ulang, created_at,
  penutup:users!periode_akuntansi_ditutup_oleh_fkey ( id, name )
`

const tanggalSah = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)

/**
 * Menghitung isi periode: berapa jurnal posted/draft dan totalnya.
 *
 * Dihitung dari `journal_entries` + `journal_entry_lines`, BUKAN dari kolom
 * ringkasan yang disimpan — angka ringkasan yang disimpan akan menyimpang
 * begitu ada jurnal masuk lewat jalur lain, dan yang menyimpang itu justru
 * yang dipakai memutuskan boleh-tidaknya menutup.
 */
async function hitungIsi(
  db: NonNullable<Parameters<typeof logAuditEvent>[0]['db']>,
  dari: string,
  sampai: string,
): Promise<IsiPeriode | { galat: string }> {
  const { data, error } = await db
    .from('journal_entries')
    .select('id, status, journal_entry_lines(debit, credit)')
    .gte('entry_date', dari)
    .lte('entry_date', sampai)
    .limit(5000)

  if (error) return { galat: error.message }

  // `data` DIPASTIKAN tidak null — `error` sudah diperiksa. `data ?? []` di
  // sini berbahaya: query gagal berubah jadi "periode kosong" yang terlihat
  // sah, dan periodenya ditutup dengan jurnal yang tak pernah terlihat.
  const baris = data as Array<Record<string, unknown>>

  let posted = 0, draft = 0, debit = 0, kredit = 0
  for (const je of baris) {
    if (je.status === 'draft') { draft++; continue }
    if (je.status !== 'posted') continue   // `void` diabaikan
    posted++
    for (const l of ((je.journal_entry_lines ?? []) as Array<Record<string, unknown>>)) {
      debit += Number(l.debit ?? 0)
      kredit += Number(l.credit ?? 0)
    }
  }
  return { posted, draft, total_debit: debit, total_kredit: kredit }
}

export default async function tutupBukuRoutes(app: FastifyInstance) {
  // ── GET /gl/periode ──────────────────────────────────────────────────────
  app.get(
    '/api/v1/gl/periode',
    { preHandler: [authenticate, requirePermission('gl:periode:view')] },
    async (request, reply) => {
      const { data, error } = await request.db!
        .from('periode_akuntansi')
        .select(PERIODE_SELECT)
        .order('tanggal_mulai', { ascending: false })
        .limit(200)
      if (error) {
        request.log.error({ err: error }, 'gagal memuat periode akuntansi')
        return reply.status(500).send({ error: 'Gagal memuat periode akuntansi' })
      }

      const daftar = (data ?? []) as unknown as Periode[]

      // Isi tiap periode dihitung sekali di sini supaya daftar bisa
      // menunjukkan "berapa jurnal yang dikunci" tanpa membuka satu per satu.
      const isian: Record<string, IsiPeriode> = {}
      for (const p of daftar) {
        const h = await hitungIsi(request.db!, p.tanggal_mulai, p.tanggal_akhir)
        if ('galat' in h) {
          request.log.error({ err: h.galat, periode: p.id }, 'gagal menghitung isi periode')
          return reply.status(500).send({ error: 'Gagal menghitung isi periode' })
        }
        isian[p.id] = h
      }

      return reply.send({
        periode: daftar.map((p) => ({
          ...p,
          isi: isian[p.id],
          // ⚠ MUTASI TAK BISA MERAH DI SINI, dan itu dinyatakan bukan
          // disembunyikan: mengganti baris ini dengan `selisih: 0` tetap
          // menghijaukan seluruh test integrasi, karena setiap jurnal yang
          // bisa MASUK ke basis dijamin seimbang oleh
          // `trg_gl_wajib_seimbang` — jadi selisih nyata SELALU 0.
          //
          // Yang menjaga perilakunya ada di pustaka: `selisihSeimbang` punya
          // 6 test dan 4 mutasi MERAH di `lib/__tests__/tutup-buku.test.ts`,
          // termasuk yang membuktikan ia menjawab `null` saat totalnya tak
          // terbaca. Baris ini hanya memanggilnya.
          //
          // Alternatif yang DITOLAK: menyuntik jurnal timpang lewat
          // `session_replication_role = replica` untuk melumpuhkan trigger.
          // Itu melemahkan Ember [C] demi menghijaukan mutasi — persis yang
          // dilarang G-5.
          selisih: selisihSeimbang(isian[p.id]),
        })),
        ringkas: ringkasPeriode(daftar),
      })
    },
  )

  // ── GET /gl/periode/:id/kesiapan ─────────────────────────────────────────
  //
  // Apa yang akan terjadi bila periode ini ditutup — SEBELUM menutupnya.
  app.get<{ Params: { id: string } }>(
    '/api/v1/gl/periode/:id/kesiapan',
    { preHandler: [authenticate, requirePermission('gl:periode:view')] },
    async (request, reply) => {
      const { id } = request.params

      const { data: p, error: eP } = await request.db!
        .from('periode_akuntansi')
        .select(PERIODE_SELECT)
        .eq('id', id)
        .maybeSingle()
      if (eP) {
        request.log.error({ err: eP, id }, 'gagal memuat periode')
        return reply.status(500).send({ error: 'Gagal memuat periode' })
      }
      if (!p) return reply.status(404).send({ error: 'Periode tidak ditemukan' })

      const periode = p as unknown as Periode

      const isi = await hitungIsi(request.db!, periode.tanggal_mulai, periode.tanggal_akhir)
      if ('galat' in isi) {
        request.log.error({ err: isi.galat, id }, 'gagal menghitung isi periode')
        return reply.status(500).send({ error: 'Gagal menghitung isi periode' })
      }

      // Periode SEBELUMNYA yang masih terbuka — satu-satunya penghalang.
      const { data: sebelum, error: eS } = await request.db!
        .from('periode_akuntansi')
        .select('id, nama, tanggal_mulai')
        .lt('tanggal_mulai', periode.tanggal_mulai)
        .eq('status', 'terbuka')
        .order('tanggal_mulai', { ascending: true })
        .limit(1)
      if (eS) {
        request.log.error({ err: eS, id }, 'gagal memeriksa periode sebelumnya')
        return reply.status(500).send({ error: 'Gagal memeriksa periode sebelumnya' })
      }

      const namaSebelum = (sebelum ?? [])[0]?.nama as string | undefined

      return reply.send({
        periode,
        kesiapan: periksaKesiapan(periode, isi, namaSebelum ?? null),
        selisih: selisihSeimbang(isi),
      })
    },
  )

  // ── POST /gl/periode ─────────────────────────────────────────────────────
  app.post<{
    Body: { nama?: string; tanggal_mulai?: string; tanggal_akhir?: string }
  }>(
    '/api/v1/gl/periode',
    { preHandler: [authenticate, requirePermission('gl:periode:manage')] },
    async (request, reply) => {
      const b = request.body

      if (!b.nama?.trim()) return reply.status(400).send({ error: 'nama wajib diisi' })
      for (const [n, v] of [['tanggal_mulai', b.tanggal_mulai], ['tanggal_akhir', b.tanggal_akhir]] as const) {
        if (!v || !tanggalSah(v)) {
          return reply.status(400).send({ error: `${n} wajib diisi, berformat YYYY-MM-DD` })
        }
      }
      if (b.tanggal_akhir! < b.tanggal_mulai!) {
        return reply.status(400).send({
          error: 'tanggal_akhir tidak boleh mendahului tanggal_mulai',
        })
      }

      const { data, error } = await request.db!
        .from('periode_akuntansi')
        .insert({
          nama: b.nama.trim(),
          tanggal_mulai: b.tanggal_mulai,
          tanggal_akhir: b.tanggal_akhir,
          created_by: request.currentUser!.id,
        })
        .select(PERIODE_SELECT)
        .single()

      if (error) {
        // Constraint EXCLUDE menolak periode yang tumpang tindih. Pesannya
        // diterjemahkan supaya bisa dibaca orang — galat Postgres menyebut
        // nama constraint, bukan apa yang salah.
        if (/periode_tak_tumpang_tindih|exclusion constraint/i.test(error.message)) {
          return reply.status(422).send({
            error: 'Rentang tanggal ini tumpang tindih dengan periode yang sudah ada. '
              + 'Satu tanggal harus jatuh di TEPAT SATU periode — kalau tidak, '
              + '"apakah tanggal ini terkunci?" punya dua jawaban.',
          })
        }
        request.log.error({ err: error }, 'gagal membuat periode')
        return reply.status(400).send({ error: error.message })
      }

      // Hasilnya DIPERIKSA: riwayat yang gagal ditulis diam-diam membuat
      // periode ada tanpa jejak pembuatannya, dan `audit-tulis-tanpa-periksa`
      // menangkapnya. Untuk riwayat penguncian, kegagalan senyap adalah
      // persis yang dilarang §4 migrasi 294.
      const { error: eRiwayat } = await request.db!
        .viaProject('periode_akuntansi_riwayat', data!.id as string)
        .insert({
          periode_id: data!.id,
          tindakan: 'dibuat',
          oleh: request.currentUser!.id,
        })
      if (eRiwayat) {
        request.log.error({ err: eRiwayat, id: data!.id }, 'riwayat pembuatan periode gagal ditulis')
        return reply.status(500).send({
          error: 'Periode dibuat, TETAPI riwayatnya gagal dicatat. Laporkan ini.',
        })
      }

      await logAuditEvent(request, {
        action: 'INSERT',
        actorId: request.currentUser!.id,
        tableName: 'periode_akuntansi',
        recordId: data!.id as string,
        newValues: data as Record<string, unknown>,
      })
      return reply.status(201).send({ periode: data })
    },
  )

  // ── POST /gl/periode/:id/tutup ───────────────────────────────────────────
  //
  // Status lama WAJIB ikut di WHERE (penjaga `audit-klaim-status-atomik`):
  // dua permintaan bersamaan tak boleh keduanya "berhasil menutup", karena
  // riwayatnya akan mencatat dua penutupan untuk satu periode.
  app.post<{ Params: { id: string }; Body: { catatan?: string } }>(
    '/api/v1/gl/periode/:id/tutup',
    { preHandler: [authenticate, requirePermission('gl:periode:manage')] },
    async (request, reply) => {
      const { id } = request.params

      const { data: p, error: eP } = await request.db!
        .from('periode_akuntansi')
        .select('id, nama, tanggal_mulai, tanggal_akhir, status, ditutup_pada, dibuka_ulang')
        .eq('id', id)
        .maybeSingle()
      if (eP) {
        request.log.error({ err: eP, id }, 'gagal memuat periode')
        return reply.status(500).send({ error: 'Gagal memuat periode' })
      }
      if (!p) return reply.status(404).send({ error: 'Periode tidak ditemukan' })

      const periode = p as unknown as Periode
      if (periode.status === 'tertutup') {
        return reply.status(422).send({ error: 'Periode ini sudah tertutup' })
      }

      const isi = await hitungIsi(request.db!, periode.tanggal_mulai, periode.tanggal_akhir)
      if ('galat' in isi) {
        request.log.error({ err: isi.galat, id }, 'gagal menghitung isi periode')
        return reply.status(500).send({ error: 'Gagal menghitung isi periode' })
      }

      const { data: sebelum, error: eS } = await request.db!
        .from('periode_akuntansi')
        .select('nama')
        .lt('tanggal_mulai', periode.tanggal_mulai)
        .eq('status', 'terbuka')
        .order('tanggal_mulai', { ascending: true })
        .limit(1)
      if (eS) return reply.status(500).send({ error: eS.message })

      const namaSebelum = (sebelum ?? [])[0]?.nama as string | undefined
      const kesiapan = periksaKesiapan(periode, isi, namaSebelum ?? null)

      // PENGHALANG menolak; peringatan tidak. Yang menutup sudah melihat
      // peringatannya di layar kesiapan sebelum menekan tombol.
      if (kesiapan.boleh === false) {
        const halangan = kesiapan.masalah.filter((m) => m.berat === 'penghalang')
        return reply.status(422).send({
          error: halangan.map((m) => m.pesan).join(' '),
          masalah: kesiapan.masalah,
        })
      }

      const { data, error } = await request.db!
        .from('periode_akuntansi')
        .update({
          status: 'tertutup',
          ditutup_pada: new Date().toISOString(),
          ditutup_oleh: request.currentUser!.id,
          catatan_tutup: request.body?.catatan?.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('status', 'terbuka')
        .select(PERIODE_SELECT)
        .maybeSingle()

      if (error) {
        request.log.error({ err: error, id }, 'gagal menutup periode')
        return reply.status(400).send({ error: error.message })
      }
      if (!data) {
        return reply.status(409).send({
          error: 'Periode sudah ditutup lebih dulu oleh orang lain. '
            + 'Muat ulang halamannya sebelum mencoba lagi.',
        })
      }

      // Sama seperti pembukaan: penutupan tanpa jejak tak boleh didiamkan.
      // Yang membedakan penutupan dari pembukaan hanyalah seberapa sering
      // terjadi — bukan seberapa penting jejaknya.
      const { error: eRiwayat } = await request.db!
        .viaProject('periode_akuntansi_riwayat', id)
        .insert({
          periode_id: id,
          tindakan: 'ditutup',
          alasan: request.body?.catatan?.trim() || null,
          oleh: request.currentUser!.id,
          jurnal_posted: isi.posted,
        })
      // ⚠ MUTASI TAK BISA MERAH DI SINI, dan itu dinyatakan bukan
      // disembunyikan: cabang ini hanya berjalan bila INSERT riwayat gagal
      // padahal periodenya sudah berubah — keadaan yang tak bisa dipicu dari
      // test integrasi tanpa memalsukan basis (mematikan trigger, mencabut
      // hak tabel, atau menyuntik galat lewat mock).
      //
      // Ketiganya DITOLAK: yang pertama melemahkan Ember [C]; yang kedua
      // mengubah keadaan basis bersama; yang ketiga mengubah test integrasi
      // jadi test mock, sehingga ia berhenti menguji basis yang sebenarnya.
      //
      // Yang menjaga perilakunya: penjaga `audit-tulis-tanpa-periksa` yang
      // MERAH bila `if (eRiwayat)` dihapus seluruhnya — ia menangkap
      // kelasnya, bukan cabangnya.
      if (eRiwayat) {
        request.log.error({ err: eRiwayat, id }, 'GAWAT: periode ditutup tetapi riwayatnya gagal ditulis')
        return reply.status(500).send({
          error: 'Periode tertutup, TETAPI riwayatnya gagal dicatat. '
            + 'Laporkan ini — penutupan tanpa jejak tak boleh dibiarkan.',
        })
      }

      await logAuditEvent(request, {
        action: 'UPDATE',
        actorId: request.currentUser!.id,
        tableName: 'periode_akuntansi',
        recordId: id,
        oldValues: p as Record<string, unknown>,
        newValues: data as Record<string, unknown>,
      })
      return reply.send({ periode: data, isi })
    },
  )

  // ── POST /gl/periode/:id/buka ────────────────────────────────────────────
  //
  // Capability TERPISAH (`gl:periode:reopen`, hanya direktur). Lihat kepala
  // berkas.
  app.post<{ Params: { id: string }; Body: { alasan?: string } }>(
    '/api/v1/gl/periode/:id/buka',
    { preHandler: [authenticate, requirePermission('gl:periode:reopen')] },
    async (request, reply) => {
      const { id } = request.params
      const alasan = request.body?.alasan ?? ''

      const { data: p, error: eP } = await request.db!
        .from('periode_akuntansi')
        .select('id, nama, tanggal_mulai, tanggal_akhir, status, ditutup_pada, dibuka_ulang')
        .eq('id', id)
        .maybeSingle()
      if (eP) {
        request.log.error({ err: eP, id }, 'gagal memuat periode')
        return reply.status(500).send({ error: 'Gagal memuat periode' })
      }
      if (!p) return reply.status(404).send({ error: 'Periode tidak ditemukan' })

      const izin = bolehBukaKembali(p as unknown as Periode, alasan)
      if (!izin.boleh) return reply.status(422).send({ error: izin.galat })

      // Jumlah jurnal SAAT DIBUKA — supaya bisa dibandingkan dengan jumlah
      // saat ditutup nanti. Periode yang ditutup dengan 40 jurnal lalu dibuka
      // dan ditutup lagi dengan 37 kehilangan tiga, dan itu harus terlihat.
      const periode = p as unknown as Periode
      const isi = await hitungIsi(request.db!, periode.tanggal_mulai, periode.tanggal_akhir)
      if ('galat' in isi) {
        request.log.error({ err: isi.galat, id }, 'gagal menghitung isi periode')
        return reply.status(500).send({ error: 'Gagal menghitung isi periode' })
      }

      const { data, error } = await request.db!
        .from('periode_akuntansi')
        .update({
          status: 'terbuka',
          dibuka_ulang: (periode.dibuka_ulang ?? 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('status', 'tertutup')
        .select(PERIODE_SELECT)
        .maybeSingle()

      if (error) {
        request.log.error({ err: error, id }, 'gagal membuka periode')
        return reply.status(400).send({ error: error.message })
      }
      if (!data) {
        return reply.status(409).send({
          error: 'Periode sudah dibuka lebih dulu oleh orang lain. '
            + 'Muat ulang halamannya sebelum mencoba lagi.',
        })
      }

      // Riwayat DULU kalau bisa — tetapi ia append-only dan tak bisa
      // dibatalkan, jadi ditulis SESUDAH perubahannya berhasil. Yang penting:
      // tak ada jalan membuka periode tanpa barisnya tercatat, karena
      // keduanya di rute yang sama dan riwayatnya wajib.
      const { error: eR } = await request.db!
        .viaProject('periode_akuntansi_riwayat', id)
        .insert({
          periode_id: id,
          tindakan: 'dibuka_ulang',
          alasan: alasan.trim(),
          oleh: request.currentUser!.id,
          jurnal_posted: isi.posted,
        })
      if (eR) {
        // Riwayat gagal ditulis padahal periodenya sudah terbuka: itu
        // keadaan yang TIDAK BOLEH didiamkan — pembukaan tanpa jejak persis
        // yang dilarang §4 migrasi 294.
        request.log.error({ err: eR, id }, 'GAWAT: periode dibuka tetapi riwayatnya gagal ditulis')
        return reply.status(500).send({
          error: 'Periode terbuka, TETAPI riwayatnya gagal dicatat. '
            + 'Laporkan ini — pembukaan periode tanpa jejak tak boleh dibiarkan.',
        })
      }

      await logAuditEvent(request, {
        action: 'UPDATE',
        actorId: request.currentUser!.id,
        tableName: 'periode_akuntansi',
        recordId: id,
        oldValues: p as Record<string, unknown>,
        newValues: data as Record<string, unknown>,
      })
      return reply.send({ periode: data })
    },
  )

  // ── GET /gl/periode/:id/riwayat ──────────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    '/api/v1/gl/periode/:id/riwayat',
    { preHandler: [authenticate, requirePermission('gl:periode:view')] },
    async (request, reply) => {
      const { id } = request.params

      const { data: p, error: eP } = await request.db!
        .from('periode_akuntansi').select('id').eq('id', id).maybeSingle()
      if (eP) return reply.status(500).send({ error: eP.message })
      if (!p) return reply.status(404).send({ error: 'Periode tidak ditemukan' })

      // ⚠ `periode_akuntansi_riwayat` kategori C lewat `periode_id`.
      const { data, error } = await request.db!
        .viaProject('periode_akuntansi_riwayat', id)
        .select('id, tindakan, alasan, pada, jurnal_posted, pelaku:users ( id, name )')
        .order('pada', { ascending: false })
        .limit(200)
      if (error) {
        request.log.error({ err: error, id }, 'gagal memuat riwayat periode')
        return reply.status(500).send({ error: 'Gagal memuat riwayat periode' })
      }

      return reply.send({ riwayat: data ?? [] })
    },
  )
}
