/**
 * TEMPLATE PESAN WA — mengisi placeholder, dan MENOLAK yang tak terdaftar.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA DAFTAR TERTUTUP, BUKAN INTERPOLASI BEBAS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Godaan pertama: `isi.replace(/\{\{(\w+)\}\}/g, (_, k) => konteks[k] ?? '')`.
 * Satu baris, bekerja untuk semua kasus. Ditolak karena dua hal:
 *
 *   1. Placeholder SALAH KETIK jadi string kosong. Template "Halo {{nma}},"
 *      terkirim sebagai "Halo ," — dan tak ada satu pun galat. Pelanggan
 *      menerima pesan yang terlihat rusak, dan yang menulis template tak
 *      pernah tahu.
 *
 *   2. Konteks bisa memuat lebih dari yang dimaksudkan. Kalau kelak seseorang
 *      meneruskan objek yang kebetulan berisi kunci API atau nomor rekening,
 *      `{{apiKey}}` di template akan mengisinya — dan pesan itu keluar ke
 *      WhatsApp, tersimpan di riwayat chat yang di luar kendali kita.
 *
 * Jadi: variabel yang boleh dipakai DIDAFTARKAN per template (kolom
 * `variabel`), dan yang di luar daftar membuat perenderan GAGAL, bukan
 * menghasilkan pesan yang cacat diam-diam.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * TEMPLATE BUKAN JALUR INJEKSI KE MODEL
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Isi template ditulis manusia dan dikirim ke WhatsApp — ia tak pernah masuk
 * konteks model. Tapi NILAI yang mengisinya bisa berasal dari data yang
 * diketik pengguna lain (nama klien, judul temuan).
 *
 * Yang dilakukan di sini: nilai dipotong panjangnya dan pembungkus `{{ }}`
 * di dalam NILAI dinetralkan. Tanpa itu, nilai yang memuat `{{kode}}` akan
 * ikut terganti pada putaran berikutnya kalau perenderannya berulang —
 * bentuk injeksi template yang klasik.
 */

import type { TenantDb } from '../utils/tenant-db.js'

/** Batas panjang satu nilai. WhatsApp memotong ~4.096; jauh di bawahnya. */
export const MAKS_NILAI = 200

export interface Template {
  kode: string
  label: string
  isi: string
  variabel: string[]
  aktif: boolean
}

export type HasilRender =
  | { ok: true; teks: string }
  | { ok: false; alasan: 'tak_ada' | 'nonaktif' | 'variabel_tak_dikenal' | 'nilai_kurang'; pesan: string }

/**
 * Menetralkan nilai sebelum disisipkan.
 *
 * `{{` di dalam NILAI diubah jadi karakter serupa yang tak dikenali mesin
 * template. Kalau tidak, nilai yang kebetulan memuat `{{kode}}` — mis. judul
 * temuan yang diketik seseorang — akan ikut terganti pada perenderan
 * berikutnya. Itu injeksi template, dan ia tak butuh niat jahat untuk terjadi.
 */
export function bersihkanNilai(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v)
  return s.replace(/\{\{/g, '{ {').slice(0, MAKS_NILAI)
}

/** Placeholder yang benar-benar dipakai sebuah teks template. */
export function variabelDipakai(isi: string): string[] {
  return [...new Set([...isi.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]))]
}

/**
 * Merender template jadi teks siap kirim.
 *
 * Fungsi MURNI — tanpa basis. Itu yang membuat aturan penolakannya bisa
 * dikunci test tanpa perangkat apa pun, dan perenderan adalah tempat cacat
 * paling halus bersembunyi (placeholder kosong, nilai bocor, potongan di
 * tengah kata).
 */
export function render(tpl: Template, nilai: Record<string, unknown>): HasilRender {
  if (!tpl.aktif) {
    return { ok: false, alasan: 'nonaktif', pesan: `Template '${tpl.kode}' dinonaktifkan.` }
  }

  const dipakai = variabelDipakai(tpl.isi)

  /*
   * Placeholder yang TIDAK terdaftar → GAGAL, bukan diisi kosong.
   *
   * Ini yang menangkap salah ketik. "Halo {{nma}}," akan terkirim sebagai
   * "Halo ," dengan interpolasi bebas — pesan cacat tanpa satu pun galat.
   */
  const asing = dipakai.filter((v) => !tpl.variabel.includes(v))
  if (asing.length > 0) {
    return {
      ok: false,
      alasan: 'variabel_tak_dikenal',
      pesan:
        `Template '${tpl.kode}' memakai variabel yang tak terdaftar: ${asing.join(', ')}. ` +
        `Yang tersedia: ${tpl.variabel.join(', ') || '(tidak ada)'}.`,
    }
  }

  // Nilai yang KURANG juga gagal — pesan dengan lubang lebih buruk daripada
  // pesan yang tak terkirim, karena yang pertama tak menuntut siapa pun
  // bertindak.
  const kurang = dipakai.filter((v) => nilai[v] === undefined || nilai[v] === null)
  if (kurang.length > 0) {
    return {
      ok: false,
      alasan: 'nilai_kurang',
      pesan: `Nilai belum lengkap untuk: ${kurang.join(', ')}.`,
    }
  }

  const teks = tpl.isi.replace(/\{\{(\w+)\}\}/g, (_, k: string) => bersihkanNilai(nilai[k]))
  return { ok: true, teks }
}

/**
 * Mengambil template dari basis lalu merendernya.
 *
 * `cadangan` dipakai kalau templatenya belum ada — dan itu bukan kemalasan:
 * tenant yang dibuat SEBELUM migrasi 270 tak punya baris template, dan
 * notifikasi yang berhenti total karena barisnya tak ada jauh lebih buruk
 * daripada notifikasi yang memakai teks bawaan.
 *
 * Cadangannya tetap dicatat ke log supaya ketiadaannya terlihat, bukan
 * tertutup rapi.
 */
export async function renderDariDb(
  db: TenantDb,
  kode: string,
  nilai: Record<string, unknown>,
  cadangan: string,
  catat?: (pesan: string) => void,
): Promise<string> {
  const { data, error } = await db
    .from('wa_template')
    .select('kode, label, isi, variabel, aktif')
    .eq('kode', kode)
    .maybeSingle()

  if (error) {
    catat?.(`template '${kode}' gagal dibaca: ${error.message} — memakai teks bawaan`)
    return cadangan
  }
  if (!data) {
    catat?.(`template '${kode}' tak ada — memakai teks bawaan`)
    return cadangan
  }

  const hasil = render(data as unknown as Template, nilai)
  if (!hasil.ok) {
    // Template yang RUSAK tak boleh menghentikan pesannya. Tapi ia juga tak
    // boleh diam: yang menulis template itu perlu tahu bahwa versinya tak
    // terpakai.
    catat?.(`template '${kode}' tak bisa dirender (${hasil.alasan}): ${hasil.pesan} — memakai teks bawaan`)
    return cadangan
  }
  return hasil.teks
}
