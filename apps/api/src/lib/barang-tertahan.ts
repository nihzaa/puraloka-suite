/**
 * BARANG TERTAHAN — kiriman yang tak pernah sampai, dan tak pernah ditanyakan.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * PO YANG "SUDAH DIPESAN" TIDAK BERARTI BARANGNYA DATANG
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Otomasi pengadaan yang sudah ada menjaga sisi PEMESANAN: MR menunggu
 * persetujuan, PO belum dikirim, pemasok telat merespons. Semuanya berhenti
 * begitu PO diterbitkan.
 *
 * Yang terjadi sesudahnya tak dijaga siapa pun. Barang berangkat, lalu diam.
 * Tabel `expediting` mencatatnya, dan tak satu pun otomasi membacanya.
 *
 * Diukur 2026-08-16:
 *
 *   PO-2026-001  Toko Bangunan Maju Jaya · Rp 40.200.000
 *                janji vendor 2026-04-01, perkiraan tiba 2026-04-08
 *                status `dalam_perjalanan` · "Gudang transit Cikarang"
 *                tiba_aktual NULL  ->  LEWAT 132 HARI
 *
 *   PO-2026-002  Toko Keramik Indah · Rp 9.775.000
 *                status `tertahan` di Pelabuhan Tanjung Priok · LEWAT 85 HARI
 *                sebab: "Dokumen impor kurang lengkap — menunggu SNI marking"
 *
 * Empat bulan barang berhenti di gudang transit tanpa satu pun peringatan.
 * Di lapangan, ini yang menghentikan pekerjaan sementara semua orang mengira
 * materialnya "sudah dipesan".
 *
 * ══════════════════════════════════════════════════════════════════════════
 * TERTAHAN DIPISAHKAN DARI TERLAMBAT — sengaja
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Keduanya sama-sama berarti barang tak sampai, tetapi tindakannya berbeda
 * sama sekali:
 *
 *   TERTAHAN   ada penyebab yang TERTULIS dan biasanya butuh tindakan
 *              administratif — dokumen bea cukai, sertifikat SNI, pembayaran
 *              tertunda. Orang yang menyelesaikannya duduk di kantor, dan
 *              pesannya harus MENYEBUT sebabnya, karena sebab itulah
 *              pekerjaannya.
 *   TERLAMBAT  tak ada sebab tercatat. Yang dibutuhkan cuma satu telepon ke
 *              pemasok. Pesannya harus menyebut lokasi terakhir, karena
 *              itulah satu-satunya petunjuk yang dipunya.
 *
 * Menggabungkan keduanya jadi "barang terlambat" menghasilkan pesan yang benar
 * tetapi tak bisa dikerjakan siapa pun.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * DUA TANGGAL, DAN YANG DIPAKAI ADALAH YANG PALING BELAKANG
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `janji_vendor` adalah yang dijanjikan pemasok; `perkiraan_tiba` adalah
 * perkiraan logistik sesudah memperhitungkan perjalanan.
 *
 * Yang dipakai sebagai tenggat adalah yang TERAKHIR dari keduanya. Memakai
 * yang paling awal membuat setiap kiriman normal terlihat telat sejak hari
 * pertama — dan peringatan yang berbunyi untuk kiriman sehat adalah cara
 * tercepat membuat orang mematikan seluruh peringatan pengadaan.
 */

export interface Kiriman {
  /** `dipesan` · `dalam_perjalanan` · `tertahan` · `tiba` · `batal` · … */
  status: string
  /** Hari sejak tenggat terakhir. Negatif = belum jatuh tempo. `null` = tak bertanggal. */
  lewatHari: number | null
  sebabTertahan: string | null
  sudahTiba: boolean
}

export interface HasilKiriman {
  perlu: boolean
  sebab: 'aman' | 'tertahan' | 'terlambat' | 'tanpa_tenggat'
}

/** Status yang berarti kirimannya tak lagi berjalan. */
const SELESAI = new Set(['tiba', 'diterima', 'batal', 'dibatalkan'])

/**
 * @param ambangTertahan  hari sesudah tenggat sebelum kiriman TERTAHAN ditegur
 * @param ambangTerlambat hari sesudah tenggat sebelum kiriman biasa ditegur
 */
export function nilaiKiriman(
  k: Kiriman,
  ambangTertahan: number,
  ambangTerlambat: number,
): HasilKiriman {
  const status = (k.status ?? '').trim().toLowerCase()

  /*
    `tiba_aktual` terisi MENUTUP perkara, apa pun status yang tertulis.

    Kolom status diketik manusia dan sering tertinggal; tanggal tiba diisi saat
    barangnya benar-benar diterima. Bila keduanya bertentangan, yang menang
    adalah yang punya bukti fisik.
  */
  if (k.sudahTiba || SELESAI.has(status)) {
    return { perlu: false, sebab: 'aman' }
  }

  /*
    Kiriman TANPA TENGGAT dilaporkan, bukan dilewati.

    Ini kebalikan dari `uji-material-gagal`, yang melewati catatan tanpa
    tanggal. Alasannya: di sana tanggal uji hanyalah metadata, sedangkan di
    sini tenggat ADALAH satu-satunya alat untuk tahu kiriman ini sehat atau
    tidak. Kiriman tanpa tenggat tak bisa dinilai selamanya, dan diamnya
    justru menjadikannya tempat paling aman untuk hilang.
  */
  if (k.lewatHari == null || !Number.isFinite(Number(k.lewatHari))) {
    return { perlu: true, sebab: 'tanpa_tenggat' }
  }

  const lewat = Number(k.lewatHari)
  const adaSebab = (k.sebabTertahan ?? '').trim().length > 0

  /*
    TERTAHAN punya ambang yang lebih PENDEK daripada terlambat.

    Berlawanan dengan dugaan pertama: yang sebabnya diketahui justru ditegur
    lebih cepat. Sebabnya karena penahanan hampir selalu administratif — dan
    dokumen yang kurang tak akan lengkap sendiri sementara barangnya menumpuk
    biaya penyimpanan tiap hari. Keterlambatan tanpa sebab sering menyelesaikan
    dirinya sendiri dalam beberapa hari perjalanan.
  */
  if (status === 'tertahan' || adaSebab) {
    return lewat >= ambangTertahan
      ? { perlu: true, sebab: 'tertahan' }
      : { perlu: false, sebab: 'aman' }
  }

  return lewat >= ambangTerlambat
    ? { perlu: true, sebab: 'terlambat' }
    : { perlu: false, sebab: 'aman' }
}
