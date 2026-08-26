/**
 * PESAN GALAT — satu tempat, supaya tak ada layar yang menelan kegagalan.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-27: lima layar mobile memuat data dengan `catch {}` KOSONG
 * berkomentar "keep old data". Niatnya masuk akal — jangan kosongkan layar
 * saat jaringan putus sebentar. Akibatnya tidak.
 *
 * Pada layar yang BELUM pernah punya data, "pertahankan data lama" berarti
 * mempertahankan KEKOSONGAN, dan kekosongan itu dirender sebagai "Belum ada
 * kasbon" / "Belum ada proyek". Kegagalan jadi tak bisa dibedakan dari
 * ketiadaan.
 *
 * Itulah yang menyembunyikan 404 `/api/v1/mandor/kasbons` — rute yang tak
 * pernah ada — entah berapa lama. Layarnya tampak sehat dan tenang.
 *
 * ── Kenapa bukan sekadar `console.error`
 *
 * Tak ada yang membaca console di HP mandor. Galat harus sampai ke LAYAR,
 * dengan kalimat yang bisa ditindaklanjuti orang yang sedang berdiri di
 * proyek — bukan "Request failed with status code 404".
 */

/**
 * Ubah galat apa pun jadi satu kalimat berbahasa Indonesia yang bisa
 * ditindaklanjuti.
 *
 * `konteks` melengkapi kalimatnya: pesanNya jadi "Gagal memuat <konteks>."
 * Isi dengan kata benda, huruf kecil — "kasbon", "daftar proyek".
 */
export function pesanGalat(err: unknown, konteks: string): string {
  const e = err as {
    response?: { status?: number; data?: { error?: string } };
    code?: string;
    message?: string;
  };

  // Pesan dari server selalu menang: ia yang paling tahu apa yang salah.
  const dariServer = e?.response?.data?.error;
  if (dariServer) return dariServer;

  const status = e?.response?.status;

  /*
    Tanpa `response` berarti permintaannya tak pernah sampai — jaringan mati,
    alamat salah, atau server tak hidup. Dibedakan dari galat ber-status
    karena tindakannya berbeda: yang ini pengguna bisa perbaiki sendiri
    dengan memeriksa sinyal.
  */
  if (!status) {
    return `Tidak bisa terhubung ke server. Periksa koneksi internet Anda, lalu coba lagi.`;
  }

  if (status === 401) return 'Sesi Anda berakhir. Silakan masuk kembali.';
  if (status === 403) return `Anda tidak punya akses ke ${konteks}.`;
  /*
    404 pada layar MUAT hampir selalu berarti cacat pemrograman (rute salah
    tulis), bukan kesalahan pengguna — dan pesan "tidak ditemukan" akan
    membuat mandor menyimpulkan datanya HILANG. Kalimatnya sengaja menunjuk
    ke aplikasi, supaya yang dilaporkan ke kantor adalah gejala yang benar.
  */
  if (status === 404) return `${konteks} tidak tersedia di server. Laporkan ke admin — kemungkinan ada pembaruan aplikasi yang belum terpasang.`;
  if (status >= 500) return `Server sedang bermasalah saat memuat ${konteks}. Coba lagi beberapa saat lagi.`;

  return `Gagal memuat ${konteks}. Tarik ke bawah untuk mencoba lagi.`;
}
