import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTema } from '@/hooks/useTema';
import { ELEVASI, HURUF, RADIUS, RAPAT, SPASI, type Palet } from '@/lib/tema';

/**
 * KARTU PAHLAWAN — satu angka yang jadi alasan layar itu dibuka.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA KOMPONEN INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Arahan founder 2026-09-13, dari referensi UI yang ia kirim (wallet
 * berpermukaan coklat, sleep tracker ungu, boarding pass gelap). Yang ia
 * tunjuk bukan warnanya, melainkan **kartu sebagai OBJEK** — benda yang
 * naik dari halaman, bukan kotak putih di atas latar abu.
 *
 * `ARAH-VISUAL-2026` §1b sudah mendiagnosis sendiri masalahnya:
 *
 *   > "Klik Keuangan → langsung tabel. Klik Kas → langsung tabel. Tiap menu
 *   >  terasa sama karena **memang** sama bentuknya."
 *
 * Jadi ini bukan usul yang menabrak arah visual — ia menjawab keluhan yang
 * dokumen itu tulis sendiri.
 *
 * ── SATU per layar. Tidak dua.
 *
 * §3d: *"Kalau tiga hal berwarna, tak ada yang menonjol — dan halaman
 * kembali monoton dengan warna yang berbeda."*
 *
 * Referensinya pun disiplin begitu, dan itu yang paling mudah terlewat saat
 * menyalinnya: di kartu Wallet coklat HANYA saldo yang besar; di Sleep ungu
 * hanya `7hr 16`. Sisanya kecil, tenang, dan justru itu yang membuat satu
 * angka terasa penting.
 *
 * Dijaga `audit-kartu-pahlawan-tunggal.mjs` (ambang NOL).
 *
 * ── Kenapa BUKAN gradien
 *
 * Referensinya memakai gradien penuh. Di sini tidak, dan alasannya terukur:
 * ini alat kerja yang dibuka mandor di bawah matahari. Gradien membuat
 * kontras teks BERUBAH sepanjang permukaan — sudut yang aman di satu titik
 * bisa gagal di titik lain, dan `audit-kontras-mobile.mjs` hanya bisa
 * mengukur warna DATAR. Penjaga yang tak bisa melihat pelanggarannya sama
 * saja dengan tak ada penjaga.
 *
 * Warna datar `heroPermukaan` diukur 14,68:1 terhadap teks putih — lebih
 * terbaca daripada teks abu di atas kartu putih yang dipakai hari ini.
 */

interface Props {
  /** Label kecil di atas angka. Mis. "Laba bersih", "Total piutang". */
  label: string;
  /** Angka pahlawannya. Sudah terformat — komponen ini tak menghitung. */
  nilai: string;
  /**
   * Baris penjelas di bawah angka. Pendek — ini bukan tempat menaruh
   * seluruh rincian, dan kartu yang penuh berhenti jadi kartu pahlawan.
   */
  keterangan?: string;
  /** Ikon kecil di samping label (nama Ionicons). */
  ikon?: React.ComponentProps<typeof Ionicons>['name'];
  /**
   * Pil tren di kanan angka — "+14,5%" ala referensi.
   *
   * `arah` menentukan warnanya, dan ia WAJIB diberikan pemanggil: naik
   * tidak selalu baik. Laba naik itu kabar baik; BEBAN naik tidak, dan
   * mewarnainya hijau memberi kabar yang salah pada layar keputusan uang.
   */
  tren?: { teks: string; arah: 'baik' | 'buruk' | 'netral' };
  /**
   * Nada ANGKA-nya — untung/rugi, aman/bahaya.
   *
   * ⚠ Memakai `heroDanger`/`heroSuccess`, BUKAN `danger`/`success`.
   * Yang terakhir dirancang untuk latar PUTIH; diukur di atas permukaan
   * pahlawan mereka cuma 1,90:1 dan 1,94:1 — praktis lenyap. Angka
   * KERUGIAN yang tak terbaca adalah kegagalan paling mahal di layar
   * keputusan uang.
   *
   * Bawaannya `netral` (putih penuh): kebanyakan angka pahlawan bukan
   * untung-rugi, dan mewarnai semuanya mengembalikan kemonotonan yang
   * justru hendak dipecahkan kartu ini.
   */
  nada?: 'baik' | 'buruk' | 'netral';
  /** Aksi kecil di pojok kanan atas kartu (tombol ikon). */
  aksi?: React.ReactNode;
  /** Konten tambahan di dasar kartu — mis. deret chip periode. */
  kaki?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function KartuPahlawan({
  label, nilai, keterangan, ikon, tren, nada = 'netral', aksi, kaki, style,
}: Props) {
  const { c } = useTema();
  const s = gaya(c);

  return (
    <View style={[s.kartu, style]}>
      <View style={s.barisAtas}>
        <View style={s.labelBaris}>
          {ikon ? (
            <View style={s.ikonBulat}>
              {/*
                ⚠ Ikon MENGIKUTI nada kalau pemanggil memberi ikon tren.

                Terlihat dari potret 2026-09-13: layar akuntansi memakai
                `trending-up-outline` pada laba bersih yang NEGATIF —
                panah NAIK di sebelah kerugian Rp 97 juta. Tak ada galat,
                tak ada test merah; yang salah cuma artinya, dan ia
                mengatakan kebalikan dari keadaan sebenarnya.
              */}
              <Ionicons
                name={
                  nada === 'buruk' && /^trending-up/.test(String(ikon))
                    ? 'trending-down-outline'
                    : ikon
                }
                size={14}
                color={c.heroTeksLembut}
              />
            </View>
          ) : null}
          <Text style={s.label}>{label}</Text>
        </View>
        {aksi}
      </View>

      {/*
        ⚠ `numberOfLines={1}` dan tren di BARIS SENDIRI — keduanya
        memperbaiki cacat yang sudah terjadi sekali (JOURNAL 2026-09-12):
        nominal 38px yang berbagi baris flex dengan lencana MEMBUNGKUS di
        tengah angka — "Rp 1.200.00" lalu "0". `tsc` hijau pada kedua
        bentuk; yang menemukannya MEMOTRET.

        `adjustsFontSizeToFit` dipasang sebagai jaring kedua: angka rupiah
        bisa jauh lebih panjang dari dugaan perancangnya.
      */}
      <Text
        style={[s.nilai, nada !== 'netral' && { color: warnaNada(c, nada) }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {nilai}
      </Text>

      {tren ? (
        <View style={[s.pilTren, { backgroundColor: warnaTrenBg(c, tren.arah) }]}>
          <Ionicons
            name={tren.arah === 'buruk' ? 'trending-down' : 'trending-up'}
            size={12}
            color={warnaTren(c, tren.arah)}
          />
          <Text style={[s.trenTeks, { color: warnaTren(c, tren.arah) }]}>{tren.teks}</Text>
        </View>
      ) : null}

      {keterangan ? <Text style={s.keterangan}>{keterangan}</Text> : null}
      {kaki ? <View style={s.kaki}>{kaki}</View> : null}
    </View>
  );
}

/*
  Warna tren dipisah jadi fungsi, bukan peta di dalam gaya: nilainya
  bergantung tema (terang/gelap), dan peta statis akan membekukan warna
  mode terang ke dalam mode gelap.
*/
const warnaNada = (c: Palet, nada: 'baik' | 'buruk' | 'netral') =>
  nada === 'baik' ? c.heroSuccess : nada === 'buruk' ? c.heroDanger : c.heroTeks;

const warnaTren = (c: Palet, arah: 'baik' | 'buruk' | 'netral') =>
  arah === 'baik' ? c.heroSuccess : arah === 'buruk' ? c.heroDanger : c.heroTeksLembut;

const warnaTrenBg = (c: Palet, arah: 'baik' | 'buruk' | 'netral') =>
  arah === 'netral' ? c.heroLapis : 'rgba(255,255,255,0.14)';

const gaya = (c: Palet) =>
  StyleSheet.create({
    kartu: {
      backgroundColor: c.heroPermukaan,
      borderRadius: RADIUS.xl,
      padding: SPASI.lg,
      /*
        Satu-satunya kartu di layar yang BOLEH berbayang. Kartu daftar tak
        boleh — tiap lapis bayangan satu alpha blending per baris per frame
        (`audit-bayangan-mobile-bertoken.mjs`), dan daftar kasbon punya 67
        baris.
      */
      ...ELEVASI.angkat,
    },
    barisAtas: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SPASI.sm,
    },
    labelBaris: { flexDirection: 'row', alignItems: 'center', gap: SPASI.xs, flexShrink: 1 },
    ikonBulat: {
      width: 26, height: 26, borderRadius: 13,
      backgroundColor: c.heroLapis,
      alignItems: 'center', justifyContent: 'center',
    },
    label: {
      fontSize: HURUF.sm,
      color: c.heroTeksLembut,
      letterSpacing: RAPAT.labelKapital,
      textTransform: 'uppercase',
      fontWeight: '600',
      flexShrink: 1,
    },
    nilai: {
      fontSize: HURUF.displayBesar,
      lineHeight: HURUF.displayBesar * 1.05,
      letterSpacing: RAPAT.displayBesar,
      color: c.heroTeks,
      fontWeight: '800',
    },
    pilTren: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      alignSelf: 'flex-start',
      paddingHorizontal: SPASI.sm,
      paddingVertical: 3,
      borderRadius: RADIUS.pil,
      /*
        SPASI.sm, bukan xs. Diukur dari potret 2026-09-13: pada `xs` (4px)
        pil margin menempel ke kaki angka 48px dan keduanya terbaca sebagai
        satu gumpalan. Angka pahlawan butuh ruang di bawahnya justru supaya
        ia terbaca sebagai pahlawan.
      */
      marginTop: SPASI.sm,
    },
    trenTeks: { fontSize: HURUF.xs, fontWeight: '700' },
    keterangan: {
      fontSize: HURUF.sm,
      color: c.heroTeksLembut,
      marginTop: SPASI.sm,
      lineHeight: HURUF.sm * 1.45,
    },
    kaki: {
      marginTop: SPASI.md,
      paddingTop: SPASI.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: 'rgba(255,255,255,0.14)',
    },
  });
