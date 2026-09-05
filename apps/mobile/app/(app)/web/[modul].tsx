import { useLocalSearchParams, Stack, router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { Tekan } from '@/components/ui/Tekan';
import { storage } from '@/lib/storage';
import { useTema } from '@/hooks/useTema';
import { FONT, HURUF, RADIUS, SENTUH_MIN, SPASI, type Palet } from '@/lib/tema';

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

  ── Sesi diteruskan lewat COOKIE yang ditulis di dalam WebView

  WebView tak berbagi cookie dengan permintaan `axios` aplikasi. Tanpa
  penerusan sesi, pengguna yang SUDAH login akan disambut layar login lagi
  di dalam WebView — dan itu terbaca seperti aplikasi yang rusak, bukan
  seperti keamanan yang bekerja.

  Gerbangnya ada di `apps/web/middleware.ts`, dan ia membaca **cookie**
  `puraloka_token`. Karena itu `injectedJavaScriptBeforeContentLoaded`
  menulis `document.cookie` (bukan hanya `localStorage`), lalu mengisi
  `localStorage` juga untuk kode halaman yang memanggil API dari klien.

  ⚠ Paragraf ini pernah berbunyi "lewat token, bukan lewat cookie" dan
  keliru sepanjang umurnya — akibatnya SEMUA modul WebView mengalihkan ke
  login. Riwayat lengkap pengukurannya ada di komentar dekat `const suntik`.

  ⚠ `injectedJavaScriptBeforeContentLoaded` berjalan SEBELUM skrip halaman.
  Itu perlu, tetapi TIDAK cukup: middleware berjalan di server, sebelum
  bingkai WebView menerima HTML sama sekali. Yang menolongnya cuma cookie,
  sebab cookie ikut terkirim bersama permintaan navigasi berikutnya.
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
  /*
    `/sdm` TIDAK punya halaman indeks — hanya lima sub-halaman (cuti,
    klaim-perjalanan, kompetensi, payroll, timesheet). Modul ini menuju 404
    sejak dibuat, dan tak ada yang tahu karena tak ada penjaga yang
    menghubungkan peta ini dengan halaman web. Ditemukan 2026-08-31 oleh
    `audit-modul-mobile-nyata.mjs` pada jalan pertamanya.

    Diarahkan ke `/sdm/timesheet` — "Absensi & Timesheet", satu-satunya
    sub-halaman berstatus `hidup` yang relevan lapangan, dan izinnya
    (`sdm:timesheet:view`) sama dengan yang sudah tertulis di entri
    "Lainnya".
  */
  sdm: { judul: 'Absensi & Timesheet', jalur: '/sdm/timesheet' },
  aset: { judul: 'Aset', jalur: '/aset' },
  approval: { judul: 'Persetujuan', jalur: '/approval-inbox' },

  /*
    Lima ditambahkan 2026-08-31. Dipilih dari 92 halaman yatim dengan tiga
    syarat yang DIUKUR, bukan ditebak:

      1. `kesiapan = 'hidup'` di tabel `menu_items` — bukan 'rencana'
      2. punya halaman indeks `<kelompok>/page.tsx`; tanpa itu WebView 404
      3. izinnya dipegang peran lapangan (mandor/pm), diukur lewat
         `get_role_permissions()`

    Yang SENGAJA tidak masuk meski yatim:

      pengaturan (31 hal)  pekerjaan kantor; daftar 34 modul di layar
                           "Lainnya" tak bisa dipindai siapa pun
      audit, klien         admin-only — mandor dan pm nol akses
      otomasi              kesiapan 'rencana', belum hidup
      master, dokumen      tak punya halaman indeks -> 404
      m, peta-modul        bukan modul nyata

    Sesudah lima ini: 63 -> ~94 halaman terjangkau dari HP.
  */
  lapangan: { judul: 'Lapangan', jalur: '/lapangan' },
  k3: { judul: 'K3', jalur: '/k3' },
  proyek: { judul: 'Proyek', jalur: '/proyek' },
  kalender: { judul: 'Kalender', jalur: '/kalender' },
  risiko: { judul: 'Risiko', jalur: '/risiko' },
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
  /*
    Gaya dirakit di dalam komponen — `StyleSheet.create` di lingkup
    modul berjalan sebelum satu hook pun, jadi ia tak bisa membaca
    `useTema()`. Lihat catatan panjangnya di `pekerjaan.tsx`.
  */
  const { c } = useTema();
  const s = React.useMemo(() => gaya(c), [c]);
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
        <ActivityIndicator size="large" color={c.navy} />
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
    ── Sesi diteruskan lewat COOKIE, bukan localStorage ───────────────────

    ⚠ Versi pertama menanam token ke `localStorage` saja, dan itu TIDAK
    PERNAH bisa bekerja. Diukur 2026-09-05 terhadap produksi, sesudah
    founder melaporkan "beberapa tak bisa menampilkan WebView":

        GET https://app.…/keuangan                        -> 307  /login
        GET …  --cookie "puraloka_token=<access_token>"   -> 200

    Ketujuh belas modul memberi 307 yang sama. Bukan sebagian — SEMUANYA;
    laporan "beberapa" datang dari pengguna yang wajar berhenti mencoba
    setelah dua atau tiga.

    Sebabnya tiga lapis yang masing-masing benar sendiri:

      1. `apps/web/middleware.ts:214` menggerbang dengan
         `request.cookies.get('puraloka_token')` — COOKIE, bukan header
         dan bukan localStorage.
      2. Middleware Next.js berjalan di SERVER, sebelum satu baris JS
         halaman pun jalan. `localStorage` belum berwujud di sana, dan tak
         akan pernah.
      3. Header `Authorization` yang ikut dikirim juga tak menolong:
         middleware tak membacanya, dan header itu hanya menempel pada
         permintaan PERTAMA — navigasi berikutnya berangkat telanjang.

    Catatan lama di kepala berkas ini menegaskan `BeforeContentLoaded`
    penting supaya token ada "sebelum aplikasi web memeriksanya".
    Penalarannya benar untuk pemeriksaan di KLIEN, dan tak menyentuh
    gerbang di SERVER — yang mengalihkan sebelum HTML dikirim. Penjelasan
    yang benar mendampingi keadaan yang salah (CLAUDE.md §8a.2).

    ⚠ Cookie ini TAK BISA diwarisi dari yang dipasang API: ia `HttpOnly`
    (terbaca di `Set-Cookie` balasan login) dan terikat domain `api.`,
    sementara middleware membacanya di domain `app.`. Ia memang harus
    ditulis dari sisi WebView.
  */
  const pakaiHttps = url.startsWith('https://');

  /*
    Kegagalan penyimpanan TIDAK ditelan.

    Ia bisa gagal nyata: mode privat, penyimpanan penuh, atau kebijakan
    situs yang memblokirnya. Kalau itu terjadi, halaman di dalam WebView
    mengalihkan ke login — dan gejalanya terbaca seperti "sesi habis",
    bukan seperti penyimpanan yang ditolak.

    Pesannya dikirim ke React Native lewat `postMessage` supaya terlihat di
    log aplikasi, bukan hilang di konsol WebView yang tak seorang pun buka.

    ⚠ `Secure` HANYA saat HTTPS. Memasangnya di `http://` pengembangan
    membuat peramban menolak cookie-nya DIAM-DIAM — dan gejalanya kembali
    persis seperti cacat yang baru saja diperbaiki, tanpa satu pun galat.
  */
  const suntik = `
    try {
      var t = ${JSON.stringify(token ?? '')};
      var atribut = '; path=/; SameSite=Lax${pakaiHttps ? '; Secure' : ''}';
      document.cookie = 'puraloka_token=' + t + atribut;

      /*
        localStorage TETAP diisi. Cookie melewatkan gerbang middleware;
        localStorage melayani kode halaman yang membacanya langsung untuk
        memanggil API dari sisi klien. Keduanya dibutuhkan, bukan salah
        satu — itu sebabnya yang lama tak "diganti", melainkan ditambahi.
      */
      localStorage.setItem('puraloka_token', t);
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
            <ActivityIndicator size="large" color={c.navy} />
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

/**
 * Layar pesan (galat, tak ada izin, modul belum siap).
 *
 * Memanggil `useTema()` SENDIRI, bukan menerima gaya lewat prop.
 *
 * Ia komponen di lingkup modul dan dipanggil dari empat tempat di dalam
 * `LayarWeb` — meneruskan `s` lewat prop berarti empat pemanggil yang
 * harus diubah bersamaan, dan satu yang terlewat jadi galat runtime,
 * bukan galat tipe.
 *
 * `useTema()` murah (`useColorScheme` sudah reaktif) dan komponen ini
 * hanya dirender satu per layar.
 */
function Pesan({ judul, isi }: { judul: string; isi: string }) {
  const { c } = useTema();
  const s = React.useMemo(() => gaya(c), [c]);
  return (
    <View style={s.tengah}>
      <Text style={s.judul}>{judul}</Text>
      <Text style={s.isi}>{isi}</Text>
      <Tekan style={s.tombol} onPress={() => router.back()} accessibilityRole="button">
        <Text style={s.tombolTeks}>Kembali</Text>
      </Tekan>
    </View>
  );
}

function gaya(c: Palet) {
  return StyleSheet.create({
    tengah: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: c.surfaceSubtle },
    judul: { fontSize: 17, fontFamily: FONT.judul, color: c.textPrimary, marginBottom: 8, textAlign: 'center' },
    isi: { fontSize: 14, color: c.textSecondary, textAlign: 'center', lineHeight: 20 },
    tombol: { marginTop: 20, paddingVertical: 11, paddingHorizontal: 22, backgroundColor: c.navy, borderRadius: 10 },
    tombolTeks: { color: c.surfaceRaised, fontSize: 14, fontFamily: FONT.isiTebal },
  });
}
