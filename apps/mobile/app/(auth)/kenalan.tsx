import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Tekan } from '@/components/ui/Tekan';
import { tandaiKenalanSelesai } from '@/lib/kenalan-state';
import { useTema } from '@/hooks/useTema';
import { FONT, HURUF, RADIUS, SENTUH_MIN, SPASI, type Palet } from '@/lib/tema';

/**
 * Perkenalan singkat sebelum masuk — TIGA layar, bukan lebih.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * BUKTI YANG MEMBENTUK LAYAR INI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Riset 2026-09-05 menemukan bukti yang MENENTANG carousel onboarding:
 *
 *   Nielsen Norman Group, studi terkontrol:
 *       keberhasilan tugas   91% (lihat tutorial) vs 94% (lewati)
 *       waktu selesai        93,5 detik           vs 85,2 detik
 *       terasa sulit         4,92/7               vs 5,49/7 (lebih mudah)
 *
 *   Vevo, A/B test 160.000+ orang:
 *       menghapus tutorial → login selesai naik ~10%
 *       mayoritas hanya menggeser lewat tanpa membaca satu pun kata
 *
 *   NN/G: "walkthrough-style tutorials are never appropriate", kecuali
 *   untuk paradigma interaksi yang benar-benar baru (contoh mereka: AR).
 *
 * Founder tetap memintanya dibangun. Keputusan itu dihormati — tetapi
 * bukti di atas membentuk SETIAP pilihan di layar ini, supaya biayanya
 * sekecil mungkin bagi yang tak menginginkannya:
 *
 *   · TIGA layar, bukan lima atau tujuh. Tiap langkah tambahan memakan
 *     pengguna yang tersisa.
 *   · "Lewati" terlihat di SETIAP layar, bukan hanya yang terakhir —
 *     mayoritas memang ingin melewatinya, dan menyembunyikan pintu keluar
 *     tak membuat mereka membaca.
 *   · TAP "Lanjut", bukan hanya geser. Gestur geser horizontal adalah
 *     interaksi yang disarankan dihindari untuk tangan bersarung; geser
 *     tetap bekerja bagi yang terbiasa, tapi tak pernah SATU-SATUNYA cara.
 *   · Muncul SEKALI seumur pemasangan. Ditandai di penyimpanan, dan
 *     ditandai juga saat dilewati — melewatkan adalah jawaban yang sah.
 *   · Nol animasi. Riset lapangan yang sama menyarankan menghindari
 *     gerak dekoratif pada perangkat kelas menengah.
 *
 * ── Isinya BUKAN promosi fitur
 *
 * Yang berbukti negatif di riset itu adalah komponen INSTRUKSI/PROMOSI
 * ("lihat, aplikasi kami bisa ini!"). Yang tak terbukti negatif adalah
 * yang memberi tahu hal yang tak bisa ditebak sendiri.
 *
 * Ketiga layar di bawah menjawab tiga pertanyaan yang benar-benar dimiliki
 * mandor di hari pertama, dan yang jawabannya TIDAK ada di layar mana pun:
 *
 *   1. "Kalau di lokasi tak ada sinyal, laporan saya hilang?"  → tidak
 *   2. "Kenapa menu saya lebih sedikit dari teman saya?"        → izin
 *   3. "Saya sudah lapor, lalu bagaimana?"                      → dilacak
 *
 * Ketiganya adalah sumber kebingungan yang nyata di aplikasi ini —
 * antrean offline, menu yang berbeda per peran, dan status pengajuan.
 */

interface Halaman {
  ikon: React.ComponentProps<typeof Ionicons>['name'];
  judul: string;
  isi: string;
}

const HALAMAN: Halaman[] = [
  {
    ikon: 'cloud-offline-outline',
    judul: 'Bisa dipakai tanpa sinyal',
    isi:
      'Laporan yang Anda kirim di lokasi tanpa sinyal disimpan di HP, lalu ' +
      'dikirim sendiri begitu sinyal kembali. Tak ada yang hilang, dan Anda ' +
      'tak perlu mengetiknya dua kali.',
  },
  {
    ikon: 'key-outline',
    judul: 'Menu mengikuti tugas Anda',
    isi:
      'Yang Anda lihat hanya yang menjadi tanggung jawab Anda. Kalau ada menu ' +
      'yang Anda butuhkan tetapi tak muncul, itu soal izin — hubungi admin ' +
      'perusahaan, bukan tanda aplikasinya rusak.',
  },
  {
    ikon: 'checkmark-done-outline',
    judul: 'Setiap laporan ada nasibnya',
    isi:
      'Temuan, NCR, dan izin kerja yang Anda ajukan bisa dilihat lagi di menu ' +
      '"Pekerjaan Saya" — beserta statusnya: masih menunggu, sedang dikerjakan, ' +
      'atau sudah ditutup.',
  },
];

export default function Kenalan() {
  const { c } = useTema();
  const s = useMemo(() => gaya(c), [c]);
  const { width, height } = useWindowDimensions();
  const [indeks, setIndeks] = useState(0);
  const daftarRef = useRef<FlatList<Halaman>>(null);

  const selesai = useCallback(async () => {
    /*
      Ditandai SEBELUM berpindah, dan kegagalannya tak menahan siapa pun.

      Kalau penyimpanan gagal, yang terjadi paling buruk adalah perkenalan
      muncul sekali lagi — mengganggu, tapi tak merusak. Menahan navigasi
      sampai penyimpanan berhasil justru bisa mengurung pengguna di layar
      yang tak bisa ditinggalkan.
    */
    /*
      Ditandai lewat `tandaiKenalanSelesai`, bukan `storage.set` langsung.

      Helper itu memperbarui salinan SINKRON lebih dulu, jadi guard di
      `_layout.tsx` sudah tahu jawabannya saat rute berpindah — tanpa itu
      ia memantulkan kembali ke sini (terukur: dua `replaceState → /kenalan`
      berturut-turut).
    */
    await tandaiKenalanSelesai();
    router.replace('/(auth)/login');
  }, []);

  const keHalaman = useCallback(
    (i: number) => {
      daftarRef.current?.scrollToOffset({ offset: i * width, animated: true });
      setIndeks(i);
    },
    [width]
  );

  const lanjut = useCallback(() => {
    if (indeks < HALAMAN.length - 1) keHalaman(indeks + 1);
    else selesai();
  }, [indeks, keHalaman, selesai]);

  /*
    Indeks dihitung dari posisi gulir, bukan dari tombol saja — supaya
    titik progres tetap benar bagi yang menggeser.
  */
  const saatGulir = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const i = Math.round(e.nativeEvent.contentOffset.x / width);
      if (i !== indeks && i >= 0 && i < HALAMAN.length) setIndeks(i);
    },
    [indeks, width]
  );

  /*
    Tinggi halaman DIHITUNG, bukan diserahkan ke `flex: 1`.

    ⚠ `flex: 1` TIDAK berlaku pada item `FlatList` horizontal — terukur
    dari potret: halaman tingginya 259px di dalam wadah 636px, jadi
    `justifyContent: 'center'` memusatkan isi di dalam 259px itu, dan
    teksnya berhenti di 40% layar dengan sisanya kosong.

    Item daftar horizontal hanya mendapat tinggi yang dibutuhkan isinya.

    Yang dikurangi dari tinggi layar: bilah "Lewati" (~52) dan kaki berisi
    titik + tombol (~132). Angkanya dari mengukur, bukan menaksir — dan
    `Math.max` menjaga halaman tetap punya tinggi minimum di layar pendek,
    tempat pengurangan bisa menghasilkan angka yang terlalu kecil.
  */
  const tinggiHalaman = Math.max(320, height - 184);

  const renderHalaman = useCallback(
    ({ item }: { item: Halaman }) => (
      <View style={[s.halaman, { width, height: tinggiHalaman }]}>
        <View style={s.ikonBingkai}>
          <Ionicons name={item.ikon} size={44} color={c.navy} />
        </View>
        <Text style={s.judul}>{item.judul}</Text>
        <Text style={s.isi}>{item.isi}</Text>
      </View>
    ),
    [s, c, width, tinggiHalaman]
  );

  const terakhir = indeks === HALAMAN.length - 1;

  return (
    <SafeAreaView style={s.wadah}>
      {/*
        "Lewati" di SETIAP layar, bukan hanya yang terakhir.

        Riset: mayoritas memang ingin melewatinya, dan menyembunyikan pintu
        keluar tak membuat mereka membaca — ia hanya membuat mereka
        mengetuk tiga kali untuk sampai ke tempat yang sama.
      */}
      <View style={s.kepala}>
        <Tekan
          onPress={selesai}
          style={s.lewatiTombol}
          accessibilityRole="button"
          accessibilityLabel="Lewati perkenalan dan langsung masuk"
        >
          <Text style={s.lewatiTeks}>Lewati</Text>
        </Tekan>
      </View>

      <FlatList
        ref={daftarRef}
        data={HALAMAN}
        keyExtractor={(h) => h.judul}
        renderItem={renderHalaman}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={saatGulir}
        /*
          `getItemLayout` supaya `scrollToOffset` tepat sasaran tanpa
          menunggu pengukuran — tiga halaman selebar layar, ukurannya
          diketahui pasti.
        */
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
      />

      <View style={s.kaki}>
        {/*
          Titik, bukan bilah progres. Bilah menyiratkan "masih jauh"; tiga
          titik menyiratkan "sebentar lagi" — dan tiga titik itulah yang
          sesungguhnya.

          Titiknya juga BISA DITEKAN: pengguna yang ingin kembali ke halaman
          sebelumnya tak perlu menggeser mundur.
        */}
        <View style={s.titikBaris}>
          {HALAMAN.map((h, i) => (
            <Tekan
              key={h.judul}
              onPress={() => keHalaman(i)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={`Ke halaman ${i + 1} dari ${HALAMAN.length}`}
            >
              <View style={[s.titik, i === indeks && s.titikAktif]} />
            </Tekan>
          ))}
        </View>

        <Tekan
          onPress={lanjut}
          style={s.lanjutTombol}
          accessibilityRole="button"
          accessibilityLabel={terakhir ? 'Mulai pakai aplikasi' : 'Lanjut ke halaman berikutnya'}
        >
          <Text style={s.lanjutTeks}>{terakhir ? 'Mulai' : 'Lanjut'}</Text>
          <Ionicons
            name={terakhir ? 'checkmark' : 'arrow-forward'}
            size={18}
            color={c.onNavy}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        </Tekan>
      </View>
    </SafeAreaView>
  );
}

function gaya(c: Palet) {
  return StyleSheet.create({
    wadah: { flex: 1, backgroundColor: c.surface },
    kepala: { alignItems: 'flex-end', paddingHorizontal: SPASI.lg, paddingTop: SPASI.sm },
    lewatiTombol: {
      paddingHorizontal: SPASI.md,
      minHeight: SENTUH_MIN,
      justifyContent: 'center',
    },
    lewatiTeks: { fontSize: HURUF.base, fontFamily: FONT.isiTebal, color: c.textSecondary },

    /*
      Tanpa `flex: 1` — tingginya datang dari prop (lihat `tinggiHalaman`).
      Membiarkan `flex: 1` di sini menyesatkan pembaca berikutnya: ia
      terlihat seolah mengatur tinggi, padahal tak berpengaruh sama sekali
      pada item FlatList horizontal.
    */
    halaman: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: SPASI.xxl + SPASI.sm,
    },
    /*
      Ikon di dalam bidang navy tipis, bukan melayang di ruang kosong.

      Riset login/onboarding B2B: bidang warna merek adalah penyumbang
      kesan "dibuat sungguh-sungguh" terbesar dengan risiko paling kecil —
      tak menambah apa pun yang harus dibaca, tak membebani perangkat.
    */
    ikonBingkai: {
      width: 96,
      height: 96,
      borderRadius: RADIUS.lg + 8,
      backgroundColor: c.navyLight,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: SPASI.xxl,
    },
    judul: {
      fontSize: HURUF.xxl,
      fontFamily: FONT.judul,
      color: c.textPrimary,
      textAlign: 'center',
      marginBottom: SPASI.md,
      lineHeight: 31,
    },
    /*
      `lineHeight` 24 pada teks 15px = 1,6× — di atas anjuran 1,5 untuk
      teks bacaan. Kalimat di sini lebih panjang daripada di layar lain,
      dan dibaca sekali saja; jarak baris yang longgar menahan mata tak
      melompat baris.
    */
    isi: {
      fontSize: HURUF.base,
      fontFamily: FONT.isi,
      color: c.textSecondary,
      textAlign: 'center',
      lineHeight: 24,
    },

    kaki: {
      paddingHorizontal: SPASI.xxl,
      paddingBottom: SPASI.xxl,
      gap: SPASI.xl,
    },
    titikBaris: { flexDirection: 'row', justifyContent: 'center', gap: SPASI.sm },
    titik: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: c.borderStrong,
    },
    /*
      Yang aktif dibedakan LEBAR, bukan hanya warna — WCAG 1.4.1: informasi
      tak boleh disampaikan lewat warna semata, dan titik progres adalah
      informasi ("Anda di mana").
    */
    titikAktif: { width: 22, backgroundColor: c.navy },
    lanjutTombol: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPASI.sm,
      backgroundColor: c.navy,
      borderRadius: RADIUS.md,
      /*
        60px, bukan 44. Riset praktik lapangan: sarung tangan menurunkan
        presisi sentuh ke ~20-25mm, dan 44px "sama sekali tak berguna
        dengan sarung tangan tebal". Ini tombol utama di layar ini.
      */
      minHeight: 60,
    },
    lanjutTeks: { fontSize: HURUF.lg, fontFamily: FONT.judul, color: c.onNavy },
  });
}
