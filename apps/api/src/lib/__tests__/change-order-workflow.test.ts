import { describe, it, expect } from 'vitest'
import {
  mapChangeOrderStatusToWorkflowState,
  KNOWN_CHANGE_ORDER_STATUSES,
  CHANGE_ORDER_STATUS_TO_STATE,
} from '../change-order-workflow.js'

// Sub-Fase 1C — pemetaan status change_order → workflow state. MURNI, fail-loud (R7).

describe('mapChangeOrderStatusToWorkflowState', () => {
  it('memetakan keempat status (semua punya code path — beda dari kasbon)', () => {
    expect(mapChangeOrderStatusToWorkflowState('draft')).toBe('draft')
    expect(mapChangeOrderStatusToWorkflowState('submitted')).toBe('submitted')
    expect(mapChangeOrderStatusToWorkflowState('approved')).toBe('approved')
    expect(mapChangeOrderStatusToWorkflowState('rejected')).toBe('rejected')
  })

  it('THROW pada status tak dikenal (fail-loud, R7)', () => {
    expect(() => mapChangeOrderStatusToWorkflowState('cancelled')).toThrow(/tak dikenal/)
    expect(() => mapChangeOrderStatusToWorkflowState('')).toThrow()
    expect(() => mapChangeOrderStatusToWorkflowState('DRAFT')).toThrow() // case-sensitive
  })

  it('KNOWN_CHANGE_ORDER_STATUSES = kunci peta, persis 4 nilai CHECK constraint', () => {
    expect([...KNOWN_CHANGE_ORDER_STATUSES].sort()).toEqual(['approved', 'draft', 'rejected', 'submitted'])
    expect(Object.keys(CHANGE_ORDER_STATUS_TO_STATE).sort()).toEqual([...KNOWN_CHANGE_ORDER_STATUSES].sort())
  })
})
