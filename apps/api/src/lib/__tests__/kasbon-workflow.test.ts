import { describe, it, expect } from 'vitest'
import {
  mapKasbonStatusToWorkflowState,
  KNOWN_KASBON_STATUSES,
  KASBON_STATUS_TO_STATE,
} from '../kasbon-workflow.js'

// Sub-Fase 1C — pemetaan status kasbon → workflow state. MURNI, fail-loud (R7).

describe('mapKasbonStatusToWorkflowState', () => {
  it('memetakan keempat status enum kasbon ke state yang sama', () => {
    expect(mapKasbonStatusToWorkflowState('pending')).toBe('pending')
    expect(mapKasbonStatusToWorkflowState('approved')).toBe('approved')
    expect(mapKasbonStatusToWorkflowState('rejected')).toBe('rejected')
    expect(mapKasbonStatusToWorkflowState('settled')).toBe('settled')
  })

  it('THROW pada status tak dikenal (fail-loud, bukan default diam-diam)', () => {
    expect(() => mapKasbonStatusToWorkflowState('void')).toThrow(/tak dikenal/)
    expect(() => mapKasbonStatusToWorkflowState('')).toThrow()
    expect(() => mapKasbonStatusToWorkflowState('PENDING')).toThrow() // case-sensitive
  })

  it('KNOWN_KASBON_STATUSES = kunci peta, mencakup persis 4 nilai enum', () => {
    expect([...KNOWN_KASBON_STATUSES].sort()).toEqual(['approved', 'pending', 'rejected', 'settled'])
    expect(Object.keys(KASBON_STATUS_TO_STATE).sort()).toEqual([...KNOWN_KASBON_STATUSES].sort())
  })

  it('pesan error mengarahkan ke perbaikan eksplisit (bukan pesan generik)', () => {
    expect(() => mapKasbonStatusToWorkflowState('xyz')).toThrow(/KASBON_STATUS_TO_STATE|eksplisit|R7/)
  })
})
