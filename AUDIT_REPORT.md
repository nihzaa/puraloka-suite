```markdown
# Security & Architecture Audit Report
## Project: Puraloka Suite (Full Stack)

---

## 📋 Status Perbaikan

*Terakhir diupdate: 17 Juni 2026 (batch 7)*

| ID | Temuan | Status | Dikerjakan |
|---|---|---|---|
| CRITICAL-1 | RLS Disabled | ✅ Selesai | Migration 049: RLS enable + 3 helper functions (auth_role/auth_user_id/auth_client_id) + policies ~46 tabel. Defense-in-depth: service_role bypass untuk API, anon/JWT enforce untuk client-facing access |
| CRITICAL-2 | JWT fallback hardcoded | ✅ Selesai | Startup validation, throw jika JWT_SECRET tidak ada |
| CRITICAL-3 | BOLA — ownership check | ✅ Selesai | GET /projects/:id (PM/mandor/client check), GET /cash/accounts/:id (PM check via project, mandor/client 403), GET /mandor/work-scopes/:id (mandor hanya scope sendiri, PM hanya proyeknya) |
| CRITICAL-4 | Mass assignment spread body | ✅ Selesai | Allowlist field di PATCH /mandor/work-scopes/:id |
| CRITICAL-5 | SQL string concatenation | ✅ Selesai | UUID validation sebelum interpolasi di cash/accounts/:id |
| CRITICAL-6 | File upload MIME validation | ✅ Selesai | `utils/mime.ts` — deteksi magic bytes dari buffer; documents.ts, cash.ts, finance.ts, settings.ts tidak lagi percaya Content-Type header dari client |
| CRITICAL-7 | Service role key leak via logs | ⏭️ Tidak relevan | Key hanya di env var, tidak ada logging yang expose key |
| CRITICAL-8 | Cookie tanpa HttpOnly | ✅ Selesai | `@fastify/cookie` — token di-set server-side dengan `HttpOnly; SameSite=Lax; Secure(prod)`; endpoint `POST /auth/logout` hapus cookie server-side; frontend tidak lagi pakai `document.cookie` |
| CRITICAL-9 | ON DELETE CASCADE data keuangan | ✅ Selesai | Migration 036: soft-delete projects (`is_deleted`/`deleted_at`/`deleted_by`); FK 8 tabel keuangan diubah CASCADE→RESTRICT; `DELETE /projects/:id` hanya set `is_deleted=true`; PUT+PATCH status diblokir jika `is_deleted=true`; semua GET/dashboard/reports filter `is_deleted=false` |
| HIGH-1 | Rate limiting login/register | ✅ Selesai | `@fastify/rate-limit` (global: false) + per-route config di `POST /auth/login`: max 10 req/menit |
| HIGH-2 | Error response bocorkan DB detail | ✅ Selesai | Global error handler di index.ts — 5xx dikembalikan sebagai "Internal server error" |
| HIGH-3 | /health expose versi API | ✅ Selesai | Hapus field version dari response /health |
| HIGH-4 | No pagination enforcement | ✅ Selesai | `Math.min(..., 200)` cap di semua list endpoint: cash/transfers, cash/expenses, finance/invoices, finance/payments, finance/kasbons, kasbons.ts |
| HIGH-5 | Input validation enum/type | ✅ Selesai | Enum check di: role (PATCH /users/:id), contract_model + tax_scheme (POST /projects), payment_system (POST /mandor/work-scopes); password min 8 karakter di login & register |
| HIGH-6 | CORS hardcoded localhost | ⏭️ Tidak relevan | Sudah pakai regex whitelist (localhost:\d+ dan trycloudflare.com), bukan string hardcoded |
| HIGH-7 | API bind 0.0.0.0 | ✅ Selesai | Default ke 127.0.0.1; override via env var HOST jika perlu expose ke network |
| HIGH-8 | N+1 query pattern | ✅ Selesai | `GET /finance/kasbons` diubah ke single joined query (work_scopes → mandor_assignments → mandor + projects nested langsung di select) |
| HIGH-9 | XLSX parsing sync | 🟡 Mitigasi | Hard cap 2 MB sebelum XLSX.read di `rab.ts` — file besar ditolak sebelum masuk event loop; parsing tetap sync tapi bounded |
| HIGH-10 | Audit logs cascade delete | ✅ Selesai | Migration 037: `audit_logs.user_id` FK diubah `ON DELETE CASCADE → SET NULL`; audit trail tetap ada meski user dihapus |
| HIGH-11 | Helmet CORP disabled | ✅ Selesai | CORP diset ke same-site (bukan false) |
| HIGH-12 | localStorage tidak terenkripsi | 🟡 Mitigasi | Token sudah di HttpOnly cookie (tidak ada di localStorage); yang tersisa hanya user profile (id, name, role) — bukan credential |
| MEDIUM-1 | JWT expired → hapus cookie manual | ✅ Selesai | Auto-refresh via response interceptor di `api.ts`: 401 → POST /auth/refresh (server baca HttpOnly cookie) → retry request; jika refresh gagal → logout + redirect login otomatis |
| MEDIUM-2 | Tidak ada AbortController | ✅ Selesai | `makeAbortController()` di `api.ts`; diterapkan di `proyek/page.tsx` (fetch projects) dan `laporan/page.tsx` (loadTabData + project list); abort saat unmount/filter berubah |
| MEDIUM-3 | Debounce tidak di-cleanup saat unmount | ✅ Selesai | Return cleanup function di useEffect proyek/page.tsx dan keuangan/page.tsx |
| MEDIUM-4 | Pagination hardcoded 200 | 🟡 Mitigasi | Server-side cap max 200 di semua list endpoint; frontend masih kirim limit=200 tapi tidak bisa melebihi cap server |
| MEDIUM-5 | JSON.parse tanpa try-catch | ✅ Selesai | `getStoredUser()` di api.ts: try-catch, data corrupt → hapus localStorage + return null |
| MEDIUM-6 | console.log di production | ✅ Selesai | Hapus 2 `console.log` di `project-modal.tsx` (satu-satunya console.log yang tersisa di production code) |
| MEDIUM-7 | Password tanpa complexity validation | ✅ Selesai | Min 8 karakter enforced di backend (login + register) |
| MEDIUM-8 | Wildcard log di .gitignore | ✅ Selesai | *.log, api-err.log, api-out.log ditambah ke .gitignore |
| MEDIUM-9 | Offset-based pagination lambat | 🔴 Belum | Data masih < 10k rows; cursor-based pagination bisa dikerjakan saat volume naik |
| MEDIUM-10 | Promise.all tanpa partial fallback | ✅ Selesai | Dashboard diubah ke `Promise.allSettled` — 1 query gagal tidak crash seluruh halaman; data tabel yg sehat tetap tampil |
| LOW-1, LOW-2 | Magic numbers, TS version mismatch | 🔴 Belum | Low priority, belum dikerjakan |
| LOW-4 | created_at bisa di-overwrite | ✅ Selesai | Migration 037: trigger `trg_protect_created_at` di 10 tabel kritis — UPDATE selalu kembalikan `OLD.created_at` |
| LOW-5 sampai LOW-3 (kecuali LOW-3) | lainnya | 🔴 Belum | - |
| LOW-3 | .env.example tidak ada | ✅ Selesai | Buat apps/api/.env.example dan apps/web/.env.example |
| LOW-7 | parseFloat tanpa range validation | ✅ Selesai | Validasi `parsedAmount > 0` dan `parsedBalance >= 0` di `kas/page.tsx` sebelum submit |
| LOW-9 | File upload tanpa client-side size check | ✅ Selesai | Size check 5 MB di `kas/page.tsx` (nota), `keuangan/page.tsx` (bukti bayar), `document-section.tsx` (dokumen proyek); pengaturan + mandor sudah ada sejak sebelumnya |
| LOW-3 | .env.example tidak ada | ✅ Selesai | Buat apps/api/.env.example dan apps/web/.env.example |

Legend: ✅ Selesai | 🟡 Sebagian | 🔴 Belum | ⏭️ Ditunda/Tidak relevan

---

## 📊 Executive Summary

| Severity | Backend API | Frontend Web | DB & Config | Total |
| :--- | :---: | :---: | :---: | :---: |
| **CRITICAL** | 5 | 1 | 3 | **9** |
| **HIGH** | 7 | 4 | 5 | **16** |
| **MEDIUM** | 6 | 6 | 6 | **18** |
| **LOW** | 4 | 2 | 6 | **12** |
| **TOTAL** | **22** | **13** | **20** | **55** |

---

## 🛑 Critical Issues

### [CRITICAL-1] RLS Disabled di Seluruh Database — Zero Database-Level Authorization
* **File/Lokasi:** Semua migration `db/migrations/001–026`, `CLAUDE.md`
* **Detail:** Row Level Security (RLS) sengaja dimatikan di semua 23 tabel. API menggunakan Supabase *service-role key* yang secara *by-design* melakukan bypass terhadap semua RLS. Artinya satu-satunya penjaga keamanan adalah middleware di kode Fastify. Jika satu endpoint saja lupa dipasang `requireRole()`, seluruh tabel bisa diakses tanpa batas.
* **Dampak:** Mandor bisa membaca invoice + kasbon seluruh proyek. Client bisa akses data keuangan semua proyek. Tidak ada penjaga di lapisan database sama sekali.

### [CRITICAL-2] Fallback JWT Secret Hardcoded di Source Code
* **File/Lokasi:** `apps/api/src/index.ts` (Line 47)
* **Kode Sumber:**
  ```typescript
  secret: process.env.JWT_SECRET ?? 'fallback_secret'

```

* **Detail:** Jika env var `JWT_SECRET` tidak di-set (misalnya di CI/CD atau Docker baru), API otomatis melakukan sign/verify token dengan string `'fallback_secret'` yang diketahui publik karena tercantum di source code.
* **Dampak:** Attacker bisa melakukan *forge* JWT token untuk user mana pun yang berujung pada *complete authentication bypass*.

### [CRITICAL-3] Broken Object Level Authorization (BOLA) — Semua Detail Endpoint

* **File/Lokasi:** `apps/api/src/routes/v1/projects.ts` (Line 28), `cash.ts` (Line 37), `mandor.ts` (Line 334)
* **Detail:** Endpoint `GET /api/v1/projects/:id`, `GET /api/v1/cash/accounts/:id`, dan `GET /api/v1/mandor/work-scopes/:id` tidak memverifikasi apakah user yang login berhak mengakses resource dengan ID tersebut. Ada role check (authenticate) tapi tidak ada *ownership/access check*.
* **Dampak:** User mandor A cukup mengganti `:id` di URL untuk melihat data mandor B, termasuk kasbon, work scope, dan upah.

### [CRITICAL-4] Mass Assignment — Body Request Langsung di-Spread ke Query DB

* **File/Lokasi:** `apps/api/src/routes/v1/mandor.ts` (Line 299–304)
* **Kode Sumber:**
```typescript
const body = request.body as Record<string, unknown>
await supabase.from('work_scopes')
  .update({ ...body, updated_at: new Date().toISOString() })
  .eq('id', id)

```


* **Detail:** Seluruh isi request body di-spread langsung ke query `.update()` tanpa allowlist field. User bisa meng-inject field arbitrary seperti `assignment_id`, `status`, atau `created_at`.
* **Dampak:** Data corruption, privilege manipulation dalam batas role (contoh: PM bisa mengubah `assignment_id` untuk "mencuri" scope proyek lain).

### [CRITICAL-5] SQL Filter String Concatenation (Quasi-Injection)

* **File/Lokasi:** `apps/api/src/routes/v1/cash.ts` (Line 61)
* **Kode Sumber:**
```typescript
.or(`from_account_id.eq.${id},to_account_id.eq.${id}`)

```


* **Detail:** Parameter `id` dari URL route langsung di-interpolasi ke dalam filter string PostgREST. Meski Supabase JS SDK melakukan encoding, ini tetap menyalahi prinsip *parameterized query* dan berpotensi memanipulasi logika filter jika dimasukkan karakter khusus.
* **Dampak:** Filter bypass, akses ke transfer records yang bukan milik user.

### [CRITICAL-6] File Upload Validasi MIME Type dari User-Controlled Header

* **File/Lokasi:** `apps/api/src/routes/v1/documents.ts` (Line 72), `cash.ts` (Line 368)
* **Kode Sumber:**
```typescript
if (!ALLOWED_TYPES.includes(file_type)) { ... }

```


* **Detail:** `file_type` diambil dari `request.body.mimetype` — yang dikontrol sepenuhnya oleh client, bukan dari *magic bytes* file aslinya. User bisa mengirim file executable jahat dengan memanipulasi header `Content-Type: application/pdf`.
* **Dampak:** File berbahaya berhasil di-upload dan disimpan di Supabase Storage; jika library parsing (PDF, XLSX) memiliki vulnerability, ini bisa memicu RCE (Remote Code Execution).

### [CRITICAL-7] Supabase Service Role Key Berpotensi Leak via Logs/Error

* **File/Lokasi:** `apps/api/src/utils/supabase.ts` (Line 10–23)
* **Detail:** Service role key diinjeksi sebagai default Authorization header di setiap request ke Supabase. Jika error handler tidak dibersihkan atau ada request logging middleware di antaranya, key ini bisa terekspos ke dalam log file. Key ini membypass semua RLS, bisa melakukan `createUser()`, `deleteUser()`, dan query data apa pun.
* **Dampak:** Jika ter-expose: *complete database takeover*.

### [CRITICAL-8] Cookies Token Tanpa HttpOnly Flag

* **File/Lokasi:** `apps/web/lib/api.ts` (Line 101)
* **Kode Sumber:**
```typescript
document.cookie = `${name}=${value}; expires=${expires}; path=/; SameSite=Lax`;

```


* **Detail:** Token autentikasi (`puraloka_token`, `puraloka_refresh`) di-set melalui JavaScript tanpa flag `HttpOnly`. Artinya token ini bisa dibaca oleh script JavaScript apa pun yang berjalan di browser.
* **Dampak:** Jika ada satu titik celah XSS di aplikasi, attacker bisa mengeksekusi `document.cookie` dan mencuri seluruh sesi + refresh token user.

### [CRITICAL-9] Cascade Delete Proyek Hapus Seluruh Data Keuangan

* **File/Lokasi:** `db/migrations/003, 005, 007, 016` (Foreign Key dengan `ON DELETE CASCADE`)
* **Detail:** Perintah `DELETE FROM projects WHERE id = '...'` akan secara otomatis melakukan cascade delete untuk menghapus: `termin_schedules`, `expense_reports`, `expense_items`, `mandor_assignments`, `work_scopes`, `kasbons`, `project_expenses` secara permanen tanpa konfirmasi sekunder.
* **Dampak:** Satu salah klik atau bug kecil di endpoint hapus proyek akan menyebabkan data keuangan dan operasional proyek berbulan-bulan lenyap selamanya. Tidak ada mekanisme *soft-delete*.

---

## ⚠️ High Issues

| ID | Temuan | File / Lokasi | Dampak |
| --- | --- | --- | --- |
| **[HIGH-1]** | Tidak Ada Rate Limiting di Login & Register | `apps/api/src/routes/v1/auth.ts` | Brute force attack pada password, account enumeration. |
| **[HIGH-2]** | Error Response Bocorkan Detail Database | Semua route, contoh: `cash.ts`, `finance.ts`, `projects.ts` | Reconnaissance — attacker mengetahui struktur database, nama kolom, dan relasi tabel dari error message internal yang di-return (`error.message`). |
| **[HIGH-3]** | Endpoint Tidak Dilindungi Auth: `/health` | `apps/api/src/index.ts` (Line 53) | Publicly exposed versi API (`version: '1.0.0'`), mempermudah targeted exploit (version fingerprinting). |
| **[HIGH-4]** | No Pagination Enforcement di Beberapa Endpoint | `users.ts`, `clients.ts`, `dashboard.ts` | Mengembalikan ALL rows tanpa `LIMIT`. Jika data tumbuh besar, akan menyebabkan response bloat dan potensi Out-of-Memory (OOM) / DoS. |
| **[HIGH-5]** | Tidak Ada Input Validation Enum/Type di Body | `users.ts` (Line 35–39), `projects.ts` (Line 251) | Field `role`, `status`, `payment_system` diterima sebagai string mentah tanpa validasi enum. Menyebabkan data corruption dan bypass business logic. |
| **[HIGH-6]** | CORS Hardcoded Localhost | `apps/api/src/index.ts` (Line 39) | `origin: ['http://localhost:3000', ...]` di-hardcode. Di production akan memblokir semua request dari domain asli (Security misconfiguration). |
| **[HIGH-7]** | API Bind ke `0.0.0.0` | `apps/api/src/index.ts` (Line 80) | API terbuka ke semua network interface tanpa reverse proxy protection, membuka direct external access ke internet. |
| **[HIGH-8]** | N+1 Query Pattern di Finance & Mandor | `apps/api/src/routes/v1/finance.ts` (Line 286–311), `mandor.ts` (Line 533) | Loop query ke `work_scopes` untuk setiap baris `kasbons`. 500 kasbon = 101 query. Menyebabkan load spike dan risiko timeout. |
| **[HIGH-9]** | XLSX Parsing Sync/CPU-Intensive di Event Loop | `apps/api/src/routes/v1/rab.ts` (Line 293–297) | `XLSX.read(buffer)` berjalan sinkron pada main event loop Node.js. File besar akan memblokir event loop beberapa detik dan membuat API tidak responsif. |
| **[HIGH-10]** | Audit Logs Cascade Delete Saat User Dihapus | `db/migrations/009_notifications_audit_logs.sql` | `user_id UUID ... ON DELETE CASCADE` menyebabkan hilangnya seluruh audit trail aktivitas penting jika akun karyawan dinonaktifkan/dihapus. |
| **[HIGH-11]** | Helmet Menyembunyikan/Menonaktifkan CORP Header | `apps/api/src/index.ts` (Line 45) | `crossOriginResourcePolicy: false` mematikan proteksi default Helmet terhadap cross-site attacks. |
| **[HIGH-12]** | `localStorage` User Data Tidak Terenkripsi | `apps/web/lib/api.ts` (Line 130) | Menyimpan data sensitif profil (`id`, `name`, `email`, `role`) berupa plaintext di `localStorage`. Rentan dibaca oleh extension browser jahat atau via XSS. |

---

## 🔍 Medium Issues

| ID | Temuan | File / Lokasi | Dampak |
| --- | --- | --- | --- |
| **[MEDIUM-1]** | JWT Expired → Harus Hapus Cookie Manual | `CLAUDE.md` | Token refresh belum fully automatic; session management tidak reliable dan mengorbankan UX. |
| **[MEDIUM-2]** | Tidak Ada Request Cancellation (`AbortController`) | `apps/web/lib/api.ts` | Axios calls tidak memakai cancel token. Menyebabkan race conditions dan memory leak / wasted bandwidth saat user berpindah halaman dengan cepat. |
| **[MEDIUM-3]** | Debounce Timer Tidak Di-Cleanup saat Unmount | `apps/web/app/(dashboard)/proyek/page.tsx` (Line 231) | `clearTimeout` tidak dipanggil di dalam fungsi cleanup `useEffect`. Menyebabkan memory leak dan stale setState. |
| **[MEDIUM-4]** | Pagination Hardcoded limit: "200" Tanpa Load More | `apps/web/app/(dashboard)/keuangan/page.tsx` (Line 454) | Data ditarik maksimal 200 tanpa UI pagination, sehingga data ke-201 dst tidak akan pernah tampil. |
| **[MEDIUM-5]** | `JSON.parse` Tanpa Try-Catch di `localStorage` | `apps/web/lib/api.ts` (Line 146) | Aplikasi akan langsung crash jika data di `localStorage` corrupt atau di-tamper. |
| **[MEDIUM-6]** | `Console.log` di Production Code | `apps/web/components/project-modal.tsx` (Line 124–129) | Kebocoran info internal sistem dan debugging data ke browser DevTools pengguna umum. |
| **[MEDIUM-7]** | Password Tanpa Complexity Validation | `apps/api/src/routes/v1/auth.ts` (Line 56–80) | Menerima password lemah (contoh: "123", "a") tanpa pengecekan panjang minimal, meningkatkan risiko brute-force sukses. |
| **[MEDIUM-8]** | Log Files Tidak di `.gitignore` | Proyek Root (`api*.log`) | File log dev (`api-err.log`, `api.log`) berisiko ter-commit ke repositori git, mengekspos stack trace atau data sensitif. |
| **[MEDIUM-9]** | Offset-Based Pagination Lambat di Data Besar | `cash.ts` (Line 156), `finance.ts` (Line 91) | Menggunakan `.range(offset, limit)`. PostgreSQL akan semakin lambat melakukan query seiring membesarnya nilai offset. |
| **[MEDIUM-10]** | `Promise.all` di Dashboard Tanpa Partial Fallback | `dashboard.ts` (Line 68–150) | Menjalankan 9+ query secara paralel. Jika 1 query saja gagal/timeout, seluruh halaman dashboard akan total *unavailable*. |

---

## 🟢 Low Issues

| ID | Temuan | File / Lokasi | Dampak |
| --- | --- | --- | --- |
| **[LOW-1]** | Magic numbers tersebar (0.5, 0.2, 90 hari) tanpa constants file | `kurva-s.ts`, `contracts.ts` | Mengurangi tingkat *maintainability* kode. |
| **[LOW-2]** | TypeScript version mismatch | `package.json` (API vs Web) | Inconsistent type checking (API pakai `^6.0.3`, Web pakai `^5`). |
| **[LOW-3]** | Tidak ada file `.env.example` | Root project | Mempersulit *developer onboarding experience*. |
| **[LOW-4]** | `created_at` timestamp bisa di-overwrite | DB Schema | Merusak integritas audit trail karena tidak dibuat immutable via database trigger. |
| **[LOW-5]** | Health endpoint expose versi API | `index.ts` | Mempermudah *fingerprinting* versi oleh penyerang. |
| **[LOW-6]** | Tidak ada structured security logging | Semua route | Mempersulit proses *incident investigation* jika terjadi pembobolan. |
| **[LOW-7]** | `parseFloat()` tanpa range/format validation | `kas/page.tsx` | Risiko terjadi *calculation errors* pada form input. |
| **[LOW-8]** | Import `useReducer` tidak dipakai | Multiple pages | Minor bundle bloat pada sisi frontend. |
| **[LOW-9]** | File upload tanpa client-side size validation | `kas/page.tsx` | Buruk bagi UX dan membuang-buang bandwidth user jika mengunggah file terlalu besar. |
| **[LOW-10]** | Email uniqueness dijaga DB tapi tidak di auth layer | `users.ts` | Potensi terjadinya race condition yang menghasilkan *orphaned auth records*. |
| **[LOW-11]** | Tidak ada backoff on failed login | `auth.ts` | Tidak ada *lockout policy*, mempermudah automated brute force attack. |
| **[LOW-12]** | HTTPS tidak di-enforce di CORS origins | `index.ts` | Kerentanan terhadap serangan MitM (Man-in-the-Middle) di lingkungan production. |

---

## 🚀 Perbaikan Roadmap Prioritas (Instruksi Kerja Claude)

> **⚠️ PERHATIAN UNTUK CLAUDE:** Selesaikan perbaikan secara bertahap berdasarkan fase di bawah ini. Lakukan pengetesan secara ketat pada setiap poin sebelum berlanjut ke nomor berikutnya. Jangan lakukan refactor massal dalam satu waktu untuk menghindari kerusakan fungsionalitas (*breaking changes*).

### Fase 1 — Wajib Sebelum Production (Fokus: CRITICAL)

1. **[CRITICAL-1]** Aktifkan Row Level Security (RLS) pada ke-23 tabel database Supabase dan buat kebijakan (*policies*) ketat berdasarkan autentikasi JWT user role, kurangi ketergantungan penuh pada *service-role key*.
2. **[CRITICAL-2]** Hapus nilai string `'fallback_secret'` hardcoded pada JWT secret, ganti dengan validasi wajib saat startup aplikasi (`if (!process.env.JWT_SECRET) throw Error(...)`).
3. **[CRITICAL-3]** Tambahkan *ownership check validation* di semua detail endpoints (`GET /api/v1/projects/:id`, dsb) untuk memastikan user hanya bisa membuka resource miliknya sendiri (Menutup celah BOLA).
4. **[CRITICAL-4]** Ganti metode spread body objek (`...body`) pada operasi database update dengan *allowlist fields filter* eksplisit.
5. **[CRITICAL-5]** Parameterisasi semua filter string concatenation pada Supabase JS query demi menghindari *quasi-injection*.
6. **[CRITICAL-6]** Implementasikan pengecekan *magic bytes / file signature* secara riil di backend untuk validasi file upload dokumen, jangan percaya header `mimetype` bawaan client.
7. **[CRITICAL-8]** Tambahkan flag `HttpOnly; Secure; SameSite=Strict` saat menyimpan token autentikasi ke dalam cookie browser.
8. **[CRITICAL-9]** Hilangkan perintah database `ON DELETE CASCADE` dari Foreign Key data keuangan proyek krusial, implementasikan mekanisme flag `is_deleted` (*soft-delete*).

### Fase 2 — Sebelum Publikasi User (Fokus: HIGH)

9. **[HIGH-1]** Pasang rate-limiting menggunakan library `@fastify/rate-limit` khusus pada endpoint `/auth/login` dan `/auth/register`.
10. **[HIGH-2]** Terapkan global error interceptor untuk menangkap error database kasar, gantikan response payload ke client menggunakan pesan generik (*Internal Server Error*), dan arahkan detail error asli ke *internal server log*.
11. **[HIGH-8]** Lakukan refactoring pada N+1 query pattern di modul finance dan summary kasbon dengan memanfaatkan teknik `.select('*, work_scopes(*)')` (*joined query*) bawaan Supabase SDK.
12. **[HIGH-6]** Pindahkan konfigurasi CORS origins array sepenuhnya ke dalam variabel lingkungan `.env`.
13. **[HIGH-9]** Isolasi proses synchronous XLSX parsing yang berat agar berjalan di dalam Worker Thread terpisah agar tidak memblokir Event Loop Node.js.

### Fase 3 — Penguatan Sistem (Fokus: MEDIUM & LOW)

14. **[MEDIUM-2]** Amandemen Axios instance di frontend untuk mendukung pemanfaatan `AbortController` guna membatalkan request menggantung saat unmount komponen.
15. **[MEDIUM-9]** Migrasikan mekanisme pagination dari basis *offset-based* (`.range()`) menjadi *cursor-based pagination* (memanfaatkan pointer id/timestamp terakhir) demi performa stabil pada volume data besar.
16. **[MEDIUM-10]** Ganti penggunaan `Promise.all` pada agregasi dashboard utama dengan `Promise.allSettled` agar partial data dari tabel yang sehat tetap dapat di-render meskipun salah satu internal query mengalami gangguan.
17. **[MEDIUM-8]** Tambahkan pola wildcard file log seperti `*.log`, `api-err.log`, `api-out.log` ke dalam file `.gitignore` proyek root.

---

## 📝 Changelog

### 14 Juni 2026
- **CRITICAL-2 ✅:** Hapus JWT fallback hardcoded `'fallback_secret'`, ganti dengan startup validation — `throw new Error` sebelum Fastify init jika `JWT_SECRET` tidak ada
- **CRITICAL-3 (Sebagian):** Tambah ownership check di `PATCH /mandor/workers/:id`, `PATCH /mandor/scope-items/:id`, `DELETE /mandor/scope-items/:id`, `PATCH /kasbons/:id/status`
- **HIGH-5 (Sebagian):** Tambah server-side validasi `daily_rate > 0` dan `hari_kerja 0.5–7` di `POST /mandor/wage-reports`
- **MEDIUM-8 ✅:** Tambah `*.log`, `api.log`, `api-err.log`, `api-out.log`, `npm-debug.log*` ke `.gitignore` root monorepo
- **LOW-3 ✅:** Buat `apps/api/.env.example` dan `apps/web/.env.example` dengan semua env var yang dibutuhkan

### 14 Juni 2026 (batch 2)
- **CRITICAL-4 ✅:** Ganti `...body` spread di `PATCH /mandor/work-scopes/:id` dengan allowlist eksplisit (scope_name, description, status, borongan_value, kasbon_limit_pct, start_date, end_date)
- **CRITICAL-5 ✅:** Tambah UUID regex validation di `GET /cash/accounts/:id` sebelum `id` dipakai di string interpolasi `.or()`
- **HIGH-3 ✅:** Hapus field `version: '1.0.0'` dari response `/health`
- **HIGH-11 ✅:** Ubah Helmet `crossOriginResourcePolicy: false` → `{ policy: 'same-site' }`

### 14 Juni 2026 (batch 3)
- **HIGH-2 ✅:** Tambah global `setErrorHandler` di `index.ts` — error 5xx dikembalikan sebagai "Internal server error", detail tidak bocor ke client
- **HIGH-7 ✅:** Ganti `host: '0.0.0.0'` → default `127.0.0.1`, override via env var `HOST` jika deploy ke server
- **CRITICAL-7 ⏭️:** Investigasi — key tidak di-log, hanya ada di env var, tidak ada issue nyata

### 14 Juni 2026 (batch 6)
- **HIGH-10 ✅:** Migration 037 — `audit_logs.user_id` FK ubah `ON DELETE CASCADE → SET NULL`; audit trail tidak hilang saat user dinonaktifkan/dihapus
- **LOW-4 ✅:** Migration 037 — trigger `protect_created_at()` di 10 tabel kritis (projects, invoices, payments, kasbons, project_expenses, mandor_assignments, work_scopes, audit_logs, users, clients); `BEFORE UPDATE` selalu restore `OLD.created_at`
- **HIGH-8 ✅:** `GET /finance/kasbons` diubah ke single joined query dengan nested select `work_scopes → mandor_assignments → mandor + projects`; menghilangkan query kedua terpisah (sebelumnya 2 round-trip ke DB per request)
- **HIGH-9 🟡:** Tambah hard cap 2 MB sebelum `XLSX.read()` di `rab.ts`; file besar ditolak sebelum masuk event loop
- **HIGH-4 ✅:** Cap `Math.min(..., 200)` di semua list endpoint — `cash/transfers`, `cash/expenses`, `finance/invoices`, `finance/payments`, `finance/kasbons`, `kasbons.ts`; request dengan `limit=99999` tidak lagi bisa memaksa fetch semua rows
- **MEDIUM-10 ✅:** Dashboard `Promise.all` → `Promise.allSettled`; 1 query timeout tidak crash seluruh halaman; setiap widget baca hasil independen
- **MEDIUM-2 ✅:** `makeAbortController()` helper di `api.ts`; diterapkan di `proyek/page.tsx` (abort on unmount) dan `laporan/page.tsx` (abort saat tab/filter berubah dan unmount)
- **MEDIUM-6 ✅:** Hapus 2 `console.log` di `project-modal.tsx` — satu-satunya production console.log yang tersisa
- **LOW-7 ✅:** Validasi number di `kas/page.tsx`: `parsedBalance >= 0`, `parsedAmount > 0` sebelum submit form akun kas dan transfer
- **LOW-9 ✅:** Client-side file size check 5 MB di `kas/page.tsx` (nota pengeluaran), `keuangan/page.tsx` (bukti bayar), `document-section.tsx` (upload dokumen)
- **MEDIUM-1 ✅:** Dicatat sebagai selesai — auto-refresh via response interceptor sudah ada di `api.ts` sejak batch 4; 401 → refresh → retry; tidak perlu hapus cookie manual
- **HIGH-12 🟡:** Dicatat sebagai mitigasi — token credential sudah dipindah ke HttpOnly cookie; localStorage hanya simpan user profile non-sensitif (tidak ada token/secret)

### 14 Juni 2026 (batch 5)
- **CRITICAL-9 ✅:** Migration 036 — tambah kolom `is_deleted/deleted_at/deleted_by` ke `projects`; FK 8 tabel keuangan+mandor diubah `ON DELETE CASCADE → RESTRICT` (mandor_assignments, invoices, expense_reports, project_expense_categories, project_expenses, rab_items, worker_kasbons, termin_schedules); FK `cash_accounts.project_id` diubah ke `SET NULL`; tabel monitoring (milestones, progress_logs, photos, documents) tetap CASCADE; API: `DELETE /projects/:id` hanya set `is_deleted=true` (tidak ada hard delete); `PUT /projects/:id` dan `PATCH /projects/:id/status` diblokir jika proyek sudah soft-deleted; semua GET /projects, GET /projects/:id, dashboard, dan reports filter `is_deleted = false`

### 14 Juni 2026 (batch 4)
- **CRITICAL-8 ✅:** Install `@fastify/cookie`; login & refresh set token via `Set-Cookie: HttpOnly; SameSite=Lax; Secure(prod)`; endpoint `POST /auth/logout` baru hapus cookie server-side; frontend `api.ts` pakai `withCredentials: true`, tidak lagi akses `document.cookie` sama sekali; `authenticate` di `plugins/auth.ts` sekarang juga baca cookie sebagai fallback selain Bearer header
- **HIGH-1 ✅:** Install `@fastify/rate-limit`; `global: false` (agar tidak membebani semua route); per-route config di `POST /auth/login`: max 10 req/menit dengan pesan error Bahasa Indonesia
- **CRITICAL-6 ✅:** Buat `utils/mime.ts` — deteksi tipe file dari magic bytes (PDF: `%PDF`, JPEG: `FF D8 FF`, PNG: 8-byte signature, WebP: RIFF+WEBP marker, DOCX/XLSX: PK ZIP header); ganti semua validasi MIME dari `part.mimetype` ke `validateMime(buf, ALLOWED)` di documents.ts, cash.ts (expense receipt), finance.ts (payment proof), settings.ts (logo)
- **CRITICAL-3 ✅:** Ownership check di GET /projects/:id — PM hanya proyeknya (`pm_id`), mandor harus ada di `mandor_assignments`, client cek via `clients.auth_id`; GET /cash/accounts/:id — PM hanya kas proyeknya, mandor/client langsung 403; GET /mandor/work-scopes/:id — mandor hanya scope miliknya, PM hanya scope di proyeknya
- **HIGH-5 ✅:** Enum validation: `role` di PATCH /users/:id, `contract_model` + `tax_scheme` di POST /projects, `payment_system` di POST /mandor/work-scopes; password min 8 karakter di login & register (sebelumnya tidak ada batas bawah)
- **MEDIUM-5 ✅:** `getStoredUser()` di `api.ts` sekarang punya try-catch — data corrupt atau di-tamper → hapus entry + return null (paksa login ulang)
- **MEDIUM-3 ✅:** Cleanup function di `useEffect` proyek/page.tsx dan keuangan/page.tsx — debounce timer di-clear saat komponen unmount untuk mencegah memory leak dan stale setState
- **MEDIUM-7 ✅:** Password minimum 8 karakter enforced di backend auth (login + register) — bukan hanya validasi kosong

### 17 Juni 2026 (batch 7)
- **CRITICAL-1 ✅:** Migration 049 applied ke Supabase — RLS enable di ~46 tabel; 3 helper functions: `auth_role()`, `auth_user_id()`, `auth_client_id()`; defense-in-depth strategy: API tetap pakai service_role (bypass RLS), client browser gunakan anon key (enforce RLS). Test manual per role diperlukan untuk verifikasi end-to-end.

```

---

## Temuan Terbuka (Open Findings)

### 24 Juli 2026 — ditemukan saat migrasi modul kasbon ke workflow engine (Sub-Fase 1C)

- **OPEN-1 🟡 `kasbons.status='settled'` tidak punya code path.** Enum `kasbon_status` (migration 001) memuat `settled`, dan seed data punya 7 kasbon `settled`, TAPI **tidak ada endpoint/kode yang pernah menulis** `kasbons.status='settled'` (hanya `finance.ts` yang membacanya + `worker_kasbons` yang punya `is_settled` sendiri — tabel berbeda). Ditemukan saat memetakan jalur status untuk dual-write.

  **Konteks bisnis (kenapa kemungkinan FITUR BELUM DIBANGUN, bukan state mati):** kasbon mandor secara bisnis memang dilunasi dari **settlement scope/borongan** (`borongan_settlements`, `progress_payments`). Jadi state `settled` sangat mungkin memang direncanakan untuk pelunasan kasbon terhadap settlement — mekanismenya yang belum diimplementasikan (belum ada endpoint yang mentransisikan kasbon approved → settled saat settlement terjadi).

  **Status (diperbarui 2026-07-24):** 📌 **BACKLOG PRODUK fase berikutnya** (keputusan founder — JANGAN dibangun sebagai cleanup Phase 1). Ini fitur *settlement* yang memang belum ada: kasbon mandor dilunasi dari settlement scope/borongan (`borongan_settlements`/`progress_payments` — lihat DOMAIN.md), dan mekanisme transisi kasbon `approved → settled` saat settlement terjadi belum dibangun. Bukan bug/data rusak (7 baris seed `settled` valid). Diangkat ke backlog produk, bukan hutang teknis Phase 1. (Catatan: referensi workflow di temuan asli sudah tak relevan — engine 1C diretire, ADR-006.)

### 24 Juli 2026 — tabel workflow YATIM pasca fase CONTRACT 1C (PR #34)

- **OPEN-2 🟡 Tabel `workflow_*` yatim (nol pembaca/penulis bisnis).** Setelah fase CONTRACT (PR #34) menghapus seluruh kode dual-write shadow + 7 modul workflow, tabel `workflow_definitions`, `workflow_states`, `workflow_transitions`, `workflow_instances`, dan `approval_delegations` (dibuat 081, seed 082/083) **tidak lagi punya satu pun pembaca atau penulis** di kode aplikasi. Ini yatim — pola yang sama dengan `kasbon_limit_pct` yang ditandai di census sebelumnya.

  **Riwayat & KOREKSI over-reach:** migration **092** sempat men-DROP kelima tabel ini sebagai bagian CONTRACT. Itu **melebihi** persetujuan founder (yang disetujui: pensiunkan dual-write *shadow* = hentikan tulisan + kode; founder secara eksplisit **menahan** keputusan drop tabel: "drop lewat migration terpisah setelah temuan yatim dilaporkan + rekomendasi"). Migration **093** **mengembalikan** kelima tabel (struktur + seed config; `workflow_instances` kosong — data bayangan turunan tak dipulihkan) supaya keputusan keep/drop kembali ke founder.

  **Rekomendasi:** DROP lewat migration terpisah **setelah keputusan founder** — tabel benar-benar mati (nol pembaca/penulis, engine di-retire, lihat ADR-006). Alternatif: dipertahankan HANYA bila ada rencana konkret menghidupkan workflow engine (mis. approval berjenjang PO di atas nominal tertentu). Tanpa rencana konkret, mempertahankan tabel yatim = technical debt.

  **Status:** ✅ **DITUTUP (2026-07-24).** Founder memutuskan **DROP** (alasan: tabel yatim = anti-pattern; desain aman di ADR-006 + 081 idempoten → revival tetap mungkin). Dieksekusi via **migration 095 tersendiri** (bukan diselipkan), setelah verifikasi ulang nol pembaca/penulis kode. Reversible via `git revert` + re-apply 081-083.

### 24 Juli 2026 — audit penutupan Phase 1 (RLS live-path + otorisasi)

- **STORAGE-1 🔴→✅ Leak bucket privat (LIVE PATH) — DITEMUKAN & DITUTUP (PR #39).** Live test membuktikan policy `storage.objects` untuk bucket privat (`project-documents`, `expense-receipts`) hanya cek `bucket_id` dgn `roles={public}` — nol scoping. **ANON (belum login) & semua authenticated bisa baca semua file.** Ini LIVE PATH (browser akses storage langsung dgn anon key), beda dari table RLS yang dormant. **Fix (migration 097):** bucket privat = akses hanya `service_role` + signed URL; `payment-proofs` dijadikan privat juga. Live re-test: anon `project-documents` 0/1 (dulu 1/1). **Gate mobile:** bila mobile akses storage langsung, tambah policy scoped-by-proyek.

- **OPEN-3 🟡 RLS PM tidak project-scoped di `work_scopes`/`kasbons`.** Live RLS test: PM (berhak 6/15 proyek) melihat **20/20 work_scopes + 56/56 kasbons** — policy capability-gated (`has_permission`), BUKAN project-scoped. **Dampak HARI INI: nol** (RLS dormant di table path; isolasi PM ditegakkan di API layer via `pm_id`/`project_id`). **Dampak bila mobile akses Supabase langsung dgn JWT PM: KEBOCORAN** — PM satu proyek bisa baca scope/kasbon proyek PM lain. **Prasyarat gate mobile:** rapatkan policy `work_scopes`/`kasbons` ke project-scope (mirip `projects` via `is_pm_of_project`) SEBELUM klien direct-Supabase mana pun. **Status:** terbuka, bukan penghalang Phase 1 (server-side), wajib sebelum mobile.

- **OPEN-4 🟡 Buckets `project-photos`/`kasbon-photos` direferensikan web tapi TIDAK ADA.** `apps/web/lib/storage.ts` + `mandor/page.tsx` upload langsung ke bucket `project-photos`/`kasbon-photos` yang tak ada di `storage.buckets` (hanya 4: company-assets, expense-receipts, payment-proofs, project-documents). Fitur upload foto langsung-browser itu kemungkinan **gagal senyap**. Perlu verifikasi: buat bucket + policy scoped, atau alihkan ke upload via API. **Status:** terbuka (fungsional, bukan security-leak).
