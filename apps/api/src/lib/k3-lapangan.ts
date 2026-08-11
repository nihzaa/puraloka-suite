// INSIDEN · JSA · INDUKSI · APD · INSPEKSI · LINGKUNGAN (G4).
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA MODUL INSIDEN DIBANGUN LEBIH DULU DARI ENAM ITEM LAIN
// ══════════════════════════════════════════════════════════════════════════
//
// Diukur ke basis 2026-08-12: `lib/kepatuhan-k3.ts` MENGGUGURKAN subkon dari
// pekerjaan bila `jumlah_kecelakaan > 0` — dan angka itu diketik manual, tanpa
// satu pun baris yang menjelaskan kecelakaan apa, kapan, dan siapa yang
// terluka.
//
// Jadi sistem ini sudah mengambil keputusan berat tentang orang berdasarkan
// angka tanpa sumber. Yang mengetik bisa salah ingat; yang dinilai tak punya
// cara membantah, karena tak ada yang bisa ditunjuk.
//
// `hitungInsidenSubkon` menutup itu: angka yang sama, tetapi dihitung dari
// baris yang bisa dibuka satu per satu.
//
// ══════════════════════════════════════════════════════════════════════════
// TIGA PEMBEDAAN YANG SERING DIRATAKAN — DAN AKIBATNYA
// ══════════════════════════════════════════════════════════════════════════
//
// ── 1. Nyaris celaka BUKAN kecelakaan kecil
//
// Nyaris celaka adalah kecelakaan yang kebetulan tak melukai siapa pun. Satu
// kecelakaan berat biasanya didahului puluhan nyaris celaka yang tak
// dilaporkan karena "tidak ada apa-apa".
//
// Karena itu nyaris celaka DIHITUNG TERPISAH dan TIDAK menggugurkan subkon.
// Kalau ia ikut menggugurkan, tak akan ada yang melaporkannya lagi — dan
// sistemnya berhenti melihat hal yang paling ingin ia lihat. Angka nyaris
// celaka yang NAIK adalah kabar baik: artinya orang mulai melapor.
//
// ── 2. "Berapa insiden" BUKAN ukuran keselamatan
//
// Proyek 200 orang dengan 3 insiden lebih aman daripada proyek 20 orang
// dengan 2 insiden, tetapi angka mentahnya berkata sebaliknya. Itulah alasan
// TRIR (Total Recordable Incident Rate) ada: insiden per 200.000 jam kerja.
//
// Di sini TRIR dihitung bila jam kerjanya diketahui, dan `null` bila tidak —
// bukan 0. Nol berarti "tak ada insiden"; `null` berarti "belum bisa
// dihitung", dan keduanya sangat berbeda saat dibawa ke rapat.
//
// ── 3. Temuan inspeksi yang BERULANG bukan tiga temuan
//
// Tiga kali "APD tak dipakai di area las" dalam tiga inspeksi adalah SATU
// masalah yang tak pernah diselesaikan — bukan tiga temuan yang masing-masing
// ditutup. Daftar yang memperlakukannya sebagai tiga baris terpisah membuat
// yang paling penting justru tak terlihat: bahwa perbaikannya tak bekerja.

// ────────────────────────────────────────────────────────────────────────
// Bentuk data
// ────────────────────────────────────────────────────────────────────────

export type JenisInsiden =
  | 'nyaris_celaka' | 'kecelakaan_ringan' | 'kecelakaan_berat' | 'fatal'
  | 'kerusakan_properti' | 'pencemaran_lingkungan'

export type StatusInsiden =
  | 'dilaporkan' | 'diselidiki' | 'tindakan_berjalan' | 'ditutup'

export interface Insiden {
  id: string
  jenis: JenisInsiden
  /** `YYYY-MM-DD` */
  tanggal: string
  melukai: boolean
  hari_kerja_hilang: number | string
  status: StatusInsiden
  supplier_id: string | null
  jsa_id: string | null
  tindakan_korektif: string | null
}

/**
 * Jenis yang MENGGUGURKAN subkon. Sengaja tidak memuat `nyaris_celaka`
 * (lihat pembedaan 1) dan tidak memuat `kerusakan_properti` — yang rusak
 * bisa diganti, yang terluka tidak.
 */
export const MENGGUGURKAN: JenisInsiden[] = [
  'kecelakaan_ringan', 'kecelakaan_berat', 'fatal',
]

/** Jenis yang dihitung sebagai "recordable" untuk TRIR. */
const RECORDABLE: JenisInsiden[] = ['kecelakaan_ringan', 'kecelakaan_berat', 'fatal']

function angka(v: number | string | null | undefined): number | null {
  if (v == null) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v).trim()
  // `Number('')` adalah 0, bukan NaN — pelajaran G2a. Di sini akibatnya:
  // hari kerja hilang yang kosong terbaca 0, dan kecelakaan berat terlihat
  // seperti tak berdampak.
  if (s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

// ────────────────────────────────────────────────────────────────────────
// Rekap insiden
// ────────────────────────────────────────────────────────────────────────

export interface RekapInsiden {
  total: number
  /** Nyaris celaka dihitung TERPISAH, dan naiknya adalah kabar baik. */
  nyaris_celaka: number
  melukai: number
  fatal: number
  kerusakan_properti: number
  pencemaran: number
  hari_kerja_hilang: number
  /** Belum ditutup — yang masih menunggu tindakan korektif. */
  terbuka: number
  /**
   * Insiden yang DITUTUP tanpa tindakan korektif tercatat.
   *
   * Constraint DB melarangnya untuk baris baru, tetapi baris lama (atau yang
   * masuk lewat jalur lain) bisa saja ada — dan angka ini yang menyatakannya,
   * bukan mendiamkannya.
   */
  ditutup_tanpa_korektif: number
  /**
   * Berapa insiden yang MENYEBUT JSA-nya. Insiden tanpa JSA berarti pelajaran
   * darinya tak masuk kembali ke analisa bahaya — dan akan terulang pada
   * pekerjaan berikutnya yang sejenis.
   */
  bertaut_jsa: number
}

export function rekapInsiden(daftar: Insiden[]): RekapInsiden {
  const r: RekapInsiden = {
    total: daftar.length, nyaris_celaka: 0, melukai: 0, fatal: 0,
    kerusakan_properti: 0, pencemaran: 0, hari_kerja_hilang: 0,
    terbuka: 0, ditutup_tanpa_korektif: 0, bertaut_jsa: 0,
  }
  for (const i of daftar) {
    if (i.jenis === 'nyaris_celaka') r.nyaris_celaka++
    if (i.jenis === 'fatal') r.fatal++
    if (i.jenis === 'kerusakan_properti') r.kerusakan_properti++
    if (i.jenis === 'pencemaran_lingkungan') r.pencemaran++
    if (i.melukai) r.melukai++
    r.hari_kerja_hilang += angka(i.hari_kerja_hilang) ?? 0
    if (i.status !== 'ditutup') r.terbuka++
    if (i.status === 'ditutup' && !i.tindakan_korektif?.trim()) r.ditutup_tanpa_korektif++
    if (i.jsa_id) r.bertaut_jsa++
  }
  return r
}

/**
 * TRIR — insiden tercatat per 200.000 jam kerja.
 *
 * `null` bila jam kerjanya tidak diketahui atau nol. BUKAN 0: nol berarti
 * "tak ada insiden", `null` berarti "belum bisa dihitung". Menyamakannya
 * membuat proyek yang belum mendata jam kerjanya terlihat sempurna.
 *
 * 200.000 adalah angka baku OSHA (100 pekerja × 40 jam × 50 minggu) — dipakai
 * supaya angkanya sebanding dengan pembanding industri, bukan hanya dengan
 * diri sendiri.
 */
export function hitungTrir(daftar: Insiden[], jamKerja: number | null): number | null {
  if (jamKerja == null || !Number.isFinite(jamKerja) || jamKerja <= 0) return null
  const tercatat = daftar.filter((i) => RECORDABLE.includes(i.jenis)).length
  return Math.round((tercatat * 200_000 / jamKerja) * 100) / 100
}

export interface InsidenSubkon {
  supplier_id: string
  /** Yang MENGGUGURKAN — bukan seluruh insiden (lihat `MENGGUGURKAN`). */
  kecelakaan: number
  nyaris_celaka: number
  hari_kerja_hilang: number
  /** Id insiden penyebabnya, supaya angkanya bisa dibuka satu per satu. */
  insiden_id: string[]
}

/**
 * Menghitung angka kecelakaan per subkon DARI BARIS INSIDEN.
 *
 * Inilah alasan modul ini ada: `evaluasi_subkon.jumlah_kecelakaan` menggugurkan
 * subkon dari pekerjaan, dan sebelum ini angkanya diketik manual. Yang
 * dikembalikan bukan hanya jumlah, melainkan juga `insiden_id` — supaya yang
 * dinilai bisa diperlihatkan insiden MANA yang dimaksud.
 *
 * @param acuan `YYYY-MM-DD` batas awal (mis. awal periode penilaian). Insiden
 *   sebelum tanggal ini tak dihitung — penilaian periode ini tak boleh dibebani
 *   kecelakaan periode lalu yang sudah dinilai.
 */
export function hitungInsidenSubkon(
  daftar: Insiden[],
  dari: string | null = null,
  sampai: string | null = null,
): Map<string, InsidenSubkon> {
  const peta = new Map<string, InsidenSubkon>()
  for (const i of daftar) {
    if (!i.supplier_id) continue
    if (dari && i.tanggal < dari) continue
    if (sampai && i.tanggal > sampai) continue

    let e = peta.get(i.supplier_id)
    if (!e) {
      e = {
        supplier_id: i.supplier_id, kecelakaan: 0, nyaris_celaka: 0,
        hari_kerja_hilang: 0, insiden_id: [],
      }
      peta.set(i.supplier_id, e)
    }
    if (i.jenis === 'nyaris_celaka') {
      e.nyaris_celaka++
    } else if (MENGGUGURKAN.includes(i.jenis)) {
      e.kecelakaan++
      e.insiden_id.push(i.id)
    }
    e.hari_kerja_hilang += angka(i.hari_kerja_hilang) ?? 0
  }
  return peta
}

/**
 * Membandingkan angka yang DIKETIK di evaluasi dengan angka yang DIHITUNG
 * dari insiden.
 *
 * Selisihnya bukan sekadar kerapian: kalau evaluasi menulis 0 sementara ada
 * 2 kecelakaan tercatat, subkon yang seharusnya gugur tetap dipakai. Kalau
 * sebaliknya, subkon digugurkan atas kecelakaan yang tak ada barisnya.
 *
 * `selaras` sengaja `null` bila BELUM ADA insiden tercatat sama sekali untuk
 * subkon itu — belum tentu benar-benar nol, bisa jadi belum didata. Sama
 * seperti izin kosong (G3) dan ITP kosong (G1e).
 */
export interface PeriksaSelaras {
  supplier_id: string
  diketik: number
  dihitung: number
  selaras: boolean | null
  selisih: number
  insiden_id: string[]
}

export function periksaSelaras(
  diketik: number | string | null | undefined,
  dariInsiden: InsidenSubkon | undefined,
  supplierId: string,
): PeriksaSelaras {
  const d = angka(diketik) ?? 0
  if (!dariInsiden) {
    return {
      supplier_id: supplierId, diketik: d, dihitung: 0,
      selaras: null, selisih: d, insiden_id: [],
    }
  }
  return {
    supplier_id: supplierId,
    diketik: d,
    dihitung: dariInsiden.kecelakaan,
    selaras: d === dariInsiden.kecelakaan,
    selisih: d - dariInsiden.kecelakaan,
    insiden_id: dariInsiden.insiden_id,
  }
}

// ────────────────────────────────────────────────────────────────────────
// JSA
// ────────────────────────────────────────────────────────────────────────

export interface LangkahJsa {
  id: string
  urutan: number
  langkah: string
  bahaya: string
  pengendalian: string
  dampak: number
  kemungkinan: number
  skor: number
  dampak_sisa: number | null
  kemungkinan_sisa: number | null
}

export interface RingkasJsa {
  langkah: number
  /** Skor tertinggi di antara langkahnya — itulah yang menentukan tingkatnya. */
  skor_tertinggi: number | null
  /** Berapa langkah yang skornya masih tinggi SESUDAH pengendalian. */
  sisa_tinggi: number
  /** Langkah yang belum dinilai ulang sesudah pengendalian. */
  belum_dinilai_ulang: number
  /**
   * Layak dipakai sebagai dasar izin kerja?
   *
   * `null` bila JSA-nya KOSONG — JSA tanpa langkah bukan JSA yang aman, ia
   * JSA yang belum diisi. Pelajaran yang sama dengan ITP kosong (G1e).
   */
  layak: boolean | null
  alasan: string[]
}

/**
 * Ambang "masih tinggi sesudah pengendalian".
 *
 * 10 = sama dengan batas `tinggi` di register risiko (migrasi 291). Sengaja
 * SAMA: dua skala untuk hal yang sama membuat orang harus mengingat mana yang
 * mana, dan yang salah ingat adalah angka keselamatan.
 */
export const AMBANG_SISA_TINGGI = 10

export function ringkasJsa(langkah: LangkahJsa[]): RingkasJsa {
  if (langkah.length === 0) {
    return {
      langkah: 0, skor_tertinggi: null, sisa_tinggi: 0,
      belum_dinilai_ulang: 0, layak: null,
      alasan: ['JSA belum punya satu pun langkah'],
    }
  }

  let tertinggi = 0
  let sisaTinggi = 0
  let belum = 0
  for (const l of langkah) {
    if (l.skor > tertinggi) tertinggi = l.skor
    if (l.dampak_sisa == null || l.kemungkinan_sisa == null) {
      belum++
    } else if (l.dampak_sisa * l.kemungkinan_sisa >= AMBANG_SISA_TINGGI) {
      sisaTinggi++
    }
  }

  const alasan: string[] = []
  if (sisaTinggi > 0) {
    alasan.push(sisaTinggi === 1
      ? '1 langkah masih berisiko tinggi sesudah pengendalian'
      : `${sisaTinggi} langkah masih berisiko tinggi sesudah pengendalian`)
  }
  if (belum > 0) {
    alasan.push(belum === 1
      ? '1 langkah belum dinilai ulang sesudah pengendalian'
      : `${belum} langkah belum dinilai ulang sesudah pengendalian`)
  }

  return {
    langkah: langkah.length,
    skor_tertinggi: tertinggi,
    sisa_tinggi: sisaTinggi,
    belum_dinilai_ulang: belum,
    // Langkah yang MASIH tinggi sesudah pengendalian menggugurkan kelayakan.
    // Yang belum dinilai ulang TIDAK — itu kekurangan administrasi, bukan
    // bahaya yang diketahui dan dibiarkan.
    layak: sisaTinggi === 0,
    alasan,
  }
}

// ────────────────────────────────────────────────────────────────────────
// Inspeksi K3
// ────────────────────────────────────────────────────────────────────────

export type StatusTemuanK3 = 'terbuka' | 'diperbaiki' | 'ditutup'

export interface TemuanK3 {
  id: string
  inspeksi_id: string
  uraian: string
  kategori: string | null
  tingkat: number
  status: StatusTemuanK3
  /** `YYYY-MM-DD` */
  tenggat: string | null
  /** Tanggal inspeksinya — dipakai mengurutkan pengulangan. */
  tanggal_inspeksi: string
}

export interface TemuanBerulang {
  kategori: string
  jumlah: number
  /** Berapa yang masih terbuka dari pengulangan itu. */
  terbuka: number
  /** Tanggal inspeksi pertama dan terakhir yang memuatnya. */
  pertama: string
  terakhir: string
  temuan_id: string[]
}

/**
 * Temuan yang muncul BERULANG dalam kategori yang sama.
 *
 * Tiga kali "APD tak dipakai di area las" adalah SATU masalah yang tak pernah
 * selesai, bukan tiga temuan. Daftar yang memperlakukannya sebagai tiga baris
 * terpisah menyembunyikan yang paling penting: perbaikannya tak bekerja.
 *
 * @param minimal berapa kali muncul sebelum disebut berulang. Bawaan 2 —
 *   sekali adalah temuan, dua kali sudah pola.
 */
export function temuanBerulang(daftar: TemuanK3[], minimal = 2): TemuanBerulang[] {
  const peta = new Map<string, TemuanBerulang>()
  for (const t of daftar) {
    // Temuan tanpa kategori tak bisa dibandingkan — dan MEMAKSAKAN
    // perbandingan lewat teks uraian akan menyatukan hal yang berbeda
    // ("APD tak dipakai" vs "APD rusak") atau memisah yang sama.
    const k = t.kategori?.trim()
    if (!k) continue

    let e = peta.get(k)
    if (!e) {
      e = {
        kategori: k, jumlah: 0, terbuka: 0,
        pertama: t.tanggal_inspeksi, terakhir: t.tanggal_inspeksi,
        temuan_id: [],
      }
      peta.set(k, e)
    }
    e.jumlah++
    if (t.status !== 'ditutup') e.terbuka++
    if (t.tanggal_inspeksi < e.pertama) e.pertama = t.tanggal_inspeksi
    if (t.tanggal_inspeksi > e.terakhir) e.terakhir = t.tanggal_inspeksi
    e.temuan_id.push(t.id)
  }
  return [...peta.values()]
    .filter((e) => e.jumlah >= minimal)
    .sort((a, b) => b.jumlah - a.jumlah || b.terbuka - a.terbuka)
}

export interface RekapTemuan {
  total: number
  terbuka: number
  /** Tingkat 3 = berat. Yang berat dan masih terbuka menuntut tindakan hari ini. */
  berat_terbuka: number
  lewat_tenggat: number
  berulang: TemuanBerulang[]
}

export function rekapTemuan(daftar: TemuanK3[], acuan: string): RekapTemuan {
  let terbuka = 0, berat = 0, telat = 0
  for (const t of daftar) {
    if (t.status === 'ditutup') continue
    terbuka++
    if (t.tingkat >= 3) berat++
    if (t.tenggat && t.tenggat < acuan) telat++
  }
  return {
    total: daftar.length,
    terbuka,
    berat_terbuka: berat,
    lewat_tenggat: telat,
    berulang: temuanBerulang(daftar),
  }
}

// ────────────────────────────────────────────────────────────────────────
// Induksi & APD
// ────────────────────────────────────────────────────────────────────────

export interface Induksi {
  id: string
  worker_id: string | null
  peserta_nama: string | null
  /** `YYYY-MM-DD` */
  tanggal: string
  berlaku_sampai: string | null
}

export interface StatusInduksi {
  /** Berapa pekerja aktif yang PERNAH diinduksi. */
  terinduksi: number
  /** Yang induksinya sudah kedaluwarsa pada tanggal acuan. */
  kedaluwarsa: number
  /** Pekerja aktif yang belum pernah tercatat sama sekali. */
  belum: number
  total_pekerja: number
  /**
   * Berapa persen pekerja aktif yang induksinya MASIH berlaku.
   * `null` bila belum ada pekerja aktif terdata — bukan 0.
   */
  persen_berlaku: number | null
}

/**
 * @param acuan `YYYY-MM-DD`. Dilewatkan, bukan diambil dari jam sistem —
 *   supaya laporan bulan lalu bisa dihitung ulang dengan keadaan bulan lalu.
 */
export function statusInduksi(
  induksi: Induksi[],
  idPekerjaAktif: string[],
  acuan: string,
): StatusInduksi {
  const total = idPekerjaAktif.length
  if (total === 0) {
    return { terinduksi: 0, kedaluwarsa: 0, belum: 0, total_pekerja: 0, persen_berlaku: null }
  }

  const berlaku = new Set<string>()
  const pernah = new Set<string>()
  for (const i of induksi) {
    if (!i.worker_id) continue
    pernah.add(i.worker_id)
    // Induksi tanpa `berlaku_sampai` = tanpa masa berlaku, selalu sah.
    // Habis pada AKHIR hari itu — `<` bukan `<=`, sama seperti sertifikat
    // (G2e) dan izin (G3).
    if (!i.berlaku_sampai || i.berlaku_sampai >= acuan) berlaku.add(i.worker_id)
  }

  const aktif = new Set(idPekerjaAktif)
  let sah = 0, kedaluwarsa = 0, belum = 0
  for (const id of aktif) {
    if (berlaku.has(id)) sah++
    else if (pernah.has(id)) kedaluwarsa++
    else belum++
  }

  return {
    terinduksi: sah,
    kedaluwarsa,
    belum,
    total_pekerja: total,
    persen_berlaku: Math.round((sah / total) * 1000) / 10,
  }
}

export interface Apd {
  id: string
  worker_id: string | null
  penerima_nama: string | null
  jenis_apd: string
  jumlah: number
  /** `YYYY-MM-DD` */
  tanggal: string
  ganti_sebelum: string | null
}

export interface RekapApd {
  serah_terima: number
  /** APD yang jatuh tempo diganti pada tanggal acuan — memberi rasa aman
   *  tanpa melindungi. */
  jatuh_tempo: number
  akan_jatuh_tempo: number
  per_jenis: Array<{ jenis: string; jumlah: number }>
}

export function rekapApd(daftar: Apd[], acuan: string, ambangHari = 30): RekapApd {
  const perJenis = new Map<string, number>()
  let tempo = 0, akan = 0
  for (const a of daftar) {
    perJenis.set(a.jenis_apd, (perJenis.get(a.jenis_apd) ?? 0) + (angka(a.jumlah) ?? 0))
    if (!a.ganti_sebelum) continue
    if (a.ganti_sebelum < acuan) tempo++
    else if (selisihHari(acuan, a.ganti_sebelum) <= ambangHari) akan++
  }
  return {
    serah_terima: daftar.length,
    jatuh_tempo: tempo,
    akan_jatuh_tempo: akan,
    per_jenis: [...perJenis.entries()]
      .map(([jenis, jumlah]) => ({ jenis, jumlah }))
      .sort((a, b) => b.jumlah - a.jumlah),
  }
}

function selisihHari(dari: string, sampai: string): number {
  const a = Date.UTC(+dari.slice(0, 4), +dari.slice(5, 7) - 1, +dari.slice(8, 10))
  const b = Date.UTC(+sampai.slice(0, 4), +sampai.slice(5, 7) - 1, +sampai.slice(8, 10))
  return Math.round((b - a) / 86400000)
}

// ────────────────────────────────────────────────────────────────────────
// Lingkungan
// ────────────────────────────────────────────────────────────────────────

export interface UkurLingkungan {
  id: string
  parameter: string
  /** `YYYY-MM-DD` */
  tanggal: string
  nilai: number | string
  satuan: string
  baku_mutu: number | string | null
}

export interface UkurDinilai extends UkurLingkungan {
  /**
   * Melebihi baku mutu? `null` bila baku mutunya tak dicatat — dan itu
   * keadaan yang BERBEDA dari "aman". Pengukuran tanpa pembanding tak
   * menjawab apa pun, tetapi ia sering ditampilkan seolah menjawab.
   */
  melebihi: boolean | null
  /** Berapa persen dari baku mutu. `null` bila tak ada pembandingnya. */
  persen_baku: number | null
}

export function nilaiLingkungan(u: UkurLingkungan): UkurDinilai {
  const nilai = angka(u.nilai)
  const baku = angka(u.baku_mutu)
  if (nilai == null || baku == null || baku === 0) {
    return { ...u, melebihi: null, persen_baku: null }
  }
  return {
    ...u,
    melebihi: nilai > baku,
    persen_baku: Math.round((nilai / baku) * 1000) / 10,
  }
}

export interface RekapLingkungan {
  total: number
  melebihi: number
  /** Yang tak bisa dinilai karena baku mutunya tak dicatat. */
  tanpa_pembanding: number
  parameter: number
}

export function rekapLingkungan(daftar: UkurLingkungan[]): RekapLingkungan {
  const dinilai = daftar.map(nilaiLingkungan)
  return {
    total: daftar.length,
    melebihi: dinilai.filter((d) => d.melebihi === true).length,
    // Dinyatakan, bukan didiamkan: pengukuran tanpa baku mutu tak boleh
    // terhitung "aman" hanya karena ia tak terhitung "melebihi".
    tanpa_pembanding: dinilai.filter((d) => d.melebihi === null).length,
    parameter: new Set(daftar.map((d) => d.parameter)).size,
  }
}
