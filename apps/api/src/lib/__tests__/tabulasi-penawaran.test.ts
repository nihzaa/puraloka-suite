import { describe, it, expect } from 'vitest'
import { susunTabulasi, type BarisPenawaran } from '../tabulasi-penawaran.js'

// ═════════════════════════════════════════════════════════════════════════════
// TABULASI PENAWARAN — angka yang MEMILIH VENDOR.
//
// "Termurah" yang salah hitung mengarahkan uang perusahaan ke tempat yang
// keliru, dan tak satu pun jalur salahnya melempar error — semuanya
// menghasilkan tabel yang rapi dan meyakinkan.
//
// Yang diuji di sini bukan "fungsinya jalan", melainkan setiap jalan di mana
// vendor yang salah bisa menang tanpa gejala.
// ═════════════════════════════════════════════════════════════════════════════

const P = (o: Partial<BarisPenawaran> & Pick<BarisPenawaran, 'supplier_id' | 'material_id'>): BarisPenawaran => ({
  qty: 10, harga_satuan: 1000, ...o,
})

describe('susunTabulasi — dasar', () => {
  it('vendor termurah ditandai, selisih dihitung terhadapnya', () => {
    const h = susunTabulasi([
      P({ supplier_id: 'v1', supplier_name: 'Vendor A', material_id: 'm1', material_name: 'Besi Ø12', harga_satuan: 100000 }),
      P({ supplier_id: 'v2', supplier_name: 'Vendor B', material_id: 'm1', harga_satuan: 120000 }),
    ])
    const sel = h.baris[0].sel
    expect(h.baris[0].harga_termurah).toBe(100000)
    expect(sel.find((s) => s.supplier_id === 'v1')!.termurah).toBe(true)
    expect(sel.find((s) => s.supplier_id === 'v2')!.termurah).toBe(false)
    expect(sel.find((s) => s.supplier_id === 'v2')!.selisih_pct).toBe(20)
    expect(h.baris[0].rentang_pct).toBe(20)
  })

  it('total per vendor = harga × qty', () => {
    const h = susunTabulasi([
      P({ supplier_id: 'v1', material_id: 'm1', qty: 25, harga_satuan: 4000 }),
    ])
    expect(h.baris[0].sel[0].total).toBe(100000)
    expect(h.total_termurah_gabungan).toBe(100000)
  })
})

describe('susunTabulasi — jalan di mana vendor salah bisa menang', () => {
  it('NUMERIC berupa STRING dibandingkan sebagai ANGKA, bukan teks', () => {
    // Driver Postgres mengirim numeric sebagai string. Sebagai TEKS,
    // "100000" < "99000" (karena '1' < '9') — vendor termahal akan menang
    // sebagai "termurah", dan tabelnya tetap terlihat masuk akal.
    const h = susunTabulasi([
      P({ supplier_id: 'v1', material_id: 'm1', harga_satuan: '100000' }),
      P({ supplier_id: 'v2', material_id: 'm1', harga_satuan: '99000' }),
    ])
    expect(h.baris[0].harga_termurah).toBe(99000)
    expect(h.baris[0].sel.find((s) => s.supplier_id === 'v2')!.termurah).toBe(true)
  })

  it('vendor yang TIDAK MENAWAR tak pernah menang sebagai termurah', () => {
    // Kalau `tidak_menawar` diperlakukan sebagai harga 0, ia SELALU menang —
    // dan PO akan terbit ke vendor yang tak pernah menawarkan apa pun.
    const h = susunTabulasi([
      P({ supplier_id: 'v1', material_id: 'm1', harga_satuan: 100000 }),
      P({ supplier_id: 'v2', material_id: 'm1', harga_satuan: 0, tidak_menawar: true }),
    ])
    expect(h.baris[0].harga_termurah).toBe(100000)
    expect(h.baris[0].sel.find((s) => s.supplier_id === 'v2')!.harga_satuan).toBeNull()
    expect(h.baris[0].sel.find((s) => s.supplier_id === 'v2')!.termurah).toBe(false)
    expect(h.baris[0].sel.find((s) => s.supplier_id === 'v1')!.termurah).toBe(true)
  })

  it('vendor yang tak mengirim baris sama sekali tetap muncul sebagai kolom kosong', () => {
    // Tanpa ini tabelnya berlubang, dan pembaca tak bisa membedakan "vendor
    // ini mahal" dari "vendor ini tak menjawab".
    const h = susunTabulasi([
      P({ supplier_id: 'v1', material_id: 'm1', harga_satuan: 100000 }),
      P({ supplier_id: 'v1', material_id: 'm2', harga_satuan: 50000 }),
      P({ supplier_id: 'v2', material_id: 'm1', harga_satuan: 90000 }),
      // v2 TIDAK mengirim baris untuk m2
    ])
    const m2 = h.baris.find((b) => b.material_id === 'm2')!
    expect(m2.sel).toHaveLength(2)
    expect(m2.sel.find((s) => s.supplier_id === 'v2')!.harga_satuan).toBeNull()
  })

  it('vendor yang tak menawar SEMUA item ditandai tidak lengkap', () => {
    // Vendor yang hanya menawar satu item murah akan punya `total_penawaran`
    // terkecil — dan tampak "paling murah" padahal ia tak menawarkan sisanya.
    const h = susunTabulasi([
      P({ supplier_id: 'v1', supplier_name: 'Lengkap', material_id: 'm1', harga_satuan: 100000 }),
      P({ supplier_id: 'v1', material_id: 'm2', harga_satuan: 100000 }),
      P({ supplier_id: 'v2', supplier_name: 'Sebagian', material_id: 'm1', harga_satuan: 10000 }),
    ])
    const v1 = h.vendor.find((v) => v.supplier_id === 'v1')!
    const v2 = h.vendor.find((v) => v.supplier_id === 'v2')!
    expect(v1.lengkap).toBe(true)
    expect(v2.lengkap).toBe(false)
    expect(v2.jumlah_ditawar).toBe(1)
    // Totalnya memang lebih kecil — justru itu sebabnya `lengkap` harus ada.
    expect(v2.total_penawaran).toBeLessThan(v1.total_penawaran)
  })

  it('material tanpa SATU PUN penawaran tetap muncul, harga null', () => {
    const h = susunTabulasi([
      P({ supplier_id: 'v1', material_id: 'm1', harga_satuan: 0, tidak_menawar: true }),
    ])
    expect(h.baris).toHaveLength(1)
    expect(h.baris[0].harga_termurah).toBeNull()
    expect(h.jumlah_tanpa_penawaran).toBe(1)
    expect(h.total_termurah_gabungan).toBe(0)
  })

  it('rentang null bila hanya SATU vendor menawar', () => {
    // "Rentang 0%" akan terbaca sebagai "harganya seragam" — padahal yang
    // benar: tak ada pembanding sama sekali.
    const h = susunTabulasi([
      P({ supplier_id: 'v1', material_id: 'm1', harga_satuan: 100000 }),
      P({ supplier_id: 'v2', material_id: 'm1', harga_satuan: 0, tidak_menawar: true }),
    ])
    expect(h.baris[0].rentang_pct).toBeNull()
  })

  it('harga termurah NOL tidak menghasilkan Infinity di selisih', () => {
    // Penawaran sah bernilai 0 (barang bonus) membuat pembagi nol.
    // Infinity/NaN akan mengalir ke layar sebagai teks yang tak berarti.
    const h = susunTabulasi([
      P({ supplier_id: 'v1', material_id: 'm1', harga_satuan: 0 }),
      P({ supplier_id: 'v2', material_id: 'm1', harga_satuan: 5000 }),
    ])
    expect(h.baris[0].harga_termurah).toBe(0)
    const v2 = h.baris[0].sel.find((s) => s.supplier_id === 'v2')!
    expect(v2.selisih_pct).toBeNull()
    expect(Number.isFinite(h.total_termurah_gabungan)).toBe(true)
  })

  it('null/undefined tak membuat NaN mengalir ke total', () => {
    const h = susunTabulasi([
      P({ supplier_id: 'v1', material_id: 'm1', harga_satuan: null as unknown as number }),
    ])
    expect(Number.isNaN(h.total_termurah_gabungan)).toBe(false)
    expect(h.total_termurah_gabungan).toBe(0)
  })

  it('total gabungan mengambil termurah PER MATERIAL, bukan satu vendor', () => {
    // Inti "berapa yang bisa dihemat": tiap material dari vendor termurahnya
    // masing-masing. Memakai satu vendor termurah-total akan melebih-lebihkan.
    const h = susunTabulasi([
      P({ supplier_id: 'v1', material_id: 'm1', qty: 1, harga_satuan: 100 }),
      P({ supplier_id: 'v1', material_id: 'm2', qty: 1, harga_satuan: 900 }),
      P({ supplier_id: 'v2', material_id: 'm1', qty: 1, harga_satuan: 300 }),
      P({ supplier_id: 'v2', material_id: 'm2', qty: 1, harga_satuan: 400 }),
    ])
    // termurah m1 = 100 (v1), termurah m2 = 400 (v2) → 500
    expect(h.total_termurah_gabungan).toBe(500)
  })

  it('yang selisihnya paling lebar diurutkan paling atas', () => {
    // Laporan yang mengubur temuan terbesar di baris ke-40 sama saja dengan
    // tak punya laporan.
    const h = susunTabulasi([
      P({ supplier_id: 'v1', material_id: 'sempit', material_name: 'Sempit', harga_satuan: 100 }),
      P({ supplier_id: 'v2', material_id: 'sempit', harga_satuan: 105 }),
      P({ supplier_id: 'v1', material_id: 'lebar', material_name: 'Lebar', harga_satuan: 100 }),
      P({ supplier_id: 'v2', material_id: 'lebar', harga_satuan: 200 }),
    ])
    expect(h.baris[0].material_id).toBe('lebar')
    expect(h.baris[0].rentang_pct).toBe(100)
  })

  it('jumlah_termurah dihitung per vendor untuk ringkasan', () => {
    const h = susunTabulasi([
      P({ supplier_id: 'v1', material_id: 'm1', harga_satuan: 100 }),
      P({ supplier_id: 'v2', material_id: 'm1', harga_satuan: 200 }),
      P({ supplier_id: 'v1', material_id: 'm2', harga_satuan: 500 }),
      P({ supplier_id: 'v2', material_id: 'm2', harga_satuan: 400 }),
    ])
    expect(h.vendor.find((v) => v.supplier_id === 'v1')!.jumlah_termurah).toBe(1)
    expect(h.vendor.find((v) => v.supplier_id === 'v2')!.jumlah_termurah).toBe(1)
  })

  it('harga SAMA persis: keduanya ditandai termurah, selisih 0', () => {
    // Kalau hanya satu yang ditandai, pemilihan jadi bergantung urutan baris
    // di basis — dan "kenapa vendor ini" kembali tak bisa dijawab.
    const h = susunTabulasi([
      P({ supplier_id: 'v1', material_id: 'm1', harga_satuan: 100000 }),
      P({ supplier_id: 'v2', material_id: 'm1', harga_satuan: 100000 }),
    ])
    expect(h.baris[0].sel.every((s) => s.termurah)).toBe(true)
    expect(h.baris[0].sel.every((s) => s.selisih_pct === 0)).toBe(true)
    expect(h.baris[0].rentang_pct).toBe(0)
  })
})
