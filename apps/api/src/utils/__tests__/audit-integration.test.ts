import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { Client } from 'pg'
import type { FastifyRequest } from 'fastify'
import { logAuditEvent, computeDiff } from '../audit.js'

// Integration: verifikasi audit_logs write-path end-to-end.
//
// CATATAN append-only (migration 073): audit_logs kini menolak UPDATE/DELETE.
// Karena itu test TIDAK boleh insert-lalu-hapus baris produksi. Dua pendekatan:
//  (a) verifikasi INSERT nyata lewat koneksi pg dalam transaksi yang di-ROLLBACK
//      — ROLLBACK bukan DELETE, tidak diblokir trigger, tidak meninggalkan baris.
//  (b) test fire-and-forget lewat logAuditEvent (supabase client) — tidak menulis
//      baris permanen karena FK sengaja invalid.

function pgClient() {
  return new Client({ connectionString: process.env.DIRECT_URL })
}

function mockRequest(): FastifyRequest {
  return {
    ip: '203.0.113.7',
    headers: { 'user-agent': 'vitest-audit-probe' },
    log: { error: () => {} },
  } as unknown as FastifyRequest
}

describe('audit_logs write-path (integration, rollback-safe)', () => {
  it('INSERT persists all fields the helper writes (in a rolled-back tx)', async () => {
    const c = pgClient()
    await c.connect()
    try {
      const actorId = (await c.query("SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE r.name='admin' LIMIT 1")).rows[0]?.id
      if (!actorId) return
      const recordId = randomUUID()
      const diff = computeDiff({ status: 'pending' }, { status: 'approved' })

      await c.query('BEGIN')
      // Insert dengan bentuk yang sama persis dgn logAuditEvent — verifikasi kolom
      // (severity/diff/ip/user_agent/reason) tersimpan benar. ROLLBACK setelahnya.
      await c.query(
        `INSERT INTO audit_logs (company_id, table_name, record_id, action, user_id, old_values,
           new_values, diff, severity, reason, ip_address, user_agent)
         VALUES ((SELECT id FROM companies WHERE parent_company_id IS NULL ORDER BY created_at LIMIT 1),
           'kasbons',$1,'kasbon.status',$2,'{"status":"pending"}','{"status":"approved"}',
           $3,'critical','probe','203.0.113.7','vitest-audit-probe')`,
        [recordId, actorId, JSON.stringify(diff)]
      )
      const { rows } = await c.query('SELECT * FROM audit_logs WHERE record_id=$1', [recordId])
      expect(rows.length).toBe(1)
      const row = rows[0]
      expect(row.action).toBe('kasbon.status')
      expect(row.severity).toBe('critical')
      expect(row.ip_address).toBe('203.0.113.7')
      expect(row.user_agent).toBe('vitest-audit-probe')
      expect(row.reason).toBe('probe')
      expect(row.diff).toEqual({ status: { from: 'pending', to: 'approved' } })
      await c.query('ROLLBACK')
    } finally {
      await c.end()
    }
  })

  it('append-only: audit_logs rejects UPDATE and DELETE (migration 073)', async () => {
    const c = pgClient()
    await c.connect()
    try {
      const actorId = (await c.query("SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE r.name='admin' LIMIT 1")).rows[0]?.id
      if (!actorId) return
      const recordId = randomUUID()
      await c.query('BEGIN')
      await c.query(
        "INSERT INTO audit_logs (company_id, table_name, record_id, action, user_id, severity) VALUES ((SELECT id FROM companies WHERE parent_company_id IS NULL ORDER BY created_at LIMIT 1),'_t',$1,'t',$2,'info')",
        [recordId, actorId]
      )
      await expect(
        c.query('UPDATE audit_logs SET action=$1 WHERE record_id=$2', ['x', recordId])
      ).rejects.toThrow(/append-only/i)
      // UPDATE gagal → transaksi aborted; rollback bersih (tidak meninggalkan baris)
      await c.query('ROLLBACK')

      // DELETE juga ditolak (transaksi baru)
      await c.query('BEGIN')
      await c.query(
        "INSERT INTO audit_logs (company_id, table_name, record_id, action, user_id, severity) VALUES ((SELECT id FROM companies WHERE parent_company_id IS NULL ORDER BY created_at LIMIT 1),'_t',$1,'t',$2,'info')",
        [recordId, actorId]
      )
      await expect(
        c.query('DELETE FROM audit_logs WHERE record_id=$1', [recordId])
      ).rejects.toThrow(/append-only/i)
      await c.query('ROLLBACK')
    } finally {
      await c.end()
    }
  })

  it('logAuditEvent never throws even if actorId is an invalid FK (fire-and-forget)', async () => {
    const recordId = randomUUID()
    await expect(
      logAuditEvent(mockRequest(), {
        tableName: 'x',
        recordId,
        action: 'probe.fail',
        actorId: '00000000-0000-0000-0000-000000000000',
        severity: 'info',
      })
    ).resolves.toBeUndefined()
  })

  /**
   * REGRESI: `logAuditEvent` tak pernah mengisi `company_id`.
   *
   * `audit_logs.company_id` NOT NULL, dan kebijakan RLS `tenant_isolation`
   * RESTRICTIVE menuntutnya cocok dengan tenant pemanggil. Trigger
   * `fn_isi_company_id` mengisinya bila kosong — TAPI hanya bila tak
   * ambigu: ia membaca `app.company_id`, dan bila itu kosong ia menebak
   * dari `companies` HANYA saat tenant-nya tepat satu.
   *
   * Akibatnya bug ini TAK TERLIHAT di dev (1 company — tebakan berhasil)
   * dan menghancurkan seluruh audit di CI (>1 company — insert ditolak,
   * `catch` menelan galatnya). Yang hilang bukan test, melainkan riwayat
   * "siapa mengubah apa" — tanpa satu pun gejala.
   *
   * Test ini memeriksa yang DIKIRIM helper, bukan yang tersimpan setelah
   * trigger menambal: kalau helper diam-diam berhenti mengisinya lagi,
   * di dev tetap hijau dan bug-nya kembali menyelinap ke CI.
   */
  it('logAuditEvent MENYATAKAN company_id, tidak menyerahkannya ke trigger', async () => {
    const src = await import('node:fs').then(fs =>
      fs.readFileSync(new URL('../audit.ts', import.meta.url), 'utf8'))

    expect(
      /company_id:\s*request\.companyId/.test(src),
      'insert audit tidak menyatakan company_id. Di dev (1 company) trigger ' +
      'akan menebaknya dan semuanya tampak baik; di CI dan produksi ' +
      'multi-tenant, insert DITOLAK dan jejak audit hilang tanpa suara.',
    ).toBe(true)
  })
})
