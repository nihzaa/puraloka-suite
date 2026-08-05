import { describe, it, expect } from 'vitest'
import { namaSapaan } from './nama-sapaan'

// ─────────────────────────────────────────────────────────────────────────────
// `namaSapaan` — nama panggilan di layar pertama portal mandor.
//
// Cacat aslinya: `user.name.split(" ")[0]`. Diukur ke basis dev, LIMA dari
// ENAM mandor disapa "Halo, Pak" — sapaan identik untuk semua orang, setiap
// hari, di layar yang pertama mereka buka.
//
// Kasus di bawah memakai nama SUNGGUHAN dari basis, bukan karangan. Nama
// karangan cenderung memakai bentuk yang kebetulan cocok dengan kodenya.
// ─────────────────────────────────────────────────────────────────────────────

describe('namaSapaan — sapaan Indonesia dipertahankan bersama namanya', () => {
  it.each([
    ['Pak Budi Santoso', 'Pak Budi'],
    ['Pak Hendra Wijaya', 'Pak Hendra'],
    ['Pak Suryo Wibowo', 'Pak Suryo'],
    ['Pak Wahyu Prasetyo', 'Pak Wahyu'],
  ])('%s → %s', (masuk, harap) => {
    expect(namaSapaan(masuk)).toBe(harap)
  })

  it('nama TANPA sapaan tetap dipotong ke kata pertama', () => {
    // Perilaku lama dipertahankan — yang diperbaiki hanya kasus bersapaan.
    expect(namaSapaan('Wardianto')).toBe('Wardianto')
    expect(namaSapaan('Wardianto Susilo')).toBe('Wardianto')
  })

  it('sapaan perempuan ikut dikenali', () => {
    expect(namaSapaan('Bu Siti Aminah')).toBe('Bu Siti')
    expect(namaSapaan('Ibu Ratna')).toBe('Ibu Ratna')
    expect(namaSapaan('Mbak Dwi Lestari')).toBe('Mbak Dwi')
  })

  it('gelar bertitik dikenali', () => {
    expect(namaSapaan('Ir. Bambang Sutrisno')).toBe('Ir. Bambang')
    expect(namaSapaan('H. Abdullah')).toBe('H. Abdullah')
  })

  it('huruf besar-kecil tidak berpengaruh', () => {
    expect(namaSapaan('PAK BUDI SANTOSO')).toBe('PAK BUDI')
    expect(namaSapaan('pak budi santoso')).toBe('pak budi')
  })

  it('sapaan tanpa nama dikembalikan apa adanya', () => {
    // Layar yang menyapa "Halo, " lebih buruk daripada "Halo, Pak".
    expect(namaSapaan('Pak')).toBe('Pak')
  })

  it('spasi berlebih tidak menghasilkan potongan kosong', () => {
    expect(namaSapaan('  Pak   Budi   Santoso  ')).toBe('Pak Budi')
  })

  it('nama kosong / null tidak melempar', () => {
    // Dipakai langsung di JSX; melempar di sini mengosongkan seluruh layar.
    expect(namaSapaan(null)).toBe('')
    expect(namaSapaan(undefined)).toBe('')
    expect(namaSapaan('')).toBe('')
    expect(namaSapaan('   ')).toBe('')
  })

  it('TIDAK membuang sapaannya — "Budi" saja terasa kurang hormat', () => {
    // Godaan yang wajar: buang sapaan, ambil namanya. Tapi di konteks
    // konstruksi, memanggil mandor tanpa "Pak" adalah penurunan hormat —
    // yang salah pada kode lama adalah membuang NAMANYA, bukan menyimpan
    // sapaannya.
    expect(namaSapaan('Pak Budi Santoso')).not.toBe('Budi')
  })
})
