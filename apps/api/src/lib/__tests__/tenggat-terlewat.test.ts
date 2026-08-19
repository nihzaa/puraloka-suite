/**
 * TENGGAT TERLEWAT — bentuk bersama untuk tujuh otomasi.
 *
 * Data acuan dari basis nyata 2026-08-19:
 *
 *   punch_items          36 belum ditutup, terlama 16 hari lewat
 *   ncr_items            17 belum ditutup, terlama 15 hari lewat, 1 TANPA target
 *   inspection_requests  12 belum diperiksa, terlama 22 hari lewat
 *   tindakan_mitigasi     5 belum selesai, terlama 18 hari lewat
 *   notulen_tindakan      3 belum selesai, terlama 17 hari lewat, 1 TANPA tenggat
 *   temuan_k3             3 belum ditutup, terlama 9 hari lewat
 *   rfq                   2 lewat batas masuk, terlama 10 hari
 */
import { describe, it, expect } from 'vitest'
import { nilaiTenggat } from '../tenggat-terlewat.js'

const P = (o: Partial<Parameters<typeof nilaiTenggat>[0]> = {}) => ({
  sisaHari: -16, selesai: false, keparahan: null, ...o,
})

describe('nilaiTenggat', () => {
  it('punch item terlama apa adanya: 16 hari lewat', () => {
    const h = nilaiTenggat(P(), 3)
    expect(h.perlu).toBe(true)
    expect(h.sebab).toBe('lewat')
  })

  it('yang SUDAH SELESAI tak ditegur, berapa pun lewatnya', () => {
    // Tanpa ini, punch item yang ditutup setahun lalu akan muncul sebagai
    // "lewat 400 hari" selamanya.
    const h = nilaiTenggat(P({ sisaHari: -400, selesai: true, keparahan: 'kritis' }), 3)
    expect(h.perlu).toBe(false)
    expect(h.sebab).toBe('selesai')
  })

  it('TANPA TENGGAT dilaporkan, BUKAN dilewati', () => {
    /*
      Keadaan yang paling mudah luput. Diukur: satu NCR dan satu tindak lanjut
      notulen tak punya tenggat sama sekali.

      Laporan mana pun yang bertanya "apa yang lewat tenggat?" akan
      MELEWATKANNYA selamanya — bukan karena beres, melainkan karena tak punya
      tenggat untuk dilewati. Pekerjaan tanpa tenggat tak pernah terlambat,
      dan karena itu tak pernah dikerjakan.
    */
    for (const s of [null, Number.NaN]) {
      const h = nilaiTenggat(P({ sisaHari: s as number | null }), 3)
      expect(h.perlu).toBe(true)
      expect(h.sebab).toBe('tanpa_tenggat')
    }
  })

  it('yang BELUM jatuh tempo dan masih jauh TIDAK ditegur', () => {
    expect(nilaiTenggat(P({ sisaHari: 30 }), 3).perlu).toBe(false)
    expect(nilaiTenggat(P({ sisaHari: 30 }), 3).sebab).toBe('aman')
  })

  it('SEGERA — peringatan datang sebelum tenggat, saat masih bisa dicegah', () => {
    // Peringatan sesudah tenggat hanya bisa melapor; yang sebelum bisa mencegah.
    const h = nilaiTenggat(P({ sisaHari: 2 }), 3)
    expect(h.perlu).toBe(true)
    expect(h.sebab).toBe('segera')
  })

  it('tepat DI tenggat (sisa 0) masih dihitung segera, bukan lewat', () => {
    // Batas yang mudah salah satu hari. Hari-H belum lewat.
    expect(nilaiTenggat(P({ sisaHari: 0 }), 3).sebab).toBe('segera')
    expect(nilaiTenggat(P({ sisaHari: -1 }), 3).sebab).toBe('lewat')
  })

  it('KEPARAHAN menggeser ambang segera, tidak menggantikannya', () => {
    /*
      Cacat kritis diperingatkan lebih awal supaya masih ada waktu bertindak:
      ambang 3 × faktor 2 = 6 hari.

      Pada sisa 5 hari: yang kritis sudah ditegur, yang biasa belum.
    */
    expect(nilaiTenggat(P({ sisaHari: 5, keparahan: 'kritis' }), 3, 2).sebab).toBe('segera')
    expect(nilaiTenggat(P({ sisaHari: 5, keparahan: 'minor' }), 3, 2).sebab).toBe('aman')
  })

  it('keparahan TIDAK pernah membuat sesuatu berhenti dilaporkan', () => {
    // Cacat ringan yang lewat tenggat tetap lewat tenggat. Ia hanya tak
    // membangunkan orang di prioritas tinggi.
    const ringan = nilaiTenggat(P({ sisaHari: -5, keparahan: 'minor' }), 3)
    expect(ringan.perlu).toBe(true)
    expect(ringan.mendesak).toBe(false)

    const berat = nilaiTenggat(P({ sisaHari: -5, keparahan: 'kritis' }), 3)
    expect(berat.perlu).toBe(true)
    expect(berat.mendesak).toBe(true)
  })

  it('keparahan diterima dalam dua bahasa — tujuh tabel ini tak seragam', () => {
    /*
      Sebagian tabel memakai `severity` bahasa Inggris, sebagian `tingkat`
      bahasa Indonesia. Menyeragamkannya di basis pekerjaan lain; sampai itu
      terjadi, fungsi ini menerima keduanya.
    */
    for (const k of ['kritis', 'critical', 'MAYOR', ' major ', 'tinggi', 'High']) {
      expect(nilaiTenggat(P({ sisaHari: -1, keparahan: k }), 3).mendesak,
        `keparahan "${k}" seharusnya mendesak`).toBe(true)
    }
    for (const k of ['minor', 'rendah', 'low', '', null]) {
      expect(nilaiTenggat(P({ sisaHari: -1, keparahan: k }), 3).mendesak,
        `keparahan "${k}" seharusnya TIDAK mendesak`).toBe(false)
    }
  })

  it('KEPARAHAN BERUPA ANGKA diterima — bukan cuma kata', () => {
    /*
      Ini yang seharusnya menangkap cacat 2026-08-19.

      Saya menulis di komentar bahwa `temuan_k3` memakai keparahan "bahasa
      Indonesia", lalu rutenya balas 500 dengan `.trim is not a function`.
      Diukur: kolomnya SMALLINT berisi 2 dan 3.

      Tiga tabel, tiga bentuk berbeda:
        punch_items.severity  enum kata   ringan/sedang/berat/kritis
        ncr_items.severity    enum kata   minor/major/kritis
        temuan_k3.tingkat     SMALLINT    1 · 2 · 3
        skor risiko           angka       matriks 5×5, 1..25
    */
    expect(nilaiTenggat(P({ sisaHari: -1, keparahan: 3, ambangBerat: 3 }), 3).mendesak).toBe(true)
    expect(nilaiTenggat(P({ sisaHari: -1, keparahan: 2, ambangBerat: 3 }), 3).mendesak).toBe(false)
    // Skor risiko pada skala yang jauh berbeda.
    expect(nilaiTenggat(P({ sisaHari: -1, keparahan: 16, ambangBerat: 12 }), 3).mendesak).toBe(true)
    expect(nilaiTenggat(P({ sisaHari: -1, keparahan: 9, ambangBerat: 12 }), 3).mendesak).toBe(false)
  })

  it('ANGKA TANPA ambangBerat dianggap ringan, bukan ditebak', () => {
    /*
      Keputusan yang disengaja. Skala tiap tabel berbeda — `temuan_k3.tingkat`
      1..3, skor risiko 1..25 — dan tak ada satu ambang bawaan yang benar untuk
      keduanya.

      Menebak salah satu berarti diam-diam salah untuk yang lain: ambang 12
      akan membuat SELURUH temuan K3 (maksimum 3) terlihat ringan, dan ambang
      3 akan membuat hampir SELURUH risiko terlihat berat.

      Lebih baik memperlakukannya ringan — sinyalnya tetap dilaporkan, hanya
      tak dinaikkan prioritasnya.
    */
    expect(nilaiTenggat(P({ sisaHari: -1, keparahan: 25 }), 3).mendesak).toBe(false)
    expect(nilaiTenggat(P({ sisaHari: -1, keparahan: 25 }), 3).perlu).toBe(true)
  })

  it('angka NOL dan angka dalam bentuk string tetap dibaca sebagai angka', () => {
    // Postgres numeric bisa sampai ke sini sebagai string lewat driver
    // tertentu. `'0'` yang salah dibaca sebagai kata akan lolos ke pencocokan
    // kata dan memulangkan false — kebetulan benar, tetapi karena alasan salah.
    expect(nilaiTenggat(P({ sisaHari: -1, keparahan: 0, ambangBerat: 3 }), 3).mendesak).toBe(false)
    expect(nilaiTenggat(P({ sisaHari: -1, keparahan: '3', ambangBerat: 3 }), 3).mendesak).toBe(true)
  })

  it('tanpa tenggat + keparahan berat = mendesak', () => {
    // NCR kritis yang tak diberi target adalah gabungan terburuk: cacat berat
    // yang tak pernah muncul di laporan keterlambatan mana pun.
    const h = nilaiTenggat(P({ sisaHari: null, keparahan: 'kritis' }), 3)
    expect(h.sebab).toBe('tanpa_tenggat')
    expect(h.mendesak).toBe(true)
  })
})
