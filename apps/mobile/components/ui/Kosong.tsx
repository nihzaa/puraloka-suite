import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTema } from '@/hooks/useTema';
import { FONT, HURUF, RADIUS, SPASI, type Palet } from '@/lib/tema';

/**
 * Keadaan KOSONG — dan langkah berikutnya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA KOMPONEN INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Riset onboarding 2026-09-05 menemukan bukti kuat MENENTANG carousel
 * penjelas fitur (NN/G: 91% vs 94% keberhasilan; Vevo: login selesai naik
 * 10% setelah tutorial dihapus). Yang direkomendasikan sebagai gantinya:
 * **contextual help** — bantuan yang muncul di titik yang membutuhkannya.
 *
 * Empty state adalah bentuk paling murni dari itu. Ia muncul TEPAT saat
 * pengguna bertanya "kenapa kosong?", dan tak mengganggu siapa pun yang
 * layarnya sudah berisi.
 *
 * ── Yang membedakan empty state yang baik dari yang menyerah
 *
 * "Belum ada kasbon" menyatakan KEADAAN. Ia benar, dan ia berhenti di
 * situ — pembacanya tetap tak tahu apakah ia harus menunggu, menekan
 * sesuatu, atau menelepon seseorang.
 *
 * Yang diminta komponen ini: satu kalimat lagi yang menjawab **"lalu
 * apa?"**. Tiga bentuk jawabannya:
 *
 *   AKSI    → "Tekan + Ajukan untuk membuat yang pertama"
 *   TUNGGU  → "Pengajuan yang Anda buat akan muncul di sini"
 *   ORANG   → "Hubungi admin perusahaan bila ini keliru"
 *
 * Yang ketiga paling sering terlupakan, dan paling mahal: pengguna yang
 * layarnya kosong KARENA IZIN akan menyimpulkan aplikasinya rusak, lalu
 * berhenti memakainya tanpa memberi tahu siapa pun.
 *
 * ── `petunjuk` WAJIB, bukan opsional
 *
 * Dibuat wajib di tipe supaya "lupa menuliskannya" jadi galat tsc, bukan
 * keputusan diam. Empty state tanpa langkah berikutnya adalah bentuk yang
 * paling mudah ditulis dan paling sering menyesatkan.
 */
export function Kosong({
  ikon,
  judul,
  petunjuk,
}: {
  /** Ikon vektor — bukan emoji. Rupanya berbeda di tiap HP. */
  ikon: React.ComponentProps<typeof Ionicons>['name'];
  /** Keadaannya, satu baris. "Belum ada kasbon". */
  judul: string;
  /** LANGKAH BERIKUTNYA. Wajib — lihat catatan di atas. */
  petunjuk: string;
}) {
  const { c } = useTema();
  const s = useMemo(() => gaya(c), [c]);

  return (
    <View
      style={s.wadah}
      /*
        Dibaca sebagai SATU kesatuan oleh pembaca layar. Terpisah, ikon
        diumumkan sebagai "gambar", lalu judul, lalu petunjuk — tiga
        pengumuman untuk satu pesan.
      */
      accessibilityLabel={`${judul}. ${petunjuk}`}
    >
      <View style={s.bingkai}>
        <Ionicons
          name={ikon}
          size={30}
          color={c.textMuted}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      </View>
      <Text style={s.judul}>{judul}</Text>
      <Text style={s.petunjuk}>{petunjuk}</Text>
    </View>
  );
}

function gaya(c: Palet) {
  return StyleSheet.create({
    wadah: {
      alignItems: 'center',
      paddingVertical: 56,
      paddingHorizontal: SPASI.xxl,
      gap: SPASI.md,
    },
    /*
      Ikon di dalam bingkai lembut, bukan melayang.

      Alasan yang sama dengan panel merek di login: bentuk yang punya batas
      terbaca sebagai keputusan; ikon abu-abu melayang di tengah ruang
      kosong terbaca sebagai ketiadaan.
    */
    bingkai: {
      width: 64,
      height: 64,
      borderRadius: RADIUS.lg,
      backgroundColor: c.surfaceHover,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: SPASI.xs,
    },
    judul: {
      fontSize: HURUF.lg - 1,
      fontFamily: FONT.judul,
      color: c.textPrimary,
      textAlign: 'center',
    },
    petunjuk: {
      fontSize: HURUF.sm,
      fontFamily: FONT.isi,
      color: c.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
    },
  });
}
