import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import {
  usulkanPencocokan, hitungLaporan, sidikBaris,
  type BarisKoran, type TransaksiBuku, type SumberBuku,
} from '../../lib/rekonsiliasi-bank.js'

/**
 * REKONSILIASI BANK — mencocokkan buku kas dengan rekening koran.
 *
 * ── Cacat yang ditutup
 *
 * Diukur 2026-08-07: nol tabel rekonsiliasi, sementara basis sudah memuat 33
 * transaksi kas nyata di 5 rekening. Tanpa alat ini, orang keuangan tetap
 * memakai Excel tiap akhir bulan — dan pertanyaan "lalu untuk apa saya
 * membayar sistem ini?" muncul di demo.
 *
 * ── Yang dicari BUKAN yang cocok
 *
 * Yang menjual modul ini adalah baris yang TIDAK cocok: setoran yang belum
 * masuk rekening, cek yang belum dicairkan, biaya admin yang tak pernah
 * dicatat, dan yang paling mahal — uang keluar dari rekening tanpa satu pun
 * catatan.
 *
 * ── Tenancy
 *
 * `rekening_koran`, `pencocokan_bank`, `penyesuaian_rekonsiliasi` kategori B
 * (punya `company_id` sendiri). `rekening_koran_baris` kategori C — mewarisi
 * lewat `koran_id`, jadi diakses dengan join ke induknya, bukan `eq(company_id)`
 * yang kolomnya memang tak ada.
 */
export default async function rekonsiliasiBankRoutes(app: FastifyInstance) {
  // ── GET /api/v1/rekonsiliasi ─────────────────────────────────────────────
  //
  // Daftar koran yang sudah diimpor, dengan ringkasan seberapa tuntas.
  app.get('/api/v1/rekonsiliasi', {
    preHandler: [authenticate, requirePermission('rekonsiliasi:view')],
  }, async (request, reply) => {
    const db = request.db!

    const { data: koran, error: eKoran } = await db
      .from('rekening_koran')
      .select('id, cash_account_id, periode_dari, periode_sampai, saldo_awal, saldo_akhir, status, dikunci_pada, nama_berkas, created_at')
      .order('periode_dari', { ascending: false })
      .limit(200)

    if (eKoran) return reply.status(500).send({ error: eKoran.message })

    const { data: akun, error: eAkun } = await db
      .from('cash_accounts')
      .select('id, name, type, balance')

    if (eAkun) return reply.status(500).send({ error: eAkun.message })

    const daftar = (koran ?? []) as Array<Record<string, unknown>>
    const petaAkun = new Map(
      ((akun ?? []) as Array<Record<string, unknown>>).map((a) => [a.id as string, a]))

    // Jumlah baris & yang sudah cocok, per koran. Dihitung sekali untuk
    // seluruh daftar — bukan satu query per baris.
    const idKoran = daftar.map((k) => k.id as string)
    let baris: Array<Record<string, unknown>> = []
    let cocok: Array<Record<string, unknown>> = []

    if (idKoran.length > 0) {
      const { data: b, error: eB } = await db
        .unsafe('rekening_koran_baris', 'kategori C; disaring lewat koran_id milik tenant')
        .select('id, koran_id')
        .in('koran_id', idKoran)
      if (eB) return reply.status(500).send({ error: eB.message })
      baris = (b ?? []) as Array<Record<string, unknown>>

      const { data: c, error: eC } = await db
        .from('pencocokan_bank')
        .select('baris_id')
      if (eC) return reply.status(500).send({ error: eC.message })
      cocok = (c ?? []) as Array<Record<string, unknown>>
    }

    const sudahCocok = new Set(cocok.map((c) => c.baris_id as string))
    const perKoran = new Map<string, { total: number; cocok: number }>()
    for (const b of baris) {
      const k = b.koran_id as string
      const e = perKoran.get(k) ?? { total: 0, cocok: 0 }
      e.total++
      if (sudahCocok.has(b.id as string)) e.cocok++
      perKoran.set(k, e)
    }

    return {
      koran: daftar.map((k) => {
        const h = perKoran.get(k.id as string) ?? { total: 0, cocok: 0 }
        const a = petaAkun.get(k.cash_account_id as string)
        return {
          ...k,
          nama_akun: (a?.name as string) ?? '—',
          jumlah_baris: h.total,
          jumlah_cocok: h.cocok,
          // Belum cocok DISEBUTKAN, bukan disembunyikan di balik persentase.
          // "92% selesai" terdengar hampir beres; "8 baris belum berpasangan"
          // memberi tahu berapa banyak pekerjaan tersisa.
          belum_cocok: h.total - h.cocok,
        }
      }),
      akun: (akun ?? []),
    }
  })

  // ── GET /api/v1/rekonsiliasi/:id ─────────────────────────────────────────
  //
  // Satu koran beserta pembanding buku dan laporan 4-barisnya.
  app.get<{ Params: { id: string } }>('/api/v1/rekonsiliasi/:id', {
    preHandler: [authenticate, requirePermission('rekonsiliasi:view')],
  }, async (request, reply) => {
    const db = request.db!
    const { id } = request.params

    const { data: koran, error: eKoran } = await db
      .from('rekening_koran')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (eKoran) return reply.status(500).send({ error: eKoran.message })
    if (!koran) return reply.status(404).send({ error: 'Rekening koran tidak ditemukan' })

    const k = koran as Record<string, unknown>
    const akunId = k.cash_account_id as string
    const dari = k.periode_dari as string
    const sampai = k.periode_sampai as string

    const { data: barisRaw, error: eB } = await db
      .unsafe('rekening_koran_baris', 'kategori C; koran_id sudah terbukti milik tenant di query di atas')
      .select('id, tanggal, keterangan, debit, kredit, saldo, ref_bank, urutan')
      .eq('koran_id', id)
      .order('tanggal', { ascending: true })
    if (eB) return reply.status(500).send({ error: eB.message })

    const { data: cocokRaw, error: eC } = await db
      .from('pencocokan_bank')
      .select('id, baris_id, sumber_tabel, sumber_id, jenis')
    if (eC) return reply.status(500).send({ error: eC.message })

    const { data: sesuaiRaw, error: eS } = await db
      .from('penyesuaian_rekonsiliasi')
      .select('id, jenis, keterangan, nominal')
      .eq('koran_id', id)
    if (eS) return reply.status(500).send({ error: eS.message })

    // ── Transaksi buku pada periode & rekening yang sama ───────────────────
    //
    // Tiga sumber, tiga bentuk. Arah nominal DITETAPKAN DI SINI, bukan di
    // pustaka: pustaka menerima "positif = masuk" dan tak perlu tahu bahwa
    // `supplier_payments` selalu keluar.
    const { data: bayarMasuk, error: e1 } = await db
      .unsafe('payments', 'kategori C lewat invoice_id; disaring cash_account_id + periode')
      .select('id, amount_paid, paid_at, ref_number, bank_name, notes')
      .eq('cash_account_id', akunId)
      .gte('paid_at', dari)
      .lte('paid_at', sampai)
    if (e1) return reply.status(500).send({ error: e1.message })

    const { data: bayarKeluar, error: e2 } = await db
      .from('supplier_payments')
      .select('id, amount, payment_date, reference_number, notes')
      .eq('cash_account_id', akunId)
      .gte('payment_date', dari)
      .lte('payment_date', sampai)
    if (e2) return reply.status(500).send({ error: e2.message })

    const { data: transferRaw, error: e3 } = await db
      .from('cash_transfers')
      .select('id, from_account_id, to_account_id, amount, transfer_date, ref_number, notes')
      .gte('transfer_date', dari)
      .lte('transfer_date', sampai)
    if (e3) return reply.status(500).send({ error: e3.message })

    const buku: TransaksiBuku[] = []
    for (const p of ((bayarMasuk ?? []) as Array<Record<string, unknown>>)) {
      buku.push({
        id: p.id as string, sumber: 'payments',
        tanggal: String(p.paid_at).slice(0, 10),
        nominal: p.amount_paid as string,
        keterangan: [p.ref_number, p.bank_name, p.notes].filter(Boolean).join(' · ') || 'Penerimaan',
      })
    }
    for (const p of ((bayarKeluar ?? []) as Array<Record<string, unknown>>)) {
      buku.push({
        id: p.id as string, sumber: 'supplier_payments',
        tanggal: String(p.payment_date).slice(0, 10),
        // Pembayaran ke pemasok selalu KELUAR — tandanya ditetapkan di sini.
        nominal: -Number(p.amount),
        keterangan: [p.reference_number, p.notes].filter(Boolean).join(' · ') || 'Bayar pemasok',
      })
    }
    for (const t of ((transferRaw ?? []) as Array<Record<string, unknown>>)) {
      // Satu pemindahan menyentuh DUA rekening dengan arah berlawanan. Yang
      // masuk ke koran ini hanya sisi yang menyangkut rekeningnya.
      const masuk = t.to_account_id === akunId
      const keluar = t.from_account_id === akunId
      if (!masuk && !keluar) continue
      buku.push({
        id: t.id as string, sumber: 'cash_transfers',
        tanggal: String(t.transfer_date).slice(0, 10),
        nominal: masuk ? Number(t.amount) : -Number(t.amount),
        keterangan: [t.ref_number, t.notes].filter(Boolean).join(' · ')
          || (masuk ? 'Transfer masuk' : 'Transfer keluar'),
      })
    }

    const cocok = (cocokRaw ?? []) as Array<Record<string, unknown>>
    const barisCocok = new Set(cocok.map((c) => c.baris_id as string))
    const bukuCocok = new Set(cocok.map((c) => `${c.sumber_tabel}:${c.sumber_id}`))

    const barisKoran: BarisKoran[] = ((barisRaw ?? []) as Array<Record<string, unknown>>)
      .map((b) => ({
        id: b.id as string,
        tanggal: String(b.tanggal).slice(0, 10),
        keterangan: b.keterangan as string,
        debit: b.debit as string,
        kredit: b.kredit as string,
        sudah_cocok: barisCocok.has(b.id as string),
      }))

    for (const t of buku) t.sudah_cocok = bukuCocok.has(`${t.sumber}:${t.id}`)

    const belumCocokBuku = buku.filter((t) => !t.sudah_cocok)
    const penyesuaian = ((sesuaiRaw ?? []) as Array<Record<string, unknown>>)
      .map((s) => ({ jenis: s.jenis as string, nominal: s.nominal as string }))

    // Saldo buku diambil dari rekeningnya, bukan dihitung dari transaksi yang
    // kebetulan masuk periode ini — kalau dihitung sendiri, ia akan selalu
    // cocok dan rekonsiliasinya tak membuktikan apa pun.
    const { data: akun, error: eA } = await db
      .from('cash_accounts')
      .select('id, name, balance')
      .eq('id', akunId)
      .maybeSingle()
    if (eA) return reply.status(500).send({ error: eA.message })

    const laporan = hitungLaporan(
      k.saldo_akhir as string,
      (akun as Record<string, unknown> | null)?.balance as string ?? 0,
      barisKoran, belumCocokBuku, penyesuaian,
    )

    return {
      koran: { ...k, nama_akun: (akun as Record<string, unknown> | null)?.name ?? '—' },
      baris: barisKoran,
      buku,
      pencocokan: cocok,
      penyesuaian: sesuaiRaw ?? [],
      usul: usulkanPencocokan(barisKoran, buku),
      laporan,
    }
  })

  // ── POST /api/v1/rekonsiliasi ────────────────────────────────────────────
  //
  // Impor koran beserta barisnya. Satu panggilan, karena koran tanpa baris
  // tak berguna dan menyisakannya setengah jadi membuat daftar penuh entri
  // kosong yang tak seorang pun tahu harus diapakan.
  app.post<{
    Body: {
      cash_account_id: string
      periode_dari: string
      periode_sampai: string
      saldo_awal: number
      saldo_akhir: number
      nama_berkas?: string
      baris: Array<{ tanggal: string; keterangan: string; debit?: number; kredit?: number; saldo?: number; ref_bank?: string }>
    }
  }>('/api/v1/rekonsiliasi', {
    preHandler: [authenticate, requirePermission('rekonsiliasi:manage')],
  }, async (request, reply) => {
    const db = request.db!
    const b = request.body

    if (!b?.cash_account_id || !b.periode_dari || !b.periode_sampai) {
      return reply.status(400).send({ error: 'Rekening dan periode wajib diisi' })
    }
    if (!Array.isArray(b.baris) || b.baris.length === 0) {
      return reply.status(400).send({ error: 'Koran tanpa baris tak bisa diimpor' })
    }

    const companyId = request.companyId!

    const { data: koran, error: eKoran } = await db
      .from('rekening_koran')
      .insert({
        company_id: companyId,
        cash_account_id: b.cash_account_id,
        periode_dari: b.periode_dari,
        periode_sampai: b.periode_sampai,
        saldo_awal: b.saldo_awal ?? 0,
        saldo_akhir: b.saldo_akhir ?? 0,
        nama_berkas: b.nama_berkas ?? null,
        diimpor_oleh: request.currentUser!.id,
      })
      .select('id')
      .single()

    if (eKoran) {
      // 23505 = periode ganda untuk rekening yang sama. Pesannya dijelaskan,
      // bukan diteruskan mentah — "duplicate key value violates unique
      // constraint" tak memberi tahu apa yang harus dilakukan.
      if ((eKoran as { code?: string }).code === '23505') {
        return reply.status(409).send({
          error: 'Koran untuk rekening & periode ini sudah pernah diimpor. Hapus yang lama dulu, atau pilih periode lain.',
        })
      }
      return reply.status(500).send({ error: eKoran.message })
    }

    const koranId = (koran as { id: string }).id

    const barisIsi = b.baris.map((r, i) => ({
      koran_id: koranId,
      tanggal: r.tanggal,
      keterangan: r.keterangan,
      debit: r.debit ?? 0,
      kredit: r.kredit ?? 0,
      saldo: r.saldo ?? null,
      ref_bank: r.ref_bank ?? null,
      hash_baris: sidikBaris(r.tanggal, r.keterangan, r.debit ?? 0, r.kredit ?? 0, i),
      urutan: i,
    }))

    const { error: eBaris } = await db
      .unsafe('rekening_koran_baris', 'kategori C; koran_id baru saja dibuat untuk tenant ini')
      .insert(barisIsi)

    if (eBaris) {
      // Baris gagal masuk berarti koran ini setengah jadi. Membiarkannya
      // menghasilkan entri kosong yang terlihat sah di daftar.
      //
      // Hasil hapusnya DIPERIKSA, bukan diabaikan: ini jalur pemulihan, dan
      // pemulihan yang gagal DIAM meninggalkan persis benda yang sedang
      // dicegah — koran kosong yang tak seorang pun tahu harus diapakan.
      // Tak ada transaksi lintas-tabel lewat PostgREST, jadi yang bisa
      // dijamin bukan keberhasilannya melainkan bahwa kegagalannya terbaca.
      const { error: eBatal } = await db.from('rekening_koran').delete().eq('id', koranId)
      return reply.status(400).send({
        error: [
          `Baris koran ditolak: ${eBaris.message}. Impor dibatalkan seluruhnya.`,
          eBatal && `PERHATIAN: koran ${koranId} gagal dihapus dan mungkin tertinggal kosong — hapus manual. (${eBatal.message})`,
        ].filter(Boolean).join(' '),
      })
    }

    return reply.status(201).send({ id: koranId, jumlah_baris: barisIsi.length })
  })

  // ── POST /api/v1/rekonsiliasi/:id/cocokkan ───────────────────────────────
  app.post<{
    Params: { id: string }
    Body: { baris_id: string; sumber_tabel: SumberBuku; sumber_id: string; jenis?: 'otomatis' | 'manual' }
  }>('/api/v1/rekonsiliasi/:id/cocokkan', {
    preHandler: [authenticate, requirePermission('rekonsiliasi:manage')],
  }, async (request, reply) => {
    const db = request.db!
    const b = request.body

    if (!b?.baris_id || !b.sumber_tabel || !b.sumber_id) {
      return reply.status(400).send({ error: 'baris_id, sumber_tabel, dan sumber_id wajib diisi' })
    }

    const terkunci = await koranTerkunci(db, request.params.id)
    if (terkunci) return reply.status(409).send({ error: terkunci })

    const companyId = request.companyId!

    const { data, error } = await db
      .from('pencocokan_bank')
      .insert({
        company_id: companyId,
        baris_id: b.baris_id,
        sumber_tabel: b.sumber_tabel,
        sumber_id: b.sumber_id,
        jenis: b.jenis ?? 'manual',
        dicocokkan_oleh: request.currentUser!.id,
      })
      .select('id')
      .single()

    if (error) {
      if ((error as { code?: string }).code === '23505') {
        return reply.status(409).send({
          error: 'Baris koran atau transaksi ini sudah dicocokkan. Lepaskan dulu pencocokan lamanya.',
        })
      }
      return reply.status(500).send({ error: error.message })
    }

    return reply.status(201).send({ id: (data as { id: string }).id })
  })

  // ── DELETE /api/v1/rekonsiliasi/:id/cocokkan/:cocokId ────────────────────
  app.delete<{ Params: { id: string; cocokId: string } }>(
    '/api/v1/rekonsiliasi/:id/cocokkan/:cocokId', {
      preHandler: [authenticate, requirePermission('rekonsiliasi:manage')],
    }, async (request, reply) => {
      const db = request.db!

      const terkunci = await koranTerkunci(db, request.params.id)
      if (terkunci) return reply.status(409).send({ error: terkunci })

      const { data, error } = await db
        .from('pencocokan_bank')
        .delete()
        .eq('id', request.params.cocokId)
        .select('id')

      if (error) return reply.status(500).send({ error: error.message })
      if (!data || (data as unknown[]).length === 0) {
        return reply.status(404).send({ error: 'Pencocokan tidak ditemukan' })
      }
      return { dilepas: true }
    })

  // ── POST /api/v1/rekonsiliasi/:id/penyesuaian ────────────────────────────
  app.post<{
    Params: { id: string }
    Body: { jenis: string; keterangan: string; nominal: number }
  }>('/api/v1/rekonsiliasi/:id/penyesuaian', {
    preHandler: [authenticate, requirePermission('rekonsiliasi:manage')],
  }, async (request, reply) => {
    const db = request.db!
    const b = request.body

    if (!b?.jenis || !b.keterangan || b.nominal === undefined) {
      return reply.status(400).send({ error: 'jenis, keterangan, dan nominal wajib diisi' })
    }

    const terkunci = await koranTerkunci(db, request.params.id)
    if (terkunci) return reply.status(409).send({ error: terkunci })

    const companyId = request.companyId!

    const { data, error } = await db
      .from('penyesuaian_rekonsiliasi')
      .insert({
        company_id: companyId,
        koran_id: request.params.id,
        jenis: b.jenis,
        keterangan: b.keterangan,
        nominal: b.nominal,
        dicatat_oleh: request.currentUser!.id,
      })
      .select('id')
      .single()

    if (error) {
      if ((error as { code?: string }).code === '23514') {
        return reply.status(400).send({
          error: 'Penyesuaian ditolak: nominal tak boleh nol, dan jenis "lainnya" wajib berketerangan minimal 10 huruf.',
        })
      }
      return reply.status(500).send({ error: error.message })
    }

    return reply.status(201).send({ id: (data as { id: string }).id })
  })

  // ── POST /api/v1/rekonsiliasi/:id/kunci ──────────────────────────────────
  //
  // Mengunci = menyatakan angkanya berhenti bisa berubah. Permission
  // TERPISAH dari `manage`: yang mencocokkan sehari-hari belum tentu yang
  // berwenang menyatakan periode selesai.
  app.post<{ Params: { id: string } }>('/api/v1/rekonsiliasi/:id/kunci', {
    preHandler: [authenticate, requirePermission('rekonsiliasi:lock')],
  }, async (request, reply) => {
    const db = request.db!

    const { data, error } = await db
      .from('rekening_koran')
      .update({
        status: 'dikunci',
        dikunci_pada: new Date().toISOString(),
        dikunci_oleh: request.currentUser!.id,
      })
      .eq('id', request.params.id)
      .eq('status', 'terbuka')
      .select('id')

    if (error) return reply.status(500).send({ error: error.message })
    if (!data || (data as unknown[]).length === 0) {
      // Nol baris terpengaruh punya dua sebab, dan keduanya perlu dibedakan:
      // koran tak ada, atau sudah dikunci sebelumnya.
      return reply.status(409).send({
        error: 'Koran tidak ditemukan atau sudah dikunci sebelumnya.',
      })
    }
    return { dikunci: true }
  })
}

/**
 * `null` bila koran boleh diubah; pesan bila tidak.
 *
 * Rekonsiliasi yang sudah dikunci lalu masih bisa diubah bukan rekonsiliasi —
 * angka yang sudah dilaporkan harus berhenti bergerak. Diperiksa di setiap
 * jalur yang mengubah, bukan sekali di UI.
 */
async function koranTerkunci(
  db: NonNullable<import('fastify').FastifyRequest['db']>,
  koranId: string,
): Promise<string | null> {
  const { data, error } = await db
    .from('rekening_koran')
    .select('status')
    .eq('id', koranId)
    .maybeSingle()

  if (error) return `Gagal memeriksa status koran: ${error.message}`
  if (!data) return 'Rekening koran tidak ditemukan'
  if ((data as { status: string }).status === 'dikunci') {
    return 'Rekonsiliasi periode ini sudah dikunci — angkanya tak bisa diubah lagi.'
  }
  return null
}
