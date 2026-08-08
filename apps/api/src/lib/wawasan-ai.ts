/**
 * WAWASAN AI — lapisan MURNI: menyusun prompt, lalu memeriksa jawabannya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PEMISAHAN INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Panggilan jaringan tak bisa diuji tanpa mengarang mock yang selalu setuju
 * dengan kodenya sendiri. Yang benar-benar berisiko di fitur ini bukan HTTP-nya
 * — itu urusan SDK — melainkan **apa yang kita percaya dari jawaban model**.
 *
 * Jadi semua yang bisa salah tanpa jaringan diletakkan di sini dan diuji:
 * menyusun fakta, menyusun prompt, dan yang terpenting **menolak jawaban yang
 * tidak memenuhi syarat**. Route (`routes/v1/ai.ts`) tinggal menyambung.
 *
 * ── Aturan Emas §9: model TIDAK BOLEH mengarang angka
 *
 * Skor tetap dihitung deterministik di `apps/web/lib/kesehatan.ts` (10 test).
 * Model hanya diminta **menjelaskan** angka itu dan menyarankan satu tindakan.
 * Kalau model mengembalikan skor sendiri, skor itu DIBUANG — lihat
 * `periksaJawaban()`. Referensi "78/100 Project Success Probability" adalah
 * persis kesalahan yang dihindari di sini: angka meyakinkan tanpa perhitungan.
 *
 * ── Kenapa jawabannya divalidasi, bukan sekadar di-JSON.parse
 *
 * `output_config.format` (structured outputs) membuat bentuk JSON-nya dijamin
 * API. Yang TIDAK dijamin adalah isinya masuk akal: kalimat kosong, rekomendasi
 * sepanjang paragraf, atau saran yang menyebut modul yang tak kita punya.
 * Kartu di web punya ruang terbatas dan pemakainya berliterasi digital rendah
 * (CLAUDE.md §8a.3) — satu paragraf di sana merusak tata letaknya.
 */

/** Fakta terhitung yang dikirim ke model. Tak ada satu pun yang ditebak. */
export interface FaktaPortofolio {
  skor: number
  invoiceLewatTempo: number
  milestoneTelat: number
  proyekMandek: number
  proyekLewatTenggat: number
  proyekAktif: number
}

export interface WawasanAI {
  /** Satu kalimat menilai keadaan. Bukan ramalan, bukan angka baru. */
  penilaian: string
  /** Satu tindakan yang bisa dikerjakan besok pagi. */
  rekomendasi: string
}

/** Batas panjang — kartu punya ruang terbatas, bukan halaman artikel. */
export const BATAS = { penilaian: 120, rekomendasi: 160 } as const

/**
 * Skema jawaban untuk `output_config.format`. Sengaja hanya DUA field teks:
 * tak ada tempat bagi model menuliskan angka yang bukan miliknya.
 */
export const SKEMA_JAWABAN = {
  type: 'object',
  properties: {
    penilaian: {
      type: 'string',
      description: `Satu kalimat bahasa Indonesia menilai kesehatan portofolio, maksimal ${BATAS.penilaian} karakter. Tanpa angka skor.`,
    },
    rekomendasi: {
      type: 'string',
      description: `Satu tindakan konkret yang bisa dikerjakan minggu ini, maksimal ${BATAS.rekomendasi} karakter.`,
    },
  },
  required: ['penilaian', 'rekomendasi'],
  additionalProperties: false,
} as const

/**
 * Prompt sistem.
 *
 * Ditulis pendek dengan sengaja. Prompt panjang berisi larangan berlapis
 * ("JANGAN PERNAH…", "SANGAT PENTING…") justru menurunkan mutu jawaban model
 * sekarang — instruksi diikuti harfiah, jadi penekanan berlebih membuatnya
 * kaku. Yang dibutuhkan cuma: siapa pembacanya, apa yang boleh dikatakan, dan
 * satu larangan yang benar-benar mengikat (jangan mengarang angka).
 */
export const PROMPT_SISTEM = [
  'Anda membantu pemilik perusahaan kontraktor Indonesia membaca kondisi portofolio proyeknya.',
  '',
  'Anda menerima angka yang SUDAH dihitung sistem. Tugas Anda menjelaskan artinya, bukan menghitung ulang.',
  'Jangan menyebut angka baru yang tidak ada dalam fakta yang diberikan, dan jangan menyebut skor — skor sudah tampil di sebelah tulisan Anda.',
  '',
  'Tulis dalam bahasa Indonesia yang lugas, seperti berbicara ke mandor senior: kalimat pendek, tanpa istilah asing yang tak perlu.',
  'Rekomendasi harus satu tindakan yang bisa dikerjakan minggu ini, bukan prinsip manajemen umum.',
].join('\n')

/** Menyusun pesan pengguna dari fakta — satu tempat, supaya bisa diuji. */
export function susunPrompt(f: FaktaPortofolio): string {
  const baris = [
    `Skor kesehatan portofolio: ${f.skor} dari 100.`,
    `Proyek berjalan: ${f.proyekAktif}.`,
    `Invoice lewat jatuh tempo: ${f.invoiceLewatTempo}.`,
    `Milestone telat: ${f.milestoneTelat}.`,
    `Proyek belum bergerak (progres 0%): ${f.proyekMandek}.`,
    `Proyek lewat tenggat: ${f.proyekLewatTenggat}.`,
  ]
  return [
    'Fakta portofolio hari ini:',
    '',
    ...baris,
    '',
    'Berikan satu kalimat penilaian dan satu rekomendasi tindakan.',
  ].join('\n')
}

/** Merapikan spasi/baris baru — model kadang membungkus dengan newline. */
function rapikan(s: unknown): string {
  return typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : ''
}

/**
 * Memeriksa jawaban model. Mengembalikan `null` bila TIDAK layak tampil —
 * dan `null` di sini artinya kartu jatuh ke teks deterministik, bukan kosong.
 *
 * Kenapa menolak, bukan memotong: rekomendasi yang dipotong di tengah kalimat
 * ("Segera tagih invoice PT Sur…") terlihat seperti aplikasi rusak, dan lebih
 * buruk daripada kalimat deterministik yang utuh.
 */
export function periksaJawaban(mentah: unknown): WawasanAI | null {
  if (!mentah || typeof mentah !== 'object') return null

  const o = mentah as Record<string, unknown>
  const penilaian = rapikan(o.penilaian)
  const rekomendasi = rapikan(o.rekomendasi)

  if (!penilaian || !rekomendasi) return null
  if (penilaian.length > BATAS.penilaian) return null
  if (rekomendasi.length > BATAS.rekomendasi) return null

  return { penilaian, rekomendasi }
}
