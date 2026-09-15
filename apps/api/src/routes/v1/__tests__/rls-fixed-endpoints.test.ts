import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient, asUser, authIdForRole, assignedMandor, wajibAda } from '../../../test-utils/rls-harness.js'

// Security regression for the 2 endpoints migrated off role-literal authorization
// (cash.ts GET /cash/accounts/:id, progress.ts DELETE /progress-logs/:logId).
// Guards the permission gate: if someone reverts to role-literal or removes the
// permission grants, these turn red. Verified via has_permission (the exact
// function requirePermission/hasPermission call), matching runtime authorization.

let client: Client
let adminId: string | null
let pmId: string | null

beforeAll(async () => {
  client = await createRlsClient()
  adminId = await authIdForRole(client, 'admin')
  pmId = await authIdForRole(client, 'pm')
})

afterAll(async () => {
  await client.end()
})

describe('cash.ts GET /cash/accounts/:id — requirePermission(cash:view)', () => {
  it('admin has cash:view (gate allows)', async () => {
    const r = await asUser(client, adminId, (c) => c.query("SELECT has_permission('cash:view') AS ok"))
    expect(r.rows[0].ok).toBe(true)
  })
  it('mandor does NOT have cash:view (gate denies)', async () => {
    const m = wajibAda(await assignedMandor(client), "mandor dengan assignment aktif")
    const r = await asUser(client, m.authId, (c) => c.query("SELECT has_permission('cash:view') AS ok"))
    expect(r.rows[0].ok).toBe(false)
  })
})

describe('progress.ts DELETE /progress-logs/:logId — hasPermission(progress:manage) OR owner', () => {
  it('admin has progress:manage (gate allows)', async () => {
    const r = await asUser(client, adminId, (c) => c.query("SELECT has_permission('progress:manage') AS ok"))
    expect(r.rows[0].ok).toBe(true)
  })
  /*
    ⚠ ARAHNYA DIBALIK 2026-09-14 — dan yang salah TESTNYA, bukan gerbangnya.

    Versi sebelumnya menuntut `pm` memegang `progress:manage`. Diukur ke
    `role_permissions` sebelum menyentuh apa pun:

        pemegang progress:manage :
          admin · direktur · project_manager_senior · site_manager

    `pm` polos TIDAK memegangnya — yang memegang `project_manager_senior`,
    peran yang berbeda. Jadi `has_permission()` menjawab `false` dengan BENAR.

    Kelas yang sama dengan `rls-reference-group` di sesi ini dan dengan yang
    tercatat di `authz-endpoints.test.ts`: peran ditebak dari nama jabatan,
    bukan dicocokkan ke tabel izin. "pm" terdengar seperti "project manager",
    dan di basis ini keduanya peran yang lain.

    ⚠ Yang TIDAK ditempuh: memberi `progress:manage` kepada `pm`. Menghapus
    progress log mengubah catatan kemajuan yang dipakai menagih termin —
    memperluas kewenangannya demi kehijauan test menukar pengendalian
    internal dengan kenyamanan.

    Yang diuji sekarang justru lebih tajam: jalur DELETE punya DUA gerbang
    (`hasPermission(progress:manage)` ATAU pemilik baris). `pm` membuktikan
    gerbang pertama benar-benar menyaring — tanpa izin itu ia ditolak, dan
    aksesnya hanya mungkin lewat jalur pemilik.
  */
  it('pm does NOT have progress:manage (akses hanya lewat jalur owner)', async () => {
    wajibAda(pmId, "user berperan pm")
    const r = await asUser(client, pmId, (c) => c.query("SELECT has_permission('progress:manage') AS ok"))
    expect(r.rows[0].ok).toBe(false)
  })
  it('mandor does NOT have progress:manage (delete only via owner-path, not blanket)', async () => {
    const m = wajibAda(await assignedMandor(client), "mandor dengan assignment aktif")
    const r = await asUser(client, m.authId, (c) => c.query("SELECT has_permission('progress:manage') AS ok"))
    expect(r.rows[0].ok).toBe(false)
  })
})
