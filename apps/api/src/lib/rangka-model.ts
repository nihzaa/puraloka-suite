// apps/api/src/lib/rangka-model.ts
// Model rangka 2D: simpul, batang, tumpuan, beban → perpindahan, gaya dalam,
// lendutan sepanjang batang. PURE, tanpa I/O, BUTA SNI.
//
// Modul ini tak tahu apa pun tentang SNI, beton, baja, atau kombinasi
// pembebanan. Ia hanya tahu angka: geometri, kekakuan, beban. Lapis di
// atasnya (`rangka-portal.ts`, `rangka-truss.ts`) yang merakit model dari
// geometri bangunan dan menerapkan aturan SNI.
//
// ══════════════════════════════════════════════════════════════════════════════
// KONVENSI TANDA — mengikuti `rangka-matriks.ts`, JANGAN diubah sepihak
// ══════════════════════════════════════════════════════════════════════════════
//
//   Sumbu global X ke kanan, Y ke atas. Rotasi positif berlawanan jarum jam.
//   Momen positif = SERAT BAWAH TERTARIK (lazim di praktik Indonesia).
//
//   `qKnM` POSITIF = beban merata ke arah GRAVITASI, yaitu −y LOKAL batang.
//   Untuk balok mendatar (cos=1, sin=0), −y lokal = −Y global = ke bawah.
//   Ini yang dipakai 99% pemanggil; beban ke atas dituliskan negatif.
//
// Kenapa tanda ditulis sebesar ini: tanda yang tertukar TIDAK menimbulkan
// galat. Ia menaruh tulangan tumpuan di sisi yang salah — atas dipasang di
// bawah — dan baloknya gagal pada beban yang seharusnya aman.
//
// ── Satuan (dipaku, jangan dicampur)
//   xM/yM  m        eMpa  MPa=N/mm²     aMm2  mm²      iMm4  mm⁴
//   qKnM   kN/m     fxKn/fyKn  kN       mKnm  kNm
//   Keluaran: momen kNm · geser kN · aksial kN · LENDUTAN mm.
//
// ── Batas yang selalu ikut di `catatan`
//   elastis linier · sambungan kaku sempurna · tanpa P-Δ · tanpa torsi ·
//   tanpa penurunan tumpuan.

import { kLokal, kGlobal, matriksRotasi, selesaikan } from './rangka-matriks.js'

/** DOF per simpul: u (X), v (Y), θ. */
const DOF_SIMPUL = 3

/** Banyaknya titik sampel gaya dalam sepanjang batang (x = 0 … L). */
const TITIK_SAMPEL = 11

export type Tumpuan = 'bebas' | 'sendi' | 'rol-x' | 'jepit'

export interface Simpul {
  nama: string
  xM: number
  yM: number
  tumpuan: Tumpuan
}

export interface BatangModel {
  nama: string
  /** Indeks simpul awal di array `simpul`. */
  dari: number
  /** Indeks simpul akhir. */
  ke: number
  eMpa: number
  aMm2: number
  iMm4: number
  /** Beban merata, kN/m, POSITIF = ke arah gravitasi (−y lokal). */
  qKnM?: number
}

export interface BebanTitik {
  /** Indeks simpul di array `simpul`. */
  simpul: number
  fxKn?: number
  fyKn?: number
  mKnm?: number
}

export interface TitikNilai {
  xM: number
  nilai: number
}

export interface HasilBatang {
  nama: string
  momenKnm: { maks: number; min: number; di: TitikNilai[] }
  geserKn: { maks: number; min: number; di: TitikNilai[] }
  /** Aksial rata-rata batang; NEGATIF = tekan, POSITIF = tarik. */
  aksialKn: number
  /** Lendutan tegak lurus batang, mm. `maks` = |lendutan| terbesar. */
  lendutanMm: { maks: number; di: TitikNilai[] }
}

/**
 * Reaksi di satu simpul BERTUMPU, sumbu GLOBAL.
 *
 * Ini gaya yang TUMPUAN berikan kepada STRUKTUR — bukan sebaliknya. Akibatnya:
 *
 *     Σ reaksi + Σ beban luar = 0     →     Σ reaksi = −Σ beban
 *
 * Untuk beban gravitasi (bertanda negatif di Y global) reaksi tegaknya karena
 * itu keluar POSITIF: balok sederhana q = 20 kN/m, L = 6 m memberi +60 kN di
 * tiap tumpuan, Σ = +120 kN = qL.
 */
export interface ReaksiTumpuan {
  /** Indeks simpul di array `simpul` masukan. */
  simpul: number
  nama: string
  fxKn: number
  fyKn: number
  mKnm: number
}

/** Gaya ujung sebuah batang di sumbu LOKAL, apa adanya dari penyelesai. */
export interface GayaUjungBatang {
  nama: string
  /**
   * [N1, V1, M1, N2, V2, M2] — gaya yang SIMPUL berikan kepada BATANG.
   * MENTAH: tidak diolah, tandanya tidak dibalik. Lihat `gayaDalam`.
   */
  f: [number, number, number, number, number, number]
}

export interface HasilRangka {
  batang: HasilBatang[]
  /**
   * Reaksi di tiap simpul BERTUMPU, sumbu global. Simpul bebas tak masuk,
   * dan urutannya mengikuti urutan simpul di masukan.
   */
  reaksi: ReaksiTumpuan[]
  /**
   * Gaya ujung batang di sumbu LOKAL, apa adanya dari penyelesai — enam angka
   * per batang, urutannya sama dengan array `batang` masukan.
   */
  gayaUjung: GayaUjungBatang[]
  catatan: string[]
}

/** DOF mana saja yang ditahan tiap jenis tumpuan (indeks lokal simpul). */
const DITAHAN: Record<Tumpuan, number[]> = {
  bebas: [],
  sendi: [0, 1],
  'rol-x': [1],
  jepit: [0, 1, 2],
}

const CATATAN_BATAS: readonly string[] = [
  'Analisis elastis linier — bahan dianggap tak pernah leleh dan perpindahan kecil.',
  'Sambungan dianggap kaku sempurna; kekakuan sambungan nyata tak ditinjau.',
  'Tanpa efek P-Δ (orde kedua) dan tanpa torsi — rangka bidang, satu bidang saja.',
  'Tanpa penurunan tumpuan; tumpuan dianggap tak bergerak sama sekali.',
]

/**
 * Analisis rangka bidang dengan metode kekakuan langsung.
 *
 * @throws bila geometri tak masuk akal atau struktur LABIL (matriks singular).
 *   Melempar itu sengaja: penyelesai yang memulangkan angka raksasa memberi
 *   sesuatu yang TERLIHAT seperti hasil, dan angka itu akan dipakai memilih
 *   tulangan tanpa satu pun galat.
 */
export function analisaRangka2D(
  simpul: Simpul[],
  batang: BatangModel[],
  beban: BebanTitik[],
): HasilRangka {
  if (simpul.length < 2) {
    throw new Error(`Rangka butuh minimal 2 simpul (diterima: ${simpul.length})`)
  }
  if (batang.length < 1) {
    throw new Error('Rangka butuh minimal 1 batang')
  }

  // ── 1. Peta DOF: simpul i memakai 3i (u), 3i+1 (v), 3i+2 (θ).
  const n = simpul.length
  const nDof = n * DOF_SIMPUL

  // ── Geometri tiap batang, dihitung sekali dan dipakai ulang di langkah 6-7.
  const geo = batang.map((b) => {
    const a = simpul[b.dari]
    const z = simpul[b.ke]
    if (!a || !z) {
      throw new Error(
        `Batang ${b.nama} menunjuk simpul di luar daftar (${b.dari} → ${b.ke})`,
      )
    }
    const dx = z.xM - a.xM
    const dy = z.yM - a.yM
    const lM = Math.hypot(dx, dy)
    if (!(lM > 0)) {
      throw new Error(`Batang ${b.nama} berpanjang nol — dua simpulnya berimpit`)
    }
    return { lM, cos: dx / lM, sin: dy / lM }
  })

  // ── 2. Rakit K global (nDof × nDof).
  const K: number[][] = Array.from({ length: nDof }, () => new Array<number>(nDof).fill(0))
  batang.forEach((b, e) => {
    const g = geo[e]!
    const kg = kGlobal(b.eMpa, b.aMm2, b.iMm4, g.lM, g.cos, g.sin)
    const peta = petaDof(b)
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) {
        K[peta[i]!]![peta[j]!] += kg[i]![j]!
      }
    }
  })

  // ── 3. Vektor beban.
  const F = new Array<number>(nDof).fill(0)

  //    3a. Beban titik apa adanya.
  for (const p of beban) {
    const s = simpul[p.simpul]
    if (!s) throw new Error(`Beban menunjuk simpul ${p.simpul} yang tak ada`)
    F[p.simpul * DOF_SIMPUL] += p.fxKn ?? 0
    F[p.simpul * DOF_SIMPUL + 1] += p.fyKn ?? 0
    F[p.simpul * DOF_SIMPUL + 2] += p.mKnm ?? 0
  }

  //    3b. Beban merata → gaya ekuivalen simpul (NEGATIF dari fixed-end forces).
  //
  //    Fixed-end forces (FEF) adalah gaya yang harus DIBERIKAN TUMPUAN untuk
  //    menahan batang jepit-jepit di bawah q. Beban ekuivalen simpul adalah
  //    lawannya. Ini yang paling mudah tertukar tandanya, dan tertukarnya
  //    tidak menimbulkan galat — hanya angka yang salah.
  const fefLokal = batang.map((b, e) => fixedEndLokal(b.qKnM ?? 0, geo[e]!.lM))
  batang.forEach((b, e) => {
    const g = geo[e]!
    const fef = fefLokal[e]!
    // FEF lokal → global: Tᵀ · f
    const t = matriksRotasi(g.cos, g.sin)
    const peta = petaDof(b)
    for (let i = 0; i < 6; i++) {
      let s = 0
      for (let m = 0; m < 6; m++) s += t[m]![i]! * fef[m]!
      F[peta[i]!] -= s   // beban ekuivalen = −FEF
    }
  })

  // ── 4. Terapkan tumpuan dengan MEMBUANG baris & kolom DOF tertahan.
  //
  //    Bukan mengalikan angka besar (penalty): cara itu membuat matriks tetap
  //    bisa diselesaikan meski strukturnya labil, sehingga kesingularan yang
  //    justru paling perlu ketahuan jadi tersembunyi di balik angka raksasa.
  const bebasDof: number[] = []
  simpul.forEach((s, i) => {
    const tahan = DITAHAN[s.tumpuan]
    if (!tahan) throw new Error(`Simpul ${s.nama}: tumpuan '${s.tumpuan}' tak dikenal`)
    for (let d = 0; d < DOF_SIMPUL; d++) {
      if (!tahan.includes(d)) bebasDof.push(i * DOF_SIMPUL + d)
    }
  })
  /*
    ⚠ `bebasDof` KOSONG bukan galat. Balok jepit-jepit satu batang persis
    seperti itu: enam DOF, semuanya tertahan. Strukturnya sah dan hasilnya
    tertentu — seluruh perpindahan nol, dan gaya ujung batang datang
    sepenuhnya dari fixed-end forces.

    Draf pertama modul ini melempar di sini dan memerahkan kasus tangan
    jepit-jepit, satu-satunya kasus di plan yang nol DOF bebas.
  */
  const Kb = bebasDof.map((r) => bebasDof.map((c) => K[r]![c]!))
  const Fb = bebasDof.map((r) => F[r]!)

  // ── 5. Selesaikan; DOF tertahan tetap nol.
  let db: number[] = []
  if (bebasDof.length > 0) {
    try {
      db = selesaikan(Kb, Fb)
    } catch (e) {
      const pesan = e instanceof Error ? e.message : String(e)
      throw new Error(
        `Struktur LABIL — tak bisa diselesaikan. ${pesan} `
        + 'Periksa tumpuan: setiap bagian rangka harus tertahan terhadap '
        + 'geser mendatar, geser tegak, dan putaran.',
      )
    }
  }
  const d = new Array<number>(nDof).fill(0)
  bebasDof.forEach((dof, i) => { d[dof] = db[i]! })

  // ── 6-7. Gaya ujung batang & gaya dalam sepanjang batang.
  //
  // `fSemua` disimpan supaya langkah 8 bisa memanen reaksi tumpuan darinya.
  // Sebelumnya `f` hidup dan mati di dalam `map` ini, dan siapa pun yang butuh
  // reaksi harus MEREKONSTRUKSInya dari `HasilBatang` — termasuk ujung KEDUA,
  // yang tak dilaporkan sama sekali dan karena itu hanya bisa DISIMPULKAN dari
  // keseimbangan batang. Cacat yang cuma merusak ujung kedua lolos pemeriksaan
  // semacam itu, karena keseimbangan batang adalah sifat bawaan `kLokal`,
  // bukan hasil yang diukur.
  const fSemua: number[][] = []
  const hasil = batang.map((b, e) => {
    const g = geo[e]!
    const peta = petaDof(b)
    const dGlobal = peta.map((dof) => d[dof]!)

    // dLokal = T · dGlobal
    const t = matriksRotasi(g.cos, g.sin)
    const dLokal = new Array<number>(6).fill(0)
    for (let i = 0; i < 6; i++) {
      let s = 0
      for (let m = 0; m < 6; m++) s += t[i]![m]! * dGlobal[m]!
      dLokal[i] = s
    }

    // f = kLokal · dLokal + FEF
    const kl = kLokal(b.eMpa, b.aMm2, b.iMm4, g.lM)
    const fef = fefLokal[e]!
    const f = new Array<number>(6).fill(0)
    for (let i = 0; i < 6; i++) {
      let s = fef[i]!
      for (let m = 0; m < 6; m++) s += kl[i]![m]! * dLokal[m]!
      f[i] = s
    }
    fSemua.push(f)

    return gayaDalam(b.nama, f, b.qKnM ?? 0, g.lM, b.eMpa, b.iMm4, dLokal)
  })

  // ── 8. Reaksi tumpuan, dipanen dari gaya ujung batang.
  const reaksi = panenReaksi(simpul, batang, geo, fSemua, beban)

  const gayaUjung: GayaUjungBatang[] = batang.map((b, e) => {
    const f = fSemua[e]!
    // MENTAH — tidak diolah, tanda tidak dibalik. Pemeriksa harus bisa
    // MEMBACA ujung kedua, bukan menyimpulkannya.
    return { nama: b.nama, f: [f[0]!, f[1]!, f[2]!, f[3]!, f[4]!, f[5]!] }
  })

  return { batang: hasil, reaksi, gayaUjung, catatan: [...CATATAN_BATAS] }
}

/**
 * Reaksi tumpuan dari gaya ujung batang.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * TANDA — DIUKUR, BUKAN DIBACA DARI KOMENTAR
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `f` adalah gaya yang SIMPUL berikan kepada BATANG (lihat `gayaDalam`;
 * komentar versi pertama di sana menyatakannya TERBALIK, dan siapa pun yang
 * menurunkan reaksi dari sana mengikuti komentar lama mendapat ΣF yang meleset
 * persis 2×R — bukan nol). Keseimbangan sebuah simpul berbunyi:
 *
 *     Σ f  =  beban_luar  +  reaksi
 *     →  reaksi = Σ f − beban_luar
 *
 * Di arah BEBAS ruas kanan itu nol; sisa yang muncul di arah TERTAHAN JUSTRU
 * reaksinya. Hasilnya: reaksi = gaya yang TUMPUAN berikan kepada STRUKTUR,
 * jadi Σreaksi = −Σbeban.
 *
 * Diukur 2026-09-01 pada tiga kasus yang jawabannya diketahui:
 *   • balok sederhana q=20 L=6 → +60 kN tiap tumpuan, Σ = +120 = qL
 *   • kantilever jepit q=20 L=6 → fy +120 kN, m +360 kNm = +wL²/2
 *   • portal berbeban lateral −40 kN + q=15 bentang 6 → ΣFx +40, ΣFy +90
 *
 * ⚠ ARAH YANG TAK DITAHAN DIPAKU NOL, bukan diisi gaya sisa. Rol-x tak bisa
 * menahan X: mengisinya dengan sisa numerik ~1e-14 masih terlihat wajar, tapi
 * pada rangka yang sedikit tak seimbang secara numerik ia bisa tumbuh dan
 * dijumlahkan sebagai reaksi yang secara fisik TIDAK ADA — ΣFx lalu terhitung
 * dua kali tanpa satu pun galat.
 *
 * Momen ujung batang bekerja terhadap simpulnya sendiri, jadi lengannya nol —
 * tak perlu dipindah. Rangka bidang: momen selalu terhadap sumbu Z yang sama,
 * jadi ia tak ikut berputar saat lokal → global.
 */
function panenReaksi(
  simpul: Simpul[],
  batang: BatangModel[],
  geo: { lM: number; cos: number; sin: number }[],
  fSemua: number[][],
  beban: BebanTitik[],
): ReaksiTumpuan[] {
  const reaksi: ReaksiTumpuan[] = []

  simpul.forEach((s, i) => {
    const tahan = DITAHAN[s.tumpuan]!
    if (tahan.length === 0) return   // simpul bebas tak punya reaksi

    let fx = 0
    let fy = 0
    let m = 0

    batang.forEach((b, e) => {
      const f = fSemua[e]!
      const g = geo[e]!
      /*
        Lokal → global memakai Tᵀ, yang untuk pasangan (N, V) berarti:
            Fx = N·cos − V·sin        Fy = N·sin + V·cos
        Memakai T alih-alih Tᵀ di sini tak menimbulkan galat; ia hanya
        mencerminkan seluruh reaksi terhadap sumbu batang, dan pada rangka
        bertulang MENDATAR (sin = 0, cos = 1) keduanya memberi angka yang
        SAMA PERSIS — jadi balok takkan pernah memerahkannya, hanya portal.
      */
      if (b.dari === i) {
        fx += f[0]! * g.cos - f[1]! * g.sin
        fy += f[0]! * g.sin + f[1]! * g.cos
        m += f[2]!
      }
      if (b.ke === i) {
        fx += f[3]! * g.cos - f[4]! * g.sin
        fy += f[3]! * g.sin + f[4]! * g.cos
        m += f[5]!
      }
    })

    for (const p of beban) {
      if (p.simpul !== i) continue
      fx -= p.fxKn ?? 0
      fy -= p.fyKn ?? 0
      m -= p.mKnm ?? 0
    }

    // Indeks DOF lokal simpul: 0 = X, 1 = Y, 2 = θ.
    reaksi.push({
      simpul: i,
      nama: s.nama,
      fxKn: tahan.includes(0) ? fx : 0,
      fyKn: tahan.includes(1) ? fy : 0,
      mKnm: tahan.includes(2) ? m : 0,
    })
  })

  return reaksi
}

/** DOF global yang disentuh sebuah batang, berurutan u1,v1,θ1,u2,v2,θ2. */
function petaDof(b: BatangModel): number[] {
  const a = b.dari * DOF_SIMPUL
  const z = b.ke * DOF_SIMPUL
  return [a, a + 1, a + 2, z, z + 1, z + 2]
}

/**
 * Fixed-end forces batang jepit-jepit di bawah beban merata q (kN/m),
 * dinyatakan di SUMBU LOKAL batang.
 *
 * `q` positif = ke arah gravitasi = −y lokal. Reaksi jepit karena itu
 * mengarah +y lokal sebesar qL/2 di tiap ujung, dengan momen jepit
 * +qL²/12 di ujung awal dan −qL²/12 di ujung akhir.
 *
 * ⚠ Tanda momen inilah yang membedakan jepit-jepit (wL²/12) dari sederhana
 * (wL²/8). Membaliknya tidak menimbulkan galat, hanya angka yang salah —
 * dan itu dibuktikan lewat mutasi wajib Task 2.
 */
function fixedEndLokal(qKnM: number, lM: number): number[] {
  if (qKnM === 0) return new Array<number>(6).fill(0)
  const V = qKnM * lM / 2
  const M = qKnM * lM ** 2 / 12
  return [0, V, M, 0, V, -M]
}

/**
 * Gaya dalam di 11 titik sepanjang batang, dari gaya ujung lokal `f`.
 *
 * `f` = [N1, V1, M1, N2, V2, M2] di sumbu lokal — gaya yang diberikan
 * SIMPUL KEPADA BATANG (bukan sebaliknya).
 *
 * ⚠ Arahnya DIUKUR, bukan diasumsikan, dan komentar versi pertama di sini
 * menyatakannya TERBALIK ("gaya yang DIBERIKAN batang kepada simpul").
 * Buktinya: kantilever jepit-kiri, q=20 kN/m, L=6 m memberi `f[1] = +120 kN`
 * = +qL. Tumpuan jepit mendorong balok ke ATAS sebesar qL, jadi tanda positif
 * itu hanya konsisten bila `f` berarti simpul→batang.
 *
 * Matematikanya SELALU benar; yang salah dokumentasinya. Tapi salahnya mahal:
 * siapa pun yang menurunkan REAKSI TUMPUAN dari `f` mengikuti komentar lama
 * akan mendapat tandanya terbalik — dan ΣF-nya meleset persis 2×R, bukan nol.
 * Itu benar-benar terjadi saat test invarian ditulis.
 *
 * Dari sana:
 *
 *   V(x) = f[1] − q·x
 *   M(x) = −f[2] + f[1]·x − q·x²/2      (serat bawah tertarik = positif)
 *
 * Lendutan diperoleh dari integrasi ganda M/EI dengan syarat batas dari
 * perpindahan ujung yang sudah diketahui — bukan dari rumus tabel, supaya
 * berlaku untuk sembarang kombinasi tumpuan.
 *
 * `momenKnm.maks/min` TIDAK diambil dari 11 titik itu saja — lihat catatan
 * puncak analitis di dalam fungsi.
 */
function gayaDalam(
  nama: string,
  f: number[],
  qKnM: number,
  lM: number,
  eMpa: number,
  iMm4: number,
  dLokal: number[],
): HasilBatang {
  const V1 = f[1]!
  const M1 = f[2]!

  const mDi = (x: number) => -M1 + V1 * x - qKnM * x ** 2 / 2

  const momen: TitikNilai[] = []
  const geser: TitikNilai[] = []
  for (let i = 0; i < TITIK_SAMPEL; i++) {
    const x = lM * i / (TITIK_SAMPEL - 1)
    geser.push({ xM: x, nilai: V1 - qKnM * x })
    momen.push({ xM: x, nilai: mDi(x) })
  }

  /*
    ⚠ PUNCAK MOMEN JARANG JATUH DI TITIK CUPLIKAN.

    Deret 11 titik di atas ada untuk MENGGAMBAR diagram, dan tiap nilainya
    eksak. Tapi maksimum atas deret itu bukan maksimum atas batang: pada
    beban merata M(x) berderajat 2, dan puncaknya duduk di V(x) = 0, yaitu
    x = V1/q — angka yang hampir tak pernah kelipatan 0,1L.

    Terukur pada balok menerus dua bentang (w=20, L=6): puncak sesungguhnya
    50,625 kNm di 0,375L, sementara cuplikan terdekat memberi 50,400 kNm.
    Melesetnya cuma 0,44%, tapi ARAHNYA selalu ke bawah — momen yang
    dilaporkan lebih kecil dari yang sesungguhnya bekerja, dan angka inilah
    yang dipakai memilih pembesian. Kekurangan tulangan tak menimbulkan
    galat apa pun; ia menunggu sampai beban penuh datang.

    Karena itu maks/min dihitung dari cuplikan DITAMBAH puncak analitis,
    sedangkan `di[]` tetap 11 titik supaya diagramnya tak berubah.

    q = 0 (kolom, batang tanpa beban merata) → M(x) linier, puncaknya di
    ujung, dan cuplikan sudah menangkapnya. Jangan membagi nol.
  */
  const kandidat = momen.map((p) => p.nilai)
  if (qKnM !== 0) {
    const xPuncak = V1 / qKnM
    if (xPuncak > 0 && xPuncak < lM) kandidat.push(mDi(xPuncak))
  }

  // Aksial: NEGATIF = tekan. f[0] adalah gaya lokal-x di ujung awal, yang
  // menekan batang bila positif — jadi tandanya dibalik supaya tarik positif.
  const aksialKn = -f[0]!

  const lendutan = hitungLendutan(momen, lM, eMpa, iMm4, dLokal, V1, M1, qKnM)

  return {
    nama,
    momenKnm: {
      maks: Math.max(...kandidat),
      min: Math.min(...kandidat),
      di: momen,
    },
    geserKn: {
      maks: Math.max(...geser.map((p) => p.nilai)),
      min: Math.min(...geser.map((p) => p.nilai)),
      di: geser,
    },
    aksialKn,
    lendutanMm: {
      maks: lendutan.maks,
      di: lendutan.di,
    },
  }
}

/**
 * Lendutan tegak lurus batang (mm) di 11 titik, dari integrasi ganda M/EI.
 *
 * ── Satuan, tempat cacat termahal di modul ini
 *   M kNm · E MPa=N/mm² · I mm⁴ · x m → lendutan mm.
 *   Sukunya (M·x²) berdimensi kN·m³; kN→N ×1e3 dan m³→mm³ ×1e9, jadi
 *   ×1e12 lalu ÷EI [N·mm²] memberi mm LANGSUNG — satu faktor tunggal,
 *   bukan rangkaian ÷1000 yang "kelihatan benar" (lihat kisah 1000× di
 *   header `rangka-matriks.ts`).
 *
 * Integrasi dilakukan SECARA EKSAK, bukan numerik. M(x) untuk beban merata
 * berderajat 2 (`−M1 + V1·x − q·x²/2`), jadi κ = M/EI juga berderajat 2 dan
 * lendutannya berderajat 4 — bentuk tertutupnya diketahui:
 *
 *   κ(x)  = (−M1 + V1·x − q·x²/2) · 1e6/(EI)
 *   θ(x)  = ∫κ  = (−M1·x + V1·x²/2 − q·x³/6) · 1e6/(EI)
 *   y(x)  = ∫θ  = (−M1·x²/2 + V1·x³/6 − q·x⁴/24) · 1e6/(EI)
 *
 * ⚠ Draf pertama memakai integrasi trapesium pada jaring 11 titik. Ujung-
 * ujungnya EKSAK (syarat batas memakukannya) dan kedua test lendutan tetap
 * HIJAU, tapi titik-titik DI ANTARANYA meleset 1,6–8%: balok sederhana
 * −0,3188 mm di tengah terhadap −0,3240 mm teoretis. Yang hijau cuma titik
 * yang diperiksa test; diagram lendutan yang dibaca orang justru salah di
 * seluruh bentang. Trapesium meremehkan kurva cekung secara sistematis, dan
 * kesalahannya tak pernah menimbulkan galat.
 *
 * Syarat batas: lendutan di kedua ujung diambil dari perpindahan lokal
 * `dLokal[1]` dan `dLokal[4]` (satuan m, dikonversi ke mm) — bukan dipaku
 * nol, supaya batang yang ujungnya ikut bergerak (portal, truss) tetap benar.
 */
function hitungLendutan(
  momen: TitikNilai[],
  lM: number,
  eMpa: number,
  iMm4: number,
  dLokal: number[],
  V1: number,
  M1: number,
  qKnM: number,
): { di: TitikNilai[]; maks: number } {
  const nTitik = momen.length

  /** EI dalam N·mm² — E [N/mm²] × I [mm⁴]. */
  const EI = eMpa * iMm4

  // y(x) sebelum syarat batas. `x` tetap dalam METER; seluruh konversi
  // ditumpuk jadi satu faktor 1e12 (kN·m³ → N·mm³) supaya hanya ada SATU
  // tempat yang bisa salah, bukan tiga.
  const y = momen.map((p) => {
    const x = p.xM
    const suku = -M1 * x ** 2 / 2 + V1 * x ** 3 / 6 - qKnM * x ** 4 / 24
    return suku * 1e12 / EI
  })

  /*
    Koreksi linier: y(x) yang dihitung di atas memenuhi persamaan
    diferensialnya tapi belum memenuhi syarat batas. Menambahkan fungsi
    linier a + b·x TIDAK mengubah y'' = κ, jadi a dan b dipilih supaya
    lendutan kedua ujung cocok dengan perpindahan simpul yang sudah
    diketahui dari penyelesaian kekakuan.

    ⚠ TANDA. `y` di sini adalah lendutan ke arah +y lokal, sama dengan
    dLokal[1]/dLokal[4]. Kelengkungan y'' = M/EI berlaku dengan konvensi
    momen positif = serat bawah tertarik = melengkung cekung ke ATAS,
    yang untuk balok mendatar berarti lendutan ke BAWAH di tengah — dan
    itulah sebabnya nilai puncaknya keluar negatif, |·| yang dilaporkan.
  */
  const y0 = dLokal[1]! * 1000   // m → mm
  const yL = dLokal[4]! * 1000
  const a = y0 - y[0]!
  const b = (yL - (y[nTitik - 1]! + a)) / (lM * 1000)

  /** y(x) lengkap, mm — x dalam meter. Bentuk tertutup, bukan interpolasi. */
  const yDi = (x: number) => {
    const suku = -M1 * x ** 2 / 2 + V1 * x ** 3 / 6 - qKnM * x ** 4 / 24
    return suku * 1e12 / EI + a + b * (x * 1000)
  }

  const di = momen.map((p) => ({ xM: p.xM, nilai: yDi(p.xM) }))

  /*
    ⚠ PUNCAK LENDUTAN, seperti puncak momen, jarang jatuh di titik cuplikan.

    Terukur pada balok menerus dua bentang (w=20, L=6): puncak sesungguhnya
    0,224617 mm di 0,4215L, sementara maksimum cuplikan memberi 0,223949 mm —
    0,30% ke arah LEBIH KECIL. Lendutan dipakai memeriksa batas layan (L/240,
    L/360); melaporkannya lebih kecil membuat balok yang sesungguhnya melewati
    batas lolos pemeriksaan, tanpa satu pun galat.

    y(x) berderajat 4, jadi y'(x) berderajat 3 — akarnya tak punya bentuk
    tertutup yang enak dan stabil. Yang dipakai di sini: y' dicuplik di jaring
    yang SAMA, dan di tiap selang yang tandanya berganti akarnya dikurung
    dengan bagi-dua. Tiga akar sekalipun tertangkap semuanya, karena tiap akar
    sederhana pasti mengganti tanda. Sub-selang 0,1L jauh lebih rapat daripada
    jarak antar-akar y' pada batang yang waras.

    60 langkah bagi-dua memberi lebar selang ~1e-18·L — di bawah presisi
    double, jadi ia berhenti karena kehabisan digit, bukan karena toleransi
    yang ditebak.
  */
  const yAksen = (x: number) =>
    (-M1 * x + V1 * x ** 2 / 2 - qKnM * x ** 3 / 6) * 1e12 / EI + b * 1000

  let maks = Math.max(...di.map((p) => Math.abs(p.nilai)))
  for (let i = 0; i < nTitik - 1; i++) {
    let lo = di[i]!.xM
    let hi = di[i + 1]!.xM
    const fLo = yAksen(lo)
    if (fLo === 0 || Math.sign(fLo) === Math.sign(yAksen(hi))) continue
    for (let k = 0; k < 60; k++) {
      const mid = (lo + hi) / 2
      if (Math.sign(yAksen(mid)) === Math.sign(fLo)) lo = mid
      else hi = mid
    }
    maks = Math.max(maks, Math.abs(yDi((lo + hi) / 2)))
  }

  return { di, maks }
}
