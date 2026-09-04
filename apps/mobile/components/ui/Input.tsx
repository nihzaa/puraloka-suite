import React from 'react';
import { StyleSheet, Text, TextInput, type TextInputProps, View } from 'react-native';
import { useTema } from '@/hooks/useTema';
import { FONT, HURUF, RADIUS, SENTUH_MIN, SPASI, type Palet } from '@/lib/tema';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
}

/**
 * Isian teks.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * TIGA CACAT YANG DIPERBAIKI 2026-09-04
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── 1. `placeholderTextColor="#9CA3AF"` — 2.54:1, gagal AA
 *
 * DIHITUNG di latar putih: 2.54:1, jauh di bawah ambang 4.5:1. Warna ini
 * disebut namanya di CLAUDE.md §6 sebagai contoh "terlihat wajar tapi
 * gagal", dan ia lolos `audit-kontras-mobile.mjs` karena penjaga itu
 * memindai `color:` di dalam gaya — ini prop komponen.
 *
 * `textMuted` menggantikannya: 5.24:1 terang, 5.00:1 gelap.
 *
 * Yang membuatnya bukan sekadar pudar: placeholder di aplikasi ini adalah
 * CONTOH ISIAN ("nama@email.com", "Pengelasan pipa di lantai 3"). Yang tak
 * terbaca bukan dekorasi — ia petunjuk cara mengisi.
 *
 * ── 2. Palet dipaku — isian menyala putih di mode gelap
 *
 * Ketahuan dari memotret layar masuk dalam mode gelap: dua kotak putih
 * terang di atas latar `#1A1D27`, dan label di atasnya nyaris hilang.
 * Bukan sekadar jelek — kotak putih di ruangan gelap menyilaukan, dan
 * layar ini dibuka di gudang dan di jalan malam hari.
 *
 * ── 3. Galat tak pernah sampai ke pembaca layar
 *
 * `error` dirender sebagai `<Text>` biasa. TalkBack dan VoiceOver
 * membacakannya hanya kalau penggunanya kebetulan menyapu ke sana —
 * padahal ia baru muncul SESUDAH pengguna menekan tombol, saat fokusnya
 * ada di tempat lain.
 *
 * `accessibilityLiveRegion="polite"` (Android) dan `accessibilityRole="alert"`
 * membuatnya diumumkan begitu muncul, dan `accessibilityLabel` pada isian
 * menyertakan galatnya supaya pengguna yang kembali ke isian itu tahu apa
 * yang salah — bukan cuma bahwa ada yang salah.
 */
export function Input({ label, error, style, ...props }: InputProps) {
  const { c } = useTema();
  const s = gaya(c);

  return (
    <View style={s.wrapper}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <TextInput
        style={[s.input, error ? s.inputError : undefined, style]}
        placeholderTextColor={c.textMuted}
        accessibilityLabel={
          label && error ? `${label}. ${error}` : label ?? props.accessibilityLabel
        }
        {...props}
      />
      {error ? (
        <Text style={s.error} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

function gaya(c: Palet) {
  return StyleSheet.create({
    wrapper: { gap: 4 },
    label: {
      fontSize: HURUF.sm,
      fontFamily: FONT.isiTebal,
      color: c.textPrimary,
      marginBottom: 2,
    },
    input: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: RADIUS.sm + 2,
      paddingHorizontal: 14,
      paddingVertical: SPASI.md,
      fontSize: HURUF.base,
      fontFamily: FONT.isi,
      color: c.textPrimary,
      backgroundColor: c.surfaceRaised,
      /*
        `SENTUH_MIN` + 4 = 48. Isian yang terlalu pendek dilewati ibu jari
        dan mengenai isian di bawahnya — di formulir izin kerja itu berarti
        keterangan pekerjaan masuk ke kolom lokasi.
      */
      minHeight: SENTUH_MIN + 4,
    },
    inputError: { borderColor: c.danger, borderWidth: 1.5 },
    error: { fontSize: HURUF.xs, fontFamily: FONT.isi, color: c.danger },
  });
}
