# ADR-004 — Permission adalah Arsitektur, Role adalah Konfigurasi

**Status:** Menunggu persetujuan founder
**Tanggal:** 2026-07-23
**Kedudukan:** Architecture Principle mengikat seluruh roadmap — bukan keputusan lokal Epic 3. Melengkapi [07-security-engineering-standard.md](../03-core-implementation/07-security-engineering-standard.md), [06-api-engineering-standard.md](../03-core-implementation/06-api-engineering-standard.md), dan [05-database-engineering-standard.md](../03-core-implementation/05-database-engineering-standard.md) dengan satu prinsip tunggal yang menyatukan aturan otorisasi yang sebelumnya tersebar di ketiganya.

---

## Konteks

Puraloka Suite menargetkan ERP enterprise (setara SAP/Oracle/Odoo — [00-vision-and-business-architecture.md](../../00-vision-and-business-architecture.md)) yang harus skalabel ke puluhan role bisnis, ratusan permission, dan ribuan pengguna dengan struktur organisasi yang berbeda per perusahaan — **tanpa mengubah source code setiap kali role baru muncul**.

Kode hari ini sudah 96% menuju sana: `role_permissions` + `get_role_permissions()` RPC + `requirePermission()` (migration 050) dipakai di 103 call site, dengan UI Role Management yang sudah interaktif (`apps/web/app/(dashboard)/pengaturan/roles/page.tsx`). Yang tersisa: 4 call site `requireRole('admin')` (Epic 3) dan RLS yang masih hardcode 4 role literal (Epic 4, gap tercatat di [00-vision-and-business-architecture.md:487](../../00-vision-and-business-architecture.md)).

Bahaya terbesar bukan pada 4 titik itu — melainkan **regresi di masa depan**: seorang developer di Epic 8, atau setahun dari sekarang, menulis `if (user.role === "finance")` dan diam-diam membocorkan fondasi yang sudah dibangun. ADR ini mengangkat prinsip dari "keputusan Epic 3" menjadi aturan permanen yang mengikat setiap Epic berikutnya, sehingga regresi seperti itu terdeteksi sebagai pelanggaran ADR, bukan pilihan gaya.

## Keputusan

> **Permission adalah bagian dari arsitektur. Role adalah data konfigurasi.**
>
> Permission merepresentasikan business capability. Role hanyalah pengelompokan permission, disimpan sebagai data. User menerima role (dan, ke depan, dapat menerima beberapa role + override permission per-user). Kode aplikasi dan RLS **hanya** mengenal permission — tidak pernah nama role.

## Principles

1. **Otorisasi diamankan berdasarkan capability, bukan identitas pelaku.** Pertanyaan desain yang sah adalah "capability apa yang diamankan endpoint/policy ini?", bukan "role mana yang boleh?" — yang terakhir adalah pertanyaan konfigurasi, bukan arsitektur.
2. **Permission stabil, role cair.** Permission key adalah kontrak jangka panjang yang dirujuk banyak subsistem; role bertambah/berubah bebas seiring organisasi berkembang. Memisahkan keduanya membuat pertumbuhan organisasi tidak menyentuh kode.
3. **Satu sumber kebenaran untuk otorisasi.** API layer dan RLS **MUST** sama-sama menurunkan keputusan dari `role_permissions` (via `requirePermission()` / `has_permission()`) — dua sistem otorisasi independen yang bisa divergen adalah akar Broken Access Control (A01) yang teridentifikasi di [Phase1/07-security-review.md](../../Phase1/07-security-review.md).

## Mandatory Rules

1. **Business logic MUST NOT mengotorisasi berdasarkan nama role.** Dilarang di seluruh kode aplikasi: `user.role === "<role>"`, `roles.includes("<role>")`, `requireRole(...)`, `switch (role)`, atau bentuk lain yang mencabang keputusan **otorisasi** dari literal nama role. Satu-satunya guard otorisasi yang diizinkan adalah `requirePermission("module:action")`. *(Verifikasi: grep CI `requireRole(` → 0 di `routes/`; code review checklist. Catatan: pembacaan `user.role` untuk keperluan **non-otorisasi** — mis. memilih portal default, pelabelan UI — tidak dilarang, tapi MUST diberi komentar eksplisit bahwa itu bukan authorization gate.)*
2. **RLS policy MUST NOT mengotorisasi berdasarkan literal nama role.** Dilarang `auth_role() = 'admin'`, `role IN ('admin','pm')`, dan sejenisnya. Policy **MUST** memanggil fungsi permission (`has_permission(auth.uid(), 'key')` atau ekuivalen). *(Verifikasi: gate di [05-database-engineering-standard.md § Success Metrics](../03-core-implementation/05-database-engineering-standard.md) — "RLS policy baru hardcode role string: target 0". Kode existing dimigrasikan di Epic 4.)*
3. **Permission MUST dinamai sebagai business capability, bukan jabatan.** `finance:tax:submit` ✅; `pm:approve`, `admin:delete`, `director:view` ❌ dilarang. *(Verifikasi: code review — nama key baru direview terhadap pola `module:resource:action`.)*
4. **Permission key adalah public contract — MUST NOT diganti setelah dipakai.** Sekali sebuah key dipublikasikan (dirujuk UI/API/RLS/audit/workflow/notifikasi/AI agent), key itu **MUST NOT** di-rename. Kebutuhan baru ditutup dengan **menambah** key baru dan mendeprekasi yang lama secara sadar — persis seperti versioning API endpoint. *(Verifikasi: code review — rename key = perubahan breaking, ditolak kecuali disertai deprecation plan eksplisit.)*
5. **Assignment permission↔role MUST berupa data, bukan kode.** Mapping hidup di `role_permissions`, diubah lewat UI Role Management. Seed di migration hanya bootstrap instalasi awal — **MUST NOT** diperlakukan atau didokumentasikan sebagai business rule permanen. *(Verifikasi: code review — tidak ada mapping role→permission hardcoded di luar migration seed.)*

## Recommended Rules

1. Business Role Catalog (role bisnis konkret seperti Tax Officer, Site Engineer, CFO) **SHOULD** dibuat sebagai data (`INSERT INTO roles` / UI), bukan bagian fondasi RBAC — dan **SHOULD** menunggu sampai RLS membaca `has_permission()` (Epic 4 selesai), karena role kustom sebelum itu mendapat cakupan RLS nol. Deviasi bisa diterima hanya untuk role yang aksesnya murni lewat API tanpa jalur RLS-enforced, dengan catatan risiko eksplisit.

## Anti-Pattern

- **Role-name authorization creep** — developer baru menulis `if (user.role === "finance")` untuk fitur baru karena terasa lebih cepat daripada mendefinisikan/mengecek permission key. Menggoda karena bekerja secara lokal dan lolos happy-path testing; berbahaya karena setiap kemunculannya membocorkan fondasi RBAC dan mengembalikan sistem ke otorisasi hardcode yang justru sedang dihapus. **Benar-benar ditemukan** di codebase ([Phase1/00-current-state-audit.md § 1.5](../../Phase1/00-current-state-audit.md)) — bukan hipotetis.
- **Permission-key churn** — mengganti nama key (`finance:tax:submit` → `finance:tax:report`) karena nama baru terasa lebih tepat. Berbahaya karena memutus rujukan diam-diam di subsistem lain (RLS, audit, AI agent) yang tidak ikut ter-rename.

## Example Good

```ts
// API — kode hanya kenal capability, bukan siapa pelakunya
app.patch('/api/v1/reports/rekap-pajak/:id/status', {
  preHandler: [authenticate, requirePermission('finance:tax:submit')]
}, handler)
```
```sql
-- RLS (target Epic 4) — policy memanggil fungsi permission, bukan literal role
CREATE POLICY tax_records_submit ON tax_records
  FOR UPDATE USING (has_permission(auth.uid(), 'finance:tax:submit'));
```

## Example Bad

```ts
// ❌ otorisasi dari nama role — dilarang Mandatory Rule #1
if (user.role === 'admin' || user.role === 'pm') { /* ... */ }
requireRole('admin')
```
```sql
-- ❌ RLS hardcode literal role — dilarang Mandatory Rule #2
CREATE POLICY ... USING (auth_role() IN ('admin', 'pm'));
```
(Kedua pola di atas benar-benar ada di kode saat ADR ditulis — `plugins/auth.ts:60` dan `049_rls_policies.sql` — dan adalah tepat yang dihapus Epic 3 & 4.)

## Migration Strategy

Kode existing yang melanggar: 4 call site `requireRole` (Epic 3) dan seluruh RLS literal role (Epic 4). Strategi migrasi sudah didefinisikan di [Phase1/03-migration-strategy.md](../../Phase1/03-migration-strategy.md) dan execution plan [Implementation-Kickoff/execution/epic-3-execution-plan.md](../../Implementation-Kickoff/execution/epic-3-execution-plan.md). ADR ini tidak menambah pekerjaan migrasi baru — ia mengunci agar setelah Epic 3+4 selesai, tidak ada regresi yang memasukkan pelanggaran baru.

## Compliance Checklist (Gate Review PR)

Dipakai langsung oleh reviewer sebagai gate merge — sebuah PR yang menyentuh otorisasi **MUST** lolos seluruh item ini sebelum merge. Reviewer cukup merujuk "ADR-004 compliance" tanpa mengulang diskusi filosofi RBAC. Di-mirror ke [15-code-review-checklist.md](../05-team-process/15-code-review-checklist.md) dan [20-checklist-before-merge.md](../05-team-process/20-checklist-before-merge.md).

- [ ] Tidak ada `requireRole(...)` di kode.
- [ ] Tidak ada `user.role === "..."` untuk authorization.
- [ ] Tidak ada `roles.includes("...")` / `switch(role)` untuk authorization.
- [ ] Pembacaan `user.role` non-otorisasi (jika ada) diberi komentar eksplisit "bukan authorization gate".
- [ ] Tidak ada literal nama role di RLS policy — pakai `has_permission()`.
- [ ] Permission baru merepresentasikan business capability (`module:resource:action`), bukan jabatan.
- [ ] Tidak ada permission key existing yang di-rename (hanya tambah/deprekasi).
- [ ] Seluruh authorization gate memakai `requirePermission(...)`; mapping role→permission hanya di `role_permissions`/UI.

## Success Metrics

| Metric | Target | Cara Ukur |
|---|---|---|
| Authorization gate berbasis nama role di `routes/` | 0 | grep CI `requireRole(`, review |
| RLS policy baru hardcode literal role | 0 | review migration, lihat [05 § Success Metrics](../03-core-implementation/05-database-engineering-standard.md) |
| Permission key di-rename setelah dipublikasi | 0 | review — rename = breaking change ditolak |

## References

- [00-vision-and-business-architecture.md](../../00-vision-and-business-architecture.md) — visi ERP enterprise, dan gap RLS↔RBAC (baris 487)
- [07-security-engineering-standard.md](../03-core-implementation/07-security-engineering-standard.md) — fail-closed, defense in depth
- [05-database-engineering-standard.md](../03-core-implementation/05-database-engineering-standard.md) — RLS standard, target 0 role-string
- [06-api-engineering-standard.md](../03-core-implementation/06-api-engineering-standard.md) — otorisasi endpoint
- [Implementation-Kickoff/execution/epic-3-execution-plan.md](../../Implementation-Kickoff/execution/epic-3-execution-plan.md) — penerapan pertama prinsip ini
- RFC 2119 — kata kunci MUST/SHOULD
