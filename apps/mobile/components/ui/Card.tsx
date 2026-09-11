import React, { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Easing,
  StyleProp,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { useTema } from '@/hooks/useTema';
import { useKurangiGerak } from '@/hooks/useKurangiGerak';
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
  /**
   * Urutan kartu dalam daftar - menentukan jeda masuknya.
   *
   * Dibiarkan kosong (`undefined`) berarti kartu TIDAK beranimasi sama
   * sekali. Itu bawaannya, dan sengaja: kartu tunggal di tengah layar yang
   * memudar masuk tanpa sebab adalah hiasan, dan `ui-ux-pro-max` prioritas
   * 7 (`motion-meaning`) menolaknya. Yang bermakna adalah DAFTAR yang
   * menyusun diri - jadi hanya pemanggil di dalam daftar yang mengisinya.
   */
  indeks?: number;
  /**
   * Kartu ini lebih penting daripada tetangganya di daftar yang sama.
   * Dinyatakan lewat border yang dikuatkan, BUKAN bayangan (lihat kepala
   * berkas: bayangan per-baris mahal di daftar panjang).
   */
  menonjol?: boolean;
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
 *
 * =========================================================================
 * GARIS 1px -> HAIRLINE, DAN KARTU YANG MASUK (2026-09-12)
 * =========================================================================
 *
 * Founder memilih kandidat C dari perbandingan berdampingan
 * (`apps/mobile/scripts/banding-kartu.mjs`, tiga kandidat x dua mode).
 *
 * Dua hal yang diukur sebelum mengubah apa pun:
 *
 *     borderWidth di apps/mobile   : 66 pemakaian di 29 berkas
 *     berkas ber-`Animated`        : 1  (SplashMerek saja)
 *
 * Angka kedua yang menjelaskan keluhan "kaku": transisi ANTARLAYAR sudah
 * ada, tetapi begitu layar terbuka isinya muncul sekaligus sudah jadi.
 *
 * -- Kenapa hairline, bukan menghapus garisnya
 *
 * 66 garis 1px membuat tiap kartu jadi KOTAK BERGARIS berbobot sama; yang
 * penting dan yang biasa digambar setebal itu juga, sehingga hierarki
 * terpaksa dititipkan ke lencana kecil di pojok.
 *
 * Menghapusnya sama sekali salah ke arah lain: kartu putih di atas latar
 * nyaris putih kehilangan tepinya di bawah matahari - keadaan kerja
 * mandor, bukan keadaan laboratorium. `hairlineWidth` (0,5px di layar 2x,
 * 0,33px di 3x) HADIR tanpa menuntut perhatian.
 *
 * Rujukan sepakat: Ramp menyatakan elevasi kartunya lewat garis tipis di
 * atas permukaan putih dan MENGHINDARI box-shadow; Linear membangun
 * kedalaman dari pergeseran opasitas permukaan, bukan bayangan gelap.
 *
 * -- Kenapa `menonjol` memakai border, bukan hanya permukaan
 *
 * Di mode TERANG `surface` dan `surfaceRaised` bernilai SAMA (lihat
 * lib/tema.ts:106-107), jadi pergeseran permukaan tak terlihat di sana -
 * sementara di mode gelap ia bekerja (lib/tema.ts:140-141). Itu celah
 * token yang tak boleh ditambal diam-diam dari sini; penekanan karena itu
 * dibawa `borderColor` + ketebalan, yang berbeda di KEDUA mode.
 *
 * Nilai hex sengaja tak ditulis di komentar ini -
 * `audit-warna-mobile-bertoken.mjs` memindai TEKS, jadi hex yang diketik
 * untuk MENJELASKAN pun terhitung pemakaian (CLAUDE.md 8a.2).
 */
/**
 * Jeda antar-kartu, dan batas atasnya.
 *
 * 45ms ada di dalam rentang Material (30-50ms). Batas 6 bukan angka
 * kira-kira: tanpa batas, kartu ke-20 menunggu 900ms sebelum tampak - dan
 * animasi yang membuat orang MENUNGGU sudah berhenti jadi kehalusan.
 */
const JEDA_MS = 45;
const MAKS_BERTAHAP = 6;
/** Dalam rentang 150-300ms (`ui-ux-pro-max` prioritas 7 `duration-timing`). */
const DURASI_MS = 260;
/** Naik dari BAWAH - Material `hierarchy-motion`: masuk dari bawah = lebih dalam. */
const NAIK_PX = 10;

export function Card({
  children,
  style,
  mengambang = false,
  indeks,
  menonjol = false,
}: CardProps) {
  const { c } = useTema();
  const s = useMemo(() => gaya(c), [c]);
  const kurangiGerak = useKurangiGerak();

  /*
    Mulai dari 1 (tampil penuh), bukan 0.

    Kalau dimulai dari 0, kartu TAK TERLIHAT selama preferensi gerak belum
    terbaca - dan bila pembacaannya gagal atau lambat, yang tersisa daftar
    kosong yang tak bisa dibedakan dari "tak ada data". Kegagalan animasi
    tak boleh pernah jadi kegagalan menampilkan isi.
  */
  const maju = useRef(new Animated.Value(1)).current;
  const sudahMasuk = useRef(false);

  useEffect(() => {
    if (indeks === undefined) return;
    // `null` = preferensinya BELUM terbaca. Jangan bergerak, jangan sembunyikan.
    if (kurangiGerak === null || kurangiGerak) return;
    if (sudahMasuk.current) return;

    sudahMasuk.current = true;
    maju.setValue(0);

    const animasi = Animated.timing(maju, {
      toValue: 1,
      duration: DURASI_MS,
      delay: Math.min(indeks, MAKS_BERTAHAP) * JEDA_MS,
      /* ease-out: cepat di awal, melambat saat mendarat. `linear` terasa mekanis. */
      easing: Easing.out(Easing.cubic),
      /*
        Wajib. Tanpa ini animasi berjalan di thread JS, dan daftar 67 baris
        tersendat persis saat aplikasinya paling dipakai - nol terlihat di
        perangkat penguji berisi lima baris. `opacity` dan `transform`
        adalah dua properti yang didukung driver native.
      */
      useNativeDriver: true,
    });
    animasi.start();

    return () => {
      animasi.stop();
      /*
        Kalau dihentikan di tengah (kartu dilepas FlatList saat digulir
        cepat), nilainya bisa tertinggal di 0,3 dan kartu kembali sebagai
        bayangan pucat. Dipulihkan penuh saat dilepas.
      */
      maju.setValue(1);
    };
  }, [indeks, kurangiGerak, maju]);

  return (
    <Animated.View
      style={[
        s.card,
        menonjol && s.menonjol,
        mengambang && s.ambang,
        style,
        indeks !== undefined && {
          opacity: maju,
          transform: [
            {
              translateY: maju.interpolate({
                inputRange: [0, 1],
                outputRange: [NAIK_PX, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
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
      /*
        HAIRLINE, bukan 1px: lihat kepala berkas. Nilainya bergantung
        kerapatan piksel perangkat, jadi ia tetap satu piksel FISIK di
        layar mana pun - sementara `1` tergambar tiga piksel di layar 3x.
      */
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
    },
    /*
      Penekanan tanpa bayangan: permukaan diangkat (bekerja di mode gelap)
      DAN border dikuatkan (bekerja di kedua mode). Lihat kepala berkas
      untuk kenapa permukaan saja tak cukup.
    */
    menonjol: {
      backgroundColor: c.surfaceRaised,
      borderWidth: 1,
      borderColor: c.borderStrong,
    },
    /*
      Hanya untuk yang benar-benar mengambang. Bayangannya bernada navy
      lewat `ELEVASI`; jangan menuliskan nilainya lagi di sini.
    */
    ambang: ELEVASI.ambang,
  });
}
