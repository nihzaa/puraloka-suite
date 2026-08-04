// RETENSI SUBKONTRAK — potongan jaminan pada pembayaran mandor. PURE, tanpa I/O.
//
// ════════════════════════════════════════════════════════════════════════════
// KEBOCORAN YANG DITUTUP
// ════════════════════════════════════════════════════════════════════════════
//
// Retensi (jaminan pemeliharaan) sudah dijalankan RAPI di sisi KLIEN:
// `invoices.retensi_pct` / `retensi_amount`, `projects.retention_pct`, register
// pencairan lewat `invoice_type='retention_release'`, dan jadwal termin
// `on_retention`.
//
// Sisi MANDOR/SUBKON: **nol**. Diukur 2026-08-04 — `work_scopes` punya kolom
// kontrak lengkap (`contract_pdf_url`, `contract_signed_at`, dua tanda tangan)
// tetapi **tak satu pun kolom retensi**, dan di `mandor.ts` pembayaran progres
// dihitung:
//
//     net_payment = gross_payment          ← saat pengajuan
//     net_payment = (actual ?? gross) − deducted_kasbon   ← saat konfirmasi
//
// Tak ada suku retensi di mana pun.
//
// Akibatnya kontraktor **menahan retensi dari owner** tetapi **membayar penuh
// ke mandor**. Selisihnya ditanggung kontraktor sendiri sampai masa
// pemeliharaan lewat — dan kalau ada cacat yang harus diperbaiki mandor, tak
// ada uang tertahan untuk memaksanya kembali. Itu justru seluruh gunanya
// retensi.
//
// Arah kerugian satunya sama nyatanya: tanpa catatan, retensi yang SUDAH
// dipotong bisa **tak pernah dicairkan** — mandor dirugikan diam-diam, dan
// tak ada satu pun laporan yang menunjukkannya.
//
// ── Kenapa `basis` bukan `gross_payment`
//
// Retensi dihitung dari **nilai pekerjaan**, bukan dari nilai yang dibayarkan
// setelah potongan kasbon. Kalau dihitung dari nilai sesudah kasbon, mandor
// yang kebetulan punya kasbon besar akan tertahan retensi lebih kecil untuk
// pekerjaan yang sama — dan itu bukan kesepakatan siapa pun.
//
// Urutannya karena itu: retensi dulu dari nilai kotor, kasbon sesudahnya.
//
// ── Fail-closed
//
// Angka yang tak masuk akal (negatif, NaN, persen di luar 0–100) MENOLAK,
// bukan diperlakukan sebagai nol. Retensi bernilai nol karena kesalahan baca
// terlihat persis sama dengan retensi yang memang tidak disepakati — dan yang
// pertama adalah kebocoran uang.

/** Toleransi pembulatan NUMERIC(15,2) — 1 sen, bukan parameter bisnis. */
export const RETENSI_EPSILON = 0.01

export interface MasukanPotonganRetensi {
  /** Nilai pekerjaan yang ditagihkan, SEBELUM potongan apa pun. */
  bruto: number
  /** `work_scopes.retensi_pct` — persen yang disepakati kontrak scope. */
  retensiPct: number | null | undefined
  /** Potongan kasbon pada pembayaran ini. */
  potonganKasbon: number
}

export interface HasilPotonganRetensi {
  ok: boolean
  /** Nilai retensi yang ditahan pada pembayaran ini. */
  retensi: number
  /** Yang benar-benar diterima mandor: bruto − retensi − kasbon. */
  neto: number
  galat?: string
}

function angkaSah(n: number | null | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n)
}

/** Bulatkan ke 2 desimal — kolom uangnya `numeric(15,2)`. */
function bulat2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Hitung potongan retensi + nilai bersih satu pembayaran progres mandor.
 *
 * Urutan potongan SENGAJA: retensi dihitung dari **bruto**, kasbon dikurangkan
 * sesudahnya. Alasannya di header — menghitung retensi dari nilai sesudah
 * kasbon membuat besarnya retensi bergantung pada utang mandor, bukan pada
 * nilai pekerjaannya.
 */
export function hitungPotonganRetensi(m: MasukanPotonganRetensi): HasilPotonganRetensi {
  const kosong = { retensi: 0, neto: 0 }

  if (!angkaSah(m.bruto) || m.bruto < 0) {
    return { ok: false, ...kosong, galat: 'Nilai bruto tidak sah' }
  }
  if (!angkaSah(m.potonganKasbon) || m.potonganKasbon < 0) {
    return { ok: false, ...kosong, galat: 'Potongan kasbon tidak sah' }
  }

  // `null`/`undefined` = scope tanpa kesepakatan retensi. Itu SAH dan berarti
  // nol — beda dari angka rusak, yang ditolak di bawah.
  const pct = m.retensiPct == null ? 0 : m.retensiPct
  if (!angkaSah(pct) || pct < 0 || pct > 100) {
    return { ok: false, ...kosong, galat: `Persen retensi (${m.retensiPct}) di luar rentang 0–100` }
  }

  const retensi = bulat2(m.bruto * pct / 100)
  const neto = bulat2(m.bruto - retensi - m.potonganKasbon)

  if (neto < -RETENSI_EPSILON) {
    // Menolak, bukan memaksa jadi 0: pembayaran bernilai negatif berarti
    // potongannya melebihi tagihannya, dan itu keputusan manusia (mis. sisa
    // kasbon dibawa ke pembayaran berikutnya), bukan sesuatu yang boleh
    // diputuskan diam-diam oleh pembulatan.
    return {
      ok: false, retensi, neto,
      galat:
        `Potongan melebihi tagihan: bruto ${m.bruto} − retensi ${retensi} − ` +
        `kasbon ${m.potonganKasbon} = ${neto}`,
    }
  }

  return { ok: true, retensi, neto: Math.max(0, neto) }
}

export interface MasukanPencairanRetensi {
  /** Σ retensi yang pernah ditahan pada scope ini. */
  ditahan: number
  /** Σ retensi yang sudah dicairkan sebelumnya. */
  sudahDicairkan: number
  /** Jumlah yang diminta dicairkan sekarang. */
  diminta: number
}

export interface VerdictPencairanRetensi {
  ok: boolean
  /** Sisa yang masih boleh dicairkan SEBELUM permintaan ini. */
  tersedia: number
  galat?: string
}

/**
 * Boleh atau tidak mencairkan sejumlah retensi.
 *
 * Cermin `validateDpDeduction` di `ar-register.ts` — pola yang sama sudah
 * terbukti di sisi klien, dan memakai bentuk berbeda untuk masalah yang sama
 * hanya menambah tempat untuk salah.
 */
export function validasiPencairanRetensi(m: MasukanPencairanRetensi): VerdictPencairanRetensi {
  if (!angkaSah(m.ditahan) || !angkaSah(m.sudahDicairkan) || !angkaSah(m.diminta)) {
    return { ok: false, tersedia: 0, galat: 'Angka pencairan retensi tidak sah' }
  }
  if (m.diminta <= 0) {
    return { ok: false, tersedia: 0, galat: 'Jumlah pencairan harus lebih dari 0' }
  }

  const tersedia = bulat2(m.ditahan - m.sudahDicairkan)

  if (m.diminta > tersedia + RETENSI_EPSILON) {
    return {
      ok: false, tersedia,
      galat:
        `Pencairan ${m.diminta} melebihi retensi yang masih tertahan (${tersedia}). ` +
        `Ditahan ${m.ditahan}, sudah dicairkan ${m.sudahDicairkan}.`,
    }
  }

  return { ok: true, tersedia }
}
