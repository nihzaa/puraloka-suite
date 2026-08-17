import { describe, it, expect } from 'vitest'
import {
  nilaiRevisiDokumen, periksaRevisi, nomorRevisiBerikut,
} from '../revisi-dokumen.js'

// ═══════════════════════════════════════════════════════════════════════════
// REVISI DOKUMEN
//
// Yang dijaga di sini satu hal, dan ia sudah terbukti mahal di jalur lain:
//
//   STATUS YANG DISIMPAN AKAN MENYIMPANG; STATUS YANG DITURUNKAN TIDAK.
//
// `nilaiRegisterGambar` sudah menuliskannya: gambar rev-2 berstatus 'berlaku'
// yang sudah punya rev-3 ditandai usang APA PUN kata kolomnya — dan itulah
// keadaan yang membuat pekerjaan dibongkar.
//
// Plus satu hal yang hanya muncul pada data yang sudah lama hidup: rantai
// yang induknya SUDAH DIHAPUS. FK-nya `SET NULL`, jadi rev-3 bisa kehilangan
// jejak ke rev-2 — dan melaporkannya sebagai rev-1 membuat orang mengira
// belum pernah ada revisi.
// ═══════════════════════════════════════════════════════════════════════════

const d = (id: string, menggantikan_id: string | null = null) => ({
  id, title: 'Gambar kerja', menggantikan_id, uploaded_at: '2026-08-16',
})

describe('status diturunkan dari rantai, bukan dari kolom', () => {
  it('yang punya penerus ditandai digantikan', () => {
    const { hasil, berlaku, digantikan } = nilaiRevisiDokumen([
      d('r1'), d('r2', 'r1'), d('r3', 'r2'),
    ])

    expect(hasil.find((h) => h.dokumen.id === 'r1')!.digantikan).toBe(true)
    expect(hasil.find((h) => h.dokumen.id === 'r2')!.digantikan).toBe(true)
    // Hanya yang TAK punya penerus yang berlaku.
    expect(hasil.find((h) => h.dokumen.id === 'r3')!.digantikan).toBe(false)
    expect(berlaku).toBe(1)
    expect(digantikan).toBe(2)
  })

  it('menyebut SIAPA penggantinya, bukan sekadar "usang"', () => {
    const { hasil } = nilaiRevisiDokumen([d('r1'), d('r2', 'r1')])
    // Tanpa ini, yang membaca daftar tahu dokumennya usang tapi tak tahu harus
    // membuka yang mana.
    expect(hasil.find((h) => h.dokumen.id === 'r1')!.digantikan_oleh).toBe('r2')
    expect(hasil.find((h) => h.dokumen.id === 'r2')!.digantikan_oleh).toBeNull()
  })

  it('dokumen tunggal tanpa revisi tetap berlaku', () => {
    const { hasil, berlaku } = nilaiRevisiDokumen([d('solo')])
    expect(hasil[0].digantikan).toBe(false)
    expect(hasil[0].revisi).toBe(1)
    expect(berlaku).toBe(1)
  })
})

describe('nomor revisi dihitung dari rantai', () => {
  it('rantai tiga tingkat memberi 1, 2, 3', () => {
    const { hasil } = nilaiRevisiDokumen([d('r1'), d('r2', 'r1'), d('r3', 'r2')])
    expect(hasil.find((h) => h.dokumen.id === 'r1')!.revisi).toBe(1)
    expect(hasil.find((h) => h.dokumen.id === 'r2')!.revisi).toBe(2)
    expect(hasil.find((h) => h.dokumen.id === 'r3')!.revisi).toBe(3)
  })

  it('tiap baris tahu revisi TERTINGGI di rantainya', () => {
    const { hasil } = nilaiRevisiDokumen([d('r1'), d('r2', 'r1'), d('r3', 'r2')])
    // "Anda melihat rev-1 dari 3" — itu yang membuat orang membuka yang benar.
    for (const id of ['r1', 'r2', 'r3']) {
      expect(hasil.find((h) => h.dokumen.id === id)!.revisi_terkini).toBe(3)
    }
  })

  it('induk yang SUDAH DIHAPUS tetap dihitung satu tingkat', () => {
    // FK-nya `ON DELETE SET NULL`, tapi baris bisa juga di luar halaman ini.
    // Berhenti diam-diam akan melaporkan rev-3 sebagai rev-1, dan orang
    // menyimpulkan belum pernah ada revisi.
    const { hasil } = nilaiRevisiDokumen([d('r3', 'sudah-hilang')])
    expect(hasil[0].revisi).toBe(2)
  })

  it('rantai PUTUS: kolom `revisi` jadi lantai, bukan diabaikan', () => {
    // FK-nya `ON DELETE SET NULL` — menghapus revisi TENGAH mengosongkan
    // `menggantikan_id` milik penerusnya. Rantainya benar-benar hilang, dan
    // penelusuran memulangkan 1: rev-3 terbaca seolah tak pernah ada revisi.
    //
    // Kolom `revisi` yang ditulis saat unggah adalah bukti yang tersisa.
    const { hasil } = nilaiRevisiDokumen([
      { id: 'r3', title: 'x', menggantikan_id: null, revisi: 3 },
    ])
    expect(hasil[0].revisi).toBe(3)
  })

  it('kolom yang lebih KECIL tak menurunkan hasil penelusuran', () => {
    // Kolomnya dipakai sebagai LANTAI, bukan sebagai sumber: selama rantainya
    // utuh, penelusuran yang menang.
    const { hasil } = nilaiRevisiDokumen([
      { id: 'r1', title: 'x', menggantikan_id: null, revisi: 1 },
      { id: 'r2', title: 'x', menggantikan_id: 'r1', revisi: 1 },
    ])
    expect(hasil.find((h) => h.dokumen.id === 'r2')!.revisi).toBe(2)
  })

  it('rantai melingkar tidak menggantung', () => {
    // Tak mungkin lahir dari rutenya, tapi bisa lahir dari skrip perbaikan.
    const { hasil } = nilaiRevisiDokumen([d('a', 'b'), d('b', 'a')])
    expect(hasil).toHaveLength(2)
    expect(hasil.every((h) => Number.isFinite(h.revisi))).toBe(true)
  })

  it('dua rantai terpisah tak saling mempengaruhi', () => {
    const { hasil } = nilaiRevisiDokumen([
      d('a1'), d('a2', 'a1'),
      d('b1'),
    ])
    expect(hasil.find((h) => h.dokumen.id === 'b1')!.revisi_terkini).toBe(1)
    expect(hasil.find((h) => h.dokumen.id === 'a2')!.revisi_terkini).toBe(2)
  })
})

describe('periksaRevisi', () => {
  const induk = { id: 'r1', title: 'x', menggantikan_id: null, project_id: 'p1' }

  it('induk sah: boleh', () => {
    expect(periksaRevisi({ induk, projectId: 'p1', sudahDigantikan: false }).ok).toBe(true)
  })

  it('induk tak ditemukan ditolak', () => {
    const v = periksaRevisi({ induk: null, projectId: 'p1', sudahDigantikan: false })
    expect(v.ok).toBe(false)
  })

  it('revisi LINTAS PROYEK ditolak', () => {
    const v = periksaRevisi({
      induk: { ...induk, project_id: 'p9' }, projectId: 'p1', sudahDigantikan: false,
    })
    expect(v.ok).toBe(false)
    expect(v.ok === false && v.galat).toMatch(/melintasi proyek/i)
  })

  it('induk yang SUDAH punya penerus ditolak — riwayat tak boleh bercabang', () => {
    const v = periksaRevisi({ induk, projectId: 'p1', sudahDigantikan: true })
    expect(v.ok).toBe(false)
    // Percabangan tak menghasilkan galat apa pun; ia hanya membuat dua orang
    // memegang dokumen berbeda sambil sama-sama yakin memegang yang terbaru.
    expect(v.ok === false && v.galat).toMatch(/bercabang/i)
  })
})

describe('nomorRevisiBerikut', () => {
  it('rev-2 menggantikan rev-1', () => {
    expect(nomorRevisiBerikut({ revisi: 1 })).toBe(2)
    expect(nomorRevisiBerikut({ revisi: 7 })).toBe(8)
  })

  it('tanpa induk: dokumen baru, rev-1', () => {
    expect(nomorRevisiBerikut(null)).toBe(1)
  })

  it('induk tanpa nomor yang terbaca dianggap rev-1, BUKAN NaN', () => {
    // `NaN + 1` tersimpan sebagai NULL, lalu kolomnya NOT NULL menolak — dan
    // unggahannya gagal dengan galat yang tak menyebut sebabnya.
    expect(nomorRevisiBerikut({ revisi: null })).toBe(2)
    expect(nomorRevisiBerikut({ revisi: 'bukan angka' })).toBe(2)
    expect(nomorRevisiBerikut({ revisi: 0 })).toBe(2)
    expect(nomorRevisiBerikut({ revisi: -5 })).toBe(2)
  })

  it('pecahan dibulatkan ke bawah — nomor revisi selalu bulat', () => {
    expect(nomorRevisiBerikut({ revisi: 2.9 })).toBe(3)
  })
})
