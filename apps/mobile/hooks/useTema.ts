/**
 * Satu-satunya cara layar mengambil warna.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA HOOK INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-09-04: 39 warna hex ditulis langsung di 400+ tempat, nol
 * token, nol mode gelap. `#003366` sendiri muncul 88 kali.
 *
 * Akibatnya bukan sekadar berantakan — ia membuat dua hal MUSTAHIL:
 * mengubah merek tanpa 400 suntingan, dan menambahkan mode gelap tanpa
 * membuka ulang setiap layar.
 *
 * ── Kenapa hook, bukan konstanta yang di-import langsung
 *
 * `import { TERANG } from '@/lib/tema'` akan bekerja hari ini dan mengunci
 * aplikasi ke satu mode selamanya. Hook membaca `useColorScheme()`, jadi
 * layar yang memakainya ikut berubah saat pengguna mengganti tema HP —
 * tanpa satu baris pun kode tambahan di layar itu.
 *
 * ── Kenapa TIDAK ada Context/Provider
 *
 * `useColorScheme()` sudah reaktif dan murah. Membungkusnya dengan Context
 * menambah satu lapis yang tak menambah kemampuan apa pun, dan tiap layar
 * baru jadi punya satu cara lagi untuk lupa memakainya.
 *
 * Kalau nanti butuh mode manual (pengguna memaksa terang/gelap terlepas
 * dari setelan HP), Context baru dibutuhkan — dan saat itu hook ini yang
 * diubah, bukan 16 layar.
 */
import { useColorScheme } from 'react-native'
import { GELAP, TERANG, type Palet } from '@/lib/tema'

export interface Tema {
  /** Palet aktif — sudah dipilih sesuai mode perangkat. */
  c: Palet
  /** true saat perangkat memakai mode gelap. Untuk keputusan non-warna. */
  gelap: boolean
}

/**
 * Palet yang sesuai mode perangkat saat ini.
 *
 * Dinamai `c` (colour) sengaja pendek: ia muncul di hampir tiap baris gaya,
 * dan `tema.warna.textPrimary` membuat baris gaya jadi dua kali lebih
 * panjang tanpa menambah kejelasan.
 *
 * ```tsx
 * const { c } = useTema()
 * <Text style={{ color: c.textPrimary }}>Halo</Text>
 * ```
 */
export function useTema(): Tema {
  /*
    `useColorScheme()` bisa memulangkan null — pada Android lama dan saat
    pengguna belum pernah menyentuh setelan tema. Diperlakukan sebagai
    TERANG, bukan dibiarkan undefined: palet yang tak terdefinisi membuat
    seluruh layar tanpa warna, dan gejalanya (teks hitam di latar hitam)
    tak menyebut sebabnya.
  */
  const mode = useColorScheme()
  const gelap = mode === 'dark'
  return { c: gelap ? GELAP : TERANG, gelap }
}
