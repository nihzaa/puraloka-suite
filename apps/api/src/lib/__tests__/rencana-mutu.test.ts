import { describe, it, expect } from 'vitest'
import {
  ringkasItp,
  cacatRencanaMutu,
  bolehDisetujui,
  type TitikItp,
  type RencanaMutu,
} from '../rencana-mutu.js'

// ══════════════════════════════════════════════════════════════════════════
// Fixture ditulis LONGGAR supaya tiap test hanya menyebut yang diujinya.
//
// Pelajaran dari sesi 2026-08-10 (geotag): fixture dua elemen tak bisa
// membedakan komparator yang dibalik dari yang benar, karena kedua urutan
// sama-sama "berurutan". Yang diuji di sini karena itu memakai ≥3 elemen
// dengan urutan yang SENGAJA diacak di masukan.
// ══════════════════════════════════════════════════════════════════════════
function titik(p: Partial<TitikItp> & { jenis_titik: TitikItp['jenis_titik'] }): TitikItp {
  return {
    id: p.id ?? Math.random().toString(36).slice(2),
    urutan: p.urutan ?? 0,
    kode: p.kode ?? null,
    tahap_pekerjaan: p.tahap_pekerjaan ?? 'Pekerjaan',
    uraian: p.uraian ?? 'Uraian',
    jenis_titik: p.jenis_titik,
    // `p.kriteria !== undefined`, BUKAN `??`. Dengan `??`, `kriteria: null`
    // yang sengaja diminta test diam-diam diganti nilai bawaan — dan test
    // yang menguji "kriteria kosong" jadi menguji kriteria terisi.
    // Ini ketahuan saat penulisan: test-nya merah, kodenya benar.
    kriteria: p.kriteria !== undefined ? p.kriteria : 'Kriteria terisi',
    acuan: p.acuan ?? 'SNI',
    lolos: p.lolos ?? null,
    catatan_hasil: p.catatan_hasil ?? null,
    diperiksa_pada: p.diperiksa_pada ?? null,
  }
}

function rmp(p: Partial<RencanaMutu> = {}): RencanaMutu {
  return {
    id: 'r1',
    nomor: 'RMP-01',
    judul: 'Rencana Mutu',
    revisi: p.revisi ?? 0,
    status: p.status ?? 'draf',
    standar_acuan: p.standar_acuan !== undefined ? p.standar_acuan : 'SNI 2847:2019',
    sasaran_mutu: p.sasaran_mutu !== undefined ? p.sasaran_mutu : 'Nol NCR mayor',
    disetujui_pada: p.disetujui_pada ?? null,
  }
}

describe('ringkasItp — apa yang MENAHAN pekerjaan', () => {
  it('HOLD yang belum diperiksa MENAHAN, sama seperti yang ditolak', () => {
    const r = ringkasItp([
      titik({ jenis_titik: 'hold', lolos: null, urutan: 1 }),
      titik({ jenis_titik: 'hold', lolos: false, catatan_hasil: 'keropos', urutan: 2 }),
      titik({ jenis_titik: 'hold', lolos: true, urutan: 3 }),
    ])
    // Untuk HOLD, `null` dan `false` sama-sama menahan — satu-satunya tempat
    // di modul ini keduanya diperlakukan sama.
    expect(r.menahan).toHaveLength(2)
    expect(r.boleh_lanjut).toBe(false)
  })

  it('membedakan "belum diperiksa" dari "ditolak" meski keduanya menahan', () => {
    const r = ringkasItp([
      titik({ jenis_titik: 'hold', lolos: null }),
      titik({ jenis_titik: 'hold', lolos: false, catatan_hasil: 'x' }),
    ])
    // Perbedaannya dibawa keluar supaya layar bisa menampilkannya berbeda:
    // "menunggu inspektur" dan "ditolak inspektur" menuntut tindakan berbeda.
    expect(r.belum).toBe(1)
    expect(r.gagal).toBe(1)
  })

  it('WITNESS yang belum lolos TIDAK menahan', () => {
    const r = ringkasItp([
      titik({ jenis_titik: 'witness', lolos: null }),
      titik({ jenis_titik: 'witness', lolos: false, catatan_hasil: 'tak hadir' }),
    ])
    expect(r.menahan).toHaveLength(0)
    expect(r.menunggu_saksi).toHaveLength(2)
    // Nol HOLD yang menahan → boleh lanjut, meski ada witness tertunda.
    expect(r.boleh_lanjut).toBe(true)
  })

  it('REVIEW tak pernah menahan maupun masuk daftar saksi', () => {
    const r = ringkasItp([titik({ jenis_titik: 'review', lolos: null })])
    expect(r.menahan).toHaveLength(0)
    expect(r.menunggu_saksi).toHaveLength(0)
    expect(r.boleh_lanjut).toBe(true)
  })

  it('ITP KOSONG bukan "boleh lanjut" — ia belum menyatakan apa pun', () => {
    const r = ringkasItp([])
    // Ini kesalahan yang paling mahal kalau dibuat: proyek yang belum
    // menyusun ITP akan terbaca "aman untuk lanjut".
    expect(r.boleh_lanjut).toBeNull()
    expect(r.boleh_lanjut).not.toBe(true)
  })

  it('urutan `menahan` mengikuti urutan tahap, bukan urutan masukan', () => {
    const r = ringkasItp([
      titik({ jenis_titik: 'hold', lolos: null, urutan: 30, uraian: 'ketiga' }),
      titik({ jenis_titik: 'hold', lolos: null, urutan: 10, uraian: 'pertama' }),
      titik({ jenis_titik: 'hold', lolos: null, urutan: 20, uraian: 'kedua' }),
    ])
    // Tiga elemen, masukan teracak: komparator yang dibalik menghasilkan
    // urutan yang berbeda dan terdeteksi. Dua elemen tidak cukup.
    expect(r.menahan.map((t) => t.uraian)).toEqual(['pertama', 'kedua', 'ketiga'])
  })

  it('pct_lolos dihitung dari yang SUDAH diperiksa, bukan dari total', () => {
    const r = ringkasItp([
      titik({ jenis_titik: 'review', lolos: true }),
      titik({ jenis_titik: 'review', lolos: true }),
      titik({ jenis_titik: 'review', lolos: null }),
      titik({ jenis_titik: 'review', lolos: null }),
      titik({ jenis_titik: 'review', lolos: null }),
    ])
    // 2 dari 2 yang diperiksa = 100%, bukan 40% yang terbaca seperti kegagalan.
    expect(r.pct_lolos).toBe(100)
    expect(r.pct_selesai).toBe(40)
  })

  it('pct_lolos NULL saat belum ada yang diperiksa, bukan 0', () => {
    const r = ringkasItp([titik({ jenis_titik: 'hold', lolos: null })])
    // 0 berarti "semua gagal" — klaim yang tak dimiliki datanya.
    expect(r.pct_lolos).toBeNull()
  })

  it('titik `undefined` diperlakukan seperti belum diperiksa', () => {
    // Kolom baru pada baris lama tiba sebagai `undefined`, bukan `null`.
    const t = titik({ jenis_titik: 'hold' })
    delete (t as { lolos?: unknown }).lolos
    const r = ringkasItp([t])
    expect(r.belum).toBe(1)
    expect(r.menahan).toHaveLength(1)
  })
})

describe('cacatRencanaMutu — yang mungkin tapi tak berfungsi', () => {
  it('RMP lengkap dengan HOLD berkriteria → nol cacat', () => {
    const c = cacatRencanaMutu(rmp(), [titik({ jenis_titik: 'hold' })])
    expect(c).toHaveLength(0)
  })

  it('ITP tanpa satu pun HOLD dilaporkan — dokumen yang tak menahan apa pun', () => {
    const c = cacatRencanaMutu(rmp(), [
      titik({ jenis_titik: 'witness' }),
      titik({ jenis_titik: 'review' }),
    ])
    expect(c.map((x) => x.kode)).toContain('tanpa-hold')
  })

  it('ITP kosong dilaporkan SEKALI, tidak dua kali', () => {
    const c = cacatRencanaMutu(rmp(), [])
    const kode = c.map((x) => x.kode)
    expect(kode).toContain('tanpa-titik')
    // `tanpa-hold` ditelan: dua pesan untuk satu keadaan terbaca sebagai dua
    // masalah berbeda, dan pembacanya memperbaiki yang salah.
    expect(kode).not.toContain('tanpa-hold')
  })

  it('titik tanpa kriteria dilaporkan BESERTA titiknya, bukan cuma jumlahnya', () => {
    const c = cacatRencanaMutu(rmp(), [
      titik({ jenis_titik: 'hold', kriteria: null, urutan: 2, uraian: 'B' }),
      titik({ jenis_titik: 'hold', kriteria: '   ', urutan: 1, uraian: 'A' }),
      titik({ jenis_titik: 'hold', kriteria: 'ada' }),
    ])
    const k = c.find((x) => x.kode === 'titik-tanpa-kriteria')
    expect(k).toBeDefined()
    // Kriteria berisi spasi saja = kosong. Tanpa trim, "   " lolos diam-diam.
    expect(k!.titik).toHaveLength(2)
    // Dan urut menurut tahap, supaya bisa langsung ditelusuri di lapangan.
    expect(k!.titik!.map((t) => t.uraian)).toEqual(['A', 'B'])
  })

  it('standar acuan & sasaran mutu yang kosong dilaporkan terpisah', () => {
    const c = cacatRencanaMutu(rmp({ standar_acuan: null, sasaran_mutu: '  ' }), [
      titik({ jenis_titik: 'hold' }),
    ])
    expect(c.map((x) => x.kode).sort()).toEqual(['tanpa-acuan', 'tanpa-sasaran'])
  })
})

describe('bolehDisetujui — menyetujui itu mengikat', () => {
  it('RMP lengkap boleh disetujui', () => {
    expect(bolehDisetujui(rmp(), [titik({ jenis_titik: 'hold' })]).boleh).toBe(true)
  })

  it('RMP tanpa titik HOLD TIDAK boleh disetujui', () => {
    const h = bolehDisetujui(rmp(), [titik({ jenis_titik: 'review' })])
    expect(h.boleh).toBe(false)
    expect(h.penghalang.map((x) => x.kode)).toContain('tanpa-hold')
  })

  it('sasaran mutu kosong TIDAK menghalangi — cacat, tapi bukan penghalang', () => {
    // Sengaja lebih sempit daripada seluruh daftar cacat: menahan persetujuan
    // untuk kekurangan yang lunak membuat orang mencari jalan lain.
    const h = bolehDisetujui(rmp({ sasaran_mutu: null }), [titik({ jenis_titik: 'hold' })])
    expect(h.boleh).toBe(true)
    expect(h.penghalang).toHaveLength(0)
  })

  it('yang SUDAH disetujui tak bisa disetujui lagi', () => {
    const h = bolehDisetujui(rmp({ status: 'disetujui' }), [titik({ jenis_titik: 'hold' })])
    expect(h.boleh).toBe(false)
    // Bukan karena cacat — karena sudah. Penghalangnya kosong supaya layar
    // tak menampilkan alasan yang salah.
    expect(h.penghalang).toHaveLength(0)
  })
})
