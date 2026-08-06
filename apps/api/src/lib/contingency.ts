// F5 PEMBEDA — Manajemen contingency: cadangan risiko yang TERLACAK.
//
// ── Kenapa modul ini ada
//
// Diukur 2026-08-07: NOL kolom contingency di seluruh basis. Cadangan risiko
// adalah bagian nilai kontrak yang SENGAJA disisihkan untuk hal tak terduga.
// Tanpa dilacak, ia tak hilang — ia terpakai diam-diam, dan baru ketahuan
// habis saat dibutuhkan.
//
// Buktinya sudah ada: CO-001 disetujui Rp 50.000.000 pada proyek berkontrak
// Rp 570.000.000, tanpa satu pun catatan tentang cadangan mana yang berkurang.
//
// ── Kenapa sisa DIHITUNG, bukan disimpan
//
// Kolom sisa yang disimpan bisa basi diam-diam saat satu penggunaan disunting
// atau dihapus. Angka "cadangan masih aman" yang basi lebih berbahaya
// daripada tak ada angka sama sekali: ia dipakai untuk menyetujui pengeluaran
// berikutnya.
//
// ── Kenapa TERPAKAI BOLEH melebihi cadangan
//
// Secara fisik itu mungkin: uangnya sudah keluar sebelum ada yang memeriksa.
// Menolaknya di lapis perhitungan akan menyembunyikan kejadian yang justru
// paling perlu dilihat. Yang dilakukan modul ini adalah MENANDAINYA
// (`terlampaui`), bukan berpura-pura tak terjadi.

/** Konversi aman: NUMERIC Postgres tiba sebagai string; null/NaN → 0. */
function angka(v: number | string | null | undefined): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export interface BarisPos {
  id: string
  project_id: string
  project_name?: string
  nama: string
  nilai: number | string
  persen_kontrak?: number | string | null
  dasar?: string | null
  status?: string | null
  /** Nilai kontrak proyek — untuk menghitung porsi cadangan terhadap kontrak. */
  contract_value?: number | string | null
}

export interface BarisPenggunaan {
  id: string
  pos_id: string
  nilai: number | string
  tanggal: string
  alasan: string
  sumber_change_order_id?: string | null
  co_number?: string | null
}

export type StatusPos =
  /** Terpakai di bawah ambang aman. */
  | 'aman'
  /** Terpakai melewati ambang perhatian, belum habis. */
  | 'menipis'
  /** Terpakai habis atau nyaris habis. */
  | 'kritis'
  /** Terpakai MELEBIHI cadangan — sudah defisit. */
  | 'terlampaui'
  /** Pos ditutup secara administratif. */
  | 'ditutup'

export interface PosTerhitung {
  id: string
  project_id: string
  project_name: string
  nama: string
  nilai: number
  terpakai: number
  /** `nilai − terpakai`. NEGATIF bila terlampaui — tidak di-floor ke 0. */
  sisa: number
  /** `terpakai / nilai × 100`. Bisa melebihi 100. */
  terpakai_pct: number
  /**
   * Porsi cadangan terhadap nilai kontrak, dalam persen.
   *
   * null bila nilai kontraknya tak diketahui — berbeda dari 0, yang berarti
   * "cadangannya memang nol persen".
   */
  porsi_kontrak_pct: number | null
  status: StatusPos
  jumlah_penarikan: number
  /** Penarikan terakhir, untuk melihat apakah cadangannya sedang aktif dipakai. */
  penarikan_terakhir: string | null
}

export interface HasilContingency {
  pos: PosTerhitung[]
  total_cadangan: number
  total_terpakai: number
  /** `total_cadangan − total_terpakai`. Bisa negatif. */
  total_sisa: number
  jumlah_aman: number
  jumlah_menipis: number
  jumlah_kritis: number
  jumlah_terlampaui: number
  /**
   * Proyek yang TIDAK punya pos cadangan sama sekali.
   *
   * Dinyatakan supaya "nol pos kritis" tak terbaca sebagai "semuanya aman" —
   * bisa jadi memang tak ada cadangannya.
   */
  proyek_tanpa_pos: Array<{ project_id: string; project_name: string }>
}

/** Ambang "menipis": terpakai melebihi ini dianggap perlu perhatian. */
export const AMBANG_MENIPIS_PCT = 60
/** Ambang "kritis": terpakai melebihi ini dianggap nyaris habis. */
export const AMBANG_KRITIS_PCT = 90

/**
 * Hitung sisa cadangan tiap pos beserta statusnya.
 *
 * INVARIANT yang diuji:
 *  - sisa NEGATIF dipertahankan, tidak di-floor ke 0
 *  - terpakai melebihi cadangan ditandai `terlampaui`, bukan `kritis`
 *  - string NUMERIC dijumlahkan sebagai angka, bukan digabung sebagai teks
 *  - pos tanpa penarikan = `aman` dengan sisa penuh
 *  - pos `ditutup` tak ikut dihitung dalam pencacah risiko
 *  - proyek tanpa pos dinyatakan, tidak menghilang
 */
export function hitungContingency(
  pos: BarisPos[],
  penggunaan: BarisPenggunaan[],
  proyek: Array<{ project_id: string; project_name?: string }> = [],
  opsi?: { ambangMenipisPct?: number; ambangKritisPct?: number },
): HasilContingency {
  const ambangMenipis = opsi?.ambangMenipisPct ?? AMBANG_MENIPIS_PCT
  const ambangKritis = opsi?.ambangKritisPct ?? AMBANG_KRITIS_PCT

  // Penarikan dikumpulkan per pos lebih dulu. Menjumlahkannya di dalam
  // perulangan pos akan menghasilkan O(pos × penggunaan) — dan pada proyek
  // dengan ratusan penarikan itu terasa.
  const perPos = new Map<string, { total: number; jumlah: number; terakhir: string | null }>()
  for (const g of penggunaan) {
    let e = perPos.get(g.pos_id)
    if (!e) { e = { total: 0, jumlah: 0, terakhir: null }; perPos.set(g.pos_id, e) }
    e.total += angka(g.nilai)
    e.jumlah += 1
    const tgl = g.tanggal?.slice(0, 10) ?? null
    if (tgl && (!e.terakhir || tgl > e.terakhir)) e.terakhir = tgl
  }

  const hasil: PosTerhitung[] = pos.map((p) => {
    const nilai = angka(p.nilai)
    const g = perPos.get(p.id)
    const terpakai = g?.total ?? 0

    // TIDAK di-floor ke 0. Sisa negatif berarti cadangan sudah defisit, dan
    // itu justru yang paling perlu terlihat — meratakannya ke nol
    // menyembunyikan kejadian yang paling mahal.
    const sisa = nilai - terpakai

    // Pembagi nol dijaga: cadangan bernilai 0 tak lolos CHECK di basis, tapi
    // fungsi murni ini bisa dipanggil dengan data apa pun.
    const terpakaiPct = nilai > 0 ? (terpakai / nilai) * 100 : 0

    let status: StatusPos
    if (p.status === 'ditutup') {
      status = 'ditutup'
    } else if (sisa < 0) {
      // Diperiksa SEBELUM ambang kritis: terpakai 120% adalah defisit, bukan
      // sekadar "nyaris habis". Menyamakannya membuat yang sudah lewat batas
      // tampak sama gawatnya dengan yang belum.
      status = 'terlampaui'
    } else if (terpakaiPct >= ambangKritis) {
      status = 'kritis'
    } else if (terpakaiPct >= ambangMenipis) {
      status = 'menipis'
    } else {
      status = 'aman'
    }

    const kontrak = angka(p.contract_value)

    return {
      id: p.id,
      project_id: p.project_id,
      project_name: p.project_name ?? '—',
      nama: p.nama,
      nilai,
      terpakai,
      sisa,
      terpakai_pct: terpakaiPct,
      // null bila kontraknya tak diketahui — berbeda dari 0, yang berarti
      // "cadangannya memang nol persen dari kontrak".
      porsi_kontrak_pct: kontrak > 0 ? (nilai / kontrak) * 100 : null,
      status,
      jumlah_penarikan: g?.jumlah ?? 0,
      penarikan_terakhir: g?.terakhir ?? null,
    }
  })

  // Yang paling gawat lebih dulu. Pos yang sudah defisit adalah masalah yang
  // sedang berjalan, bukan catatan.
  const urutan: Record<StatusPos, number> = {
    terlampaui: 0, kritis: 1, menipis: 2, aman: 3, ditutup: 4,
  }
  hasil.sort((a, b) =>
    urutan[a.status] - urutan[b.status] ||
    b.terpakai_pct - a.terpakai_pct ||
    a.nama.localeCompare(b.nama, 'id'))

  const punyaPos = new Set(pos.map((p) => p.project_id))

  // Pos `ditutup` tak ikut total: cadangan yang sudah ditutup bukan bantalan
  // yang tersedia, dan menjumlahkannya membuat perusahaan tampak punya
  // cadangan yang sebenarnya tak bisa dipakai.
  const aktif = hasil.filter((p) => p.status !== 'ditutup')

  return {
    pos: hasil,
    total_cadangan: aktif.reduce((s, p) => s + p.nilai, 0),
    total_terpakai: aktif.reduce((s, p) => s + p.terpakai, 0),
    total_sisa: aktif.reduce((s, p) => s + p.sisa, 0),
    jumlah_aman: hasil.filter((p) => p.status === 'aman').length,
    jumlah_menipis: hasil.filter((p) => p.status === 'menipis').length,
    jumlah_kritis: hasil.filter((p) => p.status === 'kritis').length,
    jumlah_terlampaui: hasil.filter((p) => p.status === 'terlampaui').length,
    proyek_tanpa_pos: proyek
      .filter((p) => !punyaPos.has(p.project_id))
      .map((p) => ({ project_id: p.project_id, project_name: p.project_name ?? '—' })),
  }
}
