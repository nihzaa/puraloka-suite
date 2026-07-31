# Discovery — Rekonsiliasi Pagu RAP vs Realisasi Belanja (ROADMAP #8)

**Tanggal:** 2026-07-31 · **Sifat:** temuan terukur, bukan rancangan
**Alat:** `apps/api/scripts/discovery-rap-realisasi.mjs` (read-only, bisa diulang)

> **Kesimpulan di depan: JANGAN bangun rekonsiliasi sekarang.** Bukan karena
> sulit — karena data yang mau direkonsiliasi belum ada, dan titik sambungnya
> terbukti tidak bisa ditebak. Membangunnya sekarang menghasilkan angka yang
> terlihat benar dan tidak ada yang tahu salahnya.

## Kenapa discovery ini dijalankan

Migrasi 138 (`rap_budget`) sengaja tidak membangun sambungan ke realisasi
belanja, dengan alasan tertulis di berkasnya sendiri:

> "titik sambungnya (`resource_id` ↔ material procurement) belum dipastikan, dan
> menebaknya sekarang berarti menulis join yang harus dibongkar lagi."

`ROADMAP.md` #8 menempatkan rekonsiliasi ini di Tingkat 1 (dampak tertinggi) —
tapi mensyaratkan discovery lebih dulu. Ini hasilnya.

## Temuan

### 1. Dua registry itu bukan dua versi dari hal yang sama

| Registry | Baris | Dipakai oleh |
|---|---|---|
| `resources` kategori `material` | **2.680** | RAP (`rap_material_line.resource_id`) |
| `materials` | **23** aktif | Procurement (`purchase_order_items.material_id`) |

Selisih 100× lipat bukan kebetulan atau data kotor. `resources` adalah **katalog
AHSP nasional** hasil impor (kode `AHSP-R####`); `materials` adalah **daftar
belanja yang benar-benar dipakai** — 23 barang yang nyata dibeli.

### 2. Pemetaan by-name: 0,1% — dan penyebabnya bukan ejaan

Hanya **2 dari 2.680** cocok (`Bata merah`, `Pasir Pasang`). Yang gagal
memperlihatkan bahwa keduanya beroperasi pada granularitas berbeda:

| `resources` (AHSP) | `materials` (belanja) |
|---|---|
| `1 kg Penulangan Slab untuk BjTP atau BjTS diameter < 12 mm, cara Manual` | `Besi Beton 10mm` |
| `1 m3 beton mutu sedang fc 25 Mpa, Slum (100 ± 25) mm, agregat maks 19 mm secara mekanis` | `Semen Portland 50kg` |
| `AC Cassette Kap : 15.400 BTUH dan aksesoris` | — |

Sisi kiri adalah **item analisa harga satuan** (pekerjaan + material + upah
menyatu). Sisi kanan adalah **barang yang dibeli di toko**. Normalisasi ejaan
tak akan menutup jarak ini; keduanya memang bukan entity yang sama.

Beberapa nama juga mengandung newline dan sisa impor
(`(nama kosong di workbook — ANALISA STANDAR baris 15)`) — tanda katalog ini
belum dibersihkan untuk konsumsi manusia.

### 3. Belum ada yang bisa direkonsiliasi

| Tabel | Baris |
|---|---|
| `rap_material_line` | **0** |
| `purchase_order_items` | 8 (6 material unik) |
| `goods_receipt_items` | 4 |
| `project_expenses` | 72 |

`rap_material_line` **kosong**: belum ada satu pun RAP yang punya baris material.
Rekonsiliasi "pagu vs realisasi" dengan pagu nol bukan fitur — ia laporan yang
selalu menampilkan angka yang sama.

### 4. Jalur belanja terbesar tak punya kolom material sama sekali

`project_expenses` (72 baris — jalur belanja terbanyak) **tidak punya kolom
`material_id`/`resource_id`**. Belanja di sini dicatat sebagai nominal + kategori,
tanpa item. Artinya bahkan dengan pemetaan sempurna sekalipun, mayoritas
realisasi tetap tak bisa diatribusikan ke pagu mana pun.

Yang punya item hanya jalur PO/GR: 8 + 4 baris.

## Konsekuensi untuk desain

**Join by-name dilarang.** 0,1% kecocokan pada granularitas yang berbeda berarti
join apa pun akan menghasilkan tabel rekonsiliasi yang hampir seluruhnya kosong,
dengan beberapa baris kebetulan cocok yang justru menyesatkan.

**Kolom pemetaan eksplisit adalah jawabannya — tapi belum sekarang.** Bentuk
yang benar: tabel jembatan `resource_id ↔ material_id` yang **diisi manusia**
saat sebuah material benar-benar dibeli untuk sebuah pos RAP, bukan ditebak
mesin. Ini menghormati kenyataan bahwa satu pos AHSP bisa memerlukan beberapa
barang belanja, dan satu barang bisa melayani beberapa pos.

**Gerbangnya:** bangun saat ada **RAP terkunci dengan baris material** DAN
**belanja nyata yang menunjuk pos itu**. Sebelum keduanya ada, jembatan itu tak
punya penumpang — dan bentuk yang benar hanya ketahuan dari pemakaian nyata.

## Yang layak dikerjakan lebih dulu

Discovery ini memindahkan #8 ke belakang, bukan menghapusnya. Prasyaratnya:

1. **`project_expenses` perlu atribusi item** kalau belanja terbesar mau
   direkonsiliasi sama sekali. Tanpa ini, 72 dari 84 baris belanja tetap buta.
2. **Katalog `resources` perlu dibersihkan** — nama ber-newline dan placeholder
   impor akan mempersulit pemetaan manual nantinya.
3. **RAP perlu dipakai sungguhan** — satu proyek nyata dengan baris material,
   supaya bentuk jembatannya lahir dari kebutuhan, bukan dari bayangan.

## Cara mengulang pengukuran ini

```bash
node apps/api/scripts/discovery-rap-realisasi.mjs
```

Read-only, aman dijalankan kapan saja. Jalankan lagi sebelum memutuskan membangun
— angka di atas adalah potret 2026-07-31, dan gerbangnya justru menunggu
angka-angka itu berubah.
