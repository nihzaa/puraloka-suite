import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'
import { hitungNeraca, hitungLabaRugi, type SaldoAkun } from '../../lib/laporan-keuangan.js'

// ═════════════════════════════════════════════════════════════════════════════
// GL-1c — Chart of Accounts, jurnal manual, buku besar.
//
// ── Yang TIDAK dilakukan di sini
//
// Keseimbangan debit=kredit, immutability jurnal posted, dan larangan memakai
// akun badan usaha lain SEMUANYA ditegakkan trigger database (migrasi 168),
// bukan di lapisan ini. Alasannya bukan gaya: siapa pun bisa menulis ke tabel
// — API, migrasi, skrip perbaikan yang dijalankan sekali lalu dilupakan.
//
// Lapisan ini menerjemahkan kegagalan itu jadi pesan yang bisa dibaca orang,
// bukan menggantikannya. Kalau suatu hari trigger-nya hilang, pemeriksaan di
// sini TIDAK akan menyelamatkan — dan itu memang tak boleh disamarkan.
//
// ── Kenapa `viaCompany`, bukan `viaProject`
//
// Buku besar milik BADAN USAHA. `project_id` di baris jurnal adalah dimensi
// laporan, bukan jalur tenancy — satu jurnal bisa menyentuh beberapa proyek
// (bayar gaji kantor) atau tak menyentuh proyek sama sekali.
// ═════════════════════════════════════════════════════════════════════════════

type BarisInput = {
  account_id: string
  debit?: number
  credit?: number
  project_id?: string | null
  description?: string | null
}

/** Terjemahkan pelanggaran trigger jadi pesan yang bisa dipahami pengguna. */
function pesanRamah(err: { message?: string } | null): string {
  const m = err?.message ?? 'Kesalahan tak dikenal'
  if (/tak seimbang/i.test(m)) return m                       // sudah berbahasa manusia
  if (/minimal 2|hanya \d+ baris/i.test(m)) return m
  if (/sudah di-posting/i.test(m)) return m
  if (/badan usaha lain/i.test(m)) return m
  if (/jel_debit_xor_credit/i.test(m)) {
    return 'Setiap baris harus mengisi debit ATAU kredit — tak boleh keduanya, tak boleh kosong.'
  }
  if (/accounts_code_unik_per_company|duplicate key/i.test(m)) {
    return 'Kode akun itu sudah dipakai di badan usaha ini.'
  }
  return m
}

export default async function glRoutes(app: FastifyInstance) {
  // ══ CHART OF ACCOUNTS ═════════════════════════════════════════════════════

  app.get(
    '/api/v1/gl/accounts',
    { preHandler: [authenticate, requirePermission('gl:view')] },
    async (request, reply) => {
      const { data, error } = await request.db!
        .from('accounts')
        .select('id, code, name, type, parent_id, is_active, description')
        .order('code', { ascending: true })

      if (error) return reply.status(500).send({ error: error.message })
      return { data: data ?? [] }
    },
  )

  app.post<{ Body: { code: string; name: string; type: string; parent_id?: string | null; description?: string | null } }>(
    '/api/v1/gl/accounts',
    { preHandler: [authenticate, requirePermission('gl:manage')] },
    async (request, reply) => {
      const b = request.body
      if (!b?.code?.trim() || !b?.name?.trim() || !b?.type) {
        return reply.status(400).send({ error: 'code, name, dan type wajib diisi' })
      }

      // Induk WAJIB milik badan usaha yang sama. `viaCompany` sudah menyaring,
      // jadi induk tenant lain memulangkan nol baris → 404, bukan tersimpan
      // diam-diam dengan induk yang tak terlihat.
      if (b.parent_id) {
        const { data: induk } = await request.db!
          .from('accounts').select('id, type').eq('id', b.parent_id).maybeSingle()
        if (!induk) return reply.status(404).send({ error: 'Akun induk tidak ditemukan' })
        if (induk.type !== b.type) {
          return reply.status(400).send({
            error: `Tipe akun harus sama dengan induknya (${induk.type}). Induk bertipe beda ` +
                   'membuat laporan menjumlahkan aset ke dalam beban.',
          })
        }
      }

      const { data, error } = await request.db!
        .from('accounts')
        .insert({
          code: b.code.trim(),
          name: b.name.trim(),
          type: b.type,
          parent_id: b.parent_id ?? null,
          description: b.description ?? null,
          created_by: request.currentUser!.id,
        })
        .select('id, code, name, type, parent_id')
        .single()

      if (error) return reply.status(400).send({ error: pesanRamah(error) })

      void logAuditEvent(request, {
        tableName: 'accounts', recordId: data.id, action: 'gl.account_created',
        actorId: request.currentUser!.id, newValues: { code: data.code, name: data.name },
      })
      return reply.status(201).send({ data })
    },
  )

  // ══ JURNAL ════════════════════════════════════════════════════════════════

  app.get<{ Querystring: { status?: string; from?: string; to?: string } }>(
    '/api/v1/gl/journal-entries',
    { preHandler: [authenticate, requirePermission('gl:view')] },
    async (request, reply) => {
      const q = request.query
      let query = request.db!
        .from('journal_entries')
        .select('id, entry_number, entry_date, description, source, status, posted_at, notes')
        .order('entry_date', { ascending: false })
        .limit(200)

      if (q.status) query = query.eq('status', q.status)
      if (q.from) query = query.gte('entry_date', q.from)
      if (q.to) query = query.lte('entry_date', q.to)

      const { data, error } = await query
      if (error) return reply.status(500).send({ error: error.message })
      return { data: data ?? [] }
    },
  )

  app.get<{ Params: { id: string } }>(
    '/api/v1/gl/journal-entries/:id',
    { preHandler: [authenticate, requirePermission('gl:view')] },
    async (request, reply) => {
      const { data: kepala, error } = await request.db!
        .from('journal_entries')
        .select('id, entry_number, entry_date, description, source, status, posted_at, notes, ref_type, ref_id')
        .eq('id', request.params.id)
        .maybeSingle()

      if (error) return reply.status(500).send({ error: error.message })
      if (!kepala) return reply.status(404).send({ error: 'Jurnal tidak ditemukan' })

      // Baris dibaca lewat `unsafe`: tabelnya tak punya `company_id` sendiri
      // (mewarisi dari kepala), dan kepalanya SUDAH lewat saringan tenant di
      // atas — jadi id ini pasti milik tenant yang sedang login.
      const { data: baris, error: eBaris } = await request.db!
        .unsafe('journal_entry_lines', 'mewarisi tenancy dari kepala jurnal yang sudah tersaring di atas')
        .select('id, account_id, debit, credit, project_id, description, line_order, accounts(code, name, type)')
        .eq('entry_id', request.params.id)
        .order('line_order', { ascending: true })

      if (eBaris) return reply.status(500).send({ error: eBaris.message })
      return { data: { ...kepala, lines: baris ?? [] } }
    },
  )

  app.post<{ Body: { entry_date: string; description: string; notes?: string; lines: BarisInput[] } }>(
    '/api/v1/gl/journal-entries',
    { preHandler: [authenticate, requirePermission('gl:manage')] },
    async (request, reply) => {
      const b = request.body
      if (!b?.entry_date || !b?.description?.trim()) {
        return reply.status(400).send({ error: 'entry_date dan description wajib diisi' })
      }

      // Nomor jurnal per badan usaha, urut per tahun: JV-2026-0001.
      // Dihitung dari nomor TERTINGGI yang ada, bukan dari jumlah baris —
      // jurnal yang dihapus akan membuat hitungan-jumlah menabrak nomor lama.
      const tahun = new Date(b.entry_date).getFullYear()
      const { data: terakhir } = await request.db!
        .from('journal_entries')
        .select('entry_number')
        .like('entry_number', `JV-${tahun}-%`)
        .order('entry_number', { ascending: false })
        .limit(1)
        .maybeSingle()

      const urut = terakhir?.entry_number
        ? Number(String(terakhir.entry_number).split('-').pop()) + 1
        : 1
      const nomor = `JV-${tahun}-${String(urut).padStart(4, '0')}`

      const { data: kepala, error } = await request.db!
        .from('journal_entries')
        .insert({
          entry_number: nomor,
          entry_date: b.entry_date,
          description: b.description.trim(),
          notes: b.notes ?? null,
          created_by: request.currentUser!.id,
        })
        .select('id, entry_number, status')
        .single()

      if (error) return reply.status(400).send({ error: pesanRamah(error) })

      // Baris menyusul; jurnal boleh lahir kosong (draft dibangun bertahap).
      if (b.lines?.length) {
        const rows = b.lines.map((l, i) => ({
          entry_id: kepala.id,
          account_id: l.account_id,
          debit: l.debit ?? 0,
          credit: l.credit ?? 0,
          project_id: l.project_id ?? null,
          description: l.description ?? null,
          line_order: i,
        }))
        const { error: eBaris } = await request.db!
          .unsafe('journal_entry_lines', 'mewarisi tenancy dari kepala jurnal yang baru dibuat di atas')
          .insert(rows)

        if (eBaris) {
          // Kepala sudah tersimpan tapi barisnya gagal → jurnal kosong yang
          // terlihat sah di daftar. Dibersihkan, dan hasil pembersihannya
          // DIPERIKSA: rollback yang gagal diam-diam meninggalkan persis
          // jurnal hantu yang hendak dicegah.
          const { error: eRollback } = await request.db!
            .from('journal_entries').delete().eq('id', kepala.id)
          if (eRollback) {
            request.log.error(
              { eRollback, entryId: kepala.id, nomor },
              'Jurnal kosong gagal dibersihkan — tertinggal di daftar tanpa baris',
            )
          }
          return reply.status(400).send({ error: pesanRamah(eBaris) })
        }
      }

      void logAuditEvent(request, {
        tableName: 'journal_entries', recordId: kepala.id, action: 'gl.entry_created',
        actorId: request.currentUser!.id, newValues: { entry_number: nomor, lines: b.lines?.length ?? 0 },
      })
      return reply.status(201).send({ data: kepala })
    },
  )

  app.patch<{ Params: { id: string } }>(
    '/api/v1/gl/journal-entries/:id/post',
    { preHandler: [authenticate, requirePermission('gl:post')] },
    async (request, reply) => {
      const { data, error } = await request.db!
        .from('journal_entries')
        .update({
          status: 'posted',
          posted_at: new Date().toISOString(),
          posted_by: request.currentUser!.id,
        })
        .eq('id', request.params.id)
        .eq('status', 'draft')     // hanya draft yang bisa di-posting
        .select('id, entry_number, status')
        .maybeSingle()

      // Trigger `fn_gl_wajib_seimbang` menolak di sini kalau tak seimbang —
      // pesannya sudah berbahasa manusia, diteruskan apa adanya.
      if (error) return reply.status(400).send({ error: pesanRamah(error) })
      if (!data) {
        return reply.status(404).send({
          error: 'Jurnal tidak ditemukan atau statusnya bukan draft',
        })
      }

      void logAuditEvent(request, {
        tableName: 'journal_entries', recordId: data.id, action: 'gl.entry_posted',
        actorId: request.currentUser!.id, newValues: { entry_number: data.entry_number },
      })
      return { data }
    },
  )

  app.patch<{ Params: { id: string }; Body: { alasan?: string } }>(
    '/api/v1/gl/journal-entries/:id/void',
    { preHandler: [authenticate, requirePermission('gl:void')] },
    async (request, reply) => {
      const alasan = request.body?.alasan?.trim()
      if (!alasan) {
        return reply.status(400).send({
          error: 'Alasan pembatalan wajib diisi — pembatalan tanpa alasan tak bisa ditelusuri.',
        })
      }

      const { data: lama } = await request.db!
        .from('journal_entries').select('notes, entry_number').eq('id', request.params.id).maybeSingle()
      if (!lama) return reply.status(404).send({ error: 'Jurnal tidak ditemukan' })

      const { data, error } = await request.db!
        .from('journal_entries')
        .update({
          status: 'void',
          notes: `${lama.notes ? lama.notes + '\n' : ''}[DIBATALKAN] ${alasan}`,
        })
        .eq('id', request.params.id)
        .select('id, entry_number, status')
        .maybeSingle()

      if (error) return reply.status(400).send({ error: pesanRamah(error) })
      if (!data) return reply.status(404).send({ error: 'Jurnal tidak ditemukan' })

      void logAuditEvent(request, {
        tableName: 'journal_entries', recordId: data.id, action: 'gl.entry_voided',
        actorId: request.currentUser!.id, newValues: { entry_number: data.entry_number, alasan },
      })
      return { data }
    },
  )

  // ══ BUKU BESAR ════════════════════════════════════════════════════════════

  app.get<{ Querystring: { account_id?: string; from?: string; to?: string; project_id?: string } }>(
    '/api/v1/gl/ledger',
    { preHandler: [authenticate, requirePermission('gl:view')] },
    async (request, reply) => {
      const q = request.query

      // Hanya jurnal POSTED yang masuk buku besar. Draft belum sah; void sudah
      // dibatalkan. Memasukkan keduanya membuat saldo tak cocok dengan neraca.
      let query = request.db!
        .from('journal_entries')
        .select('id, entry_number, entry_date, description, journal_entry_lines(id, account_id, debit, credit, project_id, description, accounts(code, name, type))')
        .eq('status', 'posted')
        .order('entry_date', { ascending: true })
        .limit(500)

      if (q.from) query = query.gte('entry_date', q.from)
      if (q.to) query = query.lte('entry_date', q.to)

      const { data, error } = await query
      if (error) return reply.status(500).send({ error: error.message })

      // Ratakan jadi baris buku besar, saring per akun/proyek bila diminta.
      type Baris = {
        entry_id: string; entry_number: string; entry_date: string; description: string
        account_id: string; code: string; name: string
        debit: number; credit: number; project_id: string | null
      }
      const baris: Baris[] = []
      for (const je of (data ?? []) as Array<Record<string, unknown>>) {
        const lines = (je.journal_entry_lines ?? []) as Array<Record<string, unknown>>
        for (const l of lines) {
          if (q.account_id && l.account_id !== q.account_id) continue
          if (q.project_id && l.project_id !== q.project_id) continue
          const ak = (l.accounts ?? {}) as { code?: string; name?: string }
          baris.push({
            entry_id: je.id as string,
            entry_number: je.entry_number as string,
            entry_date: je.entry_date as string,
            description: je.description as string,
            account_id: l.account_id as string,
            code: ak.code ?? '—',
            name: ak.name ?? '—',
            debit: Number(l.debit ?? 0),
            credit: Number(l.credit ?? 0),
            project_id: (l.project_id ?? null) as string | null,
          })
        }
      }

      const totalDebit = baris.reduce((s, b) => s + b.debit, 0)
      const totalCredit = baris.reduce((s, b) => s + b.credit, 0)

      return {
        data: baris,
        meta: {
          total_debit: totalDebit,
          total_credit: totalCredit,
          // Selisih HARUS nol kalau seluruh jurnal posted seimbang. Ditampilkan
          // apa adanya alih-alih diasumsikan: kalau suatu hari tak nol, itu
          // tanda invarian database bocor dan harus terlihat, bukan disamarkan.
          //
          // ── Dibulatkan ke SEN, dan itu bukan menyamarkan
          //
          // Nominal disimpan `numeric(18,2)` di basis (CLAUDE.md §5.4), tetapi
          // begitu sampai di JavaScript ia jadi `number` — float biner, yang
          // tak bisa mewakili sebagian pecahan desimal dengan tepat.
          // Menjumlahkan ratusan baris lalu menguranginya menghasilkan sisa
          // seperti `-1.19e-7`: bukan ketidakseimbangan pembukuan, melainkan
          // galat presisi float murni. Diukur 2026-08-14 lewat `gl-api.test.ts`.
          //
          // Membulatkan ke dua desimal mengembalikannya ke satuan yang
          // sebenarnya dipakai basis. Ketidakseimbangan NYATA sekecil satu sen
          // tetap terlihat — yang hilang hanya angka yang tak pernah ada.
          selisih: Math.round((totalDebit - totalCredit) * 100) / 100,
          jumlah_baris: baris.length,
        },
      }
    },
  )

  // Saldo per akun — dasar neraca & laba-rugi (GL-3).
  app.get<{ Querystring: { from?: string; to?: string } }>(
    '/api/v1/gl/trial-balance',
    { preHandler: [authenticate, requirePermission('gl:view')] },
    async (request, reply) => {
      const q = request.query
      let query = request.db!
        .from('journal_entries')
        .select('id, entry_date, journal_entry_lines(account_id, debit, credit, accounts(code, name, type))')
        .eq('status', 'posted')
        .limit(1000)

      if (q.from) query = query.gte('entry_date', q.from)
      if (q.to) query = query.lte('entry_date', q.to)

      const { data, error } = await query
      if (error) return reply.status(500).send({ error: error.message })

      const per = new Map<string, { code: string; name: string; type: string; debit: number; credit: number }>()
      for (const je of (data ?? []) as Array<Record<string, unknown>>) {
        for (const l of ((je.journal_entry_lines ?? []) as Array<Record<string, unknown>>)) {
          const ak = (l.accounts ?? {}) as { code?: string; name?: string; type?: string }
          const id = l.account_id as string
          const e = per.get(id) ?? {
            code: ak.code ?? '—', name: ak.name ?? '—', type: ak.type ?? '—', debit: 0, credit: 0,
          }
          e.debit += Number(l.debit ?? 0)
          e.credit += Number(l.credit ?? 0)
          per.set(id, e)
        }
      }

      const rows = [...per.entries()]
        .map(([account_id, v]) => ({
          account_id,
          ...v,
          // Saldo bertanda menurut arah normal tipe akun: aset & beban naik di
          // debit; liabilitas, ekuitas, & pendapatan naik di kredit. Tanpa ini
          // neraca menampilkan liabilitas sebagai angka negatif.
          saldo: ['asset', 'expense'].includes(v.type) ? v.debit - v.credit : v.credit - v.debit,
        }))
        .sort((a, b) => a.code.localeCompare(b.code))

      const td = rows.reduce((s, r) => s + r.debit, 0)
      const tc = rows.reduce((s, r) => s + r.credit, 0)
      // Dibulatkan ke sen — alasan lengkap di endpoint buku besar di atas:
      // `numeric(18,2)` di basis jadi float biner di JavaScript, dan
      // menjumlahkan banyak baris meninggalkan sisa yang bukan pembukuan.
      return {
        data: rows,
        meta: {
          total_debit: td,
          total_credit: tc,
          selisih: Math.round((td - tc) * 100) / 100,
        },
      }
    },
  )

  // ── GET /api/v1/gl/laporan ───────────────────────────────────────────────
  //
  // Neraca DAN laba-rugi dalam satu respons, dari SATU perhitungan saldo.
  //
  // Dua endpoint terpisah akan menggoda orang memanggil salah satunya saja,
  // lalu membandingkan angkanya dengan yang lain — dan kalau rentang
  // tanggalnya beda sedikit, laba di neraca tak sama dengan laba di laporan
  // laba-rugi. Selisih itu tak punya sebab yang bisa dijelaskan, dan orang
  // akan berhenti memercayai keduanya.
  //
  // Satu panggilan, satu sumber saldo, dua sudut pandang.
  app.get<{ Querystring: { from?: string; to?: string } }>(
    '/api/v1/gl/laporan',
    { preHandler: [authenticate, requirePermission('gl:view')] },
    async (request, reply) => {
      const q = request.query

      let query = request.db!
        .from('journal_entries')
        .select('id, entry_date, journal_entry_lines(account_id, debit, credit, accounts(code, name, type))')
        // Hanya jurnal POSTED. Draft belum sah; void sudah dibatalkan.
        // Memasukkan keduanya membuat neraca tak cocok dengan buku besar.
        .eq('status', 'posted')
        .limit(1000)

      if (q.from) query = query.gte('entry_date', q.from)
      if (q.to) query = query.lte('entry_date', q.to)

      const { data, error } = await query
      if (error) return reply.status(500).send({ error: error.message })

      // `data` DIPASTIKAN tidak null di sini — `error` sudah diperiksa di
      // atas. Menulis `data ?? []` justru berbahaya di laporan keuangan:
      // query yang gagal berubah jadi nol baris yang terlihat sah, dan
      // neraca menampilkan semua-nol tanpa satu pun gejala.
      //
      // Kelas cacat ini punya korban nyata di repo ini: kurva-s.ts kehilangan
      // Rp 631,7 juta dari AC selama berbulan-bulan karena pola yang sama.
      const jurnal = data as Array<Record<string, unknown>>

      const per = new Map<string, { code: string; name: string; type: string; debit: number; credit: number }>()
      for (const je of jurnal) {
        for (const l of ((je.journal_entry_lines ?? []) as Array<Record<string, unknown>>)) {
          const ak = (l.accounts ?? {}) as { code?: string; name?: string; type?: string }
          const id = l.account_id as string
          const e = per.get(id) ?? {
            code: ak.code ?? '—', name: ak.name ?? '—', type: ak.type ?? '—', debit: 0, credit: 0,
          }
          e.debit += Number(l.debit ?? 0)
          e.credit += Number(l.credit ?? 0)
          per.set(id, e)
        }
      }

      const saldo: SaldoAkun[] = [...per.entries()].map(([account_id, v]) => ({
        account_id,
        ...v,
        // Arah normal tipe akun — aset & beban naik di debit, sisanya di
        // kredit. Sama persis dengan `/gl/trial-balance`; kalau suatu hari
        // berbeda, neraca dan neraca saldo akan bercerita hal yang berlainan.
        saldo: ['asset', 'expense'].includes(v.type) ? v.debit - v.credit : v.credit - v.debit,
      }))

      return {
        periode: { dari: q.from ?? null, sampai: q.to ?? null },
        neraca: hitungNeraca(saldo),
        labaRugi: hitungLabaRugi(saldo),
        meta: {
          jumlah_akun: saldo.length,
          // Batas 1000 jurnal DISEBUTKAN saat tercapai. Pemotongan diam-diam
          // pada laporan keuangan membuat orang menarik kesimpulan dari data
          // yang tak lengkap tanpa tahu.
          terpotong: jurnal.length >= 1000,
        },
      }
    },
  )
}
