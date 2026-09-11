import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type {
  BottomTabBarProps,
  BottomTabNavigationOptions,
} from '@react-navigation/bottom-tabs';
import { useTema } from '@/hooks/useTema';
import { useKurangiGerak } from '@/hooks/useKurangiGerak';
import { FONT, HURUF, RADIUS, SENTUH_MIN, SPASI } from '@/lib/tema';

/**
 * Bilah tab buatan sendiri — pil aktif yang bergerak, bukan label berwarna.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA BILAH BAWAAN DIGANTI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Founder 2026-09-12: *"bottom nav nyaa saya mau lebih di enhance dan punya
 * khas, jugaa terasa lebih modern"*.
 *
 * Dan potretnya membenarkan: label tab terpotong di SETIAP layar
 * ("Bera… Bera… Kasb…"). Tetapi sebabnya bukan gaya — melainkan
 * ARITMETIKA, dan itu sudah tertulis di `_layout.tsx` sendiri:
 *
 *     8 tab pada layar 360px  =  ~45px per tab
 *     "Notifikasi" 11px       =  61px   ← melebihi 45
 *     "Dashboard"  11px       =  54px   ← melebihi juga
 *
 * Berkas itu menutupinya dengan MEMENDEKKAN kata (Notifikasi→Notif,
 * Dashboard→Beranda). Itu menahan gejalanya satu putaran; delapan tab
 * tetap delapan tab.
 *
 * Material dan `ui-ux-pro-max` prioritas 9 (`bottom-nav-limit`) sama-sama
 * memberi batas **LIMA**. Kelebihannya pindah ke "Lainnya" — yang di
 * aplikasi ini SUDAH ADA dan sudah memuat 20 entri.
 *
 * ── Yang membuatnya terasa modern, dan tiap satunya punya alasan
 *
 * 1. **PIL AKTIF YANG BERGESER.** Keadaan aktif dulu hanya warna — isyarat
 *    paling lemah, dan hilang sama sekali bagi yang tak membedakan warna.
 *    Pil navy yang MENELUSURI dari tab lama ke tab baru menyatakan
 *    hubungan sebab-akibat: "yang Anda tekan, ini pindahnya". Material
 *    menyebutnya active indicator; `ui-ux-pro-max` prioritas 7
 *    `motion-meaning` menuntut tiap gerak menyatakan sebab-akibat.
 *
 * 2. **Ikon padat saat aktif, garis saat tidak.** Isyarat KEDUA di luar
 *    warna (WCAG 1.4.1) — konvensi yang sama dikenali iOS dan Material.
 *
 * 3. **Label hanya pada tab AKTIF.** Ini yang membebaskan aritmetika di
 *    atas: satu label pada satu tab punya seluruh lebar pil untuk dirinya,
 *    jadi tak ada lagi yang terpotong — bahkan "Notifikasi" utuh.
 *    Pola yang dipakai Material 3 navigation bar dan sebagian besar
 *    aplikasi yang terbaca modern hari ini.
 *
 * 4. **Haptik saat berpindah.** `expo-haptics` terpasang 2026-09-12 dan
 *    NOL dipakai. Mandor memakai sarung tangan di bawah matahari; getaran
 *    adalah satu-satunya umpan balik yang pasti sampai. Dipakai di sini
 *    saja — Apple HIG memperingatkan haptik yang berlebihan.
 *
 * ── Yang SENGAJA tidak dilakukan
 *
 * - **Blur / glassmorphism.** Mahal di Android murah, dan hilang total di
 *   bawah matahari. Sudah ditolak eksplisit di ARAH-VISUAL §12b.
 * - **Bilah mengambang berbayang.** Bayangan di elemen yang hadir di
 *   SETIAP layar dibayar tiap frame; `audit-bayangan-mobile-bertoken`
 *   menjelaskan biayanya. Kedalaman dari garis hairline + permukaan.
 * - **Ikon tanpa label sama sekali.** `ui-ux-pro-max` prioritas 9
 *   (`nav-label-icon`): ikon-saja merusak keterjangkauan. Label tetap ada
 *   pada yang aktif, dan `accessibilityLabel` selalu lengkap untuk semua.
 */

/** Durasi geser pil. Dalam rentang 150-300ms (prioritas 7). */
const DURASI_MS = 240;

export function BilahTab({ state, descriptors, navigation }: BottomTabBarProps) {
  const { c } = useTema();
  const insets = useSafeAreaInsets();
  const kurangiGerak = useKurangiGerak();

  /*
    Lebar bilah DIUKUR lewat `onLayout`, tidak dihitung dari persen.

    Percobaan pertama memakai `outputRange` berisi string persen
    (`'0%'`, `'100%'`, …) pada `translateX`. Di React Native itu sah untuk
    `width`, TIDAK untuk transform — dan `react-native-web` diam saja:
    nol galat konsol, pil tak pernah muncul, dan seluruh tombol menumpuk
    di kiri. Persis kelas "tiap lapisan menjawab benar untuk dirinya
    sendiri" yang berulang di repo ini.

    Piksel dari `onLayout` bekerja di kedua mesin, dan ikut benar saat
    layar diputar tanpa satu pun perhitungan tambahan.
  */
  const [lebar, setLebar] = React.useState(0);

  /*
    Hanya rute yang BENAR-BENAR tampil.

    ⚠ Disaring lewat `tabBarItemStyle.display`, BUKAN lewat `href`.

    `href: null` adalah gula sintaksis expo-router, dan ia TIDAK sampai ke
    sini. Dibaca dari sumbernya (`expo-router/build/layouts/TabsClient.js`
    baris 20-28): `href` dicabut dari options, lalu diterjemahkan jadi

        tabBarItemStyle: href == null ? { display: 'none' } : …

    Versi pertama komponen ini menyaring `o?.href !== null`, dan karena
    `href` sudah tak ada, syarat itu selalu benar: KESEMBILAN BELAS layar
    tersembunyi ikut jadi tab. Terukur di DOM — 29 tab pada bilah 390px,
    13px per tab, ikon berdempet di kiri dan label tinggal satu huruf.

    Nol galat konsol. Bilahnya tetap "berhasil" merender.
  */
  const rute = state.routes.filter((r) => {
    const gayaItem = descriptors[r.key]?.options?.tabBarItemStyle as
      | { display?: string }
      | undefined;
    return gayaItem?.display !== 'none';
  });

  const indeksAktif = rute.findIndex((r) => r.key === state.routes[state.index]?.key);

  /*
    Posisi pil sebagai NILAI PECAHAN indeks (0..n-1), bukan piksel.

    Piksel menuntut pengukuran lebar yang berubah tiap rotasi dan tiap
    perangkat. Indeks pecahan + `flex: 1` per tab membuat posisinya benar
    di lebar berapa pun tanpa satu pun pengukuran.
  */
  const geser = useRef(new Animated.Value(Math.max(indeksAktif, 0))).current;

  useEffect(() => {
    if (indeksAktif < 0) return;
    if (kurangiGerak !== false) {
      /* Tak ada gerak: langsung ke tempatnya. Bukan animasi yang dipercepat. */
      geser.setValue(indeksAktif);
      return;
    }
    const a = Animated.timing(geser, {
      toValue: indeksAktif,
      duration: DURASI_MS,
      /*
        `ease-in-out`, bukan `ease-out`. Pil ini BERPINDAH antara dua titik
        yang keduanya terlihat — bukan masuk dari luar layar. Gerak yang
        berangkat dan mendarat sama halusnya terbaca sebagai satu objek
        yang bergeser; `ease-out` membuatnya terbaca seperti dilempar.
      */
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    });
    a.start();
    return () => a.stop();
  }, [indeksAktif, kurangiGerak, geser]);

  if (rute.length === 0) return null;

  /* Lebar satu sel tab. 0 selama `onLayout` belum menjawab. */
  const lebarTab = lebar > 0 ? lebar / rute.length : 0;

  return (
    <View
      onLayout={(e) => setLebar(e.nativeEvent.layout.width)}
      style={[
        gaya.bilah,
        {
          backgroundColor: c.surfaceRaised,
          borderTopColor: c.border,
          /*
            Ruang aman perangkat bergestur DITAMBAHKAN, bukan dipaku.
            Memakukan 6px membuat bilah menabrak garis gestur di HP modern
            dan menyisakan ruang kosong di HP bertombol.
          */
          paddingBottom: Math.max(insets.bottom, SPASI.sm),
        },
      ]}
    >
      {/*
        Lapis pil DI BAWAH tombol, memenuhi lebar, digeser lewat transform.
        `pointerEvents="none"` supaya ia tak pernah mencuri ketukan.
      */}
      {lebar > 0 && indeksAktif >= 0 ? (
        <View style={gaya.lapisPil} pointerEvents="none">
          <Animated.View
            style={[
              gaya.pilBungkus,
              {
                width: lebarTab,
                transform: [
                  {
                    translateX:
                      rute.length > 1
                        ? geser.interpolate({
                            inputRange: rute.map((_, i) => i),
                            outputRange: rute.map((_, i) => i * lebarTab),
                          })
                        : 0,
                  },
                ],
              },
            ]}
          >
            <View style={[gaya.pil, { backgroundColor: c.navyLight }]} />
          </Animated.View>
        </View>
      ) : null}

      {rute.map((r, i) => {
        const { options } = descriptors[r.key];
        const judul =
          typeof options.title === 'string' ? options.title : r.name;
        const aktif = i === indeksAktif;

        /*
          Ikon diambil dari `tabBarIcon` yang SUDAH didefinisikan tiap
          `Tabs.Screen` — bukan dari field baru.

          Versi pertama komponen ini membaca `options.ikonTab` buatan
          sendiri, dan itu berarti DUA sumber ikon untuk satu bilah:
          yang lama tetap ada di tiap layar, yang baru harus diisi ulang.
          Dua daftar yang bisa menyimpang tanpa satu pun galat — kelas
          cacat yang sama dengan peta label ganda di `lib/label.ts`.

          `tabBarIcon` adalah fungsi render, jadi ia dipanggil di sini
          dengan warna & keadaan yang sudah ditentukan bilah ini.
        */
        const render = options.tabBarIcon;

        return (
          <TombolTab
            key={r.key}
            judul={judul}
            renderIkon={render}
            aktif={aktif}
            warnaAktif={c.navy}
            warnaMati={c.textSecondary}
            warnaRipple={c.surfaceHover}
            onPress={() => {
              const peristiwa = navigation.emit({
                type: 'tabPress',
                target: r.key,
                canPreventDefault: true,
              });
              if (aktif || peristiwa.defaultPrevented) return;

              /*
                Haptik HANYA saat benar-benar berpindah. Menekan tab yang
                sudah aktif tak memindahkan apa pun, dan getaran untuk
                "tidak terjadi apa-apa" mengajari orang mengabaikannya.

                `import()` dinamis: modulnya tak ada di web, dan kegagalan
                haptik tak boleh pernah menggagalkan navigasi.
              */
              if (Platform.OS !== 'web') {
                import('expo-haptics')
                  .then((h) => h.selectionAsync())
                  .catch(() => {})
              }
              navigation.navigate(r.name);
            }}
          />
        );
      })}
    </View>
  );
}

type RenderIkon = BottomTabNavigationOptions['tabBarIcon'];

const TombolTab = React.memo(function TombolTab({
  judul,
  renderIkon,
  aktif,
  warnaAktif,
  warnaMati,
  warnaRipple,
  onPress,
}: {
  judul: string;
  renderIkon: RenderIkon;
  aktif: boolean;
  warnaAktif: string;
  warnaMati: string;
  /**
   * Warna riak Android.
   *
   * Token tersendiri, BUKAN `warnaMati + '22'`. Menempelkan alpha heksa ke
   * sebuah token mengandaikan token itu selalu berbentuk `#RRGGBB` — dan
   * `navyLight` di mode gelap sudah berbentuk `rgba(...)`, yang akan
   * menghasilkan string warna tak sah tanpa satu pun galat.
   *
   * `audit-warna-mobile-bertoken` merahkan pola itu, dan benar: yang
   * dijaganya bukan sekadar kerapian melainkan warna yang bisa rusak
   * diam-diam saat tokennya berubah bentuk.
   */
  warnaRipple: string;
  onPress: () => void;
}) {
  const warna = aktif ? warnaAktif : warnaMati;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      /* Label SELALU lengkap, walau teksnya hanya tampil saat aktif. */
      accessibilityLabel={judul}
      accessibilityState={{ selected: aktif }}
      style={gaya.tombol}
      /*
        Bilah tab TIDAK memakai ripple/pudar seperti tombol lain: pil yang
        bergeser sudah menjadi umpan baliknya, dan dua umpan sekaligus
        membuat ketukan terasa "berkedip". `audit-tekan-berumpan` menerima
        `android_ripple` maupun gaya-fungsi; di sini dipakai yang pertama
        dengan radius kecil supaya tetap ada isyarat pada ketukan yang
        TIDAK berpindah (menekan tab aktif).
      */
      android_ripple={{ color: warnaRipple, borderless: true, radius: 28 }}
    >
      {renderIkon ? renderIkon({ focused: aktif, color: warna, size: 22 }) : null}
      {aktif ? (
        <Text numberOfLines={1} style={[gaya.label, { color: warna }]}>
          {judul}
        </Text>
      ) : null}
    </Pressable>
  );
});

const gaya = StyleSheet.create({
  bilah: {
    flexDirection: 'row',
    /*
      `stretch` membuat tiap tombol setinggi bilah, dan di
      `react-native-web` itu menghasilkan tinggi 0 saat induknya belum
      punya tinggi pasti — tombolnya lalu menciut ke kiri. `center` +
      tinggi tetap pada tombol bekerja di kedua mesin.
    */
    alignItems: 'center',
    paddingTop: SPASI.sm,
    /*
      Hairline, bukan 1px — sejalan dengan `Card` sesudah kandidat C.
      Kedalaman dari garis tipis + permukaan, bukan bayangan.
    */
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  lapisPil: { ...StyleSheet.absoluteFillObject, flexDirection: 'row', alignItems: 'center' },
  pilBungkus: { justifyContent: 'center', paddingHorizontal: SPASI.sm },
  pil: {
    height: SENTUH_MIN + 6,
    borderRadius: RADIUS.pil,
  },
  tombol: {
    flex: 1,
    /*
      Tinggi DINYATAKAN, bukan minimum. `minHeight` bersama `flex: 1`
      membiarkan tinggi akhirnya ditentukan isi — dan isi tab aktif
      (ikon + label) berbeda dari yang tidak aktif (ikon saja), sehingga
      barisnya bergoyang tiap kali tab berpindah.
    */
    height: SENTUH_MIN + 6,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  label: {
    /*
      12px, naik dari 11px — dan itu kini MUAT.

      Aritmetika lama: 8 tab pada 360px = 45px/tab, dan "Notifikasi" 11px
      butuh 61px. Sekarang label hanya tampil pada tab AKTIF, jadi ia
      punya seluruh lebar selnya sendiri. 11px dipertahankan di layar lain
      sebagai LANTAI (`HURUF.xs`), bukan sebagai pilihan.
    */
    fontSize: HURUF.xs,
    lineHeight: 14,
    fontFamily: FONT.isiTebal,
  },
});
