import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient } from '../../test-utils/rls-harness.js'
import { getAllAdmins, getProjectAdminsAndPM, getProjectMandors } from '../notifications.js'

// REGRESI: resolusi penerima notifikasi diam-diam berhenti bekerja.
//
// Sub-Fase 1B.4 men-DROP kolom `users.role` (diganti FK `role_id`), tapi
// getAllAdmins()/getProjectAdminsAndPM() masih memakai `.eq('role','admin')`.
// PostgREST membalas 42703 "column users.role does not exist" — dan `error`-nya
// TIDAK PERNAH diperiksa, jadi hasilnya `[]` tanpa satu pun jejak. Akibatnya
// setiap admin (termasuk pemilik) berhenti menerima SEMUA notifikasi, dan tak
// ada yang tahu.
//
// Kenapa test ini melawan DB nyata: bug-nya justru pada BENTUK QUERY terhadap
// skema sebenarnya. Unit test ber-mock akan tetap hijau sambil produksi mati —
// persis itu yang terjadi selama ini.
//
// Yang dikunci: penyelesai penerima TIDAK BOLEH mengembalikan himpunan kosong
// selama data pendukungnya ada. Kosong = notifikasi hilang tanpa suara.

let client: Client

beforeAll(async () => { client = await createRlsClient() }, 60_000)
afterAll(async () => { await client.end() })

describe('Resolusi penerima notifikasi (terhadap skema nyata)', () => {
  it('getAllAdmins() mengembalikan admin aktif — BUKAN kosong', async () => {
    const { rows } = await client.query(
      `SELECT COUNT(*)::int AS n FROM users u JOIN roles r ON r.id = u.role_id
        WHERE r.name = 'admin' AND u.is_active = true`)
    expect(rows[0].n, 'prasyarat: dev harus punya minimal 1 admin aktif').toBeGreaterThan(0)

    const ids = await getAllAdmins()
    expect(ids.length, 'admin tidak menerima notifikasi apa pun bila ini 0').toBe(rows[0].n)
  }, 30_000)

  it('getProjectAdminsAndPM() memuat admin DAN pm proyek, tanpa duplikat', async () => {
    const { rows } = await client.query(
      `SELECT id, pm_id FROM projects WHERE pm_id IS NOT NULL AND is_deleted = false LIMIT 1`)
    expect(rows.length, 'prasyarat: butuh 1 proyek ber-PM').toBe(1)
    const { id: projectId, pm_id } = rows[0]

    const ids = await getProjectAdminsAndPM(projectId)
    const admins = await getAllAdmins()

    // WAJIB: tanpa baris ini, loop di bawah jadi HAMPA saat resolusi admin rusak
    // (himpunan kosong → nol iterasi → test tetap hijau). Persis kondisi yang
    // membuat bug ini lolos sekian lama.
    expect(admins.length, 'daftar admin kosong → asersi di bawah tak menguji apa pun').toBeGreaterThan(0)

    expect(ids.length).toBeGreaterThan(0)
    for (const a of admins) expect(ids, 'admin harus ikut dinotifikasi').toContain(a)
    expect(ids, 'PM proyek harus ikut dinotifikasi').toContain(pm_id)
    expect(new Set(ids).size, 'tidak boleh ada penerima ganda').toBe(ids.length)
  }, 30_000)

  it('getProjectMandors() mengembalikan mandor ber-assignment aktif', async () => {
    const { rows } = await client.query(
      `SELECT project_id, COUNT(*)::int AS n FROM mandor_assignments
        WHERE status = 'active' GROUP BY project_id LIMIT 1`)
    expect(rows.length, 'prasyarat: butuh 1 proyek dgn assignment aktif').toBe(1)

    const ids = await getProjectMandors(rows[0].project_id)
    expect(ids.length).toBe(rows[0].n)
  }, 30_000)
})
