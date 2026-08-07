import { describe, it, expect } from 'vitest'
import {
  nilaiKepatuhan, nilaiEvaluasiSubkon, nilaiIzinKerja, nilaiKesiapanPihak,
  AMBANG_SEGERA_HABIS, AMBANG_LEMAH_SUBKON, BOBOT_SUBKON, labelJenis,
} from '../kepatuhan-k3.js'

const HARI_INI = '2026-08-07'
const SEKARANG = '2026-08-07T10:00:00Z'

describe('nilaiKepatuhan', () => {
  // ── Cacat #1: centang hijau atas dokumen yang sudah mati ────────────────
  it('TERVERIFIKASI tapi masa berlaku HABIS = hijau tapi mati', () => {
    const h = nilaiKepatuhan([
      { id: '1', jenis: 'asuransi_car', pihak_nama: 'PT A',
        berlaku_sampai: '2026-03-01', terverifikasi: true },
    ], HARI_INI)

    // Kolom `terverifikasi` hanya menyatakan seseorang PERNAH memeriksanya —
    // bukan bahwa dokumennya masih hidup hari ini.
    expect(h.dokumen[0].status).toBe('kedaluwarsa')
    expect(h.dokumen[0].hijauTapiMati).toBe(true)
    expect(h.hijauTapiMati).toBe(1)
    expect(h.kedaluwarsa).toBe(1)
  })

  it('kedaluwarsa TAPI belum diverifikasi bukan "hijau tapi mati"', () => {
    // Tak ada centang hijau yang menyesatkan di sini — masalahnya berbeda.
    const h = nilaiKepatuhan([
      { id: '1', jenis: 'siujk', pihak_nama: 'PT A',
        berlaku_sampai: '2026-03-01', terverifikasi: false },
    ], HARI_INI)
    expect(h.dokumen[0].status).toBe('kedaluwarsa')
    expect(h.dokumen[0].hijauTapiMati).toBe(false)
    expect(h.hijauTapiMati).toBe(0)
  })

  it('segera habis pada ≤ 60 hari — masih bisa diurus', () => {
    expect(AMBANG_SEGERA_HABIS).toBe(60)
    const h = nilaiKepatuhan([
      { id: '1', jenis: 'sbu', pihak_nama: 'PT A',
        berlaku_sampai: '2026-09-15', terverifikasi: true },   // 39 hari lagi
    ], HARI_INI)
    expect(h.dokumen[0].sisaHari).toBe(39)
    expect(h.dokumen[0].status).toBe('segera_habis')
    expect(h.segeraHabis).toBe(1)
  })

  it('masih jauh dari tanggal mati = berlaku', () => {
    const h = nilaiKepatuhan([
      { id: '1', jenis: 'sbu', pihak_nama: 'PT A',
        berlaku_sampai: '2027-06-01', terverifikasi: true },
    ], HARI_INI)
    expect(h.dokumen[0].status).toBe('berlaku')
    expect(h.segeraHabis).toBe(0)
    expect(h.kedaluwarsa).toBe(0)
  })

  it('BELUM DIVERIFIKASI menang atas "berlaku" — dokumen tak diperiksa tak bisa diandalkan', () => {
    const h = nilaiKepatuhan([
      { id: '1', jenis: 'npwp', pihak_nama: 'PT A',
        berlaku_sampai: '2030-01-01', terverifikasi: false },
    ], HARI_INI)
    expect(h.dokumen[0].status).toBe('belum_diverifikasi')
    expect(h.belumDiverifikasi).toBe(1)
  })

  it('tanpa masa berlaku (NPWP) bukan kedaluwarsa, tapi tetap butuh verifikasi', () => {
    const terverifikasi = nilaiKepatuhan([
      { id: '1', jenis: 'npwp', pihak_nama: 'PT A',
        berlaku_sampai: null, terverifikasi: true },
    ], HARI_INI)
    expect(terverifikasi.dokumen[0].status).toBe('tanpa_masa')
    expect(terverifikasi.dokumen[0].sisaHari).toBeNull()

    const belum = nilaiKepatuhan([
      { id: '1', jenis: 'npwp', pihak_nama: 'PT A',
        berlaku_sampai: null, terverifikasi: false },
    ], HARI_INI)
    expect(belum.dokumen[0].status).toBe('belum_diverifikasi')
  })

  it('habis TEPAT hari ini masih berlaku, bukan kedaluwarsa', () => {
    const h = nilaiKepatuhan([
      { id: '1', jenis: 'sbu', pihak_nama: 'PT A',
        berlaku_sampai: HARI_INI, terverifikasi: true },
    ], HARI_INI)
    expect(h.dokumen[0].sisaHari).toBe(0)
    expect(h.dokumen[0].status).toBe('segera_habis')
    expect(h.kedaluwarsa).toBe(0)
  })

  it('daftar kosong tak melempar', () => {
    const h = nilaiKepatuhan([], HARI_INI)
    expect(h.total).toBe(0)
    expect(h.hijauTapiMati).toBe(0)
  })
})

describe('nilaiEvaluasiSubkon', () => {
  const BAGUS = {
    id: '1', skor_mutu: 85, skor_waktu: 80, skor_k3: 90,
    skor_kepatuhan: 85, skor_kerjasama: 75,
  }

  it('skor BERBOBOT, bukan rata-rata polos', () => {
    expect(BOBOT_SUBKON.k3).toBe(25)
    const h = nilaiEvaluasiSubkon(BAGUS)
    // K3 dan mutu berbobot 25, kerjasama cuma 10.
    expect(h.skor).not.toBe(h.rataPolos)
    expect(h.skor).toBeGreaterThan(80)
    expect(h.bolehDipakai).toBe(true)
  })

  // ── Cacat #2: rata-rata yang menelan kecelakaan kerja ───────────────────
  it('SATU kecelakaan kerja MENGGUGURKAN, meski skornya tinggi', () => {
    const h = nilaiEvaluasiSubkon({ ...BAGUS, jumlah_kecelakaan: 1 })

    // Skornya tetap tinggi — dan itulah masalahnya kalau hanya skor yang
    // dibaca. Kecelakaan menggugurkan, bukan mengurangi.
    expect(h.skor).toBeGreaterThan(80)
    expect(h.bolehDipakai).toBe(false)
    expect(h.alasanTakBolehDipakai).toContain('1 kecelakaan kerja')
  })

  it('pelanggaran K3 berulang menggugurkan meski belum ada kecelakaan', () => {
    // Yang belum terjadi bukan berarti tak akan terjadi.
    const dua = nilaiEvaluasiSubkon({ ...BAGUS, jumlah_pelanggaran_k3: 2 })
    expect(dua.bolehDipakai).toBe(true)

    const tiga = nilaiEvaluasiSubkon({ ...BAGUS, jumlah_pelanggaran_k3: 3 })
    expect(tiga.bolehDipakai).toBe(false)
    expect(tiga.alasanTakBolehDipakai).toContain('3 pelanggaran K3')
  })

  it('daftar hitam menggugurkan apa pun skornya', () => {
    const h = nilaiEvaluasiSubkon({ ...BAGUS, masuk_daftar_hitam: true })
    expect(h.bolehDipakai).toBe(false)
    expect(h.alasanTakBolehDipakai).toContain('masuk daftar hitam')
  })

  it('titik lemah per-dimensi dinyatakan — rata-rata menyembunyikannya', () => {
    expect(AMBANG_LEMAH_SUBKON).toBe(60)
    // Mutu 100 & ketepatan waktu 0 punya rata-rata sama dengan serba-50.
    // Yang pertama TIDAK PERNAH tepat waktu, dan itu harus terbaca.
    const h = nilaiEvaluasiSubkon({
      id: '1', skor_mutu: 100, skor_waktu: 0, skor_k3: 100,
      skor_kepatuhan: 100, skor_kerjasama: 100,
    })
    expect(h.titikLemah).toEqual(['ketepatan waktu'])
  })

  it('beberapa alasan dikumpulkan semua, bukan berhenti di yang pertama', () => {
    const h = nilaiEvaluasiSubkon({
      ...BAGUS, masuk_daftar_hitam: true,
      jumlah_kecelakaan: 2, jumlah_pelanggaran_k3: 5,
    })
    expect(h.alasanTakBolehDipakai).toHaveLength(3)
  })

  it('NUMERIC string dari Postgres dibaca sebagai angka', () => {
    const h = nilaiEvaluasiSubkon({
      id: '1', skor_mutu: '80', skor_waktu: '80', skor_k3: '80',
      skor_kepatuhan: '80', skor_kerjasama: '80', jumlah_kecelakaan: '0',
    })
    // Kalau string digabung alih-alih dijumlah, hasilnya bukan 80.
    expect(h.skor).toBe(80)
    expect(h.bolehDipakai).toBe(true)
  })
})

describe('nilaiIzinKerja', () => {
  const IZIN = {
    id: '1', nomor: 'WP-001', jenis: 'pekerjaan_panas',
    pengendalian_risiko: 'APAR 2 unit, fire watcher, barikade radius 5 m',
  }

  // ── Cacat #3: izin "disetujui" yang jendelanya sudah lewat ──────────────
  it('DISETUJUI tapi jendela waktunya SUDAH LEWAT = kedaluwarsa', () => {
    const h = nilaiIzinKerja([{
      ...IZIN, status: 'disetujui',
      berlaku_dari: '2026-08-01T07:00:00Z',
      berlaku_sampai: '2026-08-01T17:00:00Z',
    }], SEKARANG)

    // Kolom `status` di basis masih 'disetujui'. Pekerjaan yang berjalan
    // atas izin ini TIDAK BERIZIN.
    expect(h.izin[0].statusNyata).toBe('kedaluwarsa')
    expect(h.izin[0].disetujuiTapiLewat).toBe(true)
    expect(h.disetujuiTapiLewat).toBe(1)
    expect(h.aktif).toBe(0)
  })

  it('DISETUJUI dan jendelanya sedang berjalan = aktif', () => {
    const h = nilaiIzinKerja([{
      ...IZIN, status: 'disetujui',
      berlaku_dari: '2026-08-07T07:00:00Z',
      berlaku_sampai: '2026-08-07T17:00:00Z',
    }], SEKARANG)
    expect(h.izin[0].statusNyata).toBe('aktif')
    expect(h.izin[0].sisaJam).toBe(7)
    expect(h.aktif).toBe(1)
    expect(h.disetujuiTapiLewat).toBe(0)
  })

  it('DISETUJUI tapi jendelanya BELUM MULAI bukan aktif', () => {
    const h = nilaiIzinKerja([{
      ...IZIN, status: 'disetujui',
      berlaku_dari: '2026-08-20T07:00:00Z',
      berlaku_sampai: '2026-08-20T17:00:00Z',
    }], SEKARANG)
    expect(h.izin[0].statusNyata).toBe('belum_mulai')
    expect(h.aktif).toBe(0)
  })

  it('DIAJUKAN = menunggu, bukan aktif — pekerjaan belum boleh dimulai', () => {
    const h = nilaiIzinKerja([{
      ...IZIN, status: 'diajukan',
      berlaku_dari: '2026-08-07T07:00:00Z',
      berlaku_sampai: '2026-08-07T17:00:00Z',
    }], SEKARANG)
    expect(h.izin[0].statusNyata).toBe('menunggu')
    expect(h.menunggu).toBe(1)
    expect(h.aktif).toBe(0)
  })

  it('DITOLAK / DITUTUP / DRAFT tak pernah aktif', () => {
    for (const st of ['ditolak', 'ditutup', 'draft']) {
      const h = nilaiIzinKerja([{
        ...IZIN, status: st,
        berlaku_dari: '2026-08-07T07:00:00Z',
        berlaku_sampai: '2026-08-07T17:00:00Z',
      }], SEKARANG)
      expect(h.izin[0].statusNyata).toBe('tak_berlaku')
      expect(h.izin[0].disetujuiTapiLewat).toBe(false)
    }
  })
})

describe('nilaiKesiapanPihak', () => {
  // ── Cacat inti: kinerja bagus + asuransi mati = tetap hijau ─────────────
  it('subkon berkinerja BAGUS dengan asuransi MATI tak boleh bekerja', () => {
    const dokumen = nilaiKepatuhan([
      { id: 'd1', jenis: 'asuransi_car', supplier_id: 's1', pihak_nama: 'PT Maju',
        berlaku_sampai: '2026-05-01', terverifikasi: true },
    ], HARI_INI).dokumen

    const evaluasi = [nilaiEvaluasiSubkon({
      id: 'e1', supplier_id: 's1', pihak_nama: 'PT Maju',
      skor_mutu: 90, skor_waktu: 88, skor_k3: 92,
      skor_kepatuhan: 85, skor_kerjasama: 90,
    })]

    const h = nilaiKesiapanPihak(dokumen, evaluasi)
    expect(h).toHaveLength(1)
    // Skornya tinggi — layar yang hanya membaca kinerja akan menghijaukannya.
    expect(h[0].skorTerakhir).toBeGreaterThan(85)
    expect(h[0].bolehBekerja).toBe(false)
    // Nama TERBACA, bukan kunci mentah ber-garis-bawah: alasan ini ikut
    // terkirim ke notifikasi dan ekspor, bukan cuma tampil di satu layar.
    expect(h[0].alasan).toContain('Asuransi CAR kedaluwarsa')
  })

  it('dokumen lengkap + kinerja bagus = boleh bekerja', () => {
    const dokumen = nilaiKepatuhan([
      { id: 'd1', jenis: 'siujk', supplier_id: 's1', pihak_nama: 'PT Maju',
        berlaku_sampai: '2027-12-31', terverifikasi: true },
    ], HARI_INI).dokumen
    const evaluasi = [nilaiEvaluasiSubkon({
      id: 'e1', supplier_id: 's1', pihak_nama: 'PT Maju',
      skor_mutu: 85, skor_waktu: 85, skor_k3: 85,
      skor_kepatuhan: 85, skor_kerjasama: 85,
    })]
    const h = nilaiKesiapanPihak(dokumen, evaluasi)
    expect(h[0].bolehBekerja).toBe(true)
    expect(h[0].alasan).toEqual([])
  })

  it('kecelakaan kerja menggugurkan meski SELURUH dokumennya lengkap', () => {
    const dokumen = nilaiKepatuhan([
      { id: 'd1', jenis: 'siujk', supplier_id: 's1', pihak_nama: 'PT Maju',
        berlaku_sampai: '2027-12-31', terverifikasi: true },
    ], HARI_INI).dokumen
    const evaluasi = [nilaiEvaluasiSubkon({
      id: 'e1', supplier_id: 's1', pihak_nama: 'PT Maju',
      skor_mutu: 90, skor_waktu: 90, skor_k3: 90,
      skor_kepatuhan: 90, skor_kerjasama: 90, jumlah_kecelakaan: 1,
    })]
    const h = nilaiKesiapanPihak(dokumen, evaluasi)
    expect(h[0].bolehBekerja).toBe(false)
    expect(h[0].alasan).toContain('1 kecelakaan kerja')
  })

  it('pihak yang BELUM PERNAH dinilai punya skor `null`, bukan 100', () => {
    // Nol pelanggaran yang sebenarnya nol pemeriksaan (cacat #4).
    const dokumen = nilaiKepatuhan([
      { id: 'd1', jenis: 'siujk', supplier_id: 's9', pihak_nama: 'PT Baru',
        berlaku_sampai: '2027-12-31', terverifikasi: true },
    ], HARI_INI).dokumen
    const h = nilaiKesiapanPihak(dokumen, [])
    expect(h[0].skorTerakhir).toBeNull()
  })

  it('pihak tanpa supplier_id dikelompokkan per NAMA, tak tercampur', () => {
    const dokumen = nilaiKepatuhan([
      { id: 'd1', jenis: 'siujk', supplier_id: null, pihak_nama: 'CV Alfa',
        berlaku_sampai: '2026-01-01', terverifikasi: true },
      { id: 'd2', jenis: 'siujk', supplier_id: null, pihak_nama: 'CV Beta',
        berlaku_sampai: '2027-01-01', terverifikasi: true },
    ], HARI_INI).dokumen
    const h = nilaiKesiapanPihak(dokumen, [])
    expect(h).toHaveLength(2)
    expect(h.find((p) => p.nama === 'CV Alfa')!.bolehBekerja).toBe(false)
    expect(h.find((p) => p.nama === 'CV Beta')!.bolehBekerja).toBe(true)
  })

  it('urutan: yang TAK BOLEH bekerja dulu, skor tertinggi lebih awal', () => {
    // Pihak berskor 89 yang terhalang satu dokumen kedaluwarsa adalah yang
    // PALING MUDAH dipulihkan — perbarui polisnya, ia bisa bekerja besok.
    // Yang berskor 44 dan masuk daftar hitam tak pulih dengan mengurus berkas.
    const dokumen = nilaiKepatuhan([
      { id: 'd1', jenis: 'asuransi_car', supplier_id: 'tinggi', pihak_nama: 'PT Tinggi',
        berlaku_sampai: '2026-01-01', terverifikasi: true },
      { id: 'd2', jenis: 'siujk', supplier_id: 'rendah', pihak_nama: 'PT Rendah',
        berlaku_sampai: '2026-01-01', terverifikasi: true },
      { id: 'd3', jenis: 'siujk', supplier_id: 'bersih', pihak_nama: 'PT Bersih',
        berlaku_sampai: '2028-01-01', terverifikasi: true },
    ], HARI_INI).dokumen

    const evaluasi = [
      nilaiEvaluasiSubkon({ id: 'e1', supplier_id: 'rendah', pihak_nama: 'PT Rendah',
        skor_mutu: 40, skor_waktu: 40, skor_k3: 40, skor_kepatuhan: 40, skor_kerjasama: 40 }),
      nilaiEvaluasiSubkon({ id: 'e2', supplier_id: 'tinggi', pihak_nama: 'PT Tinggi',
        skor_mutu: 90, skor_waktu: 90, skor_k3: 90, skor_kepatuhan: 90, skor_kerjasama: 90 }),
      nilaiEvaluasiSubkon({ id: 'e3', supplier_id: 'bersih', pihak_nama: 'PT Bersih',
        skor_mutu: 70, skor_waktu: 70, skor_k3: 70, skor_kepatuhan: 70, skor_kerjasama: 70 }),
    ]

    const h = nilaiKesiapanPihak(dokumen, evaluasi)
    expect(h.map((p) => p.nama)).toEqual(['PT Tinggi', 'PT Rendah', 'PT Bersih'])
    expect(h[2].bolehBekerja).toBe(true)
  })

  it('evaluasi TERBARU yang menentukan — yang membaik tak dihukum selamanya', () => {
    const evaluasi = [
      // Terbaru lebih dulu (urutan dari endpoint: periode DESC).
      nilaiEvaluasiSubkon({ id: 'baru', supplier_id: 's1', pihak_nama: 'PT A',
        skor_mutu: 90, skor_waktu: 90, skor_k3: 90, skor_kepatuhan: 90, skor_kerjasama: 90 }),
      nilaiEvaluasiSubkon({ id: 'lama', supplier_id: 's1', pihak_nama: 'PT A',
        skor_mutu: 30, skor_waktu: 30, skor_k3: 30, skor_kepatuhan: 30, skor_kerjasama: 30 }),
    ]
    const h = nilaiKesiapanPihak([], evaluasi)
    expect(h[0].skorTerakhir).toBe(90)
  })
})

describe('labelJenis', () => {
  it('mengubah kunci mentah jadi nama terbaca', () => {
    // Dipakai di alasan larangan yang ikut terkirim ke notifikasi & ekspor —
    // bukan cuma tampil di satu layar. Kalau pemetaannya hanya di layar,
    // konsumen lain menampilkan `ASURANSI_CAR` ber-garis-bawah.
    expect(labelJenis('asuransi_car')).toBe('Asuransi CAR')
    expect(labelJenis('bpjs_ketenagakerjaan')).toBe('BPJS Ketenagakerjaan')
    expect(labelJenis('siujk')).toBe('SIUJK')
  })

  it('jenis tak dikenal dikembalikan apa adanya, bukan kosong', () => {
    // Nama aneh lebih baik daripada sel kosong: yang membacanya tahu ada
    // sesuatu di sana yang perlu ditambahkan ke pemetaan.
    expect(labelJenis('jenis_baru_belum_dipetakan')).toBe('jenis_baru_belum_dipetakan')
  })
})
