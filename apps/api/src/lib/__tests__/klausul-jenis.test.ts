import { describe, it, expect } from 'vitest'
import {
  gabungKlausul, gabungKlausulJenis, klausulBawaan,
  KLAUSUL_BAWAAN, KLAUSUL_BAWAAN_SPK, KLAUSUL_BAWAAN_BERITA_ACARA,
  type Klausul,
} from '../klausul-kontrak.js'

/**
 * KLAUSUL PER JENIS DOKUMEN — migrasi 465, 2026-08-19.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * CACAT YANG DITUTUP, DIUKUR BUKAN DIDUGA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Migrasi 450 memindahkan klausul KONTRAK ke tenant. Diukur 2026-08-19 ke
 * kode pencetaknya, yang lain tertinggal:
 *
 *   contracts.ts  membaca `klausul_kontrak` (4 tempat)  ✅ milik tenant
 *   spk.ts        NOL rujukan ke klausul                ❌ dipaku di kode
 *
 * SPK punya `syarat_khusus` per-baris — bagus untuk yang memang berbeda tiap
 * pekerjaan. Tapi SYARAT UMUM (K3, mutu, pemutusan) sama untuk semua SPK
 * sebuah perusahaan dan tak punya tempat sama sekali, jadi tiap perusahaan
 * menerbitkan SPK dengan syarat yang ditulis pembuat aplikasi.
 */
const k = (o: Partial<Klausul>): Klausul => ({
  nomor: '1', judul: 'Uji', isi: 'isi uji', urutan: 10, ...o,
})

describe('bawaan per jenis dokumen', () => {
  it('SPK memakai bawaannya SENDIRI — tak meminjam pasal kontrak', () => {
    /*
      Inti berkas ini.

      Kontrak mengatur hubungan pemberi kerja ↔ pelaksana utama; SPK mengatur
      perintah kerja ke subkontraktor. Pasal penyelesaian sengketa versi
      kontrak menyebut forum dan nilai gugatan yang tak sepadan untuk SPK
      senilai belasan juta.

      Meminjam bawaan kontrak menghasilkan kertas yang TERLIHAT lengkap dan
      berbunyi salah — lebih buruk daripada kertas yang jelas ringkas.
    */
    const spk = gabungKlausulJenis('spk', [])
    const kontrak = gabungKlausul([])

    expect(spk.length).toBe(KLAUSUL_BAWAAN_SPK.length)
    expect(kontrak.length).toBe(KLAUSUL_BAWAAN.length)

    // Judul pasal 1 keduanya BERBEDA — bukti keduanya benar-benar terpisah.
    expect(spk[0].judul).toMatch(/DASAR PERINTAH KERJA/i)
    expect(kontrak[0].judul).not.toBe(spk[0].judul)

    // Dan tak satu pun isi SPK menyalin isi kontrak.
    const isiKontrak = new Set(kontrak.map((x) => x.isi))
    expect(spk.every((x) => !isiKontrak.has(x.isi))).toBe(true)
  })

  it('berita acara paling ringkas — ia MENCATAT, bukan mengikat', () => {
    const ba = gabungKlausulJenis('berita_acara', [])
    expect(ba.length).toBe(KLAUSUL_BAWAAN_BERITA_ACARA.length)
    expect(ba.length).toBeLessThan(gabungKlausul([]).length)
  })

  it('tenant menimpa bawaan bernomor sama, DALAM jenisnya saja', () => {
    const spk = gabungKlausulJenis('spk', [
      k({ nomor: '2', judul: 'K3 VERSI KAMI', isi: 'bunyi khusus perusahaan ini' }),
    ])
    const pasal2 = spk.find((x) => x.nomor === '2')
    expect(pasal2?.isi).toBe('bunyi khusus perusahaan ini')

    // Kontrak TIDAK ikut berubah — penimpaan tak bocor lintas jenis.
    const pasal2Kontrak = gabungKlausul([]).find((x) => x.nomor === '2')
    expect(pasal2Kontrak?.isi).not.toBe('bunyi khusus perusahaan ini')
  })

  it('bawaan yang TAK ditimpa tetap ikut — tenant tak bisa berakhir kosong', () => {
    /*
      Aturan yang sama dengan migrasi 450, dan alasannya sama: kertas yang tak
      menyebut kewajiban K3 bukan kertas yang "belum lengkap" — ia kertas yang
      menyerahkan tanggung jawabnya kepada siapa pun yang menuntut lebih dulu.
    */
    const spk = gabungKlausulJenis('spk', [k({ nomor: '1', isi: 'cuma pasal satu' })])
    expect(spk.length).toBe(KLAUSUL_BAWAAN_SPK.length)
    expect(spk.some((x) => /KESELAMATAN KERJA/i.test(x.judul))).toBe(true)
  })

  it('tenant boleh MENAMBAH pasal yang tak ada di bawaan', () => {
    const spk = gabungKlausulJenis('spk', [
      k({ nomor: '5', judul: 'RETENSI', isi: 'retensi 5% ditahan 90 hari', urutan: 50 }),
    ])
    expect(spk.length).toBe(KLAUSUL_BAWAAN_SPK.length + 1)
    expect(spk.at(-1)?.judul).toBe('RETENSI')
  })

  it('klausul tenant ber-isi KOSONG diabaikan, bukan menimpa dengan kekosongan', () => {
    // Basis sudah menolaknya lewat CHECK; ini lapis kedua untuk data yang
    // masuk lewat jalur lain (importer, psql). Pasal K3 yang kosong tercetak
    // sebagai judul tanpa isi — terlihat sengaja, padahal kecelakaan.
    for (const isi of ['', '   ']) {
      const spk = gabungKlausulJenis('spk', [k({ nomor: '2', isi })])
      const pasal2 = spk.find((x) => x.nomor === '2')
      expect(pasal2?.isi.trim()).not.toBe('')
      expect(pasal2?.isi).toBe(KLAUSUL_BAWAAN_SPK.find((x) => x.nomor === '2')?.isi)
    }
  })

  it('jenis TAK DIKENAL memulangkan kosong, bukan MELEMPAR', () => {
    /*
      Keputusan yang gampang salah arah.

      Melempar terasa lebih tegas, tapi akibatnya dokumen GAGAL TERBIT —
      dan di repo ini aturannya sudah ditetapkan berkali-kali: dokumen yang
      tak bisa terbit lebih merugikan daripada dokumen tanpa syarat umum
      (`lib/kop-dokumen.ts`, `lib/gambar-kop.ts`).

      Enum basis (migrasi 465) sudah menahan nilai asing di pintu masuk, jadi
      keadaan ini hanya lahir dari kode yang salah tulis — dan saat itu
      terjadi, yang paling tidak boleh terjadi adalah SPK-nya tak bisa
      dicetak sama sekali.
    */
    const hasil = gabungKlausulJenis('invoice' as never, [])
    expect(hasil).toEqual([])
  })

  it('`klausulBawaan` memulangkan SALINAN — bawaan produk tak bisa dirusak', () => {
    /*
      Kalau ia memulangkan larik aslinya, satu pemanggil yang mengurutkan
      atau menyunting hasilnya akan mengubah bawaan untuk SELURUH proses —
      dan kontrak berikutnya terbit dengan pasal yang tak pernah diputuskan
      siapa pun. Cacat yang cuma muncul pada permintaan KEDUA.
    */
    const a = klausulBawaan('spk')
    a[0].isi = 'DIRUSAK'
    a.sort((x, y) => y.urutan - x.urutan)

    // Yang diperiksa adalah KONSTANTA SUMBERNYA, bukan panggilan kedua.
    //
    // Versi pertama test ini membandingkan `klausulBawaan('spk')` kedua, dan
    // mutasi "buang `.map()`" LOLOS — karena `gabungKlausulJenis` membangun
    // ulang objeknya, jadi kerusakan pada hasil `klausulBawaan` tak pernah
    // terlihat lewat jalur itu. Panggilan kedua memulangkan larik yang SAMA,
    // dan larik yang sama-sama rusak terlihat konsisten.
    //
    // Yang benar-benar dipertaruhkan: `KLAUSUL_BAWAAN_SPK` adalah bawaan
    // produk untuk SELURUH proses. Satu pemanggil yang menyunting hasilnya
    // mengubah bunyi SPK setiap tenant sampai proses di-restart — cacat yang
    // muncul pada permintaan KEDUA, dan tak pernah bisa dilacak ke
    // pemanggilnya.
    expect(KLAUSUL_BAWAAN_SPK[0].isi).not.toBe('DIRUSAK')
    expect(KLAUSUL_BAWAAN_SPK[0].nomor).toBe('1')
    expect(KLAUSUL_BAWAAN_SPK[0].judul).toMatch(/DASAR PERINTAH KERJA/i)

    // Dan urutan konstanta sumbernya tak ikut terbalik.
    expect(KLAUSUL_BAWAAN_SPK[0].urutan)
      .toBeLessThan(KLAUSUL_BAWAAN_SPK[KLAUSUL_BAWAAN_SPK.length - 1].urutan)
  })

  it('urutan menaik, dan nomor bertambahan diurut NUMERIK bukan teks', () => {
    // "10" harus jatuh sesudah "9". Pengurutan teks murni menaruh "10"
    // sebelum "2", dan kertas lalu memuat pasal yang melompat-lompat.
    const spk = gabungKlausulJenis('spk', [
      k({ nomor: '10', judul: 'SEPULUH', isi: 'isi', urutan: 100 }),
      k({ nomor: '9', judul: 'SEMBILAN', isi: 'isi', urutan: 100 }),
    ])
    const nomor = spk.map((x) => x.nomor)
    expect(nomor.indexOf('9')).toBeLessThan(nomor.indexOf('10'))
    for (let i = 1; i < spk.length; i++) {
      expect(spk[i].urutan).toBeGreaterThanOrEqual(spk[i - 1].urutan)
    }
  })

  it('jalur KONTRAK tak berubah sedikit pun sesudah refactor', () => {
    /*
      `gabungKlausul` kini meneruskan ke `gabungDenganBawaan`. Kontrak adalah
      satu-satunya kertas di repo ini yang sudah terbit dan DITANDATANGANI
      orang — perubahan sekecil apa pun pada bunyinya adalah perubahan pada
      dokumen hukum yang sudah berlaku.
    */
    const kontrak = gabungKlausul([])
    expect(kontrak.length).toBe(KLAUSUL_BAWAAN.length)
    for (const bawaan of KLAUSUL_BAWAAN) {
      const hasil = kontrak.find((x) => x.nomor === bawaan.nomor)
      expect(hasil?.isi).toBe(bawaan.isi)
      expect(hasil?.judul).toBe(bawaan.judul)
    }
  })
})
