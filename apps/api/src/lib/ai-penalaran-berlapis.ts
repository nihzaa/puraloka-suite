/**
 * 8.2 + 8.7 — PERTANYAAN YANG BUTUH BEBERAPA TOOL, LALU SINTESIS.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA INI BUKAN TOOL BARU
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Katalog 8.2 ("bagaimana jika ambil proyek baru senilai X?") dan 8.7
 * ("proyek mana yang harus diprioritaskan bulan ini dan kenapa?") terdaftar
 * bersama 34 nomor lain sebagai kandidat TOOL. Keduanya bukan.
 *
 * Datanya sudah lengkap dan sudah punya tool masing-masing: `simulasi_kas`
 * (8.1), `banding_proyek` (8.8), `ikhtisar` (2.17), `arus_kas` (2.4),
 * `serapan_biaya` (8.4), `investasi_alat` (8.5). Membuat tool ke-45 bernama
 * `what_if` berarti menyalin logika keenamnya ke satu tempat baru — dan
 * salinan itu akan menyimpang dari aslinya, persis seperti salinan aturan
 * keamanan di kepala `ai-jalankan.ts`.
 *
 * Yang benar-benar kurang: **model tak pernah diberi tahu bahwa ia BOLEH
 * memanggil beberapa tool berurutan lalu menyintesisnya.** Diukur 2026-08-16
 * — tak ada satu kalimat pun tentang itu di `PAGAR_FAKTA` maupun `GAYA_DASAR`.
 * Model yang tak diberi tahu cenderung menjawab dari tool pertama yang ia
 * panggil, lalu berhenti.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * BATAS RONDE ADALAH BATAS BERPIKIR — DAN IA DIAM
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `ai-loop.ts` menyisihkan ronde TERAKHIR tanpa tool (C-4), supaya model
 * terpaksa merangkum alih-alih meminta tool yang tak akan dijawab. Akibatnya
 * `maks_ronde = 4` berarti hanya **3 ronde bertool**.
 *
 * Pertanyaan strategis yang jujur butuh 4–5 pembacaan. Dengan tiga, model
 * menyimpulkan dari data separuh — dan jawabannya tetap terbaca yakin.
 * Loop memang menandainya `alasan: 'ronde_habis'`, tapi penanda itu ada di
 * metadata, bukan di kalimat yang dibaca founder.
 *
 * Maka blok ini menyuruh model MENYATAKANNYA SENDIRI di dalam jawaban ketika
 * ia kehabisan langkah. Pertahanan di dua tempat: satu bisa dilewatkan
 * pembaca, dua tidak.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG PALING BERBAHAYA: SKENARIO YANG TERBACA SEPERTI CATATAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 8.2 meminta model MENGANDAIKAN ("bagaimana jika ambil proyek Rp 5 M?").
 * Pengandaian adalah satu-satunya tempat di seluruh sistem ini di mana model
 * DIIZINKAN menyebut angka yang tak ada di basis.
 *
 * Itu melubangi `PAGAR_FAKTA` kalau tidak dijaga: begitu model boleh
 * mengarang satu angka, jawaban campuran antara angka nyata dan angka
 * andaian menjadi mustahil diperiksa pembacanya.
 *
 * Jalan tengahnya bukan melarang pengandaian — itu membunuh 8.2 — melainkan
 * mewajibkan angka andaian DIBERI LABEL dan dipisah dari angka tercatat.
 * Aturannya diletakkan di sini, bukan di `PAGAR_FAKTA`, supaya pagar itu
 * tetap satu blok yang tak bersyarat.
 */

/**
 * Blok panduan penalaran berlapis.
 *
 * Disambung SETELAH pagar fakta dan gaya, sebelum konteks penanya — ia
 * mengatur CARA BEKERJA, bukan batas maupun watak.
 */
export const PENALARAN_BERLAPIS = [
  '',
  '',
  'PERTANYAAN YANG BUTUH BEBERAPA LANGKAH:',
  '- Sebagian pertanyaan tak terjawab oleh satu tool. "Proyek mana yang harus',
  '  diprioritaskan?" menuntut Anda melihat beberapa sisi lebih dulu —',
  '  misalnya kas, serapan biaya, dan perbandingan antarproyek.',
  '- Untuk pertanyaan seperti itu, PANGGIL BEBERAPA TOOL BERURUTAN, baru',
  '  simpulkan. Menjawab dari tool pertama saja menghasilkan kesimpulan yang',
  '  terdengar yakin padahal separuh datanya belum Anda lihat.',
  '- Sebutkan tool mana saja yang Anda pakai untuk sampai ke kesimpulan itu.',
  '',
  'KALAU LANGKAH ANDA HABIS:',
  '- Anda punya batas jumlah langkah. Kalau batas itu tercapai sebelum Anda',
  '  selesai memeriksa, KATAKAN TERUS TERANG di jawaban Anda: sebutkan apa',
  '  yang belum sempat diperiksa, dan bahwa kesimpulannya sementara.',
  '- Jangan menutupi kekurangan itu dengan kalimat yang lebih yakin.',
  '',
  'PERTANYAAN PENGANDAIAN ("bagaimana jika ..."):',
  '- Anda BOLEH menghitung skenario andaian, dan hanya di sinilah Anda boleh',
  '  memakai angka yang tidak ada di basis — yaitu angka yang DISEBUTKAN',
  '  penanya sendiri.',
  '- Angka andaian WAJIB diberi label jelas, mis. "(andaian, dari pertanyaan',
  '  Anda)". Pisahkan bagian andaian dari bagian data tercatat.',
  '- Jangan pernah mengarang angka andaian sendiri. Kalau penanya tak',
  '  menyebut nilainya, tanyakan — jangan diisi dengan tebakan yang wajar.',
  '- Sesudah menghitung, sebutkan apa yang membuat hitungan itu bisa meleset.',
].join('\n')

/**
 * Kalimat yang ditambahkan ketika loop BENAR-BENAR kehabisan ronde.
 *
 * Berbeda dari blok di atas, ini bukan instruksi melainkan pemberitahuan yang
 * ditempelkan ke jawaban. Alasannya: pada saat ronde habis, model sudah tak
 * punya kesempatan bicara lagi — ronde terakhir sudah terpakai. Menyuruhnya
 * "katakan kalau kehabisan" saja tak cukup, karena ia bisa saja tak sadar
 * langkahnya adalah yang terakhir.
 *
 * Dipakai `ai-jalankan.ts` saat `alasan === 'ronde_habis'`.
 */
export const CATATAN_RONDE_HABIS =
  '\n\n_(Catatan sistem: batas langkah pemeriksaan tercapai, jadi jawaban di ' +
  'atas mungkin belum memakai seluruh data yang relevan. Persempit ' +
  'pertanyaannya bila perlu jawaban yang lebih pasti.)_'

/**
 * Menempelkan catatan ronde-habis bila perlu.
 *
 * Idempoten: dipanggil dua kali tak menghasilkan dua catatan. Bukan kerapian —
 * jawaban yang memuat peringatan yang sama dua kali membuat pembacanya
 * menyangka ada dua masalah berbeda.
 */
export function tempelCatatanRonde(teks: string, alasan: string): string {
  if (alasan !== 'ronde_habis') return teks
  if (teks.includes('batas langkah pemeriksaan tercapai')) return teks
  return teks + CATATAN_RONDE_HABIS
}
