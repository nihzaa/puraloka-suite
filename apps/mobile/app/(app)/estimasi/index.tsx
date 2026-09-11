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
import { Badge, statusLabel, statusVariant } from '@/components/ui/Badge';
import { KepalaLayar } from '@/components/ui/KepalaLayar';
import { Card } from '@/components/ui/Card';
import { Galat } from '@/components/ui/Galat';
import { Kosong } from '@/components/ui/Kosong';
import { api } from '@/lib/api';
import { pesanGalat } from '@/lib/galat';
import { useTema } from '@/hooks/useTema';
import { FONT, HURUF, SPASI, type Palet } from '@/lib/tema';

/*
  ESTIMASI — versi RAB, NATIVE. Gelombang 2c.

  Menggantikan modul WebView `estimasi` (7 halaman web).

  ── Yang ditampilkan: DAFTAR VERSI, bukan penyusunnya

  Modul estimasi di web adalah alat KERJA — menyusun RAB baris demi baris,
  memilih analisa AHSP dari katalog 3.040 item, mengatur harga satuan.
  Tak satu pun dilakukan di HP; komposernya sendiri punya pemilih dropdown
  ribuan baris yang butuh papan ketik.

  Yang masuk akal dibawa: *"RAB proyek ini sudah disetujui belum, dan
  nilainya berapa"*. Itu pertanyaan yang muncul di rapat, di jalan, di
  lokasi — bukan di depan komposer.

  ⚠ Layar ini TIDAK menggantikan halaman web estimasi, dan tak berniat.

  ── Bentuk balasan SUDAH DIRATAKAN server

  `estimate-versions.ts:317` mengirim `project_name`/`scenario_name`
  sebagai medan datar, bukan relasi bersarang — sebab PostgREST
  memulangkan embed kadang sebagai OBJEK, kadang ARRAY berisi satu, dan
  berkas itu menulis peringatannya sendiri: kalau dilewatkan, akibatnya
  BUKAN galat melainkan daftar yang nama proyeknya kosong seluruhnya.

  Klien karena itu tak perlu menebak kardinalitas apa pun.
*/

interface Versi {
  id: string;
  version_number: number | null;
  status: string | null;
  total_amount: number | null;
  created_at: string | null;
  scenario_id: string | null;
  scenario_name: string | null;
  project_id: string | null;
  project_name: string | null;
  edition_code: string | null;
}

interface Meta {
  jumlah: number;
  batas: number;
  terpotong: boolean;
}

const ambilKunci = (v: Versi) => v.id;

function rpPenuh(n: number | null) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(n || 0);
}

function fmtTanggal(s: string | null) {
  if (!s) return null;
  return new Date(s).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

const KartuVersi = React.memo(function KartuVersi({
  v,
  s,
  c,
}: {
  v: Versi;
  s: ReturnType<typeof gaya>;
  c: Palet;
}) {
  const tgl = fmtTanggal(v.created_at);

  return (
    <Card style={s.card}>
      <View style={s.barisAtas}>
        <Text style={s.judulKartu} numberOfLines={2}>
          {v.project_name ?? v.scenario_name ?? 'Tanpa proyek'}
        </Text>
        {v.status ? (
          <Badge label={statusLabel(v.status)} variant={statusVariant(v.status)} />
        ) : null}
      </View>

      {/*
        `total_amount` bisa `null` — dan itu DIBEDAKAN dari nol.

        Versi yang baru dibuat belum punya total sampai itemnya diisi.
        `?? 0` akan menampilkan "Rp 0", yang terbaca sebagai RAB kosong
        senilai nol alih-alih RAB yang belum dihitung — dan pada layar
        yang dipakai memutuskan, dua hal itu jauh berbeda.
      */}
      {v.total_amount == null ? (
        <Text style={s.belumAda}>Nilai belum dihitung</Text>
      ) : (
        <Text style={s.nominal}>{rpPenuh(v.total_amount)}</Text>
      )}

      <View style={s.metaBaris}>
        <View style={s.metaItem}>
          <Ionicons
            name="layers-outline"
            size={13}
            color={c.textSecondary}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          <Text style={s.meta} numberOfLines={1}>
            Versi {v.version_number ?? '—'}
            {v.scenario_name ? ` · ${v.scenario_name}` : ''}
          </Text>
        </View>

        {/*
          Kode EDISI ditampilkan — ia menentukan harga satuan mana yang
          dipakai (SNI 2013, Permen PUPR, dst). Dua RAB dengan nilai mirip
          tapi edisi berbeda tak bisa dibandingkan langsung, dan tanpa
          keterangan ini orang menyangka bisa.
        */}
        {v.edition_code ? (
          <View style={s.metaItem}>
            <Ionicons
              name="pricetags-outline"
              size={13}
              color={c.textSecondary}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <Text style={s.meta}>Edisi {v.edition_code}</Text>
          </View>
        ) : null}

        {tgl ? (
          <View style={s.metaItem}>
            <Ionicons
              name="calendar-outline"
              size={13}
              color={c.textSecondary}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <Text style={s.meta}>{tgl}</Text>
          </View>
        ) : null}
      </View>
    </Card>
  );
});

export default function EstimasiScreen() {
  const { c } = useTema();
  const styles = useMemo(() => gaya(c), [c]);

  const [versi, setVersi] = useState<Versi[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [galat, setGalat] = useState('');

  /* `res.data?.data` — `estimate-versions.ts:317` mengirim `{ data, meta }`. */
  const muat = useCallback(async () => {
    try {
      const res = await api.get('/api/v1/estimate-versions');
      setVersi(res.data?.data ?? []);
      setMeta(res.data?.meta ?? null);
      setGalat('');
    } catch (err: unknown) {
      setGalat(pesanGalat(err, 'versi estimasi'));
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

  const render = useCallback(
    ({ item }: { item: Versi }) => <KartuVersi v={item} s={styles} c={c} />,
    [styles, c]
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
        judul="Estimasi"
        penjelas={
          versi.length > 0 ? `${versi.length} versi RAB` : 'Versi RAB dan nilainya'
        }
      />

      <FlatList
        data={versi}
        keyExtractor={ambilKunci}
        renderItem={render}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.navy} />
        }
        ListHeaderComponent={
          <>
            {galat ? <Galat judul="Versi estimasi tidak bisa dimuat" pesan={galat} /> : null}

            {/*
              `terpotong` dari server ditampilkan.

              Daftar yang berhenti di batas TANPA memberi tahu membuat
              orang menyimpulkan itulah semuanya. Server sudah menghitung
              benderanya; membuangnya di klien membatalkan maksudnya.
            */}
            {meta?.terpotong ? (
              <View style={styles.potongKotak}>
                <Ionicons
                  name="alert-circle-outline"
                  size={15}
                  color={c.warning}
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                />
                <Text style={styles.potongTeks}>
                  Hanya {meta.batas} versi terbaru ditampilkan — masih ada yang lain.
                  Buka Estimasi di komputer untuk daftar lengkap.
                </Text>
              </View>
            ) : null}
          </>
        }
        ListEmptyComponent={
          galat ? null : (
            <Kosong
              ikon="document-text-outline"
              judul="Belum ada versi RAB"
              petunjuk="RAB yang disusun di komputer akan muncul di sini. Tarik ke bawah untuk memeriksa lagi."
            />
          )
        }
        initialNumToRender={10}
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
    list: { padding: SPASI.lg, gap: SPASI.md, paddingBottom: 40 },
    card: { gap: 4 },

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
    nominal: {
      fontSize: HURUF.lg,
      fontFamily: FONT.judul,
      color: c.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    /* Nilai belum dihitung bukan angka — jangan diberi gaya angka. */
    belumAda: { fontSize: HURUF.sm, fontFamily: FONT.isi, color: c.textSecondary },

    metaBaris: { gap: 4, marginTop: 2 },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    meta: { fontSize: HURUF.xs, fontFamily: FONT.isi, color: c.textSecondary, flex: 1 },
  });
}
