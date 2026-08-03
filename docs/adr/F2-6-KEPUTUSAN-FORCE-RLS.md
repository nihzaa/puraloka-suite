# F2-6 — Keputusan `relforcerowsecurity`: **TIDAK dipaksa**, dengan syarat

**Status:** DIPUTUSKAN · menunggu tinjauan founder
**Tanggal:** 2026-08-04
**Antrean:** `QUEUE.yaml` F2-6 (temuan F0-2) · penutup Fase 2
**Terkait:** `ADR-011-multi-tenant-strategy.md` §7 (RLS dual-axis)

---

## 1. Pertanyaannya

Audit F0-2 mencatat: **0 dari 123 tabel** memaksa RLS (`relforcerowsecurity`).
Angka nol yang mencolok itu terbaca seperti kelalaian, dan F2-6 menuntut
keputusan tertulis: paksa atau tidak, beserta alasannya.

```bash
node scripts/db/introspect.mjs rls     # ukur ulang kapan saja
```

---

## 2. Apa yang sebenarnya dilakukan `FORCE`

`ALTER TABLE … FORCE ROW LEVEL SECURITY` membuat RLS berlaku **juga bagi
pemilik tabel**. Tanpa `FORCE`, pemilik melewati policy-nya sendiri.

Ia **tidak** berpengaruh pada peran lain. Itu batasnya, dan batas itu yang
menentukan jawaban di sini.

---

## 3. Kenyataan yang diukur (2026-08-04)

| Fakta | Nilai |
|---|---|
| tabel `public` | 123 |
| RLS **aktif** | **123** (seluruhnya) |
| RLS **dipaksa** | 0 |
| pemilik seluruh tabel | `postgres` |
| peran koneksi API | `postgres` |
| `postgres.rolbypassrls` | **true** |

Peran lain:

| Peran | superuser | `rolbypassrls` |
|---|---|---|
| `postgres` | false | **true** |
| `service_role` | false | **true** |
| `authenticated` | false | false |
| `anon` | false | false |

---

## 4. Bukti: `FORCE` tidak akan mengubah apa pun

Diuji langsung, dalam transaksi ber-`ROLLBACK`:

```
sebelum FORCE, sebagai postgres : 15 proyek terlihat
SESUDAH FORCE, sebagai postgres : 15 proyek terlihat
current_user rolbypassrls       : true
```

**`rolbypassrls` menang atas `FORCE`.** Memaksa RLS pada 123 tabel akan
menghasilkan tepat nol perubahan perilaku selama koneksi memakai peran
ber-bypass.

Sebagai pembanding — RLS-nya sendiri memang bekerja:

```
sebagai authenticated (tanpa bypass) : 0 proyek terlihat
```

Nol, karena sesi itu tak punya identitas tenant. Isolasinya nyata; yang
melewatinya hanya peran yang memang dirancang melewatinya.

---

## 5. Keputusan

**TIDAK memaksa RLS sekarang.** Tiga alasan, urut dari yang paling menentukan:

### 5.1 Ia tak akan mengubah apa pun — dan itu lebih buruk daripada tak berguna

Memaksa RLS pada 123 tabel menghasilkan nol perubahan perilaku (§4), tetapi
menambahkan satu properti skema yang **terlihat seperti perlindungan**.

Itu bahaya tersendiri. Seseorang yang membaca `relforcerowsecurity = true`
akan menyimpulkan "pemilik pun tunduk RLS" — kesimpulan yang salah selama
`rolbypassrls` masih ada. Perlindungan yang diyakini tetapi tak bekerja lebih
berbahaya daripada perlindungan yang jelas-jelas tak ada.

### 5.2 Yang sesungguhnya menahan sudah bekerja, dan sudah diuji

Isolasi datang dari **policy**, bukan dari `FORCE`. Fase 2 membuktikannya
lewat empat kebocoran yang ditemukan DAN ditutup:

| Ditemukan di | Kebocoran |
|---|---|
| F2-3 batch 2 | `audit_logs` — admin PT A membaca jejak PT B (13.691 baris) |
| F2-3 batch 3 | `permission_scopes` — pembatasan izin terbaca semua tenant |
| F2-5 | `expense-receipts` — anon **tanpa login** membaca bukti pengeluaran |
| F2-5 | `project-photos` — anon membaca **dan menghapus** foto proyek |

Tak satu pun akan tertutup oleh `FORCE`. Keempatnya adalah policy yang salah
atau tak ada — dan keempatnya kini punya test yang **terbukti bisa merah**.

### 5.3 Memaksa sekarang berisiko mematikan tabel tanpa memberi apa pun

`FORCE` pada tabel yang policy-nya belum lengkap membuatnya tak terbaca oleh
pemiliknya sendiri. Peringatan T1-F3 (migrasi 131) mencatat kelas kegagalan
ini: perubahan RLS yang tampak memperketat justru mematikan tabel.

Menanggung risiko itu demi nol perubahan perilaku bukan pertukaran yang masuk
akal.

---

## 6. Syarat — kapan keputusan ini WAJIB ditinjau ulang

Keputusan ini bergantung pada satu fakta: **koneksi API memakai peran
ber-`rolbypassrls`.** Begitu itu berubah, `FORCE` berubah dari tak-berguna
menjadi **wajib**.

### Tripwire 1 — API pindah dari peran ber-bypass

ADR-011 §7 sudah merencanakannya: *"Pindah dari service_role — ya, tapi paling
akhir."* Saat itu terjadi, pemilik tabel dan peran aplikasi jadi dua hal
berbeda, dan `FORCE` mulai berarti.

```sql
-- Tripwire: peran koneksi API masih ber-bypass?
SELECT rolname, rolbypassrls FROM pg_roles WHERE rolname = current_user;
```

### Tripwire 2 — ada tabel yang pemiliknya bukan `postgres`

Hari ini nol (diukur). Tabel yang dimiliki peran lain akan tunduk pada aturan
yang berbeda, dan asumsi §4 tak lagi berlaku untuknya.

```sql
SELECT c.relname, pg_get_userbyid(c.relowner) AS pemilik
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'r'
   AND pg_get_userbyid(c.relowner) <> 'postgres';   -- harus NOL
```

### Tripwire 3 — pelanggan pertama masuk

Sebelum ada data pelanggan sungguhan, biaya salah-paksa (tabel mati) lebih
besar daripada manfaatnya (nol). Sesudahnya, perhitungan itu bisa berubah —
dan yang berubah bukan teknisnya, melainkan siapa yang menanggung akibatnya.

**Kedua tripwire pertama dijaga otomatis** oleh
`apps/api/scripts/audit-force-rls.mjs`; yang ketiga keputusan founder.

---

## 7. Yang TIDAK diputuskan di sini

- **Menghapus `rolbypassrls` dari `postgres`** — di luar jangkauan; itu peran
  bawaan Supabase dan mengubahnya menyentuh platform, bukan aplikasi.
- **Memaksa RLS pada tabel tertentu saja** — ditolak karena membingungkan:
  sebagian tabel `FORCE` dan sebagian tidak akan membuat orang menebak mana
  yang berlaku, dan tebakan itu akan salah pada tabel yang paling penting.

---

## 8. Cara memverifikasi keputusan ini masih benar

```bash
node scripts/db/introspect.mjs rls                    # 123 aktif / 0 force
node apps/api/scripts/audit-force-rls.mjs             # tripwire 1 & 2
```

Kalau penjaga itu merah, keputusan di dokumen ini **kedaluwarsa** — bukan
penjaganya yang salah. Perbarui dokumennya lebih dulu, baru kodenya.
