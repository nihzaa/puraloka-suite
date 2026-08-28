/**
 * KEPATUHAN MENGGANTUNG — empat bentuk yang TIDAK bisa disatukan.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA BUKAN SATU FUNGSI SEPERTI `tenggat-terlewat.ts`
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Tujuh otomasi bertenggat berbagi satu fungsi karena bentuknya memang satu:
 * ada tenggat, belum ditutup, sudah lewat.
 *
 * Tujuh yang ini tidak. Masing-masing menjawab pertanyaan yang berbeda, dan
 * memaksanya jadi satu fungsi berparameter akan menghasilkan sesuatu yang
 * benar untuk semuanya dan jelas untuk tak satu pun — kelas kesalahan yang
 * berlawanan, tetapi sama merugikannya, dengan menyalin tujuh kali.
 *
 *   1. MASA BERLAKU     induksi K3 yang habis. Yang diukur tanggal, dan
 *                       akibatnya biner: orang boleh masuk lokasi atau tidak.
 *   2. AMBANG DILAMPAUI pemantauan lingkungan. Yang diukur ANGKA terhadap
 *                       baku mutu, bukan tanggal sama sekali.
 *   3. MENGGANTUNG      temuan audit, titik ITP, sertifikat IPC draf, cuti
 *                       diajukan, nota kredit. Yang diukur UMUR sejak sesuatu
 *                       terjadi, karena tak ada kolom tenggat mana pun.
 *
 * Ketiganya ditulis terpisah di bawah, dan pemisahannya sengaja terlihat.
 */

// ══════════════════════════════════════════════════════════════════════════
// 1. MASA BERLAKU
// ══════════════════════════════════════════════════════════════════════════

export interface MasaBerlaku {
  /** Hari sampai berakhir. Negatif = sudah habis. `null` = tak berbatas. */
  sisaHari: number | null
}

export interface HasilBerlaku {
  perlu: boolean
  sebab: 'berlaku' | 'habis' | 'segera_habis' | 'tanpa_masa_berlaku'
}

/**
 * Menilai sesuatu yang punya masa berlaku — induksi K3, sertifikat, izin.
 *
 * @param ambangSegera hari sebelum berakhir saat peringatan mulai dikirim
 */
export function nilaiMasaBerlaku(m: MasaBerlaku, ambangSegera: number): HasilBerlaku {
  /*
    TANPA MASA BERLAKU tidak ditegur di sini — berbeda dari `tenggat-terlewat`,
    yang melaporkan pekerjaan tanpa tenggat.

    Alasannya: sebagian induksi K3 memang berlaku selamanya (induksi umum
    sekali seumur proyek), sementara sebagian lain berbatas (induksi khusus
    pekerjaan berisiko). Kolom kosong di sini berarti "tak berbatas", bukan
    "lupa diisi" — dan menuduhnya lupa akan menegur setiap pekerja tetap,
    tiap kali, selamanya.

    Yang membedakannya dari kasus punch list: di sana SETIAP item memang harus
    punya target, jadi kekosongan adalah kelalaian. Di sini kekosongan adalah
    salah satu keadaan yang sah.
  */
  if (m.sisaHari == null || !Number.isFinite(Number(m.sisaHari))) {
    return { perlu: false, sebab: 'tanpa_masa_berlaku' }
  }

  const sisa = Number(m.sisaHari)
  if (sisa < 0) return { perlu: true, sebab: 'habis' }
  if (sisa <= ambangSegera) return { perlu: true, sebab: 'segera_habis' }
  return { perlu: false, sebab: 'berlaku' }
}

// ══════════════════════════════════════════════════════════════════════════
// 2. AMBANG DILAMPAUI
// ══════════════════════════════════════════════════════════════════════════

export interface Pengukuran {
  nilai: number | null
  bakuMutu: number | null
  /**
   * Apakah nilai yang BAIK adalah yang RENDAH?
   *
   * Untuk kebisingan, debu, dan limbah: ya — melampaui berarti melanggar.
   * Untuk pH minimum atau oksigen terlarut: tidak — yang melanggar justru
   * yang di BAWAH baku mutu.
   *
   * Tanpa pembedaan ini, parameter arah-terbalik akan dilaporkan aman persis
   * ketika ia paling berbahaya.
   */
  makinRendahMakinBaik: boolean
}

export interface HasilPengukuran {
  perlu: boolean
  sebab: 'memenuhi' | 'melampaui' | 'mendekati' | 'tak_terukur'
  /** Rasio terhadap baku mutu. 1.0 = tepat di ambang. */
  rasio: number | null
}

/**
 * Menilai hasil pemantauan lingkungan terhadap baku mutunya.
 *
 * @param marginPersen  seberapa dekat ke baku mutu sudah dianggap "mendekati"
 */
export function nilaiPengukuran(p: Pengukuran, marginPersen: number): HasilPengukuran {
  /*
    ⚠ NULL DIPERIKSA SEBELUM `Number()`, bukan sesudah.

    `Number(null)` adalah **0**, bukan NaN — jadi `Number.isFinite(Number(null))`
    memulangkan true, dan pengukuran yang nilainya belum diisi akan dinilai
    sebagai NOL. Untuk parameter arah biasa itu terbaca "sangat memenuhi"; untuk
    parameter arah terbalik (pH minimum, oksigen terlarut) ia terbaca sebagai
    pelanggaran terburuk yang mungkin.

    Ditemukan test, bukan pembacaan kode: versi pertama fungsi ini memeriksa
    `isFinite` saja dan lolos untuk `nilai: null`.
  */
  if (p.nilai == null || p.bakuMutu == null) {
    return { perlu: false, sebab: 'tak_terukur', rasio: null }
  }

  const nilai = Number(p.nilai)
  const baku = Number(p.bakuMutu)

  /*
    Baku mutu NOL dianggap tak terukur, bukan dibagi.

    `nilai / 0` menghasilkan Infinity, yang lolos `Number.isFinite` dan
    kemudian dibandingkan — hasilnya "melampaui" untuk parameter apa pun yang
    baku mutunya belum diisi. Peringatan yang benar karena alasan yang salah
    tetap merusak kepercayaan begitu ada yang memeriksanya.
  */
  if (!Number.isFinite(nilai) || !Number.isFinite(baku) || baku === 0) {
    return { perlu: false, sebab: 'tak_terukur', rasio: null }
  }

  const rasio = Math.round((nilai / baku) * 1000) / 1000

  if (p.makinRendahMakinBaik) {
    if (nilai > baku) return { perlu: true, sebab: 'melampaui', rasio }
    if (nilai >= baku * (1 - marginPersen / 100)) {
      return { perlu: true, sebab: 'mendekati', rasio }
    }
    return { perlu: false, sebab: 'memenuhi', rasio }
  }

  // Arah terbalik: yang melanggar adalah yang di BAWAH baku mutu.
  if (nilai < baku) return { perlu: true, sebab: 'melampaui', rasio }
  if (nilai <= baku * (1 + marginPersen / 100)) {
    return { perlu: true, sebab: 'mendekati', rasio }
  }
  return { perlu: false, sebab: 'memenuhi', rasio }
}

// ══════════════════════════════════════════════════════════════════════════
// 3. MENGGANTUNG — umur, karena tak ada kolom tenggat
// ══════════════════════════════════════════════════════════════════════════

export interface Menggantung {
  /** Hari sejak peristiwa yang memulai penantian. `null` = tak tertanggal. */
  umurHari: number | null
  selesai: boolean
  /**
   * Apakah perkaranya lebih berat dari biasa?
   *
   * Dipakai berbeda-beda tiap tabel: temuan audit `major`, titik ITP jenis
   * `hold` (titik henti sejati), nota kredit bernilai besar. Diserahkan ke
   * pemanggil karena tak ada satu kolom bersama yang bisa dibaca.
   */
  berat: boolean
}

export interface HasilMenggantung {
  perlu: boolean
  sebab: 'bergerak' | 'selesai' | 'menggantung' | 'tak_tertanggal'
  mendesak: boolean
}

/**
 * Menilai sesuatu yang menunggu tindakan tanpa punya tenggat resmi.
 *
 * @param ambangHari   umur sebelum dianggap menggantung
 * @param faktorBerat  pembagi ambang untuk perkara berat (lebih cepat ditegur)
 */
export function nilaiMenggantung(
  m: Menggantung,
  ambangHari: number,
  faktorBerat = 2,
): HasilMenggantung {
  if (m.selesai) return { perlu: false, sebab: 'selesai', mendesak: false }

  /*
    TAK TERTANGGAL dilaporkan, sama seperti `tenggat-terlewat`.

    Di sini alasannya lebih kuat lagi: umur ADALAH satu-satunya alat ukur yang
    dipunya kelompok ini. Catatan tanpa tanggal tak bisa dinilai selamanya —
    dan diamnya menjadikannya tempat paling aman untuk hilang.
  */
  if (m.umurHari == null || !Number.isFinite(Number(m.umurHari))) {
    return { perlu: true, sebab: 'tak_tertanggal', mendesak: m.berat }
  }

  const umur = Number(m.umurHari)
  /*
    Umur NEGATIF — bertanggal di masa depan — diperlakukan sebagai bergerak.

    Ini bisa terjadi dari salah ketik tahun, dan menegur sesuatu yang "berumur
    minus 300 hari" menghasilkan pesan yang tak masuk akal bagi pembacanya.
    Yang salah datanya, bukan pekerjaannya.
  */
  if (umur < 0) return { perlu: false, sebab: 'bergerak', mendesak: false }

  /*
    Perkara berat ditegur LEBIH CEPAT — ambang DIBAGI, bukan dikali.

    Sengaja berlawanan arah dengan `tenggat-terlewat`, dan alasannya berbeda:
    di sana ambang berarti "berapa hari SEBELUM tenggat", jadi memperbesarnya
    berarti memperingatkan lebih dini. Di sini ambang berarti "berapa hari
    SESUDAH mulai menunggu", jadi yang memperingatkan lebih dini adalah yang
    lebih KECIL.

    Salah arah di sini tak menghasilkan galat apa pun — cuma perkara berat yang
    ditegur paling lambat.
  */
  const ambang = m.berat ? Math.max(1, Math.floor(ambangHari / faktorBerat)) : ambangHari
  if (umur >= ambang) return { perlu: true, sebab: 'menggantung', mendesak: m.berat }

  return { perlu: false, sebab: 'bergerak', mendesak: false }
}
