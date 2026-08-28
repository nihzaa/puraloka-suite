// ============================================================
// TENANT-DB — pembungkus akses database yang men-scope query per company.
//
// MASALAH YANG DISELESAIKAN (ADR-011 §6):
//   240 call-site `supabase.from(...)` di 38 file. Konvensi ("jangan lupa
//   filter company_id") TIDAK akan berhasil — satu kelupaan adalah kepastian
//   statistik, bukan risiko. Karena itu scoping dibuat OTOMATIS di satu tempat,
//   dan yang tidak bisa di-scope otomatis dibuat GAGAL COMPILE, bukan gagal diam.
//
// TIGA PINTU, sengaja beda nama supaya terlihat di code review:
//   db.from(tabel)          → scoping OTOMATIS sesuai kategori tenancy
//   db.shared(tabel)        → katalog bersama, TANPA scoping. Hanya menerima
//                             tabel kategori A/AB — `shared('projects')` TIDAK COMPILE.
//   db.unsafe(tabel, alasan)→ escape hatch. Wajib alasan tertulis, di-log,
//                             di-grep CI. Namanya sengaja tidak nyaman.
//
// P1 (ADR-011 §9.5): tidak ada DEFAULT_COMPANY_ID, tidak ada cabang "kalau cuma
// satu company". companyId yang kosong = error keras, bukan fallback diam-diam.
// ============================================================
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from './supabase.js'
import { PETA_TENANCY, type TabelTerklasifikasi } from './tenant-map.generated.js'

type Peta = typeof PETA_TENANCY

/** Tabel yang boleh lewat `.shared()` — hanya katalog bersama (A/AB). */
export type TabelBersama = {
  [K in keyof Peta]: Peta[K]['kategori'] extends 'A' | 'AB' ? K : never
}[keyof Peta]

/** Tabel kategori C — mewarisi tenancy lewat project, WAJIB menyebut project. */
export type TabelViaProject = {
  [K in keyof Peta]: Peta[K]['kategori'] extends 'C' ? K : never
}[keyof Peta]

export class TenantDbError extends Error {
  constructor(pesan: string) {
    super(pesan)
    this.name = 'TenantDbError'
  }
}

/**
 * Kenapa scoping dipasang di `.select()`/`.update()`/`.delete()` dan BUKAN
 * langsung di `.from()`: Supabase mensyaratkan operasi (select/insert/update/
 * delete) dipilih lebih dulu — `.from(x).eq(...)` bukan API yang sah. Jadi
 * pembungkus ini mengembalikan objek tipis yang meneruskan ke builder asli
 * SETELAH menyisipkan filter tenancy.
 *
 * Bentuk pemakaian tetap sama dengan kode existing, hanya `supabase` → `db`:
 *   supabase.from('kasbons').select('*').eq('id', id)   ← sebelum
 *   db.from('kasbons').select('*').eq('id', id)         ← sesudah (auto-scoped)
 *
 * `.insert()` diperlakukan khusus: nilai company_id DIISIKAN, bukan difilter —
 * baris baru lahir langsung bertuan, tak perlu diingat pemanggil.
 */
//
// Tipe: `ScopedTable` MENIRU bentuk builder Supabase agar inferensi hasil query
// tetap hidup di pemanggil. Kalau ia dibiarkan `any`, setiap `.reduce((s, x) =>
// …)` di 38 file kehilangan tipe dan harus dianotasi tangan satu per satu —
// biaya yang menular ke seluruh codebase hanya karena pembungkus ini.
type BuilderSupabase = ReturnType<SupabaseClient['from']>

export interface ScopedTable {
  select: BuilderSupabase['select']
  insert: BuilderSupabase['insert']
  update: BuilderSupabase['update']
  delete: BuilderSupabase['delete']
  upsert: BuilderSupabase['upsert']
}

/**
 * Query builder ber-scope.
 */
export interface TenantDb {
  readonly companyId: string

  /**
   * Akses ber-scope otomatis.
   *   B      → .eq('company_id', companyId)
   *   AB     → .or('company_id.is.null,company_id.eq.<id>')  (bersama + milik sendiri)
   *   ANCHOR → .eq('company_id', companyId)
   *   A      → tanpa filter (katalog bersama; pakai .shared() agar niatnya eksplisit)
   *   C      → DITOLAK di sini; pakai .viaProject() karena butuh project_id
   *   D      → DITOLAK di sini; pakai .unsafe() dengan alasan
   */
  from(tabel: TabelTerklasifikasi): ScopedTable

  /** Katalog bersama semua tenant. Tidak menerima tabel ber-tenant (gagal compile). */
  shared(tabel: TabelBersama): ReturnType<SupabaseClient['from']>

  /**
   * Tabel kategori C: tenancy diwarisi lewat project. Pemanggil WAJIB menyebut
   * project mana — tanpa itu tenancy tak dapat ditentukan dan query akan
   * mengembalikan data lintas tenant.
   */
  viaProject(tabel: TabelViaProject, projectId: string): ScopedTable

  /**
   * Escape hatch. Dipakai HANYA bila tiga pintu di atas tidak cocok (mis. query
   * admin lintas-tenant, atau tabel D). Alasan wajib & tercatat.
   */
  unsafe(tabel: string, alasan: string): ReturnType<SupabaseClient['from']>

  /** Client mentah — untuk .rpc()/.storage yang tak punya konsep tabel. */
  readonly raw: SupabaseClient

  /**
   * Daftar id project milik company ini.
   *
   * Dipakai untuk menyaring tabel kategori C pada layar LINTAS-PROYEK (dashboard
   * keuangan, laporan, search) — di sana tak ada satu project sebagai konteks,
   * jadi `viaProject()` tidak berlaku. Pola: `.in('project_id', await
   * db.projectIds())`.
   *
   * Di-memo per instance (satu instance = satu request), jadi 10 query kategori C
   * dalam satu handler tetap sekali hit DB.
   */
  projectIds(): Promise<string[]>

  /**
   * Daftar id invoice milik company ini — untuk tabel C yang mewarisi lewat
   * invoice (`payments`, `invoice_line_items`, `invoice_penalties`).
   * Pola: `.in('invoice_id', await db.invoiceIds())`.
   */
  invoiceIds(): Promise<string[]>

  /**
   * Daftar id work_scope milik company ini — untuk tabel C berhop-jauh yang
   * mewarisi lewat work_scope → mandor_assignment → project
   * (`progress_payments`, `borongan_settlements`, `daily_wage_logs`).
   */
  workScopeIds(): Promise<string[]>

  /**
   * Daftar id mandor_assignment milik company ini — untuk `weekly_wage_reports`.
   */
  assignmentIds(): Promise<string[]>
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Bungkus satu tabel: setiap operasi baca/ubah otomatis dapat filter tenancy,
 * dan setiap operasi tulis otomatis dapat nilai company_id.
 *
 * `filter` dipasang SETELAH .select()/.update()/.delete() karena di situlah
 * Supabase mulai menerima kondisi. INSERT tidak difilter — ia diisi.
 */
function scoped(
  tabel: string,
  filter: (q: any) => any,
  opsi: { isiCompanyId: boolean },
  companyId?: string,
  klien: SupabaseClient = supabase
): ScopedTable {
  const t = () => (klien.from as (n: string) => any)(tabel)
  const isi = (nilai: any) => {
    if (!opsi.isiCompanyId || !companyId) return nilai
    // Nilai eksplisit dari pemanggil TIDAK ditimpa — ada kasus sah menulis
    // baris milik bersama (company_id: null) pada tabel AB, mis. jalur impor
    // katalog nasional. Yang dijamin di sini: tidak ada baris lahir TANPA
    // keputusan sadar soal kepemilikan.
    const pasang = (o: any) =>
      o && typeof o === 'object' && !('company_id' in o) ? { ...o, company_id: companyId } : o
    return Array.isArray(nilai) ? nilai.map(pasang) : pasang(nilai)
  }
  return {
    select: (kolom?: string, o?: any) => filter(t().select(kolom as any, o)),
    insert: (nilai: any, o?: any) => t().insert(isi(nilai), o),
    upsert: (nilai: any, o?: any) => t().upsert(isi(nilai), o),
    update: (nilai: any, o?: any) => filter(t().update(nilai, o)),
    delete: (o?: any) => filter(t().delete(o)),
  }
}

/**
 * Buat instance ber-scope untuk satu company.
 *
 * @throws TenantDbError bila companyId kosong / bukan UUID. Ini DISENGAJA keras:
 * bug tenancy yang gagal diam-diam adalah kebocoran data; yang gagal keras
 * adalah error 500 yang langsung terlihat. (ADR-011 §6 lapis 3)
 */
export function createTenantDb(
  companyId: string | null | undefined,
  klien: SupabaseClient = supabase
): TenantDb {
  if (!companyId || !UUID_RE.test(companyId)) {
    throw new TenantDbError(
      `createTenantDb butuh companyId berupa UUID, dapat: ${JSON.stringify(companyId)}. ` +
        'Tidak ada fallback "pakai satu-satunya company yang ada" — jalan pintas itu ' +
        'membuat jalur multi-tenant tak pernah teruji sampai tenant kedua muncul ' +
        'di produksi (ADR-011 §9.5 P1).'
    )
  }

  const entri = (tabel: string) =>
    (PETA_TENANCY as Record<string, { kategori: string } | undefined>)[tabel]

  let memoProjectIds: Promise<string[]> | null = null
  let memoInvoiceIds: Promise<string[]> | null = null
  let memoScopeIds: Promise<string[]> | null = null
  let memoAssignmentIds: Promise<string[]> | null = null

  /** Ambil kolom `id` dari tabel, disaring `kolom IN (nilai)`. Fail-loud. */
  const idsVia = async (tabel: string, kolom: string, nilai: string[]) => {
    if (nilai.length === 0) return []
    const { data, error } = await klien.from(tabel).select('id').in(kolom, nilai)
    if (error) throw new TenantDbError(`Gagal memuat id ${tabel}: ${error.message}`)
    return (data ?? []).map((r: { id: string }) => r.id)
  }

  return {
    companyId,
    raw: klien,

    projectIds() {
      memoProjectIds ??= (async () => {
        const { data, error } = await klien
          .from('projects').select('id').eq('company_id', companyId)
        if (error) {
          // Fail-loud: mengembalikan [] akan membuat handler menampilkan "nol
          // data" seolah tenant memang tak punya proyek — kesalahan yang
          // menyamar jadi keadaan normal.
          throw new TenantDbError(`Gagal memuat daftar project tenant: ${error.message}`)
        }
        return (data ?? []).map((r: { id: string }) => r.id)
      })()
      return memoProjectIds
    },

    invoiceIds() {
      memoInvoiceIds ??= (async () => idsVia('invoices', 'project_id', await this.projectIds()))()
      return memoInvoiceIds
    },

    assignmentIds() {
      memoAssignmentIds ??= (async () =>
        idsVia('mandor_assignments', 'project_id', await this.projectIds()))()
      return memoAssignmentIds
    },

    workScopeIds() {
      memoScopeIds ??= (async () =>
        idsVia('work_scopes', 'assignment_id', await this.assignmentIds()))()
      return memoScopeIds
    },

    from(tabel) {
      const e = entri(tabel)
      if (!e) {
        throw new TenantDbError(
          `Tabel '${tabel}' belum terklasifikasi tenancy. Jalankan ` +
            '`node scripts/gen-tenant-map.mjs emit` setelah menambah tabel, dan ' +
            'pastikan kategorinya benar (ADR-011 §5).'
        )
      }
      switch (e.kategori) {
        case 'B':
        case 'ANCHOR':
          return scoped(tabel, (q) => q.eq('company_id', companyId), { isiCompanyId: true }, companyId, klien)
        case 'AB':
          // NULL = baris acuan milik bersama (mis. 2.620 AHSP nasional);
          // terisi = milik tenant ini. Keduanya sah dibaca tenant ini.
          // INSERT: diisi companyId — baris baru buatan tenant adalah miliknya,
          // bukan tambahan ke katalog bersama.
          return scoped(tabel, (q) => q.or(`company_id.is.null,company_id.eq.${companyId}`),
            { isiCompanyId: true }, companyId, klien)
        case 'A':
          return scoped(tabel, (q) => q, { isiCompanyId: false }, undefined, klien)
        case 'C':
          throw new TenantDbError(
            `'${tabel}' mewarisi tenancy lewat project — pakai db.viaProject('${tabel}', projectId). ` +
              'Tanpa project_id, query ini akan mengembalikan baris milik tenant lain.'
          )
        case 'D':
          throw new TenantDbError(
            `'${tabel}' kategori D (identitas/platform) — scoping-nya khusus. ` +
              `Pakai db.unsafe('${tabel}', '<alasan>') dan jelaskan bagaimana tenancy dijaga.`
          )
        default:
          throw new TenantDbError(`Kategori tenancy tak dikenal untuk '${tabel}': ${e.kategori}`)
      }
    },

    shared(tabel) {
      return klien.from(tabel)
    },

    viaProject(tabel, projectId) {
      if (!projectId || !UUID_RE.test(projectId)) {
        throw new TenantDbError(
          `viaProject('${tabel}') butuh projectId berupa UUID, dapat: ${JSON.stringify(projectId)}.`
        )
      }
      const e = entri(tabel)
      const kolom = (e as { lewat?: string } | undefined)?.lewat ?? 'project_id'
      return scoped(tabel, (q) => q.eq(kolom, projectId), { isiCompanyId: false }, undefined, klien)
    },

    unsafe(tabel, alasan) {
      if (!alasan || alasan.trim().length < 10) {
        throw new TenantDbError(
          `db.unsafe('${tabel}') wajib menyebut alasan yang bermakna (min 10 karakter). ` +
            'Alasan ini dibaca saat review dan saat audit tenancy.'
        )
      }
      return klien.from(tabel)
    },
  }
}
