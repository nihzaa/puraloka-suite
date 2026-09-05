import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { LambangPuraloka } from '@/components/SplashMerek';
import { useTema } from '@/hooks/useTema';
import { FONT, HURUF, RADIUS, SPASI, type Palet } from '@/lib/tema';
import { login } from '@/lib/auth';

export default function LoginScreen() {
  const router = useRouter();
  const { c } = useTema();
  const styles = gaya(c);
  const { setUser, setIzin } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      setError('Email dan password wajib diisi.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const { user, izin } = await login(email.trim(), password);
      // Izin dipasang SEBELUM user: `RootGuard` berpindah rute begitu `user`
      // terisi, dan tab bar dirender dari izin. Urutan terbalik membuat
      // bingkai pertama sesudah login kehilangan tab-nya.
      setIzin(izin);
      setUser(user);
      router.replace('/(app)/dashboard');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'Login gagal. Periksa email dan password Anda.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          {/*
            ══════════════════════════════════════════════════════════════
            PANEL MEREK — bukan logo yang melayang di ruang putih
            ══════════════════════════════════════════════════════════════

            Founder 2026-09-05: "halaman loginnya polos banget, ga keliatan
            kaya aplikasi mahal". Benar — sebelumnya: kotak navy 64px,
            judul, dua isian, satu tombol. Bentuk yang bisa ditempel ke
            produk mana pun.

            Riset pola login B2B/enterprise (SaaS UI Design, Eleken):
            polanya adalah split-screen dengan PANEL BERMEREK — dan di
            ponsel split itu melipat jadi vertikal, panel merek jadi header
            30-40% tinggi layar.

            Yang membuatnya terasa mahal bukan penambahan elemen, melainkan
            BIDANG WARNA yang cukup besar untuk terbaca sebagai keputusan.
            Logo 64px di tengah ruang putih terbaca sebagai ketiadaan
            keputusan.

            ── Kenapa BUKAN gradien, foto, atau ilustrasi

            Ketiganya muncul di riset sebagai pola populer, dan ketiganya
            SALAH untuk konteks ini:

              gradien halus  → riset UX lapangan (Corvus Intell) eksplisit
                               menyarankan menghindarinya: warna lembut
                               tercuci di bawah sinar terang
              foto lokasi    → mematikan keterbacaan isian di atasnya, dan
                               membebani perangkat kelas menengah
              ilustrasi      → menambah aset yang harus diunduh untuk
                               sesuatu yang dilihat sekali sehari

            Yang dipakai: navy solid + lambang bergaris tipis sebagai
            tekstur. Nol aset tambahan, nol gradien, kontras terhitung.
          */}
          <View style={styles.panel}>
            {/*
              Pilar yang sama dengan splash, dalam ukuran besar dan opasitas
              rendah — tekstur, bukan lambang kedua.

              Riset menyebut "pola geometris tipis" sebagai cara menambah
              kedalaman tanpa menambah yang harus dibaca. Di sini polanya
              bukan sembarang geometri: ia bentuk yang sama yang baru saja
              dilihat pengguna di layar splash, jadi ia menyambung, bukan
              memperkenalkan bentuk baru.
            */}
            <View style={styles.panelTekstur} pointerEvents="none">
              <LambangPuraloka ukuran={220} warna={c.onMerek} />
            </View>

            <View style={styles.panelIsi}>
              <LambangPuraloka ukuran={56} warna={c.onMerek} />
              <Text style={styles.title}>Puraloka Suite</Text>
              {/*
                Penegas KONTEKS, bukan tagline pemasaran. Riset: satu
                kalimat yang menjelaskan aplikasi ini apa — bukan janji.
              */}
              <Text style={styles.subtitle}>Sistem Manajemen Proyek Konstruksi</Text>
            </View>
          </View>

          <View style={styles.form}>
            <Input
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="nama@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Input
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              secureTextEntry
            />
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            <Button
              title="Masuk"
              onPress={handleLogin}
              loading={loading}
              /*
                Mati selama salah satu isian kosong.

                Sebelumnya tombol ini navy penuh sejak layar terbuka, dan
                validasinya berjalan SESUDAH ditekan ("Email dan password
                wajib diisi"). Ketahuan dari memotret layar ini.

                Urutan itu terbalik: pengguna diberi tombol yang mengundang
                ditekan, lalu ditegur karena menekannya. Sekarang tombolnya
                sendiri yang menunjukkan formulirnya belum lengkap.

                Validasi di `handleLogin` TETAP ada — ia menjaga jalur yang
                tak lewat tombol (Enter di papan ketik keras, atau perubahan
                keadaan yang mendahului render).
              */
              disabled={!email.trim() || !password}
              style={styles.btn}
            />
          </View>

          {/*
            Penanda versi di kaki — khas aplikasi lapangan, dan bukan
            hiasan.

            Saat mandor menelepon dan bilang "aplikasi saya begini", hal
            PERTAMA yang perlu diketahui adalah versi mana yang ia pakai.
            Tanpa ini, jawabannya cuma bisa ditebak.

            Riset menyebutnya sebagai salah satu penanda "sistem serius"
            di layar login enterprise — dan ia kebetulan juga yang paling
            berguna dari semuanya.
          */}
          <View style={styles.kaki}>
            <Ionicons
              name="shield-checkmark-outline"
              size={13}
              color={c.textMuted}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <Text style={styles.kakiTeks}>
              Puraloka Persada · v{Constants.expoConfig?.version ?? '1.0.0'}
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/**
 * Gaya layar masuk.
 *
 * ── Kenapa `justifyContent: 'center'` DIBUANG
 *
 * Versi sebelumnya memusatkan seluruh isi secara vertikal. Terlihat rapi
 * di mockup, dan salah di HP: dengan hanya dua isian, logo jatuh ke 30%
 * tinggi layar dengan ±200px kosong di atasnya, dan formulir berakhir di
 * 65% dengan sisanya kosong juga. Berat visualnya melayang di tengah
 * tanpa alasan.
 *
 * Yang lebih buruk terjadi saat papan ketik naik: isi yang terpusat
 * TERDORONG, jadi logo dan judul bergeser ke atas dan sebagian terpotong —
 * gerakan yang tak berarti apa-apa bagi penggunanya.
 *
 * Sekarang mengalir dari atas dengan jarak yang disengaja. Papan ketik naik,
 * kepala tetap di tempatnya.
 */
function gaya(c0: Palet) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c0.surface },
    container: { flexGrow: 1, paddingBottom: SPASI.xxl },

    /*
      Panel merek: 38% tinggi layar minimum.

      Riset menyebut 30-40% untuk header bermerek di ponsel. Di bawah 30%
      ia terbaca sebagai bilah judul; di atas 40% form-nya terdorong ke
      bawah papan ketik.

      `minHeight` dalam angka tetap, bukan persen: `%` pada tinggi
      membutuhkan induk bertinggi pasti, dan `ScrollView` tak punya itu.
      280 ≈ 35% dari 800 (Android kelas menengah) dan ≈ 30% dari 932
      (layar besar) — proporsinya tetap masuk rentang di keduanya.
    */
    panel: {
      minHeight: 280,
      backgroundColor: c0.merekBidang,
      borderBottomLeftRadius: 28,
      borderBottomRightRadius: 28,
      paddingTop: 56,
      paddingBottom: SPASI.xxl + SPASI.sm,
      paddingHorizontal: SPASI.xxl,
      justifyContent: 'center',
      overflow: 'hidden',
    },
    /*
      Tekstur: lambang besar, opacity 0.07, digeser keluar sudut.

      0.07 bukan angka selera — di atas 0.10 ia mulai bersaing dengan teks
      di atasnya, dan riset lapangan memperingatkan pola latar yang
      menurunkan keterbacaan di bawah sinar terang. Di bawah 0.05 ia hilang
      sama sekali di layar murah.

      `pointerEvents="none"` supaya ia tak pernah menangkap sentuhan yang
      dimaksudkan untuk apa pun di atasnya.
    */
    panelTekstur: {
      position: 'absolute',
      right: -48,
      bottom: -36,
      opacity: 0.07,
    },
    panelIsi: { gap: SPASI.md },
    title: { fontSize: 30, fontFamily: FONT.judul, color: c0.onMerek },
    /*
      Sub-judul memakai `onMerek` dengan opacity, bukan warna abu-abu.

      Abu-abu di atas navy adalah dua warna yang harus dihitung ulang tiap
      kali salah satunya berubah. `onMerek` + opacity mempertahankan
      HUBUNGANNYA: apa pun bidang mereknya, sub-judul tetap satu tingkat
      lebih redup daripada judulnya.

      ⚠ Sampai 2026-09-05 baris ini memakai `onNavy`, dan paragraf ini
      menerangkan panjang lebar kenapa opacity 0.85 perlu: "pada mode gelap
      `onNavy` adalah warna GELAP di atas navy terang". Penalaran itu benar
      untuk keadaan yang SALAH — panel merek memang tak seharusnya jadi
      biru terang di mode gelap. Sesudah `merekBidang`/`onMerek` dipisah,
      keduanya putih di atas navy pekat di KEDUA mode, dan 0.85 kini murni
      soal hierarki, bukan kompensasi.
    */
    subtitle: {
      fontSize: HURUF.base, fontFamily: FONT.isi,
      color: c0.onMerek, opacity: 0.85, lineHeight: 21,
    },
    /*
      Form duduk DI BAWAH panel, bukan dipusatkan vertikal.

      Riset: form login yang baik tidak dipusatkan sempurna — ia duduk di
      bagian bawah dengan bobot merek di atas. Alasannya bukan estetika:
      isian yang dekat papan ketik berarti jari tak perlu berpindah jauh
      setelah keyboard naik.
    */
    form: { gap: SPASI.lg, paddingHorizontal: SPASI.xxl, paddingTop: SPASI.xxl + SPASI.sm },
    errorText: {
      fontSize: HURUF.sm, fontFamily: FONT.isi,
      color: c0.danger, textAlign: 'center', lineHeight: 19,
    },
    btn: { marginTop: SPASI.sm },
    kaki: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginTop: SPASI.xxl + SPASI.lg,
    },
    kakiTeks: { fontSize: HURUF.xs, fontFamily: FONT.isi, color: c0.textMuted },
  });
}
