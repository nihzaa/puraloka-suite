/**
 * ══════════════════════════════════════════════════════════════════════════════
 * LEMBAR PERHITUNGAN STRUKTUR — dokumen yang bisa ditandatangani
 *
 * Modul struktur menyatakan sendiri batasnya: "MEMBANTU estimasi, bukan
 * menggantikan perhitungan bertanda tangan insinyur". Kalimat itu benar — dan
 * selama ini menggantung, karena insinyur yang mau menandatangani TAK PUNYA
 * LEMBAR untuk ditandatangani.
 *
 * Seluruh hasilnya hanya hidup di layar: tak bisa dilampirkan ke pengajuan
 * IMB, tak bisa dikirim ke pemilik proyek, tak bisa diarsipkan saat proyek
 * disengketakan bertahun-tahun kemudian.
 *
 * ── Kenapa BUKAN sekadar mencetak layar
 *
 * Lembar perhitungan teknik punya bentuk yang sudah mapan, dan bentuk itu
 * bukan gaya melainkan FUNGSI:
 *
 *   KOP + nomor      supaya bisa dirujuk di surat lain dan dicari di arsip
 *   ACUAN standar    supaya pemeriksa tahu aturan mana yang dipakai
 *   INPUT terpisah   supaya bisa diperiksa "angka ini dari mana?"
 *   RUMUS + angkanya supaya bisa dihitung ulang dengan tangan
 *   VERDICT per baris supaya yang gagal tak tenggelam di antara yang lolos
 *   BATAS eksplisit  supaya yang menandatangani tahu apa yang TIDAK diperiksa
 *   RUANG tanda tangan
 *
 * Yang terakhir bukan formalitas: tanda tangan adalah pernyataan bahwa
 * seseorang MEMERIKSA, dan lembar tanpa ruang untuk itu diam-diam mengaku
 * bahwa tak ada yang memeriksanya.
 *
 * ── Dua lapis, dalam satu dokumen
 *
 * Halaman pertama memuat RINGKASAN AWAM — kalimat yang bisa dibaca pemilik
 * proyek. Halaman berikutnya memuat angka dan rumusnya untuk insinyur.
 * Keduanya turunan dari verdict yang SAMA, jadi tak mungkin berselisih.
 *
 * ── Berkas ini PURE
 *
 * Ia menyusun STRUKTUR dokumennya (bagian, baris, kolom) sebagai data, bukan
 * menggambar PDF. Penggambarannya di `struktur-lembar-pdf.ts`.
 *
 * Alasannya sama dengan seluruh modul struktur: susunan yang salah tak
 * menimbulkan galat, ia menghasilkan dokumen yang terlihat wajar dengan
 * bagian yang hilang. Satu-satunya cara menangkapnya adalah menguji
 * susunannya sebagai DATA — dan itu hanya murah kalau ia bisa dipanggil tanpa
 * pdfkit, tanpa basis, tanpa berkas.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import type { Periksa } from './struktur-beton.js'
import { jelaskan, ringkasanAwam, tingkatBahaya, apakahBiner } from './struktur-awam.js'
import { labelK } from './struktur-mutu-nyata.js'

/** Satu baris pemeriksaan pada lembar. */
export interface BarisLembar {
  nama: string
  /** Kalimat awam — judul terjemahannya. */
  judulAwam: string | null
  nilai: number
  syarat: number
  satuan: string
  aman: boolean
  /** Persen terpakai, sudah dibulatkan. `null` untuk pemeriksaan biner. */
  persen: number | null
  rumus: string | null
  tingkat: 'aman' | 'mepet' | 'bahaya'
}

/** Satu elemen pada lembar. */
export interface BagianElemen {
  kode: string
  nama: string | null
  jenis: string
  jumlah: number
  /** Kalimat ringkasan untuk pembaca non-teknis. */
  ringkasanAwam: string
  tingkat: 'aman' | 'mepet' | 'bahaya'
  /** Input apa adanya — supaya bisa diperiksa "angka ini dari mana". */
  /*
    `medan` = nama terbaca, `kunci` = nama asli di JSON, `satuan` dipisah.
    Ketiganya dicetak: dua lapis pembaca, satu tabel.
  */
  input: Array<{ medan: string; kunci: string; satuan: string | null; nilai: string }>
  periksa: BarisLembar[]
  catatan: string[]
  /** Volume untuk RAB, bila elemennya bervolume. */
  volume: Array<{ uraian: string; nilai: number; satuan: string }>
  /** SVG gambar kerja, bila ada. */
  gambar: Array<{ judul: string; svg: string }>
  /*
    Data untuk MENGGAMBAR ULANG diagram momen/geser di PDF.

    SVG-nya tak bisa ditanam (pdfkit butuh pustaka tambahan — lihat kepala
    `struktur-lembar-pdf.ts`), tapi diagram beban cuma garis dan kurva:
    pdfkit menggambar keduanya secara asli. Jadi yang dibawa ke sini
    ANGKANYA, dan bentuknya digambar ulang di sana.

    `null` bila elemennya tak dihitung dari beban — dan itu benar: lembar
    tak boleh menggambar diagram untuk momen yang diketik langsung, karena
    bentuknya tak pernah dihitung siapa pun.
  */
  diagram: {
    muKnm: number; vuKn: number; skema: string
    bentangM: number; quKnM: number
  } | null
}

export interface LembarPerhitungan {
  /** Nomor dokumen — dirujuk di surat lain dan dicari di arsip. */
  nomor: string
  judul: string
  proyek: { nama: string; lokasi: string | null }
  penerbit: {
    nama: string
    alamat: string | null
    kota: string | null
    telepon: string | null
  }
  tanggal: string
  /** Standar yang dipakai — pemeriksa perlu tahu aturan mana. */
  acuan: string[]
  /** Ringkasan seluruh elemen: berapa aman, berapa tidak. */
  ikhtisar: {
    jumlahElemen: number
    jumlahAman: number
    jumlahTidakAman: number
    jumlahBelumDihitung: number
    /** Kalimat yang bisa dibaca pemilik proyek. */
    kalimat: string
  }
  bagian: BagianElemen[]
  /** Batas tanggung jawab — apa yang TIDAK diperiksa lembar ini. */
  batas: string[]
  tandaTangan: Array<{ peran: string; nama: string | null }>
}

/**
 * Acuan standar yang dipakai modul struktur.
 *
 * Ditulis di sini, bukan di penggambar PDF — pemeriksa yang membandingkan
 * lembar ini dengan perhitungannya sendiri butuh tahu versi standarnya, dan
 * daftar yang hidup di dua tempat akan menyimpang.
 */
export const ACUAN_STANDAR = [
  'SNI 2847:2019 — Persyaratan beton struktural untuk bangunan gedung',
  'SNI 1729:2020 — Spesifikasi untuk bangunan gedung baja struktural',
  'SNI 1726:2019 — Tata cara perencanaan ketahanan gempa',
  'SNI 1727:2020 — Beban desain minimum',
  'SNI 7973:2013 — Spesifikasi desain untuk konstruksi kayu',
  'SNI 7971:2013 — Struktur baja canai dingin',
  'SNI 8460:2017 — Persyaratan perancangan geoteknik',
] as const

/**
 * Batas tanggung jawab — WAJIB tercetak, dan wajib di halaman yang sama
 * dengan ruang tanda tangan.
 *
 * Yang menandatangani harus melihat apa yang TIDAK diperiksa sebelum
 * membubuhkan namanya. Menaruhnya di halaman terpisah membuat orang
 * menandatangani halaman terakhir tanpa membaca halaman sebelumnya.
 */
export const BATAS_TANGGUNG_JAWAB = [
  'Lembar ini dihasilkan alat bantu perhitungan, dan MEMBANTU perencanaan — '
  + 'bukan menggantikan perhitungan bertanda tangan insinyur berkeahlian.',
  'Angka yang tercetak dapat diperiksa ulang: tiap pemeriksaan membawa rumus '
  + 'beserta nilai dan syaratnya.',
  'Pemodelan struktur secara keseluruhan (analisa rangka, distribusi gaya '
  + 'antar elemen, interaksi tanah-struktur) TIDAK dilakukan di sini. Gaya '
  + 'dalam yang dipakai adalah yang DIMASUKKAN pengguna.',
  'Batas per elemen tercantum pada catatan masing-masing bagian. Baca '
  + 'seluruhnya sebelum menandatangani.',
] as const

/** Bentuk elemen yang masuk ke penyusun lembar. */
export interface ElemenLembar {
  kode: string
  nama?: string | null
  jenis: string
  jumlah?: number | null
  input: Record<string, unknown>
  hasil: {
    periksa?: Periksa[]
    catatan?: string[]
    aman?: boolean
    volume?: Record<string, unknown>
  } | null
  gambar?: Record<string, string>
}

/** Angka dirapikan tanpa kehilangan ketelitian yang berarti. */
function angka(v: unknown): string {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return '—'
    const b = Math.round(v * 1000) / 1000
    return String(b).replace('.', ',')
  }
  if (v == null) return '—'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

/**
 * Ratakan input bersarang jadi daftar "medan → nilai".
 *
 * Input struktur sering bersarang (`mutu: { fcMpa, fyMpa }`), dan mencetaknya
 * sebagai JSON membuat lembar tak terbaca. Diratakan dengan awalan supaya
 * asal-usulnya tetap jelas.
 */
/*
  ══════════════════════════════════════════════════════════════════════════
  NAMA MEDAN YANG BISA DIBACA ORANG
  ══════════════════════════════════════════════════════════════════════════

  Tabel DATA MASUKAN sebelumnya mencetak kunci mentah: `bMm`, `mutu.fcMpa`,
  `dSengkangMm`. Di layar keputusan itu sudah buruk; di lembar yang
  DITANDATANGANI dan dikirim ke pemilik proyek, itu membuat dokumennya
  terbaca seperti bocoran struktur data.

  Repo ini bahkan punya penjaga untuk bentuk cacat yang sama di tempat lain
  (`audit-jenis-tulis-punya-label.mjs`) — "kunci mentah muncul di layar
  keputusan uang".

  ── Kenapa DITURUNKAN dari kuncinya, bukan disalin dari daftar UI

  `apps/web` punya `MEDAN: Record<Jenis, Medan[]>` lengkap dengan label dan
  satuan. Menyalinnya ke sini berarti DUA daftar untuk hal yang sama, dan
  yang menyimpang tak akan ketahuan: lembar tetap terbit, hanya labelnya
  yang diam-diam berbeda dari yang dilihat pengguna saat mengisi.

  Sesi ini sudah membayar pelajaran itu dua kali dalam bentuk lain (contoh
  input yang ditulis ulang di skrip uji, lalu ditolak rute).

  API juga tak boleh mengimpor dari `apps/web`. Jadi yang dilakukan di sini
  adalah menurunkan nama terbaca DARI KUNCINYA — aturan mekanis, tanpa
  daftar kedua yang bisa basi:

    bMm          -> "Lebar b (mm)"
    mutu.fcMpa   -> "Mutu - f'c (MPa)"
    dSengkangMm  -> "Diameter sengkang (mm)"

  Kunci aslinya TETAP dicetak di sebelahnya (huruf kecil, abu) — insinyur
  yang mencocokkan dengan input JSON tetap bisa, dan orang non-teknis tak
  lagi menghadapi `dSengkangMm`.
*/
const AWALAN_MEDAN: ReadonlyArray<readonly [RegExp, string]> = [
  [/^d(?=[A-Z])/, 'Diameter '], [/^n(?=[A-Z])/, 'Jumlah '],
  [/^t(?=[A-Z])/, 'Tebal '], [/^h(?=[A-Z])/, 'Tinggi '],
  [/^b(?=[A-Z])/, 'Lebar '], [/^L(?=[A-Z])/, 'Panjang '],
]

/** Satuan yang tersirat dari akhiran kunci. */
const SATUAN_MEDAN: ReadonlyArray<readonly [RegExp, string]> = [
  [/Mpa$/i, 'MPa'], [/Knm$/i, 'kNm'], [/Kn$/i, 'kN'], [/Mm$/i, 'mm'],
  [/M2$/i, 'm2'], [/M3$/i, 'm3'], [/M$/, 'm'], [/Kg$/i, 'kg'],
  [/Persen$/i, '%'], [/Menit$/i, 'menit'], [/Derajat$/i, 'derajat'],
]

/**
 * Ubah kunci medan jadi nama yang bisa dibaca orang non-teknis.
 *
 * Mengembalikan `{ label, satuan }` — satuannya dipisah supaya bisa
 * ditaruh di kolom sendiri, bukan disambung ke dalam nama.
 */
export function namaMedan(kunci: string): { label: string; satuan: string | null } {
  /*
    Kunci bersarang (`mutu.fcMpa`) dipecah dulu: induknya jadi awalan
    berpemisah, bukan bagian dari nama medannya.
  */
  const bagian = kunci.split('.')
  const daun = bagian[bagian.length - 1]
  const induk = bagian.slice(0, -1)

  let satuan: string | null = null
  let inti = daun
  for (const [pola, sat] of SATUAN_MEDAN) {
    if (pola.test(inti)) {
      satuan = sat
      inti = inti.replace(pola, '')
      break
    }
  }

  /*
    `fc` dan `fy` adalah lambang baku, bukan singkatan yang perlu diurai.
    Menguraikannya jadi "F c" justru menjauhkannya dari yang tertulis di
    SNI dan di gambar kerja.
  */
  const BAKU: Record<string, string> = { fc: "f'c", fy: 'fy', fu: 'fu', ka: 'Ka', kh: 'kh' }
  let label = BAKU[inti]

  if (!label) {
    for (const [pola, ganti] of AWALAN_MEDAN) {
      if (pola.test(inti)) { inti = inti.replace(pola, ganti); break }
    }
    /* camelCase dipisah jadi kata: `jarakSengkang` -> `jarak Sengkang`. */
    label = inti.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase()
    label = label.charAt(0).toUpperCase() + label.slice(1)
  }

  if (induk.length) {
    const awalan = induk.map((x) => x.charAt(0).toUpperCase() + x.slice(1)).join(' - ')
    label = `${awalan} - ${label}`
  }
  return { label: label.trim(), satuan }
}

export function ratakanInput(
  obj: Record<string, unknown>, awalan = '',
): Array<{ medan: string; kunci: string; satuan: string | null; nilai: string }> {
  const hasil: Array<{ medan: string; kunci: string; satuan: string | null; nilai: string }> = []
  for (const [k, v] of Object.entries(obj)) {
    const nama = awalan ? `${awalan}.${k}` : k
    if (v != null && typeof v === 'object' && !Array.isArray(v)) {
      hasil.push(...ratakanInput(v as Record<string, unknown>, nama))
    } else if (Array.isArray(v)) {
      /*
        Larik (lapisan tanah, batang rangka) diringkas jumlahnya, bukan
        dicetak seluruhnya — sepuluh lapisan tanah akan menenggelamkan
        seluruh tabel input.
      */
      const n = namaMedan(nama)
      hasil.push({ medan: n.label, kunci: nama, satuan: null, nilai: `${v.length} baris` })
    } else {
      const n = namaMedan(nama)
      /*
        Mutu BETON membawa padanan K-nya ke lembar.

        Lembar ini dibaca dua pihak: insinyur yang memeriksa rumusnya
        (butuh f'c MPa, itu yang masuk SNI 2847) dan orang lapangan yang
        memesan betonnya (butuh K). Menulis salah satu saja memaksa yang
        lain mengonversi di kepala — dan konversi di kepala pada angka
        yang menentukan kekuatan adalah tempat kesalahan lahir.

        Hanya untuk mutu beton (`fc`), bukan baja (`fy`): baja tak punya
        padanan K, dan menampilkannya di sana mengarang satuan yang tak ada.
      */
      const kMutu = /(^|\.)fc[A-Z]/.test(nama) ? labelK(Number(v)) : null
      hasil.push({
        medan: n.label,
        kunci: nama,
        satuan: kMutu ? `${n.satuan ?? ''} (${kMutu})`.trim() : n.satuan,
        nilai: angka(v),
      })
    }
  }
  return hasil
}
/** Susun satu bagian elemen. */
export function susunBagian(el: ElemenLembar): BagianElemen {
  const periksaMentah = el.hasil?.periksa ?? []

  const periksa: BarisLembar[] = periksaMentah.map((p) => {
    const biner = apakahBiner(p.nama)
    const terjemah = jelaskan(p.nama)
    return {
      nama: p.nama,
      judulAwam: terjemah?.judul ?? null,
      nilai: p.nilai,
      syarat: p.syarat,
      satuan: p.satuan,
      aman: p.aman,
      /*
        Pemeriksaan BINER tak punya "seberapa terpakai" — memberinya persen
        menghasilkan "0%" yang dibaca sebagai "kapasitasnya nol", kebalikan
        dari artinya. Cacat yang sama sudah pernah muncul di meteran layar.
      */
      persen: biner ? null : Math.round(p.rasio * 100),
      rumus: p.rumus ?? null,
      tingkat: tingkatBahaya(p.rasio, p.aman),
    }
  })

  const ringkas = ringkasanAwam(
    periksaMentah.map((p) => ({
      nama: p.nama, aman: p.aman, rasio: p.rasio, biner: apakahBiner(p.nama),
    })),
  )

  /* Volume untuk RAB — hanya yang > 0, supaya baris nol tak jadi keramaian. */
  const v = el.hasil?.volume as Record<string, number> | undefined
  const volume: BagianElemen['volume'] = []
  if (v) {
    const petaVolume: Array<[string, string, string]> = [
      ['betonM3', 'Beton', 'm³'],
      ['bekistingM2', 'Bekisting', 'm²'],
      ['besiTotalKg', 'Besi', 'kg'],
    ]
    for (const [kunci, uraian, satuan] of petaVolume) {
      const n = Number(v[kunci])
      if (Number.isFinite(n) && n > 0) volume.push({ uraian, nilai: n, satuan })
    }
  }

  /*
    Gambar: medan `…Gagal` DIBUANG, dan `meteran` juga.

    Meteran adalah batang persen yang sudah diwakili kolom "terpakai" di
    tabel — mencetaknya lagi memboroskan halaman tanpa menambah apa pun.
  */
  const JUDUL_GAMBAR: Record<string, string> = {
    penampang: 'Penampang', potongan: 'Potongan',
    pondasi: 'Denah & potongan', diagramPM: 'Diagram interaksi P-M',
    denah: 'Denah', tampak: 'Tampak', pola: 'Pola sambungan',
    diagramBeban: 'Beban, momen & gaya lintang',
  }
  /*
    Diagram diambil dari `antara` hasil hitung bila ada — di situlah
    `analisaBebanBalok` menaruh momen, geser, dan skemanya.
  */
  const h = el.hasil as { antara?: Record<string, unknown> } | null
  const a = h?.antara ?? {}
  const inp = (el.input ?? {}) as Record<string, unknown>
  const diagram = Number.isFinite(Number(a.muKnm)) && Number.isFinite(Number(inp.bentangM))
    ? {
      muKnm: Number(a.muKnm), vuKn: Number(a.vuKn),
      skema: String(a.skema ?? 'sederhana'),
      bentangM: Number(inp.bentangM), quKnM: Number(a.quKnM ?? 0),
    }
    : null

  const gambar = Object.entries(el.gambar ?? {})
    .filter(([k, sv]) => !k.endsWith('Gagal') && k !== 'meteran'
      && typeof sv === 'string' && sv.includes('<svg'))
    .map(([k, svg]) => ({ judul: JUDUL_GAMBAR[k] ?? k, svg }))

  return {
    kode: el.kode,
    nama: el.nama ?? null,
    jenis: el.jenis,
    jumlah: Number(el.jumlah ?? 1),
    ringkasanAwam: ringkas.kalimat,
    tingkat: ringkas.tingkat,
    input: ratakanInput(el.input ?? {}),
    diagram,
    periksa,
    catatan: el.hasil?.catatan ?? [],
    volume,
    gambar,
  }
}

export interface OpsiLembar {
  nomor?: string
  tanggal?: string
  proyek: { nama: string; lokasi?: string | null }
  penerbit?: {
    nama?: string | null
    alamat?: string | null
    kota?: string | null
    telepon?: string | null
  } | null
  /** Nama yang akan menandatangani, bila sudah diketahui. */
  disusunOleh?: string | null
  diperiksaOleh?: string | null
}

/**
 * Susun lembar perhitungan lengkap.
 *
 * PURE: tak menyentuh basis, tak menggambar PDF. Keluarannya struktur data
 * yang bisa diuji sebagai angka dan teks.
 */
export function susunLembar(
  elemen: ElemenLembar[],
  opsi: OpsiLembar,
): LembarPerhitungan {
  if (!Array.isArray(elemen)) {
    throw new Error('Daftar elemen wajib berupa larik')
  }
  if (!opsi?.proyek?.nama) {
    throw new Error(
      'Nama proyek wajib diisi — lembar perhitungan tanpa nama proyek tak '
      + 'bisa diarsipkan maupun dirujuk.',
    )
  }

  const bagian = elemen.map(susunBagian)

  /*
    Elemen yang BELUM dihitung dibedakan dari yang TIDAK AMAN.

    Keduanya bukan "aman", tetapi tindakannya berbeda jauh: yang belum
    dihitung tinggal dihitung; yang tidak aman harus diubah desainnya.
    Menggabungkannya jadi satu angka membuat pembacanya salah menaksir
    pekerjaan yang tersisa.
  */
  const belumDihitung = elemen.filter((e) => !e.hasil?.periksa?.length).length
  const tidakAman = bagian.filter(
    (b) => b.periksa.length > 0 && b.periksa.some((p) => !p.aman),
  ).length
  const aman = bagian.length - tidakAman - belumDihitung

  let kalimat: string
  if (!bagian.length) {
    kalimat = 'Belum ada elemen struktur yang dimasukkan.'
  } else if (belumDihitung === bagian.length) {
    kalimat = `Seluruh ${bagian.length} elemen BELUM dihitung.`
  } else if (tidakAman > 0) {
    kalimat = `${tidakAman} dari ${bagian.length} elemen TIDAK memenuhi syarat `
      + 'dan belum boleh dikerjakan. Rincian kekurangannya ada di tiap bagian, '
      + 'beserta apa yang harus diubah.'
      + (belumDihitung ? ` ${belumDihitung} elemen belum dihitung.` : '')
  } else if (belumDihitung > 0) {
    kalimat = `${aman} elemen memenuhi syarat; ${belumDihitung} belum dihitung. `
      + 'Yang belum dihitung tak bisa dinyatakan aman maupun tidak.'
  } else {
    kalimat = `Seluruh ${bagian.length} elemen memenuhi syarat perhitungan `
      + 'yang tercantum di lembar ini. Baca juga batas tanggung jawab di '
      + 'halaman terakhir — ada hal yang tidak diperiksa di sini.'
  }

  const kini = opsi.tanggal ?? new Date().toISOString().slice(0, 10)

  return {
    nomor: opsi.nomor ?? `LPS/${kini.replace(/-/g, '')}/001`,
    judul: 'LEMBAR PERHITUNGAN STRUKTUR',
    proyek: { nama: opsi.proyek.nama, lokasi: opsi.proyek.lokasi ?? null },
    penerbit: {
      nama: opsi.penerbit?.nama ?? '—',
      alamat: opsi.penerbit?.alamat ?? null,
      kota: opsi.penerbit?.kota ?? null,
      telepon: opsi.penerbit?.telepon ?? null,
    },
    tanggal: kini,
    acuan: [...ACUAN_STANDAR],
    ikhtisar: {
      jumlahElemen: bagian.length,
      jumlahAman: aman,
      jumlahTidakAman: tidakAman,
      jumlahBelumDihitung: belumDihitung,
      kalimat,
    },
    bagian,
    batas: [...BATAS_TANGGUNG_JAWAB],
    tandaTangan: [
      { peran: 'Disusun oleh', nama: opsi.disusunOleh ?? null },
      { peran: 'Diperiksa oleh', nama: opsi.diperiksaOleh ?? null },
    ],
  }
}
