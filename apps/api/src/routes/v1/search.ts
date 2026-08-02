import type { FastifyInstance } from 'fastify'
import { authenticate, hasPermission } from '../../plugins/auth.js'
import { supabase } from '../../utils/supabase.js'

// T4b — GELOMBANG PERTAMA (ADR-011 §6 "Titik perhatian khusus").
// Search global menyentuh 6 tabel lintas modul sekaligus, jadi ia permukaan
// kebocoran cross-tenant STRUKTURAL terbesar: satu query tanpa scope di sini
// membocorkan nama proyek/klien/invoice perusahaan lain ke kotak pencarian.
// Karena itu dikerjakan pertama, bukan terakhir.
//
// Catatan kategori C (invoices, milestones): keduanya mewarisi tenancy lewat
// project. Di layar search TIDAK ADA satu project sebagai konteks — pencarian
// bersifat lintas-proyek. Jadi scoping dilakukan lewat SUBQUERY project milik
// tenant, bukan db.viaProject() yang mensyaratkan satu project.

export default async function searchRoutes(app: FastifyInstance) {

  // GET /api/v1/search?q=&limit=
  // Role-aware: mandor hanya lihat scope & kasbon miliknya; client tidak bisa search
  app.get('/api/v1/search', { preHandler: [authenticate] }, async (request, reply) => {
    const { q, limit = '8' } = request.query as Record<string, string>
    const user = request.currentUser!

    if (!q || q.trim().length < 2) {
      return reply.send({ results: [] })
    }

    const term = q.trim()
    const cap = Math.min(20, Math.max(1, parseInt(limit)))

    // Client tidak dapat search (portal berbeda)
    if (user.role === 'client') return reply.send({ results: [] })

    type SearchResult = {
      type: string
      id: string
      title: string
      sub: string
      url: string
      meta?: string
    }

    const results: SearchResult[] = []

    const ilike = `%${term}%`

    // ── Projects ─────────────────────────────────────────────────────
    if (user.role !== 'mandor') {
      // ⚠️ `company_name`/`contact_person`, BUKAN `name` — kolom `clients.name`
      // TAK ADA. Sampai 2026-08-02 baris `.select()` di bawah memintanya,
      // sehingga SELURUH pencarian proyek gagal dengan "column clients_1.name
      // does not exist" — errornya dibuang, hasilnya kosong, tanpa gejala.
      // Search tak pernah menemukan proyek. Peringatan yang sama sudah ada di
      // blok `clients` di bawah; blok ini terlewat.
      //
      // Komentar ini DI ATAS `.from()`, bukan di antara `.from()` dan
      // `.select()`: `audit-kolom-select.mjs` memasangkan keduanya dalam
      // jendela 220 karakter, dan komentar di tengah mendorong `.select()`
      // keluar jangkauan — membuat penjaganya buta pada baris ini.
      let pq = request.db!
        .from('projects')
        .select('id, name, location, status, progress_pct, clients:clients!projects_client_id_fkey(company_name, contact_person)')
        .ilike('name', ilike)
        .eq('is_deleted', false)
        .limit(cap)

      if (user.role === 'pm') pq = pq.eq('pm_id', user.id)

      // Hasil DIPERIKSA: query yang gagal di sini menghasilkan daftar kosong
      // yang tak bisa dibedakan dari "tak ada yang cocok" — persis cara bug
      // `clients.name` di atas bertahan tanpa ketahuan.
      const { data, error: eProj } = await pq
      if (eProj) {
        request.log.error({ eProj, term }, 'Pencarian proyek gagal')
        return reply.status(500).send({ error: 'Pencarian proyek gagal: ' + eProj.message })
      }
      for (const p of data ?? []) {
        results.push({
          type: 'project',
          id: p.id,
          title: p.name,
          // Satu `as` untuk dua pembacaan, bukan dua: bentuk embed-nya sama,
          // dan mengulang `as any` menaikkan hutang lint tanpa menambah
          // kejelasan apa pun.
          sub: (() => {
            const kl = p.clients as { company_name?: string; contact_person?: string } | null
            return `${p.location} · ${kl?.company_name ?? kl?.contact_person ?? '—'}`
          })(),
          url: `/proyek/${p.id}`,
          meta: `${Number(p.progress_pct).toFixed(0)}% · ${p.status}`,
        })
      }
    }

    // ── Clients ───────────────────────────────────────────────────────
    // F6 (AKTA 0): capability, bukan role literal (direktur punya clients:view).
    if (await hasPermission(request, 'clients:view')) {
      // ⚠️ `company_name`, BUKAN `name` — kolom itu tak ada di `clients`, jadi
      // pencarian klien SELALU mengembalikan nol hasil tanpa satu pun gejala.
      // Diverifikasi ke information_schema 2026-08-01; kelas cacat yang sama
      // dengan AC kurva-S (Rp 755,7 jt hilang) — `?? []` menelan errornya.
      const { data, error } = await request.db!
        .from('clients')
        .select('id, company_name, contact_person, phone, email')
        .or(`company_name.ilike.${ilike},contact_person.ilike.${ilike},phone.ilike.${ilike},email.ilike.${ilike}`)
        .limit(cap)
      if (error) request.log.error({ err: error }, 'pencarian klien gagal')

      for (const c of data ?? []) {
        results.push({
          type: 'client',
          id: c.id,
          // Klien Puraloka mayoritas PERORANGAN, jadi `company_name` sering
          // null dan yang terisi adalah `contact_person`. Memakai satu saja
          // membuat separuh hasil pencarian bertajuk kosong — terlihat seperti
          // data rusak, padahal hanya kolom yang salah dipilih.
          title: c.company_name ?? c.contact_person ?? '(tanpa nama)',
          sub: [c.phone, c.email].filter(Boolean).join(' · '),
          url: `/klien`,
          meta: 'Klien',
        })
      }
    }

    // ── Invoices ──────────────────────────────────────────────────────
    // F7 (AKTA 0): capability finance:view:all (org-wide) — scope admin+pm identik,
    // BUKAN finance:view (terlalu luas, mandor punya).
    if (await hasPermission(request, 'finance:view:all')) {
      // Kategori C: tenancy lewat project. Search lintas-proyek, jadi disaring
      // dengan daftar project milik tenant ini (bukan viaProject yang butuh 1 project).
      const idProyek = await request.db!.projectIds()
      const { data } = idProyek.length === 0 ? { data: [] } : await supabase
        .from('invoices')
        .select('id, invoice_number, total_amount, status, project:projects!invoices_project_id_fkey(id, name)')
        .in('project_id', idProyek)
        .ilike('invoice_number', ilike)
        .limit(cap)

      for (const inv of data ?? []) {
        results.push({
          type: 'invoice',
          id: inv.id,
          title: `Invoice ${inv.invoice_number}`,
          sub: (inv.project as any)?.name ?? '—',
          url: `/keuangan`,
          meta: new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(inv.total_amount)),
        })
      }
    }

    // ── Kasbons ───────────────────────────────────────────────────────
    {
      let kq = request.db!
        .from('kasbons')
        .select('id, amount, purpose, status, kasbon_date, project:projects!kasbons_project_id_fkey(id, name), mandor:users!kasbons_requested_by_fkey(name)')
        .or(`purpose.ilike.${ilike}`)
        .limit(cap)

      if (user.role === 'mandor') kq = kq.eq('requested_by', user.id)

      const { data } = await kq
      for (const k of data ?? []) {
        results.push({
          type: 'kasbon',
          id: k.id,
          title: `Kasbon ${(k.mandor as any)?.name ?? '—'} — ${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(k.amount))}`,
          sub: (k.project as any)?.name ?? '—',
          url: user.role === 'mandor' ? `/mandor-portal/kasbon` : `/mandor`,
          meta: k.status,
        })
      }
    }

    // ── Users ─────────────────────────────────────────────────────────
    // F8 (AKTA 0): capability users:manage, bukan role literal (direktur punya).
    if (await hasPermission(request, 'users:manage')) {
      // Kategori D: identitas lintas-tenant — satu orang bisa jadi anggota >1
      // perusahaan (ADR-011 D6). Yang boleh terlihat di sini hanya ANGGOTA
      // perusahaan aktif, bukan seluruh penghuni tabel users.
      // company_members kategori D — wrapper mewajibkan unsafe()+alasan, dan
      // memang benar begitu: tabel ini yang MENDEFINISIKAN tenancy, jadi ia tak
      // bisa di-scope oleh dirinya sendiri. Tenancy dijaga manual di baris
      // berikutnya lewat eq('company_id', ...) ke company aktif request.
      const { data: anggota } = await request.db!
        .unsafe('company_members', 'sumber keanggotaan; di-scope manual ke company aktif')
        .select('user_id')
        .eq('company_id', request.db!.companyId)
        .eq('is_active', true)
      const idAnggota = (anggota ?? []).map((m: { user_id: string }) => m.user_id)
      const { data } = idAnggota.length === 0 ? { data: [] } : await supabase
        .from('users')
        .select('id, name, email, role_id, roles:role_id ( name ), is_active')
        .in('id', idAnggota)
        .or(`name.ilike.${ilike},email.ilike.${ilike}`)
        .limit(cap)

      for (const u of data ?? []) {
        const embed = u.roles as { name: string } | { name: string }[] | null | undefined
        const roleName = (Array.isArray(embed) ? embed[0] : embed)?.name ?? '-'
        results.push({
          type: 'user',
          id: u.id,
          title: u.name,
          sub: `${u.email} · ${roleName}`,
          url: `/users`,
          meta: u.is_active ? 'Aktif' : 'Nonaktif',
        })
      }
    }

    // ── Milestones ────────────────────────────────────────────────────
    if (user.role !== 'mandor') {
      // Kategori C: sama seperti invoices — disaring lewat daftar project tenant.
      const idProyek = await request.db!.projectIds()
      const { data } = idProyek.length === 0 ? { data: [] } : await supabase
        .from('milestones')
        .select('id, title, status, target_date, project:projects!milestones_project_id_fkey(id, name, pm_id, is_deleted)')
        .in('project_id', idProyek)
        .ilike('title', ilike)
        .limit(cap)
      for (const m of (data ?? []) as any[]) {
        if (m.project?.is_deleted) continue
        if (user.role === 'pm' && m.project?.pm_id !== user.id) continue
        results.push({
          type: 'milestone',
          id: m.id,
          title: m.title,
          sub: m.project?.name ?? '—',
          url: `/proyek/${m.project?.id}#sec-milestone`,
          meta: m.status,
        })
      }
    }

    // Deduplicate & sort by type priority
    const priority: Record<string, number> = { project: 0, client: 1, invoice: 2, kasbon: 3, milestone: 4, user: 5 }
    results.sort((a, b) => (priority[a.type] ?? 9) - (priority[b.type] ?? 9))

    return reply.send({ results: results.slice(0, 20) })
  })
}
