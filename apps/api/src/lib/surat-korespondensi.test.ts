import { describe, it, expect } from 'vitest'
import { evaluasiBatasBalas, validasiKonsistensiSurat } from './surat-korespondensi.js'

// ════════════════════════════════════════════════════════════════════════════
// SURAT — ARAH menentukan siapa yang lalai
// ════════════════════════════════════════════════════════════════════════════
//
// Ini bukan detail administratif:
//
//   KELUAR lewat batas → LAWAN belum menjawab → dasar klaim KITA
//   MASUK  lewat batas → KITA belum menjawab  → dasar klaim LAWAN
//
// Memakai satu tanggal untuk keduanya membuat dua keadaan itu terlihat sama.
// Yang paling merugikan: surat masuk yang kita abaikan tampak seperti surat
// keluar yang tak dijawab lawan — kelalaian kita terbaca sebagai kelalaian
// mereka, sampai ada yang memeriksanya di meja perundingan.

const HARI_INI = '2026-08-04'

describe('ARAH menentukan tanggal acuan DAN siapa yang ditunggu', () => {
  it('surat KELUAR: yang ditunggu LAWAN', () => {
    const h = evaluasiBatasBalas({
      arah: 'keluar', butuhBalasan: true, batasBalas: '2026-08-20',
      tanggalKirim: '2026-08-01', status: 'terkirim', hariIni: HARI_INI,
    })
    expect(h.siapaYangDitunggu).toBe('lawan')
    expect(h.keadaan).toBe('berjalan')
    expect(h.sisaHari).toBe(16)
  })

  it('surat MASUK: yang ditunggu KITA', () => {
    const h = evaluasiBatasBalas({
      arah: 'masuk', butuhBalasan: true, batasBalas: '2026-08-20',
      tanggalTerima: '2026-08-01', status: 'diterima', hariIni: HARI_INI,
    })

    expect(h.siapaYangDitunggu,
      'surat MASUK dilaporkan menunggu lawan — kelalaian KITA terbaca sebagai ' +
      'kelalaian mereka, dan tak ada yang tahu sampai di meja perundingan').toBe('kita')
  })

  it('KELUAR lewat batas → pesannya soal MENAGIH jawaban', () => {
    const h = evaluasiBatasBalas({
      arah: 'keluar', butuhBalasan: true, batasBalas: '2026-07-20',
      tanggalKirim: '2026-07-01', status: 'terkirim', hariIni: HARI_INI,
    })
    expect(h.keadaan).toBe('lewat')
    expect(h.sisaHari).toBe(-15)
    expect(h.pesan).toContain('lawan')
  })

  it('MASUK lewat batas → pesannya soal BUKTI MELAWAN KITA', () => {
    const h = evaluasiBatasBalas({
      arah: 'masuk', butuhBalasan: true, batasBalas: '2026-07-20',
      tanggalTerima: '2026-07-01', status: 'diterima', hariIni: HARI_INI,
    })

    expect(h.keadaan).toBe('lewat')
    expect(h.pesan,
      'peringatan surat masuk yang terabaikan tak menyebut akibatnya — ' +
      'daftar "lewat batas" jadi tak bisa ditindaklanjuti').toContain('KITA')
  })
})

describe('batas balas', () => {
  it('tepat di hari batas masih LOLOS — inklusif', () => {
    const h = evaluasiBatasBalas({
      arah: 'keluar', butuhBalasan: true, batasBalas: HARI_INI,
      tanggalKirim: '2026-08-01', status: 'terkirim', hariIni: HARI_INI,
    })
    expect(h.keadaan,
      'hari terakhir dianggap sudah lewat — surat ditandai lalai sehari ' +
      'terlalu cepat').toBe('mendesak')
    expect(h.sisaHari).toBe(0)
  })

  it('sisa <= 3 hari → MENDESAK', () => {
    const h = evaluasiBatasBalas({
      arah: 'keluar', butuhBalasan: true, batasBalas: '2026-08-06',
      tanggalKirim: '2026-08-01', status: 'terkirim', hariIni: HARI_INI,
    })
    expect(h.keadaan).toBe('mendesak')
    expect(h.sisaHari).toBe(2)
  })
})

describe('yang TIDAK ditunggu', () => {
  it('sudah dibalas → tak_perlu, walau batasnya sudah lewat', () => {
    const h = evaluasiBatasBalas({
      arah: 'keluar', butuhBalasan: true, batasBalas: '2026-01-01',
      tanggalKirim: '2025-12-01', status: 'dibalas', hariIni: HARI_INI,
    })

    expect(h.keadaan,
      'surat yang SUDAH dibalas masih dihitung lewat batas — daftar mendesak ' +
      'penuh hal yang tak perlu ditindaklanjuti, dan yang benar-benar mendesak ' +
      'tenggelam').toBe('tak_perlu')
  })

  it('selesai → tak_perlu', () => {
    expect(evaluasiBatasBalas({
      arah: 'masuk', butuhBalasan: true, batasBalas: '2026-01-01',
      tanggalTerima: '2025-12-01', status: 'selesai', hariIni: HARI_INI,
    }).keadaan).toBe('tak_perlu')
  })

  it('tak butuh balasan → tak_perlu', () => {
    expect(evaluasiBatasBalas({
      arah: 'keluar', butuhBalasan: false, tanggalKirim: '2026-08-01',
      status: 'terkirim', hariIni: HARI_INI,
    }).keadaan).toBe('tak_perlu')
  })

  it('butuh balasan TANPA batas → tak_diatur, tapi siapa yang ditunggu TETAP disebut', () => {
    const h = evaluasiBatasBalas({
      arah: 'masuk', butuhBalasan: true, batasBalas: null,
      tanggalTerima: '2026-08-01', status: 'diterima', hariIni: HARI_INI,
    })

    expect(h.keadaan).toBe('tak_diatur')
    expect(h.siapaYangDitunggu,
      'surat tanpa batas kehilangan informasi siapa yang ditunggu — padahal ' +
      'itu tetap berguna walau tenggatnya belum ditetapkan').toBe('kita')
  })
})

describe('FAIL-CLOSED — tanggal rusak MENOLAK', () => {
  it('format salah ditolak', () => {
    expect(evaluasiBatasBalas({
      arah: 'keluar', butuhBalasan: true, batasBalas: '20-08-2026',
      tanggalKirim: '2026-08-01', status: 'terkirim', hariIni: HARI_INI,
    }).keadaan).toBe('tak_terbaca')
  })

  it('tanggal mustahil (31 Feb) ditolak, tidak digulung', () => {
    expect(evaluasiBatasBalas({
      arah: 'keluar', butuhBalasan: true, batasBalas: '2026-02-31',
      tanggalKirim: '2026-01-01', status: 'terkirim', hariIni: HARI_INI,
    }).keadaan).toBe('tak_terbaca')
  })

  it('batas MENDAHULUI tanggal surat ditolak — bukan dianggap "lewat"', () => {
    const h = evaluasiBatasBalas({
      arah: 'keluar', butuhBalasan: true, batasBalas: '2026-07-01',
      tanggalKirim: '2026-08-01', status: 'terkirim', hariIni: HARI_INI,
    })

    expect(h.keadaan,
      'data rusak dilaporkan sebagai "lewat batas" — menghasilkan peringatan ' +
      'yang tak bisa ditindaklanjuti siapa pun').toBe('tak_terbaca')
  })

  // ⚠️ TEST INI LAHIR DARI MUTASI YANG LOLOS.
  //
  // Mutasi `acuanStr = m.tanggalKirim` (mengabaikan arah) TIDAK tertangkap
  // oleh 19 test sebelumnya — semuanya hanya mengisi SATU tanggal, jadi kedua
  // versi kode membaca nilai yang sama.
  //
  // Kasus nyatanya justru lazim: surat masuk dikirim lawan tanggal 1, baru
  // sampai ke kita tanggal 25, dan batasnya 20. Dihitung dari tanggal KIRIM,
  // batas itu "masuk akal" dan lolos. Dihitung dari tanggal TERIMA — yang
  // benar untuk surat masuk — batasnya mendahului suratnya sendiri, dan itu
  // data yang harus ditolak.
  it('surat MASUK memakai tanggal TERIMA, bukan tanggal kirim lawan', () => {
    const h = evaluasiBatasBalas({
      arah: 'masuk', butuhBalasan: true,
      batasBalas: '2026-08-20',
      tanggalKirim: '2026-08-01',    // lawan mengirim
      tanggalTerima: '2026-08-25',   // kita baru menerima — SESUDAH batas
      status: 'diterima', hariIni: HARI_INI,
    })

    expect(h.keadaan,
      'surat masuk dinilai dari tanggal KIRIM lawan, bukan tanggal TERIMA ' +
      'kita — batas yang mustahil dipenuhi lolos sebagai tenggat yang sah, ' +
      'dan kita dianggap lalai atas waktu yang tak pernah kita miliki').toBe('tak_terbaca')
    expect(h.pesan).toContain('mendahului')
  })

  it('surat KELUAR tetap memakai tanggal KIRIM meski tanggal terima ada', () => {
    // Pasangan kasus di atas — memastikan perbaikannya tak membalik arah.
    const h = evaluasiBatasBalas({
      arah: 'keluar', butuhBalasan: true,
      batasBalas: '2026-08-20',
      tanggalKirim: '2026-08-01',
      tanggalTerima: '2026-08-25',   // lawan baru menerima; tak mengubah tenggat
      status: 'terkirim', hariIni: HARI_INI,
    })
    expect(h.keadaan).toBe('berjalan')
    expect(h.siapaYangDitunggu).toBe('lawan')
  })
})

describe('konsistensi bentuk surat', () => {
  it('surat KELUAR terkirim tanpa tanggal kirim DITOLAK', () => {
    const v = validasiKonsistensiSurat({
      arah: 'keluar', status: 'terkirim', butuhBalasan: false,
    })
    expect(v.ok).toBe(false)
    expect(v.galat).toContain('tanggal kirim')
  })

  it('surat MASUK tanpa tanggal terima DITOLAK', () => {
    const v = validasiKonsistensiSurat({
      arah: 'masuk', status: 'diterima', butuhBalasan: false,
    })
    expect(v.ok,
      'surat masuk tanpa tanggal terima diterima — kewajiban menjawab tak ' +
      'punya titik mulai').toBe(false)
  })

  it('DRAFT boleh tanpa tanggal — belum terjadi apa-apa', () => {
    expect(validasiKonsistensiSurat({
      arah: 'keluar', status: 'draft', butuhBalasan: false,
    }).ok).toBe(true)
  })

  it('terima mendahului kirim DITOLAK', () => {
    const v = validasiKonsistensiSurat({
      arah: 'keluar', status: 'terkirim', butuhBalasan: false,
      tanggalKirim: '2026-08-10', tanggalTerima: '2026-08-01',
    })
    expect(v.ok).toBe(false)
  })

  it('batas balas TANPA butuh balasan DITOLAK', () => {
    const v = validasiKonsistensiSurat({
      arah: 'keluar', status: 'terkirim', butuhBalasan: false,
      tanggalKirim: '2026-08-01', batasBalas: '2026-08-20',
    })

    expect(v.ok,
      'batas pada surat yang tak menuntut jawaban menghasilkan peringatan ' +
      'palsu — dan peringatan palsu melatih orang mengabaikan SELURUH ' +
      'peringatan').toBe(false)
  })

  it('bentuk yang benar LOLOS', () => {
    expect(validasiKonsistensiSurat({
      arah: 'keluar', status: 'terkirim', butuhBalasan: true,
      tanggalKirim: '2026-08-01', batasBalas: '2026-08-20',
    }).ok).toBe(true)
  })
})
