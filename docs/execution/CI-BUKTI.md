# CI-BUKTI — Setiap Penjaga Terbukti Bisa MERAH

**Diuji:** 2026-08-03 · **Metode:** sabotase sengaja → jalankan penjaga → periksa
exit code → pulihkan. Tiap uji dijalankan **dua arah**: rusak harus `exit 1`,
bersih harus `exit 0`.

> **Kenapa berkas ini ada.** Cacat yang ditemukan 2026-08-02 bukan sekadar pemicu
> CI yang salah — cacatnya adalah **tak seorang pun pernah memverifikasi CI
> benar-benar bisa menggagalkan sesuatu**. Penjaga yang tak pernah terbukti merah
> harus dianggap tidak ada.

---

## Ringkasan

| # | Penjaga | Sabotase | Rusak | Bersih | Verdict |
|---|---|---|---|---|---|
| 1 | **Literal peran (ADR-004, API)** | `u.role === 'admin'` di route | `exit 1` | `exit 0` | ✅ |
| 2 | Penomoran migrasi | berkas `176_*` (nomor ganda) | `exit 1` | `exit 0` | ✅ |
| 3 | Tabrakan definisi tabel | migrasi kedua `CREATE TABLE … accounts` | `exit 1` | `exit 0` | ✅ |
| 4 | Kesegaran dokumen konteks | `"Database — 27+ Tabel"` di `CLAUDE.md` | `exit 1` | `exit 0` | ✅ |
| 5 | Ratchet coverage | summary palsu 9,4% (lantai 31,98%) | `exit 2` | `exit 0` | ✅ |
| 6 | Gerbang tenancy | endpoint `supabase.from()` tanpa saringan | `exit 1` | `exit 0` | ✅ |
| 7 | Rollback policy tenant | `DROP POLICY` dilewati di test | `1 failed` | `6 passed` | ✅ |
| 8 | Penegas bentuk GL (175) | bentuk 047 di schema sementara | `RAISE` | `NOTICE` | ✅ |
| 9 | Dokumen kembar | — | — | `exit 0` | ⚠️ §2 |
| 10 | Secret scan (gitleaks) | — | — | hijau di CI | ⚠️ §2 |
| 11 | Hex literal (web) | — | — | hijau di CI | ⚠️ §2 |

**8 dari 11 terbukti dua arah.** Tiga sisanya di §2 dengan alasan tertulis.

---

## 1. Temuan terpenting: satu aturan ternyata tak dijaga sama sekali

Uji #1 dimulai sebagai formalitas dan langsung menemukan lubang nyata.

Menyisipkan gerbang otorisasi berbasis literal peran ke berkas route:

```ts
export const _ujiGerbang = (u: { role: string }) => u.role === 'admin'
```

lalu menjalankan **seluruh 14 penjaga CI** yang ada:

```
audit-gerbang-tenancy         exit=0
audit-kegagalan-senyap        exit=0
audit-tulis-tanpa-periksa     exit=0
audit-catch-senyap            exit=0
audit-penjaga-saldo           exit=0
audit-guard-schema            exit=0
audit-docs-freshness          exit=0
audit-tabrakan-definisi-tabel exit=0
audit-penomoran-migrasi       exit=0
lint:ratchet                  exit=0
→ TAK SATU PUN MENANGKAP
```

**ADR-004 — aturan yang membuat SaaS multi-perusahaan mungkin — selama ini hanya
konvensi di sisi API, bukan gerbang.**

Yang membuatnya lolos: `apps/web/scripts/adr004-ratchet.mjs` memang ada dan
berjalan di CI, tetapi cakupannya **hanya sisi web**. Header-nya menyatakan
*"Sisi API sudah patuh (`requirePermission` di mana-mana)"* — dan pengukuran
membuktikan itu **tidak benar**: **52 pelanggaran di `apps/api/src`**.

Penjaga baru: `apps/api/scripts/audit-literal-peran.mjs` (ratchet, lantai 52).

Bukti dua arah:
```
dgn pelanggaran baru (53)  exit=1   ← MERAH
setelah dipulihkan   (52)  exit=0   ← HIJAU
```

Ratchet, bukan ambang nol: 52 pelanggaran lama adalah utang Fase 3 (F3-1).
Ambang nol hari ini = CI merah permanen = penjaga dimatikan orang.

---

## 2. Tiga yang belum diuji dua arah — dan kenapa

Dinyatakan apa adanya, bukan diklaim hijau.

**#9 Dokumen kembar (`audit-no-stale-docs-path`).** Terbukti hijau (247 berkas,
nol duplikat), tetapi uji merahnya menuntut menambahkan berkas `.md` duplikat
identik lalu meng-commit-nya. Berjalan benar secara logika (hash isi + nama), namun
**belum dibuktikan merah**. → antrean.

**#10 Secret scan (gitleaks).** Berjalan di CI atas **seluruh riwayat** dengan
binary ter-pin v8.30.1. Tidak diuji lokal karena butuh mengunduh binary, dan
menyisipkan rahasia palsu ke riwayat git bukan tindakan yang pantas dilakukan
demi uji — ia meninggalkan jejak permanen di repo **publik**. Uji merahnya
sebaiknya lewat PR sekali-pakai yang langsung ditutup. → antrean.

**#11 Hex literal (`kontras-hex-ratchet.mjs`).** Berjalan di CI job `web`.
Belum disabotase karena job web tidak dijalankan dalam sesi ini. → antrean.

---

## 3. Detail uji yang dijalankan

```bash
# 1 — literal peran
printf "\nexport const _u = (u:{role:string}) => u.role === 'admin'\n" >> src/routes/v1/units.ts
node scripts/audit-literal-peran.mjs        # exit 1 ✅

# 2 — nomor migrasi ganda
touch db/migrations/176_uji_bentrok.sql
node scripts/audit-penomoran-migrasi.mjs    # exit 1 ✅

# 3 — tabrakan definisi tabel
echo "CREATE TABLE IF NOT EXISTS accounts (…)" > db/migrations/177_uji.sql
node scripts/audit-tabrakan-definisi-tabel.mjs  # exit 1 ✅

# 4 — angka busuk di dokumen konteks
printf "\nDatabase — 27+ Tabel.\n" >> CLAUDE.md
node scripts/audit-docs-freshness.mjs       # exit 1 ✅

# 5 — coverage di bawah lantai
# (summary palsu 9,4% vs lantai 31,98%)
node scripts/coverage-ratchet.mjs           # exit 2 ✅

# 6 — endpoint tanpa gerbang tenancy
# (tambah rute supabase.from('projects') tanpa saringan)
node scripts/audit-gerbang-tenancy.mjs      # exit 1 ✅
```

Uji #7 (rollback policy) dan #8 (penegas bentuk GL) didokumentasikan di
`JOURNAL.md` sesi 2026-08-03 — keduanya mutation-tested saat dibangun.

**Seluruh sabotase dipulihkan.** Diverifikasi: `git status` bersih, dan setiap
penjaga kembali `exit 0` setelah pemulihan.

---

## 4. Branch protection — status check wajib

```
strict: true · 5 check wajib · force_push: false · deletions: false
```

Terbukti bekerja, bukan sekadar terpasang: PR #133 yang CI-nya merah berubah
status `MERGEABLE` → **`BLOCKED`**.

**Catatan:** daftar check wajib masih menyebut nama job lama
(`API — lint, typecheck, test, build`). Setelah sharding, nama job berubah
menjadi ber-suffix matrix, dan **daftar itu harus diperbarui** — kalau tidak,
GitHub menunggu check yang tak akan pernah muncul dan PR tertahan selamanya.
Diperbarui bersamaan dengan penerapan shard; lihat `RATIFIKASI.md` B-4.

`enforce_admins` sengaja **false** — founder tetap bisa menerobos bila perlu.
