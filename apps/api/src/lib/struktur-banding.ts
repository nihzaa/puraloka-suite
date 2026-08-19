/**
 * ══════════════════════════════════════════════════════════════════════════════
 * BANDING ALTERNATIF DESAIN — "kalau baloknya 450 saja, masih kuat?"
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Pertanyaan itu ditanyakan di tiap proyek, dan sampai sekarang dijawab dengan
 * cara yang mahal: UBAH inputnya, hitung ulang, lihat hasilnya, lalu KEMBALIKAN
 * kalau ternyata tak kuat. Tiga masalah sekaligus:
 *
 *   · elemen aslinya sempat menyimpan desain yang belum diputuskan;
 *   · membandingkan dua hasil berarti mengingat angka lama di kepala;
 *   · mencoba lima kandidat berarti sepuluh kali bolak-balik.
 *
 * Modul ini menghitung SEMUA kandidat sekaligus tanpa menyentuh basis sama
 * sekali, lalu menyusunnya berdampingan.
 *
 * ── Yang TIDAK dilakukan modul ini: menghitung harga
 *
 * Godaan besarnya adalah menjawab "mana yang PALING MURAH". Itu ditolak, dan
 * penolakannya bukan soal kemalasan.
 *
 * Rute `usulan-rab` di modul ini sudah menuliskan alasannya: harga lahir dari
 * analisa AHSP × price book pada TANGGAL tertentu, dan jalur kedua yang
 * menghitung harga sendiri berarti dua rumus harga di satu aplikasi — yang
 * berselisih diam-diam, persis kelas cacat yang paling mahal di repo ini.
 *
 * Yang dibandingkan di sini adalah yang benar-benar DIMILIKI modul ini:
 * lolos/tidak, seberapa terpakai kapasitasnya, dan berapa volume bahannya.
 * Volume itulah yang dibawa ke estimasi untuk diberi harga di sana.
 *
 * ── Kandidat yang GAGAL DIHITUNG tetap ditampilkan
 *
 * Menghilangkannya diam-diam membuat daftar kandidat terlihat lebih sedikit
 * daripada yang diminta, dan pemakainya menyimpulkan kandidat itu "tidak
 * disarankan" padahal sebenarnya inputnya tak sah.
 */

/** Satu kandidat: label + input penuhnya. */
export interface Kandidat {
  label: string
  input: Record<string, unknown>
}

export interface HasilBanding {
  label: string
  /** null bila kandidatnya tak bisa dihitung sama sekali. */
  aman: boolean | null
  /** Alasan gagal — hanya terisi bila `aman === null`. */
  gagal: string | null
  /**
   * Pemeriksaan yang TIDAK lolos, dengan namanya. Bukan cuma jumlahnya:
   * "2 gagal" tak memberi tahu apakah yang gagal itu lentur (harus dibesarkan)
   * atau selimut api (cukup ditambah tebal selimut).
   */
  gagalPeriksa: string[]
  /**
   * Rasio terpakai TERTINGGI di antara semua pemeriksaan, dalam persen.
   *
   * Inilah angka yang menentukan: kandidat lolos dengan puncak 96% jauh lebih
   * rapuh daripada yang lolos dengan puncak 60%, walau keduanya "AMAN".
   */
  puncakPersen: number | null
  /** Pemeriksaan yang memuncak — supaya tahu APA yang jadi penentu. */
  puncakNama: string | null
  /**
   * Puncak di antara pemeriksaan yang BERUBAH antar kandidat.
   *
   * Kenapa ini ada, padahal sudah ada `puncakPersen`: pemeriksaan yang tak
   * terpengaruh ubahan bisa MENDOMINASI puncaknya dan menyembunyikan
   * seluruh perbandingan.
   *
   * Diukur pada balok 300 lebar, tinggi 450 vs 700:
   *
   *     Lentur                          0.890  ->  0.533   (turun, ini yang dicari)
   *     Tulangan terlindungi dari api    1.413  ->  1.413   (tetap)
   *
   * Selimut api tak bergantung tinggi sama sekali, tapi ia yang tertinggi.
   * Jadi `puncakPersen` memulangkan 141,3% untuk KEDUANYA — dan orang yang
   * membandingkan tinggi balok melihat dua angka identik lalu menyimpulkan
   * menaikkan tinggi tak ada gunanya.
   *
   * `puncakBerubahPersen` hanya melihat pemeriksaan yang nilainya berbeda
   * antar kandidat, jadi ia memperlihatkan 89,0% -> 53,3%.
   */
  puncakBerubahPersen: number | null
  puncakBerubahNama: string | null
  /** Rasio tiap pemeriksaan — dipakai untuk mencari yang berubah. */
  rasio: Record<string, number>
  betonM3: number | null
  bekistingM2: number | null
  besiKg: number | null
}

/*
  Bentuk `periksa` DIUKUR, bukan ditebak — dan tebakan pertama saya salah
  di tiga tempat sekaligus:

    · medannya `aman`, bukan `ok`;
    · tak ada medan `arah`;
    · sudah ADA `rasio` yang siap pakai.

  Versi pertama modul ini menghitung sendiri rasionya dari (nilai, syarat)
  plus menebak arah pembandingnya. Itu salah dua kali: ia akan memulangkan
  null untuk SEMUA pemeriksaan (karena `arah` tak pernah ada), dan kalaupun
  jalan ia menjadi tafsiran KEDUA atas angka yang sama — yang bisa
  berselisih diam-diam dengan yang dipakai layar dan lembar PDF.

  Diukur dari keluaran sungguhan `analisaBalok`:

    { nama: "Lentur", nilai: 160.13, syarat: 120, satuan: "kNm",
      aman: true, rasio: 0.7493…, rumus: "phiMn = …" }

    { nama: "Tulangan terlindungi dari api", nilai: 46, syarat: 65,
      aman: false, rasio: 1.413, … }

  `rasio` sudah memperhitungkan ARAH pembandingnya sendiri: 0.749 untuk
  lentur (kapasitas > beban) dan 1.413 untuk selimut api (nilai < syarat).
  Keduanya berarti hal yang sama: > 1 berarti LEWAT BATAS.
*/
interface PeriksaMentah {
  nama?: string
  aman?: boolean
  nilai?: number
  syarat?: number
  rasio?: number
}

/**
 * Rasio terpakai satu pemeriksaan, dalam persen.
 *
 * Memulangkan `null` bila pemeriksaannya tak punya rasio bermakna —
 * pemeriksaan BINER, misalnya. Memberinya persentase menghasilkan "0%" yang
 * terbaca sebagai "kapasitas nol", salah baca yang sudah pernah terjadi di
 * modul lembar.
 */
function rasioPersen(p: PeriksaMentah): number | null {
  const r = Number(p.rasio)
  return Number.isFinite(r) ? r * 100 : null
}
/**
 * Susun hasil satu kandidat dari keluaran `hitung()`.
 *
 * `hitung` disuntikkan sebagai parameter, bukan diimpor: modul ini jadi bisa
 * diuji tanpa menarik seluruh pohon analisa, dan rute tetap memakai
 * dispatcher yang SAMA dengan yang dipakai jalur simpan — dua dispatcher
 * berbeda akan berselisih diam-diam.
 */
export function bandingkan(
  kandidat: Kandidat[],
  jumlah: number,
  hitung: (input: Record<string, unknown>) => unknown,
): HasilBanding[] {
  const hasil: HasilBanding[] = kandidat.map((k) => {
    let hasil: unknown
    try {
      hasil = hitung(k.input)
    } catch (e) {
      return {
        label: k.label, aman: null, gagal: (e as Error).message,
        gagalPeriksa: [], puncakPersen: null, puncakNama: null,
        puncakBerubahPersen: null, puncakBerubahNama: null, rasio: {},
        betonM3: null, bekistingM2: null, besiKg: null,
      }
    }

    const h = hasil as {
      aman?: boolean
      periksa?: PeriksaMentah[]
      dasar?: { periksa?: PeriksaMentah[] }
      volume?: { betonM3?: number; bekistingM2?: number; besiTotalKg?: number }
    }
    const periksa = h.periksa ?? h.dasar?.periksa ?? []

    let puncakPersen: number | null = null
    let puncakNama: string | null = null
    for (const p of periksa) {
      const r = rasioPersen(p)
      if (r === null) continue
      if (puncakPersen === null || r > puncakPersen) {
        puncakPersen = r
        puncakNama = p.nama ?? null
      }
    }

    const rasio: Record<string, number> = {}
    for (const pp of periksa) {
      const r = rasioPersen(pp)
      if (r !== null && pp.nama) rasio[pp.nama] = r
    }

    const v = h.volume ?? {}
    return {
      label: k.label,
      aman: h.aman ?? null,
      gagal: null,
      gagalPeriksa: periksa.filter((p) => p.aman === false).map((p) => p.nama ?? '(tanpa nama)'),
      puncakPersen: puncakPersen === null ? null : Math.round(puncakPersen * 10) / 10,
      puncakNama,
      /* Diisi sesudah semua kandidat selesai — butuh melihat lintas kandidat. */
      puncakBerubahPersen: null,
      puncakBerubahNama: null,
      rasio,
      betonM3: angkaAtauNull(v.betonM3, jumlah),
      bekistingM2: angkaAtauNull(v.bekistingM2, jumlah),
      besiKg: angkaAtauNull(v.besiTotalKg, jumlah),
    }
  })

  /*
    ── Menentukan pemeriksaan mana yang BERUBAH antar kandidat

    Dilakukan di sini, bukan di dalam map: satu kandidat sendirian tak bisa
    tahu pemeriksaan mana yang berubah — itu hanya kelihatan dari perbandingan.
  */
  const semuaNama = new Set(hasil.flatMap((h) => Object.keys(h.rasio)))
  const berubah = new Set<string>()
  for (const nama of semuaNama) {
    const nilai = hasil.map((h) => h.rasio[nama]).filter((x) => x !== undefined)
    if (nilai.length < 2) continue
    /*
      Ambang 0,05% menahan getaran pembulatan floating point supaya tak
      terbaca sebagai perubahan nyata.
    */
    if (Math.max(...nilai) - Math.min(...nilai) > 0.05) berubah.add(nama)
  }

  for (const h of hasil) {
    let pp: number | null = null
    let pn: string | null = null
    for (const [nama, r] of Object.entries(h.rasio)) {
      if (!berubah.has(nama)) continue
      if (pp === null || r > pp) { pp = r; pn = nama }
    }
    h.puncakBerubahPersen = pp === null ? null : Math.round(pp * 10) / 10
    h.puncakBerubahNama = pn
  }

  return hasil
}

/*
  Volume dikalikan `jumlah` HANYA bila modulnya belum melakukannya.

  Modul analisa di repo ini menerima `jumlah` di dalam inputnya dan sudah
  memperhitungkannya — jadi mengalikan lagi di sini akan MELIPATGANDAKAN
  volume. Karena itu nilainya dipakai apa adanya, dan parameter `jumlah` di
  sini hanya dipertahankan untuk berjaga bila ada modul yang belum begitu.

  Tak dikalikan. Kalau suatu saat ada modul yang memulangkan volume per-satuan,
  perbaikannya ada DI MODUL ITU, bukan dengan mengalikan di sini — dua tempat
  yang mengalikan berarti volume ganda yang tak terlihat.
*/
function angkaAtauNull(v: unknown, _jumlah: number): number | null {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Bangun kandidat dari satu medan yang divariasikan.
 *
 * Kasus yang jauh paling sering: "coba h = 450, 500, 550". Menuliskan input
 * penuh untuk tiap kandidat berarti menyalin 20 medan tiga kali, dan salinan
 * yang menyimpang diam-diam membuat perbandingannya membandingkan dua hal
 * yang berbeda di lebih dari satu medan — tanpa ada yang tahu.
 *
 * Medan bersarang didukung lewat titik: `mutu.fcMpa`.
 */
export function kandidatDariVariasi(
  dasar: Record<string, unknown>,
  medan: string,
  nilai: Array<number | string>,
): Kandidat[] {
  return nilai.map((n) => {
    const salin = structuredClone(dasar)
    const jalur = medan.split('.')
    let simpul: Record<string, unknown> = salin
    for (const bagian of jalur.slice(0, -1)) {
      const berikut = simpul[bagian]
      if (berikut === null || typeof berikut !== 'object') {
        /*
          Jalur yang tak ada TIDAK dibuat diam-diam. Membuatnya berarti
          kandidat memakai medan yang tak dikenali modul analisa, lalu
          hasilnya identik dengan dasar — dan pemakainya menyimpulkan
          "ubahan ini tak berpengaruh" padahal ubahannya tak pernah sampai.
        */
        throw new Error(`Medan "${medan}" tak ada di input (tersandung di "${bagian}")`)
      }
      simpul = berikut as Record<string, unknown>
    }
    const daun = jalur[jalur.length - 1]
    if (!(daun in simpul)) {
      throw new Error(`Medan "${medan}" tak ada di input`)
    }
    simpul[daun] = n
    return { label: `${medan} = ${n}`, input: salin }
  })
}
