# 02 — Security & Compliance Architecture

**Repository:** Puraloka Suite Architecture Repository
**Dokumen:** 3 dari 6 (lihat [00](00-vision-and-business-architecture.md), [01](01-application-and-data-architecture.md), [03](03-platform-and-intelligence-architecture.md), [04](04-roadmap-governance-and-delivery.md), [05](05-design-system-and-ui-ux-architecture.md))
**Upstream dependency:** Bagian [Dynamic Permission Engine](01-application-and-data-architecture.md#dynamic-permission-engine) dan gap RLS di [00](00-vision-and-business-architecture.md#arsitektur-auth--otorisasi-bercampur-bukan-murni-satu-pola) adalah dasar dari sebagian besar temuan di dokumen ini.
**Status:** Living document
**Standar acuan:** OWASP Top 10 (2021), OWASP ASVS 4.0, NIST Cybersecurity Framework, CIS Controls v8

---

## Assumptions & Non-Goals

- Dokumen ini menilai postur keamanan **sebagaimana adanya hari ini** (single-tenant, service_role bypass RLS, deployment lokal manual) — bukan postur yang diasumsikan sudah ada.
- Non-goal: Ini bukan laporan penetration test formal. Ini adalah architecture-level threat model dan checklist kepatuhan standar, disusun dari inspeksi kode, bukan dari exploitation testing aktif.
- Compliance formal (SOC2, ISO 27001) **bukan** target Now/Next — hanya relevan sebagai *readiness* untuk L3 ketika pelanggan enterprise mensyaratkannya secara kontraktual (lihat [Compliance Readiness](#compliance-readiness)).

---

## Current State — Postur Keamanan Terverifikasi

Ringkasan temuan (detail lengkap ada di masing-masing subbagian di bawah):

| Kontrol | Status |
|---|---|
| Authentication | ✅ Supabase Auth (JWT), email/password + Google OAuth |
| Authorization (permission-based) | ⚠️ Sebagian data-driven, sebagian hardcoded — lihat [Authorization Strategy](#authorization-strategy) |
| Row Level Security | ⚠️ Aktif tapi **tidak menjangkau role kustom**, dan **dibypass oleh API** (service_role) |
| Tenant Isolation | ❌ Tidak ada kolom tenant/company — N/A untuk L1, gap kritis untuk L2 |
| Encryption at rest | ✅ Default Supabase/Postgres (terkelola provider) |
| Encryption in transit | ✅ HTTPS via Supabase, asumsi HTTPS di deployment web (perlu verifikasi eksplisit di environment produksi) |
| Secret management | ⚠️ `.env` file — tidak ada vault/rotation terkelola |
| Audit logging | ✅ `audit_logs` dengan diff old→new, `ON DELETE SET NULL` untuk trail bertahan |
| Tamper-proof logging | ❌ `audit_logs` bisa diedit/dihapus oleh siapapun dengan akses service_role — tidak ada write-once guarantee |
| Rate limiting | ❌ Tidak ditemukan di kode |
| CI/CD security gate | ❌ Tidak ada CI/CD sama sekali (lihat [00](00-vision-and-business-architecture.md#kualitas-rekayasa--fakta-terverifikasi)) |
| Dependency scanning | ❌ Tidak ada (tidak ada Dependabot/Snyk config ditemukan) |
| Test coverage untuk security-critical path | ❌ Tidak ada test suite sama sekali |

**Catatan penting tentang cara membaca tabel ini:** Beberapa ❌ di atas (rate limiting, CI/CD security gate) adalah **wajar dan bisa diterima untuk internal tool single-tenant** — bukan darurat. Yang benar-benar butuh perhatian mendesak adalah baris yang bertanda ⚠️ pada Authorization dan RLS, karena itu adalah **gap yang aktif memberi rasa aman palsu** (terlihat seperti RBAC berfungsi, padahal tidak konsisten).

---

## Threat Model

Menggunakan kerangka STRIDE, difokuskan pada aset yang benar-benar ada di sistem ini (bukan generic checklist).

| Aset | Ancaman Utama | Vektor Realistis | Mitigasi Saat Ini | Gap |
|---|---|---|---|---|
| Data finansial proyek (RAB, cash, invoice) | Tampering, Information Disclosure | Role kustom via `/api/v1/roles` mendapat permission API yang benar tapi bisa jadi lolos dari RLS jika ada jalur akses langsung ke DB (misal: laporan/BI tool masa depan yang connect pakai anon key) | `requirePermission` di layer API | RLS tidak mengenali role kustom — lihat [00](00-vision-and-business-architecture.md) |
| Data pribadi klien (`clients`, portal) | Information Disclosure | Client portal bug yang membocorkan data klien lain (cross-tenant-like leak meski masih single-tenant, antar klien) | RLS `auth_client_id()` scoping | Belum diverifikasi end-to-end secara manual (tercatat sebagai TODO di CLAUDE.md — "Verifikasi RLS end-to-end") |
| Kredensial mandor/tukang (kasbon, upah) | Repudiation | Approval kasbon tanpa jejak yang tidak bisa disangkal | `audit_logs` mencatat perubahan | `audit_logs` sendiri tidak tamper-proof (lihat di atas) |
| Endpoint API (159 total) | Elevation of Privilege | Endpoint yang lupa dipasangi `requirePermission`/`requireRole` — human error karena guard dipasang manual per-route, tidak ada default-deny di level framework | Guard dipasang manual per route | Tidak ada test otomatis yang memverifikasi *setiap* endpoint punya guard — regresi bisa lolos tanpa terdeteksi |
| Environment secrets (`.env`) | Information Disclosure | Kebocoran `SUPABASE_SECRET_KEY` (service_role, bypass semua RLS) via commit tidak sengaja, log, atau akses laptop developer | `.gitignore` (asumsi standar) | Tidak ada secret scanning otomatis, tidak ada rotasi terjadwal |
| File upload (dokumen, foto, nota) | Tampering, DoS | Upload file besar/berbahaya | File size cap (2-5MB per CLAUDE.md) sudah diterapkan | Tidak diverifikasi apakah ada content-type/malware validation |

---

## Attack Surface Analysis

**Permukaan serangan hari ini (L1, deployment lokal/internal):**

1. **159 endpoint REST API** — permukaan terbesar. Setiap endpoint yang menerima input adalah kandidat injection/validation bypass.
2. **Client portal + Mandor portal** — permukaan yang secara desain diakses oleh pihak *eksternal terbatas* (klien, mandor lapangan) yang levelnya trust lebih rendah dari pengguna internal (admin/PM) — ini secara proporsional adalah permukaan risiko tertinggi karena penyerang paling mungkin adalah aktor dengan kredensial sah tapi privilege rendah, mencoba eskalasi.
3. **File upload endpoints** (dokumen, foto, nota, bukti bayar) — vektor umum untuk path traversal, malware hosting, storage exhaustion.
4. **Public invoice-lookup endpoint** (ditemukan di `settings.ts`) — endpoint publik tanpa auth adalah permukaan yang harus diverifikasi ekstra ketat untuk information disclosure (apakah bisa enumerasi invoice ID pihak lain?).
5. **Supabase anon key di frontend** — anon key tertanam di client (`NEXT_PUBLIC_SUPABASE_KEY`), by design publik, tapi berarti **RLS adalah satu-satunya pertahanan** untuk jalur ini — inilah kenapa gap RLS di atas berdampak langsung, bukan teoretis.

**Permukaan yang BELUM ada (karena belum di-deploy publik) — relevan untuk L2/L3:**
- Belum ada permukaan jaringan publik terbuka (deployment masih lokal) — begitu deploy ke cloud, permukaan bertambah: exposed ports, DNS, TLS config, WAF (atau ketiadaannya).

---

## Authentication Strategy

**Current State:** Supabase Auth menangani identity — email/password dan Google OAuth aktif. Token JWT disimpan di cookie (`puraloka_token`), auto-refresh via Supabase silent refresh. Ini adalah keputusan yang tepat: **jangan bangun authentication sendiri** (Generic Domain, lihat [00](00-vision-and-business-architecture.md#generic-domains)) — Supabase Auth sudah battle-tested.

**Gap yang ditemukan:**
- Tidak ada MFA/2FA yang terlihat diaktifkan — untuk akun `admin` (akses penuh finansial), ini adalah kontrol ASVS Level 2 yang wajar untuk diterapkan.
- Tidak ada kebijakan password eksplisit yang terverifikasi (panjang minimum, complexity) di luar default Supabase.
- Session/token expiry ~1 jam (per CLAUDE.md) dengan silent refresh — pola yang wajar, tapi tidak ada mekanisme *revoke* eksplisit yang terlihat (misal: admin memaksa logout user lain saat toggle nonaktifkan akun — perlu diverifikasi apakah token yang sudah terbit langsung invalid atau tetap valid sampai expiry).

**Now/Next/Later:**
- **Now:** Aktifkan MFA opsional untuk role `admin` minimal (Supabase mendukung ini native, biaya implementasi rendah).
- **Next:** Verifikasi & dokumentasikan behavior token revocation saat user dinonaktifkan.
- **Later:** SSO/SAML untuk pelanggan enterprise L3 (bukan kebutuhan L1/L2).

## Authorization Strategy

**Prinsip yang harus ditegakkan (dan saat ini dilanggar sebagian):** Pisahkan dua konsep yang tercampur di kode hari ini:
- **Authorization gate** — "apakah user ini boleh memanggil endpoint ini sama sekali?" → harus selalu lewat `requirePermission`.
- **Data scoping** — "dari data yang boleh diakses, mana yang relevan untuk user ini?" (mis. mandor hanya lihat proyek yang di-assign ke dia) → ini bukan authorization, ini query filter, dan boleh tetap inline **asalkan** authorization gate-nya sudah lewat permission check terlebih dulu.

**Current State (dari verifikasi kode):**
- `requirePermission('module:action')` — jalur benar, data-driven, dipakai mayoritas endpoint.
- `requireRole('admin')` — 4 call site legacy, hardcoded, harus dihapus (rincian di [01](01-application-and-data-architecture.md#dynamic-permission-engine)).
- Inline `user.role === 'admin'/'pm'/'mandor'` di kasbons.ts dan change-orders.ts — **sebagian adalah authorization gate yang menyamar sebagai data scoping** (contoh konkret: `change-orders.ts` baris ~510 & ~637 melakukan `if (user.role !== 'admin') return 403` untuk approve/reject — ini authorization gate murni yang di-hardcode, bukan data scoping. Ini harus pindah ke `requirePermission('change_orders:approve')`).

**RBAC → ABAC/PBAC — Transition Path:**

| Tahap | Model | Kapan |
|---|---|---|
| **Current** | RBAC (Role-Based) — permission melekat ke role, role melekat ke user | L1, sudah berjalan sebagian |
| **Next (L2)** | RBAC yang **konsisten penuh** — seluruh hardcoded check dihapus, RLS ikut membaca tabel yang sama | Prasyarat L2 |
| **Later (L2 akhir/L3 awal)** | PBAC (Policy-Based) tambahan untuk kasus yang RBAC murni tidak cukup — contoh nyata dari domain ini: "PM hanya boleh approve kasbon untuk proyek yang dia pimpin" adalah kombinasi role + resource attribute (project ownership), bukan role semata. Pola ini **sudah ada secara implisit** di kode (`kasbons.ts` PM isolation check) — PBAC formal adalah generalisasi dari pola yang sudah terbukti dibutuhkan. | L2 akhir menuju L3 |
| **Optional (L3/L4)** | ABAC penuh (atribut lingkungan: waktu, lokasi, device) | Hanya jika pelanggan enterprise mensyaratkan |

**Rationale:** Melompat langsung ke ABAC penuh hari ini adalah overengineering — kebutuhan nyata yang teramati di kode (PM isolation by project ownership) adalah kasus PBAC sederhana, bukan ABAC kompleks. Bangun sesuai pola yang sudah terbukti dibutuhkan.

## Row Level Security & Tenant Isolation

**Current State:** RLS aktif (migration 049, 961 baris, 46 tabel) tapi dengan dua keterbatasan struktural:
1. Hardcoded ke 4 role literal, tidak menjangkau role kustom (detail di [00](00-vision-and-business-architecture.md)).
2. **API utama bypass RLS sepenuhnya** via `service_role` key — sehingga RLS hari ini secara efektif adalah *defense-in-depth untuk akses langsung ke database*, bukan pertahanan utama aplikasi. Pertahanan utama aplikasi adalah `requirePermission` di layer Fastify.

**Ini bukan cacat desain yang salah** — pola "API pakai service_role + RLS sebagai defense-in-depth" adalah pola valid dan umum di ekosistem Supabase. Tapi ini berarti **kualitas `requirePermission` di setiap endpoint adalah satu-satunya garis pertahanan nyata** — tidak ada jaring pengaman kedua di level database untuk trafik API. Konsekuensi: bug lupa pasang `requirePermission` di satu endpoint = kebocoran data langsung, tanpa RLS yang menyelamatkan.

**Transitional State (L2) — Tenant Isolation:**
- Kolom `company_id` (lihat [01](01-application-and-data-architecture.md#entity-strategy)) menjadi **dimensi isolasi kedua**, independen dari role. RLS policy L2 harus memvalidasi **dua hal sekaligus**: role permission DAN `company_id` match — dua axis ini harus AND, bukan OR, atau kebocoran lintas-company jadi mungkin.
- Karena API bypass RLS, **isolasi company_id juga harus ditegakkan eksplisit di setiap query API** (`WHERE company_id = req.user.company_id`), bukan mengandalkan RLS semata. Rekomendasi konkret: buat wrapper Supabase client per-request yang otomatis inject filter `company_id` (mengurangi risiko lupa filter di satu endpoint dari 159).

**Target State (L3):** Tenant isolation harus **defense-in-depth dua lapis yang benar-benar independen**: RLS di level database (untuk kasus API ter-compromise/bug) DAN filter eksplisit di application layer. Untuk pelanggan enterprise yang mensyaratkan isolasi lebih kuat, opsi schema-per-tenant tersedia sebagai upgrade (bukan default).

**Now/Next/Later:**
- **Now:** Perbaiki RLS agar konsisten dengan tabel `roles`/`permissions` (menutup gap role kustom) — ini murni perbaikan L1, tidak butuh menunggu L2.
- **Next:** Desain & implementasi dual-axis RLS (role + company_id) bersamaan dengan migrasi `company_id` di [01](01-application-and-data-architecture.md).
- **Later:** Query wrapper otomatis untuk mengurangi human error filter tenant.
- **Optional:** Schema-per-tenant untuk pelanggan enterprise L3/L4.

## Encryption Strategy

**At rest:** Dikelola Supabase/Postgres — default AES-256 di level storage provider. **Current State: memadai untuk L1/L2**, tidak perlu tindakan tambahan kecuali ada persyaratan kontraktual spesifik (Later/Optional).

**In transit:** HTTPS diasumsikan aktif via Supabase endpoint; perlu verifikasi eksplisit bahwa deployment produksi web (saat itu terjadi, lihat [04](04-roadmap-governance-and-delivery.md)) memaksa HTTPS-only, termasuk HSTS header — ini adalah item checklist Fase deployment pertama, bukan sesuatu yang perlu didesain sekarang karena belum ada deployment cloud.

**Field-level encryption:** **Tidak ada, dan tidak direkomendasikan untuk L1/L2.** Data yang mungkin jadi kandidat (NIK, nomor rekening bank di `company_profile`) bisa dipertimbangkan untuk field-level encryption di **L3 Optional** jika ada persyaratan compliance spesifik pelanggan enterprise — membangun ini sekarang untuk single-tenant internal adalah overengineering.

## Secrets Management

**Current State:** `.env` file per app (`apps/api/.env`, `apps/web/.env.local`) — pola standar untuk development, tapi:
- Tidak ada bukti penggunaan secret vault (Doppler, AWS Secrets Manager, dll.) — wajar untuk L1 lokal.
- Tidak ada rotasi terjadwal untuk `JWT_SECRET`, `SUPABASE_SECRET_KEY`, VAPID keys.

**Now:** Untuk L1, `.env` lokal cukup — jangan overengineer dengan vault untuk deployment yang belum ada.
**Next (saat deployment cloud pertama terjadi, Fase 1 di [04](04-roadmap-governance-and-delivery.md)):** Pindah secret ke environment variable terkelola platform (Vercel/Railway/Fly env vars), bukan lagi file `.env` di server. Ini prasyarat keras sebelum deployment publik, bukan opsional.
**Later (L2/L3):** Vault terkelola (Doppler atau setara) + rotasi terjadwal, terutama untuk `SUPABASE_SECRET_KEY` yang bypass semua RLS — ini adalah kredensial dengan blast radius terbesar di seluruh sistem.

## Audit Logging & Tamper-Proof Logging

**Current State — sudah baik:** `audit_logs` mencatat diff old→new, `user_id ON DELETE SET NULL` menjaga trail bertahan meski user dihapus. UI `/audit` sudah punya filter dan diff view. Ini adalah salah satu bagian arsitektur yang **paling matang** di sistem hari ini — perlakukan sebagai fondasi yang diperkuat, bukan dirombak.

**Gap:** Tidak tamper-proof — siapa pun dengan akses `service_role` (yaitu, API itu sendiri, atau siapa pun yang memegang key itu) bisa `UPDATE`/`DELETE` baris di `audit_logs` tanpa jejak. Untuk internal tool L1, risiko ini rendah (hanya 1 developer punya akses). Untuk L2 (banyak company, mungkin admin per-company), ini menjadi lebih relevan.

**Now/Next/Later:**
- **Now:** Tidak mendesak untuk L1.
- **Next (L2):** Tambahkan trigger Postgres yang menolak `UPDATE`/`DELETE` pada `audit_logs` (append-only enforcement di level database) — biaya implementasi sangat rendah (satu trigger), manfaat besar untuk kredibilitas audit trail saat ada multi-company/multi-admin.
- **Later (L3):** Pertimbangkan write-once storage eksternal (mis. object storage dengan object lock) untuk audit log jika ada persyaratan compliance formal.

## Incident Response, Disaster Recovery, Business Continuity

**Current State: tidak ada proses formal untuk ketiganya.** Ini jujur diakui sebagai gap, bukan diglossing over.

- **Incident Response:** Tidak ada runbook, tidak ada on-call, wajar untuk tim 1 orang. **Now:** cukup dokumentasi informal 1 halaman "jika terjadi X, lakukan Y" untuk skenario paling mungkin (kebocoran `SUPABASE_SECRET_KEY`, akun admin ter-compromise).
- **Disaster Recovery:** Backup database — perlu diverifikasi apakah Supabase Point-in-Time Recovery aktif (tier tertentu Supabase menyediakan ini otomatis; perlu konfirmasi tier project ini). **Now:** verifikasi status backup Supabase, ini bisa jadi sudah otomatis tanpa disadari, atau bisa jadi gap nyata — perlu dicek, bukan diasumsikan.
- **Business Continuity:** Untuk L1 (1 perusahaan, data operasional harian), RTO/RPO informal cukup selama backup terverifikasi ada. **Next (L2):** begitu banyak company bergantung pada sistem yang sama, downtime berdampak lebih luas — RTO/RPO formal jadi relevan.

## Compliance Readiness

**Current State:** Tidak ada compliance formal apa pun (tidak butuh, tidak ada persyaratan eksternal).

**Posisi untuk masa depan:** SOC2/ISO27001 adalah **Tier 3/Later-Optional** — hanya dikejar jika/ketika pelanggan enterprise L3 mensyaratkannya secara kontraktual sebagai syarat pembelian. Mengejar sertifikasi ini lebih awal adalah biaya besar (audit eksternal, dokumentasi proses formal) untuk manfaat yang belum ada pembelinya. Yang **bisa** dipersiapkan lebih awal tanpa biaya sertifikasi formal: praktik yang secara alami align dengan SOC2 (audit log yang baik — sudah ada; access control yang jelas — sedang diperbaiki; incident response minimal — Now item di atas). Ini "compliance-readiness by good practice", bukan compliance formal.

---

## Security Checklist (Ringkas, Actionable)

Checklist ini adalah ringkasan operasional dari analisis di atas, dikelompokkan per horizon:

**Now (L1 — bisa dikerjakan tanpa menunggu fase lain):**
- [ ] Hapus 4 call site `requireRole('admin')`, ganti `requirePermission()`
- [ ] Audit & reklasifikasi setiap inline `user.role === 'x'` — pisahkan authorization gate (harus jadi `requirePermission`) dari data scoping (boleh tetap inline)
- [ ] Perbaiki RLS agar membaca tabel `roles`/`permissions`, bukan literal hardcoded
- [ ] Verifikasi status Point-in-Time Recovery / backup Supabase untuk project ini
- [ ] Aktifkan MFA opsional untuk role admin
- [ ] Tulis runbook incident response 1 halaman untuk skenario kredensial bocor
- [ ] Verifikasi behavior token revocation saat user dinonaktifkan

**Next (menyertai pengembangan L2):**
- [ ] Desain dual-axis RLS (role + company_id) bersamaan dengan migrasi tenant
- [ ] Trigger append-only untuk `audit_logs`
- [ ] Pindah secret dari `.env` ke environment variable platform terkelola (prasyarat deployment cloud pertama)
- [ ] Formalisasi RTO/RPO untuk kebutuhan multi-company

**Later/Optional:**
- [ ] Field-level encryption untuk data sensitif tertentu (jika ada persyaratan kontraktual)
- [ ] Vault + rotasi terjadwal untuk `SUPABASE_SECRET_KEY`
- [ ] SOC2/ISO27001 readiness (hanya jika pelanggan enterprise mensyaratkan)
- [ ] SSO/SAML untuk pelanggan enterprise

---

*Dokumen berikutnya: [03 — Platform & Intelligence Architecture](03-platform-and-intelligence-architecture.md) — performance, observability, automation, dan AI architecture.*
