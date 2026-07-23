import { describe, it, expect } from 'vitest'
import { findLockout, activeHoldersAfterChange, CRITICAL_PERMISSIONS, type RoleState } from '../role-guard.js'

// Anti self-lockout — keputusan murni. CRITICAL_PERMISSIONS = invariant keamanan.

const CRIT = 'users:roles:manage'

function roles(...defs: Array<[string, string[], number, boolean?]>): RoleState[] {
  return defs.map(([name, perms, active, builtin], i) => ({
    roleId: `r${i}`, name, isBuiltin: !!builtin, permissionKeys: perms, activeUserCount: active,
  }))
}

describe('CRITICAL_PERMISSIONS', () => {
  it('mencakup pengelola role + config finansial (tak boleh hilang dari UI)', () => {
    expect(CRITICAL_PERMISSIONS).toContain('users:roles:manage')
    expect(CRITICAL_PERMISSIONS).toContain('settings:finance:manage')
  })
})

describe('findLockout — cabut permission kritikal', () => {
  it('TOLAK: cabut users:roles:manage dari satu-satunya role aktif yang punya', () => {
    const state = roles(['admin', [CRIT], 1, true])
    const locked = findLockout(state, { type: 'set_permissions', roleId: 'r0', newPermissionKeys: [] })
    expect(locked).toBe(CRIT)
  })

  it('IZIN: cabut dari role A bila role B (aktif) masih punya', () => {
    const state = roles(['admin', [CRIT], 1, true], ['direktur', [CRIT], 1])
    const locked = findLockout(state, { type: 'set_permissions', roleId: 'r1', newPermissionKeys: [] })
    expect(locked).toBeNull()
  })

  it('TOLAK: role lain punya permission TAPI nol user aktif (bukan pemegang efektif)', () => {
    const state = roles(['admin', [CRIT], 1, true], ['direktur', [CRIT], 0])
    const locked = findLockout(state, { type: 'set_permissions', roleId: 'r0', newPermissionKeys: [] })
    expect(locked).toBe(CRIT) // direktur 0 user aktif → tak menyelamatkan
  })

  it('IZIN: perubahan tak menyentuh permission kritikal', () => {
    const state = roles(['admin', [CRIT, 'projects:view'], 1, true])
    const locked = findLockout(state, { type: 'set_permissions', roleId: 'r0', newPermissionKeys: [CRIT] })
    expect(locked).toBeNull()
  })

  it('IZIN: permission kritikal memang belum pernah dipegang siapa pun (perubahan ini bukan penyebab)', () => {
    const state = roles(['pm', ['projects:view'], 2])
    const locked = findLockout(state, { type: 'set_permissions', roleId: 'r0', newPermissionKeys: [] })
    expect(locked).toBeNull()
  })
})

describe('findLockout — hapus role', () => {
  it('TOLAK: hapus role pemegang terakhir permission kritikal', () => {
    const state = roles(['admin', [CRIT], 1, true])
    expect(findLockout(state, { type: 'delete_role', roleId: 'r0' })).toBe(CRIT)
  })

  it('IZIN: hapus role tanpa permission kritikal', () => {
    const state = roles(['admin', [CRIT], 1, true], ['viewer', ['projects:view'], 3])
    expect(findLockout(state, { type: 'delete_role', roleId: 'r1' })).toBeNull()
  })
})

describe('activeHoldersAfterChange — hitungan', () => {
  it('menjumlah user aktif lintas role yang punya permission', () => {
    const state = roles(['admin', [CRIT], 1, true], ['direktur', [CRIT], 2], ['pm', ['projects:view'], 5])
    const after = activeHoldersAfterChange(state, { type: 'set_permissions', roleId: '__none__', newPermissionKeys: [] })
    expect(after[CRIT]).toBe(3) // admin 1 + direktur 2
  })
})
