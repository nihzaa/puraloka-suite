import { supabase } from '../utils/supabase.js'

/**
 * BACA-SAJA — tenant yang menunggak boleh MELIHAT, tak boleh MENULIS.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-31: `tandai-lewat-tempo` mengubah status tagihan jadi
 * `lewat_tempo`, dan tak ada satu pun pembaca status itu di sisi produk.
 * Pelanggan yang berhenti membayar tetap memakai seluruh modul **selamanya**.
 *
 * Gerbang modul menegakkan PAKET; berkas ini menegakkan PEMBAYARAN.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * DI MANA DITEGAKKAN — dan satu percobaan yang TERBUKTI TAK MENAHAN APA PUN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Ada 132 berkas rute; memasang penjagaan per-rute berarti 132 kesempatan
 * lupa, dan yang lupa gagal-terbuka tanpa gejala. Jadi ia harus terpusat.
 *
 * Percobaan pertama: `app.addHook('preHandler', …)` di `index.ts`. Itu SALAH,
 * dan salahnya senyap. Hook instance-level berjalan SEBELUM preHandler rute,
 * sehingga `request.companyId` — yang diisi `authenticate` — masih `undefined`
 * saat hook jalan. Hook pulang lebih awal pada setiap permintaan: nol galat,
 * nol jejak, dan diamnya terbaca persis seperti bekerja.
 *
 * Diukur lewat rute sungguhan: POST /api/v1/clients tetap **201** saat tenant
 * ditandai baca-saja. Kalau saja penegakan ini "diperiksa" dengan membaca kode
 * alih-alih memanggil rutenya, ia akan lolos ke produksi sebagai perlindungan
 * yang tak pernah ada.
 *
 * Sekarang ditegakkan di dalam `authenticate()` (plugins/auth.ts), tepat
 * sesudah `request.companyId` terisi — dan setiap rute yang dijaga
 * `authenticate` otomatis ikut terjaga.
 *
 * ⚠ Rute ber-`requireApiKey` TIDAK tersentuh. Itu diketahui, bukan terlewat:
 * jalur API key punya companynya sendiri di `request.apiKey.companyId`, dan
 * menyalinnya ke sini akan membuat dua resolusi company yang bisa menyimpang.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG TETAP BOLEH DITULIS SAAT BACA-SAJA — dan kenapa daftar ini kecil
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Jalur pemulihan tak boleh berada di belakang gerbang yang ia pulihkan.
 * Azure memperlihatkan kegagalannya: invoice terkunci → pembayaran swalayan
 * dinonaktifkan → pelanggan yang INGIN membayar harus menelepon dukungan.
 *
 * Jadi login, keluar, dan pembacaan apa pun tetap jalan. Yang ditahan hanya
 * penambahan data operasional baru.
 *
 * ⚠ Daftar ini harus tetap KECIL. Tiap tambahan adalah lubang yang membuat
 * tenant menunggak bisa terus bekerja — dan lubang yang paling mudah
 * dibenarkan ("cuma satu rute, penting") adalah yang paling sering membuat
 * penegakan berhenti berarti.
 */

export const AWALAN_TETAP_BOLEH = [
  // Autentikasi: keluar-masuk tak boleh terhalang oleh keadaan tagihan.
  '/api/v1/auth/',
  // Pengaturan perusahaan — tempat pelanggan melihat keadaan langganannya.
  '/api/v1/companies',
  '/api/v1/settings',
  // Ekspor: pelanggan yang keluar harus selalu bisa membawa datanya.
  '/api/v1/ekspor',
]

/** Metode yang MENGUBAH data. GET/HEAD/OPTIONS selalu lolos. */
export const METODE_TULIS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export interface KeadaanBacaSaja {
  bacaSaja: boolean
  /** Kalimat siap tampil. NULL bila tenant sehat. */
  alasan: string | null
}

const SEHAT: KeadaanBacaSaja = Object.freeze({ bacaSaja: false, alasan: null })

/**
 * Apakah tenant sedang baca-saja.
 *
 * Membaca `entitlement_snapshot` — salinan LOKAL yang didorong konsol vendor.
 * Tak pernah memanggil basis vendor di jalur permintaan; alasannya sama dengan
 * `gerbang-modul.ts`: konsol mati tak boleh memadamkan produk.
 */
export async function bacaKeadaanBacaSaja(companyId: string): Promise<KeadaanBacaSaja> {
  if (!companyId) return SEHAT

  const { data, error } = await supabase
    .from('entitlement_snapshot')
    .select('terbuka, alasan')
    .eq('company_id', companyId)
    .eq('kunci', 'sistem.baca_saja')
    .maybeSingle()

  // ⚠ Gagal membaca TIDAK memicu baca-saja.
  //
  // Basis yang bermasalah bukan bukti bahwa tenant ini menunggak. Menyamakan
  // keduanya berarti satu gangguan membekukan tulis untuk SEMUA pelanggan,
  // termasuk yang lunas — dan gejalanya "aplikasi tak bisa menyimpan", yang
  // tak menunjuk ke sini sama sekali.
  if (error) return SEHAT

  // Tak ada barisnya = tenant sehat. Hanya `false` yang membekukan; NULL
  // berarti keadaan belum ditetapkan konsol.
  if (!data || data.terbuka !== false) return SEHAT

  return {
    bacaSaja: true,
    alasan:
      data.alasan ??
      'Akun ini sementara dibatasi karena ada tagihan yang belum diterima. Data Anda tetap bisa dilihat dan diekspor.',
  }
}
