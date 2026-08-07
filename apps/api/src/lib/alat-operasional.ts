// OPERASIONAL ALAT — jatuh tempo perawatan & biaya per jam. PURE, tanpa I/O.
//
// ════════════════════════════════════════════════════════════════════════════
// TIGA HAL YANG MODUL INI TOLAK TAMPILKAN SEBAGAI KABAR BAIK
// ════════════════════════════════════════════════════════════════════════════
//
// 1. **Perawatan yang "belum jatuh tempo menurut kalender".** Excavator yang
//    bekerja 300 jam dalam sebulan butuh ganti oli, meski jadwal harian baru
//    setengah jalan. Menghitung hanya dari tanggal adalah cara paling umum
//    alat rusak lebih cepat daripada seharusnya — dan biayanya bukan
//    servisnya, melainkan proyek yang berhenti.
//
// 2. **Biaya per jam yang membagi dengan nol.** Alat yang belum pernah
//    dipakai punya jam operasi 0. `biaya / 0` menghasilkan `Infinity`, yang
//    dirender jadi "∞" atau — lebih buruk — dibulatkan jadi angka besar yang
//    terlihat masuk akal. Yang benar `null`: **tak bisa dihitung**, bukan
//    "mahal sekali".
//
// 3. **Rasio perawatan tak terjadwal yang tenggelam.** Alat dengan 10 servis
//    terjadwal dan 10 mendadak terlihat "sering dirawat". Yang sebenarnya
//    terjadi: preventifnya tidak bekerja, dan separuh servisnya adalah
//    kerusakan yang seharusnya bisa dicegah.

/** Ubah NUMERIC-dari-Postgres (string) atau number jadi number. */
function angka(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

export interface JadwalPerawatan {
  id: string
  nama: string
  jenis?: string | null
  setiap_jam?: number | string | null
  setiap_hari?: number | string | null
  jam_terakhir?: number | string | null
  tanggal_terakhir?: string | null
  aktif?: boolean | null
}

export type StatusPerawatan =
  /** Belum mendekati ambang mana pun. */
  | 'aman'
  /** ≥ 80% menuju ambang — waktunya menjadwalkan, belum mendesak. */
  | 'segera'
  /** Sudah melewati ambang. */
  | 'jatuh_tempo'
  /** Belum pernah dirawat sama sekali, dan tak ada acuan. */
  | 'belum_ada_acuan'

export interface HasilJatuhTempo {
  status: StatusPerawatan
  /** Sisa jam sebelum jatuh tempo. `null` bila jadwalnya tak pakai jam. */
  sisaJam: number | null
  /** Sisa hari sebelum jatuh tempo. `null` bila jadwalnya tak pakai hari. */
  sisaHari: number | null
  /**
   * Ambang MANA yang lebih dulu tercapai — 'jam' atau 'hari'.
   *
   * Dinyatakan, bukan disembunyikan: "ganti oli karena sudah 300 jam"
   * dan "karena sudah 6 bulan" adalah dua percakapan berbeda dengan mekanik.
   */
  pemicu: 'jam' | 'hari' | null
}

/** Ambang "segera" — 80% menuju jatuh tempo. */
export const AMBANG_SEGERA = 0.8

/**
 * Hitung jatuh tempo satu jadwal perawatan.
 *
 * @param jamSekarang pembacaan meter terkini alat itu.
 * @param hariIni tanggal acuan `YYYY-MM-DD`. DIOPER dari pemanggil, bukan
 *   `new Date()` di dalam — supaya hasilnya tak berubah tergantung jam
 *   berapa test dijalankan.
 */
export function hitungJatuhTempo(
  j: JadwalPerawatan,
  jamSekarang: number | string | null | undefined,
  hariIni: string,
): HasilJatuhTempo {
  const setiapJam = angka(j.setiap_jam)
  const setiapHari = angka(j.setiap_hari)
  const jamTerakhir = angka(j.jam_terakhir)
  const jamKini = angka(jamSekarang)

  // ── Jalur JAM ────────────────────────────────────────────────────────────
  let sisaJam: number | null = null
  if (setiapJam != null && jamKini != null) {
    // Belum pernah dirawat → acuannya nol jam, bukan "tak bisa dihitung".
    // Alat baru yang belum pernah diservis TETAP punya jatuh tempo pertama.
    const acuan = jamTerakhir ?? 0
    sisaJam = Math.round((acuan + setiapJam - jamKini) * 100) / 100
  }

  // ── Jalur HARI ───────────────────────────────────────────────────────────
  let sisaHari: number | null = null
  if (setiapHari != null && j.tanggal_terakhir) {
    const jatuh = tambahHari(j.tanggal_terakhir, setiapHari)
    sisaHari = selisihHari(hariIni, jatuh)
  }

  if (sisaJam == null && sisaHari == null) {
    return { status: 'belum_ada_acuan', sisaJam: null, sisaHari: null, pemicu: null }
  }

  // Yang LEBIH DULU tercapai yang menentukan. Excavator menganggur sebulan
  // tak butuh ganti oli; yang bekerja 300 jam butuh — meski kalendernya baru
  // setengah jalan.
  const lewatJam = sisaJam != null && sisaJam <= 0
  const lewatHari = sisaHari != null && sisaHari <= 0

  if (lewatJam || lewatHari) {
    // Kalau keduanya lewat, yang paling jauh terlewati yang disebut.
    const pemicu: 'jam' | 'hari' =
      lewatJam && lewatHari
        ? (sisaJam! <= sisaHari! ? 'jam' : 'hari')
        : lewatJam ? 'jam' : 'hari'
    return { status: 'jatuh_tempo', sisaJam, sisaHari, pemicu }
  }

  const dekatJam = sisaJam != null && setiapJam != null &&
    sisaJam <= setiapJam * (1 - AMBANG_SEGERA)
  const dekatHari = sisaHari != null && setiapHari != null &&
    sisaHari <= setiapHari * (1 - AMBANG_SEGERA)

  if (dekatJam || dekatHari) {
    return {
      status: 'segera',
      sisaJam, sisaHari,
      pemicu: dekatJam ? 'jam' : 'hari',
    }
  }

  return { status: 'aman', sisaJam, sisaHari, pemicu: null }
}

export interface BiayaAlat {
  jenis: string
  jumlah: number | string
  kuantitas?: number | string | null
}

export interface HasilBiayaAlat {
  /**
   * Biaya operasional + biaya PERAWATAN.
   *
   * Keduanya, bukan salah satu. Biaya servis tinggal di tabel yang berbeda
   * (`riwayat_perawatan`), dan menjumlah hanya `biaya_operasional_alat`
   * membuat alat yang paling sering rusak justru terlihat PALING MURAH:
   * dump truck dengan empat kerusakan mendadak senilai Rp 19,85 juta
   * tampil "Rp 0" karena tak sekali pun mengisi BBM lewat modul ini.
   *
   * Itu bukan sekadar angka kurang — itu membalik peringkatnya.
   */
  total: number
  perJenis: Record<string, number>
  /**
   * Biaya per jam operasi. `null` bila jam operasinya nol.
   *
   * BUKAN 0, dan bukan angka besar hasil pembagian dengan nol: alat yang
   * belum pernah dipakai TAK BISA dihitung biaya-per-jamnya, dan menampilkan
   * angka apa pun di sana adalah kebohongan yang terlihat rapi.
   */
  perJam: number | null
  /** Liter BBM per jam. `null` bila salah satunya nol. */
  bbmPerJam: number | null
}

/**
 * Ringkas biaya satu alat.
 *
 * @param perawatan biaya servis dari `riwayat_perawatan`. Dipisah karena
 *   tabelnya memang berbeda — TAPI tetap dijumlahkan ke `total`, sebab
 *   pertanyaan yang dibawa orang ke layar ini adalah "alat ini menghabiskan
 *   berapa", bukan "berapa yang kebetulan tercatat di tabel biaya".
 */
export function ringkasBiayaAlat(
  biaya: BiayaAlat[],
  jamOperasi: number | string | null | undefined,
  perawatan: Array<{ biaya: number | string }> = [],
): HasilBiayaAlat {
  const perJenis: Record<string, number> = {}
  let total = 0
  let literBbm = 0

  for (const b of biaya) {
    const n = angka(b.jumlah) ?? 0
    perJenis[b.jenis] = (perJenis[b.jenis] ?? 0) + n
    total += n
    if (b.jenis === 'bbm') literBbm += angka(b.kuantitas) ?? 0
  }

  // Servis masuk sebagai jenisnya sendiri, bukan dilebur ke 'lainnya':
  // "alat ini boros BBM" dan "alat ini sering rusak" menuntut tindakan yang
  // berbeda, dan meleburnya menghapus perbedaan itu.
  let totalPerawatan = 0
  for (const p of perawatan) totalPerawatan += angka(p.biaya) ?? 0
  if (totalPerawatan > 0) {
    perJenis.perawatan = (perJenis.perawatan ?? 0) + totalPerawatan
    total += totalPerawatan
  }

  const jam = angka(jamOperasi)
  const bisaDibagi = jam != null && jam > 0

  return {
    total: Math.round(total),
    perJenis,
    perJam: bisaDibagi ? Math.round(total / jam) : null,
    bbmPerJam: bisaDibagi && literBbm > 0 ? Math.round((literBbm / jam) * 100) / 100 : null,
  }
}

export interface HasilKesehatanAlat {
  servisTerjadwal: number
  servisMendadak: number
  /**
   * Rasio servis mendadak terhadap total. `null` bila belum ada servis.
   *
   * Tinggi berarti preventifnya tidak bekerja — dan itu tak terlihat dari
   * "sering dirawat", yang justru terdengar seperti kabar baik.
   */
  rasioMendadak: number | null
  /** `true` bila mendadak ≥ separuh — preventifnya perlu ditinjau. */
  preventifGagal: boolean
}

/** Nilai kesehatan pola perawatan satu alat. */
export function nilaiKesehatanAlat(
  riwayat: Array<{ tak_terjadwal?: boolean | null }>,
): HasilKesehatanAlat {
  const mendadak = riwayat.filter((r) => r.tak_terjadwal === true).length
  const terjadwal = riwayat.length - mendadak
  const rasio = riwayat.length > 0
    ? Math.round((mendadak / riwayat.length) * 1000) / 10
    : null

  return {
    servisTerjadwal: terjadwal,
    servisMendadak: mendadak,
    rasioMendadak: rasio,
    // Separuh atau lebih mendadak: yang preventif tak mencegah apa pun.
    preventifGagal: rasio != null && rasio >= 50,
  }
}

/** Tambah `n` hari ke tanggal `YYYY-MM-DD`. */
function tambahHari(tanggal: string, n: number): string {
  const d = new Date(tanggal + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Selisih hari `dari` → `sampai` (positif bila `sampai` di masa depan). */
function selisihHari(dari: string, sampai: string): number {
  const a = new Date(dari + 'T00:00:00Z').getTime()
  const b = new Date(sampai + 'T00:00:00Z').getTime()
  return Math.round((b - a) / 86_400_000)
}
