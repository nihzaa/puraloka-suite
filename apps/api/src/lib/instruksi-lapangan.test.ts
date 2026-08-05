import { describe, it, expect } from 'vitest'
import { evaluasiKonfirmasi, jalurTindakLanjut } from './instruksi-lapangan.js'

// ════════════════════════════════════════════════════════════════════════════
// INSTRUKSI LAPANGAN — konfirmasi punya UMUR
// ════════════════════════════════════════════════════════════════════════════
//
// Perintah lisan yang dicatat sepihak BUKAN bukti — ia versi kita. Yang
// membuatnya berjejak adalah konfirmasi balik ke pemberi perintah.
//
// Tapi konfirmasi punya umur. Surat hari-yang-sama ("menindaklanjuti instruksi
// Bapak pagi ini…") nyaris tak pernah dibantah. Surat yang sama, dikirim tiga
// bulan kemudian setelah tagihan ditolak, terbaca sebagai REKONSTRUKSI — dan
// memang begitulah ia akan diperlakukan.
//
// Yang paling mudah salah: menyamakan semua bentuk perintah. Instruksi
// TERTULIS sudah berjejak; memasukkannya ke daftar "belum dikonfirmasi"
// membuat daftar itu penuh hal yang tak butuh apa-apa — dan yang benar-benar
// mendesak tenggelam.

const T = (iso: string) => iso

describe('bentuk perintah menentukan mendesaknya', () => {
  it('TERTULIS tak butuh konfirmasi — sudah berjejak', () => {
    const h = evaluasiKonfirmasi({
      bentuk: 'tertulis', status: 'dicatat',
      diterimaPada: T('2026-01-01T08:00:00Z'),
      sekarang: T('2026-08-04T08:00:00Z'),   // tujuh bulan kemudian
    })

    expect(h.keadaan,
      'instruksi TERTULIS masuk daftar "belum dikonfirmasi" — daftarnya penuh ' +
      'hal yang tak butuh apa-apa, dan yang benar-benar mendesak tenggelam').toBe('tak_perlu')
  })

  it('LISAN: batas 24 jam', () => {
    const h = evaluasiKonfirmasi({
      bentuk: 'lisan', status: 'dicatat',
      diterimaPada: T('2026-08-04T08:00:00Z'),
      sekarang: T('2026-08-04T20:00:00Z'),   // 12 jam
    })
    expect(h.keadaan).toBe('mendesak')
    expect(h.jamBerlalu).toBe(12)
    expect(h.sisaJam).toBe(12)
  })

  it('WHATSAPP: batas lebih longgar (72 jam) — ada jejak', () => {
    const h = evaluasiKonfirmasi({
      bentuk: 'whatsapp', status: 'dicatat',
      diterimaPada: T('2026-08-02T08:00:00Z'),
      sekarang: T('2026-08-04T08:00:00Z'),   // 48 jam
    })
    expect(h.keadaan,
      'whatsapp diperlakukan seketat lisan — padahal ia punya jejak, dan ' +
      'menyamakannya membuat peringatan kehilangan arti').toBe('mendesak')
    expect(h.sisaJam).toBe(24)
  })

  it('LISAN lewat 24 jam → LEWAT', () => {
    const h = evaluasiKonfirmasi({
      bentuk: 'lisan', status: 'dicatat',
      diterimaPada: T('2026-08-01T08:00:00Z'),
      sekarang: T('2026-08-04T08:00:00Z'),   // 72 jam
    })
    expect(h.keadaan).toBe('lewat')
    expect(h.sisaJam).toBe(-48)
    expect(h.pesan).toContain('disangkal')
  })
})

describe('konfirmasi yang SUDAH dilakukan — cepat vs lambat', () => {
  it('dikonfirmasi dalam batas → nilai bukti PENUH', () => {
    const h = evaluasiKonfirmasi({
      bentuk: 'lisan', status: 'dikonfirmasi',
      diterimaPada: T('2026-08-04T08:00:00Z'),
      dikonfirmasiPada: T('2026-08-04T18:00:00Z'),   // 10 jam
      sekarang: T('2026-08-05T08:00:00Z'),
    })
    expect(h.keadaan).toBe('terkonfirmasi_segera')
    expect(h.jamBerlalu).toBe(10)
  })

  it('dikonfirmasi TEPAT di batas masih SEGERA — inklusif', () => {
    const h = evaluasiKonfirmasi({
      bentuk: 'lisan', status: 'dikonfirmasi',
      diterimaPada: T('2026-08-04T08:00:00Z'),
      dikonfirmasiPada: T('2026-08-05T08:00:00Z'),   // tepat 24 jam
      sekarang: T('2026-08-06T08:00:00Z'),
    })
    expect(h.keadaan,
      'konfirmasi tepat di batas dinilai terlambat — disiplin 1x24 jam yang ' +
      'dipenuhi persis malah dihukum').toBe('terkonfirmasi_segera')
  })

  it('dikonfirmasi LEWAT batas → nilainya berkurang, dan itu DIKATAKAN', () => {
    const h = evaluasiKonfirmasi({
      bentuk: 'lisan', status: 'dikonfirmasi',
      diterimaPada: T('2026-05-01T08:00:00Z'),
      dikonfirmasiPada: T('2026-08-01T08:00:00Z'),   // tiga bulan kemudian
      sekarang: T('2026-08-04T08:00:00Z'),
    })

    expect(h.keadaan,
      'konfirmasi tiga bulan setelah perintah dinilai sama dengan konfirmasi ' +
      'hari yang sama — padahal yang pertama terbaca sebagai REKONSTRUKSI').toBe('terkonfirmasi_lambat')
    expect(h.pesan).toContain('rekonstruksi')
  })

  it('konfirmasi dinilai dari SELISIHNYA, bukan dari sekarang', () => {
    // Dikonfirmasi 2 jam setelah perintah, tapi itu setahun lalu.
    // Yang menentukan nilai buktinya adalah selisih 2 jam itu.
    const h = evaluasiKonfirmasi({
      bentuk: 'lisan', status: 'dikonfirmasi',
      diterimaPada: T('2025-08-04T08:00:00Z'),
      dikonfirmasiPada: T('2025-08-04T10:00:00Z'),
      sekarang: T('2026-08-04T08:00:00Z'),
    })
    expect(h.keadaan,
      'konfirmasi yang dilakukan TEPAT WAKTU dinilai terlambat karena hari ini ' +
      'sudah jauh — bukti sah dirusak oleh berjalannya waktu setelahnya').toBe('terkonfirmasi_segera')
    expect(h.jamBerlalu).toBe(2)
  })
})

describe('DISANGKAL bukan "belum dikonfirmasi"', () => {
  it('disangkal punya keadaan sendiri, dan pesannya berbeda', () => {
    const h = evaluasiKonfirmasi({
      bentuk: 'lisan', status: 'disangkal',
      diterimaPada: T('2026-08-01T08:00:00Z'),
      sekarang: T('2026-08-04T08:00:00Z'),
    })

    expect(h.keadaan,
      'instruksi yang DISANGKAL masih ditampilkan sebagai "belum ' +
      'dikonfirmasi" — orang mengira masih bisa dikejar, padahal yang ' +
      'dibutuhkan sudah berbeda: bukti lain').toBe('disangkal')
    expect(h.pesan).toContain('saksi')
  })

  it('ditolak & dilaksanakan → tak_perlu', () => {
    for (const status of ['ditolak', 'dilaksanakan'] as const) {
      expect(evaluasiKonfirmasi({
        bentuk: 'lisan', status,
        diterimaPada: T('2026-08-01T08:00:00Z'),
        sekarang: T('2026-08-04T08:00:00Z'),
      }).keadaan).toBe('tak_perlu')
    }
  })
})

describe('FAIL-CLOSED — waktu rusak MENOLAK', () => {
  it('waktu penerimaan rusak ditolak', () => {
    expect(evaluasiKonfirmasi({
      bentuk: 'lisan', status: 'dicatat',
      diterimaPada: 'bukan-tanggal',
      sekarang: T('2026-08-04T08:00:00Z'),
    }).keadaan).toBe('tak_terbaca')
  })

  it('konfirmasi MENDAHULUI perintah ditolak — bukan dianggap "sangat cepat"', () => {
    const h = evaluasiKonfirmasi({
      bentuk: 'lisan', status: 'dikonfirmasi',
      diterimaPada: T('2026-08-04T08:00:00Z'),
      dikonfirmasiPada: T('2026-08-03T08:00:00Z'),
      sekarang: T('2026-08-05T08:00:00Z'),
    })
    expect(h.keadaan,
      'konfirmasi bertanggal SEBELUM perintahnya diterima sebagai bukti ' +
      'terbaik — padahal itu justru tanda datanya rusak atau dikarang').toBe('tak_terbaca')
  })
})

describe('jalur tindak lanjut — biaya dan waktu DIPISAH', () => {
  it('berdampak biaya saja → klaim', () => {
    const h = jalurTindakLanjut({ berdampakBiaya: true, berdampakWaktu: false })
    expect(h.jalur).toEqual(['klaim'])
  })

  it('berdampak waktu saja → eot', () => {
    const h = jalurTindakLanjut({ berdampakBiaya: false, berdampakWaktu: true })
    expect(h.jalur).toEqual(['eot'])
  })

  it('berdampak KEDUANYA → dua jalur, dan itu DIKATAKAN', () => {
    const h = jalurTindakLanjut({ berdampakBiaya: true, berdampakWaktu: true })

    expect(h.jalur,
      'instruksi yang menuntut biaya DAN waktu hanya memicu satu jalur — ' +
      'yang lain terbuang tanpa ada yang tahu').toEqual(['klaim', 'eot'])
    expect(h.pesan).toContain('DUA jalur')
  })

  it('tak berdampak → nol jalur', () => {
    expect(jalurTindakLanjut({ berdampakBiaya: false, berdampakWaktu: false }).jalur).toEqual([])
  })
})
