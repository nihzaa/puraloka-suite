// Anti self-lockout — keputusan MURNI (config-first, ember [C] keamanan).
//
// Karena permission kini bisa diubah dari UI, ada risiko nyata mengunci diri:
// mencabut permission kritikal dari pemegang terakhir → tak ada lagi yang bisa
// memperbaikinya lewat UI. File ini menghitung apakah sebuah perubahan akan
// menyebabkan permission kritikal tak lagi dimiliki user AKTIF mana pun.
//
// CRITICAL_PERMISSIONS = invariant keamanan → HARDCODE (bukan config). Membiarkan
// daftar ini dikonfigurasi = melonggarkan proteksi lockout = permukaan serangan.

/** Permission yang kehilangannya = tak bisa dipulihkan lewat UI. */
export const CRITICAL_PERMISSIONS: readonly string[] = [
  'users:roles:manage',      // pengelola role/permission — self-referential
  'settings:finance:manage', // config finansial (uang) — governance ketat
]

export interface RoleState {
  roleId: string
  name: string
  isBuiltin: boolean
  permissionKeys: string[]
  activeUserCount: number
}

/** Perubahan yang diusulkan: set permission baru untuk satu role, atau hapus role. */
export type RoleChange =
  | { type: 'set_permissions'; roleId: string; newPermissionKeys: string[] }
  | { type: 'delete_role'; roleId: string }

/**
 * Hitung, SETELAH perubahan diterapkan, berapa user aktif yang masih memiliki
 * tiap permission kritikal. Pure — tak menyentuh DB.
 */
export function activeHoldersAfterChange(
  roles: readonly RoleState[],
  change: RoleChange,
  criticalPerms: readonly string[] = CRITICAL_PERMISSIONS,
): Record<string, number> {
  const result: Record<string, number> = {}
  for (const perm of criticalPerms) result[perm] = 0

  for (const role of roles) {
    if (change.type === 'delete_role' && change.roleId === role.roleId) {
      continue // role dihapus → tak menyumbang holder
    }
    // Terapkan perubahan pada role yang terkena.
    const effectivePerms = (change.type === 'set_permissions' && change.roleId === role.roleId)
      ? change.newPermissionKeys
      : role.permissionKeys

    for (const perm of criticalPerms) {
      if (effectivePerms.includes(perm)) {
        result[perm] += role.activeUserCount
      }
    }
  }

  return result
}

/**
 * Kembalikan permission kritikal PERTAMA yang akan jatuh ke 0 pemegang aktif akibat
 * perubahan (= lockout), atau null bila aman.
 */
export function findLockout(
  roles: readonly RoleState[],
  change: RoleChange,
  criticalPerms: readonly string[] = CRITICAL_PERMISSIONS,
): string | null {
  const before = activeHoldersAfterChange(roles, { type: 'set_permissions', roleId: '__none__', newPermissionKeys: [] }, criticalPerms)
  const after = activeHoldersAfterChange(roles, change, criticalPerms)

  for (const perm of criticalPerms) {
    // Lockout hanya bila SEBELUMNYA ada pemegang (>0) DAN SESUDAHNYA 0.
    // (Kalau memang belum pernah ada pemegang, perubahan ini bukan penyebab lockout.)
    if ((before[perm] ?? 0) > 0 && (after[perm] ?? 0) === 0) {
      return perm
    }
  }
  return null
}
