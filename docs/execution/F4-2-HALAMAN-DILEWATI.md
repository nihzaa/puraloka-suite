# F4-2 — Halaman yang SENGAJA tidak dipindah ke lapis cache

> Ditulis 2026-08-16. Tujuannya satu: **mencegah sesi berikutnya "memperbaiki"
> hal yang memang tak boleh diperbaiki.**
>
> Penjaga `audit-halaman-pakai-cache.mjs` menghitung halaman yang belum memakai
> `useData()`. Sembilan halaman di bawah akan selamanya terhitung di sana, dan
> itu **benar** — bukan hutang, bukan kelalaian.
>
> Tanpa dokumen ini, angka penjaga yang tak pernah mencapai nol akan terbaca
> sebagai pekerjaan yang belum selesai, dan seseorang akan memindahkannya.

---

## Kenapa daftar ini ada, bukan sekadar komentar di berkasnya

Komentar di dalam berkas hanya terbaca oleh yang **sudah membuka** berkas itu.
Yang berbahaya justru yang membaca **angka penjaga** dan memutuskan dari sana:
"masih 9 halaman, ayo habiskan."

Repo ini sudah punya kejadian persis begitu — peringatan basi di `STATUS.md`
menghentikan pekerjaan yang boleh jalan selama sembilan hari (CLAUDE.md §5.5).
Kali ini kebalikannya yang dijaga: **angka yang benar-benar tak boleh nol.**

---

## 1. Jalur offline — memindahkannya MENCABUT kemampuan, bukan menambah

`useData` adalah cache **di memori**: hilang begitu tab ditutup. `cache-baca.ts`
dan `antrean-*.ts` adalah cache **IndexedDB**: bertahan, dan sengaja dibangun
untuk mandor di lokasi tanpa sinyal (F4-3).

Keduanya bukan versi lama dan baru dari hal yang sama. Mereka menjawab
pertanyaan berbeda.

| Halaman | Mekanisme | Yang hilang kalau dipindah |
|---|---|---|
| `procurement/permintaan` | `bacaDenganCache` | Mandor membuka permintaan material di lokasi tanpa sinyal → layar kosong |
| `lapangan/inspeksi` | `bacaDenganCache` | Sama — daftar inspeksi tak terbaca di lapangan |
| `mandor-portal/progress` | `antrean-foto` (IndexedDB) | Jalur tulis foto terikat erat ke muat berantai per-proyek |

**Tandanya:** berkasnya mengimpor `cache-baca`, `antrean-offline`, atau
`antrean-foto`.

⚠ `kirim-lapangan.ts` **BUKAN** penanda. Itu antrean **TULIS** (POST/PATCH/PUT);
sisi BACA halaman yang memakainya tetap boleh dipindah. Satu agent sempat
hampir melewati halaman karena salah membaca ini, lalu memeriksa sumbernya dan
menyimpulkan dengan benar.

---

## 2. Rantai `.catch()` cadangan — `useData` tak bisa mengungkapkannya

| Halaman | Bentuk |
|---|---|
| `mandor-portal/scope` | `my-scopes` gagal → jatuh ke `assignments` |
| `mandor-portal/penagihan` | pola cadangan yang sama |

`useData` tak punya catch per-permintaan. Menirunya berarti membungkus cache
dengan logika cadangan di luar — menulis ulang mekanismenya alih-alih
memakainya.

⚠ Bedakan dari `keuangan/pembayaran`, yang **berhasil** dipindah: di sana
`.catch()` hanya membuat satu endpoint opsional, dan itu diungkapkan dengan
mengeluarkan galat endpoint tersebut dari `galatMuat` gabungan. Yang tak bisa
adalah cadangan yang **mengganti URL**.

---

## 3. Muat berantai lebih dari dua tingkat

| Halaman | Bentuk |
|---|---|
| `procurement/rfq` | proyek → daftar RFQ → MR-layak (bergantung proyek terpilih) → detail (bergantung id efektif turunan), dengan penghitung muat-ulang bersama lintas dua efek |
| `mandor/tender` | daftar → `idEfektif` turunan → detail berkunci `${idEfektif}#${muatUlangKe}`, dengan mekanisme penjaga-basi yang sudah teruji dan didokumentasikan panjang di berkasnya |
| `proyek/[id]` | 2.082 baris. `fetchProject` dipanggil dari efek mount DAN dari `handleEditSuccess`; efek kedua mengambil EVM dari `/kurva-s` dan me-reset-nya tiap `id` berubah; efek ketiga menggulir ke hash URL bergantung state `loading` |

`useData` mendukung berantai dua tingkat lewat `useData(kondisi ? url : null)`.
Di atas itu, menirunya berarti membangun ulang koordinasinya.

---

## 4. Debounce

| Halaman | Bentuk |
|---|---|
| `keuangan/arus-kas` | saringan ber-debounce 300ms menggabung **enam** state jadi satu URL dinamis, mengambil dua endpoint bersamaan, plus muat kategori berantai yang di-reset saat proyek berubah |

Membungkusnya berarti menulis ulang mekanisme debounce **di atas** cache
alih-alih memakai cache sebagaimana dirancang.

---

## Syarat pencabutan — kapan halaman di sini boleh dipindah

Daftar ini bukan larangan abadi. Tiap alasan punya syarat pencabutannya:

| Alasan | Boleh dipindah bila |
|---|---|
| Jalur offline | `useData` punya jalur persist (IndexedDB) yang setara — bukan sebelum itu |
| Rantai `.catch()` | `useData` menerima URL cadangan, atau endpointnya digabung di server jadi satu |
| Berantai >2 tingkat | koordinasinya disederhanakan lebih dulu sebagai perubahan TERSENDIRI, bukan sambil memindahkan |
| Debounce | debounce dipindah ke pembentukan URL (bukan ke pemuatan), sehingga `useData` cukup menerima URL yang sudah stabil |

**Aturan yang sama dengan CLAUDE.md §5.5:** kalau sebuah larangan punya syarat
pencabutan, tulis cara mengukur syaratnya — jangan tinggalkan larangan telanjang
yang lalu membusuk.

---

## Cara memeriksa daftar ini masih benar

```bash
# Halaman yang belum pakai useData (termasuk sembilan di atas)
cd apps/api && node scripts/audit-halaman-pakai-cache.mjs

# Mana yang memakai jalur offline — penanda kategori 1
grep -rl "bacaDenganCache\|antrean-offline\|antrean-foto" apps/web/app --include=page.tsx
```

Kalau angka penjaga mendekati **9** dan tak turun lagi, itu bukan pekerjaan yang
mandek — itu daftar ini.
