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
