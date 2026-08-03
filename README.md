# Puraloka Suite

ERP konstruksi multi-tenant milik **Puraloka Persada** — manajemen proyek,
RAB/AHSP, procurement, keuangan, dan lapangan dalam satu sistem.

> **Repo ini punya banyak dokumen. Kalau Anda baru, baca yang ini saja dulu,**
> lalu `docs/execution/CHARTER.md` sebelum menyentuh kode.

---

## Mulai

```bash
git clone https://github.com/nihzaa/puraloka-suite.git
cd puraloka-suite
pnpm install
pnpm bootstrap        # menyiapkan .env + memeriksa prasyarat
```

`pnpm bootstrap` **tidak menulis apa pun ke database** dan **tidak menimpa
`.env` yang sudah ada**. Ia boleh dijalankan kapan saja untuk mendiagnosis
lingkungan yang rusak — ia akan menyebut variabel mana yang kurang, beserta
baris kode yang membutuhkannya.

Terakhir diukur (2026-08-03, Windows 11 / Node 24 / pnpm 11):

| Langkah | Waktu |
|---|---|
| `git clone --depth 1` | 2 dtk |
| `pnpm install --frozen-lockfile` | 17 dtk |
| **klon → siap** | **≈ 19 dtk** (di luar pengisian `.env`) |

Lalu:

```bash
pnpm dev:api     # API → http://localhost:3001
pnpm dev:web     # Web → http://localhost:3000
```

### ⚠️ Windows — klon ke path yang PENDEK

Path terpanjang di repo ini 152 karakter. Batas Windows 260 karakter berlaku
untuk path **absolut**, jadi mengklon ke direktori yang sudah dalam akan
membuat `git checkout` gagal separuh jalan:

```
error: unable to create file docs/superpowers/specs/.../28-phase-l-...md:
       Filename too long
fatal: unable to checkout working tree
```

Klon berhasil, checkout-nya yang gagal — jadi repo terlihat ada tapi isinya
tak lengkap. Dua jalan keluar:

```bash
# (a) klon ke path pendek — C:\proyek\puraloka-suite, bukan Documents\...\...
# (b) aktifkan dukungan path panjang (sekali, butuh admin)
git config --system core.longpaths true
```

### Yang harus Anda sediakan sendiri

Sebuah project **Supabase** (Postgres + Auth + Storage). Isikan ke
`apps/api/.env` dan `apps/web/.env.local` — `.env.example` di masing-masing
folder menjelaskan tiap variabel, mana yang wajib, dan apa yang mati kalau
sebuah variabel opsional dikosongkan.

Jalankan migrasi di `db/migrations/` berurutan ke database itu. Verifikasi
hasilnya dengan alat introspeksi, jangan dengan asumsi:

```bash
pnpm db identity     # koneksi + sidik jari schema
pnpm db tables       # jumlah tabel, RLS, policy
node scripts/db/ledger-diff.mjs   # buku migrasi vs artefak fisik
```

---

## Perintah

| Perintah | Kegunaan |
|---|---|
| `pnpm bootstrap` | siapkan & diagnosis lingkungan |
| `pnpm dev:api` / `pnpm dev:web` | jalankan API / Web |
| `pnpm test` | test integrasi API (**butuh DB nyata**) |
| `pnpm typecheck` | tsc di kedua app |
| `pnpm lint:ratchet` | lint + penjaga ratchet |
| `pnpm build` | build produksi |
| `pnpm db <sub>` | introspeksi schema |

---

## Bentuk sistem

```
apps/api/     Fastify + TypeScript          → :3001
apps/web/     Next.js + Tailwind v4         → :3000
apps/mobile/  React Native + Expo
db/migrations/  migrasi SQL bernomor
scripts/db/     alat introspeksi (KANONIK — sumber semua angka schema)
docs/execution/ CHARTER, QUEUE, JOURNAL, RATIFIKASI
```

`packages/shared` terdaftar di workspace tetapi **kosong** — jangan
menganggapnya berisi types bersama.

Ukuran hari ini (2026-08-03 — perintahnya ada di `CLAUDE.md` §1, jalankan
sendiri daripada mempercayai angka ini):

| | |
|---|---|
| Endpoint | 317 |
| Halaman web | 59 |
| Migrasi | 174 berkas |
| Tabel (schema dev) | 123 |
| Test | 1.347 lulus / 135 berkas (254 dtk) |

---

## Test

Test di repo ini adalah **integration test terhadap Postgres NYATA**, bukan
mock. Itu disengaja: yang paling sering rusak di sistem ini adalah RLS,
constraint, dan trigger — dan mock membuat ketiganya tak terlihat.

Konsekuensinya `pnpm test` butuh `DIRECT_URL` yang hidup. Tanpa itu ia gagal,
dan gagalnya benar.

CI menjalankannya dalam 6 shard paralel.

---

## Yang wajib diketahui sebelum mengubah kode

Empat aturan ini bukan gaya penulisan — melanggarnya merusak data pelanggan.
Penjelasan penuh: `CLAUDE.md` §5.

1. **Otorisasi lewat `requirePermission`, bukan nama peran.** Literal
   `'admin'`/`'pm'`/`'mandor'` dilarang sebagai gerbang — peran adalah data
   konfigurasi per-tenant, bukan konstanta (ADR-004).
2. **Akses data lewat `request.db`**, yang sadar tenant. Bukan `supabase`
   mentah.
3. **Uang selalu `numeric`, waktu selalu `timestamptz`.** Nol float. Buktikan
   dengan `pnpm db money-types`.
4. **Ember [C] tak boleh bisa dikonfigurasi dari UI** — RLS aktif/mati,
   invariant pembukuan berpasangan, immutability audit log, default
   gagal-tertutup, struktur rumus finansial, isolasi tenant.

CI menjalankan penjaga arsitektural yang semuanya **ratchet**: angka hari ini
adalah lantai, tak boleh naik. Melemahkannya butuh ratifikasi tertulis
(Gerbang Keras G-5). Daftarnya di `CLAUDE.md` §6.

---

## Dokumen

| Kebutuhan | Berkas |
|---|---|
| Aturan untuk agent & pengembang | `CLAUDE.md` |
| Kewenangan, fase, gerbang | `docs/execution/CHARTER.md` |
| Antrean kerja | `docs/execution/QUEUE.yaml` |
| Menunggu keputusan founder | `docs/execution/RATIFIKASI.md` |
| Endpoint | `docs/API_ENDPOINTS.md` |
| Skema DB | ukur: `pnpm db columns` |

---

## Lisensi

Perangkat lunak milik **Puraloka Persada**. Hak cipta dilindungi.
