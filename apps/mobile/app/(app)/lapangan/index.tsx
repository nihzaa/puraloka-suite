import { useRouter } from 'expo-router';
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
import { Badge } from '@/components/ui/Badge';
import { KepalaLayar } from '@/components/ui/KepalaLayar';
import { Card } from '@/components/ui/Card';
import { Galat } from '@/components/ui/Galat';
import { Kosong } from '@/components/ui/Kosong';
import { Tekan } from '@/components/ui/Tekan';
import { api } from '@/lib/api';
import { pesanGalat } from '@/lib/galat';
import { useTema } from '@/hooks/useTema';
import { FONT, HURUF, SPASI, type Palet } from '@/lib/tema';

/*
  LAPANGAN — keadaan proyek berjalan, NATIVE.

  Menggantikan modul WebView `lapangan` (keputusan founder 2026-09-11).

  ── Yang ditampilkan, dan urutannya

  Urutan blok di layar ini mengikuti urutan pertanyaan orang di lokasi:

    1. berapa banyak yang terlambat / butuh perhatian    (KPI)
    2. milestone mana yang lewat tenggat                 (daftar)
    3. proyek mana yang paling tertinggal                (daftar)

  Bukan urutan yang dikirim API. `proyek` datang sebelum `milestone` di
  balasan, tetapi yang dicari orang lebih dulu adalah tenggat yang
  terlewat — proyek 40% yang tenggatnya masih jauh bukan kabar buruk.

  ── Proyek diurutkan oleh SERVER, dan itu dibiarkan

  `lapangan.ts:340` mengurutkan menaik berdasarkan `progress_pct` — yang
  paling tertinggal di atas. Mengurutkan ulang di klien akan membuat dua
  aturan urutan yang bisa menyimpang diam-diam, dan yang di layar belum
  tentu yang dimaksud server.
*/

interface Kpi {
  progres_rata: number;
  proyek_aktif: number;
  milestone_selesai: number;
  milestone_total: number;
  punch_terbuka: number;
  ncr_aktif: number;
  inspeksi_menunggu: number;
  tukang_hadir_hari_ini: number;
  tukang_aktif: number;
}

interface Milestone {
  id: string;
  judul: string;
  tanggal: string | null;
  status: string;
  proyek: string | null;
  terlambat: boolean;
}

interface Proyek {
  id: string;
  nama: string;
  progres: number;
  tenggat: string | null;
  lokasi: string | null;
  lewat_tenggat: boolean;
}

type Item =
  | { tipe: 'judul'; teks: string; jumlah?: number }
  | { tipe: 'milestone'; data: Milestone }
  | { tipe: 'proyek'; data: Proyek };

const ambilKunci = (i: Item, idx: number) =>
  i.tipe === 'judul' ? `judul:${i.teks}` : `${i.tipe}:${i.data.id}:${idx}`;

function fmtTanggal(s: string | null) {
  if (!s) return null;
  return new Date(s).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

const KartuMilestone = React.memo(function KartuMilestone({
  m,
  s,
  c,
}: {
  m: Milestone;
  s: ReturnType<typeof gaya>;
  c: Palet;
}) {
  const tgl = fmtTanggal(m.tanggal);
  return (
    <Card style={s.card}>
      <View style={s.barisAtas}>
        <Text style={s.judulKartu} numberOfLines={2}>
          {m.judul}
        </Text>
        {/*
          `terlambat` dihitung SERVER (`lapangan.ts:337`), bukan dengan
          membandingkan tanggal di sini. Dua tempat yang membandingkan
          "hari ini" bisa berbeda zona waktu, dan selisih satu hari pada
          tenggat adalah selisih antara "aman" dan "terlambat".
        */}
        {m.terlambat ? <Badge label="Terlambat" variant="danger" /> : null}
      </View>
      <View style={s.metaBaris}>
        {m.proyek ? (
          <View style={s.metaItem}>
            <Ionicons
              name="business-outline"
              size={13}
              color={c.textSecondary}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <Text style={s.meta} numberOfLines={2}>
              {m.proyek}
            </Text>
          </View>
        ) : null}
        {tgl ? (
          <View style={s.metaItem}>
            <Ionicons
              name="flag-outline"
              size={13}
              color={m.terlambat ? c.danger : c.textSecondary}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <Text style={[s.meta, m.terlambat && s.metaBahaya]}>{tgl}</Text>
          </View>
        ) : null}
      </View>
    </Card>
  );
});

const KartuProyek = React.memo(function KartuProyek({
  p,
  s,
  c,
  onBuka,
}: {
  p: Proyek;
  s: ReturnType<typeof gaya>;
  c: Palet;
  onBuka: (id: string) => void;
}) {
  const tgl = fmtTanggal(p.tenggat);
  /*
    Lebar bar dijepit 0-100.

    `progress_pct` datang dari basis dan bisa >100 (over-progress tercatat
    di beberapa proyek). Tanpa jepitan, bar meluber keluar kartu — dan itu
    keluarga cacat yang sama dengan `Infinity%` yang pernah ditemukan
    memotret halaman struktur.
  */
  const lebar = Math.max(0, Math.min(100, p.progres));

  return (
    <Tekan
      onPress={() => onBuka(p.id)}
      accessibilityRole="button"
      accessibilityLabel={`${p.nama}, progres ${p.progres} persen${
        p.lewat_tenggat ? ', lewat tenggat' : ''
      }. Buka detail proyek.`}
    >
      <Card style={s.card}>
        <View style={s.barisAtas}>
          <Text style={s.judulKartu} numberOfLines={2}>
            {p.nama}
          </Text>
          <Text style={[s.persen, p.lewat_tenggat && s.metaBahaya]}>{p.progres}%</Text>
        </View>

        {/*
          Bar progres, bukan hanya angka.

          Angka persen menuntut pembandingan mental antar-baris; bar
          memberi bentuk yang bisa dipindai sekilas — dan daftar ini
          memang diurutkan supaya yang tertinggal di atas.

          `accessibilityElementsHidden`: nilainya sudah diumumkan di label
          kartu, jadi bar-nya dekoratif bagi pembaca layar.
        */}
        <View
          style={s.barLuar}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <View
            style={[s.barDalam, { width: `${lebar}%` }, p.lewat_tenggat && s.barBahaya]}
          />
        </View>

        <View style={s.metaBaris}>
          {p.lokasi ? (
            <View style={s.metaItem}>
              <Ionicons
                name="location-outline"
                size={13}
                color={c.textSecondary}
                accessibilityElementsHidden
                importantForAccessibility="no"
              />
              <Text style={s.meta} numberOfLines={1}>
                {p.lokasi}
              </Text>
            </View>
          ) : null}
          {tgl ? (
            <View style={s.metaItem}>
              <Ionicons
                name="calendar-outline"
                size={13}
                color={p.lewat_tenggat ? c.danger : c.textSecondary}
                accessibilityElementsHidden
                importantForAccessibility="no"
              />
              <Text style={[s.meta, p.lewat_tenggat && s.metaBahaya]}>
                {p.lewat_tenggat ? `Lewat ${tgl}` : tgl}
              </Text>
            </View>
          ) : null}
        </View>
      </Card>
    </Tekan>
  );
});

export default function LapanganScreen() {
  const router = useRouter();
  const { c } = useTema();
  const styles = useMemo(() => gaya(c), [c]);

  const [kpi, setKpi] = useState<Kpi | null>(null);
  const [milestone, setMilestone] = useState<Milestone[]>([]);
  const [proyek, setProyek] = useState<Proyek[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [galat, setGalat] = useState('');

  const muat = useCallback(async () => {
    try {
      const res = await api.get('/api/v1/lapangan/ringkasan');
      setKpi(res.data?.kpi ?? null);
      setMilestone(res.data?.milestone ?? []);
      setProyek(res.data?.proyek ?? []);
      setGalat('');
    } catch (err: unknown) {
      setGalat(pesanGalat(err, 'ringkasan lapangan'));
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

  const buka = useCallback((id: string) => router.push(`/(app)/proyek/${id}`), [router]);

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    if (milestone.length) {
      out.push({
        tipe: 'judul',
        teks: 'Milestone berikutnya',
        jumlah: milestone.filter((m) => m.terlambat).length || undefined,
      });
      for (const m of milestone) out.push({ tipe: 'milestone', data: m });
    }
    if (proyek.length) {
      out.push({ tipe: 'judul', teks: 'Proyek aktif', jumlah: proyek.length });
      for (const p of proyek) out.push({ tipe: 'proyek', data: p });
    }
    return out;
  }, [milestone, proyek]);

  const render = useCallback(
    ({ item }: { item: Item }) => {
      if (item.tipe === 'judul') {
        return (
          <View style={styles.bagian}>
            <Text style={styles.bagianJudul}>{item.teks}</Text>
            {item.jumlah != null ? (
              <Text style={styles.bagianJumlah}>{item.jumlah}</Text>
            ) : null}
          </View>
        );
      }
      if (item.tipe === 'milestone') return <KartuMilestone m={item.data} s={styles} c={c} />;
      return <KartuProyek p={item.data} s={styles} c={c} onBuka={buka} />;
    },
    [styles, c, buka]
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
      <KepalaLayar judul="Lapangan" penjelas="Progres, milestone, dan temuan proyek berjalan" />

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
            {galat ? <Galat judul="Ringkasan tidak bisa dimuat" pesan={galat} /> : null}

            {kpi ? (
              <View style={styles.kpiKotak}>
                <View style={styles.kpiBaris}>
                  <KpiSel
                    label="Progres rata-rata"
                    nilai={`${kpi.progres_rata}%`}
                    s={styles}
                  />
                  <KpiSel label="Proyek aktif" nilai={String(kpi.proyek_aktif)} s={styles} />
                  <KpiSel
                    label="Hadir hari ini"
                    nilai={`${kpi.tukang_hadir_hari_ini}/${kpi.tukang_aktif}`}
                    s={styles}
                  />
                </View>
                <View style={styles.kpiPisah} />
                <View style={styles.kpiBaris}>
                  <KpiSel
                    label="Punch terbuka"
                    nilai={String(kpi.punch_terbuka)}
                    nada={kpi.punch_terbuka > 0 ? 'awas' : undefined}
                    s={styles}
                  />
                  <KpiSel
                    label="NCR aktif"
                    nilai={String(kpi.ncr_aktif)}
                    nada={kpi.ncr_aktif > 0 ? 'bahaya' : undefined}
                    s={styles}
                  />
                  <KpiSel
                    label="Milestone"
                    nilai={`${kpi.milestone_selesai}/${kpi.milestone_total}`}
                    s={styles}
                  />
                </View>
              </View>
            ) : null}
          </>
        }
        ListEmptyComponent={
          galat ? null : (
            <Kosong
              ikon="map-outline"
              judul="Belum ada proyek berjalan"
              petunjuk="Proyek yang aktif akan muncul di sini. Tarik ke bawah untuk memeriksa lagi."
            />
          )
        }
        initialNumToRender={10}
        windowSize={7}
      />
    </SafeAreaView>
  );
}

function KpiSel({
  label,
  nilai,
  s,
  nada,
}: {
  label: string;
  nilai: string;
  s: ReturnType<typeof gaya>;
  nada?: 'bahaya' | 'awas';
}) {
  return (
    <View style={s.kpi1}>
      <Text style={[s.kpiNilai, nada === 'bahaya' && s.kpiBahaya, nada === 'awas' && s.kpiAwas]}>
        {nilai}
      </Text>
      <Text style={s.kpiLabel} numberOfLines={2}>
        {label}
      </Text>
    </View>
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
    card: { gap: 6 },

    kpiKotak: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      paddingVertical: SPASI.md,
      marginBottom: SPASI.sm,
    },
    kpiBaris: { flexDirection: 'row' },
    kpiPisah: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.border,
      marginVertical: SPASI.md,
      marginHorizontal: SPASI.md,
    },
    kpi1: { flex: 1, alignItems: 'center', paddingHorizontal: 4, gap: 2 },
    kpiNilai: {
      fontSize: HURUF.xl,
      fontFamily: FONT.judul,
      color: c.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    kpiBahaya: { color: c.danger },
    kpiAwas: { color: c.warning },
    kpiLabel: {
      fontSize: HURUF.xs,
      fontFamily: FONT.isi,
      color: c.textSecondary,
      textAlign: 'center',
    },

    bagian: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      marginTop: SPASI.sm,
      marginBottom: 2,
    },
    bagianJudul: { fontSize: HURUF.base, fontFamily: FONT.isiTebal, color: c.textPrimary },
    bagianJumlah: {
      fontSize: HURUF.xs,
      fontFamily: FONT.isi,
      color: c.textSecondary,
      fontVariant: ['tabular-nums'],
    },

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
    persen: {
      fontSize: HURUF.lg,
      fontFamily: FONT.judul,
      color: c.navy,
      fontVariant: ['tabular-nums'],
    },

    /*
      Tinggi 6px, bukan 4: di bawah itu bar tipis nyaris tak terlihat pada
      layar HP di bawah sinar matahari — keadaan pemakaian yang sebenarnya
      untuk layar ini.
    */
    barLuar: {
      height: 6,
      borderRadius: 3,
      backgroundColor: c.surfaceHover,
      overflow: 'hidden',
      marginTop: 2,
    },
    barDalam: { height: '100%', borderRadius: 3, backgroundColor: c.navy },
    barBahaya: { backgroundColor: c.danger },

    metaBaris: { flexDirection: 'row', flexWrap: 'wrap', gap: SPASI.md, marginTop: 2 },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 },
    meta: { fontSize: HURUF.xs, fontFamily: FONT.isi, color: c.textSecondary, flex: 1 },
    metaBahaya: { color: c.danger },
  });
}
