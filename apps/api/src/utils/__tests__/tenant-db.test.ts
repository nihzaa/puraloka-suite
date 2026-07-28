import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================
// T4a — Wrapper tenant-db: scoping OTOMATIS per kategori tenancy.
//
// Diuji terhadap MOCK client, bukan DB nyata — yang diperiksa di sini adalah
// "filter apa yang dipasang", dan itu murni logika. Perilaku terhadap Postgres
// nyata (RLS dual-axis) diuji di T5.
//
// Yang dijaga (semuanya gagal-diam kalau tak diuji — dan gagal-diam di tenancy
// artinya data satu perusahaan terlihat perusahaan lain):
//   1. Kategori B/ANCHOR → eq(company_id)
//   2. Kategori AB       → NULL (bersama) OR milik sendiri — katalog nasional
//                          tetap terbaca, tapi milik tenant lain TIDAK
//   3. Kategori A        → tanpa filter (kosakata sistem)
//   4. Kategori C        → DITOLAK tanpa project_id (tak bisa lupa)
//   5. Kategori D        → DITOLAK, wajib lewat .unsafe() beralasan
//   6. INSERT            → company_id DIISI otomatis, bukan diingat pemanggil
//   7. P1                → companyId kosong = error keras, NOL fallback
// ============================================================

const jejak: Array<{ op: string; args: unknown[] }> = []

// Builder palsu yang merekam rantai pemanggilan, meniru bentuk Supabase.
function builderPalsu() {
  const rec: any = {}
  for (const m of ['select', 'insert', 'update', 'delete', 'upsert', 'eq', 'or', 'in', 'order']) {
    rec[m] = (...args: unknown[]) => {
      jejak.push({ op: m, args })
      return rec
    }
  }
  return rec
}

vi.mock('../supabase.js', () => ({
  supabase: {
    from: (nama: string) => {
      jejak.push({ op: 'from', args: [nama] })
      return builderPalsu()
    },
  },
  supabaseAuth: {},
}))

const { createTenantDb, TenantDbError } = await import('../tenant-db.js')

const COMPANY = '11111111-2222-3333-4444-555555555555'
const LAIN = '99999999-8888-7777-6666-555555555555'
const PROJECT = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

beforeEach(() => { jejak.length = 0 })

const filterTerpasang = () => jejak.filter((j) => j.op === 'eq' || j.op === 'or')

describe('P1 — tidak ada fallback "satu-satunya company"', () => {
  it('companyId null → error keras, bukan diam-diam pakai company yang ada', () => {
    expect(() => createTenantDb(null)).toThrow(TenantDbError)
    expect(() => createTenantDb(null)).toThrow(/tidak ada fallback/i)
  })

  it('companyId string kosong → ditolak', () => {
    expect(() => createTenantDb('')).toThrow(TenantDbError)
  })

  it('companyId bukan UUID → ditolak (mencegah string sembarang lolos jadi filter)', () => {
    expect(() => createTenantDb('company-1')).toThrow(/UUID/)
    expect(() => createTenantDb('1')).toThrow(/UUID/)
  })
})

describe('Kategori B & ANCHOR — milik tenant, filter wajib', () => {
  it('projects (ANCHOR) di-filter eq company_id', () => {
    createTenantDb(COMPANY).from('projects').select('*')
    expect(filterTerpasang()).toEqual([{ op: 'eq', args: ['company_id', COMPANY] }])
  })

  it('kasbons (B) di-filter eq company_id', () => {
    createTenantDb(COMPANY).from('kasbons').select('id, amount')
    expect(filterTerpasang()).toEqual([{ op: 'eq', args: ['company_id', COMPANY] }])
  })

  it('clients (B) di-filter — tenant lain TIDAK ikut terbaca', () => {
    createTenantDb(COMPANY).from('clients').select('*')
    const f = filterTerpasang()
    expect(f).toHaveLength(1)
    expect(f[0].args[1]).toBe(COMPANY)
    expect(f[0].args[1]).not.toBe(LAIN)
  })

  it('UPDATE juga di-filter — tak bisa mengubah baris tenant lain', () => {
    createTenantDb(COMPANY).from('kasbons').update({ status: 'approved' })
    expect(filterTerpasang()).toEqual([{ op: 'eq', args: ['company_id', COMPANY] }])
  })

  it('DELETE juga di-filter — tak bisa menghapus baris tenant lain', () => {
    createTenantDb(COMPANY).from('kasbons').delete()
    expect(filterTerpasang()).toEqual([{ op: 'eq', args: ['company_id', COMPANY] }])
  })
})

describe('Kategori AB — katalog bersama + milik sendiri', () => {
  it('assemblies: NULL (nasional, milik bersama) ATAU milik tenant ini', () => {
    createTenantDb(COMPANY).from('assemblies').select('*')
    expect(filterTerpasang()).toEqual([
      { op: 'or', args: [`company_id.is.null,company_id.eq.${COMPANY}`] },
    ])
  })

  it('filter AB menyebut company SENDIRI, bukan company lain', () => {
    createTenantDb(COMPANY).from('price_book_entries').select('*')
    const f = filterTerpasang()[0].args[0] as string
    expect(f).toContain(COMPANY)
    expect(f).not.toContain(LAIN)
    // `is.null` WAJIB ada — tanpa itu katalog AHSP nasional (2.620 baris,
    // company_id NULL) hilang dari pandangan semua tenant.
    expect(f).toContain('company_id.is.null')
  })
})

describe('Kategori A — kosakata sistem, tanpa scope', () => {
  it('units tidak diberi filter tenancy', () => {
    createTenantDb(COMPANY).from('units').select('*')
    expect(filterTerpasang()).toEqual([])
  })

  it('permissions tidak diberi filter tenancy', () => {
    createTenantDb(COMPANY).from('permissions').select('key')
    expect(filterTerpasang()).toEqual([])
  })
})

describe('Kategori C — mewarisi lewat project, TIDAK BISA lupa project_id', () => {
  it('from() menolak tabel C dan menyebut jalan keluarnya', () => {
    const db = createTenantDb(COMPANY)
    expect(() => db.from('invoices')).toThrow(/viaProject/)
    expect(() => db.from('milestones')).toThrow(/viaProject/)
  })

  it('pesan errornya menjelaskan AKIBAT, bukan cuma "salah pakai"', () => {
    const db = createTenantDb(COMPANY)
    expect(() => db.from('invoices')).toThrow(/tenant lain/)
  })

  it('viaProject memasang filter project_id', () => {
    createTenantDb(COMPANY).viaProject('invoices', PROJECT).select('*')
    expect(filterTerpasang()).toEqual([{ op: 'eq', args: ['project_id', PROJECT] }])
  })

  it('viaProject menolak projectId kosong/bukan UUID', () => {
    const db = createTenantDb(COMPANY)
    expect(() => db.viaProject('invoices', '')).toThrow(TenantDbError)
    expect(() => db.viaProject('invoices', 'bukan-uuid')).toThrow(/UUID/)
  })

  it('tabel C berhop-jauh memakai kolom FK yang benar, bukan asal project_id', () => {
    // estimate_versions mewarisi lewat scenario_id → scenarios.project_id.
    // Kalau wrapper asal memakai 'project_id', query-nya error kolom tak ada —
    // peta generated menyimpan kolom yang benar justru untuk kasus ini.
    createTenantDb(COMPANY).viaProject('estimate_versions', PROJECT).select('*')
    const f = filterTerpasang()
    expect(f).toHaveLength(1)
    expect(f[0].args[0]).toBe('scenario_id')
  })
})

describe('Kategori D — identitas/platform, wajib eksplisit', () => {
  it('from("users") DITOLAK — keanggotaan lewat company_members, bukan kolom', () => {
    const db = createTenantDb(COMPANY)
    expect(() => db.from('users')).toThrow(/unsafe/)
  })

  it('from("audit_logs") DITOLAK dari jalur otomatis', () => {
    const db = createTenantDb(COMPANY)
    expect(() => db.from('audit_logs')).toThrow(/kategori D/)
  })
})

describe('unsafe() — escape hatch yang sengaja tidak nyaman', () => {
  it('menolak tanpa alasan', () => {
    const db = createTenantDb(COMPANY)
    expect(() => db.unsafe('users', '')).toThrow(/alasan/)
  })

  it('menolak alasan basa-basi yang terlalu pendek', () => {
    const db = createTenantDb(COMPANY)
    expect(() => db.unsafe('users', 'perlu')).toThrow(/min 10/)
  })

  it('lolos dengan alasan bermakna, dan TIDAK memasang filter', () => {
    const db = createTenantDb(COMPANY)
    db.unsafe('users', 'lookup identitas lintas-tenant saat login').select('*')
    expect(filterTerpasang()).toEqual([])
  })
})

describe('INSERT — company_id diisi otomatis, bukan diingat pemanggil', () => {
  it('baris baru kategori B lahir bertuan tanpa disebut pemanggil', () => {
    createTenantDb(COMPANY).from('kasbons').insert({ amount: 500000 })
    const ins = jejak.find((j) => j.op === 'insert')
    expect(ins?.args[0]).toEqual({ amount: 500000, company_id: COMPANY })
  })

  it('insert massal: SEMUA baris dapat company_id', () => {
    createTenantDb(COMPANY).from('kasbons').insert([{ amount: 1 }, { amount: 2 }])
    const ins = jejak.find((j) => j.op === 'insert')
    expect(ins?.args[0]).toEqual([
      { amount: 1, company_id: COMPANY },
      { amount: 2, company_id: COMPANY },
    ])
  })

  it('company_id eksplisit dari pemanggil TIDAK ditimpa (jalur impor katalog bersama)', () => {
    // Ada kasus sah menulis baris milik bersama: impor AHSP nasional menulis
    // company_id: null dengan sengaja. Wrapper tak boleh membajaknya.
    createTenantDb(COMPANY).from('assemblies').insert({ code: 'X', company_id: null })
    const ins = jejak.find((j) => j.op === 'insert')
    expect((ins?.args[0] as any).company_id).toBeNull()
  })

  it('INSERT tidak diberi filter — filter pada insert tak bermakna', () => {
    createTenantDb(COMPANY).from('kasbons').insert({ amount: 1 })
    expect(filterTerpasang()).toEqual([])
  })

  it('kategori A tidak disisipi company_id (kosakata sistem tak bertuan)', () => {
    createTenantDb(COMPANY).from('units').insert({ code: 'm2' })
    const ins = jejak.find((j) => j.op === 'insert')
    expect(ins?.args[0]).toEqual({ code: 'm2' })
  })
})

describe('Isolasi antar-instance', () => {
  it('dua tenant menghasilkan filter yang berbeda — nol kebocoran state', () => {
    createTenantDb(COMPANY).from('kasbons').select('*')
    const a = filterTerpasang()[0].args[1]
    jejak.length = 0
    createTenantDb(LAIN).from('kasbons').select('*')
    const b = filterTerpasang()[0].args[1]
    expect(a).toBe(COMPANY)
    expect(b).toBe(LAIN)
    expect(a).not.toBe(b)
  })
})
