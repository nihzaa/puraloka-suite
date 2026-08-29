import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Client } from 'pg'
import { createRlsClient } from '../../test-utils/rls-harness.js'
import { resolveRecipients } from '../notification-routing.js'

// REGRESI + penjaga Notification Routing Engine (2B).
//
// Latar: PR #47 — resolusi penerima diam-diam berhenti bekerja setelah kolom
// `users.role` di-drop (1B.4). PostgREST membalas 42703, `error`-nya tidak pernah
// diperiksa, hasilnya `[]` tanpa jejak, dan SETIAP admin berhenti menerima
// notifikasi tanpa ada yang tahu.
//
// Karena itu test ini melawan DB NYATA: bug-nya ada pada bentuk query terhadap
// skema sebenarnya. Unit test ber-mock akan tetap hijau sambil produksi mati —
// persis yang terjadi selama ini.
//
// Yang dikunci:
//   1. setiap event yang DIPAKAI KODE punya aturan aktif  ← hilangnya notifikasi
//      jadi MERAH di CI, bukan senyap
//   2. resolusi mengembalikan penerima nyata, bukan himpunan kosong
//   3. dedup: admin yang sekaligus PM hanya dapat satu notifikasi

const ROUTES_DIR = join(import.meta.dirname, '../../routes/v1')

/** Semua event yang benar-benar dipanggil `resolveRecipients('…')` di kode route. */
function eventsUsedInCode(): string[] {
  const found = new Set<string>()
  for (const f of readdirSync(ROUTES_DIR).filter(f => f.endsWith('.ts'))) {
    const src = readFileSync(join(ROUTES_DIR, f), 'utf-8')
    for (const m of src.matchAll(/resolveRecipients\(\s*'([^']+)'/g)) found.add(m[1])
  }
  return [...found].sort()
}

let client: Client

beforeAll(async () => { client = await createRlsClient() }, 60_000)
afterAll(async () => { await client.end() })

describe('Notification Routing — tidak boleh ada event tanpa aturan', () => {
  it('setiap event yang dipakai kode punya aturan AKTIF ber-target', async () => {
    const used = eventsUsedInCode()
    expect(used.length, 'tak menemukan pemanggilan resolveRecipients di route').toBeGreaterThan(0)

    const { rows } = await client.query(`
      SELECT r.event_type, r.is_active, COUNT(t.id)::int AS targets
        FROM notification_rules r
        LEFT JOIN notification_rule_targets t ON t.rule_id = r.id
       GROUP BY r.event_type, r.is_active`)
    const byEvent = new Map(rows.map(r => [r.event_type, r]))

    // Dua keadaan yang SALAH:
    //   (a) event dipakai kode tapi tak punya aturan sama sekali → kelalaian developer
    //   (b) aturan AKTIF tapi nol target → notifikasi menguap tanpa jejak
    // Aturan yang SENGAJA dinonaktifkan founder BUKAN masalah — itu justru fiturnya,
    // dan test tidak boleh menghukum pemakaian fitur.
    const bermasalah = used.filter(e => {
      const rule = byEvent.get(e)
      if (!rule) return true
      return rule.is_active && rule.targets === 0
    })
    expect(bermasalah, 'event tanpa aturan, atau aktif tapi nol target → notifikasi HILANG diam-diam').toEqual([])
  }, 30_000)
})

describe('Resolusi penerima (terhadap skema nyata)', () => {
  it('event ber-target admin mengembalikan admin aktif — BUKAN kosong', async () => {
    const { rows } = await client.query(
      `SELECT COUNT(*)::int AS n FROM users u JOIN roles r ON r.id = u.role_id
        WHERE r.name = 'admin' AND u.is_active = true`)
    expect(rows[0].n, 'prasyarat: dev harus punya minimal 1 admin aktif').toBeGreaterThan(0)

    const { rows: co } = await client.query(`SELECT id FROM companies ORDER BY created_at LIMIT 1`)
    const ids = await resolveRecipients('invoice_created', { companyId: co[0].id })
    expect(ids.length, 'admin tidak menerima notifikasi apa pun bila ini 0').toBe(rows[0].n)
  }, 30_000)

  it('event ber-target admin + PM memuat keduanya, tanpa duplikat', async () => {
    // T4g: companyId diambil dari PROYEKNYA, bukan ditebak — resolusi penerima
    // kini dibatasi keanggotaan company, jadi memakai company yang salah akan
    // menghasilkan nol penerima dan test jadi hampa.
    /*
      Proyek dipilih menurut SYARAT, bukan `LIMIT 1` atas urutan yang kebetulan.

      Aturan notifikasi hidup PER COMPANY (`notification_rules.company_id`).
      Diukur 2026-08-30: aturan `invoice_created` hanya ada untuk Puraloka
      Persada. `LIMIT 1` telanjang bisa memilih proyek company LAIN, dan
      `resolveRecipients` lalu memulangkan daftar KOSONG — bukan karena
      resolusinya rusak, melainkan karena company itu memang tak punya
      aturannya.

      Gejalanya ("daftar admin kosong") menuduh resolusi, bukan fixture.
    */
    const { rows } = await client.query(
      `SELECT p.id, p.pm_id, p.company_id FROM projects p
        WHERE p.pm_id IS NOT NULL AND p.is_deleted = false AND p.company_id IS NOT NULL
          AND EXISTS (SELECT 1 FROM notification_rules nr
                       WHERE nr.company_id = p.company_id
                         AND nr.event_type = 'invoice_created' AND nr.is_active)
        ORDER BY p.created_at LIMIT 1`)
    if (!rows.length) {
      throw new Error(
        'prasyarat gagal: nol proyek di company yang punya aturan notifikasi ' +
        '`invoice_created` aktif. Test ini tak bisa menguji resolusi penerima ' +
        'tanpa aturannya ada.')
    }
    expect(rows.length, 'prasyarat: butuh 1 proyek ber-PM').toBe(1)
    const { id: projectId, pm_id, company_id: companyId } = rows[0]

    const ids = await resolveRecipients('kasbon_submitted', { projectId, companyId })
    const admins = await resolveRecipients('invoice_created', { companyId })

    // WAJIB: tanpa baris ini, loop di bawah jadi HAMPA saat resolusi admin rusak
    // (himpunan kosong → nol iterasi → test tetap hijau). Persis kondisi yang
    // membuat bug #47 lolos sekian lama.
    expect(admins.length, 'daftar admin kosong → asersi di bawah tak menguji apa pun').toBeGreaterThan(0)

    for (const a of admins) expect(ids, 'admin harus ikut dinotifikasi').toContain(a)
    expect(ids, 'PM proyek harus ikut dinotifikasi').toContain(pm_id)
    expect(new Set(ids).size, 'tidak boleh ada penerima ganda').toBe(ids.length)
  }, 30_000)

  it('event tak dikenal → kosong dan TIDAK melempar (notifikasi wajib fire-and-forget)', async () => {
    const { rows: co } = await client.query(`SELECT id FROM companies ORDER BY created_at LIMIT 1`)
    await expect(resolveRecipients('__event_tidak_ada__', { companyId: co[0].id }))
      .resolves.toEqual([])
  }, 30_000)
})
