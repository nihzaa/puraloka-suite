/**
 * IKHTISAR LAPANGAN — bentuk jawaban `/api/v1/lapangan/ringkasan` + helper
 * penyajiannya.
 *
 * ── Kenapa tipe dan helper-nya dipisah dari komponen
 *
 * Dua hal di sini menentukan apa yang dibaca orang di layar, dan keduanya
 * mudah salah tanpa gejala:
 *
 *   `persenSelesai`  pembagian yang bisa nol-per-nol
 *   `labelStatus`    nilai enum DB → kata yang dimengerti orang lapangan
 *
 * Di dalam JSX keduanya tak bisa diuji tanpa merender seluruh halaman
 * beserta panggilan jaringannya. Di sini keduanya fungsi murni dengan test.
 */

export interface KpiLapangan {
  progres_rata: number
  proyek_aktif: number
  milestone_selesai: number
  milestone_total: number
  punch_terbuka: number
  ncr_aktif: number
  inspeksi_menunggu: number
  tukang_hadir_hari_ini: number
  tukang_aktif: number
}

export interface TitikProgres {
  tanggal: string
  progres: number
  jml_log: number
  pekerja: number
}

export interface TitikKehadiran {
  tanggal: string
  orang: number
  /** Jumlah `porsi_hari` — setengah hari terhitung 0,5. */
  orang_hari: number
  jam_lembur: number
}

export interface MilestoneRingkas {
  id: string
  judul: string
  tanggal: string | null
  status: string
  proyek: string | null
  terlambat: boolean
}

export interface ProyekRingkas {
  id: string
  nama: string
  progres: number
  tenggat: string | null
  lokasi: string | null
  lewat_tenggat: boolean
}

export interface TemuanRingkas {
  id: string
  nomor: string
  judul: string
  lokasi?: string | null
  severity: string
  status: string
  proyek: string | null
  /** Nominal `numeric` dikirim apa adanya sebagai string — §5.4. */
  biaya_dampak?: string | null
}

export interface RingkasanLapangan {
  kpi: KpiLapangan
  progres_harian: TitikProgres[]
  milestone: MilestoneRingkas[]
  proyek: ProyekRingkas[]
  tenaga_kerja: {
    per_tipe: Array<{ nama: string; jml: number }>
    hadir_30_hari: TitikKehadiran[]
  }
  temuan: {
    punch_per_status: Array<{ nama: string; jml: number }>
    ncr_per_severity: Array<{ nama: string; jml: number }>
    inspeksi_per_status: Array<{ nama: string; jml: number }>
  }
  punch_terbaru: TemuanRingkas[]
  ncr_terbaru: TemuanRingkas[]
}

/**
 * Nada lencana per tingkat keparahan.
 *
 * Dipetakan eksplisit, bukan diurutkan otomatis: `punch_severity` dan
 * `ncr_severity` adalah dua enum BERBEDA dengan nilai yang tak sama
 * (`ringan|sedang|berat|kritis` vs `minor|major|kritis`). Tabel tunggal
 * memuat keduanya supaya satu komponen bisa menampilkan keduanya tanpa perlu
 * tahu ia sedang melihat punch atau NCR.
 */
export const NADA_SEVERITY: Record<string, "bahaya" | "normal" | "baik"> = {
  kritis: "bahaya",
  berat: "bahaya",
  major: "bahaya",
  sedang: "normal",
  minor: "normal",
  ringan: "baik",
}

/**
 * Persen selesai, aman terhadap pembagi nol.
 *
 * `0/0` menghasilkan `NaN`, dan `NaN%` tampil di layar sebagai "NaN%" —
 * jenis cacat yang lolos setiap review kode dan langsung terlihat oleh
 * pemakai pertama. Perusahaan baru tanpa satu pun milestone adalah keadaan
 * yang pasti terjadi, bukan kasus tepi.
 */
export function persenSelesai(selesai: number, total: number): number {
  if (!Number.isFinite(selesai) || !Number.isFinite(total) || total <= 0) return 0
  return Math.round((Math.max(0, selesai) / total) * 100)
}

/**
 * Nilai enum DB → kata yang dibaca orang lapangan.
 *
 * `menunggu_cek` di sumbu grafik terbaca sebagai nama kolom database, bukan
 * keadaan pekerjaan. Yang tak dikenal dikembalikan apa adanya (garis bawah
 * jadi spasi) — lebih baik menampilkan kata mentah daripada menyembunyikan
 * status yang baru ditambahkan seseorang.
 */
export function labelStatus(nilai: string): string {
  const KAMUS: Record<string, string> = {
    terbuka: "Terbuka",
    dikerjakan: "Dikerjakan",
    menunggu_cek: "Menunggu cek",
    ditutup: "Ditutup",
    ditolak: "Ditolak",
    diminta: "Diminta",
    dijadwalkan: "Dijadwalkan",
    lolos: "Lolos",
    tidak_lolos: "Tidak lolos",
    dibatalkan: "Dibatalkan",
    disposisi: "Disposisi",
    perbaikan: "Perbaikan",
    verifikasi: "Verifikasi",
  }
  if (KAMUS[nilai]) return KAMUS[nilai]
  const bersih = String(nilai ?? "").replace(/_/g, " ").trim()
  if (!bersih) return "—"
  return bersih.charAt(0).toUpperCase() + bersih.slice(1)
}
