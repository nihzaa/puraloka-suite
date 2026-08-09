/**
 * IKHTISAR GUDANG — bentuk jawaban `/api/v1/gudang/ikhtisar` + helper
 * penyajiannya.
 *
 * Dua fungsi murni di sini menentukan apa yang terbaca di layar dan mudah
 * salah tanpa gejala: label kategori aset dan label jenis pergerakan.
 * Keduanya memetakan nilai enum DB ke kata yang dimengerti orang gudang —
 * "alat_ringan" di kartu terbaca sebagai nama kolom, bukan jenis barang.
 */

export interface KpiGudang {
  total_aset: number
  di_gudang: number
  di_lapangan: number
  perlu_perhatian: number
  jenis_material_gudang: number
  proyek_belum_ditarik: number
  nilai_perolehan: string
  nilai_buku: string
  akumulasi_susut: string
}

export interface LokasiGudang {
  id: string
  kode: string
  nama: string
  alamat: string | null
  jumlah_aset: number
  jenis_material: number
}

export interface AsetGudang {
  id: string
  kode: string
  nama: string
  kategori: string
  kondisi: string
  status: string
  gudang: string | null
}

export interface Pergerakan {
  id: string
  jenis: string
  tanggal: string | null
  hari_lalu: number | null
  dari: string | null
  ke: string | null
  kondisi_sebelum: string | null
  kondisi_sesudah: string | null
  /** Dihitung SERVER — jangan hitung ulang di UI, lihat catatan di route. */
  memburuk: boolean
}

export interface MaterialGudang {
  id: string
  material_id: string
  qty: string
  asal: string | null
}

export interface BelumDitarik {
  proyek: string
  jenis: number
  qty: string
}

export interface IkhtisarGudang {
  kpi: KpiGudang
  gudang: LokasiGudang[]
  aset_per_kategori: Array<{ nama: string; jml: number }>
  aset_per_kondisi: Array<{ nama: string; jml: number }>
  isi_gudang: AsetGudang[]
  pergerakan: Pergerakan[]
  material_gudang: MaterialGudang[]
  belum_ditarik: BelumDitarik[]
}

/**
 * Nada lencana per kondisi. Dipetakan eksplisit, bukan diurutkan otomatis.
 *
 * Nilainya WAJIB cocok dengan prop `nada` komponen `Lencana`
 * (`bahaya | peringatan | netral | sukses | info`). Percobaan pertama memakai
 * `'baik'` — nama kondisinya, bukan nama nadanya — dan tsc menolaknya. Dua
 * kosakata yang berdekatan artinya tetap dua kosakata berbeda.
 */
export const NADA_KONDISI: Record<string, 'bahaya' | 'peringatan' | 'sukses'> = {
  buruk: 'bahaya',
  cukup: 'peringatan',
  baik: 'sukses',
}

/**
 * `alat_ringan` → `Alat ringan`.
 *
 * Yang tak dikenal dikembalikan dengan garis bawah diganti spasi — lebih baik
 * menampilkan kata mentah daripada menyembunyikan kategori yang baru
 * ditambahkan seseorang. Kategori yang hilang dari grafik terbaca sebagai
 * barang yang tak ada.
 */
export function labelKategori(nilai: string): string {
  const KAMUS: Record<string, string> = {
    alat_berat: 'Alat berat',
    alat_ringan: 'Alat ringan',
    kendaraan: 'Kendaraan',
    scaffolding: 'Scaffolding',
    perlengkapan: 'Perlengkapan',
    lainnya: 'Lainnya',
  }
  if (KAMUS[nilai]) return KAMUS[nilai]
  const bersih = String(nilai ?? '').replace(/_/g, ' ').trim()
  if (!bersih) return '—'
  return bersih.charAt(0).toUpperCase() + bersih.slice(1)
}

/**
 * Jenis pergerakan → kalimat arah.
 *
 * Bukan sekadar kapitalisasi: "kembali" sendirian tak memberi tahu kembali ke
 * mana, dan justru arah itulah yang dicari orang saat membaca riwayat gudang.
 */
export function labelGerak(jenis: string): string {
  const KAMUS: Record<string, string> = {
    pindah: 'Keluar ke proyek',
    kembali: 'Kembali ke gudang',
    perawatan: 'Masuk perawatan',
    pelepasan: 'Dilepas',
  }
  return KAMUS[jenis] ?? (String(jenis ?? '').replace(/_/g, ' ') || '—')
}

/**
 * Nominal rupiah → bentuk pendek.
 *
 * Sengaja DIGANDAKAN dari `ikhtisar-keuangan.ts`, tidak diimpor darinya:
 * modul gudang tak boleh bergantung pada modul keuangan hanya untuk satu
 * pemformat angka. Kalau kelak ada tiga pemakai, barulah ia diangkat ke
 * `lib/format.ts` — bukan sebelum itu.
 */
export function ringkasRp(n: number): string {
  if (!Number.isFinite(n)) return '—'
  const abs = Math.abs(n)
  const tanda = n < 0 ? '-' : ''
  if (abs >= 1e9) return `${tanda}${(abs / 1e9).toFixed(abs >= 1e10 ? 0 : 1)} M`
  if (abs >= 1e6) return `${tanda}${Math.round(abs / 1e6)} jt`
  if (abs >= 1e3) return `${tanda}${Math.round(abs / 1e3)} rb`
  return `${tanda}${Math.round(abs)}`
}

/**
 * Persen nilai buku terhadap harga perolehan.
 *
 * Nol-per-nol dijaga: perusahaan tanpa aset menghasilkan NaN, dan "NaN%" di
 * kartu inventori adalah cacat yang langsung terlihat pemakai pertama.
 */
export function persenNilaiBuku(buku: string, perolehan: string): number {
  const b = Number(buku)
  const p = Number(perolehan)
  if (!Number.isFinite(b) || !Number.isFinite(p) || p <= 0) return 0
  return Math.round((Math.max(0, b) / p) * 100)
}
