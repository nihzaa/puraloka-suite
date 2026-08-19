/**
 * KONSUMSI BBM ALAT — liter per jam operasi, bukan rupiah per pengisian.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA RUPIAH ADALAH UKURAN YANG SALAH
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Penilaian pertama saya mencoret automation ini: "nominal BBM tiap pengisian
 * identik, nol variasi, tak ada anomali untuk dideteksi."
 *
 * Diukur ulang ke kolom yang benar:
 *
 *   Excavator 20 Ton   12 pengisian   960 liter   80 L tiap kali
 *   Truk Mixer 7 m3    10 pengisian   450 liter   45 L tiap kali
 *
 * Nominalnya memang seragam — karena tangkinya diisi PENUH tiap kali, dan
 * harga solar tak berubah. Itu bukan ketiadaan sinyal; itu ukuran yang salah.
 *
 * Yang bermakna: **berapa liter per jam operasi**. Excavator 20 ton yang wajar
 * membakar 15-25 L/jam. Kalau angkanya melonjak, penyebabnya salah satu dari
 * tiga hal yang SEMUANYA merugikan — filter/injektor bermasalah, mesin
 * dibiarkan menyala menganggur berjam-jam, atau solar hilang di lapangan.
 *
 * Rupiah tak bisa membedakan ketiganya dari kenaikan harga solar. Liter per
 * jam bisa.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * DIBANDINGKAN DENGAN DIRINYA SENDIRI, BUKAN DENGAN ALAT LAIN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Excavator dan truk mixer punya konsumsi wajar yang berbeda jauh.
 * Membandingkan antar-alat menghasilkan tuduhan yang selalu menunjuk alat
 * terbesar — benar secara aritmetika, tak berguna sama sekali.
 *
 * Yang dibandingkan: konsumsi PERIODE TERAKHIR terhadap RIWAYAT alat itu
 * sendiri. Alat yang biasanya 18 L/jam lalu menjadi 30 L/jam adalah temuan;
 * alat yang selalu 30 L/jam bukan.
 */

export interface Pengisian {
  /** ISO `YYYY-MM-DD`. */
  tanggal: string
  /** Liter yang diisi. */
  liter: number
}

export interface HasilKonsumsi {
  pengisian: number
  totalLiter: number
  /** Jam operasi yang tercakup periode ini. `null` bila tak terukur. */
  jamOperasi: number | null
  /** Liter per jam operasi. `null` bila jam tak terukur. */
  literPerJam: number | null
  /** Acuan riwayat sebelumnya, untuk dibandingkan. */
  acuanPerJam: number | null
  /** Berapa persen di atas acuan. `null` bila tak bisa dibandingkan. */
  naikPersen: number | null
  boros: boolean
  sebab: 'wajar' | 'kurang_data' | 'jam_tak_terukur' | 'melonjak'
}

/**
 * @param terbaru      pengisian pada periode yang dinilai
 * @param jamTerbaru   jam operasi pada periode itu
 * @param riwayat      pengisian SEBELUM periode itu (acuan)
 * @param jamRiwayat   jam operasi yang dicakup riwayat
 * @param minPengisian pengisian minimum sebelum disimpulkan
 * @param ambangPersen kenaikan (%) di atas acuan yang dianggap melonjak
 */
export function nilaiKonsumsiBbm(
  terbaru: Pengisian[],
  jamTerbaru: number | null,
  riwayat: Pengisian[],
  jamRiwayat: number | null,
  minPengisian: number,
  ambangPersen: number,
): HasilKonsumsi {
  const sahT = terbaru.filter((p) => Number.isFinite(p.liter) && p.liter > 0)
  const sahR = riwayat.filter((p) => Number.isFinite(p.liter) && p.liter > 0)

  const totalLiter = sahT.reduce((a, p) => a + p.liter, 0)
  const dasar = { pengisian: sahT.length, totalLiter }

  if (sahT.length < Math.max(1, minPengisian)) {
    return {
      ...dasar, jamOperasi: jamTerbaru, literPerJam: null, acuanPerJam: null,
      naikPersen: null, boros: false, sebab: 'kurang_data',
    }
  }

  /*
    JAM NOL MEMATIKAN perhitungan, bukan menghasilkan Infinity.

    `liter / 0` menghasilkan Infinity, dan `Infinity >= ambang` bernilai true —
    jadi SETIAP alat yang jam-meternya tak tercatat dilaporkan boros. Alat yang
    baru dibeli dan alat yang operatornya lalai mencatat masuk kategori itu,
    dan justru merekalah yang paling banyak.
  */
  const jt = Number(jamTerbaru)
  if (!Number.isFinite(jt) || jt <= 0) {
    return {
      ...dasar, jamOperasi: jamTerbaru, literPerJam: null, acuanPerJam: null,
      naikPersen: null, boros: false, sebab: 'jam_tak_terukur',
    }
  }

  const literPerJam = Math.round((totalLiter / jt) * 100) / 100

  const jr = Number(jamRiwayat)
  const literRiwayat = sahR.reduce((a, p) => a + p.liter, 0)
  const bisaBanding = sahR.length > 0 && Number.isFinite(jr) && jr > 0

  if (!bisaBanding) {
    /*
      Tanpa riwayat, TIDAK ada tuduhan.

      Godaannya membandingkan dengan angka baku industri (15-25 L/jam untuk
      excavator 20 ton). Itu ditolak: angka baku tak tahu alat ini bekerja di
      tanah keras atau lunak, dengan operator berpengalaman atau tidak.

      Alat baru akan diam sampai punya riwayatnya sendiri — dan itu benar.
      Tuduhan yang lahir dari pembanding yang tak cocok membuat orang berhenti
      mempercayai seluruh peringatan BBM.
    */
    return {
      ...dasar, jamOperasi: jt, literPerJam, acuanPerJam: null,
      naikPersen: null, boros: false, sebab: 'kurang_data',
    }
  }

  const acuanPerJam = Math.round((literRiwayat / jr) * 100) / 100
  const naikPersen = acuanPerJam > 0
    ? Math.round(((literPerJam - acuanPerJam) / acuanPerJam) * 1000) / 10
    : null

  if (naikPersen != null && naikPersen >= ambangPersen) {
    return {
      ...dasar, jamOperasi: jt, literPerJam, acuanPerJam, naikPersen,
      boros: true, sebab: 'melonjak',
    }
  }
  return {
    ...dasar, jamOperasi: jt, literPerJam, acuanPerJam, naikPersen,
    boros: false, sebab: 'wajar',
  }
}
