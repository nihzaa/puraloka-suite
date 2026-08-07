// NOMINAL DARI PERMINTAAN — satu pintu masuk untuk angka uang & kuantitas.
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA MODUL INI ADA — dengan jalur cacatnya yang sudah dibuktikan
// ══════════════════════════════════════════════════════════════════════════
//
// `cash.ts` mencatat pengeluaran proyek begini (sebelum 2026-08-08):
//
//     const qtyNum   = parseFloat(qty ?? '1')
//     const priceNum = parseFloat(unit_price)
//     const total    = parseFloat((qtyNum * priceNum).toFixed(2))
//     …
//     if (Number(acc.balance) < total) return 400 'Saldo tidak mencukupi'
//
// Kirim `qty: "abc"` dan seluruh rantai itu runtuh TANPA SATU PUN GEJALA.
// Diukur di Node dan di Postgres pada 2026-08-08, bukan diperkirakan:
//
//   1. `parseFloat('abc')` → NaN, jadi `total` → NaN
//   2. `0 < NaN` bernilai **false** → cek saldo LOLOS, berapa pun saldonya
//   3. Postgres `numeric` **MENERIMA NaN** — kolom NOT NULL tidak menahannya
//   4. `CHECK (qty > 0)` juga LOLOS: perbandingan NaN di Postgres bernilai true
//   5. Sesudah tersimpan: `SELECT sum(v)` atas (100, 250, NaN) = **NaN**
//
// Poin 5 yang paling mahal. Satu baris rusak membuat SELURUH total laporan
// jadi NaN — bukan salah sedikit, melainkan tak punya angka sama sekali. Dan
// tak ada satu pun error di jalan: request membalas 201, layar bilang
// tersimpan, dan yang membuka laporan sebulan kemudian melihat "NaN".
//
// ── Kenapa fungsi, bukan skema validasi di tiap route
//
// Diukur: 331 tempat memanggil `parseFloat`/`Number` atas nilai dari body.
// Menuliskan pemeriksaan di tiap tempat berarti 331 kesempatan melupakannya —
// dan yang terlupa tak akan berbunyi. Satu pintu masuk membuat aturannya bisa
// diuji sekali dan dijaga penjaga.

/** Batas atas yang masuk akal untuk nominal rupiah dalam satu transaksi. */
const BATAS_WAJAR = 1e15

export type HasilNominal =
  | { ok: true; nilai: number }
  | { ok: false; alasan: string }

export interface OpsiNominal {
  /** Nama field, dipakai di pesan galat supaya penerimanya tahu mana. */
  nama: string
  /** Nilai bila field-nya tak dikirim sama sekali. Tanpa ini, kosong = galat. */
  bawaan?: number
  /** Boleh nol? Kuantitas biasanya tidak; nominal pembayaran kadang boleh. */
  bolehNol?: boolean
  /** Boleh negatif? Default tidak — koreksi punya jalurnya sendiri. */
  bolehNegatif?: boolean
  /** Batas atas khusus (mis. persentase 0..100). */
  maks?: number
}

/**
 * Baca satu nominal dari permintaan.
 *
 * INVARIAN yang diuji (`__tests__/nominal.test.ts`):
 *
 *  1. `NaN` DITOLAK — ini seluruh alasan modul ini ada. Ia lolos cek saldo,
 *     lolos CHECK constraint, tersimpan, lalu meracuni SUM laporan.
 *  2. `Infinity` DITOLAK. `parseFloat('Infinity')` mengembalikannya, dan
 *     Postgres numeric menerimanya sama seperti NaN.
 *  3. Teks yang bukan angka DITOLAK — termasuk `'12abc'`, yang
 *     `parseFloat` diam-diam baca sebagai 12.
 *  4. String kosong dan spasi DITOLAK, tidak diperlakukan sebagai 0.
 *  5. Negatif ditolak kecuali diizinkan.
 *  6. Nilai di luar batas wajar ditolak — salah ketik nol beruntun lebih
 *     sering daripada transaksi seharga triliunan.
 *  7. Angka yang sah lewat apa adanya, TANPA pembulatan. Pembulatan uang
 *     adalah keputusan tersendiri (`bulatkanRupiah`), bukan efek samping
 *     dari membaca.
 */
export function bacaNominal(
  mentah: unknown,
  opsi: OpsiNominal,
): HasilNominal {
  const { nama, bawaan, bolehNol = true, bolehNegatif = false, maks } = opsi

  if (mentah === undefined || mentah === null || mentah === '') {
    if (bawaan !== undefined) return { ok: true, nilai: bawaan }
    return { ok: false, alasan: `${nama} wajib diisi` }
  }

  // INVARIAN 4: `'   '` bukan nol. `Number('   ')` mengembalikan 0, dan itu
  // membuat spasi tak sengaja jadi transaksi bernilai nol yang terlihat sah.
  if (typeof mentah === 'string' && mentah.trim() === '') {
    return { ok: false, alasan: `${nama} kosong` }
  }

  if (typeof mentah === 'boolean') {
    return { ok: false, alasan: `${nama} harus angka` }
  }

  // INVARIAN 3: `Number()`, BUKAN `parseFloat()`. `parseFloat('12abc')` = 12 —
  // ia membaca sejauh yang bisa lalu berhenti diam-diam, jadi salah ketik
  // menjadi angka yang salah alih-alih ditolak. `Number('12abc')` = NaN.
  const n = typeof mentah === 'number' ? mentah : Number(mentah)

  // INVARIAN 1 & 2 sekaligus: `Number.isFinite` menolak NaN DAN ±Infinity.
  if (!Number.isFinite(n)) {
    return { ok: false, alasan: `${nama} harus angka (dapat "${String(mentah)}")` }
  }

  if (!bolehNegatif && n < 0) {
    return { ok: false, alasan: `${nama} tidak boleh negatif (dapat ${n})` }
  }
  if (!bolehNol && n === 0) {
    return { ok: false, alasan: `${nama} tidak boleh nol` }
  }

  const batas = maks ?? BATAS_WAJAR
  if (Math.abs(n) > batas) {
    return {
      ok: false,
      alasan: `${nama} di luar batas wajar (dapat ${n}, maksimal ${batas}). Periksa jumlah nol-nya.`,
    }
  }

  return { ok: true, nilai: n }
}

/**
 * Bulatkan nominal rupiah ke 2 desimal.
 *
 * TERPISAH dari `bacaNominal` dengan sengaja: membaca dan membulatkan adalah
 * dua keputusan berbeda, dan menggabungkannya membuat pembulatan terjadi di
 * tempat yang tak diniatkan. Yang dibulatkan adalah HASIL perkalian, bukan
 * masukannya — membulatkan masukan lebih dulu menggeser totalnya.
 *
 * `Number.isFinite` diperiksa lagi di sini: `bacaNominal` menjamin tiap
 * masukan sah, tapi HASIL KALI dua angka sah bisa melampaui `Number.MAX_VALUE`
 * dan menjadi Infinity — dan Infinity yang lolos ke sini akan tersimpan.
 */
export function bulatkanRupiah(n: number): HasilNominal {
  if (!Number.isFinite(n)) {
    return { ok: false, alasan: 'Hasil perhitungan bukan angka yang sah' }
  }
  const b = Math.round((n + Number.EPSILON) * 100) / 100
  if (!Number.isFinite(b) || Math.abs(b) > BATAS_WAJAR) {
    return { ok: false, alasan: `Hasil perhitungan di luar batas wajar (${n})` }
  }
  return { ok: true, nilai: b }
}
