/**
 * KLAUSUL KONTRAK — bawaan produk, dan penggantinya milik tiap tenant.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA BAWAAN TETAP ADA DI KODE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Godaannya memindahkan seluruh 11 pasal ke basis lalu mengosongkan kode.
 * Ditolak, karena tenant BARU akan punya nol klausul — dan kontrak pertamanya
 * terbit tanpa pasal penyelesaian sengketa maupun force majeure.
 *
 * Kertas yang tak menyebut forum sengketa bukan kertas yang "belum lengkap":
 * ia kertas yang menyerahkan penentuannya kepada siapa pun yang menggugat
 * lebih dulu.
 *
 * Jadi bawaan di sini adalah LANTAI. Tenant boleh menimpanya, tak boleh
 * berakhir tanpa apa-apa.
 *
 * ── Kenapa hanya SEBAGIAN pasal yang bisa ditimpa
 *
 * Diukur di `contracts.ts`: lima dari sebelas pasal menganyam data hidup —
 * nilai kontrak + terbilang, jangka waktu, tabel termin, masa pemeliharaan,
 * dan lingkup dari kategori RAB.
 *
 * Menjadikannya template menuntut bahasa templating dengan perulangan dan
 * format rupiah. Dan template yang salah tulis menghasilkan kontrak bernilai
 * KOSONG yang tetap tercetak rapi — cacat yang tak terlihat sampai
 * ditandatangani.
 *
 * Karena itu `NOMOR_BISA_DIUBAH` sengaja pendek. Batas ini keputusan, bukan
 * kelalaian.
 */

/** Pasal berteks murni — aman ditimpa tenant. */
export const NOMOR_BISA_DIUBAH = ['1', '6', '8', '9', '10', '11'] as const

/** Pasal yang menganyam data hidup — TETAP dirakit `contracts.ts`. */
export const NOMOR_DIRAKIT_KODE = ['2', '3', '4', '5', '7'] as const

export interface Klausul {
  nomor: string
  judul: string
  isi: string
  urutan: number
}

/**
 * Bunyi bawaan produk. Persis yang selama ini tercetak, dipindah ke sini
 * supaya ada SATU sumber — sebelumnya ia hidup sebagai string di tengah
 * fungsi penggambar PDF, tempat yang tak pernah dilihat orang non-teknis.
 */
export const KLAUSUL_BAWAAN: Klausul[] = [
  {
    nomor: '1', urutan: 10, judul: 'MAKSUD DAN TUJUAN',
    isi: 'Kontrak ini bermaksud untuk mengatur pelaksanaan pekerjaan '
      + 'pembangunan/renovasi oleh PIHAK KEDUA sesuai dengan gambar rencana, '
      + 'spesifikasi teknis, dan Rencana Anggaran Biaya (RAB) yang telah '
      + 'disetujui oleh PIHAK PERTAMA.',
  },
  {
    nomor: '6', urutan: 60, judul: 'PERUBAHAN PEKERJAAN DAN PEKERJAAN TAMBAHAN',
    isi: 'Setiap perubahan lingkup pekerjaan, penambahan, maupun pengurangan '
      + 'wajib dituangkan dalam Change Order tertulis yang disetujui kedua '
      + 'belah pihak sebelum pekerjaan dilaksanakan. Pekerjaan tambah yang '
      + 'dikerjakan tanpa Change Order tertulis menjadi risiko PIHAK KEDUA dan '
      + 'tidak menambah nilai kontrak.',
  },
  {
    nomor: '8', urutan: 80, judul: 'HAK DAN KEWAJIBAN PARA PIHAK',
    isi: 'PIHAK PERTAMA berkewajiban membayar sesuai termin yang disepakati, '
      + 'menyediakan lahan yang siap dikerjakan, serta memberikan keputusan '
      + 'atas hal yang memerlukan persetujuan dalam waktu wajar. PIHAK KEDUA '
      + 'berkewajiban melaksanakan pekerjaan sesuai gambar dan spesifikasi, '
      + 'menyediakan tenaga kerja dan peralatan yang memadai, menjaga '
      + 'keselamatan kerja di lokasi, serta menyerahkan pekerjaan tepat waktu.',
  },
  {
    nomor: '9', urutan: 90, judul: 'PENYELESAIAN PERSELISIHAN',
    isi: 'Apabila terjadi perselisihan antara PIHAK PERTAMA dan PIHAK KEDUA '
      + 'dalam pelaksanaan kontrak ini, kedua belah pihak sepakat untuk '
      + 'menyelesaikannya secara musyawarah untuk mufakat. Apabila musyawarah '
      + 'tidak mencapai kesepakatan, maka penyelesaian perselisihan akan '
      + 'diselesaikan melalui jalur hukum yang berlaku sesuai peraturan '
      + 'perundang-undangan Republik Indonesia.',
  },
  {
    nomor: '10', urutan: 100, judul: 'FORCE MAJEURE',
    isi: 'Yang dimaksud dengan force majeure dalam kontrak ini adalah '
      + 'kejadian-kejadian di luar kemampuan dan kekuasaan para pihak yang '
      + 'mempengaruhi pelaksanaan kewajiban, antara lain: bencana alam (gempa '
      + 'bumi, banjir, tanah longsor), kebakaran, huru-hara, pandemi, perang, '
      + 'dan kebijakan pemerintah yang secara langsung mempengaruhi pelaksanaan '
      + 'pekerjaan. Pihak yang mengalami force majeure wajib memberitahukan '
      + 'kepada pihak lainnya selambat-lambatnya 7 (tujuh) hari kalender sejak '
      + 'kejadian tersebut berlangsung.',
  },
  {
    nomor: '11', urutan: 110, judul: 'PENUTUP',
    isi: 'Kontrak ini dibuat dalam rangkap 2 (dua) bermaterai cukup, '
      + 'masing-masing mempunyai kekuatan hukum yang sama, dan ditandatangani '
      + 'oleh kedua belah pihak dalam keadaan sehat jasmani dan rohani tanpa '
      + 'ada paksaan dari pihak mana pun.',
  },
]

/**
 * Menggabungkan klausul tenant di atas bawaan.
 *
 * Aturannya sengaja sederhana, karena yang rumit di sini berbahaya:
 *
 *   • tenant menimpa bawaan bernomor SAMA
 *   • tenant boleh menambah pasal baru (mis. "8a")
 *   • bawaan yang tak ditimpa TETAP IKUT — tenant tak bisa berakhir tanpa
 *     pasal sengketa hanya karena lupa menyalinnya
 *
 * Yang TIDAK disediakan: menghapus pasal bawaan. Menyembunyikan pasal
 * penyelesaian sengketa dari kontrak adalah tindakan yang harus disengaja
 * dan terlihat — bukan efek samping dari mengosongkan sebuah kolom.
 */
export function gabungKlausul(tenant: readonly Klausul[]): Klausul[] {
  const peta = new Map<string, Klausul>()

  for (const k of KLAUSUL_BAWAAN) peta.set(k.nomor, k)

  for (const k of tenant) {
    const isi = (k.isi ?? '').trim()
    // Klausul tenant ber-isi kosong DIABAIKAN, bukan menimpa bawaan dengan
    // kekosongan. Basis sudah menolaknya lewat CHECK; ini lapis kedua untuk
    // data yang masuk lewat jalur lain.
    if (isi === '') continue
    peta.set(k.nomor, {
      nomor: k.nomor,
      judul: (k.judul ?? '').trim() || (peta.get(k.nomor)?.judul ?? 'PASAL'),
      isi,
      urutan: Number.isFinite(k.urutan) ? k.urutan : (peta.get(k.nomor)?.urutan ?? 999),
    })
  }

  // Urut menurut `urutan`, lalu nomor secara NUMERIK-lalu-teks: "8a" harus
  // jatuh sesudah "8", dan "10" sesudah "9" — pengurutan teks murni menaruh
  // "10" sebelum "2".
  return [...peta.values()].sort((a, b) => {
    if (a.urutan !== b.urutan) return a.urutan - b.urutan
    const na = parseInt(a.nomor, 10)
    const nb = parseInt(b.nomor, 10)
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb
    return String(a.nomor).localeCompare(String(b.nomor))
  })
}

/** Apakah nomor pasal ini boleh diubah tenant? */
export function bolehDiubah(nomor: string): boolean {
  return (NOMOR_BISA_DIUBAH as readonly string[]).includes(String(nomor).trim())
}
