import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { supabase } from '../../utils/supabase.js'

export default async function auditRoutes(app: FastifyInstance) {

  // GET /api/v1/audit — list audit logs
  // Query params: table_name, action, user_id, project_id, from, to, page, limit
  app.get('/api/v1/audit', {
    preHandler: [authenticate, requirePermission('audit:view')]
  }, async (request, reply) => {
    const {
      table_name, action, user_id, project_id,
      // `correlation_id` — satu request menghasilkan BANYAK event, dan
      // semuanya berbagi id ini (`logAuditEvent` mengisinya dari `request.id`).
      // Tanpa saringan ini, jejaknya tersimpan tapi tak bisa dirunut: yang
      // terbaca cuma daftar datar 21 ribu baris.
      correlation_id,
      // `severity` — memisahkan `critical` dari `info` adalah pertanyaan
      // pertama saat ada yang mempersoalkan sebuah perubahan.
      severity,
      from, to,
      page = '1', limit = '50',
    } = request.query as Record<string, string>

    const pageNum = Math.max(1, parseInt(page))
    const pageSize = Math.min(100, Math.max(1, parseInt(limit)))
    const offset = (pageNum - 1) * pageSize

    // T4g: audit_logs kategori D — `company_id` NOT NULL diisi saat TULIS (tak
    // pernah lewat join), jadi di-scope eksplisit di sini dengan .eq() di bawah.
    // Tanpa ini, admin tenant A membaca SELURUH jejak audit semua tenant: diff
    // nilai kontrak, pemutihan denda, perubahan role — data paling sensitif
    // yang ada di sistem.
    // `reason`, `severity`, `correlation_id` ikut diambil di `select` bawah.
    //
    // Ketiganya sudah lama diisi `logAuditEvent`, tapi tak pernah sampai ke
    // pembacanya — kolom yang terisi dan tak pernah terbaca sama saja dengan
    // kolom kosong, hanya lebih menyesatkan: pemeriksaan skema melaporkannya
    // "ada", jadi tak ada yang mencurigainya.
    let q = supabase
      .from('audit_logs')
      .select(`
        id, table_name, record_id, action,
        old_values, new_values, created_at,
        reason, severity, correlation_id,
        user:users!audit_logs_user_id_fkey(id, name, email, roles:role_id(name))
      `, { count: 'exact' })
      .eq('company_id', request.companyId!)
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1)

    if (table_name) q = q.eq('table_name', table_name)
    if (action)     q = q.eq('action', action)
    if (user_id)    q = q.eq('user_id', user_id)
    if (severity)   q = q.eq('severity', severity)
    if (correlation_id) q = q.eq('correlation_id', correlation_id)
    if (from)       q = q.gte('created_at', from)
    if (to)         q = q.lte('created_at', to + 'T23:59:59Z')

    // project_id filter: cari record_id di table projects, atau new_values->>'project_id'
    if (project_id) {
      q = q.or(`record_id.eq.${project_id},new_values->project_id.eq."${project_id}"`)
    }

    const { data, error, count } = await q
    if (error) return reply.status(500).send({ error: error.message })

    // FASE 3 CONTRACT: flatten user.roles.name → user.role (frontend audit page
    // menampilkan log.user.role sebagai string). Enum di-drop; role via FK.
    const logs = (data ?? []).map(log => {
      const u = log.user as { roles?: { name: string } | { name: string }[] | null } | null
      if (u) {
        const embed = u.roles
        ;(u as Record<string, unknown>).role = (Array.isArray(embed) ? embed[0] : embed)?.name ?? null
        delete (u as Record<string, unknown>).roles
      }
      return log
    })

    return reply.send({
      logs,
      meta: {
        total: count ?? 0,
        page: pageNum,
        limit: pageSize,
        pages: Math.ceil((count ?? 0) / pageSize),
      },
    })
  })

  // GET /api/v1/audit/meta — distinct table names + action types untuk filter dropdown
  //
  // ══════════════════════════════════════════════════════════════════════════
  // KENAPA INI SEBUAH RPC, DAN BUKAN DUA `select()` YANG DI-`Set`-KAN
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Versi sampai 2026-09-15 menyusun daftarnya begini:
  //
  //     supabase.from('audit_logs').select('table_name')
  //       .eq('company_id', cid).order('table_name')          ← tanpa .limit()
  //     ...
  //     const tables = [...new Set(data.map(r => r.table_name))]
  //
  // Tiap barisnya benar sendiri. Yang salah gabungannya: PostgREST memulangkan
  // **maksimal 1.000 baris** — batas keras, ditegakkan server, dan pemotongannya
  // TIDAK mengeluarkan galat. `data` terisi, `error` null, `new Set` berjalan
  // mulus atas seribu baris.
  //
  // `.order('table_name')` memperparahnya sampai ke titik yang menyesatkan:
  // seribu baris itu bukan sampel acak melainkan seluruhnya milik tabel-tabel
  // yang MENANG ALFABETIS. Jadi yang ter-`Set` cuma beberapa nama pertama.
  //
  // Diukur di basis dev 2026-09-15 (tenant 48befb54…, 102.089 baris):
  //
  //     DISTINCT table_name yang sebenarnya ada  :  95
  //     yang terlihat rute lama                  :   3
  //
  // Seorang auditor membuka dropdown, melihat TIGA tabel, dan menyimpulkan tak
  // ada modul lain yang pernah terjejak. Tak ada galat, tak ada penanda
  // pemotongan, dan tak ada cara dari layar untuk membedakannya dari kebenaran.
  //
  // ── Kenapa menaikkan `.limit()` BUKAN perbaikan
  //
  // Batas 1.000 itu milik SERVER (`db-max-rows` PostgREST). `.limit(50000)`
  // tetap memulangkan 1.000 baris — dan lebih buruk daripada tak menulis apa
  // pun, karena angka besar di kode membuat pembaca berikutnya yakin masalahnya
  // sudah ditangani. Itu persis kelas yang dijaga
  // `audit-cacah-di-atas-baca-terpotong.mjs`.
  //
  // Yang benar: minta BASIS yang menyusun himpunan distinct-nya. Yang melewati
  // kabel lalu bukan 102 ribu baris melainkan ~224 nilai — tak ada yang bisa
  // terpotong, dan ongkosnya turun, bukan naik.
  //
  // ── Tenancy
  //
  // Sama seperti handler daftar di atas: `audit_logs` kategori D, `company_id`
  // diisi saat TULIS dan tak pernah lewat join, jadi di-scope EKSPLISIT lewat
  // parameter RPC. Fungsinya `SECURITY INVOKER` — ia tak menaikkan hak siapa
  // pun, jadi penyaringan tenant tetap kewajiban baris ini (migrasi 589).
  app.get('/api/v1/audit/meta', {
    preHandler: [authenticate, requirePermission('audit:view')]
  }, async (request, reply) => {
    const cid = request.companyId!

    const { data, error } = await supabase.rpc('audit_saringan_tersedia', {
      p_company_id: cid,
    })

    // Galat TIDAK ditelan diam-diam. Membalas `{tables:[],actions:[]}` saat RPC
    // gagal akan menghasilkan dropdown kosong — yang terbaca persis seperti
    // "tenant ini belum punya jejak audit", kesimpulan yang salah dan menenangkan.
    if (error) return reply.status(500).send({ error: error.message })

    const baris = (data ?? []) as { kolom: string; nilai: string }[]
    const tables  = baris.filter((r) => r.kolom === 'table_name').map((r) => r.nilai).sort()
    const actions = baris.filter((r) => r.kolom === 'action').map((r) => r.nilai).sort()

    return reply.send({ tables, actions })
  })
}
