# ADR-011 T5c — Audit Pra-Eksekusi: Melepas `service_role`

**Tanggal:** 2026-07-29
**Status:** MENUNGGU KEPUTUSAN FOUNDER — belum dieksekusi
**Penulis:** sesi otonom (AUTOPILOT)

---

## 0. Kenapa dokumen ini ada sebelum eksekusi

Seluruh T0–T5b dikerjakan otonom tanpa bertanya, sesuai charter. T5c berbeda dan
karena itu berhenti di sini: ia **mengubah jaminan sistem**, bukan menambah lapis
di atas jaminan yang ada.

Sampai T5b, tiap langkah bersifat menambah: kolom `company_id` ditambahkan,
wrapper ditambahkan, policy ditambahkan. Kalau salah satunya keliru, yang terjadi
adalah data tersaring lebih ketat dari seharusnya — terlihat, mengganggu, dan
langsung ketahuan.

T5c **mencabut** sesuatu: API berhenti memakai `service_role` yang selama ini
mem-bypass RLS sepenuhnya. Setelah itu, satu policy yang salah tidak lagi berarti
"data tersembunyi" — ia bisa berarti fitur mati total bagi peran tertentu, dan
kalau salahnya ke arah sebaliknya, berarti data terbuka. Ini kelas keputusan yang
menurut charter wajib dilaporkan lebih dulu.

Dokumen ini menyajikan angka, bukan opini: apa yang sudah terbukti, apa yang
masih terbuka, dan apa konsekuensi tiap pilihan.

---

## 1. Ringkasan eksekutif

| | |
|---|---|
| **Bisa dieksekusi hari ini?** | Secara teknis ya — prasyaratnya sudah lunas. |
| **Direkomendasikan sekarang?** | **Tidak.** Rekomendasi: tunda sampai ada pemakai kedua. |
| **Alasan utama** | Manfaatnya nol hari ini (satu tenant, satu pemakai), risikonya nyata (perilaku 60+ endpoint berubah serentak). |
| **Apakah keamanan berkurang karena ditunda?** | Tidak. Lapis wrapper aktif & teruji; lapis RLS sudah terpasang penuh dan terbukti menahan lewat uji kill-switch — ia hanya belum menjadi jalur utama. |
| **Yang berubah kalau ditunda** | Tak ada pekerjaan terbuang: 131 & 132 tetap dipakai, test tetap berlaku. |

---

## 2. Apa persisnya T5c

Hari ini `apps/api/src/utils/supabase.ts` membuat satu klien dengan
`SUPABASE_SECRET_KEY` (service role) dan **memaksakan** header
`Authorization: Bearer <service key>` di setiap request. Konsekuensinya: setiap
query dari API mem-bypass RLS sepenuhnya. Isolasi tenant hari ini **100%
ditegakkan oleh wrapper aplikasi** (`tenant-db.ts`).

T5c mengganti itu dengan impersonasi per-transaksi: tiap request berjalan sebagai
user-nya sendiri, sehingga policy RLS benar-benar dievaluasi. Polanya sudah
terbukti jalan di repo ini — `src/test-utils/rls-harness.ts` memakainya untuk
seluruh test RLS.

---

## 3. Prasyarat — status terverifikasi

| # | Prasyarat | Status | Bukti |
|---|---|---|---|
| 1 | Semua tabel ber-tenant punya `company_id` / rantai FK | ✅ | migrasi 127; peta 94 tabel ter-generate dari skema |
| 2 | Nol tabel RLS-enabled tanpa policy permissive | ✅ | migrasi 130; dijaga test permanen |
| 3 | Nol policy blanket-permissive (`USING (true)`) | ✅ | migrasi 129 membuang `"Allow all access on users"` |
| 4 | Axis company terpasang di semua tabel ber-tenant | ✅ | migrasi 131 — 79 policy restrictive + 16 helper |
| 5 | Isolasi terbukti dengan tenant kedua nyata | ✅ | `tenant-isolation-nyata.test.ts` |
| 6 | Dua lapis terbukti independen (kill-switch) | ✅ | `t5b-kill-switch.test.ts` — 7 test |
| 7 | Policy tak menghancurkan performa | ✅ | migrasi 132 — lihat §4 |
| 8 | Uji mutasi: proteksi benar-benar mengukur sesuatu | ✅ | DROP policy → kebocoran nyata terjadi |

**Semua delapan lunas.** Blokirnya bukan teknis.

---

## 4. Baseline performa — temuan paling penting audit ini

Diukur `EXPLAIN ANALYZE`, 5 kali per query, diambil yang tercepat. Kolom kiri =
keadaan hari ini (service_role, RLS di-bypass); kanan = keadaan setelah T5c.

### Sebelum perbaikan (migrasi 132 belum ada)

| query | bypass | RLS aktif | pelambatan |
|---|---:|---:|---:|
| `assembly_components` (17.853 baris) | 2,2 ms | **3.524 ms** | **×1.580** |
| `assemblies` (3.038) | 1,2 ms | 598 ms | ×486 |
| `rab_items` (373) | 0,2 ms | 82 ms | ×480 |
| `kasbons` (56) | 0,04 ms | 19 ms | ×460 |

**T5c dieksekusi di keadaan ini akan menghasilkan sistem yang tidak layak
pakai** — bukan "agak lambat", tapi 3,5 detik untuk satu query biasa.

### Akar masalah

Dari rencana query, bukan dugaan:

```
Seq Scan on assembly_components (actual time=0.968..3676 rows=17853)
  Filter: (... AND (has_permission('cecep:assembly:manage')
                 OR has_permission('cecep:assembly:view')))
```

`has_permission()` sudah `STABLE`, tapi Postgres tetap memanggilnya **sekali per
baris** selama ia berdiri sebagai ekspresi biasa di policy. Tiap panggilan =
join 3 tabel + `auth_role()` yang sendirinya menembak `users`.

Pembandingnya ada di baris yang sama: `auth_company_id()` dari policy T5a
dibungkus `(SELECT ...)`, muncul sebagai `InitPlan`, dan terukur **0,37 ms sekali
saja**.

### Sesudah perbaikan (migrasi 132)

| query | bypass | RLS aktif | pelambatan |
|---|---:|---:|---:|
| `assembly_components` | 2,2 ms | **5,1 ms** | ×2,3 |
| `assemblies` | 1,2 ms | 2,5 ms | ×2,1 |
| `rab_items` | 0,2 ms | 7,1 ms | ×39 |
| `kasbons` | 0,04 ms | 7,6 ms | ×190 |

`assembly_components`: **3.521 ms → 5,1 ms (×690 lebih cepat)**, jumlah baris
identik.

173 policy di 92 tabel ditulis ulang. Dry-run membandingkan **368 sel**
(92 tabel × 4 peran: admin/pm/mandor/client) sebelum-sesudah: **seluruhnya
identik**. Murni performa, nol perubahan visibilitas.

Sisa biaya pada `kasbons` berasal dari `mandor_owns_kasbon_scope(work_scope_id)`
— helper yang menerima **kolom**, jadi memang harus dievaluasi per baris
(jawabannya beda tiap baris). Itu benar dan tak bisa dihindari. Diperiksa: nol
dari 49 tabel yang memakai helper semacam ini berukuran >5.000 baris.

---

## 5. Yang BELUM terbukti — daftar jujur

Ini bagian yang paling menentukan rekomendasi di §7.

### 5.1 Nol endpoint pernah dijalankan tanpa `service_role`

Seluruh bukti isolasi sejauh ini bekerja pada **level SQL** — query langsung ke
tabel dengan impersonasi. Yang belum pernah terjadi: satu pun request HTTP nyata
melewati Fastify → handler → Supabase **tanpa** service_role.

Artinya kelas kegagalan berikut belum tersentuh bukti apa pun:

- Handler yang menulis ke tabel yang policy-nya hanya mengizinkan baca.
- Handler yang membaca tabel kategori D (`users`, `companies`) yang policy-nya
  ketat — mis. saat login, sebelum konteks company terbentuk.
- Operasi lintas-tenant yang memang sah (job penjadwalan, notifikasi sistem).
- `auth.uid()` yang belum tentu terisi di semua jalur (webhook, cron, health).

### 5.2 R5 — `auth_client_id()` belum ada filter company

Ditemukan saat T4, masih terbuka. Definisi di migrasi 049 mengambil baris
`clients` berdasarkan email tanpa menyaring company. Setelah `clients` menjadi
kategori B, satu orang yang menjadi klien di **dua** perusahaan akan mendapat
baris yang **sembarang**.

Hari ini tak bergejala (satu tenant). Ia menggigit persis saat tenant kedua ada —
yaitu tepat saat T5c berguna. **Harus diperbaiki sebelum T5c bermakna.**

### 5.3 Belum ada uji beban

Angka §4 adalah query tunggal pada database sepi. Yang belum diukur: perilaku di
bawah beban bersamaan, terutama karena tiap request kini menambah `SET LOCAL`
per transaksi.

---

## 6. Risiko eksekusi sekarang

| Risiko | Dampak | Kemungkinan | Mitigasi tersedia? |
|---|---|---|---|
| Endpoint mati karena policy kurang izin tulis | Fitur berhenti bagi peran tertentu | **Tinggi** — 60+ endpoint, nol pernah diuji tanpa service_role | Hanya lewat pengujian per-endpoint yang belum ada |
| Login/registrasi gagal (kategori D) | Sistem tak bisa dimasuki | Sedang | Perlu jalur khusus pra-konteks |
| Job sistem gagal (notifikasi, cron) | Senyap — tak ada yang tahu sampai ada yang mencari | Sedang | Perlu identitas khusus |
| Regresi performa di bawah beban | Lambat menyeluruh | Rendah setelah 132 | Baseline sudah ada untuk pembanding |
| R5 memberi klien data perusahaan salah | **Kebocoran lintas-tenant** | Nol hari ini, tinggi saat tenant kedua | Perbaikan kecil, belum dikerjakan |

---

## 7. Rekomendasi

**Tunda T5c. Jangan eksekusi sekarang.** Alasannya aritmetika, bukan kehati-hatian:

**Manfaat hari ini = nol.** T5c membuat RLS menjadi jalur utama. Dengan satu
tenant, satu pemakai (founder), dan nol data operasional nyata, tidak ada satu
pun kebocoran yang dicegahnya hari ini yang belum dicegah wrapper.

**Risiko hari ini = nyata.** 60+ endpoint berubah perilaku serentak, nol di
antaranya pernah dijalankan tanpa service_role.

**Keamanan tidak berkurang karena ditunda.** Ini poin yang paling mudah salah
dibaca. Policy-nya **sudah terpasang penuh** dan **sudah terbukti menahan** —
uji kill-switch menunjukkan bahwa kalau wrapper dilewati, RLS menangkap
kebocorannya. Yang ditunda bukan perlindungannya, melainkan keputusan menjadikan
RLS satu-satunya penjaga. Lapisnya ada; ia hanya belum jadi lapis terdepan.

**Pemicu yang tepat untuk mengeksekusi**, mana pun yang lebih dulu:

1. Perusahaan kedua akan di-onboard (saat itu isolasi berhenti jadi teori), atau
2. Ada pemakai di luar founder (saat itu wrapper jadi satu-satunya penghalang
   antar-manusia nyata), atau
3. Data operasional nyata masuk.

Ketiganya juga pemicu rotasi kredensial yang tercatat di `STATUS.md` — memang
sebaiknya dikerjakan sebagai satu paket "sebelum operasional".

**Urutan saat waktunya tiba:**

1. Perbaiki R5 (`auth_client_id` + filter company) — kecil, wajib duluan.
2. Buat identitas khusus untuk job sistem (cron/notifikasi) yang tidak bergantung
   `auth.uid()`.
3. Jalankan seluruh suite handler dengan impersonasi, bukan service_role —
   di situlah 60+ endpoint akhirnya teruji.
4. Baru tukar klien di `supabase.ts`.
5. Ukur ulang dengan baseline §4 sebagai pembanding.

---

## 8. Yang tetap dikerjakan meski T5c ditunda

Sudah selesai dan tetap berlaku:

- **Migrasi 131** — 79 policy tenant. Lapis kedua terpasang penuh.
- **Migrasi 132** — perbaikan performa. Ini bukan pekerjaan yang menganggur
  menunggu T5c: ia memperbaiki cacat nyata yang membuat T5c mustahil, dan
  angkanya berlaku kapan pun T5c dieksekusi.
- **Test permanen** — `t5a-policy-tenant`, `t5b-kill-switch`, `rls-initplan`.
  Ketiganya menjaga agar keadaan siap-T5c tidak membusuk diam-diam.

Satu-satunya yang tertunda adalah **menukar klien di `supabase.ts`** — satu file,
sekali ubah, saat pemicunya tiba.
