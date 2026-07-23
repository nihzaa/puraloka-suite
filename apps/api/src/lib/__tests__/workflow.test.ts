import { describe, it, expect } from 'vitest'
import {
  evaluateTransition,
  availableTransitions,
  computeSlaDeadline,
  isSlaBreached,
  type TransitionRule,
} from '../workflow.js'

// Sub-Fase 1C.2 — test engine workflow. evaluateTransition MURNI (tanpa DB),
// jadi seluruh keputusan bisa diuji deterministik.

const rule = (o: Partial<TransitionRule> & Pick<TransitionRule, 'fromState' | 'toState'>): TransitionRule => ({
  label: `${o.fromState}→${o.toState}`,
  requiredPermission: null,
  slaHours: null,
  escalationRole: null,
  approvalMode: 'sequential',
  ...o,
})

// Cermin workflow kasbon yang di-seed migration 081.
const kasbonRules: TransitionRule[] = [
  rule({ fromState: 'pending', toState: 'approved', requiredPermission: 'mandor:kasbon:approve' }),
  rule({ fromState: 'pending', toState: 'rejected', requiredPermission: 'mandor:kasbon:approve' }),
  rule({ fromState: 'approved', toState: 'settled', requiredPermission: 'mandor:kasbon:approve' }),
]

const approver = new Set(['mandor:kasbon:approve'])
const nobody = new Set<string>()

describe('evaluateTransition — jalur diizinkan', () => {
  it('mengizinkan transisi terdaftar bila permission dipenuhi', () => {
    const d = evaluateTransition(kasbonRules, 'pending', 'approved', approver)
    expect(d.allowed).toBe(true)
    if (d.allowed) expect(d.rule.toState).toBe('approved')
  })

  it('mengizinkan transisi tanpa requiredPermission (aksi sistem)', () => {
    const rules = [rule({ fromState: 'a', toState: 'b' })]
    expect(evaluateTransition(rules, 'a', 'b', nobody).allowed).toBe(true)
  })
})

describe('evaluateTransition — fail-closed', () => {
  it('menolak transisi yang TIDAK terdaftar (mis. pending → settled langsung)', () => {
    const d = evaluateTransition(kasbonRules, 'pending', 'settled', approver)
    expect(d.allowed).toBe(false)
    if (!d.allowed) expect(d.reason).toBe('invalid_transition')
  })

  it('menolak transisi mundur yang tak terdaftar (approved → pending)', () => {
    const d = evaluateTransition(kasbonRules, 'approved', 'pending', approver)
    expect(d.allowed).toBe(false)
    if (!d.allowed) expect(d.reason).toBe('invalid_transition')
  })

  it('menolak bila permission kurang, walau transisi terdaftar', () => {
    const d = evaluateTransition(kasbonRules, 'pending', 'approved', nobody)
    expect(d.allowed).toBe(false)
    if (!d.allowed) {
      expect(d.reason).toBe('missing_permission')
      expect(d.message).toContain('mandor:kasbon:approve')
    }
  })

  it('menolak bila workflow tidak punya aturan sama sekali (fail-closed, bukan izinkan)', () => {
    const d = evaluateTransition([], 'pending', 'approved', approver)
    expect(d.allowed).toBe(false)
    if (!d.allowed) expect(d.reason).toBe('unknown_workflow')
  })

  it('menolak state terminal yang tidak punya transisi keluar (rejected)', () => {
    const d = evaluateTransition(kasbonRules, 'rejected', 'approved', approver)
    expect(d.allowed).toBe(false)
  })
})

describe('evaluateTransition — cermin perilaku existing', () => {
  it('kasbon: pending→approved dan pending→rejected keduanya sah', () => {
    expect(evaluateTransition(kasbonRules, 'pending', 'approved', approver).allowed).toBe(true)
    expect(evaluateTransition(kasbonRules, 'pending', 'rejected', approver).allowed).toBe(true)
  })

  it('change order: hanya draft→submitted→approved/rejected yang sah', () => {
    const co: TransitionRule[] = [
      rule({ fromState: 'draft', toState: 'submitted', requiredPermission: 'projects:edit' }),
      rule({ fromState: 'submitted', toState: 'approved', requiredPermission: 'projects:edit' }),
      rule({ fromState: 'submitted', toState: 'rejected', requiredPermission: 'projects:edit' }),
    ]
    const editor = new Set(['projects:edit'])
    expect(evaluateTransition(co, 'draft', 'submitted', editor).allowed).toBe(true)
    // Lompat langsung draft→approved harus DITOLAK (cermin guard status!=='draft')
    expect(evaluateTransition(co, 'draft', 'approved', editor).allowed).toBe(false)
    // Approve ulang CO yang sudah approved harus ditolak
    expect(evaluateTransition(co, 'approved', 'approved', editor).allowed).toBe(false)
  })
})

describe('computeSlaDeadline', () => {
  it('null bila transisi tanpa SLA', () => {
    expect(computeSlaDeadline(rule({ fromState: 'a', toState: 'b' }))).toBeNull()
  })

  it('menghitung deadline = waktu mulai + slaHours', () => {
    const from = new Date('2026-07-23T00:00:00Z')
    const d = computeSlaDeadline(rule({ fromState: 'a', toState: 'b', slaHours: 48 }), from)
    expect(d?.toISOString()).toBe('2026-07-25T00:00:00.000Z')
  })

  it('slaHours 0 menghasilkan deadline = sekarang (bukan null)', () => {
    const from = new Date('2026-07-23T00:00:00Z')
    expect(computeSlaDeadline(rule({ fromState: 'a', toState: 'b', slaHours: 0 }), from)?.toISOString())
      .toBe('2026-07-23T00:00:00.000Z')
  })
})

describe('availableTransitions (untuk UI)', () => {
  it('hanya transisi dari state saat ini yang permission-nya dipenuhi', () => {
    const t = availableTransitions(kasbonRules, 'pending', approver)
    expect(t.map(r => r.toState).sort()).toEqual(['approved', 'rejected'])
  })

  it('kosong bila user tak punya permission (UI tak menampilkan tombol)', () => {
    expect(availableTransitions(kasbonRules, 'pending', nobody)).toHaveLength(0)
  })

  it('kosong dari state terminal', () => {
    expect(availableTransitions(kasbonRules, 'rejected', approver)).toHaveLength(0)
  })
})

describe('isSlaBreached', () => {
  const now = new Date('2026-07-23T12:00:00Z')

  it('false bila tanpa SLA', () => {
    expect(isSlaBreached(null, null, now)).toBe(false)
  })

  it('true bila lewat deadline & belum dieskalasi', () => {
    expect(isSlaBreached(new Date('2026-07-23T10:00:00Z'), null, now)).toBe(true)
  })

  it('false bila belum lewat deadline', () => {
    expect(isSlaBreached(new Date('2026-07-23T14:00:00Z'), null, now)).toBe(false)
  })

  it('false bila SUDAH dieskalasi (jangan eskalasi dua kali)', () => {
    expect(isSlaBreached(new Date('2026-07-23T10:00:00Z'), new Date('2026-07-23T11:00:00Z'), now)).toBe(false)
  })
})
