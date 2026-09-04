import { Tabs } from 'expo-router';
import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/hooks/useAuth';
import { useTema } from '@/hooks/useTema';
import { FONT } from '@/lib/tema';

/**
 * Ikon bilah tab.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA BUKAN EMOJI LAGI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Versi sebelumnya: `<Text>{emoji}</Text>` dengan 🏠 🏗️ 📷 💵 👷 🔔 ⋯ 🗓️.
 *
 * Yang MEMOTONG LABEL, dan angkanya tegas. Diukur di viewport 360×800:
 *
 *     ikon emoji fontSize 22  →  tinggi terender 30px
 *     label fontSize 11       →  tinggi terender  6px   ← DIPERAS
 *     bilah tab                  tinggi           44px
 *
 * Emoji punya metrik font yang jauh lebih tinggi daripada huruf biasa —
 * 30px untuk fontSize 22, bukan ~22px. Ikon + padding menghabiskan ruang,
 * dan label 11px berakhir dalam kotak setinggi 6px: terpotong di tengah
 * huruf, di SETIAP layar aplikasi.
 *
 * Tiga alasan lain, dan semuanya sudah berlaku sebelum diukur:
 *
 *   1. RUPANYA BERBEDA DI TIAP HP. 🏗️ di Samsung, Xiaomi, dan Android 9
 *      adalah tiga gambar berbeda; sebagian perangkat lama tak punya
 *      glifnya sama sekali dan menggambar kotak kosong.
 *
 *   2. TAK BISA DIBERI WARNA. Keadaan aktif hanya bisa ditandai dengan
 *      opasitas dan ukuran — dua isyarat yang lemah. `tabBarActiveTintColor`
 *      navy tak berpengaruh sama sekali pada emoji.
 *
 *   3. `ui-ux-pro-max` menyebutnya anti-pattern eksplisit ("Emoji as icons",
 *      prioritas 4).
 *
 * `@expo/vector-icons` sudah ada di package.json sejak awal dan tak pernah
 * dipakai sekali pun.
 */
function TabIcon({
  nama,
  focused,
  warna,
}: {
  nama: React.ComponentProps<typeof Ionicons>['name'];
  focused: boolean;
  warna: string;
}) {
  /*
    Varian `-outline` saat tak aktif, padat saat aktif — konvensi iOS dan
    Material yang sama-sama dikenali. Bersama warna, keadaan aktif punya DUA
    isyarat, jadi ia tetap terbaca oleh pengguna yang tak membedakan warna.
  */
  return <Ionicons name={nama} size={22} color={warna} />;
}

/*
  Warna bilah tab datang dari `useTema()`, bukan konstanta.

  Riwayat yang tak boleh hilang bersama konstantanya: `tabBarInactiveTintColor`
  pernah `#9CA3AF` — label tab 11px yang hadir di SETIAP layar, dan DIHITUNG
  2.54:1 pada putih. Gagal WCAG AA yang menuntut 4.5:1.

  Penggantinya waktu itu `#6B7280` (4.83:1). Sekarang `c.textSecondary`, yang
  DIHITUNG lebih baik di kedua mode:

      terang  #5A616B pada #FFFFFF   6.26:1
      gelap   #9098B8 pada #212536   5.33:1

  Bukan warna yang sama dengan #6B7280 — lebih gelap, jadi naik dari 4.83
  ke 6.26 di mode terang.

  Repo ini punya preseden kenapa DIHITUNG, bukan ditaksir: `kontras-situs.mjs`
  lahir karena tiga angka kontras yang ditulis dari taksiran ketiganya meleset.
*/

/*
  ══════════════════════════════════════════════════════════════════════════
  TAB DITENTUKAN IZIN, BUKAN PERAN — ADR-004
  ══════════════════════════════════════════════════════════════════════════

  Bentuk sebelumnya:

      const role = user?.role ?? 'client'
      const showMandorTabs = role === 'mandor' || role === 'admin'
      const showPMTabs     = role === 'pm'     || role === 'admin'

  Tiga literal peran sebagai gerbang otorisasi — persis yang dilarang
  ADR-004 dan CLAUDE.md §5.1. Akibat nyatanya bukan soal gaya penulisan:
  tenant yang membuat peran sendiri lewat UI (`direktur`, `kepala_proyek`,
  `pengawas`) mendapat aplikasi mobile TANPA tab kasbon, progres, maupun
  mandor. Tak ada galat, tak ada 403 — menunya sekadar tidak ada, dan tak
  seorang pun bisa menebak kenapa.

  ── Kunci yang dipakai, dan dari mana asalnya

  Diambil dari `db/migrations/050_rbac_foundation.sql`, bukan dikarang:

    mandor:kasbon:create   dimiliki mandor (dan admin)   → tab Kasbon
    reports:progress       dimiliki mandor, client, admin → tab Progress
    mandor:assign          dimiliki pm & admin, BUKAN mandor → tab Mandor

  ⚠ `reports:progress` juga dimiliki CLIENT. Itu benar untuk MELIHAT laporan
  progres, tetapi tab ini MENGISI progres. Karena rutenya sendiri
  (`POST /projects/:id/progress-logs`) hanya ber-`authenticate` tanpa
  `requirePermission`, tak ada kunci yang persis memagarinya — jadi tab ini
  menuntut `reports:progress` DAN `mandor:kasbon:create` sekaligus. Yang
  kedua tak dimiliki client, dan itulah yang memisahkan keduanya.

  Ini bukan tebakan: kalau nanti rutenya diberi izin sendiri
  (mis. `progress:create`), gantilah syarat di bawah dengan kunci itu.
*/
export default function AppLayout() {
  const { punyaIzin } = useAuth();
  const { c } = useTema();

  const bolehKasbon = punyaIzin('mandor:kasbon:create');
  const bolehProgres = punyaIzin('reports:progress') && punyaIzin('mandor:kasbon:create');
  const bolehMandor = punyaIzin('mandor:assign');

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.navy,
        tabBarInactiveTintColor: c.textSecondary,
        tabBarStyle: {
          borderTopColor: c.border,
          backgroundColor: c.surfaceRaised,
          paddingTop: 6,
          /*
            Tinggi DINYATAKAN, bukan diserahkan ke bawaan.

            Bawaan (44px) memeras label 11px jadi kotak setinggi 6px —
            terukur, dan terlihat di potret sebagai huruf terpotong di
            tengah. 58px memberi ikon 22px + label 11px + jarak, dengan
            ruang untuk `paddingBottom` perangkat bergestur.
          */
          height: 58,
          paddingBottom: 6,
        },
        /*
          TETAP 11px, dan itu keputusan yang dihitung — bukan kelalaian.

          Delapan tab pada layar 360px = ~45px per tab. Lebar label pada
          font sistem kira-kira 0,55 x fontSize per huruf:

              "Notifikasi" 10 huruf  11px = 61px   SUDAH melebihi 45
              "Dashboard"   9 huruf  11px = 54px   melebihi juga
              pada 12px keduanya jadi 66px dan 59px

          Jadi menaikkan ke 12px memperburuk pemotongan yang sudah terjadi.
          Yang diperbaiki LABELNYA: Notifikasi -> Notif, Dashboard ->
          Beranda, Progress -> Progres (yang terakhir sekalian: "Progress"
          bahasa Inggris di antara tujuh label Indonesia).

              "Notif"    5 huruf  11px = 30px  muat
              "Beranda"  7 huruf  11px = 42px  muat
              "Progres"  7 huruf  11px = 42px  muat

          Teks 11px di bilah tab dikecualikan dari kenaikan 11->12 yang
          dilakukan pada 13 gaya lain hari ini. Kalau nanti bilahnya
          berkurang jadi enam tab (60px per tab), 12px muat untuk semuanya.
        */
        /*
          `lineHeight` WAJIB dinyatakan, dan itu bukan soal selera.

          Tanpanya, `react-native-web` memberi elemen label
          `height: 5px; overflow: hidden` untuk teks 11px — terukur di DOM.
          Hurufnya terpotong di tengah, di SETIAP layar aplikasi, dan
          menaikkan tinggi BILAH tak memperbaikinya sama sekali (dicoba:
          bilah 44 → 58px, label tetap 5px).

          Sebabnya label mewarisi `lineHeight: normal` dari induk ber-fontSize
          16px, lalu tingginya dihitung dari sesuatu yang bukan fontSize-nya
          sendiri. 14 = 11px + ruang pangkal huruf turun (g, y, p).
        */
        tabBarLabelStyle: {
          fontSize: 11,
          lineHeight: 14,
          fontFamily: FONT.isiTebal,
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Beranda',
          tabBarIcon: ({ focused, color }) => (
                  <TabIcon nama={focused ? 'home' : 'home-outline'} focused={focused} warna={color} />
                ),
        }}
      />
      <Tabs.Screen
        name="proyek/index"
        options={{
          title: 'Proyek',
          tabBarIcon: ({ focused, color }) => (
                  <TabIcon nama={focused ? 'business' : 'business-outline'} focused={focused} warna={color} />
                ),
        }}
      />
      <Tabs.Screen
        name="proyek/[id]"
        options={{ href: null }}
      />

      {/* Mandor-only: input progress + kasbon */}
      <Tabs.Screen
        name="progress/input"
        options={
          bolehProgres
            ? {
                title: 'Progres',
                tabBarIcon: ({ focused, color }) => (
                  <TabIcon nama={focused ? 'camera' : 'camera-outline'} focused={focused} warna={color} />
                ),
              }
            : { href: null }
        }
      />
      <Tabs.Screen
        name="kasbon/index"
        options={
          bolehKasbon
            ? {
                title: 'Kasbon',
                tabBarIcon: ({ focused, color }) => (
                  <TabIcon nama={focused ? 'cash' : 'cash-outline'} focused={focused} warna={color} />
                ),
              }
            : { href: null }
        }
      />
      <Tabs.Screen
        name="kasbon/ajukan"
        options={{ href: null }}
      />

      {/* PM-only: mandor summary */}
      <Tabs.Screen
        name="mandor/index"
        options={
          bolehMandor
            ? {
                title: 'Mandor',
                tabBarIcon: ({ focused, color }) => (
                  <TabIcon nama={focused ? 'people' : 'people-outline'} focused={focused} warna={color} />
                ),
              }
            : { href: null }
        }
      />

      <Tabs.Screen
        name="notifications/index"
        options={{
          title: 'Notif',
          tabBarIcon: ({ focused, color }) => (
                  <TabIcon nama={focused ? 'notifications' : 'notifications-outline'} focused={focused} warna={color} />
                ),
        }}
      />

      {/*
        Pintu ke modul KANTOR (keuangan, akuntansi, estimasi, dst) yang dibuka
        lewat WebView — keputusan founder 2026-08-31.

        Diberi tab sendiri, bukan disembunyikan: modul yang hanya bisa dicapai
        lewat tautan dalam tak akan pernah ditemukan orang, dan "kemampuan
        penuh" yang tak bisa dijangkau sama saja dengan tak ada.
      */}
      <Tabs.Screen
        name="lainnya"
        options={{
          title: 'Lainnya',
          tabBarIcon: ({ focused, color }) => (
                  <TabIcon nama={focused ? 'ellipsis-horizontal' : 'ellipsis-horizontal-outline'} focused={focused} warna={color} />
                ),
        }}
      />

      {/*
        Layar WebView-nya sendiri TIDAK jadi tab — ia dibuka dari daftar di
        "Lainnya". `href: null` menyembunyikannya dari bilah tab tanpa
        mengeluarkannya dari router; tanpa itu tiap modul akan muncul sebagai
        tab tersendiri dan bilahnya penuh.
      */}
      {/*
        Absensi harian — layar LAPANGAN, native penuh dengan antrean offline.
        Diberi tab sendiri karena inilah yang paling sering diisi: 1.279 baris
        di `absensi_harian`, lebih banyak daripada progres (272) dan kasbon
        (67) digabung.

        Disaring `mandor:wage:create`, izin yang sama dengan rute POST-nya —
        menampilkan tab yang berujung 403 mengajari orang bahwa aplikasinya
        suka gagal.
      */}
      <Tabs.Screen
        name="absensi/input"
        options={
          punyaIzin('mandor:wage:create')
            ? {
                title: 'Absensi',
                tabBarIcon: ({ focused, color }) => (
                  <TabIcon nama={focused ? 'calendar' : 'calendar-outline'} focused={focused} warna={color} />
                ),
              }
            : { href: null }
        }
      />

      {/*
        Lapor temuan (punch list) — layar lapangan. `punch_items` 40 baris,
        terbanyak di antara tabel lapangan yang belum punya layar mobile.

        TIDAK jadi tab: bilah sudah penuh (dashboard, proyek, progres, kasbon,
        absensi, mandor, notifikasi, lainnya). Dibuka dari "Lainnya" —
        menambah tab kesembilan membuat tiap ikon menyempit sampai sulit
        ditekan dengan ibu jari kotor di lapangan.
      */}
      <Tabs.Screen name="punch/lapor" options={{ href: null }} />

      {/*
        Lapor NCR — ketidaksesuaian mutu. Terpisah dari punch list karena
        keduanya benda berbeda: punch = cacat yang tinggal dirapikan, NCR =
        penyimpangan dari sesuatu yang TERTULIS, dengan rantai status enam
        langkah dan kemungkinan berujung klaim biaya.

        Sama-sama `href: null` dan dibuka dari "Lainnya".
      */}
      <Tabs.Screen name="ncr/lapor" options={{ href: null }} />

      {/*
        Ajukan izin kerja — satu-satunya layar lapangan yang menahan
        pekerjaan alih-alih mencatatnya. Mandor hanya bisa MENGAJUKAN
        (`k3:permit:manage`); yang memutuskan butuh `k3:permit:decide`, dan
        basis memaksa pemutus <> pengaju lewat CHECK.
      */}
      <Tabs.Screen name="izin-kerja/ajukan" options={{ href: null }} />

      {/*
        Pekerjaan Saya — layar BACA untuk temuan, NCR, dan izin kerja.

        Diukur 2026-08-31: mobile punya enam layar TULIS lapangan dan nol
        layar baca untuk tiga di antaranya. Mandor bisa mengirim, lalu tak
        pernah tahu nasibnya — dan izin kerja adalah GERBANG: pekerjaan
        berbahaya menunggu persetujuan yang tak terlihat dari alat yang
        dipakai mengajukannya.

        Tak jadi tab (bilah sudah delapan); dibuka dari "Lainnya", di atas
        ketiga layar lapor — orang memeriksa nasib sebelum melapor yang baru.
      */}
      <Tabs.Screen name="pekerjaan" options={{ href: null }} />

      <Tabs.Screen name="web/[modul]" options={{ href: null }} />
    </Tabs>
  );
}
