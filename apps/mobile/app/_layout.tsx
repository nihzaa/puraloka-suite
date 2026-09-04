/**
 * AKAR APLIKASI — penjaga rute + splash yang menutup jendela kedip.
 *
 * ── Kenapa `preventAutoHideAsync` ada di sini
 *
 * `expo-splash-screen` terdaftar di package.json sejak awal tetapi TAK PERNAH
 * di-import satu berkas pun (diukur 2026-08-27). Akibatnya splash bawaan
 * sistem menghilang begitu bundel JS selesai dimuat — sementara `useAuth`
 * baru MULAI membaca token dari SecureStore saat itu.
 *
 * Jendela di antara keduanya menampilkan layar login yang langsung diganti
 * dashboard: kedipan yang paling terlihat justru di HP paling lambat, yaitu
 * HP yang dipakai mandor di lapangan.
 *
 * Sekarang splash sistem DITAHAN sampai `<SplashMerek>` terpasang, lalu
 * SplashMerek yang menutup sisa waktunya sambil menganimasikan lambang.
 * Serah terimanya tak terlihat karena keduanya memakai bidang navy dan
 * lambang yang sama.
 */
import { Slot, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_600SemiBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SplashMerek } from '@/components/SplashMerek';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { muatKenalan, sudahKenalan } from '@/lib/kenalan-state';

/*
  Dipanggil di lingkup modul, BUKAN di dalam komponen: splash harus ditahan
  sebelum React sempat merender apa pun. Memanggilnya di dalam useEffect
  sudah terlambat — bingkai pertama sudah telanjur lewat.

  `.catch()` wajib: pada mode pengembangan dengan Fast Refresh, pemanggilan
  kedua menolak dengan galat yang tak berbahaya. Membiarkannya tak tertangkap
  memunculkan layar merah untuk hal yang tak perlu diperbaiki siapa pun.
*/
SplashScreen.preventAutoHideAsync().catch(() => {});

function RootGuard() {
  const { user, loading } = useAuth();

  /*
    ── Font merek: DITUNGGU, bukan dipasang lalu diharapkan ─────────────

    Sebelum 2026-09-04 aplikasi ini memakai font sistem (Roboto di Android,
    San Francisco di iOS) sementara web memakai Bricolage Grotesque + Plus
    Jakarta Sans. Dua produk yang terasa berbeda tanpa ada yang bisa
    menunjuk sebabnya.

    ⚠ Kalau font gagal dimuat, React Native TIDAK melempar galat — ia diam
    dan memakai font sistem. Jadi "terlihat jalan" bukan bukti fontnya
    termuat; yang membuktikan cuma melihat bentuk hurufnya.

    `fontsSiap` ikut menahan splash. Tanpa itu layar pertama tergambar
    dengan font sistem lalu MELOMPAT saat font tiba — kedipan yang paling
    terlihat di HP paling lambat, yaitu HP yang dipakai mandor.
  */
  const [fontsSiap] = useFonts({
    BricolageGrotesque_700Bold,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_600SemiBold,
  });

  const segments = useSegments();
  const router = useRouter();

  /*
    ── Perkenalan: dibaca SEBELUM memutuskan tujuan ─────────────────────

    `null` berarti "belum tahu" — bukan "belum pernah". Bedanya menentukan:
    kalau `null` diperlakukan sebagai "belum pernah", pengguna yang SUDAH
    melewatinya akan melihat perkenalan sekali lagi tiap kali aplikasi
    dibuka, selama sepersekian detik sebelum penyimpanan terbaca.

    Kedipan itu persis yang membuat aplikasi terasa murah — dan ia paling
    lama terlihat di HP paling lambat.
  */
  /*
    ⚠ Dibaca dari salinan SINKRON, bukan langsung dari penyimpanan.

    Terukur 2026-09-05 lewat `history.replaceState`: menekan "Lewati"
    menghasilkan DUA panggilan `→ /kenalan` berturut-turut. Penandanya
    BENAR tersimpan (`puraloka_kenalan_selesai=1`, terverifikasi di
    localStorage) — guard ini yang memantulkannya kembali, karena
    `storage.get()` memulangkan Promise yang belum selesai saat rutenya
    sudah berpindah.

    Lingkaran yang tak bisa ditinggalkan, dengan nol galat dan data yang
    benar di penyimpanan.

    ⚠ Dan percobaan pertama saya SALAH: menambahkan `segments` sebagai
    dependensi supaya dibaca ulang tiap perpindahan rute. Itu tak menolong
    — pembacaan ulangnya tetap async, jadi balapannya cuma bergeser satu
    siklus. Yang menutupnya adalah jawaban yang tersedia SEKETIKA.

    `lib/kenalan-state.ts` menyimpan salinannya di memori; penyimpanan
    tetap sumber kebenaran lintas-sesi.
  */
  const [kenalanDibaca, setKenalanDibaca] = useState(false);

  useEffect(() => {
    let hidup = true;
    muatKenalan().finally(() => {
      if (hidup) setKenalanDibaca(true);
    });
    return () => {
      hidup = false;
    };
  }, []);

  /*
    Dibaca dari salinan sinkron tiap render — bukan disimpan di state.
    State akan membeku pada nilai saat pembacaan terakhir, dan itu persis
    cacat yang baru diperbaiki.
  */
  const kenalanSelesai = kenalanDibaca ? sudahKenalan() : null;

  useEffect(() => {
    if (loading || kenalanSelesai === null) return;
    const inAuth = segments[0] === '(auth)';
    const diKenalan = segments[1] === 'kenalan';

    if (!user && !kenalanSelesai && !diKenalan) {
      router.replace('/(auth)/kenalan');
    } else if (!user && kenalanSelesai && !inAuth) {
      router.replace('/(auth)/login');
    } else if (user && inAuth) {
      router.replace('/(app)/dashboard');
    }
  }, [user, loading, segments, kenalanSelesai]);

  /*
    Splash sistem dilepas begitu komponen kita terpasang — SplashMerek sudah
    menutupi layar dengan warna yang sama, jadi tak ada kedipan saat tukar.
  */
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <Slot />
      {/*
        Dirender SELALU, bukan `loading && <SplashMerek/>`. Ia menghilangkan
        dirinya sendiri lewat animasi opacity saat `selesai` jadi true;
        melepasnya dari pohon secara mendadak akan memotong animasi itu.
      */}
      {/*
        Splash ditahan sampai perkenalan TERBACA juga.

        Tanpa syarat `kenalanSelesai !== null`, splash lepas saat auth dan
        font siap sementara tujuan rutenya belum diputuskan — dan pengguna
        melihat kedipan layar login yang langsung diganti perkenalan.

        Bentuk kedipan yang sama persis dengan yang ditutup SplashMerek
        sejak awal, cuma sumbernya berpindah.
      */}
      <SplashMerek selesai={!loading && fontsSiap && kenalanSelesai !== null} />
    </View>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootGuard />
    </AuthProvider>
  );
}
