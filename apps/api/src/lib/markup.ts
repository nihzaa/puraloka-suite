/**
 * MARKUP & MARGIN — memilih angka yang berlaku, dan menolak menebaknya (G6).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PUSTAKA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `buk_fraction` menentukan seluruh keuntungan perusahaan dari sebuah
 * penawaran, dan sampai migrasi 301 ia **tidak tersimpan di mana pun** — ia
 * dikirim ulang tiap permintaan. API menolak default dengan tegas
 * (`ahsp.ts:411`: *"tidak ada default"*), tetapi UI diam-diam menuliskan
 * `useState("10")`, sehingga 10% menjadi angka bawaan tanpa seorang pun
 * memutuskannya.
 *
 * Pustaka ini memilih markup yang BERLAKU, dan yang paling penting: ia
 * **mengembalikan `null` ketika tak ada yang berlaku**, bukan angka aman.
 *
 * ── Kenapa `null` dan bukan 0
 *
 * Nol adalah jawaban yang MASUK AKAL bagi rumus: penawaran tanpa keuntungan.
 * Ia lolos setiap pemeriksaan tipe, menghasilkan angka yang seluruhnya wajar,
 * dan satu-satunya gejalanya adalah perusahaan menawar pada harga pokok.
 *
 * `null` memaksa pemanggil memutuskan apa yang harus dilakukan. Itu memang
 * lebih merepotkan — dan itulah gunanya.
 */

/** Satu periode markup sebagaimana tersimpan. */
export interface PeriodeMarkup {
  id: string
  jenis_pekerjaan: string | null
  berlaku_sejak: string
  overhead_fraksi: number | string | null
  keuntungan_fraksi: number | string | null
  kontinjensi_fraksi: number | string | null
}

/** Markup yang berlaku, sudah terpilih. */
export interface MarkupBerlaku {
  periode_id: string
  jenis_pekerjaan: string | null
  berlaku_sejak: string
  overhead: number
  keuntungan: number
  kontinjensi: number
  /** Yang diserahkan ke `computeAhsp` — overhead + keuntungan. */
  buk: number
  /** `true` bila yang terpakai baris umum karena tak ada yang spesifik. */
  dari_umum: boolean
}

/**
 * Angka dari basis.
 *
 * `numeric` Postgres tiba sebagai STRING lewat `pg`, dan `Number('')` adalah
 * **0, bukan NaN** — kolom yang dikosongkan akan diam-diam jadi "markup nol
 * persen" alih-alih "belum diisi". Cacat sekelas ini sudah memakan G2a dan
 * ditemukan lagi lewat mutasi di G5.
 *
 * Karena itu di sini: string kosong/spasi → `null`, bukan 0.
 */
export function angka(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = v.trim()
  if (s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** Tanggal `YYYY-MM-DD` — dibandingkan sebagai string, bukan Date. */
function sahTanggal(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s)
}

/**
 * Memilih markup yang berlaku pada sebuah tanggal untuk sebuah jenis
 * pekerjaan.
 *
 * ── Aturan pemilihan, dan kenapa urutannya begitu
 *
 * 1. Hanya periode yang `berlaku_sejak <= pada`. Periode masa depan yang
 *    sudah disiapkan tak boleh dipakai hari ini — itulah gunanya menyiapkan
 *    lebih awal.
 * 2. Yang SPESIFIK (jenis cocok) menang atas yang UMUM (`null`). Kalau tidak,
 *    menambahkan markup umum akan diam-diam mengubah penawaran seluruh jenis
 *    pekerjaan yang sudah punya angkanya sendiri.
 * 3. Di antara yang setara, `berlaku_sejak` TERBESAR menang.
 *
 * Perbandingan tanggal memakai string `YYYY-MM-DD` dan bukan `Date`: format
 * itu tersusun leksikografis, dan `new Date('2026-08-12')` menafsirkannya
 * sebagai UTC tengah malam — yang di zona WIB berarti tanggal SEBELUMNYA.
 * Markup yang berlaku "sejak hari ini" jadi belum berlaku sampai pukul tujuh
 * pagi.
 */
export function pilihMarkup(
  periode: PeriodeMarkup[],
  pada: string,
  jenisPekerjaan?: string | null,
): MarkupBerlaku | null {
  if (!sahTanggal(pada)) return null

  const jenis = jenisPekerjaan?.trim() || null

  const layak = periode.filter((p) => {
    if (!sahTanggal(p.berlaku_sejak)) return false
    if (p.berlaku_sejak > pada) return false
    // Jenis yang TIDAK cocok dibuang; yang umum (null) selalu layak.
    if (p.jenis_pekerjaan !== null && p.jenis_pekerjaan !== jenis) return false
    return true
  })

  if (layak.length === 0) return null

  // Spesifik menang atas umum, lalu tanggal terbesar.
  layak.sort((a, b) => {
    const sa = a.jenis_pekerjaan === null ? 0 : 1
    const sb = b.jenis_pekerjaan === null ? 0 : 1
    if (sa !== sb) return sb - sa
    return a.berlaku_sejak < b.berlaku_sejak ? 1 : a.berlaku_sejak > b.berlaku_sejak ? -1 : 0
  })

  const p = layak[0]
  const overhead = angka(p.overhead_fraksi)
  const keuntungan = angka(p.keuntungan_fraksi)

  // Baris yang komponennya kosong TIDAK dipakai — dan tidak pula diperlakukan
  // sebagai nol. Baris rusak yang dianggap "0%" menghasilkan penawaran pada
  // harga pokok, dan itu terlihat seperti keputusan.
  if (overhead === null || keuntungan === null) return null

  return {
    periode_id: p.id,
    jenis_pekerjaan: p.jenis_pekerjaan,
    berlaku_sejak: p.berlaku_sejak,
    overhead,
    keuntungan,
    kontinjensi: angka(p.kontinjensi_fraksi) ?? 0,
    buk: overhead + keuntungan,
    dari_umum: p.jenis_pekerjaan === null,
  }
}

/** Alasan sebuah nilai markup ditolak. `null` = sah. */
export function periksaFraksi(nama: string, v: number | string | null | undefined): string | null {
  const n = angka(v)
  if (n === null) return `${nama} wajib diisi`
  if (n < 0) return `${nama} tak boleh negatif`
  // Batas 1 (=100%) menangkap kesalahan ketik yang paling mahal: "15"
  // dimaksudkan 15% menghasilkan penawaran 15x lipat yang terlihat sah,
  // dan yang menemukan biasanya panitia lelang, bukan kita.
  if (n > 1) {
    return `${nama} = ${n} berarti ${(n * 100).toFixed(0)}%. Isi sebagai pecahan `
      + `(0.15 untuk 15%), bukan angka persen`
  }
  return null
}

/**
 * Nilai penawaran dari biaya pokok.
 *
 * Kontinjensi dihitung di ATAS biaya pokok, sejajar dengan BUK — bukan
 * bertingkat di atas BUK. Menumpuknya berarti perusahaan mengambil
 * keuntungan dari cadangan risikonya sendiri, dan angka itu menggelembung
 * tanpa ada yang memutuskannya.
 */
export function hitungPenawaran(biayaPokok: number, m: MarkupBerlaku): {
  biaya_pokok: number
  overhead: number
  keuntungan: number
  kontinjensi: number
  nilai_penawaran: number
} {
  const overhead = biayaPokok * m.overhead
  const keuntungan = biayaPokok * m.keuntungan
  const kontinjensi = biayaPokok * m.kontinjensi
  return {
    biaya_pokok: biayaPokok,
    overhead,
    keuntungan,
    kontinjensi,
    nilai_penawaran: biayaPokok + overhead + keuntungan + kontinjensi,
  }
}

/**
 * Margin sesungguhnya dari nilai penawaran — bukan dari biaya pokok.
 *
 * Ini pembedaan yang rutin salah dan mahal: markup 10% di atas biaya BUKAN
 * margin 10%. Biaya 100 + markup 10% = penawaran 110, dan labanya 10 dari
 * 110 = **9,09%**. Selisihnya melebar seiring markup membesar, dan yang
 * memakainya untuk menghitung laba tahunan akan selalu meleset ke atas.
 */
export function marginPersen(nilaiPenawaran: number, biayaPokok: number): number | null {
  if (!Number.isFinite(nilaiPenawaran) || nilaiPenawaran <= 0) return null
  if (!Number.isFinite(biayaPokok) || biayaPokok < 0) return null
  return ((nilaiPenawaran - biayaPokok) / nilaiPenawaran) * 100
}
