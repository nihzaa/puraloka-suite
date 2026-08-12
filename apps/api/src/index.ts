import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import jwt from '@fastify/jwt'
import cookie from '@fastify/cookie'
import rateLimit from '@fastify/rate-limit'
import multipart from '@fastify/multipart'
import dotenv from 'dotenv'
import { randomUUID } from 'node:crypto'
import projectRoutes from './routes/v1/projects.js'
import authRoutes from './routes/v1/auth.js'
import dashboardRoutes from './routes/v1/dashboard.js'
import aiRoutes from './routes/v1/ai.js'
import aiConfigRoutes from './routes/v1/ai-config.js'
import aiChatRoutes from './routes/v1/ai-chat.js'
import aiRetensiRoutes from './routes/v1/ai-retensi.js'
import waNomorRoutes, { waTemplateRoutes } from './routes/v1/wa-nomor.js'
import waWebhookRoutes from './routes/v1/wa-webhook.js'
import aiSetujuiRoutes from './routes/v1/ai-setujui.js'
import penyediaRoutes from './routes/v1/penyedia.js'
import otomasiAlurRoutes from './routes/v1/otomasi-alur.js'
import aiRiwayatRoutes from './routes/v1/ai-riwayat.js'
import keamananRoutes from './routes/v1/keamanan.js'
import mutuIkhtisarRoutes from './routes/v1/mutu-ikhtisar.js'
import aiTulisRoutes from './routes/v1/ai-tulis.js'
import kasbonRoutes from './routes/v1/kasbons.js'
import clientRoutes from './routes/v1/clients.js'
import userRoutes from './routes/v1/users.js'
import progressRoutes from './routes/v1/progress.js'
import milestoneRoutes from './routes/v1/milestones.js'
import rabRoutes from './routes/v1/rab.js'
import documentRoutes from './routes/v1/documents.js'
import contractRoutes from './routes/v1/contracts.js'
import kurvaSRoutes from './routes/v1/kurva-s.js'
import terminPaymentRoutes from './routes/v1/termin-payment.js'
import financeRoutes from './routes/v1/finance.js'
import cashRoutes from './routes/v1/cash.js'
import mandorRoutes from './routes/v1/mandor.js'
import reportsRoutes from './routes/v1/reports.js'
import settingsRoutes from './routes/v1/settings.js'
import situsRoutes from './routes/v1/situs.js'
import kredensialRoutes from './routes/v1/kredensial.js'
import jadwalRoutes from './routes/v1/jadwal.js'
import approvalInboxRoutes from './routes/v1/approval-inbox.js'
import companiesRoutes from './routes/v1/companies.js'
import rapRoutes from './routes/v1/rap.js'
import costControlRoutes from './routes/v1/cost-control.js'
import menuRoutes from './routes/v1/menu.js'
import moduleRoutes from './routes/v1/modules.js'
import notificationRoutes from './routes/v1/notifications.js'
import procurementRoutes from './routes/v1/procurement.js'
import rolesRoutes from './routes/v1/roles.js'
import changeOrderRoutes from './routes/v1/change-orders.js'
import punchListRoutes from './routes/v1/punch-list.js'
import ncrRoutes from './routes/v1/ncr.js'
import mutuRoutes from './routes/v1/mutu.js'
import rencanaMutuRoutes from './routes/v1/rencana-mutu.js'
import auditMutuRoutes from './routes/v1/audit-mutu.js'
import tarifPayrollRoutes from './routes/v1/tarif-payroll.js'
import timesheetStafRoutes from './routes/v1/timesheet-staf.js'
import payrollStafRoutes from './routes/v1/payroll-staf.js'
import cutiKaryawanRoutes from './routes/v1/cuti-karyawan.js'
import kompetensiSdmRoutes from './routes/v1/kompetensi-sdm.js'
import risikoProyekRoutes from './routes/v1/risiko-proyek.js'
import k3LapanganRoutes from './routes/v1/k3-lapangan.js'
import tutupBukuRoutes from './routes/v1/tutup-buku.js'
import penjurnalanOtomatisRoutes from './routes/v1/penjurnalan-otomatis.js'
import markupRoutes from './routes/v1/markup.js'
import baselineJadwalRoutes from './routes/v1/baseline-jadwal.js'
import apiKeyRoutes from './routes/v1/api-key.js'
import laporanSusunRoutes from './routes/v1/laporan-susun.js'
import susutMaterialRoutes from './routes/v1/susut-material.js'
import recycleBinRoutes from './routes/v1/recycle-bin.js'
import importerRoutes from './routes/v1/importer.js'
import absensiRoutes from './routes/v1/absensi.js'
import rekonsiliasiMaterialRoutes from './routes/v1/rekonsiliasi-material.js'
import rekonsiliasiBankRoutes from './routes/v1/rekonsiliasi-bank.js'
import transferStokRoutes from './routes/v1/transfer-stok.js'
import materialKlienRoutes from './routes/v1/material-klien.js'
import rfqRoutes from './routes/v1/rfq.js'
import riwayatHargaRoutes from './routes/v1/riwayat-harga.js'
import analisaKeterlambatanRoutes from './routes/v1/analisa-keterlambatan.js'
import asuransiRoutes from './routes/v1/asuransi.js'
import contingencyRoutes from './routes/v1/contingency.js'
import tenderSubkonRoutes from './routes/v1/tender-subkon.js'
import sertifikatIpcRoutes from './routes/v1/sertifikat-ipc.js'
import vendorKualifikasiRoutes from './routes/v1/vendor-kualifikasi.js'
import alatOperasionalRoutes from './routes/v1/alat-operasional.js'
import jadwalCpmRoutes from './routes/v1/jadwal-cpm.js'
import kendaliDokumenRoutes from './routes/v1/kendali-dokumen.js'
import kepatuhanK3Routes from './routes/v1/kepatuhan-k3.js'
import pengadaanLanjutanRoutes from './routes/v1/pengadaan-lanjutan.js'
import inspeksiRoutes from './routes/v1/inspeksi.js'
import lapanganRoutes from './routes/v1/lapangan.js'
import keuanganIkhtisarRoutes from './routes/v1/keuangan-ikhtisar.js'
import gudangIkhtisarRoutes from './routes/v1/gudang-ikhtisar.js'
import deretModulRoutes from './routes/v1/deret-modul.js'
import rfiRoutes from './routes/v1/rfi.js'
import submittalRoutes from './routes/v1/submittal.js'
import suratRoutes from './routes/v1/surat.js'
import instruksiLapanganRoutes from './routes/v1/instruksi-lapangan.js'
import rabScheduleRoutes from './routes/v1/rab-schedule.js'
import auditRoutes from './routes/v1/audit.js'
import searchRoutes from './routes/v1/search.js'
import unitsRoutes from './routes/v1/units.js'
import workCategoriesRoutes from './routes/v1/work-categories.js'
import kasbonPurposesRoutes from './routes/v1/kasbon-purposes.js'
import approvalChainRoutes from './routes/v1/approval-chains.js'
import notificationRuleRoutes from './routes/v1/notification-rules.js'
import estimateVersionRoutes from './routes/v1/estimate-versions.js'
import ahspRoutes from './routes/v1/ahsp.js'
import priceBookRoutes, { projectPriceOverrideRoutes } from './routes/v1/price-book.js'
import lessonsLearnedRoutes from './routes/v1/lessons-learned.js'
import bidRoutes from './routes/v1/bids.js'
import glRoutes from './routes/v1/gl.js'
import assetRoutes from './routes/v1/assets.js'
import rantaiKontrakRoutes from './routes/v1/rantai-kontrak.js'
import wipRoutes from './routes/v1/wip.js'
import { supabase } from './utils/supabase.js'
import { registerObservability } from './utils/observability.js'

dotenv.config()

if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET env var is required')

// ── Sub-Fase 1D.1 — Structured Logging (environment-aware) ───────────────────
// Production: JSON terstruktur ke stdout (TANPA transport pino-pretty) supaya bisa
// di-ingest log aggregator. Development: pino-pretty agar terbaca manusia.
// Ini perubahan KONFIGURASI, bukan ganti library — Pino sudah dipakai; pino-pretty
// hanya transport-nya.
//
// ⚠️ Risiko yang disadari (Phase1/03-migration-strategy.md § Migrasi 1D): kalau
// NODE_ENV tidak diset benar di server, log bisa berubah format tak terduga.
// Nilai NODE_ENV di-log eksplisit saat start (lihat blok listen) agar terverifikasi,
// bukan diasumsikan.
const isProduction = process.env.NODE_ENV === 'production'

const app = Fastify({
  logger: isProduction
    ? { level: process.env.LOG_LEVEL ?? 'info' }
    : {
        level: process.env.LOG_LEVEL ?? 'info',
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname'
          }
        }
      },
  // ── Sub-Fase 1D.2 — Correlation ID ─────────────────────────────────────────
  // Satu UUID per request, dipakai DUA konsumen: (1) korelasi log line,
  // (2) audit_logs.correlation_id. (Konsumen ke-3 workflow_instances dihapus saat
  // fase CONTRACT 1C — engine diretire, lihat ADR-006.)
  //
  // requestIdHeader:false WAJIB — default Fastify memakai header `request-id`
  // dari proxy/klien sebagai req.id (bisa non-UUID). Karena correlation_id kolom
  // bertipe uuid, req.id HARUS UUID → matikan trust header, genReqId selalu jalan.
  requestIdHeader: false,
  genReqId: () => randomUUID(),
})

await app.register(cors, {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true)
    const allowed = [
      /^http:\/\/localhost:\d+$/,
      /^http:\/\/192\.168\.\d+\.\d+:\d+$/,
      /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/,
    ]
    if (allowed.some(re => re.test(origin))) return cb(null, true)
    cb(new Error('Not allowed by CORS'), false)
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
})
await app.register(helmet, {
  crossOriginResourcePolicy: { policy: 'same-site' },
})
await app.register(cookie, {
  secret: process.env.COOKIE_SECRET ?? process.env.JWT_SECRET,
  parseOptions: {},
})
await app.register(rateLimit, {
  global: false,  // hanya apply ke route yang pakai config rateLimit
  max: 10,
  timeWindow: '1 minute',
  // `isRateLimit` dibaca oleh setErrorHandler untuk mengembalikan 429 (bukan 500).
  // Objek ini diteruskan apa adanya sebagai "error", tanpa statusCode — lihat
  // komentar di setErrorHandler.
  errorResponseBuilder: () => ({
    isRateLimit: true,
    error: 'Terlalu banyak percobaan, coba lagi dalam 1 menit',
  }),
})
await app.register(jwt, {
  secret: process.env.JWT_SECRET!
})
await app.register(multipart, {
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
})

// 1D.3 — instrumentasi OTel (opt-in via OTEL_ENABLED=true; default no-op).
// Didaftarkan SEBELUM route agar instrumentasi membungkus handler.
await registerObservability(app)

/**
 * Bentuk "error" yang benar-benar sampai ke setErrorHandler.
 *
 * Bukan hanya `Error`: @fastify/rate-limit meneruskan objek POLOS hasil
 * `errorResponseBuilder`, sehingga `message`/`statusCode`/`code` semuanya
 * undefined di sana. Menuliskan bentuk gabungan ini (alih-alih `any` di tiap
 * pembacaan) membuat TypeScript ikut menjaga: menambah cabang baru untuk
 * properti yang tak terdaftar di sini akan gagal kompilasi, bukan lolos diam.
 */
type ErrorMasuk = Partial<Error> & {
  statusCode?: number
  code?: string
  /** Ditempelkan sendiri di errorResponseBuilder — lihat registrasi rate-limit. */
  isRateLimit?: boolean
  /** Pesan siap-tampil dari errorResponseBuilder (bukan `message`). */
  error?: string
}

app.setErrorHandler((err: ErrorMasuk, _req, reply) => {
  // ⚠️ JANGAN tambahkan `?? reply.statusCode` di sini. Untuk `throw new Error(...)`
  // biasa, `err.statusCode` undefined DAN `reply.statusCode` masih 200 (belum
  // pernah di-set) — rantai itu menghasilkan 200, sehingga kesalahan server
  // sungguhan terkirim sebagai SUKSES. Kasus rate-limit yang dulu memotivasi
  // penambahan itu sudah ditangani cabang `isRateLimit` di bawah.
  // Dijaga test: `__tests__/rate-limit-429.test.ts`.
  const status = err.statusCode ?? 500
  // Body melebihi bodyLimit → pesan Fastify default berbahasa Inggris & teknis
  // ("Request body is too large"). Terjemahkan supaya user paham (upload foto/dokumen).
  if (err.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
    return reply.status(413).send({ error: 'Ukuran file terlalu besar untuk diunggah' })
  }
  // Rate limit (@fastify/rate-limit v11): plugin meneruskan objek polos hasil
  // `errorResponseBuilder` ke error handler — BUKAN instance Error. Akibatnya
  // `statusCode`, `code`, dan `message` semuanya undefined, sehingga `status`
  // jatuh ke 500 dan pesan "terlalu banyak percobaan" tertelan jadi "Internal
  // server error". User yang salah password beberapa kali lalu diblokir jadi
  // mengira passwordnya yang bermasalah, padahal ia hanya perlu menunggu.
  //
  // Penanda yang andal adalah `isRateLimit` yang kita tempelkan sendiri di
  // errorResponseBuilder (lihat registrasi plugin di bawah).
  if (err.isRateLimit) {
    return reply.status(429).send({ error: err.error })
  }
  if (status >= 500) {
    app.log.error(err)
    return reply.status(500).send({ error: 'Internal server error' })
  }
  return reply.status(status).send({ error: err.message })
})

// ── Sub-Fase 1D.3 — /health diperluas: cek konektivitas DB ───────────────────
// Sebelumnya /health hanya enumerasi route → selalu "ok" walau DB mati (health
// check yang tak pernah gagal tidak berguna untuk load balancer/uptime monitor).
// Sekarang benar-benar menyentuh DB dengan query murah + timeout, dan mengembalikan
// 503 bila DB tak terjangkau.
app.get('/health', async (_request, reply) => {
  const routes = app.printRoutes({ commonPrefix: false })
  const groups = [...new Set(
    routes.split('\n')
      .map(l => l.match(/\/api\/v1\/([^\/\s]+)/)?.[1])
      .filter((g): g is string => Boolean(g))
  )]

  // Query paling murah yang membuktikan koneksi hidup + RLS/PostgREST responsif.
  // Timeout eksplisit supaya /health tidak menggantung saat DB lambat.
  const startedAt = Date.now()
  let dbStatus: 'ok' | 'error' = 'ok'
  let dbError: string | undefined
  try {
    const probe = supabase.from('roles').select('id', { head: true, count: 'exact' }).limit(1)
    const timeout = new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error('db probe timeout 3s')), 3000))
    const { error } = await Promise.race([probe, timeout]) as { error?: { message: string } }
    if (error) { dbStatus = 'error'; dbError = error.message }
  } catch (e) {
    dbStatus = 'error'
    dbError = (e as Error).message
  }
  const dbLatencyMs = Date.now() - startedAt

  const healthy = dbStatus === 'ok'
  if (!healthy) reply.status(503)

  return {
    status: healthy ? 'ok' : 'degraded',
    app: 'Puraloka Suite API',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV ?? 'development',
    checks: {
      database: { status: dbStatus, latencyMs: dbLatencyMs, ...(dbError ? { error: dbError } : {}) },
    },
    routeGroups: groups,
  }
})

await app.register(authRoutes)
await app.register(projectRoutes)
await app.register(dashboardRoutes)
await app.register(aiRoutes)
await app.register(aiConfigRoutes)
await app.register(aiChatRoutes)
await app.register(aiRetensiRoutes)
await app.register(waNomorRoutes)
await app.register(waTemplateRoutes)
await app.register(waWebhookRoutes)
await app.register(aiSetujuiRoutes)
await app.register(penyediaRoutes)
await app.register(otomasiAlurRoutes)
await app.register(aiRiwayatRoutes)
await app.register(keamananRoutes)
await app.register(mutuIkhtisarRoutes)
await app.register(aiTulisRoutes)
await app.register(kasbonRoutes)
await app.register(clientRoutes)
await app.register(userRoutes)
await app.register(progressRoutes)
await app.register(milestoneRoutes)
await app.register(rabRoutes)
await app.register(documentRoutes)
await app.register(contractRoutes)
await app.register(kurvaSRoutes)
await app.register(terminPaymentRoutes)
await app.register(financeRoutes)
await app.register(cashRoutes)
await app.register(mandorRoutes)
await app.register(reportsRoutes)
await app.register(settingsRoutes)
await app.register(situsRoutes)
await app.register(kredensialRoutes)
await app.register(jadwalRoutes)
await app.register(approvalInboxRoutes)
await app.register(companiesRoutes)
await app.register(rapRoutes)
await app.register(costControlRoutes)
await app.register(menuRoutes)
await app.register(moduleRoutes)
await app.register(notificationRoutes)
await app.register(procurementRoutes)
await app.register(rolesRoutes)
await app.register(changeOrderRoutes)
await app.register(punchListRoutes)
await app.register(ncrRoutes)
await app.register(mutuRoutes)
await app.register(rencanaMutuRoutes)
await app.register(auditMutuRoutes)
await app.register(tarifPayrollRoutes)
await app.register(timesheetStafRoutes)
await app.register(payrollStafRoutes)
await app.register(cutiKaryawanRoutes)
await app.register(kompetensiSdmRoutes)
await app.register(risikoProyekRoutes)
await app.register(k3LapanganRoutes)
await app.register(tutupBukuRoutes)
await app.register(penjurnalanOtomatisRoutes)
await app.register(markupRoutes)
await app.register(baselineJadwalRoutes)
await app.register(apiKeyRoutes)
await app.register(laporanSusunRoutes)
await app.register(susutMaterialRoutes)
await app.register(recycleBinRoutes)
await app.register(importerRoutes)
await app.register(absensiRoutes)
await app.register(rekonsiliasiMaterialRoutes)
await app.register(rekonsiliasiBankRoutes)
await app.register(transferStokRoutes)
await app.register(materialKlienRoutes)
await app.register(rfqRoutes)
await app.register(riwayatHargaRoutes)
await app.register(analisaKeterlambatanRoutes)
await app.register(asuransiRoutes)
await app.register(contingencyRoutes)
await app.register(tenderSubkonRoutes)
await app.register(sertifikatIpcRoutes)
await app.register(vendorKualifikasiRoutes)
await app.register(alatOperasionalRoutes)
await app.register(jadwalCpmRoutes)
await app.register(kendaliDokumenRoutes)
await app.register(kepatuhanK3Routes)
await app.register(pengadaanLanjutanRoutes)
await app.register(inspeksiRoutes)
await app.register(lapanganRoutes)
await app.register(keuanganIkhtisarRoutes)
await app.register(gudangIkhtisarRoutes)
await app.register(deretModulRoutes)
await app.register(rfiRoutes)
await app.register(submittalRoutes)
await app.register(suratRoutes)
await app.register(instruksiLapanganRoutes)
await app.register(rabScheduleRoutes)
await app.register(auditRoutes)
await app.register(searchRoutes)
await app.register(unitsRoutes)
await app.register(workCategoriesRoutes)
await app.register(kasbonPurposesRoutes)
await app.register(approvalChainRoutes)
await app.register(notificationRuleRoutes)
await app.register(estimateVersionRoutes)
await app.register(ahspRoutes)
await app.register(priceBookRoutes)
await app.register(projectPriceOverrideRoutes)
await app.register(lessonsLearnedRoutes)
await app.register(bidRoutes)
await app.register(glRoutes)
await app.register(assetRoutes)
await app.register(rantaiKontrakRoutes)
await app.register(wipRoutes)

const PORT = Number(process.env.PORT) || 3001

try {
  const HOST = process.env.HOST ?? '127.0.0.1'
  await app.listen({ port: PORT, host: HOST })
  console.log(`\n🚀 Puraloka Suite API running on http://localhost:${PORT}`)
  console.log(`📋 Health check: http://localhost:${PORT}/health`)
  // 1D.1 — cetak NODE_ENV & mode logger secara eksplisit. Risiko yang disebut
  // migration-strategy adalah "NODE_ENV salah set diam-diam"; ini membuatnya
  // terverifikasi tiap start, bukan diasumsikan benar.
  console.log(`🔧 NODE_ENV=${process.env.NODE_ENV ?? '(unset → development)'} · logger=${isProduction ? 'json (production)' : 'pino-pretty (dev)'}`)

  // Print registered route groups so every restart is self-verifying
  const routes = app.printRoutes({ commonPrefix: false })
  const groups = [...new Set(
    routes.split('\n')
      .map(l => l.match(/\/api\/v1\/([^\/\s]+)/)?.[1])
      .filter(Boolean)
  )]
  console.log(`📡 Route groups: ${groups.join(', ')}\n`)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
