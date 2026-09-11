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
import { Tekan } from '@/components/ui/Tekan';
import { api } from '@/lib/api';
import { pesanGalat } from '@/lib/galat';
import { useTema } from '@/hooks/useTema';
import { FONT, HURUF, SENTUH_MIN, SPASI, type Palet } from '@/lib/tema';

/*
  SDM — daftar pegawai, NATIVE. Gelombang 2c.

  Menggantikan modul WebView `sdm` (yang menunjuk `/sdm/timesheet`).

  ── Yang ditampilkan: PEGAWAI, bukan timesheet

  Entri lama di "Lainnya" berjudul "Absensi & Timesheet" dan menunjuk
  `/sdm/timesheet`. Tetapi timesheet di repo ini PER-PEGAWAI
  (`/api/v1/sdm/pegawai/:id/timesheet`) — daftarnya menuntut memilih
  orang dulu, dan mobile sudah punya layar absensi sendiri
  (`/absensi/input`) untuk mandor mencatat kehadiran tukang.

  Yang belum ada di mobile: melihat SIAPA SAJA pegawainya, jabatan, dan
  kelengkapan datanya. Itu yang dibangun di sini.

  ── GAJI: server yang memutuskan, bukan klien

  `/api/v1/sdm/pegawai/kelola` mengirim `boleh_lihat_gaji` dan hanya
  menyertakan `gaji_pokok` bila izinnya ada (`pegawai.ts:52`).

  Layar ini TIDAK menyaring ulang — ia hanya menampilkan apa yang dikirim.
  Menduplikasi aturan otorisasi di klien berarti dua tempat yang bisa
  menyimpang, dan yang di klien tak menjaga apa pun: datanya sudah tak
  terkirim.

  ── `kritisKosong` ditampilkan, dan itu intinya

  Server menghitung berapa pegawai yang datanya belum lengkap di kolom
  kritis (NPWP, BPJS, status PTKP). Angka itu yang menentukan apakah
  payroll bisa dijalankan — dan satu-satunya alasan membuka layar ini
  dari HP.
*/

interface UserRingkas {
  id?: string;
  name?: string;
  email?: string;
}

interface Pegawai {
  id: string;
  user_id: string | null;
  nomor_induk: string | null;
  jabatan: string | null;
  departemen: string | null;
  tanggal_masuk: string | null;
  tanggal_keluar: string | null;
  status_ptkp: string | null;
  npwp: string | null;
  nomor_bpjs_tk: string | null;
  nomor_bpjs_kes: string | null;
  /** HANYA ada bila `boleh_lihat_gaji` — server yang memutuskan. */
  gaji_pokok?: number | string | null;
  user?: UserRingkas | null;
}

interface Ringkasan {
  total: number;
  aktif: number;
  keluar: number;
  kritisKosong: number;
}

const ambilKunci = (p: Pegawai) => p.id;

function rpRingkas(n: number | string | null | undefined) {
  const v = Number(n) || 0;
  if (v >= 1_000_000) return `Rp ${(v / 1_000_000).toFixed(1).replace('.', ',')} jt`;
  if (v >= 1_000) return `Rp ${Math.round(v / 1_000)} rb`;
  return `Rp ${Math.round(v)}`;
}

function fmtTanggal(s: string | null) {
  if (!s) return null;
  return new Date(s).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Kolom kritis yang kosong pada satu pegawai.
 *
 * Daftarnya SENGAJA disamakan dengan yang dihitung server
 * (`lib/pegawai.ts` → `kritisKosong`): NPWP, BPJS TK, BPJS Kes, dan
 * status PTKP. Memakai daftar berbeda membuat angka "3 belum lengkap"
 * di ringkasan tak cocok dengan kartu mana pun yang bertanda — dua
 * hitungan yang keduanya benar menurut aturannya sendiri.
 */
function kritisKosong(p: Pegawai): string[] {
  const kurang: string[] = [];
  if (!p.npwp) kurang.push('NPWP');
  if (!p.nomor_bpjs_tk) kurang.push('BPJS TK');
  if (!p.nomor_bpjs_kes) kurang.push('BPJS Kes');
  if (!p.status_ptkp) kurang.push('PTKP');
  return kurang;
}

const KartuPegawai = React.memo(function KartuPegawai({
  p,
  bolehGaji,
  s,
  c,
}: {
  p: Pegawai;
  bolehGaji: boolean;
  s: ReturnType<typeof gaya>;
  c: Palet;
}) {
  const kurang = kritisKosong(p);
  const masuk = fmtTanggal(p.tanggal_masuk);
  const keluar = fmtTanggal(p.tanggal_keluar);

  return (
    <Card style={s.card}>
      <View style={s.barisAtas}>
        <Text style={s.judulKartu} numberOfLines={2}>
          {p.user?.name ?? p.nomor_induk ?? 'Tanpa nama'}
        </Text>
        {/*
          Gaji hanya dirender bila medannya ADA.

          `gaji_pokok === undefined` berarti server tak mengirimnya
          (tak berizin); `0` berarti dikirim dan memang nol. `?? 0` akan
          menyamakan keduanya — dan "Rp 0" pada pegawai yang gajinya
          sengaja disembunyikan adalah kebohongan yang tenang.
        */}
        {bolehGaji && p.gaji_pokok != null ? (
          <Text style={s.gaji}>{rpRingkas(p.gaji_pokok)}</Text>
        ) : null}
      </View>

      {p.jabatan || p.departemen ? (
        <Text style={s.jabatan} numberOfLines={1}>
          {[p.jabatan, p.departemen].filter(Boolean).join(' · ')}
        </Text>
      ) : null}

      <View style={s.metaBaris}>
        {p.nomor_induk ? (
          <View style={s.metaItem}>
            <Ionicons
              name="id-card-outline"
              size={13}
              color={c.textSecondary}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <Text style={s.meta}>{p.nomor_induk}</Text>
          </View>
        ) : null}

        {masuk ? (
          <View style={s.metaItem}>
            <Ionicons
              name="calendar-outline"
              size={13}
              color={c.textSecondary}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <Text style={s.meta}>
              {keluar ? `${masuk} – ${keluar}` : `Sejak ${masuk}`}
            </Text>
          </View>
        ) : null}
      </View>

      {/*
        Kolom kurang DISEBUTKAN namanya, bukan cuma "data belum lengkap".

        Yang membuka layar ini dari HP biasanya sedang mengejar
        kelengkapan sebelum payroll. "Belum lengkap" menuntut membuka
        komputer untuk tahu apa yang kurang; menyebutnya membuat
        panggilan telepon ke orangnya cukup.
      */}
      {kurang.length > 0 ? (
        <View style={s.kurangBaris}>
          <Ionicons
            name="alert-circle-outline"
            size={13}
            color={c.warning}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          <Text style={s.kurangTeks} numberOfLines={2}>
            Belum ada: {kurang.join(', ')}
          </Text>
        </View>
      ) : null}
    </Card>
  );
});

type Saring = 'semua' | 'aktif' | 'kurang';

export default function SdmScreen() {
  const { c } = useTema();
  const styles = useMemo(() => gaya(c), [c]);

  const [pegawai, setPegawai] = useState<Pegawai[]>([]);
  const [ringkasan, setRingkasan] = useState<Ringkasan | null>(null);
  const [bolehGaji, setBolehGaji] = useState(false);
  const [saring, setSaring] = useState<Saring>('semua');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [galat, setGalat] = useState('');

  /* `res.data?.pegawai` — `pegawai.ts:73` mengirim `{ pegawai, ringkasan, … }`. */
  const muat = useCallback(async () => {
    try {
      const res = await api.get('/api/v1/sdm/pegawai/kelola');
      setPegawai(res.data?.pegawai ?? []);
      setRingkasan(res.data?.ringkasan ?? null);
      setBolehGaji(Boolean(res.data?.boleh_lihat_gaji));
      setGalat('');
    } catch (err: unknown) {
      setGalat(pesanGalat(err, 'daftar pegawai'));
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

  const hariIni = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const terlihat = useMemo(() => {
    if (saring === 'aktif') {
      return pegawai.filter((p) => !p.tanggal_keluar || p.tanggal_keluar > hariIni);
    }
    if (saring === 'kurang') return pegawai.filter((p) => kritisKosong(p).length > 0);
    return pegawai;
  }, [pegawai, saring, hariIni]);

  const nKurang = useMemo(
    () => pegawai.filter((p) => kritisKosong(p).length > 0).length,
    [pegawai]
  );

  const render = useCallback(
    ({ item }: { item: Pegawai }) => (
      <KartuPegawai p={item} bolehGaji={bolehGaji} s={styles} c={c} />
    ),
    [styles, c, bolehGaji]
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={c.navy} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KepalaLayar
        judul="Pegawai"
        penjelas={
          ringkasan
            ? `${ringkasan.aktif} aktif · ${ringkasan.keluar} keluar`
            : 'Daftar pegawai dan kelengkapan datanya'
        }
      />

      <FlatList
        data={terlihat}
        keyExtractor={ambilKunci}
        renderItem={render}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.navy} />
        }
        ListHeaderComponent={
          <>
            {galat ? <Galat judul="Daftar pegawai tidak bisa dimuat" pesan={galat} /> : null}

            {/*
              Peringatan kelengkapan di ATAS, bukan sebagai chip biasa.

              `kritisKosong` menentukan apakah payroll bisa dijalankan —
              itu satu-satunya angka di layar ini yang menuntut tindakan.
              Menyamakannya dengan "total" dan "aktif" membuatnya hilang
              di antara angka yang cuma konteks.
            */}
            {ringkasan && ringkasan.kritisKosong > 0 ? (
              <View style={styles.awasKotak}>
                <Ionicons
                  name="warning-outline"
                  size={16}
                  color={c.warning}
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                />
                <Text style={styles.awasTeks}>
                  {ringkasan.kritisKosong} pegawai datanya belum lengkap — payroll
                  bisa tertahan
                </Text>
              </View>
            ) : null}

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipBaris}
            >
              <Chip
                label="Semua"
                n={pegawai.length}
                aktif={saring === 'semua'}
                onPress={() => setSaring('semua')}
                s={styles}
              />
              <Chip
                label="Aktif"
                n={ringkasan?.aktif ?? 0}
                aktif={saring === 'aktif'}
                onPress={() => setSaring('aktif')}
                s={styles}
              />
              {nKurang > 0 ? (
                <Chip
                  label="Belum lengkap"
                  n={nKurang}
                  aktif={saring === 'kurang'}
                  onPress={() => setSaring('kurang')}
                  s={styles}
                />
              ) : null}
            </ScrollView>
          </>
        }
        ListEmptyComponent={
          galat ? null : saring !== 'semua' ? (
            <Kosong
              ikon="funnel-outline"
              judul="Tidak ada di saringan ini"
              petunjuk="Ketuk “Semua” di atas untuk melihat seluruh pegawai."
            />
          ) : (
            <Kosong
              ikon="people-outline"
              judul="Belum ada pegawai terdaftar"
              petunjuk="Pegawai yang didaftarkan akan muncul di sini. Tarik ke bawah untuk memeriksa lagi."
            />
          )
        }
        initialNumToRender={10}
        windowSize={7}
      />
    </SafeAreaView>
  );
}

function Chip({
  label,
  n,
  aktif,
  onPress,
  s,
}: {
  label: string;
  n: number;
  aktif: boolean;
  onPress: () => void;
  s: ReturnType<typeof gaya>;
}) {
  return (
    <Tekan
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: aktif }}
      accessibilityLabel={`${label}, ${n} pegawai${aktif ? ', terpilih' : ''}`}
      style={[s.chip, aktif && s.chipAktif]}
    >
      <Text style={[s.chipTeks, aktif && s.chipTeksAktif]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[s.chipAngka, aktif && s.chipTeksAktif]}>{n}</Text>
    </Tekan>
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
    list: { padding: SPASI.lg, gap: SPASI.md, paddingBottom: 40 },
    card: { gap: 4 },

    awasKotak: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: c.warningBg,
      borderWidth: 1,
      borderColor: c.warningBorder,
      borderRadius: 10,
      padding: SPASI.sm,
      marginBottom: SPASI.sm,
    },
    awasTeks: { fontSize: HURUF.xs, fontFamily: FONT.isiTebal, color: c.warning, flex: 1 },

    chipBaris: { gap: SPASI.sm, paddingBottom: SPASI.md, paddingRight: SPASI.lg },
    chip: {
      minHeight: SENTUH_MIN,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      maxWidth: 240,
      paddingHorizontal: 14,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    chipAktif: { backgroundColor: c.navyLight, borderColor: c.navy },
    chipTeks: {
      fontSize: HURUF.xs,
      fontFamily: FONT.isi,
      color: c.textSecondary,
      flexShrink: 1,
    },
    chipAngka: {
      fontSize: HURUF.xs,
      fontFamily: FONT.isiTebal,
      color: c.textSecondary,
      flexShrink: 0,
      fontVariant: ['tabular-nums'],
    },
    chipTeksAktif: { color: c.navy, fontFamily: FONT.isiTebal },

    barisAtas: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: SPASI.sm,
    },
    judulKartu: {
      flex: 1,
      fontSize: HURUF.base,
      fontFamily: FONT.isiTebal,
      color: c.textPrimary,
      lineHeight: HURUF.base * 1.35,
    },
    gaji: {
      fontSize: HURUF.sm,
      fontFamily: FONT.isiTebal,
      color: c.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    jabatan: { fontSize: HURUF.sm, fontFamily: FONT.isi, color: c.textSecondary },

    metaBaris: { gap: 4, marginTop: 2 },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    meta: { fontSize: HURUF.xs, fontFamily: FONT.isi, color: c.textSecondary, flex: 1 },

    kurangBaris: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      marginTop: 4,
      paddingTop: 6,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
    },
    kurangTeks: { fontSize: HURUF.xs, fontFamily: FONT.isi, color: c.warning, flex: 1 },
  });
}
