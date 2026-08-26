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
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { SplashMerek } from '@/components/SplashMerek';
import { AuthProvider, useAuth } from '@/hooks/useAuth';

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
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inAuth = segments[0] === '(auth)';
    if (!user && !inAuth) {
      router.replace('/(auth)/login');
    } else if (user && inAuth) {
      router.replace('/(app)/dashboard');
    }
  }, [user, loading, segments]);

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
      <SplashMerek selesai={!loading} />
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
