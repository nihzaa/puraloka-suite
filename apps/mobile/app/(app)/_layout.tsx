import { Tabs } from 'expo-router';
import React from 'react';
import { Text } from 'react-native';
import { useAuth } from '@/hooks/useAuth';

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return <Text style={{ fontSize: focused ? 22 : 20, opacity: focused ? 1 : 0.6 }}>{emoji}</Text>;
}

/*
  `gray` dipakai sebagai `tabBarInactiveTintColor` — label tab yang tak
  aktif, 11px, dan hadir di SETIAP layar.

  Dihitung, bukan ditaksir: #9CA3AF pada putih = 2.54:1, gagal WCAG AA yang
  menuntut 4.5:1 untuk teks normal. #6B7280 = 4.83:1.

  Repo ini punya preseden kenapa dihitung: `kontras-situs.mjs` lahir karena
  tiga angka kontras yang ditulis dari taksiran ketiganya meleset.
*/
const C = { navy: '#003366', gray: '#6B7280' };

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

  const bolehKasbon = punyaIzin('mandor:kasbon:create');
  const bolehProgres = punyaIzin('reports:progress') && punyaIzin('mandor:kasbon:create');
  const bolehMandor = punyaIzin('mandor:assign');

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.navy,
        tabBarInactiveTintColor: C.gray,
        tabBarStyle: {
          borderTopColor: '#E5E7EB',
          backgroundColor: '#fff',
          paddingTop: 4,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🏠" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="proyek/index"
        options={{
          title: 'Proyek',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🏗️" focused={focused} />,
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
                title: 'Progress',
                tabBarIcon: ({ focused }) => <TabIcon emoji="📷" focused={focused} />,
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
                tabBarIcon: ({ focused }) => <TabIcon emoji="💵" focused={focused} />,
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
                tabBarIcon: ({ focused }) => <TabIcon emoji="👷" focused={focused} />,
              }
            : { href: null }
        }
      />

      <Tabs.Screen
        name="notifications/index"
        options={{
          title: 'Notifikasi',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🔔" focused={focused} />,
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
          tabBarIcon: ({ focused }) => <TabIcon emoji="⋯" focused={focused} />,
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
                tabBarIcon: ({ focused }) => <TabIcon emoji="🗓️" focused={focused} />,
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
