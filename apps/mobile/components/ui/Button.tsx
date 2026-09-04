import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  type ViewStyle,
} from 'react-native';
import { useTema } from '@/hooks/useTema';
import { FONT, HURUF, RADIUS, SENTUH_MIN } from '@/lib/tema';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}

/**
 * Tombol.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * DUA CACAT YANG DIPERBAIKI 2026-09-04
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── 1. `disabled` diterima, diteruskan, dan TAK MENGUBAH APA PUN
 *
 * Versi sebelumnya menerima `disabled`, meneruskannya ke `TouchableOpacity`
 * (jadi tekanan memang diabaikan), lalu merender tombol yang terlihat
 * **persis sama** dengan tombol hidup: navy penuh, teks putih tebal.
 *
 * Itu lebih buruk daripada tak punya `disabled` sama sekali. Tombol yang
 * tak ada memberi tahu penggunanya bahwa ia belum bisa melanjutkan; tombol
 * yang terlihat hidup tapi diam mengajari penggunanya bahwa aplikasinya
 * rusak. Di lapangan, dengan sarung tangan dan layar berdebu, orang akan
 * menekannya berkali-kali sebelum menyerah.
 *
 * Ketahuan dari MEMOTRET layar login: tombol "Masuk" navy penuh sementara
 * kedua isian kosong. Tak satu pun test menangkapnya — `disabled` memang
 * diteruskan dengan benar, dan itu yang diperiksa test.
 *
 * ── 2. Palet dipaku, jadi tombol tak punya mode gelap
 *
 * `const C = { navy: '#003366', … }` di lingkup modul: benar untuk mode
 * terang, dan tak pernah berubah. Sekarang lewat `useTema()`.
 *
 * ── Keadaan mati: opasitas 0.45 DAN permukaan netral, bukan salah satu
 *
 * Opasitas saja membuat navy jadi navy pudar — masih terbaca sebagai
 * "tombol utama, cuma agak pucat". Permukaan netral saja membuatnya
 * terbaca seperti tombol sekunder yang sah. Keduanya bersama tak bisa
 * salah dibaca.
 *
 * `accessibilityState.disabled` ikut dipasang: tanpa itu TalkBack dan
 * VoiceOver tetap menyebutnya "tombol", dan pengguna yang tak melihat
 * layar tak punya cara tahu ia mati.
 */
export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  style,
}: ButtonProps) {
  const { c } = useTema();

  /*
    `loading` ikut mematikan tombol — tekanan kedua saat permintaan pertama
    masih jalan mengirim dua kali. Untuk pembuatan (kasbon, NCR, izin
    kerja) itu berarti dua baris di basis dari satu niat.
  */
  const mati = Boolean(disabled || loading);

  const bg =
    variant === 'primary' ? c.navy
    : variant === 'secondary' ? c.surfaceRaised
    : variant === 'danger' ? c.danger
    : 'transparent';

  const warnaTeks =
    variant === 'primary' ? c.onNavy
    : variant === 'secondary' ? c.navy
    : variant === 'danger' ? c.onNavy
    : c.textSecondary;

  const warnaTepi = variant === 'secondary' ? c.border : 'transparent';

  return (
    <TouchableOpacity
      style={[
        gaya.btn,
        {
          backgroundColor: mati && variant !== 'ghost' ? c.surfaceHover : bg,
          borderColor: mati ? c.border : warnaTepi,
          opacity: mati ? 0.45 : 1,
        },
        style,
      ]}
      onPress={onPress}
      disabled={mati}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityState={{ disabled: mati, busy: Boolean(loading) }}
    >
      {loading ? (
        <ActivityIndicator size="small" color={mati ? c.textSecondary : warnaTeks} />
      ) : (
        <Text style={[gaya.teks, { color: mati ? c.textSecondary : warnaTeks }]}>
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const gaya = StyleSheet.create({
  btn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: RADIUS.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    /*
      `SENTUH_MIN` = 44, bukan 46 yang dipaku sebelumnya.
      Angka itu datang dari Apple HIG dan Material (48dp) — bukan selera.
      Dinaikkan ke 48 karena tombol utama di layar lapangan ditekan dengan
      ibu jari bersarung.
    */
    minHeight: SENTUH_MIN + 4,
  },
  teks: {
    fontSize: HURUF.base,
    fontFamily: FONT.isiTebal,
  },
});
