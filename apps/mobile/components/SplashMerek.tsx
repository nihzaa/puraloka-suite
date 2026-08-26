/**
 * SPLASH BERGERAK — pilar yang NAIK, bukan logo yang muncul begitu saja.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA, PADAHAL SUDAH ADA splash.png
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `splash.png` dipasang SISTEM OPERASI sebelum satu baris JavaScript pun
 * berjalan. Ia tak bisa bergerak, dan ia hilang begitu bundel React Native
 * selesai dimuat — pada HP lama itu bisa 2–3 detik layar diam.
 *
 * Yang lebih buruk: `expo-splash-screen` TERPASANG di package.json tetapi
 * TAK PERNAH di-import satu berkas pun (diukur 2026-08-27). Artinya splash
 * bawaan menghilang segera setelah bundel siap — SEBELUM `useAuth` selesai
 * membaca token dari SecureStore. Pemakainya melihat kedipan layar login
 * yang langsung diganti dashboard: kedipan yang membuat aplikasi terasa
 * murah, dan yang paling terlihat justru di HP paling lambat.
 *
 * Komponen ini menutup jendela itu: ia MELANJUTKAN splash statis dengan
 * bentuk yang sama, lalu menganimasikannya selagi auth dibaca.
 *
 * ── Kenapa "naik", bukan memudar atau membesar
 *
 * Lambangnya adalah empat pilar dengan tinggi menaik — siluet gedung yang
 * sedang dibangun. Menaikkannya dari alas, terpendek lebih dulu, membuat
 * lambang itu MEMBANGUN DIRINYA SENDIRI. Gerakannya menyampaikan hal yang
 * sama dengan yang dikerjakan perusahaan ini, jadi ia bukan hiasan.
 *
 * Memudar/membesar adalah gerak bawaan yang bisa ditempel ke logo mana pun —
 * persis yang dihindari `ARAH-VISUAL-2026.md`.
 *
 * ── Kenapa View biasa, BUKAN react-native-svg
 *
 * Godaan pertamanya memakai SVG supaya path-nya identik dengan web. Tetapi
 * `react-native-svg` TIDAK terpasang (diukur: nol di package.json dan nol di
 * node_modules), dan memasangnya di monorepo pnpm ini berarti menjalankan
 * `pnpm install` — perintah yang CLAUDE.md §8a.1 tandai bisa mengosongkan
 * node_modules workspace lain saat ada sesi lain hidup.
 *
 * Ternyata tak perlu: keempat pilar dan alasnya adalah PERSEGI PANJANG
 * dengan ujung atas membulat. `borderTopLeftRadius`/`borderTopRightRadius`
 * menghasilkan bentuk yang sama tanpa satu pun dependensi baru.
 *
 * Yang HILANG dibanding SVG: potongan miring pada pilar keempat dan lengkung
 * tepi atas alas. Keduanya detail yang tak terbaca pada ukuran splash, dan
 * lambang UTUH tetap tampil di `splash.png` yang muncul lebih dulu. Nisbah
 * tinggi tiap pilar diambil dari path aslinya, jadi siluetnya tetap benar.
 *
 * ── Kenapa `useNativeDriver`, dan kenapa `scaleY` bukan `height`
 *
 * Menganimasikan `height` memaksa tata letak dihitung ulang tiap bingkai di
 * utas JS — pada HP mandor (yang justru jadi alasan aplikasi ini ada) itu
 * tampil sebagai patah-patah. `transform` berjalan di utas UI dan tak
 * menyentuh tata letak sama sekali.
 *
 * ── Aksesibilitas: WAJIB menghormati "kurangi gerak"
 *
 * WCAG 2.1 AA, dan CLAUDE.md §8a.3 menyebutnya bukan opsional. Pemakai yang
 * menyalakan Reduce Motion melihat lambang yang sudah utuh — bukan animasi
 * yang dipercepat, melainkan TANPA gerak sama sekali.
 */
import React, { useEffect, useRef, useState } from 'react'
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
} from 'react-native'

const NAVY = '#003366'

/*
  Nisbah diturunkan dari lambang asli (viewBox 120×152, isi y2→y152).

  `atas`  = tinggi badan pilar relatif terhadap tinggi lambang
  `alas`  = tinggi alas
  `celah` = jarak badan→alas; celah ini BAGIAN DARI BENTUKNYA, bukan
            kebetulan — itu yang membuat lambang terbaca sebagai bangunan
            berdiri, bukan bilah grafik. (Lihat komentar di
            apps/web/public/puraloka-lambang.svg.)

  Diukur dari path: pilar 1 mulai y45 berakhir y103 (badan), alas y112→y152.
*/
const PILAR = [
  { atas: 0.386, celah: 0.060, alas: 0.267 },
  { atas: 0.480, celah: 0.100, alas: 0.213 },
  { atas: 0.586, celah: 0.086, alas: 0.246 },
  { atas: 0.573, celah: 0.106, alas: 0.353 },
]

const TINGGI = 150      // tinggi bidang lambang, dp
const LEBAR_PILAR = 15
const JARAK = 11

export function SplashMerek({ selesai }: { selesai?: boolean }) {
  const [kurangiGerak, setKurangiGerak] = useState(false)
  const [siapDicek, setSiapDicek] = useState(false)

  /*
    Satu nilai per pilar. 0 = belum ada, 1 = penuh. Alas dan wordmark memakai
    nilainya sendiri supaya bisa datang BELAKANGAN — urutannya bagian dari
    maknanya: pilar berdiri dulu, alasnya menyusul.
  */
  const pilar = useRef(PILAR.map(() => new Animated.Value(0))).current
  const alas = useRef(new Animated.Value(0)).current
  const kata = useRef(new Animated.Value(0)).current
  const keluar = useRef(new Animated.Value(1)).current

  useEffect(() => {
    let hidup = true
    AccessibilityInfo.isReduceMotionEnabled()
      .then((aktif) => {
        if (!hidup) return
        setKurangiGerak(aktif)
        setSiapDicek(true)
      })
      .catch(() => {
        // Kegagalan membaca preferensi tak boleh membuat splash menggantung
        // selamanya — layar biru tanpa logo lebih buruk daripada animasi.
        if (hidup) setSiapDicek(true)
      })
    return () => { hidup = false }
  }, [])

  useEffect(() => {
    if (!siapDicek) return

    if (kurangiGerak) {
      // Tanpa gerak: langsung utuh. Bukan animasi cepat — TIDAK ADA animasi.
      pilar.forEach((v) => v.setValue(1))
      alas.setValue(1)
      kata.setValue(1)
      return
    }

    const jalan = Animated.sequence([
      /*
        Pilar naik BERURUTAN, terpendek → tertinggi, jarak 90ms.

        Easing `out(cubic)` — cepat di awal lalu melambat mendekati puncak,
        seperti benda berat yang diangkat lalu didudukkan. `linear` akan
        terasa seperti bilah grafik yang tumbuh, bukan bangunan yang berdiri.
      */
      Animated.stagger(
        90,
        pilar.map((v) =>
          Animated.timing(v, {
            toValue: 1,
            duration: 520,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ),
      ),
      Animated.parallel([
        Animated.timing(alas, {
          toValue: 1,
          duration: 300,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(kata, {
          toValue: 1,
          duration: 420,
          delay: 80,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    ])
    jalan.start()
    return () => jalan.stop()
  }, [siapDicek, kurangiGerak])

  /*
    Layar splash hanya MENGHILANG sesudah dua hal benar sekaligus: auth
    selesai dibaca (`selesai`) DAN animasinya sempat berjalan. Menghilang
    begitu auth selesai akan memotong animasi di tengah pada HP cepat —
    kedipan yang justru ingin dihilangkan.
  */
  useEffect(() => {
    if (!selesai) return
    const t = setTimeout(() => {
      Animated.timing(keluar, {
        toValue: 0,
        duration: kurangiGerak ? 0 : 320,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }).start()
    }, kurangiGerak ? 0 : 260)
    return () => clearTimeout(t)
  }, [selesai, kurangiGerak])

  return (
    <Animated.View
      style={[styles.penuh, { opacity: keluar }]}
      pointerEvents={selesai ? 'none' : 'auto'}
      accessibilityRole="progressbar"
      accessibilityLabel="Memuat Puraloka Suite"
    >
      <View style={styles.tengah}>
        <View style={[styles.lambang, { height: TINGGI }]}>
          {PILAR.map((p, i) => {
            const tinggiBadan = TINGGI * p.atas
            const tinggiAlas = TINGGI * p.alas
            const tinggiCelah = TINGGI * p.celah
            return (
              <View key={i} style={[styles.kolom, { marginRight: i === 3 ? 0 : JARAK }]}>
                {/* Badan — tumbuh dari BAWAH lewat scaleY berjangkar dasar */}
                <Animated.View
                  style={{
                    width: LEBAR_PILAR,
                    height: tinggiBadan,
                    backgroundColor: '#FFFFFF',
                    borderTopLeftRadius: LEBAR_PILAR / 2,
                    borderTopRightRadius: LEBAR_PILAR / 2,
                    opacity: pilar[i],
                    transform: [
                      { translateY: tinggiBadan / 2 },
                      { scaleY: pilar[i].interpolate({ inputRange: [0, 1], outputRange: [0.03, 1] }) },
                      { translateY: -tinggiBadan / 2 },
                    ],
                  }}
                />
                <View style={{ height: tinggiCelah }} />
                <Animated.View
                  style={{
                    width: LEBAR_PILAR,
                    height: tinggiAlas,
                    backgroundColor: '#FFFFFF',
                    borderTopLeftRadius: LEBAR_PILAR / 2,
                    borderTopRightRadius: LEBAR_PILAR / 2,
                    opacity: alas,
                  }}
                />
              </View>
            )
          })}
        </View>

        <Animated.View
          style={{
            marginTop: 30,
            opacity: kata,
            transform: [
              { translateY: kata.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
            ],
          }}
        >
          <Text style={styles.nama}>Puraloka</Text>
          <Text style={styles.sub}>PERSADA</Text>
        </Animated.View>
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  penuh: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: NAVY,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  // Diangkat sedikit dari titik tengah: bobot lambang menumpuk di atas, jadi
  // pusat geometris terbaca melorot. Sama dengan koreksi di skrip aset.
  tengah: { alignItems: 'center', marginBottom: 28 },
  lambang: { flexDirection: 'row', alignItems: 'flex-end' },
  kolom: { justifyContent: 'flex-end' },
  nama: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  sub: {
    color: '#7FA8CC',
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 4.5,
    textAlign: 'center',
    marginTop: 6,
  },
})
