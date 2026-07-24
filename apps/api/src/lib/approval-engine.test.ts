import { describe, it, expect } from 'vitest'
import { applicableSteps, nextPendingStep, evaluateApproval, type ApprovalStep } from './approval-engine.js'

// Konfigurasi SEED (perilaku hari ini): tepat SATU langkah, tanpa syarat nominal.
const SINGLE: ApprovalStep[] = [
  { level: 1, required_permission: 'mandor:kasbon:approve', min_amount: null },
]
// Contoh berjenjang bersyarat: level 2 hanya bila nilai >= 50jt.
const TIERED: ApprovalStep[] = [
  { level: 1, required_permission: 'mandor:kasbon:approve', min_amount: null },
  { level: 2, required_permission: 'finance:approve:high', min_amount: 50_000_000 },
]

describe('applicableSteps — syarat nominal = DATA', () => {
  it('min_amount null selalu berlaku', () => {
    expect(applicableSteps(SINGLE, null).map(s => s.level)).toEqual([1])
    expect(applicableSteps(SINGLE, 1_000).map(s => s.level)).toEqual([1])
  })
  it('nilai DI BAWAH ambang → level bersyarat TIDAK berlaku', () => {
    expect(applicableSteps(TIERED, 10_000_000).map(s => s.level)).toEqual([1])
  })
  it('nilai DI ATAS/SAMA ambang → level bersyarat ikut berlaku', () => {
    expect(applicableSteps(TIERED, 50_000_000).map(s => s.level)).toEqual([1, 2])
    expect(applicableSteps(TIERED, 80_000_000).map(s => s.level)).toEqual([1, 2])
  })
  it('entitas tanpa nilai → langkah bersyarat nominal tak berlaku (tak terbukti memenuhi)', () => {
    expect(applicableSteps(TIERED, null).map(s => s.level)).toEqual([1])
  })
  it('selalu terurut level', () => {
    const acak: ApprovalStep[] = [
      { level: 3, required_permission: 'c', min_amount: null },
      { level: 1, required_permission: 'a', min_amount: null },
      { level: 2, required_permission: 'b', min_amount: null },
    ]
    expect(applicableSteps(acak, null).map(s => s.level)).toEqual([1, 2, 3])
  })
})

describe('nextPendingStep', () => {
  it('level pertama yang belum disetujui', () => {
    expect(nextPendingStep(TIERED, [])?.level).toBe(1)
    expect(nextPendingStep(TIERED, [1])?.level).toBe(2)
  })
  it('null bila semua sudah disetujui', () => {
    expect(nextPendingStep(TIERED, [1, 2])).toBeNull()
  })
})

describe('evaluateApproval — SATU langkah = perilaku hari ini (behavior-preserving)', () => {
  it('punya permission → BOLEH, dan ini langkah terakhir (entitas jadi approved)', () => {
    const d = evaluateApproval({ steps: SINGLE, amount: 5_000_000, approvedLevels: [], userPermissions: ['mandor:kasbon:approve'] })
    expect(d.allowed).toBe(true)
    expect(d.reason).toBe('ok')
    expect(d.isFinalStep).toBe(true)   // identik dgn requirePermission hari ini
    expect(d.step?.level).toBe(1)
  })
  it('TIDAK punya permission → DITOLAK (sama seperti 403 hari ini)', () => {
    const d = evaluateApproval({ steps: SINGLE, amount: 5_000_000, approvedLevels: [], userPermissions: ['lain:lain'] })
    expect(d.allowed).toBe(false)
    expect(d.reason).toBe('no_permission')
  })
})

describe('evaluateApproval — berjenjang bersyarat', () => {
  it('nilai kecil → cukup 1 langkah, langsung final', () => {
    const d = evaluateApproval({ steps: TIERED, amount: 10_000_000, approvedLevels: [], userPermissions: ['mandor:kasbon:approve'] })
    expect(d.allowed).toBe(true)
    expect(d.isFinalStep).toBe(true)
  })
  it('nilai besar → langkah 1 BUKAN final (masih perlu level 2)', () => {
    const d = evaluateApproval({ steps: TIERED, amount: 80_000_000, approvedLevels: [], userPermissions: ['mandor:kasbon:approve'] })
    expect(d.allowed).toBe(true)
    expect(d.isFinalStep).toBe(false)  // entitas BELUM approved
    expect(d.step?.level).toBe(1)
  })
  it('pemegang permission level 1 TIDAK bisa menyetujui level 2', () => {
    const d = evaluateApproval({ steps: TIERED, amount: 80_000_000, approvedLevels: [1], userPermissions: ['mandor:kasbon:approve'] })
    expect(d.allowed).toBe(false)
    expect(d.reason).toBe('no_permission')
    expect(d.step?.level).toBe(2)
  })
  it('pemegang permission level 2 menyetujui langkah terakhir → final', () => {
    const d = evaluateApproval({ steps: TIERED, amount: 80_000_000, approvedLevels: [1], userPermissions: ['finance:approve:high'] })
    expect(d.allowed).toBe(true)
    expect(d.isFinalStep).toBe(true)
  })
  it('sudah disetujui penuh → tak bisa disetujui lagi (cegah double-approve)', () => {
    const d = evaluateApproval({ steps: TIERED, amount: 80_000_000, approvedLevels: [1, 2], userPermissions: ['finance:approve:high'] })
    expect(d.allowed).toBe(false)
    expect(d.reason).toBe('already_approved')
  })
})

describe('FAIL-CLOSED (ADR-007)', () => {
  it('konfigurasi kosong → TOLAK, bukan loloskan', () => {
    const d = evaluateApproval({ steps: [], amount: 1, approvedLevels: [], userPermissions: ['apa:pun'] })
    expect(d.allowed).toBe(false)
    expect(d.reason).toBe('no_steps')
  })
  it('semua langkah bersyarat & nilai di bawah ambang → TOLAK (bukan auto-approve)', () => {
    const hanyaBersyarat: ApprovalStep[] = [{ level: 1, required_permission: 'x', min_amount: 100 }]
    const d = evaluateApproval({ steps: hanyaBersyarat, amount: 10, approvedLevels: [], userPermissions: ['x'] })
    expect(d.allowed).toBe(false)
    expect(d.reason).toBe('no_steps')
  })
})
