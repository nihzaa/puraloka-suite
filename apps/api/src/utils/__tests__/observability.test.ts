import { describe, it, expect, vi } from 'vitest'
import { RED_METRICS, registerObservability } from '../observability.js'

// Sub-Fase 1D.3 — test kontrak RED metrics + sifat opt-in/no-op registerObservability.

describe('RED_METRICS (kontrak, 1D.3)', () => {
  it('mendefinisikan tiga pilar RED: rate, errors, duration', () => {
    expect(Object.keys(RED_METRICS).sort()).toEqual(['errorRate', 'requestDuration', 'requestRate'])
  })

  it('nama metrik mengikuti konvensi OpenTelemetry/Prometheus (snake_case + satuan)', () => {
    expect(RED_METRICS.requestRate.name).toBe('http_server_requests_total')
    expect(RED_METRICS.errorRate.name).toBe('http_server_errors_total')
    expect(RED_METRICS.requestDuration.name).toBe('http_server_request_duration_seconds')
  })

  it('duration adalah histogram dengan bucket menaik (untuk p50/p95/p99)', () => {
    expect(RED_METRICS.requestDuration.type).toBe('histogram')
    const b = [...RED_METRICS.requestDuration.buckets]
    expect(b).toEqual([...b].sort((x, y) => x - y))
    expect(b.length).toBeGreaterThan(3)
  })

  it('setiap metrik punya label method+route (minimum untuk breakdown per endpoint)', () => {
    for (const m of Object.values(RED_METRICS)) {
      expect(m.labels).toContain('method')
      expect(m.labels).toContain('route')
    }
  })
})

describe('registerObservability (opt-in, 1D.3)', () => {
  it('no-op total saat OTEL_ENABLED tidak diset — nol registrasi plugin', async () => {
    const prev = process.env.OTEL_ENABLED
    delete process.env.OTEL_ENABLED
    const app = { register: vi.fn(), log: { info: vi.fn(), error: vi.fn() } }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await registerObservability(app as any)
    expect(app.register).not.toHaveBeenCalled()
    if (prev !== undefined) process.env.OTEL_ENABLED = prev
  })

  it('no-op saat OTEL_ENABLED bernilai selain "true" (fail-safe, tidak longgar)', async () => {
    const prev = process.env.OTEL_ENABLED
    process.env.OTEL_ENABLED = '1'
    const app = { register: vi.fn(), log: { info: vi.fn(), error: vi.fn() } }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await registerObservability(app as any)
    expect(app.register).not.toHaveBeenCalled()
    if (prev === undefined) delete process.env.OTEL_ENABLED; else process.env.OTEL_ENABLED = prev
  })

  it('kegagalan aktivasi TIDAK di-throw (API tetap jalan tanpa tracing)', async () => {
    const prev = process.env.OTEL_ENABLED
    process.env.OTEL_ENABLED = 'true'
    const app = {
      register: vi.fn().mockRejectedValue(new Error('otel boom')),
      log: { info: vi.fn(), error: vi.fn() },
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(registerObservability(app as any)).resolves.toBeUndefined()
    expect(app.log.error).toHaveBeenCalled()
    if (prev === undefined) delete process.env.OTEL_ENABLED; else process.env.OTEL_ENABLED = prev
  })
})
