# Architecture Remediation 3.5 — Inline Role-Based Authorization

**Status:** Architecture Remediation — bukan feature, enhancement, atau technical debt biasa, melainkan hasil **Architecture Compliance Audit terhadap ADR-004** di akhir Epic 3 ([epic-3-execution-plan.md § 9](epic-3-execution-plan.md)). Dipisah dari Epic 3 secara sadar (keputusan founder) agar kontrak scope Epic 3 ("4 call site `requireRole`") tetap utuh. Alur: **Epic 3 → Compliance Audit → Architecture Remediation 3.5 → Epic 4.**

**Sumber prinsip:** [ADR-004](../../Engineering-Constitution/adr/ADR-004-permission-is-architecture-role-is-configuration.md). Dokumen ini adalah penerapan lanjutan, bukan aturan baru.

---

## Konteks

Epic 3 menghapus 4 `requireRole('admin')` di preHandler route. Audit kepatuhan ADR-004 setelahnya menemukan bahwa `requireRole` bukan satu-satunya jalur otorisasi berbasis role literal — ada `user.role === '...'` dan `['admin','pm'].includes(user.role)` **di dalam body handler**. Audit per-titik (bukan angka kasar) mengklasifikasikan 57 pembacaan `user.role` jadi tiga kategori; hanya sebagian kecil yang benar-benar authorization gate.

## Klasifikasi Final (audit per titik, ADR-004)

### A. Authorization murni — MUST migrasi (3 titik, semua pakai key existing)

| File:baris | Endpoint | Kode | Permission key (sudah ada) |
|---|---|---|---|
| `notifications.ts:154` | POST `/notifications/:id/action` (approve/reject kasbon) | `if(!['admin','pm'].includes(role)) return 403` | `mandor:kasbon:approve` |
| `notifications.ts:229` | POST `/notifications/:id/action` (approve/reject wage report) | idem | `mandor:wage:approve` |
| `progress.ts:313` | PATCH `/projects/:id/photos/:photoId` (edit kategori/caption foto) | `if(!['admin','pm'].includes(role)) return 403` | `documents:manage` |

Ketiganya `return 403` — allow/deny murni. Tidak butuh permission key baru. Effort kecil: 1 edit + verifikasi + commit per file.

**Catatan penting untuk migrasi:** ganti `if(!['admin','pm'].includes(role)) return 403` menjadi cek permission cache (`request._permissionCache`) — bukan menambah `requirePermission` di preHandler, karena titik-titik ini di **dalam** handler (percabangan `action_type`), bukan di route-level. Perlu helper cek permission programatik (`hasPermission(request, key)`) atau muat cache manual. Desain helper ini adalah bagian pertama Epic 3.5.

### B. Business rule — JANGAN migrasi tanpa desain workflow (2 titik)

| File:baris | Kode | Kenapa bukan authorization |
|---|---|---|
| `cash.ts:473` | `autoApprove = role==='admin'\|\|'pm'` | Menentukan *hasil* submit (langsung `approved` vs `submitted`), bukan boleh/tidak submit. Ini aturan workflow. |
| `kasbons.ts:126` | `isAdminOrPm → autoApprove` | Sama — auto-approve kasbon yang diajukan sendiri. |

Memaksa ini jadi `requirePermission` akan salah model: capability "boleh membuat expense" berbeda dari "expense-nya langsung ter-approve". Jika kelak dijadikan permission (mis. `cash:expense:autoapprove`), itu keputusan **desain workflow** — kemungkinan besar bagian Program B (Workflow Engine), bukan cleanup mekanis.

### C. Data-scoping — cukup komentar, sah per ADR-004 Rule #1 (2 titik + ~50 lainnya)

| File:baris | Kode | Sifat |
|---|---|---|
| `reports.ts:82` | `canViewFinance` → memfilter kolom finansial yang di-fetch | Field-level filtering dalam 1 endpoint yang sudah ter-guard |
| `users.ts:12` | `isAdmin → showAll` | Admin lihat user nonaktif juga; endpoint sudah `authenticate` |
| (~50 lainnya) | `if(role==='mandor') q=q.eq('mandor_id', user.id)` dst | Memfilter *data mana yang terlihat*, bukan allow/deny |

ADR-004 Rule #1 mengizinkan pembacaan `user.role` non-otorisasi asalkan diberi komentar `// bukan authorization gate`. Ini pekerjaan T3.4 (dokumentasi data-scoping) yang bisa dilakukan bertahap.

## Rencana Eksekusi Epic 3.5 (saat dikerjakan)

1. Tambah helper `hasPermission(request, key): Promise<boolean>` di `plugins/auth.ts` (memuat `_permissionCache` sama seperti `requirePermission`, tapi mengembalikan boolean alih-alih mengirim 403) — untuk cek permission di dalam body handler.
2. Migrasi 3 titik kategori A ke helper itu, satu commit per file, test manual per titik.
3. Beri komentar `// data-scoping, bukan authorization gate` di titik kategori C (bertahap, saat file disentuh).
4. Kategori B: **tidak disentuh** — dicatat sebagai kandidat Workflow Engine (Program B).
5. Compliance audit ulang: `['admin','pm'].includes` dan `return 403` berbasis role → 0 di handler.

**Dependency:** tidak memblokir Epic 4 (RLS) maupun sebaliknya — keduanya soal role-literal authorization tapi di layer berbeda (Epic 3.5 = body handler API; Epic 4 = RLS policy). Bisa dikerjakan paralel atau berurutan sesuai prioritas founder.
