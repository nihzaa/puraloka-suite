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
          <View style={styles.header}>
            <View style={styles.logo}>
              <Text style={styles.logoText}>P</Text>
            </View>
            <Text style={styles.title}>Puraloka Suite</Text>
            <Text style={styles.subtitle}>Masuk untuk melanjutkan</Text>
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
    safe: { flex: 1, backgroundColor: c0.surfaceSubtle },
    container: { flexGrow: 1, paddingTop: 72, paddingHorizontal: SPASI.xxl, paddingBottom: SPASI.xxl },
    header: { alignItems: 'center', marginBottom: 36 },
    logo: {
      width: 64,
      height: 64,
      borderRadius: RADIUS.lg,
      backgroundColor: c0.navy,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: SPASI.lg,
    },
    logoText: { color: c0.onNavy, fontSize: 28, fontFamily: FONT.judul },
    title: {
      fontSize: HURUF.xxl, fontFamily: FONT.judul,
      color: c0.textPrimary, marginBottom: 6,
    },
    subtitle: { fontSize: HURUF.base, fontFamily: FONT.isi, color: c0.textSecondary },
    form: { gap: SPASI.lg },
    errorText: {
      fontSize: HURUF.sm, fontFamily: FONT.isi,
      color: c0.danger, textAlign: 'center',
    },
    btn: { marginTop: SPASI.sm },
  });
}
