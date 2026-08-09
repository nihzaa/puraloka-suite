import { describe, it, expect } from 'vitest'
import { persenSelesai, labelStatus, NADA_SEVERITY } from './ringkas-lapangan'

describe('persenSelesai', () => {
  it('0/0 → 0, bukan NaN', () => {
    // "NaN%" di layar adalah cacat yang lolos review dan langsung terlihat
    // pemakai pertama. Perusahaan baru tanpa milestone pasti terjadi.
    expect(persenSelesai(0, 0)).toBe(0)
    expect(Number.isNaN(persenSelesai(0, 0))).toBe(false)
  })

  it('total negatif atau bukan angka → 0', () => {
    expect(persenSelesai(5, -3)).toBe(0)
    expect(persenSelesai(5, Number.NaN)).toBe(0)
    expect(persenSelesai(Number.NaN, 10)).toBe(0)
    expect(persenSelesai(5, Number.POSITIVE_INFINITY)).toBe(0)
  })

  it('membulatkan ke bilangan bulat terdekat', () => {
    expect(persenSelesai(20, 39)).toBe(51)   // 51,28…
    expect(persenSelesai(1, 3)).toBe(33)
    expect(persenSelesai(2, 3)).toBe(67)
  })

  it('penuh dan kosong', () => {
    expect(persenSelesai(39, 39)).toBe(100)
    expect(persenSelesai(0, 39)).toBe(0)
  })

  it('selesai negatif dijepit ke nol, tidak menghasilkan persen negatif', () => {
    expect(persenSelesai(-4, 10)).toBe(0)
  })
})

describe('labelStatus', () => {
  it('menerjemahkan nilai enum yang dikenal', () => {
    expect(labelStatus('menunggu_cek')).toBe('Menunggu cek')
    expect(labelStatus('tidak_lolos')).toBe('Tidak lolos')
    expect(labelStatus('terbuka')).toBe('Terbuka')
  })

  it('nilai TAK DIKENAL tetap ditampilkan, bukan disembunyikan', () => {
    // Status baru yang ditambahkan orang lain harus tetap terbaca — kalau
    // dikembalikan string kosong, batangnya muncul tanpa nama.
    expect(labelStatus('status_baru_nanti')).toBe('Status baru nanti')
  })

  it('kosong/undefined → tanda pisah, bukan "undefined"', () => {
    expect(labelStatus('')).toBe('—')
    expect(labelStatus(undefined as unknown as string)).toBe('—')
  })
})

describe('NADA_SEVERITY', () => {
  it('memuat nilai dari KEDUA enum yang berbeda', () => {
    // punch_severity: ringan|sedang|berat|kritis
    // ncr_severity:   minor|major|kritis
    for (const s of ['ringan', 'sedang', 'berat', 'kritis', 'minor', 'major']) {
      expect(NADA_SEVERITY[s], s).toBeDefined()
    }
  })

  it('yang paling parah bernada bahaya', () => {
    expect(NADA_SEVERITY.kritis).toBe('bahaya')
    expect(NADA_SEVERITY.berat).toBe('bahaya')
    expect(NADA_SEVERITY.major).toBe('bahaya')
  })

  it('tak ada nilai tak dikenal yang memetakan ke "bahaya" secara diam-diam', () => {
    expect(NADA_SEVERITY['entah']).toBeUndefined()
  })
})
