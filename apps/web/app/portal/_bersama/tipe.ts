/**
 * Tipe bersama portal klien — tab read-only tambahan (punch/inspeksi/submittal).
 *
 * Subset read-only dari bentuk API yang sama dipakai portal mandor/PM:
 * `GET /api/v1/projects/:projectId/punch-items` (`punch-list.ts`, konstanta
 * `PUNCH_SELECT`), `GET /api/v1/projects/:projectId/inspections`
 * (`inspeksi.ts`, konstanta `INSPEKSI_SELECT`), dan
 * `GET /api/v1/projects/:projectId/submittals` (`submittal.ts`, konstanta
 * `SUBMITTAL_SELECT`) — dibaca ULANG dari kode nyata untuk task ini, lihat
 * `mandor-portal/_bersama/tipe.ts` untuk versi lengkap (`PunchItem`,
 * `Inspeksi`, `Submittal`) beserta katatan field yang berbeda dari dugaan
 * awal.
 *
 * ⚠️ Dugaan awal brief untuk ketiga tipe di bawah SALAH nama field:
 *   - Punch: brief menebak hanya `deskripsi/status/dibuat_pada` — kolom
 *     tanggal API sebenarnya `created_at`, bukan `dibuat_pada` (field
 *     Indonesia itu tak pernah dipakai di modul ini).
 *   - Inspeksi: brief menebak `judul/status/tanggal` — API tak punya kolom
 *     `tanggal` sama sekali untuk inspection_requests (izin cor); yang ada
 *     `diminta_untuk` (jadwal) dan `created_at`.
 *   - Submittal: brief menebak `judul/status/diputuskan_pada` — itu SUDAH
 *     benar untuk tiga field itu, tapi API juga mengirim `nomor` yang
 *     berguna ditampilkan ke klien (rujukan saat bertanya ke kontraktor).
 *
 * `GalatApi` + `pesanGalat` sengaja DIDUPLIKASI di sini (juga di
 * mandor-portal dan pm-portal) — mengikuti struktur route Next.js yang
 * sudah ada per-portal, bukan kelalaian DRY.
 */

/** Temuan punch list — versi ringkas untuk ditampilkan ke klien. */
export interface PunchItemKlien {
  id: string
  nomor?: string | null
  judul?: string | null
  deskripsi?: string | null
  lokasi?: string | null
  severity?: string | null
  status?: string | null
  created_at?: string | null
}

/** Permintaan inspeksi (izin cor/izin tutup) — versi ringkas untuk klien. */
export interface InspeksiKlien {
  id: string
  nomor?: string | null
  judul?: string | null
  lokasi?: string | null
  status?: string | null
  /** Jadwal pemeriksaan yang diminta — bukan tanggal pelaksanaan sungguhan. */
  diminta_untuk?: string | null
  diperiksa_pada?: string | null
  created_at?: string | null
}

/** Submittal material/shop drawing — versi ringkas untuk klien. */
export interface SubmittalKlien {
  id: string
  nomor?: string | null
  judul?: string | null
  jenis?: string | null
  status?: string | null
  diajukan_pada?: string | null
  diputuskan_pada?: string | null
}

export interface GalatApi {
  response?: { data?: { error?: string; message?: string }; status?: number }
  message?: string
}

export function pesanGalat(e: unknown, bawaan: string): string {
  const g = e as GalatApi
  return g?.response?.data?.error ?? g?.response?.data?.message ?? g?.message ?? bawaan
}
