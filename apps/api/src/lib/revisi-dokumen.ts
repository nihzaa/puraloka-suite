/**
 * REVISI DOKUMEN — status yang DITURUNKAN, bukan dibaca dari kolom.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA DITURUNKAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Kolom `status` hanya benar kalau ada yang ingat memperbaruinya saat revisi
 * baru terbit. Yang tidak pernah lupa: memeriksa apakah ADA baris lain yang
 * menunjuk baris ini sebagai yang digantikannya.
 *
 * Alasan yang sama sudah dipakai `nilaiRegisterGambar` (`lib/kendali-
 * dokumen.ts`), dan sudah terbukti di sana: gambar rev-2 berstatus 'berlaku'
 * yang sudah punya rev-3 ditandai usang APA PUN kata kolomnya — dan itulah
 * keadaan yang membuat pekerjaan dibongkar.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * DUA HAL YANG DIHITUNG BERKAS INI, DAN KENAPA KEDUANYA PERLU
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 1. **`digantikan`** — ada penerusnya. Yang begini tak boleh tampil sebagai
 *    dokumen berlaku, tetapi TIDAK dihapus: revisi lama adalah bukti apa yang
 *    dipegang orang sebelum revisi baru terbit, dan itu yang ditanyakan saat
 *    pekerjaan yang terlanjur dikerjakan dari gambar lama dipersoalkan.
 *
 * 2. **`rantai`** — seluruh riwayat sebuah dokumen, dari revisi pertama
 *    sampai yang berlaku. Tanpa itu, "revisi 3" hanya angka; dengan itu,
 *    orang bisa melihat kapan tiap revisi terbit dan siapa yang mengunggah.
 */

export interface DokumenRevisi {
  id: string
  title: string
  revisi?: number | string | null
  menggantikan_id?: string | null
  uploaded_at?: string | null
}

export interface HasilRevisi<T extends DokumenRevisi> {
  dokumen: T
  /** Ada baris lain yang menggantikan dokumen ini. */
  digantikan: boolean
  /** Id penerusnya. `null` bila ia yang berlaku. */
  digantikan_oleh: string | null
  /** Nomor revisi yang bisa dipercaya — dihitung dari rantainya, bukan kolom. */
  revisi: number
  /** Revisi TERTINGGI di rantai yang sama. */
  revisi_terkini: number
}

/**
 * Nilai seluruh dokumen sekaligus.
 *
 * Sekaligus, bukan satu per satu, karena "adakah penerusku" adalah
 * perbandingan LINTAS baris — memeriksanya per dokumen berarti satu query per
 * baris, dan jawabannya tetap bergantung pada baris yang belum terbaca.
 */
export function nilaiRevisiDokumen<T extends DokumenRevisi>(
  daftar: readonly T[],
): { hasil: Array<HasilRevisi<T>>; berlaku: number; digantikan: number } {
  // Siapa menggantikan siapa. Basis menjamin satu pengganti per dokumen
  // (indeks unik parsial migrasi 410), jadi peta satu-ke-satu ini sah.
  const penerus = new Map<string, string>()
  for (const d of daftar) {
    if (d.menggantikan_id) penerus.set(d.menggantikan_id, d.id)
  }

  const olehId = new Map(daftar.map((d) => [d.id, d]))

  /**
   * Nomor revisi dihitung dengan MENELUSURI ke belakang, bukan dibaca kolom.
   *
   * Kolomnya diisi rute saat unggah dan biasanya benar — tetapi "biasanya
   * benar" adalah persis sifat yang membuat kolom status ditinggalkan di
   * seluruh repo ini. Menelusuri rantai memberi angka yang tak bisa
   * menyimpang, dan biayanya kecil karena rantainya pendek.
   *
   * Rantai melingkar (a→b→a) tak mungkin lahir dari rute ini, tetapi bisa
   * lahir dari skrip perbaikan. Penjaga `terlihat` menahannya supaya
   * fungsinya tak menggantung selamanya.
   */
  const nomorRevisi = (d: T): number => {
    let n = 1
    let kini: DokumenRevisi | undefined = d
    const terlihat = new Set<string>([d.id])
    while (kini?.menggantikan_id) {
      if (terlihat.has(kini.menggantikan_id)) break
      terlihat.add(kini.menggantikan_id)
      const induk = olehId.get(kini.menggantikan_id)
      // Induk yang TAK ADA di daftar tetap dihitung satu tingkat: ia mungkin
      // di luar halaman ini, atau di luar saringan peran. Berhenti diam-diam
      // akan melaporkan rev-3 sebagai rev-1.
      n += 1
      if (!induk) break
      kini = induk
    }

    // ── Rantai yang PUTUS: kolom `revisi` jadi saksi terakhir ──────────────
    //
    // FK-nya `ON DELETE SET NULL`, jadi menghapus revisi TENGAH mengosongkan
    // `menggantikan_id` milik penerusnya — rantainya benar-benar hilang, bukan
    // sekadar tak terbaca. Penelusuran lalu memulangkan 1, dan rev-3 terbaca
    // seolah tak pernah ada revisi sebelumnya.
    //
    // Kolom `revisi` yang ditulis saat unggah adalah satu-satunya bukti yang
    // tersisa. Ia dipakai sebagai LANTAI, bukan sebagai sumber: selama
    // rantainya utuh, penelusuran yang menang — dan itu tetap angka yang tak
    // bisa menyimpang. Yang berubah hanya perlakuan pada riwayat yang sudah
    // dipangkas orang.
    const tersimpan = Number(d.revisi ?? 1)
    return Number.isFinite(tersimpan) && tersimpan > n ? tersimpan : n
  }

  const revisiPer = new Map<string, number>(daftar.map((d) => [d.id, nomorRevisi(d)]))

  /** Akar rantai — dipakai mengelompokkan revisi dari dokumen yang sama. */
  const akar = (d: T): string => {
    let kini: DokumenRevisi | undefined = d
    const terlihat = new Set<string>([d.id])
    while (kini?.menggantikan_id && olehId.has(kini.menggantikan_id)) {
      if (terlihat.has(kini.menggantikan_id)) break
      terlihat.add(kini.menggantikan_id)
      kini = olehId.get(kini.menggantikan_id)!
    }
    return kini?.id ?? d.id
  }

  const tertinggiPerAkar = new Map<string, number>()
  for (const d of daftar) {
    const a = akar(d)
    const r = revisiPer.get(d.id) ?? 1
    tertinggiPerAkar.set(a, Math.max(tertinggiPerAkar.get(a) ?? 0, r))
  }

  const hasil = daftar.map((d) => {
    const oleh = penerus.get(d.id) ?? null
    return {
      dokumen: d,
      digantikan: oleh !== null,
      digantikan_oleh: oleh,
      revisi: revisiPer.get(d.id) ?? 1,
      revisi_terkini: tertinggiPerAkar.get(akar(d)) ?? 1,
    }
  })

  return {
    hasil,
    berlaku: hasil.filter((h) => !h.digantikan).length,
    digantikan: hasil.filter((h) => h.digantikan).length,
  }
}

export type VerdictRevisi = { ok: true } | { ok: false; galat: string }

/**
 * Boleh-tidaknya sebuah dokumen dijadikan revisi dari dokumen lain.
 *
 * Tiga penolakan, dan ketiganya juga dijaga basis (migrasi 410). Diperiksa di
 * sini supaya penolakannya berupa kalimat yang bisa ditindaklanjuti, bukan
 * galat constraint yang menyebut nama indeks.
 */
export function periksaRevisi(m: {
  /** Dokumen yang hendak digantikan. `null` bila ia tak ada. */
  induk: (DokumenRevisi & { project_id?: string }) | null
  /** Proyek dokumen baru — revisi lintas proyek tak masuk akal. */
  projectId: string
  /** Sudah ada baris lain yang menggantikan induk itu? */
  sudahDigantikan: boolean
}): VerdictRevisi {
  if (!m.induk) {
    return {
      ok: false,
      galat: 'Dokumen yang hendak direvisi tidak ditemukan di proyek ini.',
    }
  }

  if (m.induk.project_id && m.induk.project_id !== m.projectId) {
    return {
      ok: false,
      galat: 'Dokumen yang direvisi berasal dari proyek lain — riwayat revisi '
        + 'tak boleh melintasi proyek, karena yang membacanya akan menyimpulkan '
        + 'keduanya dokumen yang sama.',
    }
  }

  if (m.sudahDigantikan) {
    return {
      ok: false,
      galat: 'Dokumen itu sudah punya revisi penerus. Revisi berikutnya harus '
        + 'menggantikan revisi TERAKHIR — kalau tidak, riwayatnya bercabang dan '
        + 'dua orang bisa sama-sama yakin memegang yang terbaru.',
    }
  }

  return { ok: true }
}

/**
 * Nomor revisi untuk dokumen yang MENGGANTIKAN `induk`.
 *
 * Satu baris, dan sengaja tinggal di sini alih-alih di rutenya.
 *
 * Di rute, ia berada di jalur unggah — yang menyentuh Storage, jadi tak bisa
 * diuji tanpa menulis berkas sungguhan ke bucket produksi. Uji mutasi yang
 * menyerangnya di sana pulang HIJAU bukan karena kodenya aman, melainkan
 * karena tak ada yang menjalankannya.
 *
 * Di sini ia murni, dan pagarnya bisa dibuktikan: induk tanpa nomor revisi
 * yang terbaca dianggap rev-1, bukan NaN — `NaN + 1` tersimpan sebagai NULL
 * lalu kolomnya NOT NULL menolak, dan unggahan gagal dengan galat yang tak
 * menyebut sebabnya.
 */
export function nomorRevisiBerikut(induk: { revisi?: number | string | null } | null): number {
  if (!induk) return 1
  const n = Number(induk.revisi ?? 1)
  return (Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1) + 1
}
