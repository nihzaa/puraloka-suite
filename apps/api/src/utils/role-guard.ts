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

  /*
    ── BATAS BARIS PostgREST MEMATIKAN PENJAGA INI (ditemukan 2026-08-14)

    Versi sebelumnya membaca SELURUH `role_permissions` tanpa paging. PostgREST
    memulangkan maksimal 1.000 baris secara diam-diam — tanpa galat, tanpa
    penanda terpotong. Tabelnya sudah 1.640 baris sejak katalog role konstruksi
    (migrasi 364), jadi 640 baris terakhir TAK PERNAH TERBACA.

    Akibatnya persis kebalikan dari yang dijaga: role yang sebenarnya memegang
    izin kritikal terbaca `permissionKeys: []`, penjaga menyimpulkan "tak ada
    yang kehilangan apa-apa", dan pencabutan diloloskan.

    Gejalanya berselang-seling — merah, hijau, merah pada tiga run berturut
    dengan keadaan basis yang IDENTIK. Yang bergeser bukan datanya melainkan
    baris mana yang kebetulan masuk 1.000 pertama, dan urutan fisik itu berubah
    setiap kali ada tulisan ke tabel. Cacat yang tampak seperti test flaky,
    padahal penjaganya yang bocor.

    Perbaikannya: ambil BERHALAMAN sampai habis, dan jangan pernah menganggap
    satu panggilan sudah memulangkan semuanya.

    Menaikkan `.limit()` ke angka besar ditolak sebagai perbaikan: itu hanya
    memindahkan ambangnya, dan cacat yang sama akan kembali diam-diam saat
    katalog role tumbuh lagi. Yang dihilangkan di sini adalah ASUMSI bahwa satu
    permintaan memulangkan seluruh tabel — asumsi itulah yang tak berbunyi saat
    salah.
  */
  const HALAMAN = 1000
  const rp: { role_id: string; permissions: unknown }[] = []
  for (let dari = 0; ; dari += HALAMAN) {
    const { data, error: rpErr } = await supabase
      .from('role_permissions')
      .select('role_id, permissions:permission_id ( key )')
      .order('role_id', { ascending: true })
      .range(dari, dari + HALAMAN - 1)
    if (rpErr) throw new Error(`role-guard: gagal baca role_permissions: ${rpErr.message}`)
    if (!data || data.length === 0) break
    rp.push(...(data as unknown as { role_id: string; permissions: unknown }[]))
    if (data.length < HALAMAN) break
  }

  /*
    Jumlah user aktif per `role_id` — juga berhalaman, dengan alasan yang sama.

    Tabel `users` hari ini masih puluhan baris, jadi batas 1.000 belum
    menggigit. Tapi ia akan menggigit persis seperti `role_permissions`
    menggigit: tanpa galat, tanpa penanda, dan pada pemasangan yang paling
    besar — pelanggan dengan pengguna terbanyak justru yang penjaganya bocor
    lebih dulu.
  */
  const activeByRole = new Map<string, number>()
  for (let dari = 0; ; dari += HALAMAN) {
    const { data, error: uErr } = await supabase
      .from('users')
      .select('role_id')
      .eq('is_active', true)
      .order('id', { ascending: true })
      .range(dari, dari + HALAMAN - 1)
    if (uErr) throw new Error(`role-guard: gagal baca users: ${uErr.message}`)
    if (!data || data.length === 0) break
    for (const u of data) {
      if (u.role_id) activeByRole.set(u.role_id as string, (activeByRole.get(u.role_id as string) ?? 0) + 1)
    }
    if (data.length < HALAMAN) break
  }

  const permsByRole = new Map<string, string[]>()
  for (const row of rp) {
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
