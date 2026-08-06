// F5 PEMBEDA — Analisa keterlambatan: menghubungkan telat ke waktu dan uang.
//
// ── Kenapa modul ini ada
//
// Ketiga bahannya SUDAH ADA di basis dan tak pernah diadu satu sama lain:
//
//   milestones.target_date / completed_at   kapan seharusnya vs kapan nyata
//   contract_eot.days_approved              perpanjangan waktu yang DISETUJUI
//   projects.penalty_*                      tarif denda per hari + grace + cap
//
// Diukur 2026-08-06: **16 milestone telat** (4 selesai-terlambat, 12 masih
// berjalan), terparah **67 hari**. Tak satu pun layar menghubungkannya ke EOT
// atau ke rupiah.
//
// ── Kenapa EOT WAJIB ikut dihitung
//
// Keterlambatan yang sudah dimaafkan lewat EOT BUKAN keterlambatan. Melaporkan
// "telat 67 hari" pada proyek yang EOT-nya disetujui 60 hari adalah menuduh
// atas keterlambatan yang secara kontrak tak pernah terjadi — dan itu tuduhan
// yang bisa dibantah dengan satu lembar surat.
//
// ── Kenapa "estimasi", bukan "denda"
//
// Angka rupiah di sini adalah PAPARAN (exposure) — perkiraan berdasarkan tarif
// kontrak, bukan tagihan. Denda yang sah butuh berita acara, dan sering
// dinegosiasikan. Menyebutnya "denda" membuat angka perkiraan terbaca sebagai
// kewajiban yang sudah pasti.

/** Konversi aman: NUMERIC Postgres tiba sebagai string; null/NaN → 0. */
function angka(v: number | string | null | undefined): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Tanggal kalender → nomor hari. Sama dengan `lib/penalty.ts` supaya konsisten. */
function nomorHari(tanggal: string): number {
  return Math.floor(Date.parse(`${tanggal.slice(0, 10)}T00:00:00Z`) / 86_400_000)
}

export interface BarisMilestone {
  id: string
  project_id: string
  title: string
  /** Tenggat. WAJIB — `milestones.target_date` NOT NULL. */
  target_date: string
  /** Tanggal selesai. null = masih berjalan. */
  completed_at?: string | null
  status?: string | null
}

export interface ParamProyek {
  project_id: string
  project_name?: string
  /** Hari perpanjangan yang SUDAH DISETUJUI (jumlah seluruh EOT `disetujui`). */
  eot_hari_disetujui?: number | string | null
  penalty_enabled?: boolean | null
  penalty_rate_per_day?: number | string | null
  penalty_grace_days?: number | string | null
  penalty_cap_pct?: number | string | null
  contract_value?: number | string | null
}

export type StatusTelat =
  /** Selesai sebelum atau tepat tenggat. */
  | 'tepat_waktu'
  /** Belum selesai, tenggat belum lewat. */
  | 'belum_jatuh_tempo'
  /** Sudah selesai, tapi melewati tenggat. Angkanya FINAL. */
  | 'selesai_terlambat'
  /** Belum selesai dan tenggat sudah lewat. Angkanya MASIH BERTAMBAH. */
  | 'berjalan_terlambat'
  /** Telat, tapi seluruhnya tertutup EOT yang disetujui. */
  | 'dimaafkan_eot'

export interface BarisAnalisa {
  milestone_id: string
  project_id: string
  project_name: string
  title: string
  target_date: string
  completed_at: string | null
  /** Hari telat KOTOR, sebelum EOT dan grace. */
  telat_kotor: number
  /** Hari EOT yang disetujui untuk proyek ini. */
  eot_hari: number
  /**
   * Hari telat EFEKTIF: kotor − EOT − grace, di-floor ke 0.
   *
   * Inilah angka yang boleh dipakai menuduh. Yang sudah dimaafkan EOT bukan
   * keterlambatan.
   */
  telat_efektif: number
  status: StatusTelat
  /**
   * Perkiraan paparan rupiah. null bila denda tak aktif atau tarifnya kosong.
   *
   * BUKAN tagihan: denda yang sah butuh berita acara dan sering
   * dinegosiasikan.
   */
  estimasi_paparan: number | null
  /** `true` bila paparannya sudah menyentuh batas atas (cap) kontrak. */
  kena_cap: boolean
  /** Angkanya masih bertambah tiap hari (belum selesai). */
  masih_bertambah: boolean
}

export interface HasilAnalisa {
  baris: BarisAnalisa[]
  jumlah_selesai_terlambat: number
  jumlah_berjalan_terlambat: number
  jumlah_dimaafkan_eot: number
  jumlah_tepat_waktu: number
  jumlah_belum_jatuh_tempo: number
  /** Telat efektif terparah, dalam hari. */
  telat_terparah: number
  /** Jumlah seluruh estimasi paparan yang bisa dihitung. */
  total_estimasi_paparan: number
  /**
   * Berapa proyek yang punya milestone telat TAPI dendanya tak aktif.
   *
   * Dinyatakan supaya "total paparan Rp0" tak terbaca sebagai "tak ada
   * risiko" — bisa jadi tarifnya memang belum diisi.
   */
  jumlah_proyek_denda_mati: number
}

/**
 * Hitung keterlambatan milestone, EOT, dan perkiraan paparannya.
 *
 * `hariIni` diserahkan pemanggil (bukan `new Date()` di dalam) supaya
 * fungsinya MURNI dan bisa diuji: keterlambatan "berjalan" tumbuh tiap hari,
 * dan test yang memakai jam sistem akan berubah hasilnya besok.
 *
 * INVARIANT yang diuji:
 *  - EOT yang disetujui MENGURANGI telat; yang diajukan/ditolak tidak
 *  - telat efektif tak pernah negatif
 *  - selesai tepat tenggat = tepat waktu, bukan telat 0 hari
 *  - denda mati → paparan null, BUKAN 0
 *  - cap membatasi paparan, dan dinyatakan lewat `kena_cap`
 */
export function analisaKeterlambatan(
  milestone: BarisMilestone[],
  proyek: ParamProyek[],
  hariIni: string,
): HasilAnalisa {
  const petaProyek = new Map(proyek.map((p) => [p.project_id, p]))
  const hariIniNo = nomorHari(hariIni)

  const baris: BarisAnalisa[] = milestone.map((m) => {
    const p = petaProyek.get(m.project_id)
    const targetNo = nomorHari(m.target_date)
    const selesai = m.completed_at ? m.completed_at.slice(0, 10) : null

    // Titik ukur: tanggal selesai bila sudah selesai (angkanya FINAL), atau
    // hari ini bila masih berjalan (angkanya MASIH BERTAMBAH).
    const ukurNo = selesai ? nomorHari(selesai) : hariIniNo
    const telatKotor = Math.max(0, ukurNo - targetNo)

    const eotHari = Math.max(0, Math.trunc(angka(p?.eot_hari_disetujui)))
    const grace = Math.max(0, Math.trunc(angka(p?.penalty_grace_days)))

    // EOT dan grace sama-sama mengurangi. EOT lebih dulu secara makna:
    // ia mengubah TENGGATNYA, sedangkan grace hanya menunda dendanya.
    const telatEfektif = Math.max(0, telatKotor - eotHari - grace)

    let status: StatusTelat
    if (telatKotor === 0) {
      status = selesai ? 'tepat_waktu' : 'belum_jatuh_tempo'
    } else if (telatEfektif === 0) {
      // Telat kotornya ada, tapi habis dimaafkan EOT/grace.
      status = 'dimaafkan_eot'
    } else {
      status = selesai ? 'selesai_terlambat' : 'berjalan_terlambat'
    }

    // ── Estimasi paparan ──────────────────────────────────────────────────
    //
    // null (bukan 0) bila dendanya tak aktif atau tarifnya kosong. Nol akan
    // terbaca "tak ada risiko"; null menyatakan "tak bisa dihitung".
    const tarif = angka(p?.penalty_rate_per_day)
    const dendaAktif = p?.penalty_enabled === true && tarif > 0

    let paparan: number | null = null
    let kenaCap = false
    if (dendaAktif && telatEfektif > 0) {
      paparan = tarif * telatEfektif
      const capPct = angka(p?.penalty_cap_pct)
      const nilaiKontrak = angka(p?.contract_value)
      if (capPct > 0 && nilaiKontrak > 0) {
        const batas = (nilaiKontrak * capPct) / 100
        if (paparan > batas) { paparan = batas; kenaCap = true }
      }
    } else if (dendaAktif) {
      // Denda aktif tapi tak ada telat efektif → paparannya memang nol,
      // dan itu berbeda dari "tak bisa dihitung".
      paparan = 0
    }

    return {
      milestone_id: m.id,
      project_id: m.project_id,
      project_name: p?.project_name ?? '—',
      title: m.title,
      target_date: m.target_date.slice(0, 10),
      completed_at: selesai,
      telat_kotor: telatKotor,
      eot_hari: eotHari,
      telat_efektif: telatEfektif,
      status,
      estimasi_paparan: paparan,
      kena_cap: kenaCap,
      masih_bertambah: !selesai && telatEfektif > 0,
    }
  })

  // Yang MASIH BERTAMBAH lebih dulu — di situ tindakan masih bisa mengubah
  // hasilnya. Yang sudah selesai-terlambat tak bisa diperbaiki lagi, hanya
  // dinegosiasikan.
  const urutan: Record<StatusTelat, number> = {
    berjalan_terlambat: 0, selesai_terlambat: 1, dimaafkan_eot: 2,
    belum_jatuh_tempo: 3, tepat_waktu: 4,
  }
  baris.sort((a, b) =>
    urutan[a.status] - urutan[b.status] ||
    b.telat_efektif - a.telat_efektif ||
    a.title.localeCompare(b.title, 'id'))

  // Proyek yang punya telat efektif TAPI dendanya tak aktif — supaya
  // "paparan Rp0" tak terbaca sebagai "tak ada risiko".
  const proyekTelat = new Set(
    baris.filter((b) => b.telat_efektif > 0).map((b) => b.project_id))
  const proyekDendaMati = [...proyekTelat].filter((id) => {
    const p = petaProyek.get(id)
    return !(p?.penalty_enabled === true && angka(p?.penalty_rate_per_day) > 0)
  })

  return {
    baris,
    jumlah_selesai_terlambat: baris.filter((b) => b.status === 'selesai_terlambat').length,
    jumlah_berjalan_terlambat: baris.filter((b) => b.status === 'berjalan_terlambat').length,
    jumlah_dimaafkan_eot: baris.filter((b) => b.status === 'dimaafkan_eot').length,
    jumlah_tepat_waktu: baris.filter((b) => b.status === 'tepat_waktu').length,
    jumlah_belum_jatuh_tempo: baris.filter((b) => b.status === 'belum_jatuh_tempo').length,
    telat_terparah: baris.reduce((s, b) => Math.max(s, b.telat_efektif), 0),
    total_estimasi_paparan: baris.reduce((s, b) => s + (b.estimasi_paparan ?? 0), 0),
    jumlah_proyek_denda_mati: proyekDendaMati.length,
  }
}
