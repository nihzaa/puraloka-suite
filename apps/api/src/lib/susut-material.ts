/**
 * SUSUT MATERIAL — rencana vs kenyataan (G6e).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PUSTAKA INI ADA, DAN KENAPA IA DITUNDA DUA KALI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `/gudang/rekonsiliasi` sudah menjawab "berapa yang hilang": ia mengadu RAB,
 * penerimaan, pemakaian, dan sisa gudang. Yang tak bisa dijawabnya: **apakah
 * yang hilang itu wajar.**
 *
 * "12% hilang" tidak berarti apa-apa sendirian. Yang berarti: "12% hilang
 * padahal yang dianggarkan 5%". Tanpa pembanding, angka susut hanya bisa
 * dipakai untuk mencurigai — dan orang yang dicurigai tanpa dasar akan
 * membantah, dengan benar.
 *
 * ── Kenapa penundaannya SAH, dan apa yang berubah
 *
 * F5-1 (2026-08-06) menundanya karena `assemblies.waste_factor` kosong pada
 * 3.042 dari 3.043 baris. Diukur ulang 2026-08-12: masih 1 dari 3.043.
 *
 * Tetapi pengukuran yang lebih dalam menemukan sebab yang berbeda dari yang
 * dicatat: `resources` (2.830, kode `AHSP-*`) dan `materials` (24, kode
 * `MAT-*`) punya **nol kode yang cocok**. Dua penomoran yang tak pernah
 * dirancang untuk bertemu — jadi jalurnya bukan "belum dibuat", melainkan
 * **tak mungkin dibuat tanpa keputusan manusia**.
 *
 * Yang dibangun karena itu bukan tebakan pencocokan nama, melainkan jembatan
 * yang diisi orang gudang (migrasi 310).
 *
 * ── Yang dihitung di sini, dan yang TIDAK
 *
 * Pustaka ini membandingkan susut nyata dengan rencana. Ia **tidak**
 * memutuskan apakah selisihnya berarti pencurian, kesalahan catat, atau
 * material yang memang lebih rapuh dari dugaan. Ketiganya menghasilkan angka
 * yang sama persis, dan membedakannya butuh orang yang ada di lapangan.
 */

/** Angka dari basis. `Number('')` adalah 0 — lihat lib/markup.ts. */
export function angka(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = v.trim()
  if (s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export interface BarisSusut {
  material_id: string
  nama: string | null
  satuan: string | null
  /** Kebutuhan menurut RAB — sebelum susut. */
  rab: number | string | null
  /** Yang benar-benar diterima gudang. */
  diterima: number | string | null
  /** Yang tercatat terpakai di lapangan. */
  terpakai: number | string | null
  /** Sisa yang masih ada di gudang. */
  sisa: number | string | null
  /** Rencana susut, fraksi (0.05 = 5%). `null` = belum ditetapkan. */
  rencana_fraksi?: number | string | null
}

export interface HasilSusut {
  material_id: string
  nama: string | null
  satuan: string | null
  rab: number | null
  diterima: number | null
  terpakai: number | null
  sisa: number | null
  /** Yang tak bisa dijelaskan: diterima − terpakai − sisa. */
  hilang: number | null
  /** Susut nyata terhadap yang DITERIMA, dalam persen. */
  susut_pct: number | null
  /** Rencana dalam persen. `null` = belum ditetapkan. */
  rencana_pct: number | null
  /** susut_pct − rencana_pct. Positif = melebihi rencana. */
  selisih_pct: number | null
  /**
   * Penilaian yang HANYA diberikan bila rencananya ada.
   *
   * `tak_terukur` bukan kegagalan — ia keadaan sah yang harus terlihat,
   * karena angka susut tanpa pembanding tak boleh dipakai menilai siapa pun.
   */
  nilai: 'wajar' | 'melebihi' | 'jauh_melebihi' | 'tak_terukur'
}

/**
 * Ambang "jauh melebihi": dua kali lipat rencana.
 *
 * Angka ini KESEPAKATAN, bukan turunan dari apa pun — dan karena itu ia
 * ditulis di satu tempat dengan namanya sendiri, bukan disebar sebagai `2`
 * di beberapa perbandingan. Kalau kelak ia harus bisa diatur per perusahaan,
 * yang berubah satu baris.
 */
export const LIPAT_JAUH_MELEBIHI = 2

/**
 * Menghitung satu baris.
 *
 * ── Kenapa `hilang` bisa NEGATIF, dan itu tidak "diperbaiki"
 *
 * Terpakai + sisa yang melebihi yang diterima berarti ada yang salah catat:
 * pemakaian dicatat dua kali, penerimaan terlewat, atau stok awal tak
 * tercatat. Memaksanya jadi nol menyembunyikan cacat pencatatan yang justru
 * perlu diperbaiki — dan membuat susutnya terlihat sempurna.
 */
export function hitungBaris(b: BarisSusut): HasilSusut {
  const rab = angka(b.rab)
  const diterima = angka(b.diterima)
  const terpakai = angka(b.terpakai)
  const sisa = angka(b.sisa)
  const rencanaF = angka(b.rencana_fraksi)

  const hilang = (diterima === null || terpakai === null || sisa === null)
    ? null
    : diterima - terpakai - sisa

  // Pembagi NOL → null, bukan 0. "Belum ada yang diterima" berbeda artinya
  // dari "nol persen susut", dan menyamakannya membuat material yang belum
  // datang terlihat sebagai material yang sempurna.
  const susutPct = (hilang === null || diterima === null || diterima <= 0)
    ? null
    : (hilang / diterima) * 100

  const rencanaPct = rencanaF === null ? null : rencanaF * 100

  const selisih = (susutPct === null || rencanaPct === null)
    ? null
    : susutPct - rencanaPct

  let nilai: HasilSusut['nilai'] = 'tak_terukur'
  if (susutPct !== null && rencanaPct !== null) {
    if (susutPct <= rencanaPct) nilai = 'wajar'
    else if (susutPct <= rencanaPct * LIPAT_JAUH_MELEBIHI) nilai = 'melebihi'
    else nilai = 'jauh_melebihi'

    // Rencana NOL adalah kasus khusus: apa pun di atasnya adalah kelipatan
    // tak berhingga, dan `rencanaPct * 2` tetap nol. Tanpa cabang ini,
    // susut 0,1% pada material berencana 0% langsung jadi "jauh melebihi".
    if (rencanaPct === 0 && susutPct > 0) {
      nilai = susutPct > 1 ? 'jauh_melebihi' : 'melebihi'
    }
  }

  return {
    material_id: b.material_id,
    nama: b.nama,
    satuan: b.satuan,
    rab, diterima, terpakai, sisa, hilang,
    susut_pct: susutPct === null ? null : Math.round(susutPct * 100) / 100,
    rencana_pct: rencanaPct === null ? null : Math.round(rencanaPct * 100) / 100,
    selisih_pct: selisih === null ? null : Math.round(selisih * 100) / 100,
    nilai,
  }
}

export interface RingkasSusut {
  total_material: number
  terukur: number
  tak_terukur: number
  wajar: number
  melebihi: number
  jauh_melebihi: number
  /** Material dengan selisih terbesar — yang dicari lebih dulu saat rapat. */
  terparah: { material_id: string; nama: string | null; selisih_pct: number } | null
}

export function ringkas(baris: HasilSusut[]): RingkasSusut {
  let wajar = 0, melebihi = 0, jauh = 0, takTerukur = 0
  let terparah: RingkasSusut['terparah'] = null

  for (const b of baris) {
    if (b.nilai === 'tak_terukur') { takTerukur++; continue }
    if (b.nilai === 'wajar') wajar++
    else if (b.nilai === 'melebihi') melebihi++
    else jauh++

    if (b.selisih_pct !== null && b.selisih_pct > 0
      && (terparah === null || b.selisih_pct > terparah.selisih_pct)) {
      terparah = { material_id: b.material_id, nama: b.nama, selisih_pct: b.selisih_pct }
    }
  }

  return {
    total_material: baris.length,
    terukur: baris.length - takTerukur,
    tak_terukur: takTerukur,
    wajar, melebihi, jauh_melebihi: jauh,
    terparah,
  }
}

/** Alasan sebuah rencana susut ditolak. `null` = sah. */
export function periksaRencana(susutPersen: number | string | null | undefined): string | null {
  // `Number('')` adalah 0 — pemeriksaan panjang lebih dulu, supaya kolom yang
  // dikosongkan tidak diam-diam menjadi "rencana susut 0%".
  if (susutPersen === undefined || susutPersen === null
    || String(susutPersen).trim() === '') {
    return 'Rencana susut wajib diisi'
  }
  const n = Number(susutPersen)
  if (!Number.isFinite(n)) return 'Rencana susut harus angka'
  if (n < 0) return 'Rencana susut tak boleh negatif'
  // 100% berarti seluruh material hilang — sah sebagai batas, tetapi apa pun
  // di atasnya berarti orang mengetik fraksi sebagai persen atau sebaliknya.
  if (n > 100) {
    return `Rencana susut ${n}% berarti kebutuhan lebih dari dua kali lipat. `
      + 'Isi sebagai persen (5 untuk 5%), bukan sebagai kelipatan'
  }
  return null
}

/** Alasan sebuah faktor konversi ditolak. `null` = sah. */
export function periksaFaktor(faktor: number | string | null | undefined): string | null {
  if (faktor === undefined || faktor === null || String(faktor).trim() === '') {
    return 'Faktor konversi wajib diisi'
  }
  const n = Number(faktor)
  if (!Number.isFinite(n)) return 'Faktor konversi harus angka'
  // NOL dilarang: ia menghapus seluruh kebutuhan, dan hasilnya "tak ada yang
  // dibutuhkan" untuk material yang sebenarnya dipakai berton-ton.
  if (n <= 0) return 'Faktor konversi harus lebih besar dari 0'
  return null
}
