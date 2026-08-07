// KEPATUHAN & K3 — masa berlaku dokumen, kinerja subkon, izin kerja. PURE.
//
// ════════════════════════════════════════════════════════════════════════════
// EMPAT HAL YANG MODUL INI TOLAK TAMPILKAN SEBAGAI KABAR BAIK
// ════════════════════════════════════════════════════════════════════════════
//
// 1. **Dokumen "terverifikasi" yang masa berlakunya sudah habis.** Kolom
//    `terverifikasi` hanya menyatakan seseorang pernah memeriksanya — bukan
//    bahwa dokumennya masih hidup hari ini. Asuransi yang diperiksa Januari
//    dan mati Maret tetap bercentang hijau, dan itu ketahuan saat ada pekerja
//    terluka.
//
// 2. **Rata-rata skor yang menelan kecelakaan kerja.** Subkon dengan skor K3
//    80 dan satu kecelakaan berat BUKAN subkon yang aman. Kecelakaan tak
//    boleh diratakan dengan empat dimensi lain — ia menggugurkan, bukan
//    mengurangi.
//
// 3. **Izin kerja "disetujui" yang jendela waktunya sudah lewat.** Izin kerja
//    bukan dokumen abadi: ia berlaku untuk satu rentang, dan pekerjaan di
//    luar rentang itu tak berizin — meski status di basis masih 'disetujui'.
//
// 4. **Nol pelanggaran yang sebenarnya nol pemeriksaan.** Subkon yang tak
//    pernah dinilai punya catatan sebersih subkon yang selalu patuh. Yang
//    pertama `null`, bukan 100.

/** Ubah NUMERIC-dari-Postgres (string) atau number jadi number. */
function angka(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

/** Selisih hari `dari` → `sampai` (positif bila `sampai` di masa depan). */
function selisihHari(dari: string, sampai: string): number {
  const a = new Date(dari.slice(0, 10) + 'T00:00:00Z').getTime()
  const b = new Date(sampai.slice(0, 10) + 'T00:00:00Z').getTime()
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.round((b - a) / 86_400_000)
}

// ── Dokumen kepatuhan ───────────────────────────────────────────────────────

export interface DokumenKepatuhan {
  id: string
  jenis: string
  nomor?: string | null
  pihak_nama?: string | null
  supplier_id?: string | null
  berlaku_dari?: string | null
  berlaku_sampai?: string | null
  terverifikasi?: boolean | null
  nilai_pertanggungan?: number | string | null
}

/** Hari sebelum kedaluwarsa saat dokumen mulai disebut "segera habis". */
export const AMBANG_SEGERA_HABIS = 60

/**
 * Nama jenis dokumen yang terbaca manusia.
 *
 * Ada DI SINI, bukan di layar, karena alasan larangan (`ASURANSI_CAR
 * kedaluwarsa`) dirakit di modul ini dan ikut terkirim ke konsumen lain —
 * notifikasi, ekspor. Kalau pemetaannya cuma di satu layar, konsumen lain
 * menampilkan nama mentah ber-garis-bawah.
 */
export const LABEL_JENIS_DOKUMEN: Record<string, string> = {
  nib: 'NIB', siujk: 'SIUJK', sbu: 'SBU', npwp: 'NPWP', pkp: 'PKP', skt: 'SKT',
  bpjs_ketenagakerjaan: 'BPJS Ketenagakerjaan', bpjs_kesehatan: 'BPJS Kesehatan',
  asuransi_car: 'Asuransi CAR', asuransi_tpl: 'Asuransi TPL', asuransi_cpm: 'Asuransi CPM',
  smk3: 'SMK3', iso_9001: 'ISO 9001', iso_45001: 'ISO 45001', lainnya: 'Lainnya',
}

/** Nama jenis yang terbaca; jatuh kembali ke kuncinya bila tak dikenal. */
export function labelJenis(jenis: string): string {
  return LABEL_JENIS_DOKUMEN[jenis] ?? jenis
}

export type StatusDokumen =
  /** Masih berlaku, jauh dari tanggal mati. */
  | 'berlaku'
  /** Berlaku, tapi habis dalam ≤ 60 hari — masih bisa diurus. */
  | 'segera_habis'
  /** Sudah lewat tanggal berlakunya. */
  | 'kedaluwarsa'
  /** Tak bermasa berlaku (mis. NPWP). */
  | 'tanpa_masa'
  /** Belum diverifikasi siapa pun. */
  | 'belum_diverifikasi'

export interface HasilDokumen extends DokumenKepatuhan {
  status: StatusDokumen
  /** Sisa hari sampai kedaluwarsa. Negatif = sudah lewat. */
  sisaHari: number | null
  /**
   * `true` bila kolom `terverifikasi` menyala TAPI dokumennya sudah mati.
   *
   * Keadaan paling merugikan: centang hijau atas dokumen yang tak berlaku.
   * `terverifikasi` hanya menyatakan seseorang pernah memeriksanya — bukan
   * bahwa dokumennya masih hidup hari ini.
   */
  hijauTapiMati: boolean
}

export interface RingkasKepatuhan {
  dokumen: HasilDokumen[]
  total: number
  kedaluwarsa: number
  segeraHabis: number
  belumDiverifikasi: number
  hijauTapiMati: number
}

export function nilaiKepatuhan(
  daftar: DokumenKepatuhan[],
  hariIni: string,
): RingkasKepatuhan {
  const hasil: HasilDokumen[] = daftar.map((d) => {
    const sisa = d.berlaku_sampai ? selisihHari(hariIni, d.berlaku_sampai) : null

    let status: StatusDokumen
    if (sisa == null) {
      // Tak bermasa berlaku — tapi kalau belum diperiksa siapa pun, itu yang
      // lebih menentukan: dokumen tak terverifikasi tak bisa diandalkan.
      status = d.terverifikasi === true ? 'tanpa_masa' : 'belum_diverifikasi'
    } else if (sisa < 0) {
      status = 'kedaluwarsa'
    } else if (d.terverifikasi !== true) {
      status = 'belum_diverifikasi'
    } else if (sisa <= AMBANG_SEGERA_HABIS) {
      status = 'segera_habis'
    } else {
      status = 'berlaku'
    }

    return {
      ...d,
      status,
      sisaHari: sisa,
      hijauTapiMati: d.terverifikasi === true && sisa != null && sisa < 0,
    }
  })

  return {
    dokumen: hasil,
    total: hasil.length,
    kedaluwarsa: hasil.filter((d) => d.status === 'kedaluwarsa').length,
    segeraHabis: hasil.filter((d) => d.status === 'segera_habis').length,
    belumDiverifikasi: hasil.filter((d) => d.status === 'belum_diverifikasi').length,
    hijauTapiMati: hasil.filter((d) => d.hijauTapiMati).length,
  }
}

// ── Evaluasi subkontraktor ──────────────────────────────────────────────────

export interface EvaluasiSubkon {
  id: string
  periode?: string | null
  pihak_nama?: string | null
  supplier_id?: string | null
  skor_mutu?: number | string | null
  skor_waktu?: number | string | null
  skor_k3?: number | string | null
  skor_kepatuhan?: number | string | null
  skor_kerjasama?: number | string | null
  jumlah_kecelakaan?: number | string | null
  jumlah_pelanggaran_k3?: number | string | null
  masuk_daftar_hitam?: boolean | null
}

/** Bobot lima dimensi. K3 dan kepatuhan sengaja berbobot besar. */
export const BOBOT_SUBKON = {
  mutu: 25, waktu: 20, k3: 25, kepatuhan: 20, kerjasama: 10,
} as const

/** Skor di bawah ini pada dimensi mana pun dianggap titik lemah. */
export const AMBANG_LEMAH_SUBKON = 60

export interface HasilEvaluasiSubkon extends EvaluasiSubkon {
  /** Skor berbobot 0-100. */
  skor: number
  /** Rata-rata polos — dibawa hanya untuk dibandingkan, bukan dipakai. */
  rataPolos: number
  /** Dimensi yang di bawah ambang. */
  titikLemah: string[]
  /**
   * `false` bila daftar hitam ATAU ada kecelakaan kerja.
   *
   * Kecelakaan MENGGUGURKAN, bukan mengurangi. Subkon dengan skor K3 80 dan
   * satu kecelakaan berat bukan subkon yang aman — dan rata-rata lima
   * dimensi akan menelan kejadian itu sepenuhnya.
   */
  bolehDipakai: boolean
  /** Alasan tak boleh dipakai, supaya layar tak perlu menyimpulkan sendiri. */
  alasanTakBolehDipakai: string[]
}

const LABEL_DIMENSI: Record<string, string> = {
  mutu: 'mutu', waktu: 'ketepatan waktu', k3: 'K3',
  kepatuhan: 'kepatuhan administratif', kerjasama: 'kerja sama',
}

export function nilaiEvaluasiSubkon(e: EvaluasiSubkon): HasilEvaluasiSubkon {
  const dim = {
    mutu: angka(e.skor_mutu) ?? 0,
    waktu: angka(e.skor_waktu) ?? 0,
    k3: angka(e.skor_k3) ?? 0,
    kepatuhan: angka(e.skor_kepatuhan) ?? 0,
    kerjasama: angka(e.skor_kerjasama) ?? 0,
  }

  const totalBobot = Object.values(BOBOT_SUBKON).reduce((a, b) => a + b, 0)
  const berbobot = (Object.keys(dim) as Array<keyof typeof dim>)
    .reduce((s, k) => s + dim[k] * BOBOT_SUBKON[k], 0) / totalBobot

  const rataPolos = Object.values(dim).reduce((a, b) => a + b, 0) / 5

  const titikLemah = (Object.keys(dim) as Array<keyof typeof dim>)
    .filter((k) => dim[k] < AMBANG_LEMAH_SUBKON)
    .map((k) => LABEL_DIMENSI[k])

  const kecelakaan = angka(e.jumlah_kecelakaan) ?? 0
  const pelanggaran = angka(e.jumlah_pelanggaran_k3) ?? 0

  const alasan: string[] = []
  if (e.masuk_daftar_hitam === true) alasan.push('masuk daftar hitam')
  if (kecelakaan > 0) {
    alasan.push(`${kecelakaan} kecelakaan kerja`)
  }
  // Pelanggaran K3 berulang tanpa kecelakaan tetap menggugurkan: yang belum
  // terjadi bukan berarti tak akan terjadi.
  if (pelanggaran >= 3) alasan.push(`${pelanggaran} pelanggaran K3`)

  return {
    ...e,
    skor: Math.round(berbobot * 10) / 10,
    rataPolos: Math.round(rataPolos * 10) / 10,
    titikLemah,
    bolehDipakai: alasan.length === 0,
    alasanTakBolehDipakai: alasan,
  }
}

// ── Izin kerja ──────────────────────────────────────────────────────────────

export interface IzinKerja {
  id: string
  nomor: string
  jenis: string
  status: string
  berlaku_dari: string
  berlaku_sampai: string
  pengendalian_risiko?: string | null
  diajukan_oleh?: string | null
  diputuskan_oleh?: string | null
}

export type StatusIzin =
  /** Disetujui dan jendela waktunya sedang berjalan. */
  | 'aktif'
  /** Disetujui, tapi jendelanya belum mulai. */
  | 'belum_mulai'
  /** Disetujui, tapi jendelanya SUDAH LEWAT. */
  | 'kedaluwarsa'
  /** Menunggu keputusan. */
  | 'menunggu'
  /** Ditolak / ditutup / masih draft. */
  | 'tak_berlaku'

export interface HasilIzin extends IzinKerja {
  statusNyata: StatusIzin
  /** Jam tersisa sampai jendela berakhir. Negatif = sudah lewat. */
  sisaJam: number | null
  /**
   * `true` bila status di basis 'disetujui' TAPI jendelanya sudah lewat.
   *
   * Pekerjaan yang berjalan atas izin ini TIDAK BERIZIN — dan yang membacanya
   * dari kolom `status` saja akan mengira sebaliknya.
   */
  disetujuiTapiLewat: boolean
}

export function nilaiIzinKerja(
  daftar: IzinKerja[],
  sekarangIso: string,
): { izin: HasilIzin[]; aktif: number; menunggu: number; disetujuiTapiLewat: number } {
  const now = new Date(sekarangIso).getTime()

  const hasil: HasilIzin[] = daftar.map((z) => {
    const mulai = new Date(z.berlaku_dari).getTime()
    const akhir = new Date(z.berlaku_sampai).getTime()
    const sisaJam = Number.isNaN(akhir) ? null : Math.round((akhir - now) / 3_600_000)

    let statusNyata: StatusIzin
    if (z.status === 'diajukan') statusNyata = 'menunggu'
    else if (z.status !== 'disetujui') statusNyata = 'tak_berlaku'
    else if (!Number.isNaN(mulai) && now < mulai) statusNyata = 'belum_mulai'
    else if (!Number.isNaN(akhir) && now > akhir) statusNyata = 'kedaluwarsa'
    else statusNyata = 'aktif'

    return {
      ...z,
      statusNyata,
      sisaJam,
      disetujuiTapiLewat: z.status === 'disetujui' && !Number.isNaN(akhir) && now > akhir,
    }
  })

  return {
    izin: hasil,
    aktif: hasil.filter((z) => z.statusNyata === 'aktif').length,
    menunggu: hasil.filter((z) => z.statusNyata === 'menunggu').length,
    disetujuiTapiLewat: hasil.filter((z) => z.disetujuiTapiLewat).length,
  }
}

// ── Kesiapan pihak: gabungan ketiganya ──────────────────────────────────────

export interface KesiapanPihak {
  nama: string
  supplier_id: string | null
  /** Dokumen kepatuhan yang mati atau hampir mati. */
  dokumenKedaluwarsa: number
  dokumenSegeraHabis: number
  /** Skor evaluasi terbaru. `null` bila belum pernah dinilai. */
  skorTerakhir: number | null
  /**
   * `false` bila ada dokumen mati ATAU evaluasi melarangnya.
   *
   * Menggabungkan keduanya DI SINI, bukan di layar: subkon berkinerja bagus
   * dengan asuransi mati tetap terlihat hijau di layar yang hanya membaca
   * kinerjanya, dan itulah cacat yang modul ini ada untuk menutupnya.
   */
  bolehBekerja: boolean
  alasan: string[]
}

/** Gabungkan kepatuhan dokumen + evaluasi jadi satu jawaban per pihak. */
export function nilaiKesiapanPihak(
  dokumen: HasilDokumen[],
  evaluasi: HasilEvaluasiSubkon[],
): KesiapanPihak[] {
  const peta = new Map<string, KesiapanPihak>()

  const kunci = (supplier_id?: string | null, nama?: string | null) =>
    supplier_id ?? `nama:${nama ?? '—'}`

  const ambil = (supplier_id: string | null, nama: string): KesiapanPihak => {
    const k = kunci(supplier_id, nama)
    let p = peta.get(k)
    if (!p) {
      p = {
        nama, supplier_id,
        dokumenKedaluwarsa: 0, dokumenSegeraHabis: 0,
        skorTerakhir: null, bolehBekerja: true, alasan: [],
      }
      peta.set(k, p)
    }
    return p
  }

  for (const d of dokumen) {
    const p = ambil(d.supplier_id ?? null, d.pihak_nama ?? '—')
    if (d.status === 'kedaluwarsa') {
      p.dokumenKedaluwarsa++
      p.bolehBekerja = false
      p.alasan.push(`${labelJenis(d.jenis)} kedaluwarsa`)
    } else if (d.status === 'segera_habis') {
      p.dokumenSegeraHabis++
    }
  }

  for (const e of evaluasi) {
    const p = ambil(e.supplier_id ?? null, e.pihak_nama ?? '—')
    // Evaluasi TERBARU yang menentukan — bukan rata-rata sepanjang masa.
    // Subkon yang membaik tak boleh dihukum selamanya oleh catatan lama.
    if (p.skorTerakhir == null) p.skorTerakhir = e.skor
    if (!e.bolehDipakai) {
      p.bolehBekerja = false
      p.alasan.push(...e.alasanTakBolehDipakai)
    }
  }

  // Yang TIDAK boleh bekerja naik ke atas; di antara mereka, SKOR TERTINGGI
  // lebih dulu.
  //
  // Alasannya bukan estetika: pihak berskor 89 yang terhalang satu dokumen
  // kedaluwarsa adalah yang paling mudah dipulihkan — perbarui polisnya, ia
  // bisa bekerja besok. Pihak berskor 44 yang masuk daftar hitam tak akan
  // pulih dengan mengurus berkas. Menaruh keduanya berurutan acak membuat
  // yang bisa diperbaiki hari ini tenggelam.
  return [...peta.values()].sort((a, b) => {
    if (a.bolehBekerja !== b.bolehBekerja) return a.bolehBekerja ? 1 : -1
    const sa = a.skorTerakhir ?? -1
    const sb = b.skorTerakhir ?? -1
    if (sa !== sb) return sb - sa
    return a.nama < b.nama ? -1 : 1
  })
}
