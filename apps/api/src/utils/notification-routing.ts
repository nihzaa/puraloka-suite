import { supabase } from './supabase.js'
import {
  requiredLookups, mergeRecipients, type RuleTarget, type Pools,
} from '../lib/notification-routing.js'

// Notification Routing Engine — lapisan DB (Phase 2 / Program B, 2B).
// Keputusannya di lib/notification-routing.ts (murni, ber-test); di sini hanya
// pembacaan aturan + resolusi kumpulan user.

export interface RoutingContext {
  /** Proyek terkait — dibutuhkan target kontekstual (project_pm, project_mandors). */
  projectId?: string | null
  /**
   * Company aktif — WAJIB (T4g).
   *
   * Tanpa ini, resolusi penerima berjalan lintas SEMUA tenant: admin perusahaan
   * A menerima notifikasi **dan email** berisi nama proyek, nomor invoice,
   * nominal, dan nama mandor perusahaan B. Ini kebocoran AKTIF — sistem
   * mendorong data keluar, bukan menunggu diminta.
   *
   * Sengaja tidak diberi default: yang lupa mengisinya harus ketahuan saat
   * compile, bukan saat email salah alamat sudah terkirim.
   */
  companyId: string
}

async function loadTargets(eventType: string, companyId: string): Promise<{ targets: RuleTarget[]; problem?: string }> {
  const { data, error } = await supabase
    .from('notification_rules')
    .select('is_active, notification_rule_targets ( target_type, role_name, permission_key )')
    .eq('event_type', eventType)
    .eq('company_id', companyId)
    .maybeSingle()

  if (error) return { targets: [], problem: `gagal baca aturan: ${error.message}` }
  if (!data) return { targets: [], problem: `tidak ada aturan untuk event '${eventType}'` }
  if (!data.is_active) return { targets: [] } // sengaja dimatikan founder — bukan masalah
  return { targets: (data.notification_rule_targets ?? []) as RuleTarget[] }
}

/**
 * Id user yang jadi anggota aktif sebuah company. Batas penerima notifikasi
 * adalah KEANGGOTAAN — `users` sengaja tak punya `company_id` (kategori D,
 * identitas lintas tenant, ADR-011 D6).
 */
async function anggotaCompany(companyId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('company_members').select('user_id')
    .eq('company_id', companyId).eq('is_active', true)
  if (error) {
    console.error('[notif-routing] gagal resolusi keanggotaan:', error.message)
    return []
  }
  return (data ?? []).map((m: { user_id: string }) => m.user_id)
}

async function usersWithRoles(roleNames: string[], idAnggota: string[]): Promise<Record<string, string[]>> {
  if (roleNames.length === 0 || idAnggota.length === 0) return {}
  const { data, error } = await supabase
    .from('users')
    .select('id, roles!inner(name)')
    .in('roles.name', roleNames)
    .in('id', idAnggota)
    .eq('is_active', true)

  if (error) {
    console.error('[notif-routing] gagal resolusi role:', error.message)
    return {}
  }
  const out: Record<string, string[]> = {}
  for (const r of roleNames) out[r] = []
  for (const u of (data ?? []) as { id: string; roles: { name: string } | { name: string }[] }[]) {
    const name = Array.isArray(u.roles) ? u.roles[0]?.name : u.roles?.name
    if (name && out[name]) out[name].push(u.id)
  }
  return out
}

async function usersWithPermissions(keys: string[], idAnggota: string[]): Promise<Record<string, string[]>> {
  if (keys.length === 0 || idAnggota.length === 0) return {}
  // user aktif → role_id → role_permissions → permissions.key
  const { data, error } = await supabase
    .from('role_permissions')
    .select('role_id, permissions!inner(key)')
    .in('permissions.key', keys)

  if (error) {
    console.error('[notif-routing] gagal resolusi permission:', error.message)
    return {}
  }
  const rolesByKey: Record<string, string[]> = {}
  for (const k of keys) rolesByKey[k] = []
  for (const rp of (data ?? []) as { role_id: string; permissions: { key: string } | { key: string }[] }[]) {
    const key = Array.isArray(rp.permissions) ? rp.permissions[0]?.key : rp.permissions?.key
    if (key && rolesByKey[key]) rolesByKey[key].push(rp.role_id)
  }

  const allRoleIds = [...new Set(Object.values(rolesByKey).flat())]
  if (allRoleIds.length === 0) return Object.fromEntries(keys.map(k => [k, [] as string[]]))

  const { data: users, error: uErr } = await supabase
    .from('users').select('id, role_id')
    .in('role_id', allRoleIds).in('id', idAnggota).eq('is_active', true)
  if (uErr) {
    console.error('[notif-routing] gagal resolusi user per role:', uErr.message)
    return Object.fromEntries(keys.map(k => [k, []]))
  }

  const usersByRole: Record<string, string[]> = {}
  for (const u of (users ?? []) as { id: string; role_id: string }[]) {
    (usersByRole[u.role_id] ??= []).push(u.id)
  }
  const out: Record<string, string[]> = {}
  for (const k of keys) {
    out[k] = [...new Set(rolesByKey[k].flatMap(rid => usersByRole[rid] ?? []))]
  }
  return out
}

/**
 * Siapa yang menerima notifikasi untuk sebuah event — dari KONFIGURASI, bukan kode.
 *
 * TIDAK PERNAH melempar: notifikasi wajib fire-and-forget dan tak boleh merusak
 * alur utama. Tapi juga TIDAK SUNYI — aturan yang hilang/gagal dibaca DICATAT.
 * Bug #47 (admin berhenti menerima notifikasi tanpa jejak) terjadi justru karena
 * kegagalan resolusi penerima tidak bersuara.
 *
 * Penjaga sesungguhnya ada di CI: test menolak event yang dipakai kode tapi tak
 * punya aturan aktif, jadi notifikasi yang hilang jadi MERAH sebelum rilis.
 */
export async function resolveRecipients(
  eventType: string,
  ctx: RoutingContext,   // T4g: TIDAK lagi punya default — companyId wajib
): Promise<string[]> {
  const { targets, problem } = await loadTargets(eventType, ctx.companyId)
  if (problem) {
    console.error(`[notif-routing] ${problem} — tidak ada penerima yang diresolusi`)
    return []
  }
  if (targets.length === 0) return []

  const need = requiredLookups(targets)

  // T4g: batas penerima = anggota company aktif. Sekali resolusi, dipakai
  // kedua jalur (role & permission).
  const idAnggota = await anggotaCompany(ctx.companyId)
  if (idAnggota.length === 0) {
    console.error(`[notif-routing] nol anggota aktif untuk company ${ctx.companyId}`)
    return []
  }

  const [byRole, byPermission, projectPm, projectMandors] = await Promise.all([
    usersWithRoles(need.roles, idAnggota),
    usersWithPermissions(need.permissions, idAnggota),
    need.needProjectPm && ctx.projectId
      ? supabase.from('projects').select('pm_id').eq('id', ctx.projectId).maybeSingle()
          .then(r => r.data?.pm_id ?? null)
      : Promise.resolve(null),
    need.needProjectMandors && ctx.projectId
      ? supabase.from('mandor_assignments').select('mandor_id')
          .eq('project_id', ctx.projectId).eq('status', 'active')
          .then(r => (r.data ?? []).map((a: { mandor_id: string }) => a.mandor_id))
      : Promise.resolve([] as string[]),
  ])

  const pools: Pools = { byRole, byPermission, projectPm, projectMandors }
  return mergeRecipients(targets, pools)
}
