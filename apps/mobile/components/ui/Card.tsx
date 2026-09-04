import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useTema } from '@/hooks/useTema';
import { RADIUS, SPASI, type Palet } from '@/lib/tema';

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function Card({ children, style }: CardProps) {
  const { c, gelap } = useTema();
  return <View style={[gaya(c, gelap).card, style]}>{children}</View>;
}

/**
 * Kartu.
 *
 * ── Kenapa bayangan diganti GARIS di mode gelap
 *
 * Bayangan bekerja dengan menggelapkan apa yang ada di bawahnya. Di atas
 * latar `#161921` tak ada lagi yang bisa digelapkan — bayangannya hilang
 * sepenuhnya, dan kartu melebur ke latar tanpa batas yang terlihat.
 *
 * Ini bukan soal selera: kartu di layar ini memisahkan SATU pekerjaan dari
 * pekerjaan berikutnya. Batas yang hilang membuat dua temuan berbeda
 * terbaca seperti satu paragraf panjang.
 *
 * Mode terang tetap memakai bayangan — garis di sana akan terbaca sebagai
 * tabel, dan menambah bobot visual pada layar yang sudah padat.
 */
function gaya(c: Palet, gelap: boolean) {
  return StyleSheet.create({
    card: {
      backgroundColor: c.surfaceRaised,
      borderRadius: RADIUS.md,
      padding: SPASI.lg,
      ...(gelap
        ? { borderWidth: 1, borderColor: c.border }
        : {
            shadowColor: '#000000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.06,
            shadowRadius: 4,
            elevation: 2,
          }),
    },
  });
}
