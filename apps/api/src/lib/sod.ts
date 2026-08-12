/**
 * SEGREGATION OF DUTIES — pemisahan wewenang, sebagai ATURAN yang bisa dibaca.
 *
 * ── Cacat yang melahirkan berkas ini (diukur 2026-08-12)
 *
 * `recordApproval` di `utils/approval.ts` adalah satu-satunya pintu persetujuan
 * di repo ini (ADR-007, dijaga `audit-approval-satu-pintu.mjs`). Ia menerima
 * `approvedBy` dan TIDAK PERNAH membandingkannya dengan pengaju. Sembilan jenis
 * entitas, 18 pemanggilan, nol pengecekan.
 *
 * Yang ada hanyalah penanda TAMPILAN: `approval-inbox.ts` mengirim
 * `saya_pengajunya: boolean`, dan halamannya menampilkan lencana "pengajuan
 * Anda" dengan komentar *"supaya ia tak membuka dokumennya hanya untuk
 * menemukan tombolnya tak ada"*.
 *
 * Tombol itu memang tak ada — tapi RUTE-nya ada, dan rute API bisa dipanggil
 * langsung tanpa melewati halaman. Menyembunyikan tombol itu UX, bukan batas
 * keamanan.
 *
 * ── Kenapa satu registri, bukan `if` di tiap rute
 *
 * Kriteria TJS-P4: *"aturan DEKLARATIF, bukan if bertebaran"*.
 *
 * Menambal 18 pemanggilan berarti membangun cacatnya: sembilan belas tempat
 * yang harus diingat, dan yang ke-19 (jenis entitas berikutnya) akan lupa —
 * persis seperti `kolomPengaju: null` di dua entri `inbox-approval.ts` yang
 * ternyata SALAH: `project_expenses.submitted_by` dan `submittals.diajukan_oleh`
 * dua-duanya ada. Registri di sana ditulis sekali lalu tak pernah diperiksa
 * lagi terhadap basis.
 *
 * Karena itu registri ini punya penjaganya sendiri
 * (`audit-sod-lengkap.mjs`): tiap jenis di `ApprovalEntityType` wajib punya
 * entri, dan kolom pengaju yang disebutkannya wajib ADA di schema.
 *
 * ── Kenapa override diizinkan
 *
 * Catatan QUEUE.yaml: *"Larangan tanpa jalan keluar akan dimatikan orang;
 * larangan yang bisa di-override tapi tercatat bertahan."*
 *
 * Puraloka nyata menjalankan proyek dengan 2-3 orang. Larangan mutlak berarti
 * pada hari satu-satunya direktur cuti, pengadaan berhenti — dan yang terjadi
 * berikutnya bukan kepatuhan, melainkan seseorang memakai akun orang lain.
 * Yang dijaga bukan "tak pernah terjadi", melainkan "tak pernah tanpa jejak".
 */
import type { ApprovalEntityType } from '../utils/approval.js'
import type { TabelTerklasifikasi } from '../utils/tenant-map.generated.js'

export interface AturanSod {
  /** Jenis entitas — sama persis dengan `ApprovalEntityType`. */
  jenis: ApprovalEntityType
  /** Tabel yang menyimpan entitasnya. */
  tabel: TabelTerklasifikasi
  /**
   * Kolom yang berisi id PENGAJU.
   *
   * Tak boleh `null`. Kesembilan jenis punya kolomnya — diukur langsung ke
   * `information_schema` pada 2026-08-12, bukan disalin dari registri lain
   * yang dua entrinya ternyata salah.
   */
  kolomPengaju: string
  /** Nama yang dipakai di pesan galat, dalam bahasa pengguna. */
  label: string
}

export const ATURAN_SOD: readonly AturanSod[] = [
  { jenis: 'kasbon',           tabel: 'kasbons',                 kolomPengaju: 'requested_by', label: 'Kasbon' },
  { jenis: 'project_expense',  tabel: 'project_expenses',        kolomPengaju: 'submitted_by', label: 'Pengeluaran Proyek' },
  { jenis: 'change_order',     tabel: 'change_orders',           kolomPengaju: 'created_by',   label: 'Change Order' },
  { jenis: 'material_request', tabel: 'material_requests',       kolomPengaju: 'requested_by', label: 'Permintaan Material' },
  { jenis: 'estimate_version', tabel: 'estimate_versions',       kolomPengaju: 'created_by',   label: 'Versi Estimasi' },
  { jenis: 'submittal',        tabel: 'submittals',              kolomPengaju: 'diajukan_oleh', label: 'Submittal' },
  { jenis: 'lessons_learned',  tabel: 'lessons_learned_records', kolomPengaju: 'created_by',   label: 'Lessons Learned' },
  { jenis: 'cuti_karyawan',    tabel: 'cuti_ambil',              kolomPengaju: 'diajukan_oleh', label: 'Cuti & Izin' },
  { jenis: 'rencana_mutu',     tabel: 'rencana_mutu',            kolomPengaju: 'dibuat_oleh',  label: 'Rencana Mutu' },
  // D1/D3 (2026-08-12). Keduanya sudah menegakkan SoD-nya sendiri di rute —
  // opname lewat CHECK basis `diverifikasi_oleh <> diukur_oleh`, back-charge
  // lewat `periksaSetujuBackCharge` — jadi baris ini BUKAN pemeriksaan
  // pertama, melainkan yang membuat override tercatat lewat satu pintu.
  //
  // Tanpanya `periksaGerbangSod` menolak jenis tak terdaftar (fail-closed)
  // dan approval-nya mati total: bukan lolos, tetapi juga bukan bekerja.
  //
  // Kolom pengaju di opname adalah PENGUKUR, bukan pembuat baris — yang
  // dilarang menyetujui adalah orang yang mengukur di lapangan.
  { jenis: 'opname_bersama',   tabel: 'opname_bersama',          kolomPengaju: 'diukur_oleh',   label: 'Verifikasi Opname' },
  { jenis: 'back_charge',      tabel: 'back_charge',             kolomPengaju: 'diajukan_oleh', label: 'Back-Charge' },
] as const

export function aturanSod(jenis: string): AturanSod | undefined {
  return ATURAN_SOD.find(a => a.jenis === jenis)
}

/** Izin yang membolehkan seseorang menyetujui pengajuannya sendiri. */
export const IZIN_OVERRIDE_SOD = 'approval:override_sod'

export type HasilPeriksaSod =
  | { boleh: true; overrideDipakai: false }
  | { boleh: true; overrideDipakai: true; pengajuId: string }
  | { boleh: false; sebab: string }

/**
 * Apakah `penyetujuId` boleh menyetujui entitas ini?
 *
 * MURNI — tak menyentuh basis. Pemanggil menyediakan `pengajuId` (dibaca dari
 * tabel entitas) dan dua bendera. Dipisah begini supaya keputusannya bisa
 * diuji tanpa basis, dan supaya `recordApproval` tetap satu-satunya yang
 * menulis.
 *
 * Perhatikan urutan: pengaju tak diketahui → BOLEH. Itu disengaja dan
 * berisiko, jadi alasannya harus jelas — entitas yang kolom pengajunya
 * `null` adalah entitas yang dibuat sebelum kolom itu diisi konsisten
 * (data lama), dan memblokirnya berarti melumpuhkan approval atas seluruh
 * data historis. Yang dicegah di sini adalah orang yang TERBUKTI pengaju,
 * bukan orang yang tak terbukti bukan.
 */
export function periksaSod(params: {
  pengajuId: string | null | undefined
  penyetujuId: string
  punyaIzinOverride: boolean
  alasanOverride?: string | null
}): HasilPeriksaSod {
  const { pengajuId, penyetujuId, punyaIzinOverride, alasanOverride } = params

  if (!pengajuId) return { boleh: true, overrideDipakai: false }
  if (pengajuId !== penyetujuId) return { boleh: true, overrideDipakai: false }

  // Mulai dari sini: penyetuju ADALAH pengajunya.
  if (!punyaIzinOverride) {
    return {
      boleh: false,
      sebab: 'Anda tidak bisa menyetujui pengajuan Anda sendiri. '
        + 'Minta orang lain yang berwenang untuk memutuskannya.',
    }
  }

  // Punya izin override, tetapi override TANPA ALASAN tetap ditolak. Alasan
  // kosong membuat barisnya tercatat tapi tak bisa dinilai siapa pun — dan
  // `sod_override.alasan` punya CHECK yang menolaknya juga di sisi basis.
  if (!alasanOverride || alasanOverride.trim() === '') {
    return {
      boleh: false,
      sebab: 'Menyetujui pengajuan sendiri membutuhkan alasan tertulis. '
        + 'Alasan ini tercatat permanen dan tak bisa diubah.',
    }
  }

  return { boleh: true, overrideDipakai: true, pengajuId }
}
