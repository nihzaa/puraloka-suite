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

export function Galat({ judul, pesan }: { judul: string; pesan: string }) {
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

const styles = StyleSheet.create({
  kotak: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    padding: 16,
    gap: 6,
  },
  /*
    #B91C1C di atas #FEF2F2 = kontras 6,4:1 (WCAG AA butuh 4,5:1 untuk teks
    normal). #EF4444 yang lebih "wajar" untuk galat hanya mencapai 3,8:1 dan
    GAGAL — kelas cacat yang riwayat token di globals.css catat pernah lolos
    sampai ke halaman login.
  */
  judul: { fontSize: 14, fontWeight: '700', color: '#B91C1C' },
  pesan: { fontSize: 13, color: '#7F1D1D', lineHeight: 19 },
});
