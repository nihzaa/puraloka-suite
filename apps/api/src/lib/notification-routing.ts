// Notification Routing Engine — logika murni (Phase 2 / Program B, 2B).
// Tanpa DB: memutuskan APA yang perlu dicari, lalu MENGGABUNG hasilnya.
// Bagian yang menyentuh DB ada di utils/notification-routing.ts.

export type TargetType = 'role' | 'permission' | 'project_pm' | 'project_mandors'

export interface RuleTarget {
  target_type: TargetType
  role_name: string | null
  permission_key: string | null
}

/** Apa saja yang perlu di-query — supaya lapisan DB tak menebak-nebak. */
export interface Lookups {
  roles: string[]
  permissions: string[]
  needProjectPm: boolean
  needProjectMandors: boolean
}

export interface Pools {
  byRole: Record<string, string[]>
  byPermission: Record<string, string[]>
  projectPm: string | null
  projectMandors: string[]
}

/** Kumpulan pencarian minimum untuk sekumpulan target (unik, tanpa duplikat). */
export function requiredLookups(targets: RuleTarget[]): Lookups {
  const roles = new Set<string>()
  const permissions = new Set<string>()
  let needProjectPm = false
  let needProjectMandors = false

  for (const t of targets) {
    switch (t.target_type) {
      case 'role': if (t.role_name) roles.add(t.role_name); break
      case 'permission': if (t.permission_key) permissions.add(t.permission_key); break
      case 'project_pm': needProjectPm = true; break
      case 'project_mandors': needProjectMandors = true; break
    }
  }
  return {
    roles: [...roles], permissions: [...permissions], needProjectPm, needProjectMandors,
  }
}

/**
 * Gabungkan hasil pencarian jadi daftar penerima akhir.
 *
 * Dedup WAJIB: seorang admin yang juga PM proyek hanya boleh menerima satu
 * notifikasi, bukan dua — perilaku yang sudah dijamin `getProjectAdminsAndPM()`
 * lama lewat Set, dan tidak boleh hilang saat pindah ke engine.
 */
export function mergeRecipients(targets: RuleTarget[], pools: Pools): string[] {
  const out = new Set<string>()

  for (const t of targets) {
    switch (t.target_type) {
      case 'role':
        for (const id of pools.byRole[t.role_name ?? ''] ?? []) out.add(id)
        break
      case 'permission':
        for (const id of pools.byPermission[t.permission_key ?? ''] ?? []) out.add(id)
        break
      case 'project_pm':
        if (pools.projectPm) out.add(pools.projectPm)
        break
      case 'project_mandors':
        for (const id of pools.projectMandors) out.add(id)
        break
    }
  }
  return [...out]
}
