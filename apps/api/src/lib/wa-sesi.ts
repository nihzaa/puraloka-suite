/**
 * PABRIK SESI SINTETIS — satu-satunya cara pesan WhatsApp jadi identitas.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PERAN TAK PERNAH DITERIMA DARI PEMANGGIL
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Kriteria D1 menyebutnya eksplisit, dan menunjuk cacat yang nyata:
 *
 *   "sesi sintetis dibangun SATU pabrik teraudit yang meresolusi peran dari
 *    company_members; JANGAN PERNAH menerima peran dari pemanggil
 *    (approval.ts:62 membaca request.currentUser.role apa adanya)"
 *
 * Diperiksa 2026-08-10: benar. `utils/approval.ts:62` memanggil
 * `get_role_permissions(request.currentUser.role)` — nilai itu diambil apa
 * adanya dari objek request.
 *
 * Untuk sesi WEB itu aman: `authenticate` yang mengisinya, dari basis. Untuk
 * sesi SINTETIS tidak — pesan WhatsApp tak lewat `authenticate`, jadi siapa
 * pun yang menyusun objek request-nya menentukan perannya sendiri.
 *
 * Kalau pabrik ini menerima `peran` sebagai parameter, satu pemanggil yang
 * ceroboh (atau satu webhook yang dipalsukan) cukup mengirim `peran: 'admin'`
 * untuk mendapat seluruh permission. Tak ada galat, tak ada gejala — hanya
 * seseorang yang tiba-tiba bisa melakukan lebih dari seharusnya.
 *
 * Karena itu tanda tangannya TIDAK punya parameter peran, dan tak boleh
 * pernah punya. Penjaga `audit-sesi-sintetis-aman.mjs` menegakkannya.
 *
 * ── Perbandingan dengan TJS
 *
 * `automation-tjs/.../owner-ai/synthetic-session.ts:97` meresolusi dari
 * `ownerAiContact`/`staffAiContact` — daftar kontak TERPISAH dari keanggotaan
 * perusahaan. Orang yang dicabut aksesnya di ERP tetap punya sesi sintetis
 * yang sah sampai seseorang ingat menghapusnya dari daftar kedua.
 *
 * Di sini sumbernya `company_members`, yang sama persis dengan yang dipakai
 * login web. Satu pencabutan berlaku di semua jalur.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { normalkanNomor } from './wa-kirim.js'

export interface SesiSintetis {
  userId: string
  companyId: string
  /** Nama peran, DIRESOLUSI dari basis — tak pernah dari pemanggil. */
  peran: string
  nomor: string
}

export type HasilSesi =
  | { ok: true; sesi: SesiSintetis }
  | { ok: false; alasan: AlasanTolak; pesan: string }

export type AlasanTolak =
  | 'nomor_tak_sah'
  | 'nomor_tak_terdaftar'
  | 'belum_terverifikasi'
  | 'nonaktif'
  | 'bukan_anggota'
  | 'gagal_baca'

/**
 * Membangun sesi dari NOMOR saja.
 *
 * Sengaja tak menerima apa pun selain nomor: setiap parameter tambahan adalah
 * pintu bagi pemanggil untuk menentukan sesuatu yang seharusnya diputuskan
 * basis.
 *
 * `db` di sini SupabaseClient lintas-tenant — pesan masuk belum punya tenant
 * sampai nomornya dikenali, jadi pencariannya memang harus melihat semua.
 * Setelah tenant diketahui, seluruh akses berikutnya WAJIB lewat `TenantDb`
 * yang dibuat dari `companyId` hasil fungsi ini.
 */
export async function bangunSesiDariNomor(
  db: SupabaseClient,
  nomorMentah: string,
): Promise<HasilSesi> {
  const nomor = normalkanNomor(nomorMentah)
  if (!nomor) {
    return { ok: false, alasan: 'nomor_tak_sah', pesan: `Nomor '${nomorMentah}' tidak sah` }
  }

  const { data, error } = await db
    .from('wa_nomor_pengguna')
    .select('user_id, company_id, terverifikasi_pada, aktif')
    .eq('nomor', nomor)
    .maybeSingle()

  if (error) {
    // Kegagalan baca TIDAK boleh menyamar jadi "nomor tak terdaftar" — kalau
    // dibiarkan, gangguan basis sesaat terbaca sebagai percobaan akses asing,
    // dan `ai_akses_ditolak` terisi nomor karyawan sendiri.
    return { ok: false, alasan: 'gagal_baca', pesan: `Gagal membaca nomor: ${error.message}` }
  }

  if (!data) {
    return { ok: false, alasan: 'nomor_tak_terdaftar', pesan: 'Nomor tidak terdaftar' }
  }

  const baris = data as {
    user_id: string; company_id: string
    terverifikasi_pada: string | null; aktif: boolean
  }

  if (!baris.terverifikasi_pada) {
    // Siapa pun bisa mengetik nomor orang lain di halaman profil. Tanpa
    // verifikasi, mendaftarkan nomor korban sudah cukup untuk membaca datanya.
    return { ok: false, alasan: 'belum_terverifikasi', pesan: 'Nomor belum diverifikasi' }
  }

  if (!baris.aktif) {
    return { ok: false, alasan: 'nonaktif', pesan: 'Nomor dinonaktifkan' }
  }

  /*
   * PERAN DIRESOLUSI DI SINI, dari `company_members`.
   *
   * Bukan dari kolom di `wa_nomor_pengguna`, dan bukan dari parameter. Kolom
   * peran yang disalin akan basi begitu peran orangnya diubah di ERP — dan
   * basinya tak terlihat sampai seseorang memakai wewenang yang sudah dicabut.
   */
  const { data: anggota, error: errAnggota } = await db
    .from('company_members')
    .select('role_id, roles(name)')
    .eq('company_id', baris.company_id)
    .eq('user_id', baris.user_id)
    .maybeSingle()

  if (errAnggota) {
    return { ok: false, alasan: 'gagal_baca', pesan: `Gagal membaca keanggotaan: ${errAnggota.message}` }
  }

  if (!anggota) {
    // Nomornya terdaftar tetapi orangnya bukan lagi anggota — persis kasus
    // yang TJS lewatkan: daftar kontak terpisah tak ikut terhapus saat akses
    // dicabut.
    return {
      ok: false,
      alasan: 'bukan_anggota',
      pesan: 'Pengguna bukan lagi anggota perusahaan ini',
    }
  }

  const rel = anggota as { roles?: { name?: string } | Array<{ name?: string }> | null }
  // PostgREST mengembalikan relasi sebagai objek ATAU array tergantung bentuk
  // FK-nya. Menganggapnya selalu objek membuat peran jadi `undefined` diam-diam
  // — dan `get_role_permissions(undefined)` mengembalikan set kosong, yang
  // terbaca sebagai "orang ini tak punya izin apa pun".
  const peran = Array.isArray(rel.roles) ? rel.roles[0]?.name : rel.roles?.name

  if (!peran) {
    return { ok: false, alasan: 'gagal_baca', pesan: 'Peran tak dapat diresolusi' }
  }

  return {
    ok: true,
    sesi: { userId: baris.user_id, companyId: baris.company_id, peran, nomor },
  }
}

/**
 * Mencatat percobaan dari nomor yang TIDAK dikenal (perbaikan C-9).
 *
 * Tabel `ai_akses_ditolak` (migrasi 249) sengaja TANPA `company_id`: yang
 * ditolak memang tak punya tenant, dan memaksanya masuk `audit_logs`
 * (company_id NOT NULL) berarti mengarang pemilik jejak.
 *
 * Isi pesannya TIDAK disimpan — hanya nomor, kanal, dan alasan. Pesan dari
 * orang tak dikenal bisa memuat apa saja, dan menyimpannya berarti menyimpan
 * data orang yang tak pernah menyetujui apa pun.
 */
export async function catatAksesDitolak(
  db: SupabaseClient,
  nomorMentah: string,
  alasan: AlasanTolak,
): Promise<void> {
  const { error } = await db.from('ai_akses_ditolak').insert({
    pengenal: normalkanNomor(nomorMentah) ?? nomorMentah.slice(0, 32),
    kanal: 'ai_whatsapp',
    alasan,
  }).select('id')

  // Gagal mencatat tak boleh menjatuhkan penanganan pesan — tapi juga tak
  // boleh hilang. Percobaan akses yang tak tercatat berarti pola serangan
  // tak pernah terlihat.
  if (error) console.error('[wa] gagal mencatat akses ditolak:', error.message)
}
