# API-GAPS — yang diminta redesign tetapi endpoint-nya belum ada

> Diwajibkan brief redesign §7.4 dan §9 (Aturan Emas).
>
> **Aturannya sederhana:** kalau sebuah widget butuh data yang belum ada
> endpoint-nya, ia **tidak dibangun dengan angka karangan** — ia dicatat di
> sini, dan UI-nya menampilkan keadaan kosong yang jujur.
>
> Berkas ini bukan daftar keinginan. Tiap baris menyebut **siapa yang
> membutuhkannya** dan **apa yang tampil sementara ini**.

---

## Terbuka

### 1. Aktivitas terbaru (lintas modul)

| | |
|---|---|
| **Diminta oleh** | Rail kanan halaman ikhtisar (brief §3.7 pola 5, §3.8) |
| **Referensi** | "Recent Activity" di gambar BuildAxis |
| **Bentuk yang dibutuhkan** | daftar peristiwa lintas modul: siapa · apa · kapan · tautan |
| **Kenapa belum bisa** | `audit_logs` mencatat perubahan tabel, bukan **peristiwa yang berarti bagi manusia**. Menampilkannya apa adanya menghasilkan baris seperti *"UPDATE projects.updated_at"* — benar secara teknis, tak berguna sama sekali |
| **Sementara ini** | Kartu **tidak dibangun**. Rail diisi milestone & progres yang datanya sudah ada |
| **Perkiraan** | M — butuh keputusan peristiwa mana yang layak muncul, bukan sekadar query |

### 2. Deret historis KPI beranda (UIR-4B)

| | |
|---|---|
| **Diminta oleh** | Sparkline di kartu KPI (brief §3.4) |
| **Bentuk yang dibutuhkan** | 6 endpoint deret bulanan untuk 6 KPI beranda |
| **Kenapa belum bisa** | Endpoint KPI hari ini mengembalikan **satu angka**, bukan deret |
| **Terukur 2026-08-08** | Datanya **ADA** — 8–9 bulan riwayat nyata di kolom tanggal bisnis (`projects.start_date`, `invoices.issued_date`, `payments.paid_at`, `kasbons.kasbon_date`, `progress_logs.logged_at`). Yang belum ada hanya endpoint-nya |
| **Sementara ini** | Kartu KPI tampil **tanpa** sparkline — bukan dengan garis datar hiasan |
| **Perkiraan** | M — sudah diratifikasi (§C.0 no.5), dijadwalkan UIR-4B |

---

## Sudah ditutup

### ~~Antrean keputusan lintas modul~~ — ternyata SUDAH ADA

Sempat direncanakan sebagai endpoint baru untuk "Bilah Keputusan".
Diukur 2026-08-08: **`GET /api/v1/dashboard/fokus` sudah menyediakannya**,
lengkap dengan `rincian` lima angka terpisah (invoice jatuh tempo, klaim lewat
batas, instruksi belum dikonfirmasi, kasbon menunggu, penagihan menunggu).

Yang kurang bukan endpoint-nya melainkan **pemakaiannya**: UI lama hanya
memakai dua total dan membuang rinciannya. Ditutup oleh UIR-4 tanpa satu pun
endpoint baru.

---

### Cara memeriksa berkas ini masih benar

```bash
# Endpoint yang ada hari ini
grep -rEn "app\.(get|post)\('/api/v1" apps/api/src/routes/v1/dashboard.ts

# Riwayat untuk sparkline — pakai kolom tanggal BISNIS, bukan created_at
node scripts/db/introspect.mjs columns | grep -E "issued_date|paid_at|kasbon_date|logged_at"
```
