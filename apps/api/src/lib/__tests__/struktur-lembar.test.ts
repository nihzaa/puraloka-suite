/**
 * LEMBAR PERHITUNGAN — penyusun dokumen yang bisa ditandatangani.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * APA YANG TEST INI BISA, DAN APA YANG TIDAK
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Test di berkas ini memeriksa BENTUK dokumen: nama medan yang terbaca,
 * satuan yang tersirat dari kuncinya, dan pemisahan "belum dihitung" dari
 * "tidak aman".
 *
 * Ia TIDAK bisa membuktikan lembarnya benar-benar terbit dan terbaca. Selama
 * sesi ini, cacat paling berbahaya di modul lembar justru lolos dari test
 * berbentuk seperti ini:
 *
 *   · rumus keluar sebagai sampah/terpotong karena Helvetica tak punya φ ≥ √
 *     — PDF tetap 17 KB, tetap terbuka, tetap berstatus 200;
 *   · em-dash DIBUANG diam-diam sehingga "SNI 2847:2019 — Persyaratan…"
 *     tercetak tanpa pemisah.
 *
 * Keduanya hanya ketahuan dengan MEMBUKA berkasnya. Karena itu bukti
 * utamanya ada di `scripts/uji-lembar-hidup.mjs` (lewat rute sungguhan, teks
 * PDF-nya dibaca ulang) dan `apps/web/scripts/potret-lembar.mjs` (tombolnya
 * ditekan sungguhan). Berkas ini melengkapi keduanya, bukan menggantikan.
 */
import { describe, it, expect } from 'vitest'
import {
  ACUAN_STANDAR, namaMedan, ratakanInput, susunLembar,
} from '../struktur-lembar.js'

describe('namaMedan — kunci mentah jadi nama yang bisa dibaca orang', () => {
  it('menurunkan satuan dari akhiran kunci', () => {
    expect(namaMedan('bMm').satuan).toBe('mm')
    expect(namaMedan('vuKn').satuan).toBe('kN')
    expect(namaMedan('muKnm').satuan).toBe('kNm')
    expect(namaMedan('fcMpa').satuan).toBe('MPa')
  })

  it('memakai lambang BAKU untuk f\'c dan fy, tidak menguraikannya', () => {
    /*
      "F c" justru menjauhkan lembar dari yang tertulis di SNI dan di gambar
      kerja. Yang membaca lembar ini mencocokkannya dengan dokumen lain.
    */
    expect(namaMedan('mutu.fcMpa').label).toContain("f'c")
    expect(namaMedan('mutu.fyMpa').label).toContain('fy')
  })

  it('memisah camelCase jadi kata', () => {
    expect(namaMedan('jarakSengkangMm').label.toLowerCase()).toContain('jarak')
    expect(namaMedan('jarakSengkangMm').label.toLowerCase()).toContain('sengkang')
  })

  it('menurunkan awalan huruf tunggal jadi kata utuh', () => {
    expect(namaMedan('dUtamaMm').label.toLowerCase()).toContain('diameter')
    expect(namaMedan('nTarik').label.toLowerCase()).toContain('jumlah')
  })

  it('kunci bersarang memakai induknya sebagai awalan berpemisah', () => {
    const n = namaMedan('mutu.fcMpa')
    expect(n.label.toLowerCase()).toContain('mutu')
    /* Tapi TIDAK menyatu jadi satu kata — "Mutufc" tak terbaca siapa pun. */
    expect(n.label.toLowerCase()).not.toContain('mutufc')
  })

  it('TIDAK memulangkan label kosong untuk kunci apa pun yang masuk akal', () => {
    /*
      Label kosong lebih buruk daripada kunci mentah: barisnya jadi angka
      tanpa keterangan sama sekali.
    */
    for (const k of ['bMm', 'hMm', 'nTarik', 'panjangM', 'tingkatApiMenit',
      'mutu.fcMpa', 'lapisan', 'phiDerajat']) {
      expect(namaMedan(k).label.trim().length).toBeGreaterThan(0)
    }
  })
})

describe('ratakanInput — kunci asli TETAP dibawa', () => {
  it('membawa medan terbaca DAN kunci aslinya', () => {
    const r = ratakanInput({ bMm: 300, mutu: { fcMpa: 25 } })
    const b = r.find((x) => x.kunci === 'bMm')
    expect(b).toBeDefined()
    expect(b!.medan).not.toBe('bMm')          // sudah diterjemahkan
    expect(b!.kunci).toBe('bMm')              // jejak ke sumbernya tetap ada
    expect(r.some((x) => x.kunci === 'mutu.fcMpa')).toBe(true)
  })

  it('meringkas larik jadi jumlah baris, bukan mencetak seluruhnya', () => {
    const r = ratakanInput({ lapisan: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] })
    expect(r).toHaveLength(1)
    expect(r[0].nilai).toContain('10')
  })
})

describe('susunLembar — dokumen yang bisa ditandatangani', () => {
  const ELEMEN_TAK_TERHITUNG = {
    kode: 'X1', nama: 'gagal hitung', jenis: 'balok', jumlah: 1,
    input: { bMm: 300 }, hasil: null, gambar: undefined,
  }

  it('elemen yang TAK bisa dihitung tetap masuk lembar', () => {
    /*
      Menghilangkannya diam-diam membuat lembar terlihat lengkap padahal ada
      elemen yang terlewat — dan yang menandatangani takkan tahu.
    */
    const l = susunLembar([ELEMEN_TAK_TERHITUNG] as never, {
      proyek: { nama: 'P', lokasi: null },
      penerbit: { nama: null, alamat: null, kota: null, telepon: null },
      disusunOleh: null, diperiksaOleh: null,
    })
    expect(l.bagian).toHaveLength(1)
    expect(l.bagian[0].kode).toBe('X1')
  })

  it('memuat acuan standar — itu yang membuatnya lembar, bukan cetakan layar', () => {
    const l = susunLembar([ELEMEN_TAK_TERHITUNG] as never, {
      proyek: { nama: 'P', lokasi: null },
      penerbit: { nama: null, alamat: null, kota: null, telepon: null },
      disusunOleh: null, diperiksaOleh: null,
    })
    expect(ACUAN_STANDAR.length).toBeGreaterThan(0)
    expect(l.acuan.join(' ')).toContain('SNI')
  })

  it('nomor dokumen terbentuk walau tak diberikan', () => {
    /* Lembar tanpa nomor tak bisa diarsipkan maupun dirujuk saat sengketa. */
    const l = susunLembar([ELEMEN_TAK_TERHITUNG] as never, {
      proyek: { nama: 'P', lokasi: null },
      penerbit: { nama: null, alamat: null, kota: null, telepon: null },
      disusunOleh: null, diperiksaOleh: null,
    })
    expect(l.nomor.trim().length).toBeGreaterThan(0)
  })
})
