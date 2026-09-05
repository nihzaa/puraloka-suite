import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTema } from '@/hooks/useTema';
import { FONT, HURUF, SPASI, type Palet } from '@/lib/tema';

/**
 * Kepala layar — judul, penjelas opsional, dan satu aksi di kanannya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA KOMPONEN INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-09-05: ENAM layar menulis kepala yang sama sendiri-sendiri —
 * `fontSize: 22, fontFamily: FONT.judul` — dengan DUA nama berbeda untuk
 * benda yang sama (`title` di empat layar, `judulHalaman` di dua).
 *
 * Akibatnya bukan sekadar berulang: tak ada satu tempat pun untuk mengubah
 * rasa kepala layar. Panel merek dashboard dibangun, dan enam layar lain
 * tetap membuka dengan judul telanjang — aplikasi terbaca seperti dua
 * produk yang kebetulan sewarna.
 *
 * Ini bentuk yang sama dengan `#003366` yang tertulis 88 kali sebelum
 * `lib/tema.ts` ada.
 *
 * ── Kenapa BUKAN panel navy seperti dashboard
 *
 * Godaannya besar: kalau dashboard punya panel merek, kenapa tak semua?
 *
 * Karena panel merek MEMBAYAR RUANG. Di dashboard ia menampung angka yang
 * paling dicari (nilai kontrak) — bidangnya bekerja. Di layar DAFTAR tak
 * ada angka tunggal semacam itu; panel navy setinggi 180px di sana cuma
 * mendorong baris pertama keluar layar.
 *
 * Yang menyatukan keduanya bukan bidang navy, melainkan TIPOGRAFI dan
 * RITME yang sama. Kepala ini memakai skala dan spasi yang sama dengan
 * panel dashboard, tanpa mengambil ruangnya.
 *
 * ── `penjelas` bukan hiasan
 *
 * Satu baris yang menjawab "layar ini isinya apa" — dan di layar yang
 * daftarnya bisa kosong, ia satu-satunya keterangan yang tersisa sebelum
 * `<Kosong>` muncul.
 */
export function KepalaLayar({
  judul,
  penjelas,
  aksi,
}: {
  /** Nama layar. Satu-dua kata; ini bukan tempat kalimat. */
  judul: string;
  /** Opsional, satu baris: apa isi layar ini, atau cakupan datanya. */
  penjelas?: string;
  /**
   * Satu aksi di kanan judul — tombol, atau apa pun yang bisa ditekan.
   *
   * SATU, bukan deretan: layar dengan dua tombol primer tak punya tombol
   * primer. Aksi kedua tempatnya di dalam isi layar, bukan di kepalanya.
   */
  aksi?: React.ReactNode;
}) {
  const { c } = useTema();
  const s = useMemo(() => gaya(c), [c]);

  return (
    <View style={s.wadah}>
      <View style={s.teks}>
        {/*
          `accessibilityRole="header"` membuat pembaca layar bisa melompat
          antar-bagian. Tanpa itu judul diumumkan sebagai teks biasa, dan
          penggunanya harus menyapu seluruh layar untuk tahu ada di mana.
        */}
        <Text style={s.judul} accessibilityRole="header" numberOfLines={1}>
          {judul}
        </Text>
        {penjelas ? <Text style={s.penjelas}>{penjelas}</Text> : null}
      </View>
      {aksi ? <View style={s.aksi}>{aksi}</View> : null}
    </View>
  );
}

function gaya(c: Palet) {
  return StyleSheet.create({
    wadah: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: SPASI.md,
      paddingHorizontal: SPASI.lg,
      paddingTop: SPASI.lg,
      paddingBottom: SPASI.md,
    },
    /*
      `flex: 1` + `flexShrink` pada teks, bukan pada aksinya. Judul panjang
      memendek; tombol tidak — tombol yang menyusut jadi tak bisa dibaca
      DAN tak bisa ditekan sekaligus.
    */
    teks: { flex: 1 },
    judul: {
      fontSize: HURUF.xxl - 2,
      fontFamily: FONT.judul,
      color: c.textPrimary,
      letterSpacing: -0.4,
    },
    penjelas: {
      fontSize: HURUF.sm,
      fontFamily: FONT.isi,
      color: c.textSecondary,
      marginTop: 3,
    },
    aksi: { flexShrink: 0 },
  });
}
