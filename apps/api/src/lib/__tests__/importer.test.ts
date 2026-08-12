import { describe, it, expect } from 'vitest'
import {
  normalkan, skorKemiripan, usulkanPemetaan, validasi,
  angkaSel, tanggalSel, boolSel, AMBANG_USUL, BATAS_BARIS,
  type SkemaImpor,
} from '../importer.js'

/**
 * Test importer generik.
 *
 * Yang dijaga di sini bukan "fungsinya memetakan kolom", melainkan bahwa
 * **kesalahan impor tidak lolos diam-diam** — karena impor terjadi sekali di
 * awal onboarding dan hasilnya menjadi dasar seluruh data pelanggan.
 */

const SKEMA: SkemaImpor = {
  kunci: 'material',
  label: 'Material',
  keterangan: 'uji',
  kolom: [
    { kunci: 'code', label: 'Kode', jenis: 'teks', wajib: true, alias: ['kode barang', 'sku'] },
    { kunci: 'name', label: 'Nama', jenis: 'teks', wajib: true, alias: ['nama barang', 'deskripsi'] },
    { kunci: 'unit', label: 'Satuan', jenis: 'teks', wajib: false, alias: ['uom'] },
    // `angka`, bukan `'uang' as 'angka'` — cast itu membuatnya lolos tsc
    // sementara `validasi()` membandingkan `k.jenis === 'angka'` dan gagal,
    // sehingga harga diperlakukan sebagai TEKS. Jenis di skema ini memang
    // hanya empat; uang adalah angka.
    { kunci: 'unit_price', label: 'Harga Satuan', jenis: 'angka', wajib: false, alias: ['harga'] },
    { kunci: 'min_stock', label: 'Stok Minimum', jenis: 'angka', wajib: false },
    { kunci: 'is_active', label: 'Aktif', jenis: 'bool', wajib: false },
    { kunci: 'berlaku', label: 'Berlaku Sejak', jenis: 'tanggal', wajib: false },
  ],
}

describe('normalkan', () => {
  it('menyamakan gaya penulisan yang berbeda', () => {
    // Satu berkas dari Excel dan satu dari Google Sheets harus cocok dengan
    // aturan yang sama.
    expect(normalkan('Nama Barang')).toBe('nama barang')
    expect(normalkan('nama_barang')).toBe('nama barang')
    expect(normalkan('  NAMA-BARANG  ')).toBe('nama barang')
    expect(normalkan('Nama.Barang')).toBe('nama barang')
  })

  it('membuang tanda baca, bukan hurufnya', () => {
    expect(normalkan('Harga (Rp)')).toBe('harga rp')
  })

  it('string kosong tetap kosong, bukan melempar', () => {
    expect(normalkan('')).toBe('')
    expect(normalkan('   ')).toBe('')
  })
})

describe('skorKemiripan', () => {
  const kode = SKEMA.kolom[0]

  it('sama persis = 1', () => {
    expect(skorKemiripan('Kode', kode)).toBe(1)
    expect(skorKemiripan('code', kode)).toBe(1)
  })

  it('alias = 0,95 — di bawah kecocokan langsung', () => {
    // Supaya saat "Kode" dan "SKU" sama-sama ada, yang langsung menang.
    expect(skorKemiripan('SKU', kode)).toBe(0.95)
    expect(skorKemiripan('Kode Barang', kode)).toBe(0.95)
  })

  it('memuat seutuhnya = 0,8', () => {
    expect(skorKemiripan('Kode Internal', kode)).toBe(0.8)
  })

  it('kata yang sama dibagi jumlah kata TERBANYAK, bukan tersedikit', () => {
    // "satuan" vs "Satuan Kerja Wilayah Timur": satu kata sama dari empat.
    // Kalau dibagi jumlah TERSEDIKIT, skornya 1/1 = 100% dan kolom apa pun
    // yang memuat kata umum akan menang.
    //
    // Catatan: judul yang MEMUAT kandidat seutuhnya ditangani cabang 0.8
    // lebih dulu ("Nama Pemasok" memuat "nama"), jadi kasus ini harus
    // memakai judul yang TIDAK memuatnya utuh sebagai substring.
    const unit = SKEMA.kolom[2]  // Satuan / uom
    const s = skorKemiripan('Sat Kerja Wilayah Timur', unit)
    expect(s).toBeLessThan(0.8)
  })

  it('satu kata sama dari empat TIDAK menghasilkan skor penuh', () => {
    // Ditemukan mutasi: mengganti `Math.max` dengan `Math.min` tak membuat
    // test merah — test di atas hanya memeriksa "< 0.8", dan `min` pun
    // menghasilkan angka yang dibatasi 0.7.
    //
    // Yang diuji di sini angkanya. Kandidat `stok minimum` (2 kata) vs judul
    // `Stok Gudang Pusat Cabang` (4 kata), satu kata sama:
    //
    //   max → 1/4 = 0,25   ← benar: kecocokan lemah
    //   min → 1/2 = 0,50   ← salah: cukup untuk LOLOS ambang usul
    //
    // Selisihnya menentukan: dengan `min`, kolom apa pun yang memuat satu
    // kata umum akan diusulkan sebagai pemetaan.
    const minStock = SKEMA.kolom[4]  // Stok Minimum
    const s = skorKemiripan('Stok Gudang Pusat Cabang', minStock)
    expect(s).toBeCloseTo(0.25, 2)
    expect(s).toBeLessThan(AMBANG_USUL)
  })

  it('judul yang MEMUAT kandidat seutuhnya dapat 0,8', () => {
    // Ini disengaja: "Nama Pemasok" memang lebih mungkin `name` daripada
    // kolom lain mana pun di skema — tetapi 0,8 (bukan 1) supaya kecocokan
    // langsung selalu mengalahkannya.
    const nama = SKEMA.kolom[1]
    expect(skorKemiripan('Nama Pemasok Utama', nama)).toBe(0.8)
  })

  it('judul kosong = 0, bukan cocok dengan segalanya', () => {
    expect(skorKemiripan('', kode)).toBe(0)
    expect(skorKemiripan('   ', kode)).toBe(0)
  })

  it('tak berhubungan sama sekali = rendah', () => {
    expect(skorKemiripan('Tanggal Lahir Pegawai', kode)).toBeLessThan(AMBANG_USUL)
  })
})

describe('usulkanPemetaan — usulan, bukan keputusan', () => {
  it('memetakan judul yang jelas', () => {
    const u = usulkanPemetaan(['Kode', 'Nama Barang', 'Satuan'], SKEMA)
    expect(u.find((x) => x.kolomBerkas === 'Kode')?.kolomTarget).toBe('code')
    expect(u.find((x) => x.kolomBerkas === 'Nama Barang')?.kolomTarget).toBe('name')
    expect(u.find((x) => x.kolomBerkas === 'Satuan')?.kolomTarget).toBe('unit')
  })

  it('satu kolom target hanya dipakai SEKALI', () => {
    // Tanpa aturan ini, "Nama" dan "Nama Lengkap" sama-sama ke `name`, dan
    // yang belakangan diam-diam menimpa yang pertama.
    const u = usulkanPemetaan(['Nama', 'Nama Lengkap'], SKEMA)
    const keName = u.filter((x) => x.kolomTarget === 'name')
    expect(keName).toHaveLength(1)
  })

  it('kecocokan TERBAIK yang memilih lebih dulu, bukan yang paling kiri', () => {
    // "Deskripsi" (alias, 0.95) vs "Nama" (langsung, 1) — yang kedua harus
    // dapat `name` meski muncul belakangan.
    const u = usulkanPemetaan(['Deskripsi', 'Nama'], SKEMA)
    expect(u.find((x) => x.kolomBerkas === 'Nama')?.kolomTarget).toBe('name')
    expect(u.find((x) => x.kolomBerkas === 'Deskripsi')?.kolomTarget).not.toBe('name')
  })

  it('dua kolom berjudul SAMA: yang PERTAMA dapat, kedua kosong', () => {
    // `indexOf` selalu menjawab indeks pertama. Dengan dua judul identik,
    // hasilnya kebetulan sama — jadi test ini saja TIDAK cukup (ditemukan
    // mutasi: mengembalikan `indexOf` tak membuatnya merah).
    const u = usulkanPemetaan(['Nama', 'Nama'], SKEMA)
    expect(u).toHaveLength(2)
    expect(u.filter((x) => x.kolomTarget === 'name')).toHaveLength(1)
  })

  it('judul kembar di POSISI BERBEDA: yang kedua tak kehilangan usulannya', () => {
    // Inilah yang menangkap `indexOf`. Berkas: [Kode, Kode, Nama].
    //
    // Dengan `indexOf`, kedua "Kode" melapor ke indeks 0, jadi indeks 1 tak
    // pernah masuk daftar kandidat sama sekali — dan "Nama" di indeks 2 tetap
    // dapat usulannya. Yang terlihat: kolom ke-2 kosong, seolah judulnya tak
    // dikenali. Pengguna akan memetakannya manual dan tak pernah tahu
    // sebabnya bug.
    //
    // Dengan indeks dari `forEach`, ketiganya masuk daftar dan aturan
    // "satu target sekali" yang memutuskan — hasilnya sama, TETAPI karena
    // alasan yang benar.
    const u = usulkanPemetaan(['Kode', 'Kode', 'Nama'], SKEMA)
    expect(u).toHaveLength(3)
    // Yang penting: kolom KETIGA tetap dapat `name`, dan tepat satu kolom
    // dapat `code`.
    expect(u[2].kolomTarget).toBe('name')
    expect(u.filter((x) => x.kolomTarget === 'code')).toHaveLength(1)
    // Dan indeks yang dilaporkan urut — bukan menumpuk di posisi pertama.
    expect(u.map((x) => x.kolomBerkas)).toEqual(['Kode', 'Kode', 'Nama'])
  })

  it('yang di bawah ambang TIDAK diusulkan — tebakan lemah lebih buruk', () => {
    // Tebakan lemah terlihat seperti jawaban, dan yang mengunggah akan
    // menerimanya tanpa memeriksa.
    const u = usulkanPemetaan(['Nomor Telepon Darurat'], SKEMA)
    expect(u[0].kolomTarget).toBeNull()
    expect(u[0].skor).toBe(0)
  })

  it('daftar kosong tidak melempar', () => {
    expect(usulkanPemetaan([], SKEMA)).toEqual([])
  })
})

describe('angkaSel — format Indonesia', () => {
  it('sel kosong jadi null, BUKAN nol', () => {
    // Nol pada kolom harga berarti barang gratis yang lolos seluruh validasi.
    expect(angkaSel('')).toBeNull()
    expect(angkaSel('   ')).toBeNull()
    expect(angkaSel(null)).toBeNull()
  })

  it('titik ribuan + koma desimal dibaca benar', () => {
    // Tanpa ini, 1.250.000 terbaca 1,25 — dan lolos tanpa gejala.
    expect(angkaSel('1.250.000')).toBe(1250000)
    expect(angkaSel('1.250.000,50')).toBe(1250000.5)
  })

  it('koma ribuan gaya Inggris juga dibaca', () => {
    expect(angkaSel('1,250,000')).toBe(1250000)
  })

  it('angka biasa dan nol sungguhan', () => {
    expect(angkaSel(42)).toBe(42)
    expect(angkaSel('0')).toBe(0)
  })

  it('teks bukan angka jadi null', () => {
    expect(angkaSel('banyak')).toBeNull()
  })
})

describe('tanggalSel', () => {
  it('ISO diterima apa adanya', () => {
    expect(tanggalSel('2026-08-12')).toBe('2026-08-12')
  })

  it('DD/MM/YYYY dibaca sebagai hari/bulan', () => {
    expect(tanggalSel('12/08/2026')).toBe('2026-08-12')
    expect(tanggalSel('1-8-2026')).toBe('2026-08-01')
  })

  it('bulan di atas 12 ditolak, bukan digeser', () => {
    // Kalau 13/08 diterima sebagai bulan 13, tanggalnya jadi tahun berikutnya
    // tanpa ada yang tahu.
    expect(tanggalSel('08/13/2026')).toBeNull()
  })

  it('kosong dan tak terbaca jadi null', () => {
    expect(tanggalSel('')).toBeNull()
    expect(tanggalSel('kemarin')).toBeNull()
  })
})

describe('boolSel', () => {
  it('menerima kata yang lazim dipakai orang', () => {
    expect(boolSel('Ya')).toBe(true)
    expect(boolSel('aktif')).toBe(true)
    expect(boolSel('1')).toBe(true)
    expect(boolSel('Tidak')).toBe(false)
    expect(boolSel('nonaktif')).toBe(false)
    expect(boolSel('0')).toBe(false)
  })

  it('kosong jadi null, bukan false', () => {
    // False berarti "dinyatakan tidak aktif"; kosong berarti "tak diisi".
    expect(boolSel('')).toBeNull()
    expect(boolSel(null)).toBeNull()
  })

  it('kata tak dikenal jadi null, bukan ditebak', () => {
    expect(boolSel('mungkin')).toBeNull()
  })
})

describe('validasi — TIDAK menulis, dan mengumpulkan SELURUH galat', () => {
  const petaan = { Kode: 'code', Nama: 'name', Harga: 'unit_price' }

  it('baris sah menghasilkan nol galat', () => {
    const h = validasi(
      [{ Kode: 'MAT-1', Nama: 'Semen', Harga: '75.000' }], SKEMA, petaan)
    expect(h.galat).toHaveLength(0)
    expect(h.siap[0]).toEqual({ code: 'MAT-1', name: 'Semen', unit_price: 75000 })
  })

  it('SELURUH galat dikumpulkan, bukan berhenti di yang pertama', () => {
    // Berhenti di galat pertama membuat pengguna memperbaiki berkas 40 baris
    // dalam 40 putaran unggah.
    const h = validasi([
      { Kode: '', Nama: 'A', Harga: '1' },
      { Kode: 'B', Nama: '', Harga: '1' },
      { Kode: 'C', Nama: 'C', Harga: 'bukan angka' },
    ], SKEMA, petaan)
    expect(h.galat.length).toBeGreaterThanOrEqual(2)
    expect(h.galat.map((g) => g.baris)).toContain(2)
    expect(h.galat.map((g) => g.baris)).toContain(3)
  })

  it('nomor baris menghitung dari 1 DAN memperhitungkan baris judul', () => {
    // Pengguna melihat "baris 2" di Excel, bukan "indeks 0".
    const h = validasi([{ Kode: '', Nama: 'A' }], SKEMA, petaan)
    expect(h.galat[0].baris).toBe(2)
  })

  it('kolom WAJIB yang tak dipetakan dilaporkan, dan baris tak divalidasi', () => {
    // Tak ada gunanya memvalidasi — seluruh baris akan gagal dengan pesan
    // yang sama, dan pengguna harus menggulir 500 galat identik.
    const h = validasi([{ Kode: 'A' }], SKEMA, { Kode: 'code' })
    expect(h.wajibHilang).toContain('Nama')
    expect(h.galat).toHaveLength(0)
    expect(h.siap).toHaveLength(0)
  })

  it('kolom TIDAK wajib yang kosong bukan galat', () => {
    const h = validasi(
      [{ Kode: 'A', Nama: 'B', Harga: '' }], SKEMA, petaan)
    expect(h.galat).toHaveLength(0)
    // Dan ia tak ikut ditulis — bukan ditulis sebagai 0.
    expect(h.siap[0]).not.toHaveProperty('unit_price')
  })

  it('kolom TEKS tidak wajib yang kosong juga bukan galat', () => {
    // Ditemukan mutasi: membuang penjaga `if (k.wajib)` pada cabang TEKS tak
    // membuat satu test pun merah — test di atas memakai kolom ANGKA, yang
    // cabangnya berbeda.
    //
    // Kalau lolos, tiap baris yang tak mengisi "Satuan" (opsional) dilaporkan
    // sebagai galat, dan impor 500 baris menghasilkan 500 galat palsu yang
    // membuat berkas sah terlihat rusak seluruhnya.
    const h = validasi(
      [{ Kode: 'A', Nama: 'B', Satuan: '' }],
      SKEMA,
      { Kode: 'code', Nama: 'name', Satuan: 'unit' })
    expect(h.galat).toHaveLength(0)
    expect(h.siap[0]).not.toHaveProperty('unit')
  })

  it('kolom berkas yang tak dipetakan DIABAIKAN, bukan ikut masuk', () => {
    const h = validasi(
      [{ Kode: 'A', Nama: 'B', Entah: 'apa' }], SKEMA, petaan)
    expect(h.siap[0]).not.toHaveProperty('Entah')
  })

  it('daftar kosong menghasilkan hasil kosong, bukan melempar', () => {
    const h = validasi([], SKEMA, petaan)
    expect(h.siap).toHaveLength(0)
    expect(h.galat).toHaveLength(0)
  })

  it('batas baris adalah angka yang masuk akal', () => {
    expect(BATAS_BARIS).toBeGreaterThan(100)
    expect(BATAS_BARIS).toBeLessThanOrEqual(50_000)
  })
})
