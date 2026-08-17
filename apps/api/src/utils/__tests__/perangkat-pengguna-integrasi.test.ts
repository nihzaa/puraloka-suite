import { describe, it, expect } from 'vitest'
import { Client } from 'pg'

// ============================================================================
// `perangkat_pengguna` TERHADAP POSTGRES NYATA (migrasi 438).
//
// Bukan mock. Yang diuji di sini justru hal-hal yang HANYA basis yang tahu:
// unik global, CHECK penyedia, CASCADE, dan tipe waktu.
//
// ── Kenapa rollback, bukan insert-lalu-hapus
//
// Pola yang sama dengan `audit-integration.test.ts`: ROLLBACK tak
// meninggalkan baris sekalipun assertion-nya gagal di tengah. Insert-lalu-
// hapus meninggalkan sampah tiap kali test merah — dan test yang merah
// adalah justru saat pembersihannya tak sampai dijalankan.
//
// ⚠️ Yang TIDAK dibuktikan berkas ini: bahwa HP sungguhan berbunyi. Itu butuh
// perangkat fisik + build Expo. Yang dibuktikan: tokennya TERSIMPAN dengan
// invarian yang benar.
// ============================================================================

function pgClient() {
  return new Client({ connectionString: process.env.DIRECT_URL })
}

const T_A = 'ExponentPushToken[438-integrasi-A]'
const T_B = 'ExponentPushToken[438-integrasi-B]'

describe('perangkat_pengguna (integration, rollback-safe)', () => {
  it('menyimpan token, dan satu pengguna boleh punya BEBERAPA perangkat', async () => {
    const c = pgClient()
    await c.connect()
    try {
      const u = (await c.query('SELECT id FROM users WHERE is_active LIMIT 1')).rows[0]?.id
      if (!u) return
      const co = (await c.query('SELECT company_id FROM projects WHERE company_id IS NOT NULL LIMIT 1')).rows[0]?.company_id

      await c.query('BEGIN')
      await c.query(
        `INSERT INTO perangkat_pengguna (user_id, company_id, token, platform, nama_perangkat)
         VALUES ($1,$2,$3,'android','Redmi Note 12'), ($1,$2,$4,'ios','iPhone 13')`,
        [u, co, T_A, T_B],
      )

      const { rows } = await c.query(
        'SELECT token, platform, penyedia FROM perangkat_pengguna WHERE user_id=$1 AND token LIKE $2 ORDER BY token',
        [u, 'ExponentPushToken[438-integrasi-%'],
      )

      // Inilah yang TIDAK bisa dilakukan `users.push_subscription` (kolom
      // tunggal): perangkat kedua akan menimpa yang pertama, dan HP pertama
      // berhenti berbunyi tanpa satu pun galat.
      expect(rows).toHaveLength(2)
      expect(rows.map((r) => r.platform)).toEqual(['android', 'ios'])
      expect(rows.every((r) => r.penyedia === 'expo')).toBe(true)
    } finally {
      await c.query('ROLLBACK').catch(() => {})
      await c.end()
    }
  })

  it('token KEMBAR ditolak — satu HP tak boleh jadi dua baris', async () => {
    const c = pgClient()
    await c.connect()
    try {
      const u = (await c.query('SELECT id FROM users WHERE is_active LIMIT 1')).rows[0]?.id
      if (!u) return

      await c.query('BEGIN')
      await c.query('INSERT INTO perangkat_pengguna (user_id, token) VALUES ($1,$2)', [u, T_A])

      await expect(
        c.query('INSERT INTO perangkat_pengguna (user_id, token) VALUES ($1,$2)', [u, T_A]),
      ).rejects.toThrow(/unique|duplicate/i)
    } finally {
      await c.query('ROLLBACK').catch(() => {})
      await c.end()
    }
  })

  it('token yang sama login sebagai pengguna LAIN MEMINDAHKAN kepemilikan', async () => {
    const c = pgClient()
    await c.connect()
    try {
      const us = (await c.query('SELECT id FROM users WHERE is_active LIMIT 2')).rows
      if (us.length < 2) return
      const [u1, u2] = [us[0].id, us[1].id]

      await c.query('BEGIN')
      await c.query('INSERT INTO perangkat_pengguna (user_id, token) VALUES ($1,$2)', [u1, T_A])

      // Skenario nyata: HP proyek dipegang bergantian. Expo memulangkan token
      // yang SAMA — ia melekat pada pemasangan, bukan pada sesi.
      await c.query(
        `INSERT INTO perangkat_pengguna (user_id, token) VALUES ($1,$2)
         ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, terakhir_dipakai_at = now()`,
        [u2, T_A],
      )

      const { rows } = await c.query('SELECT user_id FROM perangkat_pengguna WHERE token=$1', [T_A])
      expect(rows).toHaveLength(1)
      // Kalau ini gagal, kasbon milik u1 dikirim ke HP yang sekarang dipegang u2.
      expect(rows[0].user_id).toBe(u2)
    } finally {
      await c.query('ROLLBACK').catch(() => {})
      await c.end()
    }
  })

  it('penyedia di luar daftar DITOLAK', async () => {
    const c = pgClient()
    await c.connect()
    try {
      const u = (await c.query('SELECT id FROM users WHERE is_active LIMIT 1')).rows[0]?.id
      if (!u) return

      await c.query('BEGIN')
      // Baris ber-penyedia asing tak punya pengirim yang tahu cara memakainya —
      // ia jadi sampah yang tak pernah berbunyi dan tak pernah mengeluh.
      await expect(
        c.query('INSERT INTO perangkat_pengguna (user_id, token, penyedia) VALUES ($1,$2,$3)', [
          u, T_A, 'onesignal',
        ]),
      ).rejects.toThrow(/check|constraint/i)
    } finally {
      await c.query('ROLLBACK').catch(() => {})
      await c.end()
    }
  })

  it('RLS HIDUP dan waktu ber-zona (§5.4)', async () => {
    const c = pgClient()
    await c.connect()
    try {
      const rls = await c.query(
        `SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND c.relname='perangkat_pengguna'`,
      )
      // Tabel per-pengguna tanpa RLS bisa dibaca konteks pengguna mana pun,
      // dan token yang terbaca bisa dipakai mengirim notifikasi palsu.
      expect(rls.rows[0]?.relrowsecurity).toBe(true)

      const waktu = await c.query(
        `SELECT count(*)::int AS n FROM information_schema.columns
          WHERE table_schema='public' AND table_name='perangkat_pengguna'
            AND data_type='timestamp without time zone'`,
      )
      expect(waktu.rows[0].n).toBe(0)
    } finally {
      await c.end()
    }
  })
})
