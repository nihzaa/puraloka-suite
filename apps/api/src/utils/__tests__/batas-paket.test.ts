import { describe, it, expect } from 'vitest'
import { bolehPakaiFitur, masihMuat, type BatasPaket, type BatasFitur } from '../batas-paket.js'

// ============================================================================
// BATAS PAKET — keputusan yang diuji di sini adalah ARAH GAGALNYA.
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA ARAH GAGAL ADALAH INTINYA
// ══════════════════════════════════════════════════════════════════════════
//
// Diukur 2026-08-31, saat modul ini ditulis:
//
//     companies                  1878 baris
//     subscriptions                 0 baris
//     plan_feature_values           0 baris
//
// Kalau gerbang ini gagal-TERTUTUP, maka pada detik ia dipasang 1878
// perusahaan kehilangan akses sekaligus — termasuk Puraloka Persada sendiri.
// Itu bukan penegakan batas, itu pemadaman.
//
// Dan kalau suatu hari ada yang "memperbaikinya" jadi gagal-tertutup — bentuk
// yang terlihat lebih aman untuk sebuah gerbang, dan benar untuk gerbang IZIN —
// kerusakannya menyeluruh dan seketika.
//
// Test di bawah ada supaya perubahan itu MERAH, bukan supaya angkanya cocok.
//
// Fungsi yang diuji MURNI: keputusannya dipisahkan dari pembacaannya justru
// supaya bisa diuji tanpa basis. `bacaBatasPaket()` yang menyentuh Postgres
// diuji terpisah lewat rute yang memakainya.
// ============================================================================

function fitur(x: Partial<BatasFitur> & { kunci: string }): BatasFitur {
  return {
    label: x.kunci,
    jenis: 'boolean',
    angka: null,
    boleh: null,
    teks: null,
    dariOverride: false,
    ...x,
  }
}

function batas(daftar: BatasFitur[], paketNama = 'Pro'): BatasPaket {
  return {
    dibatasi: true,
    paketKode: 'pro',
    paketNama,
    status: 'active',
    trialHabis: false,
    fitur: new Map(daftar.map((f) => [f.kunci, f])),
  }
}

const TANPA_LANGGANAN: BatasPaket = {
  dibatasi: false,
  paketKode: null,
  paketNama: null,
  status: null,
  trialHabis: false,
  fitur: new Map(),
}

describe('arah gagal — tanpa langganan berarti TAK DIBATASI', () => {
  it('fitur boolean terbuka saat tenant tak punya langganan', () => {
    // Kalau ini merah, 1878 perusahaan kehilangan akses pada saat modul
    // dipasang. Bukan hipotesis: itu jumlah baris `companies` hari ini,
    // dan `subscriptions` kosong.
    expect(bolehPakaiFitur(TANPA_LANGGANAN, 'modul.akuntansi').boleh).toBe(true)
  })

  it('kuota tak berlaku saat tenant tak punya langganan, berapa pun terpakainya', () => {
    expect(masihMuat(TANPA_LANGGANAN, 'kuota.proyek', 0).boleh).toBe(true)
    expect(masihMuat(TANPA_LANGGANAN, 'kuota.proyek', 9_999).boleh).toBe(true)
  })
})

describe('trial yang habis TETAP tunduk pada batas paketnya', () => {
  // ⚠ Percobaan pertama saya memulangkan "tak dibatasi" untuk trial yang
  // habis — artinya trial KEDALUWARSA memberi akses LEBIH BANYAK daripada
  // yang masih jalan. Membiarkan trial lewat jadi menguntungkan.
  //
  // Test ini ada supaya arah itu tak bisa kembali diam-diam.
  const habis: BatasPaket = {
    ...batas([fitur({ kunci: 'kuota.proyek', label: 'Proyek', jenis: 'integer', angka: 3 })]),
    status: 'trialing',
    trialHabis: true,
  }

  it('batas kuotanya TETAP menahan', () => {
    expect(masihMuat(habis, 'kuota.proyek', 3).boleh).toBe(false)
    expect(masihMuat(habis, 'kuota.proyek', 1).boleh).toBe(true)
  })

  it('penandanya terbawa supaya layar bisa mengatakannya', () => {
    // Yang menutup akses adalah mengubah status langganan di konsol vendor,
    // bukan gerbang ini. Penanda ini cuma supaya keadaannya bisa DIKATAKAN.
    expect(habis.trialHabis).toBe(true)
    expect(habis.dibatasi).toBe(true)
  })
})

describe('fitur yang TIDAK terdaftar dianggap terbuka', () => {
  it('fitur tak dikenal tetap boleh dipakai', () => {
    // Katalog fitur SELALU tertinggal dari kode. Modul ke-23 yang ditambahkan
    // besok belum punya barisnya — dan kalau "tak terdaftar" berarti
    // "tertutup", tiap fitur baru lahir mati untuk SEMUA pelanggan, termasuk
    // yang membayar paling mahal.
    expect(bolehPakaiFitur(batas([]), 'modul.yang.belum.ada').boleh).toBe(true)
    expect(masihMuat(batas([]), 'kuota.yang.belum.ada', 500).boleh).toBe(true)
  })

  it('menutup fitur harus DISENGAJA — ada barisnya, dan nilainya false', () => {
    const b = batas([fitur({ kunci: 'modul.akuntansi', label: 'Akuntansi', boleh: false })])
    const hasil = bolehPakaiFitur(b, 'modul.akuntansi')

    expect(hasil.boleh).toBe(false)
    // Pesannya menyebut FITUR dan PAKETNYA. Penolakan yang cuma berbunyi
    // "tidak diizinkan" membuat penggunanya menghubungi dukungan untuk
    // menanyakan sesuatu yang sudah kita ketahui.
    expect(hasil.alasan).toContain('Akuntansi')
    expect(hasil.alasan).toContain('Pro')
  })

  it('boolean bernilai true tetap boleh', () => {
    const b = batas([fitur({ kunci: 'modul.bi', boleh: true })])
    expect(bolehPakaiFitur(b, 'modul.bi').boleh).toBe(true)
  })
})

describe('kuota', () => {
  const b = batas([
    fitur({ kunci: 'kuota.proyek', label: 'Proyek aktif', jenis: 'integer', angka: 3 }),
  ])

  it('masih muat di bawah batas', () => {
    expect(masihMuat(b, 'kuota.proyek', 0).boleh).toBe(true)
    expect(masihMuat(b, 'kuota.proyek', 2).boleh).toBe(true)
  })

  it('menolak TEPAT di batas, bukan sesudah lewat', () => {
    // Batas 3 berarti boleh punya 3, jadi yang ke-4 ditolak — dan saat
    // terpakai SUDAH 3, menambah satu lagi membuatnya 4.
    //
    // `<=` di sini akan mengizinkan pelanggan punya 4 proyek pada paket
    // 3-proyek: cacat off-by-one yang tak pernah mengeluarkan galat, dan yang
    // baru ketahuan dari keluhan pelanggan lain yang membayar lebih.
    const hasil = masihMuat(b, 'kuota.proyek', 3)
    expect(hasil.boleh).toBe(false)
    expect(hasil.batas).toBe(3)
    expect(hasil.terpakai).toBe(3)
  })

  it('menyebut ANGKANYA saat menolak', () => {
    const hasil = masihMuat(b, 'kuota.proyek', 3)
    expect(hasil.alasan).toContain('3 dari 3')
    expect(hasil.alasan).toContain('Proyek aktif')
  })

  it('angka NULL berarti TAK TERBATAS, bukan nol', () => {
    // ⚠ Membalik arti keduanya membuat paket TERMAHAL jadi paket paling
    // terbatas. Dan 0 yang terbaca "tanpa batas" jauh lebih mudah lolos
    // tinjauan daripada kebalikannya, karena gejalanya tak muncul sampai ada
    // yang mencoba menambah sesuatu.
    const takTerbatas = batas([
      fitur({ kunci: 'kuota.proyek', jenis: 'integer', angka: null }),
    ])
    expect(masihMuat(takTerbatas, 'kuota.proyek', 100_000).boleh).toBe(true)
  })

  it('batas NOL benar-benar menutup', () => {
    // Kebalikan dari yang di atas: 0 adalah batas sungguhan bernilai nol, dan
    // harus menolak yang pertama sekalipun.
    const nol = batas([fitur({ kunci: 'kuota.proyek', jenis: 'integer', angka: 0 })])
    expect(masihMuat(nol, 'kuota.proyek', 0).boleh).toBe(false)
  })
})

describe('jenis nilai tak dipaksakan silang', () => {
  it('kuota yang ditanya sebagai boolean tidak menutup apa pun', () => {
    // Salah panggil TIDAK boleh berubah jadi penolakan diam-diam. Kalau
    // `bolehPakaiFitur` menolak fitur integer karena `boleh` kebetulan null,
    // satu salah ketik nama fungsi mematikan fitur yang sebenarnya terbuka.
    const b = batas([fitur({ kunci: 'kuota.proyek', jenis: 'integer', angka: 3 })])
    expect(bolehPakaiFitur(b, 'kuota.proyek').boleh).toBe(true)
  })

  it('boolean yang ditanya sebagai kuota tidak menutup apa pun', () => {
    const b = batas([fitur({ kunci: 'modul.bi', jenis: 'boolean', boleh: false })])
    expect(masihMuat(b, 'modul.bi', 999).boleh).toBe(true)
  })
})
