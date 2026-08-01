import { FastifyRequest, FastifyReply } from 'fastify'
import { supabase, supabaseAuth } from '../utils/supabase.js'
import { createTenantDb, type TenantDb } from '../utils/tenant-db.js'

// Tipe untuk user yang sudah terautentikasi
export interface AuthUser {
  id: string
  auth_id: string
  name: string
  email: string
  phone: string | null
  role: string  // Dibuat string agar custom role (bukan hanya 4 built-in) bisa di-support
}

// Dekorasi request dengan user + permission cache + akses DB ber-scope company
declare module 'fastify' {
  interface FastifyRequest {
    currentUser?: AuthUser
    _permissionCache?: Set<string>  // lazy-loaded per-request, via get_role_permissions RPC
    /**
     * Akses database yang OTOMATIS ter-scope ke company aktif request ini.
     * Handler baru WAJIB memakai ini, bukan `import { supabase }` — lihat
     * ADR-011 §6. Handler lama tetap jalan (additive) supaya migrasi 240
     * call-site bisa bergelombang, bukan sekali tabrak.
     */
    db?: TenantDb
    /** Company aktif request ini. Undefined = belum terautentikasi. */
    companyId?: string
  }
}

/**
 * Resolusi company aktif untuk sebuah user.
 *
 * Presedens (ADR-011 §4): header `X-Company-Id` eksplisit (company switcher)
 * > keanggotaan default. Header hanya dihormati kalau user MEMANG anggota
 * company itu — kalau tidak, permintaan ditolak, bukan diam-diam jatuh ke
 * default (itu akan jadi jalur eskalasi hak akses).
 *
 * P1 (ADR-011 §9.5): TIDAK ADA cabang "kalau cuma ada satu company, pakai itu".
 * User tanpa keanggotaan = 403, bukan ditebak.
 */
interface Keanggotaan {
  company_id: string
  is_default: boolean | null
  role_id: string | null
  roles: { name: string } | { name: string }[] | null
}

/** Ambil nama peran dari embed Supabase (relasi many-to-one diketik array). */
function namaPeran(k: Keanggotaan): string | null {
  const e = k.roles
  return (Array.isArray(e) ? e[0] : e)?.name ?? null
}

// Di-export UNTUK DIUJI. Fungsi ini menentukan company aktif DAN peran yang
// dipakai seluruh `requirePermission` — menguji tiruannya (query yang ditulis
// ulang di file test) membuat mutasi pada fungsi asli lolos tanpa gejala.
// Terbukti: mengembalikan `role: peranGlobal` sempat tak membuat satu test pun
// merah. Yang diuji harus kode yang benar-benar dijalankan.
export async function resolveCompanyId(
  request: FastifyRequest,
  userId: string
): Promise<{ companyId: string; peran: string | null } | { error: string; status: number }> {
  const diminta = request.headers['x-company-id']
  const dimintaStr = Array.isArray(diminta) ? diminta[0] : diminta

  // `role_id` ikut diambil: peran bisa BERBEDA per company (ADR-011 D6) — lihat
  // catatan panjang di `authenticate()` soal kenapa peran global saja tak cukup.
  const { data, error } = await supabase
    .from('company_members')
    .select('company_id, is_default, role_id, roles:role_id ( name )')
    .eq('user_id', userId)
    .eq('is_active', true)

  if (error) {
    return { error: 'Gagal memuat keanggotaan perusahaan', status: 500 }
  }
  const keanggotaan = (data ?? []) as unknown as Keanggotaan[]
  if (keanggotaan.length === 0) {
    return {
      error: 'User belum terdaftar sebagai anggota perusahaan manapun',
      status: 403,
    }
  }

  if (dimintaStr) {
    const cocok = keanggotaan.find((k) => k.company_id === dimintaStr)
    if (!cocok) {
      // Bukan 404: user MEMINTA company yang bukan haknya. Menjawab "tidak
      // ditemukan" vs "bukan anggota" sama-sama menolak, tapi jangan diam-diam
      // melayani company lain.
      return { error: 'Anda bukan anggota perusahaan tersebut', status: 403 }
    }
    return { companyId: cocok.company_id, peran: namaPeran(cocok) }
  }

  const bawaan = keanggotaan.find((k) => k.is_default) ?? keanggotaan[0]
  return { companyId: bawaan.company_id, peran: namaPeran(bawaan) }
}

// Middleware: verifikasi token dari Authorization header atau HttpOnly cookie
export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization

  // Prioritas: Bearer header (untuk API clients) → HttpOnly cookie (untuk browser)
  let token: string | undefined
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.replace('Bearer ', '')
  } else if (request.cookies?.puraloka_token) {
    token = request.cookies.puraloka_token
  }

  if (!token) {
    return reply.status(401).send({ error: 'Token tidak ditemukan' })
  }

  // Verifikasi token via dedicated auth client (keeps service-role client clean for data queries)
  const { data: authData, error: authError } = await supabaseAuth.auth.getUser(token)

  if (authError || !authData.user) {
    return reply.status(401).send({ error: 'Token tidak valid atau sudah expired' })
  }

  // Ambil data user dari tabel users berdasarkan auth_id.
  // FASE 2 SWAP READ (1B.4): role di-resolve dari FK role_id (join roles.name),
  // fallback ke enum `role` jika role_id null (jaring pengaman, mustahil pasca-078).
  // Nilai `role` tetap berupa nama role (string) — kontrak get_role_permissions/RLS sama.
  // FASE 3 CONTRACT: role HANYA dari FK (kolom enum `role` di-drop). Supabase
  // mengetik embed sebagai array — ambil elemen pertama (relasi many-to-one).
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, auth_id, name, email, phone, role_id, roles:role_id ( name )')
    .eq('auth_id', authData.user.id)
    .single()

  if (userError || !user) {
    return reply.status(403).send({ error: 'User tidak terdaftar di sistem' })
  }

  const embed = user.roles as { name: string } | { name: string }[] | null | undefined
  const peranGlobal = (Array.isArray(embed) ? embed[0] : embed)?.name ?? ''

  // Resolusi company + pemasangan akses DB ber-scope.
  //
  // ⚠️ URUTAN INI LOAD-BEARING (ADR-011 §10 R4). Resolusi company WAJIB terjadi
  // SEBELUM loadPermissionCache() dipanggil pertama kali: cache permission
  // di-key oleh role, dan peran dibaca dari company_members (peran BISA berbeda
  // per company). Kalau cache terisi lebih dulu, request akan memakai permission
  // dari company yang salah — dan itu gagal DIAM-DIAM, bukan error. Jangan
  // pindahkan blok ini ke bawah tanpa membaca R4.
  const hasil = await resolveCompanyId(request, user.id)
  if ('error' in hasil) {
    return reply.status(hasil.status).send({ error: hasil.error })
  }

  // ── Peran = peran DI COMPANY AKTIF, bukan peran global ──────────────────────
  //
  // Komentar di atas dulu berbunyi "di masa depan peran dibaca dari
  // company_members". Masa depan itu sudah tiba di sisi SQL: migrasi 144
  // mengubah `auth_role()` — yang dipakai 100 RLS policy — jadi membaca
  // `company_members.role_id` untuk company aktif. Sisi API tidak ikut, jadi
  // dua lapis otorisasi memakai peran yang BERBEDA.
  //
  // Dibuktikan di dev (rollback), user `wardianto` peran global `mandor`
  // dinaikkan jadi `admin` HANYA di companynya:
  //   auth_role()      [100 RLS policy]   → admin
  //   currentUser.role [requirePermission] → mandor
  //
  // Salah ke DUA arah, dan arah kedua adalah eskalasi hak akses:
  //   • turun — di company ini `admin`, global `mandor` → API menolak pekerjaan
  //     yang memang haknya, sementara RLS mengizinkan. Terbaca sebagai bug UI.
  //   • naik  — global `admin`, di company ini `mandor` → API memberikan
  //     SELURUH 95 permission admin di badan usaha yang bukan wewenangnya
  //     (peran `mandor` hanya 11). Kewenangan menyeberang antar tenant.
  //
  // Fallback ke peran global adalah cabang MATI hari ini —
  // `company_members.role_id` NOT NULL (diverifikasi ke `pg_attribute`, bukan
  // dibaca dari migrasi). Ia sengaja dipertahankan karena `auth_role()` punya
  // fallback yang sama: dua lapis otorisasi harus jatuh dengan cara identik,
  // dan constraint itu bisa dilonggarkan kelak tanpa siapa pun ingat bahwa API
  // bergantung padanya. `t10-peran-per-company` menjaga alasannya tetap benar —
  // ia MERAH kalau NOT NULL dilepas, menagih uji nyata untuk cabang ini.
  //
  // User tanpa keanggotaan sama sekali tak sampai ke sini: `resolveCompanyId()`
  // sudah membalas 403 di atas (P1, ADR-011 §9.5 — tak ada cabang "tebak saja").
  request.currentUser = { ...user, role: hasil.peran ?? peranGlobal } as AuthUser

  request.companyId = hasil.companyId
  request.db = createTenantDb(hasil.companyId)
}

// Load permission set untuk role user ke cache per-request (sekali per request, no N+1).
// Return null jika RPC gagal (dibedakan dari "role tanpa permission" = Set kosong).
async function loadPermissionCache(request: FastifyRequest): Promise<Set<string> | null> {
  if (request._permissionCache) return request._permissionCache
  const { data, error } = await supabase.rpc('get_role_permissions', {
    role_name: request.currentUser!.role
  })
  if (error) return null
  request._permissionCache = new Set(
    (data ?? []).map((r: { permission_key: string }) => r.permission_key)
  )
  return request._permissionCache
}

// Guard preHandler: cek permission spesifik dari tabel role_permissions (RBAC modular).
// Permission cache di-load sekali per request via Supabase RPC, tidak ada N+1.
export function requirePermission(permissionKey: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.currentUser) {
      return reply.status(401).send({ error: 'Belum login' })
    }

    const cache = await loadPermissionCache(request)
    if (!cache) {
      return reply.status(500).send({ error: 'Gagal memuat permission' })
    }

    if (!cache.has(permissionKey)) {
      return reply.status(403).send({
        error: `Akses ditolak. Butuh permission: ${permissionKey}`
      })
    }
  }
}

// Cek permission secara programatik di DALAM body handler (bukan preHandler) —
// untuk authorization gate yang bergantung pada kondisi runtime (mis. action_type
// notifikasi). Mengembalikan boolean, tidak mengirim response. Fail-closed:
// return false jika belum login atau RPC gagal (ADR-004 Mandatory Rule #1).
export async function hasPermission(request: FastifyRequest, permissionKey: string): Promise<boolean> {
  if (!request.currentUser) return false
  const cache = await loadPermissionCache(request)
  if (!cache) return false
  return cache.has(permissionKey)
}