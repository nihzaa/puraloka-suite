# Solver Rangka 2D — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menghitung gaya dalam (M, V, N) dan lendutan rangka 2D dari geometri + beban, lalu menyambungkannya ke modul kapasitas yang sudah ada — sehingga momen tak lagi harus dihitung sendiri oleh pemakainya.

**Architecture:** Empat berkas dengan satu arah ketergantungan. `rangka-matriks.ts` (matriks kekakuan 6×6, transformasi, penyelesai Gauss) dan `rangka-model.ts` (simpul, batang, tumpuan, beban) **buta terhadap SNI** — keduanya hanya tahu angka. Di atasnya `rangka-portal.ts` dan `rangka-truss.ts` merakit model dari geometri bangunan dan menerapkan kombinasi pembebanan SNI. Beban gempa TIDAK dihitung ulang: `analisaGempaStatik` yang sudah ada memulangkan gaya per lantai, dan solver menerimanya sebagai beban titik.

**Tech Stack:** TypeScript (ESM, ekstensi `.js` di import), Vitest, Node. Semua modul PURE — tanpa I/O, tanpa basis, tanpa jaringan.

**Spec:** `docs/superpowers/specs/2026-09-01-solver-rangka-2d-design.md`

## Global Constraints

- **PURE, tanpa I/O.** Semua berkas di `apps/api/src/lib/` — nol impor basis/jaringan, mengikuti seluruh `struktur-*.ts` yang ada.
- **Import ESM wajib berekstensi `.js`** meski berkasnya `.ts` (`import { x } from './rangka-matriks.js'`).
- **Nominal `numeric`, waktu `timestamptz`** (CLAUDE.md §5.4) — tak ada float untuk uang. Modul ini tak menyentuh uang, tapi aturannya tetap berlaku bila menyambung ke RAB.
- **Satuan dipaku dan ditulis di nama medan:** panjang `M` (meter), gaya `Kn` (kN), momen `Knm` (kNm), lendutan `Mm` (mm), inersia `Mm4` (mm⁴), modulus `Mpa` (MPa). Menukar satuan adalah kelas cacat termahal di modul struktur.
- **Konvensi tanda (DIPAKU, ditulis di header `rangka-matriks.ts`):** momen positif = **serat bawah tertarik**. Sumbu global X ke kanan, Y ke atas. Rotasi positif berlawanan arah jarum jam.
- **Tiap hasil WAJIB membawa `catatan: string[]`** berisi batasnya — pola yang sama dengan seluruh modul struktur. Batas wajib: elastis linier, sambungan kaku sempurna (portal) atau sendi (truss), tanpa P-Δ, tanpa torsi, tanpa penurunan tumpuan.
- **Kasus tangan WAJIB dihitung ulang** dan sumbernya ditulis di komentar test sebelum dipakai sebagai kebenaran (spec §3). Nilai yang sudah diverifikasi tercantum di tiap task.
- **TDD wajib:** test dulu, jalankan sampai MERAH karena alasan yang benar, baru implementasi.
- **Mutasi wajib** di Task 2, 4, 6 — penjaga/test yang tak pernah merah adalah hiasan (CLAUDE.md §8a.2).
- **`git add` WAJIB sebut-nama berkas.** Ada 5 sesi aktif di checkout ini; `git add .` pernah menelan kerja sesi lain (CLAUDE.md §8a.1).

---

## File Structure

| Berkas | Tanggung jawab |
|---|---|
| `apps/api/src/lib/rangka-matriks.ts` | Matriks kekakuan batang 6×6, transformasi lokal↔global, penyelesai Gauss dengan pivot, deteksi singular |
| `apps/api/src/lib/rangka-model.ts` | Simpul/batang/tumpuan/beban → perpindahan, gaya dalam, lendutan sepanjang batang |
| `apps/api/src/lib/rangka-portal.ts` | Merakit balok menerus & portal dari geometri; kombinasi 1,4D dan 1,2D+1,6L; beban lateral |
| `apps/api/src/lib/rangka-truss.ts` | Merakit rangka batang; memulangkan `gayaKn` per batang untuk `analisaRangka` |
| `apps/api/src/lib/__tests__/rangka-matriks.test.ts` | Kasus tangan lapis 1 |
| `apps/api/src/lib/__tests__/rangka-model.test.ts` | Gaya dalam, lendutan, deteksi singular |
| `apps/api/src/lib/__tests__/rangka-portal.test.ts` | Lapis 2–4 |
| `apps/api/src/lib/__tests__/rangka-truss.test.ts` | Lapis 5 |

---

### Task 1: Matriks kekakuan & penyelesai linier

**Files:**
- Create: `apps/api/src/lib/rangka-matriks.ts`
- Test: `apps/api/src/lib/__tests__/rangka-matriks.test.ts`

**Interfaces:**
- Consumes: —
- Produces:
  - `kLokal(eMpa: number, aMm2: number, iMm4: number, lM: number): number[][]` → matriks 6×6
  - `matriksRotasi(cos: number, sin: number): number[][]` → matriks 6×6
  - `kGlobal(eMpa, aMm2, iMm4, lM, cos, sin): number[][]` → 6×6
  - `selesaikan(A: number[][], b: number[]): number[]` → melempar `Error` bila singular

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/src/lib/__tests__/rangka-matriks.test.ts
import { describe, it, expect } from 'vitest'
import { kLokal, kGlobal, selesaikan } from '../rangka-matriks.js'

describe('kLokal', () => {
  /*
    Matriks kekakuan batang portal 2D (6 DOF: u1,v1,θ1,u2,v2,θ2).
    Bentuk bakunya — diperiksa terhadap Hibbeler, Structural Analysis:

        EA/L                              -EA/L
              12EI/L³   6EI/L²                   -12EI/L³   6EI/L²
              6EI/L²    4EI/L                    -6EI/L²    2EI/L
       -EA/L                               EA/L
             -12EI/L³  -6EI/L²                    12EI/L³  -6EI/L²
              6EI/L²    2EI/L                    -6EI/L²    4EI/L

    Diuji dengan angka bulat supaya salah tempat langsung terlihat.
  */
  it('menempatkan tiap suku di posisinya, dengan SATUAN yang benar', () => {
    /*
      ⚠ Angka NYATA, bukan E=A=I=L=1. Draf pertama plan ini memakai satuan
      serba-1 dan rumus EA/L-nya meleset 1000× TANPA testnya merah — pada
      angka satu, faktor 1000 tak terlihat sama sekali.

      Balok beton 300x500, E=200.000 MPa, L=6 m:
        A  = 150.000 mm²
        EA/L = (200.000/1000) kN/mm² × 150.000 mm² / 6 m = 5.000.000 kN/m
        I  = 300·500³/12 = 3,125e9 mm⁴
        EI = 200.000 × 3,125e9 × 1e-9 = 625.000 kN·m²
      Keduanya diverifikasi lewat dua jalur perhitungan 2026-09-01.
    */
    const E = 200_000, A = 150_000, I = 300 * 500 ** 3 / 12, L = 6
    const k = kLokal(E, A, I, L)
    expect(k).toHaveLength(6)
    expect(k[0]).toHaveLength(6)

    const EA_L = 5_000_000            // kN/m
    expect(k[0]![0]!).toBeCloseTo(EA_L, 0)
    expect(k[0]![3]!).toBeCloseTo(-EA_L, 0)
    expect(k[3]![3]!).toBeCloseTo(EA_L, 0)

    const EI = 625_000                // kN·m²
    expect(k[2]![2]!).toBeCloseTo(4 * EI / L, 0)      // 4EI/L
    expect(k[1]![1]!).toBeCloseTo(12 * EI / L ** 3, 0) // 12EI/L³
  })

  it('simetris — k[i][j] === k[j][i] untuk SEMUA pasangan', () => {
    /*
      Bukan hiasan: matriks kekakuan WAJIB simetris secara fisika (hukum
      timbal balik Maxwell-Betti). Satu suku salah tempat merusak simetri,
      dan itu jauh lebih mudah ditangkap daripada memeriksa 36 nilai.
    */
    const k = kLokal(200_000, 90_000, 675e6, 6)
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) {
        expect(k[i]![j]!).toBeCloseTo(k[j]![i]!, 9)
      }
    }
  })

  it('menolak masukan tak masuk akal', () => {
    expect(() => kLokal(0, 1, 1, 1)).toThrow(/E|modulus/i)
    expect(() => kLokal(1, 1, 1, 0)).toThrow(/panjang|L/i)
  })
})

describe('kGlobal', () => {
  it('batang mendatar: global === lokal', () => {
    // cos=1, sin=0 → tak ada rotasi.
    const lokal = kLokal(200_000, 90_000, 675e6, 6)
    const global = kGlobal(200_000, 90_000, 675e6, 6, 1, 0)
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) {
        expect(global[i]![j]!).toBeCloseTo(lokal[i]![j]!, 9)
      }
    }
  })

  it('batang tegak: suku aksial pindah ke arah Y', () => {
    /*
      Kolom (cos=0, sin=1). Kekakuan aksial yang tadinya di DOF-0 (arah X)
      harus muncul di DOF-1 (arah Y). Kalau transformasinya salah, kolom
      jadi kaku ke arah yang salah — dan portalnya "berdiri" ke samping.
    */
    const E = 200_000, A = 90_000, I = 675e6, L = 3
    const g = kGlobal(E, A, I, L, 0, 1)
    const EA_L = (E / 1000) * A / L        // kN/m — konversi SAMA dengan kLokal
    expect(g[1]![1]!).toBeCloseTo(EA_L, 0)
    expect(g[0]![0]!).toBeLessThan(EA_L)   // arah X kini lentur, jauh lebih lunak
  })
})

describe('selesaikan', () => {
  it('menyelesaikan sistem 2×2 yang jawabannya diketahui', () => {
    // 2x + y = 5 ; x + 3y = 10  →  x = 1, y = 3
    const x = selesaikan([[2, 1], [1, 3]], [5, 10])
    expect(x[0]!).toBeCloseTo(1, 9)
    expect(x[1]!).toBeCloseTo(3, 9)
  })

  it('MENOLAK matriks singular, bukan memulangkan Infinity', () => {
    /*
      Ini pemeriksaan terpenting di berkas ini. Matriks singular berarti
      struktur bisa bergerak bebas (tumpuan kurang). Penyelesai naif
      memulangkan angka raksasa yang TERLIHAT SEPERTI HASIL — lalu angka
      itu dipakai memilih tulangan. Wajib melempar, menyebut barisnya.
    */
    expect(() => selesaikan([[1, 2], [2, 4]], [1, 2])).toThrow(/singular|labil/i)
  })

  it('tetap benar saat pivot pertama nol (butuh tukar baris)', () => {
    // 0x + 1y = 2 ; 1x + 0y = 3  →  x = 3, y = 2
    const x = selesaikan([[0, 1], [1, 0]], [2, 3])
    expect(x[0]!).toBeCloseTo(3, 9)
    expect(x[1]!).toBeCloseTo(2, 9)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/lib/__tests__/rangka-matriks.test.ts`
Expected: FAIL — `Cannot find module '../rangka-matriks.js'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/api/src/lib/rangka-matriks.ts
// Matriks kekakuan batang portal 2D & penyelesai linier. PURE, BUTA SNI.
//
// ══════════════════════════════════════════════════════════════════════════════
// KONVENSI TANDA — DIPAKU, JANGAN DIUBAH TANPA MENGUBAH SELURUH TEST
// ══════════════════════════════════════════════════════════════════════════════
//
//   Sumbu global X ke kanan, Y ke atas. Rotasi positif berlawanan jarum jam.
//   Momen positif = SERAT BAWAH TERTARIK (lazim di praktik Indonesia).
//
// Kenapa ini ditulis sebesar ini: tanda yang tertukar tidak menimbulkan galat.
// Ia menaruh tulangan tumpuan di SISI YANG SALAH — atas dipasang di bawah —
// dan baloknya gagal pada beban yang seharusnya aman.
//
// ── Satuan (dipaku, jangan dicampur)
//   E  MPa = N/mm²      A  mm²      I  mm⁴      L  m
//   Keluaran matriks: kN/m dan kNm/rad.
//
// Konversi EA/L: (N/mm²)(mm²)/(m) = N/m → ÷1000 → kN/m.
// Konversi EI  : (N/mm²)(mm⁴) = N·mm² → ×1e-6 → kN·m² sesudah ÷1000.

/** DOF per batang: u1, v1, θ1, u2, v2, θ2. */
export const DOF_BATANG = 6

function positif(nama: string, v: number): void {
  if (!Number.isFinite(v) || v <= 0) {
    throw new Error(`${nama} harus angka > 0 (diterima: ${v})`)
  }
}

/**
 * Matriks kekakuan batang di sumbu LOKALnya (6×6).
 *
 * Bentuk baku portal 2D (Hibbeler, Structural Analysis, bab Direct Stiffness).
 */
export function kLokal(
  eMpa: number, aMm2: number, iMm4: number, lM: number,
): number[][] {
  positif('E (modulus)', eMpa)
  positif('A (luas)', aMm2)
  positif('I (inersia)', iMm4)
  positif('L (panjang)', lM)

  const L = lM
  /*
    EA/L dalam kN/m. E dalam kN/mm² = eMpa/1000, jadi:
        (eMpa/1000) [kN/mm²] × aMm2 [mm²] / L [m]  →  kN/m

    ⚠ Diverifikasi lewat DUA jalur sebelum dipaku (E=200.000, A=150.000,
    L=6 → 5.000.000 kN/m dari keduanya). Rangkaian ÷1000 yang "kelihatan
    benar" pernah meleset 1000× di draf plan ini sendiri, dan test dengan
    E=A=L=1 TIDAK menangkapnya — pada angka satu, faktor 1000 tak terlihat.
  */
  const ea = (eMpa / 1000) * aMm2 / L
  /*
    EI dalam kN·m². N/mm² × mm⁴ = N·mm²; × 1e-3 (N→kN) × 1e-6 (mm²→m²) = 1e-9.
    Diverifikasi: E=200.000, I=3,125e9 → 625.000 kN·m² dari dua jalur.
  */
  const ei = eMpa * iMm4 * 1e-9

  const a = 12 * ei / L ** 3
  const b = 6 * ei / L ** 2
  const c = 4 * ei / L
  const d = 2 * ei / L

  const k: number[][] = Array.from({ length: 6 }, () => new Array<number>(6).fill(0))
  k[0]![0] = ea;  k[0]![3] = -ea
  k[3]![0] = -ea; k[3]![3] = ea
  k[1]![1] = a;   k[1]![2] = b;   k[1]![4] = -a;  k[1]![5] = b
  k[2]![1] = b;   k[2]![2] = c;   k[2]![4] = -b;  k[2]![5] = d
  k[4]![1] = -a;  k[4]![2] = -b;  k[4]![4] = a;   k[4]![5] = -b
  k[5]![1] = b;   k[5]![2] = d;   k[5]![4] = -b;  k[5]![5] = c
  return k
}

/** Matriks rotasi 6×6 dari sumbu lokal ke global. */
export function matriksRotasi(cos: number, sin: number): number[][] {
  const t: number[][] = Array.from({ length: 6 }, () => new Array<number>(6).fill(0))
  for (const o of [0, 3]) {
    t[o]![o] = cos;      t[o]![o + 1] = sin
    t[o + 1]![o] = -sin; t[o + 1]![o + 1] = cos
    t[o + 2]![o + 2] = 1
  }
  return t
}

/** Kekakuan batang di sumbu GLOBAL: Tᵀ · k · T. */
export function kGlobal(
  eMpa: number, aMm2: number, iMm4: number, lM: number,
  cos: number, sin: number,
): number[][] {
  const k = kLokal(eMpa, aMm2, iMm4, lM)
  const t = matriksRotasi(cos, sin)
  const kt: number[][] = Array.from({ length: 6 }, () => new Array<number>(6).fill(0))
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 6; j++) {
      let s = 0
      for (let m = 0; m < 6; m++) s += k[i]![m]! * t[m]![j]!
      kt[i]![j] = s
    }
  }
  const hasil: number[][] = Array.from({ length: 6 }, () => new Array<number>(6).fill(0))
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 6; j++) {
      let s = 0
      for (let m = 0; m < 6; m++) s += t[m]![i]! * kt[m]![j]!
      hasil[i]![j] = s
    }
  }
  return hasil
}

/**
 * Selesaikan A·x = b dengan eliminasi Gauss + pivot parsial.
 *
 * ⚠ MELEMPAR bila singular. Itu keputusan sengaja: matriks singular berarti
 * strukturnya bisa bergerak bebas (tumpuan kurang), dan penyelesai yang
 * memulangkan angka raksasa memberi sesuatu yang TERLIHAT seperti hasil.
 * Angka itu akan dipakai memilih tulangan, tanpa satu pun galat.
 */
export function selesaikan(A: number[][], b: number[]): number[] {
  const n = b.length
  if (A.length !== n) throw new Error(`Ukuran A (${A.length}) tak cocok b (${n})`)

  const M = A.map((baris, i) => [...baris, b[i]!])

  for (let kol = 0; kol < n; kol++) {
    let terbesar = kol
    for (let r = kol + 1; r < n; r++) {
      if (Math.abs(M[r]![kol]!) > Math.abs(M[terbesar]![kol]!)) terbesar = r
    }
    if (Math.abs(M[terbesar]![kol]!) < 1e-12) {
      throw new Error(
        `Matriks singular pada baris ${kol} — struktur LABIL: ada derajat `
        + 'kebebasan yang tak tertahan tumpuan mana pun. Tambahkan tumpuan.',
      )
    }
    ;[M[kol]!, M[terbesar]!] = [M[terbesar]!, M[kol]!]

    for (let r = kol + 1; r < n; r++) {
      const f = M[r]![kol]! / M[kol]![kol]!
      if (f === 0) continue
      for (let c = kol; c <= n; c++) M[r]![c]! -= f * M[kol]![c]!
    }
  }

  const x = new Array<number>(n).fill(0)
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i]![n]!
    for (let j = i + 1; j < n; j++) s -= M[i]![j]! * x[j]!
    x[i] = s / M[i]![i]!
  }
  return x
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/lib/__tests__/rangka-matriks.test.ts`
Expected: PASS — 8 test hijau

- [ ] **Step 5: Typecheck & lint**

Run: `cd apps/api && npx tsc --noEmit && npx eslint src/lib/rangka-matriks.ts src/lib/__tests__/rangka-matriks.test.ts`
Expected: keduanya exit 0. **Jangan menyaring keluaran `tsc`** (CLAUDE.md §7).

- [ ] **Step 6: Commit**

```bash
git add -- apps/api/src/lib/rangka-matriks.ts apps/api/src/lib/__tests__/rangka-matriks.test.ts
git commit -m "feat(rangka): matriks kekakuan 6x6 + penyelesai Gauss

Lapis 1 dari solver rangka 2D. PURE, buta SNI.

Penyelesai MENOLAK matriks singular alih-alih memulangkan Infinity:
struktur labil menghasilkan angka raksasa yang terlihat seperti hasil,
dan angka itu akan dipakai memilih tulangan tanpa satu pun galat.

Konvensi tanda dipaku di header: momen positif = serat bawah tertarik.
Tanda tertukar menaruh tulangan tumpuan di sisi yang salah."
```

---

### Task 2: Model rangka — gaya dalam & lendutan

**Files:**
- Create: `apps/api/src/lib/rangka-model.ts`
- Test: `apps/api/src/lib/__tests__/rangka-model.test.ts`

**Interfaces:**
- Consumes: `kGlobal`, `selesaikan` dari `rangka-matriks.js`
- Produces:
  - `type Tumpuan = 'bebas' | 'sendi' | 'rol-x' | 'jepit'`
  - `interface Simpul { nama: string; xM: number; yM: number; tumpuan: Tumpuan }`
  - `interface BatangModel { nama: string; dari: number; ke: number; eMpa: number; aMm2: number; iMm4: number; qKnM?: number }`
  - `interface BebanTitik { simpul: number; fxKn?: number; fyKn?: number; mKnm?: number }`
  - `interface HasilBatang { nama: string; momenKnm: { maks: number; min: number; di: Array<{ xM: number; nilai: number }> }; geserKn: { maks: number; min: number; di: Array<{ xM: number; nilai: number }> }; aksialKn: number; lendutanMm: { maks: number; di: Array<{ xM: number; nilai: number }> } }`
  - `analisaRangka2D(simpul: Simpul[], batang: BatangModel[], beban: BebanTitik[]): { batang: HasilBatang[]; catatan: string[] }`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/src/lib/__tests__/rangka-model.test.ts
import { describe, it, expect } from 'vitest'
import { analisaRangka2D, type Simpul, type BatangModel } from '../rangka-model.js'

/* Baja: E = 200.000 MPa. Beton dipakai di Task 4; di sini angka bebas. */
const E = 200_000
/** Penampang uji: 300×500 mm → A = 150.000 mm², I = bh³/12 = 3,125e9 mm⁴. */
const A = 150_000
const I = 300 * 500 ** 3 / 12

describe('analisaRangka2D — kasus tangan lapis 1', () => {
  /*
    KANTILEVER beban merata w, panjang L.
      M jepit = wL²/2      ← DIVERIFIKASI numerik 2026-09-01: 0,5 wL²
      δ ujung = wL⁴/(8EI)  ← DIVERIFIKASI: 0,125 wL⁴/EI
    Sumber: Gere & Timoshenko, Mechanics of Materials, tabel lendutan balok.
  */
  it('kantilever beban merata: M jepit = wL²/2', () => {
    const L = 4, w = 10  // kN/m
    const simpul: Simpul[] = [
      { nama: 'A', xM: 0, yM: 0, tumpuan: 'jepit' },
      { nama: 'B', xM: L, yM: 0, tumpuan: 'bebas' },
    ]
    const batang: BatangModel[] = [
      { nama: 'AB', dari: 0, ke: 1, eMpa: E, aMm2: A, iMm4: I, qKnM: w },
    ]
    const h = analisaRangka2D(simpul, batang, [])
    const b = h.batang[0]!

    // |M| terbesar = wL²/2 = 10·16/2 = 80 kNm
    const mMaks = Math.max(Math.abs(b.momenKnm.maks), Math.abs(b.momenKnm.min))
    expect(mMaks).toBeCloseTo(w * L ** 2 / 2, 4)
  })

  it('kantilever: lendutan ujung = wL⁴/(8EI)', () => {
    const L = 4, w = 10
    const simpul: Simpul[] = [
      { nama: 'A', xM: 0, yM: 0, tumpuan: 'jepit' },
      { nama: 'B', xM: L, yM: 0, tumpuan: 'bebas' },
    ]
    const h = analisaRangka2D(simpul,
      [{ nama: 'AB', dari: 0, ke: 1, eMpa: E, aMm2: A, iMm4: I, qKnM: w }], [])

    // w kN/m, L m, E MPa, I mm⁴ → δ dalam mm:
    //   wL⁴/(8EI) dengan w N/mm = w, L mm, E N/mm², I mm⁴
    const wNmm = w                      // kN/m === N/mm
    const Lmm = L * 1000
    const dHarap = wNmm * Lmm ** 4 / (8 * E * I)
    expect(h.batang[0]!.lendutanMm.maks).toBeCloseTo(dHarap, 2)
  })

  /*
    BALOK JEPIT-JEPIT beban merata:
      M tumpuan = wL²/12   ← DIVERIFIKASI: 0,083333 wL²
      M tengah  = wL²/24   ← DIVERIFIKASI: 0,041667 wL²
  */
  it('jepit-jepit: M tumpuan wL²/12 dan M tengah wL²/24', () => {
    const L = 6, w = 12
    const simpul: Simpul[] = [
      { nama: 'A', xM: 0, yM: 0, tumpuan: 'jepit' },
      { nama: 'B', xM: L, yM: 0, tumpuan: 'jepit' },
    ]
    const h = analisaRangka2D(simpul,
      [{ nama: 'AB', dari: 0, ke: 1, eMpa: E, aMm2: A, iMm4: I, qKnM: w }], [])
    const b = h.batang[0]!

    const mTumpuan = Math.max(Math.abs(b.momenKnm.maks), Math.abs(b.momenKnm.min))
    expect(mTumpuan).toBeCloseTo(w * L ** 2 / 12, 3)

    // Momen di tengah bentang — diambil dari deret titik.
    const tengah = b.momenKnm.di.reduce((p, c) =>
      Math.abs(c.xM - L / 2) < Math.abs(p.xM - L / 2) ? c : p)
    expect(Math.abs(tengah.nilai)).toBeCloseTo(w * L ** 2 / 24, 3)
  })

  /*
    BALOK SEDERHANA beban merata:
      M tengah = wL²/8         ← DIVERIFIKASI: 0,125 wL²
      δ tengah = 5wL⁴/(384EI)  ← DIVERIFIKASI: 0,013021 wL⁴/EI
  */
  it('sederhana: M tengah wL²/8 dan lendutan 5wL⁴/384EI', () => {
    const L = 6, w = 12
    const simpul: Simpul[] = [
      { nama: 'A', xM: 0, yM: 0, tumpuan: 'sendi' },
      { nama: 'B', xM: L, yM: 0, tumpuan: 'rol-x' },
    ]
    const h = analisaRangka2D(simpul,
      [{ nama: 'AB', dari: 0, ke: 1, eMpa: E, aMm2: A, iMm4: I, qKnM: w }], [])
    const b = h.batang[0]!

    expect(b.momenKnm.maks).toBeCloseTo(w * L ** 2 / 8, 3)

    const dHarap = 5 * w * (L * 1000) ** 4 / (384 * E * I)
    expect(b.lendutanMm.maks).toBeCloseTo(dHarap, 1)
  })

  it('MENOLAK struktur labil dengan menyebut sebabnya', () => {
    /*
      Dua simpul, keduanya bebas — tak ada yang menahan. Solver harus
      MENOLAK, bukan memulangkan angka raksasa yang terlihat seperti hasil.
    */
    const simpul: Simpul[] = [
      { nama: 'A', xM: 0, yM: 0, tumpuan: 'bebas' },
      { nama: 'B', xM: 4, yM: 0, tumpuan: 'bebas' },
    ]
    expect(() => analisaRangka2D(simpul,
      [{ nama: 'AB', dari: 0, ke: 1, eMpa: E, aMm2: A, iMm4: I, qKnM: 10 }], []))
      .toThrow(/labil|singular|tumpuan/i)
  })

  it('membawa catatan batas — bukan angka telanjang', () => {
    const simpul: Simpul[] = [
      { nama: 'A', xM: 0, yM: 0, tumpuan: 'jepit' },
      { nama: 'B', xM: 4, yM: 0, tumpuan: 'bebas' },
    ]
    const h = analisaRangka2D(simpul,
      [{ nama: 'AB', dari: 0, ke: 1, eMpa: E, aMm2: A, iMm4: I, qKnM: 10 }], [])
    const gabung = h.catatan.join(' ')
    expect(gabung).toMatch(/elastis linier/i)
    expect(gabung).toMatch(/P-Δ|torsi/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/lib/__tests__/rangka-model.test.ts`
Expected: FAIL — `Cannot find module '../rangka-model.js'`

- [ ] **Step 3: Write the implementation**

Bangun `apps/api/src/lib/rangka-model.ts` dengan urutan berikut. Header berkas WAJIB memuat: tujuan modul, pernyataan bahwa ia buta SNI, konvensi tanda (rujuk `rangka-matriks.ts`), dan daftar batas yang masuk `catatan`.

1. **Peta DOF.** Tiap simpul punya 3 DOF: `3*i` (u), `3*i+1` (v), `3*i+2` (θ).
2. **Rakit K global** berukuran `3n × 3n`: untuk tiap batang, hitung `lM`, `cos`, `sin` dari koordinat simpulnya, panggil `kGlobal`, lalu jumlahkan tiap suku ke posisi DOF-nya.
3. **Beban ekuivalen simpul** (fixed-end forces) untuk `qKnM` beban merata pada batang panjang L:
   - gaya: `qL/2` ke setiap ujung (arah Y lokal)
   - momen: `+qL²/12` di ujung awal, `−qL²/12` di ujung akhir
   Tambahkan `BebanTitik` apa adanya ke vektor beban.
4. **Terapkan tumpuan** dengan MEMBUANG baris & kolom DOF yang tertahan.

   ⚠ Jumlah DOF bebas boleh **NOL** — balok jepit-jepit tunggal persis begitu:
   enam DOF, semuanya tertahan. Itu struktur SAH; perpindahannya nol dan gaya
   dalamnya datang seluruhnya dari fixed-end forces. Jangan menolaknya sebagai
   galat (percobaan pertama Task 2 melakukannya dan memerahkan kasus tangan
   yang BENAR) — lewati langkah penyelesaian, lanjutkan dengan perpindahan nol (bukan mengalikan angka besar — itu menyembunyikan kesingularan):
   - `jepit` → u, v, θ tertahan · `sendi` → u, v · `rol-x` → v saja · `bebas` → nihil
5. **Selesaikan** `selesaikan(Kbebas, Fbebas)` → perpindahan; kembalikan nol untuk DOF tertahan.
6. **Gaya ujung batang:** `f = kLokal · T · d` , lalu **tambahkan kembali** fixed-end forces.
7. **Gaya dalam sepanjang batang, 11 titik** (`x = 0, 0.1L, …, L`):
   - `V(x) = V_awal − q·x`
   - `M(x) = −M_awal + V_awal·x − q·x²/2` (tanda mengikuti konvensi header)
   - lendutan: **integrasi EKSAK**, bukan trapesium.

     ⚠ Ditemukan saat Task 2 dikerjakan: integrasi trapesium pada 11 titik
     membuat KEDUA test lendutan tetap HIJAU — karena ujung-ujungnya dipaku
     tepat oleh syarat batas — sementara titik di TENGAH meleset 1,6–22%
     (jepit-jepit di x=0,6 m: −0,00653 vs −0,00840 mm). Diagram lendutan yang
     dibaca pengguna akan salah di sepanjang bentang tanpa satu pun galat.

     M(x) berderajat 2 pada beban merata, jadi bentuk tertutupnya ada — pakai
     itu. Sesudah diperbaiki, lendutan cocok rumus tertutup di SELURUH 11
     titik (diverifikasi ulang terpisah: beda 0,000% di kesebelasnya).
8. **`catatan`** diisi tetap: elastis linier · sambungan kaku sempurna · tanpa P-Δ · tanpa torsi · tanpa penurunan tumpuan.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/lib/__tests__/rangka-model.test.ts`
Expected: PASS — 6 test hijau. Bila lendutan meleset, periksa konversi satuan (kN/m → N/mm, m → mm) SEBELUM mengubah rumusnya.

- [ ] **Step 5: MUTASI WAJIB — buktikan test bisa merah**

Lakukan tiga mutasi, satu per satu, pulihkan sesudah masing-masing:

```bash
# a. Balik tanda momen fixed-end (+qL²/12 → -qL²/12)
#    HARUS memerahkan test jepit-jepit.
# b. Geser satu suku matriks: k[1][2] = b → k[1][2] = b * 1.01
#    HARUS memerahkan minimal satu kasus tangan.
# c. Matikan deteksi singular (lempar → return angka)
#    HARUS memerahkan test "MENOLAK struktur labil".
```

Bila salah satu mutasi TIDAK memerahkan test, testnya tak menjaga apa-apa — perbaiki testnya, bukan lanjut. Tempel hasilnya di pesan commit.

- [ ] **Step 6: Typecheck, lint, commit**

```bash
cd apps/api && npx tsc --noEmit && npx eslint src/lib/rangka-model.ts src/lib/__tests__/rangka-model.test.ts
cd /e/Project/puraloka-suite
git add -- apps/api/src/lib/rangka-model.ts apps/api/src/lib/__tests__/rangka-model.test.ts
git commit -m "feat(rangka): model 2D — gaya dalam & lendutan dari geometri + beban

Lapis 1 selesai. Empat kasus tangan hijau, semuanya DIHITUNG ULANG
sebelum dipakai: kantilever wL2/2 & wL4/8EI, jepit-jepit wL2/12 &
wL2/24, sederhana wL2/8 & 5wL4/384EI.

Tumpuan diterapkan dengan MEMBUANG DOF tertahan, bukan mengalikan
angka besar — cara kedua menyembunyikan kesingularan yang justru
paling perlu ketahuan.

Tiga mutasi dibuktikan MERAH: tanda momen dibalik, satu suku matriks
digeser 1%, deteksi singular dimatikan."
```

---

### Task 3: Balok menerus (lapis 2)

**Files:**
- Create: `apps/api/src/lib/rangka-portal.ts`
- Test: `apps/api/src/lib/__tests__/rangka-portal.test.ts`

**Interfaces:**
- Consumes: `analisaRangka2D`, `Simpul`, `BatangModel` dari `rangka-model.js`
- Produces:
  - `interface InputBalokMenerus { bentangM: number[]; bMm: number; hMm: number; fcMpa: number; qKnM: number }`
  - `analisaBalokMenerus(input: InputBalokMenerus): { batang: HasilBatang[]; momenTumpuanKnm: number[]; catatan: string[] }`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/src/lib/__tests__/rangka-portal.test.ts
import { describe, it, expect } from 'vitest'
import { analisaBalokMenerus } from '../rangka-portal.js'

describe('analisaBalokMenerus — lapis 2', () => {
  /*
    DUA BENTANG SAMA, beban merata, tiga tumpuan sederhana.

    Persamaan tiga momen → M tumpuan tengah = wL²/8.
    DIVERIFIKASI numerik 2026-09-01 saat spec ditulis: −0,125 wL² tepat,
    dan momen lapangan 0,070313 wL² (= wL²/14,22) di x = 0,375 L.

    Kedua angka dipakai: yang pertama menguji tumpuan, yang kedua menguji
    bahwa deret titik sepanjang batang juga benar — bukan cuma nilai kritis.
  */
  it('dua bentang sama: M tumpuan tengah = wL²/8', () => {
    const L = 6, w = 20
    const h = analisaBalokMenerus({
      bentangM: [L, L], bMm: 300, hMm: 500, fcMpa: 25, qKnM: w,
    })
    // momenTumpuanKnm = [tepi kiri, tengah, tepi kanan]
    expect(Math.abs(h.momenTumpuanKnm[1]!)).toBeCloseTo(w * L ** 2 / 8, 2)
  })

  it('dua bentang sama: M lapangan wL²/14,22 di x = 0,375L', () => {
    const L = 6, w = 20
    const h = analisaBalokMenerus({
      bentangM: [L, L], bMm: 300, hMm: 500, fcMpa: 25, qKnM: w,
    })
    const b = h.batang[0]!
    expect(b.momenKnm.maks).toBeCloseTo(0.070313 * w * L ** 2, 1)

    const puncak = b.momenKnm.di.reduce((p, c) => (c.nilai > p.nilai ? c : p))
    expect(puncak.xM / L).toBeCloseTo(0.375, 1)
  })

  it('satu bentang = balok sederhana: wL²/8 di tengah', () => {
    const L = 6, w = 20
    const h = analisaBalokMenerus({
      bentangM: [L], bMm: 300, hMm: 500, fcMpa: 25, qKnM: w,
    })
    expect(h.batang[0]!.momenKnm.maks).toBeCloseTo(w * L ** 2 / 8, 2)
  })

  it('KEWARASAN: sebanding dengan koefisien pendekatan yang sudah ada', () => {
    /*
      Bukan pengganti kasus tangan — keduanya MEMANG berbeda, dan itu justru
      alasan solver dibangun. Ini hanya menangkap kesalahan BESAR: di luar
      0,5–1,5× berarti ada yang salah di salah satunya.
    */
    const L = 6, w = 20
    const h = analisaBalokMenerus({
      bentangM: [L, L, L], bMm: 300, hMm: 500, fcMpa: 25, qKnM: w,
    })
    const pendekatan = w * L ** 2 / 11   // SNI 2847 §6.5, bentang tengah
    const solver = Math.abs(h.momenTumpuanKnm[1]!)
    expect(solver / pendekatan).toBeGreaterThan(0.5)
    expect(solver / pendekatan).toBeLessThan(1.5)
  })

  it('menolak bentang kosong atau nol', () => {
    expect(() => analisaBalokMenerus({
      bentangM: [], bMm: 300, hMm: 500, fcMpa: 25, qKnM: 20,
    })).toThrow(/bentang/i)
    expect(() => analisaBalokMenerus({
      bentangM: [6, 0], bMm: 300, hMm: 500, fcMpa: 25, qKnM: 20,
    })).toThrow(/bentang/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/lib/__tests__/rangka-portal.test.ts`
Expected: FAIL — `Cannot find module '../rangka-portal.js'`

- [ ] **Step 3: Write the implementation**

`apps/api/src/lib/rangka-portal.ts` — `analisaBalokMenerus`:

1. Validasi: `bentangM` tak boleh kosong, tiap bentang > 0, `bMm`/`hMm`/`fcMpa`/`qKnM` > 0.
2. **Modulus elastis beton** `E = 4700·√f'c` MPa (SNI 2847 §19.2.2). Tulis rumusnya di komentar berikut pasalnya.
3. **Inersia** `I = b·h³/12` mm⁴; **luas** `A = b·h` mm².
4. Simpul: `n+1` simpul di `x = 0, L1, L1+L2, …`, semua `yM = 0`.
   Tumpuan: simpul pertama `sendi`, sisanya `rol-x`.
5. Batang: satu per bentang, `qKnM` sama untuk semuanya.
6. Panggil `analisaRangka2D`, lalu ambil momen di tiap tumpuan dari ujung batang yang bertemu di sana.
7. `catatan` = catatan dari `analisaRangka2D` + tambahan: "Balok menerus dianggap bertumpu bebas di setiap tumpuan (tanpa kekakuan kolom). Untuk portal, pakai `analisaPortal`."

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/lib/__tests__/rangka-portal.test.ts`
Expected: PASS — 5 test hijau

- [ ] **Step 5: Typecheck, lint, commit**

```bash
cd apps/api && npx tsc --noEmit && npx eslint src/lib/rangka-portal.ts src/lib/__tests__/rangka-portal.test.ts
cd /e/Project/puraloka-suite
git add -- apps/api/src/lib/rangka-portal.ts apps/api/src/lib/__tests__/rangka-portal.test.ts
git commit -m "feat(rangka): balok menerus — lapis 2

M tumpuan tengah wL2/8 dan M lapangan wL2/14,22 di x=0,375L, keduanya
dihitung ulang lewat persamaan tiga momen sebelum dipakai.

Deret titik sepanjang batang ikut diuji, bukan cuma nilai kritis: solver
yang benar di puncak tapi salah di sepanjang batang tetap menghasilkan
diagram yang menyesatkan."
```

---

### Task 4: Portal gravitasi (lapis 3)

**Files:**
- Modify: `apps/api/src/lib/rangka-portal.ts`
- Modify: `apps/api/src/lib/__tests__/rangka-portal.test.ts`

**Interfaces:**
- Consumes: `analisaRangka2D` dari `rangka-model.js`
- Produces:
  - `interface InputPortal { bentangM: number; tinggiM: number; jumlahLantai: number; balok: { bMm: number; hMm: number }; kolom: { bMm: number; hMm: number }; fcMpa: number; qKnM: number; gayaLateralKn?: number[] }`
  - `analisaPortal(input: InputPortal): { batang: HasilBatang[]; catatan: string[] }`

- [ ] **Step 1: Write the failing test**

```typescript
// tambahkan ke apps/api/src/lib/__tests__/rangka-portal.test.ts
import { analisaPortal } from '../rangka-portal.js'

describe('analisaPortal — lapis 3 (gravitasi)', () => {
  const dasar = {
    bentangM: 6, tinggiM: 3.5, jumlahLantai: 1,
    balok: { bMm: 300, hMm: 500 },
    kolom: { bMm: 400, hMm: 400 },
    fcMpa: 25, qKnM: 20,
  }

  it('momen balok portal ADA DI ANTARA jepit-jepit dan sederhana', () => {
    /*
      Ini kasus tangan yang paling berguna untuk portal, dan alasannya
      penting: portal satu bentang berkaki jepit TIDAK punya rumus tertutup
      sesederhana balok — momennya bergantung kekakuan RELATIF kolom-balok.

      Tetapi ia PASTI terkurung di antara dua batas yang punya rumus tertutup:

        kolom sangat kaku  → balok mendekati JEPIT-JEPIT  → wL²/12
        kolom sangat lunak → balok mendekati SEDERHANA    → wL²/8

      Jadi M tumpuan balok WAJIB di antara wL²/12 dan wL²/8. Di luar itu,
      solvernya salah — dan batas ini tak bisa dipenuhi secara kebetulan.
    */
    const h = analisaPortal(dasar)
    const balok = h.batang.find((b) => b.nama.startsWith('B'))!
    const mTumpuan = Math.abs(Math.min(balok.momenKnm.min, 0))
    const w = dasar.qKnM, L = dasar.bentangM

    expect(mTumpuan).toBeGreaterThan(w * L ** 2 / 12 * 0.85)
    expect(mTumpuan).toBeLessThan(w * L ** 2 / 8)
  })

  it('kolom SANGAT kaku → balok mendekati jepit-jepit wL²/12', () => {
    // Kolom 2000×2000 mm: kekakuannya jauh di atas balok.
    const h = analisaPortal({ ...dasar, kolom: { bMm: 2000, hMm: 2000 } })
    const balok = h.batang.find((b) => b.nama.startsWith('B'))!
    const mTumpuan = Math.abs(Math.min(balok.momenKnm.min, 0))
    expect(mTumpuan).toBeCloseTo(dasar.qKnM * dasar.bentangM ** 2 / 12, 0)
  })

  it('kolom memikul aksial dari beban balok di atasnya', () => {
    const h = analisaPortal(dasar)
    const kolom = h.batang.filter((b) => b.nama.startsWith('K'))
    const totalAksial = kolom.reduce((s, k) => s + Math.abs(k.aksialKn), 0)
    // Dua kolom memikul qL total (± berat sendiri yang tak dihitung di sini).
    expect(totalAksial).toBeCloseTo(dasar.qKnM * dasar.bentangM, 0)
  })

  it('dua lantai menghasilkan lebih banyak batang daripada satu', () => {
    const satu = analisaPortal(dasar)
    const dua = analisaPortal({ ...dasar, jumlahLantai: 2 })
    expect(dua.batang.length).toBeGreaterThan(satu.batang.length)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/lib/__tests__/rangka-portal.test.ts -t "lapis 3"`
Expected: FAIL — `analisaPortal is not a function`

- [ ] **Step 3: Write the implementation**

Tambahkan `analisaPortal` ke `rangka-portal.ts`:

1. Simpul: untuk tiap lantai `t` (0..jumlahLantai), dua simpul di `x = 0` dan `x = bentangM`, `y = t · tinggiM`.
2. Tumpuan: kedua simpul dasar `jepit`; sisanya `bebas`.
3. Batang kolom (`K1`, `K2`, …): menghubungkan simpul lantai `t` ke `t+1`, memakai penampang kolom.
4. Batang balok (`B1`, …): menghubungkan dua simpul di lantai yang sama (`t ≥ 1`), memakai penampang balok, `qKnM` = beban.
5. `gayaLateralKn?[t]` bila ada → `BebanTitik { simpul: <kiri lantai t+1>, fxKn }`. Dipakai Task 5.
6. Panggil `analisaRangka2D`; teruskan `catatan` + tambahan "Portal 2D satu bidang; kekakuan arah tegak lurus tak ditinjau."

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/lib/__tests__/rangka-portal.test.ts`
Expected: PASS — 9 test hijau (5 dari Task 3 + 4 baru)

- [ ] **Step 5: MUTASI WAJIB**

```bash
# a. Tukar penampang balok & kolom saat merakit
#    HARUS memerahkan test "kolom SANGAT kaku".
# b. Buang beban merata dari batang balok
#    HARUS memerahkan test aksial kolom.
```

Tempel hasilnya di pesan commit.

- [ ] **Step 6: Typecheck, lint, commit**

```bash
cd apps/api && npx tsc --noEmit && npx eslint src/lib/rangka-portal.ts src/lib/__tests__/rangka-portal.test.ts
cd /e/Project/puraloka-suite
git add -- apps/api/src/lib/rangka-portal.ts apps/api/src/lib/__tests__/rangka-portal.test.ts
git commit -m "feat(rangka): portal gravitasi — lapis 3

Portal satu bentang berkaki jepit tak punya rumus tertutup sesederhana
balok: momennya bergantung kekakuan RELATIF kolom-balok. Karena itu yang
diuji BATASNYA, dan batas itu punya rumus tertutup —

  kolom sangat kaku  -> balok mendekati jepit-jepit wL2/12
  kolom sangat lunak -> balok mendekati sederhana   wL2/8

Momen tumpuan balok WAJIB terkurung di antara keduanya. Batas itu tak
bisa dipenuhi secara kebetulan oleh solver yang salah.

Dua mutasi dibuktikan MERAH: penampang balok/kolom ditukar, beban merata
dibuang."
```

---

### Task 5: Beban lateral (lapis 4)

**Files:**
- Modify: `apps/api/src/lib/rangka-portal.ts`
- Modify: `apps/api/src/lib/__tests__/rangka-portal.test.ts`

**Interfaces:**
- Consumes: `GayaTingkat` dari `struktur-beban-lateral.js` (medan: `nama`, `tinggiM`, `beratKn`, `gayaKn`, `geserKn`, `porsi`)
- Produces: `gayaLateralDariGempa(tingkat: GayaTingkat[]): number[]` — memetakan `gayaKn` per lantai ke masukan `analisaPortal`

- [ ] **Step 1: Write the failing test**

```typescript
// tambahkan ke apps/api/src/lib/__tests__/rangka-portal.test.ts
import { gayaLateralDariGempa } from '../rangka-portal.js'

describe('beban lateral — lapis 4', () => {
  const dasar = {
    bentangM: 6, tinggiM: 4, jumlahLantai: 1,
    balok: { bMm: 300, hMm: 500 },
    kolom: { bMm: 400, hMm: 400 },
    fcMpa: 25, qKnM: 0,   // gravitasi dimatikan supaya lateral terisolasi
  }

  it('beban titik P di atap: M kaki tiap kolom = P·h/4', () => {
    /*
      Portal simetris berkaki jepit, balok DIBUAT SANGAT KAKU supaya
      simpul atas tak berotasi. Tiap kolom memikul P/2, dan kolom
      jepit-jepit dengan perpindahan ujung memberi M = (P/2)·(h/2) = P·h/4.

      DIVERIFIKASI numerik 2026-09-01: 0,25 P·h.

      Balok kaku itu SYARAT, bukan kebetulan — tanpanya simpul berotasi
      dan momennya bukan lagi Ph/4. Karena itu penampang baloknya dibuat
      2000x2000 di sini, dan test ini akan merah kalau syarat itu hilang.
    */
    const P = 40, h = dasar.tinggiM
    const hasil = analisaPortal({
      ...dasar, balok: { bMm: 2000, hMm: 2000 }, gayaLateralKn: [P],
    })
    const kolom = hasil.batang.filter((b) => b.nama.startsWith('K'))
    expect(kolom).toHaveLength(2)

    for (const k of kolom) {
      const mMaks = Math.max(Math.abs(k.momenKnm.maks), Math.abs(k.momenKnm.min))
      expect(mMaks).toBeCloseTo(P * h / 4, 0)
    }
  })

  it('gaya lateral nol menghasilkan momen kolom nol', () => {
    const hasil = analisaPortal({ ...dasar, gayaLateralKn: [0] })
    for (const k of hasil.batang.filter((b) => b.nama.startsWith('K'))) {
      expect(Math.abs(k.momenKnm.maks)).toBeLessThan(1e-6)
    }
  })

  it('gayaLateralDariGempa memakai gayaKn apa adanya — tak menghitung ulang', () => {
    /*
      Nol rumus gempa baru di modul ini. `analisaGempaStatik` sudah
      menghitungnya; menghitung ulang akan membuat dua sumber kebenaran
      yang bisa menyimpang tanpa satu pun galat.
    */
    const tingkat = [
      { nama: 'L1', tinggiM: 4, beratKn: 500, gayaKn: 12.5, geserKn: 30, porsi: 0.4 },
      { nama: 'L2', tinggiM: 8, beratKn: 500, gayaKn: 17.5, geserKn: 17.5, porsi: 0.6 },
    ]
    expect(gayaLateralDariGempa(tingkat)).toEqual([12.5, 17.5])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/lib/__tests__/rangka-portal.test.ts -t "lapis 4"`
Expected: FAIL — `gayaLateralDariGempa is not a function`

- [ ] **Step 3: Write the implementation**

1. `gayaLateralDariGempa` cukup `tingkat.map((t) => t.gayaKn)` — dengan komentar yang menyatakan kenapa TIDAK ada perhitungan di sini.
2. Pastikan `analisaPortal` sudah menerapkan `gayaLateralKn` sebagai `BebanTitik` di simpul kiri tiap lantai (sudah disiapkan Task 4 langkah 5).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/lib/__tests__/rangka-portal.test.ts`
Expected: PASS — 12 test hijau

- [ ] **Step 5: Typecheck, lint, commit**

```bash
cd apps/api && npx tsc --noEmit && npx eslint src/lib/rangka-portal.ts src/lib/__tests__/rangka-portal.test.ts
cd /e/Project/puraloka-suite
git add -- apps/api/src/lib/rangka-portal.ts apps/api/src/lib/__tests__/rangka-portal.test.ts
git commit -m "feat(rangka): beban lateral — lapis 4

Nol rumus gempa baru: analisaGempaStatik sudah memulangkan gayaKn per
lantai, dan modul ini memakainya apa adanya. Menghitung ulang akan
membuat dua sumber kebenaran yang menyimpang tanpa satu pun galat.

Kasus tangan M = P*h/4 diverifikasi numerik. Syaratnya balok SANGAT kaku
(simpul atas tak berotasi) dan itu ditulis di test — syarat yang hilang
membuat kasus tangannya tak berlaku lagi."
```

---

### Task 6: Rangka batang / truss (lapis 5)

**Files:**
- Create: `apps/api/src/lib/rangka-truss.ts`
- Test: `apps/api/src/lib/__tests__/rangka-truss.test.ts`

**Interfaces:**
- Consumes: `analisaRangka2D` dari `rangka-model.js`
- Produces:
  - `interface InputTruss { simpul: Array<{ nama: string; xM: number; yM: number; tumpuan?: 'sendi' | 'rol-x' }>; batang: Array<{ nama: string; dari: number; ke: number; aMm2: number }>; beban: Array<{ simpul: number; fyKn: number }>; eMpa?: number }`
  - `analisaTruss(input: InputTruss): { batang: Array<{ nama: string; gayaKn: number; arah: 'tarik' | 'tekan' }>; catatan: string[] }`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/src/lib/__tests__/rangka-truss.test.ts
import { describe, it, expect } from 'vitest'
import { analisaTruss } from '../rangka-truss.js'

describe('analisaTruss — lapis 5', () => {
  /*
    RANGKA SEGITIGA: dua batang miring bertemu di puncak, beban P ke bawah.
    Keseimbangan simpul puncak → gaya tiap batang = P/(2 sin θ), TEKAN.

    DIVERIFIKASI numerik 2026-09-01:
      θ=30° → 1,0000 P      θ=45° → 0,7071 P      θ=60° → 0,5774 P
  */
  it('segitiga beban puncak: gaya batang = P/(2 sin θ), TEKAN', () => {
    const P = 20, L = 4, tinggi = 4 * Math.tan(45 * Math.PI / 180) / 2
    const hasil = analisaTruss({
      simpul: [
        { nama: 'A', xM: 0, yM: 0, tumpuan: 'sendi' },
        { nama: 'B', xM: L, yM: 0, tumpuan: 'rol-x' },
        { nama: 'C', xM: L / 2, yM: tinggi },
      ],
      batang: [
        { nama: 'AC', dari: 0, ke: 2, aMm2: 2000 },
        { nama: 'BC', dari: 1, ke: 2, aMm2: 2000 },
        { nama: 'AB', dari: 0, ke: 1, aMm2: 2000 },
      ],
      beban: [{ simpul: 2, fyKn: -P }],
    })

    const theta = Math.atan2(tinggi, L / 2)
    const harap = P / (2 * Math.sin(theta))

    for (const nama of ['AC', 'BC']) {
      const b = hasil.batang.find((x) => x.nama === nama)!
      expect(Math.abs(b.gayaKn)).toBeCloseTo(harap, 1)
      expect(b.arah).toBe('tekan')
    }
  })

  it('batang bawah TARIK — arah dibedakan, bukan cuma besarnya', () => {
    /*
      Arah menentukan pemeriksaan yang berlaku: batang tekan dibatasi
      TEKUK, batang tarik tidak. Menukar keduanya membuat batang tekuk
      lolos pemeriksaan yang salah.
    */
    const P = 20, L = 4, tinggi = 2
    const hasil = analisaTruss({
      simpul: [
        { nama: 'A', xM: 0, yM: 0, tumpuan: 'sendi' },
        { nama: 'B', xM: L, yM: 0, tumpuan: 'rol-x' },
        { nama: 'C', xM: L / 2, yM: tinggi },
      ],
      batang: [
        { nama: 'AC', dari: 0, ke: 2, aMm2: 2000 },
        { nama: 'BC', dari: 1, ke: 2, aMm2: 2000 },
        { nama: 'AB', dari: 0, ke: 1, aMm2: 2000 },
      ],
      beban: [{ simpul: 2, fyKn: -P }],
    })
    expect(hasil.batang.find((x) => x.nama === 'AB')!.arah).toBe('tarik')
  })

  it('menolak truss labil', () => {
    expect(() => analisaTruss({
      simpul: [
        { nama: 'A', xM: 0, yM: 0 },
        { nama: 'B', xM: 4, yM: 0 },
      ],
      batang: [{ nama: 'AB', dari: 0, ke: 1, aMm2: 2000 }],
      beban: [{ simpul: 1, fyKn: -10 }],
    })).toThrow(/labil|singular|tumpuan/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/lib/__tests__/rangka-truss.test.ts`
Expected: FAIL — `Cannot find module '../rangka-truss.js'`

- [ ] **Step 3: Write the implementation**

`apps/api/src/lib/rangka-truss.ts`:

1. Truss = rangka dengan sambungan SENDI. Dimodelkan dengan memberi `iMm4` sangat kecil (mis. `1e-6`) sehingga batang praktis tak menahan lentur — dan **tulis alasannya di komentar**, karena ini keputusan pemodelan yang tak terlihat dari kodenya.
2. `eMpa` bawaan 200_000 (baja).
3. Panggil `analisaRangka2D`, ambil `aksialKn` tiap batang.
4. `arah`: `aksialKn < 0` → `'tekan'`, selain itu `'tarik'`. Tulis konvensinya di komentar.
5. `catatan` + tambahan: "Sambungan dianggap SENDI sempurna; momen sekunder akibat kekakuan sambungan nyata tak ditinjau."

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/lib/__tests__/rangka-truss.test.ts`
Expected: PASS — 3 test hijau

- [ ] **Step 5: MUTASI WAJIB**

```bash
# Balik penentuan arah (tarik <-> tekan).
# HARUS memerahkan test "batang bawah TARIK".
```

- [ ] **Step 6: Typecheck, lint, commit**

```bash
cd apps/api && npx tsc --noEmit && npx eslint src/lib/rangka-truss.ts src/lib/__tests__/rangka-truss.test.ts
cd /e/Project/puraloka-suite
git add -- apps/api/src/lib/rangka-truss.ts apps/api/src/lib/__tests__/rangka-truss.test.ts
git commit -m "feat(rangka): truss — lapis 5, mengisi gayaKn yang selama ini input

analisaRangka() di struktur-baja-rangka.ts meminta gayaKn tiap batang
sebagai MASUKAN. Modul ini menghitungnya.

Arah (tarik/tekan) dibedakan dan diuji, bukan cuma besarnya: batang
tekan dibatasi TEKUK, batang tarik tidak. Menukar keduanya membuat
batang tekuk lolos pemeriksaan yang salah.

Mutasi dibuktikan MERAH: penentuan arah dibalik."
```

---

### Task 7: Jalankan seluruh penjaga & catat di dokumen

**Files:**
- Modify: `docs/execution/JOURNAL.md`
- Modify: `CLAUDE.md` (§1, perintah mengukur cakupan solver)

- [ ] **Step 1: Jalankan seluruh test struktur**

```bash
cd apps/api && npx vitest run src/lib/__tests__/rangka-
```
Expected: seluruh test lapis 1–5 hijau. **Tempel ringkasannya** — CHARTER §7 melarang mengklaim hijau tanpa ringkasan run sungguhan.

- [ ] **Step 2: Jalankan SEMUA penjaga CI**

```bash
cd apps/api && node scripts/jalankan-semua-penjaga.mjs
```
Expected: baris "tak ketemu" WAJIB NOL. Bandingkan jumlah merah dengan sebelum pekerjaan ini; yang bertambah wajib ditelusuri ke berkas yang mana.

- [ ] **Step 3: Typecheck penuh TANPA filter**

```bash
cd apps/api && npx tsc --noEmit
```
Expected: exit 0. Bila mengeluh, PERBAIKI atau LAPORKAN — jangan disaring (CLAUDE.md §7).

- [ ] **Step 4: Tulis entri jurnal**

Tambahkan entri di ATAS `docs/execution/JOURNAL.md` (entri terbaru di atas). Wajib memuat: apa yang dibangun, kasus tangan mana yang dipakai berikut nilainya, mutasi mana yang dibuktikan merah, dan yang BELUM selesai (rute + layar + diagram SVG = Task 8, belum dikerjakan).

⚠ Ada 5 sesi aktif di checkout ini dan JOURNAL.md pernah ditimpa. Tulis entri PALING AKHIR sebelum commit, dan `git add` sebut-nama.

- [ ] **Step 5: Commit**

```bash
git add -- docs/execution/JOURNAL.md CLAUDE.md
git commit -m "docs(jurnal): solver rangka 2D lapis 1-5 — kasus tangan & mutasi"
```

---

## Yang TIDAK ada di plan ini (sengaja)

**Rute API, layar, dan diagram SVG** adalah Task 8 dan seterusnya — sengaja ditunda sampai lapis 1–5 terbukti benar. Alasannya sama dengan alasan berlapis: menyambungkan solver ke layar sebelum angkanya terbukti berarti menampilkan angka yang belum tentu benar kepada orang yang akan memakainya untuk memilih tulangan.

Sesudah Task 7 hijau, buat plan terpisah untuk:
- `POST /api/v1/struktur/analisa-rangka` (pola: `saran-pembesian` di `routes/v1/struktur.ts`)
- Mode ketiga di layar Rekomendasi Pembesian ("analisa rangka")
- Diagram M/V/N lewat `struktur-gambar.ts`
- Menyambung `analisaTruss` → `analisaRangka` di `struktur-baja-rangka.ts`
