import { describe, it, expect } from 'vitest'
import {
  buatKalender, hitungCpm, histogramSumberDaya, menutupLingkaran, POLA_BAKU,
} from '../cpm.js'

/** Kalender polos: Senin–Sabtu kerja, Minggu libur, tanpa hari libur. */
const KAL = buatKalender(POLA_BAKU, [])

describe('buatKalender', () => {
  it('Minggu bukan hari kerja, Sabtu iya (pola konstruksi Indonesia)', () => {
    expect(KAL.hariKerja('2026-08-09')).toBe(false)   // Minggu
    expect(KAL.hariKerja('2026-08-08')).toBe(true)    // Sabtu
    expect(KAL.hariKerja('2026-08-10')).toBe(true)    // Senin
  })

  // ── Cacat #1: durasi dari hari KALENDER ─────────────────────────────────
  it('hari libur DIKELUARKAN — inilah selisih yang jadi sengketa denda', () => {
    const k = buatKalender(POLA_BAKU, [
      { tanggal: '2026-08-17', nama: 'HUT RI' } as never,
    ])
    expect(k.hariKerja('2026-08-17')).toBe(false)

    // Pekerjaan 12 hari kerja dari Senin 10 Agustus (ke-0 = 10 Agustus).
    //
    //   dengan HUT RI dikeluarkan : Senin 24 Agustus
    //   tanpa dikeluarkan         : Sabtu 22 — dua hari lebih awal
    //   sebagai hari KALENDER     : Jumat 21 — TIGA hari lebih awal
    //
    // Selisih terakhir itulah yang jadi sengketa denda keterlambatan, dan
    // pihak yang menghitung dengan hari kalender selalu yang membayar.
    expect(k.majuHariKerja('2026-08-10', 11)).toBe('2026-08-24')
    expect(KAL.majuHariKerja('2026-08-10', 11)).toBe('2026-08-22')
    expect(k.majuHariKerja('2026-08-10', 11)).not.toBe('2026-08-21')
  })

  it('libur ber-`tetap_bekerja` TETAP hari kerja — jejaknya saja yang disimpan', () => {
    const k = buatKalender(POLA_BAKU, [
      { tanggal: '2026-08-17', nama: 'HUT RI', tetap_bekerja: true } as never,
    ])
    // Jadwalnya berjalan; yang berbeda tarif upahnya, dan itu urusan modul lain.
    expect(k.hariKerja('2026-08-17')).toBe(true)
  })

  it('mulai pada hari libur digeser ke hari kerja berikutnya, bukan dipakai', () => {
    // Minggu 9 Agustus → n=0 berarti "hari kerja pertama pada/sesudahnya".
    expect(KAL.majuHariKerja('2026-08-09', 0)).toBe('2026-08-10')
  })

  it('menghitung hari kerja inklusif', () => {
    // Sen 10 … Sab 15 = 6 hari kerja (Minggu 9 & 16 di luar).
    expect(KAL.hitungHariKerja('2026-08-10', '2026-08-15')).toBe(6)
    // Termasuk satu Minggu di tengah: Sen 10 … Sen 17 = 7 kerja.
    expect(KAL.hitungHariKerja('2026-08-10', '2026-08-17')).toBe(7)
  })

  it('rentang terbalik menghasilkan 0, bukan angka negatif', () => {
    expect(KAL.hitungHariKerja('2026-08-15', '2026-08-10')).toBe(0)
  })

  it('pola TANPA hari kerja tak membuat perhitungan berputar selamanya', () => {
    const mati = buatKalender({
      senin: false, selasa: false, rabu: false, kamis: false,
      jumat: false, sabtu: false, minggu: false,
    }, [])
    // Yang penting: fungsinya KEMBALI. Nilai apa pun lebih baik daripada
    // proses yang menggantung tanpa gejala.
    expect(mati.majuHariKerja('2026-08-10', 5)).toBe('2026-08-10')
    expect(mati.hitungHariKerja('2026-08-10', '2026-12-31')).toBe(0)
  })
})

describe('hitungCpm', () => {
  const KERJA = [
    { id: 'A', title: 'Galian', durasi_hari: 5 },
    { id: 'B', title: 'Pondasi', durasi_hari: 10 },
    { id: 'C', title: 'Pagar sementara', durasi_hari: 2 },
    { id: 'D', title: 'Struktur', durasi_hari: 8 },
  ]
  const DEP = [
    { milestone_id: 'B', bergantung_pada: 'A', jenis: 'FS' as const },
    { milestone_id: 'D', bergantung_pada: 'B', jenis: 'FS' as const },
  ]

  it('jalur kritis = rantai terpanjang; yang di luar punya float', () => {
    const h = hitungCpm(KERJA, DEP, KAL, '2026-08-10')
    expect(h.lingkaran).toEqual([])
    expect(h.jalurKritis).toEqual(['A', 'B', 'D'])

    const c = h.pekerjaan.find((p) => p.id === 'C')!
    // C tak bergantung apa pun dan cuma 2 hari — ia punya kelonggaran besar.
    expect(c.kritis).toBe(false)
    expect(c.float).toBeGreaterThan(0)
  })

  it('tanggal dihitung lewat KALENDER, bukan hari kalender', () => {
    const h = hitungCpm(KERJA, DEP, KAL, '2026-08-10')
    const a = h.pekerjaan.find((p) => p.id === 'A')!
    expect(a.mulaiPalingAwal).toBe('2026-08-10')     // Senin
    // 5 hari kerja: Sen 10, Sel 11, Rab 12, Kam 13, Jum 14.
    expect(a.selesaiPalingAwal).toBe('2026-08-14')

    const b = h.pekerjaan.find((p) => p.id === 'B')!
    // Mulai hari kerja BERIKUTNYA = Sabtu 15 (bukan Minggu 16).
    expect(b.mulaiPalingAwal).toBe('2026-08-15')
  })

  it('jeda (lag) menggeser penerusnya — curing beton 28 hari', () => {
    const h = hitungCpm(
      [{ id: 'X', durasi_hari: 1 }, { id: 'Y', durasi_hari: 1 }],
      [{ milestone_id: 'Y', bergantung_pada: 'X', jenis: 'FS', jeda_hari: 6 }],
      KAL, '2026-08-10')
    const y = h.pekerjaan.find((p) => p.id === 'Y')!
    // X selesai Sen 10; +1 hari kerja +6 jeda = 7 hari kerja sesudahnya.
    expect(y.mulaiPalingAwal).toBe('2026-08-18')
  })

  it('relasi SS: penerus menunggu pendahulu MULAI, bukan selesai', () => {
    const h = hitungCpm(
      [{ id: 'X', durasi_hari: 20 }, { id: 'Y', durasi_hari: 3 }],
      [{ milestone_id: 'Y', bergantung_pada: 'X', jenis: 'SS', jeda_hari: 2 }],
      KAL, '2026-08-10')
    const y = h.pekerjaan.find((p) => p.id === 'Y')!
    // Kalau salah dibaca sebagai FS, Y mulai sesudah 20 hari — bukan 2.
    expect(y.mulaiPalingAwal).toBe('2026-08-12')
  })

  // ── Cacat #2: lingkaran dependensi ──────────────────────────────────────
  it('LINGKARAN dinyatakan, bukan disajikan sebagai jadwal setengah jadi', () => {
    const h = hitungCpm(
      [{ id: 'A', durasi_hari: 3 }, { id: 'B', durasi_hari: 3 }, { id: 'C', durasi_hari: 3 }],
      [
        { milestone_id: 'B', bergantung_pada: 'A' },
        { milestone_id: 'C', bergantung_pada: 'B' },
        { milestone_id: 'A', bergantung_pada: 'C' },   // menutup lingkaran
      ],
      KAL, '2026-08-10')

    expect(h.lingkaran.sort()).toEqual(['A', 'B', 'C'])
    // Jalur kritis dari jaringan berlingkaran adalah jawaban atas pertanyaan
    // yang tak punya jawaban. Kosong, bukan dikarang.
    expect(h.jalurKritis).toEqual([])
    // Dan float-nya `null`, bukan 0 — 0 akan terbaca "kritis".
    for (const p of h.pekerjaan) expect(p.float).toBeNull()
  })

  it('lingkaran SEBAGIAN: yang di luar tetap terhitung, yang di dalam tidak', () => {
    const h = hitungCpm(
      [{ id: 'OK', durasi_hari: 4 }, { id: 'A', durasi_hari: 3 }, { id: 'B', durasi_hari: 3 }],
      [
        { milestone_id: 'B', bergantung_pada: 'A' },
        { milestone_id: 'A', bergantung_pada: 'B' },
      ],
      KAL, '2026-08-10')

    expect(h.lingkaran.sort()).toEqual(['A', 'B'])
    const ok = h.pekerjaan.find((p) => p.id === 'OK')!
    expect(ok.mulaiPalingAwal).toBe('2026-08-10')
    expect(ok.float).not.toBeNull()
  })

  // ── Cacat #3: float tanpa batas akhir proyek ────────────────────────────
  it('batas akhir kontraktual memberi float pada SELURUH jalur, bukan nol', () => {
    const tanpaBatas = hitungCpm(KERJA, DEP, KAL, '2026-08-10')
    const denganBatas = hitungCpm(KERJA, DEP, KAL, '2026-08-10', '2026-12-31')

    const aTanpa = tanpaBatas.pekerjaan.find((p) => p.id === 'A')!
    const aDengan = denganBatas.pekerjaan.find((p) => p.id === 'A')!

    // Tanpa batas: A kritis karena ia di jalur terpanjang.
    expect(aTanpa.kritis).toBe(true)
    // Dengan batas Desember: proyeknya punya berbulan-bulan cadangan, jadi
    // TAK ADA yang benar-benar kritis. Menyebut A "kritis" di sini akan
    // menenggelamkan pekerjaan yang nanti benar-benar kritis.
    expect(aDengan.kritis).toBe(false)
    expect(aDengan.float!).toBeGreaterThan(50)
  })

  // ── Cacat kelima, ketahuan saat menjalankan atas DATA NYATA ─────────────
  it('proyek TELAT melaporkan seberapa telat, bukan "-1" untuk semua', () => {
    // Pekerjaan 40 hari kerja, batas akhir cuma ~11 hari kerja lagi.
    const h = hitungCpm(
      [{ id: 'A', durasi_hari: 40 }], [], KAL, '2026-08-10', '2026-08-22')
    const a = h.pekerjaan[0]

    // Rumus lama menghasilkan -1: `hitungHariKerja` mengembalikan 0 untuk
    // rentang terbalik, jadi proyek yang telat LIMA MINGGU terbaca "telat
    // sehari" — dan tak ada yang panik.
    expect(a.float).toBeLessThan(-20)
    expect(a.float).not.toBe(-1)
  })

  it('proyek TELAT tetap punya jalur kritis — bukan layar kosong saat paling genting', () => {
    const h = hitungCpm(
      [{ id: 'A', durasi_hari: 20 }, { id: 'B', durasi_hari: 20 }],
      [{ milestone_id: 'B', bergantung_pada: 'A' }],
      KAL, '2026-08-10', '2026-08-22')

    // Semua float negatif → tak ada yang tepat nol. Kalau "kritis" berarti
    // `=== 0`, jalur kritisnya kosong justru pada proyek yang paling genting,
    // dan layarnya terlihat paling tenang saat keadaannya paling buruk.
    expect(h.pekerjaan.every((p) => p.float! < 0)).toBe(true)
    expect(h.jalurKritis).toEqual(['A', 'B'])
  })

  it('float negatif SEBANDING dengan besarnya keterlambatan', () => {
    const telatSedikit = hitungCpm(
      [{ id: 'A', durasi_hari: 15 }], [], KAL, '2026-08-10', '2026-08-22')
    const telatBanyak = hitungCpm(
      [{ id: 'A', durasi_hari: 60 }], [], KAL, '2026-08-10', '2026-08-22')

    // Yang telat lebih parah harus punya float LEBIH negatif. Kalau keduanya
    // -1, layar tak bisa membedakan "geser sedikit" dari "renegosiasi kontrak".
    expect(telatBanyak.pekerjaan[0].float!)
      .toBeLessThan(telatSedikit.pekerjaan[0].float!)
  })

  it('pekerjaan TANPA durasi dinyatakan, tak diam-diam dianggap nol hari', () => {
    const h = hitungCpm(
      [{ id: 'A', durasi_hari: 5 }, { id: 'B', durasi_hari: null }],
      [], KAL, '2026-08-10')
    expect(h.tanpaDurasi).toEqual(['B'])
  })

  it('dependensi ke milestone yang sudah hilang DIABAIKAN, bukan bikin mulai lebih awal', () => {
    const h = hitungCpm(
      [{ id: 'A', durasi_hari: 5 }],
      [{ milestone_id: 'A', bergantung_pada: 'SUDAH-DIHAPUS' }],
      KAL, '2026-08-10')
    // Tak melempar, dan A tetap terjadwal.
    expect(h.pekerjaan[0].mulaiPalingAwal).toBe('2026-08-10')
    expect(h.lingkaran).toEqual([])
  })

  it('jaringan kosong tak melempar', () => {
    const h = hitungCpm([], [], KAL, '2026-08-10')
    expect(h.pekerjaan).toEqual([])
    expect(h.selesaiProyek).toBeNull()
    expect(h.jalurKritis).toEqual([])
  })
})

describe('menutupLingkaran', () => {
  // Dipanggil SEBELUM dependensi disimpan. Constraint SQL hanya menutup
  // lingkaran panjang-1; yang lebih panjang harus tertangkap di sini, dan
  // gejalanya kalau lolos bukan pesan galat — melainkan seluruh jadwal
  // berhenti bisa dihitung.
  const RANTAI = [
    { milestone_id: 'B', bergantung_pada: 'A' },
    { milestone_id: 'C', bergantung_pada: 'B' },
  ]

  it('menutup rantai A→B→C dengan C←A adalah LINGKARAN', () => {
    // Menambah "A menunggu C" melengkapi A→B→C→A.
    expect(menutupLingkaran(RANTAI, 'A', 'C')).toBe(true)
  })

  it('menambah D menunggu C bukan lingkaran', () => {
    expect(menutupLingkaran(RANTAI, 'D', 'C')).toBe(false)
  })

  it('menunggu DIRI SENDIRI adalah lingkaran terpendek', () => {
    expect(menutupLingkaran([], 'A', 'A')).toBe(true)
  })

  it('lingkaran PANJANG tetap tertangkap — bukan cuma tetangga langsung', () => {
    const panjang = [
      { milestone_id: 'B', bergantung_pada: 'A' },
      { milestone_id: 'C', bergantung_pada: 'B' },
      { milestone_id: 'D', bergantung_pada: 'C' },
      { milestone_id: 'E', bergantung_pada: 'D' },
    ]
    expect(menutupLingkaran(panjang, 'A', 'E')).toBe(true)
    expect(menutupLingkaran(panjang, 'A', 'B')).toBe(true)
  })

  it('jaringan yang SUDAH melingkar tak membuat pemeriksaan berputar selamanya', () => {
    // Kalau `dilihat` dilupakan, ini menggantung tanpa gejala apa pun.
    const rusak = [
      { milestone_id: 'B', bergantung_pada: 'A' },
      { milestone_id: 'A', bergantung_pada: 'B' },
    ]
    expect(menutupLingkaran(rusak, 'Z', 'A')).toBe(false)
  })

  it('cabang paralel tak dianggap lingkaran', () => {
    // A→B, A→C. Menambah "C menunggu B" sah: keduanya turunan A.
    const cabang = [
      { milestone_id: 'B', bergantung_pada: 'A' },
      { milestone_id: 'C', bergantung_pada: 'A' },
    ]
    expect(menutupLingkaran(cabang, 'C', 'B')).toBe(false)
    // Tapi "A menunggu B" melingkar.
    expect(menutupLingkaran(cabang, 'A', 'B')).toBe(true)
  })

  it('jaringan kosong: apa pun boleh kecuali diri sendiri', () => {
    expect(menutupLingkaran([], 'A', 'B')).toBe(false)
  })
})

describe('histogramSumberDaya', () => {
  const JADWAL = [
    { id: 'A', nama: 'Galian', durasi: 5, mulaiPalingAwal: '2026-08-10',
      selesaiPalingAwal: '2026-08-14', mulaiPalingLambat: null,
      selesaiPalingLambat: null, float: 0, kritis: true },
    { id: 'B', nama: 'Pondasi', durasi: 5, mulaiPalingAwal: '2026-08-10',
      selesaiPalingAwal: '2026-08-14', mulaiPalingLambat: null,
      selesaiPalingLambat: null, float: 0, kritis: true },
    { id: 'C', nama: 'Finishing', durasi: 5, mulaiPalingAwal: '2026-08-24',
      selesaiPalingAwal: '2026-08-28', mulaiPalingLambat: null,
      selesaiPalingLambat: null, float: 0, kritis: true },
  ]

  // ── Cacat #4: puncak yang tenggelam di rata-rata ────────────────────────
  it('PUNCAK dilaporkan, bukan rata-rata yang tak pernah terjadi', () => {
    const h = histogramSumberDaya([
      { milestone_id: 'A', jenis: 'tenaga', nama: 'Tukang', kuantitas: 25, tersedia: 25 },
      { milestone_id: 'B', jenis: 'tenaga', nama: 'Tukang', kuantitas: 15, tersedia: 25 },
      { milestone_id: 'C', jenis: 'tenaga', nama: 'Tukang', kuantitas: 4, tersedia: 25 },
    ], JADWAL)

    const t = h.find((x) => x.nama === 'Tukang')!
    // A dan B berjalan SERENTAK di minggu yang sama → 40 orang.
    expect(t.puncak).toBe(40)
    expect(t.mingguPuncak).toBe('2026-08-10')
    // Rata-ratanya 22 — angka yang tak pernah terjadi, dan yang
    // menyembunyikan kekurangan 15 orang.
    expect(t.puncak).not.toBe(22)
  })

  it('minggu kelebihan beban ditandai — itu yang butuh leveling', () => {
    const h = histogramSumberDaya([
      { milestone_id: 'A', jenis: 'tenaga', nama: 'Tukang', kuantitas: 25, tersedia: 25 },
      { milestone_id: 'B', jenis: 'tenaga', nama: 'Tukang', kuantitas: 15, tersedia: 25 },
      { milestone_id: 'C', jenis: 'tenaga', nama: 'Tukang', kuantitas: 4, tersedia: 25 },
    ], JADWAL)

    const t = h.find((x) => x.nama === 'Tukang')!
    expect(t.mingguKelebihan).toEqual(['2026-08-10'])
    const puncak = t.periode.find((p) => p.minggu === '2026-08-10')!
    expect(puncak.kelebihan).toBe(15)     // 40 dibutuhkan, 25 tersedia
  })

  it('kuantitas SERENTAK, bukan orang-hari', () => {
    const h = histogramSumberDaya(
      [{ milestone_id: 'A', jenis: 'tenaga', nama: 'Tukang', kuantitas: 10 }],
      JADWAL)
    // 10 tukang selama 5 hari = 10, bukan 50. Kalau dijumlah sebagai
    // orang-hari, histogramnya tak bisa dibandingkan dengan jumlah tenaga
    // yang benar-benar ada.
    expect(h[0].puncak).toBe(10)
  })

  it('tanpa batas `tersedia`, kelebihan 0 — bukan menuduh kelebihan beban', () => {
    const h = histogramSumberDaya(
      [{ milestone_id: 'A', jenis: 'alat', nama: 'Excavator', kuantitas: 3 }],
      JADWAL)
    expect(h[0].tersedia).toBeNull()
    expect(h[0].mingguKelebihan).toEqual([])
  })

  it('kebutuhan atas pekerjaan yang tak terjadwal DILEWATI, tak melempar', () => {
    const h = histogramSumberDaya(
      [{ milestone_id: 'TIDAK-ADA', jenis: 'tenaga', nama: 'Tukang', kuantitas: 5 }],
      JADWAL)
    expect(h).toEqual([])
  })

  it('pekerjaan lintas-minggu muncul di SETIAP minggu yang disentuhnya', () => {
    const h = histogramSumberDaya(
      [{ milestone_id: 'L', jenis: 'tenaga', nama: 'Tukang', kuantitas: 8 }],
      [{ id: 'L', nama: 'Panjang', durasi: 15, mulaiPalingAwal: '2026-08-10',
         selesaiPalingAwal: '2026-08-26', mulaiPalingLambat: null,
         selesaiPalingLambat: null, float: 0, kritis: true }])
    expect(h[0].periode.map((p) => p.minggu))
      .toEqual(['2026-08-10', '2026-08-17', '2026-08-24'])
    expect(h[0].puncak).toBe(8)
  })
})
