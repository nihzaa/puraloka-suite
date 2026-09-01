# Solver Rangka Dipakai — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membuat solver rangka 2D (lapis 1–5, sudah terbukti) benar-benar dipakai orang — lewat rute API, mode ketiga di layar Rekomendasi Pembesian, dan diagram M/V/lendutan yang digambar dari deret titik solver sendiri.

**Architecture:** Nol perubahan pada `rangka-matriks.ts` dan `rangka-model.ts` — keduanya sudah terbukti lewat 34 test dan tujuh mutasi. Yang ditambah: satu penggambar SVG baru yang membaca `HasilBatang`, satu fungsi penyambung solver→rekomendasi tulangan, satu rute, dan satu mode di layar yang sudah ada.

**Tech Stack:** TypeScript (ESM, ekstensi `.js` di import), Fastify, Next.js, Vitest, Playwright untuk potret layar.

**Spec:** `docs/superpowers/specs/2026-09-01-solver-rangka-2d-design.md` §5, §6 (keluaran & penyambungan)

## Global Constraints

- **PURE untuk `lib/`.** Penggambar dan penyambung tanpa I/O, seperti seluruh `struktur-*.ts` dan `rangka-*.ts`.
- **Import ESM wajib berekstensi `.js`** meski berkasnya `.ts`.
- **JANGAN mengubah `rangka-matriks.ts`, `rangka-model.ts`, `rangka-portal.ts`, `rangka-truss.ts`.** Keempatnya terbukti (34 test, 7 mutasi). Kalau yakin ada cacat, LAPORKAN — jangan perbaiki diam-diam.
- **Rute wajib `requirePermission('cecep:struktur:view')`** — kunci yang SAMA dengan `saran-pembesian`. Kunci baru yang tak ada di tabel `permissions` menolak SEMUA orang tanpa gejala.
- **Rute salah-masukan membalas 400, bukan 500** — yang salah isinya, dan pesannya menyebut medannya.
- **`catatan` WAJIB ikut ditampilkan layar.** Di dalamnya batas yang menentukan sah-tidaknya angka dipakai. Usulan tanpa batasnya adalah angka yang terlihat lebih pasti daripada sebenarnya.
- **Halaman TIDAK membawa `<Halaman>`/`<KepalaHalaman>` sendiri** — layout `estimasi/layout.tsx` sudah memberi judul & padding. Melanggar ini menghasilkan DUA `<h1>` dan padding ganda, dan `uji-judul-halaman-ada` TETAP HIJAU (ia memastikan judul ADA, bukan TUNGGAL).
- **`git add` WAJIB sebut-nama berkas.** Ada 5 sesi aktif di checkout ini.
- **TDD wajib**, dan **mutasi wajib** di Task 1 & 2.

---

## File Structure

| Berkas | Tanggung jawab |
|---|---|
| `apps/api/src/lib/rangka-gambar.ts` | SVG diagram M/V/lendutan dari deret titik `HasilBatang` |
| `apps/api/src/lib/rangka-ke-saran.ts` | Menyambung hasil solver → `sarankanBalok`/`sarankanKolom` |
| `apps/api/src/routes/v1/struktur.ts` | + rute `POST /api/v1/struktur/analisa-rangka` |
| `apps/web/app/(dashboard)/estimasi/pembesian/page.tsx` | + mode ketiga "Analisa rangka" |

---

### Task 1: Penggambar diagram dari deret titik solver

**Files:**
- Create: `apps/api/src/lib/rangka-gambar.ts`
- Test: `apps/api/src/lib/__tests__/rangka-gambar.test.ts`

**Interfaces:**
- Consumes: `HasilBatang` dari `rangka-model.js` (medan: `nama`, `momenKnm {maks,min,di[]}`, `geserKn {maks,min,di[]}`, `aksialKn`, `lendutanMm {maks,di[]}`)
- Produces: `gambarDiagramRangka(batang: HasilBatang, panjangM: number, opsi?: { lebar?: number }): string` → SVG

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/src/lib/__tests__/rangka-gambar.test.ts
import { describe, it, expect } from 'vitest'
import { analisaBalokMenerus } from '../rangka-portal.js'
import { gambarDiagramRangka } from '../rangka-gambar.js'

/** Balok menerus dua bentang — puncak momennya di x=0,375L, DI ANTARA cuplikan. */
function balokUji() {
  const h = analisaBalokMenerus({
    bentangM: [6, 6], bMm: 300, hMm: 500, fcMpa: 25, qKnM: 20,
  })
  return h.batang[0]!
}

describe('gambarDiagramRangka', () => {
  it('menghasilkan SVG yang sah dengan viewBox', () => {
    const svg = gambarDiagramRangka(balokUji(), 6)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toMatch(/viewBox="0 0 [\d.]+ [\d.]+"/)
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true)
  })

  it('menggambar TIGA panel: momen, geser, lendutan', () => {
    const svg = gambarDiagramRangka(balokUji(), 6)
    expect(svg).toMatch(/MOMEN/i)
    expect(svg).toMatch(/GESER/i)
    expect(svg).toMatch(/LENDUTAN/i)
  })

  it('memakai deret titik SOLVER, bukan menggambar dari rumus', () => {
    /*
      Inti test ini. Penggambar yang menghitung ulang bentuk diagramnya dari
      rumus akan menggambar sesuatu yang BUKAN hasil solver — dan selisihnya
      tak terlihat karena keduanya "berbentuk parabola".

      Cara memeriksanya: ubah SATU titik di deret, lalu tuntut SVG-nya
      berubah. Penggambar yang mengabaikan deret akan menghasilkan SVG
      yang sama persis.
    */
    const asli = balokUji()
    const svgAsli = gambarDiagramRangka(asli, 6)

    const diubah: typeof asli = {
      ...asli,
      momenKnm: {
        ...asli.momenKnm,
        di: asli.momenKnm.di.map((t, i) =>
          i === 5 ? { ...t, nilai: t.nilai * 0.5 } : t),
      },
    }
    expect(gambarDiagramRangka(diubah, 6)).not.toBe(svgAsli)
  })

  it('menandai nilai KRITIS, bukan cuma nilai cuplikan tertinggi', () => {
    /*
      `momenKnm.maks` memakai puncak ANALITIS (perbaikan e8a59e25): 50,625
      untuk balok ini, sementara cuplikan tertinggi cuma 50,400. Label di
      diagram WAJIB memakai yang pertama — kalau ia memakai maksimum deret,
      angka di layar lebih kecil dari yang dipakai memilih tulangan, dan
      keduanya terlihat wajar.
    */
    const b = balokUji()
    const svg = gambarDiagramRangka(b, 6)
    expect(b.momenKnm.maks).toBeCloseTo(50.625, 3)     // prasyarat
    expect(svg).toMatch(/50[.,]6/)                      // label memakai 50,6…
  })

  it('menolak panjang batang tak sah', () => {
    expect(() => gambarDiagramRangka(balokUji(), 0)).toThrow(/panjang/i)
    expect(() => gambarDiagramRangka(balokUji(), -3)).toThrow(/panjang/i)
  })

  it('aman terhadap batang tanpa lendutan berarti (semua nol)', () => {
    /*
      Kolom tanpa beban merata bisa memberi deret lendutan nol seluruhnya.
      Penskalaan yang membagi dengan rentang nol menghasilkan NaN di
      koordinat SVG — gambar kosong tanpa satu pun galat.
    */
    const b = balokUji()
    const nol: typeof b = {
      ...b,
      lendutanMm: { maks: 0, di: b.lendutanMm.di.map((t) => ({ ...t, nilai: 0 })) },
    }
    const svg = gambarDiagramRangka(nol, 6)
    expect(svg).not.toMatch(/NaN/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/lib/__tests__/rangka-gambar.test.ts`
Expected: FAIL — `Cannot find module '../rangka-gambar.js'`

- [ ] **Step 3: Write the implementation**

`apps/api/src/lib/rangka-gambar.ts`. Header WAJIB menjelaskan kenapa berkas ini ada dan kenapa TIDAK memakai ulang `gambarDiagramBeban`:

> `gambarDiagramBeban` terikat ke `HasilBebanBalok` (koefisien pendekatan) dan menggambar bentuknya dari RUMUS. Solver punya deret titik NYATA, dan itu data yang lebih baik — menggambarnya lewat adaptor ke bentuk lama berarti menampilkan diagram yang bukan hasil solvernya.

Ikuti pola `struktur-gambar-beban.ts` (baca dulu): tiga panel bertumpuk pada satu sumbu-x yang sama, supaya posisi puncak momen dan lompatan geser bisa dibaca sejajar.

1. Lebar 520 px, margin kiri/kanan 46 (sama dengan `gambarDiagramBeban` supaya sejajar bila ditampilkan berdampingan).
2. Tiga panel: MOMEN (kNm) · GESER (kN) · LENDUTAN (mm).
3. Skala tiap panel dari `Math.max(|maks|, |min|)` deret**nya sendiri**; bila rentangnya 0, pakai 1 sebagai pembagi (mencegah NaN).
4. Polyline dari `di[]` — inilah yang membuat diagram memakai hitungan solver.
5. Label nilai kritis memakai `momenKnm.maks/min` dan `geserKn.maks/min` (puncak ANALITIS), bukan `Math.max(...di)`.
6. `role="img"` + `aria-label` yang menyebut nama batang dan nilai kritisnya — halaman menampilkan SVG inline, dan tanpa label pembaca layar hanya menemukan gambar tanpa keterangan.
7. Angka diformat gaya Indonesia (koma desimal) — konsisten dengan penggambar lain.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/lib/__tests__/rangka-gambar.test.ts`
Expected: PASS — 6 test hijau

- [ ] **Step 5: MUTASI WAJIB**

```
a. Ganti sumber polyline dari `di[]` jadi rumus parabola karangan
   → HARUS memerahkan test "memakai deret titik SOLVER"
b. Ganti label kritis dari `momenKnm.maks` jadi `Math.max(...di.map(p=>p.nilai))`
   → HARUS memerahkan test "menandai nilai KRITIS"
```
Kalau ada yang tetap hijau, testnya tak menjaga apa-apa — laporkan.

⚠ **Mutasi (b) MEMANG selamat saat Task 1 dikerjakan, dan sebabnya layak
diingat.** `toMatch(/50[.,]6/)` mencari di SELURUH string SVG. Draf pertama
merakit `aria-label` dari `batang.momenKnm.maks` secara terpisah, jadi
"50,63" tetap ada di berkas walau label VISUALNYA sudah salah — test hijau
atas angka yang tak seorang pun lihat.

Diperbaiki bukan dengan melonggarkan test melainkan dengan menutup cacat
nyata di baliknya: `aria-label` kini dirakit dari daftar label yang
BENAR-BENAR tergambar (satu sumber). Dua sumber untuk satu angka berarti
pembaca layar dan pembaca awas bisa diberi tahu nilai berbeda, dan keduanya
terlihat wajar.

**Pelajaran umum:** assertion yang mencari di seluruh keluaran (SVG, HTML,
JSON) bisa hijau karena angka yang sama muncul di tempat LAIN. Kalau yang
diuji posisi/tampilan, ujilah bagian yang tepat — bukan keberadaan
substring di mana pun.

- [ ] **Step 6: Typecheck, lint, commit**

```bash
cd apps/api && npx tsc --noEmit && npx eslint src/lib/rangka-gambar.ts src/lib/__tests__/rangka-gambar.test.ts
cd /e/Project/puraloka-suite
git add -- apps/api/src/lib/rangka-gambar.ts apps/api/src/lib/__tests__/rangka-gambar.test.ts
git commit -m "feat(rangka): diagram M/V/lendutan dari deret titik solver

Penggambar BARU, bukan memakai ulang gambarDiagramBeban: yang lama
terikat HasilBebanBalok dan menggambar dari RUMUS, sementara solver
punya deret titik NYATA. Adaptor ke bentuk lama akan menampilkan
diagram yang bukan hasil solvernya.

Label kritis memakai puncak ANALITIS (momenKnm.maks), bukan maksimum
deret — pada balok menerus bedanya 50,625 vs 50,400, dan angka di layar
yang lebih kecil dari yang dipakai memilih tulangan sama-sama terlihat
wajar."
```

---

### Task 2: Penyambung solver → rekomendasi tulangan

**Files:**
- Create: `apps/api/src/lib/rangka-ke-saran.ts`
- Test: `apps/api/src/lib/__tests__/rangka-ke-saran.test.ts`

**Interfaces:**
- Consumes: `analisaPortal`, `InputPortal`, `HasilPortal` dari `rangka-portal.js`; `sarankanBalok`, `sarankanKolom`, `UsulanBalok`, `UsulanKolom`, `HasilSaran` dari `struktur-saran.js`
- Produces:
  - `interface InputSaranDariRangka { portal: InputPortal; selimutMm: number; mutu: { fcMpa: number; fyMpa: number; fyvMpa?: number } }`
  - `interface SaranBatang { nama: string; jenis: 'balok' | 'kolom'; muKnm: number; vuKn: number; puKn: number; saran: HasilSaran<UsulanBalok> | HasilSaran<UsulanKolom> }`
  - `sarankanDariRangka(input: InputSaranDariRangka): { batang: SaranBatang[]; rangka: HasilPortal; catatan: string[] }`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/src/lib/__tests__/rangka-ke-saran.test.ts
import { describe, it, expect } from 'vitest'
import { analisaPortal } from '../rangka-portal.js'
import { analisaBalok } from '../struktur-beton.js'
import { sarankanDariRangka, type InputSaranDariRangka } from '../rangka-ke-saran.js'

const MASUKAN: InputSaranDariRangka = {
  portal: {
    bentangM: 6, tinggiM: 3.5, jumlahLantai: 1,
    balok: { bMm: 300, hMm: 500 },
    kolom: { bMm: 400, hMm: 400 },
    fcMpa: 25, qKnM: 20,
  },
  selimutMm: 30,
  mutu: { fcMpa: 25, fyMpa: 420, fyvMpa: 280 },
}

describe('sarankanDariRangka', () => {
  it('mengusulkan tulangan untuk SETIAP batang portal', () => {
    const h = sarankanDariRangka(MASUKAN)
    // 1 lantai = 2 kolom + 1 balok
    expect(h.batang).toHaveLength(3)
    expect(h.batang.filter((b) => b.jenis === 'kolom')).toHaveLength(2)
    expect(h.batang.filter((b) => b.jenis === 'balok')).toHaveLength(1)
  })

  it('Mu/Vu yang dipakai IDENTIK dengan keluaran solver — nol hitungan kedua', () => {
    /*
      Pelajaran 5b43d275: sambungan yang membulatkan "biar rapi di layar"
      membuat angka yang tampil dan angka yang memilih tulangan berbeda.
      Keduanya terlihat wajar, tak ada galat.
    */
    const h = sarankanDariRangka(MASUKAN)
    const solver = analisaPortal(MASUKAN.portal)

    for (const s of h.batang) {
      const asli = solver.batang.find((b) => b.nama === s.nama)!
      const muAsli = Math.max(Math.abs(asli.momenKnm.maks), Math.abs(asli.momenKnm.min))
      const vuAsli = Math.max(Math.abs(asli.geserKn.maks), Math.abs(asli.geserKn.min))
      expect(s.muKnm).toBe(muAsli)
      expect(s.vuKn).toBe(vuAsli)
    }
  })

  it('usulan balok BENAR-BENAR aman terhadap Mu/Vu yang dilaporkannya', () => {
    const h = sarankanDariRangka(MASUKAN)
    const balok = h.batang.find((b) => b.jenis === 'balok')!
    if (!balok.saran.berhasil) return   // kegagalan diuji terpisah

    const t = balok.saran.terpilih as { dUtamaMm: number; nTarik: number; dSengkangMm: number; jarakSengkangMm: number }
    const verifikasi = analisaBalok({
      bMm: MASUKAN.portal.balok.bMm, hMm: MASUKAN.portal.balok.hMm,
      panjangM: MASUKAN.portal.bentangM, selimutMm: MASUKAN.selimutMm,
      mutu: MASUKAN.mutu, muKnm: balok.muKnm, vuKn: balok.vuKn,
      dUtamaMm: t.dUtamaMm, nTarik: t.nTarik,
      dSengkangMm: t.dSengkangMm, jarakSengkangMm: t.jarakSengkangMm,
    })
    const gagal = verifikasi.periksa.filter((p) => !p.aman).map((p) => p.nama)
    expect(gagal, `usul tak aman: ${gagal.join(', ')}`).toEqual([])
  })

  it('kolom memakai aksial dari solver, bukan nol', () => {
    /*
      Kolom yang diberi Pu = 0 akan diusulkan tulangan minimum — dan itu
      terlihat wajar. Aksialnya HARUS datang dari solver.
    */
    const h = sarankanDariRangka(MASUKAN)
    for (const k of h.batang.filter((b) => b.jenis === 'kolom')) {
      expect(k.puKn).toBeGreaterThan(0)
    }
  })

  it('membawa catatan solver DAN catatan tulangan', () => {
    const gabung = sarankanDariRangka(MASUKAN).catatan.join(' ')
    expect(gabung).toMatch(/elastis linier/i)     // dari solver
    expect(gabung).toMatch(/ESTIMASI AWAL/i)      // dari mesin tulangan
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/lib/__tests__/rangka-ke-saran.test.ts`
Expected: FAIL — `Cannot find module '../rangka-ke-saran.js'`

- [ ] **Step 3: Write the implementation**

`apps/api/src/lib/rangka-ke-saran.ts`:

1. Panggil `analisaPortal(input.portal)`.
2. Untuk tiap batang, pilah dari namanya: berawalan `B` → balok, `K` → kolom.
3. **Mu/Vu/Pu diteruskan APA ADANYA** — `Math.max(Math.abs(maks), Math.abs(min))` untuk momen & geser, `Math.abs(aksialKn)` untuk kolom. Tulis komentar bahwa membulatkannya membuat dua angka berbeda.
4. Balok → `sarankanBalok({ bMm, hMm dari portal.balok, panjangM: bentangM, selimutMm, mutu, muKnm, vuKn })`.
5. Kolom → `sarankanKolom({ bMm, hMm dari portal.kolom, tinggiM, selimutMm, mutu, puKn, muKnm })`.
6. `catatan` = catatan solver + gabungan catatan tiap usulan, di-dedup (`[...new Set(...)]`).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/lib/__tests__/rangka-ke-saran.test.ts`
Expected: PASS — 5 test hijau

- [ ] **Step 5: MUTASI WAJIB**

```
a. Bulatkan Mu: `muKnm: Math.round(mu * 10) / 10`
   → HARUS memerahkan test "Mu/Vu IDENTIK"
b. Beri kolom `puKn: 0`
   → HARUS memerahkan test "kolom memakai aksial dari solver"
```

- [ ] **Step 6: Typecheck, lint, commit**

```bash
cd apps/api && npx tsc --noEmit && npx eslint src/lib/rangka-ke-saran.ts src/lib/__tests__/rangka-ke-saran.test.ts
cd /e/Project/puraloka-suite
git add -- apps/api/src/lib/rangka-ke-saran.ts apps/api/src/lib/__tests__/rangka-ke-saran.test.ts
git commit -m "feat(rangka): sambungkan solver ke rekomendasi tulangan

Tiap batang portal dapat usulan pembesiannya sendiri, dengan Mu/Vu/Pu
dari solver — bukan dari koefisien pendekatan, bukan diketik pemakainya.

Mu/Vu diteruskan APA ADANYA. Membulatkannya membuat angka yang tampil
di layar berbeda dari angka yang memilih tulangan, dan keduanya terlihat
wajar (pelajaran 5b43d275)."
```

---

### Task 3: Rute API

**Files:**
- Modify: `apps/api/src/routes/v1/struktur.ts`

**Interfaces:**
- Consumes: `sarankanDariRangka` dari `rangka-ke-saran.js`, `gambarDiagramRangka` dari `rangka-gambar.js`
- Produces: `POST /api/v1/struktur/analisa-rangka`

- [ ] **Step 1: Baca pola rute yang ada**

Buka `apps/api/src/routes/v1/struktur.ts` dan baca rute `saran-pembesian` (cari `'/api/v1/struktur/saran-pembesian'`). Rute baru mengikuti polanya PERSIS: `preHandler: [authenticate, requirePermission('cecep:struktur:view')]`, `try/catch` yang membalas 400 dengan `(e as Error).message`.

- [ ] **Step 2: Tambahkan rute**

Sisipkan SESUDAH rute `saran-pembesian`. Body:

```typescript
  app.post<{
    Body: {
      portal?: {
        bentangM?: number; tinggiM?: number; jumlahLantai?: number
        balok?: { bMm?: number; hMm?: number }
        kolom?: { bMm?: number; hMm?: number }
        fcMpa?: number; qKnM?: number; gayaLateralKn?: number[]
      }
      selimutMm?: number
      mutu?: { fcMpa?: number; fyMpa?: number; fyvMpa?: number }
      gambar?: boolean
    }
  }>(
    '/api/v1/struktur/analisa-rangka',
    { preHandler: [authenticate, requirePermission('cecep:struktur:view')] },
    async (request, reply) => {
      const b = request.body ?? {}
      try {
        const hasil = sarankanDariRangka({
          portal: b.portal as never,
          selimutMm: Number(b.selimutMm),
          mutu: {
            fcMpa: Number(b.mutu?.fcMpa),
            fyMpa: Number(b.mutu?.fyMpa),
            ...(b.mutu?.fyvMpa == null ? {} : { fyvMpa: Number(b.mutu.fyvMpa) }),
          },
        })

        /*
          Gambar OPSIONAL. Tiga panel × jumlah batang bisa puluhan KB, dan
          pemanggil yang cuma butuh angkanya (mis. mengisi RAB) tak perlu
          menanggungnya. Pola yang sama dengan rute `beban-balok`.
        */
        const gambar = b.gambar === false ? undefined : Object.fromEntries(
          hasil.rangka.batang.map((batang) => [
            batang.nama,
            gambarDiagramRangka(
              batang,
              batang.nama.startsWith('K')
                ? Number(b.portal?.tinggiM)
                : Number(b.portal?.bentangM),
            ),
          ]),
        )

        return reply.send({ ...hasil, gambar })
      } catch (e) {
        // 400, bukan 500 — yang salah masukannya, dan pesannya menyebut medannya.
        return reply.status(400).send({ error: (e as Error).message })
      }
    })
```

Tambahkan importnya ke blok import yang sudah ada:
```typescript
import { sarankanDariRangka } from '../../lib/rangka-ke-saran.js'
import { gambarDiagramRangka } from '../../lib/rangka-gambar.js'
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/api && npx tsc --noEmit`
Expected: exit 0. **JANGAN disaring.**

- [ ] **Step 4: Uji lewat HTTP SUNGGUHAN**

⚠ Port API BUKAN angka tetap. Ukur dulu:
```bash
cd /e/Project/puraloka-suite && node apps/api/scripts/audit-port-api-cocok.mjs
```

Jalankan API di port bebas (JANGAN pakai port yang sudah dipakai sesi lain — cek `netstat -ano | grep LISTENING`):
```bash
cd apps/api && PORT=3099 npx tsx src/index.ts
```

Login memakai cookie httpOnly (kredensial di `apps/web/.env.local`: `LAYAR_EMAIL`, `LAYAR_SANDI`). Token TIDAK ada di badan respons — ambil dari `Set-Cookie`.

Uji EMPAT kasus, tempel hasilnya:
1. portal wajar → 200, ada `batang[]`, `rangka`, `gambar`, `catatan`
2. `gambar: false` → 200, `gambar` undefined
3. masukan buruk (`bentangM: 0`) → **400** dengan pesan yang menyebut medannya
4. tanpa `mutu` → **400**

Matikan API-nya sesudah selesai.

- [ ] **Step 5: Penjaga + commit**

```bash
cd apps/api && for g in audit-kegagalan-senyap audit-catch-senyap audit-gerbang-tenancy audit-izin-benar-ada; do node scripts/$g.mjs >/dev/null 2>&1 && echo "$g HIJAU" || echo "$g MERAH"; done
npx eslint src/routes/v1/struktur.ts
cd /e/Project/puraloka-suite
git add -- apps/api/src/routes/v1/struktur.ts
git commit -m "feat(struktur): rute POST /struktur/analisa-rangka

Membuka solver rangka 2D lewat HTTP. Tiap batang portal dapat usulan
pembesiannya sendiri berikut diagram M/V/lendutannya.

Gambar OPSIONAL (`gambar: false`) — tiga panel x jumlah batang bisa
puluhan KB, dan pemanggil yang cuma butuh angkanya tak perlu
menanggungnya."
```

---

### Task 4: Mode ketiga di layar Rekomendasi Pembesian

**Files:**
- Modify: `apps/web/app/(dashboard)/estimasi/pembesian/page.tsx`

- [ ] **Step 1: Baca halamannya lebih dulu**

Halaman sudah punya dua mode (`type Mode = "angka" | "beban"`) dengan saklar, form beban ber-dropdown katalog, dan kartu "Beban yang dipakai". Mode ketiga mengikuti pola yang SAMA — jangan membuat pola baru.

- [ ] **Step 2: Perluas mode**

1. `type Mode = "angka" | "beban" | "rangka"`.
2. Tambahkan tombol ketiga "Analisa rangka" di saklar yang ada.
3. State baru `fr` untuk masukan portal: `bentangM`, `tinggiM`, `jumlahLantai`, `balokB`, `balokH`, `kolomB`, `kolomH`, `qKnM`. Nilai awal: 6 · 3,5 · 1 · 300 · 500 · 400 · 400 · 20.
4. Mode `rangka` memanggil `POST /api/v1/struktur/analisa-rangka`, bukan `saran-pembesian`.
5. **Mode rangka hanya untuk jenis `balok`** — saklar jenis (balok/kolom) disembunyikan di mode ini karena solver mengusulkan KEDUANYA sekaligus. Kalau jenis `kolom` dipilih lalu mode `rangka` diklik, paksa jenis kembali ke `balok`.

- [ ] **Step 3: Tampilkan hasilnya**

Kartu baru "Hasil analisa rangka" berisi, per batang:
- nama batang + jenis (balok/kolom)
- Mu, Vu, (Pu untuk kolom) — dari solver
- usulan tulangannya (`{nTarik}D{dUtamaMm} sengkang Ø{d}-{jarak}`)
- rasio kritis + pemeriksaan yang menentukan
- SVG diagramnya, di-render dengan `dangerouslySetInnerHTML` (pola yang SUDAH dipakai halaman struktur untuk gambar kerja), dibungkus `<div style={{ background: "var(--kertas-gambar)" }}>`

`catatan` gabungan ditampilkan di kartu terpisah, seperti mode lain.

- [ ] **Step 4: Typecheck & lint**

```bash
cd apps/web && npx tsc --noEmit
npx eslint "app/(dashboard)/estimasi/pembesian/page.tsx"
```
Expected: nol galat untuk berkas ini.

- [ ] **Step 5: LIHAT hasilnya — wajib, bukan opsional**

CLAUDE.md mencatat tiga cacat yang HANYA ketahuan dari memotret, dan tak satu pun tertangkap 1.028 test. Jalankan web + API, login, lalu potret:

```bash
# Dari akar repo. Ukur port lebih dulu; jangan tabrak sesi lain.
set -a; . <(sed 's/\r$//; s/^\xEF\xBB\xBF//' apps/web/.env.local | grep -E '^LAYAR_'); set +a
MSYS_NO_PATHCONV=1 LAYAR_BASIS=http://localhost:<port> \
  node apps/web/scripts/potret-bagian.mjs "/estimasi/pembesian" "Jenis elemen" <keluar>.png
```

**LIHAT gambarnya.** Yang diperiksa: diagram terbaca? label bertimpa? tab tersorot benar? judul tidak ganda? Kalau ada yang jelek menurutmu, PERBAIKI — jangan serahkan hasil yang kamu sendiri tak puas.

- [ ] **Step 6: Audit a11y**

```bash
set -a; . <(sed 's/\r$//; s/^\xEF\xBB\xBF//' apps/web/.env.local | grep -E '^LAYAR_'); set +a
MSYS_NO_PATHCONV=1 LAYAR_BASIS=http://localhost:<port> \
  node apps/web/scripts/audit-a11y-runtime.mjs --url "/estimasi/pembesian"
```
Expected: "halaman dipindai: 1", "pelanggaran: 0". Kalau ia menolak melapor karena cakupan runtuh, kredensialnya belum termuat — itu penolakan yang BENAR, isi kredensialnya.

- [ ] **Step 7: Penjaga visual + commit**

```bash
cd /e/Project/puraloka-suite
for g in uji-token-css-ada uji-judul-halaman-ada uji-galat-muat-terpisah uji-rute-id-tak-basi; do node apps/web/scripts/$g.mjs >/dev/null 2>&1 && echo "$g HIJAU" || echo "$g MERAH"; done
node apps/api/scripts/audit-halaman-pakai-cache.mjs

git add -- "apps/web/app/(dashboard)/estimasi/pembesian/page.tsx"
git commit -m "feat(web): mode ketiga — analisa rangka di layar pembesian

Tiga tingkat ketelitian di satu tempat, untuk satu pertanyaan yang sama
('besinya berapa?'):

  angka langsung -> koefisien pendekatan -> analisa rangka

Mode rangka mengusulkan pembesian SELURUH batang portal sekaligus
(kolom dan balok), berikut diagram M/V/lendutan tiap batang."
```

---

### Task 5: Jurnal & indeks

**Files:**
- Modify: `docs/execution/JOURNAL.md`, `docs/INDEKS-DOKUMEN.md`

- [ ] **Step 1: Jalankan seluruh test rangka + penjaga CI**

```bash
cd apps/api && npx vitest run src/lib/__tests__/rangka-
node scripts/jalankan-semua-penjaga.mjs
```
Tempel ringkasannya. Baris "tak ketemu" WAJIB NOL. Bandingkan jumlah merah dengan sebelum pekerjaan ini.

- [ ] **Step 2: Perbarui indeks**

```bash
cd apps/api && node scripts/gen-indeks-docs.mjs
```

- [ ] **Step 3: Tulis entri jurnal**

Di ATAS `docs/execution/JOURNAL.md`. Wajib memuat: apa yang dibangun, hasil mutasi, bukti HTTP nyata, dan yang BELUM selesai (halaman Analisa Rangka tersendiri, sambungan ke `analisaRangka` truss, kombinasi 1,4D/1,2D+1,6L).

⚠ 5 sesi aktif; JOURNAL.md pernah ditimpa. Tulis PALING AKHIR, `git add` sebut-nama.

- [ ] **Step 4: Commit**

```bash
git add -- docs/execution/JOURNAL.md docs/INDEKS-DOKUMEN.md
git commit -m "docs(jurnal): solver rangka dipakai — rute, layar, diagram"
```

---

## Yang TIDAK ada di plan ini (sengaja)

- **Halaman Analisa Rangka tersendiri** — untuk pemodelan portal rumit (banyak lantai/bentang) dengan diagram sebagai keluaran utama. Butuh plan sendiri; keputusan founder 2026-09-01 adalah "mode ketiga sekarang, halaman menyusul".
- **Menyambung `analisaTruss` → `analisaRangka`** di `struktur-baja-rangka.ts`.
- **Kombinasi 1,4D dan 1,2D+1,6L** — beban masih masuk sebagai satu `qKnM` terfaktor.
- **Deploy VPS** — keputusan founder, diminta terpisah.
