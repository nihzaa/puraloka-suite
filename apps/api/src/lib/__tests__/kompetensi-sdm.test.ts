import { describe, it, expect } from 'vitest'
import {
  nilaiSertifikat, ringkasSertifikat, periksaSyarat,
  ringkasKinerja, bolehPindahTahap, selisihHari, angka,
  type Sertifikat, type Penilaian, type TahapLamaran,
} from '../kompetensi-sdm.js'

// `!== undefined`, bukan `??` — pelajaran G1e/G2a/G2b/G2d.
function sertifikat(p: Partial<Sertifikat> = {}): Sertifikat {
  return {
    id: p.id ?? Math.random().toString(36).slice(2),
    jenis: p.jenis ?? 'SKA',
    nama: p.nama ?? 'Ahli Madya Teknik Bangunan Gedung',
    nomor: p.nomor !== undefined ? p.nomor : null,
    penerbit: p.penerbit !== undefined ? p.penerbit : null,
    klasifikasi: p.klasifikasi !== undefined ? p.klasifikasi : null,
    kualifikasi: p.kualifikasi !== undefined ? p.kualifikasi : null,
    tanggal_terbit: p.tanggal_terbit !== undefined ? p.tanggal_terbit : null,
    berlaku_sampai: p.berlaku_sampai !== undefined ? p.berlaku_sampai : '2027-01-01',
    berjangka: p.berjangka !== undefined ? p.berjangka : true,
  }
}

const ACUAN = '2026-08-11'

describe('selisihHari & angka', () => {
  it('selisih bebas zona waktu, dan negatif untuk yang lampau', () => {
    expect(selisihHari('2026-08-11', '2026-08-21')).toBe(10)
    expect(selisihHari('2026-08-11', '2026-08-01')).toBe(-10)
    // Melintasi batas bulan & tahun.
    expect(selisihHari('2026-12-30', '2027-01-02')).toBe(3)
  })

  it('angka: string kosong → null, bukan 0', () => {
    expect(angka('')).toBeNull()
    expect(angka('NaN')).toBeNull()
    expect(angka('4.5')).toBe(4.5)
  })
})

describe('nilaiSertifikat — kedaluwarsa tak boleh jadi bukti', () => {
  it('SEUMUR HIDUP selalu berlaku, sisa_hari null', () => {
    const s = nilaiSertifikat(
      sertifikat({ berjangka: false, berlaku_sampai: null }), ACUAN)
    expect(s.status).toBe('berlaku')
    expect(s.sisa_hari).toBeNull()
  })

  it('BERJANGKA tanpa tanggal dianggap KEDALUWARSA, bukan berlaku', () => {
    // Data yang HILANG tak boleh jadi bukti kompetensi. Menganggapnya
    // berlaku membuat sertifikat tanpa masa berlaku dipakai memenuhi syarat
    // tender — dan yang menandatangani penawaran adalah direktur.
    const s = nilaiSertifikat(
      sertifikat({ berjangka: true, berlaku_sampai: null }), ACUAN)
    expect(s.status).toBe('kedaluwarsa')
  })

  it('kedaluwarsa PERSIS di tanggal acuan MASIH berlaku', () => {
    // Masa berlaku habis pada AKHIR hari itu. Memakai `<=` membuat sertifikat
    // ditolak sehari lebih cepat, dan tender bisa gagal karenanya.
    const s = nilaiSertifikat(sertifikat({ berlaku_sampai: ACUAN }), ACUAN)
    expect(s.status).not.toBe('kedaluwarsa')
    expect(s.sisa_hari).toBe(0)
  })

  it('sehari sesudah acuan sudah kedaluwarsa', () => {
    const s = nilaiSertifikat(sertifikat({ berlaku_sampai: '2026-08-10' }), ACUAN)
    expect(s.status).toBe('kedaluwarsa')
    expect(s.sisa_hari).toBe(-1)
  })

  it('`akan_habis` hanya untuk yang MASIH berlaku dalam ambang', () => {
    // 30 hari lagi, ambang 60.
    expect(nilaiSertifikat(sertifikat({ berlaku_sampai: '2026-09-10' }), ACUAN, 60).status)
      .toBe('akan_habis')
    // 90 hari lagi — masih aman.
    expect(nilaiSertifikat(sertifikat({ berlaku_sampai: '2026-11-09' }), ACUAN, 60).status)
      .toBe('berlaku')
  })

  it('dinilai terhadap ACUAN, bukan hari ini', () => {
    const s = sertifikat({ berlaku_sampai: '2026-07-01' })
    // Prakualifikasi yang diajukan bulan lalu diperiksa dengan keadaan bulan
    // lalu — sertifikat yang habis minggu ini tak membatalkan penawaran lama.
    //
    // Acuan Januari, bukan Juni: 1 Juni → 1 Juli hanya 30 hari, di bawah
    // ambang 60, jadi `akan_habis` — benar, tapi bukan yang diuji di sini.
    // Test versi pertama memakai Juni dan gagal; yang salah test-nya.
    expect(nilaiSertifikat(s, '2026-01-15').status).toBe('berlaku')
    expect(nilaiSertifikat(s, '2026-08-11').status).toBe('kedaluwarsa')
  })
})

describe('ringkasSertifikat', () => {
  it('menghitung tiga keadaan terpisah', () => {
    const r = ringkasSertifikat([
      sertifikat({ berlaku_sampai: '2027-06-01' }),           // berlaku
      sertifikat({ berlaku_sampai: '2026-09-01' }),           // akan habis
      sertifikat({ berlaku_sampai: '2026-01-01' }),           // kedaluwarsa
      sertifikat({ berjangka: false, berlaku_sampai: null }), // seumur hidup
    ], ACUAN, 60)
    expect(r.berlaku).toBe(2)
    expect(r.akan_habis).toBe(1)
    expect(r.kedaluwarsa).toBe(1)
  })

  it('`perlu_tindakan` terurut paling mendesak dulu', () => {
    const r = ringkasSertifikat([
      sertifikat({ id: 'a', berlaku_sampai: '2026-09-01', nama: 'akan habis 21 hari' }),
      sertifikat({ id: 'b', berlaku_sampai: '2026-06-01', nama: 'kedaluwarsa 71 hari' }),
      sertifikat({ id: 'c', berlaku_sampai: '2026-08-20', nama: 'akan habis 9 hari' }),
    ], ACUAN, 60)
    // Tiga elemen teracak — dua elemen tak bisa membedakan komparator yang
    // dibalik (pelajaran fixture geotag 2026-08-10).
    expect(r.perlu_tindakan.map((x) => x.id)).toEqual(['b', 'c', 'a'])
  })

  it('yang berjangka TANPA tanggal paling mendesak', () => {
    const r = ringkasSertifikat([
      sertifikat({ id: 'x', berlaku_sampai: '2026-06-01' }),
      sertifikat({ id: 'y', berjangka: true, berlaku_sampai: null }),
    ], ACUAN)
    // Ia tak bisa diperbaiki dengan menunggu — datanya yang hilang.
    expect(r.perlu_tindakan[0].id).toBe('y')
  })

  it('yang SEUMUR HIDUP tak pernah masuk perlu_tindakan', () => {
    const r = ringkasSertifikat(
      [sertifikat({ berjangka: false, berlaku_sampai: null })], ACUAN)
    expect(r.perlu_tindakan).toHaveLength(0)
  })

  it('daftar kosong → nol semua, bukan galat', () => {
    const r = ringkasSertifikat([], ACUAN)
    expect(r).toMatchObject({ berlaku: 0, akan_habis: 0, kedaluwarsa: 0 })
  })
})

describe('periksaSyarat — inti alasan modul ini ada', () => {
  const orang = (id: string, nama: string, s: Sertifikat[]) =>
    ({ pegawai_id: id, nama, sertifikat: s })

  it('sertifikat KEDALUWARSA tidak menghitung', () => {
    const h = periksaSyarat(
      { jenis: 'SKA', jumlah: 1 },
      [orang('p1', 'Budi', [sertifikat({ berlaku_sampai: '2026-01-01' })])],
      ACUAN,
    )
    // Tender yang dipenuhi sertifikat kedaluwarsa adalah dokumen palsu di
    // mata panitia.
    expect(h.cukup).toBe(false)
    expect(h.terpenuhi).toBe(0)
  })

  it('sertifikat AKAN HABIS masih menghitung', () => {
    const h = periksaSyarat(
      { jenis: 'SKA', jumlah: 1 },
      [orang('p1', 'Budi', [sertifikat({ berlaku_sampai: '2026-09-01' })])],
      ACUAN,
    )
    // Ia SAH pada tanggal acuan. Menolaknya membuat tender gagal untuk
    // sertifikat yang masih berlaku.
    expect(h.cukup).toBe(true)
  })

  it('pencocokan kualifikasi & klasifikasi tak peka besar-kecil dan spasi', () => {
    const h = periksaSyarat(
      { jenis: 'ska', kualifikasi: ' ahli madya ', jumlah: 1 },
      [orang('p1', 'Budi', [
        sertifikat({ jenis: 'SKA', kualifikasi: 'Ahli Madya' }),
      ])],
      ACUAN,
    )
    // Normalisasi DUA ARAH — pelajaran G2a, di mana melepas `.toUpperCase()`
    // dari sisi tabel tak membuat test merah karena fixture kebetulan sudah
    // huruf besar.
    expect(h.cukup).toBe(true)
  })

  it('kualifikasi yang TIDAK cocok tak menghitung', () => {
    const h = periksaSyarat(
      { jenis: 'SKA', kualifikasi: 'Ahli Utama', jumlah: 1 },
      [orang('p1', 'Budi', [sertifikat({ kualifikasi: 'Ahli Madya' })])],
      ACUAN,
    )
    expect(h.cukup).toBe(false)
  })

  it('syarat tanpa kualifikasi menerima jenis apa pun', () => {
    const h = periksaSyarat(
      { jenis: 'SKA', jumlah: 1 },
      [orang('p1', 'Budi', [sertifikat({ kualifikasi: 'Ahli Pratama' })])],
      ACUAN,
    )
    expect(h.cukup).toBe(true)
  })

  it('satu ORANG dihitung sekali meski punya dua sertifikat cocok', () => {
    const h = periksaSyarat(
      { jenis: 'SKA', jumlah: 2 },
      [orang('p1', 'Budi', [sertifikat(), sertifikat()])],
      ACUAN,
    )
    // Tender menuntut "2 tenaga ahli", bukan "2 lembar sertifikat".
    expect(h.terpenuhi).toBe(1)
    expect(h.cukup).toBe(false)
  })

  it('jumlah terpenuhi dari beberapa orang', () => {
    const h = periksaSyarat(
      { jenis: 'SKA', jumlah: 2 },
      [orang('p1', 'Budi', [sertifikat()]), orang('p2', 'Sari', [sertifikat()])],
      ACUAN,
    )
    expect(h.cukup).toBe(true)
    expect(h.pemenuhi.map((x) => x.nama)).toEqual(['Budi', 'Sari'])
  })
})

describe('ringkasKinerja — skor dinormalkan', () => {
  const p = (periode: string, skor: number | null, maks: number,
    status: 'draf' | 'final' = 'final'): Penilaian =>
    ({ id: periode, periode, skor, skala_maks: maks, status })

  it('skala berbeda dinormalkan ke persen yang sebanding', () => {
    const r = ringkasKinerja([p('2026-S1', 4, 5), p('2026-S2', 80, 100)])
    // 4 dari 5 dan 80 dari 100 adalah nilai yang SAMA. Membandingkan 4 dengan
    // 80 mentah-mentah adalah omong kosong.
    expect(r.tren.map((t) => t.persen)).toEqual([80, 80])
  })

  it('hanya yang FINAL masuk rata-rata', () => {
    const r = ringkasKinerja([
      p('2026-S1', 5, 5, 'final'),
      p('2026-S2', 1, 5, 'draf'),
    ])
    // Draf boleh berubah dan belum berarti apa-apa.
    expect(r.rata_final).toBe(100)
    expect(r.jumlah_draf).toBe(1)
  })

  it('skor null muncul di tren tapi tak ikut rata-rata', () => {
    const r = ringkasKinerja([p('2026-S1', 4, 5), p('2026-S2', null, 5)])
    expect(r.tren).toHaveLength(2)
    expect(r.tren[1].persen).toBeNull()
    expect(r.rata_final).toBe(80)
  })

  it('nol final → rata-rata NULL, bukan 0', () => {
    const r = ringkasKinerja([p('2026-S1', 4, 5, 'draf')])
    // 0 berarti "dinilai buruk" — klaim yang tak dimiliki datanya.
    expect(r.rata_final).toBeNull()
  })

  it('tren terurut menurut periode', () => {
    const r = ringkasKinerja([p('2026-S2', 4, 5), p('2025-S1', 3, 5), p('2026-S1', 5, 5)])
    expect(r.tren.map((t) => t.periode)).toEqual(['2025-S1', '2026-S1', '2026-S2'])
  })

  it('skala nol tak menghasilkan Infinity', () => {
    const r = ringkasKinerja([p('2026-S1', 4, 0)])
    expect(r.tren[0].persen).toBeNull()
  })
})

describe('bolehPindahTahap', () => {
  const uji = (dari: TahapLamaran, ke: TahapLamaran) => bolehPindahTahap(dari, ke)

  it('maju satu tahap boleh', () => {
    expect(uji('masuk', 'seleksi_berkas').boleh).toBe(true)
    expect(uji('wawancara', 'tawaran').boleh).toBe(true)
  })

  it('melompat maju BOLEH', () => {
    // Sebagian perusahaan melewati seleksi berkas untuk pelamar rujukan.
    expect(uji('masuk', 'wawancara').boleh).toBe(true)
  })

  it('MUNDUR tidak boleh', () => {
    const h = uji('wawancara', 'masuk')
    // Mundur menghapus jejak bahwa tahap itu pernah dilewati.
    expect(h.boleh).toBe(false)
    expect(h.sebab).toMatch(/mundur/i)
  })

  it('ditolak boleh dari tahap mana pun', () => {
    expect(uji('masuk', 'ditolak').boleh).toBe(true)
    expect(uji('tawaran', 'ditolak').boleh).toBe(true)
  })

  it('dari DITERIMA atau DITOLAK tak bisa berpindah lagi', () => {
    expect(uji('diterima', 'wawancara').boleh).toBe(false)
    expect(uji('ditolak', 'masuk').boleh).toBe(false)
    expect(uji('ditolak', 'diterima').boleh).toBe(false)
  })

  it('DITERIMA → DITOLAK juga tertutup', () => {
    // ── Kenapa test ini ditambahkan ───────────────────────────────────────
    //
    // Mutasi membuktikan penjaga "dari diterima/ditolak" TIDAK diuji: melepas
    // penjaganya, tiga jalur di test sebelumnya tetap merah karena tertangkap
    // pemeriksaan urutan (mundur / tahap tak dikenal).
    //
    // Yang LOLOS justru ini — `ditolak` bukan bagian `URUTAN_TAHAP`, dan
    // cabang `ke === 'ditolak'` mengembalikan `true` sebelum urutan diperiksa.
    // Akibatnya orang yang sudah diterima jadi pegawai bisa "ditolak"
    // belakangan, meninggalkan lamaran ditolak yang tersambung ke pegawai
    // aktif — dan constraint `lamaran_diterima_berpegawai` tak menangkapnya
    // karena barisnya tak lagi berstatus `diterima`.
    const h = uji('diterima', 'ditolak')
    expect(h.boleh).toBe(false)
    expect(h.sebab).toMatch(/diterima/i)
  })

  it('pindah ke tahap yang sama ditolak', () => {
    expect(uji('wawancara', 'wawancara').boleh).toBe(false)
  })
})
