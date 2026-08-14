/**
 * MEMORI JANGKA PENDEK — membaca kembali `ai_pesan` yang sudah tersimpan.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KOLOM YANG DITULIS TAPI TAK PERNAH DIBACA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-14: `OpsiJalan.riwayat` ADA, sudah tersambung ke `pesan:`
 * yang dikirim ke model — dan **tak satu pun pemanggil mengisinya**. `grep`
 * atas seluruh `apps/api/src` menemukan nol produsen.
 *
 * Artinya asisten hari ini **lupa pesan sebelumnya di percakapan yang sama**.
 * Bukan lupa antar-percakapan — lupa pada giliran berikutnya, di jendela chat
 * yang sama, dengan riwayatnya terpampang di layar pengguna.
 *
 * Penyimpanannya sudah ada, sudah dibayar, sudah punya retensi. Yang hilang
 * satu query. Berkas ini query itu.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA DIBATASI, DAN KENAPA BATASNYA BUKAN "SEMUA"
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Tiap pesan riwayat dikirim ULANG pada TIAP RONDE. Percakapan 40 pesan
 * dengan 4 ronde berarti 160 pengiriman pesan lama — dan semuanya ditagih.
 *
 * `MAKS_PESAN` sengaja kecil dan diambil dari EKOR (paling baru), bukan dari
 * kepala: yang menentukan arti "berapa yang tadi itu?" adalah pesan terakhir,
 * bukan pesan pertama percakapan.
 *
 * ── Kenapa `blok` TIDAK ikut
 *
 * `ai_pesan.blok` menyimpan hasil tool mentah (C-5) — kadang ratusan baris
 * JSON. Mengirimkannya kembali sebagai riwayat berarti membayar ulang seluruh
 * data yang sudah diringkas modelnya sendiri di `teks`. Yang dibutuhkan
 * giliran berikutnya adalah KESIMPULANNYA, dan itu ada di `teks`.
 */

import type { TenantDb } from '../utils/tenant-db.js'

/**
 * Berapa pesan terakhir yang dibawa.
 *
 * Sepuluh = lima pertukaran. Cukup untuk "tadi maksudnya yang mana?" tanpa
 * membuat percakapan panjang menagih ulang seluruh isinya tiap ronde.
 *
 * Angka, bukan konfigurasi tenant: ia menentukan BIAYA, dan biaya sudah punya
 * satu tuas yang dipahami orang (plafon bulanan). Tuas kedua yang efeknya
 * tak langsung hanya menambah cara menghabiskan uang tanpa menyadarinya.
 */
export const MAKS_PESAN_RIWAYAT = 10

export interface PesanRiwayat {
  peran: 'user' | 'assistant'
  isi: string
}

/**
 * Membaca N pesan terakhir sebuah percakapan, urut LAMA→BARU.
 *
 * Mengembalikan array kosong pada kegagalan APA PUN — dan itu disengaja.
 * Riwayat yang gagal dibaca berarti asisten kehilangan konteks; melempar dari
 * sini berarti asisten kehilangan SELURUH kemampuan menjawab. Yang pertama
 * mengecewakan, yang kedua rusak.
 *
 * Kegagalannya tetap dicatat lewat `catatGalat` — sunyi di layar, tidak sunyi
 * di log. Persis pola yang dipakai `catatBiayaRonde`.
 */
export async function bacaRiwayat(
  db: TenantDb,
  percakapanId: string,
  opsi: { maks?: number; catatGalat?: (pesan: string, err: unknown) => void } = {},
): Promise<PesanRiwayat[]> {
  const maks = opsi.maks ?? MAKS_PESAN_RIWAYAT
  const catatGalat = opsi.catatGalat ?? (() => {})

  // Diambil DESC lalu dibalik: `limit` pada urutan menaik akan mengambil
  // pesan PERTAMA percakapan, bukan yang terakhir — dan asisten jadi mengingat
  // pembukaan obrolan sambil melupakan kalimat barusan.
  const { data, error } = await db
    .from('ai_pesan')
    .select('peran, teks, urutan')
    .eq('percakapan_id', percakapanId)
    .order('urutan', { ascending: false })
    .limit(maks)

  if (error) {
    catatGalat('gagal membaca riwayat percakapan', error)
    return []
  }

  const baris = (data ?? []) as Array<{ peran: string; teks: string | null }>

  return baris
    .reverse()
    .map((b) => ({
      // Apa pun selain `assistant` diperlakukan sebagai `user`. Nilai asing
      // di kolom peran lebih aman dibaca sebagai ucapan manusia daripada
      // sebagai ucapan asisten: yang kedua memberi teks tak dikenal kedudukan
      // yang sama dengan jawaban yang benar-benar dihasilkan model.
      peran: b.peran === 'assistant' ? ('assistant' as const) : ('user' as const),
      isi: b.teks ?? '',
    }))
    // Pesan kosong dibuang: ia tak menambah konteks apa pun dan tetap ditagih.
    .filter((p) => p.isi.trim().length > 0)
}
