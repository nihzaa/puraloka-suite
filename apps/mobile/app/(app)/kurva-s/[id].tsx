import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KepalaLayar } from '@/components/ui/KepalaLayar';
import { Card } from '@/components/ui/Card';
import { Galat } from '@/components/ui/Galat';
import { Kosong } from '@/components/ui/Kosong';
import { api } from '@/lib/api';
import { pesanGalat } from '@/lib/galat';
import { useTema } from '@/hooks/useTema';
import { FONT, HURUF, SPASI, type Palet } from '@/lib/tema';

/*
  KURVA S — rencana vs aktual untuk satu proyek, NATIVE.

  Rutenya (`/api/v1/proyek/:id/kurva-s`) dibangun bersama layar ini
  2026-09-11; sebelumnya TIDAK ADA kurva S di repo, meski menu
  menjanjikannya.

  ── Digambar dengan `View`, BUKAN pustaka chart

  `react-native-svg` tak terpasang, dan menambahnya untuk satu layar
  berarti satu unduhan lagi di tiap APK — untuk grafik yang bentuknya
  sederhana: dua garis monoton naik.

  Yang digambar: batang vertikal per titik waktu di dalam `FlatList`
  horizontal — rencana sebagai bidang berbingkai, aktual sebagai batang
  pekat yang lebih sempit di depannya.

  Bukan garis, sebab garis menuntut menggambar diagonal — dan diagonal
  dengan `View` berarti `transform: rotate` per segmen, yang di daftar
  30+ titik jadi mahal dan rapuh.

  Batang menyampaikan hal yang sama untuk pertanyaan yang dibawa ke HP:
  *"seberapa tertinggal"*. Bentuk kurva yang presisi ada di layar besar.

  ── Kenapa BUKAN layar daftar

  Ini layar detail per proyek (`[id].tsx`) — dibuka dari Lapangan atau
  Proyek. Kurva S lintas proyek tak bermakna: dua proyek dengan durasi
  dan lingkup berbeda tak bisa dibandingkan kurvanya.
*/

interface Titik {
  tanggal: string;
  pct: number;
}

interface Deviasi {
  tanggal: string;
  aktual_pct: number;
  rencana_pct: number;
  selisih_pct: number;
}

interface KurvaS {
  proyek: { id: string; nama: string; mulai: string | null; selesai: string | null };
  baseline: { id: string; nomor: number | null; nama: string | null } | null;
  rencana: Titik[];
  aktual: Titik[];
  deviasi: Deviasi | null;
}

function fmtTanggalPendek(s: string) {
  return new Date(`${s}T00:00:00`).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
  });
}

/**
 * Gabungkan dua deret jadi satu sumbu waktu.
 *
 * Rencana dan aktual punya tanggal yang berbeda — rencana pada
 * `planned_end` tiap item, aktual pada hari pelaporan. Menggambar
 * keduanya pada sumbu masing-masing membuat batang yang sejajar di layar
 * mewakili tanggal yang berbeda, dan itu membohongi perbandingannya.
 *
 * Nilai pada tanggal yang tak punya titik diambil dari titik TERAKHIR
 * sebelumnya (step, bukan interpolasi) — kurva kumulatif memang bertahan
 * di nilai terakhirnya sampai ada laporan baru.
 */
function gabungSumbu(
  rencana: Titik[],
  aktual: Titik[]
): Array<{ tanggal: string; rencana: number | null; aktual: number | null }> {
  const semua = [...new Set([...rencana.map((r) => r.tanggal), ...aktual.map((a) => a.tanggal)])]
    .sort((a, b) => a.localeCompare(b));

  const out: Array<{ tanggal: string; rencana: number | null; aktual: number | null }> = [];
  let iR = 0;
  let iA = 0;
  let vR: number | null = null;
  let vA: number | null = null;
  /** Tanggal aktual terakhir — sesudahnya garis aktual BERHENTI, tak diteruskan. */
  const batasAktual = aktual.length > 0 ? aktual[aktual.length - 1].tanggal : null;

  for (const t of semua) {
    while (iR < rencana.length && rencana[iR].tanggal <= t) vR = rencana[iR++].pct;
    while (iA < aktual.length && aktual[iA].tanggal <= t) vA = aktual[iA++].pct;
    out.push({
      tanggal: t,
      rencana: vR,
      /*
        Aktual TIDAK diteruskan melewati laporan terakhir.

        Mengulang nilai terakhir ke masa depan membuat garisnya terlihat
        "datar tapi ada" — terbaca sebagai proyek yang berhenti, bukan
        sebagai masa depan yang memang belum terjadi.
      */
      aktual: batasAktual != null && t <= batasAktual ? vA : null,
    });
  }
  return out;
}

type TitikSumbu = { tanggal: string; rencana: number | null; aktual: number | null };

/**
 * Satu kolom grafik — komponen SENDIRI dan ter-`memo`.
 *
 * Dipisah bukan demi kerapian: `FlatList` merender ulang `renderItem`
 * tiap kali induknya berubah, dan tanpa `memo` keempat puluh kolom
 * dirakit ulang pada tiap refresh.
 */
const KolomGrafik = React.memo(function KolomGrafik({
  t,
  s,
}: {
  t: TitikSumbu;
  s: ReturnType<typeof gaya>;
}) {
  return (
    <View style={s.kolom}>
      <View style={s.batangWadah}>
        {/*
          Tinggi minimum 3%, bukan 1%.

          Pada wadah 140px, nilai 0,82% menghasilkan batang setinggi SATU
          piksel — tak terbedakan dari garis tepi wadahnya sendiri. 3%
          (≈4px) cukup untuk terlihat sebagai batang.

          ⚠ Ini MENDISTORSI nilai kecil, dan itu diterima dengan sadar:
          alternatifnya nilai kecil yang TIDAK TERLIHAT SAMA SEKALI, dan
          batang yang hilang terbaca sebagai "tak ada data" — kebohongan
          yang lebih besar daripada empat piksel.
        */}
        {t.rencana != null ? (
          <View
            style={[s.batang, s.batangRencana, { height: `${Math.max(3, t.rencana)}%` }]}
          />
        ) : null}
        {t.aktual != null ? (
          <View
            style={[s.batang, s.batangAktual, { height: `${Math.max(3, t.aktual)}%` }]}
          />
        ) : null}
      </View>
      <Text style={s.kolomLabel} numberOfLines={1}>
        {fmtTanggalPendek(t.tanggal)}
      </Text>
    </View>
  );
});

const kunciTitik = (t: TitikSumbu) => t.tanggal;

export default function KurvaSScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTema();
  const styles = useMemo(() => gaya(c), [c]);

  const gulirRef = React.useRef<FlatList<TitikSumbu> | null>(null);
  const [data, setData] = useState<KurvaS | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [galat, setGalat] = useState('');

  const muat = useCallback(async () => {
    if (!id) return;
    try {
      const res = await api.get(`/api/v1/proyek/${id}/kurva-s`);
      setData(res.data ?? null);
      setGalat('');
    } catch (err: unknown) {
      setGalat(pesanGalat(err, 'kurva S'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    muat();
  }, [muat]);

  const onRefresh = () => {
    setRefreshing(true);
    muat();
  };

  const sumbuPenuh = useMemo(
    () => gabungSumbu(data?.rencana ?? [], data?.aktual ?? []),
    [data]
  );

  /*
    Grafik menggambar 40 titik TERAKHIR, bukan semuanya.

    Dua alasan yang kebetulan sejalan:

    1. PERFORMA — grafiknya memakai `FlatList` (lihat catatan di sana),
       dan `initialNumToRender` disetel ke seluruh titik supaya kolomnya
       tak muncul bertahap saat digulir. Itu berarti virtualisasinya
       praktis tak bekerja, dan yang menjaga biayanya justru batas ini.

    2. KETERBACAAN — kurva S proyek panjang bisa ratusan titik. Pada 44px
       per kolom itu belasan layar gulir, dan yang dicari orang ada di
       ujung kanan (keadaan terkini).

    Jumlah yang tak tergambar DISEBUTKAN di kaki grafik — daftar
    terpotong diam-diam adalah bentuk yang sama dengan `terpotong` yang
    sengaja dikirim rute lain di repo ini.
  */
  const MAKS_TITIK = 40;
  const sumbu = useMemo(
    () => (sumbuPenuh.length > MAKS_TITIK ? sumbuPenuh.slice(-MAKS_TITIK) : sumbuPenuh),
    [sumbuPenuh]
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={c.navy} />
      </SafeAreaView>
    );
  }

  const dev = data?.deviasi;
  const tertinggal = dev != null && dev.selisih_pct < 0;

  return (
    <SafeAreaView style={styles.safe}>
      <KepalaLayar
        judul="Kurva S"
        penjelas={data?.proyek?.nama ?? 'Rencana dibanding realisasi'}
      />

      <ScrollView
        contentContainerStyle={styles.isi}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.navy} />
        }
      >
        {galat ? <Galat judul="Kurva S tidak bisa dimuat" pesan={galat} /> : null}

        {/*
          Baseline `null` DIBEDAKAN dari baseline kosong.

          Proyek tanpa baseline tak punya kurva rencana — keadaan yang
          SAH, bukan kesalahan. Menggambar garis rencana datar di nol
          akan terbaca sebagai "rencananya nol persen".
        */}
        {!galat && data && !data.baseline ? (
          <Kosong
            ikon="git-compare-outline"
            judul="Proyek ini belum punya baseline"
            petunjuk="Kurva rencana dibangun dari baseline jadwal. Tetapkan baseline di komputer, lalu buka lagi layar ini."
          />
        ) : null}

        {dev ? (
          <Card style={styles.devKartu}>
            <Text style={styles.devLabel}>
              Per {fmtTanggalPendek(dev.tanggal)}
            </Text>
            <View style={styles.devBaris}>
              <View style={styles.devSel}>
                <Text style={styles.devNilai}>{dev.aktual_pct}%</Text>
                <Text style={styles.devKecil}>Terlaksana</Text>
              </View>
              <View style={styles.devSel}>
                <Text style={[styles.devNilai, styles.devRencana]}>{dev.rencana_pct}%</Text>
                <Text style={styles.devKecil}>Rencana</Text>
              </View>
              <View style={styles.devSel}>
                <Text
                  style={[
                    styles.devNilai,
                    { color: tertinggal ? c.danger : c.success },
                  ]}
                >
                  {dev.selisih_pct > 0 ? '+' : ''}
                  {dev.selisih_pct}%
                </Text>
                <Text style={styles.devKecil}>Selisih</Text>
              </View>
            </View>
            <View style={styles.devKaki}>
              <Ionicons
                name={tertinggal ? 'trending-down-outline' : 'trending-up-outline'}
                size={14}
                color={tertinggal ? c.danger : c.success}
                accessibilityElementsHidden
                importantForAccessibility="no"
              />
              <Text style={[styles.devArti, { color: tertinggal ? c.danger : c.success }]}>
                {tertinggal
                  ? `Tertinggal ${Math.abs(dev.selisih_pct)}% dari rencana`
                  : 'Sesuai atau lebih cepat dari rencana'}
              </Text>
            </View>
          </Card>
        ) : null}

        {sumbu.length > 0 ? (
          <Card style={styles.grafikKartu}>
            {/* Keterangan warna DULU — grafik tanpa legenda tak bisa dibaca. */}
            <View style={styles.legenda}>
              <View style={styles.legendaItem}>
                <View style={[styles.legendaKotak, styles.batangRencana]} />
                <Text style={styles.legendaTeks}>Rencana</Text>
              </View>
              <View style={styles.legendaItem}>
                <View style={[styles.legendaKotak, styles.batangAktual]} />
                <Text style={styles.legendaTeks}>Terlaksana</Text>
              </View>
            </View>

            {/*
              Grafik digulir MENDATAR, dengan tinggi tetap.

              Tiga puluh titik pada lebar 360dp berarti 12px per batang —
              terlalu rapat untuk dibaca. Digulir, tiap batang dapat 26px
              dan tanggalnya muat.

              Ini satu-satunya tempat di aplikasi yang sengaja menggulir
              mendatar, dan `potret-mobile.mjs` memeriksa "nol gulir
              mendatar" pada BODY halaman — bukan pada wadah ber-scroll
              sendiri, jadi ia tetap hijau.
            */}
            {/*
              Grafik dibuka pada ujung KANAN, bukan kiri.

              Diukur dari potret: enam kolom pertama menampilkan rencana
              0,82%–2,47% dan aktual 2%–10% — batang setinggi satu-dua
              piksel, dan layarnya terbaca sebagai grafik kosong. Tiga
              percobaan memperbaiki WARNA batang sebelum sumbernya
              ditemukan: warnanya tak pernah salah, yang salah bagian
              mana yang terlihat.

              Kurva S selalu bermula mendekati nol — itu bentuknya. Yang
              dicari orang keadaan TERKINI, dan itu di ujung kanan.

              `onContentSizeChange` dipakai alih-alih `contentOffset`
              karena lebar isi belum diketahui saat render pertama; nilai
              tetap akan salah begitu jumlah titiknya berubah.
            */}
            {/*
              `FlatList` horizontal, BUKAN `ScrollView` + `.map()`.

              `audit-daftar-mobile-virtual.mjs` menuntutnya — dan di sini
              tuntutan itu kebetulan tepat: grafiknya memang digulir
              mendatar, dan `FlatList` menangani gulir + virtualisasi
              sekaligus.

              ⚠ `initialNumToRender` disetel ke MAKS_TITIK, bukan angka
              kecil: grafik yang kolomnya muncul bertahap saat digulir
              terbaca sebagai data yang baru dimuat, bukan sebagai
              optimasi. Batas 40 titik sudah menjaga biayanya.

              `onContentSizeChange` menggulir ke ujung kanan — keadaan
              terkini, yang dicari orang.
            */}
            <FlatList
              horizontal
              data={sumbu}
              keyExtractor={kunciTitik}
              renderItem={({ item }) => <KolomGrafik t={item} s={styles} />}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.grafik}
              ref={(r) => { gulirRef.current = r; }}
              onContentSizeChange={() => gulirRef.current?.scrollToEnd({ animated: false })}
              initialNumToRender={MAKS_TITIK}
            />

            <Text style={styles.grafikKaki}>
              Skala 0–100% · {sumbu.length} titik waktu
              {sumbuPenuh.length > sumbu.length
                ? ' · ' + (sumbuPenuh.length - sumbu.length) + ' titik awal tak digambar'
                : ''}
            </Text>
          </Card>
        ) : null}

        {!galat && data?.baseline && sumbu.length === 0 ? (
          <Kosong
            ikon="analytics-outline"
            judul="Belum ada data untuk digambar"
            petunjuk="Kurva muncul setelah ada item baseline atau laporan progres harian."
          />
        ) : null}
      </ScrollView>
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
    isi: { padding: SPASI.lg, gap: SPASI.md, paddingBottom: 40 },

    devKartu: { gap: 6 },
    devLabel: { fontSize: HURUF.xs, fontFamily: FONT.isi, color: c.textSecondary },
    devBaris: { flexDirection: 'row' },
    devSel: { flex: 1, gap: 1 },
    devNilai: {
      fontSize: HURUF.xl,
      fontFamily: FONT.judul,
      color: c.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    devRencana: { color: c.textSecondary },
    devKecil: { fontSize: HURUF.xs, fontFamily: FONT.isi, color: c.textSecondary },
    devKaki: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingTop: 6,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
    },
    devArti: { fontSize: HURUF.xs, fontFamily: FONT.isiTebal, flex: 1 },

    grafikKartu: { gap: SPASI.sm },
    legenda: { flexDirection: 'row', gap: SPASI.lg },
    legendaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    /*
      Kotak legenda memakai gaya batang yang SAMA (termasuk garis tepi
      dan opacity) — legenda yang warnanya berbeda dari grafiknya adalah
      legenda yang menyesatkan.
    */
    legendaKotak: { width: 12, height: 12, borderRadius: 3 },
    legendaTeks: { fontSize: HURUF.xs, fontFamily: FONT.isi, color: c.textSecondary },

    /*
      Dipakai sebagai `contentContainerStyle` FlatList — `height` tetap
      dibuang: FlatList horizontal mengatur tingginya dari isinya, dan
      tinggi tetap pada container justru memotong label tanggal.
    */
    grafik: { alignItems: 'flex-end', gap: 6, paddingVertical: 2 },
    /*
      Lebar 44, bukan 26 — dan itu diukur dari potret, bukan ditaksir.

      Pada 26px label tanggal terpotong jadi "01 …" di SETIAP kolom:
      sumbu waktu yang tak menyebutkan waktunya. Grafik yang sumbunya tak
      terbaca bukan grafik, melainkan deretan batang.

      44px memuat "01 Feb" penuh pada 12px, dan kebetulan sama dengan
      ambang sasaran sentuh — meski di sini kolomnya tak bisa ditekan.
    */
    kolom: { width: 44, alignItems: 'center', gap: 4 },
    /*
      Wadah batang punya TINGGI TETAP dan latar tipis — tanpa itu, dua
      batang 40% dan 80% tak bisa dibandingkan sebab tak ada acuan
      "penuh" yang terlihat.
    */
    batangWadah: {
      width: '100%',
      height: 140,
      justifyContent: 'flex-end',
      backgroundColor: c.surfaceSubtle,
      borderRadius: 4,
      overflow: 'hidden',
    },
    batang: { width: '100%', borderRadius: 3, position: 'absolute', bottom: 0 },
    /*
      Rencana di BELAKANG dan pucat; aktual di depan dan sempit.

      Keduanya `position: absolute` di wadah yang sama — aktual digambar
      sesudahnya, jadi ia di atas. Lebarnya 60% supaya rencana di
      belakangnya tetap terlihat sebagai konteks, bukan tertutup.
    */
    /*
      Rencana diberi GARIS TEPI, bukan hanya warna pucat.

      Terlihat dari potret: `navyLight` di atas `surfaceSubtle` nyaris
      tak terbedakan — batang rencana praktis tak terlihat, dan grafiknya
      terbaca sebagai aktual saja. Legenda menyebut dua warna yang salah
      satunya tak ada di layar.

      Garis tepi memberi bentuk yang terlihat tanpa menaikkan bobot
      visualnya melebihi aktual — yang memang harus lebih menonjol.
    */
    /*
      Rencana memakai warna PERMUKAAN + garis tepi penuh, bukan navy
      pucat — dan ini iterasi KETIGA, dua sebelumnya diperbaiki lewat
      potret.

      Percobaan 1: `backgroundColor: c.navyLight` saja. Di atas
      `surfaceSubtle` keduanya hampir sama terang — batang rencana
      praktis hilang, dan legenda menyebut dua warna yang satu di
      antaranya tak ada di layar.

      Percobaan 2: ditambah garis tepi navy + `opacity: 0.45`. Lebih
      buruk: opacity memudarkan GARIS TEPINYA juga, jadi satu-satunya
      hal yang membuatnya terlihat justru ikut pudar.

      Yang bekerja: opacity dibuang, garis tepi dipertebal, dan isinya
      dibuat lebih terang dari latar (`surface`, bukan `navyLight`) —
      sehingga batangnya terbaca sebagai bidang berbingkai, bukan sebagai
      noda warna yang samar.

      Pelajarannya sama dengan kartu kasbon dan chip penyaring:
      **alasan yang benar bisa menghasilkan penerapan yang salah, dan
      hanya melihat hasilnya yang bisa membedakan.**
    */
    batangRencana: {
      backgroundColor: c.surface,
      borderWidth: 1.5,
      borderColor: c.navyMid,
    },
    batangAktual: { backgroundColor: c.navy, width: '58%', alignSelf: 'center' },
    kolomLabel: { fontSize: HURUF.xs, fontFamily: FONT.isi, color: c.textSecondary },
    grafikKaki: { fontSize: HURUF.xs, fontFamily: FONT.isi, color: c.textSecondary },
  });
}
