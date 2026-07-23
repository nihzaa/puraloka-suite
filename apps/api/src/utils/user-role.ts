// Helper flatten role FK → field `role` (Sub-Fase 1B.4 FASE 3 CONTRACT).
// Setelah kolom enum users.role di-drop, role dibaca via join roles:role_id(name).
// Helper ini meratakan join menjadi { role } agar bentuk response ke frontend TIDAK
// berubah (frontend tetap membaca `user.role`).
//
// Supabase-js mengetik hasil embed sebagai ARRAY ({ name }[]) karena tidak tahu
// kardinalitas relasi — walau role_id→roles adalah many-to-one (satu objek).
// Helper menormalkan array-atau-objek-atau-null.

type RoleEmbed = { name: string } | { name: string }[] | null | undefined

function roleName(roles: RoleEmbed): string | null {
  if (!roles) return null
  const r = Array.isArray(roles) ? roles[0] : roles
  return r?.name ?? null
}

export function flattenUserRole<T extends Record<string, unknown>>(
  row: T & { roles?: RoleEmbed },
): Omit<T, 'roles'> & { role: string | null } {
  const { roles, ...rest } = row
  return { ...(rest as Omit<T, 'roles'>), role: roleName(roles) }
}
