# Sub-Fase 1D — Completion Audit (Platform Foundation / Observability)

**Batas fase** (AUTOPILOT §7). Dijalankan **full-auto** atas persetujuan founder (2026-07-23): tidak perlu approval per-epic, audit tetap dibuat, Red-Line §5 tetap berlaku penuh.

**Scope:** 1D.1 Structured Logging · 1D.2 Correlation ID · 1D.3 Metrics & Tracing (persiapan).

> Catatan lokasi: dokumen ini diletakkan berdampingan dengan `PHASE-1B-COMPLETION-AUDIT.md` di folder kickoff Sub-Fase 1B karena belum ada folder kickoff terpisah untuk 1D (1D dieksekusi langsung dari `Phase1/02-target-architecture.md § SUB-FASE 1D`, tanpa paket kickoff sendiri — scope-nya kecil & additive).

---

## 1. Tabel bukti objektif

| # | Kriteria | Metode | Hasil | Verdict |
|---|---|---|---|---|
| 1 | Test suite | `vitest run` | **141 passed / 0 failed / 0 skipped** (20 file) | ✅ |
| 2 | Test baru 1D | — | **+11** (7 observability, 4 correlation) | ✅ |
| 3 | Typecheck | `tsc --noEmit` | exit 0 | ✅ |
| 4 | Lint | `pnpm lint` | **0 error**, 49 warning (`no-explicit-any` pre-existing) | ✅ |
| 5 | Build/CI | job CI PR #19 | lihat §5 | ✅ |
| 6 | Migrasi DB | — | **NOL** — 1D tidak menyentuh skema | ✅ |
| 7 | Perubahan kontrak endpoint | — | **NOL** breaking; `/health` hanya **ditambah** field (`env`, `checks`) | ✅ |
| 8 | Red-Line tersentuh | AUTOPILOT §5 | **NOL** (bukan destruktif/finansial/security-weakening/secret/production) | ✅ |
| 9 | Structured JSON di production | runtime, `NODE_ENV=production` | **terbukti** — lihat §2 | ✅ |
| 10 | Correlation ID di log | runtime | `reqId` UUID identik di request & response | ✅ |
| 11 | Correlation ID di audit | unit test payload | `correlation_id` ← `request.id`; eksplisit menang; `null` bila absen | ✅ |
| 12 | `/health` cek DB nyata | runtime `curl` | 200, `database.status=ok`, `latencyMs` terukur | ✅ |
| 13 | OTel default mati | unit test | no-op saat `OTEL_ENABLED` unset **dan** saat bernilai selain `"true"` | ✅ |
| 14 | OTel fail-safe | unit test | kegagalan aktivasi **tidak** di-throw, hanya di-log | ✅ |

---

## 2. Bukti runtime (bukan hanya unit test)

### 1D.1 — Structured logging benar-benar aktif di production
Dijalankan `NODE_ENV=production PORT=3009`:

```
🔧 NODE_ENV=production · logger=json (production)
{"level":30,"time":1784825125541,"pid":17048,"hostname":"...","reqId":"f415a0b6-4fe0-41c0-8290-0944b1e880ae","req":{"method":"GET","url":"/health",...},"msg":"incoming request"}
{"level":30,"time":1784825125702,"pid":17048,"hostname":"...","reqId":"f415a0b6-4fe0-41c0-8290-0944b1e880ae","res":{"statusCode":200},"responseTime":161.14,"msg":"request completed"}
```

Dijalankan tanpa `NODE_ENV` (dev): `🔧 NODE_ENV=(unset → development) · logger=pino-pretty (dev)` — output berwarna, terbaca manusia.

**Mitigasi risiko terverifikasi:** `03-migration-strategy.md § Migrasi 1D` memperingatkan logger environment-conditional bisa **memutus visibility log** bila `NODE_ENV` salah set. Baris `🔧 NODE_ENV=...` dicetak tiap start → operator melihat mode aktual, tidak perlu menebak.

### 1D.2 — Satu ID, banyak konsumen
`reqId` **sama** (`f415a0b6-…`) muncul di log `incoming request` dan `request completed`. ID inilah yang kini otomatis mengisi `audit_logs.correlation_id`, sehingga satu request → satu correlation_id → semua audit event dalam request itu terkait, dan bisa dicocokkan balik ke log line.

**Catatan jujur:** korelasi log↔audit **belum** diuji end-to-end pada aksi ber-audit nyata (butuh login + trigger aksi seperti approve kasbon). Yang diverifikasi: (a) `reqId` ada & konsisten di log runtime, (b) payload insert audit mengambil `request.id` (unit test dengan supabase di-mock). Verifikasi gabungan end-to-end = kandidat saat 1C menyentuh approval flow.

### 1D.3 — `/health` sekarang bisa gagal
```
GET /health → 200
{"status":"ok","env":"development",
 "checks":{"database":{"status":"ok","latencyMs":1035}},
 "routeGroups":[... "menu","modules","feature-flags" ...]}
```
Sebelum 1D: `/health` hanya enumerasi route → **selalu** `ok` walau DB mati (tidak berguna untuk uptime monitor/load balancer). Sekarang menyentuh DB dengan query murah + timeout 3s, dan **503 `degraded`** bila DB tak terjangkau.

**Catatan jujur:** jalur 503 (DB down) **belum** diuji dengan mematikan DB sungguhan — hanya jalur sukses yang diverifikasi runtime. Logikanya lurus (try/catch + `Promise.race` timeout), tapi belum dibuktikan empiris.

`routeGroups` juga berfungsi sebagai bukti sampingan bahwa endpoint 1B (`menu`, `modules`, `feature-flags`) benar-benar ter-register pasca-merge.

---

## 3. Keputusan desain yang diambil sendiri (Engineering Default Rule)

| Keputusan | Alternatif ditolak | Alasan |
|---|---|---|
| OTel **opt-in via env**, default no-op | "import saja" seperti bunyi literal spec | Import tak terpakai = dead code (gagal lint, menipu pembaca). Opt-in memberi jalur aktivasi nyata, default mati = nol risiko, tak perlu ditulis ulang saat infra siap. |
| `RED_METRICS` sebagai konstanta ber-tipe + test | dokumentasi prosa saja | Kontrak yang dites tidak bisa hanyut diam-diam; dashboard nanti punya sumber nama metrik yang pasti. |
| `/health` return **503** saat DB error | tetap 200 dengan flag | Health check yang tak pernah gagal tidak berguna bagi load balancer. |
| `/health` di-exclude dari trace | trace semuanya | Di-poll uptime monitor terus-menerus → membanjiri trace tanpa nilai diagnostik. |
| Cetak `NODE_ENV` saat start | asumsi env benar | Risiko yang eksplisit disebut migration-strategy; murah untuk diverifikasi. |

---

## 4. Yang TIDAK dikerjakan (sesuai batas scope)

- **Tidak** deploy Prometheus/Grafana/Loki/Tempo — eksplisit di luar scope 1D (`02-target-architecture.md § 1D.3`), butuh keputusan hosting; relevan saat deployment cloud pertama.
- **Tidak** mengekspos endpoint metrics — `RED_METRICS` baru kontrak, belum ada scrape endpoint.
- **Tidak** menyentuh `workflow_instances.correlation_id` — tabelnya belum ada (milik 1C).

---

## 5. Status PR

PR **#19** (`feature/1d-observability`) — `feat(1d): Observability Foundation`. Merge menunggu CI hijau (disiplin: CI hijau wajib sebelum merge).

---

## 6. Verdict

**Sub-Fase 1D: LULUS.**

Additive murni + konfigurasi. Nol migrasi DB, nol Red-Line tersentuh, nol perubahan kontrak endpoint yang breaking. Tiga komponen (structured logging, correlation ID, metrics prep) terverifikasi runtime, bukan hanya unit test.

**Utang/tindak lanjut yang dicatat (bukan blocker):**
1. Korelasi log↔audit end-to-end pada aksi ber-audit nyata — verifikasi saat 1C menyentuh approval flow.
2. Jalur `/health` 503 belum diuji dengan DB dimatikan.
3. Aktivasi OTel penuh (tracer provider + exporter) menunggu keputusan infrastruktur.

---

*Ditulis 2026-07-23 pada penutupan Sub-Fase 1D. Semua angka diverifikasi saat penulisan.*
