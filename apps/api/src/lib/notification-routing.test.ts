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
