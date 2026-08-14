// Anti self-lockout — pengambilan state + assertion (config-first, ember [C]).
// Delegasi keputusan ke lib/role-guard.ts (murni). File ini hanya baca DB.

import { supabase } from './supabase.js'
import { findLockout, type RoleChange, type RoleState } from '../lib/role-guard.js'

/**
 * Ambil state semua role: permission keys + jumlah user AKTIF (via role_id, FK 1B.4).
 */
export async function fetchRoleStates(roleIdSedangDiubah?: string): Promise<RoleState[]> {
  /*
    ── Baris role KEMBAR membuat penjaga ini MATI DIAM-DIAM
       (ditemukan 2026-08-14, cacat dari migrasi 365)

    Sejak role dimiliki per-tenant, satu nama punya DUA baris: template
    (`company_id NULL`) dan salinan tenant. Keduanya memegang izin yang sama.

    Penjaga ini menghitung pemegang per `role_id`. Jadi saat izin kritikal
    dicabut dari baris yang BENAR-BENAR DIPAKAI (template — seluruh 25
    pengguna menunjuk ke sana), salinan tenant yang tak berpengguna masih
    "memegang" izin itu, dan penjaga menyimpulkan: bukan pemegang terakhir.

    Akibatnya endpoint membalas 200 dan izinnya benar-benar tercabut —
    lockout yang justru dirancang untuk dicegah. Ketahuan dari
    `anti-lockout-wiring.test.ts`: "WIRING PUTUS — endpoint membalas 200,
    bukan 409".

    Perbaikannya: hanya baris yang BISA DIPAKAI yang dihitung. Role tanpa satu
    pun pengguna aktif tak pernah bisa menyelamatkan siapa pun dari lockout —
    memasukkannya ke hitungan berarti menghitung penyelamat yang tak ada.

    Baris template tetap dibaca (ia bisa punya pengguna, dan hari ini justru
    dialah yang punya) — yang disaring adalah yang KOSONG dari pengguna.
  */
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

  return (roles)
    .map(r => ({
      roleId: r.id as string,
      name: r.name as string,
      isBuiltin: r.is_builtin as boolean,
      permissionKeys: permsByRole.get(r.id as string) ?? [],
      activeUserCount: activeByRole.get(r.id as string) ?? 0,
    }))
    /*
      Role TANPA pengguna aktif dibuang — lihat catatan panjang di atas.

      `findLockout` mencari "adakah role LAIN yang masih memegang izin ini".
      Role kosong menjawab "ada" tanpa pernah bisa dipakai siapa pun, dan
      jawaban itulah yang mematikan penjaganya.

      Yang sedang DIUBAH tetap ikut (`change.roleId`) — ia subjek perubahannya,
      dan membuangnya membuat `findLockout` tak punya apa pun untuk diperiksa.
    */
    .filter(r => r.activeUserCount > 0 || r.roleId === roleIdSedangDiubah)
}

/**
 * Assert perubahan tak menyebabkan lockout permission kritikal. Return pesan error
 * (untuk 409) bila lockout, atau null bila aman. Fail-safe: kalau state tak bisa
 * dibaca, TOLAK perubahan (lebih baik gagal daripada lockout tak terdeteksi).
 */
export async function assertNoCriticalLockout(change: RoleChange): Promise<string | null> {
  let roles: RoleState[]
  try {
    roles = await fetchRoleStates(change.roleId)
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
