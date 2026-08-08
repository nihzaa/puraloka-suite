import { describe, it, expect } from 'vitest'
import { tujuanGrup } from './tujuan-grup'

/**
 * Yang diuji: aturan pemilihan, dan terutama KAPAN fungsinya menolak memilih.
 *
 * Penolakan justru bagian terpentingnya. Kalau ia menebak saat tak ada
 * kandidat yang jelas, sebagian pemakai akan dikirim ke halaman kerja acak
 * setiap kali mengklik nama grup — kegagalan yang terasa seperti bug tata
 * letak, bukan bug logika, jadi susah dilacak.
 */
describe('tujuanGrup', () => {
  it('memilih anak yang href-nya akar grup', () => {
    // Grup Keuangan: "Ringkasan Keuangan" /keuangan mengalahkan yang lain.
    expect(
      tujuanGrup({
        children: [
          { href: '/keuangan' },
          { href: '/keuangan/invoice' },
          { href: '/keuangan/pembayaran' },
        ],
      }),
    ).toBe('/keuangan')
  })

  it('urutan anak tidak memengaruhi hasil', () => {
    // Akar di posisi TERAKHIR — "ambil anak pertama" akan salah di sini.
    expect(
      tujuanGrup({
        children: [
          { href: '/procurement/pesanan' },
          { href: '/procurement/supplier' },
          { href: '/procurement' },
        ],
      }),
    ).toBe('/procurement')
  })

  it('null bila tak ada anak', () => {
    expect(tujuanGrup({ children: [] })).toBeNull()
    expect(tujuanGrup({})).toBeNull()
    expect(tujuanGrup({ children: null })).toBeNull()
  })

  it('null bila anak terdangkal pun bukan akar (grup tanpa halaman ringkasan)', () => {
    // Grup "Gudang": semua anaknya halaman kerja dua ruas. Tak ada ikhtisar.
    expect(
      tujuanGrup({
        children: [
          { href: '/gudang/rekonsiliasi' },
          { href: '/gudang/transfer' },
          { href: '/gudang/material-klien' },
        ],
      }),
    ).toBeNull()
  })

  it('null bila DUA kandidat sama kuat — tak ada dasar memilih', () => {
    // Dua akar berbeda, tak satu pun menaungi yang lain.
    expect(
      tujuanGrup({
        children: [
          { href: '/kepatuhan?bagian=kesiapan' },
          { href: '/mutu' },
        ],
      }),
    ).toBeNull()
  })

  it('query-string tidak dihitung sebagai ruas tambahan', () => {
    expect(
      tujuanGrup({
        children: [
          { href: '/jadwal?bagian=cpm' },
          { href: '/jadwal/detail' },
        ],
      }),
    ).toBe('/jadwal?bagian=cpm')
  })

  it('href yang bukan path diabaikan', () => {
    expect(
      tujuanGrup({
        children: [
          { href: null },
          { href: '' },
          { href: 'https://contoh.test' },
          { href: '/aset' },
        ],
      }),
    ).toBe('/aset')
  })

  it('anak yang seluruhnya tanpa href → null', () => {
    expect(tujuanGrup({ children: [{ href: null }, { href: undefined }] })).toBeNull()
  })

  // ── Kasus NYATA dari sidebar, diambil apa adanya ────────────────────────
  //
  // Tujuh kasus di bawah ini bukan karangan: seluruh href-nya disalin dari
  // DOM sidebar yang berjalan (13 grup induk, 9 Agustus 2026). Aturan versi
  // pertama lolos di test sintetis tetapi GAGAL pada tiga di antaranya —
  // itulah alasan blok ini ada.

  it('NYATA Kontrak: /kontrak menang atas /tender karena menaungi dua anak', () => {
    expect(
      tujuanGrup({
        children: [
          { href: '/kontrak' },
          { href: '/kontrak/rfi' },
          { href: '/kontrak/asuransi' },
          { href: '/tender' },
        ],
      }),
    ).toBe('/kontrak')
  })

  it('NYATA Proyek: /proyek menang meski ada 4 akar lain', () => {
    expect(
      tujuanGrup({
        children: [
          { href: '/proyek' },
          { href: '/proyek/keterlambatan' },
          { href: '/jadwal?bagian=cpm' },
          { href: '/jadwal?bagian=histogram' },
          { href: '/kalender' },
          { href: '/jadwal?bagian=method' },
          { href: '/klien' },
        ],
      }),
    ).toBe('/proyek')
  })

  it('NYATA Keuangan: 8 anak, /keuangan menaungi tujuh', () => {
    expect(
      tujuanGrup({
        children: [
          { href: '/keuangan' },
          { href: '/keuangan/invoice' },
          { href: '/keuangan/pembayaran' },
          { href: '/keuangan/ipc' },
          { href: '/keuangan/kasbon' },
          { href: '/keuangan/arus-kas' },
          { href: '/keuangan/profitabilitas' },
          { href: '/keuangan/contingency' },
        ],
      }),
    ).toBe('/keuangan')
  })

  it('NYATA Piutang: satu anak satu ruas → tetap dipilih', () => {
    // Tak ada yang bisa dinaungi, tapi juga tak ada yang bisa keliru.
    expect(tujuanGrup({ children: [{ href: '/piutang' }] })).toBe('/piutang')
  })

  it('NYATA Gudang: semua anak dua ruas → null', () => {
    expect(
      tujuanGrup({
        children: [
          { href: '/gudang/rekonsiliasi' },
          { href: '/gudang/transfer' },
          { href: '/gudang/material-klien' },
        ],
      }),
    ).toBeNull()
  })

  it('NYATA Administrasi: 15 halaman lepas, tak ada yang menaungi → null', () => {
    expect(
      tujuanGrup({
        children: [
          { href: '/users' },
          { href: '/pengaturan/roles' },
          { href: '/peta-modul' },
          { href: '/notifications' },
          { href: '/audit' },
          { href: '/sistem' },
        ],
      }),
    ).toBeNull()
  })

  it('/kas TIDAK dianggap menaungi /kasbon — awalan wajib pakai garis miring', () => {
    // Tanpa `path + "/"`, `startsWith("/kas")` cocok dengan "/kasbon" dan
    // dua modul berbeda tampak berhubungan.
    expect(
      tujuanGrup({ children: [{ href: '/kas' }, { href: '/kasbon' }] }),
    ).toBeNull()
  })
})
