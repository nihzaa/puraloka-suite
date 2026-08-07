import { describe, it, expect } from 'vitest'
import {
  nilaiPrakualifikasi, nilaiEvaluasi,
  BOBOT_EVALUASI, AMBANG_LEMAH,
} from '../vendor-penilaian.js'

// Tanggal acuan tetap. `hariIni` DIOPER, bukan `new Date()` di dalam fungsi —
// test yang bergantung pada jam berapa ia dijalankan akan hijau hari ini dan
// merah bulan depan, tanpa satu baris kode pun berubah.
const HARI_INI = '2026-08-07'

describe('nilaiPrakualifikasi', () => {
  it('skor berbobot, bukan rata-rata polos', () => {
    // legalitas 35% · keuangan 25% · teknis 25% · pengalaman 15%
    const h = nilaiPrakualifikasi({
      status: 'lolos',
      skor_legalitas: 100, skor_keuangan: 0, skor_teknis: 0, skor_pengalaman: 0,
    }, HARI_INI)
    // Rata-rata polos akan 25. Berbobot: 35.
    expect(h.skor).toBe(35)
  })

  // ── Cacat yang paling mudah luput ────────────────────────────────────────
  //
  // Status hijau, izin mati. Diukur pada data uji: satu vendor `lolos` dengan
  // SIUJK yang habis Maret 2026. Yang membacanya akan mengundangnya tender,
  // lalu penawarannya gugur di meja panitia.
  it('vendor LOLOS dengan dokumen kedaluwarsa TIDAK boleh diundang', () => {
    const h = nilaiPrakualifikasi({
      status: 'lolos',
      skor_legalitas: 90, skor_keuangan: 80, skor_teknis: 85, skor_pengalaman: 75,
      dokumen: [
        { jenis: 'nib', berlaku_sampai: null },
        { jenis: 'siujk', berlaku_sampai: '2026-03-31' },   // SUDAH LEWAT
      ],
    }, HARI_INI)

    expect(h.status).toBe('lolos')            // status tersimpan tak diubah
    expect(h.dokumenKedaluwarsa).toHaveLength(1)
    expect(h.peringatan).toContain('dokumen_kedaluwarsa')
    // Inilah yang menentukan: skor tinggi + status lolos, TAPI tak boleh diundang.
    expect(h.bolehDiundang).toBe(false)
  })

  it('dokumen tanpa masa berlaku (NIB, NPWP) tidak dianggap kedaluwarsa', () => {
    const h = nilaiPrakualifikasi({
      status: 'lolos',
      dokumen: [{ jenis: 'nib', berlaku_sampai: null }, { jenis: 'npwp' }],
    }, HARI_INI)
    expect(h.dokumenKedaluwarsa).toHaveLength(0)
    expect(h.bolehDiundang).toBe(true)
  })

  it('dokumen habis dalam 60 hari diperingatkan — masih bisa diurus', () => {
    const h = nilaiPrakualifikasi({
      status: 'lolos',
      dokumen: [{ jenis: 'sbu', berlaku_sampai: '2026-09-15' }],   // 39 hari lagi
    }, HARI_INI)
    expect(h.peringatan).toContain('dokumen_segera_habis')
    // Masih boleh diundang: peringatan memberi waktu, bukan menghalangi.
    expect(h.bolehDiundang).toBe(true)
  })

  it('peringatan KEDALUWARSA mengalahkan SEGERA HABIS — satu pesan, bukan dua', () => {
    const h = nilaiPrakualifikasi({
      status: 'lolos',
      dokumen: [
        { jenis: 'siujk', berlaku_sampai: '2026-03-31' },   // lewat
        { jenis: 'sbu', berlaku_sampai: '2026-09-15' },     // segera
      ],
    }, HARI_INI)
    expect(h.peringatan).toContain('dokumen_kedaluwarsa')
    // Menampilkan keduanya membuat yang mendesak tenggelam.
    expect(h.peringatan).not.toContain('dokumen_segera_habis')
  })

  it('prakualifikasi yang masa berlakunya lewat jadi `kedaluwarsa` sendiri', () => {
    const h = nilaiPrakualifikasi({
      status: 'lolos', berlaku_sampai: '2026-01-31',
    }, HARI_INI)
    // Status TERSIMPAN masih `lolos` — tak ada yang memperbaruinya. Status
    // efektiflah yang benar.
    expect(h.status).toBe('kedaluwarsa')
    expect(h.peringatan).toContain('prakualifikasi_kedaluwarsa')
    expect(h.bolehDiundang).toBe(false)
  })

  it('yang DITOLAK tak pernah boleh diundang, seberapa pun skornya', () => {
    const h = nilaiPrakualifikasi({
      status: 'ditolak',
      skor_legalitas: 100, skor_keuangan: 100, skor_teknis: 100, skor_pengalaman: 100,
    }, HARI_INI)
    expect(h.skor).toBe(100)
    expect(h.bolehDiundang).toBe(false)
  })
})

describe('nilaiEvaluasi', () => {
  it('bobot: mutu & waktu 30, harga 25, layanan 15', () => {
    expect(BOBOT_EVALUASI.mutu + BOBOT_EVALUASI.waktu +
           BOBOT_EVALUASI.harga + BOBOT_EVALUASI.layanan).toBe(100)

    const h = nilaiEvaluasi({ skor_mutu: 100, skor_waktu: 0, skor_harga: 0, skor_layanan: 0 })
    expect(h.skor).toBe(30)
  })

  // ── Cacat kedua: satu dimensi nol yang tenggelam di rata-rata ────────────
  it('dimensi di bawah ambang DINYATAKAN, tak tenggelam di rata-rata', () => {
    // Mutu sempurna, TAK PERNAH tepat waktu.
    const ekstrem = nilaiEvaluasi({
      skor_mutu: 100, skor_waktu: 0, skor_harga: 100, skor_layanan: 100 })
    // Serba-biasa.
    const rata = nilaiEvaluasi({
      skor_mutu: 75, skor_waktu: 75, skor_harga: 75, skor_layanan: 75 })

    // Rata-rata polos keduanya 75 — angka yang sama untuk dua vendor yang
    // sangat berbeda. Itulah alasan `titikLemah` ada.
    expect(ekstrem.rataPolos).toBe(75)
    expect(rata.rataPolos).toBe(75)

    expect(ekstrem.titikLemah).toEqual(['waktu'])
    expect(rata.titikLemah).toHaveLength(0)
    expect(ekstrem.peringatan).toContain('ada_titik_lemah')
  })

  it('ambang lemah dipakai apa adanya — tepat di ambang BUKAN lemah', () => {
    const h = nilaiEvaluasi({
      skor_mutu: AMBANG_LEMAH, skor_waktu: AMBANG_LEMAH - 1,
      skor_harga: 80, skor_layanan: 80 })
    expect(h.titikLemah).toEqual(['waktu'])
  })

  // ── Cacat ketiga: daftar hitam tenggelam di antara skor rendah ───────────
  it('daftar hitam mengalahkan skor berapa pun', () => {
    const h = nilaiEvaluasi({
      skor_mutu: 95, skor_waktu: 95, skor_harga: 95, skor_layanan: 95,
      masuk_daftar_hitam: true,
    })
    expect(h.skor).toBe(95)
    expect(h.peringatan).toContain('daftar_hitam')
    // Vendor 95 yang mengirim barang palsu tetap tak boleh dipakai.
    expect(h.bolehDipakai).toBe(false)
  })

  it('skor rendah TANPA daftar hitam masih boleh dipakai', () => {
    const h = nilaiEvaluasi({
      skor_mutu: 55, skor_waktu: 40, skor_harga: 85, skor_layanan: 60 })
    expect(h.bolehDipakai).toBe(true)
    // Tapi titik lemahnya tetap dinyatakan.
    expect(h.titikLemah).toContain('waktu')
  })

  it('string NUMERIC dihitung sebagai ANGKA, bukan digabung sebagai teks', () => {
    const h = nilaiEvaluasi({
      skor_mutu: '80', skor_waktu: '80', skor_harga: '80', skor_layanan: '80' })
    expect(h.skor).toBe(80)
    expect(h.rataPolos).toBe(80)
  })

  it('masukan tak terbaca jadi nol, bukan NaN yang menular', () => {
    const h = nilaiEvaluasi({
      skor_mutu: null, skor_waktu: undefined, skor_harga: '', skor_layanan: 'entah' })
    expect(Number.isFinite(h.skor)).toBe(true)
    expect(h.skor).toBe(0)
    expect(h.titikLemah).toHaveLength(4)
  })
})
