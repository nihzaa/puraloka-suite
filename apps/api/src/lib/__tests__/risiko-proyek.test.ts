import { describe, it, expect } from 'vitest'
import {
  tingkatDari, skorSisa, perluPerhatian, nilaiRisiko, ringkasRegister,
  nilaiIzin, kesiapanIzin, bolehPindahTahapSengketa, ringkasSengketa,
  type Risiko, type IzinProyek, type Sengketa, type StatusSengketa,
} from '../risiko-proyek.js'

const ACUAN = '2026-08-11'

function risiko(p: Partial<Risiko> = {}): Risiko {
  const dampak = p.dampak ?? 3
  const kemungkinan = p.kemungkinan ?? 3
  return {
    id: 'r1', kode: null, judul: 'uji', kategori: 'teknis',
    dampak, kemungkinan, skor: dampak * kemungkinan,
    strategi: 'kurangi', dampak_sisa: null, kemungkinan_sisa: null,
    status: 'terpantau', tenggat_tinjau: null, pemilik_id: 'u1',
    tindakan: [], ...p,
  }
}

function izin(p: Partial<IzinProyek> = {}): IzinProyek {
  return {
    id: 'i1', jenis: 'pbg', nomor: 'X-1', status: 'terbit',
    berlaku_dari: '2026-01-01', berlaku_sampai: '2027-01-01',
    menghalangi_mulai: true, ...p,
  }
}

describe('tingkatDari — batas dipilih dari TINDAKAN, bukan pembagian rata', () => {
  it('empat tingkat pada batasnya', () => {
    expect(tingkatDari(4)).toBe('rendah')
    expect(tingkatDari(5)).toBe('sedang')
    expect(tingkatDari(9)).toBe('sedang')
    expect(tingkatDari(10)).toBe('tinggi')
    expect(tingkatDari(14)).toBe('tinggi')
    expect(tingkatDari(15)).toBe('ekstrem')
    expect(tingkatDari(25)).toBe('ekstrem')
  })

  it('5x2 (dampak berat, jarang) TIDAK setingkat dengan 3x3', () => {
    // Inilah alasan batasnya bukan pembagian rata: yang pertama bisa
    // menghentikan proyek, yang kedua tidak.
    expect(tingkatDari(10)).toBe('tinggi')
    expect(tingkatDari(9)).toBe('sedang')
  })

  it('skor tak masuk akal tak melempar', () => {
    expect(tingkatDari(0)).toBe('rendah')
    expect(tingkatDari(-5)).toBe('rendah')
    expect(tingkatDari(NaN)).toBe('rendah')
  })
})

describe('skorSisa — null berbeda dari skor awal', () => {
  it('null bila belum dinilai ulang', () => {
    expect(skorSisa({ dampak_sisa: null, kemungkinan_sisa: null })).toBeNull()
    expect(skorSisa({ dampak_sisa: 2, kemungkinan_sisa: null })).toBeNull()
    expect(skorSisa({ dampak_sisa: null, kemungkinan_sisa: 2 })).toBeNull()
  })

  it('mengalikan bila keduanya ada', () => {
    expect(skorSisa({ dampak_sisa: 2, kemungkinan_sisa: 3 })).toBe(6)
  })
})

describe('perluPerhatian — alasannya dikembalikan, bukan hanya benar/salah', () => {
  it('risiko tertutup tak pernah mendesak', () => {
    const r = risiko({
      dampak: 5, kemungkinan: 5, skor: 25, status: 'tertutup',
      tenggat_tinjau: '2020-01-01', pemilik_id: null,
    })
    expect(perluPerhatian(r, ACUAN)).toEqual([])
  })

  it('yang sudah TERJADI selalu mendesak', () => {
    const r = risiko({ status: 'terjadi', dampak: 1, kemungkinan: 1, skor: 1 })
    expect(perluPerhatian(r, ACUAN)).toContain('risikonya sudah terjadi')
  })

  it('ekstrem tanpa tindakan — strategi "terima" TIDAK membebaskan', () => {
    const r = risiko({ dampak: 5, kemungkinan: 5, skor: 25, strategi: 'terima' })
    expect(perluPerhatian(r, ACUAN)).toContain('skor ekstrem tanpa tindakan')
  })

  it('tindakan berstatus batal tak dihitung sebagai tindakan', () => {
    const r = risiko({
      dampak: 5, kemungkinan: 5, skor: 25,
      tindakan: [{ id: 't', tindakan: 'x', status: 'batal', tenggat: null, selesai_pada: null, penanggung_id: null }],
    })
    expect(perluPerhatian(r, ACUAN)).toContain('skor ekstrem tanpa tindakan')
  })

  it('tinggi dengan tindakan tapi belum dinilai ulang', () => {
    const r = risiko({
      dampak: 5, kemungkinan: 2, skor: 10,
      tindakan: [{ id: 't', tindakan: 'x', status: 'berjalan', tenggat: null, selesai_pada: null, penanggung_id: null }],
    })
    expect(perluPerhatian(r, ACUAN)).toContain('mitigasi belum dinilai ulang')
  })

  it('yang sudah dinilai ulang tak lagi mengeluh soal itu', () => {
    const r = risiko({
      dampak: 5, kemungkinan: 2, skor: 10, dampak_sisa: 2, kemungkinan_sisa: 2,
      tindakan: [{ id: 't', tindakan: 'x', status: 'selesai', tenggat: null, selesai_pada: '2026-07-01', penanggung_id: null }],
    })
    expect(perluPerhatian(r, ACUAN)).not.toContain('mitigasi belum dinilai ulang')
  })

  it('lewat tenggat tinjau', () => {
    expect(perluPerhatian(risiko({ tenggat_tinjau: '2026-08-10' }), ACUAN))
      .toContain('lewat tenggat tinjau')
  })

  it('tenggat tinjau TEPAT hari acuan belum lewat', () => {
    expect(perluPerhatian(risiko({ tenggat_tinjau: ACUAN }), ACUAN))
      .not.toContain('lewat tenggat tinjau')
  })

  it('tindakan lewat tenggat — tunggal dan jamak berbeda kalimat', () => {
    const satu = risiko({
      tindakan: [{ id: 'a', tindakan: 'x', status: 'berjalan', tenggat: '2026-01-01', selesai_pada: null, penanggung_id: null }],
    })
    expect(perluPerhatian(satu, ACUAN)).toContain('1 tindakan lewat tenggat')

    const dua = risiko({
      tindakan: [
        { id: 'a', tindakan: 'x', status: 'berjalan', tenggat: '2026-01-01', selesai_pada: null, penanggung_id: null },
        { id: 'b', tindakan: 'y', status: 'rencana', tenggat: '2026-02-01', selesai_pada: null, penanggung_id: null },
      ],
    })
    expect(perluPerhatian(dua, ACUAN)).toContain('2 tindakan lewat tenggat')
  })

  it('tindakan SELESAI atau BATAL yang tenggatnya lewat tak dikeluhkan', () => {
    const r = risiko({
      tindakan: [
        { id: 'a', tindakan: 'x', status: 'selesai', tenggat: '2026-01-01', selesai_pada: '2026-01-01', penanggung_id: null },
        { id: 'b', tindakan: 'y', status: 'batal', tenggat: '2026-01-01', selesai_pada: null, penanggung_id: null },
      ],
    })
    expect(perluPerhatian(r, ACUAN).some((a) => a.includes('lewat tenggat'))).toBe(false)
  })

  it('risiko tinggi tanpa pemilik — yang tak dimiliki tak diurus', () => {
    const r = risiko({ dampak: 5, kemungkinan: 2, skor: 10, pemilik_id: null })
    expect(perluPerhatian(r, ACUAN)).toContain('belum ada pemiliknya')
  })

  it('risiko RENDAH tanpa pemilik tidak dikeluhkan', () => {
    const r = risiko({ dampak: 1, kemungkinan: 2, skor: 2, pemilik_id: null })
    expect(perluPerhatian(r, ACUAN)).not.toContain('belum ada pemiliknya')
  })

  it('acuan dilewatkan, bukan diambil dari jam sistem', () => {
    const r = risiko({ tenggat_tinjau: '2026-08-10' })
    expect(perluPerhatian(r, '2026-08-11')).toContain('lewat tenggat tinjau')
    expect(perluPerhatian(r, '2026-08-01')).not.toContain('lewat tenggat tinjau')
  })
})

describe('nilaiRisiko', () => {
  it('penurunan null saat belum dinilai ulang, 0 saat tak turun', () => {
    expect(nilaiRisiko(risiko(), ACUAN).penurunan).toBeNull()
    const tak = nilaiRisiko(risiko({ dampak: 3, kemungkinan: 3, skor: 9, dampak_sisa: 3, kemungkinan_sisa: 3 }), ACUAN)
    expect(tak.penurunan).toBe(0)
    expect(tak.skor_sisa).toBe(9)
  })

  it('tingkat sisa dihitung dari skor sisa', () => {
    const r = nilaiRisiko(risiko({ dampak: 5, kemungkinan: 5, skor: 25, dampak_sisa: 2, kemungkinan_sisa: 2 }), ACUAN)
    expect(r.tingkat).toBe('ekstrem')
    expect(r.tingkat_sisa).toBe('rendah')
    expect(r.penurunan).toBe(21)
  })
})

describe('ringkasRegister', () => {
  it('per_tingkat hanya menghitung yang BELUM tertutup', () => {
    const d = [
      nilaiRisiko(risiko({ id: 'a', dampak: 5, kemungkinan: 5, skor: 25 }), ACUAN),
      nilaiRisiko(risiko({
        id: 'b', dampak: 5, kemungkinan: 5, skor: 25, status: 'tertutup',
        ditutup_pada: '2026-01-01',
      } as Partial<Risiko>), ACUAN),
    ]
    const r = ringkasRegister(d)
    expect(r.total).toBe(2)
    expect(r.tertutup).toBe(1)
    expect(r.per_tingkat.ekstrem).toBe(1)
  })

  it('penurunan_rata null saat belum ada yang dinilai ulang, bukan 0', () => {
    const r = ringkasRegister([nilaiRisiko(risiko(), ACUAN)])
    expect(r.penurunan_rata).toBeNull()
    expect(r.dinilai_ulang).toBe(0)
  })

  it('penurunan_rata 0 berarti mitigasi tak menurunkan apa pun', () => {
    const r = ringkasRegister([
      nilaiRisiko(risiko({ dampak: 3, kemungkinan: 3, skor: 9, dampak_sisa: 3, kemungkinan_sisa: 3 }), ACUAN),
    ])
    expect(r.penurunan_rata).toBe(0)
    expect(r.dinilai_ulang).toBe(1)
  })

  it('daftar kosong', () => {
    const r = ringkasRegister([])
    expect(r.total).toBe(0)
    expect(r.penurunan_rata).toBeNull()
    expect(r.per_tingkat.rendah).toBe(0)
  })
})

describe('nilaiIzin — enam keadaan, bukan dua', () => {
  it('belum terbit', () => {
    expect(nilaiIzin(izin({ status: 'diajukan' }), ACUAN).masa).toBe('belum_terbit')
    expect(nilaiIzin(izin({ status: 'rencana' }), ACUAN).masa).toBe('belum_terbit')
  })

  it('ditolak dan dicabut dibedakan — akibatnya berbeda', () => {
    expect(nilaiIzin(izin({ status: 'ditolak' }), ACUAN).masa).toBe('ditolak')
    expect(nilaiIzin(izin({ status: 'dicabut' }), ACUAN).masa).toBe('dicabut')
  })

  it('terbit tanpa batas waktu = berlaku, tak pernah memblokir', () => {
    const i = nilaiIzin(izin({ berlaku_sampai: null }), ACUAN)
    expect(i.masa).toBe('berlaku')
    expect(i.sisa_hari).toBeNull()
    expect(i.memblokir).toBe(false)
  })

  it('habis HARI INI masih sah — batas < 0, bukan <= 0', () => {
    const i = nilaiIzin(izin({ berlaku_sampai: ACUAN }), ACUAN)
    expect(i.sisa_hari).toBe(0)
    expect(i.masa).toBe('akan_habis')
    expect(i.memblokir).toBe(false)
  })

  it('lewat sehari = kedaluwarsa dan memblokir', () => {
    const i = nilaiIzin(izin({ berlaku_sampai: '2026-08-10' }), ACUAN)
    expect(i.sisa_hari).toBe(-1)
    expect(i.masa).toBe('kedaluwarsa')
    expect(i.memblokir).toBe(true)
  })

  it('kedaluwarsa yang TIDAK menghalangi mulai tak memblokir', () => {
    const i = nilaiIzin(izin({ berlaku_sampai: '2026-08-10', menghalangi_mulai: false }), ACUAN)
    expect(i.masa).toBe('kedaluwarsa')
    expect(i.memblokir).toBe(false)
  })

  it('habis SEBELUM proyek selesai = akan_habis meski hari ini masih lama', () => {
    // Inilah yang membedakan register izin berguna dari yang memberi tahu
    // terlambat: 202 hari lagi, tetapi proyek baru selesai 2027-06.
    const i = nilaiIzin(izin({ berlaku_sampai: '2027-03-01' }), ACUAN, '2027-06-01')
    expect(i.masa).toBe('akan_habis')
    expect(i.sisa_hari).toBeGreaterThan(60)
  })

  it('habis SESUDAH proyek selesai tetap berlaku', () => {
    const i = nilaiIzin(izin({ berlaku_sampai: '2027-09-01' }), ACUAN, '2027-06-01')
    expect(i.masa).toBe('berlaku')
  })

  it('tanpa tanggal selesai proyek, ambang hari yang dipakai', () => {
    expect(nilaiIzin(izin({ berlaku_sampai: '2026-09-01' }), ACUAN).masa).toBe('akan_habis')
    expect(nilaiIzin(izin({ berlaku_sampai: '2027-01-01' }), ACUAN).masa).toBe('berlaku')
  })

  it('sisa PERSIS di ambang sudah "akan habis" — batas <=, bukan <', () => {
    // 2026-08-11 + 60 hari = 2026-10-10. Yang tepat di ambang harus sudah
    // memberi peringatan: kalau baru menyala di hari ke-59, satu hari itulah
    // yang hilang dari waktu pengurusan.
    expect(nilaiIzin(izin({ berlaku_sampai: '2026-10-10' }), ACUAN).masa).toBe('akan_habis')
    expect(nilaiIzin(izin({ berlaku_sampai: '2026-10-11' }), ACUAN).masa).toBe('berlaku')
  })

  it('ambang bisa diubah', () => {
    expect(nilaiIzin(izin({ berlaku_sampai: '2026-10-01' }), ACUAN, null, 30).masa).toBe('berlaku')
    expect(nilaiIzin(izin({ berlaku_sampai: '2026-10-01' }), ACUAN, null, 90).masa).toBe('akan_habis')
  })
})

describe('kesiapanIzin — nol izin adalah null, bukan boleh jalan', () => {
  it('daftar kosong = null (belum didata, bukan lengkap)', () => {
    const k = kesiapanIzin([])
    expect(k.boleh_jalan).toBeNull()
    expect(k.total).toBe(0)
  })

  it('semua berlaku = boleh jalan', () => {
    const k = kesiapanIzin([nilaiIzin(izin(), ACUAN)])
    expect(k.boleh_jalan).toBe(true)
    expect(k.memblokir).toHaveLength(0)
  })

  it('satu memblokir sudah cukup menghentikan', () => {
    const k = kesiapanIzin([
      nilaiIzin(izin({ id: 'a' }), ACUAN),
      nilaiIzin(izin({ id: 'b', berlaku_sampai: '2026-01-01' }), ACUAN),
    ])
    expect(k.boleh_jalan).toBe(false)
    expect(k.memblokir).toHaveLength(1)
    expect(k.memblokir[0].id).toBe('b')
  })

  it('yang akan habis masuk perlu_diurus, bukan memblokir', () => {
    const k = kesiapanIzin([nilaiIzin(izin({ berlaku_sampai: '2026-09-01' }), ACUAN)])
    expect(k.boleh_jalan).toBe(true)
    expect(k.perlu_diurus).toHaveLength(1)
  })

  it('izin belum terbit yang menghalangi mulai MEMBLOKIR', () => {
    const k = kesiapanIzin([nilaiIzin(izin({ status: 'diajukan' }), ACUAN)])
    expect(k.boleh_jalan).toBe(false)
  })
})

describe('bolehPindahTahapSengketa', () => {
  it('maju boleh melompat', () => {
    expect(bolehPindahTahapSengketa('negosiasi', 'pengadilan').boleh).toBe(true)
  })

  it('mundur ditolak — jejak menentukan biaya dan risikonya', () => {
    const h = bolehPindahTahapSengketa('pengadilan', 'negosiasi')
    expect(h.boleh).toBe(false)
    expect(h.alasan).toBe('tahap tak boleh mundur')
  })

  it('selesai adalah keadaan akhir', () => {
    for (const ke of ['dicatat', 'negosiasi', 'mediasi', 'arbitrase', 'pengadilan'] as StatusSengketa[]) {
      expect(bolehPindahTahapSengketa('selesai', ke).boleh).toBe(false)
    }
  })

  it('penolakan "selesai" berdiri sendiri, bukan menumpang aturan mundur', () => {
    // Mutasi membuktikan test di atas TIDAK menguji penjaga yang dimaksud:
    // melepas cabang `dari === 'selesai'` tetap hijau, karena `j < i`
    // menangkap semuanya. Penjaga yang hanya lolos berkat aturan lain akan
    // hilang diam-diam begitu ada tahap sesudah `selesai` (mis. 'banding').
    //
    // Diuji lewat ALASANNYA — itulah yang membedakan lapisan mana yang menolak.
    const h = bolehPindahTahapSengketa('selesai', 'negosiasi')
    expect(h.boleh).toBe(false)
    expect(h.alasan).toContain('sudah selesai')
    expect(h.alasan).not.toContain('mundur')
  })

  it('ke tahap yang sama ditolak', () => {
    expect(bolehPindahTahapSengketa('mediasi', 'mediasi').boleh).toBe(false)
  })

  it('tahap tak dikenal ditolak', () => {
    expect(bolehPindahTahapSengketa('dicatat', 'banding' as StatusSengketa).boleh).toBe(false)
    expect(bolehPindahTahapSengketa('banding' as StatusSengketa, 'mediasi').boleh).toBe(false)
  })
})

describe('ringkasSengketa', () => {
  function sengketa(p: Partial<Sengketa> = {}): Sengketa {
    return {
      id: 's1', judul: 'x', pihak_lawan: 'PT Y', status: 'negosiasi',
      tanggal_mulai: '2026-06-01', selesai_pada: null,
      nilai_tuntutan: '1000000', nilai_putusan: null, klaim_id: null, ...p,
    }
  }

  it('paparan hanya dari yang BERJALAN', () => {
    const r = ringkasSengketa([
      sengketa({ id: 'a', nilai_tuntutan: '1000000' }),
      sengketa({ id: 'b', status: 'selesai', nilai_tuntutan: '5000000', nilai_putusan: '2000000', selesai_pada: '2026-07-01' }),
    ], ACUAN)
    expect(r.paparan).toBe(1000000)
    expect(r.berjalan).toBe(1)
    expect(r.selesai).toBe(1)
  })

  it('sengketa SELESAI tak menambah paparan — hasilnya sudah diketahui', () => {
    const r = ringkasSengketa([
      sengketa({ id: 'a', status: 'selesai', nilai_tuntutan: '9000000', nilai_putusan: '1000000', selesai_pada: '2026-07-01' }),
    ], ACUAN)
    expect(r.paparan).toBe(0)
    expect(r.tanpa_nilai).toBe(0)
  })

  it('numeric string dari Postgres dibaca benar', () => {
    expect(ringkasSengketa([sengketa({ nilai_tuntutan: '2500000.50' })], ACUAN).paparan).toBe(2500000.5)
  })

  it("string kosong BUKAN nol — `Number('')` adalah 0", () => {
    // Kalau ini gagal, sengketa Rp 2 miliar bisa terlihat tak bernilai.
    const r = ringkasSengketa([sengketa({ nilai_tuntutan: '' })], ACUAN)
    expect(r.paparan).toBe(0)
    expect(r.tanpa_nilai).toBe(1)
  })

  it('yang nilainya belum dicatat dihitung terpisah, tidak diam-diam nol', () => {
    const r = ringkasSengketa([
      sengketa({ id: 'a', nilai_tuntutan: '1000000' }),
      sengketa({ id: 'b', nilai_tuntutan: null }),
    ], ACUAN)
    expect(r.paparan).toBe(1000000)
    expect(r.tanpa_nilai).toBe(1)
  })

  it('selisih putusan null bila belum ada yang selesai bernilai', () => {
    expect(ringkasSengketa([sengketa()], ACUAN).selisih_putusan).toBeNull()
  })

  it('selisih putusan = tuntutan − putusan', () => {
    const r = ringkasSengketa([
      sengketa({ status: 'selesai', nilai_tuntutan: '5000000', nilai_putusan: '2000000', selesai_pada: '2026-07-01' }),
    ], ACUAN)
    expect(r.selisih_putusan).toBe(3000000)
  })

  it('terlama_hari dari yang berjalan saja', () => {
    const r = ringkasSengketa([
      sengketa({ id: 'a', tanggal_mulai: '2026-08-01' }),
      sengketa({ id: 'b', tanggal_mulai: '2026-01-01' }),
      sengketa({ id: 'c', tanggal_mulai: '2020-01-01', status: 'selesai', selesai_pada: '2021-01-01' }),
    ], ACUAN)
    expect(r.terlama_hari).toBe(222) // 2026-01-01 → 2026-08-11
  })

  it('terlama_hari null bila semua sudah selesai', () => {
    const r = ringkasSengketa([
      sengketa({ status: 'selesai', selesai_pada: '2026-07-01' }),
    ], ACUAN)
    expect(r.terlama_hari).toBeNull()
  })

  it('daftar kosong', () => {
    const r = ringkasSengketa([], ACUAN)
    expect(r.total).toBe(0)
    expect(r.paparan).toBe(0)
    expect(r.terlama_hari).toBeNull()
  })
})
