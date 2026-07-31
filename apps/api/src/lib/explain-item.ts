/**
 * EXPLAINABILITY — merangkai jejak satu baris RAB jadi penjelasan.
 *
 * ── Kenapa ini Constraint TERTINGGI CECEP, bukan fitur pinggiran
 *
 * `01-phase-b-cost-engineering-discovery.md` menyatakannya sebagai prinsip:
 *
 *   "Every calculation must be strategy-driven, versioned, explainable, and
 *    replaceable."
 *
 * Alasannya praktis, bukan filosofis. Angka RAB dibawa ke hadapan klien,
 * pemberi kerja, dan pemeriksa. Kalau ditanya "kenapa pasangan bata Rp 87.200
 * per m²?" dan jawabannya hanya "keluaran sistem", angka itu tak bisa
 * dipertahankan — dan sistem yang angkanya tak bisa dipertahankan tak akan
 * dipakai untuk pekerjaan yang benar-benar bernilai.
 *
 * ── Yang membuatnya mungkin
 *
 * `hsp_snapshot` (migrasi 139) sudah menyimpan SELURUH bahan penjelasan pada
 * saat item dihitung: harga tiap resource, sumbernya, koefisien, tanggal
 * berlaku, aturan pembulatan, dan fraksi BUK.
 *
 * Kenapa snapshot dan bukan hitung-ulang: harga berubah. Menghitung ulang hari
 * ini akan memberi angka LAIN, sehingga penjelasannya tak cocok dengan angka
 * yang tertulis di dokumen penawaran — kebalikan dari tujuan explainability.
 *
 * ── Yang SENGAJA tidak dilakukan
 *
 * Tidak menghitung apa pun. Modul ini hanya MENYUSUN ULANG apa yang tercatat,
 * lalu memeriksa apakah rangkaiannya konsisten. Kalau ia ikut menghitung, ia
 * bisa memulangkan angka yang berbeda dari yang disimpan — dan penjelasan yang
 * tak cocok dengan angkanya lebih buruk daripada tak ada penjelasan.
 */

export interface BarisHarga {
  resource_id?: string
  resource_code?: string
  coefficient?: number
  amount?: number
  sumber?: string
  effective_date?: string | null
  location?: string | null
  matched_location?: boolean
  price_book_entry_id?: string | null
  override_reason?: string | null
}

export interface HspSnapshot {
  hsp?: {
    hspRaw?: number
    hspRounded?: number
    subtotalD?: number
    bukAmount?: number
    bukFraction?: number
    rounding?: { mode?: string; step?: number }
    groupTotals?: Record<string, number>
  }
  prices?: BarisHarga[]
}

export interface LangkahPenjelasan {
  /** Urutan tampil; juga urutan logis perhitungan. */
  no: number
  judul: string
  /** Kalimat yang bisa dibacakan apa adanya kepada klien. */
  uraian: string
  nilai?: number
}

export interface HasilPenjelasan {
  langkah: LangkahPenjelasan[]
  komponen: {
    kode: string
    koefisien: number
    hargaSatuan: number
    subtotal: number
    sumber: string
    tanggalHarga: string | null
    /** Harga override khusus proyek — alasannya WAJIB ikut ditampilkan. */
    alasanOverride: string | null
  }[]
  /**
   * Masalah yang membuat penjelasan TIDAK utuh. Sengaja dilaporkan, bukan
   * disembunyikan: "penjelasan yang tampak lengkap padahal bolong" jauh lebih
   * berbahaya daripada penjelasan yang mengaku bolong.
   */
  peringatan: string[]
  utuh: boolean
}

const rp = (n: number) => `Rp ${Math.round(n).toLocaleString('id-ID')}`

export function jelaskanItem(
  snapshot: HspSnapshot | null,
  konteks: { namaItem: string; satuan?: string | null; volume?: number | null; priceDate?: string | null },
): HasilPenjelasan {
  const peringatan: string[] = []

  if (!snapshot?.hsp) {
    return {
      langkah: [], komponen: [], utuh: false,
      peringatan: [
        'Item ini dibuat SEBELUM provenance harga dicatat (migrasi 139), atau ' +
        'bukan dari analisa AHSP (item custom/lump-sum). Angkanya tetap sah, ' +
        'tapi rinciannya tak bisa direkonstruksi — dan menebaknya justru lebih buruk.',
      ],
    }
  }

  const h = snapshot.hsp
  const prices = snapshot.prices ?? []
  const langkah: LangkahPenjelasan[] = []

  const komponen = prices.map((p) => {
    const koef = Number(p.coefficient ?? 0)
    const harga = Number(p.amount ?? 0)
    return {
      kode: p.resource_code ?? p.resource_id ?? '(tanpa kode)',
      koefisien: koef,
      hargaSatuan: harga,
      subtotal: koef * harga,
      sumber: p.sumber ?? 'tak tercatat',
      tanggalHarga: p.effective_date ?? null,
      alasanOverride: p.override_reason ?? null,
    }
  })

  // Langkah 1 — dari mana angka per-komponen berasal.
  if (komponen.length > 0) {
    langkah.push({
      no: 1,
      judul: 'Harga tiap komponen pada tanggal berlaku',
      uraian:
        `${komponen.length} komponen (tenaga/bahan/alat) diambil dari price book ` +
        `pada harga yang berlaku${konteks.priceDate ? ` per ${konteks.priceDate}` : ''}. ` +
        'Harga yang dipakai adalah harga SAAT ITU, bukan harga hari ini — ' +
        'supaya penjelasan ini tetap cocok dengan angka di dokumen penawaran.',
    })
  } else {
    peringatan.push('Snapshot tak memuat rincian harga per komponen.')
  }

  // Langkah 2 — koefisien × harga, dijumlahkan.
  const subtotalHitung = komponen.reduce((s, k) => s + k.subtotal, 0)
  if (typeof h.subtotalD === 'number') {
    langkah.push({
      no: 2,
      judul: 'Koefisien × harga satuan, dijumlahkan',
      uraian:
        'Tiap komponen dikalikan koefisien analisanya lalu dijumlahkan. ' +
        `Hasilnya ${rp(h.subtotalD)} per ${konteks.satuan ?? 'satuan'}.`,
      nilai: h.subtotalD,
    })
    // Konsistensi diperiksa, tapi TIDAK dipaksa: selisih pembulatan sen wajar.
    // Selisih besar berarti snapshot-nya sendiri tak konsisten, dan itu HARUS
    // terlihat — bukan diperhalus supaya laporannya rapi.
    const selisih = Math.abs(subtotalHitung - h.subtotalD)
    if (subtotalHitung > 0 && selisih > Math.max(1, h.subtotalD * 0.001)) {
      peringatan.push(
        `Jumlah komponen (${rp(subtotalHitung)}) tak cocok dengan subtotal tersimpan ` +
        `(${rp(h.subtotalD)}), selisih ${rp(selisih)}. Snapshot mungkin tak lengkap.`,
      )
    }
  }

  // Langkah 3 — BUK (biaya umum & keuntungan).
  if (typeof h.bukAmount === 'number' && h.bukAmount > 0) {
    const pct = h.bukFraction != null ? `${(h.bukFraction * 100).toFixed(1)}%` : '—'
    langkah.push({
      no: 3,
      judul: `Biaya Umum & Keuntungan (BUK) ${pct}`,
      uraian: `Ditambahkan ${rp(h.bukAmount)} (${pct} dari subtotal) sesuai ketentuan AHSP.`,
      nilai: h.bukAmount,
    })
  }

  // Langkah 4 — pembulatan. Sering jadi pertanyaan pertama saat diperiksa.
  if (typeof h.hspRounded === 'number') {
    const r = h.rounding
    const caraBulat = r?.mode === 'down' ? 'dibulatkan ke BAWAH'
      : r?.mode === 'up' ? 'dibulatkan ke ATAS'
      : r?.mode === 'nearest' ? 'dibulatkan ke terdekat'
      : 'tanpa pembulatan'
    langkah.push({
      no: 4,
      judul: 'Pembulatan HSP',
      uraian: typeof h.hspRaw === 'number' && h.hspRaw !== h.hspRounded
        ? `${rp(h.hspRaw)} ${caraBulat}${r?.step ? ` kelipatan ${r.step}` : ''} menjadi ${rp(h.hspRounded)}.`
        : `${rp(h.hspRounded)} (${caraBulat}).`,
      nilai: h.hspRounded,
    })
  }

  // Langkah 5 — volume × HSP.
  if (konteks.volume != null && typeof h.hspRounded === 'number') {
    langkah.push({
      no: 5,
      judul: 'Volume × HSP',
      uraian:
        `${konteks.volume} ${konteks.satuan ?? ''} × ${rp(h.hspRounded)} = ` +
        `${rp(konteks.volume * h.hspRounded)}.`,
      nilai: konteks.volume * h.hspRounded,
    })
  }

  // Override harga WAJIB disebut — angka yang menyimpang dari price book
  // standar adalah hal pertama yang ditanyakan pemeriksa.
  for (const k of komponen) {
    if (k.alasanOverride) {
      peringatan.push(`Harga ${k.kode} memakai override khusus proyek: "${k.alasanOverride}".`)
    }
  }

  return { langkah, komponen, peringatan, utuh: peringatan.length === 0 && langkah.length > 0 }
}
