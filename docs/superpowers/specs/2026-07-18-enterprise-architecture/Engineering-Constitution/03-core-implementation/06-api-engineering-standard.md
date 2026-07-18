# 06 — API Engineering Standard

> **Maturity:** 🟡 Partial — pola REST + Fastify + `Bearer` auth sudah 100% konsisten di 159 endpoint existing, tapi permission check tersebar lewat tiga mekanisme paralel (gap yang didefinisikan Mandatory Rule #3) dan response envelope belum seragam di semua endpoint.

**Kedudukan:** Batch 3 — Implementasi Inti. Melengkapi [05-database-engineering-standard.md](05-database-engineering-standard.md) — file ini mengatur kontrak HTTP-layer, bukan skema data. Dirujuk oleh [07-security-engineering-standard.md](07-security-engineering-standard.md) untuk detail otorisasi per-endpoint.

---

## 1. Purpose

Menjaga konsistensi kontrak API (routing, auth, response shape, error format) di seluruh 25 route file supaya klien (web, mobile, portal client/mandor) bisa mengintegrasikan tanpa menghadapi kejutan pola berbeda per endpoint, dan supaya endpoint baru di Phase 2-9 mengikuti pola yang sama tanpa perlu didesain ulang tiap kali.

## 2. Background

Puraloka Suite hari ini punya 159 endpoint di 25 route file ([Phase1/00-current-state-audit.md § 1.4](../../Phase1/00-current-state-audit.md#14-call-site-inventory--requirepermission-103-pemanggilan-20-route-file)) — base path `/api/v1/`, auth via `Authorization: Bearer <token>` konsisten di seluruh endpoint terproteksi. Namun otorisasi diperiksa lewat **tiga mekanisme paralel** yang teraudit berbeda cakupannya: `requireRole` (4 call site), `requirePermission` (103 call site di 20 file), dan inline `.role === 'admin'` (57 kejadian di 11 file — [Phase1/00 § 1.5](../../Phase1/00-current-state-audit.md#15-call-site-inventory--inline-role--x-57-kejadian-11-file)). Ini adalah [Phase1/01-gap-analysis.md Gap 1](../../Phase1/01-gap-analysis.md#gap-1--permission-engine-tiga-mekanisme-paralel), gap tertinggi prioritas Sub-Fase 1A.

## 3. Principles

1. **Satu mekanisme otorisasi, dipanggil konsisten — bukan tiga jalur yang harus diperiksa manual satu-satu untuk yakin sebuah endpoint aman.** Konsolidasi ke `requirePermission()` sebagai satu-satunya titik masuk otorisasi adalah tujuan eksplisit Sub-Fase 1A ([Phase1/02 § 1A.1](../../Phase1/02-target-architecture.md#1a1-permission-engine-v2--desain-konsolidasi)).
2. **Response shape konsisten mengurangi kode defensif di klien.** Klien (web/mobile/portal) yang tahu setiap endpoint sukses mengembalikan `{ data, meta? }` dan setiap error mengembalikan `{ error: { message, code? } }` tidak perlu menulis parsing khusus per endpoint.
3. **Pagination cap adalah pertahanan wajib, bukan optimisasi opsional.** List endpoint tanpa cap (sudah diterapkan max 200 di endpoint finansial-kritis — CLAUDE.md § Security hardening, internal) berisiko response tak terbatas membebani database dan klien.

## 4. Mandatory Rules

1. Endpoint baru **MUST** ditempatkan di bawah prefix `/api/v1/<domain>` mengikuti [02-folder-architecture.md § Mandatory Rule #1](../01-foundations/02-folder-architecture.md#4-mandatory-rules) (satu file route per domain bisnis).
2. Setiap endpoint yang mengubah atau membaca data selain data publik (health check) **MUST** dilindungi otorisasi lewat `requirePermission(key)` — **MUST NOT** memakai `requireRole()` atau inline `.role === 'x'` untuk endpoint baru, sekalipun dua pola lama itu masih ada di kode existing (lihat Migration Strategy).
3. Endpoint sukses **MUST** mengembalikan body JSON berbentuk `{ data: ... }` (list) atau `{ data: ..., meta: {...} }` (jika ada metadata seperti pagination/EVM) — **MUST NOT** mengembalikan array/objek mentah tanpa pembungkus di endpoint baru.
4. Endpoint error **MUST** mengembalikan HTTP status code yang sesuai (400 validasi, 401 tidak terautentikasi, 403 tidak diotorisasi, 404 tidak ditemukan, 500 error server) beserta body `{ error: { message: string } }` — **MUST NOT** mengembalikan 200 dengan flag error di body untuk kegagalan yang jelas.
5. List endpoint **MUST** menerapkan pagination dengan cap maksimum eksplisit (preseden: 200 untuk endpoint finansial-kritis) — **MUST NOT** mengembalikan seluruh baris tabel tanpa batas atas.
6. Endpoint yang menyentuh data ter-scope proyek/company (mis. kasbon, invoice) **MUST** menegakkan ownership/scope check di level query (bukan hanya filter di response) — **MUST NOT** mengambil semua baris lalu memfilter di memori setelah query (kebocoran data lewat log/timing tetap terjadi meski hasil akhir difilter).

## 5. Recommended Rules

1. Endpoint yang menerima file upload **SHOULD** menerapkan cap ukuran file eksplisit di level route (preseden: 2MB XLSX, 5MB dokumen/nota — sudah konsisten diterapkan) sebelum memproses body.
2. Operasi finansial yang berpotensi di-retry oleh klien (mis. submit pembayaran) **SHOULD** dirancang idempotent ([GLOSSARY.md — Idempotency](../GLOSSARY.md)) begitu domain tersebut diperluas di Phase 2+ — belum ada keharusan retrofit endpoint existing.

## 6. Anti-Pattern

**Otorisasi Inline Tersebar** — pola `if (user.role === 'admin')` ditulis ulang di 57 lokasi berbeda ([Phase1/00 § 1.5](../../Phase1/00-current-state-audit.md#15-call-site-inventory--inline-role--x-57-kejadian-11-file)). Bahaya: mengubah aturan otorisasi ("PM sekarang juga boleh...") butuh mengedit puluhan lokasi tanpa jaminan semuanya konsisten — satu lokasi terlewat berarti celah keamanan diam-diam.

**Filter Setelah Fetch** — mengambil seluruh baris tabel lewat query tanpa `WHERE project_id = ...`, lalu memfilter di kode aplikasi berdasarkan ownership. Selain tidak efisien, ini bertentangan Mandatory Rule #6 — data yang seharusnya tidak boleh diakses user tertentu tetap melewati network/memory aplikasi sebelum difilter.

## 7. Example Good

```ts
// apps/api/src/routes/v1/kasbons.ts (pola nyata, PATCH /kasbons/:id/status)
fastify.patch('/kasbons/:id/status', {
  preHandler: requirePermission('kasbons:approve')
}, async (request, reply) => {
  // ownership check di level query: project_id dari kasbons langsung (migration 056)
  const { data } = await supabase.from('kasbons').select('project_id, ...').eq('id', id).single();
  // ...
  return reply.send({ data: updated });
});
```
Konsisten Mandatory Rule #2 (permission-based, bukan inline role), #3 (response `{ data }`), #6 (ownership check di query).

## 8. Example Bad

```ts
// Pola yang MASIH ada di beberapa file lama (existing, bukan untuk direplikasi)
if (request.user.role !== 'admin' && request.user.role !== 'pm') {
  return reply.code(403).send({ message: 'forbidden' }); // tidak dibungkus { error: {...} }
}
const { data } = await supabase.from('kasbons').select('*'); // tanpa filter project/scope
const filtered = data.filter(k => k.project_id === userProject); // filter setelah fetch
```
Melanggar Mandatory Rule #2 (inline role check), #4 (bentuk error tidak konsisten), #6 (filter setelah fetch, bukan di query). Dicatat sebagai kondisi existing yang sedang dikonsolidasi, bukan pola yang boleh ditiru untuk kode baru.

## 9. Migration Strategy

**Untuk Mandatory Rule #2 (satu mekanisme otorisasi)** — 🟡 Partial, migrasi aktif mengikuti [Phase1/03-migration-strategy.md § Migrasi 1A.1](../../Phase1/03-migration-strategy.md#migrasi-1a1--permission-engine-konsolidasi): endpoint existing yang masih memakai `requireRole`/inline role **tidak** wajib diubah serentak, tapi **MUST** dikonversi ke `requirePermission()` begitu file route tersebut disentuh untuk perubahan fungsional apa pun (event-driven migration, sama seperti [03-clean-architecture-rules.md](../02-architecture/03-clean-architecture-rules.md)). Endpoint **baru** **MUST** memakai `requirePermission()` sejak awal, tanpa pengecualian.

**Untuk Mandatory Rule #3, #4 (response shape)** — 🟡 Partial: sebagian besar endpoint sudah konsisten, belum diaudit menyeluruh terhadap 159 endpoint. Endpoint baru **MUST** patuh sejak commit pertama; audit menyeluruh endpoint lama dijadwalkan sebagai bagian Sub-Fase 1A tapi bukan blocker untuk endpoint baru.

**Untuk Mandatory Rule #1, #5, #6** — N/A, sudah konsisten diterapkan di endpoint existing yang diperiksa.

## 10. Checklist

- [ ] Endpoint baru pakai `requirePermission()`, bukan `requireRole`/inline role check
- [ ] Response sukses berbentuk `{ data, meta? }`
- [ ] Response error berbentuk `{ error: { message } }` dengan status code sesuai
- [ ] List endpoint punya pagination cap eksplisit
- [ ] Query menegakkan ownership/scope, bukan filter setelah fetch

## 11. Success Metrics

| Metric | Target | Cara Ukur |
|---|---|---|
| Endpoint baru yang memakai `requirePermission()` (bukan alternatif lain) | 100% | Code review checklist |
| Inline `.role === 'x'` call site tersisa | Menurun dari 57 baseline | Grep periodik `\.role\s*===` |
| List endpoint tanpa pagination cap | 0 endpoint baru | Code review checklist |

## 12. References

- [Phase1/00-current-state-audit.md § 1](../../Phase1/00-current-state-audit.md#1-permission-engine--current-state)
- [Phase1/01-gap-analysis.md § Gap 1](../../Phase1/01-gap-analysis.md#gap-1--permission-engine-tiga-mekanisme-paralel)
- [Phase1/02-target-architecture.md § 1A.1](../../Phase1/02-target-architecture.md#1a1-permission-engine-v2--desain-konsolidasi)
- [Phase1/03-migration-strategy.md § Migrasi 1A.1](../../Phase1/03-migration-strategy.md#migrasi-1a1--permission-engine-konsolidasi)
- [07-security-engineering-standard.md](07-security-engineering-standard.md)
- [02-architecture/03-clean-architecture-rules.md](../02-architecture/03-clean-architecture-rules.md)

---

*File selanjutnya: [07-security-engineering-standard.md](07-security-engineering-standard.md)*
