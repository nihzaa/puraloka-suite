import { describe, it, expect } from 'vitest'
import { evaluasiBatasPemberitahuan, validasiKeputusanKlaim } from './klaim-kontraktual.js'

// ════════════════════════════════════════════════════════════════════════════
// KLAIM KONTRAKTUAL — yang menggugurkan klaim bukan angkanya
// ════════════════════════════════════════════════════════════════════════════
//
// Di meja perundingan, klaim jarang gugur karena nilainya salah. Ia gugur
// karena TERLAMBAT DIBERITAHUKAN. Kontrak lazimnya memberi 14–28 hari sejak
// peristiwa, dan lewat dari itu klaim yang paling sah pun kehilangan dasarnya.
//
// Dua hal yang paling mudah tertukar, dan keduanya diuji terpisah di sini:
//
//   TERLAMBAT  → sudah lewat batas → `gugur`
//   DITOLAK    → owner menilai tak berdasar
//
// Menyatukannya menghapus pelajaran termahal: berapa banyak uang hilang karena
// LALAI MEMBERI TAHU, bukan karena klaimnya lemah. Yang pertama bisa
// diperbaiki dengan disiplin; yang kedua tidak.

const HARI_INI = '2026-08-04'

describe('batas pemberitahuan — belum diberitahukan', () => {
  it('masih jauh dari batas → berjalan, sisa hari dilaporkan', () => {
    // Peristiwa 1 Agustus, batas 14 hari, hari ini 4 Agustus → terpakai 3, sisa 11
    const h = evaluasiBatasPemberitahuan({
      tanggalPeristiwa: '2026-08-01', batasHari: 14, hariIni: HARI_INI,
    })
    expect(h.keadaan).toBe('berjalan')
    expect(h.hariTerpakai).toBe(3)
    expect(h.sisaHari).toBe(11)
  })

  it('sisa <= 3 hari → MENDESAK, bukan sekadar "belum lewat"', () => {
    // Peristiwa 22 Juli, batas 14 → jatuh 5 Agustus. Hari ini 4 → sisa 1.
    const h = evaluasiBatasPemberitahuan({
      tanggalPeristiwa: '2026-07-22', batasHari: 14, hariIni: HARI_INI,
    })

    expect(h.keadaan,
      'klaim yang tinggal 1 hari lagi dilaporkan sama dengan yang tinggal ' +
      '13 hari — peringatannya baru muncul setelah terlambat').toBe('mendesak')
    expect(h.sisaHari).toBe(1)
  })

  it('tepat di hari batas masih LOLOS — batasnya inklusif', () => {
    // Peristiwa 21 Juli + 14 hari = 4 Agustus. Hari ini 4 → sisa 0.
    const h = evaluasiBatasPemberitahuan({
      tanggalPeristiwa: '2026-07-21', batasHari: 14, hariIni: HARI_INI,
    })
    expect(h.keadaan,
      'hari terakhir dianggap sudah lewat — klaim yang masih sah ditolak ' +
      'sehari terlalu cepat').toBe('mendesak')
    expect(h.sisaHari).toBe(0)
  })

  it('lewat batas → TERLAMBAT, dan selisihnya disebut', () => {
    // Peristiwa 1 Juli + 14 = 15 Juli. Hari ini 4 Agustus → lewat 20 hari.
    const h = evaluasiBatasPemberitahuan({
      tanggalPeristiwa: '2026-07-01', batasHari: 14, hariIni: HARI_INI,
    })

    expect(h.keadaan).toBe('terlambat')
    expect(h.sisaHari).toBe(-20)
    expect(h.pesan).toContain('BELUM diberi tahu')
  })
})

describe('batas pemberitahuan — sudah diberitahukan', () => {
  it('dinilai dari tanggal PEMBERITAHUAN, bukan hari ini', () => {
    // Peristiwa 1 Juli, diberitahukan 10 Juli (hari ke-9, batas 14) → AMAN,
    // walaupun hari ini sudah 4 Agustus.
    const h = evaluasiBatasPemberitahuan({
      tanggalPeristiwa: '2026-07-01', batasHari: 14,
      tanggalPemberitahuan: '2026-07-10', hariIni: HARI_INI,
    })

    expect(h.keadaan,
      'klaim yang diberitahukan TEPAT WAKTU dianggap terlambat karena hari ini ' +
      'sudah jauh — klaim sah digugurkan oleh berjalannya waktu setelahnya').toBe('aman')
    expect(h.hariTerpakai).toBe(9)
    expect(h.sisaHari).toBe(5)
  })

  it('diberitahukan setelah batas → TERLAMBAT', () => {
    // Peristiwa 1 Juli, diberitahukan 20 Juli (hari ke-19, batas 14) → lewat 5.
    const h = evaluasiBatasPemberitahuan({
      tanggalPeristiwa: '2026-07-01', batasHari: 14,
      tanggalPemberitahuan: '2026-07-20', hariIni: HARI_INI,
    })
    expect(h.keadaan).toBe('terlambat')
    expect(h.sisaHari).toBe(-5)
    expect(h.pesan).toContain('GUGUR')
  })

  it('diberitahukan tepat di hari batas → AMAN', () => {
    const h = evaluasiBatasPemberitahuan({
      tanggalPeristiwa: '2026-07-01', batasHari: 14,
      tanggalPemberitahuan: '2026-07-15', hariIni: HARI_INI,
    })
    expect(h.keadaan).toBe('aman')
    expect(h.sisaHari).toBe(0)
  })
})

describe('batas TAK DIATUR dibedakan dari AMAN', () => {
  it('batas null → tak_diatur, bukan aman', () => {
    const h = evaluasiBatasPemberitahuan({
      tanggalPeristiwa: '2026-01-01', batasHari: null, hariIni: HARI_INI,
    })

    expect(h.keadaan,
      'kontrak tanpa batas dilaporkan "aman" — itu kepatuhan PALSU terhadap ' +
      'aturan yang tak pernah ada, dan menyembunyikan bahwa batasnya belum diisi').toBe('tak_diatur')
    expect(h.sisaHari).toBeNull()
  })
})

describe('FAIL-CLOSED — tanggal rusak MENOLAK, bukan diloloskan', () => {
  it('format salah ditolak', () => {
    expect(evaluasiBatasPemberitahuan({
      tanggalPeristiwa: '01-08-2026', batasHari: 14, hariIni: HARI_INI,
    }).keadaan).toBe('tak_terbaca')
  })

  it('tanggal mustahil (31 Februari) ditolak, tidak digulung jadi 3 Maret', () => {
    const h = evaluasiBatasPemberitahuan({
      tanggalPeristiwa: '2026-02-31', batasHari: 14, hariIni: HARI_INI,
    })

    expect(h.keadaan,
      'tanggal mustahil diterima lalu digulung diam-diam — batas waktu dihitung ' +
      'dari hari yang tak pernah ada').toBe('tak_terbaca')
  })

  it('pemberitahuan MENDAHULUI peristiwa ditolak', () => {
    const h = evaluasiBatasPemberitahuan({
      tanggalPeristiwa: '2026-07-10', batasHari: 14,
      tanggalPemberitahuan: '2026-07-01', hariIni: HARI_INI,
    })
    expect(h.keadaan).toBe('tak_terbaca')
  })

  it('batas negatif ditolak', () => {
    expect(evaluasiBatasPemberitahuan({
      tanggalPeristiwa: '2026-08-01', batasHari: -1, hariIni: HARI_INI,
    }).keadaan).toBe('tak_terbaca')
  })
})

describe('keputusan klaim — konsistensi status vs nilai', () => {
  it('disetujui PENUH wajib sama dengan yang diklaim', () => {
    expect(validasiKeputusanKlaim({
      status: 'disetujui', diklaim: 100_000_000, disetujui: 100_000_000,
    }).ok).toBe(true)
  })

  it('disetujui dengan nilai BERBEDA ditolak — pakai disetujui_sebagian', () => {
    const v = validasiKeputusanKlaim({
      status: 'disetujui', diklaim: 100_000_000, disetujui: 60_000_000,
    })

    expect(v.ok,
      'klaim yang dipotong dicatat sebagai "disetujui penuh" — laporan tak bisa ' +
      'membedakan klaim yang utuh diterima dari yang ditawar separuh').toBe(false)
    expect(v.galat).toContain('disetujui_sebagian')
  })

  it('disetujui_sebagian dengan nilai lebih kecil LOLOS', () => {
    expect(validasiKeputusanKlaim({
      status: 'disetujui_sebagian', diklaim: 100_000_000, disetujui: 60_000_000,
    }).ok).toBe(true)
  })

  it('nilai disetujui MELEBIHI yang diklaim ditolak', () => {
    const v = validasiKeputusanKlaim({
      status: 'disetujui_sebagian', diklaim: 100_000_000, disetujui: 150_000_000,
    })

    expect(v.ok,
      'nilai disetujui melebihi yang ditagih — uang masuk pembukuan tanpa ' +
      'pernah diklaim').toBe(false)
  })

  it('status yang belum memutuskan tak boleh membawa nilai disetujui', () => {
    const v = validasiKeputusanKlaim({
      status: 'diajukan', diklaim: 100_000_000, disetujui: 50_000_000,
    })

    expect(v.ok,
      'klaim yang belum diputus membawa nilai disetujui — angkanya ikut ' +
      'terhitung di laporan padahal owner belum menyetujui apa pun').toBe(false)
  })

  it('ditolak tanpa nilai LOLOS', () => {
    expect(validasiKeputusanKlaim({ status: 'ditolak', diklaim: 100_000_000 }).ok).toBe(true)
  })

  it('gugur tanpa nilai LOLOS — beda dari ditolak, tapi sama-sama nol', () => {
    expect(validasiKeputusanKlaim({ status: 'gugur', diklaim: 100_000_000 }).ok).toBe(true)
  })

  it('disetujui_sebagian TANPA nilai ditolak', () => {
    expect(validasiKeputusanKlaim({
      status: 'disetujui_sebagian', diklaim: 100_000_000, disetujui: null,
    }).ok).toBe(false)
  })
})
