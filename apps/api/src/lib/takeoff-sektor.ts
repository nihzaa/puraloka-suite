// Take-off VOLUME untuk sektor non-struktur — PURE, tanpa I/O.
//
// ══════════════════════════════════════════════════════════════════════════════
// KENAPA BERKAS INI ADA
// ══════════════════════════════════════════════════════════════════════════════
//
// Modul struktur menghitung volume beton, bekisting, dan besi dari desain yang
// sudah diperiksa kekuatannya. Sektor lain — atap, kusen, plafon, sanitair,
// MEP, cat — tak punya penghitung sama sekali: estimator mengetik volumenya
// langsung ke RAB dari hasil hitungan tangan di kertas atau spreadsheet.
//
// AHSP-nya SUDAH ADA. Diukur di basis (2026-08-19):
//
//     atap        57 assembly bersatuan m²      plesteran   34 m²
//     plafon      19 m²                         cat         27 m²
//     keramik     39 m²                         pipa       299 m + 98 buah
//     kusen        7 m + 4 m²                   sanitair     2 buah
//
// Yang tak ada di antaranya: apa pun yang MENGHITUNG angka yang dikalikan ke
// AHSP itu. Jadi harga per satuannya presisi sampai rupiah, sementara satuannya
// sendiri hasil ketik tangan.
//
// ── Kenapa `takeoff-dimensi.ts` tidak cukup
//
// Berkas itu (migrasi 431) sudah menyediakan empat metode generik: volume,
// luas, dinding, panjang — p × l × t × jumlah × faktor. Itu benar untuk galian,
// urugan, dan dinding polos, dan modul ini TIDAK menggantikannya.
//
// Yang tak bisa dijawabnya:
//
//   1. **Bukaan tak pernah dikurangi.** Dinding 4×3 m dengan satu pintu
//      0,9×2,1 dan satu jendela 1,2×1,2 dihitung 12 m² penuh, padahal yang
//      diplester 8,67 m². Kelebihan 28% itu langsung jadi rupiah, dan
//      terjadi di sektor yang paling banyak barisnya (plesteran, acian, cat).
//
//   2. **Kemiringan atap tak ada.** Luas atap BUKAN luas denah: atap 30°
//      seluas 100 m² denah berukuran 115,5 m² sesungguhnya. Estimator yang
//      memakai luas denah kekurangan 15% genteng — dan kekurangannya baru
//      ketahuan saat pemasangan berhenti.
//
//   3. **Keliling bukan p × l.** Kusen diukur per meter kelilingnya; pipa
//      per meter jaringan; lisplang per meter tepi atap.
//
//   4. **Yang dihitung per TITIK.** Sanitair, saklar, stop kontak, armatur:
//      volumenya cacah, bukan ukuran — tetapi tetap perlu dikumpulkan per
//      ruangan supaya bisa ditelusuri.
//
// ── Kenapa PURE
//
// Alasan yang sama dengan `takeoff-dimensi.ts` dan seluruh modul struktur:
// kesalahan volume TIDAK menimbulkan galat, ia menghasilkan angka yang
// terlihat wajar. Satu-satunya yang menangkapnya adalah golden test yang
// membandingkan keluaran dengan hitungan tangan — dan itu cuma murah kalau
// fungsinya bisa dipanggil tanpa basis, tanpa login, tanpa fixture.
// ══════════════════════════════════════════════════════════════════════════════

/** Sektor pekerjaan. Daftar TERTUTUP — bukan string bebas. */
export type Sektor =
  | 'atap'        // genteng, rangka, lisplang       → m² miring / m tepi
  | 'plafon'      // rangka + penutup                → m² denah
  | 'dinding'     // pasangan, plester, acian, cat   → m² dikurangi bukaan
  | 'lantai'      // keramik, granit, screed         → m² denah
  | 'kusen'       // kusen pintu/jendela             → m keliling
  | 'daun'        // daun pintu/jendela              → m² atau unit
  | 'sanitair'    // closet, wastafel, kran          → unit
  | 'mep_pipa'    // pipa air bersih/kotor           → m
  | 'mep_titik'   // titik lampu, saklar, stop kontak → titik

export const SEKTOR_SAH: readonly Sektor[] = [
  'atap', 'plafon', 'dinding', 'lantai', 'kusen', 'daun', 'sanitair',
  'mep_pipa', 'mep_titik',
]

/** Satuan hasil per sektor — kembar dengan satuan AHSP-nya di basis. */
export const SATUAN_SEKTOR: Record<Sektor, string> = {
  atap: 'm2', plafon: 'm2', dinding: 'm2', lantai: 'm2',
  kusen: 'm', daun: 'm2', sanitair: 'unit', mep_pipa: 'm', mep_titik: 'titik',
}

/**
 * Batas atas faktor — sama dengan `takeoff-dimensi.ts`.
 *
 * Faktor menampung hal yang di lapangan memang berubah: susut, tumpang-tindih
 * genteng, potongan keramik di tepi. Yang wajar tak pernah melewati satuan
 * digit; 10 memberi ruang lebih dari cukup sambil tetap menahan salah ketik
 * yang menggandakan volume 100×.
 */
export const FAKTOR_MAKS = 10

/**
 * Batas kemiringan atap yang diterima, derajat.
 *
 * Nol berarti datar (dak) dan sah. Di atas 60° bukan atap melainkan dinding,
 * dan angka sebesar itu hampir selalu salah ketik — pada 89° faktornya 57×,
 * yang mengubah 100 m² denah jadi 5.700 m² genteng tanpa satu pun galat.
 */
export const KEMIRINGAN_MAKS_DERAJAT = 60

/** Satu bukaan yang dikurangkan dari luas dinding. */
export interface Bukaan {
  /** Nama untuk penelusuran — "P1", "J2". Bukan sekadar hiasan: lihat `rincian`. */
  nama: string
  lebarM: number
  tinggiM: number
  /** Berapa buah bukaan seukuran ini. */
  jumlah: number
}

export interface BarisSektorInput {
  uraian: string
  sektor: Sektor
  /** Ruangan/zona — supaya angkanya bisa ditelusuri ke gambar. */
  lokasi?: string
  panjangM?: number
  lebarM?: number
  tinggiM?: number
  /** Berapa kali bentuk ini berulang. Default 1. */
  jumlah?: number
  /** Pengali akhir (susut, tumpang-tindih, potongan). Default 1. */
  faktor?: number
  /** Kemiringan atap, derajat. Hanya untuk sektor `atap`. */
  kemiringanDerajat?: number
  /** Bukaan yang dikurangkan. Hanya untuk sektor `dinding`. */
  bukaan?: Bukaan[]
  /** Cacah langsung — untuk `sanitair` dan `mep_titik`. */
  cacah?: number
}

export interface BarisSektorHasil {
  uraian: string
  sektor: Sektor
  lokasi?: string
  /** Hasil akhir yang dikalikan ke AHSP. */
  volume: number
  satuan: string
  /**
   * Bagaimana angkanya lahir, dalam kalimat.
   *
   * Ini bukan hiasan. `estimate_items.quantity` masuk sebagai angka jadi, dan
   * sesudah masuk, volume yang benar dan yang salah ketik terlihat identik.
   * Kalimat ini satu-satunya yang menjawab "kenapa volumenya segini?" tanpa
   * membuka gambar dan menghitung ulang dari nol.
   */
  rincian: string
  /** Luas bukaan yang dikurangkan, m². 0 bila tak ada. */
  bukaanM2: number
  /** Peringatan yang TIDAK menggagalkan — angkanya sah tetapi patut dilihat. */
  catatan: string[]
}

// ── Helper ───────────────────────────────────────────────────────────────────

function wajibPositif(nama: string, v: number | undefined): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
    throw new Error(`${nama} harus angka > 0 (diterima: ${v})`)
  }
  return v
}

/**
 * Angka ringkas untuk kalimat rincian — koma sebagai pemisah desimal.
 *
 * ⚠ Nol trailing hanya dibuang SESUDAH titik desimal.
 *
 * Versi pertama memakai `.replace(/\.?0+$/, '')` pada seluruh string, dan itu
 * memakan nol yang bermakna: `ang(30, 0)` memulangkan `"3"`, sehingga rincian
 * atap berbunyi "÷ cos 3°" untuk kemiringan 30°. Angka yang salah di kalimat
 * penjelas lebih berbahaya daripada tak ada kalimat sama sekali — pembacanya
 * memeriksa hitungan yang tak pernah dilakukan.
 *
 * Ketahuan oleh test, bukan oleh mata.
 */
function ang(n: number, desimal = 2): string {
  const t = n.toFixed(desimal)
  return (t.includes('.') ? t.replace(/0+$/, '').replace(/\.$/, '') : t)
    .replace('.', ',')
}

/**
 * Faktor pengali kemiringan atap.
 *
 * Luas atap = luas denah ÷ cos(kemiringan). Bukan pendekatan — ini geometri
 * bidang miring, dan selisihnya besar: 30° memberi 1,155× dan 45° memberi
 * 1,414×. Atap 100 m² denah pada 30° membutuhkan 115,5 m² genteng.
 */
export function faktorKemiringan(derajat: number): number {
  if (!Number.isFinite(derajat) || derajat < 0) {
    throw new Error(`kemiringan harus 0..${KEMIRINGAN_MAKS_DERAJAT} derajat (diterima: ${derajat})`)
  }
  if (derajat > KEMIRINGAN_MAKS_DERAJAT) {
    throw new Error(
      `kemiringan ${derajat}° melewati batas ${KEMIRINGAN_MAKS_DERAJAT}° — `
      + 'di atas itu bukan atap melainkan dinding, dan angkanya hampir selalu '
      + 'salah ketik (pada 89° faktornya 57×).',
    )
  }
  return 1 / Math.cos(derajat * Math.PI / 180)
}

/** Total luas bukaan, m². */
export function luasBukaan(bukaan: readonly Bukaan[]): number {
  return bukaan.reduce((s, b) => {
    wajibPositif(`bukaan "${b.nama}" lebar`, b.lebarM)
    wajibPositif(`bukaan "${b.nama}" tinggi`, b.tinggiM)
    wajibPositif(`bukaan "${b.nama}" jumlah`, b.jumlah)
    return s + b.lebarM * b.tinggiM * b.jumlah
  }, 0)
}

// ── Perhitungan ──────────────────────────────────────────────────────────────

/**
 * Hitung satu baris take-off sektor.
 *
 * Melempar bila masukannya tak masuk akal — TIDAK memulangkan nol diam-diam.
 * Nol yang dipulangkan tanpa galat menghilang di dalam total, dan yang hilang
 * dari RAB adalah kekurangan anggaran yang tak terlihat karena sisanya tampak
 * lengkap.
 */
export function hitungBarisSektor(input: BarisSektorInput): BarisSektorHasil {
  if (!SEKTOR_SAH.includes(input.sektor)) {
    throw new Error(`sektor tak dikenal: ${input.sektor}`)
  }
  const jumlah = input.jumlah ?? 1
  const faktor = input.faktor ?? 1
  wajibPositif('jumlah', jumlah)
  wajibPositif('faktor', faktor)
  if (faktor > FAKTOR_MAKS) {
    throw new Error(`faktor ${faktor} melewati batas ${FAKTOR_MAKS}`)
  }

  const catatan: string[] = []
  let volume: number
  let rincian: string
  let bukaanM2 = 0

  switch (input.sektor) {
    /*
      CACAH LANGSUNG — sanitair & titik MEP.

      Volumenya bukan hasil ukur melainkan hitungan barang. Tetap lewat fungsi
      ini (bukan diketik langsung ke RAB) supaya lokasinya tercatat dan
      rinciannya bisa ditelusuri sama seperti sektor lain.
    */
    case 'sanitair':
    case 'mep_titik': {
      volume = wajibPositif('cacah', input.cacah) * faktor
      rincian = `${ang(input.cacah!, 0)} titik${faktor !== 1 ? ` × faktor ${ang(faktor)}` : ''}`
      break
    }

    /*
      PANJANG — kusen (keliling) dan pipa (jaringan).

      Kusen diukur per meter KELILING bukaannya, bukan per m². Kalau `lebarM`
      dan `tinggiM` terisi, kelilingnya dihitung; kalau hanya `panjangM`,
      angka itu dipakai apa adanya (jaringan pipa yang panjangnya diukur dari
      gambar).
    */
    case 'kusen':
    case 'mep_pipa': {
      if (input.lebarM !== undefined && input.tinggiM !== undefined) {
        const l = wajibPositif('lebar', input.lebarM)
        const t = wajibPositif('tinggi', input.tinggiM)
        const keliling = 2 * (l + t)
        volume = keliling * jumlah * faktor
        rincian = `keliling 2 × (${ang(l)} + ${ang(t)}) = ${ang(keliling)} m`
          + ` × ${ang(jumlah, 0)} buah${faktor !== 1 ? ` × faktor ${ang(faktor)}` : ''}`
      } else {
        const p = wajibPositif('panjang', input.panjangM)
        volume = p * jumlah * faktor
        rincian = `${ang(p)} m × ${ang(jumlah, 0)}`
          + `${faktor !== 1 ? ` × faktor ${ang(faktor)}` : ''}`
      }
      break
    }

    /*
      ATAP — luas denah dibagi cos(kemiringan).

      Luas atap BUKAN luas denah. Estimator yang memakai luas denah kekurangan
      15% genteng pada atap 30°, dan kekurangannya baru ketahuan saat
      pemasangan berhenti di tengah.
    */
    case 'atap': {
      const p = wajibPositif('panjang', input.panjangM)
      const l = wajibPositif('lebar', input.lebarM)
      const derajat = input.kemiringanDerajat ?? 0
      const fk = faktorKemiringan(derajat)
      const denah = p * l * jumlah
      volume = denah * fk * faktor

      rincian = `denah ${ang(p)} × ${ang(l)} × ${ang(jumlah, 0)} = ${ang(denah)} m²`
        + (derajat > 0 ? ` ÷ cos ${ang(derajat, 0)}° (×${ang(fk, 3)})` : ' (datar)')
        + (faktor !== 1 ? ` × faktor ${ang(faktor)}` : '')

      if (derajat === 0) {
        catatan.push(
          'Kemiringan 0° — dihitung sebagai atap DATAR (dak). Untuk atap '
          + 'genteng, isi kemiringannya: pada 30° luasnya 15,5% lebih besar '
          + 'daripada denah, dan selisih itu genteng yang tak terbeli.',
        )
      }
      break
    }

    /*
      DINDING — luas kotor DIKURANGI bukaan.

      Inilah yang tak dilakukan `takeoff-dimensi.ts`, dan akibatnya
      terbesar di sektor yang paling banyak barisnya: plesteran, acian, cat.
    */
    case 'dinding': {
      const p = wajibPositif('panjang', input.panjangM)
      const t = wajibPositif('tinggi', input.tinggiM)
      const kotor = p * t * jumlah
      bukaanM2 = luasBukaan(input.bukaan ?? [])

      if (bukaanM2 >= kotor) {
        throw new Error(
          `luas bukaan (${ang(bukaanM2)} m²) >= luas dinding (${ang(kotor)} m²) — `
          + 'periksa ukurannya; dinding tak bisa habis oleh bukaannya sendiri.',
        )
      }
      volume = (kotor - bukaanM2) * faktor

      const daftar = (input.bukaan ?? [])
        .map((b) => `${b.nama} ${ang(b.lebarM)}×${ang(b.tinggiM)}×${b.jumlah}`)
        .join(' + ')
      rincian = `${ang(p)} × ${ang(t)} × ${ang(jumlah, 0)} = ${ang(kotor)} m²`
        + (bukaanM2 > 0 ? ` − bukaan ${ang(bukaanM2)} m² (${daftar})` : '')
        + (faktor !== 1 ? ` × faktor ${ang(faktor)}` : '')

      if (bukaanM2 === 0) {
        catatan.push(
          'Tidak ada bukaan yang dikurangkan. Kalau dinding ini punya pintu '
          + 'atau jendela, luasnya kelebihan — satu pintu 0,9×2,1 dan satu '
          + 'jendela 1,2×1,2 pada dinding 4×3 m sudah 28% dari luasnya.',
        )
      }
      break
    }

    /*
      LUAS DENAH — plafon, lantai, daun pintu/jendela.

      Bukaan TIDAK dikurangkan di sini: plafon tak berlubang, dan lantai yang
      berlubang (void tangga) diisi sebagai baris terpisah bernilai negatif
      lebih menyesatkan daripada sebagai baris tersendiri yang jelas.
    */
    case 'plafon':
    case 'lantai':
    case 'daun': {
      const p = wajibPositif('panjang', input.panjangM)
      const l = wajibPositif('lebar', input.lebarM)
      volume = p * l * jumlah * faktor
      rincian = `${ang(p)} × ${ang(l)} × ${ang(jumlah, 0)} = ${ang(p * l * jumlah)} m²`
        + (faktor !== 1 ? ` × faktor ${ang(faktor)}` : '')
      break
    }
  }

  if (!Number.isFinite(volume) || volume <= 0) {
    throw new Error(`volume hasil tak masuk akal: ${volume}`)
  }

  return {
    uraian: input.uraian,
    sektor: input.sektor,
    lokasi: input.lokasi,
    /*
      DIBULATKAN 4 desimal, bukan disimpan penuh.

      Sisa float (12.000000000000002) yang mendarat di RAB terbaca sebagai
      ketelitian yang tak pernah ada, dan membuat dua angka yang sama terlihat
      berbeda saat dibandingkan.
    */
    volume: Math.round(volume * 1e4) / 1e4,
    satuan: SATUAN_SEKTOR[input.sektor],
    rincian,
    bukaanM2: Math.round(bukaanM2 * 1e4) / 1e4,
    catatan,
  }
}

export interface RekapSektor {
  sektor: Sektor
  satuan: string
  total: number
  jumlahBaris: number
  /** Total luas bukaan yang dikurangkan di sektor ini, m². */
  totalBukaanM2: number
}

/**
 * Jumlahkan per sektor.
 *
 * Dikelompokkan per SEKTOR, bukan dijumlahkan jadi satu angka: m² plafon dan
 * m² dinding punya AHSP yang berbeda jauh harganya, dan menjumlahkannya
 * menghasilkan angka yang terlihat wajar sambil tak berarti apa-apa.
 */
export function rekapSektor(baris: readonly BarisSektorHasil[]): RekapSektor[] {
  const peta = new Map<Sektor, RekapSektor>()
  for (const b of baris) {
    const ada = peta.get(b.sektor)
    if (ada) {
      ada.total += b.volume
      ada.jumlahBaris += 1
      ada.totalBukaanM2 += b.bukaanM2
    } else {
      peta.set(b.sektor, {
        sektor: b.sektor,
        satuan: b.satuan,
        total: b.volume,
        jumlahBaris: 1,
        totalBukaanM2: b.bukaanM2,
      })
    }
  }
  for (const r of peta.values()) {
    r.total = Math.round(r.total * 1e4) / 1e4
    r.totalBukaanM2 = Math.round(r.totalBukaanM2 * 1e4) / 1e4
  }
  // Urut mengikuti urutan pengerjaan di lapangan, bukan abjad.
  return [...peta.values()].sort(
    (a, b) => SEKTOR_SAH.indexOf(a.sektor) - SEKTOR_SAH.indexOf(b.sektor),
  )
}
