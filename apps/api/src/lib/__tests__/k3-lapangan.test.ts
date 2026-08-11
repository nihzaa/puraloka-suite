import { describe, it, expect } from 'vitest'
import {
  rekapInsiden, hitungTrir, hitungInsidenSubkon, periksaSelaras,
  ringkasJsa, temuanBerulang, rekapTemuan, statusInduksi, rekapApd,
  nilaiLingkungan, rekapLingkungan, MENGGUGURKAN,
  type Insiden, type LangkahJsa, type TemuanK3, type Induksi,
  type Apd, type UkurLingkungan,
} from '../k3-lapangan.js'

const ACUAN = '2026-08-12'

function insiden(p: Partial<Insiden> = {}): Insiden {
  return {
    id: 'i1', jenis: 'nyaris_celaka', tanggal: '2026-08-01',
    melukai: false, hari_kerja_hilang: 0, status: 'dilaporkan',
    supplier_id: null, jsa_id: null, tindakan_korektif: null, ...p,
  }
}

function langkah(p: Partial<LangkahJsa> = {}): LangkahJsa {
  const d = p.dampak ?? 3
  const k = p.kemungkinan ?? 3
  return {
    id: 'l1', urutan: 1, langkah: 'Naik perancah',
    bahaya: 'Jatuh dari ketinggian', pengendalian: 'Harness dikaitkan',
    dampak: d, kemungkinan: k, skor: d * k,
    dampak_sisa: null, kemungkinan_sisa: null, ...p,
  }
}

function temuan(p: Partial<TemuanK3> = {}): TemuanK3 {
  return {
    id: 't1', inspeksi_id: 'n1', uraian: 'APD tak dipakai',
    kategori: 'apd', tingkat: 2, status: 'terbuka',
    tenggat: null, tanggal_inspeksi: '2026-08-01', ...p,
  }
}

describe('MENGGUGURKAN — nyaris celaka sengaja TIDAK termasuk', () => {
  it('nyaris celaka tak menggugurkan', () => {
    // Kalau ia ikut menggugurkan, tak akan ada yang melaporkannya lagi —
    // dan sistemnya berhenti melihat hal yang paling ingin ia lihat.
    expect(MENGGUGURKAN).not.toContain('nyaris_celaka')
  })

  it('kerusakan properti tak menggugurkan — yang rusak bisa diganti', () => {
    expect(MENGGUGURKAN).not.toContain('kerusakan_properti')
  })

  it('ketiga jenis cedera menggugurkan', () => {
    expect(MENGGUGURKAN).toEqual(
      expect.arrayContaining(['kecelakaan_ringan', 'kecelakaan_berat', 'fatal']))
  })
})

describe('rekapInsiden', () => {
  it('nyaris celaka dihitung TERPISAH dari yang melukai', () => {
    const r = rekapInsiden([
      insiden({ id: 'a', jenis: 'nyaris_celaka' }),
      insiden({ id: 'b', jenis: 'kecelakaan_ringan', melukai: true }),
    ])
    expect(r.nyaris_celaka).toBe(1)
    expect(r.melukai).toBe(1)
    expect(r.total).toBe(2)
  })

  it('hari kerja hilang dijumlahkan, string numeric dibaca benar', () => {
    const r = rekapInsiden([
      insiden({ id: 'a', hari_kerja_hilang: '3' }),
      insiden({ id: 'b', hari_kerja_hilang: 2 }),
    ])
    expect(r.hari_kerja_hilang).toBe(5)
  })

  it("string kosong tak menambah hari hilang, dan tak jadi NaN", () => {
    // Test versi pertama hanya memeriksa hasilnya 0 — dan itu TIDAK
    // membuktikan apa pun, karena `?? 0` menghasilkan 0 baik dari `null`
    // maupun dari `Number('')`. Mutasi membuktikannya: melepas penjaga
    // string-kosong tetap hijau.
    //
    // Yang membedakan: satu baris berangka SAH digabung dengan yang kosong.
    // Kalau `''` terbaca NaN, seluruh jumlahnya jadi NaN.
    const r = rekapInsiden([
      insiden({ id: 'a', hari_kerja_hilang: '' }),
      insiden({ id: 'b', hari_kerja_hilang: '4' }),
    ])
    expect(r.hari_kerja_hilang).toBe(4)
    expect(Number.isNaN(r.hari_kerja_hilang)).toBe(false)
  })

  it("teks bukan-angka juga tak merusak jumlah", () => {
    const r = rekapInsiden([
      insiden({ id: 'a', hari_kerja_hilang: 'tiga hari' }),
      insiden({ id: 'b', hari_kerja_hilang: 2 }),
    ])
    expect(r.hari_kerja_hilang).toBe(2)
  })

  it('ditutup tanpa korektif dihitung, bukan didiamkan', () => {
    const r = rekapInsiden([
      insiden({ id: 'a', status: 'ditutup', tindakan_korektif: null }),
      insiden({ id: 'b', status: 'ditutup', tindakan_korektif: '   ' }),
      insiden({ id: 'c', status: 'ditutup', tindakan_korektif: 'Pasang jaring pengaman' }),
    ])
    expect(r.ditutup_tanpa_korektif).toBe(2)
  })

  it('terbuka = yang belum ditutup', () => {
    const r = rekapInsiden([
      insiden({ id: 'a', status: 'dilaporkan' }),
      insiden({ id: 'b', status: 'diselidiki' }),
      insiden({ id: 'c', status: 'ditutup', tindakan_korektif: 'Sudah diperbaiki semua' }),
    ])
    expect(r.terbuka).toBe(2)
  })

  it('bertaut JSA dihitung — pelajaran yang tak masuk kembali akan terulang', () => {
    const r = rekapInsiden([
      insiden({ id: 'a', jsa_id: 'j1' }),
      insiden({ id: 'b', jsa_id: null }),
    ])
    expect(r.bertaut_jsa).toBe(1)
  })

  it('daftar kosong', () => {
    const r = rekapInsiden([])
    expect(r.total).toBe(0)
    expect(r.hari_kerja_hilang).toBe(0)
  })
})

describe('hitungTrir — null bukan 0', () => {
  it('null bila jam kerja tak diketahui', () => {
    expect(hitungTrir([insiden({ jenis: 'kecelakaan_ringan' })], null)).toBeNull()
  })

  it('null bila jam kerja nol atau negatif', () => {
    expect(hitungTrir([], 0)).toBeNull()
    expect(hitungTrir([], -100)).toBeNull()
  })

  it('menghitung per 200.000 jam', () => {
    // 2 recordable / 100.000 jam × 200.000 = 4
    const d = [
      insiden({ id: 'a', jenis: 'kecelakaan_ringan' }),
      insiden({ id: 'b', jenis: 'kecelakaan_berat' }),
    ]
    expect(hitungTrir(d, 100_000)).toBe(4)
  })

  it('nyaris celaka TIDAK masuk hitungan TRIR', () => {
    const d = [
      insiden({ id: 'a', jenis: 'nyaris_celaka' }),
      insiden({ id: 'b', jenis: 'nyaris_celaka' }),
    ]
    expect(hitungTrir(d, 100_000)).toBe(0)
  })

  it('kerusakan properti tak masuk hitungan', () => {
    expect(hitungTrir([insiden({ jenis: 'kerusakan_properti' })], 100_000)).toBe(0)
  })

  it('nol insiden dengan jam diketahui = 0, BUKAN null', () => {
    // Perbedaan yang menentukan: 0 berarti "tak ada insiden", null berarti
    // "belum bisa dihitung".
    expect(hitungTrir([], 100_000)).toBe(0)
  })
})

describe('hitungInsidenSubkon — sumber angka yang menggugurkan', () => {
  const d = [
    insiden({ id: 'a', supplier_id: 's1', jenis: 'kecelakaan_ringan', melukai: true, hari_kerja_hilang: 3 }),
    insiden({ id: 'b', supplier_id: 's1', jenis: 'nyaris_celaka' }),
    insiden({ id: 'c', supplier_id: 's2', jenis: 'fatal', melukai: true, hari_kerja_hilang: 0 }),
    insiden({ id: 'd', supplier_id: null, jenis: 'kecelakaan_berat', melukai: true }),
  ]

  it('mengembalikan id insidennya, supaya angkanya bisa dibuka', () => {
    const p = hitungInsidenSubkon(d)
    expect(p.get('s1')!.insiden_id).toEqual(['a'])
    expect(p.get('s2')!.insiden_id).toEqual(['c'])
  })

  it('nyaris celaka dihitung terpisah, tidak masuk kecelakaan', () => {
    const p = hitungInsidenSubkon(d)
    expect(p.get('s1')!.kecelakaan).toBe(1)
    expect(p.get('s1')!.nyaris_celaka).toBe(1)
  })

  it('insiden tanpa subkon diabaikan', () => {
    expect(hitungInsidenSubkon(d).has('')).toBe(false)
    expect(hitungInsidenSubkon(d).size).toBe(2)
  })

  it('rentang tanggal menyaring — periode ini tak dibebani periode lalu', () => {
    const lama = [
      insiden({ id: 'a', supplier_id: 's1', jenis: 'kecelakaan_ringan', tanggal: '2026-01-15' }),
      insiden({ id: 'b', supplier_id: 's1', jenis: 'kecelakaan_ringan', tanggal: '2026-08-01' }),
    ]
    const p = hitungInsidenSubkon(lama, '2026-07-01', '2026-08-31')
    expect(p.get('s1')!.kecelakaan).toBe(1)
    expect(p.get('s1')!.insiden_id).toEqual(['b'])
  })

  it('batas rentang INKLUSIF di kedua ujung', () => {
    const b = [insiden({ id: 'a', supplier_id: 's1', jenis: 'fatal', tanggal: '2026-07-01' })]
    expect(hitungInsidenSubkon(b, '2026-07-01', '2026-07-01').get('s1')!.kecelakaan).toBe(1)
  })

  it('hari kerja hilang dijumlahkan termasuk dari nyaris celaka', () => {
    const p = hitungInsidenSubkon(d)
    expect(p.get('s1')!.hari_kerja_hilang).toBe(3)
  })
})

describe('periksaSelaras — angka yang diketik vs yang dihitung', () => {
  it('selaras bila sama', () => {
    const p = hitungInsidenSubkon([
      insiden({ id: 'a', supplier_id: 's1', jenis: 'kecelakaan_ringan' }),
    ])
    const h = periksaSelaras(1, p.get('s1'), 's1')
    expect(h.selaras).toBe(true)
    expect(h.selisih).toBe(0)
  })

  it('TIDAK selaras: evaluasi menulis 0 padahal ada kecelakaan tercatat', () => {
    // Akibatnya nyata: subkon yang seharusnya gugur tetap dipakai.
    const p = hitungInsidenSubkon([
      insiden({ id: 'a', supplier_id: 's1', jenis: 'kecelakaan_berat' }),
      insiden({ id: 'b', supplier_id: 's1', jenis: 'fatal' }),
    ])
    const h = periksaSelaras(0, p.get('s1'), 's1')
    expect(h.selaras).toBe(false)
    expect(h.dihitung).toBe(2)
    expect(h.selisih).toBe(-2)
    expect(h.insiden_id).toHaveLength(2)
  })

  it('TIDAK selaras: evaluasi menulis 2 padahal tak ada barisnya', () => {
    const h = periksaSelaras(2, hitungInsidenSubkon([]).get('s1'), 's1')
    // `null`, bukan `false`: belum tentu benar-benar nol, bisa jadi belum
    // didata. Sama seperti izin kosong (G3) dan ITP kosong (G1e).
    expect(h.selaras).toBeNull()
    expect(h.diketik).toBe(2)
    expect(h.selisih).toBe(2)
  })

  it("diketik string kosong dibaca 0, bukan NaN", () => {
    const h = periksaSelaras('', undefined, 's1')
    expect(h.diketik).toBe(0)
  })
})

describe('ringkasJsa', () => {
  it('JSA KOSONG adalah null, bukan layak', () => {
    const r = ringkasJsa([])
    expect(r.layak).toBeNull()
    expect(r.alasan[0]).toMatch(/belum punya satu pun langkah/)
  })

  it('skor tertinggi menentukan — dan TERTINGGI, bukan yang terakhir', () => {
    // Urutan menaik saja tak membuktikan apa-apa: `tertinggi = l.skor`
    // (tanpa perbandingan) menghasilkan jawaban yang sama. Yang membedakan
    // adalah langkah berskor besar di TENGAH.
    const naik = ringkasJsa([
      langkah({ id: 'a', dampak: 1, kemungkinan: 1 }),
      langkah({ id: 'b', dampak: 5, kemungkinan: 5 }),
    ])
    expect(naik.skor_tertinggi).toBe(25)

    const turun = ringkasJsa([
      langkah({ id: 'a', dampak: 5, kemungkinan: 5 }),
      langkah({ id: 'b', dampak: 1, kemungkinan: 1 }),
    ])
    expect(turun.skor_tertinggi).toBe(25)

    const tengah = ringkasJsa([
      langkah({ id: 'a', dampak: 2, kemungkinan: 2 }),
      langkah({ id: 'b', dampak: 5, kemungkinan: 4 }),
      langkah({ id: 'c', dampak: 1, kemungkinan: 3 }),
    ])
    expect(tengah.skor_tertinggi).toBe(20)
  })

  it('langkah yang MASIH tinggi sesudah pengendalian menggugurkan kelayakan', () => {
    const r = ringkasJsa([
      langkah({ dampak: 5, kemungkinan: 5, dampak_sisa: 5, kemungkinan_sisa: 2 }),
    ])
    expect(r.sisa_tinggi).toBe(1)
    expect(r.layak).toBe(false)
  })

  it('sisa TEPAT di ambang 10 sudah terhitung tinggi', () => {
    const r = ringkasJsa([
      langkah({ dampak: 5, kemungkinan: 5, dampak_sisa: 5, kemungkinan_sisa: 2 }),
    ])
    expect(r.sisa_tinggi).toBe(1)
    const aman = ringkasJsa([
      langkah({ dampak: 5, kemungkinan: 5, dampak_sisa: 3, kemungkinan_sisa: 3 }),
    ])
    expect(aman.sisa_tinggi).toBe(0)
    expect(aman.layak).toBe(true)
  })

  it('belum dinilai ulang TIDAK menggugurkan — itu administrasi, bukan bahaya', () => {
    const r = ringkasJsa([langkah({ dampak: 5, kemungkinan: 5 })])
    expect(r.belum_dinilai_ulang).toBe(1)
    expect(r.layak).toBe(true)
    expect(r.alasan.join(' ')).toMatch(/belum dinilai ulang/)
  })

  it('kalimat tunggal dan jamak berbeda', () => {
    const satu = ringkasJsa([langkah({ id: 'a' })])
    expect(satu.alasan.join(' ')).toMatch(/^1 langkah/)
    const dua = ringkasJsa([langkah({ id: 'a' }), langkah({ id: 'b' })])
    expect(dua.alasan.join(' ')).toMatch(/^2 langkah/)
  })
})

describe('temuanBerulang — tiga kali sama BUKAN tiga temuan', () => {
  it('mengumpulkan per kategori dan mengurutkan dari yang tersering', () => {
    const d = [
      temuan({ id: 'a', kategori: 'apd', tanggal_inspeksi: '2026-06-01' }),
      temuan({ id: 'b', kategori: 'apd', tanggal_inspeksi: '2026-07-01' }),
      temuan({ id: 'c', kategori: 'apd', tanggal_inspeksi: '2026-08-01' }),
      temuan({ id: 'd', kategori: 'housekeeping', tanggal_inspeksi: '2026-07-01' }),
      temuan({ id: 'e', kategori: 'housekeeping', tanggal_inspeksi: '2026-08-01' }),
    ]
    const r = temuanBerulang(d)
    expect(r).toHaveLength(2)
    expect(r[0].kategori).toBe('apd')
    expect(r[0].jumlah).toBe(3)
    expect(r[0].pertama).toBe('2026-06-01')
    expect(r[0].terakhir).toBe('2026-08-01')
  })

  it('yang muncul SEKALI bukan pengulangan', () => {
    expect(temuanBerulang([temuan({ kategori: 'apd' })])).toHaveLength(0)
  })

  it('ambang minimal bisa diubah', () => {
    const d = [
      temuan({ id: 'a', kategori: 'apd' }),
      temuan({ id: 'b', kategori: 'apd' }),
    ]
    expect(temuanBerulang(d, 3)).toHaveLength(0)
    expect(temuanBerulang(d, 2)).toHaveLength(1)
  })

  it('temuan TANPA kategori diabaikan, bukan dipaksa dibandingkan lewat uraian', () => {
    const d = [
      temuan({ id: 'a', kategori: null }),
      temuan({ id: 'b', kategori: null }),
      temuan({ id: 'c', kategori: '   ' }),
    ]
    expect(temuanBerulang(d)).toHaveLength(0)
  })

  it('menghitung berapa dari pengulangan itu yang masih terbuka', () => {
    const d = [
      temuan({ id: 'a', kategori: 'apd', status: 'ditutup' }),
      temuan({ id: 'b', kategori: 'apd', status: 'terbuka' }),
      temuan({ id: 'c', kategori: 'apd', status: 'diperbaiki' }),
    ]
    expect(temuanBerulang(d)[0].terbuka).toBe(2)
  })
})

describe('rekapTemuan', () => {
  it('hanya yang BELUM ditutup dihitung terbuka', () => {
    const r = rekapTemuan([
      temuan({ id: 'a', status: 'terbuka' }),
      temuan({ id: 'b', status: 'ditutup' }),
    ], ACUAN)
    expect(r.total).toBe(2)
    expect(r.terbuka).toBe(1)
  })

  it('berat (tingkat 3) yang terbuka dihitung khusus — tingkat 2 TIDAK', () => {
    // Versi pertama memakai tingkat 1 sebagai pembanding, dan mutasi
    // membuktikannya tak cukup: menurunkan ambang ke >= 2 tetap hijau,
    // karena tak ada satu pun baris bertingkat 2. Yang membedakan ada di
    // batasnya sendiri.
    const r = rekapTemuan([
      temuan({ id: 'a', tingkat: 3, status: 'terbuka' }),
      temuan({ id: 'b', tingkat: 3, status: 'ditutup' }),
      temuan({ id: 'c', tingkat: 2, status: 'terbuka' }),
      temuan({ id: 'd', tingkat: 1, status: 'terbuka' }),
    ], ACUAN)
    expect(r.berat_terbuka).toBe(1)
    expect(r.terbuka).toBe(3)
  })

  it('lewat tenggat: batas < acuan, tepat hari acuan belum lewat', () => {
    const r = rekapTemuan([
      temuan({ id: 'a', tenggat: '2026-08-11' }),
      temuan({ id: 'b', tenggat: ACUAN }),
    ], ACUAN)
    expect(r.lewat_tenggat).toBe(1)
  })

  it('yang sudah ditutup tak dihitung lewat tenggat', () => {
    const r = rekapTemuan([
      temuan({ id: 'a', tenggat: '2020-01-01', status: 'ditutup' }),
    ], ACUAN)
    expect(r.lewat_tenggat).toBe(0)
  })
})

describe('statusInduksi', () => {
  const ind = (p: Partial<Induksi> = {}): Induksi => ({
    id: 'a', worker_id: 'w1', peserta_nama: null,
    tanggal: '2026-01-01', berlaku_sampai: null, ...p,
  })

  it('nol pekerja aktif = null, bukan 0 persen', () => {
    const r = statusInduksi([], [], ACUAN)
    expect(r.persen_berlaku).toBeNull()
    expect(r.total_pekerja).toBe(0)
  })

  it('induksi tanpa masa berlaku selalu sah', () => {
    const r = statusInduksi([ind({ berlaku_sampai: null })], ['w1'], ACUAN)
    expect(r.terinduksi).toBe(1)
    expect(r.persen_berlaku).toBe(100)
  })

  it('habis TEPAT hari acuan masih sah — batas >=, bukan >', () => {
    const r = statusInduksi([ind({ berlaku_sampai: ACUAN })], ['w1'], ACUAN)
    expect(r.terinduksi).toBe(1)
    expect(r.kedaluwarsa).toBe(0)
  })

  it('lewat sehari = kedaluwarsa, dan itu BEDA dari belum pernah', () => {
    const r = statusInduksi([ind({ berlaku_sampai: '2026-08-11' })], ['w1', 'w2'], ACUAN)
    expect(r.kedaluwarsa).toBe(1)
    expect(r.belum).toBe(1)
    expect(r.terinduksi).toBe(0)
  })

  it('induksi terbaru yang masih berlaku menang atas yang kedaluwarsa', () => {
    const r = statusInduksi([
      ind({ id: 'a', berlaku_sampai: '2026-01-01' }),
      ind({ id: 'b', berlaku_sampai: '2027-01-01' }),
    ], ['w1'], ACUAN)
    expect(r.terinduksi).toBe(1)
    expect(r.kedaluwarsa).toBe(0)
  })

  it('induksi peserta luar (tanpa worker_id) tak menghitung pekerja aktif', () => {
    const r = statusInduksi([
      ind({ worker_id: null, peserta_nama: 'Tamu' }),
    ], ['w1'], ACUAN)
    expect(r.belum).toBe(1)
    expect(r.terinduksi).toBe(0)
  })

  it('persen dibulatkan satu desimal', () => {
    const r = statusInduksi([ind({ worker_id: 'w1' })], ['w1', 'w2', 'w3'], ACUAN)
    expect(r.persen_berlaku).toBe(33.3)
  })
})

describe('rekapApd', () => {
  const apd = (p: Partial<Apd> = {}): Apd => ({
    id: 'a', worker_id: 'w1', penerima_nama: null, jenis_apd: 'Helm',
    jumlah: 1, tanggal: '2026-01-01', ganti_sebelum: null, ...p,
  })

  it('menjumlahkan per jenis, terbanyak di atas', () => {
    const r = rekapApd([
      apd({ id: 'a', jenis_apd: 'Helm', jumlah: 5 }),
      apd({ id: 'b', jenis_apd: 'Sarung tangan', jumlah: 12 }),
      apd({ id: 'c', jenis_apd: 'Helm', jumlah: 3 }),
    ], ACUAN)
    expect(r.per_jenis[0]).toEqual({ jenis: 'Sarung tangan', jumlah: 12 })
    expect(r.per_jenis[1]).toEqual({ jenis: 'Helm', jumlah: 8 })
  })

  it('jatuh tempo: batas < acuan; tepat hari acuan belum jatuh tempo', () => {
    const r = rekapApd([
      apd({ id: 'a', ganti_sebelum: '2026-08-11' }),
      apd({ id: 'b', ganti_sebelum: ACUAN }),
    ], ACUAN)
    expect(r.jatuh_tempo).toBe(1)
  })

  it('akan jatuh tempo dalam ambang', () => {
    const r = rekapApd([
      apd({ id: 'a', ganti_sebelum: '2026-09-01' }),
      apd({ id: 'b', ganti_sebelum: '2027-01-01' }),
    ], ACUAN)
    expect(r.akan_jatuh_tempo).toBe(1)
  })

  it('tanpa ganti_sebelum tak pernah jatuh tempo', () => {
    const r = rekapApd([apd({ ganti_sebelum: null })], ACUAN)
    expect(r.jatuh_tempo).toBe(0)
    expect(r.akan_jatuh_tempo).toBe(0)
  })
})

describe('nilaiLingkungan — melebihi null berbeda dari aman', () => {
  const u = (p: Partial<UkurLingkungan> = {}): UkurLingkungan => ({
    id: 'a', parameter: 'Kebisingan', tanggal: '2026-08-01',
    nilai: 55, satuan: 'dBA', baku_mutu: 70, ...p,
  })

  it('di bawah baku mutu = tidak melebihi', () => {
    const r = nilaiLingkungan(u({ nilai: 55, baku_mutu: 70 }))
    expect(r.melebihi).toBe(false)
    expect(r.persen_baku).toBe(78.6)
  })

  it('TEPAT di baku mutu belum melebihi', () => {
    expect(nilaiLingkungan(u({ nilai: 70, baku_mutu: 70 })).melebihi).toBe(false)
  })

  it('di atas baku mutu = melebihi', () => {
    expect(nilaiLingkungan(u({ nilai: 71, baku_mutu: 70 })).melebihi).toBe(true)
  })

  it('tanpa baku mutu = null, BUKAN aman', () => {
    const r = nilaiLingkungan(u({ baku_mutu: null }))
    expect(r.melebihi).toBeNull()
    expect(r.persen_baku).toBeNull()
  })

  it('baku mutu nol tak dibagi', () => {
    expect(nilaiLingkungan(u({ baku_mutu: 0 })).persen_baku).toBeNull()
  })

  it("baku mutu STRING KOSONG bukan nol — `Number('')` adalah 0", () => {
    // Inilah satu-satunya tempat di modul ini yang MEMBEDAKAN `null` dari 0:
    // di tempat lain hasilnya dijatuhkan ke 0 lewat `?? 0`, jadi mutasi
    // "string kosong jadi 0" lolos di sana tanpa mengubah apa pun.
    //
    // Kalau `''` terbaca 0, `baku === 0` menghentikannya di cabang yang sama
    // dan hasilnya kebetulan tetap null — TAPI nilai ukur yang kosong akan
    // terbaca 0 dan dinyatakan "tidak melebihi", padahal ia belum diukur.
    const tanpaNilai = nilaiLingkungan(u({ nilai: '', baku_mutu: 70 }))
    expect(tanpaNilai.melebihi).toBeNull()
    expect(tanpaNilai.persen_baku).toBeNull()
  })

  it('nilai berisi spasi juga tak dinyatakan aman', () => {
    expect(nilaiLingkungan(u({ nilai: '   ', baku_mutu: 70 })).melebihi).toBeNull()
  })

  it('numeric string dari Postgres dibaca benar', () => {
    const r = nilaiLingkungan(u({ nilai: '82.5', baku_mutu: '70' }))
    expect(r.melebihi).toBe(true)
  })
})

describe('rekapLingkungan', () => {
  it('yang tanpa pembanding dihitung TERPISAH, tidak diam-diam aman', () => {
    const r = rekapLingkungan([
      { id: 'a', parameter: 'Kebisingan', tanggal: '2026-08-01', nilai: 55, satuan: 'dBA', baku_mutu: 70 },
      { id: 'b', parameter: 'Kebisingan', tanggal: '2026-08-02', nilai: 88, satuan: 'dBA', baku_mutu: 70 },
      { id: 'c', parameter: 'Debu', tanggal: '2026-08-02', nilai: 12, satuan: 'µg/m³', baku_mutu: null },
    ])
    expect(r.total).toBe(3)
    expect(r.melebihi).toBe(1)
    expect(r.tanpa_pembanding).toBe(1)
    expect(r.parameter).toBe(2)
  })

  it('daftar kosong', () => {
    const r = rekapLingkungan([])
    expect(r.total).toBe(0)
    expect(r.parameter).toBe(0)
  })
})
