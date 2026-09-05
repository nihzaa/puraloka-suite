/**
 * SPANDUK GALAT MUAT — satu bentuk, dipakai semua layar.
 *
 * Dipisah dari tiap layar supaya kalimat & warnanya tak menyimpang
 * sendiri-sendiri, dan supaya penjaga `audit-galat-muat-tampil.mjs` punya
 * satu bentuk yang bisa dicari.
 *
 * ⚠ Ini KHUSUS galat MUAT (gagal mengambil data untuk dilihat). Galat AKSI
 * (gagal menyimpan) TIDAK boleh memakai state yang sama — pola itu ditegakkan
 * `uji-galat-muat-terpisah.mjs` di apps/web sesudah ditemukan di 11 halaman:
 * gagal simpan menghapus pesan gagal muat, jadi pengguna melihat layar yang
 * seolah sehat padahal datanya tak pernah sampai.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTema } from '@/hooks/useTema';
import { FONT, HURUF, RADIUS, SPASI, type Palet } from '@/lib/tema';

export function Galat({ judul, pesan }: { judul: string; pesan: string }) {
  const { c } = useTema();
  const styles = gaya(c);
  return (
    <View
      style={styles.kotak}
      accessibilityRole="alert"
      accessibilityLabel={`${judul}. ${pesan}`}
    >
      <Text style={styles.judul}>{judul}</Text>
      <Text style={styles.pesan}>{pesan}</Text>
    </View>
  );
}

/*
  Kontras terhitung, dan riwayatnya dipertahankan.

  Versi hex: #B91C1C di atas #FEF2F2 = 6,4:1 (AA butuh 4,5:1). #EF4444 yang
  lebih "wajar" untuk galat hanya 3,8:1 dan GAGAL — kelas cacat yang riwayat
  token di globals.css catat pernah lolos sampai ke halaman login.

  Token `danger`/`dangerBg` membawa pasangan yang sama untuk mode terang,
  dan menambah pasangan gelapnya: #FB8585 di atas latar campurannya = 6,01:1.

  Kenapa dipindah meski angkanya sudah benar: hex yang benar untuk SATU mode
  tetap salah di mode lain, dan #FEF2F2 di layar gelap adalah kotak merah
  muda menyala — persis kesalahan yang sama bentuknya dengan isian putih di
  `Input.tsx`.
*/
function gaya(c: Palet) {
  return StyleSheet.create({
    kotak: {
      backgroundColor: c.dangerBg,
      borderWidth: 1,
      borderColor: c.dangerBorder,
      borderRadius: RADIUS.md,
      padding: SPASI.lg,
      gap: 6,
    },
    judul: { fontSize: HURUF.sm + 1, fontFamily: FONT.judul, color: c.danger },
    pesan: { fontSize: HURUF.sm, fontFamily: FONT.isi, color: c.danger, lineHeight: 19 },
  });
}
