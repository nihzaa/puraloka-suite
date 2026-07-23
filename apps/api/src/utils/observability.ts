// Observability — Sub-Fase 1D.3 (PERSIAPAN, bukan implementasi penuh).
//
// Cakupan yang DISENGAJA di 1D.3 (Phase1/02-target-architecture.md § 1D.3):
//   ✅ dependency @fastify/otel terpasang
//   ✅ kontrak RED metrics terdefinisi (lihat RED_METRICS di bawah)
//   ✅ jalur aktivasi tersedia & opt-in
//   ❌ TIDAK deploy Prometheus/Grafana/Loki/Tempo — butuh keputusan hosting,
//      di luar cakupan "Core Platform Foundation" (baru relevan saat deployment
//      cloud pertama).
//
// Kenapa opt-in (env flag) dan bukan import mati: import yang tidak dipakai =
// dead code (gagal lint, menipu pembaca). Modul ini memberi jalur aktivasi nyata
// yang DEFAULT MATI — nol risiko ke runtime hari ini, tapi tidak perlu ditulis
// ulang saat infrastruktur observability sudah ada.

import type { FastifyInstance } from 'fastify'

/**
 * Kontrak RED metrics (Rate, Errors, Duration) — didefinisikan sekarang sebagai
 * DOKUMENTASI KONTRAK supaya dashboard nanti tidak menebak-nebak nama metrik.
 * Belum diekspos; konsumen (Prometheus scrape endpoint) menyusul.
 */
export const RED_METRICS = {
  /** Rate — jumlah request per satuan waktu, dipecah per route & method. */
  requestRate: {
    name: 'http_server_requests_total',
    type: 'counter',
    labels: ['method', 'route', 'status_code'],
  },
  /** Errors — request yang berakhir 5xx (server error), bukan 4xx (client). */
  errorRate: {
    name: 'http_server_errors_total',
    type: 'counter',
    labels: ['method', 'route', 'status_code'],
  },
  /** Duration — histogram latensi request, untuk p50/p95/p99. */
  requestDuration: {
    name: 'http_server_request_duration_seconds',
    type: 'histogram',
    labels: ['method', 'route'],
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  },
} as const

/**
 * Aktifkan instrumentasi OpenTelemetry — HANYA jika `OTEL_ENABLED=true`.
 *
 * Default (env tak diset): no-op total, nol overhead, nol perubahan perilaku.
 * Saat infrastruktur tracing sudah ada, set env + pastikan tracer provider
 * terkonfigurasi (NodeSDK/exporter) di luar fungsi ini.
 *
 * Fail-safe: kegagalan aktivasi observability TIDAK BOLEH menjatuhkan API —
 * error hanya di-log lalu diabaikan.
 */
export async function registerObservability(app: FastifyInstance): Promise<void> {
  if (process.env.OTEL_ENABLED !== 'true') return

  try {
    const { default: FastifyOtelInstrumentation } = await import('@fastify/otel')
    const instrumentation = new FastifyOtelInstrumentation({
      // /health di-poll terus oleh uptime monitor — jangan banjiri trace.
      ignorePaths: (routeOpts) => routeOpts.url === '/health',
      recordExceptions: true,
    })
    await app.register(instrumentation.plugin())
    app.log.info('OpenTelemetry instrumentation aktif')
  } catch (err) {
    app.log.error({ err }, 'Gagal mengaktifkan OpenTelemetry — API tetap jalan tanpa tracing')
  }
}
