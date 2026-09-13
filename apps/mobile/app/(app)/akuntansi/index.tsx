import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KepalaLayar } from '@/components/ui/KepalaLayar';
import { Card } from '@/components/ui/Card';
import { KartuPahlawan } from '@/components/ui/KartuPahlawan';
import { Galat } from '@/components/ui/Galat';
import { Kosong } from '@/components/ui/Kosong';
import { api } from '@/lib/api';
import { pesanGalat } from '@/lib/galat';
import { useTema } from '@/hooks/useTema';
import { FONT, HURUF, RAPAT, SPASI, type Palet } from '@/lib/tema';

/*
  AKUNTANSI — neraca & laba rugi, NATIVE. Gelombang 2c.

  Menggantikan modul WebView `akuntansi`.

  ── Dua laporan, bukan sembilan belas rute

  `gl.ts` memuat 19 rute GET — peta akun, jurnal, ledger, trial balance,
  periode, ekspor. Layar ini memakai SATU: `/api/v1/gl/laporan`, yang
  memulangkan neraca DAN laba rugi sekaligus.

  Selebihnya adalah pekerjaan menyusun dan menutup buku — bentuk kerja
  yang menuntut layar lebar, entri baris demi baris, dan waktu duduk.
  Tak satu pun dilakukan sambil berdiri di proyek.

  Yang masuk akal di HP: *"perusahaan untung atau rugi, dan bukunya
  seimbang atau tidak"*.

  ⚠ Layar ini TIDAK menggantikan halaman web akuntansi.

  ── `seimbang` DITAMPILKAN, tidak disembunyikan

  `lib/laporan-keuangan.ts` sengaja memulangkan `selisih` apa adanya
  beserta bendera `seimbang`, dengan alasan tertulis: toleransi 0,01
  untuk pembulatan sen, "BUKAN untuk menyembunyikan ketidakseimbangan".

  Neraca yang tak seimbang berarti ada jurnal yang tak balance — dan itu
  hal pertama yang harus dilihat siapa pun yang membuka laporan ini.
  Klien yang membuang bendera itu membatalkan maksudnya.
*/

interface Akun {
  account_id: string;
  code: string;
  name: string;
  saldo: number;
}

interface Kelompok {
  label: string;
  akun: Akun[];
  total: number;
}

interface Neraca {
  aset: Kelompok;
  liabilitas: Kelompok;
  ekuitas: Kelompok;
  labaBerjalan: number;
  totalEkuitasDenganLaba: number;
  selisih: number;
  seimbang: boolean;
}

interface LabaRugi {
  pendapatan: Kelompok;
  beban: Kelompok;
  labaKotor: number;
  labaBersih: number;
  marginPct: number | null;
}

interface Laporan {
  periode: { dari: string | null; sampai: string | null };
  neraca: Neraca;
  labaRugi: LabaRugi;
  meta: { jumlah_akun: number; terpotong: boolean };
}

type Item =
  | { tipe: 'judul'; teks: string }
  | { tipe: 'kelompok'; data: Kelompok }
  | { tipe: 'akun'; data: Akun };

const ambilKunci = (i: Item, idx: number) =>
  i.tipe === 'judul' ? `j:${i.teks}` : i.tipe === 'kelompok' ? `k:${i.data.label}` : `a:${i.data.account_id}:${idx}`;

function rp(n: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(n || 0);
}

function rpRingkas(n: number) {
  const v = n || 0;
  const neg = v < 0;
  const a = Math.abs(v);
  let s: string;
  if (a >= 1_000_000_000) s = `Rp ${(a / 1_000_000_000).toFixed(1).replace('.', ',')} M`;
  else if (a >= 1_000_000) s = `Rp ${Math.round(a / 1_000_000)} jt`;
  else if (a >= 1_000) s = `Rp ${Math.round(a / 1_000)} rb`;
  else s = `Rp ${Math.round(a)}`;
  /*
    Tanda minus DIPERTAHANKAN, tidak dibuang oleh Math.abs().

    Laba bersih negatif adalah kerugian, dan "Rp 412 jt" tanpa tanda
    terbaca sebagai untung. Di layar akuntansi, tanda adalah bagian
    angkanya — bukan hiasan.
  */
  return neg ? `−${s}` : s;
}

const BarisAkun = React.memo(function BarisAkun({
  a,
  s,
}: {
  a: Akun;
  s: ReturnType<typeof gaya>;
}) {
  return (
    <View style={s.akunBaris}>
      <View style={s.akunKiri}>
        <Text style={s.akunKode}>{a.code}</Text>
        <Text style={s.akunNama} numberOfLines={2}>
          {a.name}
        </Text>
      </View>
      <Text style={[s.akunSaldo, a.saldo < 0 && s.negatif]}>{rpRingkas(a.saldo)}</Text>
    </View>
  );
});

export default function AkuntansiScreen() {
  const { c } = useTema();
  const styles = useMemo(() => gaya(c), [c]);

  const [lap, setLap] = useState<Laporan | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [galat, setGalat] = useState('');

  /* `res.data` DATAR — `gl.ts:528` mengirim objeknya apa adanya. */
  const muat = useCallback(async () => {
    try {
      const res = await api.get('/api/v1/gl/laporan');
      setLap(res.data ?? null);
      setGalat('');
    } catch (err: unknown) {
      setGalat(pesanGalat(err, 'laporan keuangan'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    muat();
  }, [muat]);

  const onRefresh = () => {
    setRefreshing(true);
    muat();
  };

  /*
    Akun dibatasi LIMA teratas per kelompok.

    Peta akun lengkap bisa ratusan baris; di HP itu berarti menggulir
    melewati akun-akun bersaldo kecil untuk mencari yang besar. Server
    sudah membuang akun bersaldo nol (`laporan-keuangan.ts:65`), dan
    lima teratas cukup menjawab "uangnya di mana".

    Jumlah yang tak ditampilkan DISEBUTKAN — daftar terpotong diam-diam
    adalah bentuk yang sama dengan `terpotong` yang sengaja dikirim
    server.
  */
  const items = useMemo<Item[]>(() => {
    if (!lap) return [];
    const out: Item[] = [];
    const tambah = (judul: string, k: Kelompok | undefined) => {
      if (!k || (k.total === 0 && k.akun.length === 0)) return;
      out.push({ tipe: 'judul', teks: judul });
      out.push({ tipe: 'kelompok', data: k });
      for (const a of k.akun.slice(0, 5)) out.push({ tipe: 'akun', data: a });
    };
    tambah('Aset', lap.neraca?.aset);
    tambah('Liabilitas', lap.neraca?.liabilitas);
    tambah('Ekuitas', lap.neraca?.ekuitas);
    tambah('Pendapatan', lap.labaRugi?.pendapatan);
    tambah('Beban', lap.labaRugi?.beban);
    return out;
  }, [lap]);

  const render = useCallback(
    ({ item }: { item: Item }) => {
      if (item.tipe === 'judul') {
        return <Text style={styles.bagianJudul}>{item.teks}</Text>;
      }
      if (item.tipe === 'kelompok') {
        const sisa = item.data.akun.length - 5;
        return (
          <View style={styles.totalBaris}>
            <Text style={styles.totalLabel}>
              Total {item.data.label.toLowerCase()}
              {sisa > 0 ? ` · ${item.data.akun.length} akun` : ''}
            </Text>
            <Text style={[styles.totalNilai, item.data.total < 0 && styles.negatif]}>
              {rp(item.data.total)}
            </Text>
          </View>
        );
      }
      return <BarisAkun a={item.data} s={styles} />;
    },
    [styles]
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={c.navy} />
      </SafeAreaView>
    );
  }

  const lr = lap?.labaRugi;
  const nr = lap?.neraca;

  return (
    <SafeAreaView style={styles.safe}>
      <KepalaLayar judul="Akuntansi" penjelas="Neraca dan laba rugi dari jurnal terposting" />

      <FlatList
        data={items}
        keyExtractor={ambilKunci}
        renderItem={render}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.navy} />
        }
        ListHeaderComponent={
          <>
            {galat ? <Galat judul="Laporan tidak bisa dimuat" pesan={galat} /> : null}

            {/*
              KARTU PAHLAWAN — permukaan gelap, bukan kartu putih.

              Diterapkan 2026-09-13 atas arahan founder dari referensi UI
              yang ia kirim. Yang berubah bukan cuma warna: angka naik ke
              `displayBesar` (48) dan jadi satu-satunya benda menonjol di
              layar, persis seperti saldo di kartu Wallet referensi.

              ⚠ Warna laba/rugi memakai `heroDanger`/`heroSuccess`, BUKAN
              `danger`/`success`. Yang terakhir dirancang untuk latar
              putih dan diukur cuma 1,90:1 di atas permukaan ini — angka
              KERUGIAN yang tak terbaca di layar akuntansi adalah
              kegagalan paling mahal yang bisa dibuat rancangan ini.
            */}
            {lr ? (
              <KartuPahlawan
                label="Laba bersih"
                ikon="trending-up-outline"
                nilai={rp(lr.labaBersih)}
                style={styles.utamaKartu}
                nada={lr.labaBersih < 0 ? 'buruk' : 'baik'}
                tren={
                  /*
                    Margin `null` DIBEDAKAN dari 0%: `null` berarti belum ada
                    pendapatan sama sekali, 0% berarti ada pendapatan dan
                    labanya nol. Menyamakannya membuat "belum mulai" terbaca
                    sebagai "impas".

                    Arahnya dari TANDA laba, bukan dari besar margin — margin
                    -47% tetap "buruk" meski angkanya besar.
                  */
                  lr.marginPct != null
                    ? {
                        teks: `Margin ${lr.marginPct}%`,
                        arah: lr.labaBersih < 0 ? 'buruk' : 'baik',
                      }
                    : undefined
                }
                keterangan={
                  `Pendapatan ${rpRingkas(lr.pendapatan?.total ?? 0)} · ` +
                  `Beban ${rpRingkas(lr.beban?.total ?? 0)}`
                }
              />
            ) : null}

            {/*
              Bendera SEIMBANG — hal pertama yang harus dilihat.

              Neraca tak seimbang berarti ada jurnal yang tak balance,
              dan seluruh angka di bawahnya jadi meragukan. Ditaruh
              sebelum daftar akun, bukan sesudahnya.
            */}
            {nr ? (
              <View style={[styles.seimbangKotak, !nr.seimbang && styles.seimbangBuruk]}>
                <Ionicons
                  name={nr.seimbang ? 'checkmark-circle-outline' : 'warning-outline'}
                  size={16}
                  color={nr.seimbang ? c.success : c.danger}
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                />
                <Text
                  style={[styles.seimbangTeks, !nr.seimbang && styles.seimbangTeksBuruk]}
                >
                  {nr.seimbang
                    ? 'Neraca seimbang'
                    : `Neraca TIDAK seimbang — selisih ${rp(nr.selisih)}`}
                </Text>
              </View>
            ) : null}

            {/*
              `terpotong` dari server ditampilkan.

              `gl.ts:536` mengirimnya dengan alasan tertulis: "Pemotongan
              diam-diam pada laporan keuangan membuat orang menarik
              kesimpulan dari data yang tak lengkap tanpa tahu."
            */}
            {lap?.meta?.terpotong ? (
              <View style={styles.potongKotak}>
                <Ionicons
                  name="alert-circle-outline"
                  size={15}
                  color={c.warning}
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                />
                <Text style={styles.potongTeks}>
                  Hanya 1.000 jurnal pertama dihitung — angka di bawah belum lengkap.
                  Buka laporan di komputer untuk periode yang lebih sempit.
                </Text>
              </View>
            ) : null}
          </>
        }
        ListEmptyComponent={
          galat ? null : (
            <Kosong
              ikon="calculator-outline"
              judul="Belum ada jurnal terposting"
              petunjuk="Neraca muncul setelah jurnal diposting. Tarik ke bawah untuk memeriksa lagi."
            />
          )
        }
        initialNumToRender={14}
        windowSize={7}
      />
    </SafeAreaView>
  );
}

function gaya(c: Palet) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.surfaceSubtle },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.surfaceSubtle,
    },
    list: { padding: SPASI.lg, gap: SPASI.xs, paddingBottom: 40 },

    utamaKartu: { gap: 2, marginBottom: SPASI.sm },
    utamaLabel: { fontSize: HURUF.xs, fontFamily: FONT.isi, color: c.textSecondary },
    /*
      Tingkat DISPLAY (kandidat C, 2026-09-12) — satu angka memimpin layar.

      Sebelumnya `xxl` (24px). Naik ke 38px + tracking rapat karena
      jangkauan skala kita 2,50x sementara Linear 6,00x dan Ramp 6,40x;
      pada 2,5x tak ada yang bisa memimpin, jadi hierarki jatuh ke warna
      dan kotak. Rinciannya di ARAH-VISUAL-2026 §12b.

      ⚠ SATU display per layar. Kalau angka kedua ikut memakainya, tak ada
      yang memimpin dan skalanya rata lagi — hanya dengan angka lebih besar.
    */
    utamaNilai: {
      fontSize: HURUF.display,
      fontFamily: FONT.judul,
      letterSpacing: RAPAT.display,
      lineHeight: 42,
      fontVariant: ['tabular-nums'],
    },
    utamaKaki: { gap: 1, marginTop: 2 },
    utamaKakiTeks: { fontSize: HURUF.xs, fontFamily: FONT.isi, color: c.textSecondary },

    seimbangKotak: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: c.successBg,
      borderWidth: 1,
      borderColor: c.successBorder,
      borderRadius: 10,
      padding: SPASI.sm,
      marginBottom: SPASI.sm,
    },
    seimbangBuruk: { backgroundColor: c.dangerBg, borderColor: c.dangerBorder },
    seimbangTeks: { fontSize: HURUF.xs, fontFamily: FONT.isiTebal, color: c.success, flex: 1 },
    seimbangTeksBuruk: { color: c.danger },

    potongKotak: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 6,
      backgroundColor: c.warningBg,
      borderWidth: 1,
      borderColor: c.warningBorder,
      borderRadius: 10,
      padding: SPASI.sm,
      marginBottom: SPASI.sm,
    },
    potongTeks: { fontSize: HURUF.xs, fontFamily: FONT.isi, color: c.textSecondary, flex: 1 },

    bagianJudul: {
      fontSize: HURUF.base,
      fontFamily: FONT.isiTebal,
      color: c.textPrimary,
      marginTop: SPASI.md,
      marginBottom: 2,
    },

    /*
      Akun TIDAK dibungkus Card satu per satu.

      Ia baris tabel — deretan yang dibandingkan, bukan benda terpisah
      yang bisa ditekan. Memberi masing-masing border dan bayangan
      memutus perbandingan yang justru jadi gunanya, dan menambah
      overdraw per baris (ui-ux-pro-max: "Not everything is a card").
    */
    akunBaris: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: SPASI.sm,
      paddingVertical: 6,
      paddingHorizontal: 2,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    akunKiri: { flex: 1, gap: 1 },
    akunKode: {
      fontSize: HURUF.xs,
      fontFamily: FONT.isi,
      color: c.textSecondary,
      fontVariant: ['tabular-nums'],
    },
    akunNama: { fontSize: HURUF.sm, fontFamily: FONT.isi, color: c.textPrimary },
    akunSaldo: {
      fontSize: HURUF.sm,
      fontFamily: FONT.isiTebal,
      color: c.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    negatif: { color: c.danger },

    totalBaris: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: SPASI.sm,
      paddingVertical: 6,
      paddingHorizontal: 2,
    },
    totalLabel: { fontSize: HURUF.xs, fontFamily: FONT.isi, color: c.textSecondary, flex: 1 },
    totalNilai: {
      fontSize: HURUF.base,
      fontFamily: FONT.judul,
      color: c.textPrimary,
      fontVariant: ['tabular-nums'],
    },
  });
}
