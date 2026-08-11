// SERTIFIKASI · KINERJA · REKRUTMEN (G2e).
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA SERTIFIKAT JADI PUSAT MODUL INI
// ══════════════════════════════════════════════════════════════════════════
//
// Dari tiga item G2e, hanya sertifikasi yang punya pemicu nyata:
// `prakualifikasi_vendor` 5 baris dan `dokumen_prakualifikasi` 11 baris sudah
// hidup, dan tender pemerintah mensyaratkan SKA/SKT tenaga ahli.
//
// Yang membuatnya berbeda dari daftar dokumen biasa: **sertifikat kedaluwarsa,
// dan yang kedaluwarsa TIDAK BOLEH terhitung sebagai bukti kompetensi.**
//
// Itu bukan kerapian administratif. Tender yang mensyaratkan SKA Ahli Madya
// dan dipenuhi dengan sertifikat yang habis masa berlakunya adalah dokumen
// palsu di mata panitia — dan yang menandatangani dokumen penawaran adalah
// direktur, bukan yang menginput datanya.
//
// ── Kenapa "berlaku" dihitung terhadap TANGGAL ACUAN, bukan hari ini
//
// Prakualifikasi yang diajukan bulan lalu harus diperiksa dengan keadaan bulan
// lalu. Sertifikat yang kedaluwarsa minggu ini TIDAK membuat penawaran bulan
// lalu jadi salah — dan sebaliknya, sertifikat yang baru diperpanjang hari ini
// tak bisa dipakai membenarkan penawaran yang sudah dikirim.
//
// ── Tiga keadaan, bukan dua
//
//   berlaku        sah pada tanggal acuan
//   akan habis     masih sah, tetapi kurang dari ambang hari lagi
//   kedaluwarsa    sudah lewat
//
// "Akan habis" dipisahkan karena ia menuntut tindakan yang BERBEDA: yang
// kedaluwarsa harus diganti sebelum dipakai, yang akan habis harus
// diperpanjang sebelum tender berikutnya. Menyamakannya membuat peringatan
// menyala untuk yang masih sah, dan orang berhenti membacanya.

export interface Sertifikat {
  id: string
  jenis: string
  nama: string
  nomor: string | null
  penerbit: string | null
  klasifikasi: string | null
  kualifikasi: string | null
  tanggal_terbit: string | null
  /** `YYYY-MM-DD`. `null` = seumur hidup (lihat `berjangka`). */
  berlaku_sampai: string | null
  /**
   * `true` = sertifikat ini memang berjangka.
   *
   * Dipisahkan dari sekadar `berlaku_sampai === null` karena NULL punya dua
   * arti dengan akibat berbeda: seumur hidup (selalu sah) vs berjangka tapi
   * tanggalnya lupa diisi (TIDAK sah, dan justru inilah yang berbahaya).
   */
  berjangka: boolean
}

export type StatusSertifikat = 'berlaku' | 'akan_habis' | 'kedaluwarsa'

export interface SertifikatDinilai extends Sertifikat {
  status: StatusSertifikat
  /** Sisa hari sampai kedaluwarsa. `null` untuk yang seumur hidup. */
  sisa_hari: number | null
}

/** Selisih hari antara dua `YYYY-MM-DD`, bebas zona waktu. */
export function selisihHari(dari: string, sampai: string): number {
  const [y1, m1, d1] = dari.split('-').map(Number)
  const [y2, m2, d2] = sampai.split('-').map(Number)
  // `Date.UTC` supaya zona waktu mesin tak menggeser tanggalnya — pelajaran
  // yang sama dengan `hariDalamMinggu` di G2b/G2d.
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000)
}

/**
 * Nilai satu sertifikat terhadap TANGGAL ACUAN.
 *
 * INVARIAN yang diuji (`__tests__/kompetensi-sdm.test.ts`):
 *  1. seumur hidup (`berjangka === false`) selalu `berlaku`, `sisa_hari` null
 *  2. berjangka TANPA tanggal dianggap KEDALUWARSA, bukan berlaku — data yang
 *     hilang tak boleh jadi bukti kompetensi
 *  3. tanggal kedaluwarsa PERSIS di acuan masih `berlaku` (habis pada AKHIR
 *     hari itu), bukan sudah kedaluwarsa
 *  4. `akan_habis` hanya untuk yang MASIH berlaku dalam ambang hari
 *  5. dinilai terhadap acuan, bukan hari ini — penawaran bulan lalu diperiksa
 *     dengan keadaan bulan lalu
 */
export function nilaiSertifikat(
  s: Sertifikat,
  tanggalAcuan: string,
  ambangHari = 60,
): SertifikatDinilai {
  if (!s.berjangka) {
    return { ...s, status: 'berlaku', sisa_hari: null }
  }

  if (!s.berlaku_sampai) {
    // Berjangka tapi tanggalnya tak ada = data yang HILANG. Menganggapnya
    // berlaku membuat sertifikat tanpa masa berlaku dipakai memenuhi syarat
    // tender — dan constraint DB memang menolaknya, tetapi baris lama atau
    // impor bisa lolos.
    return { ...s, status: 'kedaluwarsa', sisa_hari: null }
  }

  const sisa = selisihHari(tanggalAcuan, s.berlaku_sampai)
  return {
    ...s,
    // `sisa < 0`, bukan `<= 0`: sertifikat yang habis HARI INI masih sah hari
    // ini — masa berlakunya habis pada AKHIR hari itu. Memakai `<=` membuat
    // sertifikat ditolak sehari lebih cepat, dan tender bisa gagal karenanya.
    status: sisa < 0 ? 'kedaluwarsa' : sisa <= ambangHari ? 'akan_habis' : 'berlaku',
    sisa_hari: sisa,
  }
}

export interface RingkasanSertifikat {
  baris: SertifikatDinilai[]
  berlaku: number
  akan_habis: number
  kedaluwarsa: number
  /** Yang menuntut tindakan, terurut paling mendesak dulu. */
  perlu_tindakan: SertifikatDinilai[]
}

/**
 * Ringkas sertifikat satu pegawai.
 *
 * INVARIAN yang diuji:
 *  1. `perlu_tindakan` memuat kedaluwarsa DAN akan habis
 *  2. urutan `perlu_tindakan`: sisa hari terkecil dulu; yang seumur hidup
 *     (null) tak pernah masuk
 *  3. daftar kosong menghasilkan nol semua, bukan galat
 */
export function ringkasSertifikat(
  daftar: Sertifikat[],
  tanggalAcuan: string,
  ambangHari = 60,
): RingkasanSertifikat {
  const baris = daftar.map((s) => nilaiSertifikat(s, tanggalAcuan, ambangHari))

  const perlu = baris.filter((b) => b.status !== 'berlaku').sort((a, b) => {
    // Yang tanpa tanggal (`null`) paling mendesak: ia berjangka tetapi
    // datanya hilang, dan itu tak bisa diperbaiki dengan menunggu.
    if (a.sisa_hari === null) return -1
    if (b.sisa_hari === null) return 1
    return a.sisa_hari - b.sisa_hari
  })

  return {
    baris,
    berlaku: baris.filter((b) => b.status === 'berlaku').length,
    akan_habis: baris.filter((b) => b.status === 'akan_habis').length,
    kedaluwarsa: baris.filter((b) => b.status === 'kedaluwarsa').length,
    perlu_tindakan: perlu,
  }
}

export interface SyaratKompetensi {
  /** Jenis yang dituntut, mis. 'SKA'. */
  jenis: string
  /** Kualifikasi minimum, mis. 'Ahli Madya'. `null` = jenis apa pun cukup. */
  kualifikasi?: string | null
  /** Klasifikasi, mis. 'Teknik Bangunan Gedung'. */
  klasifikasi?: string | null
  jumlah: number
}

export interface HasilSyarat extends SyaratKompetensi {
  terpenuhi: number
  cukup: boolean
  /** Pemegang yang sertifikatnya SAH pada tanggal acuan. */
  pemenuhi: Array<{ pegawai_id: string; nama: string; sertifikat: SertifikatDinilai }>
}

/**
 * Periksa apakah syarat kompetensi tender terpenuhi pada TANGGAL ACUAN.
 *
 * INVARIAN yang diuji:
 *  1. sertifikat KEDALUWARSA tak menghitung — itulah seluruh alasan modul ini
 *  2. sertifikat `akan_habis` MASIH menghitung; ia sah pada tanggal acuan
 *  3. pencocokan jenis/kualifikasi tak peka besar-kecil dan spasi (pelajaran
 *     G2a: normalisasi WAJIB dua arah)
 *  4. satu orang dengan dua sertifikat yang cocok dihitung DUA kali hanya
 *     bila syaratnya memang menuntut jumlah sertifikat, bukan jumlah ORANG —
 *     di sini yang dihitung ORANG, karena tender menuntut tenaga ahli
 */
export function periksaSyarat(
  syarat: SyaratKompetensi,
  pemegang: Array<{ pegawai_id: string; nama: string; sertifikat: Sertifikat[] }>,
  tanggalAcuan: string,
): HasilSyarat {
  const cocok = (nilai: string | null | undefined, dituntut: string | null | undefined) => {
    if (!dituntut) return true
    if (!nilai) return false
    return nilai.trim().toUpperCase() === dituntut.trim().toUpperCase()
  }

  const pemenuhi: HasilSyarat['pemenuhi'] = []
  for (const p of pemegang) {
    // Satu ORANG dihitung sekali meski punya beberapa sertifikat yang cocok:
    // tender menuntut "3 tenaga ahli", bukan "3 lembar sertifikat".
    const sah = p.sertifikat
      .map((s) => nilaiSertifikat(s, tanggalAcuan))
      .filter((s) =>
        // KEDALUWARSA tak menghitung — inilah seluruh alasan modul ini ada.
        // `akan_habis` MASIH menghitung: ia sah pada tanggal acuan.
        s.status !== 'kedaluwarsa'
        && cocok(s.jenis, syarat.jenis)
        && cocok(s.kualifikasi, syarat.kualifikasi)
        && cocok(s.klasifikasi, syarat.klasifikasi))
    if (sah.length > 0) {
      pemenuhi.push({ pegawai_id: p.pegawai_id, nama: p.nama, sertifikat: sah[0] })
    }
  }

  return {
    ...syarat,
    terpenuhi: pemenuhi.length,
    cukup: pemenuhi.length >= syarat.jumlah,
    pemenuhi,
  }
}

export interface Penilaian {
  id: string
  periode: string
  skala_maks: number | string
  skor: number | string | null
  status: 'draf' | 'final'
}

/** Angka dari Postgres. NaN, string kosong, dan sampah jadi `null`. */
export function angka(v: unknown): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  // `Number('')` adalah 0 — pelajaran G2a.
  const s = String(v).trim()
  if (s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export interface RingkasanKinerja {
  /** Skor DINORMALKAN ke 0–100 supaya periode berskala beda bisa dibandingkan. */
  tren: Array<{ periode: string; persen: number | null; status: 'draf' | 'final' }>
  /** Rata-rata persen dari yang FINAL saja. `null` bila belum ada. */
  rata_final: number | null
  jumlah_final: number
  jumlah_draf: number
}

/**
 * Ringkas riwayat penilaian kinerja.
 *
 * INVARIAN yang diuji:
 *  1. skor DINORMALKAN ke persen — skala berubah antar-periode (1–5 lalu
 *     1–100), dan membandingkan 4 dengan 80 tanpa skalanya adalah omong kosong
 *  2. hanya yang FINAL masuk rata-rata; draf boleh berubah dan belum berarti
 *  3. skor `null` tetap muncul di tren (periode ada, belum dinilai) tetapi
 *     tak ikut rata-rata
 *  4. rata-rata `null` saat nol final, BUKAN 0 — nol berarti "dinilai buruk"
 */
export function ringkasKinerja(daftar: Penilaian[]): RingkasanKinerja {
  const tren = daftar
    .slice()
    .sort((a, b) => a.periode.localeCompare(b.periode))
    .map((p) => {
      const skor = angka(p.skor)
      const maks = angka(p.skala_maks)
      return {
        periode: p.periode,
        // Dinormalkan: 4 dari 5 dan 80 dari 100 adalah nilai yang SAMA, dan
        // grafik yang mencampur keduanya mentah-mentah menyesatkan.
        persen: skor === null || maks === null || maks <= 0
          ? null
          : Math.round((skor / maks) * 1000) / 10,
        status: p.status,
      }
    })

  const final = tren.filter((t) => t.status === 'final' && t.persen !== null)

  return {
    tren,
    // `null`, bukan 0: nol berarti "dinilai buruk", dan itu klaim yang tak
    // dimiliki datanya saat belum ada penilaian final.
    rata_final: final.length > 0
      ? Math.round((final.reduce((s, t) => s + t.persen!, 0) / final.length) * 10) / 10
      : null,
    jumlah_final: daftar.filter((p) => p.status === 'final').length,
    jumlah_draf: daftar.filter((p) => p.status === 'draf').length,
  }
}

export type TahapLamaran =
  | 'masuk' | 'seleksi_berkas' | 'wawancara' | 'tawaran' | 'diterima' | 'ditolak'

/** Urutan tahap. Dipakai memastikan lamaran tak melompat mundur diam-diam. */
export const URUTAN_TAHAP: ReadonlyArray<TahapLamaran> = [
  'masuk', 'seleksi_berkas', 'wawancara', 'tawaran', 'diterima']

/**
 * Boleh tidaknya lamaran berpindah tahap.
 *
 * INVARIAN yang diuji:
 *  1. maju satu tahap SELALU boleh
 *  2. `ditolak` boleh dari tahap mana pun — penolakan bisa terjadi kapan saja
 *  3. dari `ditolak` atau `diterima` TIDAK bisa berpindah lagi; keduanya akhir
 *  4. melompat maju BOLEH (sebagian perusahaan melewati seleksi berkas), tapi
 *     MUNDUR tidak — mundur menghapus jejak bahwa tahap itu pernah dilewati
 */
export function bolehPindahTahap(
  dari: TahapLamaran,
  ke: TahapLamaran,
): { boleh: boolean; sebab?: string } {
  if (dari === ke) return { boleh: false, sebab: 'Tahapnya sudah itu.' }

  if (dari === 'diterima' || dari === 'ditolak') {
    return {
      boleh: false,
      sebab: `Lamaran yang sudah ${dari} tak bisa dipindah lagi — `
        + 'catat lamaran baru kalau orangnya melamar lagi.',
    }
  }

  // Penolakan bisa terjadi kapan saja, termasuk sesudah tawaran.
  if (ke === 'ditolak') return { boleh: true }

  const i = URUTAN_TAHAP.indexOf(dari)
  const j = URUTAN_TAHAP.indexOf(ke)
  if (i < 0 || j < 0) return { boleh: false, sebab: 'Tahap tak dikenal.' }

  if (j < i) {
    // Mundur menghapus jejak bahwa tahap itu pernah dilewati — dan yang
    // membaca daftar tak punya cara tahu bahwa pelamar ini pernah sampai
    // wawancara.
    return {
      boleh: false,
      sebab: 'Tahap tak bisa mundur. Kalau perlu mengulang, catat di catatan tahap.',
    }
  }

  // Melompat maju BOLEH: sebagian perusahaan melewati seleksi berkas untuk
  // pelamar rujukan, dan memaksa urutan penuh membuat orang mengklik dua kali
  // tanpa arti.
  return { boleh: true }
}
