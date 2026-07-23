import { Client } from 'pg'

// ─────────────────────────────────────────────────────────────────────────────
// RLS Test Harness (Epic 4)
//
// Test suite utama (test-db.ts) sengaja menjalankan tabel di schema `test` TANPA
// RLS — konsisten produksi di mana API pakai service_role yang bypass RLS. Itu
// tepat untuk menguji logika bisnis, tapi TIDAK BISA memverifikasi RLS policy.
//
// Harness ini menutup gap itu: ia menguji RLS policy NYATA di schema `public`
// dengan mengimpersonasi user (role `authenticated` + request.jwt.claims → sub),
// sehingga auth.uid()/auth_role()/has_permission() dievaluasi persis seperti
// request browser sungguhan. Semua dalam transaksi yang SELALU di-ROLLBACK —
// harness ini read-safe, tidak pernah mengubah data public.
//
// Dipakai lintas Epic 4 (semua kelompok tabel RLS) dan seterusnya.
// ─────────────────────────────────────────────────────────────────────────────

function getDirectUrl(): string {
  const url = process.env.DIRECT_URL
  if (!url) {
    throw new Error(
      'DIRECT_URL tidak ditemukan. RLS harness butuh koneksi Postgres langsung ke ' +
        'project Supabase dev (schema public, tempat RLS + auth.uid() hidup).'
    )
  }
  return url
}

export async function createRlsClient(): Promise<Client> {
  const client = new Client({ connectionString: getDirectUrl() })
  await client.connect()
  return client
}

/**
 * Jalankan `fn` di dalam transaksi yang mengimpersonasi user dengan `authId`
 * (auth.users.id / users.auth_id) sebagai role `authenticated`. Transaksi
 * SELALU di-ROLLBACK setelahnya — tidak ada perubahan data yang bertahan.
 *
 * `authId = null` → simulasi anon (tidak login): role `anon`, tanpa claims.
 */
export async function asUser<T>(
  client: Client,
  authId: string | null,
  fn: (client: Client) => Promise<T>
): Promise<T> {
  await client.query('BEGIN')
  try {
    if (authId === null) {
      await client.query("SELECT set_config('role', 'anon', true)")
      await client.query("SELECT set_config('request.jwt.claims', '', true)")
    } else {
      await client.query("SELECT set_config('role', 'authenticated', true)")
      // set_config value harus string; klaim minimal yang dibaca auth.uid() = sub
      await client.query(
        "SELECT set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)",
        [authId]
      )
    }
    return await fn(client)
  } finally {
    await client.query('ROLLBACK')
  }
}

/**
 * Ambil satu `users.auth_id` untuk role built-in tertentu (admin/pm/mandor/client)
 * dari data dev — dipakai test untuk mengimpersonasi user nyata per role.
 * Mengembalikan null jika tidak ada user aktif dengan role itu yang punya auth_id.
 * (Catatan: di dev, tidak semua seed user punya auth_id — test SKIP jika null.)
 */
export async function authIdForRole(client: Client, role: string): Promise<string | null> {
  // Sub-Fase 1B.4 CONTRACT: role via FK (roles.name), kolom enum di-drop.
  const { rows } = await client.query(
    `SELECT u.auth_id FROM public.users u
     JOIN public.roles r ON r.id = u.role_id
     WHERE r.name = $1 AND u.auth_id IS NOT NULL AND u.is_active = true LIMIT 1`,
    [role]
  )
  return rows[0]?.auth_id ?? null
}

/**
 * Mandor ber-`auth_id` yang PUNYA minimal satu assignment aktif — dipakai test
 * ownership isolation (mandor tanpa assignment tidak membuktikan apa-apa).
 * Return { authId, userId, assignedProjectCount } atau null.
 */
export async function assignedMandor(
  client: Client
): Promise<{ authId: string; userId: string; assignedProjectCount: number } | null> {
  const { rows } = await client.query(`
    SELECT u.id AS user_id, u.auth_id,
           count(DISTINCT ma.project_id)::int AS n
    FROM public.users u
    JOIN public.roles r ON r.id = u.role_id
    JOIN public.mandor_assignments ma ON ma.mandor_id = u.id
    WHERE r.name = 'mandor' AND u.auth_id IS NOT NULL AND u.is_active = true
    GROUP BY u.id, u.auth_id
    ORDER BY n DESC
    LIMIT 1
  `)
  if (!rows[0]) return null
  return { authId: rows[0].auth_id, userId: rows[0].user_id, assignedProjectCount: rows[0].n }
}
