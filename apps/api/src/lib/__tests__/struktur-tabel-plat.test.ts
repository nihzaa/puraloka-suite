import { describe, it, expect } from 'vitest'
import {
  TABEL_KOEFISIEN, RASIO_TABEL, KOREKSI, koefisienMomen, tentukanKondisi,
  type KondisiPelat, type JenisKoefisien,
} from '../struktur-tabel-plat'

/**
 * TABEL KOEFISIEN MOMEN PELAT — PBI 1971.
 *
 * Diverifikasi ke tabel PBI'71 tercetak (Modul-3 "Analisa Pelat Lantai Dua Arah
 * Metode Koefisien Momen Tabel PBI-1971", Tabel 1 — momen pelat persegi akibat
 * beban merata), bukan hanya ke workbook yang jadi sumber salinan.
 *
 * Itu penting: workbook memuat tiga anomali, dan hanya DUA di antaranya salah
 * ketik. Yang ketiga (Kondisi 9 @ Ly/Lx = 1.0 = 13) ternyata NILAI ASLI —
 * "koreksi" saya terhadapnya sudah dibatalkan, dan test di bawah menguncinya
 * supaya tak dihidupkan lagi oleh orang yang melihat deretnya dan mengira
 * salah ketik.
 */

const SEMUA_KONDISI: KondisiPelat[] = [1, 2, 3, 4, 5, 6, 7, 8, 9]
const SEMUA_JENIS: JenisKoefisien[] = ['Clx', 'Cly', 'Ctx', 'Cty']

describe('bentuk tabel — penjaga struktural', () => {
  it('9 kondisi × 4 koefisien, tiap deret 17 nilai (sepanjang RASIO_TABEL)', () => {
    expect(RASIO_TABEL).toHaveLength(17)
    for (const k of SEMUA_KONDISI) {
      for (const j of SEMUA_JENIS) {
        expect(TABEL_KOEFISIEN[k][j], `kondisi ${k} ${j}`).toHaveLength(17)
      }
    }
  })

  it('seluruh nilai bilangan bulat non-negatif — bukan NaN, bukan pecahan', () => {
    for (const k of SEMUA_KONDISI) {
      for (const j of SEMUA_JENIS) {
        for (const [i, v] of TABEL_KOEFISIEN[k][j].entries()) {
          expect(Number.isInteger(v), `kondisi ${k} ${j}[${i}] = ${v}`).toBe(true)
          expect(v).toBeGreaterThanOrEqual(0)
        }
      }
    }
  })

  /**
   * UJI-MANDIRI yang menemukan ketiga anomali — dan yang akan menemukan
   * pergeseran sel berikutnya tanpa perlu membuka sumber luar.
   *
   * Di PBI'71, untuk kondisi yang sisinya menerus, Ctx IDENTIK dengan Clx dan
   * Cty identik dengan Cly di seluruh 17 kolom. Kalau sepasang baris tak sama
   * persis, di situlah salah salinnya.
   *
   * Dikecualikan: kondisi yang sisinya bebas punya Ctx atau Cty = 0 seluruhnya
   * (tumpuan bebas tak menahan rotasi → nol momen tumpuan), jadi di sana
   * ketidaksamaan justru yang benar.
   */
  it('Ctx ≡ Clx dan Cty ≡ Cly untuk sisi menerus (pendeteksi pergeseran sel)', () => {
    /*
      ⚠ HANYA 16 kolom pertama — kolom `>2.5` DIKECUALIKAN, dan pengecualian
      itu ditemukan oleh test ini sendiri.

      Percobaan pertama menguji seluruh 17 kolom dan MERAH di kondisi 9:
      Cly[>2.5] = 13 sementara Cty[>2.5] = 38. Diperiksa ke sumber, dan
      selisih itu ADA di workbook secara konsisten:

          kondisi 2  Cly 13 · Cty 38
          kondisi 3  Cly 19 · Cty 56
          kondisi 8  Cly 19 · Cty 56
          kondisi 9  Cly 13 · Cty 38

      Empat pasang, tiga nilai berbeda, semuanya sistematis — itu pola tabel,
      bukan salah salin. Di rasio ekstrem pelat berperilaku satu arah, dan
      momen lapangan vs tumpuan memang berpisah.

      Kalau kolom ini ikut diuji, test akan menuntut "perbaikan" yang justru
      merusak data yang benar. Persis pola yang sama dengan koreksi Kondisi 9
      yang saya batalkan — dan kali ini tertangkap sebelum masuk kode.
    */
    const HINGGA = 16
    for (const k of SEMUA_KONDISI) {
      const { Ctx, Clx, Cty, Cly } = TABEL_KOEFISIEN[k]
      const ctxNol = Ctx.every((v) => v === 0)
      const ctyNol = Cty.every((v) => v === 0)

      if (!ctxNol) {
        expect(Ctx.slice(0, HINGGA), `kondisi ${k}: Ctx ≠ Clx`).toEqual(Clx.slice(0, HINGGA))
      }
      if (!ctyNol) {
        expect(Cty.slice(0, HINGGA), `kondisi ${k}: Cty ≠ Cly`).toEqual(Cly.slice(0, HINGGA))
      }
    }
  })

  it('kolom >2.5 SENGAJA boleh berbeda antara lapangan & tumpuan', () => {
    // Mengunci pola di atas supaya tak "diseragamkan" oleh orang berikutnya.
    const akhir = RASIO_TABEL.length - 1
    expect(TABEL_KOEFISIEN[2].Cly[akhir]).toBe(13)
    expect(TABEL_KOEFISIEN[2].Cty[akhir]).toBe(38)
    expect(TABEL_KOEFISIEN[3].Cly[akhir]).toBe(19)
    expect(TABEL_KOEFISIEN[3].Cty[akhir]).toBe(56)
  })

  it('Ctx = 0 di kondisi 1·4·6, Cty = 0 di kondisi 5·7 (tumpuan bebas)', () => {
    for (const k of [1, 4, 6] as KondisiPelat[]) {
      expect(TABEL_KOEFISIEN[k].Ctx.every((v) => v === 0), `kondisi ${k}`).toBe(true)
    }
    for (const k of [5, 7] as KondisiPelat[]) {
      expect(TABEL_KOEFISIEN[k].Cty.every((v) => v === 0), `kondisi ${k}`).toBe(true)
    }
  })
})

describe('nilai yang diverifikasi ke PBI\'71 tercetak', () => {
  it('Kondisi 3 Clx — 616/7 sudah jadi 61/67', () => {
    expect(TABEL_KOEFISIEN[3].Clx).toEqual(
      [48, 55, 61, 67, 71, 76, 79, 82, 84, 86, 88, 89, 90, 91, 92, 92, 94])
  })

  it('Kondisi 5 Clx — 616/2 sudah jadi 61/62', () => {
    expect(TABEL_KOEFISIEN[5].Clx).toEqual(
      [51, 54, 57, 59, 60, 61, 62, 62, 63, 63, 63, 63, 63, 63, 63, 63, 63])
  })

  /**
   * PENJAGA TERHADAP "PERBAIKAN" YANG MERUSAK.
   *
   * 13 di sini terlihat salah — deret berikutnya melompat ke 48. Saya sendiri
   * sempat menggantinya jadi 44 dengan penalaran yang rapi, dan itu SALAH:
   * tabel PBI'71 tercetak memang bernilai 13.
   *
   * Kalau koefisien ini dinaikkan jadi 44, pelat bujur sangkar berkondisi 9 —
   * kasus yang sering dipakai — dihitung dengan momen 3,4× lipat. Hasilnya
   * bukan galat, melainkan angka meyakinkan yang salah.
   */
  it('Kondisi 9 @ Ly/Lx=1.0 TETAP 13 — bukan salah ketik, jangan "diperbaiki"', () => {
    expect(TABEL_KOEFISIEN[9].Clx[0]).toBe(13)
    expect(TABEL_KOEFISIEN[9].Ctx[0]).toBe(13)
  })

  it('nilai 13 muncul juga di kolom >2.5 kondisi 2·5·9 — pola tabel, bukan anomali', () => {
    const akhir = RASIO_TABEL.length - 1
    expect(TABEL_KOEFISIEN[2].Cly[akhir]).toBe(13)
    expect(TABEL_KOEFISIEN[5].Cly[akhir]).toBe(13)
    expect(TABEL_KOEFISIEN[9].Cly[akhir]).toBe(13)
  })

  it('KOREKSI hanya berisi dua entri — yang ketiga sudah dibatalkan', () => {
    expect(KOREKSI).toHaveLength(2)
    expect(KOREKSI.map((k) => k.kondisi).sort()).toEqual([3, 5])
  })
})

describe('koefisienMomen — pembacaan', () => {
  it('rasio persis di kolom tabel', () => {
    expect(koefisienMomen(1, 'Clx', 1.0).nilai).toBe(44)
    expect(koefisienMomen(1, 'Clx', 2.0).nilai).toBe(100)
  })

  it('rasio dibulatkan 1 desimal (cara yang sama dengan workbook)', () => {
    expect(koefisienMomen(1, 'Clx', 1.04).nilai).toBe(44)   // → 1.0
    expect(koefisienMomen(1, 'Clx', 1.06).nilai).toBe(52)   // → 1.1
  })

  it('rasio > 2.5 memakai kolom terakhir', () => {
    const h = koefisienMomen(1, 'Clx', 3.7)
    expect(h.nilai).toBe(125)
    expect(h.rasioDipakai).toBe(99)
  })

  it('menolak Ly/Lx < 1 — tabel mendefinisikan Ly sebagai sisi PANJANG', () => {
    // Tanpa penjagaan ini, pemakai yang menukar Lx/Ly mendapat koefisien dari
    // kolom pertama diam-diam, dan momennya salah tanpa gejala.
    expect(() => koefisienMomen(1, 'Clx', 0.8)).toThrow(/Ly\/Lx harus ≥ 1/)
  })
})

describe('tentukanKondisi — dari tumpuan ke nomor kondisi', () => {
  it('keempat bebas → 1, keempat menerus → 2', () => {
    expect(tentukanKondisi('bebas', 'bebas', 'bebas', 'bebas')).toBe(1)
    expect(tentukanKondisi('menerus', 'menerus', 'menerus', 'menerus')).toBe(2)
  })

  /**
   * Pemetaan ditentukan per SUMBU, bukan dari jumlah sisi menerus.
   *
   * Versi pertama fungsi ini memakai "jumlah menerus" dan LOLOS test yang
   * hanya menghitung — lalu salah untuk input contoh workbook (memulangkan 8
   * padahal 9). Test di bawah menyebut tumpuan per sumbu secara eksplisit
   * supaya kekeliruan yang sama tak bisa lolos lagi.
   *
   * Urutan argumen: (y1, y2, x1, x2)
   */
  it('kondisi 3·8·9 dibedakan per SUMBU, bukan jumlah sisi menerus', () => {
    // Ketiganya bisa punya jumlah menerus yang mirip; yang membedakan sumbunya.
    expect(tentukanKondisi('menerus', 'bebas', 'menerus', 'bebas')).toBe(3)  // Y campur, X campur
    expect(tentukanKondisi('menerus', 'bebas', 'menerus', 'menerus')).toBe(8) // Y campur, X penuh
    expect(tentukanKondisi('menerus', 'menerus', 'bebas', 'menerus')).toBe(9) // Y penuh, X campur
  })

  it('kondisi 4·5 — satu sumbu penuh menerus, satunya penuh bebas', () => {
    expect(tentukanKondisi('bebas', 'bebas', 'menerus', 'menerus')).toBe(4)
    expect(tentukanKondisi('menerus', 'menerus', 'bebas', 'bebas')).toBe(5)
  })

  it('kondisi 6·7 — satu sumbu penuh bebas, satunya campur', () => {
    expect(tentukanKondisi('bebas', 'bebas', 'menerus', 'bebas')).toBe(6)
    expect(tentukanKondisi('menerus', 'bebas', 'bebas', 'bebas')).toBe(7)
  })

  it('input contoh workbook (Y menerus·menerus, X bebas·menerus) → 9', () => {
    // Angka acuan yang menemukan kekeliruan sumbu di versi pertama.
    expect(tentukanKondisi('menerus', 'menerus', 'bebas', 'menerus')).toBe(9)
  })

  it('seluruh 16 kombinasi menghasilkan kondisi yang sah — tak ada yang jatuh', () => {
    // Workbook memakai rantai IF yang memulangkan TEKS KOSONG untuk kombinasi
    // tak dikenal, lalu momen jadi nol tanpa peringatan. Test ini memastikan
    // tak ada lubang seperti itu di sini.
    const t = ['bebas', 'menerus'] as const
    let n = 0
    for (const y1 of t) for (const y2 of t) for (const x1 of t) for (const x2 of t) {
      const k = tentukanKondisi(y1, y2, x1, x2)
      expect(k).toBeGreaterThanOrEqual(1)
      expect(k).toBeLessThanOrEqual(9)
      expect(TABEL_KOEFISIEN[k]).toBeDefined()
      n++
    }
    expect(n).toBe(16)
  })
})
