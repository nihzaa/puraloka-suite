/**
 * SERAH TERIMA PHO/FHO (E2) — dan gerbang yang membuat retensi berarti.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * LUBANG YANG DITUTUP
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `validasiPencairanRetensi` memeriksa SATU hal: saldo.
 *
 *     ditahan − sudahDicairkan >= diminta   →   cair
 *
 * Nol pemeriksaan mutu. Diukur 2026-08-12: 7 proyek punya punch item, dan 36
 * dari 40 temuan MASIH TERBUKA — satu proyek dengan 19 dari 19 belum selesai.
 * Uang jaminan mutu bisa cair penuh sementara sembilan belas cacat menunggu.
 *
 * `lib/retensi-subkontrak.ts` menulis sendiri di headernya: *"kalau ada cacat
 * yang harus diperbaiki mandor, tak ada uang tertahan untuk memaksanya kembali
 * — itu justru seluruh gunanya retensi."* Mekanisme MENAHANnya dibangun;
 * syarat MELEPASnya tidak.
 *
 * ── Dua peristiwa, bukan satu tanggal "selesai"
 *
 *   PHO  pekerjaan selesai, masa pemeliharaan MULAI → sebagian retensi cair
 *   FHO  masa pemeliharaan berakhir tanpa cacat     → sisa retensi cair
 *
 * Menyatukannya menghapus rentang yang justru diperdebatkan: siapa menanggung
 * kebocoran atap dua bulan sesudah proyek dinyatakan selesai.
 */

export type JenisSerahTerima = 'pho' | 'fho'
export type StatusSerahTerima = 'draf' | 'ditandatangani' | 'dibatalkan'

/**
 * Porsi retensi yang boleh cair di tiap tahap.
 *
 * ── Kenapa 50/50, dan kenapa BUKAN dari UI
 *
 * Praktik kontrak konstruksi Indonesia yang paling lazim: setengah retensi
 * cair saat PHO, sisanya saat FHO. Ini DEFAULT, bukan aturan yang tak bisa
 * diubah — tenant yang menyepakati 30/70 mengaturnya di kontraknya.
 *
 * Yang TIDAK boleh: PHO mencairkan 100%. Itu menghapus jaminan justru pada
 * rentang waktu yang jaminannya paling dibutuhkan — masa pemeliharaan.
 *
 * Angkanya di sini, bukan di basis, karena ia bagian dari RUMUS finansial
 * (ember [C] CLAUDE.md §5.3): struktur rumusnya tak boleh bisa diubah dari UI.
 * Persennya boleh; strukturnya "PHO sebagian, FHO sisanya" tidak.
 */
export const PORSI_CAIR_PHO_DEFAULT = 0.5

export interface BeritaAcara {
  jenis: JenisSerahTerima
  status: StatusSerahTerima
  tanggal: string
  masaPemeliharaanHari?: number | null
}

export type HasilGerbangRetensi =
  | { boleh: true; porsiMaks: number; sebab: string }
  | { boleh: false; porsiMaks: 0; sebab: string }

/**
 * Berapa BAGIAN retensi yang boleh cair, menurut berita acara yang ada.
 *
 * Mengembalikan PORSI (0–1), bukan rupiah: pemanggil yang tahu nominal
 * tertahannya, dan mengembalikan rupiah dari fungsi yang tak membaca basis
 * berarti dua tempat menghitung angka yang sama.
 *
 * ── Fail-closed
 *
 * Tanpa berita acara apa pun → NOL. Bukan "seluruhnya" dan bukan "sebagian":
 * retensi yang cair karena tak ada catatan terlihat persis sama dengan retensi
 * yang cair karena disepakati, dan yang pertama adalah kebocoran uang.
 */
export function porsiRetensiBolehCair(
  daftar: readonly BeritaAcara[],
  porsiPho: number = PORSI_CAIR_PHO_DEFAULT,
): HasilGerbangRetensi {
  // Hanya yang DITANDATANGANI berlaku. Draf adalah niat, bukan kesepakatan —
  // dan berita acara yang dibatalkan tak pernah terjadi.
  const sah = daftar.filter((b) => b.status === 'ditandatangani')

  const adaFho = sah.some((b) => b.jenis === 'fho')
  const adaPho = sah.some((b) => b.jenis === 'pho')

  if (adaFho) {
    return {
      boleh: true,
      porsiMaks: 1,
      sebab: 'FHO ditandatangani — masa pemeliharaan berakhir, seluruh retensi boleh cair.',
    }
  }

  if (adaPho) {
    // Porsi di luar 0–1 ditolak dengan mengembalikan ke default, BUKAN
    // di-clamp diam-diam: nilai 1.5 yang jadi 1 berarti PHO mencairkan
    // seluruh retensi tanpa seorang pun menyadari aturannya dilanggar.
    const p = Number.isFinite(porsiPho) && porsiPho > 0 && porsiPho < 1
      ? porsiPho
      : PORSI_CAIR_PHO_DEFAULT
    return {
      boleh: true,
      porsiMaks: p,
      sebab: `PHO ditandatangani — ${Math.round(p * 100)}% retensi boleh cair. `
        + 'Sisanya menunggu FHO, saat masa pemeliharaan berakhir.',
    }
  }

  return {
    boleh: false,
    porsiMaks: 0,
    sebab: 'Belum ada berita acara serah terima yang ditandatangani. Retensi adalah '
      + 'jaminan atas pekerjaan yang belum diserahkan — melepasnya sekarang menghapus '
      + 'satu-satunya alat yang memaksa perbaikan cacat.',
  }
}

export interface MasukanPeriksaPencairan {
  /** Σ retensi yang pernah ditahan. */
  ditahan: number
  /** Σ yang sudah dicairkan sebelumnya. */
  sudahDicairkan: number
  /** Yang diminta sekarang. */
  diminta: number
  daftar: readonly BeritaAcara[]
  porsiPho?: number
}

export type VerdictPencairan =
  | { ok: true; plafon: number; tersedia: number; sebab: string }
  | { ok: false; plafon: number; tersedia: number; galat: string }

/**
 * Gerbang mutu di atas gerbang saldo.
 *
 * `validasiPencairanRetensi` (retensi-subkontrak.ts) tetap dipanggil terpisah
 * oleh rutenya — ia menjaga aritmetikanya. Yang di sini menjaga SYARATnya, dan
 * keduanya harus lulus.
 *
 * Dipisah begitu bukan karena rapi: saldo dan mutu gagal karena sebab berbeda
 * dan menuntut tindakan berbeda. "Melebihi sisa" diperbaiki dengan mengubah
 * angka; "belum ada PHO" diperbaiki dengan menyelesaikan pekerjaan.
 */
export function periksaPencairanRetensi(m: MasukanPeriksaPencairan): VerdictPencairan {
  const gerbang = porsiRetensiBolehCair(m.daftar, m.porsiPho)
  const plafon = bulat2(m.ditahan * gerbang.porsiMaks)
  const tersedia = bulat2(plafon - m.sudahDicairkan)

  if (!gerbang.boleh) {
    return { ok: false, plafon: 0, tersedia: 0, galat: gerbang.sebab }
  }

  // `Number('')` bernilai 0, bukan NaN — angka yang tak sah ditolak, tak
  // diperlakukan sebagai nol. Nol yang lolos di sini berarti pencairan
  // kosong yang tercatat sebagai peristiwa.
  if (!Number.isFinite(m.diminta) || m.diminta <= 0) {
    return { ok: false, plafon, tersedia, galat: 'Jumlah pencairan harus lebih dari 0' }
  }

  if (m.diminta > tersedia + 0.01) {
    const habis = tersedia <= 0.01
    return {
      ok: false, plafon, tersedia,
      galat: habis
        ? `Plafon tahap ini sudah cair seluruhnya (${plafon}). ${sisaSebab(gerbang)}`
        : `Pencairan ${m.diminta} melebihi plafon tahap ini. `
          + `Boleh cair ${plafon} dari ${m.ditahan} tertahan; `
          + `sudah cair ${m.sudahDicairkan}, tersisa ${tersedia}. ${sisaSebab(gerbang)}`,
    }
  }

  return { ok: true, plafon, tersedia, sebab: gerbang.sebab }
}

/** Kalimat yang menjelaskan apa yang membuka sisanya — bukan sekadar angka. */
function sisaSebab(g: HasilGerbangRetensi): string {
  return g.porsiMaks < 1
    ? 'Sisanya terbuka setelah FHO ditandatangani.'
    : ''
}

export type HasilTransisiSerahTerima =
  | { boleh: true }
  | { boleh: false; sebab: string }

/**
 * Bolehkah berita acara berpindah status?
 *
 * Alurnya lebih pendek daripada SPK: `draf` → `ditandatangani`, dan
 * `dibatalkan` dari mana pun kecuali yang sudah dibatalkan. Tak ada
 * "diterbitkan" — berita acara serah terima tak punya tahap diumumkan-tapi-
 * belum-disepakati. Ia ditandatangani di lokasi, atau ia masih draf.
 */
export function periksaTransisiSerahTerima(m: {
  statusSekarang: StatusSerahTerima
  statusTujuan: StatusSerahTerima
  adaTtdPenyerah: boolean
  adaTtdPenerima: boolean
  alasanBatal?: string | null
}): HasilTransisiSerahTerima {
  const { statusSekarang: dari, statusTujuan: ke } = m

  if (dari === 'dibatalkan') {
    return { boleh: false, sebab: 'Berita acara ini sudah dibatalkan dan tak bisa diubah lagi.' }
  }
  if (dari === ke) {
    return { boleh: false, sebab: `Berita acara sudah berstatus ${ke}.` }
  }

  if (ke === 'dibatalkan') {
    if (!m.alasanBatal?.trim()) {
      return {
        boleh: false,
        sebab: 'Pembatalan wajib beralasan — dua pihak berhak tahu kenapa serah '
          + 'terima yang sudah dicatat ditarik kembali.',
      }
    }
    return { boleh: true }
  }

  if (ke === 'ditandatangani') {
    if (!m.adaTtdPenyerah || !m.adaTtdPenerima) {
      const kurang = !m.adaTtdPenyerah && !m.adaTtdPenerima
        ? 'kedua tanda tangan'
        : !m.adaTtdPenyerah ? 'tanda tangan penyerah' : 'tanda tangan penerima'
      return {
        boleh: false,
        sebab: `Belum ada ${kurang}. Serah terima bertanda tangan satu pihak adalah `
          + 'pengumuman bahwa pekerjaan dianggap selesai, bukan perpindahan tanggung jawab.',
      }
    }
    return { boleh: true }
  }

  if (ke === 'draf') {
    return {
      boleh: false,
      sebab: 'Berita acara tak bisa dikembalikan ke draf. Batalkan dan terbitkan yang baru.',
    }
  }

  return { boleh: false, sebab: `Perpindahan ${dari} → ${ke} tak dikenal.` }
}

export interface KesiapanPho {
  siap: boolean
  punchTerbuka: number
  punchTotal: number
  sebab: string
}

/**
 * Apakah proyek siap di-PHO menurut punch list-nya?
 *
 * ── Kenapa ini TIDAK menolak, hanya memberi tahu
 *
 * PHO bersyarat adalah praktik nyata: diterima dengan daftar cacat yang
 * disepakati diperbaiki dalam masa pemeliharaan. Melarangnya berarti melarang
 * cara kerja yang sah, dan yang terjadi berikutnya bisa ditebak — orang
 * menutup punch item secara massal supaya tombolnya menyala, dan daftar
 * cacatnya berhenti berarti apa-apa.
 *
 * Jadi yang dilakukan: jumlah cacat terbuka DISIMPAN di berita acaranya. PHO
 * yang diterbitkan dengan 19 cacat terbuka tercatat selamanya sebagai PHO
 * dengan 19 cacat terbuka — dan itu jauh lebih berguna saat sengketa daripada
 * tombol yang pernah menolak.
 */
export function periksaKesiapanPho(m: {
  punchTerbuka: number
  punchTotal: number
}): KesiapanPho {
  const terbuka = Number.isFinite(m.punchTerbuka) ? Math.max(0, m.punchTerbuka) : 0
  const total = Number.isFinite(m.punchTotal) ? Math.max(0, m.punchTotal) : 0

  if (total === 0) {
    return {
      siap: true, punchTerbuka: 0, punchTotal: 0,
      sebab: 'Belum ada temuan cacat yang tercatat pada proyek ini. Pastikan pemeriksaan '
        + 'akhir sudah dilakukan — punch list kosong karena belum diperiksa berbeda '
        + 'dengan punch list kosong karena tak ada cacat.',
    }
  }

  if (terbuka === 0) {
    return {
      siap: true, punchTerbuka: 0, punchTotal: total,
      sebab: `Seluruh ${total} temuan sudah ditutup.`,
    }
  }

  return {
    siap: false, punchTerbuka: terbuka, punchTotal: total,
    sebab: `${terbuka} dari ${total} temuan masih terbuka. PHO tetap bisa diterbitkan `
      + 'sebagai serah terima bersyarat — jumlah ini akan tercatat di berita acaranya, '
      + 'dan cacat yang disepakati diperbaiki dituliskan di catatan cacat.',
  }
}

/** Tanggal berakhirnya masa pemeliharaan — diturunkan, tak pernah disimpan. */
export function akhirMasaPemeliharaan(tanggalPho: string, masaHari: number | null | undefined): string | null {
  if (masaHari === null || masaHari === undefined || !Number.isFinite(masaHari)) return null
  const t = Date.parse(tanggalPho)
  if (!Number.isFinite(t)) return null
  return new Date(t + masaHari * 86_400_000).toISOString().slice(0, 10)
}

function bulat2(n: number): number {
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0
}
