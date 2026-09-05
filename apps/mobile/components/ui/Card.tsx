import React, { useMemo } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useTema } from '@/hooks/useTema';
import { ELEVASI, RADIUS, SPASI, type Palet } from '@/lib/tema';

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /**
   * Kartu yang benar-benar MENGAMBANG — di atas panel merek, atau lembar
   * yang menutupi isi di bawahnya. Satu-dua per layar, bukan per baris.
   *
   * Bawaannya `false`, dan itu sengaja: yang paling sering dibutuhkan
   * adalah kartu daftar, dan kartu daftar TIDAK boleh berbayang.
   */
  mengambang?: boolean;
}

/**
 * Kartu — permukaan yang memisahkan satu hal dari hal berikutnya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA BAYANGANNYA DIBUANG (2026-09-05)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Versi sebelumnya memakai `shadowColor: '#000000'` di mode terang dan
 * GARIS di mode gelap — dua perlakuan berbeda untuk satu komponen. Riset UI
 * 2026-09-05 menemukan dua hal yang keduanya menentang bentuk itu:
 *
 * ── 1. Hitam murni membuat kartu terlihat murah
 *
 * `#000` pada opacity berapa pun mencuci warna di bawahnya jadi KELABU.
 * Yang benar: hue latar dengan saturation & lightness diturunkan. Navy
 * `#003366` ≈ `hsl(210 100% 20%)`, jadi bayangannya `hsl(210 40% 25%)`.
 * Bedanya halus pada satu kartu, dan jelas pada satu layar penuh.
 *
 * Sudah disediakan sebagai `ELEVASI` di `lib/tema.ts` — jangan menulis
 * nilai bayangan sendiri di sini atau di layar mana pun.
 *
 * ── 2. Kartu DAFTAR memang tak seharusnya berbayang
 *
 * Material 3 memilih *tonal elevation* (pergeseran warna permukaan)
 * sebagai default, dan menyisakan bayangan untuk yang benar-benar
 * mengambang. Di React Native itu bukan sekadar selera:
 *
 *   - tiap lapis bayangan = satu alpha blending, dan Android menggambar
 *     bagian yang tertutup juga (overdraw). Di daftar 60 baris —
 *     `kasbon` 67, `pekerjaan` 63 — itu terbayar tiap baris tiap frame.
 *   - anggaran satu frame 16ms untuk 60fps. HP mandor bukan perangkat uji.
 *
 * Jadi bawaannya sekarang `border` + `surfaceRaised` di KEDUA mode:
 * kedalaman dari WARNA, bukan dari bayangan. Yang butuh mengambang
 * memintanya lewat prop.
 *
 * ── Yang HILANG dari perubahan ini, dan kenapa itu diterima
 *
 * Kartu mode terang jadi sedikit lebih datar. Alasan lama masih benar —
 * "garis di mode terang bisa terbaca sebagai tabel" — tetapi itu terjadi
 * kalau garisnya kuat. `c.border` (#E5E7EB) cukup untuk memisahkan tanpa
 * menggambar kisi, dan keseragaman lintas-mode lebih berharga daripada
 * kedalaman semu satu mode.
 *
 * ⚠ Yang TIDAK boleh dikembalikan: bayangan per-kartu di daftar panjang.
 * Kalau suatu saat kartu terasa terlalu datar, naikkan kontras permukaan
 * (`surfaceRaised` vs `surfaceSubtle`), bukan tambahkan bayangan.
 */
export function Card({ children, style, mengambang = false }: CardProps) {
  const { c } = useTema();
  const s = useMemo(() => gaya(c), [c]);
  return (
    <View style={[s.card, mengambang && s.ambang, style]}>{children}</View>
  );
}

function gaya(c: Palet) {
  return StyleSheet.create({
    card: {
      backgroundColor: c.surfaceRaised,
      borderRadius: RADIUS.lg,
      padding: SPASI.lg,
      /*
        Border di KEDUA mode — bukan hanya gelap. Ini yang menggantikan
        bayangan, dan ia tampil SAMA di iOS maupun Android (tak seperti
        `shadow*` yang hanya iOS dan `elevation` yang hanya Android).
      */
      borderWidth: 1,
      borderColor: c.border,
    },
    /*
      Hanya untuk yang benar-benar mengambang. Bayangannya bernada navy
      lewat `ELEVASI`; jangan menuliskan nilainya lagi di sini.
    */
    ambang: ELEVASI.ambang,
  });
}
