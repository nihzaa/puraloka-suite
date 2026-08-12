/**
 * SYARAT TAGIH TERMIN — aturan yang HARUS sama di dua tempat.
 *
 * `terminSiapTagih` menentukan dua hal sekaligus:
 *
 *   1. kapan notifikasi "Termin Siap Ditagih" dikirim (`check-deadlines`)
 *   2. kapan invoice-nya diterbitkan otomatis (automation 5.1)
 *
 * Kalau keduanya berbeda pendapat, gejalanya membingungkan: orang menerima
 * peringatan untuk termin yang invoice-nya tak kunjung terbit, atau invoice
 * terbit untuk termin yang tak pernah diperingatkan. Test ini mengunci
 * aturannya supaya perbedaan itu tak bisa lahir diam-diam.
 *
 * Fungsi murni — tanpa basis, tanpa HTTP.
 */
import { describe, it, expect } from 'vitest'
import { terminSiapTagih } from '../invoice-termin.js'

describe('on_sign — siap begitu kontrak diteken', () => {
  it('selalu siap, apa pun progresnya', () => {
    expect(terminSiapTagih('on_sign', null, 0)).toBe(true)
    expect(terminSiapTagih('on_sign', null, 100)).toBe(true)
    // `trigger_pct` tak relevan untuk on_sign — kalau ia ikut dinilai,
    // termin uang muka tak akan pernah bisa ditagih sebelum ada progres.
    expect(terminSiapTagih('on_sign', 80, 0)).toBe(true)
  })
})

describe('on_progress — siap saat progres mencapai ambang', () => {
  it('progres DI ATAS ambang: siap', () => {
    expect(terminSiapTagih('on_progress', 50, 75)).toBe(true)
  })

  it('progres TEPAT di ambang: siap', () => {
    // `>=`, bukan `>`. Termin 50% yang progresnya persis 50% memang sudah
    // jatuh tempo — memakai `>` menahannya sampai 51%, dan pada pekerjaan
    // yang berhenti di 50% ia tak pernah bisa ditagih sama sekali.
    expect(terminSiapTagih('on_progress', 50, 50)).toBe(true)
  })

  it('progres DI BAWAH ambang: belum', () => {
    expect(terminSiapTagih('on_progress', 50, 49.9)).toBe(false)
  })

  it('ambang NULL: belum — bukan dianggap nol', () => {
    // Ambang kosong berarti belum ditentukan. Menganggapnya 0 membuat SETIAP
    // termin on_progress langsung tertagih pada progres nol.
    expect(terminSiapTagih('on_progress', null, 100)).toBe(false)
  })

  it('progres NULL dihitung sebagai nol', () => {
    expect(terminSiapTagih('on_progress', 1, null)).toBe(false)
  })
})

describe('jenis pemicu lain tidak menagih apa pun', () => {
  it('jenis tak dikenal: belum', () => {
    // Kolomnya TEXT, jadi salah ketik bisa tersimpan. Yang tak dikenal harus
    // DIAM, bukan menagih — invoice yang terbit karena salah ketik adalah
    // dokumen yang terlanjur keluar ke klien.
    expect(terminSiapTagih('on_sgin', null, 100)).toBe(false)
    expect(terminSiapTagih('manual', 0, 100)).toBe(false)
    expect(terminSiapTagih(null, null, 100)).toBe(false)
  })
})

describe('nilai bertipe string dari basis tetap dibandingkan sebagai angka', () => {
  it('progres "75" lawan ambang 50', () => {
    // PostgREST memulangkan `numeric` sebagai STRING. Perbandingan string
    // `'75' >= 50` di JavaScript kebetulan benar, tetapi `'9' >= 50` juga
    // benar secara string — dan itu menagih termin 50% pada progres 9%.
    expect(terminSiapTagih('on_progress', 50, '75' as unknown as number)).toBe(true)
    expect(terminSiapTagih('on_progress', 50, '9' as unknown as number)).toBe(false)
  })
})
