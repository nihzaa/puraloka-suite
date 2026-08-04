// IPC — gerbang progres untuk termin `on_progress`. PURE, tanpa I/O.
//
// ════════════════════════════════════════════════════════════════════════════
// CELAH YANG DITUTUP
// ════════════════════════════════════════════════════════════════════════════
//
// `termin_schedules.trigger_type` punya tiga nilai: `on_sign` · `on_progress` ·
// `on_retention`. Kolom `trigger_pct` menyimpan ambang progresnya.
//
// Sebelum berkas ini, **`on_progress` tersimpan tapi tak pernah diperiksa.**
// Satu-satunya pemakaian `trigger_type` di `finance.ts` adalah menolak potongan
// uang muka pada invoice DP (`terminTriggerType === 'on_sign'`). Cabang
// `on_progress` tak ada sama sekali.
//
// Akibatnya: termin yang menurut kontrak baru boleh ditagih setelah pekerjaan
// mencapai 40% **bisa ditagih saat progres 0%** — tanpa satu pun pemeriksaan,
// tanpa satu pun pesan galat. Kontraknya berkata satu hal, sistemnya
// mengizinkan yang lain.
//
// Ini bukan cacat kosmetik. Termin adalah pintu masuk uang dari owner proyek,
// dan menagih lebih awal dari yang dibolehkan kontrak adalah dasar sengketa —
// atau, di arah sebaliknya, celah bagi orang dalam untuk mencairkan termin yang
// belum berhak cair.
//
// ── Kenapa berupa "sertifikat", bukan sekadar `if`
//
// IPC (Interim Payment Certificate) adalah **sertifikat**: ia mencatat berapa
// progres yang diakui **pada saat penagihan**, siapa yang mengakuinya, dan
// dasar apa yang dipakai. Sekadar menolak-atau-meloloskan tak meninggalkan
// jejak apa pun, dan enam bulan kemudian tak ada yang bisa menjawab
// "waktu itu progresnya berapa?".
//
// Karena itu `evaluasiGerbangProgres` mengembalikan **alasan** dan **angka**,
// bukan boolean. Pemanggilnya menyimpan angka itu, bukan menghitungnya ulang.
//
// ── Fail-closed
//
// Progres yang TIDAK DIKETAHUI (null/undefined/NaN) diperlakukan sebagai
// **menolak**, bukan meloloskan. Ini Ember [C] — default gagal-tertutup.
// Membiarkan progres tak diketahui lolos berarti gerbangnya menghilang persis
// saat datanya paling meragukan.

/** Nilai `termin_trigger_type` di database. */
export type PemicuTermin = 'on_sign' | 'on_progress' | 'on_retention'

export interface MasukanGerbangProgres {
  pemicu: PemicuTermin | null | undefined
  /** `termin_schedules.trigger_pct` — ambang yang disepakati kontrak. */
  ambangPct: number | null | undefined
  /** `projects.progress_pct` — progres yang diakui saat ini. */
  progresPct: number | null | undefined
}

export interface HasilGerbangProgres {
  lolos: boolean
  /**
   * Alasan mesin-terbaca. Dipakai untuk memilih pesan DAN untuk diuji —
   * mencocokkan kalimat bahasa Indonesia di test membuat test rapuh terhadap
   * perbaikan redaksi.
   */
  alasan:
    | 'bukan_on_progress'      // pemicu lain — gerbang ini tak berlaku
    | 'lolos'
    | 'progres_kurang'
    | 'progres_tak_diketahui'
    | 'ambang_tak_diketahui'
    | 'ambang_tak_masuk_akal'
  /** Angka yang DICATAT di sertifikat. `null` bila memang tak diketahui. */
  progresPct: number | null
  ambangPct: number | null
  pesan: string
}

/** Angka sah = bilangan berhingga. `null`, `undefined`, `NaN`, `Infinity` tidak. */
function angkaSah(n: number | null | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n)
}

/**
 * Boleh atau tidak termin ini ditagih sekarang.
 *
 * Hanya berlaku untuk pemicu `on_progress`. Pemicu lain dikembalikan sebagai
 * `bukan_on_progress` + `lolos: true` — gerbang ini bukan tempatnya memutuskan
 * termin DP (`on_sign`) atau pencairan retensi (`on_retention`); keduanya
 * punya aturannya sendiri di tempat lain.
 */
export function evaluasiGerbangProgres(m: MasukanGerbangProgres): HasilGerbangProgres {
  const progres = angkaSah(m.progresPct) ? m.progresPct : null
  const ambang = angkaSah(m.ambangPct) ? m.ambangPct : null

  if (m.pemicu !== 'on_progress') {
    return {
      lolos: true,
      alasan: 'bukan_on_progress',
      progresPct: progres,
      ambangPct: ambang,
      pesan: 'Gerbang progres tidak berlaku untuk termin ini',
    }
  }

  // Ambang tak diketahui → TOLAK.
  //
  // Termin ditandai `on_progress` berarti kontraknya memang mensyaratkan
  // progres tertentu. Kalau ambangnya hilang, yang hilang adalah SYARATNYA —
  // dan meloloskannya berarti termin bersyarat berubah jadi tak bersyarat
  // tanpa seorang pun memutuskannya.
  if (ambang === null) {
    return {
      lolos: false,
      alasan: 'ambang_tak_diketahui',
      progresPct: progres,
      ambangPct: null,
      pesan:
        'Termin ini bertipe progres tetapi ambang progresnya (trigger_pct) belum diisi. ' +
        'Isi ambangnya di jadwal termin sebelum menagih.',
    }
  }

  if (ambang < 0 || ambang > 100) {
    return {
      lolos: false,
      alasan: 'ambang_tak_masuk_akal',
      progresPct: progres,
      ambangPct: ambang,
      pesan: `Ambang progres termin (${ambang}%) di luar rentang 0–100%.`,
    }
  }

  // Progres tak diketahui → TOLAK (fail-closed, Ember [C]).
  if (progres === null) {
    return {
      lolos: false,
      alasan: 'progres_tak_diketahui',
      progresPct: null,
      ambangPct: ambang,
      pesan:
        `Termin ini baru boleh ditagih pada progres ${ambang}%, ` +
        'tetapi progres proyek belum tercatat. Catat progres lebih dulu.',
    }
  }

  if (progres < ambang) {
    return {
      lolos: false,
      alasan: 'progres_kurang',
      progresPct: progres,
      ambangPct: ambang,
      pesan:
        `Termin ini baru boleh ditagih pada progres ${ambang}%. ` +
        `Progres proyek saat ini ${progres}%.`,
    }
  }

  return {
    lolos: true,
    alasan: 'lolos',
    progresPct: progres,
    ambangPct: ambang,
    pesan: `Progres ${progres}% memenuhi ambang ${ambang}%.`,
  }
}
