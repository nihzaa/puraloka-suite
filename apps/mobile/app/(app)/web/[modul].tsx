import { useLocalSearchParams, Stack, router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { storage } from '@/lib/storage';

/*
  ══════════════════════════════════════════════════════════════════════════
  JEMBATAN WEBVIEW — modul kantor di dalam aplikasi yang sama
  ══════════════════════════════════════════════════════════════════════════

  Keputusan founder 2026-08-31: layar LAPANGAN ditulis native penuh (offline,
  kamera, GPS, gestur), modul KANTOR dibuka lewat WebView. Alasannya angka:

      mobile hari ini :   9 layar
      web             : 290 halaman

  Menulis 281 layar native berarti berbulan-bulan, dan sebagian besarnya
  (akuntansi, estimasi, master data) jarang dibuka dari HP. WebView memberi
  kemampuan penuh SEKARANG, sementara yang dipakai tiap hari tetap terasa
  asli.

  ── Kenapa satu berkas dengan parameter, bukan satu layar per modul

  Rute dinamis `[modul]` berarti modul web baru tak menuntut layar mobile
  baru. Menulis satu berkas per modul akan membuat aplikasi mobile tertinggal
  tiap kali web menambah halaman — dan tertinggalnya tak bergejala, cuma
  menu yang tak ada.

  ── Sesi diteruskan lewat token, bukan lewat cookie

  WebView tak berbagi cookie dengan permintaan `axios` aplikasi. Tanpa
  penerusan token, pengguna yang SUDAH login di aplikasi akan disambut layar
  login lagi di dalam WebView — dan itu terbaca seperti aplikasi yang rusak,
  bukan seperti keamanan yang bekerja.

  Token dikirim lewat header `Authorization` pada permintaan pertama, dan
  ditanam ke `localStorage` lewat `injectedJavaScriptBeforeContentLoaded`
  supaya navigasi BERIKUTNYA di dalam WebView tetap membawa sesi.

  ⚠ `injectedJavaScriptBeforeContentLoaded` berjalan SEBELUM skrip halaman,
  jadi token sudah ada saat aplikasi web memeriksanya. Memakai
  `injectedJavaScript` (tanpa `BeforeContentLoaded`) menanamnya SESUDAH —
  terlambat, dan halamannya sudah mengalihkan ke login.
*/

/**
 * Modul web yang boleh dibuka lewat WebView, dan judulnya di bilah atas.
 *
 * Daftar PUTIH, bukan pass-through: rute yang datang dari luar (tautan dalam,
 * notifikasi) tak boleh membuka halaman sembarang di dalam sesi yang sudah
 * terautentikasi. Modul yang tak terdaftar ditolak dengan pesan, bukan
 * dibuka begitu saja.
 */
const MODUL: Record<string, { judul: string; jalur: string }> = {
  keuangan: { judul: 'Keuangan', jalur: '/keuangan' },
  akuntansi: { judul: 'Akuntansi', jalur: '/akuntansi' },
  estimasi: { judul: 'Estimasi', jalur: '/estimasi' },
  procurement: { judul: 'Pengadaan', jalur: '/procurement' },
  gudang: { judul: 'Gudang', jalur: '/gudang' },
  kontrak: { judul: 'Kontrak', jalur: '/kontrak' },
  laporan: { judul: 'Laporan', jalur: '/laporan' },
  jadwal: { judul: 'Jadwal', jalur: '/jadwal' },
  mutu: { judul: 'Mutu', jalur: '/mutu' },
  sdm: { judul: 'SDM', jalur: '/sdm' },
  aset: { judul: 'Aset', jalur: '/aset' },
  approval: { judul: 'Persetujuan', jalur: '/approval-inbox' },
};

/*
  Alamat WEB (bukan API). Keduanya berbeda host di produksi:

      app.puraloka-suite.duckdns.org   web
      api.puraloka-suite.duckdns.org   API

  Diturunkan dari alamat API dengan mengganti subdomainnya — supaya satu
  variabel env tetap jadi sumber kebenaran, dan tak ada alamat kedua yang
  bisa menyimpang diam-diam.
*/
function alamatWeb(): string {
  const eksplisit = process.env.EXPO_PUBLIC_WEB_URL;
  if (eksplisit) return eksplisit.replace(/\/$/, '');

  const api = process.env.EXPO_PUBLIC_API_URL ?? '';
  if (api.includes('//api.')) return api.replace('//api.', '//app.').replace(/\/$/, '');

  /* Pengembangan: web di 3000, API di port lain pada host yang sama. */
  if (__DEV__) return api.replace(/:\d+$/, ':3000');

  return '';
}

export default function LayarWeb() {
  const { modul } = useLocalSearchParams<{ modul: string }>();
  const entri = MODUL[String(modul)];
  const [token, setToken] = useState<string | null>(null);
  const [siap, setSiap] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const sudahMuat = useRef(false);

  useEffect(() => {
    let batal = false;
    (async () => {
      const t = await storage.get('puraloka_token');
      if (batal) return;
      if (!t) {
        setGalat('Sesi tidak ditemukan. Masuk ulang lalu coba lagi.');
      }
      setToken(t);
      setSiap(true);
    })();
    return () => {
      batal = true;
    };
  }, []);

  const basis = alamatWeb();

  if (!entri) {
    return (
      <Pesan
        judul="Modul tidak dikenal"
        isi={`"${String(modul)}" tidak ada dalam daftar modul yang bisa dibuka.`}
      />
    );
  }
  if (!basis) {
    return (
      <Pesan
        judul="Alamat web belum diatur"
        isi="EXPO_PUBLIC_WEB_URL atau EXPO_PUBLIC_API_URL belum diisi saat build."
      />
    );
  }
  if (!siap) {
    return (
      <View style={s.tengah}>
        <ActivityIndicator size="large" color="#003366" />
      </View>
    );
  }
  if (galat) {
    return <Pesan judul="Tidak bisa membuka" isi={galat} />;
  }

  /*
    `react-native-webview` sengaja di-`require` di dalam fungsi, bukan
    di-`import` di kepala berkas.

    Paketnya BELUM terpasang: memasangnya menuntut `pnpm install`, dan
    `docs/execution/KERJA-PARALEL.md` melarangnya selama sesi lain berjalan
    di checkout yang sama — ia mengosongkan `node_modules` workspace lain di
    tengah jalan, dan galatnya menuduh KODE.

    Dengan `require` di dalam fungsi, berkas ini tetap bisa di-typecheck dan
    layar lain tetap berjalan; yang gagal hanya layar ini, dengan pesan yang
    menyebut sebab dan perbaikannya. Tanpa itu, seluruh aplikasi gagal dimuat
    karena satu modul yang hilang.
  */
  let WebView: React.ComponentType<Record<string, unknown>>;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    WebView = require('react-native-webview').WebView;
  } catch {
    return (
      <Pesan
        judul="WebView belum terpasang"
        isi={
          'Paket `react-native-webview` belum ada. Jalankan:\n\n' +
          'pnpm --filter @puraloka/mobile add react-native-webview\n\n' +
          'lalu build ulang. Layar lain tetap berjalan.'
        }
      />
    );
  }

  const url = `${basis}${entri.jalur}`;
  /*
    Kegagalan `localStorage` TIDAK ditelan.

    Ia bisa gagal nyata: mode privat, penyimpanan penuh, atau kebijakan situs
    yang memblokirnya. Kalau itu terjadi, halaman web di dalam WebView akan
    mengalihkan ke login — dan gejalanya terbaca seperti "sesi habis", bukan
    seperti penyimpanan yang ditolak.

    Pesannya dikirim ke React Native lewat `postMessage` supaya terlihat di
    log aplikasi, bukan hilang di konsol WebView yang tak seorang pun buka.
  */
  const suntik = `
    try {
      localStorage.setItem('puraloka_token', ${JSON.stringify(token ?? '')});
    } catch (e) {
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(
        JSON.stringify({ jenis: 'galat-storage', pesan: String(e && e.message || e) })
      );
    }
    true;
  `;

  return (
    <>
      <Stack.Screen options={{ title: entri.judul, headerBackTitle: 'Kembali' }} />
      <WebView
        source={{ uri: url, headers: token ? { Authorization: `Bearer ${token}` } : undefined }}
        injectedJavaScriptBeforeContentLoaded={suntik}
        startInLoadingState
        renderLoading={() => (
          <View style={s.tengah}>
            <ActivityIndicator size="large" color="#003366" />
          </View>
        )}
        /*
          Navigasi KELUAR dari host aplikasi ditolak.

          Tanpa ini, satu tautan ke situs luar membuka halaman pihak ketiga DI
          DALAM sesi yang sudah terautentikasi — dan pengguna tak punya bilah
          alamat untuk melihat ia sudah tak di aplikasi lagi.
        */
        onShouldStartLoadWithRequest={(req: { url: string }) => {
          if (!req.url.startsWith(basis)) return false;
          return true;
        }}
        onMessage={(e: { nativeEvent: { data: string } }) => {
          /* Satu-satunya pesan yang dikirim halaman: kegagalan localStorage.
             Dicatat, bukan didiamkan — sesi yang tak tersimpan membuat
             navigasi berikutnya terlempar ke login tanpa sebab yang terlihat. */
          try {
            const m = JSON.parse(e.nativeEvent.data);
            if (m?.jenis === 'galat-storage') {
              console.warn('[web] sesi tak tersimpan di WebView:', m.pesan);
            }
          } catch (err) {
            console.warn('[web] pesan tak dikenali dari halaman:', String(err));
          }
        }}
        onError={() => {
          if (!sudahMuat.current) setGalat('Halaman gagal dimuat. Periksa koneksi.');
        }}
        onLoadEnd={() => {
          sudahMuat.current = true;
        }}
        style={{ flex: 1 }}
      />
    </>
  );
}

function Pesan({ judul, isi }: { judul: string; isi: string }) {
  return (
    <View style={s.tengah}>
      <Text style={s.judul}>{judul}</Text>
      <Text style={s.isi}>{isi}</Text>
      <Pressable style={s.tombol} onPress={() => router.back()} accessibilityRole="button">
        <Text style={s.tombolTeks}>Kembali</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  tengah: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#F8FAFC' },
  judul: { fontSize: 17, fontWeight: '700', color: '#111827', marginBottom: 8, textAlign: 'center' },
  isi: { fontSize: 14, color: '#5A616B', textAlign: 'center', lineHeight: 20 },
  tombol: { marginTop: 20, paddingVertical: 11, paddingHorizontal: 22, backgroundColor: '#003366', borderRadius: 10 },
  tombolTeks: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
});
