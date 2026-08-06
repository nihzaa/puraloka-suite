import { describe, it, expect } from 'vitest'
import { hitungIpc } from '../sertifikat-ipc.js'

// Nilai kontrak diambil dari data nyata: Rp 4,88 miliar tersebar di 15 proyek,
// terbesar ratusan juta. Angka bulat dipakai agar kesalahan urutan operasi
// terlihat sebagai selisih, bukan tenggelam dalam pembulatan.
const KONTRAK = 500_000_000

describe('hitungIpc', () => {
  it('nilai prestasi = kontrak × progres', () => {
    const h = hitungIpc({ nilai_kontrak: KONTRAK, progres_diakui_pct: 40 })
    expect(h.nilai_prestasi).toBe(200_000_000)
    expect(h.nilai_periode).toBe(200_000_000)
  })

  it('nilai periode dikurangi yang SUDAH ditagih sebelumnya', () => {
    const h = hitungIpc({
      nilai_kontrak: KONTRAK, progres_diakui_pct: 60,
      kumulatif_sebelumnya: 200_000_000,
    })
    expect(h.nilai_prestasi).toBe(300_000_000)
    expect(h.nilai_periode).toBe(100_000_000)
  })

  // ── Invarian utama ────────────────────────────────────────────────────────
  //
  // Retensi dari nilai PERIODE, bukan prestasi kumulatif.
  //
  // Kasus ini dipilih supaya kedua rumus memberi jawaban BERBEDA. Kalau
  // kumulatif dan periode kebetulan sama (IPC pertama), test-nya tak
  // membuktikan apa-apa — dan itu jebakan yang paling mudah dibuat.
  it('retensi dihitung dari nilai PERIODE, bukan prestasi kumulatif', () => {
    const h = hitungIpc({
      nilai_kontrak: KONTRAK,
      progres_diakui_pct: 60,          // prestasi 300jt
      kumulatif_sebelumnya: 200_000_000, // periode  100jt
      retensi_pct: 5,
    })
    expect(h.nilai_periode).toBe(100_000_000)
    // 5% dari PERIODE (100jt) = 5jt. Dari prestasi (300jt) = 15jt — tiga kali
    // lipat, dan tiap periode akan menahan ulang retensi yang sudah ditahan.
    expect(h.retensi).toBe(5_000_000)
    expect(h.nilai_bersih).toBe(95_000_000)
  })

  it('progres 100% TIDAK membuat retensi hilang', () => {
    const h = hitungIpc({
      nilai_kontrak: KONTRAK, progres_diakui_pct: 100, retensi_pct: 5,
    })
    expect(h.nilai_prestasi).toBe(500_000_000)
    expect(h.retensi).toBe(25_000_000)
    // Yang cair BUKAN seluruh nilai kontrak.
    expect(h.nilai_bersih).toBe(475_000_000)
    expect(h.peringatan).toContain('prestasi_penuh')
  })

  // ── NUMERIC datang sebagai string ────────────────────────────────────────
  //
  // `"500000000" + "0"` = `"5000000000"` — sepuluh kali lipat, dan tak ada
  // satu pun galat. Pada nilai rupiah, kesalahan ini hanya terlihat kalau
  // seseorang kebetulan memeriksa jumlah digitnya.
  it('string NUMERIC dihitung sebagai ANGKA, bukan digabung sebagai teks', () => {
    const h = hitungIpc({
      nilai_kontrak: '500000000',
      progres_diakui_pct: '60',
      kumulatif_sebelumnya: '200000000',
      retensi_pct: '5',
      potongan_dp: '10000000',
    })
    expect(h.nilai_prestasi).toBe(300_000_000)
    expect(h.nilai_periode).toBe(100_000_000)
    expect(h.retensi).toBe(5_000_000)
    expect(h.nilai_bersih).toBe(85_000_000)
  })

  // ── Yang menolak jadi kabar baik ─────────────────────────────────────────

  it('nilai periode NEGATIF ditandai, bukan dibulatkan ke nol', () => {
    const h = hitungIpc({
      nilai_kontrak: KONTRAK,
      progres_diakui_pct: 40,             // prestasi 200jt
      kumulatif_sebelumnya: 250_000_000,  // sudah ditagih LEBIH banyak
    })
    expect(h.nilai_periode).toBe(-50_000_000)
    expect(h.peringatan).toContain('periode_negatif')
    expect(h.layak_diajukan).toBe(false)
  })

  it('periode negatif MENGEMBALIKAN retensi, tidak menahannya lagi', () => {
    const h = hitungIpc({
      nilai_kontrak: KONTRAK,
      progres_diakui_pct: 40,
      kumulatif_sebelumnya: 250_000_000,
      retensi_pct: 5,
    })
    // Retensi ikut negatif: ia mengembalikan yang terlanjur ditahan atas
    // prestasi yang ternyata dikoreksi turun.
    expect(h.retensi).toBe(-2_500_000)
    expect(h.nilai_bersih).toBe(-47_500_000)
  })

  it('potongan melebihi hak tagih ditandai, bukan disembunyikan', () => {
    const h = hitungIpc({
      nilai_kontrak: KONTRAK,
      progres_diakui_pct: 22,           // prestasi 110jt
      kumulatif_sebelumnya: 100_000_000, // periode  10jt
      potongan_dp: 30_000_000,          // potongan JAUH melebihi
    })
    expect(h.nilai_periode).toBe(10_000_000)
    expect(h.nilai_bersih).toBe(-20_000_000)
    expect(h.peringatan).toContain('potongan_melebihi_hak')
    expect(h.layak_diajukan).toBe(false)
  })

  // Pada periode negatif, "potongan melebihi hak" adalah AKIBAT. Menampilkan
  // keduanya membuat sebab aslinya tenggelam di antara dua peringatan.
  it('periode negatif tidak ikut menyalakan peringatan potongan', () => {
    const h = hitungIpc({
      nilai_kontrak: KONTRAK,
      progres_diakui_pct: 40,
      kumulatif_sebelumnya: 250_000_000,
      potongan_dp: 5_000_000,
    })
    expect(h.peringatan).toContain('periode_negatif')
    expect(h.peringatan).not.toContain('potongan_melebihi_hak')
  })

  it('tak ada yang bisa ditagih saat prestasi sama dengan yang sudah ditagih', () => {
    const h = hitungIpc({
      nilai_kontrak: KONTRAK,
      progres_diakui_pct: 40,
      kumulatif_sebelumnya: 200_000_000,
    })
    expect(h.nilai_periode).toBe(0)
    expect(h.peringatan).toContain('tak_ada_yang_ditagih')
    expect(h.peringatan).not.toContain('periode_negatif')
    expect(h.layak_diajukan).toBe(false)
  })

  it('potongan lain-lain ikut mengurangi nilai bersih', () => {
    const h = hitungIpc({
      nilai_kontrak: KONTRAK, progres_diakui_pct: 40,
      retensi_pct: 5, potongan_dp: 20_000_000, potongan_lain: 5_000_000,
    })
    expect(h.nilai_prestasi).toBe(200_000_000)
    expect(h.retensi).toBe(10_000_000)
    expect(h.nilai_bersih).toBe(165_000_000)
  })

  it('progres nol tidak menghasilkan NaN maupun nilai negatif palsu', () => {
    const h = hitungIpc({ nilai_kontrak: KONTRAK, progres_diakui_pct: 0, retensi_pct: 5 })
    expect(h.nilai_prestasi).toBe(0)
    expect(h.nilai_periode).toBe(0)
    expect(h.retensi).toBe(0)
    expect(h.nilai_bersih).toBe(0)
    expect(h.layak_diajukan).toBe(false)
  })

  it('masukan tak terbaca diperlakukan nol, bukan NaN yang menular', () => {
    const h = hitungIpc({
      nilai_kontrak: KONTRAK, progres_diakui_pct: 40,
      retensi_pct: null, kumulatif_sebelumnya: undefined,
      potongan_dp: '', potongan_lain: 'entah',
    })
    expect(Number.isFinite(h.nilai_bersih)).toBe(true)
    expect(h.nilai_bersih).toBe(200_000_000)
  })

  it('layak_diajukan hanya saat periode DAN bersih sama-sama positif', () => {
    expect(hitungIpc({ nilai_kontrak: KONTRAK, progres_diakui_pct: 40 }).layak_diajukan).toBe(true)
    // Periode positif tapi habis oleh potongan — tidak layak.
    expect(hitungIpc({
      nilai_kontrak: KONTRAK, progres_diakui_pct: 40, potongan_dp: 200_000_000,
    }).layak_diajukan).toBe(false)
  })

  it('retensi kumulatif estimasi dihitung dari prestasi, bukan periode', () => {
    const h = hitungIpc({
      nilai_kontrak: KONTRAK, progres_diakui_pct: 60,
      kumulatif_sebelumnya: 200_000_000, retensi_pct: 5,
    })
    // Periode 100jt → retensi periode 5jt; tapi TOTAL yang tertahan atas
    // prestasi 300jt adalah 15jt. Keduanya angka berbeda dengan guna berbeda.
    expect(h.retensi).toBe(5_000_000)
    expect(h.retensi_kumulatif_estimasi).toBe(15_000_000)
  })
})
