/**
 * INSTRUKSI LAPANGAN — mendesaknya konfirmasi & jalur tindak lanjut. PURE.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA KONFIRMASI PUNYA UMUR
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Perintah lisan yang dicatat sepihak **bukan bukti** — ia versi kita. Yang
 * membuatnya berjejak adalah konfirmasi balik ke pemberi perintah.
 *
 * Tapi konfirmasi itu punya UMUR. Surat konfirmasi yang dikirim hari yang sama
 * ("menindaklanjuti instruksi Bapak pagi ini…") nyaris tak pernah dibantah.
 * Surat yang sama, dikirim tiga bulan kemudian setelah tagihan ditolak,
 * terbaca sebagai rekonstruksi — dan memang begitulah ia akan diperlakukan.
 *
 * Karena itu fungsi di sini tidak menjawab "sudah dikonfirmasi atau belum",
 * melainkan **seberapa mendesak konfirmasinya sekarang** — dan untuk yang sudah
 * lewat, seberapa besar nilainya masih tersisa.
 *
 * ── Bentuk perintah menentukan mendesaknya
 *
 *   lisan, telepon   → paling mudah disangkal. Mendesak.
 *   whatsapp, rapat  → ada jejak, tapi jejak yang bisa dipersoalkan.
 *   tertulis         → sudah berjejak; konfirmasi tak menambah apa pun.
 *
 * Menyamakan semuanya membuat daftar "belum dikonfirmasi" dipenuhi instruksi
 * tertulis yang memang tak butuh apa-apa — dan yang benar-benar mendesak
 * tenggelam di dalamnya.
 *
 * ── Fail-closed
 *
 * Waktu yang tak terbaca MENOLAK, bukan dianggap aman. Instruksi yang lolos
 * karena tanggalnya rusak adalah instruksi yang umur konfirmasinya tak pernah
 * dijaga.
 */

export type BentukPerintah = 'lisan' | 'telepon' | 'whatsapp' | 'rapat' | 'tertulis'

export type StatusInstruksi =
  | 'dicatat' | 'dikonfirmasi' | 'dilaksanakan' | 'ditolak' | 'disangkal'

/**
 * Batas jam konfirmasi masih "segera" per bentuk perintah.
 *
 * 24 jam untuk lisan/telepon bukan angka sembarang: itu praktik lazim di
 * kontrak konstruksi (konfirmasi tertulis atas instruksi lisan dalam 1×24 jam),
 * dan menjadikannya default berarti sistem mengajarkan disiplin yang benar
 * tanpa perlu ada yang mengajari.
 */
const BATAS_SEGERA_JAM: Record<BentukPerintah, number | null> = {
  lisan: 24,
  telepon: 24,
  whatsapp: 72,   // ada jejak, tapi jejak yang bisa dihapus/dipersoalkan
  rapat: 72,      // biasanya menunggu notulen
  tertulis: null, // sudah berjejak — konfirmasi tak menambah apa pun
}

export interface MasukanKonfirmasi {
  bentuk: BentukPerintah
  status: StatusInstruksi
  /** ISO timestamp saat perintah diterima. */
  diterimaPada: string
  /** ISO timestamp konfirmasi, bila sudah. */
  dikonfirmasiPada?: string | null
  /** Waktu acuan — disuntikkan supaya fungsinya murni & bisa diuji. */
  sekarang: string
}

export interface HasilKonfirmasi {
  /**
   * `tak_perlu`   — instruksi tertulis, atau sudah selesai/ditolak
   * `terkonfirmasi_segera` — dikonfirmasi dalam batas; nilai buktinya penuh
   * `terkonfirmasi_lambat` — dikonfirmasi tapi lewat batas; nilainya berkurang
   * `mendesak`    — belum dikonfirmasi, masih dalam batas
   * `lewat`       — belum dikonfirmasi dan batasnya lewat
   * `disangkal`   — pemberi menyatakan tak pernah memberi perintah
   * `tak_terbaca` — waktu rusak; ditolak, bukan diloloskan
   */
  keadaan:
    | 'tak_perlu' | 'terkonfirmasi_segera' | 'terkonfirmasi_lambat'
    | 'mendesak' | 'lewat' | 'disangkal' | 'tak_terbaca'
  /** Jam sejak perintah diterima. `null` bila tak terhitung. */
  jamBerlalu: number | null
  /** Sisa jam sampai batas. Negatif = lewat. `null` bila tak berlaku. */
  sisaJam: number | null
  pesan: string
}

function keMs(s: string): number | null {
  if (typeof s !== 'string' || !s.trim()) return null
  const t = Date.parse(s)
  return Number.isFinite(t) ? t : null
}

const bulat1 = (n: number) => Math.round(n * 10) / 10

/**
 * Seberapa mendesak konfirmasi sebuah instruksi — dan bila sudah, seberapa
 * besar nilai buktinya masih tersisa.
 */
export function evaluasiKonfirmasi(m: MasukanKonfirmasi): HasilKonfirmasi {
  const kosong = { jamBerlalu: null, sisaJam: null }

  // Disangkal = sengketa terbuka. Ia BUKAN "belum dikonfirmasi", dan
  // menampilkannya di daftar mendesak membuat orang mengira masih bisa
  // dikejar — padahal yang dibutuhkan sudah berbeda: bukti lain.
  if (m.status === 'disangkal') {
    return {
      keadaan: 'disangkal', ...kosong,
      pesan: 'Pemberi perintah menyangkal pernah memberikannya. Butuh bukti lain ' +
             '(saksi, rekaman rapat, foto pekerjaan yang diperintahkan).',
    }
  }

  // Ditolak/dilaksanakan = perkaranya sudah selesai satu arah atau lain.
  if (m.status === 'ditolak' || m.status === 'dilaksanakan') {
    return { keadaan: 'tak_perlu', ...kosong, pesan: 'Instruksi sudah selesai diproses.' }
  }

  const batasJam = BATAS_SEGERA_JAM[m.bentuk]
  if (batasJam === null) {
    return {
      keadaan: 'tak_perlu', ...kosong,
      pesan: 'Instruksi tertulis sudah berjejak — konfirmasi tak menambah apa pun.',
    }
  }

  const diterima = keMs(m.diterimaPada)
  if (diterima === null) {
    return { keadaan: 'tak_terbaca', ...kosong, pesan: 'Waktu penerimaan tidak terbaca.' }
  }

  const konfirmasi = m.dikonfirmasiPada ? keMs(m.dikonfirmasiPada) : null
  if (m.dikonfirmasiPada && konfirmasi === null) {
    return { keadaan: 'tak_terbaca', ...kosong, pesan: 'Waktu konfirmasi tidak terbaca.' }
  }

  if (konfirmasi !== null) {
    if (konfirmasi < diterima) {
      // Konfirmasi mendahului perintahnya = data rusak, bukan "sangat cepat".
      return {
        keadaan: 'tak_terbaca', ...kosong,
        pesan: 'Waktu konfirmasi mendahului waktu perintah diterima.',
      }
    }
    const jam = bulat1((konfirmasi - diterima) / 3_600_000)
    if (jam <= batasJam) {
      return {
        keadaan: 'terkonfirmasi_segera', jamBerlalu: jam, sisaJam: bulat1(batasJam - jam),
        pesan: `Dikonfirmasi ${jam} jam setelah perintah (batas ${batasJam} jam). ` +
               'Nilai buktinya penuh.',
      }
    }
    return {
      keadaan: 'terkonfirmasi_lambat', jamBerlalu: jam, sisaJam: bulat1(batasJam - jam),
      pesan:
        `Dikonfirmasi ${jam} jam setelah perintah, melewati batas ${batasJam} jam. ` +
        'Konfirmasi terlambat lebih mudah dibantah sebagai rekonstruksi.',
    }
  }

  const kini = keMs(m.sekarang)
  if (kini === null) {
    return { keadaan: 'tak_terbaca', ...kosong, pesan: 'Waktu acuan tidak terbaca.' }
  }

  const jam = bulat1((kini - diterima) / 3_600_000)
  const sisa = bulat1(batasJam - jam)

  if (sisa < 0) {
    return {
      keadaan: 'lewat', jamBerlalu: jam, sisaJam: sisa,
      pesan:
        `Belum dikonfirmasi ${jam} jam setelah perintah ${m.bentuk} ` +
        `(batas ${batasJam} jam). Makin lama, makin mudah disangkal.`,
    }
  }
  return {
    keadaan: 'mendesak', jamBerlalu: jam, sisaJam: sisa,
    pesan: `Sisa ${sisa} jam untuk mengonfirmasi tertulis instruksi ${m.bentuk} ini.`,
  }
}

export interface MasukanJalurTindakLanjut {
  berdampakBiaya: boolean
  berdampakWaktu: boolean
}

export interface JalurTindakLanjut {
  /** Jalur yang HARUS ditempuh. Kosong = tak ada tindak lanjut kontraktual. */
  jalur: Array<'klaim' | 'eot'>
  pesan: string
}

/**
 * Jalur tindak lanjut yang dipicu sebuah instruksi.
 *
 * Dipisah karena keduanya menuju modul BERBEDA — biaya ke `contract_claims`
 * (184), waktu ke `contract_eot` (152) — dan satu instruksi bisa memicu
 * keduanya, salah satunya, atau tak satu pun.
 *
 * Menyatukannya jadi satu boolean memaksa penerima menebak jalur mana yang
 * harus ditempuh, dan tebakan salah berarti klaim tak pernah diajukan atau EOT
 * tak pernah dimintakan — dua-duanya uang yang hilang tanpa ada yang tahu.
 */
export function jalurTindakLanjut(m: MasukanJalurTindakLanjut): JalurTindakLanjut {
  const jalur: Array<'klaim' | 'eot'> = []
  if (m.berdampakBiaya) jalur.push('klaim')
  if (m.berdampakWaktu) jalur.push('eot')

  if (jalur.length === 0) {
    return { jalur, pesan: 'Instruksi ini tidak menimbulkan tuntutan biaya maupun waktu.' }
  }
  if (jalur.length === 2) {
    return {
      jalur,
      pesan: 'Instruksi ini menuntut DUA jalur: klaim biaya (contract_claims) ' +
             'DAN perpanjangan waktu (contract_eot). Mengajukan satu saja ' +
             'membuang yang lain.',
    }
  }
  return {
    jalur,
    pesan: jalur[0] === 'klaim'
      ? 'Instruksi ini menuntut klaim biaya tambahan.'
      : 'Instruksi ini menuntut perpanjangan waktu (EOT).',
  }
}
