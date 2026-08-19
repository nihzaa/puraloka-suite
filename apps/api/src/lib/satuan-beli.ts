// Konversi satuan RAB → satuan PEMBELIAN (RAP). PURE, tanpa I/O.
//
// ══════════════════════════════════════════════════════════════════════════════
// KENAPA BERKAS INI ADA
// ══════════════════════════════════════════════════════════════════════════════
//
// RAB memakai satuan ANALISA — yang dipakai AHSP menyusun harga jual:
//
//     besi & baja   kg        cat        kg atau liter
//     keramik       m²        pipa       m
//     bata          buah      kayu       m³
//
// RAP memakai satuan PEMBELIAN — yang benar-benar dipesan ke supplier:
//
//     besi & baja   batang 12 m       cat        kaleng/pail
//     keramik       dus (isi n m²)    pipa       lonjor 4 m atau 6 m
//     bata          buah              kayu       batang/lembar
//
// Bedanya bukan sekadar penamaan: **barang dijual utuh dan sisanya tak bisa
// dikembalikan.** Keramik 47 m² untuk ruangan 45 m² berarti 32 dus (isi 1,44
// m²) = 46,08 m² — kurang. Jadi 33 dus, dan sisa 1,4 m² jadi milik proyek.
//
// RAP yang memakai satuan RAB kekurangan uang untuk sisa itu di SETIAP
// material — dan kekurangannya tak pernah terlihat, karena angkanya "benar"
// menurut satuan yang dipakai. Yang ketahuan cuma akibatnya: belanja aktual
// selalu melebihi RAP, dan tak ada yang bisa menunjuk sebabnya.
//
// ── Kenapa PEMBULATAN KE ATAS, selalu
//
// Tak ada supplier yang menjual 0,7 kaleng cat. Membulatkan ke bawah atau ke
// terdekat berarti RAP yang tak bisa dibelanjakan.
//
// ── Kenapa isi-per-satuan bisa DIUBAH per proyek
//
// Isi satu dus keramik berbeda antar merek (1,44 m² untuk 60×60 isi 4, tetapi
// 1,08 m² untuk 30×60 isi 6). Angka bawaan di sini adalah yang paling lazim
// di pasar Indonesia; yang tahu isi sebenarnya adalah orang yang memesan, dan
// ia harus bisa menimpanya tanpa mengubah kode.
//
// ⚠ Angka bawaan di bawah adalah KEBIASAAN PASAR, bukan standar. Ia bisa
// berbeda antar daerah dan antar merek — karena itu tiap baris menyebut
// asumsinya, dan tiap konversi memulangkan `asumsi` supaya ikut terbaca di
// layar RAP alih-alih tersembunyi di kode.
// ══════════════════════════════════════════════════════════════════════════════

/** Satuan pembelian yang dikenali. */
export type SatuanBeli =
  | 'btg'    // batang — besi, baja profil, pipa, kayu
  | 'lbr'    // lembar — pelat, triplek, gypsum, seng
  | 'dus'    // dus/box — keramik, granit
  | 'sak'    // sak — semen, mortar instan
  | 'klg'    // kaleng/pail — cat, waterproofing
  | 'rol'    // rol — kawat, kabel, membran
  | 'bh'     // buah — sanitair, fitting, bata (dijual satuan)
  | 'm3'     // kubik — pasir, split, tanah urug (dijual per rit/kubik)

export interface AturanBeli {
  /** Satuan yang dipakai RAB/AHSP. */
  satuanRab: string
  satuanBeli: SatuanBeli
  /**
   * Berapa satuan RAB dalam SATU satuan beli.
   *
   * Contoh: keramik 60×60 → 1 dus = 1,44 m², jadi `isiPerSatuan: 1.44`.
   */
  isiPerSatuan: number
  /** Keterangan yang WAJIB ikut terbaca — asumsi ini bisa salah per proyek. */
  asumsi: string
}

/**
 * Aturan bawaan per kata kunci material.
 *
 * Dicocokkan dengan `includes` pada nama material yang dihuruf-kecilkan, urut
 * dari yang paling spesifik. Pola pertama yang cocok menang — jadi "besi
 * beton" harus berada SEBELUM "besi".
 *
 * Ditulis sebagai DATA berurutan, bukan objek: urutan pencocokan adalah bagian
 * dari kebenarannya, dan objek tak menjamin urutan yang terbaca.
 */
export const ATURAN_BELI: ReadonlyArray<{ pola: string[]; aturan: AturanBeli }> = [
  // ── Besi & baja ───────────────────────────────────────────────────────────
  {
    pola: ['baja profil', 'wf ', 'h-beam', 'hbeam', 'cnp', 'inp', 'kanal'],
    aturan: {
      satuanRab: 'kg', satuanBeli: 'btg', isiPerSatuan: 0,
      asumsi: 'Baja profil dijual per batang; panjang standar 12 m (CNP/kanal '
        + 'ringan sering 6 m). Isi per batang dihitung dari berat per meter '
        + 'profil yang dipilih, bukan dari angka tetap.',
    },
  },
  {
    pola: ['besi beton', 'besi ulir', 'besi polos', 'baja tulangan', 'tulangan'],
    aturan: {
      satuanRab: 'kg', satuanBeli: 'btg', isiPerSatuan: 0,
      asumsi: 'Besi beton dijual per lonjor 12 m. Berat per lonjor bergantung '
        + 'diameter — dihitung dari diameternya, bukan angka tetap.',
    },
  },
  {
    pola: ['pelat baja', 'plat baja', 'besi plat'],
    aturan: {
      satuanRab: 'kg', satuanBeli: 'lbr', isiPerSatuan: 0,
      asumsi: 'Pelat baja dijual per lembar 1,2 × 2,4 m. Berat per lembar '
        + 'bergantung tebalnya.',
    },
  },
  {
    pola: ['kawat las', 'elektroda'],
    aturan: {
      satuanRab: 'kg', satuanBeli: 'dus', isiPerSatuan: 5,
      asumsi: 'Kawat las dijual per dus 5 kg (ada juga 2,5 kg dan 20 kg).',
    },
  },
  {
    pola: ['kawat beton', 'kawat bendrat'],
    aturan: {
      satuanRab: 'kg', satuanBeli: 'rol', isiPerSatuan: 25,
      asumsi: 'Kawat bendrat dijual per rol 25 kg.',
    },
  },

  // ── Semen & agregat ───────────────────────────────────────────────────────
  {
    pola: ['semen portland', 'semen pc', 'portland composite', 'semen'],
    aturan: {
      satuanRab: 'kg', satuanBeli: 'sak', isiPerSatuan: 50,
      asumsi: 'Semen dijual per sak 50 kg. Sebagian merek memakai 40 kg — '
        + 'periksa ke supplier setempat.',
    },
  },
  {
    pola: ['mortar instan', 'semen instan', 'perekat bata ringan'],
    aturan: {
      satuanRab: 'kg', satuanBeli: 'sak', isiPerSatuan: 40,
      asumsi: 'Mortar instan dijual per sak 40 kg.',
    },
  },
  {
    pola: ['pasir', 'split', 'kerikil', 'batu pecah', 'sirtu', 'tanah urug'],
    aturan: {
      satuanRab: 'm3', satuanBeli: 'm3', isiPerSatuan: 1,
      asumsi: 'Agregat dijual per kubik, biasanya per rit truk (3-7 m³). '
        + 'Kubikasi kecil sering dikenakan harga minimum satu rit.',
    },
  },

  // ── Penutup lantai & dinding ──────────────────────────────────────────────
  {
    pola: ['keramik 60x60', 'granit 60x60', 'granit tile 60'],
    aturan: {
      satuanRab: 'm2', satuanBeli: 'dus', isiPerSatuan: 1.44,
      asumsi: 'Keramik/granit 60×60 dijual per dus isi 4 keping = 1,44 m². '
        + 'Isi per dus berbeda antar merek — periksa sebelum memesan.',
    },
  },
  {
    pola: ['keramik 40x40'],
    aturan: {
      satuanRab: 'm2', satuanBeli: 'dus', isiPerSatuan: 0.96,
      asumsi: 'Keramik 40×40 dijual per dus isi 6 keping = 0,96 m².',
    },
  },
  {
    pola: ['keramik 30x30', 'keramik 25x25', 'keramik 20x20', 'keramik'],
    aturan: {
      satuanRab: 'm2', satuanBeli: 'dus', isiPerSatuan: 1.0,
      asumsi: 'Keramik ukuran kecil dijual per dus isi ±1 m². Isi persisnya '
        + 'berbeda antar ukuran dan merek — periksa sebelum memesan.',
    },
  },
  {
    pola: ['bata ringan', 'hebel', 'celcon'],
    aturan: {
      satuanRab: 'm3', satuanBeli: 'm3', isiPerSatuan: 1,
      asumsi: 'Bata ringan dijual per kubik (1 m³ ≈ 83 buah untuk 10 cm, '
        + '≈ 111 buah untuk 7,5 cm).',
    },
  },
  {
    pola: ['bata merah', 'batako', 'bata'],
    aturan: {
      satuanRab: 'bh', satuanBeli: 'bh', isiPerSatuan: 1,
      asumsi: 'Bata dijual per buah, tetapi dikirim per 1.000 buah (satu rit '
        + 'pickup). Pesanan di bawah itu sering dikenakan ongkos kirim penuh, '
        + 'jadi bulatkan ke atas ke kelipatan 1.000 saat memesan.',
    },
  },

  // ── Kayu & papan ──────────────────────────────────────────────────────────
  {
    pola: ['triplek', 'plywood', 'multiplek'],
    aturan: {
      satuanRab: 'm2', satuanBeli: 'lbr', isiPerSatuan: 2.976,
      asumsi: 'Triplek dijual per lembar 122 × 244 cm = 2,976 m².',
    },
  },
  {
    pola: ['gypsum', 'gipsum', 'kalsiboard', 'grc board'],
    aturan: {
      satuanRab: 'm2', satuanBeli: 'lbr', isiPerSatuan: 2.88,
      asumsi: 'Papan gypsum dijual per lembar 120 × 240 cm = 2,88 m².',
    },
  },
  {
    pola: ['kayu balok', 'kayu kelas', 'kaso', 'reng', 'kayu'],
    aturan: {
      satuanRab: 'm3', satuanBeli: 'btg', isiPerSatuan: 0,
      asumsi: 'Kayu dijual per batang 4 m. Isi per batang bergantung '
        + 'penampangnya — dihitung dari dimensi, bukan angka tetap.',
    },
  },

  // ── Atap ──────────────────────────────────────────────────────────────────
  {
    pola: ['seng gelombang', 'spandek', 'galvalum lembaran', 'atap metal'],
    aturan: {
      satuanRab: 'm2', satuanBeli: 'lbr', isiPerSatuan: 0,
      asumsi: 'Atap lembaran dijual per lembar; luas per lembar bergantung '
        + 'panjang pesanan (biasanya dipotong sesuai kebutuhan).',
    },
  },
  {
    pola: ['genteng'],
    aturan: {
      satuanRab: 'bh', satuanBeli: 'bh', isiPerSatuan: 1,
      asumsi: 'Genteng dijual per buah. Kebutuhan per m² bergantung jenis '
        + '(keramik ±14 bh/m², beton ±11 bh/m²).',
    },
  },

  // ── Cat & pelapis ─────────────────────────────────────────────────────────
  {
    pola: ['cat tembok', 'cat dinding', 'cat interior', 'cat eksterior'],
    aturan: {
      satuanRab: 'kg', satuanBeli: 'klg', isiPerSatuan: 25,
      asumsi: 'Cat tembok dijual per pail 25 kg (ada juga galon 5 kg dan '
        + 'kaleng 2,5 kg). Daya sebar ±10 m²/kg per lapis.',
    },
  },
  {
    pola: ['cat besi', 'cat kayu', 'menie', 'zinc chromate', 'cat'],
    aturan: {
      satuanRab: 'kg', satuanBeli: 'klg', isiPerSatuan: 5,
      asumsi: 'Cat besi/kayu dijual per kaleng 5 kg (ada juga 1 kg dan 20 kg).',
    },
  },
  {
    pola: ['waterproofing', 'pelapis anti bocor'],
    aturan: {
      satuanRab: 'kg', satuanBeli: 'klg', isiPerSatuan: 20,
      asumsi: 'Waterproofing dijual per pail 20 kg.',
    },
  },

  // ── MEP ───────────────────────────────────────────────────────────────────
  {
    pola: ['pipa pvc', 'pipa hdpe', 'pipa besi', 'pipa baja', 'pipa'],
    aturan: {
      satuanRab: 'm', satuanBeli: 'btg', isiPerSatuan: 4,
      asumsi: 'Pipa PVC dijual per lonjor 4 m. Pipa besi/HDPE sering 6 m — '
        + 'periksa jenisnya.',
    },
  },
  {
    pola: ['kabel nym', 'kabel nya', 'kabel listrik', 'kabel'],
    aturan: {
      satuanRab: 'm', satuanBeli: 'rol', isiPerSatuan: 50,
      asumsi: 'Kabel dijual per rol 50 m (ada juga 100 m).',
    },
  },
  {
    pola: ['saklar', 'stop kontak', 'fitting', 'mcb', 'lampu'],
    aturan: {
      satuanRab: 'bh', satuanBeli: 'bh', isiPerSatuan: 1,
      asumsi: 'Komponen listrik dijual per buah, tetapi sebagian dikirim per '
        + 'lusin atau per dus isi 10-20. Untuk pemesanan besar, tanyakan '
        + 'kelipatan minimumnya ke supplier.',
    },
  },
  {
    pola: ['kloset', 'wastafel', 'urinoir', 'bak mandi', 'kran', 'floor drain'],
    aturan: {
      satuanRab: 'bh', satuanBeli: 'bh', isiPerSatuan: 1,
      asumsi: 'Sanitair dijual per unit/buah, biasanya sudah termasuk '
        + 'aksesori bawaannya. Fitting penyambung (flexible, seal tape, '
        + 'stop kran) sering TERPISAH — periksa isi paketnya.',
    },
  },
]

export interface HasilKonversi {
  /** Kuantitas yang harus DIBELI, sudah dibulatkan ke atas. */
  kuantitasBeli: number
  satuanBeli: SatuanBeli
  /** Kuantitas RAB aslinya — dibawa supaya selisihnya terlihat. */
  kuantitasRab: number
  satuanRab: string
  /** Berapa satuan RAB dalam satu satuan beli. */
  isiPerSatuan: number
  /**
   * Kelebihan yang IKUT TERBELI karena barang dijual utuh.
   *
   * Ditampilkan, bukan disembunyikan: inilah selisih yang membuat belanja
   * aktual selalu melebihi RAP kalau RAP disusun dengan satuan RAB.
   */
  sisaTerbeli: number
  asumsi: string
}

/**
 * Cari aturan pembelian untuk sebuah material.
 *
 * `null` bila tak ada yang cocok — dan itu DISENGAJA. Menebak satuan beli
 * untuk material yang tak dikenali menghasilkan RAP yang terlihat lengkap
 * sambil salah; lebih baik pemanggil tahu bahwa ia harus mengisinya sendiri.
 */
export function cariAturanBeli(namaMaterial: string): AturanBeli | null {
  const nama = namaMaterial.toLowerCase()
  for (const { pola, aturan } of ATURAN_BELI) {
    if (pola.some((p) => nama.includes(p))) return aturan
  }
  return null
}

/**
 * Konversi kuantitas RAB ke kuantitas pembelian.
 *
 * PEMBULATAN SELALU KE ATAS — tak ada supplier yang menjual 0,7 kaleng cat.
 * Membulatkan ke bawah atau ke terdekat menghasilkan RAP yang tak bisa
 * dibelanjakan.
 *
 * `isiPerSatuan` bisa ditimpa lewat argumen: isi satu dus keramik berbeda
 * antar merek, dan yang tahu angkanya adalah orang yang memesan.
 */
export function konversiKeBeli(
  namaMaterial: string,
  kuantitasRab: number,
  isiPerSatuanTimpa?: number,
): HasilKonversi | null {
  const aturan = cariAturanBeli(namaMaterial)
  if (!aturan) return null

  const isi = isiPerSatuanTimpa ?? aturan.isiPerSatuan

  /*
    `isiPerSatuan: 0` berarti isinya BERGANTUNG PADA BARANGNYA dan tak bisa
    ditulis sebagai angka tetap — besi Ø10 dan Ø16 punya berat per lonjor yang
    jauh berbeda, begitu juga kayu 5/7 dan 8/12.

    Memulangkan null memaksa pemanggil menghitungnya dari dimensi yang ia
    punya, alih-alih memakai angka karangan yang terlihat masuk akal.
  */
  if (!(isi > 0)) return null

  const kuantitasBeli = Math.ceil(kuantitasRab / isi)
  const terbeli = kuantitasBeli * isi

  return {
    kuantitasBeli,
    satuanBeli: aturan.satuanBeli,
    kuantitasRab,
    satuanRab: aturan.satuanRab,
    isiPerSatuan: isi,
    sisaTerbeli: terbeli - kuantitasRab,
    asumsi: aturan.asumsi,
  }
}

/**
 * Konversi besi beton: kg → lonjor 12 m, dihitung dari DIAMETERNYA.
 *
 * Dipisah dari `konversiKeBeli` karena isinya tak bisa ditulis sebagai angka
 * tetap — dan menaruh angka tetap di sana akan membuat besi Ø10 dan Ø16
 * dihitung sama, yaitu kesalahan 2,5× lipat.
 */
export function konversiBesiBeton(
  diameterMm: number, totalKg: number, panjangLonjorM = 12,
): HasilKonversi {
  // Berat besi per meter = 0,0061654 · d² (turunan fisika, sama dengan
  // `KOEF_BERAT_BESI` di struktur-beton.ts).
  const beratPerM = 0.0061654 * diameterMm * diameterMm
  const beratPerLonjor = beratPerM * panjangLonjorM
  const lonjor = Math.ceil(totalKg / beratPerLonjor)

  return {
    kuantitasBeli: lonjor,
    satuanBeli: 'btg',
    kuantitasRab: totalKg,
    satuanRab: 'kg',
    isiPerSatuan: beratPerLonjor,
    sisaTerbeli: lonjor * beratPerLonjor - totalKg,
    asumsi: `Besi Ø${diameterMm} dijual per lonjor ${panjangLonjorM} m `
      + `(${beratPerLonjor.toFixed(2)} kg per lonjor). Sisa potongan dari `
      + `pembulatan ini biasanya masih bisa dipakai untuk sengkang atau `
      + `tulangan pendek — tetapi tak selalu, dan itu keputusan pelaksana.`,
  }
}

/**
 * Konversi baja profil: kg → batang, dihitung dari BERAT PER METER profilnya.
 *
 * Sama alasannya dengan besi beton: WF 200 (21,3 kg/m) dan WF 400 (66 kg/m)
 * punya berat per batang yang jauh berbeda.
 */
export function konversiBajaProfil(
  beratKgPerM: number, totalKg: number, panjangBatangM = 12,
): HasilKonversi {
  const beratPerBatang = beratKgPerM * panjangBatangM
  const batang = Math.ceil(totalKg / beratPerBatang)

  return {
    kuantitasBeli: batang,
    satuanBeli: 'btg',
    kuantitasRab: totalKg,
    satuanRab: 'kg',
    isiPerSatuan: beratPerBatang,
    sisaTerbeli: batang * beratPerBatang - totalKg,
    asumsi: `Baja profil dijual per batang ${panjangBatangM} m `
      + `(${beratPerBatang.toFixed(1)} kg per batang). Sisa potongan profil `
      + `jarang terpakai di tempat lain karena ukurannya spesifik — `
      + `anggarkan sebagai kehilangan, bukan sisa yang bisa dipakai.`,
  }
}
