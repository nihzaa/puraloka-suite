import { describe, it, expect, vi, afterEach } from 'vitest'
import { rapikanHost, tenantCadangan } from '../tenant'
import { resolveHost } from '../tenant-server'

vi.mock('next/headers', () => ({
  headers: vi.fn(),
}))
const { headers } = await import('next/headers')

function permintaan(h: Record<string, string>) {
  ;(headers as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    get: (k: string) => h[k.toLowerCase()] ?? null,
  })
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('rapikanHost — pembersihan murni', () => {
  /*
   * Diuji TERPISAH dari `resolveHost` karena ia murni: tak menyentuh
   * permintaan, jadi tak butuh `next/headers` dipalsukan.
   *
   * Pemisahan itu sendiri lahir dari kegagalan build 2026-09-04 —
   * `next/headers` menyeret modul ini ke bundle klien.
   */
  it('membuang port', () => {
    expect(rapikanHost('localhost:3200')).toBe('localhost')
  })
  it('menurunkan ke huruf kecil', () => {
    expect(rapikanHost('PortO.DuckDNS.org')).toBe('porto.duckdns.org')
  })
  it('mengambil host PERTAMA saat proxy menumpuk beberapa', () => {
    expect(rapikanHost('ptmakmur.co.id, internal.lb')).toBe('ptmakmur.co.id')
  })
  it('memulangkan string kosong untuk null — bukan melempar', () => {
    expect(rapikanHost(null)).toBe('')
  })
})

describe('resolveHost — hostname permintaan', () => {
  it('memulangkan host apa adanya', async () => {
    permintaan({ host: 'porto.puraloka-suite.duckdns.org' })
    expect(await resolveHost()).toBe('porto.puraloka-suite.duckdns.org')
  })

  it('mendahulukan x-forwarded-host — di balik nginx, `host` berisi nama kontainer', async () => {
    permintaan({ host: 'web-publik:3000', 'x-forwarded-host': 'ptmakmur.co.id' })
    expect(await resolveHost()).toBe('ptmakmur.co.id')
  })

  it('membuang PORT — localhost:3200 dan localhost adalah situs yang sama', async () => {
    permintaan({ host: 'localhost:3200' })
    expect(await resolveHost()).toBe('localhost')
  })

  it('menurunkan ke huruf kecil — pencocokan tak boleh bergantung cara mengetik', async () => {
    permintaan({ host: 'PortO.PuraLoka-Suite.DuckDNS.org' })
    expect(await resolveHost()).toBe('porto.puraloka-suite.duckdns.org')
  })

  it('mengambil host PERTAMA saat proxy menumpuk beberapa', async () => {
    // Rantai proxy menulis `a.com, b.internal`. Yang diketik pengunjung yang pertama.
    permintaan({ 'x-forwarded-host': 'ptmakmur.co.id, internal.lb' })
    expect(await resolveHost()).toBe('ptmakmur.co.id')
  })

  it('MELEMPAR saat host kosong, bukan meneruskannya sebagai host sah', async () => {
    permintaan({})
    await expect(resolveHost()).rejects.toThrow(/tidak tahu konten milik siapa/)
  })
})

describe('tenantCadangan — jatuhan env', () => {
  it('memulangkan company id di luar produksi', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('SITUS_COMPANY_ID', 'abc-123')
    expect(tenantCadangan()).toBe('abc-123')
  })

  /*
   * ⚠ Test yang paling penting di berkas ini.
   *
   * Jatuhan env adalah cara paling mudah membuat kebocoran tanpa gejala:
   * pengunjung membuka `ptmakmur.co.id`, hostnya belum terdaftar, dan situs
   * diam-diam menyajikan profil perusahaan LAIN — lengkap dengan proyek dan
   * legalitasnya. Tak ada galat, tak ada yang tahu.
   *
   * Di produksi host tak terdaftar HARUS gagal.
   */
  it('MATI di produksi meski env-nya terisi', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('SITUS_COMPANY_ID', 'abc-123')
    expect(tenantCadangan()).toBeNull()
  })

  it('memulangkan null saat env kosong', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('SITUS_COMPANY_ID', '')
    expect(tenantCadangan()).toBeNull()
  })
})
