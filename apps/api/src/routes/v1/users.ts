import { FastifyInstance, FastifyRequest } from 'fastify'
import { supabase } from '../../utils/supabase.js'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'
import { flattenUserRole } from '../../utils/user-role.js'

/**
 * T4g — id user yang jadi ANGGOTA company aktif request ini.
 *
 * `users` kategori D: identitas hidup LINTAS tenant (satu orang bisa jadi
 * anggota >1 perusahaan, ADR-011 D6), jadi tabelnya sengaja TIDAK punya
 * `company_id`. Batas yang berlaku di sini adalah KEANGGOTAAN, bukan kepemilikan
 * baris — tanpa ini, admin tenant A bisa membaca, mengubah role, bahkan
 * menonaktifkan akun user tenant B.
 */
async function idAnggotaCompany(request: FastifyRequest): Promise<string[]> {
  const { data } = await request.db!
    .unsafe('company_members', 'sumber keanggotaan; di-scope manual ke company aktif')
    .select('user_id')
    .eq('company_id', request.companyId!)
    .eq('is_active', true)
  return (data ?? []).map((m: { user_id: string }) => m.user_id)
}

export default async function userRoutes(app: FastifyInstance) {

  // GET /api/v1/users?role=pm&all=true — list users
  // Tanpa all=true: hanya aktif (untuk dropdown). Dengan all=true (admin): semua user + is_active
  app.get('/api/v1/users', { preHandler: [authenticate] }, async (request, reply) => {
    const { role, all } = request.query as { role?: string; all?: string }

    // Data-scoping, bukan authorization gate (ADR-004 Rule #1): endpoint sudah
    // ter-authenticate; ini hanya menentukan apakah user nonaktif ikut ditampilkan.
    const isAdmin = request.currentUser?.role === 'admin'
    const showAll = all === 'true' && isAdmin

    const idAnggota = await idAnggotaCompany(request)

    // FASE 3 CONTRACT: role dibaca via FK (roles.name), kolom enum di-drop.
    let query = supabase
      .from('users')
      .select('id, name, email, phone, role_id, roles:role_id ( name ), is_active, created_at')
      .order('name')

    if (role) {
      /*
        Filter by nama role → resolve role_id dulu.

        ⚠ SATU NAMA MEMULANGKAN LEBIH DARI SATU BARIS, dan itu SAH.

        `roles` punya template global (company_id NULL) plus salinan milik tiap
        tenant — diukur 2026-08-29: 73 baris bernama `pm`. Versi lama memakai
        `.single()`, yang MELEMPAR kalau >1 baris; galatnya tak diperiksa,
        `roleRow` jadi null, lalu jatuh ke UUID nol yang tak cocok apa pun.

        Hasilnya dropdown "Project Manager" di form Tambah Proyek KOSONG —
        tanpa satu pun galat, dan tanpa cara menebak sebabnya dari layar.
        Dilaporkan founder: "pas mau bikin proyek baru, gabisa pilih pm".

        Kelas cacat yang sama persis dengan register (auth.ts): dua baris +
        single/maybeSingle + galat tak diperiksa.

        Yang benar: role MILIK TENANT INI menang atas template — dan itu juga
        menutup lubang tenancy, karena versi lama memakai `supabase` mentah
        yang bisa memungut baris role tenant lain.
      */
      const { data: kandidat, error: galatRole } = await request.db!
        .from('roles').select('id, company_id').eq('name', role)

      if (galatRole) {
        request.log.error({ galatRole, role }, 'gagal membaca roles saat menyaring users')
        return reply.status(500).send({ error: 'Gagal memeriksa role' })
      }

      const daftar = (kandidat ?? []) as { id: string; company_id: string | null }[]
      const terpilih =
        daftar.find((r) => r.company_id !== null) ?? daftar.find((r) => r.company_id === null)

      // Role yang benar-benar tak ada → hasil kosong, dan itu memang benar.
      query = query.eq('role_id', terpilih?.id ?? '00000000-0000-0000-0000-000000000000')
    }
    if (!showAll) query = query.eq('is_active', true)
    query = query.in('id', idAnggota)

    const { data, error } = await query
    if (error) return reply.status(500).send({ error: error.message })
    // Flatten roles.name → role, jaga bentuk response yang sama (frontend baca `role`).
    const users = (data ?? []).map(flattenUserRole)
    return { users }
  })

  // PATCH /api/v1/users/:id — update data user (admin only)
  app.patch('/api/v1/users/:id', { preHandler: [authenticate, requirePermission('users:manage')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { name, phone, role } = request.body as { name?: string; phone?: string; role?: string }

    // T4g: batas KEANGGOTAAN — user di luar company aktif tak boleh disentuh.
    if (!(await idAnggotaCompany(request)).includes(id)) {
      return reply.status(404).send({ error: 'User tidak ditemukan' })
    }

    // Dynamic role validation: query roles table
    let roleId: string | undefined
    if (role !== undefined) {
      const { data: roleRow } = await supabase.from('roles').select('id').eq('name', role).single()
      if (!roleRow) {
        return reply.status(400).send({ error: `Role '${role}' tidak valid` })
      }
      roleId = roleRow.id // FASE 1 EXPAND: untuk dual-write role_id
    }

    // Ambil role lama untuk audit (hanya jika role akan diubah).
    // FASE 3 CONTRACT: baca nama role dari FK (roles.name), bukan kolom enum yang di-drop.
    let oldRole: string | undefined
    if (role) {
      const { data: before } = await supabase
        .from('users').select('roles:role_id ( name )').eq('id', id).single()
      const embed = before?.roles as { name: string } | { name: string }[] | null | undefined
      oldRole = (Array.isArray(embed) ? embed[0] : embed)?.name
    }

    const updates: Record<string, unknown> = {}
    if (name) updates.name = name.trim()
    if (phone !== undefined) updates.phone = phone || null
    if (role) updates.role_id = roleId // FASE 3 CONTRACT: role_id satu-satunya sumber (enum di-drop)
    if (Object.keys(updates).length === 0) return reply.status(400).send({ error: 'Tidak ada field yang diubah' })
    const { data, error } = await supabase.from('users').update(updates).eq('id', id).select().single()
    if (error) return reply.status(500).send({ error: error.message })

    // Audit: perubahan role user (privilege escalation-sensitive, severity critical)
    if (role && oldRole !== undefined && oldRole !== role) {
      void logAuditEvent(request, {
        tableName: 'users',
        recordId: id,
        action: 'user.role',
        actorId: request.currentUser!.id,
        oldValues: { role: oldRole },
        newValues: { role },
        severity: 'critical',
      })
    }

    return { user: data }
  })

  // PATCH /api/v1/users/:id/toggle-active — aktifkan/nonaktifkan user (admin only)
  app.patch('/api/v1/users/:id/toggle-active', { preHandler: [authenticate, requirePermission('users:manage')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    if (id === request.currentUser?.id) {
      return reply.status(400).send({ error: 'Tidak bisa mengubah status akun sendiri' })
    }
    // T4g: batas KEANGGOTAAN — menonaktifkan akun user tenant lain = penolakan
    // layanan lintas perusahaan.
    if (!(await idAnggotaCompany(request)).includes(id)) {
      return reply.status(404).send({ error: 'User tidak ditemukan' })
    }
    const { data: current } = await supabase.from('users').select('is_active').eq('id', id).single()
    if (!current) return reply.status(404).send({ error: 'User tidak ditemukan' })
    const { data, error } = await supabase.from('users').update({ is_active: !current.is_active }).eq('id', id).select().single()
    if (error) return reply.status(500).send({ error: error.message })
    return { user: data }
  })
}
