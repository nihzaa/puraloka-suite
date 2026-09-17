import { describe, it, expect } from 'vitest'
import { ambilSeluruhnya, HALAMAN_POSTGREST } from '../ekspor-tabel.js'

/**
 * ══════════════════════════════════════════════════════════════════════════
 * `.limit(BATAS + 1)` TAK PERNAH BISA MENDETEKSI PEMOTONGAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Empat rute ekspor (finance/invoices, kasbons, procurement/PO, importer)
 * memakai idiom yang sama:
 *
 *     .limit(BATAS + 1)                        // BATAS = 5000
 *     const terpotong = semua.length > BATAS
 *
 * PostgREST memotong di 1.000 baris KERAS. `.limit(5001)` memulangkan 1.000,
 * jadi `1000 > 5000` bernilai false SELAMANYA.
 *
 * Diukur lewat PostgREST sungguhan 2026-09-15:
 *
 *     notifications  11.863 baris → .limit(5001) memulangkan 1.000
 *     audit_logs    102.363 baris → .limit(5001) memulangkan 1.000
 *     .range(0, 4999)             → memulangkan 1.000
 *     .range(1000, 1999)          → memulangkan 1.000 baris LAIN ← jalan keluar
 *
 * Yang ditiru di berkas ini adalah SATU perilaku itu: berapa pun jendela
 * yang diminta, tak pernah lebih dari 1.000 baris per perjalanan. Basis
 * sungguhan tak dibutuhkan untuk membuktikan logika pagingnya — dan justru
 * lebih baik begitu: test yang bergantung pada tabel berisi >5.000 baris
 * akan berubah warna saat isi basis berubah, bukan saat kodenya berubah.
 */
type Baris = { id: number }

/**
 * Sumber palsu yang berperilaku PERSIS seperti PostgREST: ia menghormati
 * `.range()` TETAPI tak pernah memulangkan lebih dari 1.000 baris sekali
 * jalan. `jumlahPerjalanan` dicatat supaya "berhenti saat habis" bisa
 * dibuktikan, bukan cuma diandaikan.
 */
function sumberPalsu(totalBaris: number) {
  const jejak: Array<[number, number]> = []

  const bangun = () => ({
    range: (dari: number, sampai: number) => {
      jejak.push([dari, sampai])
      const dimintaN = sampai - dari + 1
      const batasKeras = Math.min(dimintaN, HALAMAN_POSTGREST)
      const data: Baris[] = []
      for (let i = dari; i < Math.min(dari + batasKeras, totalBaris); i++) {
        data.push({ id: i })
      }
      return Promise.resolve({ data, error: null })
    },
  })

  return { bangun, jejak }
}

describe('ambilSeluruhnya — menembus batas keras 1.000 PostgREST', () => {
  it('idiom LAMA `.limit(BATAS+1)` tak pernah bisa mendeteksi pemotongan', async () => {
    // Ini bukan menguji kode kita — ini memaku KENYATAAN yang membuat idiom
    // lama mustahil bekerja, supaya alasan perbaikannya tak bisa hilang.
    const { bangun } = sumberPalsu(11_863)
    const BATAS = 5000

    // `.limit(5001)` setara satu perjalanan meminta 0..5000.
    const { data } = await bangun().range(0, BATAS)

    expect(data).toHaveLength(HALAMAN_POSTGREST)       // 1.000, bukan 5.001
    expect(data!.length > BATAS).toBe(false)           // ← syarat yang tak pernah benar
  })

  it('mengambil SELURUH baris saat jumlahnya di bawah batas', async () => {
    const { bangun, jejak } = sumberPalsu(2_437)

    const { baris, terpotong, galat } = await ambilSeluruhnya<Baris>(bangun, 5000)

    expect(galat).toBeNull()
    expect(baris).toHaveLength(2_437)
    expect(terpotong).toBe(false)
    // 1.000 + 1.000 + 437 → berhenti di halaman ketiga karena tak penuh.
    expect(jejak).toHaveLength(3)
    // Tak ada baris ganda maupun yang hilang di sambungan halaman.
    expect(new Set(baris.map((b) => b.id)).size).toBe(2_437)
    expect(baris[0].id).toBe(0)
    expect(baris[2_436].id).toBe(2_436)
  })

  it('satu perjalanan saja bila sumbernya lebih kecil dari satu halaman', async () => {
    const { bangun, jejak } = sumberPalsu(67)   // kasbons hari ini

    const { baris, terpotong } = await ambilSeluruhnya<Baris>(bangun, 5000)

    expect(baris).toHaveLength(67)
    expect(terpotong).toBe(false)
    expect(jejak).toHaveLength(1)
  })

  it('sumber KOSONG: nol baris, satu perjalanan, bukan galat', async () => {
    const { bangun, jejak } = sumberPalsu(0)

    const { baris, terpotong, galat } = await ambilSeluruhnya<Baris>(bangun, 5000)

    expect(galat).toBeNull()
    expect(baris).toHaveLength(0)
    expect(terpotong).toBe(false)
    expect(jejak).toHaveLength(1)
  })

  it('terpotong=true HANYA bila benar-benar melewati batas — dan inilah yang dulu mustahil', async () => {
    const { bangun } = sumberPalsu(11_863)

    const { baris, terpotong } = await ambilSeluruhnya<Baris>(bangun, 5000)

    // Idiom lama memberi 1.000 baris + terpotong=false.
    // Yang benar: 5.000 baris (batasnya) + terpotong=true.
    expect(baris).toHaveLength(5000)
    expect(terpotong).toBe(true)
  })

  it('tepat sejumlah batas BUKAN terpotong — batas adalah pagar, bukan tebakan', async () => {
    // Perbedaan "tepat 5.000" vs "lebih dari 5.000" hanya bisa diketahui
    // dengan meminta SATU lebih pada halaman terakhir. Kalau tidak, ekspor
    // yang kebetulan pas akan salah dilabeli terpotong.
    const { bangun } = sumberPalsu(5000)

    const { baris, terpotong } = await ambilSeluruhnya<Baris>(bangun, 5000)

    expect(baris).toHaveLength(5000)
    expect(terpotong).toBe(false)
  })

  it('satu baris di atas batas SUDAH terhitung terpotong', async () => {
    const { bangun } = sumberPalsu(5001)

    const { baris, terpotong } = await ambilSeluruhnya<Baris>(bangun, 5000)

    expect(baris).toHaveLength(5000)
    expect(terpotong).toBe(true)
  })

  it('galat DIPULANGKAN, tidak diterjemahkan jadi "nol baris"', async () => {
    /*
      Bentuk kegagalan yang paling mahal di repo ini: galat yang menjadi
      larik kosong. Nol baris yang SALAH tak bisa dibedakan dari nol baris
      yang BENAR, dan ekspor kosong terbaca seperti "memang tak ada data".
    */
    const bangun = () => ({
      range: () => Promise.resolve({ data: null, error: { message: 'koneksi putus' } }),
    })

    const { baris, terpotong, galat } = await ambilSeluruhnya<Baris>(bangun, 5000)

    expect(galat).toBe('koneksi putus')
    expect(baris).toHaveLength(0)
    expect(terpotong).toBe(false)
  })

  it('galat di halaman KEDUA tetap dipulangkan — bukan separuh data diam-diam', async () => {
    let n = 0
    const bangun = () => ({
      range: (dari: number, sampai: number) => {
        n++
        if (n === 1) {
          const data: Baris[] = []
          for (let i = dari; i <= sampai; i++) data.push({ id: i })
          return Promise.resolve({ data, error: null })
        }
        return Promise.resolve({ data: null, error: { message: 'putus di tengah' } })
      },
    })

    const { baris, galat } = await ambilSeluruhnya<Baris>(bangun, 5000)

    // Separuh data yang dilaporkan sebagai sukses jauh lebih berbahaya
    // daripada kegagalan: totalnya akan dijumlahkan dari separuh itu.
    expect(galat).toBe('putus di tengah')
    expect(baris).toHaveLength(0)
  })

  it('TOTAL UANG dihitung dari himpunan PENUH, bukan dari 1.000 pertama', async () => {
    /*
      Inti kerugiannya. Keempat rute menjumlahkan nominal dari himpunan yang
      dipulangkan, lalu mencetaknya di keterangan berkas sebagai jumlah
      lengkap. Dengan idiom lama, yang terjumlah hanya 1.000 baris pertama —
      dan angka yang terlalu KECIL terbaca persis seperti kabar baik.
    */
    const TOTAL = 3_500
    const NOMINAL = 1_000_000
    const bangun = () => ({
      range: (dari: number, sampai: number) => {
        const n = Math.min(sampai - dari + 1, HALAMAN_POSTGREST)
        const data: Array<{ amount: number }> = []
        for (let i = dari; i < Math.min(dari + n, TOTAL); i++) data.push({ amount: NOMINAL })
        return Promise.resolve({ data, error: null })
      },
    })

    const { baris } = await ambilSeluruhnya<{ amount: number }>(bangun, 5000)
    const total = baris.reduce((s, b) => s + b.amount, 0)

    expect(baris).toHaveLength(TOTAL)
    expect(total).toBe(TOTAL * NOMINAL)          // 3,5 miliar
    // Yang dilaporkan idiom lama: 1.000 × 1 juta = 1 miliar. Selisih 2,5 M.
    expect(total).not.toBe(HALAMAN_POSTGREST * NOMINAL)
  })

  it('query dibangun ULANG tiap halaman — builder Supabase sekali pakai', async () => {
    /*
      Kenapa parameternya FUNGSI, bukan satu builder. Memanggil `.range()`
      dua kali pada builder yang sama MENIMPA jendelanya, bukan mengambil
      halaman berikutnya — hasilnya halaman pertama berulang tanpa henti.
    */
    let dibangun = 0
    const { bangun } = sumberPalsu(2_500)
    const terhitung = () => { dibangun++; return bangun() }

    const { baris } = await ambilSeluruhnya<Baris>(terhitung, 5000)

    expect(baris).toHaveLength(2_500)
    expect(dibangun).toBe(3)   // sekali per halaman
  })
})
