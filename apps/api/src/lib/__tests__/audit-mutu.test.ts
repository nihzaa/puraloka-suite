import { describe, it, expect } from 'vitest'
import {
  ringkasTemuan, bolehDiselesaikan,
  type TemuanAudit, type Audit,
} from '../audit-mutu.js'

// Fixture memakai `!== undefined`, BUKAN `??`.
//
// Pelajaran dari G1e: `p.kriteria ?? 'bawaan'` membuat `kriteria: null` yang
// sengaja diminta test diam-diam diganti nilai bawaan, sehingga test yang
// menguji "kosong" justru menguji "terisi". Ketahuan karena test-nya merah;
// yang salah fixture-nya.
function temuan(p: Partial<TemuanAudit> & { klasifikasi: TemuanAudit['klasifikasi'] }): TemuanAudit {
  return {
    id: p.id ?? Math.random().toString(36).slice(2),
    urutan: p.urutan ?? 0,
    kode: p.kode !== undefined ? p.kode : null,
    uraian: p.uraian ?? 'Uraian temuan',
    klausul: p.klausul ?? 'Ps. 1',
    bukti: p.bukti !== undefined ? p.bukti : null,
    klasifikasi: p.klasifikasi,
    ncr_id: p.ncr_id !== undefined ? p.ncr_id : null,
    ditutup_pada: p.ditutup_pada !== undefined ? p.ditutup_pada : null,
    catatan_penutupan: p.catatan_penutupan !== undefined ? p.catatan_penutupan : null,
  }
}

function audit(p: Partial<Audit> = {}): Audit {
  return {
    id: 'a1',
    nomor: 'AM-01',
    judul: 'Audit internal',
    status: p.status ?? 'berjalan',
    lingkup: p.lingkup !== undefined ? p.lingkup : 'Pelaksanaan ITP',
    kriteria: p.kriteria !== undefined ? p.kriteria : 'SNI 2847',
    tanggal_rencana: p.tanggal_rencana !== undefined ? p.tanggal_rencana : '2026-08-01',
    tanggal_selesai: p.tanggal_selesai !== undefined ? p.tanggal_selesai : null,
    auditor: p.auditor !== undefined ? p.auditor : 'u1',
    kesimpulan: p.kesimpulan !== undefined ? p.kesimpulan : null,
  }
}

describe('ringkasTemuan — klasifikasi menentukan akibat', () => {
  it('major, minor, dan observasi dihitung TERPISAH', () => {
    const r = ringkasTemuan([
      temuan({ klasifikasi: 'major' }),
      temuan({ klasifikasi: 'minor' }),
      temuan({ klasifikasi: 'minor' }),
      temuan({ klasifikasi: 'observasi' }),
    ])
    // Bukan gradasi halus: MAJOR menghalangi sertifikasi, dua lainnya tidak.
    expect(r.major).toBe(1)
    expect(r.minor).toBe(2)
    expect(r.observasi).toBe(1)
    expect(r.total).toBe(4)
  })

  it('hanya MAJOR yang masuk `major_tanpa_ncr`', () => {
    const r = ringkasTemuan([
      temuan({ klasifikasi: 'major', ncr_id: null }),
      // Minor tanpa NCR itu SAH — ia wajib diperbaiki, tak wajib jadi NCR.
      temuan({ klasifikasi: 'minor', ncr_id: null }),
      temuan({ klasifikasi: 'observasi', ncr_id: null }),
    ])
    expect(r.major_tanpa_ncr).toHaveLength(1)
    expect(r.major_tanpa_ncr[0].klasifikasi).toBe('major')
    expect(r.boleh_diselesaikan).toBe(false)
  })

  it('major yang sudah DITUTUP tetap butuh NCR', () => {
    const r = ringkasTemuan([
      temuan({ klasifikasi: 'major', ncr_id: null, ditutup_pada: '2026-08-05T00:00:00Z' }),
    ])
    // Menutup temuan tanpa NCR = menyatakan selesai sesuatu yang tak pernah
    // punya penanggung jawab. Basis menolaknya lewat trigger; angka ini
    // menunjukkannya sebelum orang mencoba.
    expect(r.major_tanpa_ncr).toHaveLength(1)
    expect(r.boleh_diselesaikan).toBe(false)
    // Tapi ia TIDAK dihitung sebagai major terbuka — dua pertanyaan berbeda.
    expect(r.major_terbuka).toHaveLength(0)
  })

  it('major ber-NCR tidak menghalangi', () => {
    const r = ringkasTemuan([temuan({ klasifikasi: 'major', ncr_id: 'ncr-1' })])
    expect(r.major_tanpa_ncr).toHaveLength(0)
    expect(r.boleh_diselesaikan).toBe(true)
  })

  it('NOL TEMUAN boleh diselesaikan — beda dari ITP kosong', () => {
    const r = ringkasTemuan([])
    // Audit yang tak menemukan apa pun adalah hasil yang SAH, dan sering
    // yang diharapkan. Berbeda dari `ringkasItp` (G1e) yang mengembalikan
    // `null` untuk ITP kosong karena di sana kosong = "belum menyatakan apa
    // pun". Di sini auditnya sendiri yang menjadi pernyataan.
    expect(r.boleh_diselesaikan).toBe(true)
    expect(r.total).toBe(0)
  })

  it('OBSERVASI tak masuk penyebut "menuntut tindakan"', () => {
    const r = ringkasTemuan([
      temuan({ klasifikasi: 'major', ncr_id: 'n1' }),
      temuan({ klasifikasi: 'minor' }),
      temuan({ klasifikasi: 'minor' }),
      temuan({ klasifikasi: 'observasi' }),
    ])
    // Ditemukan DARI LAYAR: kartu "Ditutup 0/4" terbaca seperti nol dari
    // empat pekerjaan selesai — padahal observasi tak menuntut penutupan,
    // jadi yang benar-benar menunggu hanya 3. Penyebut yang salah
    // menciptakan hutang yang tak ada.
    expect(r.menuntut_tindakan).toBe(3)
    expect(r.total).toBe(4)
  })

  it('`tindakan_ditutup` tak menghitung observasi yang kebetulan ditutup', () => {
    const r = ringkasTemuan([
      temuan({ klasifikasi: 'minor', ditutup_pada: '2026-08-05T00:00:00Z' }),
      temuan({ klasifikasi: 'observasi', ditutup_pada: '2026-08-05T00:00:00Z' }),
      temuan({ klasifikasi: 'minor' }),
    ])
    expect(r.tindakan_ditutup).toBe(1)
    expect(r.menuntut_tindakan).toBe(2)
    // `ditutup` yang lama tetap menghitung SEMUA — dua angka, dua pertanyaan.
    expect(r.ditutup).toBe(2)
  })

  it('ditutup vs terbuka dihitung dari `ditutup_pada`', () => {
    const r = ringkasTemuan([
      temuan({ klasifikasi: 'minor', ditutup_pada: '2026-08-05T00:00:00Z' }),
      temuan({ klasifikasi: 'minor', ditutup_pada: null }),
      temuan({ klasifikasi: 'minor', ditutup_pada: null }),
    ])
    expect(r.ditutup).toBe(1)
    expect(r.terbuka).toBe(2)
  })

  it('urutan mengikuti `urutan`, bukan urutan masukan', () => {
    const r = ringkasTemuan([
      temuan({ klasifikasi: 'major', urutan: 30, uraian: 'ketiga' }),
      temuan({ klasifikasi: 'major', urutan: 10, uraian: 'pertama' }),
      temuan({ klasifikasi: 'major', urutan: 20, uraian: 'kedua' }),
    ])
    // Tiga elemen dengan masukan teracak: komparator terbalik menghasilkan
    // urutan berbeda dan terdeteksi. Dua elemen tidak cukup — pelajaran
    // dari fixture geotag 2026-08-10.
    expect(r.major_tanpa_ncr.map((t) => t.uraian)).toEqual(['pertama', 'kedua', 'ketiga'])
  })

  it('`ncr_id` string kosong diperlakukan seperti tak ada', () => {
    // Form yang mengirim "" untuk pilihan kosong sudah pernah terjadi di
    // repo ini. `!t.ncr_id` menangkapnya; `t.ncr_id === null` tidak.
    const r = ringkasTemuan([temuan({ klasifikasi: 'major', ncr_id: '' })])
    expect(r.major_tanpa_ncr).toHaveLength(1)
  })
})

describe('bolehDiselesaikan — penolakan yang bisa diramalkan', () => {
  it('audit bersih dengan auditor BOLEH diselesaikan', () => {
    expect(bolehDiselesaikan(audit(), []).boleh).toBe(true)
  })

  it('major tanpa NCR menghalangi, dan temuannya dibawa keluar', () => {
    const h = bolehDiselesaikan(audit(), [
      temuan({ klasifikasi: 'major', ncr_id: null, uraian: 'ITP tak diikuti' }),
    ])
    expect(h.boleh).toBe(false)
    const p = h.penghalang.find((x) => x.kode === 'major-tanpa-ncr')
    expect(p).toBeDefined()
    // Bukan cuma jumlahnya — layar harus bisa menunjukkan YANG MANA.
    expect(p!.temuan).toHaveLength(1)
    expect(p!.temuan![0].uraian).toBe('ITP tak diikuti')
  })

  it('tanpa auditor menghalangi', () => {
    const h = bolehDiselesaikan(audit({ auditor: null }), [])
    expect(h.boleh).toBe(false)
    expect(h.penghalang.map((x) => x.kode)).toContain('tanpa-auditor')
  })

  it('dua penghalang dilaporkan sekaligus, bukan satu per satu', () => {
    const h = bolehDiselesaikan(audit({ auditor: null }), [
      temuan({ klasifikasi: 'major', ncr_id: null }),
    ])
    // Melaporkan satu per satu memaksa pengguna memperbaiki, mencoba lagi,
    // ditolak lagi — dan tiap penolakan terasa seperti masalah baru.
    expect(h.penghalang).toHaveLength(2)
  })

  it('yang SUDAH selesai tak bisa diselesaikan lagi', () => {
    const h = bolehDiselesaikan(audit({ status: 'selesai' }), [])
    expect(h.boleh).toBe(false)
    expect(h.penghalang.map((x) => x.kode)).toEqual(['sudah-selesai'])
  })

  it('yang DIBATALKAN tak bisa diselesaikan', () => {
    const h = bolehDiselesaikan(audit({ status: 'dibatalkan' }), [])
    expect(h.boleh).toBe(false)
    expect(h.penghalang.map((x) => x.kode)).toEqual(['dibatalkan'])
  })

  it('status akhir dilaporkan SENDIRI, tanpa penghalang lain ikut', () => {
    // Audit yang sudah selesai dan kebetulan tak berauditor tak boleh
    // menampilkan "belum ada auditor" — itu menyesatkan: yang menghalangi
    // bukan itu, melainkan bahwa ia sudah selesai.
    const h = bolehDiselesaikan(audit({ status: 'selesai', auditor: null }), [
      temuan({ klasifikasi: 'major', ncr_id: null }),
    ])
    expect(h.penghalang).toHaveLength(1)
    expect(h.penghalang[0].kode).toBe('sudah-selesai')
  })
})
