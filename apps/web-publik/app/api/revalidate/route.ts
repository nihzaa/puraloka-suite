import { revalidatePath, revalidateTag } from 'next/cache'
import { NextResponse } from 'next/server'

/**
 * Dipanggil API setelah admin menyimpan konten situs.
 *
 * Membuang tag `situs` sehingga permintaan berikutnya mengambil data segar —
 * pengunjung melihat perubahan dalam hitungan detik, bukan menunggu jendela
 * ISR 5 menit habis.
 *
 * Dilindungi rahasia bersama, bukan auth pengguna: pemanggilnya adalah API,
 * bukan orang. Tanpa perlindungan, siapa pun bisa memaksa situs membangun
 * ulang berulang kali dan itu jalur penyalahgunaan yang murah.
 */
export async function POST(request: Request) {
  const rahasia = process.env.SITUS_REVALIDATE_SECRET

  // Belum dikonfigurasi = tertutup, bukan terbuka. Membiarkannya lolos saat
  // secret kosong berarti endpoint ini terbuka bagi siapa pun di lingkungan
  // yang lupa mengesetnya (default gagal-tertutup, Ember [C]).
  if (!rahasia || request.headers.get('x-revalidate-secret') !== rahasia) {
    return NextResponse.json({ error: 'Ditolak' }, { status: 401 })
  }

  // ── Kenapa DUA panggilan, bukan revalidateTag saja ──────────────────────
  //
  // `revalidateTag` hanya membuang cache DATA (hasil `fetch` bertag). Halaman
  // ini di-prerender penuh saat build, dan HTML jadinya disimpan di lapisan
  // cache yang BERBEDA — terbukti dari headernya:
  //     x-nextjs-cache: HIT
  //     Cache-Control: s-maxage=31536000
  //
  // Akibatnya endpoint ini membalas `{direvalidasi:true}` dengan jujur (tag
  // memang dibuang) sementara pengunjung tetap menerima HTML lama. Persis
  // gejala yang muncul saat pengujian: DB berubah, API mengembalikan nilai
  // baru, revalidate 200 — halaman tak bergerak.
  //
  // `revalidatePath('/')` yang membuang HTML-nya. Keduanya dipakai bersama:
  // tag untuk data, path untuk halaman.
  //
  // Argumen kedua `revalidateTag` wajib sejak Next 16 (di 15 cukup satu).
  revalidateTag('situs', 'max')
  revalidatePath('/')

  return NextResponse.json({ direvalidasi: true })
}
