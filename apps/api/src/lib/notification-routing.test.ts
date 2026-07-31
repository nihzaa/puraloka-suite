import { describe, it, expect } from 'vitest'
import { requiredLookups, mergeRecipients, type RuleTarget, type Pools } from './notification-routing.js'

const t = (
  target_type: RuleTarget['target_type'],
  role_name: string | null = null,
  permission_key: string | null = null,
): RuleTarget => ({ target_type, role_name, permission_key })

const pools = (over: Partial<Pools> = {}): Pools => ({
  byRole: {}, byPermission: {}, projectPm: null, projectMandors: [], ...over,
})

describe('requiredLookups — hanya cari yang benar-benar dibutuhkan', () => {
  it('mengumpulkan role & permission unik', () => {
    const l = requiredLookups([
      t('role', 'admin'), t('role', 'admin'), t('role', 'pm'),
      t('permission', null, 'mandor:kasbon:approve'),
    ])
    expect(l.roles.sort()).toEqual(['admin', 'pm'])
    expect(l.permissions).toEqual(['mandor:kasbon:approve'])
  })

  it('menandai kebutuhan konteks proyek', () => {
    const l = requiredLookups([t('project_pm'), t('project_mandors')])
    expect(l.needProjectPm).toBe(true)
    expect(l.needProjectMandors).toBe(true)
  })

  it('tanpa target kontekstual, konteks proyek tidak perlu dicari', () => {
    const l = requiredLookups([t('role', 'admin')])
    expect(l.needProjectPm).toBe(false)
    expect(l.needProjectMandors).toBe(false)
  })
})

describe('mergeRecipients — perilaku getProjectAdminsAndPM() lama harus terjaga', () => {
  it('admin + PM proyek digabung', () => {
    const r = mergeRecipients(
      [t('role', 'admin'), t('project_pm')],
      pools({ byRole: { admin: ['a1', 'a2'] }, projectPm: 'pm1' }),
    )
    expect(r.sort()).toEqual(['a1', 'a2', 'pm1'])
  })

  it('DEDUP: admin yang sekaligus PM proyek hanya dapat SATU notifikasi', () => {
    const r = mergeRecipients(
      [t('role', 'admin'), t('project_pm')],
      pools({ byRole: { admin: ['a1'] }, projectPm: 'a1' }),
    )
    expect(r).toEqual(['a1'])
  })

  it('dedup juga lintas role dan permission', () => {
    const r = mergeRecipients(
      [t('role', 'admin'), t('permission', null, 'x:y')],
      pools({ byRole: { admin: ['u1', 'u2'] }, byPermission: { 'x:y': ['u2', 'u3'] } }),
    )
    expect(r.sort()).toEqual(['u1', 'u2', 'u3'])
  })

  it('PM kosong (proyek tanpa PM) tidak menyisipkan penerima null', () => {
    const r = mergeRecipients(
      [t('role', 'admin'), t('project_pm')],
      pools({ byRole: { admin: ['a1'] }, projectPm: null }),
    )
    expect(r).toEqual(['a1'])
  })

  it('target menunjuk role yang tak punya user aktif → tidak menggagalkan target lain', () => {
    const r = mergeRecipients(
      [t('role', 'direktur'), t('project_pm')],
      pools({ byRole: { direktur: [] }, projectPm: 'pm1' }),
    )
    expect(r).toEqual(['pm1'])
  })

  it('tanpa target → tak ada penerima (bukan crash)', () => {
    expect(mergeRecipients([], pools())).toEqual([])
  })

  it('mandor proyek ikut bila targetnya diminta', () => {
    const r = mergeRecipients(
      [t('project_mandors')],
      pools({ projectMandors: ['m1', 'm2'] }),
    )
    expect(r).toEqual(['m1', 'm2'])
  })
})

describe('penyaringan anggota company untuk PM & mandor proyek', () => {
  // `mergeRecipients` sendiri TIDAK menyaring — ia memasukkan pool apa adanya.
  // Penyaringannya ada di `utils/notification-routing.ts` sebelum pool dibentuk.
  //
  // Kenapa itu perlu: `byRole`/`byPermission` sudah ter-scope keanggotaan sejak
  // awal, tapi `projectPm`/`projectMandors` diambil murni lewat projectId. Kalau
  // projectId milik tenant lain, PM/mandor tenant itu ikut menerima notifikasi
  // berisi nama proyek & nominal perusahaan yang salah.
  //
  // Test ini mengunci KONTRAK-nya: pool yang sudah tersaring diteruskan utuh,
  // dan yang null/kosong tidak menghasilkan penerima.

  it('projectPm null (bukan anggota) → tidak jadi penerima', () => {
    const hasil = mergeRecipients(
      [{ target_type: 'project_pm', role_name: null, permission_key: null }],
      { byRole: {}, byPermission: {}, projectPm: null, projectMandors: [] },
    )
    expect(hasil).toEqual([])
  })

  it('projectMandors kosong (semua bukan anggota) → tidak ada penerima', () => {
    const hasil = mergeRecipients(
      [{ target_type: 'project_mandors', role_name: null, permission_key: null }],
      { byRole: {}, byPermission: {}, projectPm: null, projectMandors: [] },
    )
    expect(hasil).toEqual([])
  })

  it('yang lolos saringan tetap diteruskan', () => {
    const hasil = mergeRecipients(
      [
        { target_type: 'project_pm', role_name: null, permission_key: null },
        { target_type: 'project_mandors', role_name: null, permission_key: null },
      ],
      { byRole: {}, byPermission: {}, projectPm: 'pm-1', projectMandors: ['m-1', 'm-2'] },
    )
    expect(hasil.sort()).toEqual(['m-1', 'm-2', 'pm-1'])
  })

  it('utils/notification-routing.ts BENAR-BENAR menyaring ke idAnggota', async () => {
    // Penjaga sumber. Uji perilaku di atas hanya menguji `mergeRecipients`,
    // yang memang tak menyaring — kalau penyaringan di pemanggilnya dihapus,
    // ketiga test di atas TETAP hijau sementara kebocorannya kembali.
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const isi = readFileSync(
      join(import.meta.dirname, '..', 'utils', 'notification-routing.ts'), 'utf8')
    expect(isi).toMatch(/const anggota = new Set\(idAnggota\)/)
    expect(isi).toMatch(/anggota\.has\(projectPm\)/)
    expect(isi).toMatch(/projectMandors\.filter\(\(id\) => anggota\.has\(id\)\)/)
  })
})
