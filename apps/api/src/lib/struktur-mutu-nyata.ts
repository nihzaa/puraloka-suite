/**
 * ══════════════════════════════════════════════════════════════════════════════
 * MUTU NYATA vs MUTU YANG DIASUMSIKAN — pertanyaan yang tak pernah ditanyakan
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `uji_material` menyimpan kuat tekan NYATA dari laboratorium.
 * `struktur_elemen.input.mutu.fcMpa` menyimpan yang DIASUMSIKAN saat menghitung.
 *
 * Tak ada satu pun yang membandingkan keduanya. Diukur 2026-08-20 pada basis
 * ini: `uji_material` hanya disentuh `mutu.ts`, dan konversi K→fc tak ada di
 * kode mana pun.
 *
 * Data sungguhan yang sudah ada di basis saat modul ini ditulis:
 *
 *     Beton K-250 zona A lantai   231,0 / 250,0 kg/cm2  -> tidak_memenuhi
 *     Beton K-300 kolom (7 hari)  195,0 / 210,0 kg/cm2  -> perlu_uji_ulang
 *
 * Zona A datang 231 dari 250 yang diminta. Sistem mencatatnya sebagai "tidak
 * memenuhi" — lalu berhenti. Pertanyaan lanjutannya tak pernah diajukan:
 *
 *     Balok yang dihitung dengan fc = 25 MPa, apakah masih aman pada mutu
 *     yang BENAR-BENAR terpasang?
 *
 * Itu pertanyaan yang menentukan apakah lantai boleh dibebani, dan jawabannya
 * sudah bisa dihitung sejak lama — mesinnya (`bandingkan`) sudah ada. Yang
 * hilang cuma sambungannya.
 *
 * ── Kenapa ini BUKAN "menghitung ulang otomatis lalu menyimpannya"
 *
 * Hasil uji mutu TIDAK boleh menimpa input desain. Dua alasan:
 *
 *   1. Desain adalah KEPUTUSAN; hasil uji adalah PENGUKURAN. Menimpa desain
 *      dengan pengukuran menghapus jejak apa yang sebenarnya direncanakan —
 *      dan itu justru yang dicari saat proyek disengketakan.
 *
 *   2. Satu benda uji bukan mutu seluruh struktur. Silinder yang jeblok bisa
 *      berarti betonnya kurang, ATAU perawatannya salah, ATAU benda ujinya
 *      cacat. Yang memutuskan artinya adalah insinyur, bukan tabel.
 *
 * Modul ini MENGHITUNG DAN MEMPERLIHATKAN. Yang menindaklanjuti tetap orang.
 */

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * KONVERSI K (kubus) → f'c (silinder)
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Praktik Indonesia memakai dua satuan yang TIDAK bisa dibandingkan langsung:
 *
 *   · mutu K   — kuat tekan KUBUS 15×15×15 cm, satuan kg/cm²
 *   · mutu f'c — kuat tekan SILINDER Ø15×30 cm, satuan MPa (dipakai SNI 2847)
 *
 * Benda uji kubus terkekang gesekan pelat mesin di kedua ujungnya, jadi ia
 * mengukur ANGKA LEBIH TINGGI untuk beton yang sama persis. Menyamakan K-250
 * dengan f'c 25 MPa — kesalahan yang sangat sering terjadi karena angkanya
 * "kebetulan mirip" — membuat beton dianggap ~20% lebih kuat dari kenyataannya.
 *
 * Dua langkah, dan keduanya harus ikut:
 *
 *     1 MPa = 10,197 kg/cm²          (satuan)
 *     f'c   ≈ 0,83 × K               (bentuk benda uji, PBI/SNI 03-2847)
 *
 *     K-250 → 250 / 10,197 × 0,83 ≈ 20,3 MPa    (BUKAN 25 MPa)
 *
 * Faktor 0,83 adalah nilai yang lazim dipakai di Indonesia. Angka lain yang
 * beredar (0,80–0,85) tak mengubah kesimpulan di kelas ini, dan modul ini
 * MENYEBUTKAN faktornya di tiap keluaran supaya bisa diperiksa — bukan
 * mengubur asumsi di dalam angka jadi.
 */
export const KG_CM2_PER_MPA = 10.197
export const FAKTOR_KUBUS_KE_SILINDER = 0.83

/** kg/cm² (kubus) → MPa (silinder). */
export function kubusKeSilinderMpa(kgCm2: number): number {
  return (kgCm2 / KG_CM2_PER_MPA) * FAKTOR_KUBUS_KE_SILINDER
}

/** Baris uji material yang relevan bagi struktur. */
export interface BarisUji {
  id: string
  objek: string | null
  jenis_uji: string | null
  nilai_hasil: number | string | null
  nilai_syarat: number | string | null
  satuan: string | null
  tanggal_uji: string | null
  kesimpulan: string | null
}

export interface MutuTerukur {
  id: string
  objek: string
  tanggalUji: string | null
  /** Kuat tekan nyata, sudah dikonversi ke MPa silinder. */
  fcNyataMpa: number
  /** Yang disyaratkan pada dokumen uji, dalam satuan yang sama. */
  fcSyaratMpa: number | null
  /** Satuan asli — supaya bisa ditelusuri ke sertifikatnya. */
  satuanAsli: string
  nilaiAsli: number
  /**
   * Umur benda uji dalam hari, bila tersebut di `jenis_uji`.
   *
   * Ini yang membedakan temuan yang MENGIKAT dari yang belum: silinder 7 hari
   * yang "jeblok" itu normal — beton baru mencapai sekitar 65-70% kekuatannya.
   * Memperlakukannya seperti hasil 28 hari akan memicu pembongkaran yang tak
   * perlu.
   */
  umurHari: number | null
  /** Apakah hasil ini sudah final (umur 28 hari atau lebih). */
  final: boolean
}

/*
  ── Mengenali uji KUAT TEKAN BETON dari teks bebas

  `jenis_uji` bukan enum. Diukur pada basis ini, isinya:

      "Kuat tekan 28 hari" · "Kuat tekan 7 hari" · "Kuat tarik" · "Kadar lumpur"

  Yang dicari hanya uji kuat TEKAN. "Kuat tarik" (baja tulangan) sengaja
  DIKECUALIKAN — angkanya 4250 kg/cm², dan kalau ikut terbaca sebagai mutu
  beton ia akan tampil sebagai beton super yang membuat semua elemen terlihat
  sangat aman. Kegagalan yang arahnya BERBAHAYA.
*/
const POLA_TEKAN = /kuat\s*tekan|compressive|silinder|kubus|beton\s*k[-\s]?\d/i
const POLA_TARIK = /tarik|tensile|lentur\s*baja|leleh/i

/** Ambil umur benda uji dari teks bebas, mis. "Kuat tekan 28 hari" → 28. */
export function umurDariJenis(jenis: string | null): number | null {
  if (!jenis) return null
  const m = jenis.match(/(\d{1,3})\s*hari/i)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Saring & konversi baris uji jadi mutu beton terukur.
 *
 * Yang tak bisa ditafsirkan DIBUANG di sini, bukan dipaksa jadi angka.
 * Menebak satuan yang tak dikenal berarti membandingkan desain terhadap angka
 * yang artinya tak diketahui siapa pun.
 */
export function mutuBetonTerukur(baris: BarisUji[]): MutuTerukur[] {
  const keluar: MutuTerukur[] = []
  for (const b of baris) {
    const jenis = b.jenis_uji ?? ''
    if (!POLA_TEKAN.test(jenis) || POLA_TARIK.test(jenis)) continue

    const nilai = Number(b.nilai_hasil)
    if (!Number.isFinite(nilai) || nilai <= 0) continue

    const satuan = (b.satuan ?? '').trim().toLowerCase()
    let fc: number
    let fcSyarat: number | null = null
    const syarat = Number(b.nilai_syarat)

    if (/kg\s*\/?\s*cm/.test(satuan)) {
      fc = kubusKeSilinderMpa(nilai)
      fcSyarat = Number.isFinite(syarat) && syarat > 0 ? kubusKeSilinderMpa(syarat) : null
    } else if (/mpa|n\/mm/.test(satuan)) {
      /*
        Sudah MPa: dianggap SILINDER, sesuai SNI 2847 yang memakai f'c.
        Tak dikonversi lagi — mengalikan 0,83 pada angka yang sudah silinder
        membuat betonnya terlihat 17% lebih lemah dari kenyataannya, dan itu
        memicu penguatan yang tak perlu.
      */
      fc = nilai
      fcSyarat = Number.isFinite(syarat) && syarat > 0 ? syarat : null
    } else {
      /* Satuan tak dikenal — DIBUANG, bukan ditebak. */
      continue
    }

    const umur = umurDariJenis(jenis)
    keluar.push({
      id: b.id,
      objek: b.objek ?? '(tanpa nama)',
      tanggalUji: b.tanggal_uji,
      fcNyataMpa: Math.round(fc * 100) / 100,
      fcSyaratMpa: fcSyarat === null ? null : Math.round(fcSyarat * 100) / 100,
      satuanAsli: b.satuan ?? '',
      nilaiAsli: nilai,
      umurHari: umur,
      /*
        Tanpa umur yang tersebut, hasilnya DIANGGAP final.

        Arah konservatif dipilih sengaja: menganggap hasil final sebagai
        "belum final" akan menyembunyikan temuan yang mengikat, dan mutu yang
        jeblok yang disembunyikan jauh lebih berbahaya daripada peringatan
        yang ternyata prematur.
      */
      final: umur === null || umur >= 28,
    })
  }
  return keluar
}

export interface DampakMutu {
  /** Mutu terendah yang dipakai sebagai dasar penilaian. */
  fcNyataMpa: number
  fcDesainMpa: number
  /** Selisih dalam persen terhadap desain; negatif = lebih lemah. */
  selisihPersen: number
  /**
   * Apakah nilainya di bawah desain sama sekali.
   *
   * Dipisahkan dari `aman`: beton yang SEDIKIT di bawah desain bisa saja
   * masih memenuhi seluruh pemeriksaan (desainnya punya cadangan), dan
   * mencampur kedua pertanyaan membuat setiap penyimpangan kecil terbaca
   * seperti kegagalan struktur.
   */
  dibawahDesain: boolean
  final: boolean
}

/**
 * Bandingkan mutu terukur terhadap mutu yang dipakai saat menghitung.
 *
 * Yang diambil sebagai wakil adalah yang TERENDAH, bukan rata-rata. Rata-rata
 * meratakan satu silinder yang jeblok dengan empat yang baik, dan yang jeblok
 * itulah yang menentukan di titik tempat ia diambil.
 */
export function dampakMutu(
  terukur: MutuTerukur[], fcDesainMpa: number,
): DampakMutu | null {
  if (!terukur.length || !Number.isFinite(fcDesainMpa) || fcDesainMpa <= 0) return null

  /*
    Hasil BELUM FINAL (umur < 28 hari) dikesampingkan bila ada yang final.

    Silinder 7 hari yang "jeblok" itu normal — beton baru mencapai sekitar
    65-70% kekuatannya. Memperlakukannya seperti hasil 28 hari memicu
    pembongkaran yang tak perlu.
  */
  const adaFinal = terukur.some((t) => t.final)
  const dipakai = adaFinal ? terukur.filter((t) => t.final) : terukur

  const terendah = dipakai.reduce((a, b) => (b.fcNyataMpa < a.fcNyataMpa ? b : a))
  const selisih = ((terendah.fcNyataMpa - fcDesainMpa) / fcDesainMpa) * 100

  return {
    fcNyataMpa: terendah.fcNyataMpa,
    fcDesainMpa,
    selisihPersen: Math.round(selisih * 10) / 10,
    dibawahDesain: terendah.fcNyataMpa < fcDesainMpa,
    final: terendah.final,
  }
}

/** Ambil `mutu.fcMpa` dari input elemen, apa pun bentuk sarangnya. */
export function fcDesainDari(input: Record<string, unknown> | null | undefined): number | null {
  const mutu = (input ?? {}).mutu
  if (mutu && typeof mutu === 'object') {
    const v = Number((mutu as Record<string, unknown>).fcMpa)
    if (Number.isFinite(v) && v > 0) return v
  }
  /* Sebagian jenis menaruhnya di puncak. */
  const langsung = Number((input ?? {}).fcMpa)
  return Number.isFinite(langsung) && langsung > 0 ? langsung : null
}
