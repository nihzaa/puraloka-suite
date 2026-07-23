// Anti self-lockout — pengambilan state + assertion (config-first, ember [C]).
// Delegasi keputusan ke lib/role-guard.ts (murni). File ini hanya baca DB.

import { supabase } from './supabase.js'
import { findLockout, type RoleChange, type RoleState } from '../lib/role-guard.js'

/**
 * Ambil state semua role: permission keys + jumlah user AKTIF (via role_id, FK 1B.4).
 */
export async function fetchRoleStates(): Promise<RoleState[]> {
  const { data: roles, error: rErr } = await supabase
    .from('roles')
    .select('id, name, is_builtin')
  if (rErr || !roles) throw new Error(`role-guard: gagal baca roles: ${rErr?.message}`)

  const { data: rp, error: rpErr } = await supabase
    .from('role_permissions')
    .select('role_id, permissions:permission_id ( key )')
  if (rpErr) throw new Error(`role-guard: gagal baca role_permissions: ${rpErr.message}`)

  // Jumlah user aktif per role_id.
  const { data: users, error: uErr } = await supabase
    .from('users')
    .select('role_id')
    .eq('is_active', true)
  if (uErr) throw new Error(`role-guard: gagal baca users: ${uErr.message}`)

  const activeByRole = new Map<string, number>()
  for (const u of users ?? []) {
    if (u.role_id) activeByRole.set(u.role_id as string, (activeByRole.get(u.role_id as string) ?? 0) + 1)
  }

  const permsByRole = new Map<string, string[]>()
  for (const row of rp ?? []) {
    const embed = row.permissions as { key: string } | { key: string }[] | null
    const key = (Array.isArray(embed) ? embed[0] : embed)?.key
    if (!key) continue
    const rid = row.role_id as string
    const arr = permsByRole.get(rid) ?? []
    arr.push(key)
    permsByRole.set(rid, arr)
  }

  return (roles).map(r => ({
    roleId: r.id as string,
    name: r.name as string,
    isBuiltin: r.is_builtin as boolean,
    permissionKeys: permsByRole.get(r.id as string) ?? [],
    activeUserCount: activeByRole.get(r.id as string) ?? 0,
  }))
}

/**
 * Assert perubahan tak menyebabkan lockout permission kritikal. Return pesan error
 * (untuk 409) bila lockout, atau null bila aman. Fail-safe: kalau state tak bisa
 * dibaca, TOLAK perubahan (lebih baik gagal daripada lockout tak terdeteksi).
 */
export async function assertNoCriticalLockout(change: RoleChange): Promise<string | null> {
  let roles: RoleState[]
  try {
    roles = await fetchRoleStates()
  } catch {
    return 'Tidak bisa memverifikasi keamanan perubahan (gagal baca state role). Perubahan ditolak demi keselamatan.'
  }
  const locked = findLockout(roles, change)
  if (locked) {
    return `Perubahan ditolak: akan menghapus permission kritikal '${locked}' dari SATU-SATUNYA pemegang aktif terakhir. ` +
           `Ini akan mengunci sistem (tak ada lagi yang bisa memperbaikinya lewat UI). Berikan permission ini ke role lain dulu.`
  }
  return null
}
