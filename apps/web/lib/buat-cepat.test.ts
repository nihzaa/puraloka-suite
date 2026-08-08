import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { AKSI_BUAT, saringAksi, type AksiBuat } from './buat-cepat'

describe('AKSI_BUAT', () => {
  /*
   * TIAP `href` DIPERIKSA KE DISK.
   *
   * Menu yang mengirim orang ke 404 lebih buruk daripada tak ada menu, dan
   * cacat ini sudah pernah terjadi: rail beranda sempat menautkan
   * `/kontrak/klaim` dan `/lapangan/instruksi` — dua rute yang tak pernah ada.
   * Yang menemukannya adalah test seperti ini, bukan peninjauan.
   *
   * Test ini juga menjaga arah sebaliknya: kalau kelak ada yang MEMINDAHKAN
   * atau menghapus halaman, menu ini merah di CI, bukan diam-diam rusak.
   */
  it('setiap href menunjuk halaman yang benar-benar ada di disk', () => {
    for (const a of AKSI_BUAT) {
      const berkas = join(process.cwd(), 'app', '(dashboard)', a.href, 'page.tsx')
      expect(existsSync(berkas), `${a.label}: ${a.href} tidak ada (${berkas})`).toBe(true)
    }
  })

  it('tidak ada href atau label kembar', () => {
    expect(new Set(AKSI_BUAT.map((a) => a.href)).size).toBe(AKSI_BUAT.length)
    expect(new Set(AKSI_BUAT.map((a) => a.label)).size).toBe(AKSI_BUAT.length)
  })

  it('setiap aksi punya izin yang berbentuk kunci permission', () => {
    for (const a of AKSI_BUAT) {
      // Bentuk `domain:sub:aksi` atau `domain:aksi` — sama dengan katalog DB.
      expect(a.izin, a.label).toMatch(/^[a-z_]+(:[a-z_]+){1,2}$/)
    }
  })

  /* Menu yang dibuka sekilas: lebih dari enam baris tak lagi terbaca cepat. */
  it('jumlahnya tetap ringkas', () => {
    expect(AKSI_BUAT.length).toBeLessThanOrEqual(6)
    expect(AKSI_BUAT.length).toBeGreaterThan(0)
  })
})

describe('saringAksi', () => {
  const contoh: AksiBuat[] = [
    { label: 'A', href: '/a', izin: 'a:create', ikon: 'Building2' },
    { label: 'B', href: '/b', izin: 'b:create', ikon: 'FileText' },
  ]

  it('hanya mengembalikan aksi yang diizinkan', () => {
    const h = saringAksi((k) => k === 'a:create', contoh)
    expect(h.map((x) => x.label)).toEqual(['A'])
  })

  it('tanpa izin apa pun mengembalikan daftar kosong', () => {
    expect(saringAksi(() => false, contoh)).toEqual([])
  })

  /*
   * GAGAL-TERTUTUP. Pemeriksa yang melempar (mis. localStorage rusak) tak
   * boleh membuat aksi MUNCUL — menawarkan tombol yang tak berhak ditekan
   * adalah arah kegagalan yang salah untuk menu aksi (Ember [C], CLAUDE.md §5.3).
   */
  it('pemeriksa yang melempar diperlakukan sebagai tidak boleh', () => {
    const h = saringAksi(() => { throw new Error('localStorage mati') }, contoh)
    expect(h).toEqual([])
  })

  it('pemeriksa yang bukan fungsi tidak bikin galat', () => {
    // @ts-expect-error — sengaja: menjaga pemanggil yang salah tipe saat runtime
    expect(saringAksi(null, contoh)).toEqual([])
  })

  it('nilai selain true dianggap tidak boleh', () => {
    // @ts-expect-error — sengaja: pemeriksa longgar yang mengembalikan truthy
    const h = saringAksi(() => 'ya', contoh)
    expect(h).toEqual([])
  })
})
