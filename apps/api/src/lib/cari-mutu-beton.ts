/**
 * ══════════════════════════════════════════════════════════════════════════════
 * PENCARIAN AHSP SADAR MUTU BETON — "K-300" juga menemukan yang ber-f'c
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Katalog AHSP di basis ini memakai DUA BAHASA untuk hal yang sama. Diukur
 * 2026-08-20, pada 90 AHSP beton bersatuan m³:
 *
 *     26 memakai f'c  ("1 m3 beton mutu rendah f'c 15 MPa, slump…")
 *     44 memakai K    ("1 M3 BETON SITE MIX MUTU ( K-300 )")
 *
 * Pencarian sebelumnya cocok-substring polos, jadi:
 *
 *     cari "K-300"  ->  1 hasil   (tak menjangkau satu pun yang ber-f'c)
 *     cari "K300"   ->  0 hasil   (tanpa tanda hubung, tak ketemu apa pun)
 *
 * Yang kedua itu yang paling merugikan: estimator mengetik cara yang wajar,
 * mendapat NOL, lalu menyimpulkan analisanya tidak ada — padahal ada 25 baris
 * K-250 di sana. Nol hasil tak pernah terbaca sebagai "salah ketik".
 *
 * ── Yang dilakukan modul ini
 *
 * Kata kunci yang BERBENTUK MUTU BETON diperluas jadi beberapa pola: bentuk
 * K (dengan dan tanpa tanda hubung) DAN padanan f'c-nya. Kata kunci biasa
 * dibiarkan apa adanya — pencarian "bekisting" tak boleh berubah perilakunya.
 *
 * ── Kenapa padanannya DIDAFTAR, bukan dihitung
 *
 * Alasan yang sama dengan `struktur-mutu-nyata.ts`: fc 20/25/30/35 adalah
 * kelas silinder baku SNI yang sudah punya padanan K konvensional. Menghitung
 * balik menghasilkan angka yang tak ada di katalog mana pun (fc 30 → K-369),
 * dan pencarian yang memakai angka itu memulangkan nol — persis kegagalan
 * yang modul ini dibangun untuk memperbaiki.
 */

/**
 * Padanan kelas K ↔ f'c untuk PENCARIAN.
 *
 * ⚠ Dipakai untuk MENEMUKAN baris, bukan untuk menghitung. Kesetaraannya
 * konvensi pemesanan, bukan kesamaan mutu yang presisi — yang dipakai
 * menghitung tetap f'c MPa (SNI 2847).
 *
 * Hanya kelas yang BENAR-BENAR ada di katalog yang didaftar; menambah kelas
 * yang tak ada cuma memperlebar pola tanpa menambah satu pun hasil.
 */
const PADANAN: ReadonlyArray<readonly [number, string[]]> = [
  [100, ['7,5', '7.5']],
  [125, ['10']],
  [150, ['12,5', '12.5']],
  [175, ['15']],
  [200, ['17', '17,5', '17.5']],
  [225, ['19', '20']],
  [250, ['20', '21']],
  [275, ['22,5', '22.5']],
  [300, ['25']],
  [325, ['27', '27,5', '27.5']],
  [350, ['28', '30']],
  [400, ['31', '35']],
  [450, ['36,6', '36.6', '40']],
]

/** Kata kunci ini menyebut mutu beton? Mis. "K-300", "k300", "f'c 25". */
export function sebutanMutu(kata: string): { k?: number; fc?: string } | null {
  const t = kata.trim()

  /*
    Bentuk K — tanda hubung OPSIONAL, dan spasi juga diterima.

    "K300" memulangkan NOL hasil di pencarian polos, dan nol hasil tak pernah
    terbaca sebagai salah ketik: pemakainya menyimpulkan analisanya tak ada.
  */
  const mK = t.match(/^k\s*-?\s*([0-9]{2,3})$/i)
  if (mK) {
    const n = Number(mK[1])
    return Number.isFinite(n) && n > 0 ? { k: n } : null
  }

  /* Bentuk f'c — dengan atau tanpa "MPa", koma maupun titik. */
  const mFc = t.match(/^f'?c\s*([0-9]+(?:[,.][0-9]+)?)\s*(?:mpa)?$/i)
  if (mFc) return { fc: mFc[1] }

  return null
}

/**
 * Perluas satu kata kunci jadi daftar pola pencarian.
 *
 * Kata kunci BIASA memulangkan dirinya sendiri — pencarian "bekisting" tak
 * boleh berubah perilakunya hanya karena modul ini dipasang.
 */
export function polaCariMutu(kata: string): string[] {
  const sebut = sebutanMutu(kata)
  if (!sebut) return [kata]

  const pola = new Set<string>()

  if (sebut.k !== undefined) {
    /*
      Dua bentuk penulisan K dicari sekaligus: katalog menulis "K-250"
      sementara orang sering mengetik "K250".
    */
    pola.add(`K-${sebut.k}`)
    pola.add(`K${sebut.k}`)
    for (const [k, daftarFc] of PADANAN) {
      if (k !== sebut.k) continue
      for (const fc of daftarFc) pola.add(`f'c ${fc}`)
    }
  }

  if (sebut.fc !== undefined) {
    pola.add(`f'c ${sebut.fc}`)
    /* Titik dan koma sama-sama dipakai sebagai pemisah desimal di katalog. */
    pola.add(`f'c ${sebut.fc.replace('.', ',')}`)
    pola.add(`f'c ${sebut.fc.replace(',', '.')}`)
    for (const [k, daftarFc] of PADANAN) {
      if (!daftarFc.some((x) => x.replace(',', '.') === sebut.fc!.replace(',', '.'))) continue
      pola.add(`K-${k}`)
      pola.add(`K${k}`)
    }
  }

  return [...pola]
}

/**
 * Susun klausa `or(...)` PostgREST dari satu kata kunci.
 *
 * Pembersihan karakter dilakukan DI SINI, bukan diserahkan pemanggil:
 * `%`, `,`, dan tanda kurung punya arti khusus di sintaks `or()` PostgREST,
 * dan satu koma yang lolos memecah klausanya jadi dua syarat yang salah.
 */
export function klausaCari(kata: string): string {
  const pola = polaCariMutu(kata)
  const bagian: string[] = []
  for (const p of pola) {
    const aman = p.replace(/[%,()]/g, ' ')
    bagian.push(`name.ilike.%${aman}%`)
    bagian.push(`code.ilike.%${aman}%`)
  }
  return bagian.join(',')
}
