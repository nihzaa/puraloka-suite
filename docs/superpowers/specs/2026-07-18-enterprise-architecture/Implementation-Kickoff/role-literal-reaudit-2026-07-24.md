# Re-Audit Role-Literal Authorization (AKTA 0) — 2026-07-24

Audit menyeluruh SEMUA file route mencari role-literal yang menjadi **authorization gate murni** (bukan ownership/data-scoping). Dipicu temuan bahwa `change_orders.ts` (`role === 'admin'` di approve/reject) lolos dari audit 1A yang mengklaim "0 role-literal authorization".

**Kebijakan:** dokumen ini MENGUMPULKAN temuan. Perbaikan dilakukan sekali jalan di **AKTA 3** sebagai derive-capability (ADR-004) — **kode tidak disentuh di AKTA 0**.

**Metode lockout:** role custom `direktur` (assignable sejak 1B.4) dipakai sebagai probe. `get_role_permissions('direktur')` diverifikasi ke DB nyata.

---

## Klasifikasi

### 🔴 Kategori 1 — PURE AUTHORIZATION GATE (return 403 by role literal) → LOCKOUT

| # | Lokasi | preHandler permission | Gate literal | direktur punya perm? | Lockout | Perbaikan AKTA 3 |
|---|---|---|---|---|---|---|
| **F1** | `auth.ts:97` `POST /auth/register` | **(tidak ada)** — hanya `authenticate` | `role !== 'admin' → 403` | `users:manage` ✅ | **YA** | `requirePermission('users:manage')` di preHandler, hapus gate literal |
| **F2** | `change-orders.ts:519` approve | `projects:edit` | `role !== 'admin' → 403` | `projects:edit` ✅ | **YA** | derive `change_order:approve`, seed→admin (scope identik), ganti gate |
| **F3** | `change-orders.ts:644` reject | `projects:edit` | `role !== 'admin' → 403` | `projects:edit` ✅ | **YA** | derive `change_order:approve` (approve+reject sepaket) |
| **F4** | `procurement.ts:908` MR delete | `procurement:mr:manage` | `role !== 'admin' && !== 'pm' && owner` | `procurement:mr:manage` ✅ | **YA** (non-owner) | ganti bagian admin/pm literal → `hasPermission('procurement:mr:manage:any')` atau pertahankan owner + capability; owner tetap boleh |

**Catatan F1 paling parah:** endpoint register **sama sekali tidak punya `requirePermission`** — otorisasi 100% bergantung pada role literal. Ini bukan cuma lockout, tapi juga tidak konsisten dengan pola RBAC v2.

**Catatan F2/F3 (derive-capability, scope-preserving):** membuat `change_order:approve` dan seed HANYA ke admin menjaga scope **identik hari ini** (hanya admin yang bisa) — behavior-preserving (Engineering Default Rule #3). Bedanya: kini admin bisa memberi capability itu ke `direktur` via UI. Tanpa fix, mustahil diberikan.

### 🟡 Kategori 2 — SOFT CAPABILITY FILTER (bukan 403, tapi menyembunyikan kategori data dari role custom)

| # | Lokasi | Literal | direktur punya perm relevan? | Efek | Perbaikan AKTA 3 |
|---|---|---|---|---|---|
| **F5** | `reports.ts:84` | `canViewFinance = admin\|\|pm` | `finance:view` ✅ | direktur tak lihat kolom finansial di laporan | `hasPermission(request,'finance:view')` |
| **F6** | `search.ts:58` clients | `admin\|\|pm` | `clients:view` ✅ | klien tak muncul di search direktur | `hasPermission('clients:view')` |
| **F7** | `search.ts:78` invoices | `admin\|\|pm` | `finance:view` ✅ | invoice tak muncul di search direktur | `hasPermission('finance:view')` |
| **F8** | `search.ts:122` users | `admin` | `users:manage` ✅ | user tak muncul di search direktur | `hasPermission('users:manage')` |

> Catatan: audit 1A memberi komentar "data-scoping bukan gate" pada beberapa titik (mis. `reports.ts:84`). Klasifikasi itu **debatable**: ini bukan "baris mana yang terlihat" (scoping) melainkan "apakah KATEGORI data terlihat" = capability. Karena melockout role custom, diperlakukan sebagai capability-filter yang harus permission-based.

### ⚙️ Kategori 3 — BUSINESS-LOGIC BEHAVIOR BRANCH (bukan akses, bukan lockout)

| # | Lokasi | Literal | Sifat |
|---|---|---|---|
| F10 | `cash.ts:473` | `autoApprove = admin\|\|pm` | Menentukan auto-approve vs submitted. Bukan 403. Sudah ber-komentar "kandidat Workflow Engine". direktur tetap bisa submit, hanya tak auto-approve. **Pindah ke workflow engine (Program B/1C), bukan permission.** |

### ⚪ Kategori 4 — CLIENT/PORTAL EXCLUSION (role gate, tapi arsitektural)

| # | Lokasi | Literal | Sifat |
|---|---|---|---|
| F9 | `search.ts:21` | `role === 'client' → return []` | Client pakai portal terpisah; search bukan untuk client. Role-literal tapi bukan lockout role custom (client = built-in). **Kandidat**: `hasPermission('search:use')` supaya konsisten, prioritas rendah. |

### ✅ Kategori 5 — DATA-SCOPING / OWNERSHIP (SAH per ADR-004 Rule #1 — TIDAK diubah)

~30 kemunculan pola `role === 'x' && ownership !== user.id → 403` atau `role === 'mandor' → q.eq('mandor_id', user.id)`. Ini menentukan **baris mana** yang diakses, bukan boleh/tidak. Contoh: seluruh `mandor.ts` ownership checks, `projects.ts:30/124/127/132`, `kasbons.ts` scoping, `finance.ts:274/1147/1197/1249` pm-ownership, `cash.ts:88` pm-ownership, `procurement.ts:191` mandor-own. **Dibiarkan.**

---

## Ringkasan untuk AKTA 3

- **Wajib fix (lockout 403):** F1, F2, F3, F4 → derive-capability + hapus role literal + **lockout audit semua role** per fix.
- **Sebaiknya fix (soft filter):** F5, F6, F7, F8 → ganti ke `hasPermission`.
- **Pindah ke workflow, bukan permission:** F10 (autoApprove).
- **Prioritas rendah/opsional:** F9 (client search exclusion).
- **Tidak diubah:** semua ownership/data-scoping (Kategori 5).

**Permission baru yang perlu di-derive (seed menjaga scope identik hari ini):**
- `change_order:approve` → seed admin (F2/F3). *(Apakah PM/direktur boleh approve CO = keputusan produk, angkat bila owner mau memperluas — default: scope lama = admin saja.)*
- F1 pakai `users:manage` yang **sudah ada** (tidak perlu derive).
- F4: evaluasi apakah `procurement:mr:manage` cukup (hapus admin/pm literal, pertahankan owner) atau perlu `:any` — cek scope lama saat implementasi.

Setiap fix WAJIB disertai **lockout audit** (probe semua role via `get_role_permissions`) + regression test (mirip `rls-fixed-endpoints.test.ts`).
