import { describe, it, expect } from 'vitest'
import {
  ncrBerat, punchBerat, NCR_BERAT, PUNCH_BERAT, LABEL_KEPARAHAN,
  ncrTerbuka, punchTerbuka, NCR_SELESAI, PUNCH_SELESAI,
} from '../keparahan.js'

/*
  Yang diuji di sini adalah CACAT NYATA, bukan bentuk fungsinya.

  Sebelum 2026-09-13 ketiga penghitung memakai `/major|mayor|tinggi|high/i`,
  dan `kritis` — 6 dari 12 NCR terbuka di basis — tak terhitung berat.
  Test pertama di bawah adalah test yang akan MERAH kalau pola lama kembali.
*/
describe('keparahan — NCR', () => {
  it('menghitung `kritis` sebagai berat (cacat yang diperbaiki 2026-09-13)', () => {
    expect(ncrBerat('kritis')).toBe(true)
  })

  it('menghitung `major` sebagai berat', () => {
    expect(ncrBerat('major')).toBe(true)
  })

  it('TIDAK menghitung `minor` sebagai berat', () => {
    expect(ncrBerat('minor')).toBe(false)
  })

  /*
    Enum `ncr_severity` punya TEPAT tiga nilai. Test ini merah kalau
    ada yang ditambahkan tanpa ditimbang — bukan supaya angkanya tetap,
    melainkan supaya keputusannya SADAR.
  */
  it('meliputi seluruh enum ncr_severity, tanpa nilai yang menggantung', () => {
    const enumNcr = ['minor', 'major', 'kritis']
    const ditimbang = enumNcr.filter((v) => ncrBerat(v) || v === 'minor')
    expect(ditimbang.sort()).toEqual(enumNcr.sort())
  })

  it('nilai kosong BUKAN berat — baris belum diisi tak boleh memicu alarm', () => {
    expect(ncrBerat(null)).toBe(false)
    expect(ncrBerat(undefined)).toBe(false)
    expect(ncrBerat('')).toBe(false)
    expect(ncrBerat('   ')).toBe(false)
  })

  it('menormalkan huruf besar dan spasi — nilai bisa datang dari impor/AI', () => {
    expect(ncrBerat('Kritis')).toBe(true)
    expect(ncrBerat('  MAJOR  ')).toBe(true)
  })

  /*
    Kosakata NCR dan punch BERBEDA. `sedang` sah untuk punch, dan TAK
    PERNAH ada di NCR — memulangkan true untuknya berarti kedua daftar
    sudah tercampur.
  */
  it('tidak menerima kosakata punch pada NCR', () => {
    expect(ncrBerat('sedang')).toBe(false)
    expect(ncrBerat('berat')).toBe(false)
  })

  it('tidak menerima ejaan yang tak ada di enum mana pun', () => {
    expect(ncrBerat('high')).toBe(false)
    expect(ncrBerat('tinggi')).toBe(false)
  })
})

describe('keparahan — punch', () => {
  it('menghitung `berat` dan `kritis`', () => {
    expect(punchBerat('berat')).toBe(true)
    expect(punchBerat('kritis')).toBe(true)
  })

  it('TIDAK menghitung `ringan` maupun `sedang`', () => {
    expect(punchBerat('ringan')).toBe(false)
    expect(punchBerat('sedang')).toBe(false)
  })

  it('meliputi seluruh enum punch_severity', () => {
    const enumPunch = ['ringan', 'sedang', 'berat', 'kritis']
    for (const v of enumPunch) {
      expect(typeof punchBerat(v)).toBe('boolean')
      expect(LABEL_KEPARAHAN[v]).toBeTruthy()
    }
  })
})

/*
  Cacat KEDUA, ditemukan 2026-09-13 saat mengukur dampak yang pertama.

  Penyaring "terbuka" membandingkan dengan nilai yang TIDAK ADA di enum:
  `'closed'` untuk NCR, dan `'closed'` + `'selesai'` untuk punch. Nol galat
  — membandingkan dengan nilai yang tak ada adalah operasi yang sah, cuma
  hasilnya selalu `true`.

  Akibatnya `ditutup`/`ditolak`/`dibatalkan` ikut terhitung sebagai
  pekerjaan yang masih menunggu.
*/
describe('keparahan — status terbuka', () => {
  it('NCR `ditutup` dan `dibatalkan` TIDAK terbuka', () => {
    expect(ncrTerbuka('ditutup')).toBe(false)
    expect(ncrTerbuka('dibatalkan')).toBe(false)
  })

  it('NCR yang masih berjalan tetap terbuka', () => {
    for (const s of ['terbuka', 'disposisi', 'perbaikan', 'verifikasi']) {
      expect(ncrTerbuka(s), `'${s}' seharusnya terbuka`).toBe(true)
    }
  })

  it('punch `ditutup` dan `ditolak` TIDAK terbuka', () => {
    expect(punchTerbuka('ditutup')).toBe(false)
    expect(punchTerbuka('ditolak')).toBe(false)
  })

  it('punch yang masih berjalan tetap terbuka', () => {
    for (const s of ['terbuka', 'dikerjakan', 'menunggu_cek']) {
      expect(punchTerbuka(s), `'${s}' seharusnya terbuka`).toBe(true)
    }
  })

  /*
    Nilai yang TAK ADA di enum tak boleh dipakai sebagai penanda selesai —
    itu persis cacat yang diperbaiki. Test ini merah kalau `'closed'`
    atau `'selesai'` diselundupkan kembali ke daftar.
  */
  it('tak memakai nilai yang tak ada di enum sebagai penanda selesai', () => {
    const hantu = ['closed', 'selesai', 'done']
    for (const h of hantu) {
      expect(NCR_SELESAI as readonly string[]).not.toContain(h)
      expect(PUNCH_SELESAI as readonly string[]).not.toContain(h)
    }
  })

  it('status kosong dianggap TERBUKA — belum diisi bukan berarti beres', () => {
    expect(ncrTerbuka(null)).toBe(true)
    expect(punchTerbuka(undefined)).toBe(true)
  })
})

describe('keparahan — label', () => {
  /*
    Tiap nilai yang bisa sampai ke layar wajib punya label. Kunci yang
    tak terdaftar TIDAK gagal di `map[x] ?? x` — ia tampil mentah, dan
    itulah asal-usul lencana berbunyi `submitted` (CLAUDE.md §6).
  */
  it('tiap nilai kedua enum punya label Indonesia', () => {
    for (const v of ['minor', 'major', 'kritis', 'ringan', 'sedang', 'berat']) {
      expect(LABEL_KEPARAHAN[v], `label untuk '${v}' hilang`).toBeTruthy()
    }
  })

  it('tiap nilai BERAT punya labelnya sendiri', () => {
    for (const v of [...NCR_BERAT, ...PUNCH_BERAT]) {
      expect(LABEL_KEPARAHAN[v]).toBeTruthy()
    }
  })
})
