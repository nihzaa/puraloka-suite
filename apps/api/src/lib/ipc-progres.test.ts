import { describe, it, expect } from 'vitest'
import { evaluasiGerbangProgres } from './ipc-progres.js'

// ════════════════════════════════════════════════════════════════════════════
// GERBANG PROGRES TERMIN — yang dijaga adalah UANG DARI OWNER PROYEK
// ════════════════════════════════════════════════════════════════════════════
//
// Termin `on_progress` menurut kontrak baru boleh ditagih setelah pekerjaan
// mencapai persentase tertentu. Sebelum berkas ini, `trigger_pct` tersimpan
// tapi TAK PERNAH DIPERIKSA — termin syarat 40% bisa ditagih di progres 0%.
//
// Dua arah kerugiannya, dua-duanya nyata:
//   · menagih lebih awal dari kontrak → dasar sengketa dengan owner
//   · termin dicairkan sebelum berhak  → celah bagi orang dalam
//
// Titik paling mudah salah: FAIL-CLOSED. Kalau progres tak diketahui, gerbang
// harus MENOLAK. Meloloskannya berarti pengamanannya menghilang persis saat
// datanya paling meragukan.

describe('gerbang hanya berlaku untuk on_progress', () => {
  it('on_sign (invoice DP) lewat tanpa dinilai', () => {
    const h = evaluasiGerbangProgres({ pemicu: 'on_sign', ambangPct: null, progresPct: 0 })
    expect(h.lolos).toBe(true)
    expect(h.alasan).toBe('bukan_on_progress')
  })

  it('on_retention (pencairan retensi) lewat tanpa dinilai', () => {
    const h = evaluasiGerbangProgres({ pemicu: 'on_retention', ambangPct: null, progresPct: null })
    expect(h.lolos).toBe(true)
    expect(h.alasan).toBe('bukan_on_progress')
  })

  it('pemicu null lewat — termin tanpa tipe bukan urusan gerbang ini', () => {
    const h = evaluasiGerbangProgres({ pemicu: null, ambangPct: null, progresPct: null })
    expect(h.lolos).toBe(true)
  })
})

describe('AMBANG — inti gerbangnya', () => {
  it('progres di bawah ambang DITOLAK', () => {
    const h = evaluasiGerbangProgres({ pemicu: 'on_progress', ambangPct: 40, progresPct: 12 })

    expect(h.lolos,
      'termin syarat 40% lolos di progres 12% — kontraktor menagih uang yang ' +
      'menurut kontrak belum berhak ditagih').toBe(false)
    expect(h.alasan).toBe('progres_kurang')
    expect(h.pesan).toContain('40%')
    expect(h.pesan).toContain('12%')
  })

  it('progres TEPAT di ambang LOLOS — batasnya inklusif', () => {
    const h = evaluasiGerbangProgres({ pemicu: 'on_progress', ambangPct: 40, progresPct: 40 })

    expect(h.lolos,
      'progres tepat 40% ditolak untuk ambang 40% — kontrak berkata "pada 40%", ' +
      'bukan "di atas 40%"; menolaknya menahan uang yang sudah berhak cair').toBe(true)
    expect(h.alasan).toBe('lolos')
  })

  it('progres di atas ambang LOLOS', () => {
    const h = evaluasiGerbangProgres({ pemicu: 'on_progress', ambangPct: 40, progresPct: 87.5 })
    expect(h.lolos).toBe(true)
  })

  it('ambang 0 meloloskan progres 0 — termin tanpa syarat progres nyata', () => {
    const h = evaluasiGerbangProgres({ pemicu: 'on_progress', ambangPct: 0, progresPct: 0 })
    expect(h.lolos).toBe(true)
  })

  it('selisih pecahan tetap dihormati', () => {
    const h = evaluasiGerbangProgres({ pemicu: 'on_progress', ambangPct: 40, progresPct: 39.99 })
    expect(h.lolos, 'pembulatan diam-diam meloloskan progres di bawah ambang').toBe(false)
  })
})

describe('FAIL-CLOSED — tak diketahui berarti MENOLAK (Ember [C])', () => {
  it('progres null DITOLAK, bukan diloloskan', () => {
    const h = evaluasiGerbangProgres({ pemicu: 'on_progress', ambangPct: 40, progresPct: null })

    expect(h.lolos,
      'progres tak diketahui diloloskan — gerbangnya menghilang persis saat ' +
      'datanya paling meragukan').toBe(false)
    expect(h.alasan).toBe('progres_tak_diketahui')
  })

  it('progres undefined DITOLAK', () => {
    const h = evaluasiGerbangProgres({ pemicu: 'on_progress', ambangPct: 40, progresPct: undefined })
    expect(h.lolos).toBe(false)
    expect(h.alasan).toBe('progres_tak_diketahui')
  })

  it('progres NaN DITOLAK — bukan dianggap 0, bukan diloloskan', () => {
    // NaN lolos DUA arah kalau dibandingkan langsung: `NaN < 40` false
    // (jadi "lolos") dan `NaN >= 40` juga false. Perbandingan mentah
    // meloloskannya diam-diam.
    const h = evaluasiGerbangProgres({ pemicu: 'on_progress', ambangPct: 40, progresPct: NaN })
    expect(h.lolos, 'NaN lolos lewat perbandingan mentah — semua nilai rusak ikut lolos').toBe(false)
    expect(h.alasan).toBe('progres_tak_diketahui')
  })

  it('ambang null DITOLAK — syaratnya yang hilang, bukan syaratnya nol', () => {
    const h = evaluasiGerbangProgres({ pemicu: 'on_progress', ambangPct: null, progresPct: 90 })

    expect(h.lolos,
      'ambang hilang diperlakukan sebagai "tanpa syarat" — termin bersyarat ' +
      'berubah jadi tak bersyarat tanpa seorang pun memutuskannya').toBe(false)
    expect(h.alasan).toBe('ambang_tak_diketahui')
  })

  it('ambang di luar 0–100 DITOLAK', () => {
    expect(evaluasiGerbangProgres({ pemicu: 'on_progress', ambangPct: 140, progresPct: 100 }).alasan)
      .toBe('ambang_tak_masuk_akal')
    expect(evaluasiGerbangProgres({ pemicu: 'on_progress', ambangPct: -5, progresPct: 10 }).alasan)
      .toBe('ambang_tak_masuk_akal')
  })
})

describe('SERTIFIKAT — angka yang dicatat, bukan sekadar lolos/tidak', () => {
  it('mengembalikan kedua angka supaya pemanggil menyimpannya, bukan menghitung ulang', () => {
    const h = evaluasiGerbangProgres({ pemicu: 'on_progress', ambangPct: 40, progresPct: 62.5 })

    expect(h.progresPct,
      'angka progres tak dikembalikan — sertifikat tak bisa mencatat berapa ' +
      'progres yang diakui saat penagihan, dan enam bulan lagi tak ada yang ' +
      'bisa menjawab "waktu itu progresnya berapa?"').toBe(62.5)
    expect(h.ambangPct).toBe(40)
  })

  it('angka tetap dicatat meski DITOLAK — penolakan pun perlu jejak', () => {
    const h = evaluasiGerbangProgres({ pemicu: 'on_progress', ambangPct: 40, progresPct: 12 })
    expect(h.progresPct).toBe(12)
    expect(h.ambangPct).toBe(40)
  })
})
