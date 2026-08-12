/**
 * CUSTOM FIELD — daftar tertutup & validasi bentuk definisi (TJS-P5).
 *
 * ── Kenapa daftarnya ditulis DUA KALI (di sini dan sebagai enum di basis)
 *
 * Bukan karena lupa. Enum basis adalah penegak — ia menolak apa pun di luar
 * daftar, termasuk dari importer dan psql. Konstanta di sini adalah KATALOG —
 * ia mengisi dropdown di layar pengaturan.
 *
 * Dua daftar yang berbeda diam-diam adalah dropdown yang menawarkan pilihan
 * yang lalu ditolak saat disimpan. Karena itu `audit-custom-field-entitas.mjs`
 * memeriksa keduanya cocok, dan test `custom-field.test.ts` mengunci isi enum
 * ke lima nilai yang diniatkan.
 *
 * Alternatifnya — membaca enum dari basis saat runtime — berarti tiap
 * pembukaan layar pengaturan menunggu satu query katalog, dan tipe TypeScript
 * jadi `string` sehingga salah ketik tak tertangkap tsc. Duplikasi yang
 * dijaga penjaga lebih baik daripada dinamisme yang tak bisa diketik.
 */

export const CF_ENTITAS = ['projects', 'suppliers', 'materials', 'pegawai', 'clients'] as const
export const CF_TIPE = ['teks', 'angka', 'tanggal', 'boolean', 'pilihan', 'uang'] as const

export type CfEntitas = (typeof CF_ENTITAS)[number]
export type CfTipe = (typeof CF_TIPE)[number]

export interface DefinisiCf {
  entitas: CfEntitas
  tipe: CfTipe
  kunci: string
  label: string
  wajib: boolean
  opsi: string[]
  urutan: number
}

export type HasilValidasi =
  | { ok: true; nilai: DefinisiCf }
  | { ok: false; error: string }

/**
 * Kunci teknis: huruf kecil, angka, garis bawah; 2–40 karakter; diawali huruf.
 *
 * Bentuk yang sama dengan CHECK di migrasi 321 — dan itu disengaja: yang di
 * sini memberi pesan yang bisa ditindaklanjuti, yang di basis menegakkan.
 *
 * Batasnya bukan estetika. Kunci ini muncul di respons API sebagai nama
 * properti; kunci ber-spasi atau ber-tanda-kutip memaksa tiap pembaca
 * mengutipnya, dan yang lupa mengutip mendapat `undefined` tanpa galat.
 */
const POLA_KUNCI = /^[a-z][a-z0-9_]{1,39}$/

export function validasiDefinisi(masuk: Record<string, unknown>): HasilValidasi {
  const entitas = String(masuk.entitas ?? '')
  if (!CF_ENTITAS.includes(entitas as CfEntitas)) {
    return {
      ok: false,
      error: `Entitas "${entitas}" tak ada dalam daftar. Yang tersedia: ${CF_ENTITAS.join(', ')}`,
    }
  }

  const tipe = String(masuk.tipe ?? '')
  if (!CF_TIPE.includes(tipe as CfTipe)) {
    return {
      ok: false,
      error: `Tipe "${tipe}" tak ada dalam daftar. Yang tersedia: ${CF_TIPE.join(', ')}`,
    }
  }

  // Kunci dinormalkan lebih dulu, bukan ditolak karena huruf besar —
  // "Kode_Internal" jelas maksudnya, dan menolaknya hanya membuat pengguna
  // menebak-nebak.
  const kunci = String(masuk.kunci ?? '').trim().toLowerCase().replace(/\s+/g, '_')
  if (!POLA_KUNCI.test(kunci)) {
    return {
      ok: false,
      error: 'Kunci harus 2–40 karakter, diawali huruf kecil, hanya huruf/angka/garis bawah '
        + '(contoh: kode_internal)',
    }
  }

  const label = String(masuk.label ?? '').trim()
  if (label === '') return { ok: false, error: 'Label wajib diisi' }

  // Opsi hanya bermakna untuk `pilihan`. Pada tipe lain ia data yang tak
  // pernah dibaca — dan data yang tak dibaca selalu jadi salah tanpa
  // ketahuan. Basis menolaknya lewat CHECK; di sini alasannya dijelaskan.
  const opsiMentah = Array.isArray(masuk.opsi) ? masuk.opsi.map(String).map(s => s.trim()) : []
  const opsi = [...new Set(opsiMentah.filter(Boolean))]

  if (tipe === 'pilihan') {
    if (opsi.length === 0) {
      return {
        ok: false,
        error: 'Tipe "pilihan" butuh minimal satu opsi — dropdown tanpa opsi tak bisa diisi siapa pun',
      }
    }
    if (opsi.length !== opsiMentah.filter(Boolean).length) {
      return { ok: false, error: 'Ada opsi yang kembar' }
    }
  } else if (opsi.length > 0) {
    return { ok: false, error: `Opsi hanya berlaku untuk tipe "pilihan", bukan "${tipe}"` }
  }

  const urutanMentah = masuk.urutan
  // `Number('')` bernilai 0, bukan NaN — kelas cacat yang berulang di repo
  // ini. Jadi kosong/undefined ditangani SEBELUM konversi, bukan sesudah.
  const urutan = urutanMentah === undefined || urutanMentah === null || urutanMentah === ''
    ? 0
    : Number(urutanMentah)
  if (!Number.isFinite(urutan)) return { ok: false, error: 'Urutan harus angka' }

  return {
    ok: true,
    nilai: {
      entitas: entitas as CfEntitas,
      tipe: tipe as CfTipe,
      kunci,
      label,
      wajib: Boolean(masuk.wajib),
      opsi,
      urutan,
    },
  }
}
