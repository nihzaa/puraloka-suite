// F5 PEMBEDA — Tender & award subkontraktor: bukti pemilihan pelaksana.
//
// ── Kenapa modul ini ada
//
// Diukur 2026-08-07: 20 lingkup kerja bernilai Rp 15.000.000 sampai
// Rp 280.000.000, SELURUHNYA ber-`contract_status = 'unsigned'`, dan tak satu
// pun punya jejak bagaimana mandornya dipilih.
//
// Kesenjangan yang PERSIS SAMA dengan yang ditutup RFQ, tapi di sisi
// subkontraktor: saat auditor bertanya "kenapa mandor ini yang dapat borongan
// Rp 280 juta", jawabannya cuma ingatan orang.
//
// ── Kenapa dibandingkan terhadap PERKIRAAN, bukan hanya antar penawar
//
// Penawaran terendah belum tentu wajar. Yang 40% di bawah perkiraan biasanya
// berarti ada yang tak dihitung — dan itu muncul belakangan sebagai klaim
// tambah, pekerjaan berhenti, atau mandor kabur di tengah jalan.
//
// Modul ini menandainya (`terlalu_rendah`), bukan menolaknya: keputusan tetap
// di tangan manusia, tapi ia tak boleh diambil tanpa melihat angkanya.

/** Konversi aman: NUMERIC Postgres tiba sebagai string; null/NaN → 0. */
function angka(v: number | string | null | undefined): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export type StatusPenawaran = 'diajukan' | 'menang' | 'kalah' | 'gugur'

export interface BarisPenawaranSubkon {
  id: string
  worker_id: string
  worker_name?: string | null
  nilai_penawaran: number | string
  waktu_kerja_hari?: number | null
  tidak_menawar?: boolean | null
  status?: StatusPenawaran | null
  catatan?: string | null
}

/** Seberapa jauh sebuah penawaran menyimpang, dan ke arah mana. */
export type PenilaianPenawaran =
  /** Termurah di antara yang menawar. */
  | 'termurah'
  /** Dalam rentang wajar terhadap perkiraan. */
  | 'wajar'
  /**
   * Jauh DI BAWAH perkiraan — bukan kabar baik.
   *
   * Penawaran yang terlalu rendah biasanya berarti ada lingkup yang tak
   * dihitung, dan itu kembali sebagai klaim tambah atau pekerjaan mangkrak.
   */
  | 'terlalu_rendah'
  /** Jauh DI ATAS perkiraan. */
  | 'terlalu_tinggi'
  /** Mandor menyatakan tidak menawar. */
  | 'tidak_menawar'

export interface PenawaranTerhitung {
  id: string
  worker_id: string
  worker_name: string
  /** null bila tak menawar — BUKAN 0, yang akan menang sebagai termurah. */
  nilai: number | null
  waktu_kerja_hari: number | null
  status: StatusPenawaran
  /** Selisih terhadap penawaran termurah, dalam persen. null bila tak menawar. */
  selisih_termurah_pct: number | null
  /**
   * Selisih terhadap perkiraan nilai, dalam persen. NEGATIF = di bawah
   * perkiraan. null bila perkiraannya tak diisi.
   */
  selisih_perkiraan_pct: number | null
  penilaian: PenilaianPenawaran
  menang: boolean
  /**
   * Catatan penawar, diteruskan apa adanya.
   *
   * Bukan hiasan: di sinilah tertulis "harga tidak menyebut talang dan
   * flashing" — kalimat yang menjelaskan KENAPA sebuah penawaran jauh di
   * bawah perkiraan. Tanpa diteruskan, layar hanya menandai angkanya ganjil
   * tanpa pernah menunjukkan sebabnya, dan pembacanya harus menebak.
   */
  catatan: string | null
}

export interface HasilTender {
  penawaran: PenawaranTerhitung[]
  /** null bila tak satu pun menawar. */
  nilai_termurah: number | null
  nilai_tertinggi: number | null
  /** Rentang antar penawar, dalam persen terhadap termurah. */
  rentang_pct: number | null
  jumlah_menawar: number
  jumlah_tidak_menawar: number
  jumlah_terlalu_rendah: number
  /** Pemenang, bila sudah ditunjuk. */
  pemenang: PenawaranTerhitung | null
  /**
   * `true` bila pemenangnya BUKAN penawar termurah.
   *
   * Bukan tuduhan — sering ada alasan sah (rekam jejak, kapasitas, waktu).
   * Tapi itulah keputusan yang WAJIB punya alasan tertulis, dan tanpa
   * ditandai ia tak pernah ditanyakan.
   */
  pemenang_bukan_termurah: boolean
  /** Selisih rupiah antara pemenang dan penawar termurah. 0 bila sama. */
  selisih_pemenang_termurah: number
}

/** Ambang "terlalu rendah" terhadap perkiraan, dalam persen. */
export const AMBANG_TERLALU_RENDAH_PCT = 20
/** Ambang "terlalu tinggi" terhadap perkiraan, dalam persen. */
export const AMBANG_TERLALU_TINGGI_PCT = 20

/**
 * Susun perbandingan penawaran subkontraktor.
 *
 * INVARIANT yang diuji:
 *  - `tidak_menawar` tak pernah menang sebagai termurah
 *  - string NUMERIC dibandingkan sebagai ANGKA, bukan teks
 *  - penawaran jauh di bawah perkiraan ditandai, bukan dipuji
 *  - pemenang bukan-termurah DINYATAKAN, supaya alasannya ditanyakan
 *  - status `gugur` tak ikut perbandingan harga
 */
export function susunTender(
  penawaran: BarisPenawaranSubkon[],
  nilaiPerkiraan?: number | string | null,
  opsi?: { ambangRendahPct?: number; ambangTinggiPct?: number },
): HasilTender {
  const ambangRendah = opsi?.ambangRendahPct ?? AMBANG_TERLALU_RENDAH_PCT
  const ambangTinggi = opsi?.ambangTinggiPct ?? AMBANG_TERLALU_TINGGI_PCT
  const perkiraan = angka(nilaiPerkiraan)

  // Yang GUGUR tak ikut perbandingan harga: ia tak memenuhi syarat, jadi
  // harganya tak relevan. Membiarkannya ikut membuat "termurah" jatuh ke
  // penawar yang memang tak bisa dipakai.
  const ikut = penawaran.filter((p) => p.status !== 'gugur')
  const menawar = ikut.filter((p) => !p.tidak_menawar)

  const nilaiMenawar = menawar.map((p) => angka(p.nilai_penawaran))
  const termurah = nilaiMenawar.length > 0 ? Math.min(...nilaiMenawar) : null
  const tertinggi = nilaiMenawar.length > 0 ? Math.max(...nilaiMenawar) : null

  const hasil: PenawaranTerhitung[] = penawaran.map((p) => {
    const takMenawar = p.tidak_menawar === true
    const nilai = takMenawar ? null : angka(p.nilai_penawaran)
    const status: StatusPenawaran = p.status ?? 'diajukan'

    // Pembagi nol dijaga: termurah 0 adalah penawaran sah bernilai nol
    // (mustahil di basis, tapi fungsi murni ini menerima data apa pun).
    const selisihTermurah =
      nilai != null && termurah != null && termurah > 0
        ? ((nilai - termurah) / termurah) * 100
        : null

    const selisihPerkiraan =
      nilai != null && perkiraan > 0
        ? ((nilai - perkiraan) / perkiraan) * 100
        : null

    let penilaian: PenilaianPenawaran
    if (takMenawar) {
      penilaian = 'tidak_menawar'
    } else if (selisihPerkiraan != null && selisihPerkiraan < -ambangRendah) {
      // Diperiksa SEBELUM `termurah`: penawaran terendah yang jauh di bawah
      // perkiraan adalah RISIKO, bukan kemenangan. Menandainya "termurah"
      // saja membuat yang paling berbahaya terlihat paling menarik.
      penilaian = 'terlalu_rendah'
    } else if (selisihPerkiraan != null && selisihPerkiraan > ambangTinggi) {
      penilaian = 'terlalu_tinggi'
    } else if (termurah != null && nilai === termurah) {
      penilaian = 'termurah'
    } else {
      penilaian = 'wajar'
    }

    return {
      id: p.id,
      worker_id: p.worker_id,
      worker_name: p.worker_name ?? '—',
      nilai,
      waktu_kerja_hari: p.waktu_kerja_hari ?? null,
      status,
      selisih_termurah_pct: selisihTermurah,
      selisih_perkiraan_pct: selisihPerkiraan,
      penilaian,
      menang: status === 'menang',
      catatan: p.catatan ?? null,
    }
  })

  // Termurah lebih dulu; yang tak menawar dan gugur di bawah. Urutan ini
  // yang dibaca saat memutuskan, jadi yang paling relevan harus di atas.
  const urutanNilai = (p: PenawaranTerhitung) =>
    p.status === 'gugur' ? 3 : p.nilai == null ? 2 : 0
  hasil.sort((a, b) =>
    urutanNilai(a) - urutanNilai(b) ||
    (a.nilai ?? 0) - (b.nilai ?? 0) ||
    a.worker_name.localeCompare(b.worker_name, 'id'))

  const pemenang = hasil.find((p) => p.menang) ?? null

  return {
    penawaran: hasil,
    nilai_termurah: termurah,
    nilai_tertinggi: tertinggi,
    // Butuh MINIMAL DUA penawar. Satu penawar tak punya pembanding, dan
    // "rentang 0%" akan terbaca "harganya seragam" padahal yang benar
    // "tak ada yang bisa dibandingkan".
    rentang_pct:
      nilaiMenawar.length >= 2 && termurah != null && termurah > 0 && tertinggi != null
        ? ((tertinggi - termurah) / termurah) * 100
        : null,
    jumlah_menawar: menawar.length,
    jumlah_tidak_menawar: penawaran.filter((p) => p.tidak_menawar === true).length,
    jumlah_terlalu_rendah: hasil.filter((p) => p.penilaian === 'terlalu_rendah').length,
    pemenang,
    // Dinyatakan, bukan disembunyikan: memilih yang bukan termurah sering
    // punya alasan sah — tapi alasan itu tak pernah ditanyakan kalau tak ada
    // yang menandainya.
    pemenang_bukan_termurah:
      pemenang != null && pemenang.nilai != null && termurah != null && pemenang.nilai > termurah,
    selisih_pemenang_termurah:
      pemenang?.nilai != null && termurah != null ? pemenang.nilai - termurah : 0,
  }
}

// ════════════════════════════════════════════════════════════════════════════
// PENETAPAN PEMENANG — ditambahkan 2026-08-13
// ════════════════════════════════════════════════════════════════════════════
//
// ── Kenapa menyusul, bukan sejak awal
//
// `susunTender` di atas sudah menghitung perbandingannya lengkap, termasuk
// `pemenang_bukan_termurah`. Tapi diukur 2026-08-13: TAK SATU PUN rute
// menulis `penawaran_subkon.status = 'menang'`. Dua halaman membacanya —
// `mandor/spk/page.tsx:610` mencari pemenang untuk menerbitkan SPK, dan
// `mandor/tender/page.tsx` menampilkan penandanya — sehingga keduanya
// menunggu keadaan yang tak pernah bisa terjadi lewat aplikasi.
//
// Jadi modul ini bisa membandingkan penawaran dengan sangat baik, lalu
// berhenti tepat sebelum gunanya: memutuskan. Keputusan diambil di luar
// sistem, dan yang tercatat hanya angka-angka tanpa hasil.

/** Batas bawah alasan saat pemenang BUKAN penawar termurah. */
export const MIN_ALASAN_BUKAN_TERMURAH = 25

/** Batas bawah alasan saat pemenang memang termurah. */
export const MIN_ALASAN_UMUM = 10

export type KodeTolakPenetapan =
  | 'tak_ada' | 'tak_menawar' | 'sudah_putus' | 'alasan' | 'status'

export type HasilPenetapan =
  | { boleh: true; peringatan: string | null }
  | { boleh: false; sebab: string; kode: KodeTolakPenetapan }

/**
 * Boleh-tidaknya sebuah penawaran ditetapkan sebagai pemenang.
 *
 * `peringatan` BUKAN penolakan. Memilih penawar yang lebih mahal adalah
 * keputusan bisnis yang sah dan sering benar — TND-2026-001 di basis ini
 * contohnya: pemenangnya Rp 12jt lebih mahal karena satu-satunya yang pernah
 * mengerjakan bore pile di tanah lunak Dago dan sanggup 30 hari lebih cepat.
 *
 * Yang tak sah adalah melakukannya tanpa keterangan. Karena itu ambang
 * panjang alasannya LEBIH TINGGI saat pemenangnya bukan termurah: bukan untuk
 * mempersulit, melainkan karena "sesuai arahan" tak menjawab apa pun saat
 * ditanya auditor enam bulan kemudian.
 */
export function periksaPenetapan(masukan: {
  penawaran: readonly BarisPenawaranSubkon[]
  idPemenang: string
  statusTender: string
  alasan?: string | null
}): HasilPenetapan {
  const { penawaran, idPemenang, statusTender } = masukan
  const alasan = (masukan.alasan ?? '').trim()

  if (statusTender === 'selesai') {
    return {
      boleh: false, kode: 'sudah_putus',
      sebab: 'Tender ini sudah diputuskan. Untuk mengubah pemenangnya, batalkan tender '
        + 'dan terbitkan yang baru — mengganti pemenang di belakang keputusan membuat '
        + 'jejaknya tak bisa dipertanggungjawabkan.',
    }
  }
  if (statusTender === 'batal') {
    return {
      boleh: false, kode: 'sudah_putus',
      sebab: 'Tender ini dibatalkan — tak ada pemenang yang bisa ditetapkan.',
    }
  }

  const calon = penawaran.find((p) => p.id === idPemenang)
  if (!calon) {
    return { boleh: false, kode: 'tak_ada', sebab: 'Penawaran itu bukan bagian dari tender ini.' }
  }
  if (calon.tidak_menawar === true) {
    return {
      boleh: false, kode: 'tak_menawar',
      sebab: 'Penawar ini menyatakan TIDAK menawar — tak ada harga yang disepakati, '
        + 'jadi tak ada yang bisa dimenangkan.',
    }
  }
  if (calon.status === 'gugur') {
    return {
      boleh: false, kode: 'status',
      sebab: 'Penawaran ini berstatus gugur. Pulihkan statusnya lebih dulu bila '
        + 'penggugurannya keliru.',
    }
  }

  // Pembanding dihitung ulang di sini, bukan diambil dari `susunTender`:
  // fungsi ini harus sah dipanggil tanpa perkiraan nilai, dan yang menentukan
  // "termurah" hanyalah penawaran yang benar-benar mengajukan harga.
  // `tidak_menawar` tersimpan bernilai 0, dan 0 selalu menang sebagai termurah.
  const bersaing = penawaran.filter((p) => p.tidak_menawar !== true && p.status !== 'gugur')
  const termurah = bersaing.reduce<BarisPenawaranSubkon | null>((min, p) => {
    const n = angka(p.nilai_penawaran)
    return min === null || n < angka(min.nilai_penawaran) ? p : min
  }, null)

  const bukanTermurah = termurah !== null && termurah.id !== calon.id
  const batas = bukanTermurah ? MIN_ALASAN_BUKAN_TERMURAH : MIN_ALASAN_UMUM

  if (alasan.length < batas) {
    return {
      boleh: false, kode: 'alasan',
      sebab: bukanTermurah
        ? 'Pemenang bukan penawar termurah — alasannya wajib dijelaskan (minimal '
          + `${MIN_ALASAN_BUKAN_TERMURAH} karakter). Inilah yang ditanyakan auditor lebih `
          + 'dulu, dan paling mudah dijawab sekarang.'
        : `Alasan pemilihan wajib diisi (minimal ${MIN_ALASAN_UMUM} karakter).`,
    }
  }

  let peringatan: string | null = null
  if (bukanTermurah && termurah) {
    const selisih = angka(calon.nilai_penawaran) - angka(termurah.nilai_penawaran)
    peringatan = `Pemenang Rp ${selisih.toLocaleString('id-ID')} lebih mahal daripada `
      + 'penawar terendah. Alasannya tercatat dan ikut terbaca saat tender ini diaudit.'
  }

  return { boleh: true, peringatan }
}

// ════════════════════════════════════════════════════════════════════════════
// PERBANDINGAN PER-ITEM — ditambahkan 2026-08-16 (migrasi 437)
// ════════════════════════════════════════════════════════════════════════════
//
// ── Pertanyaan yang tak bisa dijawab sebelum ini
//
// `susunTender` di atas membandingkan SATU angka per penawar, karena sampai
// migrasi 437 memang hanya itu yang tersimpan (`nilai_penawaran`, 201:106).
// Ia bisa menjawab "siapa paling murah", tapi tak pernah:
//
//     "Agung Rp 12jt lebih murah — di POS MANA?"
//
// Selisih yang sama bisa berarti dua hal yang berlawanan: penawar yang
// efisien merata, atau penawar yang melewatkan satu pos. Yang kedua kembali
// sebagai klaim tambah, dan ia terbaca IDENTIK dengan yang pertama selama
// yang dibandingkan cuma totalnya.
//
// ── Kenapa dipisah dari `susunTender`, bukan digabung
//
// Rincian item OPSIONAL (lihat kepala migrasi 437). Tender yang penawarannya
// hanya total tetap sah selamanya, dan `susunTender` harus tetap menjawab
// penuh untuk mereka. Menggabungkan keduanya membuat fungsi yang separuh
// jalannya mati untuk 8 penawaran yang sudah ada di basis.

export interface BarisItemPenawaran {
  penawaran_id: string
  kode_item?: string | null
  uraian: string
  satuan?: string | null
  volume: number | string
  harga_satuan: number | string
  subtotal?: number | string | null
}

export interface SelItemPenawar {
  penawaran_id: string
  worker_name: string
  /** null bila penawar ini tak punya baris untuk item tersebut. */
  harga_satuan: number | null
  subtotal: number | null
  /** Harga satuan ini paling murah di antara yang MENGISI item ini. */
  termurah: boolean
  /** Selisih terhadap termurah, persen. null bila tak mengisi/tak terdefinisi. */
  selisih_pct: number | null
}

export interface BarisTabulasiItem {
  /** Penyatu antar penawar. `uraian` dipakai bila kode tak ada. */
  kunci: string
  kode_item: string | null
  uraian: string
  satuan: string | null
  /** Volume rujukan — yang TERBESAR di antara penawar. Lihat catatan di bawah. */
  volume: number
  sel: SelItemPenawar[]
  harga_termurah: number | null
  /** Rentang antar penawar yang mengisi, persen terhadap termurah. */
  rentang_pct: number | null
  /**
   * Tak semua penawar mengisi item ini.
   *
   * Inilah temuan yang paling mahal dan paling mudah terlewat: penawar yang
   * totalnya termurah karena satu pos TIDAK IA HITUNG. Ditandai supaya
   * "termurah" tak pernah terbaca tanpa syaratnya.
   */
  tak_lengkap: boolean
}

export interface RingkasanItemPenawar {
  penawaran_id: string
  worker_name: string
  jumlah_item: number
  /** Berapa item yang harga satuannya paling murah. */
  jumlah_termurah: number
  /** Berapa item yang TIDAK ia isi padahal penawar lain mengisinya. */
  jumlah_tak_diisi: number
  total_item: number
}

export interface HasilTabulasiItem {
  baris: BarisTabulasiItem[]
  penawar: RingkasanItemPenawar[]
  /** Jumlah item yang tak semua penawar mengisinya. */
  jumlah_item_tak_lengkap: number
  /**
   * Total bila tiap item diambil dari penawar termurahnya masing-masing.
   *
   * BUKAN target yang bisa dibeli — pekerjaan ini diborongkan ke SATU mandor.
   * Gunanya sebagai batas bawah teoretis: seberapa jauh pemenang dari
   * gabungan harga terbaik yang benar-benar ditawarkan orang.
   */
  total_termurah_gabungan: number
}

/**
 * Susun perbandingan per-item antar penawar sebuah tender.
 *
 * INVARIANT yang diuji:
 *  - item disatukan lewat `kode_item`; yang tanpa kode lewat uraian
 *  - penawar yang TIDAK mengisi sebuah item muncul sebagai sel kosong,
 *    bukan sebagai Rp 0 yang menang sebagai termurah
 *  - string NUMERIC dibandingkan sebagai ANGKA, bukan teks
 *  - item yang tak diisi semua penawar DITANDAI (`tak_lengkap`)
 *  - `subtotal` dipakai apa adanya bila dikirim (kolom generated basis),
 *    dihitung hanya bila tak ada
 */
export function susunTabulasiItem(
  item: readonly BarisItemPenawaran[],
  namaPenawar: Readonly<Record<string, string>> = {},
): HasilTabulasiItem {
  type Akum = {
    kunci: string
    kode_item: string | null
    uraian: string
    satuan: string | null
    volume: number
    sel: Map<string, SelItemPenawar>
  }

  const perItem = new Map<string, Akum>()
  const semuaPenawar = new Set<string>()

  for (const it of item) {
    semuaPenawar.add(it.penawaran_id)

    // Kode lebih dulu — itulah yang sama antar penawar. Uraian jadi cadangan
    // untuk baris tambahan yang tak ada di BOQ tender; dinormalkan supaya
    // "Galian Tanah" dan "galian tanah " tak jadi dua baris terpisah yang
    // masing-masing terlihat "hanya ditawar satu orang".
    const kunci = it.kode_item?.trim()
      ? `k:${it.kode_item.trim().toLowerCase()}`
      : `u:${it.uraian.trim().toLowerCase()}`

    let m = perItem.get(kunci)
    if (!m) {
      m = {
        kunci,
        kode_item: it.kode_item?.trim() || null,
        uraian: it.uraian,
        satuan: it.satuan ?? null,
        volume: angka(it.volume),
        sel: new Map(),
      }
      perItem.set(kunci, m)
    }
    if (it.satuan) m.satuan = it.satuan
    // Volume rujukan = yang TERBESAR. Volume diminta sama untuk semua penawar
    // dalam satu tender; kalau berbeda, mengambil yang terbesar membuat salah
    // ketik pada satu penawar tak mengecilkan gambaran seluruh pos.
    m.volume = Math.max(m.volume, angka(it.volume))

    const harga = angka(it.harga_satuan)
    m.sel.set(it.penawaran_id, {
      penawaran_id: it.penawaran_id,
      worker_name: namaPenawar[it.penawaran_id] ?? it.penawaran_id,
      harga_satuan: harga,
      // Subtotal basis dipakai apa adanya kalau ada — ia kolom GENERATED,
      // jadi menghitung ulang di sini hanya menciptakan kesempatan kedua
      // untuk membulatkannya berbeda.
      subtotal: it.subtotal != null && it.subtotal !== ''
        ? angka(it.subtotal)
        : harga * angka(it.volume),
      termurah: false,
      selisih_pct: null,
    })
  }

  const daftarPenawar = [...semuaPenawar]

  const baris: BarisTabulasiItem[] = [...perItem.values()].map((m) => {
    // Penawar yang tak mengirim baris untuk item ini tetap muncul sebagai sel
    // KOSONG. Kalau barisnya sekadar hilang, tabelnya berlubang dan pembaca
    // tak bisa membedakan "tidak menghitung pos ini" dari "murah di pos ini" —
    // padahal yang pertama adalah risiko klaim tambah.
    for (const pid of daftarPenawar) {
      if (!m.sel.has(pid)) {
        m.sel.set(pid, {
          penawaran_id: pid,
          worker_name: namaPenawar[pid] ?? pid,
          harga_satuan: null,
          subtotal: null,
          termurah: false,
          selisih_pct: null,
        })
      }
    }

    const sel = daftarPenawar.map((pid) => m.sel.get(pid)!)
    const mengisi = sel.filter((s) => s.harga_satuan != null)

    const harga_termurah = mengisi.length > 0
      ? Math.min(...mengisi.map((s) => s.harga_satuan!))
      : null

    if (harga_termurah != null) {
      for (const s of mengisi) {
        s.termurah = s.harga_satuan === harga_termurah
        // Pembagian hanya bila termurah > 0. Harga 0 sah (pekerjaan yang
        // sudah termasuk pos lain), tapi persentasenya tak terdefinisi dan
        // Infinity akan mengalir ke layar sebagai teks aneh.
        s.selisih_pct = harga_termurah > 0
          ? ((s.harga_satuan! - harga_termurah) / harga_termurah) * 100
          : null
      }
    }

    const termahal = mengisi.length > 0
      ? Math.max(...mengisi.map((s) => s.harga_satuan!))
      : null

    return {
      kunci: m.kunci,
      kode_item: m.kode_item,
      uraian: m.uraian,
      satuan: m.satuan,
      volume: m.volume,
      sel,
      harga_termurah,
      rentang_pct:
        mengisi.length >= 2 && harga_termurah != null && harga_termurah > 0 && termahal != null
          ? ((termahal - harga_termurah) / harga_termurah) * 100
          : null,
      tak_lengkap: mengisi.length < daftarPenawar.length,
    }
  })

  // Yang selisihnya paling lebar lebih dulu — di situ uang paling banyak bisa
  // salah arah. Item yang TAK LENGKAP diangkat ke paling atas: pos yang tak
  // dihitung seorang penawar lebih penting daripada pos yang harganya beda
  // 5%, dan ia tak punya `rentang_pct` besar yang akan mengangkatnya sendiri.
  baris.sort((a, b) => {
    if (a.tak_lengkap !== b.tak_lengkap) return a.tak_lengkap ? -1 : 1
    return (b.rentang_pct ?? -1) - (a.rentang_pct ?? -1)
      || a.uraian.localeCompare(b.uraian, 'id')
  })

  const penawar: RingkasanItemPenawar[] = daftarPenawar.map((pid) => {
    const selPenawar = baris.map((b) => b.sel.find((s) => s.penawaran_id === pid)!)
    const diisi = selPenawar.filter((s) => s.harga_satuan != null)
    return {
      penawaran_id: pid,
      worker_name: namaPenawar[pid] ?? pid,
      jumlah_item: diisi.length,
      jumlah_termurah: selPenawar.filter((s) => s.termurah).length,
      jumlah_tak_diisi: selPenawar.length - diisi.length,
      total_item: diisi.reduce((s, x) => s + (x.subtotal ?? 0), 0),
    }
  })

  penawar.sort((a, b) =>
    b.jumlah_termurah - a.jumlah_termurah
    || a.worker_name.localeCompare(b.worker_name, 'id'))

  return {
    baris,
    penawar,
    jumlah_item_tak_lengkap: baris.filter((b) => b.tak_lengkap).length,
    total_termurah_gabungan: baris.reduce(
      (s, b) => s + (b.harga_termurah == null ? 0 : b.harga_termurah * b.volume), 0),
  }
}

/**
 * Apakah tender boleh ditutup (status → 'selesai').
 *
 * Dipisah dari `periksaPenetapan` karena keduanya terjadi pada saat berbeda:
 * pemenang ditetapkan, lalu tendernya ditutup. Menggabungkannya jadi satu
 * tombol menghapus kesempatan meninjau ulang sebelum menutup — dan penutupan
 * tak bisa dibatalkan.
 */
export function periksaPenutupan(masukan: {
  penawaran: readonly BarisPenawaranSubkon[]
  statusTender: string
  alasan?: string | null
}): { boleh: true } | { boleh: false; sebab: string } {
  if (masukan.statusTender === 'selesai') {
    return { boleh: false, sebab: 'Tender ini sudah ditutup.' }
  }
  if (masukan.statusTender === 'batal') {
    return { boleh: false, sebab: 'Tender yang dibatalkan tak bisa ditutup sebagai selesai.' }
  }

  const pemenang = masukan.penawaran.filter((p) => p.status === 'menang')
  if (pemenang.length === 0) {
    return {
      boleh: false,
      sebab: 'Belum ada pemenang. Tetapkan pemenangnya lebih dulu — tender yang ditutup '
        + 'tanpa pemenang tak menghasilkan apa pun yang bisa dikerjakan.',
    }
  }
  if (pemenang.length > 1) {
    // Basis melarangnya lewat indeks unik parsial (migrasi 201:157). Kalau
    // sampai terbaca di sini, ada jalur tulis yang melewati aplikasi.
    return {
      boleh: false,
      sebab: `Tender ini punya ${pemenang.length} pemenang. Sisakan satu sebelum menutupnya.`,
    }
  }
  if (!(masukan.alasan ?? '').trim()) {
    return { boleh: false, sebab: 'Alasan pemilihan wajib tercatat sebelum tender ditutup.' }
  }

  return { boleh: true }
}
