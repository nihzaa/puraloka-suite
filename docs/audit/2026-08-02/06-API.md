# 06 — AUDIT API / ROUTE

## 6.1 Inventaris

- **49 file route** di `apps/api/src/routes/v1/`
- **198 deklarasi endpoint** (`.get/.post/.put/.patch/.delete`) di `routes/`; 205 termasuk di luar v1
- **286** pemakaian `requirePermission`, **372** kemunculan `preHandler`

Daftar file route (49):
`ahsp, approval-chains, assets, audit, auth, bids, cash, change-orders, clients,
companies, contracts, cost-control, dashboard, documents, estimate-versions, finance,
gl, inspeksi, kasbon-purposes, kasbons, kurva-s, lessons-learned, mandor, menu,
milestones, modules, notification-rules, notifications, price-book, procurement,
progress, projects, punch-list, rab-schedule, rab, rantai-kontrak, rap, reports, rfi,
roles, search, settings, submittal, termin-payment, units, users, wip, work-categories`

## 6.2 Endpoint "hantu" — didokumentasikan tapi tak ada / sebaliknya

**Temuan besar: `CLAUDE.md` mendokumentasikan ± 100 endpoint dari ~10 modul.
Kenyataannya ada 49 file route dengan 198 endpoint.** Modul yang **hidup di kode tapi
tak disebut sama sekali** di `CLAUDE.md`:

`gl` (Buku Besar), `wip`, `bids`, `assets`, `cost-control`, `rap`, `punch-list`, `rfi`,
`inspeksi`, `submittal`, `lessons-learned`, `rantai-kontrak`, `estimate-versions`,
`price-book`, `ahsp`, `companies`, `modules`, `menu`, `units`, `work-categories`,
`approval-chains`, `notification-rules`, `kasbon-purposes`.

Ini **23 modul tak terdokumentasi di dokumen yang dibaca agent tiap sesi** — penyebab
halusinasi paling produktif di repo ini. `docs/API_ENDPOINTS.md` (2026-08-01) jauh lebih
mutakhir dan seharusnya jadi rujukan, bukan `CLAUDE.md`.

Sebaliknya, endpoint yang didokumentasikan `CLAUDE.md` tapi **tidak diverifikasi masih ada**:
`BELUM DIVERIFIKASI` per-baris.

## 6.3 Auth & konsistensi

Lihat `04-SECURITY.md §4.2`: hanya **5 dari 198** endpoint tanpa `preHandler`, dan
kelimanya sah secara desain (4 auth + 1 verifikasi QR publik).

**Rasio auth coverage: 193/198 = 97,5%** — sangat tinggi.

## 6.4 Idempotensi operasi finansial

Ditemukan idempotensi eksplisit di lapis utilitas:
- `utils/approval.ts:115,133` — via `UNIQUE(entity_type, entity_id, level)`, `23505` = sukses
- `utils/penalty.ts:125` — denda tak dihitung dua kali
- `utils/audit.ts:15` — INSERT murni

**Tidak ditemukan** `Idempotency-Key` HTTP untuk pembayaran. Risiko double-submit pada
`POST /finance/invoice/:id/pay` dan `POST /procurement/supplier-payments`:
**BELUM DIVERIFIKASI** — perlu uji khusus. **P1.**

## 6.5 Belum diverifikasi

- Konsistensi bentuk response & kode error lintas 49 file: `BELUM DIVERIFIKASI`
- Persentase endpoint dengan schema validasi (zod/typebox/JSON schema): `BELUM DIVERIFIKASI`
- Pagination cap di seluruh list endpoint: `BELUM DIVERIFIKASI` (CLAUDE.md mengklaim cap 200)
- Versioning: seluruhnya `/api/v1` — konsisten secara prefiks.
