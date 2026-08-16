/**
 * SIAPA YANG BICARA, DAN HARI INI TANGGAL BERAPA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ASISTEN YANG TAK TAHU LAWAN BICARANYA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-16: prompt sistem TIDAK memuat nama penanya, perannya, atau
 * tanggal hari ini. Akibatnya dua hal yang terlihat sepele dan sebenarnya
 * mendasar:
 *
 *   1. **"Kasbon minggu ini berapa?"** tak bisa dijawab. Model tak tahu
 *      "minggu ini" itu kapan, jadi ia menebak — atau memanggil tool tanpa
 *      saringan tanggal lalu menjawab seluruh riwayat sebagai "minggu ini".
 *
 *   2. **"Siapa saya?"** juga tidak. Asisten pribadi yang menyapa pemiliknya
 *      dengan "Anda" datar, dan yang tak tahu ia sedang bicara dengan mandor
 *      atau dengan direktur, memperlakukan keduanya sama — padahal jawaban
 *      yang pantas untuk keduanya berbeda.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KONTEKS, BUKAN WEWENANG
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Blok ini menyebutkan peran penanya — dan itu TIDAK memberinya hak apa pun.
 * Otorisasi tetap di `requirePermission` dan penyaringan tool per-izin;
 * kalimat di prompt tak pernah jadi gerbang.
 *
 * Bedanya penting: peran di sini dipakai untuk memilih NADA dan menebak apa
 * yang relevan, bukan untuk memutuskan apa yang boleh dibaca. Model yang
 * "diyakinkan" bahwa ia bicara dengan direktur tetap tak bisa membaca satu
 * baris pun di luar izin sesungguhnya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * TANGGAL DIHITUNG SERVER, TIDAK PERNAH DARI MODEL
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Model tak punya jam. Yang ia "tahu" tentang hari ini berasal dari data
 * latihnya, dan itu selalu salah — kadang meleset bertahun.
 *
 * Menyebutkan tanggal, hari, dan rentang minggu/bulan berjalan di sini membuat
 * pertanyaan berwaktu bisa dijawab tanpa satu pun tebakan.
 */

/** Nama hari dalam bahasa Indonesia — `toLocaleDateString` bergantung ICU. */
const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']

const BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
]

export interface KonteksPenanya {
  nama?: string | null
  peran?: string | null
  /** Nama perusahaan — penting saat satu orang memegang beberapa PT. */
  perusahaan?: string | null
}

/** `YYYY-MM-DD` dari `Date`, tanpa bergantung zona UTC `toISOString`. */
function tanggalLokal(d: Date): string {
  const b = String(d.getMonth() + 1).padStart(2, '0')
  const t = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${b}-${t}`
}

/**
 * Menyusun blok konteks. Kosong kalau tak ada satu pun yang diketahui —
 * blok berisi "nama: tidak diketahui" lebih buruk daripada tak ada blok:
 * ia mengundang model menyebut ketidaktahuannya di tiap jawaban.
 */
export function susunKonteksPenanya(
  penanya: KonteksPenanya,
  sekarang = new Date(),
): string {
  const baris: string[] = []

  const nama = penanya.nama?.trim()
  const peran = penanya.peran?.trim()
  const perusahaan = penanya.perusahaan?.trim()

  if (nama) baris.push(`- Nama: ${nama}`)
  if (peran) baris.push(`- Peran: ${peran}`)
  if (perusahaan) baris.push(`- Perusahaan: ${perusahaan}`)

  /*
   * Rentang minggu dihitung SENIN–MINGGU.
   *
   * `getDay()` memulai pekan di Minggu (0), dan memakainya apa adanya membuat
   * "minggu ini" pada hari Minggu menunjuk pekan yang baru saja dimulai —
   * bukan pekan yang baru saja dijalani orang. Di lapangan, "minggu ini"
   * berarti Senin sampai hari ini.
   */
  const hariKe = sekarang.getDay()
  const mundur = hariKe === 0 ? 6 : hariKe - 1
  const senin = new Date(sekarang)
  senin.setDate(senin.getDate() - mundur)

  const awalBulan = new Date(sekarang.getFullYear(), sekarang.getMonth(), 1)

  const teksTanggal =
    `${HARI[hariKe]}, ${sekarang.getDate()} ${BULAN[sekarang.getMonth()]} ` +
    `${sekarang.getFullYear()}`

  baris.push(
    `- Hari ini: ${teksTanggal} (${tanggalLokal(sekarang)})`,
    `- "Minggu ini" = ${tanggalLokal(senin)} sampai ${tanggalLokal(sekarang)}`,
    `- "Bulan ini" = ${tanggalLokal(awalBulan)} sampai ${tanggalLokal(sekarang)}`,
  )

  return [
    '',
    '',
    'SIAPA YANG SEDANG BICARA DENGAN ANDA:',
    ...baris,
    '',
    'Sapa dengan namanya bila diketahui. Perannya dipakai untuk memilih NADA',
    'dan menebak apa yang relevan — BUKAN untuk menentukan apa yang boleh',
    'dibaca; itu sudah ditentukan izinnya, di luar percakapan ini.',
    'Tanggal di atas dihitung server. Jangan memakai perkiraan tanggal Anda',
    'sendiri, dan jangan menjawab pertanyaan berwaktu tanpa memakai rentang di',
    'atas.',
  ].join('\n')
}
