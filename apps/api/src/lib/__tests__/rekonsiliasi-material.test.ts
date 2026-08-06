import { describe, it, expect } from 'vitest'
import {
  hitungRekonsiliasi,
  AMBANG_SUSUT_PCT,
  type BarisTeoritis,
} from '../rekonsiliasi-material.js'

// ═════════════════════════════════════════════════════════════════════════════
// REKONSILIASI MATERIAL — angka yang MENUDUH ORANG.
//
// "Susut 12%" pada proyek yang sebenarnya normal membuat mandor dicurigai
// tanpa dasar. "Susut 0%" pada proyek yang bocor membuat kebocoran berlanjut.
// Keduanya mahal, dan keduanya TIDAK akan melempar error — hanya menghasilkan
// angka yang terlihat masuk akal.
//
// Karena itu yang diuji di sini bukan "fungsinya jalan", melainkan setiap
// jalan di mana angkanya bisa salah tanpa gejala.
// ═════════════════════════════════════════════════════════════════════════════

const SEMEN: BarisTeoritis = {
  material_id: 'm-semen', material_name: 'Semen PC 50kg', unit: 'sak', rab_quantity: 100,
}

describe('hitungRekonsiliasi — dasar', () => {
  it('dibeli = dipakai + sisa → selisih nol, status wajar', () => {
    const r = hitungRekonsiliasi(
      [SEMEN],
      [{ material_id: 'm-semen', qty_received: 100 }],
      [{ material_id: 'm-semen', qty: 80 }],
      [{ material_id: 'm-semen', qty_on_hand: 20 }],
    )
    expect(r.baris).toHaveLength(1)
    expect(r.baris[0].selisih).toBe(0)
    expect(r.baris[0].susut_pct).toBe(0)
    expect(r.baris[0].status).toBe('wajar')
  })

  it('material hilang terdeteksi sebagai selisih positif', () => {
    // 100 dibeli, 80 dipakai, 12 di gudang → 8 sak hilang.
    const r = hitungRekonsiliasi(
      [SEMEN],
      [{ material_id: 'm-semen', qty_received: 100 }],
      [{ material_id: 'm-semen', qty: 80 }],
      [{ material_id: 'm-semen', qty_on_hand: 12 }],
    )
    expect(r.baris[0].selisih).toBe(8)
    expect(r.baris[0].susut_pct).toBe(8)
    expect(r.baris[0].status).toBe('susut_tinggi')
  })

  it('susut TEPAT di ambang masih wajar; sedikit di atasnya tidak', () => {
    // Batas keputusan harus tegas — "kira-kira 5%" membuat dua proyek dengan
    // angka yang sama dinilai berbeda tergantung pembulatan.
    const diAmbang = hitungRekonsiliasi(
      [SEMEN],
      [{ material_id: 'm-semen', qty_received: 100 }],
      [{ material_id: 'm-semen', qty: 95 }],
      [{ material_id: 'm-semen', qty_on_hand: 0 }],
    )
    expect(diAmbang.baris[0].susut_pct).toBe(AMBANG_SUSUT_PCT)
    expect(diAmbang.baris[0].status).toBe('wajar')

    const lewat = hitungRekonsiliasi(
      [SEMEN],
      [{ material_id: 'm-semen', qty_received: 100 }],
      [{ material_id: 'm-semen', qty: 94.9 }],
      [{ material_id: 'm-semen', qty_on_hand: 0 }],
    )
    expect(lewat.baris[0].status).toBe('susut_tinggi')
  })
})

describe('hitungRekonsiliasi — jalan di mana angkanya bisa salah diam-diam', () => {
  it('NUMERIC Postgres berupa STRING dijumlahkan, bukan digabung', () => {
    // Driver ini mengirim numeric sebagai string. `"50" + "50"` menjadi
    // `"5050"` — dan 5050 sak semen akan tampil sebagai angka yang masuk akal
    // di layar tanpa satu pun galat.
    const r = hitungRekonsiliasi(
      [{ material_id: 'm-semen', rab_quantity: '100' }],
      [{ material_id: 'm-semen', qty_received: '50' }, { material_id: 'm-semen', qty_received: '50' }],
      [{ material_id: 'm-semen', qty: '80' }],
      [{ material_id: 'm-semen', qty_on_hand: '20' }],
    )
    expect(r.baris[0].dibeli).toBe(100)
    expect(r.baris[0].selisih).toBe(0)
  })

  it('beberapa baris untuk material sama dijumlahkan dulu, baru dibandingkan', () => {
    // Tiga penerimaan barang untuk material yang sama harus menjadi satu
    // baris. Membandingkan per-penerimaan akan melaporkan tiga "susut" palsu.
    const r = hitungRekonsiliasi(
      [SEMEN],
      [
        { material_id: 'm-semen', qty_received: 40 },
        { material_id: 'm-semen', qty_received: 30 },
        { material_id: 'm-semen', qty_received: 30 },
      ],
      [{ material_id: 'm-semen', qty: 60 }, { material_id: 'm-semen', qty: 40 }],
      [],
    )
    expect(r.baris).toHaveLength(1)
    expect(r.baris[0].dibeli).toBe(100)
    expect(r.baris[0].dipakai).toBe(100)
    expect(r.baris[0].selisih).toBe(0)
  })

  it('dipakai + sisa MELEBIHI dibeli → belum_lengkap, BUKAN susut negatif', () => {
    // Mustahil secara fisik memakai lebih dari yang dibeli. Yang salah
    // pencatatannya (mis. stok awal tak dicatat), dan "susut −20%" akan
    // terbaca sebagai kabar baik.
    const r = hitungRekonsiliasi(
      [SEMEN],
      [{ material_id: 'm-semen', qty_received: 100 }],
      [{ material_id: 'm-semen', qty: 110 }],
      [{ material_id: 'm-semen', qty_on_hand: 10 }],
    )
    expect(r.baris[0].selisih).toBe(-20)
    expect(r.baris[0].status).toBe('belum_lengkap')
    expect(r.baris[0].status).not.toBe('wajar')
  })

  it('belum ada pembelian → susut_pct null, bukan 0 dan bukan Infinity', () => {
    // 0 terbaca "tak ada susut" (kabar baik palsu); Infinity/NaN mengalir ke
    // layar sebagai teks yang tak berarti.
    const r = hitungRekonsiliasi(
      [SEMEN], [], [], [],
    )
    expect(r.baris[0].susut_pct).toBeNull()
    expect(r.susut_pct_keseluruhan).toBeNull()
  })

  it('material DIBELI tapi tak ada di RAB tetap masuk laporan', () => {
    // Justru yang paling perlu dilihat: pembelian di luar rencana. Menyaring
    // yang tak ada di RAB membuat laporan ini hanya memeriksa yang sudah
    // direncanakan — dan kebocoran jarang terjadi pada yang direncanakan.
    const r = hitungRekonsiliasi(
      [SEMEN],
      [{ material_id: 'm-liar', qty_received: 50 }],
      [],
      [],
    )
    const liar = r.baris.find((b) => b.material_id === 'm-liar')
    expect(liar).toBeDefined()
    expect(liar!.teoritis).toBe(0)
    expect(liar!.dibeli).toBe(50)
  })

  it('pemakaian bertanda NEGATIF dihitung sebagai pemakaian, bukan penambahan', () => {
    // `procurement.ts` menulis `movement_qty = -qty` untuk `usage` — barang
    // keluar dicatat sebagai pengurangan stok.
    //
    // Tanpa `Math.abs`, 100 dibeli − (−80) − 20 = 160: seolah 160 unit
    // hilang dari 100 yang dibeli. Angka mustahil yang tetap tampil rapi
    // di layar sebagai "susut 160%".
    const r = hitungRekonsiliasi(
      [SEMEN],
      [{ material_id: 'm-semen', qty_received: 100 }],
      [{ material_id: 'm-semen', qty: -80 }],
      [{ material_id: 'm-semen', qty_on_hand: 20 }],
    )
    expect(r.baris[0].dipakai).toBe(80)
    expect(r.baris[0].selisih).toBe(0)
    expect(r.baris[0].status).toBe('wajar')
  })

  it('data bertanda CAMPUR dijumlahkan konsisten', () => {
    // Diukur di basis dev: `usage` berkisar −115 sampai +80 — baris lama
    // ditulis sebelum konvensi tandanya ditetapkan. Negasi (`-qty`) akan
    // mengubah baris positif menjadi pemakaian negatif; `Math.abs` tidak.
    const r = hitungRekonsiliasi(
      [SEMEN],
      [{ material_id: 'm-semen', qty_received: 100 }],
      [{ material_id: 'm-semen', qty: -50 }, { material_id: 'm-semen', qty: 30 }],
      [{ material_id: 'm-semen', qty_on_hand: 20 }],
    )
    expect(r.baris[0].dipakai).toBe(80)
    expect(r.baris[0].selisih).toBe(0)
  })

  it('nilai null/undefined tak membuat NaN mengalir ke total', () => {
    const r = hitungRekonsiliasi(
      [SEMEN],
      [{ material_id: 'm-semen', qty_received: null }],
      [{ material_id: 'm-semen', qty: undefined as unknown as null }],
      [{ material_id: 'm-semen', qty_on_hand: null }],
    )
    expect(Number.isNaN(r.total_dibeli)).toBe(false)
    expect(Number.isNaN(r.total_selisih)).toBe(false)
    expect(r.total_dibeli).toBe(0)
  })
})

describe('hitungRekonsiliasi — total & urutan', () => {
  it('susut keseluruhan TERTIMBANG, bukan rata-rata persen per baris', () => {
    // Satu material kecil yang susut 90% tak boleh menenggelamkan seratus
    // material besar yang wajar. Rata-rata persen: (90 + 0) / 2 = 45%.
    // Tertimbang: 9 / 1009 ≈ 0,89%.
    const r = hitungRekonsiliasi(
      [],
      [{ material_id: 'kecil', qty_received: 10 }, { material_id: 'besar', qty_received: 999 }],
      [{ material_id: 'kecil', qty: 1 }, { material_id: 'besar', qty: 999 }],
      [],
    )
    expect(r.susut_pct_keseluruhan).toBeCloseTo(0.89, 1)
    expect(r.susut_pct_keseluruhan).toBeLessThan(5)
  })

  it('yang bermasalah muncul lebih dulu', () => {
    // Laporan yang mengubur temuan di baris ke-40 sama saja dengan tak punya
    // laporan.
    const r = hitungRekonsiliasi(
      [
        { material_id: 'a', material_name: 'Aman', rab_quantity: 100 },
        { material_id: 'z', material_name: 'Zebra bocor', rab_quantity: 100 },
      ],
      [{ material_id: 'a', qty_received: 100 }, { material_id: 'z', qty_received: 100 }],
      [{ material_id: 'a', qty: 100 }, { material_id: 'z', qty: 50 }],
      [],
    )
    // 'Zebra bocor' menang atas 'Aman' meski urutan abjadnya belakangan.
    expect(r.baris[0].material_id).toBe('z')
    expect(r.baris[0].status).toBe('susut_tinggi')
    expect(r.jumlah_susut_tinggi).toBe(1)
  })

  it('ambang bisa ditimpa per pemanggilan', () => {
    // Keramik dan besi beton punya susut wajar yang berbeda jauh; satu angka
    // untuk semuanya akan menuduh yang salah.
    const teoritis = [SEMEN]
    const dibeli = [{ material_id: 'm-semen', qty_received: 100 }]
    const dipakai = [{ material_id: 'm-semen', qty: 92 }]

    expect(hitungRekonsiliasi(teoritis, dibeli, dipakai, []).baris[0].status)
      .toBe('susut_tinggi')
    expect(hitungRekonsiliasi(teoritis, dibeli, dipakai, [], { ambangSusutPct: 10 }).baris[0].status)
      .toBe('wajar')
  })

  it('lebih beli terdeteksi terpisah dari susut', () => {
    // Beli 130 untuk kebutuhan 100, semuanya terpakai/tersisa → bukan susut,
    // tapi pembelian melebihi rencana. Dua masalah berbeda, dua status.
    const r = hitungRekonsiliasi(
      [SEMEN],
      [{ material_id: 'm-semen', qty_received: 130 }],
      [{ material_id: 'm-semen', qty: 100 }],
      [{ material_id: 'm-semen', qty_on_hand: 30 }],
    )
    expect(r.baris[0].selisih).toBe(0)
    expect(r.baris[0].lebih_beli).toBe(30)
    expect(r.baris[0].status).toBe('lebih_beli')
  })

  it('daftar kosong tidak melempar', () => {
    const r = hitungRekonsiliasi([], [], [], [])
    expect(r.baris).toEqual([])
    expect(r.total_selisih).toBe(0)
    expect(r.susut_pct_keseluruhan).toBeNull()
  })
})

describe('hitungRekonsiliasi — baris RAB yang belum tersentuh', () => {
  // Ditemukan 2026-08-06 lewat data sungguhan: "Batu Split 2/3" direncanakan
  // 200 m³, tak pernah dibeli sebutir pun, dan laporan menyebutnya `wajar`.
  //
  // `wajar` adalah nilai awal yang dipakai kalau tak ada satu cabang pun cocok
  // — jadi setiap keadaan yang tak dikenali kode ini tampil sebagai "beres".
  // Pada laporan yang gunanya memunculkan masalah, itu arah gagal yang salah.
  it('material di RAB yang belum dibeli/dipakai/tersisa BUKAN "wajar"', () => {
    const h = hitungRekonsiliasi(
      [{ material_id: 'm1', material_name: 'Batu Split 2/3', unit: 'm³', rab_quantity: 200 }],
      [], [], [],
    )
    expect(h.baris[0].status).toBe('belum_dibeli')
    expect(h.jumlah_belum_dibeli).toBe(1)
  })

  it('RAB tersentuh sebagian tetap dinilai lewat susut, bukan "belum_dibeli"', () => {
    // Sudah ada pembelian → pertanyaannya kembali soal susut, bukan soal
    // "belum digarap". Kalau tidak, satu sak semen yang dibeli akan menyembunyikan
    // 199 m³ sisanya di balik label yang sama.
    const h = hitungRekonsiliasi(
      [{ material_id: 'm1', material_name: 'Batu Split 2/3', unit: 'm³', rab_quantity: 200 }],
      [{ material_id: 'm1', qty_received: 100 }],
      [{ material_id: 'm1', qty: -50 }],
      [{ material_id: 'm1', qty_on_hand: 50 }],
    )
    expect(h.baris[0].status).toBe('wajar')
    expect(h.jumlah_belum_dibeli).toBe(0)
  })

  it('material nol di KEEMPAT sumber juga bukan "wajar"', () => {
    // Ditemukan 2026-08-06 pada data sungguhan: proyek dengan satu material
    // yang punya kartu stok kosong dan tak pernah dibeli tampil "Wajar" —
    // layar menyatakan "sudah diperiksa, beres" untuk baris yang datanya
    // TIDAK ADA sama sekali.
    //
    // Uji ini dulu menegaskan kebalikannya (`toBe('wajar')`). Penegasan itu
    // salah: ia mengunci perilaku yang keliru, bukan melindunginya.
    const h = hitungRekonsiliasi([], [{ material_id: 'm9', qty_received: 0 }], [], [])
    expect(h.baris[0].status).toBe('belum_dibeli')
    expect(h.jumlah_belum_dibeli).toBe(1)
  })

  it('ada SISA di gudang bukan "belum ada transaksi", walau tak ada catatan lain', () => {
    // Stok awal yang masuk tanpa penerimaan barang — barangnya NYATA ada di
    // gudang. Melabelinya "belum ada transaksi" menyuruh orang mengabaikan
    // material yang bisa dipegang dengan tangan.
    //
    // Uji ini lahir dari mutasi yang lolos (2026-08-06): membuang syarat
    // `sisa === 0` dari cabang nol-keempat-sumber tak membuat satu test pun
    // merah, karena tak ada satu pun kasus yang punya sisa tanpa yang lain.
    const h = hitungRekonsiliasi([], [], [], [{ material_id: 'm9', qty_on_hand: 40 }])
    expect(h.baris[0].status).not.toBe('belum_dibeli')
    expect(h.jumlah_belum_dibeli).toBe(0)
  })

  it('ada PEMAKAIAN bukan "belum ada transaksi", walau tak ada catatan lain', () => {
    // Material tercatat keluar gudang tanpa pernah tercatat masuk. Itu justru
    // temuan — pembukuannya timpang — dan `selisih < 0` menandainya
    // `belum_lengkap`. Melabelinya "belum ada transaksi" akan menyembunyikan
    // material yang bergerak di lapangan tanpa jejak pembelian.
    const h = hitungRekonsiliasi([], [], [{ material_id: 'm9', qty: -30 }], [])
    expect(h.baris[0].status).toBe('belum_lengkap')
    expect(h.jumlah_belum_dibeli).toBe(0)
  })

  it('"belum_dibeli" tidak menenggelamkan temuan susut di urutan', () => {
    // Proyek baru punya banyak baris RAB belum tersentuh. Kalau mereka naik ke
    // atas, satu-satunya baris yang benar-benar bocor terdorong ke bawah layar.
    //
    // Pembanding SENGAJA `lebih_beli`, bukan `susut_tinggi`. Dengan
    // `susut_tinggi` (peringkat 0), menaikkan `belum_dibeli` ke 0 hanya membuat
    // keduanya SERI — dan pemecah seri `|selisih|` kebetulan mempertahankan
    // urutan yang sama, sehingga uji ini lulus untuk peringkat yang salah.
    // Terbukti begitu 2026-08-06: mutasi `belum_dibeli: 3 → 0` lolos.
    //
    // `lebih_beli` berperingkat 2, jadi apa pun perubahan peringkat
    // `belum_dibeli` ke bawah 2 akan langsung membalik urutan ini.
    const h = hitungRekonsiliasi(
      [
        { material_id: 'a', material_name: 'Belum digarap', unit: 'm³', rab_quantity: 200 },
        { material_id: 'b', material_name: 'Beli berlebih', unit: 'sak', rab_quantity: 100 },
      ],
      [{ material_id: 'b', qty_received: 150 }],
      [{ material_id: 'b', qty: -100 }],
      [{ material_id: 'b', qty_on_hand: 50 }],
    )
    expect(h.baris[0].status).toBe('lebih_beli')
    expect(h.baris[1].status).toBe('belum_dibeli')
  })
})
