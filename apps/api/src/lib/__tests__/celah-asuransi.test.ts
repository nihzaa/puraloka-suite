/**
 * CELAH ASURANSI — yang diuji adalah celah yang TAK TERLIHAT oleh pemeriksaan
 * biasa, bukan yang sudah jelas.
 *
 * Sebaran acuan dari basis nyata 2026-08-16 (sesudah seed 428):
 *   11 proyek aktif · 6 ber-CAR sehat · 1 kadaluarsa · 1 berakhir <30 hari
 *   1 hanya-TPL · 3 tanpa polis
 */
import { describe, it, expect } from 'vitest'
import { nilaiCelahAsuransi, type Polis } from '../celah-asuransi.js'

const HARI_INI = '2026-08-16'
const P = (jenis: string, status: string, selesai: string): Polis =>
  ({ jenis, status, periodeSelesai: selesai, nilaiPertanggungan: 100_000_000 })

describe('nilaiCelahAsuransi', () => {
  it('proyek tanpa polis sama sekali', () => {
    const h = nilaiCelahAsuransi([], HARI_INI, 30)
    expect(h.celah).toBe(true)
    expect(h.sebab).toBe('tanpa_polis')
  })

  it('PUNYA POLIS AKTIF TAPI HANYA TPL — celah yang paling tenang', () => {
    /*
      Ini alasan utama automation ini ada.

      Proyek ini punya polis AKTIF dan BELUM kadaluarsa. Pemeriksaan yang cuma
      bertanya "punya polis?" atau "polisnya masih berlaku?" akan menjawab YA
      pada keduanya, dan proyek ini muncul sebagai terasuransi di daftar mana
      pun.

      Tetapi TPL menanggung kerugian PIHAK KETIGA. Kebakaran, longsor, atau
      banjir yang merusak PEKERJAANNYA SENDIRI tak ditanggung siapa pun.

      Tak ada galat, tak ada tanggal yang lewat, tak ada kolom kosong. Cuma
      jenis polis yang salah — dan itu baru ketahuan saat klaim ditolak.
    */
    const h = nilaiCelahAsuransi([P('tpl', 'aktif', '2027-04-12')], HARI_INI, 30)
    expect(h.polisAktif).toBe(1)              // polisnya ADA dan aktif
    expect(h.celah).toBe(true)                // tetap celah
    expect(h.sebab).toBe('tak_menanggung_pekerjaan')
  })

  it('`jamsostek` juga tidak menanggung pekerjaan', () => {
    // Asuransi tenaga kerja menanggung PEKERJA, bukan pekerjaan. Sama-sama
    // wajib, sama-sama bukan pengganti CAR.
    const h = nilaiCelahAsuransi([P('jamsostek', 'aktif', '2027-01-01')], HARI_INI, 30)
    expect(h.sebab).toBe('tak_menanggung_pekerjaan')
  })

  it('`car_tpl` DIHITUNG menanggung — gabungan dalam satu polis', () => {
    // Kalau `car_tpl` tak dikenali, proyek yang justru paling lengkap
    // perlindungannya akan dilaporkan sebagai celah.
    const h = nilaiCelahAsuransi([P('car_tpl', 'aktif', '2027-03-15')], HARI_INI, 30)
    expect(h.celah).toBe(false)
    expect(h.sebab).toBe('terlindungi')
  })

  it('polis kadaluarsa dilaporkan sebagai TAK TERLINDUNGI SEKARANG', () => {
    const h = nilaiCelahAsuransi([P('car', 'kadaluarsa', '2026-06-01')], HARI_INI, 30)
    expect(h.polis).toBe(1)
    expect(h.polisAktif).toBe(0)
    expect(h.sebab).toBe('semua_kadaluarsa')
  })

  it('kadaluarsa didahulukan atas salah-jenis — tindakannya lebih segera', () => {
    // Proyek dengan CAR kadaluarsa DAN TPL aktif memenuhi dua celah.
    // Yang dilaporkan `semua_kadaluarsa`? BUKAN — TPL-nya masih aktif, jadi
    // `polisAktif > 0`. Yang benar: salah-jenis.
    const h = nilaiCelahAsuransi(
      [P('car', 'kadaluarsa', '2026-06-01'), P('tpl', 'aktif', '2027-04-12')],
      HARI_INI, 30)
    expect(h.polisAktif).toBe(1)
    expect(h.sebab).toBe('tak_menanggung_pekerjaan')
  })

  it('CAR yang segera berakhir ditandai', () => {
    // Berakhir 2026-09-05, hari ini 2026-08-16 → 20 hari.
    const h = nilaiCelahAsuransi([P('car', 'aktif', '2026-09-05')], HARI_INI, 30)
    expect(h.hariTersisa).toBe(20)
    expect(h.celah).toBe(true)
    expect(h.sebab).toBe('segera_berakhir')
  })

  it('SISA HARI diambil dari polis TERJAUH, bukan terdekat', () => {
    /*
      Proyek boleh punya beberapa CAR bertumpuk — perpanjangan yang sudah
      diterbitkan lebih awal sementara yang lama belum habis.

      Memakai yang TERDEKAT akan melaporkan "segera berakhir" untuk proyek yang
      perpanjangannya justru sudah di tangan. Peringatan palsu pada proyek yang
      paling rapi administrasinya — dan itu cara tercepat membuat orang berhenti
      membaca peringatan asuransi.
    */
    const h = nilaiCelahAsuransi([
      P('car', 'aktif', '2026-09-05'),   // 20 hari lagi
      P('car', 'aktif', '2027-09-05'),   // perpanjangannya, sudah terbit
    ], HARI_INI, 30)
    expect(h.hariTersisa).toBeGreaterThan(300)
    expect(h.celah).toBe(false)
  })

  it('polis dibatalkan tidak dihitung aktif', () => {
    const h = nilaiCelahAsuransi([P('car', 'dibatalkan', '2027-01-01')], HARI_INI, 30)
    expect(h.polisAktif).toBe(0)
    expect(h.sebab).toBe('semua_kadaluarsa')
  })

  it('proyek ber-CAR sehat tidak dilaporkan', () => {
    const h = nilaiCelahAsuransi([P('car', 'aktif', '2027-02-01')], HARI_INI, 30)
    expect(h.celah).toBe(false)
    expect(h.sebab).toBe('terlindungi')
  })
})
