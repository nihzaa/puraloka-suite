# Spec: Admin SaaS Platform (back-office vendor console)

> Repo baru, terpisah dari `puraloka-suite`. Nama produk **belum ada** —
> seluruh dokumen ini memakai placeholder `{produk}` dan `admin-saas`
> (nama repo sementara). Jangan usulkan nama produk dari spec ini.
>
> **Tidak termasuk di spec ini** (sesi lain, sudah/akan di-spec terpisah):
> - Arsitektur n8n multi-tenant untuk kebutuhan TENANT (`2026-08-22-n8n-shared-multi-tenant-design.md`, sudah ada)
> - Detail teknis integrasi API AI (pemanggilan model, provider routing) — hanya skema kuota yang dirancang di sini
> - Desain visual final (token warna/font persis) untuk `admin-saas` — itu implementasi, bukan brainstorm
> - `marketing-saas` (situs jual produk) sebagai proyek — hanya kontrak API yang dikonsumsinya yang dirancang di sini

## 1. Konteks & keputusan yang sudah given

Founder memutuskan di sesi brainstorming sebelumnya (arsitektural, tidak
didebat ulang di sini):

1. Admin SaaS adalah **proyek/repo terpisah** dari `puraloka-suite`,
   subdomain `admin.{produk}.com`.
2. Auth admin SaaS **terpisah total** dari auth tenant biasa — bukan
   "role tertinggi" di sistem yang sama, karena admin SaaS punya akses
   lintas-SEMUA-tenant dan tidak boleh berbagi model otorisasi dengan
   RLS/`company_id` yang mengisolasi antar-tenant.
3. `puraloka-suite` (app utama) **tidak berubah** nama/repo/struktur.
4. `marketing-saas` (situs jual) adalah **proyek desain terpisah lagi**
   (bukan `apps/web-publik` — itu compro PT Puraloka Persada sendiri,
   hal yang sama sekali berbeda). Kontennya headless, di-fetch dari
   admin-saas.
5. WAJIB ada paket tanpa AI sama sekali (fitur AI dimatikan total),
   dirancang sebagai feature flags + kuota yang dikonfigurasi dari admin
   (bukan hardcode).

Klarifikasi tambahan dari sesi ini (lihat riwayat percakapan):

- DB: **satu database yang sama** dengan `puraloka-suite`, admin-saas
  akses via `service_role` (bypass RLS) — bukan DB terpisah+sinkronisasi.
- Auth: **Supabase project yang sama**, tapi user admin-saas ditandai
  lewat tabel baru (`admin_saas_users`), tak pernah muncul di
  `company_members`/RLS tenant manapun.
- Stack: **Next.js full-stack** (App Router, UI + API routes/server
  actions jadi satu) — bukan Next.js+Fastify terpisah seperti
  `puraloka-suite`, karena scope admin-saas jauh lebih kecil.
- Marketing content: **REST API publik read-only**, di-cache/revalidate
  di sisi `marketing-saas` (pola sama dengan revalidate-on-save yang
  sudah terbukti di `apps/web-publik`).
- Provisioning tenant baru: admin-saas **INSERT langsung** ke
  `companies`/`company_members`/`auth.users` (bukan lewat internal API
  `puraloka-suite`) — karena DB sudah sama & service-role sudah connect
  langsung, lewat API cuma menambah dependency tanpa manfaat isolasi.

Sisa keputusan teknis di bawah **diputuskan sendiri** (founder eksplisit
menyerahkan ke riset — "masuk mode Dont Ask"), berdasar riset pola B2B
SaaS standar (Stripe Billing/Entitlements API, konvensi dunning
Chargebee/Recurly, pola IA internal tool Stripe/Segment/Intercom) +
eksplorasi kode `puraloka-suite` yang sudah ada.

## 2. Topologi & alasan setiap batas

```
┌─────────────────────┐     ┌──────────────────────┐     ┌────────────────────┐
│   marketing-saas     │     │      admin-saas       │     │   puraloka-suite    │
│   (repo baru, later) │────▶│   (repo baru, INI)    │     │   (repo existing)   │
│   situs jual produk  │ GET │  Next.js full-stack    │     │  Next.js+Fastify    │
│   fetch konten       │     │  UI + API routes       │     │  ERP tenant         │
└─────────────────────┘     └───────────┬────────────┘     └──────────┬──────────┘
                                          │ service_role                │ RLS +
                                          │ (bypass RLS)                │ company_members
                                          ▼                              ▼
                             ┌─────────────────────────────────────────────┐
                             │         Postgres/Supabase — SATU project      │
                             │  companies, subscriptions, plans, ...  (baru) │
                             │  saas_invoices, admin_saas_users, ...  (baru) │
                             │  projects, invoices, users, ...     (existing)│
                             └─────────────────────────────────────────────┘
```

**Kenapa satu DB, bukan dua+sinkronisasi**: "apakah tenant X aktif"
harus punya SATU sumber kebenaran. Dua DB tersinkron berarti admin-saas
bisa saja bilang tenant aktif sementara `puraloka-suite` sudah
menyuspend-nya (atau sebaliknya) kalau webhook sinkronisasi gagal
senyap — persis kelas cacat yang berulang kali disebut sebagai racun
paling mahal di `CLAUDE.md` proyek ini (data yang tampak benar tapi
salah). Trade-off yang diterima: dua repo berbagi migration-owning
authority atas beberapa tabel (lihat §3, `puraloka-suite` tetap
satu-satunya penulis migrasi).

**Kenapa `service_role` bukan Postgres role kustom BYPASSRLS**:
`service_role` Supabase sudah *ada*, sudah teruji, dan perilakunya
(bypass RLS sepenuhnya) sudah persis yang dibutuhkan admin-saas.
Membuat role kustom hanya menambah permukaan konfigurasi tanpa manfaat
konkret — batas keamanan admin-saas memang murni di app-layer
(`admin_saas_users` + permission check-nya), bukan di lapisan DB,
karena sifat pekerjaannya sendiri (lintas-semua-tenant) tidak bisa
dibatasi RLS apa pun.

**Kenapa Next.js full-stack, bukan meniru Fastify+Next.js
`puraloka-suite`**: `puraloka-suite` memisahkan API karena mobile app
(React Native) butuh API terpisah dari web. admin-saas tidak punya
konsumen mobile — hanya staf internal via browser. Server
routes/actions Next.js sudah cukup, dan `marketing-saas` mengonsumsi
lewat REST publik (§6), bukan lewat kode admin-saas langsung.

## 3. Kepemilikan migrasi schema

Tabel baru (§4) hidup di schema `public` yang sama, tapi **migrasinya
tetap ditulis & dinomori lewat `puraloka-suite/db/migrations/`** — bukan
sistem migrasi terpisah di `admin-saas`. Alasan: `puraloka-suite` sudah
punya buku migrasi kanonik (`supabase_migrations.schema_migrations`,
Gerbang Keras G-2) dan alat introspeksi (`ledger-diff.mjs`). Dua sistem
migrasi menulis ke schema yang sama adalah resep tabrakan nomor/urutan.

`admin-saas` **hanya membaca & menulis BARIS**, tidak pernah menulis
DDL. Kalau admin-saas butuh kolom baru, itu jadi migrasi bernomor di
`puraloka-suite`, dikerjakan lewat sesi/PR di repo itu — persis pola
yang sudah berjalan untuk fitur lain di sana.

## 4. Data model

### 4.1 Plan, subscription, feature flags & kuota (poin 2)

```sql
plans
  id UUID PK, code TEXT UNIQUE, name TEXT, description TEXT
  price_monthly NUMERIC, price_yearly NUMERIC
  is_active BOOLEAN, is_public BOOLEAN   -- is_public=false: plan custom/enterprise, tak muncul di self-serve
  sort_order INT
  created_at, updated_at TIMESTAMPTZ

plan_features                            -- katalog kapabilitas yang bisa di-toggle
  id UUID PK, key TEXT UNIQUE            -- 'ai_enabled', 'ai_monthly_quota', 'max_users', 'whatsapp_integration', ...
  label TEXT, description TEXT
  value_type TEXT CHECK (value_type IN ('boolean','integer','text'))

plan_feature_values                      -- apa yang didapat tiap plan, per fitur
  id UUID PK, plan_id UUID FK plans, feature_id UUID FK plan_features(id)
  value_boolean BOOLEAN, value_integer INTEGER, value_text TEXT   -- hanya salah satu terisi sesuai value_type
  UNIQUE(plan_id, feature_id)

tenant_feature_overrides                 -- pengecualian per-tenant (mis. kuota AI 2x utk 1 pelanggan sbg retensi)
  id UUID PK, company_id UUID FK companies, feature_id UUID FK plan_features(id)
  value_boolean BOOLEAN, value_integer INTEGER, value_text TEXT
  reason TEXT NOT NULL                   -- WAJIB: override tanpa alasan tercatat = keputusan tak terlacak
  created_by UUID FK admin_saas_users, created_at, expires_at TIMESTAMPTZ NULL
  UNIQUE(company_id, feature_id)

subscriptions                            -- satu baris = langganan aktif tenant saat ini
  id UUID PK, company_id UUID FK companies UNIQUE
  plan_id UUID FK plans
  status TEXT CHECK (status IN ('trialing','active','past_due','canceled'))
  trial_ends_at TIMESTAMPTZ NULL
  current_period_start TIMESTAMPTZ, current_period_end TIMESTAMPTZ
  cancel_at_period_end BOOLEAN DEFAULT false
  canceled_at TIMESTAMPTZ NULL
  created_at, updated_at TIMESTAMPTZ

tenant_usage_counters                    -- kuota TERPAKAI, terpisah dari definisi kuota (plan_feature_values)
  company_id UUID FK companies, feature_key TEXT FK plan_features(key)  -- TEXT sengaja, lihat catatan di bawah
  period_start DATE, period_end DATE     -- selaras current_period_start/end subscription, BUKAN kalender 1-31
  used_count INTEGER NOT NULL DEFAULT 0
  PRIMARY KEY (company_id, feature_key, period_start)
```

**Kenapa key-value (`plan_features`/`plan_feature_values`), bukan kolom
tetap di `plans`**: tuntutan eksplisit founder — dikonfigurasi dari
admin, bukan hardcode. Kolom tetap berarti tiap fitur baru (dan Anda
sudah menyebut AI, tapi akan ada lagi) butuh `ALTER TABLE plans`. Pola
key-value ini persis filosofi `ai_provider_config` yang sudah ada di
`puraloka-suite` (config-from-UI, bukan env-pinned).

**Kenapa kuota (`tenant_usage_counters`) terpisah dari definisi kuota
(`plan_feature_values`)**: riset mengonfirmasi ini kesalahan pemodelan
paling umum — menyimpan `used` di baris yang sama dengan `limit` berarti
histori pemakaian rusak setiap kali tenant ganti plan. `period_start`
sebagai bagian primary key berarti **tidak ada job "reset kuota"** —
periode baru otomatis mulai dari baris kosong (upsert-on-first-use),
tidak ada risiko cron reset gagal senyap.

**Kenapa `period_start`/`period_end` mengikuti `current_period_start`
langganan, bukan tanggal 1 kalender**: tenant yang daftar tanggal 15
punya periode billing 15→14, bukan 1→31 — hardcode kalender adalah bug
umum yang disebut eksplisit oleh riset.

**Kenapa `plan_feature_values`/`tenant_feature_overrides` FK ke
`plan_features.id` (UUID) tapi `tenant_usage_counters` FK ke
`plan_features.key` (TEXT) — dua pola berbeda, disengaja bukan
inkonsisten**: celah yang ketahuan saat ditinjau ulang — draft pertama
memakai `feature_key TEXT` di ketiganya, padahal itu satu-satunya pola
FK-ke-kolom-TEXT-unik di seluruh skema (`050_rbac_foundation.sql` dkk.
selalu FK ke UUID PK). Dua tabel pertama diperbaiki ke `feature_id
UUID` supaya konsisten dengan konvensi. `tenant_usage_counters` sengaja
DIPERTAHANKAN `feature_key TEXT`: baris ini akan paling sering ditulis
oleh kode enforcement kuota (mis. sesi integrasi AI nanti) yang wajar
memakai konstanta string (`'ai_monthly_quota'`) langsung tanpa lookup
UUID lebih dulu di jalur panas (hot path) permintaan AI — mengharuskan
join ke `plan_features` demi UUID di titik yang paling sering dieksekusi
adalah biaya nyata untuk manfaat semu (kedua kolom sama-sama unik &
stabil). `plan_features.key` tetap `UNIQUE`, jadi integritasnya tetap
terjaga lewat FK biasa ke kolom itu.

**Pola enforcement kuota (catatan implementasi untuk sesi integrasi AI
nanti, BUKAN dibangun di sini)**: check-then-increment sinkron saat
request, race-safe lewat
`UPDATE tenant_usage_counters SET used_count = used_count + 1 WHERE company_id=? AND feature_key=? AND period_start=? AND used_count < <limit> RETURNING used_count`
— kalau affected rows = 0, kuota habis, tolak sebelum panggilan AI yang
mahal dijalankan. Dicatat di sini karena bentuk tabelnya (§ ini) harus
mendukung pola ini sejak awal, meski pemanggilnya dibangun di sesi lain.

**`tenant_feature_overrides` wajib `reason`**: kebutuhan nyata yang
disebut riset ("beri tenant ini 2x kuota AI sbg retensi") tidak boleh
jadi UPDATE senyap tanpa jejak siapa/kenapa — konsisten dengan prinsip
`CLAUDE.md` bahwa keputusan uang/akses harus tercatat, bukan ditebak
dari state akhir.

**Pembagian kewenangan status, satu sumber kebenaran per pertanyaan**:
`subscriptions.status` HANYA menjawab "apa status billing-nya"
(trialing/active/past_due/canceled — soal pembayaran). Draft pertama
spec ini sempat menambahkan `'suspended'` ke `status` JUGA, lalu
disadari itu duplikat dengan `company_saas_meta.lifecycle_status` yang
juga punya `suspended` — dua kolom yang bisa berbeda jawaban untuk
pertanyaan yang sama adalah persis anti-pattern yang §2 sudah tolak
untuk alasan pilih satu DB (dua sumber kebenaran yang bisa tak sinkron
senyap). Keputusannya: **suspensi HANYA hidup di `company_saas_meta`**
(§4.2) — `subscriptions.status='past_due'` yang berkepanjangan adalah
SALAH SATU pemicu admin men-set `lifecycle_status='suspended'`, bukan
status billing itu sendiri. `subscriptions` tak pernah tahu/peduli
apakah tenant sedang diblokir aksesnya; `company_saas_meta` tak pernah
menyimpan status pembayaran.

### 4.2 Status vendor-side tenant (satelit `companies`, poin 5)

```sql
company_saas_meta
  company_id UUID PK FK companies
  lifecycle_status TEXT CHECK (lifecycle_status IN
    ('provisioning','active','suspended','canceled'))
  access_mode TEXT CHECK (access_mode IN ('full','read_only','blocked')) DEFAULT 'full'
  suspended_reason TEXT, suspended_at TIMESTAMPTZ, suspended_by UUID FK admin_saas_users
  scheduled_deletion_at TIMESTAMPTZ NULL   -- diisi saat canceled; job hard-delete baca kolom ini
  onboarding_completed_at TIMESTAMPTZ NULL
  created_at, updated_at TIMESTAMPTZ
```

**Kenapa satelit, bukan `ALTER TABLE companies`**: `companies` milik
lineage migrasi & RLS `puraloka-suite` (`is_active` di sana sudah
berarti sesuatu bagi tenant admin sendiri — jangan tumpang tindih
maknanya). `lifecycle_status` adalah sudut pandang VENDOR, secara
sengaja di tabel terpisah supaya tak pernah butuh mengubah RLS/policy
`companies` yang sudah ada.

**`access_mode` terpisah dari `lifecycle_status`**: riset menegaskan
suspensi non-pembayaran HAMPIR SELALU soft-lock dulu (`read_only`),
hard-lock (`blocked`) belakangan atau untuk pelanggaran ToS yang
melompati grace period. Dua kolom ini bisa berbeda kombinasi:
`suspended`+`read_only` (masa tenggang) vs `suspended`+`blocked`
(setelah tenggang habis atau pelanggaran).

**`read_only` WAJIB tetap mengizinkan tenant membayar sendiri** — celah
yang ketahuan saat ditinjau ulang: definisi "read_only = semua tulis
diblokir" tanpa pengecualian berarti tenant yang sedang tenggang bayar
justru **tidak bisa membayar sendiri** (halaman pembayaran/langganan
mereka sendiri butuh menulis: konfirmasi metode bayar, submit bukti
transfer, dsb) — bertentangan langsung dengan tujuan masa tenggang itu
sendiri (beri kesempatan bayar sebelum hard-lock). `read_only` berarti
diblokir dari **operasi bisnis tenant** (PO baru, approval baru, invoice
baru ke klien mereka) — bukan dari **halaman langganan/billing mereka
sendiri**, yang harus tetap bisa diakses & ditulis penuh berapa pun
`access_mode`-nya (kecuali `blocked`, yang memang mengganti seluruh UI
jadi layar "hubungi billing"). Titik baca `access_mode` (§ di atas,
"satu titik pembacaan") harus tahu perbedaan ini — bukan blokir generik
di level request, tapi blokir di level *jenis operasi*.

**Retensi data**: `scheduled_deletion_at` diisi **90 hari** setelah
`canceled_at` (bukan 30) — riset merekomendasikan ini untuk vertical
SaaS konstruksi, karena data proyek/kontrak punya relevansi
legal/garansi jauh melebihi siklus churn SaaS biasa. Soft-delete
(`lifecycle_status='canceled'`, data tetap utuh) sampai job terjadwal
melakukan hard-delete tepat di `scheduled_deletion_at` — **bukan**
dibangun di spec ini (itu G-2/destructive, butuh spec+ratifikasi
tersendiri saat benar-benar akan diimplementasi); yang dirancang di
sini hanya kolomnya.

`request.db` (tenant-aware, dipakai `puraloka-suite`) HARUS dicek
terhadap `company_saas_meta.access_mode` di titik masuk request tenant
— detail pengkabelannya (middleware mana yang baca tabel ini) adalah
keputusan implementasi untuk plan, dicatat di sini sebagai requirement:
**satu titik pembacaan**, bukan tersebar di tiap rute (pola
"satu-pintu" yang sudah jadi konvensi kuat di `puraloka-suite`).

### 4.3 Billing/invoice vendor→tenant

```sql
saas_invoices
  id UUID PK, company_id UUID FK companies ON DELETE SET NULL
  subscription_id UUID FK subscriptions ON DELETE SET NULL
  invoice_number TEXT UNIQUE
  period_start DATE, period_end DATE
  amount NUMERIC NOT NULL, currency TEXT DEFAULT 'IDR'
  status TEXT CHECK (status IN ('draft','sent','paid','overdue','void'))
  due_date DATE, paid_at TIMESTAMPTZ NULL
  payment_reference TEXT NULL            -- id transaksi payment gateway (di luar scope sesi ini)
  created_at, updated_at TIMESTAMPTZ

saas_invoice_line_items
  id UUID PK, invoice_id UUID FK saas_invoices
  description TEXT, amount NUMERIC NOT NULL
```

**Kenapa TABEL BARU, bukan reuse `invoices`/`invoice_line_items`
existing**: tabel itu adalah AR tenant→klien konstruksi mereka
(`project_id`, `termin_schedule_id` — lihat `006_invoices_payments_taxes.sql`).
Mencampur tagihan VENDOR→TENANT ke situ akan mengotori laporan
finansial tenant sendiri dengan baris yang bukan uang proyek mereka —
kesalahan kategori, bukan soal penamaan. Prefiks `saas_` menandai tabel
ini milik lapisan vendor, konsisten dengan pola prefiks `situs_*` untuk
CMS compro yang sudah ada.

Detail integrasi payment gateway (Midtrans/Xendit/dll) **tidak**
dirancang di sini — `payment_reference` adalah kolom pass-through yang
cukup untuk plan berikutnya merancang integrasinya tanpa migrasi ulang.

**`ON DELETE SET NULL`, BUKAN `CASCADE`, ke `companies`/`subscriptions`**
— celah yang ketahuan saat ditinjau ulang: job hard-delete pasca-90-hari
(§4.2, `scheduled_deletion_at`) menghapus baris `companies`. Kalau FK-nya
`CASCADE`, riwayat tagihan vendor (`saas_invoices`) ikut lenyap bersama
tenant yang dihapus. Itu keliru — invoice yang sudah `paid`/`sent` adalah
**dokumen keuangan milik vendor sendiri** (butuh untuk pembukuan/pajak
vendor), bukan data tenant yang boleh ikut hilang saat retensi tenant
habis. `SET NULL` mempertahankan baris invoice-nya (dengan
`invoice_number`, `amount`, `paid_at` tetap utuh untuk laporan), hanya
melepas rujukannya ke tenant yang sudah tak ada.

### 4.4 Auth & RBAC internal admin-saas

```sql
admin_saas_users
  id UUID PK, auth_user_id UUID UNIQUE   -- FK ke auth.users (Supabase project sama), TANPA FK formal
                                          -- lintas skema auth/public (pola sama dgn users.id existing)
  email TEXT, full_name TEXT
  role_id UUID FK admin_saas_roles
  is_active BOOLEAN DEFAULT true
  created_at, updated_at TIMESTAMPTZ

admin_saas_roles           -- KECIL & tetap: tak perlu fleksibilitas RBAC tenant (custom role per company)
  id UUID PK, name TEXT UNIQUE, label TEXT, is_builtin BOOLEAN
  -- seed: 'super_admin', 'billing_ops', 'support', 'sales' (lihat §5.6 IA)

admin_saas_permissions
  id UUID PK, key TEXT UNIQUE            -- 'tenants:manage', 'billing:manage', 'billing:view',
                                          -- 'support:manage', 'marketing_content:manage', 'audit:view', ...
  label TEXT

admin_saas_role_permissions
  role_id UUID FK admin_saas_roles, permission_id UUID FK admin_saas_permissions
  PRIMARY KEY (role_id, permission_id)

admin_saas_audit_log       -- TERPISAH dari audit_logs tenant — immutable, prefiks admin_saas_
  id UUID PK, admin_user_id UUID FK admin_saas_users
  action TEXT, target_type TEXT, target_id UUID   -- mis. 'company', 'subscription', 'plan'
  old_values JSONB, new_values JSONB
  reason TEXT NULL                       -- wajib diisi utk aksi berisiko (suspend, override kuota, impersonate)
  ip_address INET, created_at TIMESTAMPTZ NOT NULL
```

**Kenapa RBAC admin-saas sendiri, bukan reuse `roles`/`permissions`
tenant**: tabel tenant itu untuk peran DI DALAM satu company (PM,
mandor, klien...) — konsepnya "siapa boleh apa di company X". Staf
admin-saas bukan anggota company manapun; pertanyaannya "siapa di
TIM VENDOR boleh apa lintas semua tenant". Tetap **permission-based**
(bukan literal role di kode), konsisten dengan ADR-004 filosofi yang
sama meski repo beda — tapi katalog rolenya sengaja kecil & tetap
(tidak butuh custom-role-per-company seperti tenant, karena staf
internal jumlahnya terbatas dan perannya jarang berubah).

**Kenapa `admin_saas_audit_log` terpisah dari `audit_logs` tenant**:
`audit_logs` FK ke `users.id` (tenant), immutability-nya termasuk Ember
[C] milik `puraloka-suite`. Aksi staf admin-saas (suspend tenant,
override kuota, **terutama impersonate/"login as"**) butuh jejak audit
sendiri yang FK ke `admin_saas_users`, bukan menumpang ke tabel yang
governance-nya dimiliki repo lain. `reason` wajib untuk aksi berisiko —
riset menegaskan ini konvensi hampir universal untuk impersonation
khususnya (time-boxed + alasan wajib sebelum aktivasi).

**Satu orang bisa punya DUA baris (`company_members` DAN
`admin_saas_users`) — ini SAH, bukan bug.** Celah yang ketahuan saat
ditinjau ulang: §8 menyebut kebutuhan nyata "satu orang bisa jadi staf
admin-saas SEKALIGUS user tenant Puraloka Persada sendiri" tapi §4.4
tidak menjelaskan implikasinya secara eksplisit. Karena `auth.users`
adalah satu project Supabase yang sama (keputusan §1), satu
`auth_user_id` bisa punya baris di `company_members` (identitasnya
sebagai *karyawan Puraloka Persada, tenant biasa*) DAN baris di
`admin_saas_users` (identitasnya sebagai *staf vendor*) — dua konteks
otorisasi yang sepenuhnya independen, tak saling mewarisi permission.
Middleware admin-saas HANYA pernah membaca `admin_saas_users`+
`admin_saas_role_permissions`; middleware `puraloka-suite` HANYA pernah
membaca `company_members`+`roles`. Tidak ada jalur kode yang membaca
keduanya sekaligus untuk satu keputusan otorisasi — kalau nanti ada,
itu pelanggaran terhadap batas §1 poin 2 (auth terpisah total) dan
harus ditolak saat code review.

**`value_type` di `plan_feature_values`/`tenant_feature_overrides`
belum ditegakkan lewat constraint, baru komentar SQL** — celah lain
yang ketahuan saat ditinjau ulang. Komentar `-- hanya salah satu terisi
sesuai value_type` di §4.1 adalah niat, bukan penegakan; tanpa
constraint, admin bisa mengisi `value_integer` untuk fitur yang
`value_type='boolean'` dan kode pembaca kuota akan salah baca kolom
mana yang otoritatif. Wajib ditambahkan saat migrasi ditulis:

```sql
-- Berlaku sama untuk plan_feature_values DAN tenant_feature_overrides
CONSTRAINT chk_value_matches_type CHECK (
  (SELECT value_type FROM plan_features WHERE id = feature_id) = 'boolean'
    AND value_integer IS NULL AND value_text IS NULL
  OR ... value_type = 'integer' AND value_boolean IS NULL AND value_text IS NULL
  OR ... value_type = 'text'    AND value_boolean IS NULL AND value_integer IS NULL
)
```

CHECK constraint dengan subquery tidak didukung Postgres secara
langsung (CHECK harus immutable per-baris) — jalur yang benar adalah
**trigger `BEFORE INSERT OR UPDATE`** yang membaca `value_type` dari
`plan_features` dan menolak kalau kolom yang terisi tidak cocok. Ini
detail migrasi (bukan didetailkan lagi di sini), tapi dicatat sebagai
**requirement mengikat**: migrasi yang membuat kedua tabel ini TIDAK
boleh dianggap selesai tanpa trigger validasi ini terpasang & teruji
lewat mutasi sengaja (pola pembuktian penjaga di `CLAUDE.md` §8a.2).

## 5. Fitur & menu admin-saas (poin 1)

IA mengikuti pola "search-first" yang riset konfirmasi sebagai konvensi
Stripe/Segment/Intercom untuk internal tool: pencarian tenant global di
header, sidebar berisi domain, halaman detail tenant pakai tab
horizontal (bukan sidebar bersarang).

### 5.1 Tenants (wajib, poin 1)
- List: cari/filter by nama, plan, status, MRR, tanggal daftar
- Detail (tab): Overview · Billing · Users · Usage · Feature Flags · Audit
- Provisioning tenant baru: form → INSERT `companies`+`company_members`+
  `auth.users`(admin pertama)+`subscriptions`(trial) dalam satu alur (§1,
  keputusan founder) — **urutan & penanganan-gagal wajib seperti §5.1a**
- Suspend/reaktivasi: set `company_saas_meta.lifecycle_status`+
  `access_mode`, WAJIB isi `suspended_reason`

#### 5.1a Provisioning bukan satu transaksi — urutan wajib & pemulihan gagal-tengah-jalan

Celah yang ketahuan saat ditinjau ulang: "INSERT langsung dalam satu
alur" (§1) terdengar seperti satu transaksi atomik, padahal secara
teknis **tidak bisa** — `auth.users` dibuat lewat Supabase Auth Admin
API (panggilan HTTP terpisah), bukan `INSERT` SQL biasa yang ikut serta
dalam transaksi Postgres bersama `companies`/`company_members`/
`subscriptions`. Kalau urutannya sembarang dan gagal di tengah,
hasilnya tenant "setengah jadi" — mis. `auth.users` berhasil dibuat tapi
`companies` gagal (constraint `companies_code_format` menolak slug),
menyisakan akun login yang menganggur tanpa company, atau sebaliknya
`companies` berhasil tapi `auth.users` gagal, menyisakan tenant tanpa
admin yang bisa login sama sekali.

Urutan wajib (untuk meminimalkan state rusak, bukan menghilangkannya
sepenuhnya — itu batas nyata dari punya 2 sistem berbeda):

1. **Transaksi Postgres SATU**: `INSERT companies` → `INSERT
   subscriptions` (status `trialing`) → `INSERT company_saas_meta`
   (status `provisioning`). Kalau salah satu gagal, semuanya rollback
   otomatis (satu transaksi) — belum ada `auth.users` yang dibuat sama
   sekali, jadi tak ada sampah tersisa.
2. **Baru setelah transaksi di langkah 1 COMMIT**: panggil Supabase Auth
   Admin API untuk buat `auth.users` admin pertama + `INSERT
   company_members` (transaksi Postgres kedua, terpisah).
3. Kalau langkah 2 gagal (mis. email sudah terdaftar): `companies` dari
   langkah 1 **tetap ada** tapi `company_saas_meta.lifecycle_status`
   tetap `'provisioning'` — UI admin-saas HARUS menampilkan tenant ini
   sebagai "provisioning gagal, admin belum dibuat" (bukan hilang
   senyap), dengan tombol retry yang mengulangi HANYA langkah 2 (pakai
   `company_id` yang sudah ada, bukan bikin `companies` baru lagi).

Prinsip yang mengikat: **`lifecycle_status='provisioning'` yang
bertahan lebih dari beberapa menit adalah sinyal gagal-tengah-jalan**,
bukan status transisi normal — halaman list tenant (§5.1) wajib
menyorot tenant begini secara berbeda dari tenant `active` biasa. Ini
persis pola yang sudah terbukti di `otomasi_jalan` milik
`puraloka-suite` (§7): catat state SEBELUM memanggil sistem eksternal
yang tak transaksional, supaya kegagalan punya jejak yang terlihat,
bukan menggantung senyap.

### 5.2 Billing & Subscription (wajib, poin 1)
- Daftar `saas_invoices`, status pembayaran, kirim reminder manual
- Ubah plan tenant (upgrade/downgrade), terapkan kredit/diskon manual
- Dashboard dunning: tenant `past_due`, umur keterlambatan, tombol
  "jalankan retry" / "suspend sekarang"

### 5.3 Plans & Feature Flags (wajib, poin 2)
- CRUD `plans` + `plan_feature_values` per plan (termasuk toggle
  `ai_enabled` on/off dan `ai_monthly_quota` per plan)
- `tenant_feature_overrides`: cari tenant → override 1 fitur + alasan
  wajib + tanggal kedaluwarsa opsional

### 5.4 Marketing Content (wajib, poin 1 — lihat §6 untuk kontrak API)
- Editor `marketing_pages`/`marketing_sections` (block-based: hero,
  pricing table, testimonial, FAQ, CTA)
- `marketing_pricing_plans`: kartu harga tampilan, ditautkan opsional
  ke `plans` asli
- `marketing_testimonials`, `marketing_faqs`: CRUD + urutan + publish
  toggle

### 5.5 Usage & Limits (wajib, poin 1 — turunan §4.1)
- Dashboard konsumsi kuota per tenant per fitur (grafik `tenant_usage_counters`)
- Alert list: tenant yang mendekati/melewati kuota (data untuk automasi §7 no.8-9)

### 5.6 Support (poin 1, dari brief — automasinya di §7 no. 15)
- Daftar tiket (jika tak pakai Zendesk/Intercom eksternal, ticketing
  minimal internal cukup: subjek, tenant, status, assignee, prioritas)
- Catatan internal per tenant (free-text, visible staff, bukan tenant)

### 5.7 Audit Log (wajib — riset: "required for SOC 2 dan akuntabilitas support")
- Global + per-tenant view dari `admin_saas_audit_log`
- Filter by admin user, jenis aksi, rentang tanggal

### 5.8 Team (internal admin-saas, bukan tenant)
- CRUD `admin_saas_users` + assign `admin_saas_roles`
- Role bawaan (seed awal, boleh diperluas dari UI):
  - `super_admin` — semua permission
  - `billing_ops` — billing+subscription+plans, TANPA suspend/impersonate
  - `support` — tenants:view + support + audit:view (readonly billing) —
    riset eksplisit: staf support TAK SELALU boleh lihat MRR
  - `sales` — tenants:view + marketing_content + usage:view (buat
    keperluan upsell)

### 5.9 Impersonation ("Login as tenant")
- Dari halaman detail tenant → generate sesi terbatas-waktu sebagai
  admin tenant tsb, WAJIB isi alasan sebelum aktivasi, sesi kedaluwarsa
  singkat (riset: dalam hitungan menit), tercatat penuh di
  `admin_saas_audit_log`. Mekanisme teknis persisnya (magic-link
  sementara vs token khusus) adalah keputusan level plan implementasi,
  bukan didetailkan di sini — yang mengikat di spec ini hanya: **wajib
  audit trail + wajib alasan + wajib time-box**.
- **Jejak di sisi TENANT wajib jujur, bukan menyamar** — celah yang
  ketahuan saat ditinjau ulang: kalau staf admin-saas login-as lalu
  melakukan aksi yang tercatat di `audit_logs` MILIK TENANT (mis.
  approve invoice, ubah data proyek), `user_id` di baris audit tenant
  itu **tidak boleh** tercatat seolah-olah itu admin tenant asli yang
  melakukannya — itu memalsukan jejak audit tenant, dan tenant tak
  pernah tahu aksinya sebenarnya dilakukan staf vendor. `audit_logs`
  ber-Ember-[C] (immutable, `CLAUDE.md` §5.3) justru menegaskan ini
  serius: sekali tercatat salah, tak bisa dikoreksi.
  Requirement mengikat untuk plan implementasi: sesi impersonation
  HARUS membuat baris `audit_logs` tenant tetap ber-`user_id` = admin
  tenant yang di-impersonate (supaya alur approval/permission tenant
  tetap konsisten), TAPI setiap baris yang ditulis selama sesi
  impersonation aktif wajib menyertakan penanda tambahan yang merujuk
  balik ke `admin_saas_audit_log` (mis. kolom `impersonated_by_admin_saas_log_id`
  di `audit_logs`, atau tabel jembatan terpisah) — sehingga siapa pun
  yang membaca jejak tenant nanti bisa menelusuri "aksi ini sebenarnya
  dilakukan staf vendor X, alasan Y" tanpa tenant kehilangan
  konsistensi peran di audit log-nya sendiri. Detail kolom persisnya
  adalah keputusan migrasi saat plan implementasi ditulis (kemungkinan
  butuh 1 migrasi kecil ADDITIVE di `puraloka-suite` untuk kolom
  penanda ini) — yang mengikat di sini hanya: **tak boleh ada aksi
  impersonation yang tercatat di audit tenant tanpa jejak balik ke
  admin-saas**.

## 6. Kontrak API publik untuk marketing-saas (poin 1)

```
GET /api/public/content/pages/:slug        → { title, meta_description, sections: [...] }
GET /api/public/content/pricing            → [{ headline, price_label, features_list, is_featured }]
GET /api/public/content/testimonials       → [{ author_name, author_role, company_name, quote, avatar_url }]
GET /api/public/content/faqs               → [{ question, answer }]
```

Tanpa auth (data memang untuk tampil publik). Hanya mengembalikan baris
`is_published=true`. Revalidation: `marketing-saas` pakai Next.js
ISR/on-demand revalidate dipicu webhook dari admin-saas saat konten
disimpan — pola identik dengan revalidate-on-save `apps/web-publik`
yang sudah terbukti jalan end-to-end (`STATUS.md` rev-21).

## 7. Automasi n8n untuk admin-saas sendiri (poin 3)

Instance n8n yang dipakai: **instance Puraloka sendiri** (`:5680`,
`scripts/jalankan-n8n.cmd`) — admin-saas jadi SATU pengguna internal
lagi dari instance itu, sama sekali terpisah dari spec n8n
multi-tenant TENANT (`2026-08-22-n8n-shared-multi-tenant-design.md`).
Pola integrasi mengikuti "satu pintu" yang sudah terbukti di
`apps/api/src/lib/otomasi-n8n.ts`: satu modul pemanggil di admin-saas,
mencatat jejak sebelum memanggil (bukan sesudah), timeout tegas.

Daftar usulan (founder pilih mana yang mau dipakai — bukan semua wajib
dibangun sekaligus):

| # | Automasi | Pemicu → Aksi |
|---|---|---|
| 1 | Urutan dunning pembayaran gagal | Invoice gagal bayar → email berjenjang hari 0/3/7/14/21 |
| 2 | Pengingat trial akan berakhir (awal) | Trial hari ke-10 dari 14 → email + ringkasan pemakaian |
| 3 | Pengingat trial akan berakhir (final) | Trial hari ke-13 → email/banner + Slack ke sales kalau pemakaian tinggi |
| 4 | Ajakan konversi trial→bayar | Trial habis tanpa kartu → blokir + email CTA (diskon/perpanjangan) |
| 5 | Urutan onboarding | Tenant dibuat → email hari 0/1/3/7 (checklist setup, undang tim, proyek pertama) |
| 6 | Deteksi onboarding macet | Tenant 3+ hari, nol proyek dibuat → Slack ke CS + email nudge |
| 7 | Skor risiko churn | Job malam: turun frekuensi login/pemakaian fitur → tandai tenant, Slack ke CS |
| 8 | Alert kuota mendekati batas (ke tenant) | Kuota 80%/100% → in-app + email ke admin tenant |
| 9 | Alert kuota mendekati batas (internal) | Kuota AI 90% → Slack ke sales (peluang upsell) |
| 10 | Urutan retry pembayaran gagal | Charge gagal → jadwal retry + dunning email paralel |
| 11 | Pengingat kartu akan kedaluwarsa | Kartu exp <30 hari → email update metode bayar |
| 12 | Re-engagement tenant tak aktif | Tanpa login 14/30 hari → email "kami rindu" + tugas CS |
| 13 | Win-back pasca-cancel | Tenant cancel → email hari 7/30/90 + survei feedback |
| 14 | Pengumpulan NPS/CSAT | X hari setelah onboarding selesai, atau kuartalan | 
| 15 | Auto-assign tiket support + follow-up SLA | Tiket baru → rute by kata kunci/tier → eskalasi kalau lewat SLA (contoh dari brief) |
| 16 | Alert signup bernilai tinggi | Subscription baru dengan MRR > ambang → Slack ke leadership |
| 17 | Alert internal kuota terlampaui | Tenant 100%+ dan diblokir → Slack ke support (proaktif sebelum komplain) |
| 18 | Trigger ekspansi/upsell | Tenant dekati batas seat/fitur → Slack ke AM + prompt upgrade in-app |
| 19 | Alert kegagalan webhook/integrasi | Alur n8n error (mis. gagal kirim WA) → Slack ke eng on-call |
| 20 | Digest metrik bisnis mingguan/bulanan | Terjadwal → ringkasan Slack: signup baru, delta MRR, tenant churn, top usage |
| 21 | Pengingat renewal kontrak tahunan | 60/30 hari sebelum renewal → Slack internal ke AM + email tenant |
| 22 | Deteksi pemakaian mencurigakan/abuse | Lonjakan anomali → Slack ke security/eng |
| 23 | Sinyal referral/ekspansi | Tenant undang tim tak wajar banyak / bikin >1 company → Slack ke sales |
| 24 | Pelacakan permintaan ekspor data | Tenant minta ekspor (pra-cancel) → tugas ops konfirmasi terkirim |
| 25 | Win-back pasca-suspend | Tenant bayar setelah suspend → email welcome-back + Slack ke CS |

Rekomendasi pemilihan awal (bukan keputusan final, founder yang
memilih): **#1 dunning, #5 onboarding, #15 support (dari brief), #7
churn-risk, #8/#9 kuota** — lima ini menutup siklus hidup tenant paling
kritis (masuk → sukses pakai → risiko bayar/berhenti → butuh bantuan)
dengan usaha implementasi paling kecil relatif terhadap dampaknya.

## 8. Arah desain (poin 4 — arah, bukan implementasi)

Sesuai batas wilayah yang sudah ditetapkan `CLAUDE.md` §8a.3: admin-saas
adalah alat kerja internal data-dense — masuk kategori **Operate**
(`impeccable` mode Operate), BUKAN kategori Persuade yang dipakai
`marketing-saas` nanti. Skill wajib saat implementasi UI benar-benar
dimulai (bukan sesi ini): `frontend-design`, `ui-ux-pro-max`,
`design-system`, `ui-animation`, `a11y-audit`.

Titik tolak dari `ui-ux-pro-max --design-system` (density 8, variance 5,
query "internal SaaS admin back-office dashboard tenant billing
operations") — **bukan token final**, hanya arah awal untuk dipertajam
saat implementasi:

- Warna: navy gelap `#1E3A5F` + hijau `#059669` sebagai penanda visual —
  SENGAJA berbeda dari navy `#003366` `puraloka-suite` supaya staf bisa
  membedakan sekilas mana tab admin-saas vs mana tab ERP tenant saat
  keduanya terbuka bersamaan (kebutuhan nyata: satu orang bisa jadi
  admin-saas staff SEKALIGUS user tenant Puraloka Persada sendiri).
- Tipografi: Fira Sans (UI) + Fira Code (data/angka tabular) — mood
  "dashboard, data, analytics, precise", cocok untuk density tinggi.
- Density: tinggi (8/10) — konsisten dengan arah `ARAH-VISUAL-2026.md`
  yang juga menuntut kerapatan data-dense di `puraloka-suite`, meski
  admin-saas adalah proyek desain baru dan bebas menentukan token
  presisnya sendiri (tidak terikat `ARAH-VISUAL-2026.md`, itu dokumen
  milik `puraloka-suite`).

WCAG 2.1 AA tetap wajib (bukan opsional) — `a11y-audit` dijalankan
sebagai bagian implementasi, sama seperti konvensi `puraloka-suite`.

## 9. Yang eksplisit TIDAK dibangun/dirancang di sini

- Pemanggilan API AI sesungguhnya (provider, routing, prompt) — hanya
  skema kuota (§4.1) yang cukup fleksibel untuk itu.
- Integrasi payment gateway sesungguhnya — hanya kolom pass-through
  (`saas_invoices.payment_reference`).
- Job hard-delete data tenant pasca-90-hari — hanya kolom penanda
  (`scheduled_deletion_at`); jobnya sendiri MENYENTUH G-2 (destruktif),
  butuh spec+ratifikasi tersendiri saat akan dibangun.
- Mekanisme teknis impersonation persis (token/session) — hanya
  requirement mengikatnya (audit+alasan+time-box).
- Desain visual final `admin-saas` (token warna/font persis, komponen) —
  §8 hanya arah, bukan implementasi.
- `marketing-saas` sebagai proyek — hanya kontrak API (§6) yang
  dirancang.
