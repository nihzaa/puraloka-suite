// Inspeksi mana yang SEHARUSNYA melahirkan NCR.
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA MODUL INI ADA
// ══════════════════════════════════════════════════════════════════════════
//
// Diukur 2026-08-11:
//
//   inspection_requests   24 baris   — 3 di antaranya `tidak_lolos`
//   ncr_items             18 baris   — `inspection_request_id` terisi: **0**
//
// Kolomnya ada. Rute `POST /ncr` menerimanya (`ncr.ts:218`). Datanya ada di
// KEDUA sisi. Yang tak ada: satu pun cara di UI untuk mengirimkannya.
//
// Kelas cacat yang sama untuk KELIMA kalinya — `rfq.po_id`, endpoint
// penawaran, `rfq.mr_id`, `sumber_change_order_id`, geotag. Tiap bagian ada
// dan ber-test sendiri-sendiri; hanya sambungannya yang tidak.
//
// ── Kenapa ini lebih dari sekadar kolom kosong
//
// Inspeksi `tidak_lolos` yang tak melahirkan NCR adalah **temuan mutu yang
// hilang**. Pemeriksanya sudah menyatakan pekerjaan itu tidak lolos; kalau
// jejaknya berhenti di situ, tak ada yang menugaskan perbaikan, tak ada yang
// memverifikasi, dan saat auditor bertanya "apa tindak lanjut atas temuan
// ini", jawabannya cuma ingatan orang.
//
// Tiga inspeksi gagal di basis hari ini: waterproofing, instalasi listrik,
// pasangan bata. Ketiganya jenis pekerjaan yang kalau salah, ketahuannya
// SETELAH tertutup pekerjaan lain — dan biaya perbaikannya berlipat.
//
// ── Kenapa MENGUSULKAN, bukan membuat otomatis
//
// NCR punya konsekuensi: ia menugaskan orang, memasang target waktu, dan
// `biaya_dampak`-nya masuk laporan. NCR yang lahir sendiri dari status
// inspeksi akan membanjiri daftar dengan temuan yang belum tentu perlu
// diformalkan — dan daftar yang dibanjiri berhenti dibaca.
//
// Pola yang sama dengan `saran-cost-map.ts`: modul ini tidak menulis apa pun.

/** Status inspeksi yang berarti "sudah diperiksa DAN gagal". */
const STATUS_GAGAL = new Set(['tidak_lolos'])

/** Status yang berarti pemeriksaannya belum terjadi. */
const STATUS_BELUM = new Set(['diminta', 'dijadwalkan'])

/** Status yang berarti diperiksa dan lolos — tak ada temuan. */
const STATUS_LOLOS = new Set(['lolos'])

export interface InspeksiRingkas {
  id: string
  nomor: string
  judul: string
  status: string
  lokasi: string | null
  /** Catatan pemeriksa — inilah isi temuan yang sesungguhnya. */
  hasil_catatan: string | null
  rab_item_id: string | null
  work_scope_id: string | null
  diperiksa_pada: string | null
  /** Sudah ada NCR yang menunjuk inspeksi ini. */
  sudah_ber_ncr: boolean
}

/** Bahan NCR yang diwarisi dari inspeksinya. */
export interface UsulNcr {
  inspection_request_id: string
  nomor_inspeksi: string
  judul: string
  deskripsi: string
  lokasi: string | null
  rab_item_id: string | null
  work_scope_id: string | null
  /**
   * SELALU null — severity tak boleh ditebak mesin.
   *
   * Menebaknya dari kata-kata catatan ("parah", "bahaya") berarti mesin
   * memutuskan seberapa gawat sebuah temuan mutu, dan angka itu mengalir ke
   * prioritas perbaikan serta ke laporan. Manusia yang memilih.
   */
  severity: null
  diperiksa_pada: string | null
}

export interface KelayakanNcr {
  inspection_request_id: string
  nomor: string
  layak: boolean
  /** Alasan TIDAK layak, dalam bahasa yang bisa ditampilkan apa adanya. */
  sebab: string | null
  usul: UsulNcr | null
}

/**
 * Apakah satu inspeksi layak diusulkan jadi NCR.
 *
 * INVARIAN yang diuji (`__tests__/inspeksi-ke-ncr.test.ts`):
 *  1. hanya `tidak_lolos` yang layak — `lolos` tak punya temuan untuk
 *     diformalkan, dan mengusulkannya menuduh pekerjaan yang sudah benar
 *  2. yang belum diperiksa (`diminta`/`dijadwalkan`) tidak layak
 *  3. status tak dikenal tidak layak (gagal-tertutup)
 *  4. yang SUDAH ber-NCR tak diusulkan lagi — dua NCR untuk satu temuan
 *     berarti dua tugas perbaikan untuk satu pekerjaan
 *  5. usulnya MEWARISI judul, lokasi, catatan, dan tautan pekerjaan
 *  6. `severity` selalu null — tak ditebak dari teks
 */
export function inspeksiLayakNcr(i: InspeksiRingkas): KelayakanNcr {
  const dasar = { inspection_request_id: i.id, nomor: i.nomor }

  // Diperiksa lebih dulu: inspeksi yang sudah ber-NCR tak perlu dinilai
  // statusnya sama sekali.
  if (i.sudah_ber_ncr) {
    return { ...dasar, layak: false, usul: null, sebab: 'Sudah punya NCR' }
  }

  if (STATUS_LOLOS.has(i.status)) {
    return {
      ...dasar, layak: false, usul: null,
      sebab: 'Pemeriksaan LOLOS — tak ada temuan yang perlu diformalkan',
    }
  }

  if (STATUS_BELUM.has(i.status)) {
    return {
      ...dasar, layak: false, usul: null,
      sebab: 'Belum diperiksa — hasilnya belum ada',
    }
  }

  if (!STATUS_GAGAL.has(i.status)) {
    // Gagal-tertutup. Status baru yang belum dipertimbangkan tak otomatis
    // jadi kandidat: membanjiri daftar NCR dengan usulan yang salah membuat
    // seluruh daftarnya berhenti dibaca.
    return {
      ...dasar, layak: false, usul: null,
      sebab: `Status "${i.status}" belum dikenal — belum bisa dinilai`,
    }
  }

  return {
    ...dasar,
    layak: true,
    sebab: null,
    usul: {
      inspection_request_id: i.id,
      nomor_inspeksi: i.nomor,
      judul: i.judul,
      // Catatan hasil kosong TIDAK menghasilkan deskripsi kosong: NCR tanpa
      // deskripsi tak bisa ditindaklanjuti siapa pun. Diisi rujukan
      // inspeksinya, supaya penerima tugas setidaknya tahu ke mana mencari.
      deskripsi: i.hasil_catatan?.trim()
        ? i.hasil_catatan.trim()
        : `Temuan dari pemeriksaan ${i.nomor} — catatan pemeriksa belum diisi, `
          + 'lihat berkas inspeksinya.',
      lokasi: i.lokasi,
      rab_item_id: i.rab_item_id,
      work_scope_id: i.work_scope_id,
      severity: null,
      diperiksa_pada: i.diperiksa_pada,
    },
  }
}

export interface RingkasanKandidat {
  kandidat: UsulNcr[]
  /** Sudah punya NCR — dihitung supaya daftarnya tak terlihat menyusut. */
  sudah_ber_ncr: number
  /** Berapa inspeksi yang diperiksa seluruhnya (penyebut). */
  jumlah_diperiksa: number
}

/**
 * Ringkas daftar inspeksi jadi kandidat NCR.
 *
 * Yang paling lama diperiksa naik ke atas: temuan mutu yang dibiarkan makin
 * mahal diperbaiki karena pekerjaan lain menimpanya.
 */
export function ringkasKandidatNcr(daftar: InspeksiRingkas[]): RingkasanKandidat {
  const nilai = daftar.map(inspeksiLayakNcr)

  const kandidat = nilai
    .filter((k) => k.layak && k.usul)
    .map((k) => k.usul as UsulNcr)
    .sort((a, b) => {
      // Tanggal kosong turun ke bawah, bukan naik seolah paling mendesak.
      if (!a.diperiksa_pada) return 1
      if (!b.diperiksa_pada) return -1
      return a.diperiksa_pada.localeCompare(b.diperiksa_pada)
    })

  return {
    kandidat,
    sudah_ber_ncr: daftar.filter((i) => i.sudah_ber_ncr).length,
    jumlah_diperiksa: daftar.length,
  }
}
