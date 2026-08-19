/**
 * SENGKETA MENGGANTUNG — yang diuji: klaim yang GUGUR karena berhenti bergerak.
 *
 * Data acuan dari basis nyata 2026-08-16:
 *
 *   SKT-01  Rp 420.000.000 · negosiasi · TANPA FORUM · 97 hari
 *   SKT-02  mediasi BANI Bandung · 170 hari
 *   SKT-03  selesai · 352 hari
 *   (tanpa nomor)  dicatat · 22 hari
 */
import { describe, it, expect } from 'vitest'
import { nilaiSengketa } from '../sengketa-menggantung.js'

const S = (o: Partial<Parameters<typeof nilaiSengketa>[0]> = {}) => ({
  nomor: 'SKT-01', status: 'negosiasi', forum: null,
  nilaiTuntutan: 420_000_000, umurHari: 97, ...o,
})

// Ambang: nomor 14 hari, forum 60 hari, diam 90 hari.
const A = [14, 60, 90] as const

describe('nilaiSengketa', () => {
  it('SKT-01 apa adanya: hampir setengah miliar, tanpa forum, 97 hari', () => {
    // Yang paling mahal sekaligus paling sunyi. Masih "negosiasi" sesudah tiga
    // bulan dengan `forum` NULL — artinya tak ada jalur formal apa pun bila
    // negosiasinya buntu.
    const h = nilaiSengketa(S(), ...A)
    expect(h.perlu).toBe(true)
    expect(h.sebab).toBe('tanpa_forum')
  })

  it('BELUM BERNOMOR menang atas sebab lain — paling mudah diperbaiki', () => {
    /*
      Urutannya bukan menurut yang paling mahal, melainkan yang paling mudah
      DIKERJAKAN. Memberi nomor perkara pekerjaan lima menit; memilih forum
      arbitrase keputusan direksi.

      Sengketa di bawah memenuhi ketiganya sekaligus — tanpa nomor, tanpa
      forum, dan berumur 200 hari.
    */
    const h = nilaiSengketa(S({ nomor: null, forum: null, umurHari: 200 }), ...A)
    expect(h.sebab).toBe('belum_bernomor')
  })

  it('nomor berisi SPASI saja dihitung tak bernomor', () => {
    // Kolom yang "diisi" dengan spasi terlihat terisi di layar dan di query
    // `IS NOT NULL`, tetapi tak bisa dirujuk di surat-menyurat mana pun.
    const h = nilaiSengketa(S({ nomor: '   ', umurHari: 30 }), ...A)
    expect(h.sebab).toBe('belum_bernomor')
  })

  it('PERKARA SELESAI tak ditegur, berapa pun umurnya', () => {
    /*
      SKT-03 berumur 352 hari dan sudah selesai. Tanpa penjagaan ini ia akan
      muncul sebagai "lama diam" SELAMANYA — dan peringatan yang menyebut
      perkara tertutup membuat orang berhenti mempercayai seluruh peringatan
      sengketa.
    */
    for (const st of ['selesai', 'Selesai', ' DITUTUP ', 'dicabut', 'batal']) {
      const h = nilaiSengketa(S({ status: st, nomor: null, forum: null, umurHari: 352 }), ...A)
      expect(h.perlu).toBe(false)
      expect(h.sebab).toBe('selesai')
    }
  })

  it('perkara yang punya forum dan masih muda TIDAK ditegur', () => {
    // SKT-02: mediasi di BANI Bandung, 170 hari — tetapi ambang diam 180.
    const h = nilaiSengketa(
      S({ nomor: 'SKT-02', status: 'mediasi', forum: 'BANI Bandung', umurHari: 170 }),
      14, 60, 180)
    expect(h.perlu).toBe(false)
    expect(h.sebab).toBe('bergerak')
  })

  it('berforum tetapi SANGAT lama tetap dilaporkan sebagai lama diam', () => {
    const h = nilaiSengketa(
      S({ nomor: 'SKT-02', status: 'mediasi', forum: 'BANI Bandung', umurHari: 200 }), ...A)
    expect(h.perlu).toBe(true)
    expect(h.sebab).toBe('lama_diam')
  })

  it('sengketa yang BARU dicatat belum ditegur', () => {
    // Yang tanpa nomor berumur 22 hari akan tertangkap ambang nomor (14);
    // yang berumur 5 hari belum.
    const h = nilaiSengketa(S({ nomor: null, umurHari: 5 }), ...A)
    expect(h.perlu).toBe(false)
    expect(h.sebab).toBe('bergerak')
  })

  it('UMUR TAK TERBACA dianggap bergerak, BUKAN menggantung', () => {
    /*
      Sengaja BERBEDA dari `kabar-klien.ts`, yang memperlakukan tanggal rusak
      sebagai "belum pernah dikabari".

      Di sana ketiadaan tanggal ADALAH gejalanya. Di sini menuduh perkara yang
      tanggalnya salah ketik berarti mengirim peringatan hukum atas dasar yang
      keliru — dan pesan sengketa yang SALAH lebih berbahaya daripada yang
      terlambat.
    */
    for (const u of [Number.NaN, -30]) {
      const h = nilaiSengketa(S({ umurHari: u, nomor: null, forum: null }), ...A)
      expect(h.perlu).toBe(false)
      expect(h.sebab).toBe('bergerak')
    }
  })
})
