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

/**
 * Penerima per kunci izin.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ARAHNYA DIBALIK 2026-08-27 — DAN ITU YANG MEMPERBAIKI CACATNYA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Versi sebelumnya berjalan dari IZIN ke pengguna:
 *
 *     role_permissions (semua peran pemegang izin)  →  users
 *
 * Langkah pertama itu memulangkan TEPAT 1.000 baris — batas potong PostgREST,
 * tanpa galat dan tanpa penanda. Diukur 2026-08-27: `role_permissions` berisi
 * 229.612 baris dan 1.644 peran memegang `procurement:mr:manage`, sementara
 * `roles` sendiri 5.754 baris untuk 29 pengguna (suite test menyemai ulang set
 * peran bawaan tiap kali berjalan tanpa membersihkan yang lama, jadi nama yang
 * sama ada ribuan kali).
 *
 * Akibatnya: peran yang BENAR-BENAR dipakai orang — `mandor`, `pm`, `admin`,
 * ketiganya memang memegang izin itu — berada DI LUAR 1.000 pertama. Hasil
 * akhirnya nol penerima, dan notifikasi `stok_menipis` tak pernah terbit.
 * Tanpa satu pun galat: `data` terisi, `error` null.
 *
 * Arah yang benar dimulai dari yang JUMLAHNYA KECIL dan sudah terbatas:
 *
 *     anggota company aktif (puluhan)  →  peran mereka  →  izin peran itu
 *
 * `idAnggota` sudah dibatasi pemanggil ke anggota company aktif, jadi
 * himpunannya kecil sejak langkah pertama dan tak ada yang bisa terpotong.
 * Ini bukan sekadar menghindari batas 1.000 — ia juga membuang pekerjaan
 * memeriksa ribuan peran yang tak seorang pun memakainya.
 */
async function usersWithPermissions(keys: string[], idAnggota: string[]): Promise<Record<string, string[]>> {
  if (keys.length === 0 || idAnggota.length === 0) return {}

  /*
    Langkah 1 — pengguna aktif yang jadi anggota company. `idAnggota` datang
    dari `anggotaCompany()` dan sudah tersaring; inilah pagar jumlahnya.
  */
  const { data: users, error: uErr } = await supabase
    .from('users').select('id, role_id')
    .in('id', idAnggota).eq('is_active', true).not('role_id', 'is', null)
  if (uErr) {
    console.error('[notif-routing] gagal resolusi user per role:', uErr.message)
    return Object.fromEntries(keys.map(k => [k, []]))
  }

  /*
    Langkah 2 — izin dari peran yang BENAR-BENAR dipakai mereka. Daftar
    `role_id`-nya sebanyak-banyaknya sejumlah pengguna, jadi `.in()` di bawah
    tak pernah mendekati batas potong.
  */
  const roleDipakai = [...new Set((users ?? []).map((u: { role_id: string }) => u.role_id))]
  if (roleDipakai.length === 0) return Object.fromEntries(keys.map(k => [k, [] as string[]]))

  const { data, error } = await supabase
    .from('role_permissions')
    .select('role_id, permissions!inner(key)')
    .in('permissions.key', keys)
    .in('role_id', roleDipakai)

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

  // Saring PM & mandor proyek ke ANGGOTA company aktif.
  //
  // `byRole`/`byPermission` sudah ter-scope sejak awal (keduanya menerima
  // `idAnggota`), tapi dua pool ini diambil murni lewat `ctx.projectId` — dan
  // `mergeRecipients` memasukkannya apa adanya. Kalau projectId milik tenant
  // lain, PM/mandor tenant itu ikut jadi penerima notifikasi yang memuat nama
  // proyek dan nominal milik perusahaan yang salah.
  //
  // Hari ini belum bisa terjadi: seluruh pemanggil mengambil projectId dari
  // baris yang SUDAH lewat jalur ber-scope. Tapi itu berarti keamanannya
  // bergantung pada disiplin pemanggil, dan justru itu yang tak boleh —
  // seluruh alasan wrapper tenant ada adalah supaya lupa satu kali tidak
  // berakhir jadi kebocoran. Menyaring di sini membuatnya fail-closed.
  const anggota = new Set(idAnggota)
  const pools: Pools = {
    byRole,
    byPermission,
    projectPm: projectPm && anggota.has(projectPm) ? projectPm : null,
    projectMandors: projectMandors.filter((id) => anggota.has(id)),
  }
  return mergeRecipients(targets, pools)
}
